'use strict';

/*
 * End-to-end tests: the real index.html + app.js running in jsdom. These cover the wiring that the
 * pure modules cannot — DOMPurify output, click handling, dirty state, the unsaved-changes dialog
 * and localisation. They skip themselves when the optional dev dependency jsdom is not installed.
 */

const { test, before, after } = require('node:test');
const assert = require('node:assert');

const harness = require('./helpers/dom.js');
const hasDom = harness.hasDom;

let app = null;
let win = null;
let doc = null;
let RVApp = null;

before(async function () {
  if (!hasDom) return;
  app = await harness.loadApp();
  win = app.window;
  doc = app.document;
  RVApp = win.RVApp;
});

after(function () {
  if (app && app.dom && app.dom.window) app.dom.window.close();
});

function skipIfNoDom(t) {
  if (!hasDom) { t.skip('jsdom is not installed — run `npm install` to enable the DOM suite'); return true; }
  return false;
}

function editorValue() { return doc.getElementById('editor').value; }

function taskBoxes() { return doc.querySelectorAll('#preview input[data-rv-task]'); }

function taskIndexByLabel(label) {
  const tasks = RVApp.state.tasks;
  for (let i = 0; i < tasks.length; i++) if (tasks[i].label === label) return i;
  return -1;
}

/** Open a document the same way dropping a file would. */
function open(text, name) {
  RVApp.setDoc(text, name || 'test.md', null, { eol: '\n', bom: false, encoding: 'utf-8' });
  return harness.settle(60);
}

test('the application boots without errors and starts empty', async function (t) {
  if (skipIfNoDom(t)) return;
  assert.deepEqual(app.errors, [], 'boot must not throw: ' + app.errors.join(' | '));
  assert.equal(RVApp.state.hasDocument, false);
  assert.equal(doc.getElementById('emptyState').hidden, false, 'the empty state is shown');
  assert.equal(doc.getElementById('preview').childElementCount, 0);
  assert.equal(doc.getElementById('btnSave').disabled, true, 'saving nothing is not possible');
});

test('the shell is LTR/English while Persian content is rendered RTL', async function (t) {
  if (skipIfNoDom(t)) return;
  assert.equal(doc.documentElement.getAttribute('lang'), 'en');
  assert.equal(doc.documentElement.getAttribute('dir'), 'ltr');
  assert.equal(doc.getElementById('btnOpen').textContent.trim(), 'Open');

  await open('# Title\n\nEnglish paragraph.\n\nاین یک پاراگراف فارسی است.\n');
  const blocks = doc.querySelectorAll('#preview > *');
  assert.equal(blocks[0].getAttribute('dir'), 'ltr', 'the heading is LTR');
  assert.equal(blocks[1].getAttribute('dir'), 'ltr');
  assert.equal(blocks[2].getAttribute('dir'), 'rtl', 'the Persian paragraph is RTL');
  assert.equal(doc.documentElement.getAttribute('dir'), 'ltr', 'the shell never flips');
});

test('rendering covers the common README elements', async function (t) {
  if (skipIfNoDom(t)) return;
  RVApp.loadSample();
  await harness.settle(80);

  assert.ok(doc.querySelector('#preview h1'), 'headings');
  assert.ok(doc.querySelector('#preview strong'), 'bold');
  assert.ok(doc.querySelector('#preview table'), 'tables');
  assert.ok(doc.querySelector('#preview .table-wrap'), 'tables scroll instead of overflowing');
  assert.ok(doc.querySelector('#preview .code-block pre code.hljs'), 'highlighted code');
  assert.ok(doc.querySelector('#preview [data-copy-code]'), 'code copy control');
  assert.ok(doc.querySelector('#preview blockquote'), 'quotes');
  assert.ok(doc.querySelector('#preview hr'), 'rules');
  assert.ok(doc.querySelectorAll('#toc a').length >= 3, 'table of contents');

  const ext = doc.querySelector('#preview a[data-external="1"]');
  assert.ok(ext, 'external links are marked');
  assert.equal(ext.getAttribute('target'), '_blank');
  assert.match(ext.getAttribute('rel'), /noopener/);
});

