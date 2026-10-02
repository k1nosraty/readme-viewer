/* src/util.js — tiny shared helpers (DOM free). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.RV = root.RV || {}; root.RV.Util = factory(); }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Escape text for insertion into an HTML attribute or text node. */
  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function clamp(value, min, max) {
    return value < min ? min : (value > max ? max : value);
  }

  return { esc: esc, clamp: clamp };
}));
