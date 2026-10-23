'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const harness = require('./helpers/dom');

async function load(t) {
  if (!harness.hasDom) { t.skip('jsdom unavailable'); return; }
  const app = await harness.loadApp({ beforeParse(window) { window.TextDecoder = TextDecoder; } });
  t.after(() => app.window.close());
  return { ...app, api: app.window.RVApp };
}

test('application menus share commands, disabled and selected toolbar state', async t => {
  const app = await load(t); if (!app) return;
  const { api, document } = app;
  const q = selector => document.querySelector(selector);
  assert.equal(q('[data-command="btnSave"]').disabled, true);
  assert.equal(q('#toolOptions'), null);
  api.setDoc('# Document', 'README.md');
  assert.equal(q('[data-command="btnSave"]').disabled, false);
  const view = q('#menuView'); view.open = true;
  q('#menuView [data-mode-btn="preview"]').click();
  assert.equal(api.state.mode, 'preview');
  assert.equal(view.open, false);
  assert.equal(q('#toolbar [data-mode-btn="preview"]').getAttribute('aria-pressed'), 'true');
  const wrap = api.state.wrap;
  q('#menuView [data-command="btnWrap"]').click();
  assert.equal(api.state.wrap, !wrap);
  assert.equal(q('#menuView [data-command="btnWrap"]').getAttribute('aria-pressed'), String(!wrap));
  assert.equal(q('#toolbar [data-mode-btn="split"] span').textContent, 'Split');
  assert.deepEqual(app.errors, []);
});

test('Edit menu undo and redo use the current document history', async t => {
  const app = await load(t); if (!app) return;
  const { api, document, window } = app;
  api.setDoc('original', 'README.md');
  api.el.editor.value = 'changed';
  api.el.editor.dispatchEvent(new window.Event('input', { bubbles: true }));
  const undo = document.querySelector('[data-shell-action="undo"]');
  assert.equal(undo.disabled, false);
  undo.click();
  assert.equal(api.el.editor.value, 'original');
  const redo = document.querySelector('[data-shell-action="redo"]');
  assert.equal(redo.disabled, false);
  redo.click();
  assert.equal(api.el.editor.value, 'changed');
});

test('menu keyboard navigation switches menus and returns focus on Escape', async t => {
  const app = await load(t); if (!app) return;
  const { document, window } = app;
  const summary = document.querySelector('#menuFile > summary');
  summary.focus();
  summary.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  assert.equal(document.getElementById('menuFile').open, true);
  assert.equal(document.activeElement.getAttribute('data-command'), 'btnNewTab');
  document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  assert.equal(document.getElementById('menuFile').open, false);
  assert.equal(document.getElementById('menuEdit').open, true);
  document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(document.getElementById('menuEdit').open, false);
  assert.equal(document.activeElement, document.querySelector('#menuEdit > summary'));
});

test('Theme flyout selects an explicit theme and Escape returns to its trigger', async t => {
  const app = await load(t); if (!app) return;
  const { api, document, window } = app;
  document.getElementById('menuView').open = true;
  const trigger = document.querySelector('[data-submenu="themeMenu"]');
  trigger.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  assert.equal(document.getElementById('themeMenu').hidden, false);
  assert.equal(document.activeElement.getAttribute('data-theme-choice'), 'auto');
  document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(document.getElementById('themeMenu').hidden, true);
  assert.equal(document.getElementById('menuView').open, true);
  assert.equal(document.activeElement, trigger);
  trigger.click();
  document.querySelector('[data-theme-choice="dark"]').click();
  assert.equal(api.state.theme, 'dark');
  assert.equal(document.querySelector('[data-theme-choice="dark"]').getAttribute('aria-checked'), 'true');
  assert.equal(document.documentElement.dataset.theme, 'dark');
});

test('toolbar choices survive reload and hidden commands remain available in menus', async t => {
  const storage = new Map();
  async function open() {
    const app = await harness.loadApp({ beforeParse(window) {
      window.TextDecoder = TextDecoder;
      Object.defineProperty(window, 'localStorage', { value: {
        getItem: key => storage.get(key) || null,
        setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key)
      } });
    } });
    t.after(() => app.window.close()); return app;
  }
  const first = await open();
  first.document.querySelector('[data-toolbar-option="sync"]').click();
  assert.equal(first.document.getElementById('btnSync').hidden, true);
  const second = await open();
  assert.equal(second.document.getElementById('btnSync').hidden, true);
  const before = second.window.RVApp.state.sync;
  second.document.querySelector('#menuView [data-command="btnSync"]').click();
  assert.equal(second.window.RVApp.state.sync, !before);
  second.document.querySelector('[data-toolbar-show]').click();
  assert.equal(second.document.getElementById('toolbar').hidden, true);
  second.document.querySelector('[data-toolbar-reset]').click();
  assert.equal(second.document.getElementById('toolbar').hidden, false);
  assert.equal(second.document.getElementById('btnSync').hidden, false);
});
