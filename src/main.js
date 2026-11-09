// Neon Sprawl — build a dark neon megacity, then walk or drive its streets.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

import { GRID, TILE, DIRS, tileCenter, worldToTile, inGrid } from './config.js';
import { initMaterials, animateMaterials } from './materials.js';
import { World } from './world.js';
import { City } from './city.js';
import { Traffic } from './traffic.js';
import { UI } from './ui.js';
import { Audio } from './audio.js';
import { BuildMode } from './modes/build.js';
import { WalkMode } from './modes/walk.js';
import { DriveMode } from './modes/drive.js';

const PREFS_KEY = 'neonsprawl.prefs.v1';
function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'); } catch (e) { return {}; }
}
function savePrefs(p) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch (e) { /* ignore */ }
}

// ---------------------------------------------------------------- renderer
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 6000);

const envMap = initMaterials(renderer);
scene.environment = envMap;

// post-processing: bloom for the neon + a final grade (vignette, grain, chromatic fringe)
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.7, 0.45, 0.86);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uAberr: { value: 0.0004 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uAberr; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + uTime) * 43758.5453); }
    void main(){
      vec2 c = vUv - 0.5;
      float d = dot(c, c);
      vec2 off = c * d * uAberr * 40.0;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - off).b;
      col *= 1.0 - d * 1.1;                       // vignette
      col += (hash(vUv * 800.0) - 0.5) * 0.035;   // film grain
      col = mix(col, col * vec3(1.02, 0.96, 1.08), 0.5); // slight magenta grade
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(grade);

// ---------------------------------------------------------------- systems
const world = new World(scene);
const city = new City(scene);
const traffic = new Traffic(scene, city);
const audio = new Audio();
const prefs = Object.assign({ rain: true, sound: false, fx: true, growth: true }, loadPrefs());

const ctx = { renderer, scene, camera, world, city, audio, ui: null };
const ui = new UI({
  tool: (t) => { if (mode !== 'build') setMode('build'); build.setTool(t); },
  mode: (m) => setMode(m),
  generate: () => { city.generateCity(); city.credits = Math.max(city.credits, 25000); ui.toast('New district generated', true); },
  clear: () => { if (confirm('Demolish the entire city?')) { city.clear(); ui.toast('Grid cleared'); } },
  toggle: (id, v) => applyToggle(id, v),
});
ctx.ui = ui;

const build = new BuildMode(ctx);
const walk = new WalkMode(ctx);
const drive = new DriveMode(ctx);

function applyToggle(id, v) {
  if (id === 'rain') { world.rain.visible = v; audio.setRain(v); }
  if (id === 'sound') audio.setEnabled(v);
  if (id === 'fx') { bloom.enabled = v; grade.enabled = v; }
  if (id === 'sandbox') { city.sandbox = v; city.changed = true; }
  if (id !== 'sandbox') { prefs[id] = v; savePrefs(prefs); }
  ui.setToggle(id, v);
}

// ---------------------------------------------------------------- city bootstrap
if (!city.load()) city.generateCity(20261109);
for (const k of ['rain', 'sound', 'fx', 'growth']) applyToggle(k, prefs[k]);
ui.setToggle('sandbox', city.sandbox);

city.onChange(() => ui.drawMinimapBase(city));

// ---------------------------------------------------------------- modes
let mode = null;

// Find a good street-level spawn near (x, z): nearest road tile, else nearest free tile.
function findSpawn(x, z) {
  const t = worldToTile(x, z);
  let best = null, bestD = Infinity;
  for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
    if (!city.isRoad(i, j)) continue;
    const d = (i - t.i) ** 2 + (j - t.j) ** 2;
    if (d < bestD) { bestD = d; best = [i, j]; }
  }
  if (best) {
    const [i, j] = best;
    const c = tileCenter(i, j);
    // face along the road
    let heading = 0;
    for (let d = 0; d < 4; d++) {
      if (city.isRoad(i + DIRS[d][0], j + DIRS[d][1])) { heading = Math.atan2(DIRS[d][0], DIRS[d][1]); break; }
    }
    return { x: c.x, z: c.z, heading };
  }
  if (!inGrid(t.i, t.j) || !city.buildingAt(t.i, t.j)) return { x, z, heading: 0 };
  return { x: (GRID / 2 + 0.5) * TILE + 30, z: 0, heading: 0 };
}

