/* Local reading tools. Session content is stored only after explicit opt-in. */
(function () {
  'use strict';
  var RV = window.RV = window.RV || {};
  var app, current = '', lastTop = 0, restoring = false, sessionTimer = 0, positionTimer = 0;
  var records = read('rv.reading', {}), prefs = read('rv.reading.options', {});
  var refreshing = false, documentKeys = new WeakMap(), tabKeys = Object.create(null);
  var loadingSession = false, readFailed = false, saving = null, saveAgain = false, generation = 0, lastSnapshot = null, failed = false;
  function read(key, fallback) {
    try { var value = JSON.parse(localStorage.getItem(key)); return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback; }
    catch (e) { return fallback; }
  }
  function write(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; } }
  function t(key) { return RV.I18n.t(key); }
  function byId(id) { return document.getElementById(id); }
  function keyForDocument() {
    if (!app.state.hasDocument) return '';
    var editor = app.el.editor, previous = documentKeys.get(editor);
    var path = app.state.handle && app.state.handle.path ? 'path:' + app.state.handle.path
      : app.state.folder ? 'folder:' + app.state.folder.root.fullPath + '/' + app.state.folder.path : '';
    if (path) {
      if (previous && previous !== path && records[previous] && !records[path]) records[path] = records[previous];
      documentKeys.set(editor, path); return path;
    }
    if (previous) return previous;
    var text = app.state.saved || app.el.editor.value, hash = 2166136261;
    for (var i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
    var key = 'copy:' + app.state.name + ':' + (hash >>> 0).toString(16);
    documentKeys.set(editor, key); return key;
  }
  function record() {
    if (!records[current] || typeof records[current] !== 'object' || Array.isArray(records[current])) records[current] = {};
    var value = records[current];
    if (!Array.isArray(value.bookmarks)) value.bookmarks = [];
    if (!Array.isArray(value.folded)) value.folded = [];
    return value;
  }
  function persistRecords() {
    var keys = Object.keys(records);
    if (keys.length > 80) keys.slice(0, keys.length - 80).forEach(function (key) { if (key !== current) delete records[key]; });
    write('rv.reading', records);
  }
  function savePosition() {
    if (!current || restoring) return;
    record().top = lastTop;
    persistRecords();
  }
  function applyPreferences() {
    document.documentElement.setAttribute('data-reading-width', ['auto', 'comfortable'].indexOf(prefs.width) >= 0 ? prefs.width : 'full');
    document.documentElement.setAttribute('data-reading-spacing', prefs.spacing === 'relaxed' ? 'relaxed' : 'normal');
    app.el.preview.classList.toggle('hide-completed', !!prefs.hideDone);
    byId('readingWidth').value = ['auto', 'comfortable'].indexOf(prefs.width) >= 0 ? prefs.width : 'full';
    byId('readingSpacing').value = prefs.spacing === 'relaxed' ? 'relaxed' : 'normal';
    byId('hideCompleted').checked = !!prefs.hideDone;
    byId('restoreSession').checked = !!prefs.session;
  }
  function applyFolds() {
    if (!current) return;
    var folded = record().folded, stack = [];
    Array.prototype.forEach.call(app.el.preview.children, function (node) {
      var depth = /^H[1-6]$/.test(node.tagName) ? Number(node.tagName.slice(1)) : 0;
      if (depth) while (stack.length && stack[stack.length - 1] >= depth) stack.pop();
      node.classList.toggle('section-folded', !!stack.length);
      if (depth && folded.indexOf(node.id) >= 0) stack.push(depth);
    });
  }
  function toggle(list, value) { var i = list.indexOf(value); if (i < 0) list.push(value); else list.splice(i, 1); }
  function clearFindVisibility() {
    if (!app) return;
    Array.prototype.forEach.call(app.el.preview.querySelectorAll('.find-visible'), function (node) { node.classList.remove('find-visible'); });
  }
  function reveal(target) {
    if (!current || !target || !app.el.preview.contains(target)) return;
    if (target.closest('.section-folded')) {
      record().folded = []; applyFolds(); headingButtons(); persistRecords();
    }
    var task = target.closest('.task-list-item');
    if (task && prefs.hideDone) task.classList.add('find-visible');
  }
  function headingButtons() {
    if (!current || app.state.format !== 'markdown') return;
    var data = record();
    app.state.toc.forEach(function (heading) {
      var node = byId(heading.id);
      if (!node || !app.el.preview.contains(node)) return;
      var controls = node.querySelector('.section-tools');
      if (!controls) {
        controls = document.createElement('span'); controls.className = 'section-tools';
        var fold = document.createElement('button'); fold.type = 'button'; fold.className = 'section-fold';
        fold.innerHTML = RV.Icons.svg('chevronDown', 14);
        fold.addEventListener('click', function () { toggle(record().folded, heading.id); persistRecords(); refresh(); });
        var bookmark = document.createElement('button'); bookmark.type = 'button'; bookmark.className = 'section-bookmark';
        bookmark.innerHTML = RV.Icons.svg('bookmark', 14);
        bookmark.addEventListener('click', function () { toggle(record().bookmarks, heading.id); persistRecords(); refresh(); });
        controls.appendChild(fold); controls.appendChild(bookmark); node.appendChild(controls);
      }
      var folded = data.folded.indexOf(heading.id) >= 0, marked = data.bookmarks.indexOf(heading.id) >= 0;
      controls.children[0].setAttribute('aria-expanded', folded ? 'false' : 'true');
      controls.children[0].setAttribute('aria-label', t(folded ? 'reading.expand' : 'reading.collapse') + ': ' + heading.text);
      controls.children[0].title = t(folded ? 'reading.expand' : 'reading.collapse');
      controls.children[1].setAttribute('aria-pressed', marked ? 'true' : 'false');
      controls.children[1].setAttribute('aria-label', t('reading.bookmark') + ': ' + heading.text);
      controls.children[1].title = t('reading.bookmark');
    });
  }
  function renderBookmarks() {
    var list = byId('bookmarkList'); list.textContent = '';
    var bookmarks = current ? record().bookmarks : [];
    app.state.toc.forEach(function (heading) {
      if (bookmarks.indexOf(heading.id) < 0) return;
      var button = document.createElement('button'); button.type = 'button'; button.textContent = heading.text;
      button.addEventListener('click', function () {
        record().folded = []; persistRecords(); refresh();
        var target = byId(heading.id); if (target) target.scrollIntoView({ block: 'start' });
      });
      list.appendChild(button);
    });
    byId('bookmarkSection').hidden = !list.children.length;
  }
  function sessionFailure(key) {
    var message = t(key || 'reading.storageError');
    byId('sessionStatus').textContent = message;
    if (!failed) app.toast(message, 'warning');
    failed = true;
  }
  function snapshot() {
    savePosition();
    var tabs = app.listTabs().filter(function (tab) { return tab.hasDocument; });
    return { active: tabs.findIndex(function (tab) { return tab.active; }), documents: tabs.map(function (tab) {
      // Restored documents are detached copies; retaining a second full source is unnecessary.
      return { source: tab.source, name: tab.name, bom: tab.bom, eol: tab.eol, encoding: tab.encoding,
        format: tab.format, formatOverride: tab.formatOverride,
        reading: JSON.parse(JSON.stringify(records[tabKeys[tab.id]] || {})) };
    }) };
  }
  function sameSnapshot(a, b) {
    return a && b && a.active === b.active && a.documents.length === b.documents.length &&
      a.documents.every(function (doc, i) {
        var other = b.documents[i];
        return ['source', 'name', 'bom', 'eol', 'encoding', 'format', 'formatOverride'].every(function (key) { return doc[key] === other[key]; }) &&
          JSON.stringify(doc.reading) === JSON.stringify(other.reading);
      });
  }
  function durableStorage() { return RV.Drafts && RV.Drafts.available(); }
  function saveSession() {
    if (!app || !prefs.session || loadingSession || readFailed) return Promise.resolve(false);
    clearTimeout(sessionTimer); sessionTimer = 0;
    if (saving) { saveAgain = true; return saving; }
    var version = generation;
    function next() {
      saveAgain = false;
      if (!prefs.session || version !== generation) return Promise.resolve(false);
      var value, operation;
      try {
        value = snapshot();
        if (sameSnapshot(value, lastSnapshot)) {
          failed = false; byId('sessionStatus').textContent = t('reading.saved'); return Promise.resolve(true);
        }
        var size = value.documents.reduce(function (sum, doc) { return sum + doc.source.length * 2; }, 0);
        if (size > 32 * 1024 * 1024) throw new Error('Draft limit exceeded');
        byId('sessionStatus').textContent = t('reading.saving');
        if (durableStorage()) operation = RV.Drafts.write(value);
        else {
          // shortcut: older WebViews retain the small localStorage fallback until IndexedDB is available.
          if (JSON.stringify(value).length > 2000000 || !write('rv.workspace.session', value)) throw new Error('Draft storage unavailable');
          operation = Promise.resolve();
        }
      } catch (error) { sessionFailure(); return Promise.resolve(false); }
      return operation.then(function () {
        if (version !== generation) return false;
        lastSnapshot = value; failed = false;
        if (durableStorage()) { try { localStorage.removeItem('rv.workspace.session'); } catch (_) { void 0; } }
        byId('sessionStatus').textContent = t('reading.saved');
        return saveAgain ? next() : true;
      }).catch(function () { if (version === generation) sessionFailure(); return false; });
    }
    saving = next().finally(function () {
      saving = null;
      if (version !== generation && prefs.session) workspaceChanged();
    });
    return saving;
  }
  function clearSession() {
    prefs.session = false; generation++; lastSnapshot = null;
    clearTimeout(sessionTimer); sessionTimer = 0;
    byId('restoreSession').checked = false;
    var optionsSaved = write('rv.reading.options', prefs);
    var operation;
    try {
      localStorage.removeItem('rv.workspace.session');
      operation = durableStorage() ? RV.Drafts.clear() : Promise.resolve();
    } catch (error) { operation = Promise.reject(error); }
    return operation.then(function () {
      if (!optionsSaved) throw new Error('Recovery preference could not be cleared');
      byId('sessionStatus').textContent = ''; failed = false; readFailed = false;
      app.toast(t('reading.sessionCleared'), 'info'); return true;
    }).catch(function () {
      byId('sessionStatus').textContent = t('reading.clearError');
      app.toast(t('reading.clearError'), 'warning'); return false;
    });
  }
  function workspaceChanged() {
    if (!app || !prefs.session || loadingSession || readFailed || sessionTimer) return;
    byId('sessionStatus').textContent = t('reading.pending');
    // A bounded delay also saves during continuous typing, rather than waiting for idle.
    sessionTimer = setTimeout(function () { sessionTimer = 0; saveSession(); }, 1000);
  }
  function refresh() {
    if (!app || refreshing) return;
    refreshing = true;
    var key = keyForDocument();
    if (key !== current) {
      savePosition(); current = key; restoring = true;
      var top = key && Number(record().top) || 0;
      requestAnimationFrame(function () {
        if (current === key) {
          app.el.previewScroll.scrollTop = Math.max(0, top); lastTop = app.el.previewScroll.scrollTop;
          restoring = false;
        }
      });
    }
    app.listTabs().forEach(function (tab) { if (tab.active) tabKeys[tab.id] = key; });
    applyPreferences(); headingButtons(); applyFolds(); renderBookmarks();
    reveal(app.el.preview.querySelector('mark.rv-find.current'));
    refreshing = false; workspaceChanged();
  }
  function init(api) {
    if (app) return; app = api;
    ['readingWidth', 'readingSpacing', 'hideCompleted'].forEach(function (id) {
      byId(id).addEventListener('change', function () {
        prefs.width = byId('readingWidth').value; prefs.spacing = byId('readingSpacing').value;
        prefs.hideDone = byId('hideCompleted').checked; write('rv.reading.options', prefs); refresh();
      });
    });
    byId('restoreSession').addEventListener('change', function () {
      prefs.session = byId('restoreSession').checked;
      if (!prefs.session) { clearSession(); return; }
      if (!write('rv.reading.options', prefs)) {
        prefs.session = false; byId('restoreSession').checked = false; sessionFailure(); return;
      }
      if (prefs.session) saveSession();
    });
    byId('clearSession').addEventListener('click', clearSession);
    app.el.previewScroll.addEventListener('scroll', function () {
      if (restoring) return; lastTop = app.el.previewScroll.scrollTop;
      clearTimeout(positionTimer); positionTimer = setTimeout(savePosition, 180);
    }, { passive: true });
    window.addEventListener('pagehide', function () { savePosition(); saveSession(); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) saveSession(); });
    document.addEventListener('pointerdown', function (event) {
      ['readingOptions'].forEach(function (id) {
        var panel = byId(id); if (panel.open && !panel.contains(event.target)) panel.open = false;
      });
    });
    document.addEventListener('keydown', function (event) {
      ['readingOptions'].forEach(function (id) {
        var panel = byId(id);
        if (event.key === 'Escape' && panel.open) { event.preventDefault(); panel.open = false; panel.querySelector('summary').focus(); }
      });
    });
    function restore(session) {
      var restored = [];
      if (Array.isArray(session.documents)) session.documents.forEach(function (item) {
        if (!item || typeof item.source !== 'string' || typeof item.name !== 'string') return;
        var id = app.restoreTab(item);
        if (id) {
          restored.push(id);
          if (item.reading && typeof item.reading === 'object') {
            var key = 'restored:' + id + ':' + keyForDocument();
            records[key] = {
              top: Number.isFinite(item.reading.top) ? Math.max(0, item.reading.top) : 0,
              bookmarks: Array.isArray(item.reading.bookmarks) ? item.reading.bookmarks.filter(function (id) { return typeof id === 'string'; }) : [],
              folded: Array.isArray(item.reading.folded) ? item.reading.folded.filter(function (id) { return typeof id === 'string'; }) : []
            };
            documentKeys.set(app.el.editor, key); current = ''; refresh();
          }
        }
      });
      if (restored.length) {
        app.switchTab(restored[Math.max(0, Math.min(restored.length - 1, Number(session.active) || 0))]);
        app.toast(t('reading.sessionRestored'), 'info');
      }
    }
    var initial = app.state.documentId, version = generation;
    if (prefs.session && durableStorage()) {
      loadingSession = true;
      return RV.Drafts.read().then(function (session) {
        return app.whenDocumentsReady().then(function () {
          if (!prefs.session || version !== generation) return;
          var active = app.listTabs().filter(function (tab) { return tab.active; })[0];
          var interacted = app.state.documentId !== initial || !!app.el.editor.value;
          restore(session || read('rv.workspace.session', {}));
          if (interacted && active) app.switchTab(active.id);
        });
      }).catch(function () {
        if (prefs.session && version === generation) {
          readFailed = true; sessionFailure('reading.readError'); restore(read('rv.workspace.session', {}));
        }
      }).then(function () {
        loadingSession = false; refresh();
      });
    }
    if (prefs.session) restore(read('rv.workspace.session', {}));
    refresh(); return Promise.resolve();
  }
  function appearance(value, persist) {
    if (value) {
      prefs.width = ['full', 'comfortable', 'auto'].indexOf(value.width) >= 0 ? value.width : 'full';
      prefs.spacing = value.spacing === 'relaxed' ? 'relaxed' : 'normal';
      applyPreferences();
      if (persist) return write('rv.reading.options', prefs);
    }
    return { width: ['auto', 'comfortable'].indexOf(prefs.width) >= 0 ? prefs.width : 'full', spacing: prefs.spacing === 'relaxed' ? 'relaxed' : 'normal' };
  }
  RV.Reading = { appearance: appearance, init: init, refresh: refresh, workspaceChanged: workspaceChanged, saveSession: saveSession, clearSession: clearSession,
    reveal: reveal, clearFindVisibility: clearFindVisibility };
}());
