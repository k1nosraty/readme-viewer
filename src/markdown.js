/*
 * src/markdown.js — Markdown parsing, rendering and sanitising.
 *
 * Wraps marked + DOMPurify behind a small API the app (and the tests) can use:
 *
 *   var md = RV.Markdown.create(window.marked, window.DOMPurify, { strings: RV.I18n.t });
 *   md.reset();                       // per render pass: slug + checkbox counters
 *   var tokens = md.lexer(source);
 *   var html   = md.renderBlock(tokens[0], tokens.links);   // already sanitised
 *
 * Rendering never touches the DOM and never touches files: it maps Markdown to an HTML string.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.RV = root.RV || {}; root.RV.Markdown = factory(); }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function identity(key) { return key; }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** Plain text of inline tokens — used for heading slugs and the table of contents. */
  function plainText(tokens) {
    var out = '';
    if (!tokens) return out;
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      switch (t.type) {
        case 'text':
        case 'escape':
        case 'codespan':
          out += t.text || '';
          break;
        case 'html':
          out += (t.text || '').replace(/<[^>]*>/g, ' ');
          break;
        case 'br':
          out += ' ';
          break;
        default:
          if (t.tokens) out += plainText(t.tokens);
          else if (t.text) out += String(t.text).replace(/<[^>]*>/g, ' ');
      }
    }
    return out;
  }

  /** DOMPurify configuration: GitHub-like output, but nothing that can run or spoof the UI. */
  var SANITIZE = {
    USE_PROFILES: { html: true },
    ADD_TAGS: ['input', 'details', 'summary', 'kbd', 'samp', 'figure', 'figcaption',
      'mark', 'ins', 'del', 'picture', 'source'],
    ADD_ATTR: ['target', 'rel', 'align', 'dir', 'lang', 'start', 'checked', 'disabled',
      'type', 'loading', 'decoding', 'data-rv-task', 'data-lang', 'data-copy-code'],
    FORBID_TAGS: ['style', 'form', 'base', 'link', 'meta', 'button', 'iframe', 'object',
      'embed', 'audio', 'video'],
    ALLOW_DATA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false
  };

  /**
   * @param {Object} deps.marked  marked namespace
   * @param {Object} deps.purify  DOMPurify instance (optional; without it nothing is sanitised,
   *                              which is only useful for string-level tests)
   * @param {Object} [deps.icons]  function (name, size) returning SVG markup
   * @param {Object} [opts.strings] translation function for the few labels we emit
   */
  function create(deps, opts) {
    deps = deps || {};
    opts = opts || {};
    var markedLib = deps.marked;
    var purify = deps.purify || null;
    var icon = typeof deps.icons === 'function' ? deps.icons : function () { return ''; };
    var t = typeof opts.strings === 'function' ? opts.strings : identity;
    if (!markedLib) throw new Error('markdown: marked is required');

    var slugCount = Object.create(null);
    var taskSeq = 0;

    function slugify(text) {
      var base = String(text == null ? '' : text)
        .toLowerCase()
        .trim()
        .replace(/[\u2018\u2019\u201c\u201d\u200b-\u200f\u2026\u00ab\u00bb\u060c\u061b\u061f]/g, '')
        .replace(/[\u2000-\u206F\u2E00-\u2E7F\\'"!#$%&()*+,./:;<=>?@[\]^`{|}~]/g, '')
        .replace(/\s/g, '-');
      if (!base) base = 'section';
      var n = slugCount[base] || 0;
      slugCount[base] = n + 1;
      return n ? base + '-' + n : base;
    }

    var renderer = {
      heading: function (token) {
        var text = plainText(token.tokens);
        var id = 'user-content-' + slugify(text);
        var label = esc(t('heading.anchor', { title: text }));
        return '<h' + token.depth + ' id="' + esc(id) + '">' +
          '<a class="heading-anchor" href="#' + esc(id) + '" aria-label="' + label + '">' +
          icon('hash', 16) +
          '</a>' + this.parser.parseInline(token.tokens) + '</h' + token.depth + '>\n';
      },

      code: function (token) {
        var lang = String(token.lang || '').trim().split(/\s+/)[0].toLowerCase();
        var body = String(token.text == null ? '' : token.text).replace(/\n+$/, '');
        var cls = 'hljs' + (lang ? ' language-' + esc(lang) : '');
        var label = esc(t('action.copy'));
        return '<div class="code-block"' + (lang ? ' data-lang="' + esc(lang) + '"' : '') + '>' +
          '<div class="code-bar">' +
          '<span class="code-lang">' + esc(lang || 'text') + '</span>' +
          '<span class="code-copy" role="button" tabindex="0" data-copy-code aria-label="' + label + '">' +
          icon('copy', 14) +
          '<span class="code-copy-text">' + label + '</span></span>' +
          '</div>' +
          '<pre dir="ltr"><code class="' + cls + '">' + esc(body) + '</code></pre>' +
          '</div>\n';
      },

      list: function (token) {
        var body = '';
        var hasTask = false;
        var items = token.items || [];
        for (var i = 0; i < items.length; i++) {
          body += this.listitem(items[i]);
          if (items[i].task) hasTask = true;
        }
        var tag = token.ordered ? 'ol' : 'ul';
        var start = token.ordered && token.start !== 1 ? ' start="' + esc(token.start) + '"' : '';
        var cls = hasTask ? ' class="contains-task-list"' : '';
        return '<' + tag + start + cls + '>\n' + body + '</' + tag + '>\n';
      },

      listitem: function (item) {
        var cls = item.task ? ' class="task-list-item"' : '';
        return '<li' + cls + '>' + this.parser.parse(item.tokens) + '</li>\n';
      },

      /*
       * One task checkbox in document order gets one index. The index is matched against the
       * source map built by RV.Tasks, so a click can find the exact "[ ]" it came from.
       */
      checkbox: function (token) {
        var index = taskSeq++;
        // `task-list-item-checkbox` is the class github-markdown-css aligns on; `rv-task` is ours.
        return '<input class="task-list-item-checkbox rv-task" type="checkbox" ' +
          'data-rv-task="' + index + '"' + (token.checked ? ' checked' : '') + ' disabled> ';
      },

      image: function (token) {
        var out = '<img src="' + esc(token.href || '') + '" alt="' + esc(token.text || '') + '"';
        if (token.title) out += ' title="' + esc(token.title) + '"';
        return out + ' loading="lazy" decoding="async">';
      },

      table: function (token) {
        var head = '';
        var cell = '';
        for (var i = 0; i < token.header.length; i++) {
          cell += this.tablecell(token.header[i]);
        }
        head += this.tablerow({ text: cell });
        var body = '';
        for (var r = 0; r < token.rows.length; r++) {
          var row = token.rows[r];
          cell = '';
          for (var c = 0; c < row.length; c++) cell += this.tablecell(row[c]);
          body += this.tablerow({ text: cell });
        }
        return '<div class="table-wrap"><table>\n<thead>\n' + head + '</thead>\n' +
          (body ? '<tbody>' + body + '</tbody>' : '') + '</table></div>\n';
      }
    };

    var md = new markedLib.Marked({ gfm: true, breaks: false, pedantic: false });
    md.use({ renderer: renderer });

    function sanitize(html) {
      if (!purify) return html;
      return purify.sanitize(html, SANITIZE);
    }

    return {
      /** Reset per-document counters. Call once at the start of each render pass. */
      reset: function () {
        slugCount = Object.create(null);
        taskSeq = 0;
      },
      /** How many task checkboxes the renderer has produced since the last reset(). */
      taskCount: function () { return taskSeq; },
      lexer: function (source) { return md.lexer(String(source == null ? '' : source)); },
      /** Render and sanitise a single top-level token. */
      renderBlock: function (token, links) {
        var list = [token];
        list.links = links || {};
        return sanitize(md.parser(list));
      },
      renderAll: function (source) {
        this.reset();
        var tokens = this.lexer(source);
        var out = '';
        for (var i = 0; i < tokens.length; i++) out += this.renderBlock(tokens[i], tokens.links);
        return out;
      },
      sanitize: sanitize,
      plainText: plainText,
      slugify: slugify
    };
  }

  return { create: create, SANITIZE: SANITIZE, plainText: plainText };
}));
