#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p native-test-results
package=$(find src-tauri/target/release/bundle/deb -name '*.deb' -print -quit)
test -n "$package"
name=$(dpkg-deb -f "$package" Package)
sudo dpkg -i "$package"
app=$(dpkg -L "$name" | awk '/^\/usr\/bin\// {print; exit}')
desktop=$(dpkg -L "$name" | awk '/^\/usr\/share\/applications\/.*\.desktop$/ {print; exit}')
test -x "$app"
test -f "$desktop"
fixture=$(mktemp --suffix=.md)
printf '# Native Persian smoke\r\n\r\n- [ ] یادگیری PostgreSQL\r\n' > "$fixture"
wrapper=$(mktemp)
printf '#!/bin/sh\nexec "%s" "%s"\n' "$app" "$fixture" > "$wrapper"
chmod +x "$wrapper"
cleanup() {
  for pid in "${driver_pid:-}" "${wm_pid:-}"; do
    if test -n "$pid"; then kill "$pid" 2>/dev/null || true; fi
  done
  rm -f "$fixture" "$wrapper"
  sudo dpkg -r "$name"
}
trap cleanup EXIT
mutter --x11 --replace > native-test-results/mutter.log 2>&1 &
wm_pid=$!
for attempt in $(seq 1 30); do
  if xprop -root _NET_SUPPORTING_WM_CHECK | grep -q 'window id #'; then break; fi
  sleep 0.2
done
xprop -root _NET_SUPPORTING_WM_CHECK | grep -q 'window id #'
scrot -o native-test-results/linux-desktop-background.png
export NATIVE_TEST_APPLICATION="$wrapper" NATIVE_TEST_FIXTURE="$fixture" NATIVE_TEST_DESKTOP="$desktop"
tauri-driver > native-test-results/tauri-driver.log 2>&1 &
driver_pid=$!
python3 - <<'PY'
import base64,configparser,json,os,subprocess,tempfile,time,urllib.request
from pathlib import Path
from PIL import Image
base='http://127.0.0.1:4444'
def request(method,url,data=None,timeout=20):
    raw=None if data is None else json.dumps(data).encode()
    with urllib.request.urlopen(urllib.request.Request(base+url,raw,{'Content-Type':'application/json'},method=method),timeout=timeout) as response:
        body=json.load(response)
    value=body.get('value')
    if isinstance(value,dict) and value.get('error'): raise RuntimeError(value)
    return value
for _ in range(60):
    try: request('GET','/status'); break
    except Exception: time.sleep(1)
else: raise RuntimeError('tauri-driver did not start')
session=request('POST','/session',{'capabilities':{'alwaysMatch':{'browserName':'wry','tauri:options':{'application':os.environ['NATIVE_TEST_APPLICATION']}}}})['sessionId']
prefix='/session/'+session
def js(script): return request('POST',prefix+'/execute/sync',{'script':script,'args':[]})
def wait(script):
    for _ in range(60):
        if js(script): return
        time.sleep(1)
    raise AssertionError('Native UI condition timed out: '+script)
def xdotool(*args):
    return subprocess.check_output(['xdotool', *args], text=True, timeout=10).strip()
def window_state(window):
    return subprocess.check_output(['xprop','-id',window,'_NET_WM_STATE'], text=True, timeout=10)
def wait_until(check, message):
    for _ in range(60):
        if check(): return
        time.sleep(0.1)
    raise AssertionError(message)
def window_alive(window):
    return subprocess.run(['xprop','-id',window], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=5).returncode == 0
def bounds(window):
    values=dict(line.split('=',1) for line in xdotool('getwindowgeometry','--shell',window).splitlines())
    return [int(values[key]) for key in ('X','Y','WIDTH','HEIGHT')]
def click_caption(window, button):
    x,y,_,_=bounds(window)
    pos=js(f"const r = document.getElementById('{button}').getBoundingClientRect(); return [r.x+r.width/2,r.y+r.height/2]")
    xdotool('mousemove',str(round(x+pos[0])),str(round(y+pos[1])),'click','1')
def screenshot_frame(label, points):
    filename='native-test-results/linux-frame-'+label+'.png'
    subprocess.run(['scrot','-o',filename], check=True, timeout=10)
    with Image.open(filename) as screenshot, Image.open('native-test-results/linux-desktop-background.png') as desktop:
        app_image, background = screenshot.convert('RGB'), desktop.convert('RGB')
        return [sum(abs(a-b) for a,b in zip(app_image.getpixel(point), background.getpixel(point))) for point in points]
