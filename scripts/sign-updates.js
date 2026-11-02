'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { measure } = require('./check-size');

// Preview builds remain unsigned; main releases require this secret in the workflow.
if (!process.env.TAURI_SIGNING_PRIVATE_KEY) {
  console.log('No updater key configured; skipping signatures for this preview.');
} else {
  const version = require('../package.json').version;
  const cli = path.join(path.dirname(require.resolve('@tauri-apps/cli/package.json')), 'tauri.js');
  for (const row of measure(process.argv[2])) {
    const result = spawnSync(process.execPath, [cli, 'signer', 'sign', '--app-version', version, row.file], { stdio: 'pipe', env: process.env });
    // Do not echo signer diagnostics: the key is supplied through the environment.
    if (result.status !== 0 || !fs.existsSync(row.file + '.sig')) throw new Error('Could not sign updater asset: ' + row.file);
    console.log('Signed updater asset: ' + row.file);
  }
}
