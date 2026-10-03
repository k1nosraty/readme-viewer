const { cp, mkdir, readFile, rm, writeFile } = require('node:fs/promises');
const path = require('node:path');
const { build } = require('esbuild');

async function prepare() {
  const root = path.resolve(__dirname, '..');
  const output = path.join(root, 'native-dist');
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  // Explicit allowlist: never ship repository metadata, credentials or build trees.
  for (const name of ['app.js', 'styles.css', 'src', 'vendor']) {
    await cp(path.join(root, name), path.join(output, name), { recursive: true });
  }
  let html = await readFile(path.join(root, 'index.html'), 'utf8');
  const tag = '<script src="src/native.js"></script>';
  if (!/src\/native\.js/.test(html)) html = html.replace(/<script\s+src="(?:\.\/)?app\.js"/, `${tag}\n<script src="app.js"`);
  html = html.replace(/<script[^>]+src="(?:\.\/)?src\/native\.js"[^>]*><\/script>/, tag);
  await writeFile(path.join(output, 'index.html'), html);
  await build({ entryPoints: [path.join(root, 'src/native-entry.js')], outfile: path.join(output, 'src/native.js'), bundle: true, format: 'iife', platform: 'browser', target: 'es2020', minify: true });
  console.log('Prepared native-dist with bundled native bridge and offline assets.');
}
prepare().catch((error) => { console.error(error); process.exitCode = 1; });