test('task lists render checked and unchecked, and stay inert while viewing', async function (t) {
  if (skipIfNoDom(t)) return;
  await open('- [ ] open task\n- [x] done task\n- [X] also done\n');
  const boxes = taskBoxes();
  assert.equal(boxes.length, 3);
  assert.equal(boxes[0].checked, false, '[ ] renders unchecked');
  assert.equal(boxes[1].checked, true, '[x] renders checked');
  assert.equal(boxes[2].checked, true, '[X] renders checked');
  assert.ok(boxes[0].closest('.task-list-item'), 'GitHub task list markup');
  assert.ok(boxes[0].closest('ul.contains-task-list'), 'GitHub task list markup');

  assert.equal(RVApp.state.editPreview, false);
  assert.equal(boxes[0].disabled, true, 'a viewer must not change the document by accident');

  const before = editorValue();
  harness.click(win, boxes[0]);
  await harness.settle(150);
  assert.equal(editorValue(), before, 'clicking in view mode changes nothing');
});

test('Edit in preview enables the checkboxes and says so', async function (t) {
  if (skipIfNoDom(t)) return;
  await open('- [ ] a\n- [x] b\n');
  RVApp.setEditPreview(true);
  await harness.settle(40);
  assert.equal(doc.getElementById('preview').getAttribute('data-edit'), '1');
  assert.equal(doc.getElementById('btnEdit').getAttribute('aria-pressed'), 'true');
  assert.equal(doc.getElementById('editBadge').hidden, false);
  assert.equal(taskBoxes()[0].disabled, false);

  RVApp.setEditPreview(false);
  await harness.settle(40);
  assert.equal(doc.getElementById('preview').getAttribute('data-edit'), '0');
  assert.equal(taskBoxes()[0].disabled, true);
});

test('clicking a checkbox rewrites exactly its own marker and marks the document dirty', async function (t) {
  if (skipIfNoDom(t)) return;
  const src = '# Plan\n\n- [ ] Learn PostgreSQL\n- [x] Learn Git\n\nText after.\n';
  await open(src, 'plan.md');
  RVApp.setEditPreview(true);
  await harness.settle(40);

  assert.equal(RVApp.state.dirty, false, 'a freshly opened file is clean');

  const boxes = taskBoxes();
  harness.click(win, boxes[0]);
  await harness.settle(160);

  assert.equal(editorValue(), '# Plan\n\n- [x] Learn PostgreSQL\n- [x] Learn Git\n\nText after.\n');
  assert.equal(RVApp.state.dirty, true, 'an interactive edit is a real change');
  assert.equal(doc.getElementById('fileState').getAttribute('data-state'), 'dirty');
  assert.equal(taskBoxes()[0].checked, true, 'the preview follows the source');
  assert.equal(RVApp.state.tasks[0].checked, true);
  assert.equal(doc.activeElement, taskBoxes()[0], 'focus stays on the checkbox the user clicked');

  // …and clicking again restores the original document.
  harness.click(win, taskBoxes()[0]);
  await harness.settle(160);
  assert.equal(editorValue(), src);
  assert.equal(RVApp.state.dirty, false, 'back to the saved content means clean again');
});

test('identical task labels do not cross-talk', async function (t) {
  if (skipIfNoDom(t)) return;
  const src = '- [ ] Install Qt\n- [ ] Install Qt\n- [ ] Install Qt\n';
  await open(src);
  RVApp.setEditPreview(true);
  await harness.settle(40);

  harness.click(win, taskBoxes()[1]);
  await harness.settle(160);
  assert.equal(editorValue(), '- [ ] Install Qt\n- [x] Install Qt\n- [ ] Install Qt\n');

  harness.click(win, taskBoxes()[2]);
  await harness.settle(160);
  assert.equal(editorValue(), '- [ ] Install Qt\n- [x] Install Qt\n- [x] Install Qt\n');

  harness.click(win, taskBoxes()[0]);
  await harness.settle(160);
  assert.equal(editorValue(), '- [x] Install Qt\n- [x] Install Qt\n- [x] Install Qt\n');
});

test('nested and Persian tasks keep their positions', async function (t) {
  if (skipIfNoDom(t)) return;
  const src = [
    '- [ ] outer',
    '  - [ ] یادگیری PostgreSQL',
    '  - [x] nested done',
    '- [ ] second outer',
    ''
  ].join('\n');
  await open(src);
  RVApp.setEditPreview(true);
  await harness.settle(40);

  const idx = taskIndexByLabel('یادگیری PostgreSQL');
  assert.ok(idx >= 0, 'the Persian task is in the map');
  harness.click(win, taskBoxes()[idx]);
  await harness.settle(160);
  assert.equal(editorValue().split('\n')[1], '  - [x] یادگیری PostgreSQL');
  assert.equal(editorValue().split('\n')[0], '- [ ] outer', 'the parent is untouched');
  assert.equal(editorValue().split('\n')[2], '  - [x] nested done');
});

