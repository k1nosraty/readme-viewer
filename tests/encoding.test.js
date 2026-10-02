'use strict';

/* Reading real-world Markdown files: BOMs, UTF-16, legacy encodings and line endings. */

const test = require('node:test');
const assert = require('node:assert');

const Encoding = require('../src/encoding.js');

const bytes = (arr) => new Uint8Array(arr);
const utf8 = (str) => new Uint8Array(Buffer.from(str, 'utf8'));
const utf16le = (str) => new Uint8Array(Buffer.from(str, 'utf16le'));

function utf16be(str) {
  const le = Buffer.from(str, 'utf16le');
  const out = Buffer.alloc(le.length);
  for (let i = 0; i + 1 < le.length; i += 2) {
    out[i] = le[i + 1];
    out[i + 1] = le[i];
  }
  return new Uint8Array(out);
}

test('plain UTF-8 with Persian text round-trips', function () {
  const src = '# سلام\n\n- [ ] یادگیری Git\n';
  const out = Encoding.decode(utf8(src));
  assert.equal(out.binary, false);
  assert.equal(out.encoding, 'utf-8');
  assert.equal(out.text, src);
  assert.equal(out.bom, false);
  assert.equal(out.eol, '\n');
});

test('a UTF-8 BOM is detected and stripped from the text', function () {
  const out = Encoding.decode(bytes([0xEF, 0xBB, 0xBF, 0x23, 0x20, 0x41]));
  assert.equal(out.bom, true);
  assert.equal(out.text, '# A', 'the BOM must not leak into the document');
  assert.equal(Encoding.encode(out.text, out), '\uFEFF# A', 'saving restores the BOM');
});

test('UTF-16 files decode with and without a BOM', function () {
  const src = '# Title\n\nسلام\n';

  const le = Encoding.decode(bytes([0xFF, 0xFE].concat(Array.from(utf16le(src)))));
  assert.equal(le.text, src);
  assert.equal(le.encoding, 'utf-16le');

  const be = Encoding.decode(bytes([0xFE, 0xFF].concat(Array.from(utf16be(src)))));
  assert.equal(be.text, src);
  assert.equal(be.encoding, 'utf-16be');

  const noBom = Encoding.decode(utf16le(src));
  assert.equal(noBom.text, src, 'UTF-16LE without a BOM must not become mojibake');
  assert.match(noBom.encoding, /utf-16le/);

  // Persian-only UTF-16 has no ASCII NULs to sniff, only low control bytes.
  const faOnly = Encoding.decode(utf16le('سلام دنیا'));
  assert.equal(faOnly.text, 'سلام دنیا');
  assert.match(faOnly.encoding, /utf-16le/);
});

test('legacy windows-1256 Persian is decoded instead of mangled', function () {
  // 'سلام' in cp1256
  const out = Encoding.decode(bytes([0xD3, 0xE1, 0xC7, 0xE3]));
  assert.equal(out.text, 'سلام');
  assert.equal(out.encoding, 'windows-1256');
});

test('CRLF files are normalised internally and restored on save', function () {
  const src = '# A\r\n\r\n- [ ] x\r\n- [x] y\r\n';
  const out = Encoding.decode(utf8(src));
  assert.equal(out.eol, '\r\n');
  assert.equal(out.text, '# A\n\n- [ ] x\n- [x] y\n');
  assert.ok(out.text.indexOf('\r') === -1, 'no stray CR may survive');
  assert.equal(Encoding.encode(out.text, out), src, 'byte-for-byte round trip');
});

test('lone CR line endings are normalised too', function () {
  const out = Encoding.decode(utf8('# A\r# B\r'));
  assert.equal(out.text, '# A\n# B\n');
  assert.equal(out.eol, '\n');
});

test('binary files are rejected instead of rendered as garbage', function () {
  const png = bytes([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0xFF, 0xFE, 0x01, 0x02]);
  const out = Encoding.decode(png);
  assert.equal(out.binary, true);
  assert.equal(out.text, '');
});

test('an empty file decodes to an empty document', function () {
  const out = Encoding.decode(bytes([]));
  assert.equal(out.text, '');
  assert.equal(out.binary, false);
});

test('encode defaults to LF and no BOM', function () {
  assert.equal(Encoding.encode('a\nb\n', null), 'a\nb\n');
  assert.equal(Encoding.encode('a\nb\n', { eol: '\r\n', bom: false }), 'a\r\nb\r\n');
});

test('detectEol prefers the dominant style', function () {
  assert.equal(Encoding.detectEol('a\r\nb\r\nc\r\n'), '\r\n');
  assert.equal(Encoding.detectEol('a\nb\nc\n'), '\n');
  assert.equal(Encoding.detectEol('a\r\nb\nc\n'), '\n');
  assert.equal(Encoding.detectEol('no newlines'), '\n');
});
