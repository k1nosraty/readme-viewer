/* File previews share the workspace UI and keep document markup out of its DOM. */
(function (root) {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var XLINK_NS = 'http://www.w3.org/1999/xlink';
  var SVG_START = /^\s*(?:<\?xml\s[^?]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<(svg|symbol|defs)(?=[\s/>])/;

  function svgRoot(source) {
    var match = SVG_START.exec(source.slice(0, 8192));
    return match && match[1];
  }

  function kind(doc, source) {
    if (doc.format === 'code:html') return 'html';
    if (doc.format !== 'code:xml') return '';
    if (/\.(?:html?|xhtml)$/i.test(doc.name)) return 'html';
    return /\.svg$/i.test(doc.name) || svgRoot(source) ? 'svg' : '';
  }

  function svgGallery(source) {
    if (!/<symbol(?=[\s/>])/.test(source)) return null;
    var first = svgRoot(source);
    var fragment = first && first !== 'svg';
    var markup = fragment ? '<svg xmlns="' + SVG_NS + '" xmlns:xlink="' + XLINK_NS + '">' + source + '</svg>' : source;
    var parsed = new root.DOMParser().parseFromString(markup, 'image/svg+xml');
    var svg = parsed.documentElement;
    if (svg.localName !== 'svg' || svg.namespaceURI !== SVG_NS) return null;
    // Preserve the normal image when the file draws its own composition.
    if (Array.from(svg.children).some(function (child) {
      return /^(a|circle|ellipse|foreignObject|g|image|line|path|polygon|polyline|rect|svg|switch|text|use)$/.test(child.localName);
    })) return null;
    var symbols = Array.from(svg.getElementsByTagNameNS(SVG_NS, 'symbol'));
    if (!symbols.length) return null;

    var ids = new Set(Array.from(svg.querySelectorAll('[id]'), function (node) { return node.id; }));
    var nextId = 0;
    function uniqueId() {
      var id;
      do { id = 'rv-symbol-' + ++nextId; } while (ids.has(id));
      ids.add(id);
      return id;
    }
    var seen = new Set();
    var cell = 96, columns = Math.min(symbols.length, 16);
    svg.setAttribute('viewBox', '0 0 ' + columns * cell + ' ' + Math.ceil(symbols.length / columns) * cell);
    ['width', 'height', 'display', 'visibility', 'hidden'].forEach(function (attr) { svg.removeAttribute(attr); });
    svg.style.removeProperty('display');
    svg.style.removeProperty('visibility');
    var items = symbols.map(function (symbol, index) {
      var label = symbol.id;
      if (!label || seen.has(label)) symbol.id = uniqueId();
      seen.add(symbol.id);
      var x = String(index % columns * cell), y = String(Math.floor(index / columns) * cell);
      var view = parsed.createElementNS(SVG_NS, 'view');
      view.id = uniqueId();
      view.setAttribute('viewBox', [x, y, cell, cell].join(' '));
      svg.appendChild(view);
      var use = parsed.createElementNS(SVG_NS, 'use');
      use.setAttributeNS(XLINK_NS, 'xlink:href', '#' + encodeURIComponent(symbol.id));
      use.setAttribute('x', x);
      use.setAttribute('y', y);
      use.setAttribute('width', String(cell));
      use.setAttribute('height', String(cell));
      svg.appendChild(use);
      return { label: label, view: view.id };
    });
    return { markup: new root.XMLSerializer().serializeToString(svg), items: items };
  }

  function htmlDocument(source) {
    var page = root.DOMPurify.sanitize(source, {
      WHOLE_DOCUMENT: true,
      RETURN_DOM: true,
      ADD_TAGS: ['link'],
      FORBID_TAGS: ['base', 'meta', 'script', 'iframe', 'frame', 'object', 'embed'],
      FORBID_ATTR: ['action', 'formaction', 'ping', 'download', 'target']
    });
    page.querySelectorAll('link').forEach(function (link) {
      if ((link.getAttribute('rel') || '').toLowerCase() !== 'stylesheet') link.remove();
    });
    page.querySelectorAll('a, area').forEach(function (link) {
      ['href', 'xlink:href'].forEach(function (attr) {
        if (!(link.getAttribute(attr) || '').startsWith('#')) link.removeAttribute(attr);
      });
    });
    return '<!doctype html>' + page.outerHTML;
  }

  function create(doc, type, source, name, t, native, file) {
    var element = doc.createElement('div');
    element.className = 'visual-file';
    var stage = doc.createElement('div');
    stage.className = 'visual-file-stage visual-file-' + type;
    element.appendChild(stage);
    var hint = doc.createElement('p');
    hint.className = 'visual-file-message';
    hint.setAttribute('role', 'status');
    var disposed = false, zoomDialog, close = function () {};
    function openZoom(image, title, button) {
      zoomDialog = root.RV.Diagrams.zoomImage(image.src, title, button);
    }
    function message(key) {
      hint.textContent = t(key);
      stage.replaceChildren(hint);
    }
    function mountFrame(url) {
      var frame = doc.createElement('iframe');
      frame.setAttribute('sandbox', '');
      frame.setAttribute('referrerpolicy', 'no-referrer');
      frame.title = t('visual.previewOf', { name: name });
      frame.src = url;
      stage.replaceChildren(frame);
    }
    return {
      element: element,
      entries: [],
      mount: function () {
        if (type === 'svg') {
          var utf8 = source.replace(/^<\?xml\s[^?]*\?>/i, '');
          var gallery = svgGallery(utf8);
          // One shared SVG with a view per icon keeps definitions out of the workspace DOM.
          var url = root.URL.createObjectURL(new Blob([gallery ? gallery.markup : utf8], { type: 'image/svg+xml;charset=utf-8' }));
          close = function () { root.URL.revokeObjectURL(url); };
          if (gallery) {
            stage.classList.add('visual-svg-gallery');
            var list = doc.createElement('ul');
            list.setAttribute('aria-label', t('visual.symbolGallery'));
            gallery.items.forEach(function (item, index) {
              var tile = doc.createElement('li');
              var thumbnail = doc.createElement('button');
              thumbnail.type = 'button';
              thumbnail.className = 'visual-svg-thumb';
              var image = doc.createElement('img');
              image.alt = '';
              image.loading = 'lazy';
              image.decoding = 'async';
              image.src = url + '#' + item.view;
              thumbnail.appendChild(image);
              var caption = doc.createElement('bdi');
              caption.textContent = item.label || t('visual.symbol', { count: index + 1 });
              thumbnail.setAttribute('aria-label', t('visual.zoom', { name: caption.textContent }));
              thumbnail.addEventListener('click', function () { openZoom(image, caption.textContent, thumbnail); });
              tile.append(thumbnail, caption);
              list.appendChild(tile);
            });
            stage.appendChild(list);
          } else {
            var image = doc.createElement('img');
            image.alt = name;
            image.addEventListener('error', function () { message('visual.imageError'); }, { once: true });
            image.src = url;
            stage.appendChild(image);
            var expand = doc.createElement('button');
            expand.type = 'button';
            expand.className = 'btn btn-icon visual-svg-expand';
            expand.title = t('visual.zoom', { name: name });
            expand.setAttribute('aria-label', expand.title);
            expand.innerHTML = root.RV.Icons.svg('maximize', 16);
            expand.addEventListener('click', function () { openZoom(image, name, expand); });
            stage.appendChild(expand);
          }
          return;
        }
        if (source.length > 4 * 1024 * 1024) { message('visual.large'); return; }
        var page = htmlDocument(source);
        if (native && native.mountVisualPreview) {
          message('visual.loading');
          native.mountVisualPreview(page, file).then(function (preview) {
            if (disposed) { preview.close(); return; }
            close = preview.close;
            mountFrame(preview.url);
          }).catch(function () { if (!disposed) message('visual.htmlError'); });
        } else {
          var policy = '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:; font-src data:; base-uri \'none\'; form-action \'none\'">';
          mountFrame('data:text/html;charset=utf-8,' + encodeURIComponent(page.replace('<head>', '<head>' + policy)));
        }
      },
      dispose: function () {
        disposed = true;
        if (zoomDialog && zoomDialog.open) zoomDialog.close();
        close();
      }
    };
  }

  root.RV.VisualPreview = { isSvg: svgRoot, kind: kind, create: create };
}(window));
