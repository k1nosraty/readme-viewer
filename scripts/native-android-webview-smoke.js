'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { execFileSync } = require('node:child_process');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const errors = [];
async function main() {
  const response = await fetch('http://127.0.0.1:9222/json');
  assert.equal(response.ok, true, 'Android WebView DevTools endpoint unavailable');
  const targets = await response.json();
  const target = targets.find(item => item.type === 'page' && /tauri|localhost/.test(item.url)) || targets.find(item => item.type === 'page');
  assert.ok(target && target.webSocketDebuggerUrl, 'Android app page target missing');
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let nextId = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data));
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text || 'Android WebView JavaScript exception');
    if (message.id && pending.has(message.id)) {
      const item = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) item.reject(new Error(message.error.message));
      else item.resolve(message.result || {});
    }
  });
  function send(method, params = {}) {
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception.description || result.exceptionDetails.text);
    return result.result ? result.result.value : undefined;
  }
  async function waitFor(expression, message, timeout = 30000) {
    const until = Date.now() + timeout;
    while (Date.now() < until) {
      if (await evaluate(expression)) return;
      await sleep(250);
    }
    throw new Error('Timed out: ' + message);
  }
  async function click(selector) {
    const expression = '(() => { const e=document.querySelector(' + JSON.stringify(selector) + '); if (!e) return false; e.click(); return true; })()';
    assert.equal(await evaluate(expression), true, 'Element not found: ' + selector);
  }
  async function checkGeometry() {
    const geometry = await evaluate('(() => { const rect=id=>document.getElementById(id).getBoundingClientRect(); const panes=rect("panes"), preview=rect("panePreview"); return {panesWidth:panes.width,previewWidth:preview.width,previewHeight:preview.height}; })()');
    assert.ok(geometry.previewWidth > 100 && geometry.previewHeight > 100, JSON.stringify(geometry));
    assert.ok(Math.abs(geometry.previewWidth - geometry.panesWidth) < 2, JSON.stringify(geometry));
  }
  try {
    await send('Runtime.enable');
    await send('Page.enable');
    await waitFor('Boolean(window.RVApp && RVApp.state.ready)', 'app ready');
    assert.equal(await evaluate('Boolean(window.__TAURI_INTERNALS__)'), true);
    assert.equal(await evaluate('document.querySelectorAll(".toast[data-kind=error]").length'), 0, 'Native initialization error');
    await click('#btnEmptySample');
    await waitFor('window.RVApp.state.name === "sample.md"', 'sample document loaded');
    assert.equal(await evaluate('document.querySelector("#editor").value.includes("پشتیبانی از ورودی چینی و ژاپنی")'), true);
    await click('#btnEdit');
    const clickedCheckbox = await evaluate('(() => { const boxes=[...document.querySelectorAll("#preview input[type=checkbox]")]; const box=boxes.at(-1); if (!box) return false; box.click(); return box.checked; })()');
    assert.equal(clickedCheckbox, true, 'Persian task checkbox did not toggle');
    await waitFor('document.querySelector("#editor").value.includes("[x] پشتیبانی از ورودی چینی و ژاپنی")', 'Markdown task updated');
    assert.equal(await evaluate('RVApp.state.dirty'), true);
    execFileSync('adb', ['shell', 'input', 'keyevent', '4']);
    await waitFor('(() => { const e=document.querySelector("#confirmModal"); return Boolean(e && getComputedStyle(e).display!=="none" && getComputedStyle(e).visibility!=="hidden" && e.getBoundingClientRect().width); })()', 'Android Back confirmation');
    await click('#btnConfirmCancel');
    await waitFor('(() => { const e=document.querySelector("#confirmModal"); return !e || getComputedStyle(e).display==="none" || getComputedStyle(e).visibility==="hidden"; })()', 'confirmation cancelled');
    assert.equal(await evaluate('RVApp.state.dirty'), true, 'Cancelling Android Back lost dirty state');
    assert.equal(await evaluate('document.querySelector("#editor").value.includes("[x] پشتیبانی از ورودی چینی و ژاپنی")'), true);
    await evaluate('RVApp.setMode("preview")');
    await checkGeometry();
    const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await fs.writeFile('native-test-results/android-webview.png', Buffer.from(screenshot.data, 'base64'));
    execFileSync('adb', ['shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0']);
    execFileSync('adb', ['shell', 'settings', 'put', 'system', 'user_rotation', '1']);
    await sleep(1500);
    await checkGeometry();
    assert.equal(await evaluate('RVApp.state.dirty'), true, 'Rotation lost unsaved task change');
    assert.equal(await evaluate('document.querySelector("#editor").value.includes("[x] پشتیبانی از ورودی چینی و ژاپنی")'), true);
    assert.equal(await evaluate('document.querySelectorAll(".toast[data-kind=error]").length'), 0);
    assert.deepEqual(errors, []);
    await fs.writeFile('native-test-results/android-webview.json', JSON.stringify({
      native: true, ready: true, persianCheckbox: true, dirty: true,
      fullWidthPreview: true, rotationPreservedEdit: true, androidBackConfirmCancel: true
    }));
  } finally {
    execFileSync('adb', ['shell', 'settings', 'put', 'system', 'user_rotation', '0']);
    execFileSync('adb', ['shell', 'settings', 'put', 'system', 'accelerometer_rotation', '1']);
    socket.close();
  }
}
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
