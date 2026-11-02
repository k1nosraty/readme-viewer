'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { gzipSync } = require('node:zlib');
const budgets = require('../packaging/size-budgets.json');
const ROOT = path.resolve(__dirname, '..');

function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? files(file) : entry.isFile() ? [file] : [];
  });
}
function measure(profile, root = ROOT) {
  if (profile === 'frontend') {
    const entries = files(path.join(root, 'native-dist'));
    if (!entries.length) throw new Error('No prepared frontend assets');
    return [{ file: 'native-dist (all assets)', bytes: entries.reduce((n, f) => n + fs.statSync(f).size, 0),
      gzipBytes: entries.reduce((n, f) => n + gzipSync(fs.readFileSync(f), { level: 9 }).length, 0),
      maxBytes: budgets.frontend }];
  }
  const rules = {
    windows: [['src-tauri/target/release/bundle/nsis', /-setup\.exe$/i, 'windows']],
    linux: [['src-tauri/target/release/bundle/deb', /\.deb$/, 'deb'],
      ['src-tauri/target/release/bundle/appimage', /\.AppImage$/, 'appimage']],
    android: [['dist', /-Android-ARM64-Debug-Preview\.apk$/, 'android-arm64'],
      ['dist', /-Android-X86_64-Debug-Preview\.apk$/, 'android-x86_64']]
  }[profile];
  if (!rules) throw new Error('Choose frontend, windows, linux or android');
  return rules.flatMap(([directory, pattern, budget]) => {
    const entries = files(path.join(root, directory)).filter(file => pattern.test(path.basename(file)));
    if (!entries.length) throw new Error('Missing build artifact: ' + budget);
    return entries.map(file => ({ file: path.relative(root, file).replace(/\\/g, '/'),
      bytes: fs.statSync(file).size, maxBytes: budgets[budget] }));
  });
}
function enforce(rows) {
  const oversized = rows.filter(row => row.bytes > row.maxBytes);
  if (oversized.length) throw new Error(oversized.map(row =>
    `${row.file}: ${row.bytes} bytes exceeds the ${row.maxBytes}-byte budget`).join('\n'));
}
function main(profile) {
  const rows = measure(profile);
  const mib = n => (n / 1048576).toFixed(2);
  const report = ['## Package size: ' + profile, '', '| Artifact | MiB | Limit MiB |', '| --- | ---: | ---: |',
    ...rows.map(row => `| ${row.file} | ${mib(row.bytes)} | ${mib(row.maxBytes)} |`), ''].join('\n');
  console.log(report);
  if (rows[0].gzipBytes !== undefined) console.log('Frontend gzip estimate (not installer size): ' + mib(rows[0].gzipBytes) + ' MiB');
  const output = path.join(ROOT, 'native-test-results');
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'size-' + profile + '.json'), JSON.stringify({ profile, rows }, null, 2) + '\n');
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report + '\n');
  enforce(rows);
}
if (require.main === module) {
  try { main(process.argv[2]); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { measure, enforce };
