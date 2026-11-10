// Packages the game as a portable Windows x64 desktop app (Electron).
// Output: dist/NeonSprawl-v<version>-win64/ (with "Neon Sprawl.exe") and a matching .zip.
// Works from Linux, macOS or Windows: no Wine needed (exe icon/version are set with resedit).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ResEdit from 'resedit';

const ELECTRON = '44.9.1';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const r = (...p) => path.join(root, ...p);
const pkg = JSON.parse(fs.readFileSync(r('package.json'), 'utf8'));
const V = pkg.version;
const web = r('dist', `NeonSprawl-v${V}`);
const name = `NeonSprawl-v${V}-win64`;
const out = r('dist', name);
const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: 'inherit', ...opts });

// 1. fresh web build
sh(process.execPath, [r('tools/build.mjs')]);

// 2. Electron runtime (cached, checksum-verified)
const cache = r('.cache');
fs.mkdirSync(cache, { recursive: true });
const zipName = `electron-v${ELECTRON}-win32-x64.zip`;
const zipPath = path.join(cache, zipName);
const base = `https://github.com/electron/electron/releases/download/v${ELECTRON}`;
const sums = path.join(cache, `SHASUMS256-${ELECTRON}.txt`);
if (!fs.existsSync(sums)) sh('curl', ['-fsSL', '-o', sums, `${base}/SHASUMS256.txt`]);
const want = fs.readFileSync(sums, 'utf8').split('\n').find((l) => l.endsWith(zipName))?.split(' ')[0];
if (!want) throw new Error('checksum for ' + zipName + ' not found');
const sha = (f) => createHash('sha256').update(fs.readFileSync(f)).digest('hex');
if (!fs.existsSync(zipPath) || sha(zipPath) !== want) {
  console.log(`downloading Electron ${ELECTRON} for Windows...`);
  sh('curl', ['-fL', '--progress-bar', '-o', zipPath, `${base}/${zipName}`]);
  if (sha(zipPath) !== want) throw new Error('Electron download failed checksum verification');
}

// 3. unpack runtime
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
sh('unzip', ['-q', zipPath, '-d', out]);
fs.rmSync(path.join(out, 'resources', 'default_app.asar'), { force: true });
fs.renameSync(path.join(out, 'LICENSE'), path.join(out, 'LICENSE.electron.txt'));

// 4. app payload: desktop shell + the web build
const app = path.join(out, 'resources', 'app');
fs.mkdirSync(app, { recursive: true });
const appPkg = JSON.parse(fs.readFileSync(r('desktop/package.json'), 'utf8'));
if (appPkg.version !== V) throw new Error(`desktop/package.json version ${appPkg.version} != ${V}`);
fs.writeFileSync(path.join(app, 'package.json'), JSON.stringify(appPkg, null, 2));
fs.copyFileSync(r('desktop/main.js'), path.join(app, 'main.js'));
fs.copyFileSync(r('desktop/icon.png'), path.join(app, 'icon.png'));
fs.cpSync(web, path.join(app, 'game'), { recursive: true });
fs.renameSync(path.join(app, 'game', 'Play Neon Sprawl.html'), path.join(app, 'game', 'index.html'));
fs.renameSync(path.join(app, 'game', 'THIRD-PARTY-LICENSES.txt'), path.join(out, 'THIRD-PARTY-LICENSES.txt'));
fs.rmSync(path.join(app, 'game', 'README.txt'));
fs.copyFileSync(r('release/README-windows.txt'), path.join(out, 'README.txt'));

// 5. branded exe: icon + version info
const exeSrc = path.join(out, 'electron.exe');
const exe = ResEdit.NtExecutable.from(fs.readFileSync(exeSrc), { ignoreCert: true });
const res = ResEdit.NtExecutableResource.from(exe);
const icon = ResEdit.Data.IconFile.from(fs.readFileSync(r('desktop/icon.ico')));
const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
const gid = groups.length ? groups[0].id : 1, glang = groups.length ? groups[0].lang : 1033;
ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, gid, glang, icon.icons.map((i) => i.data));
const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0];
const [a, b, c] = V.split('.').map(Number);
const lang = vi.getAllLanguagesForStringValues()[0] || { lang: 1033, codepage: 1200 };
vi.setStringValues(lang, {
  ProductName: 'Neon Sprawl', FileDescription: 'Neon Sprawl', CompanyName: 'Neon Sprawl',
  InternalName: 'Neon Sprawl', OriginalFilename: 'Neon Sprawl.exe', LegalCopyright: '',
  FileVersion: V, ProductVersion: V,
});
vi.removeStringValue(lang, 'SquirrelAwareVersion');
vi.setFileVersion(a, b, c, 0, lang.lang);
vi.setProductVersion(a, b, c, 0, lang.lang);
vi.outputToResourceEntries(res.entries);
res.outputResource(exe);
fs.writeFileSync(path.join(out, 'Neon Sprawl.exe'), Buffer.from(exe.generate()));
fs.rmSync(exeSrc);

// 6. zip
const zip = r('dist', `${name}.zip`);
fs.rmSync(zip, { force: true });
sh('zip', ['-r', '-q', '-9', '-X', `${name}.zip`, name], { cwd: r('dist') });
const mb = (f) => (fs.statSync(f).size / 1048576).toFixed(1);
console.log(`built dist/${name}/ ("Neon Sprawl.exe")`);
console.log(`zipped dist/${name}.zip (${mb(zip)} MB)`);
