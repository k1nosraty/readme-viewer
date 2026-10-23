'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const harness = require('./helpers/dom');

async function load(t, storage = new Map(), failWrites = false) {
  const loaded = await harness.loadApp({ beforeParse(window) {
    window.TextDecoder = TextDecoder;
    Object.defineProperty(window, 'localStorage', { value: {
      getItem: key => storage.get(key) || null,
      setItem: (key, value) => { if (failWrites) throw new Error('quota'); storage.set(key, value); },
      removeItem: key => storage.delete(key)
    } });
  } });
  t.after(() => loaded.window.close());
  return { ...loaded, api: loaded.window.RVApp, storage };
}

test('bookmarks and nested section folding leave source and task positions untouched', async t => {
  const { api, document, window, errors, storage } = await load(t);
  const source = '# Guide\n\nIntro\n\n## Install\n\n- [x] done\n- [ ] next\n\n### Details\n\nHidden\n\n## Run\n\nVisible';
  api.setDoc(source, 'guide.md', { path: '/repo/guide.md' });
  const install = document.getElementById('user-content-install');
  install.querySelector('.section-bookmark').click();
  assert.equal(document.querySelector('#bookmarkList button').textContent, 'Install');
  install.querySelector('.section-fold').click();
  assert.equal(install.querySelector('.section-fold').getAttribute('aria-expanded'), 'false');
  assert.ok(document.getElementById('user-content-details').classList.contains('section-folded'));
  assert.equal(document.getElementById('user-content-run').classList.contains('section-folded'), false);
  assert.equal(api.el.editor.value, source);
  assert.equal(api.state.dirty, false);
  api.render();
  assert.equal(document.getElementById('user-content-install').querySelector('.section-bookmark').getAttribute('aria-pressed'), 'true');
  const before = storage.get('rv.reading');
  api.newTab('# Different', 'other.md', { path: '/other/guide.md' });
  assert.equal(document.getElementById('bookmarkSection').hidden, true);
  assert.ok(before.includes('user-content-install'));
  assert.deepEqual(errors, []);
});

test('reading preferences and task filtering never change the Markdown', async t => {
  const { api, document, window } = await load(t);
  const source = '- [x] Done\n- [ ] Pending';
  api.setDoc(source, 'tasks.md');
  document.getElementById('hideCompleted').click();
  assert.ok(api.el.preview.classList.contains('hide-completed'));
  for (const [id, value] of [['readingWidth', 'comfortable'], ['readingSpacing', 'relaxed']]) {
    document.getElementById(id).value = value;
    document.getElementById(id).dispatchEvent(new window.Event('change', { bubbles: true }));
  }
  assert.equal(document.documentElement.getAttribute('data-reading-width'), 'comfortable');
  assert.equal(document.documentElement.getAttribute('data-reading-spacing'), 'relaxed');
  assert.equal(api.el.editor.value, source);
  assert.equal(api.state.dirty, false);
});

test('reading positions resume by full native document path', async t => {
  const storage = new Map([['rv.reading', JSON.stringify({ 'path:/docs/a.md': { top: 275 } })]]);
  const { api, window } = await load(t, storage);
  api.setDoc('# One\n\nText', 'a.md', { path: '/docs/a.md' });
  await harness.settle(40);
  assert.equal(api.el.previewScroll.scrollTop, 275);
  api.el.previewScroll.scrollTop = 390;
  api.el.previewScroll.dispatchEvent(new window.Event('scroll'));
  await harness.settle(210);
  assert.equal(JSON.parse(storage.get('rv.reading'))['path:/docs/a.md'].top, 390);
});

test('sessions are opt-in, restore detached dirty copies, and can be cleared without closing files', async t => {
  const storage = new Map();
  const first = await load(t, storage);
  first.api.setDoc('First', 'first.md', { path: '/first.md' });
  first.api.newTab('Second', 'second.md', { path: '/second.md' }, { bom: true, eol: '\r\n' });
  first.window.RV.Reading.saveSession();
  assert.equal(storage.has('rv.workspace.session'), false);
  first.document.getElementById('restoreSession').click();
  const session = JSON.parse(storage.get('rv.workspace.session'));
  assert.equal(session.documents.length, 2);
  assert.doesNotMatch(storage.get('rv.workspace.session'), /\/first\.md/);
  const restored = await load(t, storage);
  const docs = restored.api.listTabs().filter(tab => tab.hasDocument);
  assert.deepEqual(Array.from(docs, tab => tab.name), ['first.md', 'second.md']);
  assert.ok(docs.every(tab => tab.dirty && tab.needsSave && tab.handle === null));
  assert.equal(restored.api.state.name, 'second.md');
  assert.equal(restored.api.state.bom, true);
  assert.equal(restored.api.state.eol, '\r\n');
  restored.document.getElementById('clearSession').click();
  assert.equal(storage.has('rv.workspace.session'), false);
  assert.equal(restored.api.listTabs().filter(tab => tab.hasDocument).length, 2);
});

test('unavailable draft storage reports the failure and preserves open edits', async t => {
  const { api, document } = await load(t, new Map(), true);
  api.setDoc('Important', 'draft.md');
  document.getElementById('restoreSession').click();
  assert.equal(document.getElementById('restoreSession').checked, false);
  assert.equal(api.el.editor.value, 'Important');
  assert.match(document.getElementById('toasts').textContent, /Session could not be saved/);
});

test('native reading metadata survives detached session restoration', async t => {
  const storage = new Map();
  const original = await load(t, storage);
  original.api.setDoc('# Native\n\nContent', 'native.md', { path: '/docs/native.md' });
  await harness.settle(40);
  original.document.querySelector('.section-bookmark').click();
  original.api.el.previewScroll.scrollTop = 240;
  original.api.el.previewScroll.dispatchEvent(new original.window.Event('scroll'));
  original.document.getElementById('restoreSession').click();
  const restored = await load(t, storage);
  await harness.settle(40);
  assert.equal(restored.document.querySelector('#bookmarkList button').textContent, 'Native');
  assert.equal(restored.api.el.previewScroll.scrollTop, 240);
  assert.equal(restored.api.state.handle, null);
  assert.equal(restored.api.state.needsSave, true);
});

test('search reveals folded content and completed tasks without changing source', async t => {
  const { api, document, window } = await load(t);
  const source = '# Guide\n\n## Install\n\n- [x] Unique result\n\n## End';
  api.setDoc(source, 'find.md');
  document.getElementById('user-content-install').querySelector('.section-fold').click();
  document.getElementById('hideCompleted').click();
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'F', ctrlKey: true, shiftKey: true, bubbles: true }));
  api.el.findInput.value = 'Unique';
  api.el.findInput.dispatchEvent(new window.Event('input', { bubbles: true }));
  const hit = document.querySelector('mark.rv-find.current');
  assert.ok(hit);
  assert.equal(hit.closest('.section-folded'), null);
  assert.ok(hit.closest('.task-list-item').classList.contains('find-visible'));
  document.getElementById('findClose').click();
  assert.equal(document.querySelector('.find-visible'), null);
  assert.equal(api.el.editor.value, source);
});
