/* Offline Mermaid rendering. SVG is displayed as an image so diagram CSS cannot style the app. */
(function (root) {
  'use strict';
  var RV = root.RV = root.RV || {};
  var loading, queue = Promise.resolve(), serial = 0;
  var layouts = new Map();
  var jobs = new WeakMap(), cache = new Map(), cacheBytes = 0;
  var scriptUrl = new URL('../vendor/mermaid/mermaid.full.js', document.currentScript.src).href;
  function t(key) { return RV.I18n.t('diagram.' + key); }
  function load() {
    if (root.mermaid) return Promise.resolve(root.mermaid);
    if (!loading) loading = new Promise(function (resolve, reject) {
      var script = document.createElement('script'); script.src = scriptUrl;
      script.onload = function () { script.remove(); root.mermaid ? resolve(root.mermaid) : reject(new Error(t('unavailable'))); };
      script.onerror = function () { script.remove(); loading = null; reject(new Error(t('unavailable'))); };
      document.head.appendChild(script);
    });
    return loading;
  }
  function button(label, action) {
    var node = document.createElement('button'); node.type = 'button'; node.textContent = label;
    node.addEventListener('click', function (event) { event.preventDefault(); event.stopPropagation(); action(node); });
    return node;
  }
  function iconButton(key, icon, action) {
    var label = t(key), node = button(label, action);
    node.className = 'diagram-icon'; node.setAttribute('aria-label', label); node.title = label;
    node.innerHTML = RV.Icons.svg(icon, 16); return node;
  }
  function imageUrl(svg) { return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); }
  function save(svg, owner) {
    Promise.resolve(RV.Diagrams.download(svg, 'diagram.svg', 'image/svg+xml;charset=utf-8')).catch(function (error) {
      if (error && error.name === 'AbortError') return;
      root.RVApp.toast(RV.I18n.t('error.save', { name: 'diagram.svg', reason: error.message || String(error) }), 'error');
    });
    if (owner) owner.focus();
  }
  function safeSvg(raw, math) {
    var clean = root.DOMPurify.sanitize(raw, {
      USE_PROFILES: { svg: true, svgFilters: true, html: math, mathMl: math },
      ADD_TAGS: math ? ['style', 'foreignObject'] : ['style'],
      HTML_INTEGRATION_POINTS: math ? { foreignobject: true } : {},
      FORBID_TAGS: (math ? [] : ['foreignObject']).concat(['image', 'img', 'a', 'script', 'animate', 'animateTransform', 'set',
        'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select', 'audio', 'video', 'link', 'meta', 'base', 'annotation-xml']),
      FORBID_ATTR: ['href', 'xlink:href', 'src', 'srcset'], ALLOW_DATA_ATTR: false, RETURN_DOM_FRAGMENT: true
    });
    var svg = clean.firstElementChild;
    if (!svg || svg.localName !== 'svg') throw new Error(t('invalid'));
    // Math labels need XHTML wrappers and native MathML, but no arbitrary HTML or resources.
    if (math) Array.prototype.forEach.call(svg.querySelectorAll('foreignObject'), function (label) {
      var htmlTags = ['div', 'span', 'p', 'br', 'strong', 'em', 'b', 'i'];
      var mathTags = ['math', 'mrow', 'mi', 'mn', 'mo', 'msup', 'msub', 'msubsup', 'mfrac', 'msqrt', 'mroot',
        'mover', 'munder', 'munderover', 'mtable', 'mtr', 'mtd', 'mstyle', 'mspace', 'mpadded', 'mphantom',
        'menclose', 'semantics', 'mtext', 'none', 'mmultiscripts', 'mprescripts'];
      Array.prototype.forEach.call(label.querySelectorAll('*'), function (node) {
        var allowed = node.namespaceURI === 'http://www.w3.org/1998/Math/MathML' ? mathTags :
          node.namespaceURI === 'http://www.w3.org/1999/xhtml' ? htmlTags : [];
        if (allowed.indexOf(node.localName) < 0) node.remove();
      });
    });
    // No external resources in a downloaded SVG either; local paint/marker references are preserved.
    function localCss(value) {
      return value.replace(/@import[^;]*;?/gi, '').replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, function (_, quote, target) {
        return /^#[\w:.-]+$/.test(target.trim()) ? 'url(' + target.trim() + ')' : 'none';
      });
    }
    Array.prototype.forEach.call(svg.querySelectorAll('*'), function (node) {
      if (node.localName === 'style') node.textContent = localCss(node.textContent);
      Array.prototype.forEach.call(node.attributes, function (attr) {
        if (/\burl\s*\(/i.test(attr.value)) node.setAttribute(attr.name, localCss(attr.value));
      });
    });
    var box = (svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
    if (box.length === 4 && box.every(Number.isFinite) && box[2] > 0 && box[3] > 0 && box[2] <= 100000 && box[3] <= 100000) {
      svg.setAttribute('width', box[2]); svg.setAttribute('height', box[3]);
    }
    if (RV.Fonts) RV.Fonts.svgFonts(svg);
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    return new XMLSerializer().serializeToString(svg);
  }
  function remember(key, svg) {
    if (svg.length > 2 * 1024 * 1024) return;
    while (cache.size && (cache.size >= 24 || cacheBytes + svg.length > 2 * 1024 * 1024)) {
      var oldest = cache.keys().next().value; cacheBytes -= cache.get(oldest).length; cache.delete(oldest);
    }
    cache.set(key, svg); cacheBytes += svg.length;
  }
  function zoomImage(url, title, trigger, onSave) {
    var dialog = document.createElement('dialog'); dialog.className = 'diagram-dialog';
    dialog.setAttribute('aria-label', title);
    var tools = document.createElement('div'); tools.className = 'diagram-tools';
    var frame = document.createElement('div'); frame.className = 'diagram-canvas'; frame.tabIndex = 0;
    frame.setAttribute('aria-label', t('pan'));
    var img = document.createElement('img'); img.src = url; img.alt = title; img.draggable = false;
    frame.appendChild(img); var zoom = 1;
    function resize(value) {
      zoom = Math.max(.25, Math.min(4, value));
      img.style.width = (zoom * 100) + '%'; img.style.maxWidth = 'none';
      reset.textContent = Math.round(zoom * 100) + '%';
    }
    var reset = button('100%', function () { resize(1); }); reset.title = t('reset');
    tools.appendChild(button(t('out'), function () { resize(zoom - .25); }));
    tools.appendChild(reset);
    tools.appendChild(button(t('in'), function () { resize(zoom + .25); }));
    if (onSave) tools.appendChild(button(t('save'), onSave));
    var close = button(t('close'), function () { dialog.close(); }); tools.appendChild(close);
    dialog.appendChild(tools); dialog.appendChild(frame); document.body.appendChild(dialog);
    dialog.addEventListener('close', function () { dialog.remove(); if (trigger.isConnected) trigger.focus(); });
    // Capture prevents the editor's global shortcuts from changing the document behind this dialog.
    function keys(event) {
      if (!dialog.open) return;
      if (event.key === 'Escape') { event.preventDefault(); dialog.close(); }
      if (!event.ctrlKey && !event.metaKey && !event.altKey && ['+', '=', '-', '0'].includes(event.key)) {
        event.preventDefault();
        resize(event.key === '0' ? 1 : zoom + (event.key === '-' ? -.25 : .25));
      }
      if (event.key === 'Tab') {
        var items = dialog.querySelectorAll('button, [tabindex="0"]'), first = items[0], last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
      event.stopImmediatePropagation();
    }
    document.addEventListener('keydown', keys, true);
    dialog.addEventListener('close', function () { document.removeEventListener('keydown', keys, true); });
    dialog.showModal(); close.focus();
    return dialog;
  }
  function show(block, svg, source) {
    var figure = document.createElement('figure'); figure.className = 'diagram-figure'; figure.dir = 'ltr';
    var img = document.createElement('img'); img.src = imageUrl(svg); img.alt = t('title');
    figure.appendChild(img);
    var tools = document.createElement('div'); tools.className = 'diagram-tools';
    var codeBar = block.querySelector('.code-bar');
    tools.appendChild(iconButton('source', 'code', function (node) {
      source.hidden = !source.hidden; if (codeBar) codeBar.hidden = source.hidden;
      node.setAttribute('aria-expanded', String(!source.hidden));
      block.dispatchEvent(new CustomEvent('rv:diagram-layout', { bubbles: true }));
    })); tools.firstChild.setAttribute('aria-expanded', 'false');
    tools.appendChild(iconButton('expand', 'maximize', function (node) { zoomImage(img.src, t('title'), node, function (owner) { save(svg, owner); }); }));
    tools.appendChild(iconButton('save', 'download', function (node) { save(svg, node); }));
    var selector = document.createElement('select'); selector.setAttribute('aria-label', t('layout'));
    [['dagre', 'Dagre'], ['elk', 'ELK']].forEach(function (item) { var option = document.createElement('option'); option.value = item[0]; option.textContent = item[1]; selector.appendChild(option); });
    selector.value = block.getAttribute('data-diagram-layout') || layouts.get(source.textContent) || 'dagre';
    selector.addEventListener('change', function () {
      if (layouts.size >= 24) layouts.delete(layouts.keys().next().value);
      layouts.set(source.textContent, selector.value);
      var focused = document.activeElement === selector;
      block.setAttribute('data-diagram-layout', selector.value);
      render(block.parentNode).then(function () {
        if (focused && document.activeElement === document.body && block.isConnected) block.querySelector('.diagram-layout select').focus();
      });
    });
    if (/^\s*(?:flowchart|graph)\b/.test(source.textContent)) {
      var label = document.createElement('label'); label.className = 'diagram-layout';
      label.innerHTML = RV.Icons.svg('diagramLayout', 16);
      selector.title = t('layout') + ': ' + (selector.value === 'elk' ? 'ELK' : 'Dagre');
      label.appendChild(selector); tools.appendChild(label);
    }
    figure.appendChild(tools); block.appendChild(figure);
    if (codeBar) { codeBar.hidden = true; block.appendChild(codeBar); }
    block.appendChild(source); source.hidden = true;
    block.classList.add('diagram-rendered'); block.removeAttribute('aria-busy');
  }
  function render(container) {
    if (!container) return Promise.resolve();
    var connected = container.isConnected;
    var theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'default';
    var font = getComputedStyle(document.querySelector('.markdown-body') || document.body).fontFamily;
    var tasks = Array.prototype.map.call(container.querySelectorAll('.code-block[data-lang="mermaid"]'), function (block) {
      var source = block.querySelector('pre'), code = source && source.querySelector('code');
      if (!code) return Promise.resolve();
      var text = code.textContent;
      var math = /\$\$[\s\S]*?\$\$/.test(text);
      var layout = block.getAttribute('data-diagram-layout') || layouts.get(text) || 'dagre';
      var key = JSON.stringify([theme, font, text, RV.I18n.getLocale(), layout, RV.Fonts ? RV.Fonts.key() : '']);
      var existing = jobs.get(block);
      if (existing && existing.key === key) return existing.promise;
      block.querySelectorAll('.diagram-figure, .diagram-tools, .diagram-message').forEach(function (node) { node.remove(); });
      block.classList.remove('diagram-rendered'); source.hidden = false;
      var codeBar = block.querySelector('.code-bar'); if (codeBar) codeBar.hidden = false;
      block.setAttribute('aria-busy', 'true');
      var job = { key: key }; jobs.set(block, job);
      var work = queue.then(async function () {
        if (jobs.get(block) !== job || (connected && !block.isConnected)) return;
        var svg = cache.get(key);
        if (!svg) {
          if (text.length > 50000) throw new Error(t('large'));
          if (/%%\s*\{/.test(text) || /^\s*---/.test(text)) throw new Error(t('config'));
          if (/(?:url\s*\(|@import|<\s*(?:img|image|iframe|script|style)\b|\bimg\s*:)/i.test(text) ||
              /(?:^|[;\n])\s*(?:classDef|style|linkStyle)\b[^\n]*[{}<>\\@]/i.test(text)) throw new Error(t('resources'));
          if (math && typeof root.MathMLElement === 'undefined') throw new Error(t('mathUnsupported'));
          if (RV.Fonts) await RV.Fonts.ready();
          var mermaid = await load();
          if (jobs.get(block) !== job || (connected && !block.isConnected)) return;
          mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: theme, fontFamily: font, layout: layout,
            htmlLabels: math, flowchart: { htmlLabels: math }, maxTextSize: 50000, maxEdges: 500,
            suppressErrorRendering: true });
          var stage = document.createElement('div'); stage.className = 'diagram-stage'; stage.dir = 'ltr';
          stage.setAttribute('aria-hidden', 'true'); document.body.appendChild(stage);
          try { svg = safeSvg((await mermaid.render('rv-diagram-' + (++serial), text, stage)).svg, math); }
          finally { stage.remove(); }
          remember(key, svg);
        }
        if (jobs.get(block) === job && (!connected || block.isConnected)) show(block, svg, source);
      }).catch(function (error) {
        if (jobs.get(block) !== job || (connected && !block.isConnected)) return;
        block.removeAttribute('aria-busy');
        var message = document.createElement('p'); message.className = 'diagram-message'; message.setAttribute('role', 'status');
        message.textContent = t('error') + ' ' + (error.message || t('invalid')).slice(0, 400);
        block.appendChild(message);
      }).then(function () {
        if (block.isConnected) block.dispatchEvent(new CustomEvent('rv:diagram-layout', { bubbles: true }));
      });
      job.promise = work; queue = work; return work;
    });
    return Promise.all(tasks);
  }
  function cleanExport(container) {
    container.querySelectorAll('.diagram-tools, .diagram-message').forEach(function (node) { node.remove(); });
    container.querySelectorAll('[aria-busy]').forEach(function (node) { node.removeAttribute('aria-busy'); });
  }
  RV.Diagrams = { render: render, cleanExport: cleanExport, zoomImage: zoomImage, download: null };
}(typeof self !== 'undefined' ? self : this));
