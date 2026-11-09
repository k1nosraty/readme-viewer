/* Appearance preferences use local tokens; previews never alter document content. */
(function () {
  'use strict';
  var RV = window.RV = window.RV || {}, api, snapshot, returnFocus;
  var fontFields = ['fontLatin', 'fontPersian', 'fontUi'];
  var fontCatalog = [], fontKeys = new Set(), fontLoad, fontInput, suggestions, selectedFont = 0, fontPreviewTimer;
  var defaults = { accent: '#0969da', surface: 'neutral', density: 'comfortable', standardLinks: false, fonts: { latin: '', persian: '', ui: '' } };
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
      density: value.density === 'compact' ? 'compact' : 'comfortable', standardLinks: value.standardLinks === true, fonts: RV.Fonts.normalize(value.fonts) };
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
    RV.Fonts.apply(prefs.fonts);
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
    fontFields.forEach(function (id) {
      var input = byId(id);
      input.value = prefs.fonts[id.slice(4).toLowerCase()];
      syncFontChoice(input);
    });
    validateFonts(); fontStatus();
    document.querySelectorAll('[data-accent-preset]').forEach(function (button) { button.setAttribute('aria-pressed', button.getAttribute('data-accent-preset') === prefs.accent ? 'true' : 'false'); });
  }
  function syncFontChoice(input) {
    var choice = byId(input.id + 'Choice');
    var preset = Array.prototype.some.call(choice.options, function (option) { return option.value !== '__custom__' && option.value === input.value; });
    choice.value = preset ? input.value : '__custom__'; input.hidden = preset;
  }
  function fontKey(name) { return name.normalize('NFKC').toLowerCase(); }
  function loadFontCatalog() {
    if (fontLoad) return;
    fontLoad = RV.Fonts.installedFamilies().catch(function () { return []; }).then(function (names) {
      if (names.length) return names;
      var choices = Array.from(document.querySelectorAll('.font-choice option'), function (option) { return option.value; });
      var namesToCheck = Array.from(new Set(choices.filter(function (name) { return name && name !== '__custom__'; })));
      return Promise.all(namesToCheck.map(function (name) {
        return RV.Fonts.available(name).then(function (installed) { return installed ? name : ''; });
      }));
    }).then(function (names) {
      names.concat('Vazirmatn').filter(function (name) { return name && RV.Fonts.valid(name); })
        .sort(function (a, b) { return a.length - b.length || a.localeCompare(b); }).forEach(function (name) {
          var key = fontKey(name);
          if (fontKeys.has(key)) return;
          fontKeys.add(key);
          fontCatalog.push({ name: name, key: key });
        });
      if (fontInput) showFontSuggestions(fontInput);
      if (snapshot) fontStatus();
    }).catch(function () { fontLoad = null; });
  }
  function closeFontSuggestions() {
    if (!fontInput) return;
    fontInput.setAttribute('aria-expanded', 'false');
    fontInput.removeAttribute('aria-activedescendant');
    fontInput = null;
    suggestions.hidden = true;
  }
  function positionFontSuggestions() {
    if (suggestions.hidden) return;
    var panel = byId('appearancePanel');
    if (!panel.clientWidth) return;
    var input = fontInput.getBoundingClientRect(), frame = panel.getBoundingClientRect();
    var body = panel.querySelector('.appearance-body').getBoundingClientRect();
    if (input.bottom <= body.top || input.top >= body.bottom) { closeFontSuggestions(); return; }
    var width = Math.min(Math.max(input.width, 216), frame.width - 16);
    var left = document.documentElement.dir === 'rtl' ? input.right - width : input.left;
    suggestions.style.width = width + 'px';
    suggestions.style.left = Math.max(8, Math.min(left - frame.left, frame.width - width - 8)) - panel.clientLeft + 'px';
    var below = frame.bottom - input.bottom - 12, above = input.top - frame.top - 12;
    var openAbove = below < Math.min(220, suggestions.scrollHeight) && above > below;
    suggestions.style.maxHeight = Math.max(0, Math.min(220, openAbove ? above : below)) + 'px';
    var top = openAbove ? input.top - suggestions.offsetHeight - 4 : input.bottom + 4;
    suggestions.style.top = top - frame.top - panel.clientTop + 'px';
  }
  function selectFontSuggestion(index) {
    var previous = suggestions.children[selectedFont], option = suggestions.children[index];
    if (previous) previous.setAttribute('aria-selected', 'false');
    selectedFont = index;
    option.setAttribute('aria-selected', 'true');
    fontInput.setAttribute('aria-activedescendant', option.id);
    var list = suggestions.getBoundingClientRect(), row = option.getBoundingClientRect();
    if (row.top < list.top) suggestions.scrollTop -= list.top - row.top;
    else if (row.bottom > list.bottom) suggestions.scrollTop += row.bottom - list.bottom;
  }
  function showFontSuggestions(input) {
    fontInput = input;
    var query = fontKey(input.value.trim()), starts = [], contains = [], limit = 8;
    if (query) {
      for (var entry of fontCatalog) {
        if (entry.key.startsWith(query)) {
          starts.push(entry.name);
          if (starts.length === limit) break;
        } else if (contains.length < limit && entry.key.includes(query)) contains.push(entry.name);
      }
    }
    var matches = starts.concat(contains.slice(0, limit - starts.length));
    var items = document.createDocumentFragment();
    matches.forEach(function (name, index) {
      var option = document.createElement('div');
      option.id = 'fontSuggestion-' + index;
      option.setAttribute('role', 'option');
      option.dir = 'auto'; option.textContent = name; option.title = name;
      items.appendChild(option);
    });
    suggestions.textContent = '';
    suggestions.appendChild(items);
    suggestions.hidden = !matches.length;
    input.setAttribute('aria-expanded', String(!!matches.length));
    input.removeAttribute('aria-activedescendant');
    if (!matches.length) return;
    suggestions.scrollTop = 0;
    positionFontSuggestions();
    if (!suggestions.hidden) selectFontSuggestion(0);
  }
  function acceptFontSuggestion(option) {
    var input = fontInput;
    input.value = option.textContent;
    closeFontSuggestions();
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function fontSuggestionKey(event) {
    if (suggestions.hidden || event.target !== fontInput) return false;
    var count = suggestions.children.length;
    if (event.key === 'Enter') acceptFontSuggestion(suggestions.children[selectedFont]);
    else if (event.key === 'Escape') closeFontSuggestions();
    else if (event.key === 'ArrowDown') selectFontSuggestion((selectedFont + 1) % count);
    else if (event.key === 'ArrowUp') selectFontSuggestion((selectedFont + count - 1) % count);
    else return false;
    event.preventDefault();
    return true;
  }
  function wireFontChoices() {
    suggestions = byId('fontSuggestions');
    fontFields.forEach(function (id) {
      var input = byId(id), choice = byId(id + 'Choice');
      input.setAttribute('role', 'combobox');
      input.setAttribute('aria-autocomplete', 'list');
      input.setAttribute('aria-controls', suggestions.id);
      input.setAttribute('aria-expanded', 'false');
      input.addEventListener('focus', function () { loadFontCatalog(); showFontSuggestions(input); });
      input.addEventListener('input', function (event) {
        if (!event.isComposing && document.activeElement === input) showFontSuggestions(input);
      });
      input.addEventListener('compositionstart', closeFontSuggestions);
      input.addEventListener('compositionend', function () { showFontSuggestions(input); });
      input.addEventListener('blur', function () {
        if (fontInput === input) closeFontSuggestions();
        if (fontPreviewTimer) applyFontPreview();
      });
      function change(event) {
        if (choice.value === '__custom__') {
          if (input.hidden) input.value = '';
          input.hidden = false;
          if (event.type === 'change') input.focus();
        } else { input.value = choice.value; input.hidden = true; }
      }
      choice.addEventListener('input', change); choice.addEventListener('change', change);
    });
    suggestions.addEventListener('mousedown', function (event) {
      if (event.target.closest('[role="option"]')) event.preventDefault();
    });
    suggestions.addEventListener('click', function (event) {
      var option = event.target.closest('[role="option"]');
      if (fontInput && option) acceptFontSuggestion(option);
    });
    byId('appearancePanel').querySelector('.appearance-body').addEventListener('scroll', positionFontSuggestions, { passive: true });
    window.addEventListener('resize', positionFontSuggestions);
  }
  function fontValues() { return { latin: byId('fontLatin').value.trim(), persian: byId('fontPersian').value.trim(), ui: byId('fontUi').value.trim() }; }
  function validateFonts() {
    var valid = true;
    fontFields.forEach(function (id) {
      var ok = RV.Fonts.valid(byId(id).value.trim()); byId(id).setAttribute('aria-invalid', String(!ok)); if (!ok) valid = false;
    });
    byId('fontError').hidden = valid;
    byId('appearanceApply').disabled = !valid || !hex(byId('accentHex').value);
    return valid;
  }
  var statusVersion = 0;
  function fontStatus() {
    var version = ++statusVersion, values = fontValues();
    Promise.all(Object.keys(values).map(function (key) {
      var name = values[key];
      if (!name || !RV.Fonts.valid(name)) return '';
      var installed = fontKeys.has(fontKey(name)) ? Promise.resolve(true) : RV.Fonts.available(name);
      return installed.then(function (available) {
        return name + ': ' + RV.I18n.t('fonts.' + (name === 'Vazirmatn' ? 'included' : available === true ? 'installed' : available === false ? 'missing' : 'unknown'));
      });
    })).then(function (items) { if (version === statusVersion) byId('fontStatus').textContent = items.filter(Boolean).filter(function (item, index, all) { return all.indexOf(item) === index; }).join(' · '); });
  }
  function applyFontPreview() {
    clearTimeout(fontPreviewTimer); fontPreviewTimer = 0;
    if (!validateFonts()) return;
    var fonts = RV.Fonts.normalize(fontValues());
    if (Object.keys(fonts).some(function (key) { return fonts[key] !== prefs.fonts[key]; })) {
      prefs.fonts = fonts;
      RV.Fonts.apply(fonts);
    }
    fontStatus();
  }
  function preview(event) {
    if (event.isComposing || !validateFonts()) return;
    var input = event.target, color = prefs.accent;
    if (/^font(?:Latin|Persian|Ui)(?:Choice)?$/.test(input.id)) {
      var customInput = fontFields.indexOf(input.id) >= 0;
      if (customInput && byId(input.id + 'Choice').value !== '__custom__') syncFontChoice(input);
      if (customInput && event.type === 'input' && document.activeElement === input && !fontKeys.has(fontKey(input.value.trim()))) {
        // Paint suggestions immediately and keep incomplete names out of the live workspace while typing.
        clearTimeout(fontPreviewTimer);
        fontPreviewTimer = setTimeout(applyFontPreview, 140);
      } else applyFontPreview();
      return;
    }
    if (input.id === 'accentHex' || input.id === 'accentPicker') {
      color = hex(input.value);
      byId('accentHex').setAttribute('aria-invalid', color ? 'false' : 'true');
      byId('accentError').hidden = !!color; byId('appearanceApply').disabled = !color;
      if (!color) return;
    }
    if (input.id !== 'accentHex') { byId('accentHex').setAttribute('aria-invalid', 'false'); byId('accentError').hidden = true; byId('appearanceApply').disabled = false; }
    prefs = { accent: color, surface: byId('appearanceSurface').value, density: byId('appearanceDensity').value,
      standardLinks: byId('appearanceStandardLinks').checked, fonts: RV.Fonts.normalize(fontValues()) };
    api.preview(fields()); apply(); validateFonts();
    // Keep partially entered HEX text intact while the user types.
    byId('accentPicker').value = prefs.accent;
    if (input.id !== 'accentHex') byId('accentHex').value = prefs.accent.toUpperCase();
    byId('appearanceFontValue').textContent = byId('appearanceFont').value;
    document.querySelectorAll('[data-accent-preset]').forEach(function (button) { button.setAttribute('aria-pressed', button.getAttribute('data-accent-preset') === prefs.accent ? 'true' : 'false'); });
  }
  function open(event) {
    if (snapshot) return;
    if (RV.Native && RV.Native.available() && RV.Native.installedFontFamilies) loadFontCatalog();
    returnFocus = event && event.currentTarget || document.activeElement;
    if (RV.Shell) { returnFocus = RV.Shell.popupFocusTarget(returnFocus); RV.Shell.close(); }
    byId('readingOptions').open = false;
    snapshot = { prefs: Object.assign({}, prefs), state: api.get() };
    byId('appearanceStorageError').hidden = true; sync();
    byId('appearancePanel').hidden = false; byId('appearanceScrim').hidden = false;
    byId('appearanceTheme').focus();
  }
  function close(cancel) {
    if (!snapshot) return;
    closeFontSuggestions();
    clearTimeout(fontPreviewTimer); fontPreviewTimer = 0;
    if (cancel) { prefs = snapshot.prefs; api.preview(snapshot.state); apply(); }
    snapshot = null;
    byId('appearancePanel').hidden = true; byId('appearanceScrim').hidden = true;
    if (returnFocus && returnFocus.isConnected) (returnFocus.closest('[hidden]') ? byId('brandMark') : returnFocus).focus();
  }
  function init(callbacks) {
    api = callbacks; wireFontChoices();
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
    byId('btnAppearanceToolbar').addEventListener('click', open);
    byId('appearancePanel').addEventListener('input', preview);
    byId('appearancePanel').addEventListener('change', preview);
    ['appearanceClose', 'appearanceCancel', 'appearanceScrim'].forEach(function (id) { byId(id).addEventListener('click', function () { close(true); }); });
    byId('appearanceReset').addEventListener('click', function () {
      closeFontSuggestions();
      clearTimeout(fontPreviewTimer); fontPreviewTimer = 0;
      prefs = normalize(defaults); api.preview({ theme: 'auto', font: 16, width: 'full', spacing: 'normal' }); sync(); apply();
    });
    byId('appearanceApply').addEventListener('click', function () {
      applyFontPreview();
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
      if (event.isComposing || event.keyCode === 229 || fontSuggestionKey(event)) return;
      if (event.key === 'Escape') { event.preventDefault(); close(true); return; }
      if (event.key !== 'Tab') return;
      var items = Array.prototype.filter.call(byId('appearancePanel').querySelectorAll('button, input, select'), function (node) { return !node.disabled && !node.hidden; });
      var first = items[0], last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || !byId('appearancePanel').contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !byId('appearancePanel').contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    }, true);
    apply();
  }
  RV.Appearance = { init: init, apply: apply };
}());
