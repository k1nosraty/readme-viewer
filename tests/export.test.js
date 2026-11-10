'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Exporter = require('../src/export.js');
const { JSDOM } = require('jsdom');

test('export contains no application CSS dependencies and escapes the title', () => {
  const html = Exporter.build({ title: '<script>bad</script>', html: '<p>text</p>', theme: 'light' });
  const dom = new JSDOM(html);
  assert.equal(dom.window.document.querySelector('link'), null);
  assert.equal(dom.window.document.title, '<script>bad</script>');
  assert.equal(dom.window.document.querySelector('script'), null);
  dom.window.close();
});

test('an explicit dark export is dark without a dark system preference', () => {
  const dom = new JSDOM(Exporter.build({ html: '<p>text</p>', theme: 'dark' }));
  assert.equal(dom.window.getComputedStyle(dom.window.document.body).backgroundColor, 'rgb(13, 17, 23)');
  dom.window.close();
});

test('standalone structured exports retain syntax and contain long code lines', () => {
  const html = Exporter.build({
    html: '<div class="code-surface"><span class="hljs-keyword">return</span></div>',
    structured: true,
    theme: 'dark'
  });
  assert.match(html, /data-theme="dark"\]\{--token-keyword:#ff7b72/);
  assert.match(html, /\.hljs-keyword[^{}]*\{color:var\(--token-keyword\)\}/);
  assert.match(html, /\.code-surface\{overflow-x:auto\}/);
});
