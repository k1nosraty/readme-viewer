'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), harness = require('./helpers/dom');
async function load(t, storage = new Map(), fail = () => false) {
  if (!harness.hasDom) { t.skip('jsdom unavailable'); return; }
  const result = await harness.loadApp({ beforeParse(window) {
    window.TextDecoder = TextDecoder;
    Object.defineProperty(window, 'localStorage', { value: {
      getItem: key => storage.get(key) || null,
      setItem: (key, value) => { if (fail(key)) throw Error('quota'); storage.set(key, value); },
      removeItem: key => storage.delete(key)
    } });
  } });
  t.after(() => result.window.close());
  const { document: d, window: w } = result;
  return { ...result, api: w.RVApp, storage,
    open: () => d.getElementById('btnAppearance').click(),
    set: (id, value) => { const e = d.getElementById(id); if (e.type === 'checkbox') e.checked = value; else e.value = value; e.dispatchEvent(new w.Event('input', { bubbles: true })); },
    click: id => d.getElementById(id).click() };
}

test('appearance preview, cancel, reset and focus preserve the document and saved settings', async t => {
  const a = await load(t); if (!a) return;
  a.api.setDoc('# Original\n\n[Link](https://example.com)', 'README.md');
  a.open();
  a.set('accentHex', '#dd2266'); a.set('appearanceSurface', 'warm'); a.set('appearanceDensity', 'compact');
  a.set('appearanceTheme', 'dark'); a.set('appearanceFont', 22); a.set('appearanceWidth', 'comfortable'); a.set('appearanceSpacing', 'relaxed');
  assert.equal(a.api.state.font, 22); assert.equal(a.api.state.theme, 'dark');
  assert.equal(a.document.documentElement.dataset.surface, 'warm');
  assert.equal(a.storage.has('rv.appearance'), false);
  assert.equal(a.storage.has('rv.settings'), false);
  assert.equal(a.storage.has('rv.reading.options'), false);
  a.click('appearanceCancel');
  assert.equal(a.api.state.font, 16); assert.equal(a.api.state.theme, 'auto');
  assert.equal(a.document.documentElement.dataset.surface, 'neutral');
  assert.equal(a.document.documentElement.dataset.readingWidth, 'full');
  assert.equal(a.document.activeElement, a.document.querySelector('#menuView > summary'));
  assert.equal(a.api.state.dirty, false); assert.equal(a.api.el.editor.value, '# Original\n\n[Link](https://example.com)');
  a.open(); a.set('accentHex', '#abcdef'); a.click('appearanceReset');
  assert.equal(a.document.getElementById('accentHex').value, '#0969DA');
  a.document.getElementById('appearanceApply').focus();
  a.document.dispatchEvent(new a.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
  assert.equal(a.document.activeElement.id, 'appearanceClose');
  a.document.dispatchEvent(new a.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(a.document.getElementById('appearancePanel').hidden, true);
  assert.deepEqual(a.errors, []);
});

test('appearance applies persistently, validates HEX and keeps standard links independent', async t => {
  const storage = new Map(); const a = await load(t, storage); if (!a) return;
  a.open(); a.set('accentHex', '#nope');
  assert.equal(a.document.getElementById('appearanceApply').disabled, true);
  a.set('accentHex', '#b0f'); a.set('appearanceSurface', 'cool'); a.set('appearanceStandardLinks', true);
  a.set('appearanceFont', 20); a.set('appearanceSpacing', 'relaxed'); a.click('appearanceApply');
  assert.equal(JSON.parse(storage.get('rv.appearance')).accent, '#bb00ff');
  const b = await load(t, storage);
  assert.equal(b.api.state.font, 20); assert.equal(b.document.documentElement.dataset.surface, 'cool');
  assert.equal(b.document.documentElement.dataset.readingSpacing, 'relaxed');
  const style = b.document.documentElement.style;
  assert.notEqual(style.getPropertyValue('--document-link'), style.getPropertyValue('--accent'));
  b.open(); b.set('appearanceSurface', 'warm'); b.click('appearanceReset'); b.click('appearanceCancel');
  assert.equal(b.document.documentElement.dataset.surface, 'cool', 'cancel also reverses restore-defaults preview');
});

function luminance(color) { const c = [1,3,5].map(i => parseInt(color.slice(i,i+2),16)/255).map(v => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4); return c[0]*.2126+c[1]*.7152+c[2]*.0722; }
function contrast(a,b) { const x=luminance(a),y=luminance(b); return (Math.max(x,y)+.05)/(Math.min(x,y)+.05); }
test('preset and extreme custom accents retain readable contrast across every theme and surface', async t => {
  const a = await load(t); if (!a) return; a.open();
  const colors = Array.from(a.document.querySelectorAll('[data-accent-preset]'), b => b.dataset.accentPreset).concat(['#ffffff','#000000','#ffff00','#00ffff','#ff00ff']);
  for (const theme of ['light','dark']) for (const surface of ['neutral','warm','cool']) {
    a.set('appearanceTheme',theme); a.set('appearanceSurface',surface);
    for (const color of colors) {
      a.set('accentHex',color);
      const s=a.document.documentElement.style, get=k=>s.getPropertyValue(k);
      for (const bg of ['--bg','--bg-subtle','--bg-inset','--accent-subtle']) assert.ok(contrast(get('--accent'),get(bg))>=4.5, [theme,surface,color,bg].join('/'));
      assert.ok(contrast(get('--accent'),get('--accent-fg'))>=4.5);
      assert.ok(contrast(get('--accent-hover'),get('--accent-fg'))>=4.5);
    }
  }
});

test('failed appearance storage keeps preview open and rolls back partially written settings', async t => {
  let reject = false; const storage = new Map([['rv.settings','{"font":17}']]);
  const a = await load(t, storage, key => reject && key === 'rv.appearance'); if (!a) return;
  a.open(); a.set('appearanceFont',24); reject=true; a.click('appearanceApply');
  assert.equal(a.document.getElementById('appearancePanel').hidden,false);
  assert.equal(a.document.getElementById('appearanceStorageError').hidden,false);
  assert.equal(storage.get('rv.settings'),' {"font":17}'.trim());
  a.click('appearanceCancel'); assert.equal(a.api.state.font,17);
});

test('font previews keep Latin and Arabic separate, cancel exactly, persist and export the free face', async t => {
  const storage = new Map(); const a = await load(t, storage); if (!a) return;
  const { document: d, window: w } = a;
  a.api.setDoc('# Hello سلام\n\n```js\nconst value = 1;\n```', 'fonts.md');
  const original = a.api.el.editor.value;
  assert.equal(d.documentElement.style.getPropertyValue('--doc-font'), '');
  assert.equal(d.querySelector('script[src*="vazirmatn.js"]'), null);
  a.open(); a.set('fontLatin', 'Georgia'); a.set('fontPersian', 'Vazirmatn'); a.set('fontUi', 'Arial');
  await w.RV.Fonts.ready();
  assert.match(d.documentElement.style.getPropertyValue('--doc-font'), /RV Document Arabic.*Georgia/);
  assert.match(d.documentElement.style.getPropertyValue('--ui-font'), /Arial/);
  assert.match(d.getElementById('document-font-faces').textContent, /unicode-range:U\+0600-06FF/);
  assert.match(w.RV.Fonts.exportCss(), /data:font\/woff2;base64/);
  assert.equal(storage.has('rv.appearance'), false);
  a.click('appearanceCancel'); await w.RV.Fonts.ready();
  assert.equal(d.documentElement.style.getPropertyValue('--doc-font'), '');
  assert.equal(d.documentElement.style.getPropertyValue('--ui-font'), '');
  assert.equal(a.api.el.editor.value, original); assert.equal(a.api.state.dirty, false);
  a.open(); a.set('fontLatin', 'Georgia'); a.set('fontPersian', 'Tahoma'); a.click('appearanceApply');
  const b = await load(t, storage); b.open();
  assert.equal(b.document.getElementById('fontLatin').value, 'Georgia');
  assert.equal(b.document.getElementById('fontPersian').value, 'Tahoma');
  assert.doesNotMatch(b.window.RV.Fonts.exportCss(), /data:font/);
  b.click('appearanceReset'); b.click('appearanceCancel');
  assert.equal(b.window.RV.Fonts.snapshot().persian, 'Tahoma');
  assert.deepEqual(a.errors, []);
});

test('font names cannot inject CSS and corrupt persisted choices fall back to defaults', async t => {
  const storage = new Map([['rv.appearance', JSON.stringify({ fonts: { latin: 'Arial; color:red', persian: 'Amiri', ui: '</style>' } })]]);
  const a = await load(t, storage); if (!a) return;
  a.open();
  assert.equal(a.document.getElementById('fontLatin').value, '');
  assert.equal(a.document.getElementById('fontPersian').value, 'Amiri');
  a.set('fontLatin', 'Arial; color:red');
  assert.equal(a.document.getElementById('appearanceApply').disabled, true);
  assert.equal(a.document.getElementById('fontError').hidden, false);
  a.set('fontLatin', 'Noto Sans CJK JP');
  assert.equal(a.document.getElementById('appearanceApply').disabled, false);
  a.click('appearanceApply');
  assert.equal(a.window.RV.Fonts.snapshot().latin, 'Noto Sans CJK JP');
});

test('font pickers keep every preset available after repeat choices and retain custom families', async t => {
  const a = await load(t); if (!a) return;
  a.open();
  for (const id of ['fontLatin', 'fontPersian', 'fontUi']) {
    const choice = a.document.getElementById(id + 'Choice'), input = a.document.getElementById(id);
    assert.ok(a.document.getElementById('appearancePanel').contains(choice));
    const options = Array.from(choice.options, option => option.value);
    for (const name of ['Arial', 'Vazirmatn', '', 'Arial']) {
      a.set(id + 'Choice', name);
      assert.equal(input.value, name); assert.equal(input.hidden, true);
      assert.deepEqual(Array.from(choice.options, option => option.value), options, 'selection never filters the preset list');
    }
    a.set(id + 'Choice', '__custom__'); assert.equal(input.hidden, false);
    a.set(id, 'My Installed Font');
    assert.equal(choice.value, '__custom__');
    a.click('appearanceApply'); a.open();
    assert.equal(choice.value, '__custom__'); assert.equal(input.hidden, false); assert.equal(input.value, 'My Installed Font');
    a.set(id + 'Choice', ''); assert.equal(input.hidden, true);
  }
  a.click('appearanceCancel'); assert.deepEqual(a.errors, []);
});
