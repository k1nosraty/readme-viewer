'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

async function dragTab(page, source, target, vertical) {
  const tabs = page.getByRole('tab');
  const from = await tabs.and(page.getByTitle(source, { exact: true })).boundingBox();
  const to = await tabs.and(page.getByTitle(target, { exact: true })).boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width * (vertical ? 0.5 : 0.85), to.y + to.height * (vertical ? 0.2 : 0.5), { steps: 8 });
  await page.locator('[data-tab-drop]').waitFor({ timeout: 5000 });
  await page.mouse.up();
}

async function assertToolbarFits(page, state) {
  assert.equal(await page.locator('#toolbar').evaluate(toolbar => {
    const row = toolbar.getBoundingClientRect();
    return getComputedStyle(toolbar).flexWrap === 'nowrap' && Array.from(toolbar.children)
      .filter(item => !item.hidden && item.id !== 'toolbarOverflow')
      .map(item => item.getBoundingClientRect()).every(item =>
        item.left >= row.left - 1 && item.right <= row.right + 1 &&
        Math.abs(item.top + item.height / 2 - row.top - row.height / 2) <= 1);
  }), true, 'toolbar fits one row: ' + state);
}

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
        await assertToolbarFits(page, state);
        assert.equal(await page.locator('#toolbar .mode-tools button').evaluateAll(buttons => buttons.every(button => {
          const label = button.querySelector('.seg-label'), r = button.getBoundingClientRect(), text = label.getBoundingClientRect();
          return !text.width || (text.left >= r.left && text.right <= r.right);
        })), true, 'mode labels do not overlap: ' + state);
        for (const id of ['menuFile', 'menuEdit', 'menuView', 'menuHelp']) {
          await page.locator('#brandMark').click();
          await page.locator('#' + id + ' > summary').click();
          assert.equal(await page.locator('#' + id + ' > .menu-commands').evaluate(commands => {
            const r = commands.closest('.app-menubar').getBoundingClientRect();
            const button = commands.querySelector('button:not(:disabled)'), b = button.getBoundingClientRect();
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
    await page.locator('#brandMark').click();
    await page.locator('#menuHelp > summary').click();
    await page.locator('#menuHelp [data-command="btnHelp"]').click();
    const mode = await page.evaluate(() => RVApp.state.mode);
    await page.keyboard.press('Control+1');
    assert.equal(await page.evaluate(() => RVApp.state.mode), mode, 'modal shortcuts do not alter the background');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.getElementById('helpModal').contains(document.activeElement)), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#brandMark').evaluate(node => node === document.activeElement), true);
    await page.locator('#brandMark').click();
    await page.locator('#menuView > summary').click(); await page.locator('#btnAppearance').click();
    assert.equal(await page.locator('#appearancePanel').evaluate(panel => {
      const r = panel.getBoundingClientRect();
      return r.left > 0 && r.top > 0 && r.right < innerWidth && r.bottom < innerHeight &&
        parseFloat(getComputedStyle(panel).borderTopLeftRadius) >= 18;
    }), true, 'Appearance is a rounded island on narrow screens');
    await page.evaluate(() => { window.queryLocalFonts = async () => [{ family: 'Segoe UI' }, { family: 'Segoe UI Emoji' }]; });
    await page.locator('#fontLatinChoice').selectOption('__custom__');
    const font = page.locator('#fontLatin');
    await font.pressSequentially('Seg');
    const option = page.locator('#fontSuggestions').getByRole('option', { name: 'Segoe UI', exact: true });
    await option.waitFor();
    assert.equal(await option.evaluate(node => {
      const r = node.getBoundingClientRect();
      return node.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
    }), true, 'font suggestions are clickable inside the Appearance island');
    await font.press('Enter');
    assert.equal(await font.inputValue(), 'Segoe UI');
    assert.equal(await page.getByRole('listbox').isVisible(), false);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#brandMark').evaluate(node => node === document.activeElement), true);

    await page.setViewportSize({ width: 1200, height: 720 });
    await page.evaluate(() => {
      RV.I18n.setLocale('en'); RVApp.applyLocale();
      RVApp.setDoc('# One', 'one.md');
      RVApp.newTab('# Two', 'two.md');
      RVApp.newTab('# Three', 'three.md');
      RVApp.setMode('write');
    });
    const order = () => page.evaluate(() => RVApp.listTabs().map(tab => tab.name));
    await page.locator('#editor').fill('# Three edited');
    await dragTab(page, 'one.md', 'three.md', false);
    assert.deepEqual(await order(), ['two.md', 'three.md', 'one.md']);
    const toggle = page.locator('#btnTabLayout');
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#btnVerticalTabs').getAttribute('aria-pressed'), 'true');
    await page.locator('#verticalTabs [role="tablist"]').waitFor();
    await dragTab(page, 'one.md', 'two.md', true);
    assert.deepEqual(await order(), ['one.md', 'two.md', 'three.md']);
    assert.equal(await page.locator('#editor').inputValue(), '# Three edited');
    await page.locator('[role="tab"][aria-selected="true"]').press('Control+Shift+ArrowUp');
    assert.deepEqual(await order(), ['one.md', 'three.md', 'two.md']);
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-pressed'), 'false');
    await page.locator('.workspacebar [role="tablist"]').waitFor();

    // Exercise the Windows island, where Reading and Compare share the toolbar row.
    await page.evaluate(() => {
      RVApp.newTab('# Long document name', 'a-document-name-that-needs-truncating.md');
      document.documentElement.dataset.windowsTitlebar = '';
      document.documentElement.dataset.windowGlass = '';
      document.getElementById('captionButtons').hidden = false;
      document.getElementById('titlebarDrag').hidden = false;
    });
    await toggle.click(); await toggle.click();
    await page.locator('#titlebarTabs [role="tablist"]').waitFor();
    for (const width of [1440, 860, 641, 360]) {
      await page.setViewportSize({ width, height: 720 });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await assertToolbarFits(page, 'Windows ' + width);
    }
    assert.equal(await page.locator('#titlebarTabs .is-active').evaluate(tab => {
      const bounds = tab.getBoundingClientRect(), rail = tab.parentElement.getBoundingClientRect();
      return bounds.left >= rail.left - 1 && bounds.right <= rail.right + 1 &&
        parseFloat(getComputedStyle(tab).borderBottomRightRadius) >= 6 &&
        parseFloat(getComputedStyle(tab, '::before').width) >= 3;
    }), true, 'the selected tab and its close button fit at the minimum Windows width');
    await page.locator('#titlebarTabs [aria-selected="true"]').press('Control+Tab');
    assert.equal(await page.locator('#titlebarTabs .is-active').evaluate(tab => {
      const bounds = tab.getBoundingClientRect(), rail = tab.parentElement.getBoundingClientRect();
      return tab.contains(document.activeElement) && bounds.left >= rail.left - 1 && bounds.right <= rail.right + 1;
    }), true, 'Ctrl+Tab from the title-bar tab list reveals and focuses the next complete tab');
    await page.locator('#titlebarTabs .document-tabs').evaluate(rail => { rail.scrollLeft = 12; });
    await page.waitForFunction(() => document.querySelector('#titlebarTabs [data-tab-clipped]'));
    assert.equal(await page.locator('#titlebarTabs .document-tabs').evaluate(rail => {
      const toggle = document.getElementById('btnTabLayout'), add = document.getElementById('btnNewTab');
      const r = rail.getBoundingClientRect();
      return r.left > toggle.getBoundingClientRect().right && r.right < add.getBoundingClientRect().left &&
        Array.from(rail.querySelectorAll('[data-tab-clipped]')).every(tab => getComputedStyle(tab).opacity === '0');
    }), true, 'scrolled tabs stay clear of the title-bar controls');
    assert.equal(await page.evaluate(() => {
      const fill = selector => getComputedStyle(document.querySelector(selector)).backgroundImage;
      return fill('.menu-line') === fill('.statusbar') && fill('.menu-line') !== fill('.tools-island');
    }), true, 'title and status bars use their own lighter acrylic tint');
    const more = page.locator('#btnToolbarMore');
    await more.click();
    const wrap = page.locator('#toolbarOverflow #btnWrap');
    const beforeWrap = await wrap.getAttribute('aria-pressed');
    await wrap.click();
    assert.notEqual(await wrap.getAttribute('aria-pressed'), beforeWrap);
    await page.keyboard.press('Escape');
    assert.equal(await more.evaluate(node => node === document.activeElement), true);
    await page.setViewportSize({ width: 1600, height: 720 });
    await page.locator('#toolbar > .display-tools #btnWrap').waitFor();
    assert.notEqual(await page.locator('#btnWrap').getAttribute('aria-pressed'), beforeWrap);

    assert.deepEqual(errors, []);
    console.log('UI smoke passed: English/Persian, light/dark, responsive menus, keyboard focus, and tab reordering.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
