/* Browser fallback. The native build replaces this file with native-entry.js's bundle. */
(function (root) {
  'use strict';
  root.RV = root.RV || {};
  root.RV.Native = root.RV.Native || { available: function () { return false; }, initialize: function () { return Promise.resolve(); } };
}(typeof window !== 'undefined' ? window : globalThis));