test('interactive edits leave the rest of the document byte for byte intact', async function (t) {
  if (skipIfNoDom(t)) return;
  const src = [
    '# Title',
    '',
    'A **bold** sentence with `code` and [a link](https://example.com).',
    '',
    '```js',
    'const keep = "my formatting";',
    '```',
    '',
    '- [ ] the task',
    '',
    '> a quote',
    '',
    '    indented code line',
    ''
  ].join('\n');
  await open(src);
  RVApp.setEditPreview(true);
  await harness.settle(40);

  harness.click(win, taskBoxes()[0]);
  await harness.settle(160);

  const after = editorValue();
  assert.equal(after.length, src.length);
  const diffs = [];
  for (let i = 0; i < src.length; i++) if (src[i] !== after[i]) diffs.push(i);
  assert.equal(diffs.length, 1, 'exactly one character changed');
  assert.equal(src[diffs[0]], ' ');
  assert.equal(after[diffs[0]], 'x');
});

test('source edits and preview edits stay in sync', async function (t) {
  if (skipIfNoDom(t)) return;
  await open('- [ ] a\n- [ ] b\n');
  RVApp.setEditPreview(true);
  await harness.settle(40);

  // Edit the Markdown source directly.
  const editor = doc.getElementById('editor');
  editor.value = '- [x] a\n- [ ] b\n';
  editor.dispatchEvent(new win.Event('input', { bubbles: true }));
  await harness.settle(160);

  assert.equal(taskBoxes()[0].checked, true, 'the preview follows the source');
  assert.equal(RVApp.state.tasks[0].checked, true);
  assert.equal(RVApp.state.dirty, true);
});

test('a CRLF document does not look dirty right after opening (regression)', async function (t) {
  if (skipIfNoDom(t)) return;
  const crlf = '# A\r\n\r\n- [ ] task\r\n';
  const decoded = require('../src/encoding.js').decode(new Uint8Array(Buffer.from(crlf, 'utf8')));
  RVApp.setDoc(decoded.text, 'crlf.md', null, decoded);
  await harness.settle(80);

  assert.equal(RVApp.state.dirty, false, 'normalising line endings must not fake an edit');
  assert.equal(RVApp.state.eol, '\r\n');
  assert.equal(doc.getElementById('statusEncoding').textContent, 'utf-8 · CRLF');
});

test('hostile Markdown cannot inject scripts or spoof the interface', async function (t) {
  if (skipIfNoDom(t)) return;
  await open([
    '<script>window.__pwned = true;<\/script>',
    '',
    '<p onclick="window.__pwned = true">click me</p>',
    '',
    '<button>fake button</button>',
    '',
    '<iframe src="https://evil.example"></iframe>',
    '',
    '<img src="x" onerror="window.__pwned = true">',
    '',
    '<a href="javascript:window.__pwned = true">bad link</a>',
    ''
  ].join('\n'));

  assert.equal(win.__pwned, undefined);
  assert.equal(doc.querySelectorAll('#preview script').length, 0);
  assert.equal(doc.querySelectorAll('#preview button').length, 0);
  assert.equal(doc.querySelectorAll('#preview iframe').length, 0);
  assert.equal(doc.querySelectorAll('#preview [onclick]').length, 0);
  assert.equal(doc.querySelectorAll('#preview [onerror]').length, 0);
  const badLink = doc.querySelector('#preview a[href]');
  assert.ok(!badLink || !/^javascript:/i.test(badLink.getAttribute('href') || ''));
});

test('the unsaved changes dialog guards against losing work', async function (t) {
  if (skipIfNoDom(t)) return;
  await open('- [ ] a\n', 'draft.md');
  RVApp.setEditPreview(true);
  await harness.settle(40);
  harness.click(win, taskBoxes()[0]);
  await harness.settle(160);
  assert.equal(RVApp.state.dirty, true);

  doc.getElementById('btnOpen').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await harness.settle(40);
  assert.equal(doc.getElementById('confirmModal').hidden, false, 'the dialog is shown');
  assert.match(doc.getElementById('confirmBody').textContent, /draft\.md/);

  doc.getElementById('btnConfirmCancel').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await harness.settle(40);
  assert.equal(doc.getElementById('confirmModal').hidden, true);
  assert.equal(editorValue(), '- [x] a\n', 'cancelling keeps the document');
});

test('switching the interface language relabels the shell and flips its direction', async function (t) {
  if (skipIfNoDom(t)) return;
  assert.equal(doc.getElementById('btnOpen').textContent.trim(), 'Open');

  win.RV.I18n.setLocale('fa');
  RVApp.applyLocale();
  await harness.settle(60);

  assert.equal(doc.documentElement.getAttribute('lang'), 'fa');
  assert.equal(doc.documentElement.getAttribute('dir'), 'rtl');
  assert.equal(doc.getElementById('btnOpen').textContent.trim(), 'باز کردن');

  win.RV.I18n.setLocale('en');
  RVApp.applyLocale();
  await harness.settle(60);
  assert.equal(doc.documentElement.getAttribute('dir'), 'ltr');
  assert.equal(doc.getElementById('btnOpen').textContent.trim(), 'Open');
});

