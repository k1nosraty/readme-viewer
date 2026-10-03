const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function adapter(overrides = {}) {
  const calls = [];
  const window = { __TAURI_INTERNALS__: {}, RV: {} };
  const mocks = {
    window, DOMException, Blob, console,
    convertFileSrc: path => `asset:${path}`,
    invoke: async () => [],
    readFile: async () => new Uint8Array([239, 187, 191, 97, 13, 10]),
    writeFile: async (path, bytes) => calls.push([path, Array.from(bytes)]),
    stat: async () => ({ isDirectory: false }),
    readDir: async () => [], join: async (...parts) => parts.join('/'),
    open: async () => '/docs/README.md', save: async () => '/docs/saved.md',
    openUrl: async url => calls.push(url), ...overrides
  };
  const source = fs.readFileSync(require.resolve('../src/native-entry.js'), 'utf8').replace(/^import .*;$/gm, '');
  vm.runInNewContext(source, mocks);
  return { native: mocks.window.RV.Native, calls };
}

test('native handles preserve BOM and line-ending bytes on read/write', async () => {
  const { native, calls } = adapter();
  const handle = await native.pickOpen();
  const file = await handle.getFile();
  assert.equal(file.name, 'README.md');
  assert.deepEqual(Array.from(new Uint8Array(await file.arrayBuffer())), [239, 187, 191, 97, 13, 10]);
  const writer = await handle.createWritable();
  await writer.write(new Blob([new Uint8Array([239, 187, 191, 97, 13, 10])]));
  await writer.close();
  assert.deepEqual(calls, [['/docs/README.md', [239, 187, 191, 97, 13, 10]]]);
  await assert.rejects(writer.write(new Blob(['x'])), /closed/);
});
test('native cancellation and failed writes reject without pretending success', async () => {
  const cancelled = adapter({ save: async () => null }).native;
  await assert.rejects(cancelled.download('text', 'a.md', 'text/plain'), { name: 'AbortError' });
  const failed = adapter({ writeFile: async () => { throw new Error('permission denied'); } }).native;
  await assert.rejects(failed.download('text', 'a.md', 'text/plain'), /permission denied/);
});
test('native preview links stay local and external opener only accepts permitted schemes', async () => {
  const { native, calls } = adapter();
  const handle = await native.pickOpen();
  assert.equal(native.resolveLocalUrl('guide.md#part', handle), '/docs/guide.md');
  assert.equal(native.assetUrl('images/photo.png', handle), 'asset:/docs/images/photo.png');
  for (const href of ['../secret.md', '%2e%2e/secret', '/etc/passwd', 'file:///secret', 'javascript:alert(1)', '//example.com/a', 'content://a']) {
    assert.equal(native.resolveLocalUrl(href, handle), null);
    assert.equal(await native.openExternal(href), false);
  }
  assert.equal(await native.openExternal('https://example.com'), true);
  assert.deepEqual(calls, ['https://example.com']);
});
test('Android content URI paths pass unchanged to filesystem APIs', async () => {
  const path = 'content://provider/document/123';
  const { native, calls } = adapter({ open: async () => path });
  const handle = await native.pickOpen();
  assert.equal(handle.path, path);
  assert.equal(handle.baseUrl, null);
  const writer = await handle.createWritable();
  await writer.write(new Blob(['ok']));
  assert.equal(calls[0][0], path);
});
test('startup, native-open, drop and close confirmation share app hooks', async () => {
  const events = {}, opened = [], drags = [];
  let destroyed = 0, confirmation = false, prevented = 0;
  const { native } = adapter({
    invoke: async command => command === 'startup_paths' ? ['/docs/start.md'] : [],
    listen: async (name, callback) => { events[name] = callback; },
    getCurrentWindow: () => ({
      onDragDropEvent: async callback => { events.drop = callback; },
      onCloseRequested: async callback => { events.close = callback; },
      destroy: async () => { destroyed++; }
    })
  });
  await native.initialize({ openPath: async path => { opened.push(path); }, confirmClose: async () => confirmation, onDrag: active => drags.push(active) });
  await events['native-open']({ payload: ['/docs/second.md'] });
  events.drop({ payload: { type: 'enter' } });
  events.drop({ payload: { type: 'drop', paths: ['/docs/drop.md'] } });
  await events.close({ preventDefault: () => { prevented++; } });
  assert.equal(destroyed, 0);
  confirmation = true;
  await events.close({ preventDefault: () => { prevented++; } });
  assert.equal(destroyed, 1);
  assert.equal(prevented, 2);
  assert.deepEqual(opened, ['/docs/start.md', '/docs/second.md', '/docs/drop.md']);
  assert.deepEqual(drags, [true, false]);
});
test('desktop open paths use the scoped Rust resolver, content URIs remain direct', async () => {
  const commands = [];
  const { native } = adapter({ invoke: async (command, args) => {
    commands.push([command, args.path]);
    return command === 'resolve_document_path' ? '/folder/README.md' : null;
  } });
  const desktop = await native.openPath('/folder');
  assert.equal(desktop.path, '/folder/README.md');
  assert.deepEqual(commands, [['resolve_document_path', '/folder'], ['authorize_document_directory', '/folder/README.md']]);
  const mobile = await native.openPath('content://provider/document/123');
  assert.equal(mobile.path, 'content://provider/document/123');
  assert.equal(commands.length, 2);
});
test('HTML exports use HTML filters and Save As authorizes images only after writing', async () => {
  const operations = [];
  const { native } = adapter({
    save: async options => { operations.push(['dialog', options.filters[0].extensions.join(',')]); return '/saved/export.html'; },
    writeFile: async () => { operations.push(['write']); },
    invoke: async command => { operations.push([command]); }
  });
  await native.download('<p>hello</p>', 'export.html', 'text/html;charset=utf-8');
  assert.deepEqual(operations, [['dialog', 'html,htm'], ['write'], ['authorize_document_directory']]);
});
test('a saved file remains successful when image scope authorization fails', async () => {
  const { native } = adapter({
    invoke: async () => { throw new Error('scope unavailable'); },
    console: { warn() {}, error() {} }
  });
  assert.equal(await native.download('hello', 'README.md', 'text/markdown'), true);
});
test('Android Back waits for close/save decision and serializes repeated presses', async () => {
  let back, finishDecision, exited = 0, decisions = 0;
  const errors = [];
  const androidWindow = { __TAURI_INTERNALS__: {}, RV: {}, navigator: { userAgent: 'Android' } };
  const { native } = adapter({
    window: androidWindow,
    listen: async () => {},
    getCurrentWindow: () => ({ onDragDropEvent: async () => {}, onCloseRequested: async () => {}, destroy: async () => { throw new Error('Android should exit activity'); } }),
    onBackButtonPress: async callback => { back = callback; },
    exit: async code => { assert.equal(code, 0); exited++; }
  });
  let decide = () => new Promise(resolve => { finishDecision = resolve; });
  await native.initialize({ openPath: async () => {}, confirmClose: () => { decisions++; return decide(); }, onError: error => errors.push(error.message) });
  const pending = back();
  await back();
  assert.equal(decisions, 1);
  assert.equal(exited, 0);
  finishDecision(false);
  await pending;
  assert.equal(exited, 0);
  decide = async () => { throw new Error('save failed'); };
  await back();
  assert.equal(exited, 0);
  assert.deepEqual(errors, ['save failed']);
  decide = async () => true;
  await back();
  assert.equal(exited, 1);
});
test('Android opened provider documents are read-only while Save As destinations are writable', async () => {
  const path = 'content://provider/document/123';
  const { native } = adapter({ open: async () => path, save: async () => path });
  assert.equal((await native.pickOpen()).writable, false);
  assert.equal((await native.openPath(path)).writable, false);
  const saved = await native.pickSave('notes.md');
  assert.equal(saved.writable, true);
  assert.equal(saved.name, 'notes.md');
  assert.equal((await adapter().native.pickOpen()).writable, true);
});
