// Builds the portable release: one classic <script> bundle so the game runs straight from
// disk (double-click the HTML file, no server or install), plus bundled fonts and a zip.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const name = `NeonSprawl-v${pkg.version}`;
const distRoot = path.join(root, 'dist');
const out = path.join(distRoot, name);
const r = (...p) => path.join(root, ...p);

// keep the in-game version in sync with package.json
const cfg = fs.readFileSync(r('src/config.js'), 'utf8');
if (!cfg.includes(`VERSION = '${pkg.version}'`)) throw new Error(`src/config.js VERSION does not match package.json (${pkg.version})`);

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'fonts'), { recursive: true });

// 1. bundle: map the import-map specifiers onto the vendored three.js
const threeAlias = {
  name: 'three-alias',
  setup(b) {
    b.onResolve({ filter: /^three(\/.*)?$/ }, (args) => {
      if (args.path === 'three') return { path: r('vendor/three/three.module.min.js') };
      return { path: r('vendor/three', args.path.replace(/^three\//, '')) };
    });
  },
};
await build({
  entryPoints: [r('src/main.js')],
  bundle: true,
  format: 'iife',
  minify: true,
  target: ['es2020'],
  legalComments: 'none',
  plugins: [threeAlias],
  outfile: path.join(out, 'game.js'),
  logLevel: 'warning',
});

// 2. fonts (offline)
const fonts = [
  ['Orbitron', 500, '@fontsource/orbitron/files/orbitron-latin-500-normal.woff2'],
  ['Orbitron', 700, '@fontsource/orbitron/files/orbitron-latin-700-normal.woff2'],
  ['Orbitron', 900, '@fontsource/orbitron/files/orbitron-latin-900-normal.woff2'],
  ['Share Tech Mono', 400, '@fontsource/share-tech-mono/files/share-tech-mono-latin-400-normal.woff2'],
];
let fontCss = '';
for (const [family, weight, src] of fonts) {
  const file = path.basename(src);
  fs.copyFileSync(r('node_modules', src), path.join(out, 'fonts', file));
  fontCss += `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:swap;src:url(${file}) format('woff2');}\n`;
}
fs.writeFileSync(path.join(out, 'fonts', 'fonts.css'), fontCss);

// 3. html + css
fs.copyFileSync(r('css/style.css'), path.join(out, 'style.css'));
let html = fs.readFileSync(r('index.html'), 'utf8');
html = html
  .replace(/\s*<link rel="preconnect"[^>]*>/, '')
  .replace(/\s*<link href="https:\/\/fonts\.googleapis\.com[^>]*>/, '\n  <link rel="stylesheet" href="fonts/fonts.css" />')
  .replace('href="css/style.css"', 'href="style.css"')
  .replace(/\s*<script type="importmap">[\s\S]*?<\/script>/, '')
  .replace('<script type="module" src="src/main.js"></script>', '<script src="game.js"></script>');
if (html.includes('importmap') || html.includes('type="module"') || html.includes('googleapis')) throw new Error('index.html transform failed');
fs.writeFileSync(path.join(out, 'Play Neon Sprawl.html'), html);

// 4. docs + licences
fs.copyFileSync(r('release/README.txt'), path.join(out, 'README.txt'));
const lic = [
  '== three.js (MIT) ==\n' + fs.readFileSync(r('vendor/three/LICENSE'), 'utf8'),
  '== Orbitron font (SIL Open Font License 1.1) ==\n' + fs.readFileSync(r('node_modules/@fontsource/orbitron/LICENSE'), 'utf8'),
  '== Share Tech Mono font (SIL Open Font License 1.1) ==\n' + fs.readFileSync(r('node_modules/@fontsource/share-tech-mono/LICENSE'), 'utf8'),
].join('\n\n');
fs.writeFileSync(path.join(out, 'THIRD-PARTY-LICENSES.txt'), lic);

// 5. zip
const zip = path.join(distRoot, `${name}.zip`);
fs.rmSync(zip, { force: true });
execFileSync('zip', ['-r', '-q', '-X', `${name}.zip`, name], { cwd: distRoot });
const kb = (f) => Math.round(fs.statSync(f).size / 1024);
console.log(`built ${path.relative(root, out)}/ (game.js ${kb(path.join(out, 'game.js'))} KB)`);
console.log(`zipped ${path.relative(root, zip)} (${kb(zip)} KB)`);
