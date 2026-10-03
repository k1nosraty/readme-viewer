'use strict';
// Android 10 emulator WebViews predate optional chaining. Transpile syntax for the APK;
// the original browser files and third-party sources remain unchanged.
const fs = require('node:fs');
const path = require('node:path');
const { transformSync } = require('esbuild');
const assets = path.resolve(__dirname, '../android/app/src/main/assets');
function visit(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) visit(file);
    else if (entry.name.endsWith('.js')) {
      const output = transformSync(fs.readFileSync(file, 'utf8'), {
        target: 'chrome74', legalComments: 'inline', sourcefile: entry.name
      });
      fs.writeFileSync(file, output.code);
    }
  }
}
visit(assets);
console.log('Prepared Android JavaScript assets for Chromium 74 syntax.');
