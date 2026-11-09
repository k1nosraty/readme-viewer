'use strict';
// The locked CLI template currently targets an unpublished SDK. Keep the
// developer build and CI preview on the stable SDK used by Tauri libraries.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const project = path.resolve(__dirname, '../src-tauri/gen/android');
const filename = path.join(project, 'app/build.gradle.kts');
let text = fs.readFileSync(filename, 'utf8');
for (const setting of ['compileSdk', 'targetSdk']) {
  const pattern = new RegExp(`^([\\t ]*${setting}[\\t ]*=[\\t ]*)\\d+([\\t ]*\\r?)$`, 'gm');
  const matches = Array.from(text.matchAll(pattern));
  assert.equal(matches.length, 1, `Expected exactly one ${setting} in generated Android app`);
  text = text.replace(pattern, (_, prefix, suffix) => `${prefix}36${suffix}`);
  const normalized = new RegExp(`^[\\t ]*${setting}[\\t ]*=[\\t ]*36[\\t ]*\\r?$`, 'gm');
  assert.equal(Array.from(text.matchAll(normalized)).length, 1, `${setting} did not normalize to 36`);
}
fs.writeFileSync(filename, text, 'utf8');

// Retry transient distribution download errors inside the wrapper, before building.
const wrapperFile = path.join(project, 'gradle/wrapper/gradle-wrapper.properties');
const wrapper = fs.readFileSync(wrapperFile, 'utf8')
  .replace(/^(?:networkTimeout|retries|retryBackOffMs)[\t ]*=.*\r?\n?/gm, '')
  .trimEnd();
fs.writeFileSync(wrapperFile, wrapper + '\nnetworkTimeout=30000\nretries=3\nretryBackOffMs=5000\n');
console.log('Configured Android SDK 36 and Gradle download retries.');
