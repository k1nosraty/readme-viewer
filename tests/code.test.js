'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { hasDom, loadApp } = require('./helpers/dom');
const { language, foldRanges } = require('../src/code');

async function workspace(t) {
  const app = await loadApp({ beforeParse(window) { window.TextDecoder = TextDecoder; } });
  t.after(() => app.dom.window.close());
  return { ...app, viewer: app.window.RVApp };
}

test('identifies common source extensions, well-known names and executable scripts', () => {
  for (const [name, lang] of [['main.cpp', 'cpp'], ['MAIN.C', 'c'], ['main.py', 'python'],
    ['index.html', 'xml'], ['styles.css', 'css'], ['app.kt', 'kotlin'], ['Dockerfile', 'dockerfile']]) {
    assert.equal(language(name, ''), lang);
  }
  assert.equal(language('tools', '#!/usr/bin/env python3\nprint(1)'), 'python');
  assert.equal(language('README.md', '#!/usr/bin/env python3\nprint(1)'), '');
});

test('fold ranges handle brace styles and adjacent branches', () => {
  const ranges = foldRanges(['void f()', '{', '  if (enabled) {', '    do_a();', '  } else {',
    '    do_b();', '  }', '}'], 'cpp');
  assert.deepEqual([...ranges.entries()], [[2, 3], [4, 6], [0, 7]]);
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

  viewer.setDoc('def f():\n    return 1\n', 'viewer.py');
  edit('#preview button[data-line="2"]');
  assert.equal(input.value, '    return 1');
  submit('    return 22');
  assert.equal(viewer.el.editor.value, 'def f():\n    return 22\n');

  viewer.setDoc('# Heading\n\nBody here.\n\n- [ ] Task\n', 'README.md');
  document.querySelectorAll('#preview .preview-edit-tools button')[1].click();
  assert.equal(input.value, 'Body here.');
  submit('Changed **body**.');
  assert.equal(viewer.el.editor.value, '# Heading\n\nChanged **body**.\n\n- [ ] Task\n');
  assert.equal(document.querySelector('#preview strong').textContent, 'body');
  assert.deepEqual(errors, []);
});
