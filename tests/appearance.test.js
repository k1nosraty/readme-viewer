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
