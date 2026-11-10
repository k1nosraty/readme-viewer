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
cleanup() { kill "${driver_pid:-}" 2>/dev/null || true; rm -f "$fixture" "$wrapper"; sudo dpkg -r "$name"; }
trap cleanup EXIT
export NATIVE_TEST_APPLICATION="$wrapper" NATIVE_TEST_FIXTURE="$fixture" NATIVE_TEST_DESKTOP="$desktop"
tauri-driver > native-test-results/tauri-driver.log 2>&1 &
driver_pid=$!
python3 - <<'PY'
import base64,configparser,json,os,subprocess,tempfile,time,urllib.request
from pathlib import Path
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
try:
    wait("return window.RVApp && RVApp.state.ready && document.querySelector('#editor').value.includes('یادگیری PostgreSQL')")
    assert js("return !!window.__TAURI_INTERNALS__"), 'Expected native Tauri WebView'
    assert js("return document.documentElement.hasAttribute('data-desktop-titlebar') && !document.querySelector('#captionButtons').hidden && document.querySelector('#titlebarTabs #documentTabs') !== null"), 'Expected the shared desktop title bar and tabs'
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
    assert {'text/markdown','application/json','text/plain','text/x-python','application/vnd.dart','text/x-go','text/rust'}.issubset(mime_types)
    with tempfile.TemporaryDirectory() as directory:
        document=Path(directory)/'Open with settings.conf'
        document.write_text('[Appearance]\nmode=dark\n', encoding='utf-8')
        subprocess.run(['gio','launch',desktop,str(document)], check=True, timeout=15)
        wait("return RVApp.state.name === 'Open with settings.conf' && RVApp.state.format === 'ini'")
    Path('native-test-results/linux-native.json').write_text(json.dumps({'native':True,'commandLineOpen':True,'openWith':True,'persianCheckbox':True,'savedToDisk':True,'crlf':True,'diagramChecks':result['result']}))
finally: request('DELETE',prefix)
PY
# Cleanup verifies the actual installed native package can be removed.
cleanup
trap - EXIT
test ! -e "$app"
echo 'Linux native install, command-line open, task edit, save, offline diagrams/math/fonts, screenshot and uninstall passed.'
