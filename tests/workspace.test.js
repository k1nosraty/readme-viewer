'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const harness = require('./helpers/dom');

async function workspace(t) {
  if (!harness.hasDom) { t.skip('jsdom unavailable'); return; }
  const app = await harness.loadApp({ beforeParse(window) { window.TextDecoder = TextDecoder; } });
  t.after(() => app.window.close());
  return { ...app, api: app.window.RVApp };
}
function edit(app, text) {
  app.api.el.editor.value = text;
  app.api.el.editor.dispatchEvent(new app.window.Event('input', { bubbles: true }));
}

test('workspace preserves independent dirty source, metadata, selection, find and scroll', async t => {
  const app = await workspace(t); if (!app) return;
  const { api } = app;
  api.setDoc('first', 'one.md', { name: 'one.md', baseUrl: '/one/' }, { bom: true, eol: '\r\n' });
  edit(app, 'first edited');
  api.el.editor.setSelectionRange(2, 5);
  api.el.editor.scrollTop = 21;
  api.el.findInput.value = 'edited'; api.el.findBar.hidden = false;
  const first = api.listTabs()[0].id;
  const second = api.newTab('second', 'two.md');
  edit(app, 'second edited');
  assert.equal(api.switchTab(first), true);
  assert.equal(api.el.editor.value, 'first edited');
  assert.equal(api.state.dirty, true);
  assert.equal(api.state.bom, true);
  assert.equal(api.state.eol, '\r\n');
  assert.equal(api.state.baseUrl, '/one/');
  assert.equal(api.el.editor.selectionStart, 2);
  assert.equal(api.el.editor.scrollTop, 21);
  assert.equal(api.el.findInput.value, 'edited');
  assert.equal(api.el.findBar.hidden, false);
  api.switchTab(second);
  assert.equal(api.el.editor.value, 'second edited');
  assert.equal(api.state.bom, false);
  assert.equal(api.el.findInput.value, '');
});

test('closing a dirty tab supports cancel and discard without changing other documents', async t => {
  const app = await workspace(t); if (!app) return;
  const { api } = app;
  api.setDoc('one', 'one.md'); edit(app, 'dirty');
  const first = api.listTabs()[0].id;
  const second = api.newTab('two', 'two.md');
  const closing = api.closeTab(first);
  api.el.btnConfirmCancel.click();
  assert.equal(await closing, false);
  assert.equal(api.listTabs().length, 2);
  assert.equal(api.listTabs().find(x => x.active).id, second);
  const discarding = api.closeTab(first);
  api.el.btnConfirmDiscard.click();
  assert.equal(await discarding, true);
  assert.equal(api.listTabs().length, 1);
  assert.equal(api.el.editor.value, 'two');
});

test('pending saves block switching and preserve edits made while writing', async t => {
  const app = await workspace(t); if (!app) return;
  const { api } = app;
  let release;
  let written;
  const handle = { name: 'one.md', createWritable: async () => ({
    write: value => { written = value; return new Promise(resolve => { release = resolve; }); },
    close: async () => {}
  }) };
  api.setDoc('one', 'one.md', handle);
  const first = api.listTabs()[0].id;
  const second = api.newTab('two', 'two.md');
  api.switchTab(first); edit(app, 'snapshot');
  const saving = api.save();
  await Promise.resolve(); await Promise.resolve();
  assert.ok(written);
  assert.equal(api.switchTab(second), false);
  assert.equal(api.newTab(), false);
  edit(app, 'newer edit'); release();
  assert.equal(await saving, true);
  assert.equal(api.state.saved, 'snapshot');
  assert.equal(api.state.dirty, true);
  api.switchTab(second);
  assert.equal(api.el.editor.value, 'two');
});

test('application close checks hidden dirty tabs and cancels safely', async t => {
  const app = await workspace(t); if (!app) return;
  const { api } = app;
  api.setDoc('one', 'one.md'); edit(app, 'dirty one');
  api.newTab('two', 'two.md'); edit(app, 'dirty two');
  const original = api.listTabs().find(x => x.active).id;
  const closing = api.confirmAllDirty();
  api.el.btnConfirmDiscard.click();
  await harness.settle(10);
  assert.equal(api.state.name, 'two.md');
  api.el.btnConfirmCancel.click();
  assert.equal(await closing, false);
  assert.equal(api.listTabs().find(x => x.active).id, original);
  assert.equal(api.listTabs().filter(x => x.dirty).length, 2);
});

