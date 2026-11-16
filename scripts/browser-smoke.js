'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

function pdfFixture() {
  const pages = [1, 2, 3].map(number => 'BT /F1 20 Tf 72 700 Td (Searchable text on page ' + number + ') Tj ET');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R 5 0 R] /Count 3 >>',
    ...pages.map((_, index) => '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 6 0 R >> >> /Contents ' + (7 + index) + ' 0 R >>'),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ...pages.map(text => '<< /Length ' + text.length + ' >>\nstream\n' + text + '\nendstream')
  ];
  let data = '%PDF-1.7\n';
  const offsets = objects.map((object, index) => {
    const offset = data.length;
    data += (index + 1) + ' 0 obj\n' + object + '\nendobj\n';
    return String(offset).padStart(10, '0') + ' 00000 n \n';
  });
  const xref = data.length;
  return Buffer.from(data + 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n' + offsets.join('') +
    'trailer\n<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
}

async function checkPdfTabs(browser) {
  const http = require('node:http');
  const { preparePdfReader } = require('./prepare-tauri-assets');
  const root = path.resolve(__dirname, '..');
  const output = path.join(root, 'native-test-results', 'pdf-browser-assets');
  await preparePdfReader(path.join(root, 'src/pdf-reader'), path.join(output, 'pdf'));
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
    '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
  const server = http.createServer(async (request, response) => {
    try {
      const relative = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname).slice(1);
      const base = relative.startsWith('pdf/') ? output : root;
      const file = path.resolve(base, relative);
      if (!file.startsWith(base + path.sep) || !/^(?:pdf\/|src\/|vendor\/|index\.html$|app\.js$|styles\.css$)/.test(relative)) {
        response.writeHead(404).end(); return;
      }
      response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }).end(await fs.readFile(file));
    } catch {
      if (!response.headersSent) response.writeHead(404);
      response.end();
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  try {
    await page.goto('http://127.0.0.1:' + server.address().port + '/index.html');
    await page.waitForFunction(() => window.RVApp?.state.ready);
    await page.evaluate(async bytes => {
      RVApp.setDoc('Keep this document open.', 'notes.md');
      RVApp.setMode('write');
      RV.Native.available = RV.Native.supportsPdf = () => true;
      const file = new File([new Uint8Array(bytes)], 'Reading.PDF', { type: 'application/pdf' });
      await RVApp.openFileTab(file, {
        path: '/test/Reading.PDF',
        name: file.name,
        getFile: async () => file,
        createWritable: async () => ({
          write: async blob => { window.savedPdf = Array.from(new Uint8Array(await blob.arrayBuffer())); },
          close: async () => {}
        })
      });
    }, Array.from(pdfFixture()));
    const display = page.locator('#pdfWorkspace .pdf-view:not([hidden]) iframe');
    const reader = page.frameLocator('#pdfWorkspace .pdf-view:not([hidden]) iframe');
    const text = reader.locator('.textLayer span', { hasText: 'Searchable text on page 1' }).first();
    await text.waitFor();
    assert.equal(await page.locator('#panes').getAttribute('data-mode'), 'preview');
    assert.equal(await page.getByRole('tab').count(), 2);
    assert.equal(await page.locator('#btnSave').isEnabled(), true);
    await page.getByRole('button', { name: 'Rename tab: Reading.PDF', exact: true }).click();
    const title = page.getByRole('textbox', { name: 'Tab name', exact: true });
    await title.fill('Review copy');
    await title.press('Enter');
    assert.equal(await page.evaluate(() => RVApp.state.name), 'Reading.PDF');
    const copied = await text.evaluate(node => {
      const range = document.createRange();
      range.selectNodeContents(node);
      const selection = window.getSelection();
      selection.removeAllRanges(); selection.addRange(range);
      const clipboard = new DataTransfer();
      node.dispatchEvent(new ClipboardEvent('copy', { bubbles: true, cancelable: true, clipboardData: clipboard }));
      return clipboard.getData('text/plain');
    });
    assert.match(copied, /Searchable text/);
    await reader.locator('#viewerContainer').focus();
    await page.keyboard.press('Control+f');
    await reader.locator('#findInput').fill('Searchable');
    await reader.locator('#findCount').getByText(/of 3/).waitFor();
    await reader.locator('#findNext').click();
    await reader.locator('#pageNumber').getByText('Page 2 of 3', { exact: true }).waitFor();
    await reader.locator('#findPrevious').click();
    await reader.locator('#pageNumber').getByText('Page 1 of 3', { exact: true }).waitFor();
    await reader.locator('#findClose').click();
    const first = reader.locator('.pdfViewer .page').first();
    const fitted = (await first.boundingBox()).width;
    await reader.getByRole('button', { name: 'Zoom in' }).click();
    assert.ok((await first.boundingBox()).width > fitted);
    await reader.getByRole('button', { name: 'Fit width' }).click();
    assert.equal((await first.boundingBox()).width, fitted);

    const highlightButton = reader.getByRole('button', { name: 'Highlight', exact: true });
    await highlightButton.click();
    await reader.locator('#highlight[aria-pressed="true"]').waitFor();
    const line = await text.boundingBox();
    await page.mouse.move(line.x + 3, line.y + line.height / 2);
    await page.mouse.down();
    await page.mouse.move(line.x + line.width - 3, line.y + line.height / 2, { steps: 12 });
    await page.mouse.up();
    await reader.locator('.highlightEditor').first().waitFor();

    await reader.getByRole('button', { name: 'Text box', exact: true }).click();
    const box = await first.boundingBox();
    await page.mouse.click(box.x + 160, box.y + 185);
    const editor = reader.locator('.freeTextEditor [contenteditable=true]');
    await editor.fill('Example editable note');
    await editor.evaluate(node => node.blur());
    const note = reader.locator('.freeTextEditor').first();
    await note.dblclick();
    const revised = 'Edited note · یادداشت فارسی';
    await editor.fill(revised);
    await editor.evaluate(node => node.blur());
    await note.click();
    const originalPosition = await note.boundingBox();
    await page.mouse.move(originalPosition.x + 10, originalPosition.y + 10);
    await page.mouse.down();
    await page.mouse.move(originalPosition.x + 105, originalPosition.y + 55, { steps: 12 });
    await page.mouse.up();
    assert.ok((await note.boundingBox()).x > originalPosition.x + 50, 'the selected text box moves by dragging');
    assert.equal(await page.evaluate(() => RVApp.state.dirty), true);
    await page.getByRole('tab', { name: 'notes.md' }).click();
    assert.equal(await page.locator('#panes').getAttribute('data-mode'), 'write');
    assert.equal(await page.locator('#editor').inputValue(), 'Keep this document open.');
    await page.getByRole('tab', { name: /Review copy/ }).click();
    assert.equal(await display.count(), 1);
    assert.ok((await note.textContent()).includes(revised));
    await page.evaluate(() => { window.pdfCloseConfirmation = RVApp.confirmAllDirty(true); });
    await page.locator('#btnConfirmCancel').click();
    assert.equal(await page.evaluate(() => window.pdfCloseConfirmation), false);
    const saved = await page.evaluate(async () => await RVApp.save(false));
    assert.equal(saved, true);
    assert.equal(await page.evaluate(() => RVApp.state.dirty), false);
    await page.evaluate(async () => {
      await RVApp.openFileTab(new File([new Uint8Array(window.savedPdf)], 'Edited.pdf', { type: 'application/pdf' }));
    });
    const editedPdf = page.frameLocator('#pdfWorkspace .pdf-view:not([hidden]) iframe');
    const annotation = editedPdf.locator('.freeTextAnnotation');
    await annotation.waitFor();
    assert.ok((await annotation.textContent()).includes(revised));
    assert.ok((await annotation.boundingBox()).x > originalPosition.x + 50, 'the saved text box retains its moved position');
    await editedPdf.locator('.highlightAnnotation').first().waitFor();
  } finally {
    await page.close();
    await new Promise(resolve => server.close(resolve));
  }
}
(async function () {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => { errors.push(error.message); console.error('Browser error:', error.message); });
    await page.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href);
    await page.waitForFunction(() => window.RVApp && window.RVApp.state.ready);
    // Untrusted HTML must stay inside the reading pane, including app-like class names.
    await page.evaluate(() => {
      RVApp.setMode('preview');
      RVApp.setDoc('<div class="modal"><div class="modal-box">Document overlay</div></div>\n\n' +
        '<p style="position:fixed;inset:0;z-index:999999">Inline overlay</p>', 'untrusted.md');
    });
    assert.equal(await page.locator('#preview [style]').count(), 0);
    assert.equal(await page.locator('#btnOpen').evaluate(button => {
      const box = button.getBoundingClientRect();
      return button.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
    }), true, 'document classes cannot cover the application toolbar');
    const htmlSource = '<style>h1 { color: rgb(12, 67, 83); }</style><h1>Offline page</h1>' +
      '<script>document.body.textContent = "Script ran"</script><img src="https://preview.invalid/image.png">' +
      '<meta http-equiv="refresh" content="0;url=https://preview.invalid/redirect">';
    const outside = [];
    page.on('request', request => { if (request.url().includes('preview.invalid')) outside.push(request); });
    await page.evaluate(source => RVApp.setDoc(source, 'index.html'), htmlSource);
    const visualFrame = page.frameLocator('#preview iframe');
    assert.equal(await visualFrame.locator('h1').textContent(), 'Offline page');
    assert.equal(await visualFrame.locator('h1').evaluate(node => getComputedStyle(node).color), 'rgb(12, 67, 83)');
    assert.equal(await visualFrame.locator('script, meta[http-equiv=refresh]').count(), 0);
    assert.equal(await page.locator('#preview iframe').getAttribute('sandbox'), '');
    assert.equal(await page.locator('#preview iframe').evaluate(frame => frame.contentDocument), null);
    assert.ok(outside.every(request => request.failure()?.errorText === 'csp'), 'visual HTML never loads remote resources');
    await page.locator('#preview [data-file-view=code]').click();
    assert.match(await page.locator('#preview .code-surface').textContent(), /Script ran/);
    assert.equal(await page.locator('#editor').inputValue(), htmlSource);
    const htmlTab = await page.evaluate(() => RVApp.listTabs().find(tab => tab.active).id);
    await page.evaluate(() => RVApp.newTab('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 40"><circle cx="40" cy="20" r="18"/></svg>', 'mark.svg'));
    const svg = page.locator('#preview .visual-file-svg img');
    await svg.evaluate(image => image.decode());
    assert.ok(await svg.evaluate(image => image.naturalWidth > 0));
    assert.ok(await svg.evaluate(image => image.src.startsWith('blob:')));
    await page.getByRole('button', { name: 'Zoom mark.svg' }).click();
    const zoom = page.getByRole('dialog', { name: 'mark.svg' });
    const zoomed = zoom.locator('img');
    await zoomed.evaluate(image => image.decode());
    await page.waitForFunction(() => !!document.querySelector('.diagram-dialog img')?.style.width);
    const fitted = await zoomed.evaluate(image => {
      const frame = image.parentElement;
      if (frame.scrollWidth > frame.clientWidth || frame.scrollHeight > frame.clientHeight) return 0;
      return image.clientWidth;
    });
    assert.ok(fitted > 0, '100% SVG zoom fits the whole image');
    await zoom.getByRole('button', { name: 'Zoom in' }).click();
    assert.equal(await zoom.getByRole('button', { name: '125%' }).count(), 1);
    assert.ok(await zoomed.evaluate(image => image.clientWidth) > fitted);
    await page.keyboard.press('0');
    assert.equal(await zoomed.evaluate(image => image.clientWidth), fitted);
    await page.keyboard.press('Escape');
    assert.equal(await zoom.count(), 0);

    await page.evaluate(id => RVApp.switchTab(id), htmlTab);
    assert.equal(await page.locator('#preview [data-file-view=code]').getAttribute('aria-pressed'), 'true');
    await page.locator('#preview [data-file-view=preview]').click();
    assert.equal(await visualFrame.locator('h1').textContent(), 'Offline page');
    await page.locator('#preview [data-file-view=code]').click();
    await page.evaluate(() => RVApp.closeTab(RVApp.listTabs().find(tab => !tab.active).id));
    const sprite = '<symbol id="round" viewBox="0 0 32 32"><circle cx="16" cy="16" r="12" fill="red"/></symbol>' +
      '<symbol id="square" viewBox="0 0 24 24"><path fill="blue" d="M0 0h24v24H0z"/></symbol>';
    for (const [name, source] of [['icons.txt', sprite], ['icons.svg',
      '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="display:none"><defs>' + sprite + '</defs></svg>']]) {
      await page.evaluate(([source, name]) => RVApp.setDoc(source, name), [source, name]);
      const gallery = page.getByRole('list', { name: 'SVG symbols' });
      assert.deepEqual(await gallery.locator('bdi').allTextContents(), ['round', 'square']);
      const tileTops = await gallery.locator('li').evaluateAll(tiles => tiles.map(tile => tile.getBoundingClientRect().top));
      assert.equal(tileTops[0], tileTops[1], 'the desktop preview lays icons out in columns');
      const icons = await gallery.locator('img').evaluateAll(images => Promise.all(images.map(async image => {
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 32;
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0, 32, 32);
        return [image.src.split('#')[0], [...context.getImageData(16, 16, 1, 1).data]];
      })));
      assert.equal(icons[0][0], icons[1][0], 'the gallery shares one blob URL');
      assert.deepEqual(icons.map(icon => icon[1]), [[255, 0, 0, 255], [0, 0, 255, 255]]);
      await gallery.getByRole('button', { name: 'Zoom square' }).click();
      const symbolZoom = page.getByRole('dialog', { name: 'square' });
      assert.match(await symbolZoom.locator('img').getAttribute('src'), /#rv-symbol-/);
      await page.keyboard.press('Escape');

      await page.locator('#preview [data-file-view=code]').click();
      assert.equal(await page.locator('#editor').inputValue(), source);
      assert.equal(await gallery.count(), 0);
    }
    await page.evaluate(sprite => RVApp.setDoc('<svg xmlns="http://www.w3.org/2000/svg"><defs>' + sprite +
      '</defs><use href="#round"/></svg>', 'composition.svg'), sprite);
    assert.equal(await page.locator('#preview .visual-file-svg > img').count(), 1);

    await page.evaluate(() => RVApp.setDoc('# A\n\n# A\n\n# A-1', 'anchors.md'));
    assert.deepEqual(await page.locator('#preview h1').evaluateAll(nodes => nodes.map(node => node.id)),
      ['user-content-a', 'user-content-a-1', 'user-content-a-1-1']);
    await page.evaluate(() => RVApp.setDoc('```cmake\nproject(First)\n```\n\n```cmake\nproject(Second)\n```', 'code.md'));
    await page.waitForFunction(() => Array.from(document.querySelectorAll('#preview pre > code'))
      .every(code => code.querySelector('.hljs-keyword')));
    assert.equal(await page.locator('#preview pre > code').count(), 2);
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
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const dimensions = await page.evaluate(() => {
        const main = document.getElementById('panes').getBoundingClientRect();
        const comparison = document.getElementById('comparisonPane').getBoundingClientRect();
        return { main: [main.width, main.height], comparison: [comparison.width, comparison.height] };
      });
      assert.ok(dimensions.main.every(value => value > 80), 'main comparison view remains usable');
      assert.ok(dimensions.comparison.every(value => value > 80), 'secondary comparison view remains usable');
      assert.ok(await page.evaluate(() => {
        const select = document.getElementById('comparisonSelect');
        const rect = select.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return select.contains(hit) && rect.right <= innerWidth;
      }), 'secondary controls stay visible and clickable at ' + width);
      if (width === 390) {
        assert.ok(await page.locator('.topbar').evaluate(el => el.getBoundingClientRect().height < 150), 'mobile command bar stays compact');
      }
    }
    await page.evaluate(() => window.RVApp.hideComparison());
    await page.evaluate(() => { const select = document.getElementById('readingWidth'); select.value = 'full'; select.dispatchEvent(new Event('change')); });
    // Layout regressions need real browser geometry; DOM-only tests cannot detect collapsed grids.
    for (const width of [1440, 1024, 760, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
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
    const wideTable = '| Key | Value |\n| --- | --- |\n| A | ' + 'LongIdentifier'.repeat(10) + ' |';
    const rawTable = '<table><tr><th>Key</th><th>Value</th></tr><tr><td>A</td><td>B</td></tr></table>';
    await page.evaluate(source => {
      RVApp.setMode('preview');
      RVApp.setDoc(source, 'tables.md');
    }, wideTable + '\n\n' + rawTable);
    const roundedTable = await page.locator('#preview .table-wrap').evaluate(frame => {
      const css = getComputedStyle(frame);
      frame.scrollLeft = 100;
      return { radii: [css.borderTopLeftRadius, css.borderTopRightRadius, css.borderBottomLeftRadius, css.borderBottomRightRadius],
        scroll: frame.scrollLeft, fits: frame.offsetWidth <= frame.parentElement.clientWidth };
    });
    assert.deepEqual(roundedTable.radii, ['15px', '15px', '15px', '15px']);
    assert.ok(roundedTable.fits && roundedTable.scroll > 0, 'wide tables scroll inside the rounded frame');
    assert.equal(await page.locator('#preview table').last().evaluate(table => getComputedStyle(table).borderRadius), '15px');
    await page.evaluate(() => RVApp.setMode('split'));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
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
    // Flyouts must escape the parent menu scroll area and remain usable on narrow screens.
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      for (const panelId of ['themeMenu', 'toolbarMenu']) {
        await page.locator('#brandMark').click();
        await page.locator('.app-menu-categories [aria-controls="menuView"]').click();
        await page.locator('[data-submenu="' + panelId + '"]').click();
        assert.ok(await page.locator('#' + panelId).evaluate(panel => {
          const rect = panel.getBoundingClientRect();
          const control = panel.querySelector('button, input');
          const hit = control.getBoundingClientRect();
          return rect.left >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight &&
            control.contains(document.elementFromPoint(hit.x + hit.width / 2, hit.y + hit.height / 2));
        }), panelId + ' remains visible and clickable at ' + width);
        await page.keyboard.press('Escape');
        await page.keyboard.press('Escape');
      }
      assert.equal(await page.locator('#fileName').isVisible(), false);
      assert.equal(await page.locator('#statusEncoding').isVisible(), true);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    // Shared Markdown rules must keep their theme colors after CSS consolidation.
    await page.evaluate(() => window.RVApp.setDoc('[Link](guide.md) and note[^یادداشت] twice[^یادداشت].\n\n[^یادداشت]: Note', 'theme.md', null, {}));
    const colors = new Map();
    for (let i = 0; i < 3; i++) {
      await page.locator('#btnTheme').click();
      const result = await page.evaluate(() => {
        const probe = document.createElement('span');
        probe.style.color = getComputedStyle(document.documentElement).getPropertyValue('--document-link');
        document.body.appendChild(probe);
        const expected = getComputedStyle(probe).color; probe.remove();
        return { theme: document.documentElement.dataset.theme,
          color: getComputedStyle(document.querySelector('#preview p a')).color, expected };
      });
      assert.equal(result.color, result.expected, 'document links follow the selected appearance policy');
      colors.set(result.theme, result.color);
    }
    assert.notEqual(colors.get('light'), colors.get('dark'), 'link color adapts to theme');
    assert.equal(await page.locator('#preview p > a').getAttribute('target'), '_blank');
    const footnotesValid = await page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll('#preview [id]'));
      const ids = nodes.map(node => node.id);
      return new Set(ids).size === ids.length &&
        Array.from(document.querySelectorAll('#preview .footnote-ref a, #preview .footnote-back')).every(link =>
          document.getElementById(decodeURIComponent(link.getAttribute('href').slice(1))));
    });
    assert.equal(footnotesValid, true);
    const beforeAppearance = await page.evaluate(() => ({ theme: RVApp.state.theme, font: RVApp.state.font, source: RVApp.el.editor.value }));
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.locator('#brandMark').click();
      await page.locator('.app-menu-categories [aria-controls="menuView"]').click();
      await page.locator('#btnAppearance').click();
      await page.locator('#appearanceSurface').selectOption('warm');
      await page.locator('#accentHex').fill('#c93671');
      await page.locator('#appearanceDensity').selectOption('compact');
      await page.locator('#appearanceStandardLinks').check();
      assert.ok(await page.locator('#appearancePanel').evaluate(panel => panel.scrollWidth <= panel.clientWidth));
      assert.equal(await page.locator('#appearanceApply').isVisible(), true);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#appearancePanel').isVisible(), false);
      assert.deepEqual(await page.evaluate(() => ({ theme: RVApp.state.theme, font: RVApp.state.font, source: RVApp.el.editor.value })), beforeAppearance);
    }
    await page.evaluate(() => window.RVApp.setDoc('- [x] یادگیری PostgreSQL', 'persian.md', null, {}));
    await page.setViewportSize({ width: 390, height: 900 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.locator('#toolbar > #btnToc').isVisible(), true, 'Contents stays visible on narrow screens');
    await page.locator('#btnToc').click();
    await page.locator('#brandMark').click();
    await page.locator('.app-menu-categories [aria-controls="menuFile"]').click();
    assert.ok(await page.evaluate(() => { const button = document.querySelector('#menuFile [data-command="btnExport"]'); const rect = button.getBoundingClientRect(); return button.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)); }), 'mobile sidebar must never cover the toolbar');
    const downloading = page.waitForEvent('download');
    await page.locator('#menuFile [data-command="btnExport"]').click();
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
    await page.setViewportSize({ width: 1100, height: 720 });
    await page.evaluate(() => { RVApp.setMode('preview'); RVApp.setEditPreview(false); });
    await page.locator('#fileInput').setInputFiles({
      name: 'viewer.config', mimeType: 'text/plain',
      buffer: Buffer.from('{"appearance":{"theme":"dark"},"workspace":{"restoreTabs":true}}')
    });
    const branch = page.locator('#preview summary').filter({ hasText: 'workspace' });
    await branch.waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll('#preview summary')].some(node =>
      node.textContent.includes('workspace') && getComputedStyle(node).display === 'flex'));
    await branch.press('Enter');
    await page.locator('#preview .structured-key').filter({ hasText: 'restoreTabs' }).waitFor();
    await page.locator('#preview .structured-key').filter({ hasText: 'restoreTabs' }).click();
    assert.equal(await page.locator('#preview .structured-path output').textContent(), '$.workspace.restoreTabs');
    await page.locator('#structuredFind').click();
    await page.locator('#findInput').fill('theme');
    assert.equal(await page.locator('#preview mark.current').textContent(), 'theme');
    await page.keyboard.press('Escape');
    await page.locator('#fileInput').setInputFiles({
      name: 'settings.conf', mimeType: 'text/plain', buffer: Buffer.from('[Appearance]\nmode=dark\n')
    });
    await page.locator('#preview .structured-ini').waitFor();
    await page.evaluate(() => { window.showOpenFilePicker = undefined; });
    const choosingCode = page.waitForEvent('filechooser');
    await page.locator('#btnOpen').click();
    const codeChooser = await choosingCode;
    assert.equal(await codeChooser.element().getAttribute('accept'), null);
    await codeChooser.setFiles({
      name: 'viewer.py', mimeType: 'text/plain', buffer: Buffer.from('def open_file():\n    return "example"\n')
    });
    const codeFold = page.locator('#preview .code-fold');
    await codeFold.waitFor();
    await page.locator('#preview .code-indent-guide').click();
    assert.equal(await page.locator('#preview .is-active-line .code-number').getAttribute('data-line'), '2');
    await codeFold.locator('summary').press('Enter');
    assert.equal(await codeFold.evaluate(node => node.open), false);
    await page.locator('#structuredFind').click();
    await page.locator('#findInput').fill('return "example"');
    assert.equal(await page.locator('#findCount').textContent(), '1 / 1');
    assert.equal((await page.locator('#preview mark.current').allTextContents()).join(''), 'return "example"');
    await page.locator('#findInput').fill('example');
    assert.equal(await codeFold.evaluate(node => node.open), true);
    await page.keyboard.press('Escape');
    await page.evaluate(() => RVApp.setEditPreview(true));
    const codeEditor = page.locator('#preview .code-editor');
    await page.locator('.code-edit-colored .hljs-keyword').first().waitFor();
    await codeEditor.evaluate(input => input.setSelectionRange(input.value.indexOf('example'), input.value.indexOf('example') + 7));
    await page.keyboard.insertText('edited');
    await page.locator('.code-edit-colored .hljs-string').filter({ hasText: 'edited' }).waitFor();
    assert.equal(await codeEditor.evaluate(input => input.parentElement.style.getPropertyValue('--code-active-line')), '1');
    assert.equal(await page.locator('#editor').inputValue(), 'def open_file():\n    return "edited"\n');
    await page.waitForTimeout(130);
    assert.equal(await codeEditor.evaluate(input => document.activeElement === input), true);
    await page.keyboard.press('Control+z');
    assert.match(await codeEditor.inputValue(), /example/);
    await page.keyboard.press('Control+Shift+z');
    assert.match(await codeEditor.inputValue(), /edited/);
    assert.equal(await page.locator('#previewEditDialog').isVisible(), false);
    await page.locator('#brandMark').click();
    await page.locator('.app-menu-categories [aria-controls="menuView"]').click();
    assert.equal(await page.locator('#menuView [data-command="btnPreviewFormat"]').count(), 0);
    await page.locator('.app-menu-categories [aria-controls="menuFile"]').click();
    await page.locator('[data-submenu="fileSettingsMenu"]').click();
    await page.locator('#fileSettingsMenu [data-command="btnPreviewFormat"]').click();
    const formatSearch = page.locator('#previewFormatSearch');
    assert.equal(await formatSearch.isVisible(), true);
    await page.keyboard.press('Escape');
    await page.locator('#btnPreviewFormat').click();
    const formatTrigger = await page.locator('#btnPreviewFormat').boundingBox();
    const formatPanel = await page.locator('#previewFormatPanel').boundingBox();
    assert.ok(formatPanel.y >= formatTrigger.y + formatTrigger.height && formatPanel.y - formatTrigger.y < 70);
    await formatSearch.fill('golang');
    assert.equal(await page.locator('#previewFormat').inputValue(), 'code:go');
    await page.locator('#previewFormatApply').click();
    assert.equal(await page.locator('#preview .structured-format').textContent(), 'Go');
    await page.keyboard.press('Control+Shift+L');
    await formatSearch.fill('no-such-language');
    assert.equal(await page.locator('#previewFormatApply').isDisabled(), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#previewFormatPanel').isVisible(), false);
    await page.locator('#btnNewTab').click();
    await page.locator('#btnPreviewFormat').click();
    await formatSearch.fill('.cpp');
    assert.equal(await page.locator('#previewFormat').inputValue(), 'code:cpp');
    await page.locator('#previewFormatApply').click();
    await codeEditor.fill('int main() {\n  return 0;\n}\n');
    await page.evaluate(() => { window.showSaveFilePicker = undefined; });
    const codeDownloading = page.waitForEvent('download');
    await page.keyboard.press('Control+s');
    const codeDownload = await codeDownloading;
    assert.equal(codeDownload.suggestedFilename(), 'Untitled.cpp');
    assert.equal(await fs.readFile(await codeDownload.path(), 'utf8'), 'int main() {\n  return 0;\n}\n');
    await codeEditor.fill('x'.repeat(17000));
    assert.equal(await page.locator('.code-edit-colored').count(), 0);
    assert.equal((await codeEditor.inputValue()).length, 17000);
    await page.evaluate(() => RVApp.setEditPreview(false));
    await page.locator('#fileInput').setInputFiles({
      name: 'main.dart', mimeType: 'text/plain', buffer: Buffer.from('void main() {\n  print("Dart");\n}\n')
    });
    await page.locator('#preview .code-fold .hljs-string').waitFor();
    assert.equal(await page.locator('#preview .structured-format').textContent(), 'Dart');
    const desktop = await browser.newPage();
    await desktop.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href + '?desktop');
    await desktop.locator('#titlebarTabs [role="tablist"]').waitFor();
    for (const width of [1200, 900, 390]) {
      await desktop.setViewportSize({ width, height: 720 });
      await desktop.locator(width === 900 ? '.menu-line > #workspaceActions' : '#workspaceBar > #workspaceActions').waitFor();
      assert.equal(await desktop.locator('#titlebarTabs #documentTabs').isVisible(), true);
      assert.ok(await desktop.locator('.topbar').evaluate(header =>
        header.clientHeight < 115 && document.documentElement.scrollWidth <= innerWidth), 'desktop header remains two rows');
    }
    await checkPdfTabs(browser);
    assert.deepEqual(errors, []);
    console.log('Chromium smoke test passed: offline open, Persian/CRLF, task editing, responsive layout, HTML export, structured and PDF previews.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
