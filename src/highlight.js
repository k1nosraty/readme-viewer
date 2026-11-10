/*
 * src/highlight.js — syntax highlighting for rendered code blocks.
 *
 * highlight.js ships with a common set of languages; the rest live in vendor/langs and are loaded
 * on demand the first time a README asks for them. Results are cached by (language, code) so that
 * typing in the editor does not re-highlight blocks that did not change.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./code-languages'));
  else { root.RV = root.RV || {}; root.RV.Highlight = factory(root.RV.CodeLanguages); }
}(typeof self !== 'undefined' ? self : this, function (languages) {
  'use strict';

  /*
   * highlight.js already resolves the common short names (js, ts, py, sh, yml, html, …), so this
   * map only covers the gaps: names it does not know, and spellings that should fall back to plain
   * text rather than trigger a request for a grammar we do not ship.
   */
  var ALIAS = {
    htm: 'xml', vue: 'xml', cshtml: 'xml', erb: 'ruby',
    py3: 'python', 'node-repl': 'javascript', 'objective-c': 'objectivec',
    ps: 'powershell', ps1: 'powershell', pwsh: 'powershell',
    mdx: 'markdown', udiff: 'diff', docker: 'dockerfile',
    cfg: 'ini', conf: 'ini', env: 'bash',
    clj: 'clojure', ex: 'elixir', exs: 'elixir', f: 'fortran', jl: 'julia',
    tex: 'latex', bat: 'dos', cmd: 'dos', jinja: 'django',
    // No grammar for these: render as plain text instead of 404-ing on a missing file.
    mermaid: 'plaintext', plain: 'plaintext', nohighlight: 'plaintext', rest: 'plaintext', rst: 'plaintext',
    adoc: 'plaintext', asciidoc: 'plaintext', org: 'plaintext', vim: 'plaintext',
    sol: 'plaintext',
    // Very large, rarely used grammars are not shipped to keep the app small.
    '1c': 'plaintext', mathematica: 'plaintext', mma: 'plaintext', wl: 'plaintext',
    isbl: 'plaintext', gml: 'plaintext', sqf: 'plaintext', maxima: 'plaintext', gauss: 'plaintext'
  };

  var CACHE_LIMIT = 400;
  var CACHE_BYTES = 4 * 1024 * 1024;
  var SHIPPED = new Set(languages.map(function (entry) { return entry[0]; }));

  function create(deps) {
    deps = deps || {};
    var hljs = deps.hljs || null;
    var basePath = deps.base || 'vendor/langs/';
    var requested = Object.create(null);
    var cache = new Map();
    var cacheBytes = 0;

    function langOf(node) {
      var m = /(?:^|\s)language-([^\s]+)/.exec(node.className || '');
      return m ? m[1].toLowerCase() : '';
    }

    function resolve(lang) {
      if (!lang) return '';
      if (hljs && hljs.getLanguage(lang)) return lang;
      var mapped = Object.prototype.hasOwnProperty.call(ALIAS, lang) ? ALIAS[lang] : '';
      if (mapped && hljs && hljs.getLanguage(mapped)) return mapped;
      return mapped || lang;
    }

    function cacheSet(key, value) {
      // Count both source keys and highlighted HTML as UTF-16 storage.
      var size = (key.length + (value || '').length) * 2;
      if (size > CACHE_BYTES) return;
      while (cache.size && (cache.size >= CACHE_LIMIT || cacheBytes + size > CACHE_BYTES)) {
        var oldest = cache.keys().next().value;
        cacheBytes -= (oldest.length + (cache.get(oldest) || '').length) * 2;
        cache.delete(oldest);
      }
      cache.set(key, value);
      cacheBytes += size;
    }

    function loadLang(name, node, retry) {
      if (requested[name]) {
        if (requested[name] !== true) requested[name].set(node, retry);
        return;
      }
      if (typeof document === 'undefined') { requested[name] = true; return; }
      var waiting = new Map([[node, retry]]);
      requested[name] = waiting;
      var script = document.createElement('script');
      script.src = basePath + encodeURIComponent(name) + '.min.js';
      script.async = true;
      script.onload = function () {
        script.remove();
        requested[name] = true;
        waiting.forEach(function (retry, pending) { if (pending.isConnected) retry(); });
        waiting.clear();
      };
      // Leave it un-highlighted rather than retrying on every keystroke.
      script.onerror = function () { script.remove(); requested[name] = true; waiting.clear(); };
      document.head.appendChild(script);
    }

    function block(node, ready, skipCache) {
      if (!hljs || !node || langOf(node) === 'mermaid') return;
      var lang = resolve(langOf(node));
      if (!lang || !hljs.getLanguage(lang)) {
        if (SHIPPED.has(lang)) loadLang(lang, node, function () { block(node, ready, skipCache); });
        return;
      }
      var code = node.textContent || '';
      if (!code.trim()) { if (ready) ready(); return; }
      var key = !skipCache && lang + '\u0000' + code;
      var html = key ? cache.get(key) : undefined;
      if (html === undefined) {
        try {
          html = hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
        } catch (e) {
          html = null;
        }
        if (key) cacheSet(key, html);
      }
      if (html === null) return;
      node.innerHTML = html;
      node.classList.add('hljs');
      if (ready) ready();
    }

    function each(root, fn) {
      if (!root || typeof root.querySelectorAll !== 'function') return;
      var nodes = root.querySelectorAll('pre > code');
      for (var i = 0; i < nodes.length; i++) fn(nodes[i]);
    }

    return {
      block: block,
      all: function (root) { each(root, block); },
      cacheSize: function () { return cache.size; },
      clear: function () { cache.clear(); cacheBytes = 0; },
      resolve: resolve
    };
  }

  return { create: create, ALIAS: ALIAS };
}));
