'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const harness = require('./helpers/dom');
async function setup(t, native) {
  if (!harness.hasDom) { t.skip('jsdom unavailable'); return; }
  const app = await harness.loadApp({ beforeParse(window) {
    window.TextDecoder = TextDecoder;
    if (native) window.RV = { Native: Object.assign({ available: () => true, initialize: async () => {}, assetUrl: () => '' }, native) };
  } });
  t.after(() => app.window.close());
  return Object.assign(app, { api: app.window.RVApp });
}
function context(app, root) {
  const link = (root || app.api.el.preview).querySelector('a:not(.heading-anchor)');
  link.focus();
  link.dispatchEvent(new app.window.MouseEvent('contextmenu', { clientX: 10000, clientY: 10000, bubbles: true, cancelable: true }));
  return { link, menu: app.document.getElementById('linkContextMenu') };
}
function dirty(app, value) {
  app.api.el.editor.value = value;
  app.api.el.editor.dispatchEvent(new app.window.Event('input', { bubbles: true }));
}
function fileHandle(path, text) {
  return { path, name: path.split('/').pop(), getFile: async () => ({ name: path.split('/').pop(),
    arrayBuffer: async () => new TextEncoder().encode(text).buffer }) };
}

test('link menu has keyboard navigation, viewport clamping and Escape restores link focus', async t => {
  const app = await setup(t); if (!app) return;
  app.api.setDoc('[Website](https://example.test)', 'links.md');
  const { link, menu } = context(app);
  assert.equal(menu.getAttribute('role'), 'menu');
  assert.equal(menu.hidden, false);
  assert.equal(menu.querySelectorAll('[role=menuitem]').length, 3);
  assert.ok(parseInt(menu.style.left, 10) <= app.window.innerWidth - 8);
  const key = name => menu.dispatchEvent(new app.window.KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }));
  key('End'); assert.equal(app.document.activeElement.dataset.linkAction, 'browser');
  key('Home'); assert.equal(app.document.activeElement.dataset.linkAction, 'same');
  key('ArrowDown'); assert.equal(app.document.activeElement.dataset.linkAction, 'new');
  key('Escape'); assert.equal(menu.hidden, true); assert.equal(app.document.activeElement, link);
});

test('native new-tab action resolves with origin handle and keeps dirty original', async t => {
  const resolved = [];
  const app = await setup(t, { resolveLocalUrl: (href, handle) => { resolved.push([href, handle.path]); return '/docs/next.md'; },
    openLink: async () => fileHandle('/docs/next.md', '# Next') }); if (!app) return;
  app.api.setDoc('[Next](next.md)', 'source.md', { path: '/docs/source.md' });
  dirty(app, '[Next](next.md)\n\nunsaved'); app.api.render();
  const first = app.api.listTabs()[0].id;
  context(app).menu.querySelector('[data-link-action=new]').click(); await harness.settle(20);
  assert.deepEqual(resolved[0], ['next.md', '/docs/source.md']);
  assert.equal(app.api.state.name, 'next.md');
  app.api.switchTab(first);
  assert.match(app.api.el.editor.value, /unsaved/); assert.equal(app.api.state.dirty, true);
});

test('same-tab action preserves discard cancellation and comparison action uses secondary origin', async t => {
  const paths = [];
  const app = await setup(t, { resolveLocalUrl: (href, handle) => { paths.push(handle.path); return '/next.md'; },
    openLink: async () => fileHandle('/next.md', '# Next') }); if (!app) return;
  app.api.setDoc('[Next](next.md)', 'source.md', { path: '/source.md' });
  dirty(app, '[Next](next.md)\n\nunsaved'); app.api.render();
  const source = app.api.listTabs()[0].id;
  app.api.newTab('main', 'main.md', { path: '/main.md' }); app.api.showComparison(source);
  context(app, app.document.getElementById('comparisonPreview')).menu.querySelector('[data-link-action=same]').click();
  await harness.settle(10);
  assert.equal(app.api.state.name, 'source.md'); assert.equal(app.api.el.confirmModal.hidden, false);
  app.api.el.btnConfirmCancel.click(); await harness.settle(20);
  assert.match(app.api.el.editor.value, /unsaved/); assert.deepEqual(paths, ['/source.md']);
});

