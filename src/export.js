/*
 * src/export.js — standalone HTML export.
 *
 * The exported file must be readable with no network access and no sibling folders, so it carries
 * its own compact stylesheet instead of linking to the app's vendor CSS. If the export happens to
 * sit next to a copy of vendor/, the GitHub stylesheet is linked as well and simply wins.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.RV = root.RV || {}; root.RV.Export = factory(); }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var BASE_CSS = [
    ':root { color-scheme: light dark; }',
    '*, *::before, *::after { box-sizing: border-box; }',
    'body { margin: 0; padding: 32px 20px 80px; display: flex; justify-content: center;',
    '  background: #fff; color: #1f2328;',
    '  font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans", "Vazirmatn",',
    '  "Noto Sans Arabic", Tahoma, Arial, sans-serif; }',
    'main { width: 100%; max-width: 880px; min-width: 0; }',
    'h1, h2, h3, h4, h5, h6 { margin: 1.6em 0 .6em; line-height: 1.25; font-weight: 600; }',
    'h1 { font-size: 2em; padding-bottom: .3em; border-bottom: 1px solid #d1d9e0; }',
    'h2 { font-size: 1.5em; padding-bottom: .3em; border-bottom: 1px solid #d1d9e0; }',
    'h3 { font-size: 1.25em; } h4 { font-size: 1em; } h5 { font-size: .875em; } h6 { font-size: .85em; color: #59636e; }',
    'p, ul, ol, table, pre, blockquote { margin: 0 0 16px; }',
    'a { color: #0969da; text-decoration: none; } a:hover { text-decoration: underline; }',
    'img { max-width: 100%; }',
    'hr { height: 4px; border: 0; background: #d1d9e0; margin: 24px 0; }',
    'code, pre, kbd { font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace; }',
    ':not(pre) > code { background: rgba(129,139,152,.16); padding: .2em .4em; border-radius: 6px; font-size: 85%; }',
    'pre { background: #f6f8fa; border: 1px solid #d1d9e0; border-radius: 8px; padding: 14px 16px;',
    '  overflow: auto; font-size: 85%; line-height: 1.5; }',
    'pre code { background: none; padding: 0; font-size: 100%; }',
    '.code-block { margin: 0 0 16px; }',
    '.code-block pre { margin: 0; border-top-left-radius: 0; border-top-right-radius: 0; }',
    '.code-bar { display: flex; align-items: center; justify-content: space-between;',
    '  padding: 6px 12px; border: 1px solid #d1d9e0; border-bottom: 0; border-radius: 8px 8px 0 0;',
    '  background: #eef1f4; font-size: 12px; color: #59636e; }',
    '.code-copy { display: none; }',
    'blockquote { padding: 0 1em; color: #59636e; border-left: .25em solid #d1d9e0; margin-inline-start: 0; }',
    'ul, ol { padding-inline-start: 2em; }',
    'li + li { margin-top: .25em; }',
    '.contains-task-list { list-style: none; padding-inline-start: 0; }',
    '.task-list-item { padding-inline-start: 1.6em; position: relative; }',
    '.task-list-item input { position: absolute; inset-inline-start: 0; margin: .35em 0 0; }',
    '.table-wrap { overflow: auto; }',
    'table { border-collapse: collapse; display: table; width: max-content; max-width: 100%; }',
    'th, td { border: 1px solid #d1d9e0; padding: 6px 13px; }',
    'tr:nth-child(2n) { background: #f6f8fa; }',
    'kbd { border: 1px solid #d1d9e0; border-bottom-width: 2px; border-radius: 6px;',
    '  background: #f6f8fa; padding: .1em .4em; font-size: 85%; }',
    '.heading-anchor { display: none; }',
    '@media (prefers-color-scheme: dark) {',
    '  body[data-theme="dark"], body[data-theme="system"] { background: #0d1117; color: #e6edf3; }',
    '  body[data-theme="dark"] a, body[data-theme="system"] a { color: #4493f8; }',
    '  body[data-theme="dark"] h1, body[data-theme="system"] h1,',
    '  body[data-theme="dark"] h2, body[data-theme="system"] h2 { border-color: #3d444d; }',
    '  body[data-theme="dark"] pre, body[data-theme="system"] pre { background: #161b22; border-color: #3d444d; }',
    '  body[data-theme="dark"] .code-bar, body[data-theme="system"] .code-bar { background: #010409; border-color: #3d444d; color: #9198a1; }',
    '  body[data-theme="dark"] blockquote, body[data-theme="system"] blockquote { color: #9198a1; border-color: #3d444d; }',
    '  body[data-theme="dark"] hr, body[data-theme="system"] hr { background: #3d444d; }',
    '  body[data-theme="dark"] th, body[data-theme="system"] th,',
    '  body[data-theme="dark"] td, body[data-theme="system"] td { border-color: #3d444d; }',
    '  body[data-theme="dark"] tr:nth-child(2n), body[data-theme="system"] tr:nth-child(2n) { background: #161b22; }',
    '}'
  ].join('\n');

  function escAttr(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * @param {Object} opts.title document title
   * @param {String} opts.html  already rendered + sanitised preview HTML
   * @param {String} opts.theme 'light' | 'dark' | 'system'
   * @param {String} [opts.lang] content language hint
   * @param {String} [opts.dir]  'ltr' | 'rtl' | 'auto'
   */
  function build(opts) {
    var theme = opts.theme === 'dark' || opts.theme === 'light' ? opts.theme : 'system';
    var dir = opts.dir === 'rtl' || opts.dir === 'ltr' ? opts.dir : 'auto';
    var title = escAttr(opts.title || 'README');
    return [
      '<!DOCTYPE html>',
      '<html lang="' + escAttr(opts.lang || 'en') + '" dir="' + dir + '" data-theme="' + theme + '">',
      '<head>',
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      '<meta name="generator" content="README Viewer">',
      '<title>' + title + '</title>',
      '<link rel="stylesheet" href="vendor/github-markdown-' + (theme === 'dark' ? 'dark' : 'light') + '.css">',
      '<style>',
      BASE_CSS,
      '</style>',
      '</head>',
      '<body data-theme="' + theme + '">',
      '<main class="markdown-body" dir="' + dir + '">',
      String(opts.html == null ? '' : opts.html),
      '</main>',
      '</body>',
      '</html>',
      ''
    ].join('\n');
  }

  return { build: build, BASE_CSS: BASE_CSS };
}));
