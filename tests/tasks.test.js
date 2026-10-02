'use strict';

/*
 * Interactive task lists: the mapping between a rendered checkbox and the exact "[ ]" / "[x]"
 * marker in the Markdown source, and the edit that toggles it.
 */

const test = require('node:test');
const assert = require('node:assert');

const marked = require('../vendor/marked.umd.js');
const Markdown = require('../src/markdown.js');
const Tasks = require('../src/tasks.js');

const md = Markdown.create({ marked: marked }, { strings: function (k) { return k; } });

/** Render a document exactly the way the app does, then collect the task map from its tokens. */
function collect(source) {
  md.reset();
  const tokens = md.lexer(source);
  let html = '';
  for (let i = 0; i < tokens.length; i++) html += md.renderBlock(tokens[i], tokens.links);
  const result = Tasks.collectTasks(tokens, source);
  result.domCount = md.taskCount();
  result.html = html;
  return result;
}

function markerAt(source, task) {
  return source.slice(task.start, task.end);
}

test('finds every task list item in document order', function () {
  const src = [
    '# Plan',
    '',
    '- [ ] first',
    '- [x] second',
    '- [X] third',
    ''
  ].join('\n');

  const r = collect(src);
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.tasks.length, 3);
  assert.equal(r.domCount, 3, 'the renderer must produce exactly one checkbox per task');
  assert.deepEqual(r.tasks.map(function (t) { return t.checked; }), [false, true, true]);
  assert.deepEqual(r.tasks.map(function (t) { return markerAt(src, t); }), ['[ ]', '[x]', '[X]']);
  assert.deepEqual(r.tasks.map(function (t) { return t.line; }), [2, 3, 4]);
  assert.deepEqual(r.tasks.map(function (t) { return t.label; }), ['first', 'second', 'third']);
});

test('identical task labels map to distinct source positions', function () {
  const src = '- [ ] Install Qt\n- [ ] Install Qt\n- [ ] Install Qt\n';
  const r = collect(src);
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.tasks.length, 3);

  const positions = r.tasks.map(function (t) { return t.start; });
  assert.equal(new Set(positions).size, 3, 'each duplicate needs its own offset');

  // Toggling the second one must not touch the first or the third.
  const out = Tasks.toggleTask(src, r.tasks[1]);
  assert.equal(out.text, '- [ ] Install Qt\n- [x] Install Qt\n- [ ] Install Qt\n');
  assert.equal(out.checked, true);
});

test('nested task lists keep their order and positions', function () {
  const src = [
    '- [ ] outer one',
    '  - [x] inner a',
    '  - [ ] inner b',
    '    - [x] deep',
    '- [ ] outer two',
    ''
  ].join('\n');

  const r = collect(src);
  assert.equal(r.ok, true, r.reason);
  assert.deepEqual(r.tasks.map(function (t) { return t.label; }),
    ['outer one', 'inner a', 'inner b', 'deep', 'outer two']);
  assert.deepEqual(r.tasks.map(function (t) { return t.line; }), [0, 1, 2, 3, 4]);

  const out = Tasks.toggleTask(src, r.tasks[3]);
  assert.equal(out.text.split('\n')[3], '    - [ ] deep');
  assert.equal(out.text.split('\n')[1], '  - [x] inner a', 'neighbours untouched');
});

test('Persian and mixed Persian/English task text', function () {
  const src = [
    '- [ ] یادگیری PostgreSQL',
    '- [x] Learn Git',
    '- [ ] نصب Qt روی ویندوز',
    '- [x] mixed متن and English',
    ''
  ].join('\n');

  const r = collect(src);
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.tasks.length, 4);
  assert.deepEqual(r.tasks.map(function (t) { return t.checked; }), [false, true, false, true]);

  const out = Tasks.toggleTask(src, r.tasks[0]);
  assert.equal(out.text.split('\n')[0], '- [x] یادگیری PostgreSQL');
  assert.equal(out.text.slice(src.indexOf('Learn Git')), src.slice(src.indexOf('Learn Git')));
});

