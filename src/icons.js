/*
 * src/icons.js — the SVG icon set.
 *
 * One visual language for every glyph in the app: 24×24 grid, 1.75 stroke, round caps and joins,
 * `currentColor` so icons always inherit the theme. No icon fonts, no emoji, no external files.
 *
 *   RV.Icons.svg('save')        → full <svg> markup (decorative, hidden from AT)
 *   RV.Icons.svg('save', 20)    → sized
 *   RV.Icons.inject(root)       → fills every <i data-icon="name"> inside root
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.RV = root.RV || {}; root.RV.Icons = factory(); }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var ICONS = {
    logo: '<path d="M3 5h18v14H3z"/><path d="M7 15.5V9l3 3 3-3v6.5"/><path d="M17 9v4.5"/><path d="m15.2 12.2 1.8 2 1.8-2"/>',
    open: '<path d="M3 7a2 2 0 0 1 2-2h3.6a2 2 0 0 1 1.6.8l.9 1.2a2 2 0 0 0 1.6.8H19a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/>',
    saveAs: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M12 12v6"/><path d="M9 15h6"/>',
    reload: '<path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v5h-5"/>',
    download: '<path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M4 21h16"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.2a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .9-1 1.6v.4"/><path d="M12 17h.01"/>',
    close: '<path d="m6 6 12 12"/><path d="m18 6-12 12"/>',
    checkCircle: '<path d="M21.6 11.1V12a9.6 9.6 0 1 1-5.7-8.8"/><path d="m8.8 11.8 3 3L21.6 5"/>',
    copy: '<path d="M9 8h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z"/><path d="M5 16H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20.5 20.5-4.2-4.2"/>',
    toc: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3.5 6h.01"/><path d="M3.5 12h.01"/><path d="M3.5 18h.01"/>',
    eye: '<path d="M2.2 12S6 5.5 12 5.5 21.8 12 21.8 12 18 18.5 12 18.5 2.2 12 2.2 12"/><circle cx="12" cy="12" r="3"/>',
    code: '<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>',
    columns: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 3v18"/>',
    taskOn: '<path d="m9 11.5 2.6 2.6L21 4.5"/><path d="M20 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h10"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.9 4.9 1.4 1.4"/><path d="m17.7 17.7 1.4 1.4"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m4.9 19.1 1.4-1.4"/><path d="m17.7 6.3 1.4-1.4"/>',
    moon: '<path d="M20.5 13.3A8.5 8.5 0 1 1 10.7 3.5a6.8 6.8 0 0 0 9.8 9.8"/>',
    monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/>',
    minus: '<path d="M5 12h14"/>',
    plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
    wrap: '<path d="M3 6h18"/><path d="M3 18h7"/><path d="M3 12h13a3 3 0 0 1 0 6h-3"/><path d="m11 16-2 2 2 2"/>',
    sync: '<path d="M7 4v16"/><path d="m3.5 7.5 3.5-3.5 3.5 3.5"/><path d="M17 20V4"/><path d="m13.5 16.5 3.5 3.5 3.5-3.5"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18"/><path d="M3 12h18"/>',
    ltr: '<path d="M4 7h9"/><path d="M4 12h6"/><path d="M4 17h9"/><path d="M16 9.5h4"/><path d="m18 7 2.5 2.5L18 12"/>',
    rtl: '<path d="M11 7h9"/><path d="M14 12h6"/><path d="M11 17h9"/><path d="M4 9.5h4"/><path d="M6 7 3.5 9.5 6 12"/>',
    hash: '<path d="M4 9h16"/><path d="M4 15h16"/><path d="M10 3 8 21"/><path d="m16 3-2 18"/>',
    alert: '<path d="M10.3 3.9 1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4.5"/><path d="M12 8h.01"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6"/><path d="M9 17h4"/>',
    upload: '<path d="M4.5 15a7 7 0 1 1 11.3-5.6A4.4 4.4 0 0 1 19 18H7a4 4 0 0 1-2.5-3"/><path d="M12 12v9"/><path d="m8.5 15.5 3.5-3.5 3.5 3.5"/>',
  };

  function svg(name, size) {
    var body = ICONS[name];
    if (!body) return '';
    var px = size || 16;
    return '<svg class="ic" viewBox="0 0 24 24" width="' + px + '" height="' + px + '" fill="none" ' +
      'stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" ' +
      'aria-hidden="true" focusable="false">' + body + '</svg>';
  }

  function has(name) {
    return Object.prototype.hasOwnProperty.call(ICONS, name);
  }

  function names() {
    return Object.keys(ICONS);
  }

  /** Replace every `<i data-icon="…">` placeholder inside `root` with its SVG. */
  function inject(root) {
    if (!root || typeof root.querySelectorAll !== 'function') return 0;
    var nodes = root.querySelectorAll('i[data-icon]');
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      var markup = svg(node.getAttribute('data-icon'), +(node.getAttribute('data-size') || 16));
      if (!markup || !node.parentNode) continue;
      var holder = node.ownerDocument.createElement('span');
      holder.innerHTML = markup;
      var icon = holder.firstChild;
      if (node.className) icon.setAttribute('class', 'ic ' + node.className);
      node.parentNode.replaceChild(icon, node);
    }
    return nodes.length;
  }

  return { svg: svg, has: has, names: names, inject: inject };
}));
