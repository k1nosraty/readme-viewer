'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const harness = require('./helpers/dom');

test('Contents shortcut opens the mobile sidebar and app shortcuts leave modal background unchanged', async t => {
  const { window, document } = await harness.loadApp();
  t.after(() => window.close());
  const app = window.RVApp;
  Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
  app.setDoc('# Heading', 'guide.md');
  const key = (value, extra = {}) => document.dispatchEvent(new window.KeyboardEvent('keydown', {
    key: value, ctrlKey: true, bubbles: true, cancelable: true, ...extra
  }));
  key('f'); assert.equal(app.el.sidebar.hidden, false);
  assert.equal(document.activeElement, app.el.tocFilter);
  app.el.editor.value = 'Edited'; app.el.editor.dispatchEvent(new window.Event('input', { bubbles: true }));
  const previousMode = app.state.mode, previousEditing = app.state.editPreview;
  const confirmation = app.confirmDiscard();
  key('3'); key('e'); key('z');
  assert.equal(app.state.mode, previousMode); assert.equal(app.state.editPreview, previousEditing);
  assert.equal(app.el.editor.value, 'Edited');
  app.el.btnConfirmCancel.click(); assert.equal(await confirmation, false);
  window.RV.I18n.setLocale('fa'); app.applyLocale();
  assert.equal(document.querySelector('[data-mode-btn="split"] span').textContent, 'دو نما');
  assert.match(app.el.editorMeta.textContent, /سطر/);
  assert.match(app.el.previewMeta.textContent, /بلوک/);
});
