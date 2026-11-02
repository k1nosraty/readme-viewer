'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { measure, enforce } = require('../scripts/check-size');

test('size checks measure real files, ignore checksums, and reject oversized or missing installers', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'readme-size-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const directory = path.join(root, 'src-tauri/target/release/bundle/nsis');
  fs.mkdirSync(directory, { recursive: true });
  assert.throws(() => measure('windows', root), /Missing build artifact/);
  const installer = path.join(directory, 'Viewer_x64-setup.exe');
  fs.writeFileSync(installer, 'fixture');
  fs.writeFileSync(installer + '.sha256', 'checksum');
  const rows = measure('windows', root);
  assert.equal(rows.length, 1); assert.equal(rows[0].bytes, 7);
  assert.doesNotThrow(() => enforce(rows));
  fs.truncateSync(installer, rows[0].maxBytes + 1);
  assert.throws(() => enforce(measure('windows', root)), /exceeds/);
  assert.throws(() => measure('unknown', root), /Choose/);
});

test('frontend budgets count all shipped assets and Android requires both ABI packages', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'readme-assets-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'native-dist/vendor'), { recursive: true });
  fs.writeFileSync(path.join(root, 'native-dist/index.html'), 'hello');
  fs.writeFileSync(path.join(root, 'native-dist/vendor/diagram.js'), 'diagram');
  const rows = measure('frontend', root);
  assert.equal(rows[0].bytes, 12); assert.ok(rows[0].gzipBytes > 0);
  fs.mkdirSync(path.join(root, 'dist'));
  fs.writeFileSync(path.join(root, 'dist/README-Viewer-1.4.0-Android-ARM64-Debug-Preview.apk'), 'arm');
  assert.throws(() => measure('android', root), /android-x86_64/);
  fs.writeFileSync(path.join(root, 'dist/README-Viewer-1.4.0-Android-X86_64-Debug-Preview.apk'), 'x86');
  assert.equal(measure('android', root).length, 2);
});
