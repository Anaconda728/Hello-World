// Neon Sprawl — build an endless dark-neon megacity, then walk or drive its streets.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

import { TILE, DIRS, FREE_ZONE, tileCenter, worldToTile } from './config.js';
import { initMaterials, animateMaterials } from './materials.js';
import { World } from './world.js';
import { City } from './city.js';
import { Traffic } from './traffic.js';
import { UI } from './ui.js';
import { Audio } from './audio.js';
import { BuildMode } from './modes/build.js';
import { WalkMode } from './modes/walk.js';
import { DriveMode } from './modes/drive.js';
import * as Saves from './saves.js';
import { Robots, Gangs } from './npcs.js';
import { Drones } from './drones.js';
import { Marker } from './markers.js';
import { Conversation } from './conversation.js';

const PREFS_KEY = 'neonsprawl.prefs.v1';
const DEMO_SEED = 7331;
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
scene.environment = initMaterials(renderer);

// post: bloom for the neon, then a cyberpunk grade (vignette, grain, fringe, scanlines,
// occasional signal glitch) and the optional optic-overlay vision mode
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.7, 0.45, 0.86);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const grade = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uAberr: { value: 0.0004 }, uRes: { value: new THREE.Vector2(1, 1) },
    uVision: { value: 0 }, uPulse: { value: 0 }, uGlitch: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime, uAberr, uVision, uPulse, uGlitch; uniform vec2 uRes; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + uTime) * 43758.5453); }
    float lum(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
    void main(){
      vec2 uv = vUv;
      // signal glitch: a few horizontal bands slip sideways
      if (uGlitch > 0.0) {
        float band = floor(uv.y * 24.0);
        float g = step(0.82, fract(sin(band * 91.7 + floor(uTime * 30.0)) * 4375.85));
        uv.x += g * (fract(sin(band * 13.1) * 991.0) - 0.5) * 0.06 * uGlitch;
      }
      vec2 c = uv - 0.5;
      float d = dot(c, c);
      vec2 off = c * d * (uAberr + uGlitch * 0.003) * 40.0;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + off).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - off).b;
      if (uVision > 0.0) {
        // optic overlay: edge-detected cyan wireframe world, emissives kept hot
        vec2 px = 1.0 / uRes;
        float l = lum(col);
        float gx = lum(texture2D(tDiffuse, uv + vec2(px.x, 0.0)).rgb) - lum(texture2D(tDiffuse, uv - vec2(px.x, 0.0)).rgb);
        float gy = lum(texture2D(tDiffuse, uv + vec2(0.0, px.y)).rgb) - lum(texture2D(tDiffuse, uv - vec2(0.0, px.y)).rgb);
        float e = clamp(length(vec2(gx, gy)) * 4.0, 0.0, 1.0);
        vec3 v = vec3(0.02, 0.06, 0.1) + vec3(0.2, 0.95, 1.0) * e + vec3(1.0, 0.3, 0.8) * smoothstep(0.55, 1.0, l);
        float ring = smoothstep(0.03, 0.0, abs(length(c * vec2(uRes.x / uRes.y, 1.0)) - uPulse)) * (1.0 - uPulse);
        v += vec3(0.4, 1.0, 1.0) * ring;
        v += vec3(0.0, 0.08, 0.1) * step(0.5, fract(uv.y * uRes.y / 3.0));
        col = mix(col, v, uVision);
      }
      col *= 1.0 - d * 1.1;
      col += (hash(uv * 800.0) - 0.5) * 0.035;
      col *= 0.97 + 0.03 * sin(uv.y * uRes.y * 1.6);
      col = mix(col, col * vec3(1.02, 0.96, 1.08), 0.5);
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(grade);
grade.uniforms.uRes.value.set(window.innerWidth, window.innerHeight);

// ---------------------------------------------------------------- systems
const world = new World(scene);
const city = new City(scene);
const traffic = new Traffic(scene, city);
const audio = new Audio();
const robots = new Robots(scene, city);
const gangs = new Gangs(scene, city);
const drones = new Drones(scene, city);
const marker = new Marker(scene);
const prefs = Object.assign({ rain: true, sound: false, fx: true, growth: true }, loadPrefs());

const ctx = { renderer, scene, camera, world, city, audio, ui: null, paused: false };
let state = 'title';    // title | loading | game
let mode = null;        // build | walk | drive
let slot = null;        // { id, name } of the world being played
let vision = 0, visionTarget = 0, pulse = 1, glitch = 0;
let talkTarget = null;

