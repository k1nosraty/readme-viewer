/* Rebuild the checked-in offline IIFE from pinned temporary build dependencies. */
const path = require('node:path');
const { build } = require('esbuild');
const root = path.resolve(__dirname, '..');
const modules = path.resolve(process.argv[2] || path.join(root, 'node_modules'));
build({
  stdin: { contents: "import mermaid from 'mermaid'; import elkLayouts from '@mermaid-js/layout-elk'; mermaid.registerLayoutLoaders(elkLayouts); window.mermaid = mermaid;", resolveDir: path.dirname(modules), loader: 'js' },
  nodePaths: [modules], bundle: true, format: 'iife', platform: 'browser', target: 'es2020',
  minify: true, legalComments: 'eof', outfile: path.join(root, 'vendor/mermaid/mermaid.full.js')
}).catch(error => { console.error(error); process.exitCode = 1; });
