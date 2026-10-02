/*
 * app.js — README Viewer application shell.
 *
 * Responsibilities: DOM wiring, application state, settings persistence, file I/O and the render
 * pipeline. Everything that can be reasoned about without a DOM lives in src/ and is unit tested:
 *
 *   src/tasks.js      task checkbox ↔ source offset mapping and toggling
 *   src/markdown.js   Markdown → sanitised HTML
 *   src/encoding.js   bytes → text (BOM / UTF-16 / line endings)
 *   src/direction.js  per-block RTL/LTR detection
 *   src/highlight.js  syntax highlighting + lazy languages
 *   src/export.js     standalone HTML export
 *   src/i18n.js       interface strings
 *   src/icons.js      SVG icon set
 */
(function () {
  'use strict';

  var Util = RV.Util;
  var I18n = RV.I18n;
  var Icons = RV.Icons;
  var Direction = RV.Direction;
  var Encoding = RV.Encoding;
  var Tasks = RV.Tasks;
  var Markdown = RV.Markdown;
  var Highlight = RV.Highlight;
  var Exporter = RV.Export;

  var t = function (key, vars) { return I18n.t(key, vars); };
  var esc = Util.esc;
  var clamp = Util.clamp;
  var $ = function (id) { return document.getElementById(id); };

  var el = {};
  var md = null;
  var hl = null;

  var STORE = 'rv.settings';
  var RENDER_DELAY = 90;
  var FONT_MIN = 12;
  var FONT_MAX = 26;

  var state = {
    handle: null,
    name: '',
    saved: '',
    dirty: false,
    hasDocument: false,
    bom: false,
    eol: '\n',
    encoding: '',
    baseUrl: '',
    anchors: [],
    toc: [],
    lines: 1,
    curLine: -1,
    tocFilter: '',
    wrap: false,
    sync: true,
    dirMode: 'auto',
    font: 16,
    mode: 'split',
    theme: 'auto',
    editPreview: false,
    sidebar: true,
    split: 50,
    locale: 'en',
    taskSource: '',
    documentId: 0,
    tasks: [],
    tasksOk: true,
    taskReason: '',
    lock: { pane: '', until: 0 }
  };

  /* ---------------------------------------------------------------- helpers */

  function eachNode(selector, fn, root) {
    var nodes = (root || document).querySelectorAll(selector);
    for (var i = 0; i < nodes.length; i++) fn(nodes[i]);
  }

  function now() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }

  var darkMq = (typeof window.matchMedia === 'function')
    ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function prefersDark() { return !!(darkMq && darkMq.matches); }

  function isDark() {
    return state.theme === 'dark' || (state.theme === 'auto' && prefersDark());
  }

  /* ----------------------------------------------------------------- toasts */

  var TOAST_ICON = { success: 'checkCircle', error: 'alert', warning: 'alert', info: 'info' };

  function toast(message, kind) {
    kind = kind || 'info';
    var node = document.createElement('div');
    node.className = 'toast';
    node.setAttribute('data-kind', kind);
    node.innerHTML = Icons.svg(TOAST_ICON[kind] || 'info', 15) +
      '<span class="toast-msg"></span>';
    node.querySelector('.toast-msg').textContent = message;
    el.toasts.appendChild(node);
    var timer = setTimeout(function () { dismiss(node); }, kind === 'error' ? 6000 : 3200);
    node.addEventListener('click', function () { clearTimeout(timer); dismiss(node); });
    function dismiss(n) {
      n.style.opacity = '0';
      n.style.transform = 'translateY(4px)';
      n.style.transition = 'opacity 140ms ease, transform 140ms ease';
      setTimeout(function () { if (n.parentNode) n.parentNode.removeChild(n); }, 160);
    }
    while (el.toasts.childElementCount > 4) el.toasts.removeChild(el.toasts.firstChild);
  }

  /* ---------------------------------------------------------------- settings */

  function loadSettings() {
    var raw = null;
    try { raw = localStorage.getItem(STORE); } catch (e) { raw = null; }
    if (!raw) return;
    var s;
    try { s = JSON.parse(raw); } catch (e) { return; }
    if (!s || typeof s !== 'object') return;

    state.font = clamp(parseInt(s.font, 10) || 16, FONT_MIN, FONT_MAX);
    state.wrap = !!s.wrap;
    state.sync = s.sync !== false;
    state.dirMode = ['auto', 'ltr', 'rtl'].indexOf(s.dirMode) >= 0 ? s.dirMode : 'auto';
    state.mode = ['split', 'write', 'preview'].indexOf(s.mode) >= 0 ? s.mode : 'split';
    state.theme = ['auto', 'light', 'dark'].indexOf(s.theme) >= 0 ? s.theme : 'auto';
    state.baseUrl = typeof s.baseUrl === 'string' ? s.baseUrl : '';
    state.editPreview = !!s.editPreview;
    state.sidebar = s.sidebar !== false;
    state.split = clamp(parseFloat(s.split) || 50, 15, 85);
    state.locale = I18n.setLocale(s.locale) ? s.locale : 'en';
  }

  function saveSettings() {
    try {
      localStorage.setItem(STORE, JSON.stringify({
        font: state.font, wrap: state.wrap, sync: state.sync, dirMode: state.dirMode,
        mode: state.mode, theme: state.theme, baseUrl: state.baseUrl,
        editPreview: state.editPreview, sidebar: state.sidebar, split: state.split,
        locale: I18n.getLocale()
      }));
    } catch (e) { /* private mode / quota: settings simply are not remembered */ }
  }

  /* -------------------------------------------------------------- i18n wiring */

  function applyTranslations(root) {
    root = root || document;
    eachNode('[data-i18n]', function (node) {
      node.textContent = t(node.getAttribute('data-i18n'));
    }, root);
    eachNode('[data-i18n-title]', function (node) {
      node.setAttribute('title', t(node.getAttribute('data-i18n-title')));
    }, root);
    eachNode('[data-i18n-aria]', function (node) {
      node.setAttribute('aria-label', t(node.getAttribute('data-i18n-aria')));
    }, root);
    eachNode('[data-i18n-placeholder]', function (node) {
      node.setAttribute('placeholder', t(node.getAttribute('data-i18n-placeholder')));
    }, root);
    var list = $('helpList');
    if (list && (!root || root === document || root === list)) {
      var items = t('help.items');
      list.innerHTML = '';
      for (var i = 0; i < items.length; i++) {
        var li = document.createElement('li');
        li.innerHTML = items[i];
        list.appendChild(li);
      }
    }
  }

  function applyLocale() {
    var locale = I18n.getLocale();
    var root = document.documentElement;
    root.setAttribute('lang', locale);
    root.setAttribute('dir', I18n.localeDir(locale));
    applyTranslations(document);
    updateThemeButton();
    var select = $('localeSelect');
    if (select) {
      select.innerHTML = '';
      var locales = I18n.locales();
      for (var i = 0; i < locales.length; i++) {
        var opt = document.createElement('option');
        opt.value = locales[i];
        opt.textContent = t('lang.' + locales[i]);
        if (locales[i] === locale) opt.selected = true;
        select.appendChild(opt);
      }
    }
    updateChrome();
    render({ immediate: true });
  }

  /* ------------------------------------------------------------------ chrome */

  function updateChrome() {
    var name = state.hasDocument ? state.name : t('app.name');
    el.fileName.textContent = name;
    el.fileName.title = state.hasDocument ? state.name : '';

    var sub = !state.hasDocument ? ''
      : (state.dirty ? t('status.unsaved') : t('status.saved'));
    el.fileState.textContent = sub;
    el.fileState.setAttribute('data-state', state.dirty ? 'dirty' : (state.hasDocument ? 'clean' : 'empty'));

    el.btnSave.disabled = !state.hasDocument;
    el.btnSaveAs.disabled = !state.hasDocument;
    el.btnReload.disabled = !state.handle;
    el.btnExport.disabled = !state.hasDocument;

    el.statusFile.textContent = state.hasDocument ? state.name : t('status.ready');
    el.statusFile.setAttribute('data-dirty', state.dirty ? '1' : '0');
    el.statusFile.title = state.dirty ? t('status.unsaved') : '';

    document.title = (state.dirty ? '• ' : '') +
      (state.hasDocument ? state.name + ' — ' : '') + t('app.name');

    el.fontValue.textContent = String(state.font);
    el.fontValue.title = t('font.size') + ': ' + state.font;

    el.btnWrap.setAttribute('aria-pressed', state.wrap ? 'true' : 'false');
    el.btnSync.setAttribute('aria-pressed', state.sync ? 'true' : 'false');
    el.btnToc.setAttribute('aria-pressed', state.sidebar ? 'true' : 'false');

    eachNode('[data-mode-btn]', function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-mode-btn') === state.mode ? 'true' : 'false');
    });
    eachNode('[data-dir]', function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-dir') === state.dirMode ? 'true' : 'false');
    });

    el.statusEncoding.textContent = state.hasDocument
      ? (state.encoding ? state.encoding + ' · ' : '') + (state.eol === '\r\n' ? 'CRLF' : 'LF') +
        (state.bom ? ' · BOM' : '')
      : '';
  }

  function setDirty(on) {
    state.dirty = !!on;
    updateChrome();
  }

  /* ------------------------------------------------------------- document I/O */

  function setDoc(text, name, handle, meta) {
    state.documentId++;
    el.editor.value = text;
    state.name = name || '';
    state.saved = text;
    state.handle = handle || null;
    state.hasDocument = true;
    state.bom = !!(meta && meta.bom);
    state.eol = (meta && meta.eol) || '\n';
    state.encoding = (meta && meta.encoding) || 'utf-8';
    state.lines = text ? text.split('\n').length : 1;
    setDirty(false);
    el.editor.scrollTop = 0;
    el.previewScroll.scrollTop = 0;
    el.emptyState.hidden = true;
    el.previewScroll.removeAttribute('data-empty');
    updateChrome();
    render({ immediate: true });
  }

  function setEmpty() {
    state.documentId++;
    el.editor.value = '';
    state.name = '';
    state.saved = '';
    state.handle = null;
    state.hasDocument = false;
    state.bom = false;
    state.eol = '\n';
    state.encoding = '';
    state.tasks = [];
    state.tasksOk = true;
    state.taskReason = '';
    setDirty(false);
    el.emptyState.hidden = false;
    el.previewScroll.setAttribute('data-empty', '1');
    updateChrome();
    render({ immediate: true });
  }

  function markDirtyFromValue() {
    if (!state.hasDocument) {
      state.hasDocument = el.editor.value.length > 0;
      if (state.hasDocument) {
        state.name = 'README.md';
        state.saved = '';
        el.emptyState.hidden = true;
        el.previewScroll.removeAttribute('data-empty');
      }
    }
    setDirty(state.hasDocument ? el.editor.value !== state.saved : el.editor.value.length > 0);
  }

  function loadFile(file, handle) {
    if (!file) return Promise.resolve(false);
    return file.arrayBuffer().then(function (buf) {
      var decoded = Encoding.decode(new Uint8Array(buf));
      if (decoded.binary) {
        toast(t('error.binary', { name: file.name || '' }), 'error');
        return false;
      }
      setDoc(decoded.text, file.name || 'README.md', handle || null, decoded);
      toast(t('info.opened', { name: state.name }), 'success');
      return true;
    }).catch(function (err) {
      toast(t('error.open', {
        name: file.name || '',
        reason: (err && err.message) || String(err)
      }), 'error');
      return false;
    });
  }

  function pickOpen() {
    confirmDiscard().then(function (proceed) {
      if (!proceed) return;
      var opts = {
        multiple: false,
        types: [{
          description: 'Markdown',
          accept: {
            'text/markdown': ['.md', '.markdown', '.mdown', '.mkd', '.mdwn'],
            'text/plain': ['.txt']
          }
        }]
      };
      if (typeof window.showOpenFilePicker === 'function') {
        window.showOpenFilePicker(opts).then(function (handles) {
          var h = handles && handles[0];
          if (!h) return null;
          return h.getFile().then(function (f) { return loadFile(f, h); });
        }).catch(function (err) {
          if (err && err.name === 'AbortError') return;
          el.fileInput.click();
        });
      } else {
        el.fileInput.click();
      }
    });
  }

  function reloadFromDisk() {
    if (!state.handle) { toast(t('error.reload'), 'warning'); return; }
    var handle = state.handle;
    confirmDiscard().then(function (proceed) {
      if (!proceed || state.handle !== handle) return;
      handle.getFile().then(function (file) {
        return loadFile(file, handle);
      }).then(function (ok) {
        if (ok) toast(t('info.reloaded', { name: state.name }), 'success');
      }).catch(function (err) {
        toast(t('error.read', { name: state.name }) + ': ' + ((err && err.message) || err), 'error');
      });
    });
  }

  /* -------------------------------------------------------------------- save */

  function download(text, name, mime) {
    var blob = new Blob([text], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  /**
   * Save the document. Resolves true when the file on disk (or the download) now matches the
   * editor, false when the user cancelled or the write failed.
   */
  var pendingSave = null;

  function save(forceNew) {
    if (pendingSave) return pendingSave;
    pendingSave = saveDocument(forceNew).finally(function () { pendingSave = null; });
    return pendingSave;
  }

  function saveDocument(forceNew) {
    if (!state.hasDocument) return Promise.resolve(false);
    var text = el.editor.value;
    var documentId = state.documentId;
    var name = state.name;
    var payload = Encoding.encode(text, { bom: state.bom, eol: state.eol });

    var finish = function (handle) {
      if (state.documentId !== documentId) return true;
      state.saved = text;
      state.handle = handle || null;
      state.name = handle ? handle.name : name;
      state.encoding = 'utf-8';
      setDirty(el.editor.value !== text);
      saveSettings();
      toast(t('info.saved', { name: state.name }), 'success');
      return true;
    };

    var writeTo = function (h) {
      return h.createWritable().then(function (w) {
        return w.write(new Blob([payload], { type: 'text/markdown;charset=utf-8' }))
          .then(function () { return w.close(); });
      }).then(function () { return finish(h); }).catch(function (err) {
        // Permission lost (e.g. the file moved): fall back to a download instead of failing.
        if (err && (err.name === 'NotAllowedError' || err.name === 'NotFoundError')) {
          download(payload, name || 'README.md', 'text/markdown;charset=utf-8');
          return finish(null);
        }
        toast(t('error.save', {
          name: state.name,
          reason: (err && err.message) || String(err)
        }), 'error');
        return false;
      });
    };

    if (!forceNew && state.handle) return writeTo(state.handle);

    if (typeof window.showSaveFilePicker === 'function') {
      return window.showSaveFilePicker({
        suggestedName: state.name || 'README.md',
        types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md', '.markdown', '.txt'] } }]
      }).then(function (h) {
        if (!h) return false;
        return writeTo(h);
      }).catch(function (err) {
        if (err && err.name === 'AbortError') return false;
        download(payload, name || 'README.md', 'text/markdown;charset=utf-8');
        return finish(null);
      });
    }

    download(payload, name || 'README.md', 'text/markdown;charset=utf-8');
    return Promise.resolve(finish(null));
  }

  function exportHtml() {
    if (!state.hasDocument) return;
    render({ immediate: true });
    var src = el.editor.value;
    var snapshot = el.preview.cloneNode(true);
    eachNode('input[type=checkbox]', function (box) {
      if (box.checked) box.setAttribute('checked', '');
      else box.removeAttribute('checked');
      box.disabled = true;
    }, snapshot);
    var doc = Exporter.build({
      title: state.name || 'README',
      html: snapshot.innerHTML,
      theme: state.theme === 'auto' ? (isDark() ? 'dark' : 'light') : state.theme,
      lang: Direction.detectLanguage(src),
      dir: state.dirMode === 'auto' ? Direction.dominantDir(src) : state.dirMode
    });
    var name = (state.name || 'README').replace(/\.[^.]+$/, '') + '.html';
    download(doc, name, 'text/html;charset=utf-8');
    toast(t('info.exported', { name: name }), 'success');
  }

  /* --------------------------------------------------------- confirm dialog */

  var confirmState = { resolve: null, focus: null };

  function askConfirm(opts) {
    return new Promise(function (resolve) {
      confirmState.resolve = resolve;
      confirmState.focus = document.activeElement;
      $('confirmTitle').textContent = opts.title;
      $('confirmBody').textContent = opts.body;
      $('confirmIcon').innerHTML = Icons.svg(opts.icon || 'alert', 18);
      el.btnConfirmSave.hidden = opts.hideSave === true;
      el.confirmModal.hidden = false;
      (opts.hideSave ? el.btnConfirmDiscard : el.btnConfirmSave).focus();
    });
  }

  function closeConfirm(value) {
    if (el.confirmModal.hidden) return;
    el.confirmModal.hidden = true;
    var resolve = confirmState.resolve;
    confirmState.resolve = null;
    if (resolve) resolve(value);
    if (confirmState.focus && typeof confirmState.focus.focus === 'function') {
      try { confirmState.focus.focus(); } catch (e) { void 0; }
    }
    confirmState.focus = null;
  }

  /** Resolve true when it is safe to throw the current document away. */
  function confirmDiscard() {
    if (!state.dirty) return Promise.resolve(true);
    return askConfirm({
      title: t('unsaved.title'),
      body: t('unsaved.body', { name: state.name || 'README.md' }) + ' ' + t('unsaved.question'),
      icon: 'alert'
    }).then(function (choice) {
      if (choice === 'discard') return true;
      if (choice === 'save') return save(false).then(function (ok) { return ok && !state.dirty; });
      return false;
    });
  }

  /* -------------------------------------------------------- render pipeline */

  /** Exact source line of every top-level token (raws are verbatim and contiguous). */
  function locateTokens(tokens, src) {
    var out = [];
    var cursor = 0;
    var line = 0;
    for (var i = 0; i < tokens.length; i++) {
      var raw = tokens[i].raw || '';
      var idx = raw ? src.indexOf(raw, cursor) : -1;
      if (idx < 0) idx = cursor;
      line += Tasks.countNewlines(src.slice(cursor, idx));
      out.push({ line: line, start: idx });
      cursor = idx + raw.length;
      line += Tasks.countNewlines(raw);
    }
    return out;
  }

  function errorBlock(err) {
    return '<div class="code-block"><div class="code-bar"><span class="code-lang">error</span></div>' +
      '<pre dir="ltr"><code>' + esc(t('error.parse', { reason: (err && err.message) || err })) +
      '</code></pre></div>\n';
  }

  function applyDirection(parts, src) {
    if (state.dirMode !== 'auto') {
      el.preview.setAttribute('dir', state.dirMode);
      for (var i = 0; i < parts.length; i++) parts[i].el.setAttribute('dir', state.dirMode);
      return;
    }
    el.preview.setAttribute('dir', Direction.dominantDir(src));
    for (var j = 0; j < parts.length; j++) {
      var node = parts[j].el;
      var tag = node.tagName;
      if (tag === 'PRE' || node.classList.contains('code-block')) {
        node.setAttribute('dir', 'ltr');
        continue;
      }
      var text = node.textContent || '';
      var dir = node.classList.contains('table-wrap')
        ? Direction.dominantDir(text)
        : Direction.blockDir(text);
      if (dir) node.setAttribute('dir', dir);
    }
  }

  function enhanceLinks() {
    var base = state.baseUrl;
    var links = el.preview.querySelectorAll('a[href]');
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      var href = a.getAttribute('href') || '';
      if (href.charAt(0) === '#') continue;
      var resolved = resolveUrl(href, base);
      if (resolved) a.setAttribute('href', resolved);
      if (/^https?:/i.test(resolved)) {
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer nofollow');
        a.setAttribute('data-external', '1');
      }
    }
    if (!base) return;
    var imgs = el.preview.querySelectorAll('img[src]');
    for (var j = 0; j < imgs.length; j++) {
      var r = resolveUrl(imgs[j].getAttribute('src') || '', base);
      if (r) imgs[j].setAttribute('src', r);
    }
  }

  function resolveUrl(href, base) {
    if (!base) return href;
    if (/^(https?:|file:|data:|mailto:|#)/i.test(href)) return href;
    if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return href;
    try { return new URL(href, base).href; } catch (e) { return href; }
  }

  function measureParts() {
    var box = el.previewScroll.getBoundingClientRect();
    var base = el.previewScroll.scrollTop;
    for (var i = 0; i < state.anchors.length; i++) {
      var rect = state.anchors[i].el.getBoundingClientRect();
      state.anchors[i].top = rect.top - box.top + base;
      state.anchors[i].height = Math.max(1, rect.height);
    }
  }

  /** Match rendered checkboxes to source offsets, and switch interactive editing on or off. */
  function bindTasks(tokens, src) {
    var result = Tasks.collectTasks(tokens, src);
    var boxes = el.preview.querySelectorAll('input[data-rv-task]');
    var ok = result.ok && boxes.length === result.tasks.length && boxes.length === md.taskCount();
    var reason = result.reason || '';
    if (ok) {
      for (var i = 0; i < boxes.length; i++) {
        if (boxes[i].checked !== result.tasks[i].checked) {
          ok = false;
          reason = 'preview and source disagree';
          break;
        }
      }
    }
    state.taskSource = src;
    state.tasks = result.tasks;
    state.tasksOk = ok;
    state.taskReason = reason;
    applyTaskMode();
    updateTaskStats();
  }

  function applyTaskMode() {
    var usable = state.editPreview && state.tasksOk;
    el.preview.setAttribute('data-edit', usable ? '1' : '0');
    var boxes = el.preview.querySelectorAll('input[data-rv-task]');
    for (var i = 0; i < boxes.length; i++) boxes[i].disabled = !usable;

    el.btnEdit.setAttribute('aria-pressed', state.editPreview ? 'true' : 'false');
    el.editBadge.hidden = !state.editPreview;
    if (!state.editPreview) return;
    if (state.tasksOk) {
      el.editBadge.setAttribute('data-kind', 'on');
      el.editBadge.setAttribute('title', t('edit.on'));
    } else {
      el.editBadge.setAttribute('data-kind', 'warn');
      el.editBadge.setAttribute('title', t('edit.unavailable', { reason: state.taskReason }));
    }
  }

  function updateTaskStats() {
    var done = 0;
    for (var i = 0; i < state.tasks.length; i++) if (state.tasks[i].checked) done++;
    el.statusTasks.textContent = state.tasks.length
      ? t('status.tasks', { count: state.tasks.length, done: done })
      : '';
  }

  function render(opts) {
    opts = opts || {};
    if (!state.hasDocument && !el.editor.value) {
      el.preview.textContent = '';
      state.anchors = [];
      state.toc = [];
      state.tasks = [];
      state.lines = 1;
      buildGutter();
      renderToc();
      updateStats('', 0);
      applyTaskMode();
      updateTaskStats();
      return;
    }

    var src = el.editor.value;
    var t0 = now();
    md.reset();

    var tokens;
    try {
      tokens = md.lexer(src);
    } catch (err) {
      var reason = (err && err.message) || String(err);
      el.preview.textContent = t('error.parse', { reason: reason });
      state.anchors = [];
      state.toc = [];
      state.tasks = [];
      state.tasksOk = true;
      state.taskReason = '';
      renderToc();
      applyTaskMode();
      updateTaskStats();
      updateStats(src, now() - t0);
      toast(t('error.parse', { reason: reason }), 'error');
      return;
    }

    var located = locateTokens(tokens, src);
    var frag = document.createDocumentFragment();
    var parts = [];
    var toc = [];

    for (var i = 0; i < tokens.length; i++) {
      var token = tokens[i];
      var html;
      try {
        html = md.renderBlock(token, tokens.links);
      } catch (err) {
        html = errorBlock(err);
      }
      if (!html) continue;

      var holder = document.createElement('div');
      holder.innerHTML = html;
      var first = holder.firstElementChild;
      if (!first) continue;
      while (holder.firstChild) frag.appendChild(holder.firstChild);

      var line = located[i].line + 1;
      var part = {
        el: first,
        line: line,
        endLine: line + Tasks.countNewlines(token.raw || ''),
        token: token,
        top: 0,
        height: 1
      };
      parts.push(part);
      if (token.type === 'heading') {
        toc.push({
          id: first.id,
          depth: token.depth,
          text: md.plainText(token.tokens),
          line: line,
          part: part
        });
      }
    }

    el.preview.textContent = '';
    el.preview.appendChild(frag);

    applyDirection(parts, src);
    enhanceLinks();
    hl.all(el.preview);

    state.anchors = parts;
    state.toc = toc;
    measureParts();

    bindTasks(tokens, src);

    state.lines = src ? src.split('\n').length : 1;
    buildGutter();
    renderToc();
    markActiveToc();
    updateStats(src, now() - t0);

    if (opts.focusTask !== undefined && opts.focusTask !== null) {
      var box = el.preview.querySelector('input[data-rv-task="' + opts.focusTask + '"]');
      if (box && !box.disabled && typeof box.focus === 'function') {
        try { box.focus({ preventScroll: true }); } catch (e) { box.focus(); }
      }
    }
    markGutterCursor();
  }

  var renderTimer = 0;
  var renderOpts = null;
  var lastRenderAt = 0;
  var RENDER_MAX_WAIT = 240;

  function runRender(opts) {
    lastRenderAt = Date.now();
    render(opts || {});
  }

  function flushRender() {
    renderTimer = 0;
    var opts = renderOpts || {};
    renderOpts = null;
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(function () { runRender(opts); });
    else runRender(opts);
  }

  /**
   * Coalesce renders while typing, but never wait longer than RENDER_MAX_WAIT after the previous
   * one — a trailing-only debounce would leave the preview frozen during continuous typing.
   */
  function scheduleRender(opts, delay) {
    if (opts && opts.immediate) { runRender(opts); return; }
    if (opts) {
      renderOpts = renderOpts || {};
      for (var key in opts) {
        if (Object.prototype.hasOwnProperty.call(opts, key)) renderOpts[key] = opts[key];
      }
    }
    if (renderTimer) return;
    var wait = delay === undefined ? RENDER_DELAY : delay;
    var since = Date.now() - lastRenderAt;
    if (since >= RENDER_MAX_WAIT) wait = 0;
    renderTimer = setTimeout(flushRender, Math.max(0, wait));
  }

  /* ------------------------------------------------------ interactive tasks */

  function toggleTaskFromPreview(box) {
    if (!state.editPreview) { toast(t('edit.off'), 'info'); return; }
    if (!state.tasksOk) {
      toast(t('edit.unavailable', { reason: state.taskReason }), 'warning');
      return;
    }
    if (state.taskSource !== el.editor.value) {
      toast(t('edit.stale'), 'warning');
      scheduleRender(null, 0);
      return;
    }
    var index = parseInt(box.getAttribute('data-rv-task'), 10);
    var task = state.tasks[index];
    var result = Tasks.toggleTask(el.editor.value, task);
    if (!result) {
      // The source moved since the last render: refresh and let the user click again.
      toast(t('edit.stale'), 'warning');
      scheduleRender(null, 0);
      return;
    }
    applySourceEdit(result);
    // The source is now the truth; mirror it immediately so the click feels instant.
    box.checked = result.checked;
    task.checked = result.checked;
    state.taskSource = el.editor.value;
    updateTaskStats();
    scheduleRender({ focusTask: index }, 60);
  }

  /** Replace exactly the marker characters, keeping native undo and the caret where they are. */
  function applySourceEdit(result) {
    var ed = el.editor;
    var marker = result.text.slice(result.start, result.end);
    var before = { start: ed.selectionStart, end: ed.selectionEnd };
    if (typeof ed.setRangeText === 'function') {
      ed.setRangeText(marker, result.start, result.end, 'preserve');
    } else {
      ed.value = result.text;
      try { ed.setSelectionRange(before.start, before.end); } catch (e) { void 0; }
    }
    markDirtyFromValue();
  }

  function copyCode(trigger) {
    var block = trigger.closest('.code-block');
    var code = block ? block.querySelector('pre > code') : null;
    if (!code) return;
    var text = code.textContent || '';
    var done = function (ok) {
      var label = trigger.querySelector('.code-copy-text');
      trigger.setAttribute('data-state', ok ? 'done' : 'error');
      if (label) label.textContent = ok ? t('action.copied') : t('error.clipboard');
      setTimeout(function () {
        trigger.removeAttribute('data-state');
        if (label) label.textContent = t('action.copy');
      }, 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () {
        done(legacyCopy(text));
      });
      return;
    }
    done(legacyCopy(text));
  }

  function legacyCopy(text) {
    try {
      var area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(area);
      return ok;
    } catch (e) { return false; }
  }

  /* --------------------------------------------------------------- table of contents */

  function renderToc() {
    var html = '';
    for (var i = 0; i < state.toc.length; i++) {
      var item = state.toc[i];
      html += '<a class="h' + item.depth + '" href="#' + esc(item.id) + '" data-i="' + i +
        '" title="' + esc(t('toc.jump', { line: item.line })) + '">' + esc(item.text) + '</a>';
    }
    el.toc.innerHTML = html;
    applyTocFilter();
  }

  function applyTocFilter() {
    var q = (state.tocFilter || '').trim().toLowerCase();
    var links = el.toc.querySelectorAll('a[data-i]');
    var shown = 0;
    for (var i = 0; i < links.length; i++) {
      var hit = !q || links[i].textContent.toLowerCase().indexOf(q) !== -1;
      links[i].hidden = !hit;
      if (hit) shown++;
    }
    el.tocClear.hidden = !q;
    if (!links.length) {
      el.tocEmpty.textContent = t('toc.none');
      el.tocEmpty.hidden = false;
    } else {
      el.tocEmpty.textContent = t('toc.empty');
      el.tocEmpty.hidden = shown !== 0;
    }
  }

  function markActiveToc() {
    if (el.sidebar.hidden || !state.toc.length) return;
    var top = el.previewScroll.scrollTop + 24;
    var active = -1;
    for (var i = 0; i < state.toc.length; i++) {
      if (state.toc[i].part.top <= top) active = i;
      else break;
    }
    var links = el.toc.children;
    for (var j = 0; j < links.length; j++) links[j].classList.toggle('active', j === active);
  }

  /* -------------------------------------------------------------- scroll sync */

  function lineHeight() {
    var lh = parseFloat(window.getComputedStyle(el.editor).lineHeight);
    return isNaN(lh) || lh <= 0 ? 20.8 : lh;
  }

  function currentLine() {
    var st = el.editor.scrollTop;
    var max = el.editor.scrollHeight - el.editor.clientHeight;
    if (state.wrap) {
      if (max <= 0) return 1;
      return 1 + (st / max) * (state.lines - 1);
    }
    return Math.floor(st / lineHeight()) + 1;
  }

  function anchorForLine(line) {
    var a = state.anchors;
    if (!a.length) return null;
    var lo = 0, hi = a.length - 1, best = 0;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      if (a[mid].line <= line) { best = mid; lo = mid + 1; } else hi = mid - 1;
    }
    var pick = a[best];
    var span = pick.endLine - pick.line;
    var off = span > 0 ? clamp((line - pick.line) / span, 0, 1) : 0;
    return { top: pick.top + off * pick.height };
  }

  function anchorForTop(top) {
    var a = state.anchors;
    if (!a.length) return null;
    var lo = 0, hi = a.length - 1, best = 0;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      if (a[mid].top <= top) { best = mid; lo = mid + 1; } else hi = mid - 1;
    }
    var pick = a[best];
    var ratio = pick.height > 0 ? clamp((top - pick.top) / pick.height, 0, 1) : 0;
    var span = pick.endLine - pick.line;
    return { line: pick.line + ratio * span };
  }

  function ignoreEcho(pane, ms) {
    state.lock.pane = pane;
    state.lock.until = Date.now() + ms;
  }

  function isEcho(pane) {
    var l = state.lock;
    if (Date.now() >= l.until) return false;
    return l.pane === pane || l.pane === 'both';
  }

  var editorScrollQueued = false;
  function onEditorScroll() {
    el.gutterInner.style.transform = 'translateY(' + (-el.editor.scrollTop) + 'px)';
    if (!state.sync || state.mode === 'write') return;
    if (editorScrollQueued) return;
    editorScrollQueued = true;
    requestAnimationFrame(function () {
      editorScrollQueued = false;
      if (isEcho('editor')) return;
      var a = anchorForLine(currentLine());
      if (!a) return;
      ignoreEcho('preview', 160);
      el.previewScroll.scrollTop = Math.max(0, a.top - 12);
    });
  }

  var previewScrollQueued = false;
  function onPreviewScroll() {
    if (previewScrollQueued) return;
    previewScrollQueued = true;
    requestAnimationFrame(function () {
      previewScrollQueued = false;
      markActiveToc();
      if (!state.sync || state.mode === 'preview') return;
      if (isEcho('preview')) return;
      var a = anchorForTop(el.previewScroll.scrollTop + 8);
      if (!a) return;
      ignoreEcho('editor', 160);
      var lh = lineHeight();
      if (state.wrap) {
        var max = el.editor.scrollHeight - el.editor.clientHeight;
        if (max > 0) el.editor.scrollTop = ((a.line - 1) / Math.max(1, state.lines - 1)) * max;
      } else {
        el.editor.scrollTop = Math.max(0, (a.line - 1) * lh);
      }
    });
  }

  function jumpToLine(line, id) {
    ignoreEcho('both', 220);
    var text = el.editor.value;
    var lines = text.split('\n');
    var idx = clamp(line, 1, lines.length) - 1;

    if (state.mode !== 'preview') {
      var start = 0;
      for (var i = 0; i < idx; i++) start += lines[i].length + 1;
      el.editor.focus({ preventScroll: true });
      el.editor.setSelectionRange(start, start + lines[idx].length);
      if (state.wrap) {
        var max = el.editor.scrollHeight - el.editor.clientHeight;
        if (max > 0) el.editor.scrollTop = (idx / Math.max(1, lines.length - 1)) * max;
      } else {
        el.editor.scrollTop = Math.max(0, (idx - 3) * lineHeight());
      }
      markGutterCursor();
    }

    if (id) {
      var node = byId(id);
      if (node && typeof node.scrollIntoView === 'function') {
        node.scrollIntoView({ block: 'start' });
        return;
      }
    }
    var a = anchorForLine(line);
    if (a) el.previewScroll.scrollTop = Math.max(0, a.top - 12);
  }

  function byId(id) {
    if (window.CSS && typeof CSS.escape === 'function') {
      return el.preview.querySelector('#' + CSS.escape(id));
    }
    var all = el.preview.querySelectorAll('[id]');
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return null;
  }

  /* ------------------------------------------------------------------ gutter */

  var GUTTER_MAX = 20000;
  var gutterCurrent = null;

  function buildGutter() {
    if (state.wrap || state.lines > GUTTER_MAX) {
      // Wrapped lines have no stable numbers, and tens of thousands of gutter nodes would cost
      // more than they are worth — the status bar still reports the exact position.
      el.gutterInner.textContent = '';
      gutterCurrent = null;
      state.curLine = -1;
      return;
    }
    var n = state.lines;
    state.curLine = -1;
    gutterCurrent = null;
    if (el.gutterInner.childElementCount === n) { markGutterCursor(); return; }
    var html = '';
    for (var i = 1; i <= n; i++) html += '<span>' + i + '</span>';
    el.gutterInner.innerHTML = html;
    markGutterCursor();
  }

  function markGutterCursor() {
    if (state.wrap || !el.gutterInner.childElementCount) return;
    var line = el.editor.value.slice(0, el.editor.selectionStart).split('\n').length;
    if (line === state.curLine) return;
    state.curLine = line;
    if (gutterCurrent) gutterCurrent.classList.remove('cur');
    gutterCurrent = el.gutterInner.children[line - 1] || null;
    if (gutterCurrent) gutterCurrent.classList.add('cur');
  }

  /* ------------------------------------------------------------------- stats */

  var statsTimer = 0;

  function updateStats(src, ms) {
    var lines = src ? src.split('\n') : [''];
    var upto = src.slice(0, el.editor.selectionStart);
    var row = upto.split('\n').length;
    var col = upto.length - (upto.lastIndexOf('\n') + 1) + 1;
    el.statusPos.textContent = t('status.line', { line: row, col: col });

    var words = src.trim() ? src.trim().split(/\s+/).length : 0;
    el.statusCount.textContent = t('status.count', { words: words, chars: src.length });
    if (ms) el.statusPerf.textContent = t('status.render', { ms: Math.max(1, Math.round(ms)) });

    var lang = Direction.detectLanguage(src);
    el.statusLang.textContent = lang;
    el.editor.setAttribute('lang', lang);
    el.editor.setAttribute('dir', state.dirMode === 'auto' ? Direction.dominantDir(src) : state.dirMode);

    el.editorMeta.textContent = lines.length + ' lines · ' + src.length + ' chars';
    el.previewMeta.textContent = state.anchors.length
      ? state.anchors.length + ' blocks · ' + state.dirMode
      : '';
    updateChrome();
  }

  function updateStatsSoon() {
    clearTimeout(statsTimer);
    statsTimer = setTimeout(function () { updateStats(el.editor.value, 0); }, 120);
  }

  /* -------------------------------------------------------------- appearance */

  function applyTheme() {
    var dark = isDark();
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    el.ghLight.disabled = dark;
    el.ghDark.disabled = !dark;
    el.hljsLight.disabled = dark;
    el.hljsDark.disabled = !dark;
    updateThemeButton();
  }

  /** The theme button doubles as an indicator: its glyph and tooltip name the active mode. */
  function updateThemeButton() {
    var themeKey = state.theme === 'auto' ? 'system' : state.theme;
    var label = t('theme.label') + ': ' + t('theme.' + themeKey);
    el.btnTheme.innerHTML = Icons.svg(state.theme === 'auto' ? 'monitor' : (isDark() ? 'moon' : 'sun'), 16);
    el.btnTheme.setAttribute('title', label);
    el.btnTheme.setAttribute('aria-label', label);
  }

  function cycleTheme() {
    state.theme = state.theme === 'auto' ? 'light' : (state.theme === 'light' ? 'dark' : 'auto');
    applyTheme();
    updateChrome();
    saveSettings();
    toast(t('info.theme', {
      mode: t('theme.' + (state.theme === 'auto' ? 'system' : state.theme))
    }));
  }

  function applyFont() {
    document.documentElement.style.setProperty('--rv-font', state.font);
  }

  function applyWrap() {
    el.editor.setAttribute('data-wrap', state.wrap ? '1' : '0');
    el.editorWrap.setAttribute('data-wrap', state.wrap ? '1' : '0');
    buildGutter();
  }

  function applyMode() {
    el.panes.setAttribute('data-mode', state.mode);
    // Anchors measured while a pane was hidden are meaningless: re-measure.
    scheduleRender(null, 0);
  }

  function applySidebar() {
    el.sidebar.hidden = !state.sidebar;
    el.layout.setAttribute('data-sidebar', state.sidebar ? 'on' : 'off');
    markActiveToc();
  }

  function applySplit() {
    document.documentElement.style.setProperty('--split', state.split.toFixed(2) + '%');
  }

  function setDir(mode) {
    state.dirMode = mode;
    updateChrome();
    saveSettings();
    render({ immediate: true });
  }

  function setEditPreview(on) {
    state.editPreview = !!on;
    applyTaskMode();
    saveSettings();
    toast(state.editPreview
      ? (state.tasksOk ? t('info.editOn') : t('edit.unavailable', { reason: state.taskReason }))
      : t('info.editOff'), state.editPreview && !state.tasksOk ? 'warning' : 'info');
  }

  /* ------------------------------------------------------------------ wiring */

  function wireToolbar() {
    el.btnOpen.addEventListener('click', pickOpen);
    el.btnSave.addEventListener('click', function () { save(false); });
    el.btnSaveAs.addEventListener('click', function () { save(true); });
    el.btnReload.addEventListener('click', reloadFromDisk);
    el.btnExport.addEventListener('click', exportHtml);
    el.btnTheme.addEventListener('click', cycleTheme);
    el.btnEmptyOpen.addEventListener('click', pickOpen);
    el.btnEmptySample.addEventListener('click', function () {
      confirmDiscard().then(function (proceed) { if (proceed) loadSample(); });
    });

    el.btnWrap.addEventListener('click', function () {
      state.wrap = !state.wrap;
      applyWrap();
      updateChrome();
      saveSettings();
    });

    el.btnSync.addEventListener('click', function () {
      state.sync = !state.sync;
      updateChrome();
      saveSettings();
      toast(state.sync ? t('info.syncOn') : t('info.syncOff'));
    });

    el.btnToc.addEventListener('click', function () {
      state.sidebar = !state.sidebar;
      applySidebar();
      updateChrome();
      saveSettings();
    });

    el.btnEdit.addEventListener('click', function () { setEditPreview(!state.editPreview); });

    el.btnFontUp.addEventListener('click', function () {
      state.font = clamp(state.font + 1, FONT_MIN, FONT_MAX);
      applyFont(); updateChrome(); saveSettings();
    });
    el.btnFontDown.addEventListener('click', function () {
      state.font = clamp(state.font - 1, FONT_MIN, FONT_MAX);
      applyFont(); updateChrome(); saveSettings();
    });

    eachNode('[data-dir]', function (b) {
      b.addEventListener('click', function () { setDir(b.getAttribute('data-dir')); });
    });

    eachNode('[data-mode-btn]', function (b) {
      b.addEventListener('click', function () { setMode(b.getAttribute('data-mode-btn')); });
    });

    el.baseUrl.addEventListener('input', function () {
      state.baseUrl = el.baseUrl.value.trim();
      saveSettings();
      scheduleRender();
    });

    el.fileInput.addEventListener('change', function () {
      var f = el.fileInput.files && el.fileInput.files[0];
      if (f) {
        confirmDiscard().then(function (proceed) {
          if (proceed) loadFile(f, null);
        });
      }
      el.fileInput.value = '';
    });
  }

  function setMode(mode) {
    if (state.mode === mode) return;
    state.mode = mode;
    applyMode();
    updateChrome();
    saveSettings();
  }

  function wireModals() {
    var showHelp = function (show) {
      el.helpModal.hidden = !show;
      if (show) el.btnHelpDone.focus();
      else el.btnHelp.focus();
    };

    el.btnHelp.addEventListener('click', function () { showHelp(true); });
    el.btnHelpClose.addEventListener('click', function () { showHelp(false); });
    el.btnHelpDone.addEventListener('click', function () { showHelp(false); });
    el.helpModal.addEventListener('mousedown', function (e) {
      if (e.target === el.helpModal) showHelp(false);
    });

    $('localeSelect').addEventListener('change', function (e) {
      if (I18n.setLocale(e.target.value)) {
        saveSettings();
        applyLocale();
      }
    });

    el.btnConfirmSave.addEventListener('click', function () { closeConfirm('save'); });
    el.btnConfirmDiscard.addEventListener('click', function () { closeConfirm('discard'); });
    el.btnConfirmCancel.addEventListener('click', function () { closeConfirm(null); });
    el.confirmModal.addEventListener('mousedown', function (e) {
      if (e.target === el.confirmModal) closeConfirm(null);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (!el.confirmModal.hidden) { closeConfirm(null); e.stopPropagation(); return; }
      if (!el.helpModal.hidden) { showHelp(false); e.stopPropagation(); }
    });
  }

  function wireEditor() {
    var composing = false;
    el.editor.addEventListener('compositionstart', function () { composing = true; });
    el.editor.addEventListener('compositionend', function () { composing = false; });

    el.editor.addEventListener('input', function (e) {
      if (e.inputType === 'insertParagraph' || e.inputType === 'insertLineBreak') {
        autoIndentAfterNewline();
      }
      markDirtyFromValue();
      scheduleRender();
    });

    el.editor.addEventListener('scroll', onEditorScroll, { passive: true });

    el.editor.addEventListener('keydown', function (e) {
      if (composing || e.isComposing || e.keyCode === 229) return;
      if (e.key === 'Tab') {
        e.preventDefault();
        indentSelection(e.shiftKey);
      }
    });

    ['keyup', 'click', 'select', 'focus'].forEach(function (type) {
      el.editor.addEventListener(type, function () {
        markGutterCursor();
        updateStatsSoon();
      });
    });
  }

  function indentSelection(outdent) {
    var ed = el.editor;
    var v = ed.value;
    var s = ed.selectionStart;
    var e = ed.selectionEnd;
    var ls = v.lastIndexOf('\n', s - 1) + 1;
    var last = e > s && v.charAt(e - 1) === '\n' ? e - 1 : e;
    var le = v.indexOf('\n', last);
    if (le < 0) le = v.length;
    var block = v.slice(ls, le);
    var lines = block.split('\n');
    var offset = ls;
    var changes = [];
    var next = lines.map(function (line) {
      var removed = outdent ? (/^( {1,2}|\t)/.exec(line) || [''])[0].length : 0;
      var added = outdent ? 0 : 2;
      changes.push({ start: offset, removed: removed, added: added });
      offset += line.length + 1;
      return outdent ? line.slice(removed) : '  ' + line;
    }).join('\n');
    function move(pos) {
      var delta = 0;
      changes.forEach(function (change) {
        if (pos >= change.start) {
          delta += change.added - Math.min(change.removed, pos - change.start);
        }
      });
      return pos + delta;
    }
    ed.focus({ preventScroll: true });
    ed.setRangeText(next, ls, le, 'end');
    ed.setSelectionRange(move(s), move(e));
    markDirtyFromValue();
    scheduleRender();
  }

  function autoIndentAfterNewline() {
    var ed = el.editor;
    var pos = ed.selectionStart;
    var v = ed.value;
    if (pos !== ed.selectionEnd || v.charAt(pos - 1) !== '\n') return;
    var ls = v.lastIndexOf('\n', pos - 2) + 1;
    var line = v.slice(ls, pos - 1);
    var m = /^([ \t]*)(?:([-*+]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?|(>)[ \t]?)?/.exec(line);
    if (!m) return;
    var indent = m[1];
    if (m[2]) indent += m[2] + ' ';
    else if (m[3]) indent += '> ';
    if (!indent) return;
    var nextCh = v.charAt(pos);
    if (nextCh && !/\s/.test(nextCh)) return;
    ed.setRangeText(indent, pos, pos, 'end');
  }

  function wirePreview() {
    el.previewScroll.addEventListener('scroll', onPreviewScroll, { passive: true });

    el.preview.addEventListener('click', function (e) {
      var target = e.target;
      if (!target || typeof target.closest !== 'function') return;

      var box = target.closest('input[data-rv-task]');
      if (box) { e.preventDefault(); toggleTaskFromPreview(box); return; }

      var copy = target.closest('[data-copy-code]');
      if (copy) { e.preventDefault(); copyCode(copy); return; }

      var anchor = target.closest('a.heading-anchor');
      if (anchor) {
        e.preventDefault();
        var id = (anchor.getAttribute('href') || '').replace(/^#/, '');
        var item = null;
        for (var i = 0; i < state.toc.length; i++) {
          if (state.toc[i].id === id) { item = state.toc[i]; break; }
        }
        jumpToLine(item ? item.line : currentLine(), id);
      }
    });

    el.preview.addEventListener('keydown', function (e) {
      var target = e.target;
      if (!target || typeof target.closest !== 'function') return;
      var copy = target.closest('[data-copy-code]');
      if (copy && (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar')) {
        e.preventDefault();
        copyCode(copy);
      }
    });

    el.toc.addEventListener('click', function (e) {
      var a = e.target && e.target.closest ? e.target.closest('a[data-i]') : null;
      if (!a) return;
      e.preventDefault();
      var item = state.toc[+a.getAttribute('data-i')];
      if (item) jumpToLine(item.line, item.id);
    });

    el.tocFilter.addEventListener('input', function () {
      state.tocFilter = el.tocFilter.value;
      applyTocFilter();
      markActiveToc();
    });

    el.tocClear.addEventListener('click', function () {
      el.tocFilter.value = '';
      state.tocFilter = '';
      applyTocFilter();
      el.tocFilter.focus();
    });
  }

  function wireDragDrop() {
    var depth = 0;

    function hasFiles(e) {
      var dt = e.dataTransfer;
      if (!dt || !dt.types) return false;
      for (var i = 0; i < dt.types.length; i++) if (dt.types[i] === 'Files') return true;
      return false;
    }

    window.addEventListener('dragenter', function (e) {
      if (!hasFiles(e)) return;
      depth++;
      document.body.classList.add('dragover');
      e.preventDefault();
    });
    window.addEventListener('dragover', function (e) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });
    window.addEventListener('dragleave', function () {
      depth = Math.max(0, depth - 1);
      if (!depth) document.body.classList.remove('dragover');
    });
    window.addEventListener('drop', function (e) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      document.body.classList.remove('dragover');
      handleDrop(e.dataTransfer);
    });
  }

  function handleDrop(dt) {
    var items = dt.items ? Array.prototype.slice.call(dt.items) : [];
    var entries = [];
    items.forEach(function (item) {
      if (item.kind !== 'file') return;
      var entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
      if (entry) entries.push(entry);
    });

    var files = dt.files ? Array.prototype.slice.call(dt.files) : [];
    var mdFile = files.filter(isMarkdown)[0] || files[0];
    var directories = entries.filter(function (x) { return x.isDirectory; });

    // A folder was dropped: look for a README inside and use the folder as the link base.
    if (!mdFile && directories.length) {
      findReadme(directories[0], 0).then(function (entry) {
        if (!entry) { toast(t('error.notFound'), 'error'); return; }
        return openEntry(entry).then(function (file) {
          var base = 'file://' + entry.fullPath.replace(/[^/]+$/, '');
          state.baseUrl = base;
          el.baseUrl.value = base;
          saveSettings();
          return confirmDiscard().then(function (proceed) {
            if (proceed) loadFile(file, null);
          });
        });
      }).catch(function (err) {
        toast(t('error.open', { name: entryName(directories[0]), reason: (err && err.message) || err }), 'error');
      });
      return;
    }

    if (!mdFile) return;
    confirmDiscard().then(function (proceed) {
      if (!proceed) return;
      var first = items.filter(function (item) {
        return item.kind === 'file' && item.getAsFile && item.getAsFile() === mdFile;
      })[0];
      if (first && first.getAsFileSystemHandle) {
        first.getAsFileSystemHandle().then(function (h) {
          loadFile(mdFile, h && h.kind === 'file' ? h : null);
        }).catch(function () { loadFile(mdFile, null); });
      } else {
        loadFile(mdFile, null);
      }
    });
  }

  function entryName(entry) { return (entry && entry.name) || ''; }

  function isMarkdown(f) {
    return /\.(md|markdown|mdown|mkd|mdwn|txt)$/i.test(f.name || '');
  }

  function findReadme(entry, depth) {
    if (depth > 3) return Promise.resolve(null);
    var reader = entry.createReader();
    return new Promise(function (resolve) {
      reader.readEntries(function (list) {
        if (!list || !list.length) { resolve(null); return; }
        var dirs = [];
        var files = [];
        Array.prototype.forEach.call(list, function (x) {
          (x.isDirectory ? dirs : files).push(x);
        });
        for (var i = 0; i < files.length; i++) {
          if (/^readme(\.|$)/i.test(files[i].name)) { resolve(files[i]); return; }
        }
        var idx = 0;
        (function next() {
          if (idx >= dirs.length) { resolve(null); return; }
          findReadme(dirs[idx++], depth + 1).then(function (found) {
            if (found) resolve(found); else next();
          });
        })();
      }, function () { resolve(null); });
    });
  }

  function openEntry(entry) {
    return new Promise(function (resolve, reject) { entry.file(resolve, reject); });
  }

  function wireResizer() {
    var dragging = false;

    el.resizer.addEventListener('pointerdown', function (e) {
      dragging = true;
      el.resizer.setAttribute('data-dragging', '1');
      if (el.resizer.setPointerCapture) {
        try { el.resizer.setPointerCapture(e.pointerId); } catch (err) { void 0; }
      }
      e.preventDefault();
    });

    el.resizer.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var rect = el.panes.getBoundingClientRect();
      if (!rect.width) return;
      var pct = clamp((e.clientX - rect.left) / rect.width * 100, 15, 85);
      state.split = pct;
      applySplit();
    });

    var stop = function (e) {
      if (!dragging) return;
      dragging = false;
      el.resizer.removeAttribute('data-dragging');
      if (el.resizer.releasePointerCapture) {
        try { el.resizer.releasePointerCapture(e.pointerId); } catch (err) { void 0; }
      }
      saveSettings();
      scheduleRender(null, 0);
    };
    el.resizer.addEventListener('pointerup', stop);
    el.resizer.addEventListener('pointercancel', stop);

    el.resizer.addEventListener('keydown', function (e) {
      var step = e.key === 'ArrowLeft' ? -3 : (e.key === 'ArrowRight' ? 3 : 0);
      if (!step) return;
      e.preventDefault();
      state.split = clamp(state.split + step, 15, 85);
      applySplit();
      saveSettings();
      scheduleRender(null, 0);
    });
  }

  function wireGlobalKeys() {
    document.addEventListener('keydown', function (e) {
      var mod = e.ctrlKey || e.metaKey;
      if (!mod || e.altKey) return;
      var key = (e.key || '').toLowerCase();
      if (key === 's') { e.preventDefault(); save(e.shiftKey); return; }
      if (key === 'o') { e.preventDefault(); pickOpen(); return; }
      if (key === 'e') { e.preventDefault(); setEditPreview(!state.editPreview); return; }
      if (key === '1') { e.preventDefault(); setMode('write'); return; }
      if (key === '2') { e.preventDefault(); setMode('split'); return; }
      if (key === '3') { e.preventDefault(); setMode('preview'); return; }
      if (key === 'f') {
        e.preventDefault();
        if (!state.sidebar) { state.sidebar = true; applySidebar(); updateChrome(); saveSettings(); }
        el.tocFilter.focus();
        el.tocFilter.select();
      }
    });
  }

  function wireMisc() {
    if (darkMq && typeof darkMq.addEventListener === 'function') {
      darkMq.addEventListener('change', function () {
        if (state.theme === 'auto') { applyTheme(); updateChrome(); }
      });
    }

    var resizeQueued = false;
    window.addEventListener('resize', function () {
      el.gutterInner.style.transform = 'translateY(' + (-el.editor.scrollTop) + 'px)';
      if (resizeQueued) return;
      resizeQueued = true;
      setTimeout(function () {
        resizeQueued = false;
        measureParts();
        markActiveToc();
      }, 150);
    });

    window.addEventListener('beforeunload', function (e) {
      if (!state.dirty) return undefined;
      e.preventDefault();
      e.returnValue = '';
      return '';
    });

    window.addEventListener('beforeprint', function () {
      el.previewScroll.scrollTop = 0;
    });
  }

  /* ------------------------------------------------------------------ sample */

  var SAMPLE = [
    '# README Viewer',
    '',
    'A local, offline Markdown reader. This sample doubles as a rendering test:',
    'headings, tables, code, links, **bold**, *italic*, ~~strikethrough~~ and `inline code`.',
    '',
    '## Tasks',
    '',
    'Turn on **Edit in preview**, then click any checkbox — only its `[ ]` marker is rewritten.',
    '',
    '- [x] Render GitHub flavoured Markdown',
    '- [ ] Learn PostgreSQL',
    '- [ ] Ship the release notes',
    '  - [x] Draft the changelog',
    '  - [ ] Tag `v1.0.0`',
    '- [ ] Duplicate task',
    '- [ ] Duplicate task',
    '',
    '> Block quotes keep their own direction, and nested lists stay aligned.',
    '',
    '## Code',
    '',
    '```python',
    'def greet(name: str) -> str:',
    '    return f"Hello, {name}!"',
    '```',
    '',
    '```bash',
    'npm test && open index.html',
    '```',
    '',
    '## Table',
    '',
    '| Feature | Status | Notes |',
    '| --- | :---: | --- |',
    '| Task lists | ✅ | Interactive in preview |',
    '| RTL content | ✅ | Per block |',
    '| Offline | ✅ | No network calls |',
    '',
    '## فارسی',
    '',
    'این پاراگراف راست‌به‌چپ است و جهت آن به‌صورت خودکار تشخیص داده می‌شود.',
    'متن فارسی در میان متن English باید درست نمایش داده شود، بدون به‌هم‌ریختن پرانتزها (parentheses).',
    '',
    '- [x] پشتیبانی از کیبورد فارسی',
    '- [ ] پشتیبانی از ورودی چینی و ژاپنی (IME)',
    '',
    '---',
    '',
    'Links: [external](https://github.com) and a relative [reference][ref].',
    '',
    '[ref]: https://example.com "Reference"',
    ''
  ].join('\n');

  function loadSample() {
    setDoc(SAMPLE, 'sample.md', null, { eol: '\n', bom: false, encoding: 'utf-8' });
  }

  /* -------------------------------------------------------------------- boot */

  function cacheEls() {
    var ids = ['layout', 'panes', 'sidebar', 'toc', 'tocFilter', 'tocClear', 'tocEmpty',
      'baseUrl', 'editor', 'editorWrap', 'gutter', 'gutterInner', 'previewScroll', 'preview',
      'emptyState', 'resizer', 'fileName', 'fileState', 'fileInput', 'statusFile', 'statusPos',
      'statusCount', 'statusTasks', 'statusPerf', 'statusLang', 'statusEncoding', 'toasts',
      'editorMeta', 'previewMeta', 'editBadge', 'helpModal', 'confirmModal', 'ghLight',
      'ghDark', 'hljsLight', 'hljsDark', 'btnOpen', 'btnSave', 'btnSaveAs', 'btnReload',
      'btnExport', 'btnTheme', 'btnWrap', 'btnSync', 'btnToc', 'btnEdit', 'btnFontUp',
      'btnFontDown', 'btnHelp', 'btnHelpClose', 'btnHelpDone', 'btnConfirmSave',
      'btnConfirmDiscard', 'btnConfirmCancel', 'btnEmptyOpen', 'btnEmptySample', 'fontValue',
      'brandMark'];
    for (var i = 0; i < ids.length; i++) el[ids[i]] = $(ids[i]);
  }

  function boot() {
    cacheEls();

    md = Markdown.create({
      marked: window.marked,
      purify: window.DOMPurify,
      icons: Icons.svg
    }, { strings: I18n.t });
    hl = Highlight.create({ hljs: window.hljs });

    loadSettings();
    Icons.inject(document.body);
    el.brandMark.innerHTML = Icons.svg('logo', 18);

    applyTheme();
    applyFont();
    applyWrap();
    applySidebar();
    applySplit();
    el.panes.setAttribute('data-mode', state.mode);
    el.baseUrl.value = state.baseUrl;

    wireToolbar();
    wireModals();
    wireEditor();
    wirePreview();
    wireDragDrop();
    wireResizer();
    wireGlobalKeys();
    wireMisc();

    applyLocale();
    setEmpty();
    markGutterCursor();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  /* Exposed for debugging and for the jsdom test suite. */
  window.RVApp = {
    state: state,
    el: el,
    render: render,
    scheduleRender: scheduleRender,
    toggleTaskFromPreview: toggleTaskFromPreview,
    loadSample: loadSample,
    setDoc: setDoc,
    setEmpty: setEmpty,
    setEditPreview: setEditPreview,
    setMode: setMode,
    save: save,
    toast: toast,
    applyLocale: applyLocale,
    SAMPLE: SAMPLE
  };
}());