test('view modes, wrapping and the sidebar are applied to the layout', async function (t) {
  if (skipIfNoDom(t)) return;
  RVApp.setMode('preview');
  await harness.settle(40);
  assert.equal(doc.getElementById('panes').getAttribute('data-mode'), 'preview');

  RVApp.setMode('split');
  await harness.settle(40);
  assert.equal(doc.getElementById('panes').getAttribute('data-mode'), 'split');

  doc.getElementById('btnToc').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await harness.settle(20);
  assert.equal(doc.getElementById('layout').getAttribute('data-sidebar'), 'off');
  doc.getElementById('btnToc').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await harness.settle(20);
  assert.equal(doc.getElementById('layout').getAttribute('data-sidebar'), 'on');
});

test('the table of contents filter narrows the list', async function (t) {
  if (skipIfNoDom(t)) return;
  RVApp.loadSample();
  await harness.settle(80);
  const total = doc.querySelectorAll('#toc a').length;
  assert.ok(total >= 4);

  const filter = doc.getElementById('tocFilter');
  filter.value = 'فارسی';
  filter.dispatchEvent(new win.Event('input', { bubbles: true }));
  await harness.settle(20);

  const visible = Array.prototype.filter.call(doc.querySelectorAll('#toc a'), function (a) {
    return !a.hidden;
  });
  assert.equal(visible.length, 1);
  assert.equal(visible[0].textContent, 'فارسی');

  filter.value = 'zzz-no-match';
  filter.dispatchEvent(new win.Event('input', { bubbles: true }));
  await harness.settle(20);
  assert.equal(doc.getElementById('tocEmpty').hidden, false);

  doc.getElementById('tocClear').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await harness.settle(20);
  assert.equal(doc.querySelectorAll('#toc a:not([hidden])').length, total);
});

test('every icon-only control has an accessible name', async function (t) {
  if (skipIfNoDom(t)) return;
  const buttons = doc.querySelectorAll('.topbar button, .modal button, .pane-head button');
  for (let i = 0; i < buttons.length; i++) {
    const b = buttons[i];
    const name = b.getAttribute('aria-label') || b.getAttribute('title') || b.textContent.trim();
    assert.ok(name, 'button ' + (b.id || b.className) + ' has no accessible name');
  }
  assert.ok(doc.querySelectorAll('.topbar svg.ic').length > 8, 'the toolbar uses SVG icons');
  assert.equal(doc.querySelectorAll('.topbar i[data-icon]').length, 0, 'placeholders were replaced');
});

test('interactive editing degrades safely when the source map cannot be trusted', async function (t) {
  if (skipIfNoDom(t)) return;
  await open('- [ ] a\n- [ ] b\n');
  // Simulate a document whose token tree and source disagree (RV.Tasks reports ok: false).
  RVApp.state.tasksOk = false;
  RVApp.state.taskReason = 'no task marker found at line 1';
  RVApp.setEditPreview(true);
  await harness.settle(40);

  assert.equal(doc.getElementById('preview').getAttribute('data-edit'), '0');
  assert.equal(doc.getElementById('editBadge').getAttribute('data-kind'), 'warn');
  assert.match(doc.getElementById('editBadge').getAttribute('title'), /no task marker found/);
  assert.equal(taskBoxes()[0].disabled, true, 'nothing may be editable on a shaky map');

  const before = editorValue();
  harness.click(win, taskBoxes()[0]);
  await harness.settle(120);
  assert.equal(editorValue(), before, 'a click must not edit when the map is unreliable');

  RVApp.state.tasksOk = true;
  RVApp.setEditPreview(false);
  await harness.settle(40);
});

test('awkward documents render without errors', async function (t) {
  if (skipIfNoDom(t)) return;
  const cases = {
    'headings only': '# A\n\n## B\n\n### C\n',
    'empty document': '',
    'only whitespace': '   \n\n  \n',
    'unclosed fence': '```js\nconst a = 1;\n',
    'raw html block': '<div class="x"><span>hi</span></div>\n',
    'deeply nested lists': '- a\n  - b\n    - c\n      - d\n        - [ ] e\n',
    'table without body': '| a | b |\n| - | - |\n',
    'only a task list': '- [x] only\n',
    'setext headings': 'Title\n=====\n\nSub\n---\n',
    'html entities and escapes': 'AT&amp;T \\*not emphasis\\* &#128512;\n'
  };

  for (const name in cases) {
    app.errors.length = 0;
    await open(cases[name], name + '.md');
    assert.deepEqual(app.errors, [], name + ' must not throw: ' + app.errors.join(' | '));
  }
});

