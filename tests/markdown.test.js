'use strict';

/* Markdown rendering: what the preview is built from, before any DOM is involved. */

const test = require('node:test');
const assert = require('node:assert');

const marked = require('../vendor/marked.umd.js');
const Markdown = require('../src/markdown.js');

const md = Markdown.create({ marked: marked }, { strings: function (k) { return k; } });

function render(source) {
  md.reset();
  const tokens = md.lexer(source);
  let html = '';
  for (let i = 0; i < tokens.length; i++) html += md.renderBlock(tokens[i], tokens.links);
  return { html: html, tasks: md.taskCount() };
}

test('task checkboxes render with an index, a checked state and a disabled default', function () {
  const out = render('- [ ] open\n- [x] closed\n- [X] closed too\n').html;
  assert.match(out, /data-rv-task="0"(?![^>]*checked)/);
  assert.match(out, /data-rv-task="1"[^>]*checked/);
  assert.match(out, /data-rv-task="2"[^>]*checked/);
  assert.equal((out.match(/type="checkbox"/g) || []).length, 3);
  assert.equal((out.match(/disabled/g) || []).length, 3, 'a viewer must not accept stray clicks');
  assert.match(out, /class="task-list-item-checkbox rv-task"/);
});

test('task lists carry the GitHub classes the stylesheet relies on', function () {
  const out = render('- [ ] a\n- b\n').html;
  assert.match(out, /<ul class="contains-task-list">/);
  assert.equal((out.match(/class="task-list-item"/g) || []).length, 1, 'only task items get the class');
});

test('checkbox indexes follow document order across blocks and nesting', function () {
  const src = [
    '- [ ] one',
    '  - [x] two',
    '',
    '> - [ ] three',
    '',
    '1. [x] four',
    ''
  ].join('\n');
  const out = render(src);
  assert.equal(out.tasks, 4);
  const order = out.html.match(/data-rv-task="(\d+)"/g).map(function (m) { return m.slice(-2, -1); });
  assert.deepEqual(order, ['0', '1', '2', '3']);
});

test('code blocks get a language bar and a copy control', function () {
  const out = render('```python\nprint(1)\n```\n').html;
  assert.match(out, /<div class="code-block" data-lang="python">/);
  assert.match(out, /<span class="code-lang">python<\/span>/);
  assert.match(out, /data-copy-code/);
  assert.match(out, /<code class="hljs language-python">print\(1\)<\/code>/);
  assert.match(out, /<pre dir="ltr">/);
});

test('plain fenced blocks still render without a language', function () {
  const out = render('```\nplain text\n```\n').html;
  assert.match(out, /<div class="code-block">/);
  assert.match(out, /<span class="code-lang">text<\/span>/);
});

test('tables are wrapped so wide content scrolls instead of overflowing', function () {
  const out = render('| a | b |\n| - | - |\n| 1 | 2 |\n').html;
  assert.match(out, /^<div class="table-wrap"><table>/);
  assert.match(out, /<\/table><\/div>/);
});

test('headings get unique, GitHub style anchors', function () {
  const out = render('# Hello World\n\n# Hello World\n\n## سلام دنیا\n').html;
  assert.match(out, /id="user-content-hello-world"/);
  assert.match(out, /id="user-content-hello-world-1"/);
  assert.match(out, /id="user-content-سلام-دنیا"/);
  assert.equal((out.match(/class="heading-anchor"/g) || []).length, 3);
});

test('images are lazy and keep their alt text', function () {
  const out = render('![Alt text](pic.png "Title")\n').html;
  assert.match(out, /<img src="pic\.png" alt="Alt text" title="Title" loading="lazy" decoding="async">/);
});

test('reference style links resolve even though tokens are rendered one at a time', function () {
  const out = render('[label][ref]\n\n[ref]: https://example.com "T"\n').html;
  assert.match(out, /<a href="https:\/\/example\.com" title="T">label<\/a>/);
});

