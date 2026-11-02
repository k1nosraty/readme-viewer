'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined });
  try {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const output = path.resolve(__dirname, '../native-test-results'); fs.mkdirSync(output, { recursive: true });
    await page.route('https://api.github.com/repos/k1nosraty/readme-viewer/releases/latest', route => route.fulfill({ json: { tag_name: 'v9.0.0', body: '# Changes\n<script>throw new Error("unsafe notes")</script>\n' + 'A long release note. '.repeat(80), assets: [] } }));
    await page.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href);
    await page.waitForFunction(() => window.RVApp && RVApp.state.ready);
    for (const locale of ['en', 'fa']) for (const theme of ['light', 'dark']) for (const width of [1440, 320]) {
      await page.setViewportSize({ width, height: width === 320 ? 568 : 900 });
      await page.evaluate(({ locale, theme }) => { RV.I18n.setLocale(locale); RVApp.applyLocale(); document.querySelector('[data-theme-choice="' + theme + '"]').click(); }, { locale, theme });
      for (const panel of ['about', 'updates']) {
        if (panel === 'updates') await page.evaluate(() => RV.Updates.check(true));
        else await page.evaluate(() => RV.Updates.show('about'));
        const box = page.locator('#serviceModal .modal-box');
        assert.equal(await box.evaluate(node => { const r = node.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight && node.scrollWidth <= node.clientWidth + 1; }), true);
        assert.equal(await box.evaluate(node => node.querySelector('.modal-head').getBoundingClientRect().top >= node.getBoundingClientRect().top), true, 'dialog opens at its title');
        if (panel === 'about') assert.equal(await page.locator('#developerLink').getAttribute('href'), 'https://github.com/k1nosraty');
        else {
          assert.equal(await page.locator('#updateNotes script').count(), 0);
          assert.equal(await page.locator('#btnUpdateInstall').isVisible(), true);
          // A notification never sits above the dialog or blocks its actions.
          await page.locator('#btnUpdateCheck').click();
          await page.waitForFunction(() => !document.getElementById('btnUpdateCheck').disabled);
        }
        await page.screenshot({ path: path.join(output, panel + '-' + locale + '-' + theme + '-' + width + '.png') });
        await page.locator('#btnServiceDone').focus(); await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'btnServiceClose');
        await page.keyboard.press('Escape'); assert.equal(await page.locator('#serviceModal').isVisible(), false);
      }
    }
    assert.deepEqual(errors, []);
    console.log('About/update smoke passed: desktop/mobile, English/Persian, light/dark, release notes, actions and keyboard focus.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
