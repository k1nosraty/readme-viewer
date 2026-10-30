'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const harness = require('./helpers/dom.js');
let app;
after(() => { if (app) app.window.close(); });

test('diagram integration preserves source, isolates SVG, and exports pending diagrams', async () => {
  let calls = 0;
  app = await harness.loadApp({ beforeParse(win) {
    win.mermaid = {
      initialize(options) { assert.equal(options.securityLevel, 'strict'); assert.equal(options.htmlLabels, false); },
      async render(id, text) {
        calls++;
        return { svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><style>#' + id + '{fill:blue} .x{fill:url(https://bad.invalid/a)}</style><script>alert(1)</script><foreignObject><div>bad</div></foreignObject><a href="javascript:alert(1)"><text>bad</text></a><image href="https://bad.invalid/track"/><text onclick="alert(1)">' + (text.includes('سلام') ? 'سلام' : 'A') + '</text><path marker-end="url(#arrow)"/></svg>' };
      }
    };
  } });
  const { window: win, document: doc } = app;
  const diagrams = win.RV.Diagrams, api = win.RVApp;
  assert.equal(doc.querySelector('script[src*="mermaid.full"]'), null, 'ordinary startup never loads the bundle');
  const source = '# Diagram\n\n```mermaid\nflowchart TD\n A[سلام] --> B\n```\n';
  api.setDoc(source, 'diagram.md');
  await diagrams.render(doc.getElementById('preview'));
  const block = doc.querySelector('#preview .code-block');
  assert.ok(block.classList.contains('diagram-rendered'));
  assert.equal(block.querySelector('pre').hidden, true);
  const svg = decodeURIComponent(block.querySelector('.diagram-figure img').getAttribute('src').split(',').slice(1).join(','));
  assert.match(svg, /سلام/);
  assert.doesNotMatch(svg, /<script|foreignObject|<image|onclick|javascript:|bad.invalid/);
  assert.match(svg, /url\(#arrow\)/);
  assert.equal(block.querySelector('svg'), null, 'diagram CSS is isolated inside an image');
  block.querySelector('.diagram-tools button').click();
  assert.equal(block.querySelector('pre').hidden, false);
  assert.equal(doc.getElementById('editor').value, source);
  assert.equal(api.state.dirty, false);
  const originalCalls = calls;
  api.render({ immediate: true }); await diagrams.render(doc.getElementById('preview'));
  assert.equal(calls, originalCalls, 'unchanged diagrams reuse bounded cache');
  api.newTab('```mermaid\nflowchart LR\n C --> D\n```', 'other.md');
  api.showComparison(); await diagrams.render(doc.getElementById('comparisonPreview'));
  assert.ok(doc.querySelector('#comparisonPreview .diagram-figure img'));
  doc.documentElement.setAttribute('data-theme', 'dark');
  await diagrams.render(doc.getElementById('preview'));
  assert.ok(calls > originalCalls, 'theme participates in render cache key');
  let exported;
  const build = win.RV.Export.build;
  win.RV.Export.build = options => { exported = options; return build(options); };
  doc.getElementById('editor').value = source.replace('A[سلام]', 'A[Export]');
  doc.getElementById('editor').dispatchEvent(new win.Event('input', { bubbles: true }));
  doc.getElementById('btnExport').click();
  for (let n = 0; n < 30 && !exported; n++) await harness.settle(20);
  assert.ok(exported);
  assert.match(exported.html, /data:image\/svg\+xml/);
  assert.doesNotMatch(exported.html, /diagram-tools|aria-busy/);
  assert.match(exported.html, /A\[Export\]/, 'source is retained in standalone export');
  const downloaded = [];
  diagrams.download = (svg, name, mime) => { downloaded.push({ svg, name, mime }); return Promise.resolve(true); };
  await diagrams.render(doc.getElementById('preview'));
  doc.querySelector('#preview .diagram-tools button:nth-of-type(3)').click();
  assert.equal(downloaded[0].name, 'diagram.svg');
  assert.match(downloaded[0].mime, /^image\/svg\+xml/);
  assert.doesNotMatch(downloaded[0].svg, /bad.invalid/);
  assert.deepEqual(app.errors, []);
});

test('diagram errors retain source and unsupported embedded config never reaches renderer', async () => {
  const { document: doc, window: win } = app;
  let calls = 0;
  win.mermaid.render = async () => { calls++; throw new Error('invalid syntax'); };
  for (const text of ['not a diagram', '%%{init: {"securityLevel":"loose"}}%%\nflowchart TD\nA-->B', '---\nconfig:\n theme: dark\n---\nflowchart TD\nA-->B', 'flowchart TD\nA@{ img: "https://bad.invalid/a" }', 'flowchart TD\nA-->B\nclassDef bad fill:red;}body{color:red}', 'x'.repeat(50001)]) {
    win.RVApp.setDoc('```mermaid\n' + text + '\n```', 'bad.md');
    await win.RV.Diagrams.render(doc.getElementById('preview'));
    assert.equal(doc.querySelector('#preview pre').hidden, false);
    assert.ok(doc.querySelector('#preview .diagram-message'));
    assert.equal(doc.querySelector('#preview .diagram-figure'), null);
  }
  assert.equal(calls, 1);
});