closed=False
try:
    wait("return window.RVApp && RVApp.state.ready && document.querySelector('#editor').value.includes('یادگیری PostgreSQL')")
    assert js("return !!window.__TAURI_INTERNALS__"), 'Expected native Tauri WebView'
    assert js("return document.documentElement.hasAttribute('data-desktop-titlebar') && !document.querySelector('#captionButtons').hidden && document.querySelector('#titlebarTabs #documentTabs') !== null"), 'Expected the shared desktop title bar and tabs'
    window=xdotool('getactivewindow')
    assert 'README Viewer' in xdotool('getwindowname',window), 'Installed viewer is not the active Linux window'
    assert js("return document.documentElement.hasAttribute('data-window-corners') && /round 8px/.test(getComputedStyle(document.body).clipPath)"), 'The restored GTK WebView did not apply rounded corners'
    controls=js("""return [...document.querySelectorAll('#captionButtons button')].map(button => {
      const r=button.getBoundingClientRect();
      return {width:r.width,height:r.height,hit:button.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};
    })""")
    assert controls == [{'width':38,'height':32,'hit':True}]*3, str(controls)
    x,y,width,height=bounds(window)
    corners=[(left,top) for left in (x,x+width-1) for top in (y,y+height-1)]
    differences=screenshot_frame('restored',corners+[(x+12,y)])
    assert max(differences[:4]) <= 30 and differences[4] > 60, f'Expected the desktop at the rounded corners: {differences}'
    click_caption(window,'btnWindowMaximize')
    wait_until(lambda: '_NET_WM_STATE_MAXIMIZED_HORZ' in window_state(window), 'Maximize button did not maximize the Linux window')
    wait("return document.documentElement.hasAttribute('data-window-maximized') && getComputedStyle(document.body).clipPath === 'none'")
    x,y,width,height=bounds(window)
    # Sample beyond both dimensions of the restored buffer to catch partial redraws.
    points=[(x+width*column//4,y+height*row//4) for column,row in [(3,1),(1,3),(3,3)]]
    wait_until(lambda: min(screenshot_frame('maximized',points)) > 60, 'The maximized WebView leaves part of the desktop visible')
    click_caption(window,'btnWindowMaximize')
    wait_until(lambda: '_NET_WM_STATE_MAXIMIZED_HORZ' not in window_state(window), 'Restore button did not restore the Linux window')
    wait("return !document.documentElement.hasAttribute('data-window-maximized') && /round 8px/.test(getComputedStyle(document.body).clipPath)")
    click_caption(window,'btnWindowMinimize')
    wait_until(lambda: '_NET_WM_STATE_HIDDEN' in window_state(window), 'Minimize button did not minimize the Linux window')
    xdotool('windowactivate','--sync',window)
    wait_until(lambda: '_NET_WM_STATE_HIDDEN' not in window_state(window), 'Linux window did not return after minimization')
    assert js("return document.querySelector('#preview input[type=checkbox]').getAttribute('aria-label') === 'یادگیری PostgreSQL'"), 'Task name missing in native preview'
    js("document.querySelector('#structuredFind').click(); const input = document.querySelector('#findInput'); input.value = 'PostgreSQL'; input.dispatchEvent(new Event('input')); return true")
    assert js("return document.querySelector('#findCount[role=status]').textContent === '1 / 1'"), 'Markdown search did not announce its result'
    js("document.querySelector('#findClose').click(); return true")
    fonts=request('POST',prefix+'/execute/async',{'script':'const done=arguments[arguments.length-1]; RV.Native.installedFontFamilies().then(done, error => done({error:String(error)}));','args':[]})
    assert isinstance(fonts,list) and any(fonts), 'Installed font catalog unavailable: '+str(fonts)
    js("document.querySelector('#btnEdit').click(); document.querySelector('#preview input[type=checkbox]').click(); return true")
    wait("return document.querySelector('#editor').value.includes('[x]') && document.querySelector('#preview input').checked")
    js("document.querySelector('#btnSave').click(); return true")
    fixture=Path(os.environ['NATIVE_TEST_FIXTURE'])
    for _ in range(60):
        if '[x] یادگیری PostgreSQL' in fixture.read_text(): break
        time.sleep(1)
    else: raise AssertionError('Native save did not persist Persian checkbox')
    assert b'\r\n' in fixture.read_bytes(), 'CRLF preservation'
    request('POST',prefix+'/timeouts',{'script':60000})
    check_source=Path('scripts/native-diagrams-check.js').read_text()
    result=request('POST',prefix+'/execute/async',{'script':'var done=arguments[arguments.length-1]; Promise.resolve('+check_source+').then(function(value){done({result:value})},function(error){done({error:String(error)})});','args':[]},timeout=75)
    assert result.get('result',{}).get('nativeMath'), 'Installed WebView math check failed: '+str(result)
    image=request('GET',prefix+'/screenshot')
    Path('native-test-results/linux-native.png').write_bytes(base64.b64decode(image))
    desktop=os.environ['NATIVE_TEST_DESKTOP']
    config=configparser.ConfigParser(interpolation=None)
    config.read(desktop)
    mime_types=config['Desktop Entry']['MimeType'].split(';')
    assert {'text/markdown','application/json','text/plain','text/x-python','application/vnd.dart','text/x-go','text/rust','text/html','image/svg+xml'}.issubset(mime_types)
    with tempfile.TemporaryDirectory() as directory:
        document=Path(directory)/'Open with settings.conf'
        document.write_text('[Appearance]\nmode=dark\n', encoding='utf-8')
        subprocess.run(['gio','launch',desktop,str(document)], check=True, timeout=15)
        wait("return RVApp.state.name === 'Open with settings.conf' && RVApp.state.format === 'ini'")
    with tempfile.TemporaryDirectory() as directory:
        project=Path(directory)
        (project/'css').mkdir()
        (project/'assets').mkdir()
        (project/'assets'/'sample.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" width="60" height="24"><rect width="60" height="24" fill="#1b9d75"/></svg>')
        font=Path('vendor/fonts/vazirmatn.js').read_text().split('base64,', 1)[1].split("'", 1)[0]
        (project/'assets'/'sample.woff2').write_bytes(base64.b64decode(font))
        (project/'css'/'site style.css').write_text('@import "theme.css"; @font-face {font-family: sample; src: url("../assets/sample.woff2")} h1 {font-family: sample, serif}')
        (project/'css'/'theme.css').write_text('body {background: #273451; color: #fff; font-size: 22px}')
        page=project/'page.html'
        page.write_text('<!doctype html><link rel="stylesheet" href="css/site%20style.css"><h1>Offline preview</h1><img src="assets/sample.svg"><script>document.body.textContent="unexpected"</script>')
        subprocess.run(['gio','launch',desktop,str(page)], check=True, timeout=15)
        wait("return !!document.querySelector('#preview iframe[src*=rvpreview]')")
        frame=request('POST',prefix+'/element',{'using':'css selector','value':'#preview iframe'})
        request('POST',prefix+'/frame',{'id':frame})
        wait("return document.querySelector('h1')?.textContent === 'Offline preview' && getComputedStyle(document.body).backgroundColor === 'rgb(39, 52, 81)' && document.images[0]?.naturalWidth === 60 && [...document.fonts].some(face => face.status === 'loaded')")
        assert js("return !document.querySelector('script')"), 'HTML script unexpectedly survived sanitization'
        request('POST',prefix+'/frame',{'id':None})
        js("document.querySelector('#preview [data-file-view=code]').click(); return true")
        wait("return !!document.querySelector('#preview .code-surface') && !document.querySelector('#preview iframe')")
        subprocess.run(['gio','launch',desktop,str(project/'assets'/'sample.svg')], check=True, timeout=15)
        wait("return document.querySelector('#preview .visual-file-svg img')?.naturalWidth === 60")
    click_caption(window,'btnWindowClose')
    wait_until(lambda: not window_alive(window), 'Close button did not close the installed Linux window')
    closed=True
    Path('native-test-results/linux-native.json').write_text(json.dumps({'native':True,'commandLineOpen':True,'openWith':True,'persianCheckbox':True,'accessibleTask':True,'markdownFind':True,'savedToDisk':True,'crlf':True,'diagramChecks':result['result'],'offlineVisualPreviews':True,'roundedCorners':True,'captionControls':controls,'maximizeRestore':True,'minimize':True,'close':True}))
finally:
    if not closed: request('DELETE',prefix)
PY
# Cleanup verifies the actual installed native package can be removed.
cleanup
trap - EXIT
test ! -e "$app"
echo 'Linux native install, command-line open, task edit, save, offline visual previews and diagrams, screenshot and uninstall passed.'