test('opening a native path already in a tab focuses it and keeps unsaved text', async t => {
  const app = await workspace(t); if (!app) return;
  const { api } = app;
  const handle = { path: '/one.md', name: 'one.md', getFile: () => { throw new Error('must not reread'); } };
  api.setDoc('one', 'one.md', handle); edit(app, 'dirty');
  const first = api.listTabs()[0].id;
  api.newTab('two', 'two.md');
  assert.equal(await api.openHandleTab(handle), true);
  assert.equal(api.listTabs().find(x => x.active).id, first);
  assert.equal(api.el.editor.value, 'dirty');
});

test('Open preserves dirty tab and picker cancellation leaves no empty tab', async t => {
  const app = await workspace(t); if (!app) return;
  const { api, window } = app;
  api.setDoc('original', 'original.md'); edit(app, 'unsaved original');
  const first = api.listTabs()[0].id;
  window.showOpenFilePicker = async () => [];
  api.el.btnOpen.click(); await harness.settle(10);
  assert.equal(api.listTabs().length, 1);
  assert.equal(api.el.confirmModal.hidden, true);
  const bytes = new TextEncoder().encode('new document');
  window.showOpenFilePicker = async () => [{ name: 'new.md', getFile: async () => ({
    name: 'new.md', arrayBuffer: async () => bytes.buffer
  }) }];
  api.el.btnOpen.click(); await harness.settle(20);
  assert.equal(api.listTabs().length, 2);
  assert.equal(api.state.name, 'new.md');
  assert.equal(api.el.editor.value, 'new document');
  api.switchTab(first);
  assert.equal(api.el.editor.value, 'unsaved original');
  assert.equal(api.state.dirty, true);
});

test('browser unload warns for dirty documents in inactive tabs', async t => {
  const app = await workspace(t); if (!app) return;
  const { api, window } = app;
  api.setDoc('one', 'one.md'); edit(app, 'dirty'); api.newTab('clean', 'two.md');
  const event = new window.Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
});

test('tab keyboard navigation uses a roving focus target and first open reuses empty tab', async t => {
  const app = await workspace(t); if (!app) return;
  const { api, window, document } = app;
  const bytes = new TextEncoder().encode('first');
  assert.equal(await api.openFileTab({ name: 'first.md', arrayBuffer: async () => bytes.buffer }), true);
  assert.equal(api.listTabs().length, 1);
  const second = api.newTab('second', 'second.md');
  let selected = document.querySelector('[role=tab][aria-selected=true]');
  selected.focus();
  selected.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
  assert.equal(api.state.name, 'first.md');
  assert.equal(document.activeElement.getAttribute('role'), 'tab');
  assert.equal(document.querySelectorAll('[role=tab][tabindex="0"]').length, 1);
  selected = document.activeElement;
  selected.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'End', bubbles: true }));
  assert.equal(api.listTabs().find(x => x.active).id, second);
  assert.equal(document.activeElement.getAttribute('aria-selected'), 'true');
});

test('new documents inherit the configured manual base without copying native auto bases', async t => {
  const app = await workspace(t); if (!app) return;
  const { api, window } = app;
  api.el.baseUrl.value = 'https://example.test/docs/';
  api.el.baseUrl.dispatchEvent(new window.Event('input', { bubbles: true }));
  api.setDoc('native', 'native.md', { name: 'native.md', baseUrl: 'https://native.test/' });
  assert.equal(api.state.autoBase, true);
  api.newTab('fresh', 'fresh.md');
  assert.equal(api.state.baseUrl, 'https://example.test/docs/');
  assert.equal(api.state.autoBase, false);
});

test('comparison shows separate sanitized read-only document and swaps edited active source', async t => {
  const app = await workspace(t); if (!app) return;
  const { api, document } = app;
  api.setDoc('# Shared\n\n- [ ] first', 'first.md');
  const first = api.listTabs()[0].id;
  const second = api.newTab('# Shared\n\n- [x] second\n\n<script>window.BAD=1</script>', 'second.md');
  assert.equal(api.showComparison(first), true);
  const preview = document.getElementById('comparisonPreview');
  assert.match(preview.textContent, /first/);
  assert.equal(preview.querySelector('input').disabled, true);
  assert.equal(preview.querySelector('[data-rv-task]'), null);
  assert.notEqual(preview.querySelector('h1').id, api.el.preview.querySelector('h1').id);
  edit(app, '# Latest second');
  api.switchTab(first);
  assert.match(preview.textContent, /Latest second/);
  assert.equal(api.listTabs().find(x => x.active).id, first);
  assert.equal(preview.querySelector('script'), null);
  document.getElementById('btnActivateComparison').click();
  assert.equal(api.listTabs().find(x => x.active).id, second);
  assert.match(api.el.editor.value, /Latest second/);
  api.hideComparison();
  assert.equal(document.getElementById('comparisonPane').hidden, true);
});

