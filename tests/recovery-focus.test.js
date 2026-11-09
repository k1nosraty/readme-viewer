'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const harness = require('./helpers/dom');

async function load(t, storage = new Map()) {
  const loaded = await harness.loadApp({ beforeParse(window) {
    Object.defineProperty(window, 'localStorage', { value: {
      getItem: key => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key)
    } });
  } });
  t.after(() => loaded.window.close());
  return { ...loaded, api: loaded.window.RVApp, storage };
}

test('reading focus restores layout and preferences, and navigation can leave it safely', async t => {
  const { api, window, document, storage } = await load(t);
  api.setDoc('# First\n\nText', 'one.md');
  api.newTab('# Second', 'two.md'); api.showComparison(); api.setMode('split');
  const source = api.el.editor.value;
  const key = value => document.dispatchEvent(new window.KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }));
  document.getElementById('brandMark').click();
  document.querySelector('.app-menu-categories [aria-controls="menuView"]').focus();
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'F8', isComposing: true, bubbles: true }));
  assert.equal(api.state.readingFocus, false, 'IME conversion keys keep their native behavior');
  key('F8');
  assert.equal(api.state.readingFocus, true); assert.equal(api.state.mode, 'preview');
  assert.equal(document.activeElement, api.el.previewScroll);
  document.getElementById('btnFontUp').click();
  assert.equal(JSON.parse(storage.get('rv.settings')).mode, 'split', 'temporary Preview must not overwrite the saved layout');
  key('Escape'); assert.equal(api.state.mode, 'split'); assert.equal(api.state.readingFocus, false);
  assert.equal(document.activeElement, document.getElementById('brandMark'));
  assert.equal(document.getElementById('comparisonPane').hidden, false);
  api.setReadingFocus(true); api.setMode('write');
  assert.equal(api.state.readingFocus, false); assert.equal(api.state.mode, 'write');
  api.setReadingFocus(true); api.setEmpty();
  assert.equal(api.state.readingFocus, false, 'an empty workspace exposes its Open controls');
  assert.equal(source, '# Second');
});

test('failed fallback storage retains the previous recovery copy and can retry', async t => {
  const { api, window, document, storage } = await load(t);
  api.setDoc('Last safe draft', 'draft.md');
  document.getElementById('restoreSession').click(); await window.RV.Reading.saveSession();
  const previous = storage.get('rv.workspace.session');
  api.el.editor.value = 'x'.repeat(2100000);
  assert.equal(await window.RV.Reading.saveSession(), false);
  assert.equal(storage.get('rv.workspace.session'), previous);
  assert.equal(document.getElementById('restoreSession').checked, true);
  assert.equal(api.el.editor.value.length, 2100000);
  api.el.editor.value = 'A newer safe draft';
  assert.equal(await window.RV.Reading.saveSession(), true);
  assert.equal(JSON.parse(storage.get('rv.workspace.session')).documents[0].source, 'A newer safe draft');
});

test('recovery saves during continuous edits and does not duplicate the saved source', async t => {
  const { api, window, document, storage } = await load(t);
  api.setDoc('Original', 'draft.md'); document.getElementById('restoreSession').click();
  await window.RV.Reading.saveSession();
  for (let i = 0; i < 12; i++) {
    api.el.editor.value = 'Typing ' + i;
    window.RV.Reading.workspaceChanged(); await harness.settle(100);
  }
  const saved = JSON.parse(storage.get('rv.workspace.session'));
  assert.match(saved.documents[0].source, /Typing/);
  assert.equal(Object.hasOwn(saved.documents[0], 'saved'), false);
});

test('clearing recovery during a pending write cannot recreate the stored session', async t => {
  const { api, window, document } = await load(t);
  let release, value = null;
  window.RV.Drafts = { available: () => true,
    write: snapshot => { value = snapshot; return new Promise(resolve => { release = resolve; }); },
    clear: async () => { value = null; }
  };
  api.setDoc('Private draft', 'private.md'); document.getElementById('restoreSession').click();
  assert.ok(release);
  assert.equal(await window.RV.Reading.clearSession(), true);
  release(); await window.RV.Reading.saveSession(); await harness.settle(20);
  assert.equal(value, null); assert.equal(document.getElementById('restoreSession').checked, false);
  assert.equal(api.el.editor.value, 'Private draft');
});

test('pending saves coalesce to the newest text and unchanged text still saves bookmark updates', async t => {
  const { api, window, document } = await load(t);
  let release; const writes = [];
  window.RV.Drafts = { available: () => true, write: value => {
    writes.push(JSON.parse(JSON.stringify(value)));
    return writes.length === 1 ? new Promise(resolve => { release = resolve; }) : Promise.resolve();
  } };
  api.setDoc('# Original', 'draft.md'); document.getElementById('restoreSession').click();
  api.el.editor.value = '# Intermediate'; const pending = window.RV.Reading.saveSession();
  api.el.editor.value = '# Latest'; window.RV.Reading.saveSession();
  release(); await pending;
  assert.equal(writes.length, 2); assert.equal(writes[1].documents[0].source, '# Latest');
  api.render(); document.querySelector('.section-bookmark').click();
  await window.RV.Reading.saveSession();
  assert.equal(writes.length, 3);
  assert.deepEqual(writes[2].documents[0].reading.bookmarks, ['user-content-latest']);
});

test('a failed initial recovery read cannot overwrite unreadable drafts with an empty session', async t => {
  const previous = JSON.stringify({ active: 0, documents: [{ name: 'draft.md', source: 'Last readable legacy copy' }] });
  const storage = new Map([['rv.reading.options', '{"session":true}'], ['rv.workspace.session', previous]]);
  let writes = 0;
  const { window, document } = await harness.loadApp({ beforeParse(window) {
    Object.defineProperty(window, 'localStorage', { value: {
      getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key)
    } });
    window.document.addEventListener('DOMContentLoaded', () => {
      window.RV.Drafts = { available: () => true, read: async () => { throw new Error('unreadable'); }, write: async () => { writes++; } };
    }, { once: true });
  } });
  t.after(() => window.close());
  assert.equal(window.RVApp.el.editor.value, 'Last readable legacy copy');
  assert.equal(await window.RV.Reading.saveSession(), false);
  assert.equal(writes, 0); assert.equal(storage.get('rv.workspace.session'), previous);
  assert.match(document.getElementById('sessionStatus').textContent, /left untouched/);
});

test('clearing and reenabling recovery during startup cannot restore a stale read', async t => {
  const storage = new Map([['rv.reading.options', '{"session":true}']]);
  let stored;
  const { window } = await harness.loadApp({ beforeParse(window) {
    Object.defineProperty(window, 'localStorage', { value: {
      getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key)
    } });
    window.document.addEventListener('DOMContentLoaded', () => {
      window.RV.Drafts = { available: () => true, clear: async () => {}, write: async value => { stored = value; },
        read: () => new Promise(resolve => window.setTimeout(async () => {
          await window.RV.Reading.clearSession();
          window.document.getElementById('restoreSession').click();
          resolve({ active: 0, documents: [{ name: 'deleted.md', source: 'Cleared private text' }] });
        }, 0))
      };
    }, { once: true });
  } });
  t.after(() => window.close());
  assert.equal(window.RVApp.state.hasDocument, false);
  await window.RV.Reading.saveSession();
  assert.equal(stored.documents.length, 0);
});