test('browser action renders local native README safely without changing dirty tabs', async t => {
  let html = '';
  const app = await setup(t, {
    resolveLocalUrl: (href, handle, parent) => {
      if (!parent && href.indexOf('../') >= 0) return null;
      return '/docs/' + href;
    }, openLink: async () => fileHandle('/docs/next.md', '# Preview\n\n![ok](image.png) ![blocked](../secret.png)\n\n<script>bad()</script>'),
    previewInBrowser: async value => { html = value; }
  }); if (!app) return;
  app.api.setDoc('[Next](next.md)', 'source.md', { path: '/source.md' });
  dirty(app, '[Next](next.md)\n\ndirty'); app.api.render();
  context(app).menu.querySelector('[data-link-action=browser]').click(); await harness.settle(20);
  assert.match(html, /<h1/); assert.match(html, /file:\/\/\/docs\/image.png/);
  assert.doesNotMatch(html, /secret.png|<script|bad\(\)/);
  assert.equal(app.api.state.name, 'source.md'); assert.equal(app.api.state.dirty, true);
  assert.equal(app.api.listTabs().length, 1);
});

test('folder new-tab action retains the original root and resolves linked README', async t => {
  const app = await setup(t); if (!app) return;
  const paths = [];
  const root = { fullPath: '/repo', getFile: (path, options, resolve) => {
    paths.push(path); resolve({ fullPath: '/repo/' + path, isFile: true, file: resolveFile => resolveFile({
      name: 'next.md', arrayBuffer: async () => new TextEncoder().encode('# Next').buffer
    }) });
  } };
  app.api.setDoc('[Next](next.md)', 'source.md'); app.api.state.folder = { root, path: 'source.md' };
  dirty(app, '[Next](next.md)\n\ndirty'); app.api.render();
  const first = app.api.listTabs()[0].id;
  context(app).menu.querySelector('[data-link-action=new]').click(); await harness.settle(20);
  assert.deepEqual(paths, ['next.md']); assert.equal(app.api.state.folder.root, root);
  app.api.switchTab(first); assert.equal(app.api.state.dirty, true);
});

test('touch long press opens menu and moving before timeout cancels it', async t => {
  const app = await setup(t); if (!app) return;
  app.api.setDoc('[Website](https://example.test)', 'links.md');
  const link = app.api.el.preview.querySelector('a');
  function pointer(type, x) {
    const event = new app.window.Event(type, { bubbles: true });
    Object.assign(event, { pointerType: 'touch', clientX: x, clientY: 20 }); link.dispatchEvent(event);
  }
  pointer('pointerdown', 20); pointer('pointermove', 50); await harness.settle(580);
  assert.equal(app.document.getElementById('linkContextMenu'), null);
  pointer('pointerdown', 20); await harness.settle(580);
  assert.equal(app.document.getElementById('linkContextMenu').hidden, false);
  const click = new app.window.MouseEvent('click', { bubbles: true, cancelable: true }); link.dispatchEvent(click);
  assert.equal(click.defaultPrevented, true);
});

test('comparison fragment menu action activates origin and reaches its heading', async t => {
  const app = await setup(t); if (!app) return;
  app.api.setDoc('# Install\n\n[Go](#install)', 'source.md');
  const source = app.api.listTabs()[0].id; app.api.newTab('main', 'main.md'); app.api.showComparison(source);
  context(app, app.document.getElementById('comparisonPreview')).menu.querySelector('[data-link-action=same]').click();
  await harness.settle(10);
  assert.equal(app.api.state.name, 'source.md');
  assert.ok(app.api.el.preview.querySelector('#user-content-install'));
});

test('browser relative link menu resolves against document URL with noopener', async t => {
  const app = await setup(t); if (!app) return;
  let opened;
  app.window.open = (...args) => { opened = args; return null; };
  app.api.setDoc('[Next](next.md)', 'source.md');
  const { menu } = context(app);
  assert.equal(menu.querySelector('[data-link-action=browser]').disabled, false);
  menu.querySelector('[data-link-action=browser]').click();
  assert.match(opened[0], /next.md$/); assert.equal(opened[2], 'noopener,noreferrer');
});

test('typing while a same-tab folder entry read waits preserves the new edits', async t => {
  const app = await setup(t); if (!app) return;
  let finishRead;
  const root = { fullPath: '/repo', getFile: (path, options, resolve) => resolve({
    fullPath: '/repo/next.md', isFile: true,
    file: resolveFile => { finishRead = resolveFile; }
  }) };
  app.api.setDoc('[Next](next.md)', 'source.md');
  app.api.state.folder = { root, path: 'source.md' }; app.api.render();
  context(app).menu.querySelector('[data-link-action=same]').click();
  await harness.settle(10);
  assert.equal(typeof finishRead, 'function');
  dirty(app, '[Next](next.md)\n\ntyped during read');
  finishRead({ name: 'next.md', arrayBuffer: async () => new TextEncoder().encode('# Replacement').buffer });
  await harness.settle(20);
  assert.equal(app.api.state.name, 'source.md');
  assert.match(app.api.el.editor.value, /typed during read/);
  assert.equal(app.api.state.dirty, true);
});
