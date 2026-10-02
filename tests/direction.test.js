'use strict';

/* Direction and language detection: the shell stays LTR, the content does not have to. */

const test = require('node:test');
const assert = require('node:assert');

const Direction = require('../src/direction.js');

test('block direction follows the first strong character', function () {
  assert.equal(Direction.blockDir('Hello world'), 'ltr');
  assert.equal(Direction.blockDir('سلام دنیا'), 'rtl');
  assert.equal(Direction.blockDir('שלום עולם'), 'rtl');
  assert.equal(Direction.blockDir('This is English with فارسی inside'), 'ltr');
  assert.equal(Direction.blockDir('این فارسی است with English inside'), 'rtl');
});

test('blocks with no strong character inherit their direction', function () {
  assert.equal(Direction.blockDir('123 + 456 = 579'), null);
  assert.equal(Direction.blockDir('--- *** ---'), null);
  assert.equal(Direction.blockDir('🎉 🎉'), null);
  assert.equal(Direction.blockDir(''), null);
});

test('markup, URLs and code do not decide the direction', function () {
  assert.equal(Direction.blockDir('نصب با `npm install` انجام می‌شود'), 'rtl');
  assert.equal(Direction.blockDir('مخزن در https://github.com/example/repo است'), 'rtl');
  assert.equal(Direction.blockDir('تصویر ![alt](img.png) دارد'), 'rtl');
  assert.equal(Direction.blockDir('<b>متن</b> با اچ‌تی‌ام‌ال'), 'rtl');
});

test('fenced code inside a paragraph does not flip the direction', function () {
  const text = 'این یک مثال است\n```js\nconst x = 1;\n```\nپایان';
  assert.equal(Direction.blockDir(text), 'rtl');
});

test('document direction is decided by the dominant script', function () {
  assert.equal(Direction.dominantDir('Hello world, this is English'), 'ltr');
  assert.equal(Direction.dominantDir('این یک سند فارسی است با کمی English'), 'rtl');
  assert.equal(Direction.dominantDir('12345'), 'ltr');
});

test('language detection recognises the scripts a README is likely to use', function () {
  assert.equal(Direction.detectLanguage('# README\n\nPlain English text.'), 'en');
  assert.equal(Direction.detectLanguage('# عنوان\n\nاین متن فارسی است'), 'fa');
  assert.equal(Direction.detectLanguage('مرحبا بالعالم'), 'ar');
  assert.equal(Direction.detectLanguage('שלום עולם'), 'he');
  assert.equal(Direction.detectLanguage('こんにちは世界'), 'ja');
  assert.equal(Direction.detectLanguage('Привет мир'), 'ru');
});

test('hasRtl is a cheap "does this need bidi care" probe', function () {
  assert.equal(Direction.hasRtl('فارسی'), true);
  assert.equal(Direction.hasRtl('English only'), false);
  assert.equal(Direction.hasRtl(''), false);
});