test('a large document stays in one piece', async function (t) {
  if (skipIfNoDom(t)) return;
  const lines = ['# Big document', ''];
  for (let i = 1; i <= 250; i++) {
    lines.push('## Section ' + i, '', 'Paragraph ' + i + ' with **bold** and `code`.', '',
      '- [ ] task ' + i, '- [x] done ' + i, '', '```js', 'const n = ' + i + ';', '```', '');
  }
  const src = lines.join('\n');
  const started = Date.now();
  await open(src, 'big.md');
  const elapsed = Date.now() - started;

  assert.equal(RVApp.state.tasks.length, 500);
  assert.equal(taskBoxes().length, 500);
  assert.equal(doc.querySelectorAll('#toc a').length, 251);
  // jsdom is far slower than a browser here; this is a smoke ceiling, not a budget.
  assert.ok(elapsed < 15000, 'rendering took ' + elapsed + 'ms');

  // Editing the very last checkbox must still hit the right marker.
  RVApp.setEditPreview(true);
  await harness.settle(40);
  const boxes = taskBoxes();
  const before = editorValue();
  harness.click(win, boxes[499]);
  await harness.settle(220);
  const after = editorValue();

  assert.equal(after.length, before.length, 'only the marker may change');
  const diffs = [];
  for (let i = 0; i < before.length; i++) if (before[i] !== after[i]) diffs.push(i);
  assert.equal(diffs.length, 1, 'exactly one character changed');
  const changedLine = after.slice(0, diffs[0]).split('\n').pop() +
    after[diffs[0]] + after.slice(diffs[0] + 1).split('\n')[0];
  assert.equal(changedLine, '- [ ] done 250');
  RVApp.setEditPreview(false);
});

test('copying code degrades gracefully without a clipboard', async function (t) {
  if (skipIfNoDom(t)) return;
  await open('```js\nconst a = 1;\n```\n');
  app.errors.length = 0;
  const trigger = doc.querySelector('#preview [data-copy-code]');
  harness.click(win, trigger);
  await harness.settle(60);
  assert.deepEqual(app.errors, [], 'no clipboard must not throw: ' + app.errors.join(' | '));
  const label = trigger.querySelector('.code-copy-text');
  assert.ok(label.textContent.length > 0, 'the control reports an outcome either way');
});

test('pressing enter continues lists, task lists and quotes (regression)', async function (t) {
  if (skipIfNoDom(t)) return;

  const cases = [
    { before: '- [ ] first\n', expect: '- [ ] first\n- ' },
    { before: '  - nested item\n', expect: '  - nested item\n  - ' },
    { before: '> quoted line\n', expect: '> quoted line\n> ' },
    { before: '1. ordered\n', expect: '1. ordered\n1. ' },
    { before: 'plain paragraph\n', expect: 'plain paragraph\n' }
  ];

  await open(cases[0].before, 'indent.md');

  for (const c of cases) {
    const editor = doc.getElementById('editor');
    editor.value = c.before;
    editor.setSelectionRange(c.before.length, c.before.length);
    editor.dispatchEvent(new win.InputEvent('input', {
      bubbles: true, inputType: 'insertParagraph'
    }));
    assert.equal(editor.value, c.expect, JSON.stringify(c.before));
  }
});

test('the theme control cycles light, dark and system', async function (t) {
  if (skipIfNoDom(t)) return;
  const html = doc.documentElement;
  const btn = doc.getElementById('btnTheme');
  const sheets = ['ghLight', 'ghDark', 'hljsLight', 'hljsDark'].map(function (id) {
    return doc.getElementById(id);
  });

  const seen = [];
  for (let i = 0; i < 3; i++) {
    btn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    await harness.settle(20);
    seen.push(html.getAttribute('data-theme'));
    const dark = html.getAttribute('data-theme') === 'dark';
    assert.equal(sheets[0].disabled, dark, 'light markdown sheet');
    assert.equal(sheets[1].disabled, !dark, 'dark markdown sheet');
    assert.equal(sheets[2].disabled, dark, 'light highlight sheet');
    assert.equal(sheets[3].disabled, !dark, 'dark highlight sheet');
    assert.ok(btn.querySelector('svg.ic'), 'the button keeps an icon');
    assert.match(btn.getAttribute('title'), /^Theme: /);
  }
  assert.deepEqual(app.errors, [], app.errors.join(' | '));
  // three clicks from any state must come back round to the start
  btn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await harness.settle(20);
  assert.equal(html.getAttribute('data-theme'), seen[0]);
});

