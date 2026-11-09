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
  assert.equal(await page.locator('#btnToc').evaluate(button => {
    const row = button.parentElement, b = button.getBoundingClientRect(), r = row.getBoundingClientRect();
    const left = r.left + row.clientLeft + parseFloat(getComputedStyle(row).paddingLeft);
    return row.id === 'toolbar' && b.width > 0 && Math.abs(b.left - left) <= 1 &&
      button.contains(document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2));
  }), true, 'Contents stays on the far left: ' + state);
}

async function assertTabsCentered(page, state) {
  assert.equal(await page.locator('#titlebarTabs .is-active').evaluate(tab => {
    const rect = tab.getBoundingClientRect(), top = tab.closest('.menu-line').getBoundingClientRect().top;
    const toolbarTop = document.querySelector('.tools-island').getBoundingClientRect().top;
    return Math.abs((rect.top - top) - (toolbarTop - rect.bottom)) <= 1;
  }), true, 'equal space above and below the title-bar tabs: ' + state);
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

    // Start with one empty tab and exercise the real New Tab button in the Windows layout.
    await page.evaluate(async () => {
      RVApp.setDoc(RVApp.el.editor.value, RVApp.state.name);
      for (const tab of RVApp.listTabs().slice(1)) await RVApp.closeTab(tab.id);
      RVApp.setEmpty();
      document.documentElement.dataset.desktopTitlebar = '';
      document.documentElement.dataset.windowGlass = '';
      document.getElementById('captionButtons').hidden = false;
      document.getElementById('titlebarDrag').hidden = false;
    });
    await toggle.click(); await toggle.click();
    await page.locator('#titlebarTabs [role="tablist"]').waitFor();
    await page.locator('#titlebarTabs #btnNewTab').click();
    for (const width of [1440, 1200, 860, 760, 641, 360]) {
      await page.setViewportSize({ width, height: 720 });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await assertToolbarFits(page, 'Windows ' + width);
      await assertTabsCentered(page, width);
      assert.equal(await page.locator('#titlebarTabs #documentTabs').evaluate(rail => {
        const r = rail.getBoundingClientRect();
        return rail.children.length === 2 && rail.scrollWidth <= rail.clientWidth + 1 && Array.from(rail.children).every(tab => {
          const bounds = tab.getBoundingClientRect();
          return bounds.left >= r.left - 1 && bounds.right <= r.right + 1;
        });
      }), true, 'both tabs fit with their close buttons at ' + width);
      assert.equal(await page.locator('#btnOpen').evaluate(button => button.closest('#toolbar') !== null),
        true, 'file tools stay out of the tab strip');
      assert.equal(await page.locator('#btnFocus').isVisible(), true, 'Focus remains visible at ' + width);
    }
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => document.querySelector('[data-theme-choice="' + theme + '"]').click(), theme);
      assert.equal(await page.locator('.tools-island').evaluate(node => {
        const style = getComputedStyle(node);
        return style.backgroundImage === 'none' && parseFloat(style.borderRadius) > 0 && style.boxShadow === 'none';
      }), true, 'toolbar keeps its rounded outer edge in ' + theme);
      assert.equal(await page.locator('#toolbar').evaluate(toolbar =>
        [...toolbar.querySelectorAll(':scope > .tgroup')].every(group => {
          const style = getComputedStyle(group);
          return style.borderBlockStartWidth === '0px' && style.borderRadius === '0px';
        })
      ), true, 'toolbar groups use separators without outlines in ' + theme);
    }
    await page.evaluate(() => {
      RVApp.newTab('# Long document name', 'a-document-name-that-needs-truncating.md');
      RVApp.newTab('# Another long name', 'another-long-document-name.md');
    });
    assert.equal(await page.locator('#titlebarTabs .is-active').evaluate(tab => {
      const bounds = tab.getBoundingClientRect(), rail = tab.parentElement.getBoundingClientRect();
      const style = getComputedStyle(tab);
      const inactive = getComputedStyle(tab.parentElement.querySelector('.document-tab:not(.is-active)'));
      return bounds.left >= rail.left - 1 && bounds.right <= rail.right + 1 &&
        style.borderBottomColor !== inactive.borderBottomColor && style.borderBottomWidth === '2px' &&
        style.backgroundImage === 'none' && Number(style.fontWeight) > Number(inactive.fontWeight);
    }), true, 'the selected tab fits at minimum width and stands out with an underline');
    await assertTabsCentered(page, 'scrolling tab strip');
    await page.locator('#titlebarTabs [aria-selected="true"]').press('Control+Tab');
    assert.equal(await page.locator('#titlebarTabs .is-active').evaluate(tab => {
      const bounds = tab.getBoundingClientRect(), rail = tab.parentElement.getBoundingClientRect();
      return tab.contains(document.activeElement) && bounds.left >= rail.left - 1 && bounds.right <= rail.right + 1;
    }), true, 'Ctrl+Tab from the title-bar tab list reveals and focuses the next complete tab');
    await page.locator('#titlebarTabs .document-tabs').evaluate(rail => { rail.scrollLeft = 12; });
    assert.equal(await page.locator('#titlebarTabs .document-tabs').evaluate(rail => {
      const toggle = document.getElementById('btnTabLayout'), add = document.getElementById('btnNewTab');
      const r = rail.getBoundingClientRect();
      return rail.scrollLeft > 0 && r.left > toggle.getBoundingClientRect().right && r.right < add.getBoundingClientRect().left;
    }), true, 'scrolled tabs stay clear of the title-bar controls');
    await page.locator('#brandMark').click();
    await page.locator('#menuView > summary').click();
    await page.locator('#btnAppearance').click();
    const opacity = page.locator('#appearanceOpacity');
    await opacity.press('Home');
    const backdrop = () => page.locator('body').evaluate(node => getComputedStyle(node).backgroundColor);
    assert.match(await backdrop(), /\/ 0\)|rgba\(0, 0, 0, 0\)/, 'minimum opacity exposes the backdrop');
    await opacity.press('End');
    assert.equal(await page.locator('#appearanceOpacityValue').textContent(), '100%');
    assert.doesNotMatch(await backdrop(), /\//, 'maximum opacity makes the title bar opaque');
    await page.locator('#appearanceCancel').click();
    assert.match(await backdrop(), /\/ 0\.7\)/, 'Cancel restores the previous opacity');
    await page.emulateMedia({ forcedColors: 'active' });
    assert.equal(await page.evaluate(() =>
      getComputedStyle(document.body).getPropertyValue('--window-base') ===
      getComputedStyle(document.body).getPropertyValue('--bg-inset')), true, 'forced colors disable the glass tint');
    await page.emulateMedia({ forcedColors: null });
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

    const toolbar = page.locator('#toolbar');
    for (const id of ['btnOpen', 'btnSave', 'btnSaveAs', 'btnReload']) await toolbar.locator('#' + id).waitFor();
    await page.evaluate(() => RVApp.setDoc('# Before undo', 'undo.md'));
    await page.locator('#editor').fill('# Edited');
    await toolbar.locator('#btnToolbarUndo').click();
    assert.equal(await page.locator('#editor').inputValue(), '# Before undo');
    await toggle.click();
    const rail = page.locator('#verticalTabs');
    assert.equal(await page.locator('#layout').evaluate(layout => {
      const panels = layout.querySelectorAll('.sidebar, .vertical-tabs');
      return getComputedStyle(layout).borderRadius === '10px' &&
        [...panels].every(panel => {
          const style = getComputedStyle(panel);
          return style.borderRadius === '0px' && style.backgroundColor.includes('/ 0.62');
        });
    }), true, 'the workspace has one rounded frame and straight tinted side panels');
    const focus = page.getByRole('button', { name: 'Focus', exact: true });
    await focus.click();
    await page.getByRole('button', { name: 'Exit reading mode (Esc)' }).waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await focus.evaluate(button => button === document.activeElement), true, 'Focus returns to its toolbar button');
    const beforeCount = (await order()).length;
    assert.equal(await page.locator('.menu-line .new-tab').count(), 0);
    await rail.locator('#btnNewTab').click();
    assert.equal((await order()).length, beforeCount + 1);
    const handle = page.locator('#tabRailResizer');
    const width = () => rail.evaluate(node => node.offsetWidth);
    const initialWidth = await width();
    const r = await handle.boundingBox();
    await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
    await page.mouse.down();
    await page.mouse.move(r.x + r.width / 2 + 64, r.y + r.height / 2, { steps: 4 });
    await page.mouse.up();
    assert.equal(await width(), initialWidth + 64);
    await page.evaluate(() => { RV.I18n.setLocale('fa'); RVApp.applyLocale(); });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await assertToolbarFits(page, 'Windows RTL');
    await handle.press('ArrowLeft');
    const savedWidth = await width();
    assert.equal(savedWidth, initialWidth + 76, 'RTL ArrowLeft widens the vertical tab sidebar');
    assert.equal(await handle.getAttribute('aria-valuenow'), String(savedWidth));
    await page.reload();
    await rail.waitFor();
    assert.equal(await width(), savedWidth, 'vertical tab width survives reload');

    assert.deepEqual(errors, []);
    console.log('UI smoke passed: responsive menus, font suggestions, flat toolbar, Focus, horizontal tabs, and persistent vertical tab width.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
