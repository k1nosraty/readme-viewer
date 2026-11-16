'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined });
  try {
    const context = await browser.newContext();
    const url = pathToFileURL(path.resolve(__dirname, '../index.html')).href;
    let page = await context.newPage();
    await page.goto(url); await page.waitForFunction(() => window.RVApp && RVApp.state.ready);
    assert.equal(await page.evaluate(async () => await RV.Drafts.read() === undefined), true);
    // Migrate an existing opt-in session without copying document paths or writable handles.
    await page.evaluate(() => {
      localStorage.setItem('rv.reading.options', JSON.stringify({ session: true }));
      localStorage.setItem('rv.workspace.session', JSON.stringify({ active: 0, documents: [{ name: 'legacy.md', source: '# Legacy' }] }));
    });
    await page.reload(); await page.waitForFunction(() => RVApp.state.ready);
    assert.equal(await page.locator('#editor').inputValue(), '# Legacy');
    await page.evaluate(() => RV.Reading.saveSession());
    assert.equal(await page.evaluate(() => localStorage.getItem('rv.workspace.session')), null);
    const length = 3000000;
    await page.evaluate(async length => {
      RVApp.setDoc('# Large draft', 'large.md', null, { bom: true, eol: '\r\n' });
      RVApp.el.editor.value = 'x'.repeat(length);
      await RV.Reading.saveSession();
    }, length);
    assert.equal(await page.evaluate(async () => (await RV.Drafts.read()).documents[0].source.length), length);
    const renameField = page.getByRole('textbox', { name: 'Tab name', exact: true });
    await page.getByRole('button', { name: 'Rename tab: large.md', exact: true }).click();
    await renameField.fill('Working notes');
    await renameField.press('Enter');
    await page.evaluate(() => RV.Reading.saveSession());
    assert.equal(await page.evaluate(async () => (await RV.Drafts.read()).documents[0].customTitle), 'Working notes');
    await page.locator('#btnNewTab').click();
    await page.getByRole('button', { name: 'Rename tab: Untitled', exact: true }).click();
    await renameField.fill('Next topic');
    await renameField.press('Enter');
    await page.getByRole('tab', { name: 'Working notes', exact: true }).click();
    await page.evaluate(() => RV.Reading.saveSession());
    // Force a real IndexedDB transaction to abort: the last committed draft must survive.
    assert.equal(await page.evaluate(async () => {
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...args) { const request = put.apply(this, args); this.transaction.abort(); return request; };
      RVApp.el.editor.value = 'unsaved after aborted transaction';
      try { return await RV.Reading.saveSession(); } finally { IDBObjectStore.prototype.put = put; }
    }), false);
    assert.equal(await page.evaluate(async () => (await RV.Drafts.read()).documents[0].source.length), length);
    // Renderer termination skips pagehide; recovery must use the committed transaction alone.
    const session = await context.newCDPSession(page), crashed = page.waitForEvent('crash');
    void session.send('Page.crash').catch(() => {}); await crashed;
    await page.close(); page = await context.newPage();
    await page.goto(url); await page.waitForFunction(() => RVApp.state.ready);
    assert.equal(await page.locator('#editor').evaluate(node => node.value.length), length);
    assert.equal(await page.evaluate(() => RVApp.state.dirty && RVApp.state.needsSave && RVApp.state.handle === null && RVApp.state.bom && RVApp.state.eol === '\r\n'), true);
    assert.deepEqual(await page.getByRole('tab').allTextContents(), ['• Working notes', 'Next topic']);
    assert.equal(await page.evaluate(() => RVApp.listTabs()[1].hasDocument), false);
    // Clearing while the previous write promise is still pending must not resurrect private text.
    assert.equal(await page.evaluate(async () => {
      const original = RV.Drafts.write; let release;
      RV.Drafts.write = async snapshot => { await original(snapshot); await new Promise(resolve => { release = resolve; }); };
      RVApp.el.editor.value = 'private text'; const writing = RV.Reading.saveSession();
      while (!release) await new Promise(resolve => setTimeout(resolve, 10));
      await RV.Reading.clearSession(); release(); await writing; RV.Drafts.write = original;
      return (await RV.Drafts.read()) === undefined && !document.getElementById('restoreSession').checked;
    }), true);
    console.log('Recovery smoke passed: migration, tab names, 3-million-character draft, aborted transaction, renderer crash, detached restore and clear during save.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
