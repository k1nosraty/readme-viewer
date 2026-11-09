const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function adapter(overrides = {}) {
  const calls = [];
  const window = { __TAURI_INTERNALS__: {}, RV: {} };
  const mocks = {
    window, DOMException, Blob, console, crypto: require('node:crypto').webcrypto,
    convertFileSrc: path => `asset:${path}`,
    invoke: async (command, args) => {
      if (command === 'write_document_atomic') {
        calls.push([args.path, Array.from(args.bytes)]);
        return require('node:crypto').createHash('sha256').update(Buffer.from(args.bytes)).digest('hex');
      }
      return [];
    },
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

test('desktop browser preview only forwards HTML to the dedicated native command', async () => {
  const invoked = [];
  const { native } = adapter({ invoke: async (command, args) => invoked.push([command, args]) });
  const html = '<!DOCTYPE html><head></head><body>Note</body>';
  assert.equal(native.canPreviewInBrowser(), true);
  assert.equal(await native.previewInBrowser(html), true);
  assert.equal(invoked[0][0], 'preview_in_browser');
  assert.equal(invoked[0][1].html, html);
});

test('Android cannot use desktop local browser-preview file access', async () => {
  let invoked = false;
  const { native } = adapter({
    window: { __TAURI_INTERNALS__: {}, RV: {}, navigator: { userAgent: 'Android' } },
    invoke: async () => { invoked = true; }
  });
  assert.equal(native.canPreviewInBrowser(), false);
  await assert.rejects(native.previewInBrowser('<!DOCTYPE html>'), /desktop app/);
  assert.equal(invoked, false);
});

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
test('native cancellation and failed atomic commits reject without pretending success', async () => {
  const cancelled = adapter({ save: async () => null }).native;
  await assert.rejects(cancelled.download('text', 'a.md', 'text/plain'), { name: 'AbortError' });
  const failed = adapter({ invoke: async () => { throw new Error('permission denied'); } }).native;
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
  assert.equal(calls.length, 0, 'the provider is written only when the writer closes');
  await writer.close();
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

for (const [platform, glass, tint] of [
  ['Windows NT', true, ''],
  ['X11; Linux x86_64', true, 'tinted'],
  ['X11; Linux x86_64', false, undefined]
]) {
  test(`${platform} reveals the shared title bar before opening launch documents (glass: ${glass})`, async () => {
    const calls = [];
    const nodes = new Map();
    const documentElement = { dataset: { theme: 'dark' } };
    const { native } = adapter({
      window: { __TAURI_INTERNALS__: {}, RV: {}, navigator: { userAgent: platform } },
      document: {
        documentElement,
        getElementById(id) {
          if (!nodes.has(id)) nodes.set(id, { hidden: true, dataset: { i18nAria: 'window.maximize' }, addEventListener() {} });
          return nodes.get(id);
        }
      },
      MutationObserver: class { observe() {} },
      invoke: async command => {
        if (command === 'set_window_backdrop') return glass;
        if (command === 'startup_paths') return ['/docs/start.md', '/docs/queued.md'];
      },
      listen: async () => {},
      getCurrentWindow: () => ({
        onDragDropEvent: async () => {}, onCloseRequested: async () => {},
        onResized: async () => {}, isMaximized: async () => false,
        show: async () => {
          assert.equal(documentElement.dataset.desktopTitlebar, '');
          assert.equal(documentElement.dataset.windowGlass, tint);
          assert.equal(nodes.get('captionButtons').hidden, false);
          calls.push('show');
        }
      })
    });
    await native.initialize({ openPath: async path => { calls.push(path); } });
    assert.deepEqual(calls, ['show', '/docs/start.md', '/docs/queued.md']);
  });
}
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
    invoke: async command => { operations.push([command]); }
  });
  await native.download('<p>hello</p>', 'export.html', 'text/html;charset=utf-8');
  assert.deepEqual(operations, [['dialog', 'html,htm'], ['write_document_atomic'], ['authorize_document_directory']]);
});
test('SVG diagram exports use the SVG save filter and write through the native adapter', async () => {
  const operations = [];
  const { native } = adapter({
    save: async options => { operations.push(['dialog', options.defaultPath, options.filters[0].extensions.join(',')]); return '/saved/diagram.svg'; },
    invoke: async (command, args) => {
      if (command === 'write_document_atomic') operations.push(['write', args.path, new TextDecoder().decode(new Uint8Array(args.bytes))]);
    }
  });
  await native.download('<svg/>', 'diagram.svg', 'image/svg+xml;charset=utf-8');
  assert.deepEqual(operations, [['dialog', 'diagram.svg', 'svg'], ['write', '/saved/diagram.svg', '<svg/>']]);
});
test('a saved file remains successful when image scope authorization fails', async () => {
  const { native } = adapter({
    invoke: async command => { if (command === 'authorize_document_directory') throw new Error('scope unavailable'); },
    console: { warn() {}, error() {} }
  });
  assert.equal(await native.download('hello', 'README.md', 'text/markdown'), true);
});

