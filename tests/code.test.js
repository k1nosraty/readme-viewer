'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readdirSync } = require('node:fs');
const path = require('node:path');
const { hasDom, loadApp, waitFor } = require('./helpers/dom');
const { languages, language, foldRanges, suggestedName } = require('../src/code');

test('language picker lists every packaged offline grammar', () => {
  const bundled = require('../vendor/highlight.min.js').listLanguages();
  const files = readdirSync(path.resolve(__dirname, '../vendor/langs')).filter(name => name.endsWith('.min.js'));
  const grammarIds = new Set([...bundled, ...files.map(name => name.slice(0, -7))]);
  assert.deepEqual(languages.map(([id]) => id).sort(), [...grammarIds].sort());
});

async function workspace(t) {
  const app = await loadApp({ beforeParse(window) { window.TextDecoder = TextDecoder; } });
  t.after(() => app.dom.window.close());
  return { ...app, viewer: app.window.RVApp };
}

test('identifies common source extensions, well-known names and executable scripts', () => {
  for (const [name, lang] of [['main.cpp', 'cpp'], ['MAIN.C', 'c'], ['main.py', 'python'],
    ['index.html', 'xml'], ['styles.css', 'css'], ['app.kt', 'kotlin'], ['Dockerfile', 'dockerfile'],
    ['App.java', 'java'], ['app.mjs', 'javascript'], ['app.dart', 'dart'], ['app.tsx', 'typescript'],
    ['main.go', 'go'], ['main.rs', 'rust'], ['app.scala', 'scala'], ['main.exs', 'elixir'],
    ['main.hs', 'haskell'], ['main.f90', 'fortran'], ['app.xaml', 'xml'], ['schema.proto', 'protobuf']]) {
    assert.equal(language(name, ''), lang);
  }
  assert.equal(language('tools', '#!/usr/bin/env python3\nprint(1)'), 'python');
  assert.equal(language('view.m', '#import <Foundation/Foundation.h>'), 'objectivec');
  assert.equal(language('plot.m', 'function y = f(x)'), 'matlab');
  assert.equal(language('locale.ts', '<?xml version="1.0"?><TS version="2.1">'), 'xml');
  assert.equal(language('terrain.tsx', '<tileset version="1.10">'), 'xml');
  assert.equal(language('config.cfg', '[Appearance]\nMode=Dark'), '');
  assert.equal(language('README.md', '#!/usr/bin/env python3\nprint(1)'), '');
});

test('fold ranges handle brace styles and adjacent branches', () => {
  const ranges = foldRanges(['void f()', '{', '  if (enabled) {', '    do_a();', '  } else {',
    '    do_b();', '  }', '}'], 'cpp');
  assert.deepEqual([...ranges.entries()], [[2, 3], [4, 6], [0, 7]]);
});

test('new files use the selected language’s customary extension', () => {
  const examples = { 'code:cpp': 'Untitled.cpp', 'code:go': 'Untitled.go', 'code:java': 'Untitled.java',
    'code:python': 'Untitled.py', 'code:html': 'Untitled.html', 'code:xml': 'Untitled.xml',
    'code:toml': 'Untitled.toml', 'code:dockerfile': 'Dockerfile', json: 'Untitled.json', ini: 'Untitled.ini' };
  for (const [format, name] of Object.entries(examples)) assert.equal(suggestedName(format), name);
});

test('source files use syntax highlighting, balanced blocks and safe inert HTML', { skip: !hasDom }, async t => {
  const { viewer, document, errors } = await workspace(t);
  const preview = document.querySelector('#preview');
  const examples = [
    ['tool.py', 'def hello(\n    name: str,\n):\n    """a docstring\nwithout indentation\n    """\n    if name:\n        print("literal :")\n\n# next\nprint("ok")', 2],
    ['tool.cpp', '#include <iostream>\nint f()\n{\n  auto s = R"x(\n}\n)x";\n  // }\n  return 1;\n}', 1],
    ['tool.kt', 'fun hello() {\n    val value = """\n}\n"""\n    println(value)\n}', 1],
    ['site.css', '@media (min-width: 50em) {\n  .layout {\n    content: "}";\n  }\n}', 2],
    ['index.html', '<main>\n  <img src=x onerror=alert(1)>\n  <script>\n    const raw = "<aside>";\n  </script>\n</main>', 2]
  ];
  for (const [name, source, folds] of examples) {
    viewer.setDoc(source, name);
    assert.equal(preview.querySelectorAll('.code-fold').length, folds, name);
    assert.equal(preview.querySelectorAll('script, img').length, 0, name);
    assert.equal(Array.from(preview.querySelectorAll('.code-line-text'), node => node.textContent).join('\n'), source, name);
    assert.ok(preview.querySelector('.code-line-text span[class^="hljs-"]'), name);
    assert.equal(viewer.el.editor.value, source, name);
  }
  assert.deepEqual(errors, []);
});

