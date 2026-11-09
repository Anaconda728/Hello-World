import * as THREE from 'three';
import { CS, H, WATER, MAT, MAT_INFO, HOTBAR } from './constants.js';
import { World } from './world.js';
import { Player, EYE } from './player.js';

const SAVE_KEY = 'driftland-save-v1';
const RENDER_RADIUS = 4;
const REACH = 7;
const DAY_LENGTH = 720;            // seconds per full day

function loadSave() {
  try { const s = localStorage.getItem(SAVE_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
}
const save = loadSave();
const seed = save?.seed ?? ((Math.random() * 2 ** 31) | 0);

// ---------- renderer, scene, lights ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.getElementById('game').appendChild(renderer.domElement);
const canvas = renderer.domElement;

const scene = new THREE.Scene();
scene.background = new THREE.Color();
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 1200);
camera.rotation.order = 'YXZ';
const fogFar = RENDER_RADIUS * CS * 0.95;
scene.fog = new THREE.Fog(0x87c5f0, fogFar * 0.4, fogFar);

const hemi = new THREE.HemisphereLight(0xcfe6ff, 0x6b5a45, 1);
const sunLight = new THREE.DirectionalLight(0xfff0d8, 2);
scene.add(hemi, sunLight, sunLight.target);

const water = new THREE.Mesh(
  new THREE.PlaneGeometry(1600, 1600),
  new THREE.MeshLambertMaterial({ color: 0x2d6e9e, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false }),
);
water.rotation.x = -Math.PI / 2;
water.position.y = WATER;
scene.add(water);

// Sky dome objects follow the camera.
const sky = new THREE.Group();
const sunMesh = new THREE.Mesh(new THREE.SphereGeometry(14, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfff3c4, fog: false }));
const moonMesh = new THREE.Mesh(new THREE.SphereGeometry(9, 16, 12), new THREE.MeshBasicMaterial({ color: 0xdfe6f5, fog: false }));
const starPos = [];
for (let i = 0; i < 900; i++) {
  const v = new THREE.Vector3(Math.random() * 2 - 1, Math.random(), Math.random() * 2 - 1).normalize().multiplyScalar(520);
  starPos.push(v.x, v.y, v.z);
}
const starGeo = new THREE.BufferGeometry();
starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, fog: false, depthWrite: false });
sky.add(sunMesh, moonMesh, new THREE.Points(starGeo, starMat));
scene.add(sky);

// Drifting clouds.
const CLOUDS = 40, PUFFS = 4;
const clouds = new THREE.InstancedMesh(
  new THREE.IcosahedronGeometry(1, 1),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, fog: false }),
  CLOUDS * PUFFS,
);
clouds.frustumCulled = false;
const cloudData = [];
for (let i = 0; i < CLOUDS; i++) {
  const puffs = [];
  for (let j = 0; j < PUFFS; j++) {
    const s = 8 + Math.random() * 10;
    puffs.push([(Math.random() - 0.5) * 30, Math.random() * 3, (Math.random() - 0.5) * 16, s * 1.6, s * 0.45, s]);
  }
  cloudData.push({ x: Math.random() * 800, z: Math.random() * 800, y: 105 + Math.random() * 20, puffs });
}
scene.add(clouds);

// ---------- world & player ----------
const world = new World(scene, seed, save, RENDER_RADIUS);
const player = new Player(world);

function findSpawn() {
  for (let r = 0; r < 3000; r += 6) {
    for (let a = 0; a < 12; a++) {
      const x = Math.cos((a / 12) * Math.PI * 2) * r, z = Math.sin((a / 12) * Math.PI * 2) * r;
      const h = world.heightAt(x, z);
      if (h > WATER + 2.5 && h < 40) return new THREE.Vector3(x, h + 0.6, z);
    }
  }
  return new THREE.Vector3(0, H - 4, 0);
}
const spawn = findSpawn();
if (save?.player) {
  player.pos.set(save.player.x, save.player.y, save.player.z);
  player.yaw = save.player.yaw; player.pitch = save.player.pitch;
} else {
  player.pos.copy(spawn);
}