const ui = new UI({
  tool: (t) => { if (mode !== 'build') setMode('build'); build.setTool(t); },
  mode: (m) => setMode(m),
  droneType: (k) => { if (mode !== 'build') setMode('build'); build.setDroneType(k); },
  toggle: (id, v) => applyToggle(id, v),
  menu: (on) => setPaused(on),
  newWorld: (o) => newWorld(o),
  loadSlot: (id) => loadSlot(id),
  deleteSlot: (id) => Saves.deleteSlot(id),
  exportSlot: (id) => { const d = Saves.readSlot(id); if (d) Saves.exportFile(d, d.name); },
  importSave: () => Saves.importFile().then((d) => {
    const id = Saves.newSlotId();
    d.name = (d.name || 'Imported city') + '';
    Saves.writeSlot(id, slotMeta(d.name, d.city.seed, d.stats), d);
    loadSlot(id);
  }).catch((e) => ui.toast('Import failed: ' + e.message)),
  save: () => { saveGame(true); },
  saveAs: () => {
    const name = prompt('Name for the new save slot:', (slot?.name || 'Sprawl') + ' (copy)');
    if (!name) return;
    slot = { id: Saves.newSlotId(), name: name.slice(0, 32) };
    saveGame(true);
    ui.showMenu(true, slot.name);
  },
  exportSave: () => Saves.exportFile(snapshot(), slot?.name),
  quit: () => { saveGame(false); setPaused(false); goTitle(); },
});
ctx.ui = ui;

const build = new BuildMode(ctx);
const walk = new WalkMode(ctx);
const drive = new DriveMode(ctx);
const conv = new Conversation({
  city, ui, marker, audio,
  player: () => (mode === 'drive' ? drive.pos : walk.pos),
  onClose: () => { const dom = renderer.domElement; if (mode === 'walk' && !ctx.paused) dom.requestPointerLock?.(); },
});

// enforcer drones scan you as they pass overhead
drones.onScan = () => {
  if (mode !== 'walk' || state !== 'game') return;
  glitch = 0.45;
  audio.blip(1500);
  const job = marker.active?.kind === 'job';
  if (job && Math.random() < 0.4) {
    const fine = Math.min(150, Math.floor(city.credits));
    if (!city.sandbox) city.credits -= fine;
    ui.alert('◉ CONTRABAND FLAGGED', `Enforcer scan · fined ¢${fine} · keep moving`);
  } else {
    ui.alert('◉ CITIZEN SCAN', job ? 'Package undetected · no warrants' : 'ID verified · no warrants');
  }
};

function applyToggle(id, v) {
  if (id === 'rain') { world.rain.visible = v; audio.setRain(v); }
  if (id === 'sound') audio.setEnabled(v);
  if (id === 'fx') { bloom.enabled = v; }
  if (id === 'sandbox') { city.sandbox = v; city.changed = true; }
  if (id !== 'sandbox') { prefs[id] = v; savePrefs(prefs); }
  ui.setToggle(id, v);
}
for (const k of ['rain', 'sound', 'fx', 'growth']) applyToggle(k, prefs[k]);

// ---------------------------------------------------------------- saving
function slotMeta(name, seed, stats = {}) {
  return { name, seed, pop: stats.pop || 0, credits: stats.credits || 0 };
}
function snapshot() {
  const s = city.stats();
  const f = focusPoint();
  return {
    v: 2, name: slot?.name || 'Sprawl', city: city.serialize(),
    player: { mode, x: f.x, z: f.z, yaw: build.yaw, dist: build.dist, marker: marker.active },
    stats: { pop: s.pop, credits: Math.floor(city.credits) },
  };
}
function saveGame(announce) {
  if (state !== 'game' || !slot) return;
  const data = snapshot();
  const ok = Saves.writeSlot(slot.id, slotMeta(slot.name, city.seed, data.stats), data);
  city.changed = false;
  if (announce) ui.toast(ok ? `Saved “${slot.name}”` : 'Save failed: browser storage is full', ok);
}