test('text size, wrapping and the sidebar all apply to the layout', async function (t) {
  if (skipIfNoDom(t)) return;
  app.errors.length = 0;
  RVApp.loadSample();
  await harness.settle(60);

  const before = parseInt(doc.documentElement.style.getPropertyValue('--rv-font'), 10);
  doc.getElementById('btnFontUp').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await harness.settle(20);
  assert.equal(parseInt(doc.documentElement.style.getPropertyValue('--rv-font'), 10), before + 1);
  doc.getElementById('btnFontDown').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await harness.settle(20);
  assert.equal(parseInt(doc.documentElement.style.getPropertyValue('--rv-font'), 10), before);

  doc.getElementById('btnWrap').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await harness.settle(20);
  assert.equal(doc.getElementById('editor').getAttribute('data-wrap'), '1');
  assert.equal(doc.getElementById('gutterInner').childElementCount, 0, 'wrapped lines have no numbers');
  doc.getElementById('btnWrap').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await harness.settle(20);
  assert.equal(doc.getElementById('editor').getAttribute('data-wrap'), '0');
  assert.ok(doc.getElementById('gutterInner').childElementCount > 1, 'numbers come back');

  doc.getElementById('btnToc').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await harness.settle(20);
  assert.equal(doc.getElementById('sidebar').hidden, true);
  doc.getElementById('btnToc').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await harness.settle(20);
  assert.equal(doc.getElementById('sidebar').hidden, false);

  assert.deepEqual(app.errors, [], app.errors.join(' | '));
});

test('the direction control overrides the automatic per-block direction', async function (t) {
  if (skipIfNoDom(t)) return;
  app.errors.length = 0;
  await open('# Title\n\nاین فارسی است.\n');

  const blocks = function () { return doc.querySelectorAll('#preview > *'); };
  assert.equal(blocks()[1].getAttribute('dir'), 'rtl');

  doc.querySelector('[data-dir="ltr"]').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await harness.settle(60);
  assert.equal(doc.querySelector('[data-dir="ltr"]').getAttribute('aria-pressed'), 'true');
  Array.prototype.forEach.call(blocks(), function (b) {
    assert.equal(b.getAttribute('dir'), 'ltr', 'manual LTR wins over detection');
  });

  doc.querySelector('[data-dir="auto"]').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await harness.settle(60);
  assert.equal(blocks()[1].getAttribute('dir'), 'rtl', 'auto detection comes back');
  assert.deepEqual(app.errors, [], app.errors.join(' | '));
});

test('saving and exporting clear the dirty state and never throw', async function (t) {
  if (skipIfNoDom(t)) return;
  app.errors.length = 0;
  await open('- [ ] a\n', 'save-me.md');
  RVApp.setEditPreview(true);
  await harness.settle(40);
  harness.click(win, taskBoxes()[0]);
  await harness.settle(160);
  assert.equal(RVApp.state.dirty, true);

  // No File System Access API in jsdom, so this exercises the download fallback.
  doc.getElementById('btnSave').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await harness.settle(60);
  assert.equal(RVApp.state.dirty, false, 'saving clears the unsaved flag');
  assert.equal(doc.getElementById('fileState').getAttribute('data-state'), 'clean');

  doc.getElementById('btnExport').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await harness.settle(60);
  assert.deepEqual(app.errors, [], app.errors.join(' | '));
});

test('clicking every toolbar control in turn stays error free', async function (t) {
  if (skipIfNoDom(t)) return;
  RVApp.loadSample();
  await harness.settle(80);
  app.errors.length = 0;

  const ids = ['btnTheme', 'btnWrap', 'btnSync', 'btnToc', 'btnEdit', 'btnFontUp',
    'btnFontDown', 'btnReload', 'btnSaveAs', 'btnHelp', 'btnHelpDone', 'btnEdit',
    'btnWrap', 'btnSync', 'btnToc', 'btnFontDown'];
  for (const id of ids) {
    doc.getElementById(id).dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    await harness.settle(20);
  }

  for (const btn of doc.querySelectorAll('[data-mode-btn]')) {
    btn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    await harness.settle(40);
  }
  assert.equal(doc.getElementById('panes').getAttribute('data-mode'), 'preview');

  for (const btn of doc.querySelectorAll('[data-dir]')) {
    btn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    await harness.settle(40);
  }
  assert.equal(doc.querySelector('[data-dir="rtl"]').getAttribute('aria-pressed'), 'true');

  // leave the app in a sane state for the tests that follow
  doc.querySelector('[data-mode-btn="split"]').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  doc.querySelector('[data-dir="auto"]').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await harness.settle(60);

  assert.deepEqual(app.errors, [], 'a toolbar click threw: ' + app.errors.join(' | '));
  assert.equal(doc.getElementById('preview').childElementCount > 0, true);
});