const inv = save?.inv?.length === 8 ? save.inv.slice() : new Array(8).fill(0);
let creative = !!save?.creative;
let time = save?.time ?? 0.3;      // in days; 0.25 = sunrise
let sel = 0;
let brush = 2;
let locked = false;
let digging = false, building = false, cooldown = 0;

// ---------- HUD ----------
const $ = (id) => document.getElementById(id);
const hotbarEl = $('hotbar'), infoEl = $('info'), brushEl = $('brush'), toastEl = $('toast');
const menu = $('menu'), playBtn = $('play'), loadingEl = $('loading');
const slots = HOTBAR.map((m, i) => {
  const el = document.createElement('div');
  el.className = 'slot';
  el.innerHTML = `<span class="key">${i + 1}</span><span class="swatch" style="background:#${MAT_INFO[m].color.toString(16).padStart(6, '0')}"></span><span class="name">${MAT_INFO[m].name}</span><span class="count"></span>`;
  hotbarEl.appendChild(el);
  return el;
});
function updateHotbar() {
  slots.forEach((el, i) => {
    el.classList.toggle('active', i === sel);
    el.querySelector('.count').textContent = creative ? '∞' : inv[HOTBAR[i]];
  });
  brushEl.textContent = `Brush ${brush.toFixed(1)}  ·  Q / E to resize`;
}
let toastTimer = 0;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1800);
}
updateHotbar();

// ---------- saving ----------
let saveWarned = false;
function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      v: 1, seed, ops: world.ops, removedTrees: [...world.removedTrees], inv, creative, time,
      player: { x: player.pos.x, y: player.pos.y, z: player.pos.z, yaw: player.yaw, pitch: player.pitch },
    }));
  } catch {
    if (!saveWarned) { saveWarned = true; toast('Could not save — browser storage unavailable'); }
  }
}
setInterval(() => { if (locked) saveGame(); }, 15000);
addEventListener('beforeunload', saveGame);

// ---------- input ----------
const keys = new Set();
addEventListener('keydown', (e) => {
  if (!locked) return;
  keys.add(e.code);
  if (e.code.startsWith('Digit')) {
    const n = +e.code.slice(5) - 1;
    if (n >= 0 && n < HOTBAR.length) { sel = n; updateHotbar(); }
  } else if (e.code === 'KeyQ') { brush = Math.max(1, brush - 0.5); updateHotbar(); }
  else if (e.code === 'KeyE') { brush = Math.min(4, brush + 0.5); updateHotbar(); }
  else if (e.code === 'KeyC') {
    creative = !creative;
    if (!creative) player.flying = false;
    toast(creative ? 'Creative mode: unlimited materials, F to fly' : 'Survival mode');
    updateHotbar();
  } else if (e.code === 'KeyF') {
    if (creative) { player.flying = !player.flying; toast(player.flying ? 'Flying' : 'Walking'); }
    else toast('Flying needs creative mode (C)');
  }
  if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => keys.delete(e.code));

playBtn.addEventListener('click', () => {
  const r = canvas.requestPointerLock();
  if (r && r.catch) r.catch(() => toast('Click again to capture the mouse'));
});
$('newworld').addEventListener('click', () => {
  if (!confirm('Start a new world? Your current world will be lost.')) return;
  try { localStorage.removeItem(SAVE_KEY); } catch {}
  removeEventListener('beforeunload', saveGame);
  location.reload();
});
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  menu.classList.toggle('hidden', locked);
  if (!locked) {
    keys.clear(); digging = building = false;
    playBtn.textContent = 'Resume';
    saveGame();
  }
});
document.addEventListener('mousemove', (e) => {
  if (!locked) return;
  player.yaw -= e.movementX * 0.0022;
  player.pitch = Math.max(-1.55, Math.min(1.55, player.pitch - e.movementY * 0.0022));
});
document.addEventListener('mousedown', (e) => {
  if (!locked) return;
  if (e.button === 0) digging = true;
  if (e.button === 2) building = true;
  cooldown = 0;
});
document.addEventListener('mouseup', (e) => {
  if (e.button === 0) digging = false;
  if (e.button === 2) building = false;
});
document.addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('wheel', (e) => {
  if (!locked) return;
  sel = (sel + (e.deltaY > 0 ? 1 : -1) + HOTBAR.length) % HOTBAR.length;
  updateHotbar();
}, { passive: true });
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------- targeting & actions ----------
const raycaster = new THREE.Raycaster();
raycaster.far = REACH;
const highlight = new THREE.Mesh(
  new THREE.SphereGeometry(1, 20, 14),
  new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.22, depthWrite: false }),
);
highlight.visible = false;
scene.add(highlight);
let target = null;
const dir = new THREE.Vector3(), tmpV = new THREE.Vector3();

