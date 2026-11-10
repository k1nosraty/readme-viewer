'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const harness = require('./helpers/dom');
const { manifest } = require('../scripts/updater-manifest');

async function load(t, options = {}) {
  const calls = [], storage = new Map([['rv.updates.auto', JSON.stringify(!!options.automatic)]]);
  const result = await harness.loadApp({ beforeParse(window) {
    Object.defineProperty(window, 'localStorage', { value: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) } });
    window.fetch = options.fetch || (async (url, init) => {
      calls.push({ url, init });
      return { ok: true, json: async () => ({ tag_name: 'v1.5.0', body: '<img src=x onerror=alert(1)>', assets: options.assets || [] }) };
    });
    if (options.native) window.RV = { Native: Object.assign({ available: () => true, initialize: async () => {},
      appInfo: async () => ({ version: '1.4.0', platform: 'windows', arch: 'x86_64' }),
      checkUpdate: async () => null, openExternal: async url => calls.push(url), restart: async () => calls.push('restart')
    }, options.native) };
  } });
  t.after(() => result.window.close());
  return { ...result, calls, storage, updates: result.window.RV.Updates, app: result.window.RVApp };
}

test('About shows the installed version, developer GitHub link and a trapped modal', async t => {
  const { window, document, app } = await load(t);
  document.getElementById('btnAbout').click();
  assert.equal(document.getElementById('aboutVersion').textContent, require('../package.json').version);
  assert.equal(document.getElementById('developerLink').href, 'https://github.com/k1nosraty');
  assert.equal(document.getElementById('serviceModal').hidden, false);
  const key = value => document.dispatchEvent(new window.KeyboardEvent('keydown', { key: value, ctrlKey: true, bubbles: true, cancelable: true }));
  const mode = app.state.mode; key('1'); assert.equal(app.state.mode, mode);
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(document.getElementById('serviceModal').hidden, true);
});

test('stable version checks compare numeric components and never offer a downgrade or prerelease', async t => {
  const { updates } = await load(t);
  assert.equal(updates.newer('v1.10.0', '1.9.9'), true);
  for (const version of ['1.4.0', '1.3.99', '2.0.0-beta', 'foo', '01.5.0', '9'.repeat(100) + '.0.0']) assert.equal(updates.newer(version, '1.4.0'), false);
  assert.equal(updates.newer('1.4.0', '1.4.0-beta.1'), true);
});

test('automatic native checks announce an update without interrupting work or sending document text', async t => {
  const { document, calls, updates } = await load(t, { automatic: true, native: {} });
  await updates.check(false);
  assert.equal(document.getElementById('serviceModal').hidden, true);
  assert.equal(document.getElementById('updateBanner').hidden, false);
  assert.equal(calls[0].url, 'https://api.github.com/repos/k1nosraty/readme-viewer/releases/latest');
  assert.equal(calls[0].init.credentials, 'omit'); assert.equal(calls[0].init.body, undefined);
  document.getElementById('btnUpdateDetails').click();
  assert.equal(document.getElementById('updateNotes').querySelector('img'), null, 'release notes are plain text');
  assert.match(document.getElementById('updateNotes').textContent, /onerror/);
  document.getElementById('btnDismissUpdate').click(); assert.equal(document.getElementById('updateBanner').hidden, true);
});

test('manual checks remain usable offline and report network failures instead of success', async t => {
  let rejectRequest;
  const { document, updates } = await load(t, { fetch: () => new Promise((resolve, reject) => { rejectRequest = reject; }) });
  const pending = updates.check(false); document.getElementById('btnCheckUpdates').click();
  assert.equal(document.getElementById('serviceModal').hidden, false, 'manual check opens an ongoing automatic check');
  rejectRequest(new Error('offline')); assert.equal(await pending, false);
  assert.match(document.getElementById('updateStatus').textContent, /Could not check/);
  assert.equal(document.getElementById('btnUpdateCheck').disabled, false);
});

