'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined });
  try {
    const page = await browser.newPage();
    const errors = [], requests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => requests.push(request.url()));
    await page.route('https://**/*', route => route.abort());
    await page.route('http://**/*', route => route.abort());
    await page.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href);
    await page.waitForFunction(() => window.RVApp && window.RVApp.state.ready);
    assert.equal(await page.evaluate(() => typeof window.mermaid), 'undefined');
    const source = ['# System', '', '```mermaid', 'flowchart TD', ' T["Telegram bot"] --> W["Cloudflare Worker · Hono"]', ' A["Mini App · Preact"] --> W', ' C["Cron trigger"] --> W', ' W --> L["Shared accounting and access rules"]', ' L --> D["D1 · ledger and encrypted cards"]', '```', '', '```mermaid', 'sequenceDiagram', ' participant U as کاربر', ' participant S as Server', ' U->>S: سلام', ' S-->>U: OK', '```'].join('\n');
    await page.evaluate(text => { window.RVApp.setDoc(text, 'system.md'); window.RVApp.setMode('preview'); }, source);
    await page.waitForFunction(() => document.querySelectorAll('#preview .diagram-figure img').length === 2);
    await page.waitForFunction(() => Array.from(document.querySelectorAll('#preview .diagram-figure img')).every(img => img.complete && img.naturalWidth > 0));
    assert.equal(requests.filter(url => url.endsWith('/vendor/mermaid/mermaid.tiny.js')).length, 1);
    assert.ok(!requests.some(url => /^https?:/.test(url)), 'diagrams render offline, without font or CDN requests');
    assert.equal(await page.locator('#editor').inputValue(), source);
    const firstUrl = await page.locator('#preview .diagram-figure img').first().getAttribute('src');
    const firstSvg = decodeURIComponent(firstUrl.slice(firstUrl.indexOf(',') + 1));
    assert.match(firstSvg.replace(/<[^>]+>/g, ''), /Telegram bot/);
    assert.match(firstSvg.replace(/<[^>]+>/g, '').replace(/\s/g, ''), /ledgerandencryptedcards/);
    await page.locator('#preview .diagram-tools button').first().click();
    assert.equal(await page.locator('#preview pre').first().isVisible(), true);
    const expand = page.locator('#preview .diagram-tools').first().getByRole('button', { name: 'Expand', exact: true });
    await expand.click();
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    assert.equal(await page.locator('.diagram-canvas img').evaluate(img => img.style.width), '125%');
    await page.keyboard.press('Escape');
    await page.waitForSelector('.diagram-dialog', { state: 'detached' });
    assert.equal(await expand.evaluate(node => node === document.activeElement), true);
    await page.evaluate(() => { window.RVApp.newTab('```mermaid\nflowchart LR\nX-->Y\n```', 'second.md'); window.RVApp.showComparison(); });
    await page.waitForFunction(() => document.querySelector('#comparisonPreview .diagram-figure img'));
    await page.locator('#btnTheme').click();
    await page.locator('#btnTheme').click();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    await page.evaluate(async () => { await window.RV.Diagrams.render(document.getElementById('preview')); await window.RV.Diagrams.render(document.getElementById('comparisonPreview')); });
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      for (const mode of ['preview', 'split']) {
        await page.evaluate(async value => { window.RVApp.setMode(value); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); await window.RV.Diagrams.render(document.getElementById('preview')); }, mode);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${mode} remains within viewport ${width}`);
        const images = await page.locator('.diagram-figure img').evaluateAll(nodes => nodes.map(node => ({ width: node.getBoundingClientRect().width, parent: node.parentElement.clientWidth })));
        assert.ok(images.every(img => img.width > 0 && img.width <= img.parent + 1), JSON.stringify({width, mode, images}));
      }
    }
    await page.setViewportSize({ width: 1200, height: 900 });
    const saved = page.waitForEvent('download');
    await page.locator('#preview .diagram-tools button').filter({ hasText: 'Save SVG' }).first().click();
    const file = await saved;
    assert.match(file.suggestedFilename(), /diagram\.svg/);
    const svg = await fs.readFile(await file.path(), 'utf8');
    assert.match(svg, /<svg/); assert.doesNotMatch(svg, /<script|foreignObject/);
    // Export while the first diagram render is still pending, then check the self-contained result.
    await page.evaluate(text => window.RVApp.setDoc(text, 'export.md'), source + '\nNew export.');
    const exported = page.waitForEvent('download'); await page.locator('#btnExport').click();
    const htmlFile = await exported, html = await fs.readFile(await htmlFile.path(), 'utf8');
    assert.match(html, /data:image\/svg\+xml/); assert.doesNotMatch(html, /class="diagram-tools"|<script/);
    const temp = await fs.mkdtemp(path.join(require('node:os').tmpdir(), 'readme-diagram-export-'));
    const exportPath = path.join(temp, 'document.html'); await fs.writeFile(exportPath, html);
    const standalone = await browser.newPage(); await standalone.goto(pathToFileURL(exportPath).href);
    await standalone.waitForFunction(() => Array.from(document.querySelectorAll('.diagram-figure img')).length === 2 && Array.from(document.querySelectorAll('.diagram-figure img')).every(img => img.complete && img.naturalWidth > 0));
    await standalone.close(); await fs.rm(temp, { recursive: true, force: true });
    await page.evaluate(() => window.RVApp.setDoc('```mermaid\nthis is invalid\n```', 'bad.md'));
    await page.waitForSelector('#preview .diagram-message');
    assert.equal(await page.locator('#preview pre').isVisible(), true);
    assert.equal(await page.evaluate(() => window.RVApp.state.dirty), false);
    assert.deepEqual(errors, []);
    console.log('Mermaid browser smoke passed: offline flowchart + Persian sequence, both panes, themes, mobile, zoom, SVG and standalone export, invalid source.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
