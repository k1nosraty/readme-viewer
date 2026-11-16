'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

async function dragTab(page, source, target, vertical) {
  const tabs = page.getByRole('tab');
  const from = await tabs.filter({ hasText: source }).boundingBox();
  const to = await page.locator('.document-tab').filter({ has: tabs.filter({ hasText: target }) }).boundingBox();
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
          await page.locator('.app-menu-categories [aria-controls="' + id + '"]').click();
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
    await page.locator('.app-menu-categories [aria-controls="menuHelp"]').click();
    await page.locator('#menuHelp [data-command="btnHelp"]').click();
    const mode = await page.evaluate(() => RVApp.state.mode);
    await page.keyboard.press('Control+1');
    assert.equal(await page.evaluate(() => RVApp.state.mode), mode, 'modal shortcuts do not alter the background');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.getElementById('helpModal').contains(document.activeElement)), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#brandMark').evaluate(node => node === document.activeElement), true);
    await page.locator('#brandMark').click();
    await page.locator('.app-menu-categories [aria-controls="menuView"]').click(); await page.locator('#btnAppearance').click();
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
      RVApp.setDoc('# One\n\nFirst **paragraph**.\n\nThis paragraph stays out of the preview.', 'one.md');
      RVApp.newTab('# Two', 'two.md');
      RVApp.newTab('# Three', 'three.md');
      RVApp.setMode('write');
    });
    const order = () => page.evaluate(() => RVApp.listTabs().map(tab => tab.name));
    await page.locator('#editor').fill('# Three edited');
    const tabPreview = page.locator('#tabPreview');
    const tabExcerpt = tabPreview.locator('#tabPreviewText');
    const oneTab = page.getByRole('tab', { name: 'one.md', exact: true });
    const twoTab = page.getByRole('tab', { name: 'two.md', exact: true });
    await oneTab.hover();
    await tabPreview.waitFor({ state: 'visible' });
    assert.equal(await tabExcerpt.textContent(), 'First paragraph.');
    const previewBox = await tabPreview.boundingBox();
    await page.mouse.move(previewBox.x + 20, previewBox.y + 14);
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 200)));
    assert.equal(await tabPreview.isVisible(), true, 'the pointer can enter the preview to read it');
    assert.equal(await page.locator('#editor').inputValue(), '# Three edited');
    await twoTab.hover();
    await tabPreview.waitFor({ state: 'visible' });
    assert.equal(await tabExcerpt.textContent(), 'Two');
    await page.keyboard.press('Escape');
    await tabPreview.waitFor({ state: 'hidden' });
    await page.mouse.move(0, 400);
    await page.locator('[role="tab"][aria-selected="true"]').press('Home');
    await tabPreview.waitFor({ state: 'visible' });
    assert.equal(await oneTab.getAttribute('aria-describedby'), 'tabPreviewText');
    assert.equal(await tabExcerpt.textContent(), 'First paragraph.');
    await page.keyboard.press('Escape');
    assert.equal(await tabPreview.isVisible(), false);
    await page.keyboard.press('F2');
    const renameField = page.getByRole('textbox', { name: 'Tab name', exact: true });
    assert.equal(await renameField.inputValue(), 'one.md');
    await renameField.fill('Keyboard cancellation');
    await page.keyboard.press('Escape');
    assert.equal(await oneTab.evaluate(tab => tab === document.activeElement), true);
    await page.getByRole('tab', { name: /three\.md$/ }).click();
    await page.getByRole('button', { name: 'Rename tab: one.md', exact: true }).click();
    assert.equal(await renameField.inputValue(), 'one.md');
    await renameField.fill('  یادداشت انتشار  ');
    await renameField.press('Enter');
    await page.getByRole('tab', { name: 'یادداشت انتشار', exact: true }).waitFor();
    assert.deepEqual(await order(), ['one.md', 'two.md', 'three.md']);
    assert.equal(await page.locator('#editor').inputValue(), '# Three edited');
    const renamedPencil = page.getByRole('button', { name: 'Rename tab: یادداشت انتشار', exact: true });
    assert.equal(await renamedPencil.evaluate(button => button === document.activeElement), true);
    await renamedPencil.click();
    await renameField.fill('Discarded title');
    await renameField.press('Escape');
    await renamedPencil.click();
    assert.equal(await renameField.inputValue(), 'یادداشت انتشار');
    await renameField.fill('');
    await page.locator('#tabRename').getByRole('button', { name: 'Apply', exact: true }).click();
    await page.getByRole('tab', { name: 'one.md', exact: true }).dblclick();
    assert.equal(await renameField.inputValue(), 'one.md');
    assert.equal(await page.getByRole('tab', { name: 'one.md', exact: true }).getAttribute('aria-selected'), 'true');
    await renameField.fill('First review');
    await renameField.press('Enter');
    await page.getByRole('tab', { name: 'First review', exact: true }).dblclick();
    assert.equal(await renameField.inputValue(), 'First review');
    await renameField.fill('');
    await renameField.press('Enter');
    await page.getByRole('tab', { name: 'one.md', exact: true }).waitFor();
    await page.getByRole('tab', { name: /three\.md$/ }).click();
    await dragTab(page, 'one.md', 'three.md', false);
    assert.deepEqual(await order(), ['two.md', 'three.md', 'one.md']);
    const toggle = page.locator('#btnTabLayout');
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#btnVerticalTabs').getAttribute('aria-pressed'), 'true');
    await page.locator('#verticalTabs [role="tablist"]').waitFor();
    const verticalTab = page.getByRole('tab', { name: 'one.md' });
    await verticalTab.hover();
    await tabPreview.waitFor({ state: 'visible' });
    assert.ok((await tabPreview.boundingBox()).x > (await verticalTab.boundingBox()).x);
    await dragTab(page, 'one.md', 'two.md', true);
    await tabPreview.waitFor({ state: 'hidden' });
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
          return bounds.left >= r.left - 1 && bounds.right <= r.right + 1 && [...tab.querySelectorAll('button')].every(button => {
            const target = button.getBoundingClientRect();
            return target.width > 0 && button.contains(document.elementFromPoint(target.x + target.width / 2, target.y + target.height / 2));
          });
        });
      }), true, 'both tabs fit with their rename and close buttons at ' + width);
      assert.equal(await page.locator('#btnOpen').evaluate(button => button.closest('#toolbar') !== null),
        true, 'file tools stay out of the tab strip');
      assert.equal(await page.locator('#btnFocus').isVisible(), true, 'Focus remains visible at ' + width);
      assert.equal(await page.locator('#btnAllTabs').isVisible(), false, 'the tab list stays hidden when both tabs fit');
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
    const allTabs = page.getByRole('button', { name: 'All tabs', exact: true });
    await allTabs.click();
    const allTabsPanel = page.locator('#allTabsPanel');
    await page.keyboard.press('Escape');
    assert.equal(await allTabsPanel.isVisible(), false);
    assert.equal(await allTabs.evaluate(button => button === document.activeElement), true);
    await allTabs.click();
    await allTabsPanel.getByRole('button', { name: 'a-document-name-that-needs-truncating.md', exact: true }).click();
    assert.equal(await allTabsPanel.isVisible(), false);
    assert.equal(await page.locator('#titlebarTabs [aria-selected="true"]').textContent(), 'a-document-name-that-needs-truncating.md');
    await page.locator('#brandMark').click();
    await page.locator('.app-menu-categories [aria-controls="menuView"]').click();
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
    await page.evaluate(() => { document.documentElement.dataset.windowMaximized = ''; });
    assert.doesNotMatch(await backdrop(), /\//, 'maximizing covers the native caption controls with an opaque surface');
    await page.evaluate(() => { delete document.documentElement.dataset.windowMaximized; });
    assert.match(await backdrop(), /\/ 0\.7\)/, 'restoring brings back the selected opacity');
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
    await allTabs.waitFor({ state: 'hidden' });
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
          return style.borderRadius === '0px' && style.backgroundColor.includes('/ 0.88');
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

    const touch = await browser.newPage({ viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true });
    try {
      await touch.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href);
      await touch.waitForFunction(() => window.RVApp && RVApp.state.ready);
      await touch.evaluate(() => {
        RV.I18n.setLocale('fa'); RVApp.applyLocale();
        RVApp.setDoc('# راهنمای نصب', 'راهنمای نصب و راه‌اندازی پروژه.md');
        RVApp.newTab('# یادداشت', 'یادداشت‌های آزمون رابط.md');
      });
      assert.equal(await touch.locator('#sidebar').isVisible(), false, 'the mobile contents drawer starts closed');
      const actions = touch.locator('.document-tab.is-active :is(.document-tab-rename, .document-tab-close)');
      assert.equal(await actions.evaluateAll(buttons => buttons.every(button => {
        const box = button.getBoundingClientRect(), rail = button.closest('.document-tabs').getBoundingClientRect();
        return box.width >= 44 && box.left >= rail.left && box.right <= rail.right;
      })), true, 'both tab actions fit at 320px in RTL with touch targets');
      await touch.locator('.document-tab.is-active .document-tab-rename').tap();
      await touch.locator('#tabTitleInput').fill('راهنمای تیم');
      await touch.locator('#tabRename button').tap();
      await touch.getByRole('tab', { name: 'راهنمای تیم', exact: true }).waitFor();

      await touch.evaluate(() => {
        for (let i = 0; i < 6; i++) RVApp.newTab('# Check\n\n- [ ] یادگیری PostgreSQL', `document-${i}-with-a-long-name.md`);
        RVApp.setMode('preview');
      });
      await touch.locator('#btnAllTabs').tap();
      await touch.locator('#allTabsPanel button').filter({ hasText: 'document-4-with-a-long-name.md' }).tap();
      assert.equal(await touch.locator('#tabList').getAttribute('aria-owns').then(ids => ids.split(' ').length), 8);
      assert.equal(await touch.locator('#panes').getAttribute('aria-labelledby'),
        await touch.getByRole('tab', { selected: true }).getAttribute('id'));
      await touch.keyboard.press('Control+f');
      assert.equal(await touch.locator('#tocFilter').evaluate(input => input === document.activeElement), true);
      await touch.locator('#previewScroll').focus();
      assert.equal(await touch.locator('#sidebar').isVisible(), false, 'Contents closes when focus leaves it');
      await touch.getByRole('button', { name: 'جست‌وجو در سند' }).tap();
      await touch.locator('#findInput').fill('PostgreSQL');
      assert.equal(await touch.locator('#findCount[role="status"]').textContent(), '1 / 1');
      await touch.locator('#findClose').tap();
      await touch.evaluate(() => { RVApp.setMode('split'); RVApp.showComparison(); });
      await touch.locator('button[data-compare-page="second"]').tap();
      assert.equal(await touch.locator('#panes').isVisible(), false);
      await touch.locator('button[data-compare-page="main"]').tap();
      assert.equal(await touch.locator('#panes').isVisible(), true);
      await touch.setViewportSize({ width: 760, height: 400 });
      await touch.waitForFunction(() => document.getElementById('workspaceViews').dataset.compareLayout === 'columns');
      for (const id of ['editor', 'previewScroll', 'comparisonScroll']) {
        assert.ok((await touch.locator('#' + id).boundingBox()).height >= 125, id + ' has reading space in landscape');
      }
      await touch.evaluate(() => RVApp.hideComparison());
      const editorHeight = (await touch.locator('#paneEditor').boundingBox()).height;
      await touch.locator('#resizer').press('ArrowDown');
      assert.ok((await touch.locator('#paneEditor').boundingBox()).height > editorHeight);
      await touch.locator('#brandMark').tap();
      await touch.locator('#appMenuPanel button[aria-controls="menuView"]').tap();
      await touch.locator('[data-shell-action="resizeLayout"]').tap();
      await touch.locator('#paneSizes button[data-pane-step="0"]').tap();
      assert.equal(await touch.locator('#resizer').getAttribute('aria-valuenow'), '50');
      await touch.keyboard.press('Escape');

      const contents = touch.locator('#sidebar');
      const contentsToggle = touch.locator('#btnToc');
      async function assertContents(open, width) {
        await touch.setViewportSize({ width, height: 640 });
        await touch.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        assert.equal(await contents.isVisible(), open, 'Contents visibility at ' + width);
        assert.equal(await contentsToggle.getAttribute('aria-pressed'), String(open));
      }
      await assertContents(false, 901);
      await contentsToggle.tap();
      await assertContents(true, 900);
      assert.equal(await contents.evaluate(sidebar => {
        const box = sidebar.getBoundingClientRect(), layout = sidebar.parentElement.getBoundingClientRect();
        return Math.abs(box.right - layout.right) < 2;
      }), true, 'the Persian drawer opens at the same edge as the wide sidebar');
      await contentsToggle.tap();
      await assertContents(false, 901);
      await assertContents(false, 900);
      await contentsToggle.tap();
      const contentsFilter = touch.locator('#tocFilter');
      await contentsFilter.focus();
      await assertContents(true, 901);
      await assertContents(true, 320);
      assert.equal(await contentsFilter.evaluate(input => input === document.activeElement), true,
        'Contents retains keyboard focus across the breakpoint');
      await touch.locator('#brandMark').tap();
      await touch.locator('#appMenuPanel [aria-controls="menuView"]').tap();
      await touch.locator('#menuView [data-command="btnToc"]').tap();
      assert.equal(await contents.isVisible(), false, 'View menu can close the open drawer');
    } finally { await touch.close(); }

    assert.deepEqual(errors, []);
    console.log('UI smoke passed: responsive menus, font suggestions, flat toolbar, Focus, horizontal tabs, and persistent vertical tab width.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
