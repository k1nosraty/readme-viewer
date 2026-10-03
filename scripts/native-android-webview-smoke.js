'use strict';
// Tests the installed debug APK's actual Android WebView through its DevTools
// socket. No web server, browser replacement, or privileged test IPC is used.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');

(async () => {
  let browser;
  for (let attempt=0; attempt<30; attempt++) {
    try { browser=await chromium.connectOverCDP('http://127.0.0.1:9222'); break; }
    catch (error) { if (attempt===29) throw error; await new Promise(resolve=>setTimeout(resolve,1000)); }
  }
  try {
    const context = browser.contexts()[0];
    assert.ok(context, 'Android WebView context missing');
    const page = context.pages().find(p => /tauri|localhost/.test(p.url())) || context.pages()[0];
    assert.ok(page, 'Android app page missing');
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.waitForFunction(() => window.RVApp && RVApp.state.ready);
    assert.equal(await page.evaluate(() => !!window.__TAURI_INTERNALS__), true);
    assert.equal(await page.locator('.toast[data-kind="error"]').count(), 0, 'Native initialization error');
    await page.locator('#btnEmptySample').click();
    await page.waitForFunction(() => RVApp.state.name === 'sample.md');
    const persian = page.locator('#preview input[type=checkbox]').last();
    assert.match(await page.locator('#editor').inputValue(), /پشتیبانی از ورودی چینی و ژاپنی/);
    await page.locator('#btnEdit').click();
    await persian.click();
    await page.waitForFunction(() => document.querySelector('#editor').value.includes('[x] پشتیبانی از ورودی چینی و ژاپنی'));
    assert.equal(await persian.isChecked(), true);
    assert.equal(await page.evaluate(() => RVApp.state.dirty), true);
    await page.evaluate(() => RVApp.setMode('preview'));
    async function checkGeometry() {
      const geometry = await page.evaluate(() => {
        const rect = id => document.getElementById(id).getBoundingClientRect();
        const panes=rect('panes'), preview=rect('panePreview');
        return { panesWidth:panes.width, previewWidth:preview.width, previewHeight:preview.height };
      });
      assert.ok(geometry.previewWidth > 100 && geometry.previewHeight > 100, JSON.stringify(geometry));
      assert.ok(Math.abs(geometry.previewWidth - geometry.panesWidth) < 2, JSON.stringify(geometry));
    }
    await checkGeometry();
    await page.screenshot({ path:'native-test-results/android-webview.png' });
    execFileSync('adb',['shell','settings','put','system','accelerometer_rotation','0']);
    execFileSync('adb',['shell','settings','put','system','user_rotation','1']);
    await page.waitForTimeout(1500);
    await checkGeometry();
    assert.equal(await page.evaluate(() => RVApp.state.dirty), true, 'Rotation lost unsaved task change');
    assert.match(await page.locator('#editor').inputValue(), /\[x\] پشتیبانی از ورودی چینی و ژاپنی/);
    assert.equal(await page.locator('.toast[data-kind="error"]').count(), 0);
    assert.deepEqual(errors, []);
    await fs.writeFile('native-test-results/android-webview.json', JSON.stringify({native:true,ready:true,persianCheckbox:true,dirty:true,fullWidthPreview:true,rotationPreservedEdit:true}));
  } finally {
    execFileSync('adb',['shell','settings','put','system','user_rotation','0']);
    execFileSync('adb',['shell','settings','put','system','accelerometer_rotation','1']);
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode=1; });
