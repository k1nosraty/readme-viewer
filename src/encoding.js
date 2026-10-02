/*
 * src/encoding.js — turning file bytes into Markdown source, and back.
 *
 * Handles BOMs, UTF-16 (with and without BOM), legacy single byte encodings as a last resort, and
 * line endings. The document text used everywhere inside the app is always LF normalised; the
 * original BOM and line ending style are remembered so saving does not silently reformat a file.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.RV = root.RV || {}; root.RV.Encoding = factory(); }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var Decoder = (typeof TextDecoder !== 'undefined') ? TextDecoder
    : (typeof globalThis !== 'undefined' && globalThis.TextDecoder) || null;

  function decoder(enc, opts) {
    if (!Decoder) return null;
    try { return new Decoder(enc, opts); } catch (e) { return null; }
  }

  function decodeWith(enc, bytes) {
    var d = decoder(enc);
    return d ? d.decode(bytes) : null;
  }

  function tryDecode(bytes, enc) {
    var d = decoder(enc, { fatal: true });
    if (!d) return null;
    try { return d.decode(bytes); } catch (e) { return null; }
  }

  function toBytes(input) {
    if (input instanceof Uint8Array) return input;
    if (input && typeof input.byteLength === 'number') return new Uint8Array(input);
    return new Uint8Array(0);
  }

  /** Control characters a text file should not contain (tab, LF and CR are fine). */
  function isControlByte(b) {
    return b < 32 && b !== 9 && b !== 10 && b !== 13;
  }

  /**
   * True when the first page of the file does not look like text at all.
   * Only ever called for input that already failed a strict UTF-8 decode.
   */
  function looksBinary(bytes) {
    var probe = Math.min(bytes.length, 4096);
    if (!probe) return false;
    var nulls = 0;
    var controls = 0;
    for (var i = 0; i < probe; i++) {
      if (bytes[i] === 0) nulls++;
      else if (isControlByte(bytes[i])) controls++;
    }
    return nulls / probe > 0.1 || controls / probe > 0.05;
  }

  /*
   * UTF-16 without a BOM. For text from the first Unicode blocks (Latin, Greek, Cyrillic, Hebrew,
   * Arabic) one byte of every code unit is 0x00–0x07: the high byte in little endian, the low byte
   * in big endian. Real UTF-8 text never looks like that — it has no NUL bytes and no control
   * characters — so this sniff is safe to run before attempting a UTF-8 decode.
   * @returns {?String} 'utf-16le' | 'utf-16be'
   */
  function guessUtf16(bytes) {
    var probe = Math.min(bytes.length, 4096);
    if (probe < 4 || bytes.length % 2 !== 0) return null;
    var pairs = 0;
    var lowQuiet = 0;
    var highQuiet = 0;
    for (var i = 0; i + 1 < probe; i += 2) {
      pairs++;
      if (bytes[i] < 8) lowQuiet++;
      if (bytes[i + 1] < 8) highQuiet++;
    }
    if (!pairs) return null;
    if (highQuiet / pairs > 0.9) return 'utf-16le';
    if (lowQuiet / pairs > 0.9) return 'utf-16be';
    return null;
  }

  function detectEol(text) {
    var crlf = 0;
    var lf = 0;
    for (var i = 0; i < text.length; i++) {
      if (text.charCodeAt(i) === 10) {
        if (i > 0 && text.charCodeAt(i - 1) === 13) crlf++;
        else lf++;
      }
    }
    return crlf && crlf >= lf ? '\r\n' : '\n';
  }

  /** Normalise every newline style to LF so character offsets in the source are predictable. */
  function normalizeNewlines(text) {
    if (text.indexOf('\r') < 0) return text;
    return text.replace(/\r\n?/g, '\n');
  }

  /**
   * Decode file bytes.
   * @returns {{text: String, bom: Boolean, eol: String, encoding: String, binary: Boolean}}
   */
  function decode(input) {
    var bytes = toBytes(input);
    var bom = false;
    var encoding = 'utf-8';
    var raw = null;

    if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
      bom = true;
      bytes = bytes.subarray(3);
    } else if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
      encoding = 'utf-16le';
      bytes = bytes.subarray(2);
    } else if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
      encoding = 'utf-16be';
      bytes = bytes.subarray(2);
    }

    if (encoding !== 'utf-8') {
      raw = decodeWith(encoding, bytes);
    } else {
      var guessed = guessUtf16(bytes);
      if (guessed) {
        encoding = guessed + ' (guessed)';
        raw = decodeWith(guessed, bytes);
      } else {
        raw = tryDecode(bytes, 'utf-8');
        if (raw === null) {
          if (looksBinary(bytes)) {
            return { text: '', bom: false, eol: '\n', encoding: 'binary', binary: true };
          }
          // Legacy Persian/Arabic and Western single byte files, in that order.
          raw = tryDecode(bytes, 'windows-1256');
          if (raw !== null) {
            encoding = 'windows-1256';
          } else {
            raw = tryDecode(bytes, 'windows-1252');
            if (raw !== null) {
              encoding = 'windows-1252';
            } else {
              raw = decodeWith('utf-8', bytes) || '';
              encoding = 'utf-8 (lossy)';
            }
          }
        }
      }
    }

    if (raw === null) raw = decodeWith('utf-8', bytes) || '';
    var eol = detectEol(raw);
    return {
      text: normalizeNewlines(raw),
      bom: bom,
      eol: eol,
      encoding: encoding,
      binary: false
    };
  }

  /** Re-apply the BOM and line ending style a file was opened with. */
  function encode(text, meta) {
    var eol = meta && meta.eol === '\r\n' ? '\r\n' : '\n';
    var out = eol === '\n' ? text : text.replace(/\n/g, eol);
    return (meta && meta.bom ? '\uFEFF' : '') + out;
  }

  return {
    decode: decode,
    encode: encode,
    normalizeNewlines: normalizeNewlines,
    detectEol: detectEol,
    looksBinary: looksBinary,
    guessUtf16: guessUtf16
  };
}));