function updateTarget() {
  const objs = [];
  const pcx = Math.floor(player.pos.x / CS), pcz = Math.floor(player.pos.z / CS);
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    const c = world.getChunk(pcx + dx, pcz + dz);
    if (!c) continue;
    if (c.mesh) objs.push(c.mesh);
    objs.push(...c.treeMeshes);
  }
  camera.getWorldDirection(dir);
  raycaster.set(camera.position, dir);
  const hit = raycaster.intersectObjects(objs, false)[0];
  target = null;
  highlight.visible = false;
  if (!hit) return;
  if (hit.object.userData.kind === 'tree') {
    const t = hit.object.userData.trees[hit.instanceId];
    if (t && t.alive) target = { tree: t, point: hit.point };
    return;
  }
  const n = world.gradient(hit.point.x, hit.point.y, hit.point.z, new THREE.Vector3()).negate();
  if (n.lengthSq() < 1e-8) n.set(0, 1, 0); else n.normalize();
  target = { point: hit.point.clone(), normal: n };
  highlight.visible = true;
  highlight.position.copy(hit.point);
  highlight.scale.setScalar(brush);
}

function overlapsPlayer(cpos, r) {
  const feet = player.pos;
  const y = Math.max(feet.y + 0.4, Math.min(feet.y + 1.4, cpos.y));
  return tmpV.set(feet.x, y, feet.z).distanceTo(cpos) < r + 0.45;
}

function doDig() {
  if (!target) return;
  if (target.tree) {
    world.removeTree(target.tree);
    inv[MAT.WOOD] += 6;
    toast('+6 Timber');
    updateHotbar();
    return;
  }
  const p = target.point.clone().addScaledVector(target.normal, -brush * 0.3);
  const counts = world.edit(0, p.x, p.y, p.z, brush, 0);
  for (let i = 1; i < 7; i++) inv[i] += counts[i];
  updateHotbar();
}

function doBuild() {
  if (!target || target.tree) return;
  const mat = HOTBAR[sel];
  if (!creative && inv[mat] <= 0) { toast(`No ${MAT_INFO[mat].name} left — dig some up first`); return; }
  const p = target.point.clone().addScaledVector(target.normal, brush * 0.75);
  if (p.y + brush > H - 1) { toast('Too high to build here'); return; }
  if (overlapsPlayer(p, brush)) { toast('Too close — step back'); return; }
  const counts = world.edit(1, p.x, p.y, p.z, brush, mat);
  if (!creative) inv[mat] = Math.max(0, inv[mat] - counts[mat]);
  updateHotbar();
}

// ---------- sky ----------
const sunDir = new THREE.Vector3();
const DAY = new THREE.Color(0x8cc8f2), NIGHT = new THREE.Color(0x0a1026), DUSK = new THREE.Color(0xf2a36b);
const UNDER = new THREE.Color(0x15476a);
const skyCol = new THREE.Color(), warm = new THREE.Color(0xffb37a), white = new THREE.Color(0xfff0d8);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const underwaterEl = $('underwater');

