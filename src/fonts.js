/* Font choices use local families; only the optional OFL Vazirmatn face is bundled. */
(function () {
  'use strict';
  var RV = window.RV = window.RV || {};
  var fallback = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji"';
  var arabicRange = 'U+0600-06FF,U+0750-077F,U+08A0-08FF,U+FB50-FDFF,U+FE70-FEFF';
  var dataUrl = new URL('../vendor/fonts/vazirmatn.js', document.currentScript.src).href;
  var prefs = { latin: '', persian: '', ui: '' }, pending = Promise.resolve(), loading, generation = 0;
  var style = document.createElement('style'); style.id = 'document-font-faces'; document.head.appendChild(style);
  function valid(name) { return /^[\p{L}\p{N} ._-]{0,80}$/u.test(String(name || '')); }
  function normalize(value) {
    value = value || {};
    var out = {}; ['latin', 'persian', 'ui'].forEach(function (key) {
      var name = String(value[key] || '').trim(); out[key] = valid(name) ? name : '';
    }); return out;
  }
  function quoted(name) { return JSON.stringify(name); }
  function family(name) { return name === 'Vazirmatn' ? '"RV Vazirmatn"' : quoted(name); }
  function documentFamily(value) {
    value = value || prefs;
    return (value.persian ? '"RV Document Arabic", ' : '') + (value.latin ? family(value.latin) + ', ' : '') + fallback;
  }
  function needData() {
    if (RV.FontData) return Promise.resolve();
    if (!loading) loading = new Promise(function (resolve, reject) {
      var script = document.createElement('script'); script.src = dataUrl;
      script.onload = function () { script.remove(); if (RV.FontData) resolve(); else { loading = null; reject(new Error('font')); } };
      script.onerror = function () { script.remove(); loading = null; reject(new Error('font')); };
      document.head.appendChild(script);
    });
    return loading;
  }
  function faces(includeUi, value) {
    value = value || prefs;
    var useVazir = value.latin === 'Vazirmatn' || (includeUi && value.ui === 'Vazirmatn');
    var css = '';
    if (useVazir && RV.FontData) css += '@font-face{font-family:"RV Vazirmatn";src:url(' + quoted(RV.FontData) + ') format("woff2");font-weight:100 900;font-display:swap;}';
    if (value.persian) {
      var bundled = value.persian === 'Vazirmatn';
      if (!bundled || RV.FontData) css += '@font-face{font-family:"RV Document Arabic";src:' + (bundled ? 'url(' + quoted(RV.FontData) + ') format("woff2")' : 'local(' + quoted(value.persian) + ')') + ';' + (bundled ? 'font-weight:100 900;' : '') + 'unicode-range:' + arabicRange + ';font-display:swap;}';
    }
    return css;
  }
  function apply(value) {
    prefs = normalize(value); var current = ++generation;
    var root = document.documentElement;
    if (prefs.latin || prefs.persian) root.style.setProperty('--doc-font', documentFamily()); else root.style.removeProperty('--doc-font');
    if (prefs.ui) root.style.setProperty('--ui-font', family(prefs.ui) + ', var(--sans)'); else root.style.removeProperty('--ui-font');
    var needs = Object.keys(prefs).some(function (key) { return prefs[key] === 'Vazirmatn'; });
    pending = (needs ? needData() : Promise.resolve()).then(async function () {
      if (current !== generation) return;
      style.textContent = faces(true);
      if (document.fonts && document.fonts.load) {
        await Promise.all([document.fonts.load('16px ' + documentFamily(), 'Hello سلام'),
          document.fonts.load('16px ' + (prefs.ui ? family(prefs.ui) : 'sans-serif'), 'Hello سلام')]);
      }
      if (current !== generation) return;
      document.dispatchEvent(new CustomEvent('rv:fonts-layout'));
    }).catch(function () {
      if (current !== generation) return;
      style.textContent = faces(true);
      document.dispatchEvent(new CustomEvent('rv:fonts-layout'));
    });
    return pending;
  }
  var probes = new Map();
  function available(name) {
    if (!name || name === 'Vazirmatn') return Promise.resolve(true);
    if (!window.FontFace) return Promise.resolve(null);
    if (probes.size >= 64) probes.delete(probes.keys().next().value);
    if (!probes.has(name)) probes.set(name, new FontFace('rv-local-probe', 'local(' + quoted(name) + ')').load().then(function () { return true; }, function () { return false; }));
    return probes.get(name);
  }
  async function installedFamilies() {
    if (RV.Native && RV.Native.available() && RV.Native.installedFontFamilies) {
      return RV.Native.installedFontFamilies();
    }
    if (typeof window.queryLocalFonts !== 'function') return [];
    return (await window.queryLocalFonts()).map(function (face) { return face.family; });
  }
  // System font files remain on the user's device; only our freely licensed face is embedded.
  function exportCss(value) { var state = value || prefs; return faces(false, state) + ((state.latin || state.persian) ? '\nbody{font-family:' + documentFamily(state) + ';}' : ''); }
  function svgFonts(svg) {
    if (!prefs.latin && !prefs.persian) return;
    var node = svg.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'style'); node.textContent = faces(false); svg.insertBefore(node, svg.firstChild);
    // SVG images cannot access the app's web-font aliases, so local Arabic choices use their real family.
    if (prefs.persian && prefs.persian !== 'Vazirmatn') {
      var walker = svg.ownerDocument.createTreeWalker(svg, 4), nodes = [], text;
      while ((text = walker.nextNode())) if (text.parentElement.closest('text, tspan')) nodes.push(text);
      nodes.forEach(function (text) {
        if (!/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(text.textContent)) return;
        var fragment = svg.ownerDocument.createDocumentFragment();
        text.textContent.split(/([\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]+)/).filter(Boolean).forEach(function (run) {
          var span = svg.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'tspan');
          span.style.fontFamily = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(run) ? family(prefs.persian) + ', ' + fallback : (prefs.latin ? family(prefs.latin) + ', ' : '') + fallback;
          span.textContent = run; fragment.appendChild(span);
        });
        text.parentNode.replaceChild(fragment, text);
      });
    }
  }
  RV.Fonts = { normalize: normalize, valid: valid, apply: apply, ready: function () { return pending; },
    snapshot: function () { return Object.assign({}, prefs); }, key: function () { return JSON.stringify([prefs.latin, prefs.persian]); },
    available: available, installedFamilies: installedFamilies, exportCss: exportCss, svgFonts: svgFonts, family: documentFamily };
}());
