/* Keep the locally bundled PDF reader in its own document and keyboard scope. */
(function (root) {
  'use strict';

  function create(doc, bytes, options) {
    var element = doc.createElement('div');
    element.className = 'pdf-view';
    var frame = doc.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    frame.setAttribute('referrerpolicy', 'no-referrer');
    element.appendChild(frame);
    var reader, started = false, ready = false, disposed = false;

    function setChrome(chrome) {
      options = Object.assign({}, options, chrome);
      frame.title = options.translate('visual.previewOf', { name: options.name });
      if (reader) reader.setChrome(options);
    }

    function showError() {
      var error = doc.createElement('p');
      error.className = 'pdf-view-error';
      error.setAttribute('role', 'status');
      error.textContent = options.translate('pdf.openError');
      element.replaceChildren(error);
    }

    frame.addEventListener('load', function () {
      if (!started || disposed || frame.contentWindow.location.href === 'about:blank') return;
      reader = frame.contentWindow.RVPdfReader;
      if (!reader) { showError(); return; }
      reader.open(bytes, options).then(function () {
        if (disposed) return;
        ready = true;
        if (options.onReady) options.onReady();
      }).catch(function () { /* The embedded reader already displays the error. */ });
    });

    setChrome(options);
    return {
      element: element,
      entries: [],
      get ready() { return ready; },
      setChrome: setChrome,
      mount: function () {
        if (started) return;
        started = true;
        frame.src = new URL('pdf/index.html', doc.baseURI).href;
      },
      openFind: function () { if (ready) reader.openFind(); },
      serialize: function () { return reader.serialize(); },
      releaseSave: function () { if (reader) reader.releaseSave(); },
      dispose: function () {
        disposed = true;
        reader = null;
        element.remove();
      }
    };
  }

  root.RV.PdfPreview = { create: create };
}(window));
