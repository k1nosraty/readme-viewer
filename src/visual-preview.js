/* File previews share the workspace UI and keep document markup out of its DOM. */
(function (root) {
  'use strict';

  function kind(doc) {
    if (doc.format === 'code:xml' && /\.svg$/i.test(doc.name)) return 'svg';
    if (doc.format === 'code:html' || doc.format === 'code:xml' && /\.(?:html?|xhtml)$/i.test(doc.name)) return 'html';
    return '';
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
    var disposed = false, close = function () {};
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
          var image = doc.createElement('img');
          image.alt = name;
          image.addEventListener('error', function () { message('visual.imageError'); }, { once: true });
          // Image context disables SVG scripting and keeps its vector coordinates intact.
          var utf8 = source.replace(/^<\?xml\s[^?]*\?>/i, '');
          var url = root.URL.createObjectURL(new Blob([utf8], { type: 'image/svg+xml;charset=utf-8' }));
          close = function () { root.URL.revokeObjectURL(url); };
          image.src = url;
          stage.appendChild(image);
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
      dispose: function () { disposed = true; close(); }
    };
  }

  root.RV.VisualPreview = { kind: kind, create: create };
}(window));