test('task lists inside block quotes and ordered lists', function () {
  const src = [
    '> - [ ] quoted task',
    '> - [x] quoted done',
    '',
    '1. [ ] ordered one',
    '2. [x] ordered two',
    ''
  ].join('\n');

  const r = collect(src);
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.tasks.length, 4);
  assert.equal(r.domCount, 4);
  assert.deepEqual(r.tasks.map(function (t) { return markerAt(src, t); }), ['[ ]', '[x]', '[ ]', '[x]']);

  assert.equal(Tasks.toggleTask(src, r.tasks[0]).text.split('\n')[0], '> - [x] quoted task');
  assert.equal(Tasks.toggleTask(src, r.tasks[2]).text.split('\n')[3], '1. [x] ordered one');
});

test('markers inside fenced and indented code are not tasks', function () {
  const src = [
    '- [ ] real task',
    '',
    '```md',
    '- [ ] not a task',
    '```',
    '',
    '        - [ ] also not a task',
    '',
    '- [x] another real task',
    ''
  ].join('\n');

  const r = collect(src);
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.tasks.length, 2, 'code blocks must be ignored');
  assert.equal(r.domCount, 2);
  assert.deepEqual(r.tasks.map(function (t) { return t.label; }), ['real task', 'another real task']);
});

test('toggling only rewrites the three marker characters', function () {
  const src = [
    '# Heading',
    '',
    'Some **bold** intro with `code`.',
    '',
    '- [ ] keep my formatting',
    '',
    '> untouched quote',
    '',
    '```js',
    'const a = 1;',
    '```',
    '',
    'Trailing line.',
    ''
  ].join('\n');

  const r = collect(src);
  const before = src.split('');
  const out = Tasks.toggleTask(src, r.tasks[0]);

  assert.equal(out.text.length, src.length, 'length must not change');
  let diff = [];
  for (let i = 0; i < src.length; i++) {
    if (src[i] !== out.text[i]) diff.push(i);
  }
  assert.deepEqual(diff, [r.tasks[0].start + 1], 'exactly one character differs');
  assert.equal(before[r.tasks[0].start + 1], ' ');
  assert.equal(out.text[r.tasks[0].start + 1], 'x');
});

test('toggling twice restores the original document byte for byte', function () {
  const src = '  - [X] upper case marker\n';
  const r = collect(src);
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.tasks[0].checked, true);

  const once = Tasks.toggleTask(src, r.tasks[0]);
  assert.equal(once.text, '  - [ ] upper case marker\n');

  const again = Tasks.toggleTask(once.text, r.tasks[0]);
  assert.equal(again.text, '  - [x] upper case marker\n', 're-checking uses lower case x');
});

test('refuses to edit when the map is stale', function () {
  const src = '- [ ] task\n';
  const r = collect(src);
  const edited = '- [x] task that grew longer\n';
  assert.equal(Tasks.toggleTask(edited, { start: 2, end: 999 }), null);
  assert.equal(Tasks.toggleTask('- plain text\n', r.tasks[0]), null);
  assert.equal(Tasks.toggleTask(src, null), null);
});

test('reports a problem instead of guessing when the source does not match the tokens', function () {
  md.reset();
  const tokens = md.lexer('- [ ] honest task\n');
  // Same tokens, different source: the marker is no longer where the token tree says it is.
  const r = Tasks.collectTasks(tokens, '- no marker here\n');
  assert.equal(r.ok, false);
  assert.match(r.reason, /no task marker found/);
  assert.equal(r.tasks.length, 0);
});

test('isMarker recognises exactly the three marker forms', function () {
  assert.equal(Tasks.isMarker('[ ]'), true);
  assert.equal(Tasks.isMarker('[x]'), true);
  assert.equal(Tasks.isMarker('[X]'), true);
  assert.equal(Tasks.isMarker('[-]'), false);
  assert.equal(Tasks.isMarker('[ ]x'), false);
  assert.equal(Tasks.isMarker(''), false);
});
