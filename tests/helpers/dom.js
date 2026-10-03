/*
 * tests/helpers/dom.js — loads index.html + app.js inside jsdom.
 *
 * jsdom is a dev-only dependency: when it is not installed the DOM tests skip themselves instead
 * of failing, so `npm test` still runs the pure logic suites on a bare checkout.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

let jsdom = null;
try { jsdom = require('jsdom'); } catch (e) { jsdom = null; }

const hasDom = !!jsdom;

if (!hasDom) {
  console.warn(
    '\n[jsdom not installed] The end-to-end suite in tests/app.test.js will be SKIPPED.\n' +
    'Run `npm install` to enable it — a green run without it only covers the pure modules.\n'
  );
}

/** Polyfills for browser APIs jsdom does not implement. */
const POLYFILL = `
(function () {
  if (!window.matchMedia) {
    window.matchMedia = function (q) {
      return {
        media: q, matches: false, onchange: null,
        addEventListener: function () {}, removeEventListener: function () {},
        addListener: function () {}, removeListener: function () {},
        dispatchEvent: function () { return false; }
      };
    };
  }
  if (!window.URL.createObjectURL) window.URL.createObjectURL = function () { return 'blob:stub'; };
  if (!window.URL.revokeObjectURL) window.URL.revokeObjectURL = function () {};
}());
`;

function appHtml() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  return html.replace('<head>', '<head>\n<script>' + POLYFILL + '</script>');
}

/**
 * Boot the whole application in jsdom.
 * @returns {Promise<{window: Document['defaultView'], document: Document, errors: string[]}>}
 */
function loadApp(options) {
  options = options || {};
  if (!jsdom) return Promise.reject(new Error('jsdom is not installed'));
  const { JSDOM, VirtualConsole } = jsdom;
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', function (e) {
    const msg = (e && (e.message || String(e))) || '';
    // jsdom limitations, not application errors:
    //  - it cannot parse modern CSS (color-mix, :has)
    //  - it does not implement navigation (an <a download> click) or window.prompt/confirm
    if (/Could not parse CSS/i.test(msg)) return;
    if (/Not implemented/i.test(msg)) return;
    errors.push(msg);
  });
  vc.on('error', function () { errors.push(Array.prototype.join.call(arguments, ' ')); });

  const dom = new JSDOM(appHtml(), {
    url: 'file://' + path.join(ROOT, 'index.html'),
    beforeParse: options.beforeParse,
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    virtualConsole: vc
  });

  return waitFor(function () { return dom.window.RVApp; }, 8000).then(function () {
    return { window: dom.window, document: dom.window.document, errors: errors, dom: dom };
  });
}

function waitFor(predicate, timeout) {
  return new Promise(function (resolve, reject) {
    const started = Date.now();
    (function tick() {
      let value = null;
      try { value = predicate(); } catch (e) { value = null; }
      if (value) { resolve(value); return; }
      if (Date.now() - started > timeout) { reject(new Error('timed out waiting for the app')); return; }
      setTimeout(tick, 25);
    })();
  });
}

function settle(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms || 120); });
}

/** Dispatch a real, bubbling click — the same path a user click takes. */
function click(window, node) {
  node.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
}

module.exports = { hasDom, loadApp, settle, click, ROOT };