function updateSky() {
  const a = ((time % 1) - 0.25) * Math.PI * 2;
  sunDir.set(Math.cos(a), Math.sin(a), 0.35).normalize();
  const day = smooth(-0.12, 0.25, sunDir.y);
  const dusk = Math.max(0, 1 - Math.abs(sunDir.y) / 0.3);
  skyCol.copy(NIGHT).lerp(DAY, day).lerp(DUSK, dusk * 0.45);

  if (sunDir.y > -0.05) {
    sunLight.position.copy(sunDir);
    sunLight.intensity = 0.2 + 2.2 * day;
    sunLight.color.copy(white).lerp(warm, dusk * 0.7);
  } else {
    sunLight.position.copy(sunDir).negate();
    sunLight.intensity = 0.35;
    sunLight.color.setHex(0x9fb4ff);
  }
  hemi.intensity = 0.35 + 0.95 * day;
  starMat.opacity = 1 - day;
  clouds.material.color.setRGB(0.25, 0.27, 0.35).lerp(white, day).lerp(DUSK, dusk * 0.3);

  sky.position.copy(camera.position);
  sunMesh.position.copy(sunDir).multiplyScalar(500);
  moonMesh.position.copy(sunDir).multiplyScalar(-500);

  const under = camera.position.y < WATER;
  underwaterEl.style.display = under ? 'block' : 'none';
  if (under) {
    const uc = UNDER.clone().multiplyScalar(0.3 + 0.7 * day);
    scene.background.copy(uc); scene.fog.color.copy(uc);
    scene.fog.near = 0.5; scene.fog.far = 26;
  } else {
    scene.background.copy(skyCol); scene.fog.color.copy(skyCol);
    scene.fog.near = fogFar * 0.4; scene.fog.far = fogFar;
  }
  water.position.x = camera.position.x;
  water.position.z = camera.position.z;
}

const cm = new THREE.Matrix4(), cq = new THREE.Quaternion(), cp = new THREE.Vector3(), cs = new THREE.Vector3();
let wind = 0;
function updateClouds(dt) {
  wind += dt * 2.5;
  const W = 800, cx = camera.position.x, cz = camera.position.z;
  let k = 0;
  for (const cl of cloudData) {
    const x = ((((cl.x + wind - cx) % W) + W) % W) - W / 2 + cx;
    const z = ((((cl.z - cz) % W) + W) % W) - W / 2 + cz;
    for (const [ox, oy, oz, sx, sy, sz] of cl.puffs) {
      cm.compose(cp.set(x + ox, cl.y + oy, z + oz), cq, cs.set(sx, sy, sz));
      clouds.setMatrixAt(k++, cm);
    }
  }
  clouds.instanceMatrix.needsUpdate = true;
}

// ---------- main loop ----------
let last = performance.now(), hudTimer = 0, ready = false;
function pad2(n) { return String(n).padStart(2, '0'); }

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  world.update(player.pos.x, player.pos.z, locked ? 6 : 24);
  if (!ready && world.isReadyAt(player.pos.x, player.pos.z)) {
    ready = true;
    loadingEl.style.display = 'none';
    playBtn.disabled = false;
  }

  if (locked && ready) {
    time += dt / DAY_LENGTH;
    player.update(dt, keys);
    if (player.pos.y < -20) { player.pos.copy(spawn); player.vel.set(0, 0, 0); toast('You fell out of the world'); }
  }
  camera.position.set(player.pos.x, player.pos.y + EYE, player.pos.z);
  camera.rotation.set(player.pitch, player.yaw, 0);

  if (locked && ready) {
    updateTarget();
    cooldown -= dt;
    if (cooldown <= 0 && (digging || building)) {
      if (digging) doDig(); else doBuild();
      cooldown = 0.25;
    }
  } else {
    highlight.visible = false;
  }

  updateSky();
  updateClouds(dt);
  renderer.render(scene, camera);

  hudTimer -= dt;
  if (hudTimer <= 0) {
    hudTimer = 0.2;
    const f = time % 1, hrs = Math.floor(f * 24), mins = Math.floor((f * 24 - hrs) * 60);
    const p = player.pos;
    infoEl.textContent = `Day ${Math.floor(time) + 1}  ${pad2(hrs)}:${pad2(mins)}  ·  ${p.x.toFixed(0)}, ${p.y.toFixed(0)}, ${p.z.toFixed(0)}  ·  ${creative ? (player.flying ? 'Creative (flying)' : 'Creative') : 'Survival'}`;
  }
}
requestAnimationFrame(frame);

// Handle for debugging from the console.
window.driftland = { world, player, inv, scene, camera, get target() { return target; }, doDig, doBuild, setTime: (t) => { time = t; } };
