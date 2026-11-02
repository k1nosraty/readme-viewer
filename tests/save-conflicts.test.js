'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const harness = require('./helpers/dom');

async function load(t) {
  const app = await harness.loadApp({ beforeParse(window) { window.TextDecoder = TextDecoder; } });
  t.after(() => app.window.close());
  return { ...app, api: app.window.RVApp };
}
function edit(app, text) {
  app.api.el.editor.value = text;
  app.api.el.editor.dispatchEvent(new app.window.Event('input', { bubbles: true }));
}
function browserDisk(window, name, initial) {
  let bytes = Buffer.from(initial);
  const file = {
    name, kind: 'file',
    async getFile() { const snapshot = Uint8Array.from(bytes); return { name, arrayBuffer: async () => snapshot.buffer }; },
    change(text) { bytes = Buffer.from(text); }, text() { return bytes.toString(); }
  };
  file.createWritable = async () => {
    let buffer;
    return {
      write: blob => new Promise((resolve, reject) => {
        const reader = new window.FileReader();
        reader.onload = () => { buffer = Buffer.from(reader.result); resolve(); };
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(blob);
      }),
      close: async () => file.change(buffer.toString())
    };
  };
  return file;
}

test('browser conflicts support cancel, explicit overwrite, later saves and Save As without losing edits', async t => {
  const app = await load(t), { api, window, document } = app;
  const original = browserDisk(window, 'original.md', 'original');
  await api.openHandleTab(original); edit(app, 'our edit'); original.change('external edit');
  let saving = api.save();
  await harness.waitFor(() => !api.el.confirmModal.hidden, 1000);
  assert.match(document.getElementById('confirmTitle').textContent, /changed on disk/);
  assert.equal(api.el.btnConfirmSave.textContent, 'Save as');
  api.el.btnConfirmCancel.click(); assert.equal(await saving, false);
  assert.equal(original.text(), 'external edit'); assert.equal(api.state.dirty, true);
  saving = api.save(); await harness.waitFor(() => !api.el.confirmModal.hidden, 1000);
  api.el.btnConfirmDiscard.click(); assert.equal(await saving, true);
  assert.equal(original.text(), 'our edit'); assert.equal(api.state.dirty, false);
  edit(app, 'second edit'); assert.equal(await api.save(), true, 'successful saves update the conflict baseline');
  edit(app, 'third edit'); original.change('another external edit');
  const copy = browserDisk(window, 'copy.md', '');
  window.showSaveFilePicker = async () => copy;
  saving = api.save(); await harness.waitFor(() => !api.el.confirmModal.hidden, 1000);
  api.el.btnConfirmSave.click(); assert.equal(await saving, true);
  assert.equal(original.text(), 'another external edit'); assert.equal(copy.text(), 'third edit');
  assert.equal(api.state.handle, copy);
});

test('native commit conflicts require explicit overwrite and preserve edits typed while deciding', async t => {
  const app = await load(t), { api, window } = app;
  const options = [];
  window.RV.Native = { available: () => true };
  const handle = { name: 'native.md', path: '/native.md', createWritable: async value => {
    options.push(value);
    return { write: async () => {}, close: async () => {
      if (!value.overwrite) { const e = new Error('changed'); e.name = 'FileConflictError'; throw e; }
    } };
  } };
  api.setDoc('original', handle.name, handle); edit(app, 'edited');
  const saving = api.save(); await harness.waitFor(() => !api.el.confirmModal.hidden, 1000);
  edit(app, 'typed during conflict');
  api.el.btnConfirmDiscard.click(); assert.equal(await saving, true);
  assert.equal(options.length, 2); assert.equal(options[1].overwrite, true);
  assert.equal(api.state.saved, 'edited'); assert.equal(api.state.dirty, true);
  assert.equal(api.el.editor.value, 'typed during conflict');
});

test('conflict cancellation during close keeps edits and restores ordinary confirmation labels', async t => {
  const app = await load(t), { api, window } = app;
  const original = browserDisk(window, 'original.md', '\uFEFF# Original\r\n');
  await api.openHandleTab(original);
  const first = api.listTabs()[0].id;
  api.newTab('second', 'second.md'); api.switchTab(first);
  edit(app, '# Our edits\n'); original.change('# External edits\n');
  const closing = api.confirmDiscard();
  api.el.btnConfirmSave.click();
  await harness.waitFor(() => api.el.btnConfirmSave.textContent === 'Save as' && !api.el.confirmModal.hidden, 1000);
  api.el.btnConfirmCancel.click(); assert.equal(await closing, false);
  assert.equal(api.el.editor.value, '# Our edits\n'); assert.equal(api.state.dirty, true);
  assert.equal(original.text(), '# External edits\n');
  const retry = api.confirmDiscard();
  assert.equal(api.el.btnConfirmSave.textContent, 'Save');
  assert.equal(api.el.btnConfirmDiscard.textContent, 'Discard');
  api.el.btnConfirmCancel.click(); assert.equal(await retry, false);
});

test('a deleted file raises a conflict and a cancelled Save As leaves the original handle untouched', async t => {
  const app = await load(t), { api, window } = app;
  const original = browserDisk(window, 'original.md', 'original');
  await api.openHandleTab(original); edit(app, 'edited');
  original.getFile = async () => { const error = new Error('deleted'); error.name = 'NotFoundError'; throw error; };
  window.showSaveFilePicker = async () => { throw new window.DOMException('cancelled', 'AbortError'); };
  const saving = api.save();
  await harness.waitFor(() => !api.el.confirmModal.hidden, 1000);
  api.el.btnConfirmSave.click(); assert.equal(await saving, false);
  assert.equal(api.state.handle, original); assert.equal(api.state.dirty, true);
  assert.equal(api.el.editor.value, 'edited');
});