test('common README syntax survives the pipeline', function () {
  const src = [
    '# Title',
    '',
    '**bold** *italic* ~~strike~~ `code` [link](https://x.dev)',
    '',
    '> quote',
    '',
    '---',
    '',
    '1. one',
    '2. two',
    '',
    '- a',
    '  - b',
    ''
  ].join('\n');
  const out = render(src).html;
  assert.match(out, /<strong>bold<\/strong>/);
  assert.match(out, /<em>italic<\/em>/);
  assert.match(out, /<del>strike<\/del>/);
  assert.match(out, /<code>code<\/code>/);
  assert.match(out, /<blockquote>/);
  assert.match(out, /<hr>/);
  assert.match(out, /<ol>/);
  assert.match(out, /<ul>/);
});

test('the sanitiser is configured to drop anything that runs or spoofs the UI', function () {
  const cfg = Markdown.SANITIZE;
  assert.equal(cfg.ALLOW_DATA_ATTR, false);
  ['style', 'form', 'button', 'iframe', 'object', 'embed'].forEach(function (tag) {
    assert.ok(cfg.FORBID_TAGS.indexOf(tag) >= 0, tag + ' must be forbidden');
  });
  // The three data attributes the app needs are explicitly allowed.
  ['data-rv-task', 'data-lang', 'data-copy-code'].forEach(function (attr) {
    assert.ok(cfg.ADD_ATTR.indexOf(attr) >= 0, attr + ' must be allowed');
  });
});

test('GitHub alerts render as titled callouts', function () {
  const out = md.renderAll('> [!WARNING]\n> Be careful.');
  assert.match(out, /markdown-alert-warning/);
  assert.match(out, /Be careful\./);
  assert.match(md.renderAll('> plain quote'), /<blockquote>/);
});

test('footnotes link both ways and keep task numbering intact', function () {
  const out = render('Text[^1].\n\n[^1]: The **note**.\n\n- [ ] a\n- [x] b');
  assert.match(out.html, /<sup class="footnote-ref"><a href="#user-content-fn-1" id="user-content-fnref-1">1<\/a><\/sup>/);
  assert.match(out.html, /id="user-content-fn-1"[\s\S]*<strong>note<\/strong>[\s\S]*href="#user-content-fnref-1"/);
  assert.equal(out.tasks, 2);
});
test('repeated footnotes have distinct references and a backlink to every occurrence', function () {
  const out = render('[^same]: **Note**\n\nFirst[^same], second[^SAME].\n\n[^same]: duplicate\n').html;
  const ids = Array.from(out.matchAll(/ id="([^"]+)"/g), match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  assert.match(out, /id="user-content-fnref-same:2"/);
  assert.match(out, /href="#user-content-fnref-same:2"/);
  assert.equal((out.match(/class="footnote-back"/g) || []).length, 2);
  assert.equal((out.match(/id="user-content-fn-same"/g) || []).length, 1);
  assert.doesNotMatch(out, /duplicate/);
  assert.doesNotMatch(render('Unresolved[^same]').html, /footnote-ref/);
});

test('footnote punctuation, Unicode and repeat suffixes cannot collide', function () {
  const out = render('A[^a.b] B[^a-b] C[^a-b] D[^a-b:2] E[^یادداشت]\n\n[^a.b]: one\n[^a-b]: two\n[^a-b:2]: three\n[^یادداشت]: چهار\n').html;
  const ids = Array.from(out.matchAll(/ id="([^"]+)"/g), match => match[1]);
  assert.equal(ids.length, 9);
  assert.equal(new Set(ids).size, ids.length);
  for (const link of out.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.includes(link[1]), link[1]);
});


test('references in ignored duplicate definitions do not create broken backlinks', function () {
  const out = render('Text[^b]\n\n[^a]: first\n\n[^a]: ignored[^b]\n\n[^b]: B').html;
  assert.doesNotMatch(out, /fnref-b:2/);
  assert.equal((out.match(/class="footnote-back"/g) || []).length, 1);
});
