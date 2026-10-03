/* Native Android document-save bridge. Browsers keep their existing download behavior. */
(function (root) {
  'use strict';
  var pending = Object.create(null);
  var nextId = 0;
  root.RV = root.RV || {};
  root.RV.Android = {
    available: function () { return !!(root.AndroidFiles && typeof root.AndroidFiles.save === 'function'); },
    download: function (text, name, mime) {
      return new Promise(function (resolve, reject) {
        var id = String(++nextId);
        pending[id] = { resolve: resolve, reject: reject };
        try { root.AndroidFiles.save(text, name, mime, id); }
        catch (error) { delete pending[id]; reject(error); }
      });
    },
    complete: function (id, ok, reason) {
      var item = pending[id];
      if (!item) return;
      delete pending[id];
      if (ok) item.resolve(true);
      else item.reject(new Error(reason || 'Save cancelled.'));
    }
  };
}(typeof window !== 'undefined' ? window : globalThis));
