/* Appearance preferences use local tokens; previews never alter document content. */
(function () {
  'use strict';
  var RV = window.RV = window.RV || {}, api, snapshot, returnFocus;
  var defaults = { accent: '#0969da', surface: 'neutral', density: 'comfortable', standardLinks: false };
  var presets = [['blue', '#0969da'], ['emerald', '#12805c'], ['teal', '#087f8c'], ['violet', '#8250df'],
    ['indigo', '#5364cf'], ['orange', '#ce620e'], ['rose', '#c93671'], ['copper', '#a45a37']];
  var palettes = {
    light: {
      neutral: ['#ffffff', '#f6f8fa', '#eaeef2', '#d1d9e0', '#dfe5ea', '#afb8c1'],
      warm: ['#fffdf8', '#f7f3eb', '#eee7dc', '#d9d1c5', '#e7e0d5', '#b8ad9e'],
      cool: ['#fbfdff', '#f0f5fb', '#e4edf6', '#cbd7e4', '#dde6f0', '#9fadc0']
    },
    dark: {
      neutral: ['#0d1117', '#161b22', '#010409', '#3d444d', '#2f353d', '#66707c'],
      warm: ['#171410', '#211d18', '#100e0b', '#4b4237', '#352f27', '#827462'],
      cool: ['#0c131d', '#141f2c', '#060c14', '#34465a', '#243447', '#627990']
    }
  };
  function byId(id) { return document.getElementById(id); }
  function hex(value) {
    value = String(value || '').trim();
    if (/^#[\da-f]{3}$/i.test(value)) value = '#' + value.slice(1).split('').map(function (c) { return c + c; }).join('');
    return /^#[\da-f]{6}$/i.test(value) ? value.toLowerCase() : null;
  }
  function normalize(value) {
    value = value && typeof value === 'object' ? value : {};
    return { accent: hex(value.accent) || defaults.accent,
      surface: ['warm', 'cool'].indexOf(value.surface) >= 0 ? value.surface : 'neutral',
      density: value.density === 'compact' ? 'compact' : 'comfortable', standardLinks: value.standardLinks === true };
  }
  var prefs = normalize(null);
  try { prefs = normalize(JSON.parse(localStorage.getItem('rv.appearance'))); } catch (e) { void 0; }
  function rgb(color) { return [1, 3, 5].map(function (i) { return parseInt(color.slice(i, i + 2), 16); }); }
  function mix(a, b, amount) {
    a = rgb(a); b = rgb(b);
    return '#' + a.map(function (value, i) { return Math.round(value + (b[i] - value) * amount).toString(16).padStart(2, '0'); }).join('');
  }
  function luminance(color) {
    var c = rgb(color).map(function (v) { v /= 255; return v <= .04045 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); });
    return .2126 * c[0] + .7152 * c[1] + .0722 * c[2];
  }
  function contrast(a, b) { a = luminance(a); b = luminance(b); return (Math.max(a, b) + .05) / (Math.min(a, b) + .05); }
  function readable(base, p, dark) {
    for (var i = 0; i <= 100; i++) {
      var color = mix(base, dark ? '#ffffff' : '#000000', i / 100);
      var selected = mix(p[0], color, dark ? .14 : .08);
      if ([p[0], p[1], p[2], selected].every(function (bg) { return contrast(color, bg) >= 4.5; })) return color;
    }
    return dark ? '#ffffff' : '#000000';
  }
  function apply() {
    var root = document.documentElement, dark = root.dataset.theme === 'dark';
    var p = palettes[dark ? 'dark' : 'light'][prefs.surface];
    var raw = dark && prefs.accent === defaults.accent ? '#4493f8' : prefs.accent;
    var accent = readable(raw, p, dark), vars = {
      '--accent': accent, '--accent-hover': mix(accent, dark ? '#ffffff' : '#000000', .1),
      '--accent-fg': contrast(accent, '#ffffff') >= contrast(accent, '#04121f') ? '#ffffff' : '#04121f',
      '--accent-subtle': mix(p[0], accent, dark ? .14 : .08),
      '--document-link': prefs.standardLinks ? readable(dark ? '#4493f8' : '#0969da', p, dark) : accent,
      '--fg-muted': readable(dark ? '#9198a1' : '#59636e', p, dark),
      '--fg-subtle': readable(dark ? '#7d8590' : '#6e7781', p, dark),
      '--code-bg': p[1], '--code-bar': mix(p[1], p[2], .5)
    };
    ['--bg', '--bg-subtle', '--bg-inset', '--border', '--border-muted', '--border-strong'].forEach(function (key, i) { vars[key] = p[i]; });
    Object.keys(vars).forEach(function (key) { root.style.setProperty(key, vars[key]); });
    root.dataset.surface = prefs.surface; root.dataset.density = prefs.density;
  }
  function fields() { return { theme: byId('appearanceTheme').value, font: Number(byId('appearanceFont').value),
    width: byId('appearanceWidth').value, spacing: byId('appearanceSpacing').value }; }
  function sync() {
    var state = api.get();
    byId('appearanceTheme').value = state.theme; byId('appearanceFont').value = state.font;
    byId('appearanceFontValue').textContent = state.font;
    byId('appearanceWidth').value = state.width; byId('appearanceSpacing').value = state.spacing;
    byId('appearanceSurface').value = prefs.surface; byId('appearanceDensity').value = prefs.density;
    byId('appearanceStandardLinks').checked = prefs.standardLinks;
    byId('accentPicker').value = prefs.accent; byId('accentHex').value = prefs.accent.toUpperCase();
    byId('accentHex').setAttribute('aria-invalid', 'false'); byId('accentError').hidden = true;
    byId('appearanceApply').disabled = false;
    document.querySelectorAll('[data-accent-preset]').forEach(function (button) { button.setAttribute('aria-pressed', button.getAttribute('data-accent-preset') === prefs.accent ? 'true' : 'false'); });
  }
  function preview(event) {
    var input = event.target, color = prefs.accent;
    if (input.id === 'accentHex' || input.id === 'accentPicker') {
      color = hex(input.value);
      byId('accentHex').setAttribute('aria-invalid', color ? 'false' : 'true');
      byId('accentError').hidden = !!color; byId('appearanceApply').disabled = !color;
      if (!color) return;
    }
    if (input.id !== 'accentHex') { byId('accentHex').setAttribute('aria-invalid', 'false'); byId('accentError').hidden = true; byId('appearanceApply').disabled = false; }
    prefs = { accent: color, surface: byId('appearanceSurface').value, density: byId('appearanceDensity').value,
      standardLinks: byId('appearanceStandardLinks').checked };
    api.preview(fields()); apply();
    // Keep partially entered HEX text intact while the user types.
    byId('accentPicker').value = prefs.accent;
    if (input.id !== 'accentHex') byId('accentHex').value = prefs.accent.toUpperCase();
    byId('appearanceFontValue').textContent = byId('appearanceFont').value;
    document.querySelectorAll('[data-accent-preset]').forEach(function (button) { button.setAttribute('aria-pressed', button.getAttribute('data-accent-preset') === prefs.accent ? 'true' : 'false'); });
  }
  function open(event) {
    if (snapshot) return;
    returnFocus = event && event.currentTarget || document.activeElement;
    if (returnFocus.closest && returnFocus.closest('.app-menu')) returnFocus = returnFocus.closest('.app-menu').querySelector('summary');
    if (RV.Shell) RV.Shell.close();
    byId('readingOptions').open = false;
    snapshot = { prefs: Object.assign({}, prefs), state: api.get() };
    byId('appearanceStorageError').hidden = true; sync();
    byId('appearancePanel').hidden = false; byId('appearanceScrim').hidden = false;
    byId('appearanceTheme').focus();
  }
  function close(cancel) {
    if (!snapshot) return;
    if (cancel) { prefs = snapshot.prefs; api.preview(snapshot.state); apply(); }
    snapshot = null;
    byId('appearancePanel').hidden = true; byId('appearanceScrim').hidden = true;
    if (returnFocus && returnFocus.isConnected) returnFocus.focus();
  }
  function init(callbacks) {
    api = callbacks;
    var list = byId('accentPresets');
    presets.forEach(function (preset) {
      var button = document.createElement('button'), dot = document.createElement('span'), label = document.createElement('span');
      button.type = 'button'; button.className = 'accent-preset'; button.setAttribute('data-accent-preset', preset[1]);
      dot.className = 'accent-dot'; dot.style.backgroundColor = preset[1]; dot.setAttribute('aria-hidden', 'true');
      label.setAttribute('data-i18n', 'appearance.' + preset[0]); label.textContent = RV.I18n.t('appearance.' + preset[0]);
      button.appendChild(dot); button.appendChild(label); list.appendChild(button);
      button.addEventListener('click', function () { prefs.accent = preset[1]; sync(); apply(); });
    });
    byId('btnAppearance').addEventListener('click', open);
    byId('appearancePanel').addEventListener('input', preview);
    byId('appearancePanel').addEventListener('change', preview);
    ['appearanceClose', 'appearanceCancel', 'appearanceScrim'].forEach(function (id) { byId(id).addEventListener('click', function () { close(true); }); });
    byId('appearanceReset').addEventListener('click', function () {
      prefs = normalize(defaults); api.preview({ theme: 'auto', font: 16, width: 'full', spacing: 'normal' }); sync(); apply();
    });
    byId('appearanceApply').addEventListener('click', function () {
      var previous = {};
      try {
        ['rv.appearance', 'rv.settings', 'rv.reading.options'].forEach(function (key) { previous[key] = localStorage.getItem(key); });
        if (!api.save()) throw new Error('storage');
        localStorage.setItem('rv.appearance', JSON.stringify(prefs)); close(false);
      } catch (e) {
        Object.keys(previous).forEach(function (key) { try { if (previous[key] === null) localStorage.removeItem(key); else localStorage.setItem(key, previous[key]); } catch (ignored) { void 0; } });
        byId('appearanceStorageError').hidden = false;
      }
    });
    document.addEventListener('keydown', function (event) {
      if (!snapshot) return;
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); close(true); return; }
      if (event.key !== 'Tab') return;
      var items = Array.prototype.filter.call(byId('appearancePanel').querySelectorAll('button, input, select'), function (node) { return !node.disabled; });
      var first = items[0], last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || !byId('appearancePanel').contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !byId('appearancePanel').contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    }, true);
    apply();
  }
  RV.Appearance = { init: init, apply: apply };
}());
