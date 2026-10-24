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
  function nativeAvailable() { return !!(RV.Native && RV.Native.available()); }
  function reportOpen(err, name) {
    if (err && err.name === 'AbortError') return;
    toast(t('error.open', { name: name || '', reason: (err && err.message) || String(err) }), 'error');
  }
  function applyHandleBase(handle) {
    if (!handle || !Object.prototype.hasOwnProperty.call(handle, 'baseUrl')) return;
    state.baseUrl = typeof handle.baseUrl === 'string' ? handle.baseUrl : '';
    state.autoBase = true;
    el.baseUrl.value = state.baseUrl;
  }

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
    ready: false,
    handle: null,
    name: '',
    saved: '',
    dirty: false,
    needsSave: false,
    hasDocument: false,
    bom: false,
    eol: '\n',
    encoding: '',
    baseUrl: '',
    autoBase: false,
    folder: null,
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

  // Document fields belong to a tab; display preferences remain application-wide.
  var tabs = [], activeTab = null, nextTabId = 1;
  var manualBaseUrl = '';
  var mobileSidebar = false;
  var documentFields = ['handle', 'name', 'saved', 'dirty', 'needsSave', 'hasDocument', 'bom', 'eol',
    'encoding', 'baseUrl', 'autoBase', 'folder', 'tocFilter', 'curLine'];

  function tabText(key, fallback) { var value = t(key); return value === key ? fallback : value; }
  function captureTab() {
    if (!activeTab) return;
    documentFields.forEach(function (key) { activeTab[key] = state[key]; });
    activeTab.source = el.editor.value;
    activeTab.editor = el.editor;
    activeTab.selection = [el.editor.selectionStart, el.editor.selectionEnd, el.editor.selectionDirection];
    activeTab.scroll = [el.editor.scrollTop, el.editor.scrollLeft, el.previewScroll.scrollTop];
    activeTab.nav = nav;
    activeTab.find = { query: el.findInput.value, hidden: el.findBar.hidden, index: find.index };
  }
  var tabSignature = '';
  function tabLocation(tab) {
    var handle = tab === activeTab ? state.handle : tab.handle;
    var folder = tab === activeTab ? state.folder : tab.folder;
    return handle && handle.path || (folder ? folder.root.fullPath + '/' + folder.path : '');
  }
  function tabLabel(tab) {
    var name = (tab === activeTab ? state.name : tab.name) || tabText('tabs.untitled', 'Untitled');
    if (tabs.filter(function (other) { return (other === activeTab ? state.name : other.name) === name; }).length < 2) return name;
    var path = tabLocation(tab).replace(/\\/g, '/').split('/').filter(Boolean);
    return name + ' — ' + (path.length > 1 ? path[path.length - 2] : '#' + (tabs.indexOf(tab) + 1));
  }
  function renderTabs() {
    var bar = $('documentTabs');
    if (!bar) return;
    var signature = JSON.stringify(tabs.map(function (tab) {
      return [tab.id, tab === activeTab, tab === activeTab ? state.name : tab.name,
        tab === activeTab ? state.dirty : tab.dirty, tabLocation(tab)];
    })) + I18n.getLocale();
    if (signature === tabSignature) return;
    tabSignature = signature;
    var focused = document.activeElement;
    var focusId = focused && focused.getAttribute('data-tab-focus');
    bar.textContent = '';
    tabs.forEach(function (tab) {
      var selected = tab === activeTab;
      var name = selected ? state.name : tab.name;
      var dirty = selected ? state.dirty : tab.dirty;
      var item = document.createElement('div');
      item.className = 'document-tab' + (selected ? ' is-active' : '');
      item.setAttribute('data-tab-id', tab.id);
      var button = document.createElement('button');
      button.type = 'button'; button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', selected ? 'true' : 'false');
      button.setAttribute('aria-controls', 'panes');
      button.setAttribute('tabindex', selected ? '0' : '-1');
      button.setAttribute('data-tab-focus', 'tab-' + tab.id);
      button.addEventListener('keydown', function (event) {
        var index = tabs.indexOf(tab), next = index;
        var rtl = document.documentElement.getAttribute('dir') === 'rtl';
        if (event.key === 'ArrowRight') next = (index + (rtl ? -1 : 1) + tabs.length) % tabs.length;
        else if (event.key === 'ArrowLeft') next = (index + (rtl ? 1 : -1) + tabs.length) % tabs.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = tabs.length - 1;
        else return;
        event.preventDefault();
        if (switchTab(tabs[next].id)) {
          var target = bar.querySelector('[data-tab-focus="tab-' + tabs[next].id + '"]');
          if (target) target.focus();
        }
      });
      button.textContent = (dirty ? '• ' : '') + tabLabel(tab);
      button.title = tabLocation(tab) || tabLabel(tab);
      button.setAttribute('aria-label', button.textContent + (tabLocation(tab) ? ': ' + tabLocation(tab) : ''));
      button.addEventListener('click', function () { switchTab(tab.id); });
      var close = document.createElement('button');
      close.type = 'button'; close.className = 'document-tab-close'; close.innerHTML = Icons.svg('close', 12);
      close.setAttribute('data-tab-focus', 'close-' + tab.id);
      close.setAttribute('aria-label', tabText('tabs.close', 'Close tab') + ': ' + (name || tabText('tabs.untitled', 'Untitled')));
      close.addEventListener('click', function () { closeTab(tab.id); });
      item.appendChild(button); item.appendChild(close); bar.appendChild(item);
    });
    var selectedTab = bar.querySelector('[aria-selected="true"]');
    if (selectedTab && selectedTab.scrollIntoView) selectedTab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (focusId) {
      var replacement = bar.querySelector('[data-tab-focus="' + focusId + '"]');
      if (replacement) replacement.focus();
    }
  }
  function switchTab(id, internal) {
    var tab = tabs.filter(function (item) { return item.id === id; })[0];
    if (!tab || (!internal && (pendingSave || pendingDiscard))) return false;
    if (tab === activeTab) return true;
    var previous = activeTab;
    if (previous) previous.editType = null;
    tab.editType = null;
    captureTab(); activeTab = tab;
    if (comparison.visible && comparison.id === tab.id && previous) comparison.id = previous.id;
    documentFields.forEach(function (key) { state[key] = tab[key]; });
    state.documentId++;
    mountEditor(tab.editor, tab.source);
    el.baseUrl.value = state.baseUrl;
    el.tocFilter.value = state.tocFilter || '';
    nav = tab.nav;
    el.findInput.value = tab.find.query; el.findBar.hidden = tab.find.hidden;
    find.index = tab.find.index;
    el.emptyState.hidden = state.hasDocument;
    if (state.hasDocument) el.previewScroll.removeAttribute('data-empty');
    else el.previewScroll.setAttribute('data-empty', '1');
    render({ immediate: true });
    el.editor.setSelectionRange(tab.selection[0], tab.selection[1], tab.selection[2]);
    el.editor.scrollTop = tab.scroll[0]; el.editor.scrollLeft = tab.scroll[1];
    el.previewScroll.scrollTop = tab.scroll[2];
    updateNavButtons(); updateChrome(); trackModified();
    return true;
  }
  function newTab(text, name, handle, meta) {
    if (pendingSave || pendingDiscard) return false;
    captureTab();
    var tab = { id: nextTabId++ };
    tabs.push(tab); activeTab = tab;
    nav = { list: [], index: -1, moving: false };
    el.findInput.value = ''; el.findBar.hidden = true;
    state.folder = null; state.tocFilter = ''; state.curLine = -1; el.tocFilter.value = '';
    state.baseUrl = manualBaseUrl; state.autoBase = false; el.baseUrl.value = manualBaseUrl;
    if (typeof text === 'string') setDoc(text, name || 'README.md', handle, meta);
    else setEmpty();
    el.editor.setSelectionRange(0, 0); el.editor.scrollTop = 0; el.previewScroll.scrollTop = 0;
    captureTab(); renderTabs(); return tab.id;
  }
  function listTabs() {
    captureTab();
    return tabs.map(function (tab) { return { id: tab.id, name: tab.name, source: tab.source,
      dirty: tab.dirty, hasDocument: tab.hasDocument, needsSave: tab.needsSave, active: tab === activeTab, handle: tab.handle, saved: tab.saved,
      bom: tab.bom, eol: tab.eol, encoding: tab.encoding, baseUrl: tab.baseUrl, autoBase: tab.autoBase }; });
  }
  function restoreTab(snapshot) {
    if (!snapshot || typeof snapshot.source !== 'string') return false;
    var metadata = { bom: !!snapshot.bom, eol: snapshot.eol === '\r\n' ? '\r\n' : '\n', encoding: 'utf-8' };
    var name = typeof snapshot.name === 'string' ? snapshot.name : 'README.md';
    var id;
    if (tabs.length === 1 && !state.hasDocument && !el.editor.value && !pendingSave && !pendingDiscard) {
      setDoc(snapshot.source, name, null, metadata); id = activeTab.id;
    } else id = newTab(snapshot.source, name, null, metadata);
    if (!id) return false;
    state.saved = typeof snapshot.saved === 'string' ? snapshot.saved : snapshot.source;
    state.baseUrl = typeof snapshot.baseUrl === 'string' ? snapshot.baseUrl : '';
    state.autoBase = false; state.needsSave = true; el.baseUrl.value = state.baseUrl;
    setDirty(true); render({ immediate: true }); return id;
  }
  function closeTab(id) {
    if (pendingSave || pendingDiscard) return Promise.resolve(false);
    var tab = tabs.filter(function (item) { return item.id === id; })[0];
    if (!tab) return Promise.resolve(false);
    var previous = activeTab.id;
    switchTab(id);
    return confirmDiscard().then(function (ok) {
      if (!ok) { switchTab(previous, true); return false; }
      var index = tabs.indexOf(tab);
      tabs.splice(index, 1); activeTab = null;
      if (tab.editor && tab.editor !== el.editor && tab.editor.parentNode) tab.editor.parentNode.removeChild(tab.editor);
      if (tabs.length) switchTab(tabs[Math.min(index, tabs.length - 1)].id, true);
      else newTab();
      renderTabs(); return true;
    });
  }
  function confirmAllDirty() {
    if (pendingSave) return pendingSave.then(function () { return confirmAllDirty(); });
    captureTab();
    var original = activeTab.id, ids = tabs.map(function (tab) { return tab.id; });
    function next(index) {
      if (index === ids.length) { switchTab(original, true); return Promise.resolve(true); }
      switchTab(ids[index], true);
      return confirmDiscard().then(function (ok) {
        if (!ok) { switchTab(original, true); return false; }
        return next(index + 1);
      });
    }
    return next(0);
  }
  function openFileTab(file, handle) {
    if (!file) return Promise.resolve(false);
    return file.arrayBuffer().then(function (buffer) {
      var decoded = Encoding.decode(new Uint8Array(buffer));
      if (decoded.binary) { toast(t('error.binary', { name: file.name || '' }), 'error'); return false; }
      if (pendingSave || pendingDiscard) return false;
      var existing = handle && handle.path && tabs.filter(function (tab) {
        var opened = tab === activeTab ? state.handle : tab.handle;
        return opened && opened.path === handle.path;
      })[0];
      if (existing) return switchTab(existing.id);
      if (activeTab && tabs.length === 1 && !state.hasDocument && !el.editor.value) {
        setDoc(decoded.text, file.name || 'README.md', handle, decoded);
      } else if (!newTab(decoded.text, file.name || 'README.md', handle, decoded)) return false;
      pushHistory(); rememberRecent(); trackModified(); return true;
    }).catch(function (err) { reportOpen(err, file.name); return false; });
  }
  function openHandleTab(handle) {
    if (!handle) return Promise.resolve(false);
    var existing = handle.path && tabs.filter(function (tab) {
      return (tab === activeTab ? state.handle : tab.handle) &&
        (tab === activeTab ? state.handle : tab.handle).path === handle.path;
    })[0];
    if (existing) return Promise.resolve(switchTab(existing.id));
    return handle.getFile().then(function (file) { return openFileTab(file, handle); });
  }

  var comparison = { visible: false, id: null, md: null, signature: '', version: 0, urls: [], split: 50 };
  function comparisonTab() {
    return tabs.filter(function (tab) { return tab.id === comparison.id && tab !== activeTab; })[0];
  }
  function showComparison(id) {
    var other = tabs.filter(function (tab) { return tab !== activeTab && (!id || tab.id === id); })[0];
    if (!other) return false;
    comparison.visible = true; comparison.id = other.id; comparison.signature = '';
    refreshComparison(); return true;
  }
  function hideComparison() {
    comparison.visible = false; comparison.id = null;
    refreshComparison();
  }
  function comparisonFolderPath(folder, href) {
    if (!folder || /^[a-z][a-z\d+.-]*:|^\/\/|^#/i.test(href)) return null;
    var value;
    try { value = decodeURIComponent(href.split(/[?#]/)[0]); } catch (e) { return null; }
    var parts = value.charAt(0) === '/' ? [] : folder.path.split('/').slice(0, -1);
    var input = value.split('/');
    for (var i = 0; i < input.length; i++) {
      if (!input[i] || input[i] === '.') continue;
      if (input[i] === '..') { if (!parts.length) return null; parts.pop(); }
      else parts.push(input[i]);
    }
    return parts.join('/');
  }
  function refreshComparison() {
    var pane = $('comparisonPane'), divider = $('compareDivider'), views = $('workspaceViews');
    if (!pane || !views) return;
    var other = tabs.filter(function (tab) { return tab !== activeTab; });
    var toggle = $('btnCompare');
    if (toggle) { toggle.disabled = !other.length; toggle.setAttribute('aria-pressed', comparison.visible ? 'true' : 'false'); }
    if (!comparisonTab() && comparison.visible) comparison.id = other.length ? other[0].id : null;
    if (!comparison.id) comparison.visible = false;
    pane.hidden = !comparison.visible;
    if (divider) {
      divider.hidden = !comparison.visible;
      divider.setAttribute('aria-orientation', window.innerWidth <= 900 ? 'horizontal' : 'vertical');
    }
    views.setAttribute('data-compare', comparison.visible ? 'true' : 'false');
    views.style.setProperty('--compare-split', comparison.split + '%');
    var select = $('comparisonSelect');
    if (select) {
      var options = other.map(function (tab) { return [tab.id, tabLabel(tab), tab.dirty, tabLocation(tab)]; });
      var optionSignature = JSON.stringify(options);
      if (select.getAttribute('data-options') !== optionSignature) {
        select.textContent = '';
        other.forEach(function (tab) {
          var option = document.createElement('option'); option.value = String(tab.id);
          option.textContent = (tab.dirty ? '• ' : '') + tabLabel(tab);
          option.title = tabLocation(tab);
          select.appendChild(option);
        });
        select.setAttribute('data-options', optionSignature);
      }
      select.value = String(comparison.id);
    }
    var preview = $('comparisonPreview');
    if (!comparison.visible || !preview) {
      if (!comparison.visible) {
        comparison.version++; comparison.signature = '';
        comparison.urls.forEach(function (url) { URL.revokeObjectURL(url); }); comparison.urls = [];
        if (preview) preview.textContent = '';
      }
      return;
    }
    var tab = comparisonTab();
    var signature = JSON.stringify([tab.id, tab.source, tab.baseUrl, state.dirMode, I18n.getLocale()]);
    if (signature === comparison.signature) return;
    comparison.signature = signature;
    var version = ++comparison.version;
    comparison.urls.forEach(function (url) { URL.revokeObjectURL(url); }); comparison.urls = [];
    if (!comparison.md) comparison.md = Markdown.create({ marked: window.marked, purify: window.DOMPurify,
      icons: Icons.svg }, { strings: I18n.t });
    var renderer = comparison.md;
    renderer.reset();
    try {
      var tokens = renderer.lexer(tab.source);
      preview.innerHTML = tokens.map(function (token) { return renderer.renderBlock(token, tokens.links); }).join('');
    } catch (err) { preview.textContent = t('error.parse', { reason: err.message || String(err) }); }
    preview.setAttribute('dir', state.dirMode === 'auto' ? Direction.dominantDir(tab.source) : state.dirMode);
    var prefix = 'comparison-' + tab.id + '-';
    var originalIds = Object.create(null);
    eachNode('[id]', function (node) { originalIds[node.id] = true; node.id = prefix + node.id; }, preview);
    eachNode('input[type=checkbox]', function (box) { box.disabled = true; box.removeAttribute('data-rv-task'); }, preview);
    eachNode('a[href]', function (link) {
      var href = link.getAttribute('href') || '';
      link.setAttribute('data-comparison-href', href);
      if (href.charAt(0) === '#') {
        var fragment = href.slice(1);
        try { fragment = decodeURIComponent(fragment); } catch (err) { void 0; }
        if (!originalIds[fragment]) {
          if (originalIds['user-content-' + fragment]) fragment = 'user-content-' + fragment;
          else if (originalIds['user-content-' + fragment.toLowerCase()]) fragment = 'user-content-' + fragment.toLowerCase();
        }
        link.setAttribute('href', '#' + prefix + fragment); return;
      }
      link.setAttribute('data-comparison-href', href);
      if (!nativeAvailable() && !tab.folder) link.setAttribute('href', resolveUrl(href, tab.baseUrl));
      link.setAttribute('target', '_blank'); link.setAttribute('rel', 'noopener noreferrer nofollow');
    }, preview);
    eachNode('img[src]', function (img) {
      var src = img.getAttribute('src') || '';
      if (nativeAvailable()) {
        var asset = /^https?:/i.test(src) ? src : RV.Native.assetUrl(src, tab.handle);
        if (asset) img.setAttribute('src', asset); else img.removeAttribute('src');
      } else if (tab.folder) {
        var path = comparisonFolderPath(tab.folder, src);
        if (path === null) { if (!/^(https?:|data:)/i.test(src)) img.removeAttribute('src'); return; }
        img.removeAttribute('src');
        new Promise(function (resolve, reject) { tab.folder.root.getFile(path, {}, resolve, reject); })
          .then(openEntry).then(function (file) {
            if (version !== comparison.version || comparison.id !== tab.id || !comparison.visible) return;
            var url = URL.createObjectURL(file); comparison.urls.push(url); img.setAttribute('src', url);
          }).catch(function () { void 0; });
      } else img.setAttribute('src', resolveUrl(src, tab.baseUrl));
    }, preview);
    hl.all(preview);
  }
  function wireComparison() {
    var toggle = $('btnCompare'), select = $('comparisonSelect'), activate = $('btnActivateComparison');
    var close = $('btnCloseComparison'), preview = $('comparisonPreview'), divider = $('compareDivider');
    if (toggle) toggle.addEventListener('click', function () { if (comparison.visible) hideComparison(); else showComparison(); });
    if (select) select.addEventListener('change', function () { showComparison(Number(select.value)); });
    if (activate) activate.addEventListener('click', function () { if (comparison.id) switchTab(comparison.id); });
    if (close) close.addEventListener('click', hideComparison);
    if (preview) preview.addEventListener('click', function (event) {
      var link = event.target.closest && event.target.closest('a[href]');
      if (!link) return;
      var href = link.getAttribute('href') || '';
      link.setAttribute('data-comparison-href', href);
      if (href.charAt(0) === '#') {
        event.preventDefault();
        var target = document.getElementById(href.slice(1));
        if (target && preview.contains(target) && target.scrollIntoView) target.scrollIntoView({ block: 'start' });
        return;
      }
      var raw = link.getAttribute('data-comparison-href') || href;
      var tab = comparisonTab();
      if (nativeAvailable()) {
        event.preventDefault();
        if (/^(https?:|mailto:)/i.test(raw)) { Promise.resolve(RV.Native.openExternal(raw)).catch(reportOpen); return; }
        if (!tab || !switchTab(tab.id)) return;
        var path = RV.Native.resolveLocalUrl(raw, state.handle, true);
        var hash = raw.indexOf('#') >= 0 ? raw.slice(raw.indexOf('#') + 1) : '';
        if (path) openNativePath(path, true).then(function (ok) { if (ok && hash) jumpToFragment(hash); });
      } else if (tab && tab.folder && !/^[a-z][a-z\d+.-]*:|^\/\//i.test(raw)) {
        event.preventDefault(); if (switchTab(tab.id)) openFolderLink(raw);
      }
    });
    if (!divider) return;
    var dragging = false;
    function resize(value) {
      comparison.split = clamp(value, 30, 70);
      divider.setAttribute('aria-valuenow', String(Math.round(comparison.split)));
      refreshComparison();
    }
    divider.addEventListener('pointerdown', function (event) {
      dragging = true; event.preventDefault();
      if (divider.setPointerCapture) { try { divider.setPointerCapture(event.pointerId); } catch (err) { void 0; } }
    });
    divider.addEventListener('pointermove', function (event) {
      if (!dragging) return;
      var rect = $('workspaceViews').getBoundingClientRect();
      if (window.innerWidth <= 900) { if (rect.height) resize((event.clientY - rect.top) / rect.height * 100); }
      else if (rect.width) resize((event.clientX - rect.left) / rect.width * 100);
    });
    ['pointerup', 'pointercancel'].forEach(function (type) {
      divider.addEventListener(type, function () { dragging = false; measureParts(); });
    });
    divider.addEventListener('keydown', function (event) {
      var stacked = window.innerWidth <= 900;
      var delta = event.key === (stacked ? 'ArrowUp' : 'ArrowLeft') ? -3 : event.key === (stacked ? 'ArrowDown' : 'ArrowRight') ? 3 : 0;
      if (!delta) return; event.preventDefault(); resize(comparison.split + delta); measureParts();
    });
  }

  var linkMenu = { node: null, link: null, origin: null, href: '', press: null, suppress: 0 };
  function hideLinkMenu(restoreFocus) {
    if (!linkMenu.node) return;
    linkMenu.node.hidden = true;
    if (restoreFocus && linkMenu.link && linkMenu.link.isConnected) linkMenu.link.focus();
  }
  function browserLink(href, origin) {
    var value = resolveUrl(href, origin.baseUrl);
    if (!nativeAvailable()) {
      try { value = new URL(href, origin.baseUrl || document.baseURI).href; } catch (err) { return ''; }
      if (/^file:/i.test(value) && /^file:/i.test(document.baseURI)) return value;
    }
    return /^(https?:|mailto:)/i.test(value) ? value : '';
  }
  function fileBrowserUrl(path) {
    var normalized = path.split(String.fromCharCode(92)).join('/');
    if (normalized.charAt(0) !== '/') normalized = '/' + normalized;
    return 'file://' + normalized.split('/').map(function (part, index) {
      return index === 1 && /^[a-z]:$/i.test(part) ? part : encodeURIComponent(part);
    }).join('/');
  }
  function openNativeBrowserPreview(path) {
    if (typeof RV.Native.previewInBrowser !== 'function' ||
        (RV.Native.canPreviewInBrowser && !RV.Native.canPreviewInBrowser())) return Promise.resolve(false);
    var open = RV.Native.openLink || RV.Native.openPath;
    return Promise.resolve(open(path)).then(function (handle) {
      if (!handle) return false;
      return handle.getFile().then(function (file) {
        return file.arrayBuffer().then(function (buffer) {
          var decoded = Encoding.decode(new Uint8Array(buffer));
          if (decoded.binary) { toast(t('error.binary', { name: file.name || '' }), 'error'); return false; }
          var renderer = Markdown.create({ marked: window.marked, purify: window.DOMPurify, icons: Icons.svg }, { strings: I18n.t });
          renderer.reset(); var tokens = renderer.lexer(decoded.text);
          var preview = document.createElement('div');
          preview.innerHTML = tokens.map(function (token) { return renderer.renderBlock(token, tokens.links); }).join('');
          eachNode('a[href],img[src]', function (node) {
            var image = node.tagName === 'IMG', attr = image ? 'src' : 'href';
            var href = node.getAttribute(attr) || '';
            if (/^(https?:|mailto:|#)/i.test(href) || (image && /^data:image\//i.test(href))) return;
            var resolved = RV.Native.resolveLocalUrl(href, handle, !image);
            if (resolved) node.setAttribute(attr, fileBrowserUrl(resolved)); else node.removeAttribute(attr);
          }, preview);
          eachNode('input[type=checkbox]', function (box) { box.disabled = true; box.removeAttribute('data-rv-task'); }, preview);
          return Promise.resolve(RV.Native.previewInBrowser(Exporter.build({ title: file.name || handle.name || 'README', html: preview.innerHTML,
            theme: state.theme === 'auto' ? (isDark() ? 'dark' : 'light') : state.theme,
            lang: Direction.detectLanguage(decoded.text), dir: Direction.dominantDir(decoded.text) }))).then(function () { return true; });
        });
      });
    });
  }
  function openLinkAction(action, origin, href) {
    if (!origin || tabs.indexOf(origin) < 0) return Promise.resolve(false);
    if (action === 'browser' || /^(https?:|mailto:)/i.test(href)) {
      var url = browserLink(href, origin);
      if (!url) {
        if (nativeAvailable() && action === 'browser') {
          var localPath = RV.Native.resolveLocalUrl(href, origin.handle, true);
          return localPath ? openNativeBrowserPreview(localPath) : Promise.resolve(false);
        }
        return Promise.resolve(false);
      }
      if (nativeAvailable()) return Promise.resolve(RV.Native.openExternal(url)).then(function () { return true; });
      var opened = window.open(url, '_blank', 'noopener,noreferrer');
      if (opened) opened.opener = null;
      return Promise.resolve(true);
    }
    if (href.charAt(0) === '#') {
      if (!switchTab(origin.id)) return Promise.resolve(false);
      return Promise.resolve(jumpToFragment(href.slice(1)));
    }
    if (nativeAvailable()) {
      var path = RV.Native.resolveLocalUrl(href, origin.handle, true);
      if (!path) return Promise.resolve(false);
      if (action === 'new') return Promise.resolve(RV.Native.openLink ? RV.Native.openLink(path) : RV.Native.openPath(path)).then(openHandleTab).then(function (ok) {
        if (ok && href.indexOf('#') >= 0) jumpToFragment(href.slice(href.indexOf('#') + 1));
        return ok;
      });
      if (!switchTab(origin.id)) return Promise.resolve(false);
      return openNativePath(path, true).then(function (ok) {
        if (ok && activeTab === origin && href.indexOf('#') >= 0) jumpToFragment(href.slice(href.indexOf('#') + 1));
        return ok;
      });
    }
    if (origin.folder) {
      var pathInFolder = comparisonFolderPath(origin.folder, href);
      if (pathInFolder === null) return Promise.resolve(false);
      if (action === 'same') {
        if (!switchTab(origin.id)) return Promise.resolve(false);
        return Promise.resolve(openFolderLink(href));
      }
      var root = origin.folder.root;
      var target = new Promise(function (resolve, reject) {
        var isFile = /\.(md|markdown|mdown|mkd|mdwn|txt)$/i.test(pathInFolder);
        (isFile ? root.getFile : root.getDirectory).call(root, pathInFolder, {}, resolve, reject);
      }).then(function (entry) { return entry.isDirectory ? findReadme(entry, 3) : entry; });
      return target.then(function (entry) { return entry ? openFolderEntry(root, entry, true) : false; }).then(function (ok) {
        if (ok && href.indexOf('#') >= 0) jumpToFragment(href.slice(href.indexOf('#') + 1));
        return ok;
      });
    }
    var external = browserLink(href, origin);
    if (!external) return Promise.resolve(false);
    var opened = window.open(external, '_blank', 'noopener,noreferrer');
    if (opened) opened.opener = null;
    return Promise.resolve(true);
  }
  function showLinkMenu(link, x, y, secondary) {
    captureTab();
    var origin = secondary ? comparisonTab() : activeTab;
    if (!origin) return false;
    var href = link.getAttribute('data-native-href') || link.getAttribute('data-comparison-href') || link.getAttribute('href') || '';
    if (secondary && href.indexOf('#comparison-' + origin.id + '-') === 0) href = '#' + href.slice(('#comparison-' + origin.id + '-').length);
    if (!href || /^(javascript:|data:|vbscript:)/i.test(href)) return false;
    if (!linkMenu.node) {
      var menu = document.createElement('div'); menu.id = 'linkContextMenu'; menu.className = 'link-context-menu';
      menu.setAttribute('role', 'menu'); menu.style.position = 'fixed'; menu.hidden = true;
      document.body.appendChild(menu); linkMenu.node = menu;
      menu.addEventListener('keydown', function (event) {
        var buttons = Array.prototype.slice.call(menu.querySelectorAll('button:not(:disabled)'));
        var index = buttons.indexOf(document.activeElement), target;
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); hideLinkMenu(true); return; }
        if (event.key === 'Tab') { hideLinkMenu(false); return; }
        if (event.key === 'ArrowDown') target = buttons[(index + 1) % buttons.length];
        else if (event.key === 'ArrowUp') target = buttons[(index - 1 + buttons.length) % buttons.length];
        else if (event.key === 'Home') target = buttons[0];
        else if (event.key === 'End') target = buttons[buttons.length - 1];
        if (target) { event.preventDefault(); target.focus(); }
      });
    }
    var menu = linkMenu.node;
    linkMenu.link = link; linkMenu.origin = origin; linkMenu.href = href;
    menu.setAttribute('aria-label', tabText('linkMenu.label', 'Open link'));
    menu.textContent = '';
    [['same', 'Open in this tab'], ['new', 'Open in new tab'], ['browser', 'Open in browser']].forEach(function (item) {
      var button = document.createElement('button'); button.type = 'button'; button.setAttribute('role', 'menuitem');
      button.setAttribute('data-link-action', item[0]); button.textContent = tabText('linkMenu.' + item[0], item[1]);
      button.disabled = item[0] === 'browser' && !browserLink(href, origin) &&
        !(nativeAvailable() && typeof RV.Native.previewInBrowser === 'function' &&
          (!RV.Native.canPreviewInBrowser || RV.Native.canPreviewInBrowser()));
      if (button.disabled) button.title = tabText('linkMenu.browserUnavailable', 'This local link has no browser URL');
      button.addEventListener('click', function () {
        hideLinkMenu(false);
        Promise.resolve(openLinkAction(item[0], origin, href)).catch(reportOpen);
      });
      menu.appendChild(button);
    });
    menu.hidden = false;
    var rect = menu.getBoundingClientRect();
    menu.style.left = clamp(x, 8, Math.max(8, window.innerWidth - rect.width - 8)) + 'px';
    menu.style.top = clamp(y, 8, Math.max(8, window.innerHeight - rect.height - 8)) + 'px';
    menu.querySelector('button:not(:disabled)').focus(); return true;
  }
  function wireLinkMenus() {
    function cancelPress() {
      if (linkMenu.press) clearTimeout(linkMenu.press.timer);
      linkMenu.press = null;
    }
    [el.preview, $('comparisonPreview')].filter(Boolean).forEach(function (preview) {
      var secondary = preview !== el.preview;
      preview.addEventListener('contextmenu', function (event) {
        var link = event.target.closest && event.target.closest('a[href]');
        if (!link) return;
        var rect = link.getBoundingClientRect();
        if (showLinkMenu(link, event.clientX || rect.left, event.clientY || rect.bottom, secondary)) event.preventDefault();
      });
      preview.addEventListener('keydown', function (event) {
        if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
        var link = event.target.closest && event.target.closest('a[href]');
        if (!link) return;
        var rect = link.getBoundingClientRect();
        if (showLinkMenu(link, rect.left, rect.bottom, secondary)) event.preventDefault();
      });
      preview.addEventListener('pointerdown', function (event) {
        cancelPress(); if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
        var link = event.target.closest && event.target.closest('a[href]');
        if (!link) return;
        var press = { x: event.clientX, y: event.clientY };
        press.timer = setTimeout(function () {
          linkMenu.press = null;
          if (link.isConnected && showLinkMenu(link, press.x, press.y, secondary)) linkMenu.suppress = Date.now() + 1000;
        }, 550);
        linkMenu.press = press;
      });
      preview.addEventListener('pointermove', function (event) {
        var press = linkMenu.press;
        if (press && (Math.abs(event.clientX - press.x) > 10 || Math.abs(event.clientY - press.y) > 10)) cancelPress();
      });
      ['pointerup', 'pointercancel'].forEach(function (type) { preview.addEventListener(type, cancelPress); });
      preview.addEventListener('click', function (event) {
        if (Date.now() < linkMenu.suppress) { event.preventDefault(); event.stopImmediatePropagation(); linkMenu.suppress = 0; }
      }, true);
    });
    document.addEventListener('pointerdown', function (event) {
      if (linkMenu.node && !linkMenu.node.hidden && !linkMenu.node.contains(event.target)) hideLinkMenu(false);
    });
    window.addEventListener('scroll', cancelPress, true);
    window.addEventListener('resize', function () { cancelPress(); hideLinkMenu(false); });
  }

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
    manualBaseUrl = state.baseUrl;
    state.editPreview = !!s.editPreview;
    state.sidebar = s.sidebar !== false;
    state.split = clamp(parseFloat(s.split) || 50, 15, 85);
    state.locale = I18n.setLocale(s.locale) ? s.locale : 'en';
  }

  function saveSettings() {
    try {
      localStorage.setItem(STORE, JSON.stringify({
        font: state.font, wrap: state.wrap, sync: state.sync, dirMode: state.dirMode,
        mode: state.mode, theme: state.theme, baseUrl: manualBaseUrl,
        editPreview: state.editPreview, sidebar: state.sidebar, split: state.split,
        locale: I18n.getLocale()
      }));
      return true;
    } catch (e) { return false; }
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
    renderTabs();
    refreshComparison();
    var name = state.hasDocument ? state.name : t('app.name');
    el.fileName.textContent = name;
    el.fileName.title = state.hasDocument ? (activeTab && tabLocation(activeTab) || state.name) : '';

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
    el.btnToc.setAttribute('aria-pressed', (window.innerWidth <= 900 ? mobileSidebar : state.sidebar) ? 'true' : 'false');

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
    if (RV.Reading) RV.Reading.workspaceChanged();
    if (RV.Shell) RV.Shell.refresh();
  }

  function setDirty(on) {
    state.dirty = !!on;
    updateChrome();
  }

  /* ------------------------------------------------------------- document I/O */

  // Retain each editing host across switches for selection and composition identity.
  function mountEditor(editor, value) {
    var previous = el.editor;
    if (!editor) {
      editor = previous.cloneNode(false);
      editor.value = value || '';
    }
    if (previous !== editor) {
      previous.removeAttribute('id'); previous.hidden = true; previous.style.display = 'none';
      if (!editor.parentNode) previous.parentNode.appendChild(editor);
    }
    editor.id = 'editor'; editor.hidden = false; editor.style.removeProperty('display');
    editor.setAttribute('data-wrap', state.wrap ? '1' : '0');
    el.editor = editor;
    if (!editor._rvWired) wireEditor();
    if (activeTab) activeTab.editor = editor;
    if (previous !== editor && !tabs.some(function (tab) { return tab.editor === previous; }) && previous.parentNode) previous.parentNode.removeChild(previous);
  }

  function setDoc(text, name, handle, meta) {
    state.documentId++;
    if (activeTab) activeTab.tocCollapsed = [];
    var oldEditor = el.editor;
    mountEditor(null, text);
    resetUndo();
    if (!tabs.some(function (tab) { return tab.editor === oldEditor; }) && oldEditor.parentNode) oldEditor.parentNode.removeChild(oldEditor);
    state.name = name || '';
    state.saved = text;
    state.needsSave = false;
    state.handle = handle || null;
    state.folder = null;
    if (state.autoBase) { state.baseUrl = ''; el.baseUrl.value = ''; state.autoBase = false; }
    applyHandleBase(handle);
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
    if (activeTab) activeTab.tocCollapsed = [];
    var oldEditor = el.editor;
    mountEditor(null, '');
    resetUndo();
    if (!tabs.some(function (tab) { return tab.editor === oldEditor; }) && oldEditor.parentNode) oldEditor.parentNode.removeChild(oldEditor);
    state.name = '';
    state.saved = '';
    state.needsSave = false;
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

  var restoringEdit = false;
  function editorSnapshot(editor) {
    editor = editor || el.editor;
    return { source: editor.value, start: editor.selectionStart, end: editor.selectionEnd,
      direction: editor.selectionDirection, top: editor.scrollTop };
  }
  function resetUndo() {
    if (!activeTab) return;
    activeTab.undo = []; activeTab.redo = []; activeTab.lastEdit = editorSnapshot();
    activeTab.editType = null;
  }
  function trimUndo(pile, tab) {
    tab = tab || activeTab;
    var other = pile === tab.undo ? tab.redo : tab.undo;
    var all = pile.concat(other);
    var size = all.reduce(function (sum, item) { return sum + item.source.length * 2; }, 0);
    while (pile.length + other.length > 100 || size > 4 * 1024 * 1024) {
      var oldest = other.length ? other.shift() : pile.shift();
      size -= oldest.source.length * 2;
    }
  }
  function recordEdit(inputType) {
    if (!activeTab || restoringEdit) return;
    var previous = activeTab.lastEdit;
    if (previous && previous.source !== el.editor.value) {
      var timestamp = Date.now();
      var coalesce = inputType === 'insertText' && activeTab.editType === inputType &&
        timestamp - activeTab.editTime < 500 && previous.start === previous.end && previous.start === activeTab.editCaret;
      if (!coalesce) activeTab.undo.push(previous);
      activeTab.redo = [];
      trimUndo(activeTab.undo);
      activeTab.editType = inputType; activeTab.editTime = timestamp; activeTab.editCaret = el.editor.selectionEnd;
    }
    activeTab.lastEdit = editorSnapshot();
  }
  function undoEdit(redo) {
    if (!activeTab) return false;
    var from = redo ? activeTab.redo : activeTab.undo;
    if (!from || !from.length) return false;
    var to = redo ? activeTab.undo : activeTab.redo;
    var snapshot = from.pop();
    to.push(editorSnapshot());
    trimUndo(to);
    activeTab.editType = null;
    el.editor.value = snapshot.source;
    el.editor.setSelectionRange(snapshot.start, snapshot.end, snapshot.direction);
    el.editor.scrollTop = snapshot.top;
    activeTab.lastEdit = snapshot;
    restoringEdit = true;
    try { markDirtyFromValue(); } finally { restoringEdit = false; }
    render({ immediate: true }); return true;
  }

  function markDirtyFromValue(inputType) {
    recordEdit(inputType);
    if (!state.hasDocument) {
      state.hasDocument = el.editor.value.length > 0;
      if (state.hasDocument) {
        state.name = 'README.md';
        state.saved = '';
        el.emptyState.hidden = true;
        el.previewScroll.removeAttribute('data-empty');
      }
    }
    setDirty(state.needsSave || (state.hasDocument ? el.editor.value !== state.saved : el.editor.value.length > 0));
  }

  function readHandle(handle, quiet) {
    var documentId = state.documentId;
    var source = el.editor.value;
    return handle.getFile().then(function (file) {
      if (state.documentId !== documentId || el.editor.value !== source) return false;
      return loadFile(file, handle, quiet);
    });
  }

  function loadFile(file, handle, quiet) {
    if (!file) return Promise.resolve(false);
    var documentId = state.documentId;
    var source = el.editor.value;
    return file.arrayBuffer().then(function (buf) {
      if (state.documentId !== documentId || el.editor.value !== source) return false;
      var decoded = Encoding.decode(new Uint8Array(buf));
      if (decoded.binary) {
        toast(t('error.binary', { name: file.name || '' }), 'error');
        return false;
      }
      setDoc(decoded.text, file.name || 'README.md', handle || null, decoded);
      trackModified();
      if (quiet) return true;
      pushHistory();
      rememberRecent();
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
    if (nativeAvailable()) return RV.Native.pickOpen().then(openHandleTab).catch(reportOpen);
    if (typeof window.showOpenFilePicker === 'function') {
      return window.showOpenFilePicker({ multiple: false, types: [{ description: 'Markdown',
        accept: { 'text/markdown': ['.md', '.markdown', '.txt'] } }] })
        .then(function (handles) { return openHandleTab(handles && handles[0]); }).catch(reportOpen);
    }
    el.fileInput.click();
  }

  function openNativePath(path, fromLink, inNewTab) {
    if (inNewTab) return RV.Native.openPath(path).then(openHandleTab).catch(function (err) { reportOpen(err, path); return false; });
    return confirmDiscard().then(function (proceed) {
      if (!proceed) return false;
      var documentId = state.documentId;
      var source = el.editor.value;
      var opener = fromLink && RV.Native.openLink ? RV.Native.openLink : RV.Native.openPath;
      return opener(path).then(function (h) {
        if (!h || state.documentId !== documentId || el.editor.value !== source) return false;
        return readHandle(h);
      });
    }).catch(function (err) { reportOpen(err, path); return false; });
  }

  function reloadFromDisk() {
    if (!state.handle) { toast(t('error.reload'), 'warning'); return; }
    var handle = state.handle;
    confirmDiscard().then(function (proceed) {
      if (!proceed || state.handle !== handle) return;
      readHandle(handle).then(function (ok) {
        if (ok) toast(t('info.reloaded', { name: state.name }), 'success');
      }).catch(function (err) {
        toast(t('error.read', { name: state.name }) + ': ' + ((err && err.message) || err), 'error');
      });
    });
  }

  /* -------------------------------------------------------------------- save */

  function download(text, name, mime) {
    if (nativeAvailable()) return RV.Native.download(text, name, mime);
    if (RV.Android && RV.Android.available()) return RV.Android.download(text, name, mime);
    var blob = new Blob([text], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    return Promise.resolve(true);
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
      state.needsSave = false;
      state.handle = handle || null;
      state.name = handle ? handle.name : name;
      applyHandleBase(handle);
      if (handle && handle.baseUrl) render({ immediate: true });
      state.encoding = 'utf-8';
      trackModified();
      setDirty(el.editor.value !== text);
      saveSettings();
      toast(t('info.saved', { name: state.name }), 'success');
      return true;
    };

    function fallback() {
      return download(payload, name || 'README.md', 'text/markdown;charset=utf-8')
        .then(function () { return finish(null); })
        .catch(function (error) {
          toast(t('error.save', { name: name, reason: error.message }), 'error');
          return false;
        });
    }

    var writeTo = function (h) {
      return h.createWritable().then(function (w) {
        return w.write(new Blob([payload], { type: 'text/markdown;charset=utf-8' }))
          .then(function () { return w.close(); });
      }).then(function () { return finish(h); }).catch(function (err) {
        // Permission lost (e.g. the file moved): fall back to a download instead of failing.
        if (!nativeAvailable() && err && (err.name === 'NotAllowedError' || err.name === 'NotFoundError')) {
          return fallback();
        }
        toast(t('error.save', {
          name: state.name,
          reason: (err && err.message) || String(err)
        }), 'error');
        return false;
      });
    };

    if (!forceNew && state.handle && !(nativeAvailable() && state.handle.writable === false)) {
      return writeTo(state.handle);
    }

    if (nativeAvailable()) {
      return RV.Native.pickSave(name || 'README.md').then(function (h) {
        return h ? writeTo(h) : false;
      }).catch(function (err) {
        if (err && err.name === 'AbortError') return false;
        toast(t('error.save', { name: name, reason: (err && err.message) || String(err) }), 'error');
        return false;
      });
    }

    if (typeof window.showSaveFilePicker === 'function') {
      return window.showSaveFilePicker({
        suggestedName: state.name || 'README.md',
        types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md', '.markdown', '.txt'] } }]
      }).then(function (h) {
        if (!h) return false;
        return writeTo(h);
      }).catch(function (err) {
        if (err && err.name === 'AbortError') return false;
        return fallback();
      });
    }

    return fallback();
  }

  function exportHtml() {
    if (!state.hasDocument) return;
    render({ immediate: true });
    var src = el.editor.value;
    var snapshot = el.preview.cloneNode(true);
    eachNode('.section-tools', function (node) { node.parentNode.removeChild(node); }, snapshot);
    eachNode('.section-folded', function (node) { node.classList.remove('section-folded'); }, snapshot);
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
    download(doc, name, 'text/html;charset=utf-8').then(function () {
      toast(t('info.exported', { name: name }), 'success');
    }).catch(function (error) {
      if (error && error.name === 'AbortError') return;
      toast(t('error.save', { name: name, reason: error.message }), 'error');
    });
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
  var pendingDiscard = null;
  function confirmDiscard() {
    if (pendingDiscard) return pendingDiscard;
    if (!state.dirty) return Promise.resolve(true);
    pendingDiscard = askConfirm({
      title: t('unsaved.title'),
      body: t('unsaved.body', { name: state.name || 'README.md' }) + ' ' + t('unsaved.question'),
      icon: 'alert'
    }).then(function (choice) {
      if (choice === 'discard') return true;
      if (choice === 'save') return save(false).then(function (ok) { return ok && !state.dirty; });
      return false;
    }).finally(function () { pendingDiscard = null; });
    return pendingDiscard;
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
      // In-app folder navigation cancels this fallback when the file is accessible.
      if (!nativeAvailable()) {
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer nofollow');
      }
      if (nativeAvailable() || (state.folder && !/^[a-z][a-z\d+.-]*:|^\/\//i.test(href))) {
        a.setAttribute('data-native-href', href);
        if (/^https?:|^mailto:/i.test(href)) {
          a.setAttribute('rel', 'noopener noreferrer nofollow');
          a.setAttribute('data-external', '1');
        }
        continue;
      }
      var resolved = resolveUrl(href, base);
      if (resolved) a.setAttribute('href', resolved);
      if (/^https?:/i.test(resolved)) {
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer nofollow');
        a.setAttribute('data-external', '1');
      }
    }
    if (state.folder && !nativeAvailable()) { loadFolderImages(); return; }
    if (!base && !nativeAvailable()) return;
    var imgs = el.preview.querySelectorAll('img[src]');
    for (var j = 0; j < imgs.length; j++) {
      var src = imgs[j].getAttribute('src') || '';
      var r = nativeAvailable()
        ? (/^https?:/i.test(src) ? src : RV.Native.assetUrl(src, state.handle))
        : resolveUrl(src, base);
      if (nativeAvailable() && !r) imgs[j].removeAttribute('src');
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
      if (RV.Reading) RV.Reading.refresh();
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
    if (!el.findBar.hidden && el.findInput.value) runFind(true);

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
    if (RV.Reading) RV.Reading.refresh();
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

  var tocNodes = [];
  function renderToc() {
    var root = document.createElement('ul'), stack = [];
    tocNodes = [];
    if (activeTab && !activeTab.tocCollapsed) activeTab.tocCollapsed = [];
    state.toc.forEach(function (item, index) {
      while (stack.length && stack[stack.length - 1].item.depth >= item.depth) stack.pop();
      var parent = stack.length ? stack[stack.length - 1] : null;
      var li = document.createElement('li'), row = document.createElement('div');
      var link = document.createElement('a'), children = document.createElement('ul');
      row.className = 'toc-row';
      link.href = '#' + item.id; link.setAttribute('data-i', index);
      link.textContent = item.text; link.title = item.text + ' · ' + t('toc.jump', { line: item.line });
      link.className = 'h' + item.depth;
      children.id = 'toc-children-' + index;
      row.appendChild(link); li.appendChild(row); li.appendChild(children);
      (parent ? parent.children : root).appendChild(li);
      var node = { item: item, index: index, li: li, row: row, link: link, children: children, parent: parent, branches: [] };
      if (parent) parent.branches.push(node);
      tocNodes.push(node); stack.push(node);
    });
    tocNodes.forEach(function (node) {
      var control = document.createElement(node.branches.length ? 'button' : 'span');
      control.className = 'toc-toggle';
      if (node.branches.length) {
        control.type = 'button'; control.innerHTML = Icons.svg('chevronDown', 14);
        control.setAttribute('data-toc-toggle', node.index);
        control.setAttribute('aria-controls', node.children.id);
      } else control.setAttribute('aria-hidden', 'true');
      node.control = control; node.row.insertBefore(control, node.link);
    });
    el.toc.textContent = ''; el.toc.appendChild(root);
    applyTocFilter(); markActiveToc();
  }

  function applyTocFilter() {
    var q = (state.tocFilter || '').trim().toLowerCase();
    var collapsed = activeTab && activeTab.tocCollapsed || [], shown = 0;
    tocNodes.slice().reverse().forEach(function (node) {
      node.match = !q || node.item.text.toLowerCase().indexOf(q) >= 0 || node.branches.some(function (child) { return child.match; });
    });
    tocNodes.forEach(function (node) {
      var folded = !q && collapsed.indexOf(node.item.id) >= 0;
      var parentHidden = node.parent && (node.parent.link.hidden || node.parent.children.hidden);
      node.li.hidden = !node.match; node.link.hidden = !node.match || !!parentHidden;
      node.children.hidden = folded || !node.branches.some(function (child) { return child.match; });
      if (!node.link.hidden) shown++;
      if (node.branches.length) {
        node.control.disabled = !!q;
        node.control.setAttribute('aria-expanded', node.children.hidden ? 'false' : 'true');
        node.control.setAttribute('aria-label', t(node.children.hidden ? 'reading.expand' : 'reading.collapse') + ': ' + node.item.text);
      }
    });
    el.tocClear.hidden = !q;
    el.tocEmpty.textContent = t(tocNodes.length ? 'toc.empty' : 'toc.none');
    el.tocEmpty.hidden = shown !== 0;
    ['tocExpandAll', 'tocCollapseAll'].forEach(function (id) {
      var button = $(id); if (button) button.disabled = !!q || !tocNodes.some(function (node) { return node.branches.length; });
    });
  }

  function markActiveToc() {
    if (el.sidebar.hidden || !state.toc.length) return;
    var top = el.previewScroll.scrollTop + 24, active = -1;
    for (var i = 0; i < state.toc.length; i++) {
      if (state.toc[i].part.top <= top) active = i;
      else break;
    }
    tocNodes.forEach(function (node) {
      node.link.classList.toggle('active', node.index === active);
      node.row.classList.remove('has-active');
      if (node.index === active) node.link.setAttribute('aria-current', 'location');
      else node.link.removeAttribute('aria-current');
    });
    var current = tocNodes[active];
    while (current && current.link.hidden) current = current.parent;
    if (current) current.row.classList.add('has-active');
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
      if (RV.Reading) RV.Reading.reveal(node);
      if (node && typeof node.scrollIntoView === 'function') {
        node.scrollIntoView({ block: 'start' });
        return;
      }
    }
    var a = anchorForLine(line);
    if (a) el.previewScroll.scrollTop = Math.max(0, a.top - 12);
  }

  function byId(id) {
    if (!id) return null;
    if (window.CSS && typeof CSS.escape === 'function') {
      return el.preview.querySelector('#' + CSS.escape(id));
    }
    var all = el.preview.querySelectorAll('[id]');
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return null;
  }

  /** Follow an in-document link; GitHub prefixes heading ids with "user-content-". */
  function jumpToFragment(fragment) {
    var id = fragment;
    try { id = decodeURIComponent(fragment); } catch (e) { void 0; }
    var node = byId(id) || byId('user-content-' + id) || byId('user-content-' + id.toLowerCase());
    if (!node) return false;
    if (RV.Reading) RV.Reading.reveal(node);
    for (var i = 0; i < state.toc.length; i++) {
      if (state.toc[i].id === node.id) { jumpToLine(state.toc[i].line, node.id); return true; }
    }
    if (typeof node.scrollIntoView === 'function') node.scrollIntoView({ block: 'start' });
    return true;
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
    el.hljsLight.disabled = dark;
    el.hljsDark.disabled = !dark;
    if (RV.Appearance) RV.Appearance.apply();
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
    setTheme(state.theme === 'auto' ? 'light' : (state.theme === 'light' ? 'dark' : 'auto'));
  }

  function setTheme(theme, preview) {
    if (['auto', 'light', 'dark'].indexOf(theme) < 0) return;
    state.theme = theme;
    applyTheme();
    updateChrome();
    if (preview) return;
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
    document.body.setAttribute('data-mode', state.mode);
    el.panes.setAttribute('data-mode', state.mode);
    // Anchors measured while a pane was hidden are meaningless: re-measure.
    scheduleRender(null, 0);
  }

  function applySidebar() {
    var visible = window.innerWidth <= 900 ? mobileSidebar : state.sidebar;
    el.sidebar.hidden = !visible;
    el.layout.setAttribute('data-sidebar', visible ? 'on' : 'off');
    el.btnToc.setAttribute('aria-pressed', visible ? 'true' : 'false');
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
    el.btnBack.addEventListener('click', function () { goHistory(-1); });
    el.btnForward.addEventListener('click', function () { goHistory(1); });
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
      if (window.innerWidth <= 900) mobileSidebar = !mobileSidebar;
      else state.sidebar = !state.sidebar;
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
      manualBaseUrl = state.baseUrl;
      state.autoBase = false;
      saveSettings();
      scheduleRender();
    });

    el.fileInput.addEventListener('change', function () {
      var f = el.fileInput.files && el.fileInput.files[0];
      if (f) openFileTab(f, null);
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
      var key = (e.key || '').toLowerCase();
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (key === 'z' || key === 'y')) {
        e.preventDefault(); e.stopPropagation(); undoEdit(key === 'y' || e.shiftKey); return;
      }
      if (e.key === 'Tab') {
        var modal = !el.confirmModal.hidden ? el.confirmModal : (!el.helpModal.hidden ? el.helpModal : null);
        if (!modal) return;
        var items = Array.prototype.filter.call(
          modal.querySelectorAll('button, select, input, [tabindex]:not([tabindex="-1"])'),
          function (n) { return !n.disabled && !n.hidden; });
        if (!items.length) return;
        var first = items[0];
        var last = items[items.length - 1];
        var inside = modal.contains(document.activeElement);
        if (e.shiftKey && (document.activeElement === first || !inside)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && (document.activeElement === last || !inside)) { e.preventDefault(); first.focus(); }
        return;
      }
      if (e.key !== 'Escape') return;
      if (!el.confirmModal.hidden) { closeConfirm(null); e.stopPropagation(); return; }
      if (!el.helpModal.hidden) { showHelp(false); e.stopPropagation(); }
    });
  }

  function wireEditor() {
    if (el.editor._rvWired) return;
    el.editor._rvWired = true;
    var composing = false, editor = el.editor;
    el.editor.addEventListener('beforeinput', function (event) {
      if (editor !== el.editor) return;
      if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') {
        event.preventDefault(); undoEdit(event.inputType === 'historyRedo'); return;
      }
      if (activeTab && activeTab.lastEdit && activeTab.lastEdit.source === el.editor.value) activeTab.lastEdit = editorSnapshot();
    });
    el.editor.addEventListener('compositionstart', function () { composing = true; });
    el.editor.addEventListener('compositionend', function () { composing = false; });

    el.editor.addEventListener('input', function (e) {
      // An IME may finish after focus has already moved to another document.
      if (editor !== el.editor) {
        var owner = tabs.filter(function (tab) { return tab.editor === editor; })[0];
        if (owner) {
          if (owner.lastEdit && owner.lastEdit.source !== editor.value) owner.undo.push(owner.lastEdit);
          owner.redo = []; trimUndo(owner.undo, owner);
          owner.lastEdit = editorSnapshot(editor); owner.editType = null;
          owner.source = editor.value; owner.dirty = owner.needsSave || owner.source !== owner.saved;
          updateChrome();
        }
        return;
      }
      if (e.inputType === 'insertParagraph' || e.inputType === 'insertLineBreak') {
        autoIndentAfterNewline();
      }
      markDirtyFromValue(e.inputType);
      scheduleRender();
    });

    el.editor.addEventListener('scroll', onEditorScroll, { passive: true });

    el.editor.addEventListener('keydown', function (e) {
      if (composing || e.isComposing || e.keyCode === 229) return;
      var key = (e.key || '').toLowerCase();
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (key === 'z' || key === 'y')) {
        e.preventDefault(); e.stopPropagation(); undoEdit(key === 'y' || e.shiftKey); return;
      }
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

    var showLink = function (e) {
      var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      var href = a ? (a.getAttribute('data-native-href') || a.getAttribute('href') || '') : '';
      if (a && a.classList.contains('heading-anchor')) href = '';
      el.statusLink.textContent = href;
      el.statusLink.title = href;
    };
    el.preview.addEventListener('mouseover', showLink);
    el.preview.addEventListener('focusin', showLink);
    el.preview.addEventListener('mouseleave', function () { el.statusLink.textContent = ''; });

    el.preview.addEventListener('click', function (e) {
      var target = e.target;
      if (!target || typeof target.closest !== 'function') return;

      var box = target.closest('input[data-rv-task]');
      if (box) { e.preventDefault(); toggleTaskFromPreview(box); return; }

      var copy = target.closest('[data-copy-code]');
      if (copy) { e.preventDefault(); copyCode(copy); return; }

      var link = target.closest('a[href]');
      var rawHref = link ? (link.getAttribute('data-native-href') || link.getAttribute('href') || '') : '';
      if (link && rawHref.charAt(0) === '#' && !link.classList.contains('heading-anchor')) {
        e.preventDefault();
        jumpToFragment(rawHref.slice(1));
        return;
      }
      if (nativeAvailable() && link) {
        e.preventDefault();
        var href = rawHref;
        if (/^(https?:|mailto:)/i.test(href)) {
          Promise.resolve(RV.Native.openExternal(href)).catch(function (err) { reportOpen(err, href); });
        } else {
          var path = RV.Native.resolveLocalUrl(href, state.handle, true);
          var hash = href.indexOf('#') >= 0 ? href.slice(href.indexOf('#') + 1) : '';
          if (path) {
            openNativePath(path, true).then(function (ok) { if (ok && hash) jumpToFragment(hash); });
          }
        }
        return;
      }

      if (link && state.folder && !/^[a-z][a-z\d+.-]*:|^\/\//i.test(rawHref) && openFolderLink(rawHref)) {
        e.preventDefault();
        return;
      }

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
      var toggle = e.target.closest && e.target.closest('[data-toc-toggle]');
      if (toggle && activeTab) {
        var node = tocNodes[+toggle.getAttribute('data-toc-toggle')];
        var collapsed = activeTab.tocCollapsed, index = collapsed.indexOf(node.item.id);
        if (index < 0) collapsed.push(node.item.id); else collapsed.splice(index, 1);
        applyTocFilter(); markActiveToc(); return;
      }
      var a = e.target && e.target.closest ? e.target.closest('a[data-i]') : null;
      if (!a) return;
      e.preventDefault();
      var item = state.toc[+a.getAttribute('data-i')];
      if (item) {
        jumpToLine(item.line, item.id);
        if (window.innerWidth <= 900) {
          mobileSidebar = false; applySidebar();
          (state.mode === 'write' ? el.editor : el.previewScroll).focus({ preventScroll: true });
        }
      }
    });

    ['tocExpandAll', 'tocCollapseAll'].forEach(function (id) {
      $(id).addEventListener('click', function () {
        if (!activeTab) return;
        activeTab.tocCollapsed = id === 'tocExpandAll' ? [] : tocNodes.filter(function (node) { return node.branches.length; }).map(function (node) { return node.item.id; });
        applyTocFilter(); markActiveToc();
      });
    });
    el.tocFilter.addEventListener('input', function () {
      state.tocFilter = el.tocFilter.value;
      applyTocFilter();
      markActiveToc();
    });

    el.tocClear.addEventListener('click', function () {
      el.tocFilter.value = '';
      state.tocFilter = '';
      applyTocFilter(); markActiveToc();
      el.tocFilter.focus();
    });
  }

  function wireDragDrop() {
    if (nativeAvailable()) {
      ['dragenter', 'dragover', 'drop'].forEach(function (type) {
        window.addEventListener(type, function (e) { e.preventDefault(); });
      });
      return;
    }
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

    // A folder was dropped: open its README and resolve links and images inside that folder.
    if (!mdFile && directories.length) {
      var root = directories[0];
      findReadme(root, 0).then(function (entry) {
        if (!entry) { toast(t('error.notFound'), 'error'); return; }
        return openFolderEntry(root, entry, true);
      }).catch(function (err) {
        toast(t('error.open', { name: entryName(directories[0]), reason: (err && err.message) || err }), 'error');
      });
      return;
    }

    if (!mdFile) return;
    Promise.resolve().then(function () {
      var first = items.filter(function (item) {
        return item.kind === 'file' && item.getAsFile && item.getAsFile() === mdFile;
      })[0];
      if (first && first.getAsFileSystemHandle) {
        first.getAsFileSystemHandle().then(function (h) {
          openFileTab(mdFile, h && h.kind === 'file' ? h : null);
        }).catch(function () { openFileTab(mdFile, null); });
      } else {
        openFileTab(mdFile, null);
      }
    });
  }

  function entryName(entry) { return (entry && entry.name) || ''; }

  function isMarkdown(f) {
    return /\.(md|markdown|mdown|mkd|mdwn|txt)$/i.test(f.name || '');
  }

  /** readEntries returns results in batches (about 100 in Chromium): read until empty. */
  function readAll(entry) {
    var reader = entry.createReader();
    var all = [];
    return new Promise(function (resolve) {
      (function more() {
        reader.readEntries(function (list) {
          if (!list || !list.length) { resolve(all); return; }
          all = all.concat(Array.prototype.slice.call(list));
          more();
        }, function () { resolve(all); });
      })();
    });
  }

  var README_RE = /^readme\.(md|markdown|mdown|mdwn|mkd|txt)$/i;

  function findReadme(entry, depth) {
    if (depth > 3) return Promise.resolve(null);
    return readAll(entry).then(function (list) {
      list.sort(function (a, b) { return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0); });
      for (var i = 0; i < list.length; i++) {
        if (list[i].isFile && README_RE.test(list[i].name)) return list[i];
      }
      var dirs = list.filter(function (x) {
        return x.isDirectory && x.name.charAt(0) !== '.' && x.name !== 'node_modules';
      });
      var idx = 0;
      return (function next() {
        if (idx >= dirs.length) return null;
        return findReadme(dirs[idx++], depth + 1).then(function (found) { return found || next(); });
      })();
    });
  }

  function openEntry(entry) {
    return new Promise(function (resolve, reject) { entry.file(resolve, reject); });
  }

  /* ----------------------------------------------- dropped folder (browser) */

  var folderUrls = [];

  function relPath(root, entry) {
    return entry.fullPath.slice(root.fullPath.length).replace(/^\//, '');
  }

  /** Resolve href against the open document inside the dropped folder; null if it escapes. */
  function folderPath(href) {
    var f = state.folder;
    if (!f || /^[a-z][a-z\d+.-]*:|^\/\/|^#/i.test(href)) return null;
    var value;
    try { value = decodeURIComponent(href.split(/[?#]/)[0]); } catch (e) { return null; }
    var out = value.charAt(0) === '/' ? [] : f.path.split('/').slice(0, -1);
    var parts = value.split('/');
    for (var i = 0; i < parts.length; i++) {
      if (!parts[i] || parts[i] === '.') continue;
      if (parts[i] === '..') { if (!out.length) return null; out.pop(); } else out.push(parts[i]);
    }
    return out.join('/');
  }

  function folderGet(path, dir) {
    var root = state.folder.root;
    return new Promise(function (resolve, reject) {
      if (!path) { resolve(root); return; }
      (dir ? root.getDirectory : root.getFile).call(root, path, {}, resolve, reject);
    });
  }

  function openFolderEntry(root, entry, inNewTab) {
    var documentId = state.documentId;
    var source = el.editor.value;
    return openEntry(entry).then(function (file) {
      if (!inNewTab && (state.documentId !== documentId || el.editor.value !== source)) return false;
      return (inNewTab ? openFileTab(file, null) : loadFile(file, null)).then(function (ok) {
        if (ok) {
          state.folder = { root: root, path: relPath(root, entry) };
          state.autoBase = true;
          state.baseUrl = '';
          el.baseUrl.value = '';
          render({ immediate: true });
          pushHistory();
        }
        return ok;
      });
    });
  }

  /* ---------------------------------------------------- link navigation history */

  /* ------------------------------------------------------- find in document */

  /* ------------------------------------------------- recent files (native) */

  var RECENT = 'rv.recent';

  function readRecent() {
    try {
      var list = JSON.parse(localStorage.getItem(RECENT) || '[]');
      return Array.isArray(list) ? list.filter(function (p) { return typeof p === 'string'; }) : [];
    } catch (e) { return []; }
  }

  function rememberRecent() {
    if (!nativeAvailable() || !state.handle || !state.handle.path || /^content:/i.test(state.handle.path)) return;
    var path = state.handle.path;
    var list = readRecent().filter(function (p) { return p !== path; });
    list.unshift(path);
    try { localStorage.setItem(RECENT, JSON.stringify(list.slice(0, 8))); } catch (e) { void 0; }
    renderRecent();
  }

  function renderRecent() {
    var list = nativeAvailable() ? readRecent() : [];
    el.recentList.hidden = !list.length;
    if (!list.length) { el.recentList.textContent = ''; return; }
    var html = '<p class="recent-title">' + esc(t('recent.title')) + '</p>';
    for (var i = 0; i < list.length; i++) {
      var name = list[i].replace(/\\/g, '/').split('/').pop();
      html += '<button type="button" class="recent-item" data-path="' + esc(list[i]) + '" title="' +
        esc(list[i]) + '"><b>' + esc(name) + '</b><span dir="ltr">' + esc(list[i]) + '</span></button>';
    }
    el.recentList.innerHTML = html;
  }

  function wireRecent() {
    el.recentList.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-path]') : null;
      if (!b) return;
      var path = b.getAttribute('data-path');
      openNativePath(path, true);
    });
  }

  /* --------------------------------------- reload when the file changes on disk */

  var watch = { handle: null, mtime: 0, busy: false };

  function trackModified() {
    var h = state.handle;
    watch.handle = h;
    watch.mtime = 0;
    if (!h || typeof h.modified !== 'function') return;
    h.modified().then(function (m) { if (watch.handle === h) watch.mtime = m; }, function () { void 0; });
  }

  function checkModified() {
    var h = state.handle;
    if (!h || h !== watch.handle || typeof h.modified !== 'function' || watch.busy || !watch.mtime) return;
    if (document.hidden) return;
    watch.busy = true;
    h.modified().then(function (m) {
      if (h !== state.handle || !m || m === watch.mtime) return;
      watch.mtime = m;
      if (state.dirty) { toast(t('info.changedOnDisk', { name: state.name }), 'warning'); return; }
      var top = el.previewScroll.scrollTop;
      return readHandle(h, true).then(function (ok) {
        if (!ok) return;
        el.previewScroll.scrollTop = top;
        toast(t('info.reloaded', { name: state.name }), 'info');
      });
    }).catch(function () { void 0; }).then(function () { watch.busy = false; });
  }

  var find = { hits: [], index: -1 };

  function clearFindMarks() {
    if (RV.Reading) RV.Reading.clearFindVisibility();
    eachNode('mark.rv-find', function (m) {
      var parent = m.parentNode;
      parent.replaceChild(document.createTextNode(m.textContent), m);
      parent.normalize();
    }, el.preview);
    find.hits = [];
    find.index = -1;
  }

  function runFind(keepIndex) {
    var previous = find.index;
    clearFindMarks();
    var q = el.findBar.hidden ? '' : el.findInput.value;
    if (!q) { el.findCount.textContent = ''; return; }
    var pattern = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'iu');
    var walker = document.createTreeWalker(el.preview, NodeFilter.SHOW_TEXT, null);
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (var i = 0; i < nodes.length && find.hits.length < 1000; i++) {
      var node = nodes[i];
      var match = pattern.exec(node.nodeValue);
      while (match && find.hits.length < 1000) {
        var hit = node.splitText(match.index);
        node = hit.splitText(match[0].length);
        var mark = document.createElement('mark');
        mark.className = 'rv-find';
        hit.parentNode.replaceChild(mark, hit);
        mark.appendChild(hit);
        find.hits.push(mark);
        match = pattern.exec(node.nodeValue);
      }
    }
    if (!find.hits.length) { el.findCount.textContent = t('find.none'); return; }
    find.index = keepIndex && previous >= 0 ? Math.min(previous, find.hits.length - 1) : 0;
    showFindHit(!keepIndex);
  }

  function showFindHit(scroll) {
    for (var i = 0; i < find.hits.length; i++) find.hits[i].classList.toggle('current', i === find.index);
    el.findCount.textContent = (find.index + 1) + ' / ' + find.hits.length;
    var cur = find.hits[find.index];
    if (RV.Reading) { RV.Reading.clearFindVisibility(); RV.Reading.reveal(cur); }
    if (scroll && cur && typeof cur.scrollIntoView === 'function') cur.scrollIntoView({ block: 'center' });
  }

  function stepFind(step) {
    if (!find.hits.length) { runFind(false); return; }
    find.index = (find.index + step + find.hits.length) % find.hits.length;
    showFindHit(true);
  }

  function openFind() {
    if (state.mode === 'write') setMode('split');
    el.findBar.hidden = false;
    var sel = window.getSelection ? String(window.getSelection()) : '';
    if (sel && sel.length < 100 && sel.indexOf('\n') < 0) el.findInput.value = sel;
    el.findInput.focus();
    el.findInput.select();
    runFind(false);
  }

  function closeFind() {
    el.findBar.hidden = true;
    clearFindMarks();
    el.findCount.textContent = '';
  }

  function wireFind() {
    el.findInput.addEventListener('input', function () { runFind(false); });
    el.findInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); stepFind(e.shiftKey ? -1 : 1); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeFind(); }
    });
    el.findNext.addEventListener('click', function () { stepFind(1); });
    el.findPrev.addEventListener('click', function () { stepFind(-1); });
    el.findClose.addEventListener('click', closeFind);
  }

  var nav = { list: [], index: -1, moving: false };

  function currentLocation() {
    if (state.folder) return { folder: state.folder.root, path: state.folder.path };
    if (nativeAvailable() && state.handle && state.handle.path) return { native: state.handle.path };
    return null;
  }

  function sameLocation(a, b) {
    return !!a && !!b && a.native === b.native && a.folder === b.folder && a.path === b.path;
  }

  function pushHistory() {
    if (nav.moving) return;
    var loc = currentLocation();
    if (!loc || sameLocation(loc, nav.list[nav.index])) { updateNavButtons(); return; }
    nav.list = nav.list.slice(0, nav.index + 1);
    nav.list.push(loc);
    nav.index = nav.list.length - 1;
    updateNavButtons();
  }

  function updateNavButtons() {
    if (!el.btnBack) return;
    el.btnBack.disabled = nav.index <= 0;
    el.btnForward.disabled = nav.index >= nav.list.length - 1;
  }

  function goHistory(step) {
    var history = nav;
    var documentId = state.documentId;
    var target = history.index + step;
    var loc = history.list[target];
    if (!loc) return;
    history.moving = true;
    var opening = loc.native
      ? openNativePath(loc.native)
      : (function () {
        var root = loc.folder;
        return new Promise(function (resolve, reject) { root.getFile(loc.path, {}, resolve, reject); })
          .then(function (entry) {
            if (state.documentId !== documentId) return false;
            return confirmDiscard().then(function (ok) { return ok ? openFolderEntry(root, entry) : false; });
          });
      })();
    Promise.resolve(opening).then(function (ok) {
      if (ok) history.index = target;
    }).catch(function (err) { reportOpen(err); }).then(function () {
      history.moving = false;
      updateNavButtons();
    });
  }

  function openFolderLink(href) {
    var documentId = state.documentId;
    var path = folderPath(href);
    if (path === null) return false;
    var hash = href.indexOf('#') >= 0 ? href.slice(href.indexOf('#') + 1) : '';
    var root = state.folder.root;
    var target = /\.(md|markdown|mdown|mkd|mdwn|txt)$/i.test(path)
      ? folderGet(path, false)
      : folderGet(path, true).then(function (dir) {
        return findReadme(dir, 3).then(function (found) {
          if (!found) throw new Error(t('error.notFound'));
          return found;
        });
      });
    target.then(function (entry) {
      if (state.documentId !== documentId) return false;
      return confirmDiscard().then(function (proceed) {
        return proceed ? openFolderEntry(root, entry) : false;
      });
    }).then(function (ok) {
      if (ok && hash) jumpToFragment(hash);
    }).catch(function (err) {
      toast(t('error.open', { name: path, reason: (err && err.message) || err }), 'error');
    });
    return true;
  }

  function loadFolderImages() {
    folderUrls.forEach(function (u) { URL.revokeObjectURL(u); });
    folderUrls = [];
    var folder = state.folder;
    eachNode('img[src]', function (img) {
      var path = folderPath(img.getAttribute('src') || '');
      if (path === null) return;
      img.removeAttribute('src');
      folderGet(path, false).then(openEntry).then(function (file) {
        if (state.folder !== folder) return;
        var url = URL.createObjectURL(file);
        folderUrls.push(url);
        img.setAttribute('src', url);
      }).catch(function () { void 0; });
    }, el.preview);
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
      if (e.key === 'Escape' && mobileSidebar) {
        mobileSidebar = false; applySidebar(); el.btnToc.focus(); return;
      }
      if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        var tag = (e.target && e.target.tagName) || '';
        if (tag === 'TEXTAREA' || tag === 'INPUT') return;
        e.preventDefault();
        goHistory(e.key === 'ArrowLeft' ? -1 : 1);
        return;
      }
      var mod = e.ctrlKey || e.metaKey;
      if (!mod || e.altKey) return;
      var key = (e.key || '').toLowerCase();
      if (key === 's') { e.preventDefault(); save(e.shiftKey); return; }
      if (key === 'o') { e.preventDefault(); pickOpen(); return; }
      if (key === 'f' && e.shiftKey) { e.preventDefault(); openFind(); return; }
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
      refreshComparison();
      applySidebar();
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
      captureTab();
      if (nativeAvailable() || !tabs.some(function (tab) { return tab.dirty; })) return undefined;
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
      'editorMeta', 'previewMeta', 'editBadge', 'helpModal', 'confirmModal',
      'hljsLight', 'hljsDark', 'btnOpen', 'btnSave', 'btnSaveAs', 'btnReload',
      'btnExport', 'btnTheme', 'btnWrap', 'btnSync', 'btnToc', 'btnEdit', 'btnFontUp',
      'btnFontDown', 'btnHelp', 'btnHelpClose', 'btnHelpDone', 'btnConfirmSave', 'btnBack', 'btnForward',
      'btnConfirmDiscard', 'btnConfirmCancel', 'btnEmptyOpen', 'btnEmptySample', 'fontValue',
      'brandMark', 'findBar', 'findInput', 'findCount', 'findPrev', 'findNext', 'findClose',
      'statusLink', 'recentList'];
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
    document.body.setAttribute('data-mode', state.mode);
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
    wireFind();
    wireRecent();
    wireComparison();
    wireLinkMenus();
    renderRecent();
    setInterval(checkModified, 2000);
    window.addEventListener('focus', checkModified);

    applyLocale();
    var tabbar = $('documentTabs');
    if (!tabbar) {
      tabbar = document.createElement('div'); tabbar.id = 'documentTabs';
      el.panes.parentNode.insertBefore(tabbar, el.panes);
    }
    tabbar.setAttribute('role', 'tablist');
    var newButton = $('btnNewTab');
    if (newButton) newButton.addEventListener('click', function () { newTab(); });
    newTab();
    markGutterCursor();
    state.ready = true;
    if (RV.Reading) RV.Reading.init(window.RVApp);
    if (RV.Shell) RV.Shell.init({
      undo: function () { undoEdit(false); el.editor.focus(); },
      redo: function () { undoEdit(true); el.editor.focus(); },
      getTheme: function () { return state.theme; }, setTheme: setTheme,
      find: openFind, close: function () { closeTab(activeTab.id); },
      canUndo: function () { return !!(activeTab && activeTab.undo.length); },
      canRedo: function () { return !!(activeTab && activeTab.redo.length); }
    });
    if (RV.Appearance) RV.Appearance.init({
      get: function () { var reading = RV.Reading.appearance(); return { theme: state.theme, font: state.font, width: reading.width, spacing: reading.spacing }; },
      preview: function (value) {
        state.font = clamp(Number(value.font) || 16, FONT_MIN, FONT_MAX); applyFont();
        RV.Reading.appearance(value, false); setTheme(value.theme, true);
        requestAnimationFrame(function () { measureParts(); markActiveToc(); });
      },
      save: function () { return saveSettings() && RV.Reading.appearance(RV.Reading.appearance(), true); }
    });
    if (nativeAvailable()) {
      Promise.resolve(RV.Native.initialize({
        openPath: function (path) {
          return openNativePath(path, false, true).then(function (ok) {
            if (ok) setMode('preview');
            return ok;
          });
        },
        confirmClose: confirmAllDirty, onError: reportOpen,
        onDrag: function (active) { document.body.classList.toggle('dragover', !!active); }
      })).catch(function (err) { reportOpen(err); });
    }
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
    restoreTab: restoreTab, newTab: newTab, switchTab: switchTab, closeTab: closeTab, listTabs: listTabs,
    confirmAllDirty: confirmAllDirty, openFileTab: openFileTab, openHandleTab: openHandleTab,
    showComparison: showComparison, hideComparison: hideComparison,
    setEmpty: setEmpty,
    setEditPreview: setEditPreview,
    setMode: setMode,
    save: save,
    confirmDiscard: confirmDiscard,
    openNativePath: openNativePath,
    toast: toast,
    applyLocale: applyLocale,
    SAMPLE: SAMPLE
  };
}());
