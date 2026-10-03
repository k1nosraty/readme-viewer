#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p native-test-results
package=$(find src-tauri/target/release/bundle/deb -name '*.deb' -print -quit)
test -n "$package"
name=$(dpkg-deb -f "$package" Package)
sudo dpkg -i "$package"
app=$(dpkg -L "$name" | awk '/^\/usr\/bin\// {print; exit}')
test -x "$app"
fixture=$(mktemp --suffix=.md)
printf '# Native Persian smoke\r\n\r\n- [ ] یادگیری PostgreSQL\r\n' > "$fixture"
wrapper=$(mktemp)
printf '#!/bin/sh\nexec "%s" "%s"\n' "$app" "$fixture" > "$wrapper"
chmod +x "$wrapper"
cleanup() { kill "${driver_pid:-}" 2>/dev/null || true; rm -f "$fixture" "$wrapper"; sudo dpkg -r "$name"; }
trap cleanup EXIT
export NATIVE_TEST_APPLICATION="$wrapper" NATIVE_TEST_FIXTURE="$fixture"
tauri-driver > native-test-results/tauri-driver.log 2>&1 &
driver_pid=$!
python3 - <<'PY'
import base64,json,os,time,urllib.request
from pathlib import Path
base='http://127.0.0.1:4444'
def request(method,url,data=None):
    raw=None if data is None else json.dumps(data).encode()
    with urllib.request.urlopen(urllib.request.Request(base+url,raw,{'Content-Type':'application/json'},method=method),timeout=20) as response:
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
    js("document.querySelector('#btnEdit').click(); document.querySelector('#preview input[type=checkbox]').click(); return true")
    wait("return document.querySelector('#editor').value.includes('[x]') && document.querySelector('#preview input').checked")
    js("document.querySelector('#btnSave').click(); return true")
    fixture=Path(os.environ['NATIVE_TEST_FIXTURE'])
    for _ in range(60):
        if '[x] یادگیری PostgreSQL' in fixture.read_text(): break
        time.sleep(1)
    else: raise AssertionError('Native save did not persist Persian checkbox')
    assert b'\r\n' in fixture.read_bytes(), 'CRLF preservation'
    image=request('GET',prefix+'/screenshot')
    Path('native-test-results/linux-native.png').write_bytes(base64.b64decode(image))
    Path('native-test-results/linux-native.json').write_text(json.dumps({'native':True,'commandLineOpen':True,'persianCheckbox':True,'savedToDisk':True,'crlf':True}))
finally: request('DELETE',prefix)
PY
# Cleanup verifies the actual installed native package can be removed.
cleanup
trap - EXIT
test ! -e "$app"
echo 'Linux native install, command-line open, task edit, save, screenshot and uninstall passed.'
