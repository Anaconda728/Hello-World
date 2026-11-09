// Builds dist/Driftland.html: the whole game (three.js included) in one file
// that runs offline by double-clicking it, and that the desktop app loads.
import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (p) => readFile(new URL(p, root), 'utf8');

const result = await build({
  entryPoints: [new URL('js/main.js', root).pathname],
  bundle: true,
  format: 'iife',
  minify: true,
  target: 'es2020',
  write: false,
  legalComments: 'none',
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = await read('style.css');
const pkg = JSON.parse(await read('package.json'));

let html = await read('index.html');
html = html
  .replace(/<link rel="stylesheet" href="style.css">/, () => `<style>\n${css}\n</style>`)
  .replace(/<script type="importmap">[\s\S]*?<\/script>\s*/, '')
  .replace(/<script type="module" src="js\/main.js"><\/script>/, () => `<script>\n${js}\n</script>`)
  .replace('<title>Driftland</title>', `<title>Driftland</title>\n  <meta name="generator" content="Driftland ${pkg.version}">`);

if (html.includes('js/main.js') || html.includes('importmap')) throw new Error('Build failed to inline the game script');
await mkdir(new URL('dist/', root), { recursive: true });
await writeFile(new URL('dist/Driftland.html', root), html);
console.log(`dist/Driftland.html  ${(html.length / 1024).toFixed(0)} KB  (v${pkg.version})`);
