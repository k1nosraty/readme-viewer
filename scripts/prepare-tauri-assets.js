const { cp, mkdir, readdir, readFile, rm, writeFile } = require('node:fs/promises');
const path = require('node:path');
const { build } = require('esbuild');
const highlight = require('../vendor/highlight.min.js');

async function prepare() {
  const root = path.resolve(__dirname, '..');
  const output = path.join(root, 'native-dist');
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  // Explicit allowlist: never ship repository metadata, credentials or build trees.
  const grammars = path.join(root, 'vendor', 'langs');
  for (const name of ['app.js', 'styles.css', 'src', 'vendor']) {
    await cp(path.join(root, name), path.join(output, name), {
      recursive: true,
      // The loader asks for a standalone grammar only when the startup bundle lacks it.
      filter: source => path.dirname(source) !== grammars || !source.endsWith('.min.js') ||
        !highlight.getLanguage(path.basename(source, '.min.js'))
    });
  }
  // The bundled bridge replaces its build-only source; runtime assets and licenses stay intact.
  await rm(path.join(output, 'src/native-entry.js'));
  let html = await readFile(path.join(root, 'index.html'), 'utf8');
  const tag = '<script src="src/native.js"></script>';
  if (!/src\/native\.js/.test(html)) html = html.replace(/<script\s+src="(?:\.\/)?app\.js"/, `${tag}\n<script src="app.js"`);
  html = html.replace(/(<meta name="application-version" content=")[^"]+/, '$1' + require('../package.json').version);
  html = html.replace(/<script[^>]+src="(?:\.\/)?src\/native\.js"[^>]*><\/script>/, tag);
  await build({ entryPoints: [path.join(root, 'src/native-entry.js')], outfile: path.join(output, 'src/native.js'), bundle: true, format: 'iife', platform: 'browser', target: 'es2020', minify: true });
  // Minify the shipped scripts and stylesheet in place; the remaining vendor files are already minified.
  const { transform } = require('esbuild');
  const minifyFiles = ['app.js', 'styles.css', 'vendor/github-markdown.css', ...(await readdir(path.join(output, 'src'))).filter(n => n.endsWith('.js') && n !== 'native.js').map(n => `src/${n}`)];
  for (const rel of minifyFiles) {
    const file = path.join(output, rel);
    const code = await readFile(file, 'utf8');
    const out = await transform(code, { loader: rel.endsWith('.css') ? 'css' : 'js', minify: true, target: 'es2017', charset: 'utf8' });
    await writeFile(file, out.code);
  }

  // Keep classic scripts in HTML order and under src/ for relative lazy-load URLs.
  const startupBlock = html.match(/(?:<script src="[^"\r\n]+"><\/script>\s*)+(?=<\/body>)/);
  if (!startupBlock) throw new Error('Expected startup scripts at the end of index.html');
  const scripts = Array.from(startupBlock[0].matchAll(/<script src="([^"]+)"><\/script>/g), ([, src]) => path.join(output, src));
  const bundle = 'src/startup.js';
  const sources = await Promise.all(scripts.map(file => readFile(file, 'utf8')));
  await writeFile(path.join(output, bundle), sources.join('\n;\n'));
  await Promise.all(scripts.map(file => rm(file)));
  html = html.replace(startupBlock[0], `<script src="${bundle}"></script>\n`);
  html = html.replace('</head>', `<link rel="preload" href="${bundle}" as="script">\n</head>`);
  await writeFile(path.join(output, 'index.html'), html);
  console.log('Prepared native-dist with one startup script and offline assets.');
}
prepare().catch((error) => { console.error(error); process.exitCode = 1; });
