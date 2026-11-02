'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const harness = require('./helpers/dom');

async function load(t) {
  const app = await harness.loadApp();
  t.after(() => app.window.close());
  return { ...app, api: app.window.RVApp };
}
function update(api, source) { api.el.editor.value = source; api.render(); }

test('editing a block retains untouched headings, code, details state and focus', async t => {
  const { api, document } = await load(t);
  const source = '# Title\n\nOriginal paragraph\n\n```js\nconst n = 1;\n```\n\n<details><summary>More</summary>Body</details>';
  api.setDoc(source, 'test.md');
  const heading = document.querySelector('#preview h1');
  const code = document.querySelector('#preview .code-block');
  const details = document.querySelector('#preview details');
  const paragraph = document.querySelector('#preview p');
  details.open = true; details.querySelector('summary').focus();
  const observer = new document.defaultView.MutationObserver(() => {});
  observer.observe(api.el.preview, { childList: true });
  update(api, source.replace('Original paragraph', 'Edited paragraph'));
  const removed = observer.takeRecords().flatMap(record => Array.from(record.removedNodes));
  observer.disconnect();
  assert.ok(removed.includes(paragraph));
  assert.ok(!removed.includes(heading) && !removed.includes(code) && !removed.includes(details));
  assert.equal(document.querySelector('#preview h1'), heading);
  assert.equal(document.querySelector('#preview .code-block'), code);
  assert.equal(document.querySelector('#preview details'), details);
  assert.equal(details.open, true);
  assert.equal(document.activeElement, details.querySelector('summary'));
});

test('incremental output follows changed references, task indexes, heading suffixes and link bases', async t => {
  const { api, document } = await load(t);
  const source = '# A\n\n# A\n\n[guide][ref]\n\n[ref]: one.md\n\n- [ ] old';
  api.setDoc(source, 'test.md'); api.setEditPreview(true);
  update(api, '# A\n\n' + source.replace('one.md', 'two.md').replace('- [ ] old', '- [x] new\n- [ ] old'));
  assert.deepEqual(Array.from(document.querySelectorAll('#preview h1'), node => node.id),
    ['user-content-a', 'user-content-a-1', 'user-content-a-2']);
  assert.equal(document.querySelector('#preview p a').getAttribute('href'), 'two.md');
  assert.equal(api.state.tasksOk, true);
  document.querySelectorAll('#preview input')[1].click();
  assert.match(api.el.editor.value, /- \[x\] new\n- \[x\] old/);
  api.state.baseUrl = 'https://example.com/docs/'; api.render();
  assert.equal(document.querySelector('#preview p a').href, 'https://example.com/docs/two.md');
  api.state.baseUrl = 'https://example.org/'; api.render();
  assert.equal(document.querySelector('#preview p a').href, 'https://example.org/two.md');
});

test('search cleanup, reordered duplicate paragraphs, and empty documents keep complete content', async t => {
  const { api, document, window, errors } = await load(t);
  api.setDoc('lead <b>bold</b> tail\n\nSame\n\nSame\n\nLast', 'test.md');
  api.el.findBar.hidden = false; api.el.findInput.value = 'lead';
  api.el.findInput.dispatchEvent(new window.Event('input', { bubbles: true }));
  update(api, 'First\n\nlead <b>bold</b> tail\n\nSame\n\nSame');
  assert.match(api.el.preview.textContent, /lead bold tail/);
  document.getElementById('findClose').click();
  api.render();
  assert.match(api.el.preview.textContent, /lead bold tail/);
  assert.equal(api.el.preview.querySelectorAll('mark.rv-find').length, 0);
  const raw = '<div>Raw</div>lead <b>bold</b> tail\n\nBefore';
  api.setDoc(raw, 'raw.md');
  api.el.findBar.hidden = false;
  api.el.findInput.dispatchEvent(new window.Event('input', { bubbles: true }));
  update(api, raw.replace('Before', 'After'));
  assert.match(api.el.preview.textContent, /lead bold tail/, 'search marks must not remove top-level raw HTML text');
  api.setEmpty();
  assert.equal(api.el.preview.children.length, 0);
  api.setDoc('# Fresh', 'fresh.md');
  assert.equal(api.state.toc.length, 1);
  assert.deepEqual(errors, []);
});

test('sanitized block caching still runs stateful renderers and invalidates changed HTML', () => {
  const marked = require('../vendor/marked.umd.js');
  const Markdown = require('../src/markdown.js');
  let calls = 0;
  const md = Markdown.create({ marked, purify: { sanitize(html) { calls++; return html; } } });
  const source = '# A\n\n# A\n\n- [ ] one\n- [x] two\n\n[ref][r]\n\n[r]: one.md';
  const first = md.renderAll(source), initial = calls;
  assert.equal(md.renderAll(source), first);
  assert.equal(calls, initial, 'unchanged HTML skips another sanitization');
  assert.equal(md.taskCount(), 2, 'task counters still advance through cached blocks');
  const updated = md.renderAll(source.replace('one.md', 'two.md'));
  assert.match(updated, /href="two.md"/);
  assert.ok(calls > initial);
});
