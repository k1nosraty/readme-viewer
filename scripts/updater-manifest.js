'use strict';
const fs = require('node:fs');
const path = require('node:path');

function manifest(directory, version, notes, date = new Date().toISOString()) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) throw new Error('Updater releases require a stable semantic version');
  const names = fs.readdirSync(directory), platforms = {};
  for (const [target, pattern] of [
    ['windows-x86_64-nsis', /_x64-setup\.exe$/],
    ['linux-x86_64-appimage', /_amd64\.AppImage$/],
    ['linux-x86_64-deb', /_amd64\.deb$/]
  ]) {
    const matches = names.filter(name => pattern.test(name));
    if (matches.length !== 1) throw new Error('Expected one updater asset for ' + target);
    const name = matches[0];
    if (!/^[A-Za-z0-9._-]+$/.test(name)) throw new Error('Updater assets must use their public GitHub names: ' + name);
    const signature = fs.readFileSync(path.join(directory, name + '.sig'), 'utf8').trim();
    if (!signature || !/^[A-Za-z0-9+/=]+$/.test(signature)) throw new Error('Invalid signature for ' + name);
    platforms[target] = { signature, url: 'https://github.com/k1nosraty/readme-viewer/releases/download/v' + version + '/' + encodeURIComponent(name) };
  }
  return { version, notes, pub_date: date, platforms };
}
if (require.main === module) {
  const directory = process.argv[2] || 'dist';
  const value = manifest(directory, require('../package.json').version, fs.readFileSync('RELEASE-NOTES.md', 'utf8'));
  fs.writeFileSync(path.join(directory, 'latest.json'), JSON.stringify(value, null, 2) + '\n');
  console.log('Prepared signed update manifest for ' + value.version);
}
module.exports = { manifest };
