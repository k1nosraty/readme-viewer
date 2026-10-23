'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

(async function () {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => { errors.push(error.message); console.error('Browser error:', error.message); });
    await page.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href);
    await page.waitForFunction(() => window.RVApp && window.RVApp.state.ready);
    await page.locator('#fileInput').setInputFiles({
      name: 'persian.md', mimeType: 'text/markdown',
      buffer: Buffer.from('# Test\r\n\r\n- [ ] یادگیری PostgreSQL\r\n')
    });
    await page.waitForFunction(() => window.RVApp.state.name === 'persian.md');
    assert.equal(await page.evaluate(() => window.RVApp.state.dirty), false);
    await page.locator('#btnEdit').click();
    await page.locator('#preview input').click();
    await page.waitForFunction(() => document.getElementById('editor').value.includes('[x]'));
    await page.waitForFunction(() => document.querySelector('#preview input').checked);
    assert.equal(await page.evaluate(() => window.RVApp.state.dirty), true);
    // Undo belongs to each document even when browser editing history crosses controls.
    await page.evaluate(() => { window.RVApp.setMode('split'); window.RVApp.setDoc('one', 'one.md'); });
    await page.locator('#editor').focus();
    await page.keyboard.press('End');
    await page.keyboard.type(' changed');
    const firstTab = await page.evaluate(() => window.RVApp.listTabs().find(tab => tab.active).id);
    await page.evaluate(() => window.RVApp.newTab('two', 'two.md'));
    await page.locator('#editor').focus();
    await page.keyboard.press('Control+z');
    assert.equal(await page.locator('#editor').inputValue(), 'two', 'new tab cannot undo another document');
    await page.keyboard.press('End');
    await page.keyboard.type(' changed');
    await page.keyboard.press('Control+z');
    assert.equal(await page.locator('#editor').inputValue(), 'two');
    await page.keyboard.press('Control+Shift+z');
    assert.equal(await page.locator('#editor').inputValue(), 'two changed');
    await page.evaluate(id => window.RVApp.switchTab(id), firstTab);
    await page.locator('#editor').focus();
    await page.keyboard.press('Control+z');
    assert.equal(await page.locator('#editor').inputValue(), 'one', 'switching preserves original tab undo');
    await page.evaluate(() => window.RVApp.setDoc('replacement', 'replacement.md'));
    await page.locator('#editor').focus();
    await page.keyboard.press('Control+z');
    assert.equal(await page.locator('#editor').inputValue(), 'replacement', 'replacement cannot undo old source');
    await page.evaluate(() => window.RVApp.showComparison());
    for (const width of [1440, 760, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const dimensions = await page.evaluate(() => {
        const main = document.getElementById('panes').getBoundingClientRect();
        const comparison = document.getElementById('comparisonPane').getBoundingClientRect();
        return { main: [main.width, main.height], comparison: [comparison.width, comparison.height] };
      });
      assert.ok(dimensions.main.every(value => value > 80), 'main comparison view remains usable');
      assert.ok(dimensions.comparison.every(value => value > 80), 'secondary comparison view remains usable');
    }
    await page.evaluate(() => window.RVApp.hideComparison());
    // Layout regressions need real browser geometry; DOM-only tests cannot detect collapsed grids.
    for (const width of [1440, 1024, 760, 390]) {
      await page.setViewportSize({ width, height: 900 });
      for (const mode of ['write', 'preview', 'split']) {
        await page.evaluate(mode => window.RVApp.setMode(mode), mode);
        const geometry = await page.evaluate(mode => {
          const rect = id => document.getElementById(id).getBoundingClientRect();
          const panes = rect('panes');
          const pane = rect(mode === 'write' ? 'paneEditor' : 'panePreview');
          const article = rect('preview');
          const scroll = rect('previewScroll');
          return { panes: { width: panes.width, height: panes.height },
            pane: { width: pane.width, height: pane.height },
            articleWidth: article.width, scrollWidth: scroll.width };
        }, mode);
        assert.ok(geometry.pane.width > 100 && geometry.pane.height > 100,
          `Visible ${mode} pane collapsed at ${width}px: ${JSON.stringify(geometry)}`);
        if (mode !== 'split') {
          assert.ok(Math.abs(geometry.pane.width - geometry.panes.width) < 2,
            `${mode} must fill the available width at ${width}px`);
          assert.ok(Math.abs(geometry.pane.height - geometry.panes.height) < 2,
            `${mode} must fill the available height at ${width}px`);
        }
        if (mode === 'preview') {
          assert.ok(geometry.articleWidth > geometry.scrollWidth - 80,
            `Preview content must use the full width at ${width}px`);
        }
      }
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    const readingSource = '# Reading tools\n\n- [x] Completed\n- [ ] Pending\n';
    await page.evaluate(source => window.RVApp.setDoc(source, 'reading.md'), readingSource);
    await page.locator('#readingOptions summary').click();
    await page.locator('#readingWidth').selectOption('comfortable');
    await page.locator('#readingSpacing').selectOption('relaxed');
    await page.locator('#hideCompleted').check();
    assert.equal(await page.locator('#preview .task-list-item').first().isVisible(), false);
    assert.equal(await page.locator('#editor').inputValue(), readingSource);
    await page.locator('#readingWidth').selectOption('full');
    await page.locator('#readingSpacing').selectOption('normal');
    await page.locator('#hideCompleted').uncheck();
    await page.locator('#readingOptions summary').click();
    // Shared Markdown rules must keep their theme colors after CSS consolidation.
    await page.evaluate(() => window.RVApp.setDoc('[Link](guide.md) and note[^یادداشت] twice[^یادداشت].\n\n[^یادداشت]: Note', 'theme.md', null, {}));
    const colors = new Map();
    for (let i = 0; i < 3; i++) {
      await page.locator('#btnTheme').click();
      const result = await page.evaluate(() => ({
        theme: document.documentElement.dataset.theme,
        color: getComputedStyle(document.querySelector('#preview p a')).color
      }));
      colors.set(result.theme, result.color);
    }
    assert.equal(colors.get('light'), 'rgb(9, 105, 218)');
    assert.equal(colors.get('dark'), 'rgb(68, 147, 248)');
    assert.equal(await page.locator('#preview p > a').getAttribute('target'), '_blank');
    const footnotesValid = await page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll('#preview [id]'));
      const ids = nodes.map(node => node.id);
      return new Set(ids).size === ids.length &&
        Array.from(document.querySelectorAll('#preview .footnote-ref a, #preview .footnote-back')).every(link =>
          document.getElementById(decodeURIComponent(link.getAttribute('href').slice(1))));
    });
    assert.equal(footnotesValid, true);
    await page.evaluate(() => window.RVApp.setDoc('- [x] یادگیری PostgreSQL', 'persian.md', null, {}));
    await page.setViewportSize({ width: 390, height: 900 });
    await page.locator('#btnToc').click();
    assert.ok(await page.evaluate(() => { const button = document.getElementById('btnExport'); const rect = button.getBoundingClientRect(); return button.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)); }), 'mobile sidebar must never cover the toolbar');
    const downloading = page.waitForEvent('download');
    await page.locator('#btnExport').click();
    const download = await downloading;
    assert.equal(download.suggestedFilename(), 'persian.html');
    const html = await fs.readFile(await download.path(), 'utf8');
    assert.match(html, /یادگیری PostgreSQL/);
    assert.match(html, /checked/);
    assert.doesNotMatch(html, /href="vendor\//);
    assert.doesNotMatch(html, /section-tools/);
    const exported = await browser.newPage();
    await exported.setContent(html);
    assert.equal(await exported.locator('input').isChecked(), true);
    assert.equal(await exported.locator('input').isDisabled(), true);
    assert.deepEqual(errors, []);
    console.log('Chromium smoke test passed: offline open, Persian/CRLF, task editing, responsive layout, HTML export.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
