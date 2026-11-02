'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined });
  const output = path.resolve(__dirname, '../native-test-results');
  await fs.mkdir(output, { recursive: true });
  try {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href);
    await page.waitForFunction(() => window.RVApp && RVApp.state.ready);
    await page.evaluate(async () => { RVApp.loadSample(); RVApp.setMode('preview'); await RV.Diagrams.render(RVApp.el.preview); });
    for (const locale of ['en', 'fa']) for (const theme of ['light', 'dark']) {
      await page.evaluate(({ locale, theme }) => {
        RV.I18n.setLocale(locale); RVApp.applyLocale();
        document.querySelector('[data-theme-choice="' + theme + '"]').click();
      }, { locale, theme });
      for (const [width, height] of [[1440, 900], [760, 400], [390, 844], [320, 568]]) {
        await page.setViewportSize({ width, height });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const state = `${locale}-${theme}-${width}`;
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, state);
        assert.equal(await page.locator('#toolbar .mode-tools button').evaluateAll(buttons => buttons.every(button => {
          const label = button.querySelector('.seg-label'), r = button.getBoundingClientRect(), text = label.getBoundingClientRect();
          return !text.width || (text.left >= r.left && text.right <= r.right);
        })), true, 'mode labels do not overlap: ' + state);
        for (const id of ['menuFile', 'menuEdit', 'menuView', 'menuHelp']) {
          await page.locator('#' + id + ' > summary').click();
          await page.waitForFunction(id => {
            const menu = document.getElementById(id), panel = menu.querySelector('.menu-panel'), r = panel.getBoundingClientRect();
            return menu.open && panel.style.left !== '' && r.left >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight;
          }, id);
          assert.equal(await page.locator('#' + id + ' > .menu-panel').evaluate(panel => {
            const r = panel.getBoundingClientRect();
            const button = panel.querySelector('button:not(:disabled)'), b = button.getBoundingClientRect();
            return r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight &&
              button.contains(document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2));
          }), true, id + ' stays reachable: ' + state);
          await page.keyboard.press('Escape');
        }
        await page.evaluate(() => { document.getElementById('toasts').textContent = ''; });
        await page.screenshot({ path: path.join(output, 'ui-' + state + '.png') });
        const source = await page.locator('#editor').inputValue();
        const mode = await page.evaluate(() => RVApp.state.mode);
        await page.keyboard.press('F8');
        assert.equal(await page.locator('.topbar').isVisible(), false);
        assert.equal(await page.locator('.statusbar').isVisible(), false);
        assert.equal(await page.locator('#btnExitReadingFocus').isVisible(), true);
        assert.equal(await page.locator('#previewScroll').evaluate(node => node.getBoundingClientRect().height > innerHeight - 4), true);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        if (width === 1440 || width === 320) await page.screenshot({ path: path.join(output, 'focus-' + state + '.png') });
        await page.keyboard.press('Escape');
        assert.equal(await page.evaluate(() => RVApp.state.mode), mode);
        assert.equal(await page.locator('#editor').inputValue(), source);
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.keyboard.press('Control+f');
    assert.equal(await page.locator('#sidebar').isVisible(), true);
    assert.equal(await page.locator('#tocFilter').evaluate(node => node === document.activeElement), true);
    await page.keyboard.press('Escape');
    await page.locator('#menuHelp > summary').click();
    await page.locator('#menuHelp [data-command="btnHelp"]').click();
    const mode = await page.evaluate(() => RVApp.state.mode);
    await page.keyboard.press('Control+1');
    assert.equal(await page.evaluate(() => RVApp.state.mode), mode, 'modal shortcuts do not alter the background');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.getElementById('helpModal').contains(document.activeElement)), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#menuHelp > summary').evaluate(node => node === document.activeElement), true);
    await page.locator('#menuView > summary').click(); await page.locator('#btnAppearance').click();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#menuView > summary').evaluate(node => node === document.activeElement), true);
    assert.deepEqual(errors, []);
    console.log('UI smoke passed: English/Persian, light/dark, desktop/mobile/landscape menus, keyboard and modal focus.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