test('keyboard shortcuts reach the app from anywhere', async function (t) {
  if (skipIfNoDom(t)) return;
  app.errors.length = 0;
  const key = function (k, extra) {
    doc.body.dispatchEvent(new win.KeyboardEvent('keydown', Object.assign({
      key: k, ctrlKey: true, bubbles: true, cancelable: true
    }, extra || {})));
  };

  key('3');
  await harness.settle(40);
  assert.equal(doc.getElementById('panes').getAttribute('data-mode'), 'preview');

  key('1');
  await harness.settle(40);
  assert.equal(doc.getElementById('panes').getAttribute('data-mode'), 'write');

  // Ctrl+E is a toggle, and the app instance is shared between tests: assert the flip, not a value.
  const editBefore = RVApp.state.editPreview;
  key('e');
  await harness.settle(40);
  assert.equal(RVApp.state.editPreview, !editBefore, 'Ctrl+E turns interactive editing on or off');
  key('e');
  await harness.settle(40);
  assert.equal(RVApp.state.editPreview, editBefore, 'and back again');

  key('f');
  await harness.settle(40);
  assert.equal(doc.activeElement, doc.getElementById('tocFilter'));
  assert.equal(doc.getElementById('sidebar').hidden, false);

  key('2');
  await harness.settle(40);
  assert.deepEqual(app.errors, [], app.errors.join(' | '));
});

test('a stale preview cannot toggle another task after source reordering', async function (t) {
  if (skipIfNoDom(t)) return;
  await open('- [ ] first\n- [ ] second\n');
  RVApp.setEditPreview(true);
  const box = taskBoxes()[0];
  const changed = '- [ ] second\n- [ ] first\n';
  doc.getElementById('editor').value = changed;
  harness.click(win, box);
  assert.equal(editorValue(), changed);
  await harness.settle(160);
  assert.equal(RVApp.state.tasks[0].label, 'second');
});

function deferredHandle(name, fail) {
  let complete;
  const gate = new Promise(resolve => { complete = resolve; });
  let writes = 0;
  const handle = { name, kind: 'file', createWritable: async () => ({
    write: async () => { writes++; await gate; if (fail) throw new Error('disk full'); },
    close: async () => {}
  }) };
  return { handle, complete, writes: () => writes };
}

test('typing during save stays dirty and simultaneous saves share one write', async function (t) {
  if (skipIfNoDom(t)) return;
  const disk = deferredHandle('draft.md');
  RVApp.setDoc('old', 'draft.md', disk.handle);
  const first = RVApp.save(false);
  const second = RVApp.save(false);
  assert.equal(first, second);
  doc.getElementById('editor').value = 'new';
  doc.getElementById('editor').dispatchEvent(new win.Event('input', { bubbles: true }));
  disk.complete();
  assert.equal(await first, true);
  assert.equal(disk.writes(), 1);
  assert.equal(RVApp.state.saved, 'old');
  assert.equal(RVApp.state.dirty, true);
});

test('completion of an older save never overwrites a newly opened document', async function (t) {
  if (skipIfNoDom(t)) return;
  const disk = deferredHandle('old.md');
  RVApp.setDoc('old', 'old.md', disk.handle);
  const saving = RVApp.save(false);
  RVApp.setDoc('replacement', 'new.md', null);
  disk.complete();
  await saving;
  assert.equal(RVApp.state.name, 'new.md');
  assert.equal(RVApp.state.saved, 'replacement');
  assert.equal(RVApp.state.handle, null);
});

test('failed Save As preserves the original file name and handle', async function (t) {
  if (skipIfNoDom(t)) return;
  const old = deferredHandle('old.md');
  const disk = deferredHandle('new.md', true);
  RVApp.setDoc('content', 'old.md', old.handle);
  win.showSaveFilePicker = async () => disk.handle;
  try {
    const saving = RVApp.save(true);
    disk.complete();
    assert.equal(await saving, false);
    assert.equal(RVApp.state.name, 'old.md');
    assert.equal(RVApp.state.handle, old.handle);
  } finally { delete win.showSaveFilePicker; }
});