test('Dart loads offline syntax and folds through strings and comments', { skip: !hasDom }, async t => {
  const { viewer, document } = await workspace(t);
  const source = 'void main() {\n  // }\n  final text = """\n}\n""";\n  print(text);\n}';
  viewer.setDoc(source, 'main.dart');
  await waitFor(() => document.querySelector('#preview .code-fold'), 3000);
  const fold = document.querySelector('#preview .code-fold');
  assert.equal(fold.querySelector('.code-hidden-count').textContent, '… 6 lines');
  assert.ok(fold.querySelector('.hljs-string'));
});

test('preview editing updates only the selected source range and supports undo', { skip: !hasDom }, async t => {
  const { viewer, document, window, errors } = await workspace(t);
  const input = document.querySelector('#previewEditInput');
  const dialog = document.querySelector('#previewEditDialog');
  const form = document.querySelector('#previewEditForm');
  function submit(value) {
    input.value = value;
    form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  }
  function edit(selector) { document.querySelector(selector).click(); assert.equal(dialog.open, true); }
  viewer.setEditPreview(true);
  viewer.setDoc('{"keep":9007199254740993, "change":true}', 'settings.json');
  edit('#preview .structured-row:last-child .preview-edit-control');
  assert.equal(input.value, 'true');
  submit('unquoted');
  assert.equal(dialog.open, true);
  assert.equal(viewer.state.dirty, false);
  submit('"longer"');
  assert.equal(viewer.el.editor.value, '{"keep":9007199254740993, "change":"longer"}');
  assert.equal(viewer.state.dirty, true);
  viewer.el.editor.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
  assert.equal(viewer.el.editor.value, '{"keep":9007199254740993, "change":true}');

  viewer.setDoc('; note\n[View]\nstyle = dark\nstyle=light', 'viewer.conf');
  edit('#preview .structured-branch .structured-row .preview-edit-control');
  submit('system');
  assert.equal(viewer.el.editor.value, '; note\n[View]\nstyle = system\nstyle=light');

  viewer.setDoc('# Heading\n\nBody here.\n\n- [ ] Task\n', 'README.md');
  document.querySelectorAll('#preview .preview-edit-tools button')[1].click();
  assert.equal(input.value, 'Body here.');
  submit('Changed **body**.');
  assert.equal(viewer.el.editor.value, '# Heading\n\nChanged **body**.\n\n- [ ] Task\n');
  assert.equal(document.querySelector('#preview strong').textContent, 'body');
  assert.deepEqual(errors, []);
});

test('inline code edits share the saved source and undo history', { skip: !hasDom }, async t => {
  const { viewer, document, window, errors } = await workspace(t);
  viewer.setDoc('def f():\n    return 1\n', 'viewer.py');
  viewer.setEditPreview(true);
  const input = document.querySelector('#preview textarea');
  assert.equal(input.value, viewer.el.editor.value);
  input.setSelectionRange(20, 21);
  input.dispatchEvent(new window.InputEvent('beforeinput', { inputType: 'insertText' }));
  input.setRangeText('22', 20, 21, 'end');
  input.dispatchEvent(new window.InputEvent('input', { inputType: 'insertText' }));
  assert.equal(viewer.el.editor.value, 'def f():\n    return 22\n');
  assert.equal(viewer.state.dirty, true);
  input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
  assert.equal(input, document.querySelector('#preview textarea'));
  assert.equal(input.value, 'def f():\n    return 1\n');
  viewer.setEditPreview(false);
  assert.equal(document.querySelector('#preview textarea'), null);
  assert.equal(document.querySelector('#preview .code-fold').open, true);
  assert.deepEqual(errors, []);
});
