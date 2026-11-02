/* Transactional, opt-in draft storage. Opening a database never requests file access. */
(function () {
  'use strict';
  var RV = window.RV = window.RV || {}, opening = null;
  function available() { try { return typeof window.indexedDB !== 'undefined'; } catch (_) { return false; } }
  function database() {
    if (opening) return opening;
    opening = new Promise(function (resolve, reject) {
      var request = window.indexedDB.open('rv.drafts', 1), blocked = false;
      request.onupgradeneeded = function () { request.result.createObjectStore('snapshots'); };
      request.onerror = function () { opening = null; reject(request.error); };
      request.onblocked = function () { blocked = true; opening = null; reject(new Error('Draft storage is busy.')); };
      request.onsuccess = function () {
        var db = request.result;
        if (blocked) { db.close(); return; }
        db.onversionchange = function () { db.close(); opening = null; };
        db.onclose = function () { opening = null; };
        resolve(db);
      };
    }).catch(function (error) { opening = null; throw error; });
    return opening;
  }
  function transaction(mode, action) {
    return database().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx;
        // Older WebViews may not accept the durability option.
        try { tx = db.transaction('snapshots', mode, { durability: 'strict' }); }
        catch (_) { tx = db.transaction('snapshots', mode); }
        var request = action(tx.objectStore('snapshots'));
        tx.oncomplete = function () { resolve(request.result); };
        tx.onabort = function () { reject(tx.error || new Error('Draft transaction aborted.')); };
        tx.onerror = function () { /* onabort reports the failed transaction. */ };
      });
    });
  }
  RV.Drafts = {
    available: available,
    read: function () { return transaction('readonly', function (store) { return store.get('workspace'); }); },
    write: function (snapshot) { return transaction('readwrite', function (store) { return store.put(snapshot, 'workspace'); }); },
    clear: function () { return transaction('readwrite', function (store) { return store.delete('workspace'); }); }
  };
}());