test('signed installation waits for document confirmation, flushes recovery and offers restart', async t => {
  const order = [];
  const update = { version: '1.5.0', body: 'Changes', download: async callback => { order.push('download'); callback({ event: 'Started', data: { contentLength: 10 } }); callback({ event: 'Progress', data: { chunkLength: 10 } }); }, install: async () => order.push('install'), close: async () => {} };
  const { app, window, updates, calls, document } = await load(t, { native: { checkUpdate: async () => update } });
  await updates.check(true);
  app.confirmAllDirty = async () => { order.push('confirm'); return false; };
  await updates.install(); assert.deepEqual(order, ['download', 'confirm']);
  app.confirmAllDirty = async () => { order.push('confirm'); return true; };
  window.RV.Reading.saveSession = async () => { order.push('flush'); return true; };
  await updates.install();
  assert.deepEqual(order.slice(2), ['download', 'confirm', 'flush', 'install']);
  assert.equal(calls.length, 0, 'signed desktop checks do not need a second GitHub API request');
  assert.match(document.getElementById('btnUpdateInstall').textContent, /Restart/);
  await updates.install(); assert.equal(calls.at(-1), 'restart');
});

test('failed signature verification never reaches document confirmation or installation', async t => {
  let installed = false, confirmed = false;
  const { app, document, updates } = await load(t, { native: { checkUpdate: async () => ({ version: '1.5.0', download: async () => { throw new Error('signature mismatch'); }, install: async () => { installed = true; }, close: async () => {} }) } });
  app.confirmAllDirty = async () => { confirmed = true; return true; };
  await updates.check(true); await updates.install();
  assert.equal(installed, false); assert.equal(confirmed, false);
  assert.match(document.getElementById('updateStatus').textContent, /could not be verified/);
  assert.equal(document.getElementById('btnServiceDone').disabled, false);
});

test('Android selects the matching ABI and ignores foreign asset URLs', async t => {
  const name = 'README-Viewer-1.5.0-Android-ARM64-Debug-Preview.apk';
  const { updates, calls } = await load(t, { native: { appInfo: async () => ({ version: '1.4.0', platform: 'android', arch: 'aarch64' }) }, assets: [{ name, browser_download_url: 'https://evil.example/file.apk' }] });
  await updates.check(true); await updates.install();
  assert.equal(calls.at(-1), 'https://github.com/k1nosraty/readme-viewer/releases/tag/v1.5.0');
});

test('release manifests require every signed desktop installer and preserve safe download paths', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'readme-updates-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  for (const name of ['README.Viewer_1.5.0_x64-setup.exe', 'README.Viewer_1.5.0_amd64.AppImage', 'README.Viewer_1.5.0_amd64.deb']) {
    fs.writeFileSync(path.join(directory, name), 'installer'); fs.writeFileSync(path.join(directory, name + '.sig'), 'c2lnbmF0dXJl');
  }
  const value = manifest(directory, '1.5.0', 'notes');
  assert.equal(Object.keys(value.platforms).length, 3);
  assert.equal(value.platforms['linux-x86_64-deb'].url,
    'https://github.com/k1nosraty/readme-viewer/releases/download/v1.5.0/README.Viewer_1.5.0_amd64.deb');
  const deb = path.join(directory, 'README.Viewer_1.5.0_amd64.deb');
  const spacedDeb = path.join(directory, 'README Viewer_1.5.0_amd64.deb');
  fs.renameSync(deb, spacedDeb);
  assert.throws(() => manifest(directory, '1.5.0', ''), /public GitHub names/);
  fs.renameSync(spacedDeb, deb);
  fs.unlinkSync(deb + '.sig');
  assert.throws(() => manifest(directory, '1.5.0', ''), /ENOENT/);
  assert.throws(() => manifest(directory, '1.5.0-beta', ''), /stable/);
});

test('release version agrees across npm, Tauri and the native package metadata', () => {
  const version = require('../package.json').version;
  assert.equal(require('../package-lock.json').packages[''].version, version);
  assert.equal(require('../src-tauri/tauri.conf.json').version, version);
  const cargo = fs.readFileSync(path.join(harness.ROOT, 'src-tauri/Cargo.toml'), 'utf8');
  assert.equal(cargo.match(/^version = "([^"]+)"/m)[1], version);
  const lock = fs.readFileSync(path.join(harness.ROOT, 'src-tauri/Cargo.lock'), 'utf8');
  assert.equal(lock.match(/name = "readme-viewer"\nversion = "([^"]+)"/)[1], version);
});
