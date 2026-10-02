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
