'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { hasDom, loadApp, waitFor, click } = require('./helpers/dom');
const { detect } = require('../src/structured');

function file(name, text) {
  return { name, arrayBuffer: async () => new TextEncoder().encode(text).buffer };
}
async function workspace(t) {
  const result = await loadApp({ beforeParse(window) { window.TextDecoder = TextDecoder; } });
  t.after(() => result.dom.window.close());
  return result;
}

test('detects complete JSON with arbitrary extensions and keeps explicitly named Markdown', () => {
  for (const name of ['viewer.config', 'viewer', 'viewer.txt']) assert.equal(detect(name, '\n {"ok":true}'), 'json');
  assert.equal(detect('preferences.INI', 'setting=value'), 'ini');
  assert.equal(detect('broken.JSON', '{broken'), 'json');
  assert.equal(detect('README.md', '[1, 2]'), 'markdown');
  assert.equal(detect('file.config', '{"ok":true}\n# More text'), 'markdown');
});

test('JSON preview retains lexical values, builds closed branches on demand and finds their text', { skip: !hasDom }, async t => {
  const { window, document, errors } = await workspace(t);
  const source = '{"id":9007199254740993,"id":1e999,"display":{"theme":"dark"},' +
    '"workspace":{"hidden":{"target":"<img src=x onerror=alert(1)>"}}}';
  const app = window.RVApp;
  assert.equal(await app.openFileTab(file('viewer.config', source)), true);
  const preview = document.querySelector('#preview');
  assert.equal(app.state.format, 'json');
  assert.equal(app.el.editor.value, source);
  assert.deepEqual(Array.from(preview.querySelectorAll('.structured-value')).slice(0, 2).map(node => node.textContent),
    ['9007199254740993', '1e999']);
  assert.equal(preview.querySelectorAll('.structured-key').length, 5);
  assert.equal(preview.querySelectorAll('img').length, 0);
  assert.match(document.querySelector('#toc').textContent, /workspace/);
  const closedBranch = Array.from(preview.querySelectorAll('details')).find(node => node.firstChild.textContent.includes('workspace'));
  assert.equal(closedBranch.open, false);
  assert.equal(closedBranch.childElementCount, 1);
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'f', ctrlKey: true, shiftKey: true, bubbles: true }));
  const find = document.querySelector('#findInput');
  find.value = 'onerror';
  find.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.equal(preview.querySelector('mark.current').textContent, 'onerror');
  assert.equal(closedBranch.open, true);
  assert.equal(preview.querySelectorAll('img').length, 0);
  assert.deepEqual(errors, []);
});

test('INI keeps duplicate sections and comments, and the per-tab override survives restoring a draft', { skip: !hasDom }, async t => {
  const { window, document, errors } = await workspace(t);
  const app = window.RVApp;
  const source = '; global note\n[Display]\nmode=a=b#c\nmode=dark\n[Display]\nmode=light\n';
  assert.equal(await app.openFileTab(file('settings.ini', source)), true);
  const first = app.listTabs()[0].id;
  const preview = document.querySelector('#preview');
  assert.equal(preview.querySelectorAll('summary').length, 2);
  assert.match(preview.querySelector('.structured-comment').textContent, /global note/);
  assert.deepEqual(Array.from(preview.querySelectorAll('.structured-value')).map(node => node.textContent), ['; global note', 'a=b#c', 'dark', 'light']);
  assert.equal(app.el.editor.value, source);
  assert.equal(app.state.dirty, false);
  assert.equal(await app.openFileTab(file('Document', source)), true);
  const option = document.querySelector('#previewFormat');
  option.value = 'ini';
  option.dispatchEvent(new window.Event('change', { bubbles: true }));
  const saved = app.listTabs().find(tab => tab.active);
  assert.equal(saved.formatOverride, 'ini');
  app.switchTab(first);
  assert.equal(option.value, '');
  app.restoreTab(saved);
  assert.equal(option.value, 'ini');
  assert.equal(app.state.format, 'ini');
  assert.equal(app.el.editor.value, source);
  assert.deepEqual(errors, []);
});

test('invalid or oversized JSON remains readable and exported HTML includes closed branches', { skip: !hasDom }, async t => {
  const { window, document } = await workspace(t);
  const app = window.RVApp;
  const preview = document.querySelector('#preview');
  app.setDoc('{broken}', 'test.json');
  assert.equal(preview.querySelector('pre').textContent, '{broken}');
  const large = JSON.stringify(Array(1600).fill(0));
  app.setDoc(large, 'large.json');
  assert.equal(preview.querySelector('pre').textContent, large);
  app.setDoc('{"open":{"id":1},"closed":{"exported":2}}', 'test.json');
  let html;
  window.RV.Native = { available: () => true, download: async output => { html = output; } };
  click(window, document.querySelector('#btnExport'));
  await waitFor(() => html);
  assert.match(html, /<details class="structured-details"><summary[^>]*>.*closed/);
  assert.match(html, /<bdi class="structured-key">exported<\/bdi>/);
});