// ---------------------------------------------------------------- world lifecycle
function newWorld({ name, seed, sandbox }) {
  slot = { id: Saves.newSlotId(), name };
  city.reset(seed);
  city.sandbox = sandbox;
  // a starter fusion core in the cleared district so the lights come on
  for (let r = 1; r < FREE_ZONE; r++) {
    let placed = false;
    for (let a = -r; a <= r && !placed; a++) for (const [i, j] of [[a, -r], [a, r], [-r, a], [r, a]]) {
      if (!city.isRoad(i, j) && city.canPlace('powercore', i, j)) { city.place('powercore', i, j, { free: true }); placed = true; break; }
    }
    if (placed) break;
  }
  startGame({ x: 0, z: 0, yaw: Math.PI * 0.25, dist: 200 }, true);
}
function loadSlot(id) {
  const data = Saves.readSlot(id);
  if (!data || data.v !== 2) { ui.toast('That save could not be read'); return; }
  const meta = Saves.listSlots().find((s) => s.id === id);
  slot = { id, name: meta?.name || data.name || 'Sprawl' };
  city.load(data.city);
  startGame(data.player || { x: 0, z: 0 }, false);
}
function startGame(p, fresh) {
  ui.showTitle(false);
  traffic.cars.forEach((w) => (w.alive = false));
  traffic.peds.forEach((w) => (w.alive = false));
  robots.list.forEach((w) => (w.alive = false));
  gangs.groups.clear();
  drones.ambient.forEach((a) => (a.alive = false));
  drones.placed.clear();
  if (conv.open) conv.close();
  if (p.marker) marker.set(p.marker); else marker.clear();
  build.target.set(p.x || 0, 0, p.z || 0);
  build.smooth.target.copy(build.target);
  build.yaw = build.smooth.yaw = p.yaw ?? Math.PI * 0.25;
  build.dist = build.smooth.dist = p.dist ?? 220;
  ui.setToggle('sandbox', city.sandbox);
  mode = null;
  state = 'loading';
  setMode('build');
  ui.setLoading(true, 0, fresh ? 'generating the sprawl…' : 'restoring your city…');
  if (fresh) saveTimer = 9; // first autosave soon
}
function goTitle() {
  state = 'title';
  if (conv.open) conv.close();
  if (mode === 'walk') walk.exit();
  if (mode === 'drive') { drive.exit(); drive.body.visible = false; }
  if (mode === 'build') build.exit();
  mode = null;
  slot = null;
  marker.clear();
  city.reset(DEMO_SEED, { freeZone: false });
  ui.showTitle(true);
  ui.setLoading(false);
  camera.fov = 55; camera.updateProjectionMatrix();
  scene.fog.density = 0.0026;
}
function setPaused(on) {
  if (state !== 'game') return;
  ctx.paused = on;
  if (on && document.pointerLockElement) document.exitPointerLock();
  ui.showMenu(on, slot?.name || '');
}

// ---------------------------------------------------------------- modes
// Find a street-level spawn near (x, z): nearest road tile.
function findSpawn(x, z) {
  const t = worldToTile(x, z);
  for (let r = 0; r < 20; r++) {
    for (let a = -r; a <= r; a++) for (const [i, j] of [[t.i + a, t.j - r], [t.i + a, t.j + r], [t.i - r, t.j + a], [t.i + r, t.j + a]]) {
      if (!city.isRoad(i, j)) continue;
      const c = tileCenter(i, j);
      let heading = 0;
      for (let d = 0; d < 4; d++) {
        if (city.isRoad(i + DIRS[d][0], j + DIRS[d][1])) { heading = Math.atan2(DIRS[d][0], DIRS[d][1]); break; }
      }
      return { x: c.x, z: c.z, heading };
    }
  }
  return { x, z, heading: 0 };
}

