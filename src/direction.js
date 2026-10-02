/*
 * src/direction.js — script/direction detection.
 *
 * The application shell is always LTR/English. Only the rendered Markdown content adapts to the
 * direction of its own text, per block. These helpers are pure so they can be unit tested.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.RV = root.RV || {}; root.RV.Direction = factory(); }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Right-to-left scripts: Hebrew, Arabic, Syriac, Arabic supplement, Thaana, N'Ko, … */
  var RTL_RE = /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0750-\u077F\u0780-\u07BF\u07C0-\u07FF\u0800-\u085F\u08A0-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
  /*
   * Left-to-right scripts: Latin, Greek, Cyrillic, Indic and the BMP part of CJK. Surrogate pairs
   * are deliberately excluded: an emoji or a box drawing symbol must not force a paragraph to LTR,
   * it should inherit its direction like any other neutral character.
   */
  var LTR_RE = /[A-Za-z\u00C0-\u02AF\u0370-\u058F\u0900-\u1FFF\u2C00-\uD7FF\uF900-\uFB17]/;
  var RTL_G = new RegExp(RTL_RE.source, 'g');
  var LTR_G = new RegExp(LTR_RE.source, 'g');

  /**
   * Text that should not decide the direction of a block: markup, URLs, inline code and
   * fenced code. A Persian sentence that mentions `npm install` is still a Persian sentence.
   */
  function stripForProbe(text) {
    return String(text == null ? '' : text)
      .replace(/```[\s\S]*?(```|$)/g, ' ')
      .replace(/~~~[\s\S]*?(~~~|$)/g, ' ')
      .replace(/`[^`\n]*`/g, ' ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/!?\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\bhttps?:\/\/\S+/g, ' ')
      .replace(/\b\S+@\S+\.\S+/g, ' ');
  }

  /**
   * Direction of a single block, following the Unicode bidirectional rule: the first strong
   * character wins. Returns 'rtl', 'ltr', or null when the block has no strong character
   * (numbers, punctuation, emoji only) — the caller should then leave the direction inherited.
   */
  function blockDir(text) {
    var clean = stripForProbe(text);
    var r = RTL_RE.exec(clean);
    var l = LTR_RE.exec(clean);
    var ri = r ? r.index : -1;
    var li = l ? l.index : -1;
    if (ri < 0 && li < 0) return null;
    return ri >= 0 && (li < 0 || ri < li) ? 'rtl' : 'ltr';
  }

  /** Direction of a whole document: whichever script has more characters. */
  function dominantDir(text) {
    var src = stripForProbe(text);
    var r = (src.match(RTL_G) || []).length;
    var l = (src.match(LTR_G) || []).length;
    if (!r && !l) return 'ltr';
    return r > l ? 'rtl' : 'ltr';
  }

  function hasRtl(text) {
    return RTL_RE.test(String(text == null ? '' : text));
  }

  var SCRIPTS = [
    ['fa', /[\u067E\u0686\u0698\u06AF\u06A9\u06CC]/], // Persian-specific letters
    ['he', /[\u0590-\u05FF]/],
    ['ar', /[\u0600-\u06FF]/],
    ['ja', /[\u3040-\u30FF]/],
    ['ko', /[\uAC00-\uD7AF]/],
    ['zh', /[\u3400-\u9FFF]/],
    ['ru', /[\u0400-\u04FF]/],
    ['th', /[\u0E00-\u0E7F]/],
    ['el', /[\u0370-\u03FF]/]
  ];

  /** ISO-ish code of the first non-Latin script found, or 'en'. Used for the `lang` hint. */
  function detectLanguage(text) {
    var sample = String(text == null ? '' : text).slice(0, 40000);
    for (var i = 0; i < SCRIPTS.length; i++) {
      if (SCRIPTS[i][1].test(sample)) return SCRIPTS[i][0];
    }
    return 'en';
  }

  return {
    stripForProbe: stripForProbe,
    blockDir: blockDir,
    dominantDir: dominantDir,
    hasRtl: hasRtl,
    detectLanguage: detectLanguage
  };
}));