function setMode(next, opts = {}) {
  if (next === mode) return;
  audio.unlock();
  const prev = mode;
  if (prev === 'build') build.exit();
  if (prev === 'walk') walk.exit();
  if (prev === 'drive') drive.exit();
  mode = next;
  ui.setMode(next);

  if (next === 'build') {
    // keep looking at where we were on the street
    if (prev === 'walk') build.focus(walk.pos.x, walk.pos.z);
    if (prev === 'drive') build.focus(drive.pos.x, drive.pos.z);
    build.enter();
  } else if (next === 'walk') {
    if (prev === 'drive') {
      // step out next to the car
      const h = drive.heading;
      walk.enter({ x: drive.pos.x + Math.cos(h) * 2.6, z: drive.pos.z - Math.sin(h) * 2.6, yaw: h + Math.PI });
    } else {
      const s = findSpawn(build.target.x, build.target.z);
      const off = 4.9; // start on the sidewalk side
      walk.enter({ x: s.x + Math.cos(s.heading) * off, z: s.z - Math.sin(s.heading) * off, yaw: s.heading + Math.PI });
    }
  } else if (next === 'drive') {
    if (prev === 'walk') {
      const h = walk.yaw + Math.PI;
      drive.enter({ x: walk.pos.x + Math.sin(h) * 4, z: walk.pos.z + Math.cos(h) * 4, heading: h });
    } else {
      const s = findSpawn(build.target.x, build.target.z);
      drive.enter({ x: s.x, z: s.z, heading: s.heading });
    }
  }
  drive.body.visible = next === 'drive' || (prev === 'drive' && next === 'walk');
}

window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (e.code === 'KeyB' || (e.code === 'Escape' && mode === 'drive')) setMode('build');
  else if (e.code === 'KeyF') setMode('walk');
  else if (e.code === 'KeyV') setMode('drive');
  else if (e.code === 'KeyH') document.body.classList.toggle('hide-hud');
  else if (e.code === 'KeyP') { city.save(); ui.toast('City saved', true); }
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------- loop
build.setTool('road');
setMode('build');

let econTimer = 0, saveTimer = 0, statTimer = 0;
const clock = new THREE.Clock();
let t = 0;

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  t += dt;

  if (mode === 'build') build.update(dt);
  else if (mode === 'walk') walk.update(dt);
  else drive.update(dt, t);

  city.update(dt, t, mode === 'build');
  traffic.update(dt, t);
  world.update(dt, t, camera);
  animateMaterials(t);
  grade.uniforms.uTime.value = t % 100;

  econTimer += dt;
  if (econTimer > 1) {
    econTimer = 0;
    const grown = city.tickEconomy(prefs.growth);
    if (grown && mode === 'build' && Math.random() < 0.1) ui.toast('The sprawl grows upward…', true);
  }
  statTimer += dt;
  if (statTimer > 0.25) { statTimer = 0; ui.setStats(city.credits, city.stats(), city.sandbox); }
  saveTimer += dt;
  if (saveTimer > 10 && city.changed) { saveTimer = 0; city.changed = false; city.save(); }

  let mx, mz, yaw;
  if (mode === 'build') { mx = build.smooth.target.x; mz = build.smooth.target.z; yaw = build.smooth.yaw; }
  else if (mode === 'walk') { mx = walk.pos.x; mz = walk.pos.z; yaw = walk.yaw; }
  else { mx = drive.pos.x; mz = drive.pos.z; yaw = drive.heading + Math.PI; }
  ui.drawMinimap(mx, mz, yaw);

  composer.render();
  requestAnimationFrame(frame);
}

window.addEventListener('beforeunload', () => city.save());
ui.drawMinimapBase(city);
requestAnimationFrame(() => {
  frame();
  document.getElementById('loading').classList.add('done');
});

// handy for debugging from the console
window.neon = { city, build, walk, drive, setMode, scene, camera, renderer };