test('comparison namespaces footnote IDs and navigates only its own fragments', async t => {
  const app = await workspace(t); if (!app) return;
  const { api, document, window } = app;
  api.setDoc('<p id="fn-1">Footnote</p>\n\n[Note](#fn-1)', 'notes.md');
  const first = api.listTabs()[0].id;
  api.newTab('<p id="fn-1">Other footnote</p>', 'other.md');
  api.showComparison(first);
  const preview = document.getElementById('comparisonPreview');
  const footnote = preview.querySelector('[id]');
  let visited = false;
  footnote.scrollIntoView = () => { visited = true; };
  assert.equal(footnote.id, 'comparison-' + first + '-fn-1');
  const link = preview.querySelector('a');
  assert.equal(link.getAttribute('href'), '#' + footnote.id);
  link.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  assert.equal(visited, true);
  assert.equal(api.state.name, 'other.md');
});

test('comparison native images resolve against secondary handle and links activate their origin', async t => {
  if (!harness.hasDom) { t.skip('jsdom unavailable'); return; }
  const images = [], paths = [];
  const app = await harness.loadApp({ beforeParse(window) {
    window.TextDecoder = TextDecoder;
    window.RV = { Native: { available: () => true, initialize: async () => {},
      assetUrl: (src, handle) => { images.push([src, handle.path]); return 'https://assets.test' + handle.path + '/' + src; },
      resolveLocalUrl: (href, handle) => { paths.push([href, handle.path]); return '/linked.md'; },
      openLink: async () => null, openExternal: async () => {} } };
  } });
  t.after(() => app.window.close());
  const api = app.window.RVApp;
  api.setDoc('# Source\n\n![pic](pic.png)\n\n[Linked](linked.md)', 'source.md', { path: '/source', name: 'source.md' });
  const first = api.listTabs()[0].id;
  api.newTab('# Main\n\n![main](main.png)', 'main.md', { path: '/main', name: 'main.md' });
  api.showComparison(first);
  const preview = app.document.getElementById('comparisonPreview');
  assert.match(preview.querySelector('img').src, /assets.test\/source\/pic.png/);
  assert.ok(images.some(pair => pair[0] === 'pic.png' && pair[1] === '/source'));
  preview.querySelector('a:not(.heading-anchor)').click();
  await harness.settle(10);
  assert.equal(api.state.name, 'source.md');
  assert.deepEqual(paths[paths.length - 1], ['linked.md', '/source']);
});

test('tabs retain distinct editor elements and document replacement creates a fresh editing host', async t => {
  const app = await workspace(t); if (!app) return;
  const { api } = app;
  api.setDoc('one', 'one.md');
  const firstEditor = api.el.editor;
  const first = api.listTabs()[0].id;
  api.newTab('two', 'two.md');
  const secondEditor = api.el.editor;
  assert.notEqual(secondEditor, firstEditor);
  api.switchTab(first);
  assert.equal(api.el.editor, firstEditor);
  edit(app, 'one changed');
  assert.equal(api.state.dirty, true);
  api.setDoc('replacement', 'replacement.md');
  assert.notEqual(api.el.editor, firstEditor);
  assert.equal(api.el.editor.value, 'replacement');
});

test('concurrent native opens deduplicate at commit time and preserve newer edits', async t => {
  const app = await workspace(t); if (!app) return;
  const { api } = app;
  const readers = [];
  const handle = { path: '/same.md', name: 'same.md', getFile: async () => ({
    name: 'same.md', arrayBuffer: () => new Promise(resolve => readers.push(resolve))
  }) };
  const first = api.openHandleTab(handle), second = api.openHandleTab(handle);
  await harness.settle(10);
  readers[0](new TextEncoder().encode('First').buffer); await first;
  edit(app, 'Newer edits');
  readers[1](new TextEncoder().encode('Stale').buffer); await second;
  assert.equal(api.listTabs().filter(tab => tab.handle && tab.handle.path === '/same.md').length, 1);
  assert.equal(api.el.editor.value, 'Newer edits');
  assert.equal(api.state.dirty, true);
});

