'use strict';

/* Syntax highlighting: language aliases, the result cache and graceful unknown languages. */

const test = require('node:test');
const assert = require('node:assert');

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

const Highlight = require('../src/highlight.js');

const LANG_DIR = path.join(__dirname, '..', 'vendor', 'langs');

let hljs = null;
try { hljs = require('../vendor/highlight.min.js'); } catch (e) { hljs = null; }

/** The smallest thing src/highlight.js needs from a <code> element. */
function codeNode(lang, text) {
  return {
    className: lang ? 'hljs language-' + lang : 'hljs',
    textContent: text,
    innerHTML: '',
    isConnected: true,
    classList: { add: function () {} }
  };
}

test('lazy language loading highlights every waiting block and skips detached ones', function () {
  const scripts = [], highlighted = [];
  let loaded = false;
  const filename = require.resolve('../src/highlight.js');
  const context = { module: { exports: {} }, require: createRequire(filename), document: {
    createElement: () => ({ remove() {} }),
    head: { appendChild: script => scripts.push(script) }
  } };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context);
  const h = context.module.exports.create({ hljs: {
    getLanguage: () => loaded,
    highlight(code) { highlighted.push(code); return { value: '<span>' + code + '</span>' }; }
  } });
  const detached = codeNode('rust', 'old');
  const first = codeNode('rust', 'first');
  const second = codeNode('rust', 'second');
  h.block(detached); detached.isConnected = false;
  h.block(first); h.block(second); h.block(first);
  assert.equal(scripts.length, 1, 'one grammar request serves all code blocks');
  loaded = true; scripts[0].onload();
  assert.deepEqual(highlighted, ['first', 'second']);
  assert.equal(first.innerHTML, '<span>first</span>');
  assert.equal(second.innerHTML, '<span>second</span>');
  assert.equal(detached.innerHTML, '');
});

test('every alias resolves to something highlight.js understands', function (t) {
  if (!hljs) { t.skip('highlight.js could not be loaded'); return; }
  const h = Highlight.create({ hljs: hljs });

  // Contract: resolve() returns a name that either ships inside highlight.js or exists as a
  // lazy-loadable grammar in vendor/langs — never a name that would 404.
  function available(name) {
    return !!hljs.getLanguage(name) ||
      fs.existsSync(path.join(LANG_DIR, name + '.min.js'));
  }

  const cases = ['js', 'ts', 'py', 'sh', 'yml', 'golang', 'plaintext', 'javascript', 'vue',
    'ps1', 'tex', 'sol', 'org', 'adoc', 'cmd', 'clj', 'ex', 'jl', 'f', 'jinja', 'bat'];
  cases.forEach(function (lang) {
    const resolved = h.resolve(lang);
    assert.ok(available(resolved), lang + ' -> ' + resolved + ' has no grammar we can load');
  });

  // The whole alias table must satisfy the same rule.
  Object.keys(Highlight.ALIAS).forEach(function (lang) {
    const resolved = h.resolve(lang);
    assert.ok(available(resolved), 'alias ' + lang + ' -> ' + resolved + ' is unloadable');
  });

  assert.equal(h.resolve('javascript'), 'javascript', 'a real name passes through');
  assert.equal(h.resolve('sol'), 'plaintext', 'a language we do not ship degrades to plain text');
  assert.equal(h.resolve(''), '', 'no language at all stays empty');
});

test('a code block is highlighted in place', function (t) {
  if (!hljs) { t.skip('highlight.js could not be loaded'); return; }
  const h = Highlight.create({ hljs: hljs });
  const node = codeNode('javascript', 'const a = 1;');
  h.block(node);
  assert.match(node.innerHTML, /hljs-keyword/);
  assert.match(node.innerHTML, /const/);
});

test('identical blocks are highlighted once and then served from the cache', function (t) {
  if (!hljs) { t.skip('highlight.js could not be loaded'); return; }
  const h = Highlight.create({ hljs: hljs });
  const first = codeNode('python', 'print(1)');
  const second = codeNode('python', 'print(1)');
  const third = codeNode('python', 'print(2)');

  h.block(first);
  assert.equal(h.cacheSize(), 1);
  h.block(second);
  assert.equal(h.cacheSize(), 1, 'same language + same code must not be re-highlighted');
  assert.equal(second.innerHTML, first.innerHTML);
  h.block(third);
  assert.equal(h.cacheSize(), 2);
});

test('large highlighted blocks cannot grow the cache beyond its memory budget', function () {
  let calls = 0;
  const h = Highlight.create({ hljs: {
    getLanguage: () => true,
    highlight(code) { calls++; return { value: code }; }
  } });
  const code = 'a'.repeat(600000);
  h.block(codeNode('text', code));
  h.block(codeNode('text', code));
  assert.equal(calls, 1, 'a fitting block is cached');
  h.block(codeNode('text', 'b'.repeat(600000)));
  assert.equal(h.cacheSize(), 1, 'old source and HTML are evicted together');
  h.block(codeNode('text', 'c'.repeat(1100000)));
  assert.equal(h.cacheSize(), 1, 'an oversized entry does not displace reusable entries');
  h.clear();
  h.block(codeNode('text', code));
  assert.equal(h.cacheSize(), 1);
});

test('an unknown language is left as plain text instead of throwing', function (t) {
  if (!hljs) { t.skip('highlight.js could not be loaded'); return; }
  const h = Highlight.create({ hljs: hljs });
  const node = codeNode('not-a-real-language', 'whatever');
  h.block(node);
  assert.equal(node.innerHTML, '', 'the original text stays untouched');
});

test('a block with no language is left alone', function (t) {
  if (!hljs) { t.skip('highlight.js could not be loaded'); return; }
  const h = Highlight.create({ hljs: hljs });
  const node = codeNode('', 'plain text');
  h.block(node);
  assert.equal(node.innerHTML, '');
});