function setMode(next) {
  if (next === mode || state === 'title') return;
  audio.unlock();
  const prev = mode;
  if (prev === 'build') build.exit();
  if (prev === 'walk') { if (conv.open) conv.close(); walk.exit(); }
  if (prev === 'drive') drive.exit();
  mode = next;
  ui.setMode(next);
  if (next === 'build') {
    if (prev === 'walk') build.focus(walk.pos.x, walk.pos.z);
    if (prev === 'drive') build.focus(drive.pos.x, drive.pos.z);
    build.enter();
  } else if (next === 'walk') {
    if (prev === 'drive') {
      const h = drive.heading;
      walk.enter({ x: drive.pos.x + Math.cos(h) * 2.6, z: drive.pos.z - Math.sin(h) * 2.6, yaw: h + Math.PI });
    } else {
      const s = findSpawn(build.target.x, build.target.z);
      walk.enter({ x: s.x + Math.cos(s.heading) * 4.9, z: s.z - Math.sin(s.heading) * 4.9, yaw: s.heading + Math.PI });
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
  if (next !== 'build') { glitch = 0.6; } // jack-in flicker
}

window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (state !== 'game') return;
  if (conv.open) {
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= 9) ui.pickChoice(n - 1);
    else if (e.code === 'Escape' || e.code === 'KeyE') conv.close();
    e.preventDefault();
    return;
  }
  if (e.code === 'Escape') { setPaused(!ctx.paused); e.preventDefault(); return; }
  if (ctx.paused) return;
  if (e.code === 'KeyB') setMode('build');
  else if (e.code === 'KeyF') setMode('walk');
  else if (e.code === 'KeyV') setMode('drive');
  else if (e.code === 'KeyH') document.body.classList.toggle('hide-hud');
  else if (e.code === 'KeyP') saveGame(true);
  else if (e.code === 'KeyM' && marker.active) { marker.clear(); ui.toast('Marker cleared'); }
  else if (e.code === 'KeyE' && mode === 'walk' && talkTarget) {
    if (document.pointerLockElement) document.exitPointerLock();
    if (talkTarget.robot) conv.talkRobot(talkTarget.robot, robots);
    else conv.talkGang(talkTarget.gang);
    audio.blip(700);
  }
  else if (e.code === 'KeyX' && mode !== 'build') { visionTarget = visionTarget ? 0 : 1; pulse = 0; audio.blip(visionTarget ? 1200 : 400); }
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
});
// browsers release pointer lock on Esc before we see the key: treat that as "open menu"
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && mode === 'walk' && state === 'game' && !ctx.paused && walk.active && !conv.open && !document.body.classList.contains('talking')) setPaused(true);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  grade.uniforms.uRes.value.set(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------- loop
const focus = new THREE.Vector3();
function focusPoint() {
  if (state === 'title') return focus.set(0, 0, 0);
  if (mode === 'walk') return focus.set(walk.pos.x, 0, walk.pos.z);
  // look ahead of a fast car so the city generates in front of you
  if (mode === 'drive') return focus.set(drive.pos.x + drive.vel.x * 1.5, 0, drive.pos.z + drive.vel.y * 1.5);
  return focus.set(build.smooth.target.x, 0, build.smooth.target.z);
}

build.setTool('road');
city.reset(DEMO_SEED, { freeZone: false });
ui.showTitle(true);

let econTimer = 0, saveTimer = 0, statTimer = 0, mmTimer = 0, mmVersion = -1;
const mmLast = new THREE.Vector2(1e9, 1e9);
const clock = new THREE.Clock();
let t = 0, booted = false;

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  t += dt;
  const f = focusPoint();

  if (state === 'title') {
    // slow cinematic orbit over the demo city behind the landing page
    const a = t * 0.04;
    camera.position.set(Math.cos(a) * 260, 165 + Math.sin(t * 0.1) * 20, Math.sin(a) * 260);
    camera.lookAt(-60 * Math.sin(a), 40, 60 * Math.cos(a));
    const st = city.stream(0, 0, booted ? 8 : 40);
    if (!booted && st.ready >= Math.min(st.total, 9)) { booted = true; ui.setLoading(false); }
  } else if (state === 'loading') {
    build.update(dt);
    const st = city.stream(f.x, f.z, 45);
    const need = Math.min(st.total, 9);
    ui.setLoading(true, Math.min(1, st.ready / need));
    if (st.ready >= need) { state = 'game'; ui.setLoading(false); city.stats(); city.refreshWarnings(); }
  } else {
    if (!ctx.paused) {
      if (mode === 'build') build.update(dt);
      else if (mode === 'walk') { if (!conv.open) walk.update(dt); }
      else drive.update(dt, t);
    }
    city.stream(f.x, f.z, mode === 'drive' ? 9 : 6);

    econTimer += dt;
    if (econTimer > 1 && !ctx.paused) {
      econTimer = 0;
      const grown = city.tickEconomy(prefs.growth);
      if (grown && mode === 'build' && Math.random() < 0.15) ui.toast('Your district grows upward…', true);
    }
    statTimer += dt;
    if (statTimer > 0.25) { statTimer = 0; ui.setStats(city.credits, city.stats(), city.sandbox); }
    saveTimer += dt;
    if (saveTimer > 20 && city.changed) { saveTimer = 0; saveGame(false); }

    // minimap: re-rasterise when we move a few tiles or the city changes
    mmTimer += dt;
    if (mmTimer > 0.3 && (city.version !== mmVersion || Math.hypot(f.x - mmLast.x, f.z - mmLast.y) > TILE * 3)) {
      mmTimer = 0; mmVersion = city.version; mmLast.set(f.x, f.z);
      ui.drawMinimapBase(city, f.x, f.z);
    }
    let yaw;
    if (mode === 'build') yaw = build.smooth.yaw;
    else if (mode === 'walk') yaw = walk.yaw;
    else yaw = drive.heading + Math.PI;
    const p = mode === 'build' ? build.smooth.target : mode === 'walk' ? walk.pos : drive.pos;
    ui.drawMinimap(p.x, p.z, yaw, marker.active);

    // street interaction (walk mode): who's in front of us, whose turf are we on
    talkTarget = null;
    if (mode === 'walk' && !conv.open) {
      const fx = -Math.sin(walk.yaw), fz = -Math.cos(walk.yaw);
      const r = robots.nearest(walk.pos, fx, fz);
      const g = gangs.nearest(walk.pos, fx, fz);
      if (r && (!g || Math.hypot(r.pos.x - walk.pos.x, r.pos.z - walk.pos.z) < Math.hypot(g.m.x - walk.pos.x, g.m.z - walk.pos.z))) {
        const id = robots.identity(r, {});
        talkTarget = { robot: r };
        ui.setPrompt(`Talk to ${id.designation} “${id.name}” (${id.role})`);
      } else if (g) {
        talkTarget = { gang: g };
        ui.setPrompt(`Talk to ${g.m.name} · ${g.g.gang.name}`);
      } else ui.setPrompt(null);
      const terr = gangs.territory(walk.pos);
      ui.setTerritory(terr ? terr.gang : null);
    } else if (!conv.open) { ui.setPrompt(null); ui.setTerritory(null); }

    // marker: arrival + compass
    const playerPos = mode === 'build' ? null : p;
    const arrived = marker.update(dt, t, playerPos);
    if (arrived) {
      if (arrived.kind === 'job') {
        if (!city.sandbox) city.credits += arrived.reward;
        ui.alert('✔ DELIVERY COMPLETE', `+¢${arrived.reward} from the ${arrived.gang}`);
        audio.blip(1100);
      } else ui.toast(`Arrived: ${arrived.label.toLowerCase()}`, true);
    }
    if (marker.active) {
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const dx = marker.active.x - camera.position.x, dz = marker.active.z - camera.position.z;
      const len = Math.hypot(dir.x, dir.z) || 1, fx = dir.x / len, fz = dir.z / len;
      const rel = Math.atan2(dx * -fz + dz * fx, dx * fx + dz * fz);
      ui.setMarker(marker.active, Math.hypot(marker.active.x - p.x, marker.active.z - p.z), rel);
    } else ui.setMarker(null);
  }

  city.update(dt, t, mode === 'build' && state === 'game');
  traffic.update(dt, t, f);
  const npcPlayer = state === 'game' && mode === 'walk' ? walk.pos : null;
  robots.update(dt, t, f, npcPlayer);
  gangs.update(dt, t, f, npcPlayer);
  drones.update(dt, t, f, npcPlayer);
  world.update(dt, t, camera, f);
  animateMaterials(t);

  vision += (visionTarget - vision) * Math.min(1, dt * 6);
  if (mode === 'build' || state !== 'game') visionTarget = 0;
  pulse = Math.min(1.2, pulse + dt * 0.6);
  glitch = Math.max(0, glitch - dt * 1.5);
  if (Math.random() < 0.002) glitch = 0.35; // the city's signal is never quite clean
  const g = grade.uniforms;
  g.uTime.value = t % 100;
  g.uVision.value = vision;
  g.uPulse.value = pulse;
  g.uGlitch.value = glitch;
  if (vision > 0.5 && pulse >= 1.2) pulse = 0;

  composer.render();
  requestAnimationFrame(frame);
}

window.addEventListener('beforeunload', () => saveGame(false));
requestAnimationFrame(frame);

// handy for debugging from the console
window.neon = { city, build, walk, drive, traffic, robots, gangs, drones, marker, conv, setMode, scene, camera, renderer, newWorld, loadSlot, get state() { return state; } };
