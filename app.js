(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  var el = {
    root: document.documentElement,
    layout: $('layout'),
    panes: $('panes'),
    sidebar: $('sidebar'),
    toc: $('toc'),
    baseUrl: $('baseUrl'),
    editor: $('editor'),
    editorWrap: $('editorWrap'),
    gutterInner: $('gutterInner'),
    previewScroll: $('previewScroll'),
    preview: $('preview'),
    resizer: $('resizer'),
    fileName: $('fileName'),
    dirtyDot: $('dirtyDot'),
    fileInput: $('fileInput'),
    statusFile: $('statusFile'),
    statusPos: $('statusPos'),
    statusCount: $('statusCount'),
    statusPerf: $('statusPerf'),
    statusLang: $('statusLang'),
    toast: $('toast'),
    editorMeta: $('editorMeta'),
    previewMeta: $('previewMeta'),
    helpModal: $('helpModal'),
    ghLight: $('ghLight'),
    ghDark: $('ghDark'),
    hljsLight: $('hljsLight'),
    hljsDark: $('hljsDark')
  };

  var STORE = 'rv.settings';
  var state = {
    handle: null,
    name: 'README.md',
    dirty: false,
    saved: '',
    baseUrl: '',
    anchors: [],
    toc: [],
    lines: 0,
    curLine: -1,
    tocFilter: '',
    wrap: false,
    sync: true,
    dirMode: 'auto',
    font: 16,
    mode: 'split',
    theme: 'auto',
    lock: { pane: '', until: 0 },
    queue: false
  };

  var RTL = /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0750-\u077F\u0780-\u07BF\u07C0-\u07FF\u0800-\u085F\u08A0-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
  var LTR = /[A-Za-z\u00C0-\u02AF\u0370-\u058F\u0900-\u1FFF\u2C00-\uD7FF\uF900-\uFB17]|[\uD800-\uDBFF][\uDC00-\uDFFF]/;
  var RTL_G = new RegExp(RTL.source, 'g');
  var LTR_G = new RegExp(LTR.source, 'g');

  var LANG_ALIAS = {
    sh: 'bash', shell: 'bash', zsh: 'bash', console: 'shell', shellsession: 'shell',
    yml: 'yaml', html: 'xml', htm: 'xml', vue: 'xml', svg: 'xml', xhtml: 'xml',
    js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript',
    ts: 'typescript', tsx: 'typescript', py: 'python', py3: 'python', gyp: 'python',
    rb: 'ruby', gemspec: 'ruby', rs: 'rust', kt: 'kotlin', kts: 'kotlin',
    'c++': 'cpp', cxx: 'cpp', cc: 'cpp', hpp: 'cpp', cs: 'csharp', 'c#': 'csharp',
    golang: 'go', ps: 'powershell', ps1: 'powershell', pwsh: 'powershell',
    md: 'markdown', mdx: 'markdown', markdown: 'markdown', mkd: 'markdown',
    txt: 'plaintext', text: 'plaintext', plain: 'plaintext', nohighlight: 'plaintext',
    docker: 'dockerfile', dockerfile: 'dockerfile', make: 'makefile', makefile: 'makefile',
    ini: 'ini', toml: 'ini', cfg: 'ini', conf: 'ini', env: 'bash',
    proto: 'protobuf', graphql: 'graphql', gql: 'graphql',
    rest: 'restructuredtext', rst: 'restructuredtext', tex: 'latex', vim: 'vim',
    bat: 'batch', cmd: 'batch', ps1xml: 'powershell', asciidoc: 'asciidoc',
    adoc: 'asciidoc', org: 'clojure', clj: 'clojure', ex: 'elixir', exs: 'elixir',
    h: 'c', hpp2: 'cpp', f: 'fortran', jl: 'julia', nix: 'nix', sol: 'solidity',
    patch: 'diff', udiff: 'diff', cshtml: 'xml', erb: 'ruby', jinja: 'python'
  };

  var loadedLangs = Object.create(null);

  var SAMPLE = [
    '# خوانایی هر زبان',
    '',
    'این یک نمونه است تا رفتار **جهت متن**، جدول‌ها و بلوک‌های کد را ببینید.',
    '',
    'متن فارسی در میان متن English باید درست نمایش داده شود، بدون به‌هم‌ریختن پرانتزها (parentheses) و نقل‌قول‌ها.',
    '',
    '## English section',
    '',
    'This paragraph is left-to-right and keeps its punctuation in place: (nested (parentheses)), "quotes" and 42 + 8 = 50.',
    '',
    '| قابلیت | وضعیت | توضیح |',
    '| --- | :---: | --- |',
    '| جهت خودکار | ✅ | هر بلوک جداگانه |',
    '| اسکرول همگام | ✅ | دوطرفه |',
    '| هایلایت کد | ✅ | بیش از ۱۹۰ زبان |',
    '',
    '## کد',
    '',
    '```python',
    'def greet(name: str) -> str:',
    '    return f"سلام {name}"',
    '```',
    '',
    '```bash',
    'npm install readme-viewer && open index.html',
    '```',
    '',
    '> نقل قول: هر زبان و هر کیبوردی، بدون تغییر در ورودی متن.',
    '',
    '- [x] پشتیبانی از کیبورد فارسی و عربی',
    '- [x] پشتیبانی از کیبورد چینی و ژاپنی (IME)',
    '- [ ] مرحله بعد: حالت دو ستونه',
    '',
    'پیوندهای [مرجع][ref] و [نسبی](docs/page.md) هم کار می‌کنند.',
    '',
    '[ref]: https://example.com',
    ''
  ].join('\n');

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fa(n) {
    var d = '۰۱۲۳۴۵۶۷۸۹';
    return String(n).replace(/[0-9]/g, function (c) { return d[+c]; });
  }

  function loadSettings() {
    var raw = null;
    try { raw = localStorage.getItem(STORE); } catch (e) { raw = null; }
    if (!raw) return;
    var s;
    try { s = JSON.parse(raw); } catch (e) { return; }
    if (!s) return;
    state.font = clamp(s.font || 16, 12, 26);
    state.wrap = !!s.wrap;
    state.sync = s.sync !== false;
    state.dirMode = ['auto', 'ltr', 'rtl'].indexOf(s.dirMode) >= 0 ? s.dirMode : 'auto';
    state.mode = ['split', 'write', 'preview'].indexOf(s.mode) >= 0 ? s.mode : 'split';
    state.theme = ['auto', 'light', 'dark'].indexOf(s.theme) >= 0 ? s.theme : 'auto';
    state.baseUrl = typeof s.baseUrl === 'string' ? s.baseUrl : '';
  }

  function saveSettings() {
    try {
      localStorage.setItem(STORE, JSON.stringify({
        font: state.font, wrap: state.wrap, sync: state.sync,
        dirMode: state.dirMode, mode: state.mode, theme: state.theme,
        baseUrl: state.baseUrl
      }));
    } catch (e) { void 0; }
  }

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  function toast(msg, kind) {
    el.toast.textContent = msg;
    el.toast.hidden = false;
    el.toast.dataset.kind = kind || 'info';
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { el.toast.hidden = true; }, 2600);
  }

  var slugCount = Object.create(null);

  function slugger(text) {
    var base = text
      .toLowerCase()
      .trim()
      .replace(/[\u2018\u2019\u201c\u201d\u200b-\u200f\u2026\u00ab\u00bb\u060c\u061b\u061f]/g, '')
      .replace(/[\u2000-\u206F\u2E00-\u2E7F\\'!"#$%&()*+,./:;<=>?@[\]^`{|}~]/g, '')
      .replace(/\s/g, '-');
    if (!base) base = 'section';
    var n = slugCount[base] || 0;
    slugCount[base] = n + 1;
    return n ? base + '-' + n : base;
  }

  function plainInline(tokens) {
    var out = '';
    if (!tokens) return out;
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      switch (t.type) {
        case 'text': case 'escape': out += t.text; break;
        case 'codespan': out += t.text; break;
        case 'html': out += t.text.replace(/<[^>]*>/g, ' '); break;
        case 'del': case 'strong': case 'em': out += plainInline(t.tokens); break;
        case 'link': out += plainInline(t.tokens); break;
        case 'br': out += ' '; break;
        default:
          if (t.tokens) out += plainInline(t.tokens);
          else if (t.text) out += t.text.replace(/<[^>]*>/g, ' ');
      }
    }
    return out;
  }

  var renderer = Object.create(new marked.Renderer());
  renderer.heading = function (token) {
    var id = 'user-content-' + slugger(plainInline(token.tokens));
    var inner = this.parser.parseInline(token.tokens);
    var tag = 'h' + token.depth;
    return '<' + tag + ' id="' + esc(id) + '"><a class="anchor" href="#' + esc(id) +
      '" aria-label="پیوند به این بخش">#</a>' + inner + '</' + tag + '>\n';
  };
  renderer.code = function (token) {
    var lang = (token.lang || '').match(/^\S*/);
    lang = lang ? lang[0] : '';
    var body = token.text.replace(/\n$/, '');
    var cls = 'hljs' + (lang ? ' language-' + esc(lang) : '');
    return '<pre dir="ltr"><code class="' + cls + '">' + esc(body) + '\n</code></pre>\n';
  };

  var markedOpts = { gfm: true, breaks: false, pedantic: false, renderer: renderer };

  var purifyCfg = {
    USE_PROFILES: { html: true },
    ADD_TAGS: ['input', 'details', 'summary', 'kbd', 'samp', 'figure', 'figcaption',
      'mark', 'ins', 'del', 'picture', 'source', 'video', 'audio'],
    ADD_ATTR: ['target', 'align', 'dir', 'lang', 'start', 'checked', 'disabled', 'type', 'rel'],
    FORBID_TAGS: ['style', 'form', 'base', 'link', 'meta', 'button'],
    ALLOW_DATA_ATTR: false
  };

  function parseTop(token) {
    try {
      return marked.parser([token], markedOpts);
    } catch (err) {
      return '<pre dir="ltr">' + esc(String(err && err.message || err)) + '</pre>\n';
    }
  }

  function countLines(raw) {
    var n = 0;
    for (var i = 0; i < raw.length; i++) if (raw.charCodeAt(i) === 10) n++;
    return n;
  }

  function textDirection(text) {
    var clean = text
      .replace(/<[^>]*>/g, ' ')
      .replace(/!?\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/https?:\/\/\S+/g, ' ');
    var r = RTL.exec(clean);
    var l = LTR.exec(clean);
    var ri = r ? r.index : -1;
    var li = l ? l.index : -1;
    if (ri < 0 && li < 0) return null;
    return ri >= 0 && (li < 0 || ri < li) ? 'rtl' : 'ltr';
  }

  function dominantDir(text) {
    var r = (text.match(RTL_G) || []).length;
    var l = (text.match(LTR_G) || []).length;
    if (r === 0 && l === 0) return 'ltr';
    return r > l ? 'rtl' : 'ltr';
  }

  function detectLanguage(text) {
    var sample = text.slice(0, 40000);
    var tests = [
      ['fa', /[\u067E\u0686\u0698\u06AF\u06A9\u06CC]/],
      ['he', /[\u0590-\u05FF]/],
      ['ar', /[\u0600-\u06FF]/],
      ['ja', /[\u3040-\u30FF]/],
      ['ko', /[\uAC00-\uD7AF]/],
      ['zh', /[\u3400-\u9FFF]/],
      ['ru', /[\u0400-\u04FF]/],
      ['th', /[\u0E00-\u0E7F]/],
      ['el', /[\u0370-\u03FF]/]
    ];
    for (var i = 0; i < tests.length; i++) {
      var m = sample.match(tests[i][1]);
      if (m) return tests[i][0] + (m.length > 40 ? ' (پرکاربرد)' : '');
    }
    return 'en';
  }

  function render() {
    var src = el.editor.value;
    var t0 = (performance && performance.now) ? performance.now() : Date.now();
    slugCount = Object.create(null);
    var tokens;
    try {
      tokens = marked.lexer(src, markedOpts);
    } catch (err) {
      el.preview.textContent = 'خطا در تجزیه: ' + err.message;
      return;
    }

    var frag = document.createDocumentFragment();
    var parts = [];
    var toc = [];
    var line = 1;

    for (var i = 0; i < tokens.length; i++) {
      var token = tokens[i];
      var html = parseTop(token);
      var startLine = line;
      line += countLines(token.raw);
      if (!html) continue;
      var holder = document.createElement('div');
      holder.innerHTML = DOMPurify.sanitize(html, purifyCfg);
      var child = holder.firstElementChild;
      if (!child) continue;
      while (holder.firstChild) frag.appendChild(holder.firstChild);
      var part = {
        el: child,
        line: startLine,
        endLine: Math.max(startLine + 1, line),
        token: token,
        top: 0,
        height: 1
      };
      parts.push(part);
      if (token.type === 'heading') {
        toc.push({
          id: child.id,
          depth: token.depth,
          text: plainInline(token.tokens),
          line: startLine,
          part: part
        });
      }
    }

    el.preview.textContent = '';
    el.preview.appendChild(frag);

    if (state.dirMode === 'auto') el.preview.removeAttribute('dir');
    else el.preview.setAttribute('dir', state.dirMode);

    for (var j = 0; j < parts.length; j++) {
      var p = parts[j];
      if (p.el.tagName === 'PRE') {
        p.el.setAttribute('dir', 'ltr');
      } else if (state.dirMode === 'auto') {
        var d = textDirection(p.el.textContent || '');
        if (d) p.el.setAttribute('dir', d);
      } else {
        p.el.setAttribute('dir', state.dirMode);
      }
    }

    enhanceLinks();
    highlightAll();

    var box = el.previewScroll.getBoundingClientRect();
    var base = el.previewScroll.scrollTop;
    for (var k = 0; k < parts.length; k++) {
      var rect = parts[k].el.getBoundingClientRect();
      parts[k].top = rect.top - box.top + base;
      parts[k].height = Math.max(1, rect.height);
    }
    state.anchors = parts;
    state.toc = toc;

    state.lines = src ? src.split('\n').length : 1;
    buildGutter();
    renderToc();
    markActiveToc();
    updateStats(src, (performance && performance.now) ? performance.now() - t0 : 0);
  }

  function scheduleRender() {
    if (state.queue) return;
    state.queue = true;
    requestAnimationFrame(function () {
      state.queue = false;
      render();
    });
  }

  function enhanceLinks() {
    var base = state.baseUrl;
    var nodes = el.preview.querySelectorAll('a[href]');
    for (var i = 0; i < nodes.length; i++) {
      var a = nodes[i];
      var href = a.getAttribute('href') || '';
      if (href.charAt(0) === '#') continue;
      var resolved = resolveUrl(href, base);
      if (resolved) a.setAttribute('href', resolved);
      if (/^https?:/i.test(resolved)) {
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer nofollow');
      }
    }
    if (!base) return;
    var imgs = el.preview.querySelectorAll('img[src]');
    for (var j = 0; j < imgs.length; j++) {
      var src = imgs[j].getAttribute('src') || '';
      var r = resolveUrl(src, base);
      if (r) imgs[j].setAttribute('src', r);
    }
  }

  function resolveUrl(href, base) {
    if (!base) return href;
    if (/^(https?:|file:|data:|mailto:|#)/i.test(href)) return href;
    if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return href;
    try { return new URL(href, base).href; } catch (e) { return href; }
  }

  function highlightAll() {
    if (typeof hljs === 'undefined') return;
    var blocks = el.preview.querySelectorAll('pre > code');
    for (var i = 0; i < blocks.length; i++) highlightBlock(blocks[i]);
  }

  function langOf(node) {
    var m = /(?:^|\s)language-([^\s]+)/.exec(node.className || '');
    return m ? m[1].toLowerCase() : '';
  }

  function highlightBlock(node) {
    var lang = langOf(node);
    var file = LANG_ALIAS[lang] || lang;
    if (!file || loadedLangs[file] || hljs.getLanguage(file)) {
      hljs.highlightElement(node);
      return;
    }
    loadedLangs[file] = true;
    var s = document.createElement('script');
    s.src = 'vendor/langs/' + encodeURIComponent(file) + '.min.js';
    s.onload = function () { if (node.isConnected) hljs.highlightElement(node); };
    s.onerror = function () { hljs.highlightElement(node); };
    document.head.appendChild(s);
  }

  function buildGutter() {
    if (state.wrap) { el.gutterInner.textContent = ''; state.curLine = -1; return; }
    var n = state.lines;
    state.curLine = -1;
    if (el.gutterInner.childElementCount === n) { markGutterCursor(); return; }
    var html = '';
    for (var i = 1; i <= n; i++) html += '<span>' + i + '</span>';
    el.gutterInner.innerHTML = html;
    markGutterCursor();
  }

  function currentLine() {
    var lh = lineHeight();
    var st = el.editor.scrollTop;
    var max = el.editor.scrollHeight - el.editor.clientHeight;
    if (state.wrap) {
      if (max <= 0) return 1;
      return 1 + (st / max) * (state.lines - 1);
    }
    return Math.floor(st / lh) + 1;
  }

  function lineHeight() {
    var lh = parseFloat(getComputedStyle(el.editor).lineHeight);
    return isNaN(lh) || lh <= 0 ? 20.8 : lh;
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

  function onEditorScroll() {
    el.gutterInner.style.transform = 'translateY(' + (-el.editor.scrollTop) + 'px)';
    if (!state.sync || state.mode === 'write') return;
    if (isEcho('editor')) return;
    var a = anchorForLine(currentLine());
    if (!a) return;
    ignoreEcho('preview', 160);
    el.previewScroll.scrollTop = Math.max(0, a.top - 12);
  }

  function onPreviewScroll() {
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
    var empty = $('tocEmpty');
    if (empty) empty.hidden = shown !== 0 || links.length === 0;
  }

  function renderToc() {
    var html = '';
    for (var i = 0; i < state.toc.length; i++) {
      var t = state.toc[i];
      html += '<a class="h' + t.depth + '" href="#' + esc(t.id) + '" data-i="' + i +
        '" title="سطر ' + t.line + '">' + esc(t.text) + '</a>';
    }
    el.toc.innerHTML = html || '<a class="h1" data-empty="1">بدون عنوان</a>';
    applyTocFilter();
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
    for (var j = 0; j < links.length; j++) {
      links[j].classList.toggle('active', j === active);
    }
  }

  function jumpToLine(line, id) {
    ignoreEcho('both', 220);
    var text = el.editor.value;
    var lines = text.split('\n');
    var idx = clamp(line, 1, lines.length) - 1;
    var start = 0;
    for (var i = 0; i < idx; i++) start += lines[i].length + 1;
    var end = start + lines[idx].length;
    el.editor.focus({ preventScroll: true });
    el.editor.setSelectionRange(start, end);
    var lh = lineHeight();
    if (state.wrap) {
      var max = el.editor.scrollHeight - el.editor.clientHeight;
      if (max > 0) el.editor.scrollTop = (idx / Math.max(1, lines.length - 1)) * max;
    } else {
      el.editor.scrollTop = Math.max(0, (idx - 3) * lh);
    }
    var a = anchorForLine(line);
    if (a) el.previewScroll.scrollTop = Math.max(0, a.top - 12);
    if (id) {
      var node = byId(id);
      if (node && typeof node.scrollIntoView === 'function') node.scrollIntoView({ block: 'start' });
    }
    markGutterCursor();
  }

  function byId(id) {
    if (window.CSS && typeof CSS.escape === 'function') {
      return el.preview.querySelector('#' + CSS.escape(id));
    }
    var all = el.preview.querySelectorAll('[id]');
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return null;
  }

  function markGutterCursor() {
    if (state.wrap) return;
    var line = el.editor.value.slice(0, el.editor.selectionStart).split('\n').length;
    if (line === state.curLine) return;
    state.curLine = line;
    var spans = el.gutterInner.children;
    for (var i = 0; i < spans.length; i++) {
      spans[i].classList.toggle('cur', i === line - 1);
    }
  }

  function updateStats(src, ms) {
    var lines = src ? src.split('\n') : [''];
    var upto = src.slice(0, el.editor.selectionStart);
    var row = upto.split('\n').length;
    var col = upto.length - (upto.lastIndexOf('\n') + 1) + 1;
    el.statusPos.textContent = 'سطر ' + fa(row) + '، ستون ' + fa(col);
    var words = src.trim() ? src.trim().split(/\s+/).length : 0;
    el.statusCount.textContent = fa(words) + ' واژه · ' + fa(src.length) + ' نویسه';
    if (ms) el.statusPerf.textContent = 'رندر ' + fa(Math.round(ms)) + ' میلی‌ثانیه';

    var lang = detectLanguage(src);
    el.statusLang.textContent = lang;
    el.editor.lang = /^(fa|ar|he|ru|ja|ko|zh|th|el)/.test(lang) ? lang : 'en';

    var dir = state.dirMode === 'auto' ? dominantDir(src) : state.dirMode;
    el.editor.dir = dir;
    el.editorMeta.textContent = fa(lines.length) + ' سطر · ' + fa(src.length) + ' نویسه';
    el.previewMeta.textContent = fa(state.anchors.length) + ' بلوک · ' + state.dirMode;
  }

  function setDirty(on) {
    state.dirty = on;
    el.dirtyDot.hidden = !on;
  }

  function setDoc(text, name, handle) {
    el.editor.value = text;
    state.name = name;
    state.saved = text;
    state.handle = handle || null;
    setDirty(false);
    el.fileName.textContent = name;
    el.fileName.title = name;
    el.statusFile.textContent = name;
    el.editor.scrollTop = 0;
    el.previewScroll.scrollTop = 0;
    render();
    el.editor.focus();
  }

  function decodeBuffer(buf) {
    var bytes = new Uint8Array(buf);
    if (bytes.length > 2 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
      return new TextDecoder('utf-8').decode(bytes.subarray(3));
    }
    if (bytes.length > 1 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
      return new TextDecoder('utf-16le').decode(bytes.subarray(2));
    }
    if (bytes.length > 1 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
      return new TextDecoder('utf-16be').decode(bytes.subarray(2));
    }
    var nulls = 0, probe = Math.min(bytes.length, 8000);
    for (var i = 0; i < probe; i += 2) if (bytes[i] === 0) nulls++;
    if (nulls > probe / 8) return new TextDecoder('utf-16le').decode(bytes);
    var strict = tryDecode(bytes, 'utf-8');
    if (strict !== null) return strict;
    return tryDecode(bytes, 'windows-1256') || tryDecode(bytes, 'windows-1252') ||
      new TextDecoder('utf-8').decode(bytes);
  }

  function tryDecode(bytes, enc) {
    try { return new TextDecoder(enc, { fatal: true }).decode(bytes); } catch (e) { return null; }
  }

  function readFile(file, handle) {
    return file.arrayBuffer().then(function (buf) {
      setDoc(decodeBuffer(buf), file.name || state.name, handle || null);
      toast('باز شد: ' + (file.name || state.name));
    });
  }

  function pickOpen() {
    var opts = {
      multiple: false,
      types: [{
        description: 'README / متن',
        accept: {
          'text/markdown': ['.md', '.markdown', '.mdown', '.mkd', '.mdwn'],
          'text/plain': ['.txt']
        }
      }]
    };
    if (typeof window.showOpenFilePicker === 'function') {
      window.showOpenFilePicker(opts).then(function (handles) {
        var h = handles[0];
        return h.getFile().then(function (f) { return readFile(f, h); });
      }).catch(function (err) {
        if (err && err.name === 'AbortError') return;
        el.fileInput.click();
      });
    } else {
      el.fileInput.click();
    }
  }

  function pickSave() {
    if (typeof window.showSaveFilePicker !== 'function') return null;
    return window.showSaveFilePicker({
      suggestedName: state.name,
      types: [{
        description: 'Markdown',
        accept: { 'text/markdown': ['.md', '.markdown', '.txt'] }
      }]
    });
  }

  function save(forceNew) {
    var text = el.editor.value;
    var done = function (handle) {
      state.saved = text;
      if (handle) state.handle = handle;
      setDirty(false);
      toast('ذخیره شد: ' + state.name);
      saveSettings();
    };
    var handle = forceNew ? null : state.handle;
    var run = function (h) {
      if (!h) { download(text, state.name, 'text/markdown;charset=utf-8'); done(null); return; }
      h.createWritable().then(function (w) {
        return w.write(new Blob([text], { type: 'text/markdown;charset=utf-8' })).then(function () {
          return w.close();
        });
      }).then(function () { done(h); }).catch(function (err) {
        toast('ذخیره ناموفق: ' + (err && err.message || err), 'error');
      });
    };
    if (handle) { run(handle); return; }
    if (typeof window.showSaveFilePicker === 'function') {
      pickSave().then(function (h) {
        if (!h) { download(text, state.name, 'text/markdown;charset=utf-8'); done(null); return; }
        state.name = h.name;
        el.fileName.textContent = h.name;
        run(h);
      }).catch(function (err) {
        if (err && err.name === 'AbortError') return;
        download(text, state.name, 'text/markdown;charset=utf-8');
        done(null);
      });
    } else {
      download(text, state.name, 'text/markdown;charset=utf-8');
      done(null);
    }
  }

  function download(text, name, mime) {
    var blob = new Blob([text], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function exportHtml() {
    var dir = state.dirMode === 'auto' ? 'ltr' : state.dirMode;
    var doc = [
      '<!DOCTYPE html>',
      '<html lang="fa" dir="' + dir + '">',
      '<head>',
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      '<title>' + esc(state.name) + '</title>',
      '<link rel="stylesheet" href="vendor/github-markdown-light.css">',
      '<link rel="stylesheet" href="vendor/hljs-github.min.css">',
      '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/github-markdown-css@5/github-markdown-light.css">',
      '</head>',
      '<body>',
      '<article class="markdown-body">',
      el.preview.innerHTML,
      '</article>',
      '</body>',
      '</html>'
    ].join('\n');
    download(doc, state.name.replace(/\.[^.]+$/, '') + '.html', 'text/html;charset=utf-8');
    toast('خروجی HTML ساخته شد');
  }

  function applyTheme() {
    var dark = state.theme === 'dark' ||
      (state.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    el.root.setAttribute('data-theme', dark ? 'dark' : 'light');
    el.ghLight.disabled = dark;
    el.ghDark.disabled = !dark;
    el.hljsLight.disabled = dark;
    el.hljsDark.disabled = !dark;
  }

  function applyFont() {
    el.root.style.setProperty('--rv-font', state.font);
    var fv = $('fontValue');
    if (fv) fv.textContent = state.font;
  }

  function applyWrap() {
    el.editor.setAttribute('data-wrap', state.wrap ? '1' : '0');
    el.editorWrap.setAttribute('data-wrap', state.wrap ? '1' : '0');
    $('btnWrap').setAttribute('aria-pressed', state.wrap ? 'true' : 'false');
  }

  function applyMode() {
    el.panes.setAttribute('data-mode', state.mode);
    Array.prototype.forEach.call(document.querySelectorAll('[data-mode-btn]'), function (b) {
      b.setAttribute('aria-pressed', b.dataset.modeBtn === state.mode ? 'true' : 'false');
    });
  }

  function applyDirButtons() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-dir]'), function (b) {
      b.setAttribute('aria-pressed', b.dataset.dir === state.dirMode ? 'true' : 'false');
    });
  }

  function setDir(mode) {
    state.dirMode = mode;
    applyDirButtons();
    saveSettings();
    render();
  }

  function wireToolbar() {
    $('btnOpen').addEventListener('click', pickOpen);
    $('btnSave').addEventListener('click', function () { save(false); });
    $('btnSaveAs').addEventListener('click', function () { save(true); });
    $('btnExport').addEventListener('click', exportHtml);
    $('btnTheme').addEventListener('click', function () {
      state.theme = state.theme === 'auto' ? 'light' : (state.theme === 'light' ? 'dark' : 'auto');
      applyTheme();
      toast('پوسته: ' + (state.theme === 'auto' ? 'خودکار' : (state.theme === 'light' ? 'روشن' : 'تیره')));
      saveSettings();
    });
    $('btnWrap').addEventListener('click', function () {
      state.wrap = !state.wrap;
      applyWrap();
      saveSettings();
      buildGutter();
    });
    $('btnSync').addEventListener('click', function () {
      state.sync = !state.sync;
      $('btnSync').setAttribute('aria-pressed', state.sync ? 'true' : 'false');
      toast(state.sync ? 'اسکرول همگام: روشن' : 'اسکرول همگام: خاموش');
      saveSettings();
    });
    $('btnToc').addEventListener('click', function () {
      var hidden = !el.sidebar.hidden;
      el.sidebar.hidden = hidden;
      el.layout.setAttribute('data-sidebar', hidden ? 'off' : 'on');
      $('btnToc').setAttribute('aria-pressed', hidden ? 'false' : 'true');
      saveSettings();
      markActiveToc();
    });
    $('btnFontUp').addEventListener('click', function () {
      state.font = clamp(state.font + 1, 12, 26);
      applyFont();
      saveSettings();
    });
    $('btnFontDown').addEventListener('click', function () {
      state.font = clamp(state.font - 1, 12, 26);
      applyFont();
      saveSettings();
    });
    function showHelp(open) {
      el.helpModal.hidden = !open;
      if (open) $('btnHelpClose').focus();
      else $('btnHelp').focus();
    }
    $('btnHelp').addEventListener('click', function () { showHelp(true); });
    $('btnHelpClose').addEventListener('click', function () { showHelp(false); });
    el.helpModal.addEventListener('click', function (e) {
      if (e.target === el.helpModal) showHelp(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !el.helpModal.hidden) { showHelp(false); e.stopPropagation(); }
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-dir]'), function (b) {
      b.addEventListener('click', function () { setDir(b.dataset.dir); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-mode-btn]'), function (b) {
      b.addEventListener('click', function () {
        state.mode = b.dataset.modeBtn;
        applyMode();
        saveSettings();
      });
    });
    el.baseUrl.addEventListener('input', function () {
      state.baseUrl = el.baseUrl.value.trim();
      saveSettings();
      scheduleRender();
    });
    el.fileInput.addEventListener('change', function () {
      var f = el.fileInput.files && el.fileInput.files[0];
      if (f) readFile(f, null);
      el.fileInput.value = '';
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
      var ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && !e.altKey) {
        var k = e.key.toLowerCase();
        if (k === 's') { e.preventDefault(); save(e.shiftKey); return; }
        if (k === 'o') { e.preventDefault(); pickOpen(); return; }
        if (k === '1') { e.preventDefault(); state.mode = 'write'; applyMode(); saveSettings(); return; }
        if (k === '2') { e.preventDefault(); state.mode = 'split'; applyMode(); saveSettings(); return; }
        if (k === '3') { e.preventDefault(); state.mode = 'preview'; applyMode(); saveSettings(); return; }
      }
      if (e.key === 'Escape') { el.editor.blur(); return; }
      if (e.key === 'Tab') {
        e.preventDefault();
        indentSelection(e.shiftKey);
        return;
      }
    });
    ['keyup', 'click', 'select', 'focus'].forEach(function (t) {
      el.editor.addEventListener(t, function () { markGutterCursor(); });
    });
    el.editor.addEventListener('select', updateStatsSoon);
    el.editor.addEventListener('click', updateStatsSoon);
  }

  var statsTimer = 0;
  function updateStatsSoon() {
    clearTimeout(statsTimer);
    statsTimer = setTimeout(function () {
      updateStats(el.editor.value, 0);
    }, 120);
  }

  function markDirtyFromValue() {
    setDirty(el.editor.value !== state.saved);
  }

  function indentSelection(outdent) {
    var ed = el.editor;
    var v = ed.value;
    var s = ed.selectionStart, e = ed.selectionEnd;
    var ls = v.lastIndexOf('\n', s - 1) + 1;
    var le = v.indexOf('\n', e);
    if (le < 0) le = v.length;
    var block = v.slice(ls, le);
    var lines = block.split('\n');
    var next = outdent
      ? lines.map(function (l) { return l.replace(/^( {1,2}|\t)/, ''); }).join('\n')
      : lines.map(function (l) { return l.length ? '  ' + l : l; }).join('\n');
    var delta = next.length - block.length;
    ed.focus({ preventScroll: true });
    ed.setSelectionRange(ls, le);
    ed.setRangeText(next, ls, le, 'end');
    ed.setSelectionRange(s + delta, e + delta);
    markDirtyFromValue();
    scheduleRender();
  }

  function autoIndentAfterNewline() {
    var ed = el.editor;
    var pos = ed.selectionStart;
    var v = ed.value;
    if (pos !== ed.selectionEnd) return;
    if (v.charAt(pos - 1) !== '\n') return;
    var ls = v.lastIndexOf('\n', pos - 2) + 1;
    var line = v.slice(ls, pos - 1);
    var m = /^([ \t]*)(?:([-*+]|\d+[.)])[ \t]+|(>)[ \t]?)?/.exec(line);
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
      var a = e.target.closest ? e.target.closest('a.anchor') : null;
      if (!a) return;
      e.preventDefault();
      var id = (a.getAttribute('href') || '').replace(/^#/, '');
      var item = state.toc.filter(function (t) { return t.id === id; })[0];
      jumpToLine(item ? item.line : currentLine(), id);
    });
    el.toc.addEventListener('click', function (e) {
      var a = e.target.closest ? e.target.closest('a') : null;
      if (!a || a.dataset.empty) return;
      e.preventDefault();
      var i = +a.dataset.i;
      var t = state.toc[i];
      if (t) jumpToLine(t.line, t.id);
    });
    var tf = $('tocFilter');
    if (tf) {
      tf.addEventListener('input', function () {
        state.tocFilter = tf.value;
        applyTocFilter();
        markActiveToc();
      });
    }
  }

  function wireDragDrop() {
    var depth = 0;
    function hasFiles(e) {
      var dt = e.dataTransfer;
      if (!dt) return false;
      if (dt.types) {
        for (var i = 0; i < dt.types.length; i++) if (dt.types[i] === 'Files') return true;
      }
      return false;
    }
    window.addEventListener('dragenter', function (e) {
      if (!hasFiles(e)) return;
      depth++;
      el.editorWrap.classList.add('dragover');
      e.preventDefault();
    });
    window.addEventListener('dragover', function (e) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });
    window.addEventListener('dragleave', function () {
      depth = Math.max(0, depth - 1);
      if (!depth) el.editorWrap.classList.remove('dragover');
    });
    window.addEventListener('drop', function (e) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      el.editorWrap.classList.remove('dragover');
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
    if (entries.length) {
      var folders = entries.filter(function (x) { return x.isDirectory; });
      var candidates = entries.filter(function (x) { return !x.isDirectory; });
      if (!candidates.length && folders.length) {
        findReadme(folders[0], 0).then(function (entry) {
          if (!entry) { toast('فایل README در پوشه پیدا نشد', 'error'); return; }
          openEntry(entry).then(function (file) {
            var base = new URL(file.name, 'file://' + entry.fullPath.replace(/[^/]+$/, '')).href;
            state.baseUrl = base;
            el.baseUrl.value = base;
            saveSettings();
            return readFile(file, null);
          });
        });
        return;
      }
    }
    var files = dt.files ? Array.prototype.slice.call(dt.files) : [];
    if (!files.length) return;
    var md = files.filter(isMarkdown);
    var pick = (md[0] || files[0]);
    if (items.length && items[0].getAsFileSystemHandle) {
      items[0].getAsFileSystemHandle().then(function (h) {
        return readFile(pick, h || null);
      }).catch(function () { readFile(pick, null); });
    } else {
      readFile(pick, null);
    }
  }

  function isMarkdown(f) {
    return /\.(md|markdown|mdown|mkd|mdwn|txt)$/i.test(f.name || '');
  }

  function findReadme(entry, depth) {
    if (depth > 3) return Promise.resolve(null);
    var reader = entry.createReader();
    return new Promise(function (resolve) {
      reader.readEntries(function (list) {
        if (!list.length) { resolve(null); return; }
        var dirs = [], files = [];
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
    return new Promise(function (resolve, reject) {
      entry.file(resolve, reject);
    });
  }

  function wireResizer() {
    var dragging = false;
    el.resizer.addEventListener('pointerdown', function (e) {
      dragging = true;
      el.resizer.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    el.resizer.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var rect = el.panes.getBoundingClientRect();
      if (!rect.width) return;
      var pct = (e.clientX - rect.left) / rect.width * 100;
      if (document.documentElement.dir === 'rtl') pct = 100 - pct;
      pct = clamp(pct, 15, 85);
      document.documentElement.style.setProperty('--split', pct.toFixed(2) + '%');
    });
    var stop = function (e) {
      if (!dragging) return;
      dragging = false;
      try { el.resizer.releasePointerCapture(e.pointerId); } catch (err) { void 0; }
    };
    el.resizer.addEventListener('pointerup', stop);
    el.resizer.addEventListener('pointercancel', stop);
    el.resizer.addEventListener('keydown', function (e) {
      var cur = parseFloat(document.documentElement.style.getPropertyValue('--split')) || 50;
      if (e.key === 'ArrowLeft') cur -= 3;
      else if (e.key === 'ArrowRight') cur += 3;
      else return;
      e.preventDefault();
      document.documentElement.style.setProperty('--split', clamp(cur, 15, 85) + '%');
    });
  }

  function wireMisc() {
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
      if (state.theme === 'auto') applyTheme();
    });
    window.addEventListener('resize', function () {
      el.gutterInner.style.transform = 'translateY(' + (-el.editor.scrollTop) + 'px)';
    });
    window.addEventListener('beforeunload', function (e) {
      if (!state.dirty) return;
      e.preventDefault();
      e.returnValue = '';
    });
    window.addEventListener('beforeprint', function () {
      el.previewScroll.scrollTop = 0;
    });
  }

  function boot() {
    loadSettings();
    applyTheme();
    applyFont();
    applyWrap();
    applyMode();
    applyDirButtons();
    el.baseUrl.value = state.baseUrl;
    $('btnSync').setAttribute('aria-pressed', state.sync ? 'true' : 'false');
    $('btnWrap').setAttribute('aria-pressed', state.wrap ? 'true' : 'false');

    wireToolbar();
    wireEditor();
    wirePreview();
    wireDragDrop();
    wireResizer();
    wireMisc();

    setDoc(SAMPLE, 'README.md', null);
    el.statusFile.textContent = 'نمونه آماده — فایلی باز کنید یا رها کنید';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.__rv = { state: state, render: render, el: el };
})();