test('desktop writes stage bytes until close, use read revisions, and expose conflicts for an explicit overwrite', async () => {
  const commits = [];
  let fail = true;
  const { native } = adapter({ invoke: async (command, args) => {
    if (command !== 'write_document_atomic') return;
    commits.push(args);
    if (fail) throw 'RV_FILE_CHANGED';
    return 'saved-revision';
  } });
  const handle = await native.pickOpen();
  const file = await handle.getFile();
  const writer = await handle.createWritable({ expectedBytes: new Uint8Array(await file.arrayBuffer()) });
  await writer.write(new Blob(['edited']));
  assert.equal(commits.length, 0);
  await assert.rejects(writer.close(), { name: 'FileConflictError' });
  assert.equal(commits[0].expectedHash, require('node:crypto').createHash('sha256').update(Buffer.from([239, 187, 191, 97, 13, 10])).digest('hex'));
  fail = false;
  const overwrite = await handle.createWritable({ overwrite: true });
  await overwrite.write(new Blob(['edited'])); await overwrite.close();
  assert.equal(commits[1].expectedHash, null);
  const subsequent = await handle.createWritable();
  await subsequent.write(new Blob(['again'])); await subsequent.close();
  assert.equal(commits[2].expectedHash, 'saved-revision');
});

test('a later unaccepted disk read cannot advance the document revision used for saving', async () => {
  let contents = new Uint8Array(Buffer.from('original')), expected;
  const { native } = adapter({
    readFile: async () => contents,
    invoke: async (command, args) => { if (command === 'write_document_atomic') expected = args.expectedHash; }
  });
  const handle = await native.pickOpen(), accepted = await handle.getFile();
  const baseline = new Uint8Array(await accepted.arrayBuffer());
  contents = new Uint8Array(Buffer.from('external edit'));
  await handle.getFile();
  const writer = await handle.createWritable({ expectedBytes: baseline });
  await writer.write(new Blob(['ours'])); await writer.close();
  assert.equal(expected, require('node:crypto').createHash('sha256').update('original').digest('hex'));
});
test('Android Back waits for close/save decision and serializes repeated presses', async () => {
  let back, finishDecision, exited = 0, decisions = 0;
  const errors = [];
  const androidWindow = { __TAURI_INTERNALS__: {}, RV: {}, navigator: { userAgent: 'Linux; Android' } };
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
test('clicked links may climb with ".." but images may not', async () => {
  const { native } = adapter({ open: async () => '/repo/docs/README.md' });
  const handle = await native.pickOpen();
  assert.equal(native.resolveLocalUrl('../CONTRIBUTING.md', handle, true), '/repo/CONTRIBUTING.md');
  assert.equal(native.resolveLocalUrl('../../x.md', handle, true), '/x.md');
  assert.equal(native.resolveLocalUrl('../../../x.md', handle, true), null);
  assert.equal(native.resolveLocalUrl('../logo.png', handle), null);
  assert.equal(native.resolveLocalUrl('/etc/passwd', handle, true), null);
});

test('native update bridge reads installed platform/version and uses a bounded signed check', async () => {
  const commands = [], checks = [];
  const { native } = adapter({
    getVersion: async () => '1.4.0',
    invoke: async command => { commands.push(command); return ['linux', 'x86_64']; },
    check: async options => { checks.push(options); return null; }
  });
  const info = await native.appInfo();
  assert.equal(info.version, '1.4.0'); assert.equal(info.platform, 'linux'); assert.equal(info.arch, 'x86_64');
  assert.equal(await native.checkUpdate(), null); assert.equal(checks[0].timeout, 15000);
  await native.restart(); assert.deepEqual(commands, ['update_platform', 'restart_app']);
});