test('saving from the discard dialog does not discard text typed during the write', async function (t) {
  if (skipIfNoDom(t)) return;
  const disk = deferredHandle('draft.md');
  RVApp.setDoc('saved', 'draft.md', disk.handle);
  const editor = doc.getElementById('editor');
  editor.value = 'draft';
  editor.dispatchEvent(new win.Event('input', { bubbles: true }));
  let opened = 0;
  win.showOpenFilePicker = async () => { opened++; return []; };
  try {
    harness.click(win, doc.getElementById('btnOpen'));
    await harness.settle(20);
    harness.click(win, doc.getElementById('btnConfirmSave'));
    await harness.settle(20);
    editor.value = 'newer draft';
    editor.dispatchEvent(new win.Event('input', { bubbles: true }));
    disk.complete();
    await harness.settle(60);
    assert.equal(opened, 0);
    assert.equal(RVApp.state.dirty, true);
  } finally { delete win.showOpenFilePicker; }
});

test('HTML export renders pending source changes and freezes checkboxes', async function (t) {
  if (skipIfNoDom(t)) return;
  await open('# Old\n\n- [ ] task\n');
  RVApp.setEditPreview(true);
  doc.getElementById('editor').value = '# Latest\n\n- [x] task\n';
  let exported;
  const original = win.RV.Export.build;
  win.RV.Export.build = opts => { exported = opts; return original(opts); };
  try { harness.click(win, doc.getElementById('btnExport')); }
  finally { win.RV.Export.build = original; }
  assert.match(exported.html, /Latest/);
  const holder = doc.createElement('div');
  holder.innerHTML = exported.html;
  assert.equal(holder.querySelector('input').checked, true);
  assert.equal(holder.querySelector('input').disabled, true);
});

test('Tab indents an empty line and keeps multiline selection aligned', async function (t) {
  if (skipIfNoDom(t)) return;
  await open('');
  const editor = doc.getElementById('editor');
  const tab = shift => editor.dispatchEvent(new win.KeyboardEvent('keydown', {
    key: 'Tab', shiftKey: shift, bubbles: true, cancelable: true
  }));
  tab(false);
  assert.equal(editor.value, '  ');
  assert.equal(editor.selectionStart, 2);
  editor.value = 'a\nb\nc';
  editor.setSelectionRange(0, 4);
  tab(false);
  assert.equal(editor.value, '  a\n  b\nc');
  assert.equal(editor.selectionStart, 2);
  assert.equal(editor.selectionEnd, 8);
  tab(true);
  assert.equal(editor.value, 'a\nb\nc');
  assert.equal(editor.selectionStart, 0);
  assert.equal(editor.selectionEnd, 4);
});

test('dropping multiple files attaches the handle of the chosen Markdown file', async function (t) {
  if (skipIfNoDom(t)) return;
  RVApp.setEmpty();
  const data = new TextEncoder().encode('# Chosen');
  const other = { name: 'photo.png' };
  const chosen = { name: 'chosen.md', arrayBuffer: async () => data.buffer };
  const wrong = { name: 'photo.png', kind: 'file' };
  const correct = { name: 'chosen.md', kind: 'file' };
  const dt = { types: ['Files'], files: [other, chosen], items: [
    { kind: 'file', getAsFile: () => other, getAsFileSystemHandle: async () => wrong },
    { kind: 'file', getAsFile: () => chosen, getAsFileSystemHandle: async () => correct }
  ] };
  const event = new win.Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: dt });
  win.dispatchEvent(event);
  await harness.settle(60);
  assert.equal(RVApp.state.name, 'chosen.md');
  assert.equal(RVApp.state.handle, correct);
});

test('Android native save waits for the document picker and preserves dirty state on cancellation', async function (t) {
  if (skipIfNoDom(t)) return;
  await open('original', 'android.md');
  const editor = doc.getElementById('editor');
  editor.value = 'edited';
  editor.dispatchEvent(new win.Event('input', { bubbles: true }));
  let request;
  win.AndroidFiles = { save: (text, name, mime, id) => { request = { text, name, mime, id }; } };
  try {
    const saving = RVApp.save(false);
    assert.equal(request.text, 'edited');
    assert.equal(request.name, 'android.md');
    assert.equal(RVApp.state.dirty, true, 'do not mark saved before native completion');
    win.RV.Android.complete(request.id, false, 'Save cancelled.');
    assert.equal(await saving, false);
    assert.equal(RVApp.state.dirty, true);
    const retry = RVApp.save(false);
    win.RV.Android.complete(request.id, true, '');
    assert.equal(await retry, true);
    assert.equal(RVApp.state.dirty, false);
  } finally { delete win.AndroidFiles; }
});