function undoKey(app, redo) {
  app.api.el.editor.dispatchEvent(new app.window.KeyboardEvent('keydown', {
    key: 'z', ctrlKey: true, shiftKey: !!redo, bubbles: true, cancelable: true
  }));
}
function inputText(app, text, type) {
  const editor = app.api.el.editor;
  editor.dispatchEvent(new app.window.InputEvent('beforeinput', { inputType: type, bubbles: true, cancelable: true }));
  editor.value = text; editor.setSelectionRange(text.length, text.length);
  editor.dispatchEvent(new app.window.InputEvent('input', { inputType: type, bubbles: true }));
}

test('per-tab undo coalesces typing, isolates undo and redo and resets for replacements', async t => {
  const app = await workspace(t); if (!app) return;
  const { api } = app;
  api.setDoc('one', 'one.md'); api.el.editor.setSelectionRange(3, 3);
  const first = api.listTabs()[0].id;
  inputText(app, 'one!', 'insertText'); inputText(app, 'one!!', 'insertText');
  const second = api.newTab('two', 'two.md');
  undoKey(app); assert.equal(api.el.editor.value, 'two');
  inputText(app, 'two pasted', 'insertFromPaste');
  api.switchTab(first); undoKey(app);
  assert.equal(api.el.editor.value, 'one');
  undoKey(app, true); assert.equal(api.el.editor.value, 'one!!');
  api.switchTab(second); undoKey(app); assert.equal(api.el.editor.value, 'two');
  api.setDoc('replacement', 'replacement.md'); undoKey(app);
  assert.equal(api.el.editor.value, 'replacement');
});

test('undo retains at most one hundred edit snapshots', async t => {
  const app = await workspace(t); if (!app) return;
  app.api.setDoc('0', 'bounded.md');
  for (let i = 1; i <= 110; i++) inputText(app, String(i), 'insertFromPaste');
  for (let i = 0; i < 105; i++) undoKey(app);
  assert.equal(app.api.el.editor.value, '10');
});

test('restored copies have no writable handle and remain dirty when their source matches saved text', async t => {
  const app = await workspace(t); if (!app) return;
  app.api.restoreTab({ source: 'copy', saved: 'copy', name: 'copy.md', handle: { path: '/never-write' }, bom: true });
  assert.equal(app.api.state.handle, null);
  assert.equal(app.api.state.needsSave, true);
  edit(app, 'copy');
  assert.equal(app.api.state.dirty, true);
  assert.equal(app.api.listTabs().find(tab => tab.active).hasDocument, true);
});

test('comparison raw heading fragments resolve namespace and stacked divider uses vertical keys', async t => {
  const app = await workspace(t); if (!app) return;
  const { api, window, document } = app;
  api.setDoc('# Install\n\n[Go](#install)', 'install.md');
  const first = api.listTabs()[0].id; api.newTab('main', 'main.md'); api.showComparison(first);
  const preview = document.getElementById('comparisonPreview');
  assert.equal(preview.querySelector('a:not(.heading-anchor)').getAttribute('href'), '#' + preview.querySelector('h1').id);
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 500 });
  window.dispatchEvent(new window.Event('resize'));
  const divider = document.getElementById('compareDivider');
  assert.equal(divider.getAttribute('aria-orientation'), 'horizontal');
  divider.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
  assert.equal(document.getElementById('workspaceViews').style.getPropertyValue('--compare-split'), '47%');
});

test('comparison rejects escaping folder images and clears rendered DOM on hide', async t => {
  const app = await workspace(t); if (!app) return;
  const { api, document } = app;
  api.setDoc('![private](../private.png)', 'source.md');
  api.state.folder = { root: {}, path: 'source.md' };
  const first = api.listTabs()[0].id; api.newTab('main', 'main.md'); api.showComparison(first);
  const preview = document.getElementById('comparisonPreview');
  assert.equal(preview.querySelector('img').hasAttribute('src'), false);
  api.hideComparison(); assert.equal(preview.childElementCount, 0);
});
