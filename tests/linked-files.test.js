'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const harness = require('./helpers/dom');

async function app(t, native, recent) {
  const storage = new Map(recent ? [['rv.recent', JSON.stringify(recent)]] : []);
  const loaded = await harness.loadApp({ beforeParse(window) {
    window.TextDecoder = TextDecoder;
    Object.defineProperty(window, 'localStorage', { value: {
      getItem: key => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value)
    } });
    if (native) window.RV = { Native: Object.assign({ available: () => true, initialize: async () => {} }, native) };
  } });
  t.after(() => loaded.window.close());
  return Object.assign(loaded, { storage });
}

test('dropped folder records its first document and supports Back and Forward', async t => {
  const { window, document } = await app(t);
  const makeEntry = (name, text) => ({
    name, fullPath: '/repo/' + name, isFile: true,
    file: resolve => resolve({ name, arrayBuffer: async () => new TextEncoder().encode(text).buffer })
  });
  const first = makeEntry('README.md', '[Next](guide.md)');
  const second = makeEntry('guide.md', '# Guide');
  const root = {
    name: 'repo', fullPath: '/repo', isDirectory: true,
    createReader() {
      let sent = false;
      return { readEntries(resolve) {
        const list = sent ? [] : [first, second];
        sent = true;
        resolve(list);
      } };
    },
    getFile(path, options, resolve) { resolve(path === 'guide.md' ? second : first); }
  };
  const drop = new window.Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(drop, 'dataTransfer', { value: {
    types: ['Files'], files: [], items: [{ kind: 'file', webkitGetAsEntry: () => root }]
  } });
  window.dispatchEvent(drop);
  await harness.settle();
  assert.equal(window.RVApp.state.name, 'README.md');
  harness.click(window, document.querySelector('#preview a'));
  await harness.settle();
  assert.equal(window.RVApp.state.name, 'guide.md');
  assert.equal(document.getElementById('btnBack').disabled, false);
  harness.click(window, document.getElementById('btnBack'));
  await harness.settle();
  assert.equal(window.RVApp.state.name, 'README.md');
  assert.equal(document.getElementById('btnForward').disabled, false);
  harness.click(window, document.getElementById('btnForward'));
  await harness.settle();
  assert.equal(window.RVApp.state.name, 'guide.md');
});

test('native directory links with dots are resolved by the native bridge', async t => {
  const opened = [];
  const { window, document } = await app(t, {
    resolveLocalUrl: href => '/docs/' + href.replace(/\/$/, ''),
    openLink: async path => {
      opened.push(path);
      return { path: path + '/README.md', baseUrl: path + '/', getFile: async () => ({
        name: 'README.md', arrayBuffer: async () => new TextEncoder().encode('# Linked').buffer
      }) };
    }
  });
  for (const href of ['api.v2/', 'api.v2']) {
    window.RVApp.setDoc('[Docs](' + href + ')', 'start.md', { baseUrl: '/docs/' }, {});
    harness.click(window, document.querySelector('#preview a'));
    await harness.settle();
    assert.equal(window.RVApp.state.name, 'README.md');
  }
  assert.deepEqual(opened, ['/docs/api.v2', '/docs/api.v2']);
});

test('find keeps Unicode offsets and treats regular-expression characters literally', async t => {
  const { window, document, errors } = await app(t);
  window.RVApp.setDoc('İx 𐐀 [a.b] aXb', 'unicode.md', null, {});
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'F', ctrlKey: true, shiftKey: true, bubbles: true }));
  const input = document.getElementById('findInput');
  for (const [query, count] of [['x', 2], ['𐐨', 1], ['[a.b]', 1]]) {
    input.value = query;
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    assert.equal(document.querySelectorAll('#preview mark.rv-find').length, count, query);
  }
  assert.equal(document.querySelector('#preview mark.rv-find').textContent, '[a.b]');
  assert.deepEqual(errors, []);
});

test('cancelling a recent-file open preserves the recent list and unsaved document', async t => {
  let opened = 0;
  const recent = ['/docs/old.md'];
  const { window, document, storage } = await app(t, {
    openLink: async () => { opened++; return null; }
  }, recent);
  window.RVApp.setDoc('original', 'current.md', null, {});
  const editor = document.getElementById('editor');
  editor.value = 'unsaved';
  editor.dispatchEvent(new window.Event('input', { bubbles: true }));
  harness.click(window, document.querySelector('#recentList button'));
  await harness.settle(20);
  assert.equal(document.getElementById('confirmModal').hidden, false);
  harness.click(window, document.getElementById('btnConfirmCancel'));
  await harness.settle();
  assert.deepEqual(JSON.parse(storage.get('rv.recent')), recent);
  assert.equal(editor.value, 'unsaved');
  assert.equal(window.RVApp.state.dirty, true);
  assert.equal(opened, 0);
});

test('browser document links always have a secure new-tab fallback', async t => {
  const { window, document } = await app(t);
  for (const folder of [null, { root: {}, path: 'README.md' }]) {
    window.RVApp.setDoc('[Guide](../guide.md#install)', 'README.md', null, {});
    window.RVApp.state.folder = folder;
    window.RVApp.render();
    const link = document.querySelector('#preview a');
    assert.equal(link.getAttribute('target'), '_blank');
    assert.match(link.getAttribute('rel'), /noopener/);
    assert.match(link.getAttribute('rel'), /noreferrer/);
    assert.equal(link.getAttribute('href'), '../guide.md#install');
  }
});

test('OS Open with selects Preview even when the saved layout is Write', async t => {
  let hooks;
  const { window } = await app(t, {
    initialize: async options => { hooks = options; },
    openPath: async () => ({ path: '/docs/open.md', getFile: async () => ({
      name: 'open.md', arrayBuffer: async () => new TextEncoder().encode('# Open').buffer
    }) })
  });
  window.RVApp.setMode('write');
  assert.equal(await hooks.openPath('/docs/open.md'), true);
  assert.equal(window.RVApp.state.mode, 'preview');
  assert.equal(window.RVApp.state.name, 'open.md');
});

test('Unicode footnotes and every return link scroll to their actual targets', async t => {
  const { window, document, errors } = await app(t);
  window.RVApp.setDoc('One[^یادداشت] two[^یادداشت].\n\n[^یادداشت]: Note', 'notes.md', null, {});
  for (const link of document.querySelectorAll('#preview .footnote-ref a, #preview .footnote-back')) {
    const target = document.getElementById(decodeURIComponent(link.getAttribute('href').slice(1)));
    assert.ok(target);
    let scrolled = false;
    target.scrollIntoView = () => { scrolled = true; };
    harness.click(window, link);
    assert.equal(scrolled, true);
  }
  assert.deepEqual(errors, []);
});
