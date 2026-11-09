import * as THREE from 'three';
import { CS, H, WATER, MAT, MAT_INFO } from './constants.js';
import { World } from './world.js';
import { Player, EYE } from './player.js';
import { Creatures } from './creatures.js';
import { Hazards } from './hazards.js';
import { ITEMS, RECIPES, Pickups } from './items.js';
import { Structures } from './structures.js';
import { Rifle } from './gun.js';
import { Towns } from './towns.js';
import { NPCs, JOB_TITLES } from './npcs.js';
import { Travelers, TRAVELER_BUYS } from './travelers.js';

// Hotbar: building materials, then the rifle and placeable stations.
const HOTBAR = [
  { m: MAT.GRASS }, { m: MAT.DIRT }, { m: MAT.STONE }, { m: MAT.SAND }, { m: MAT.WOOD }, { m: MAT.CLAY },
  { i: 'rifle' }, { i: 'campfire' }, { i: 'forge' },
];
const RIFLE_RANGE = 90, RIFLE_DAMAGE = 14, RELOAD_TIME = 1.6;

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
scene.add(camera);   // so the first-person rifle (a camera child) renders
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
const npcs = new NPCs(scene, world);
const towns = new Towns(scene, world, npcs, save?.townRep);
const travelers = new Travelers(scene, world);
world.colliderProvider = { colliders: (x, z) => towns.colliders(x, z).concat(travelers.colliders(x, z)) };
// Townsfolk and travellers share the talk / hit / aim interface.
const mgr = (who) => (who.horseRoot ? travelers : npcs);

function findSpawn() {
  // New worlds start on the outskirts of the nearest town.
  const nt = towns.nearest(0, 0);
  if (nt) {
    const t = nt.town;
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * Math.PI * 2, d = t.R + 8;
      const x = t.x + Math.cos(ang) * d, z = t.z + Math.sin(ang) * d;
      const h = world.heightAt(x, z);
      if (h > WATER + 1.5) return new THREE.Vector3(x, h + 0.6, z);
    }
  }
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

const creatures = new Creatures(scene, world);
const hazards = new Hazards(scene, world);
const pickups = new Pickups(scene, world);
const structures = new Structures(scene, save?.structures);
const rifle = new Rifle(camera, scene);
player.health = save?.health ?? player.maxHealth;
let hunger = save?.hunger ?? 20;
const MAX_HUNGER = 20;

const inv = new Array(MAT_INFO.length).fill(0);
(save?.inv || []).forEach((v, i) => { if (i < inv.length) inv[i] = v; });
const items = Object.fromEntries(Object.keys(ITEMS).map((k) => [k, save?.items?.[k] || 0]));
let aiming = false;

let bounty = save?.bounty || null;
creatures.onDeath = (c) => {
  for (const [id, n] of c.def.drops || []) for (let k = 0; k < n; k++) pickups.spawn(id, 1, c.pos);
  if (bounty && bounty.type === c.type && bounty.have < bounty.need && c.pos.distanceTo(player.pos) < 60) {
    bounty.have++;
    toast(bounty.have >= bounty.need ? 'Bounty complete. Return to a guard for your reward.' : `Bounty: ${bounty.have} / ${bounty.need} ${c.def.name.toLowerCase()}s`);
  }
};
travelers.onLoot = (t, killed) => {
  const at = t.cartRoot ? t.cartRoot.position : t.horseRoot.position;
  pickups.spawn('coin', killed ? 4 + Math.floor(Math.random() * 7) : 6 + Math.floor(Math.random() * 9), at);
  if (killed) for (const [id] of t.stock.slice(0, t.kind === 'wagon' ? 3 : 1)) pickups.spawn(id, 1, at);
};
travelers.onCrime = (t, reason, level) => {
  // Out on the open road, nobody sees. Near a town, someone always does.
  const pos = t.horseRoot.position;
  const nearTown = towns.current(pos.x, pos.z) || (towns.nearest(pos.x, pos.z)?.dist ?? 1e9) < 90;
  if (nearTown || npcs.witnesses(pos, 40)) npcs.addWanted(level, reason, ctx);
};
npcs.onDeath = (n) => {
  pickups.spawn('coin', n.job === 'guard' ? 6 + Math.floor(Math.random() * 6) : 2 + Math.floor(Math.random() * 6), n.pos);
  if (n.job === 'guard' && Math.random() < 0.6) pickups.spawn('ammo', 2, n.pos);
};
let creative = !!save?.creative;
let time = save?.time ?? 0.3;      // in days; 0.25 = sunrise
let sel = 0;
let brush = 2;
let locked = false;
let digging = false, building = false, cooldown = 0;
let dead = false, sinceHurt = 99, regenT = 0, starveT = 0;
let craftOpen = false, talkOpen = false, talkNpc = null;

// ---------- HUD ----------
const $ = (id) => document.getElementById(id);
const hotbarEl = $('hotbar'), infoEl = $('info'), brushEl = $('brush'), toastEl = $('toast');
const menu = $('menu'), playBtn = $('play'), loadingEl = $('loading');
const hpFill = $('hpfill'), hpText = $('hptext'), hurtEl = $('hurt'), deathEl = $('death');
const foodFill = $('foodfill'), foodText = $('foodtext'), craftEl = $('craft'), talkEl = $('talk');
const wantedEl = $('wanted'), townHud = $('townhud');
const hex = (c) => '#' + c.toString(16).padStart(6, '0');
const slotInfo = (s) => (s.m !== undefined ? MAT_INFO[s.m] : ITEMS[s.i]);
const slots = HOTBAR.map((s, i) => {
  const el = document.createElement('div');
  el.className = 'slot' + (s.i ? ' item' : '');
  const info = slotInfo(s);
  el.innerHTML = `<span class="key">${i + 1}</span><span class="swatch" style="background:${hex(info.color)}"></span><span class="name">${info.name}</span><span class="count"></span>`;
  hotbarEl.appendChild(el);
  return el;
});
const selected = () => HOTBAR[sel];
const hasRifle = () => creative || items.rifle > 0;
function updateHotbar() {
  slots.forEach((el, i) => {
    const s = HOTBAR[i];
    el.classList.toggle('active', i === sel);
    let txt;
    if (s.m !== undefined) txt = creative ? '∞' : inv[s.m];
    else if (s.i === 'rifle') txt = hasRifle() ? `${creative ? '∞' : items.ammo} rds` : '—';
    else txt = creative ? '∞' : items[s.i];
    el.querySelector('.count').textContent = txt;
    el.classList.toggle('empty', s.i !== undefined && !creative && (s.i === 'rifle' ? !items.rifle : !items[s.i]));
  });
  const s = selected();
  brushEl.textContent = s.i === 'rifle' ? 'Left click fire  ·  hold right click to aim'
    : s.i ? 'Right click to place  ·  left click a station to pick it up'
    : `Brush ${brush.toFixed(1)}  ·  Q / E to resize  ·  Tab to craft`;
}
let toastTimer = 0;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1800);
}
updateHotbar();

function updateHealth() {
  const f = Math.max(0, player.health) / player.maxHealth;
  hpFill.style.width = `${f * 100}%`;
  hpFill.style.background = f > 0.5 ? '#e0464e' : f > 0.25 ? '#e6873a' : '#f0c23c';
  hpText.textContent = creative ? 'Creative' : `${Math.ceil(Math.max(0, player.health))} / ${player.maxHealth}`;
}
updateHealth();

function updateFood() {
  const f = Math.max(0, hunger) / MAX_HUNGER;
  foodFill.style.width = `${f * 100}%`;
  foodText.textContent = creative ? 'Creative' : `Food ${Math.ceil(hunger)} / ${MAX_HUNGER}`;
}
updateFood();

function eat() {
  const id = items.stew > 0 ? 'stew' : items.cooked > 0 ? 'cooked' : items.meat > 0 ? 'meat' : null;
  if (!id) { toast('Nothing to eat. Hunt animals for meat.'); return; }
  if (hunger >= MAX_HUNGER - 0.5) { toast("You're not hungry"); return; }
  items[id]--;
  hunger = Math.min(MAX_HUNGER, hunger + ITEMS[id].food);
  toast(`Ate ${ITEMS[id].name.toLowerCase()}`);
  updateFood(); updateHotbar(); if (craftOpen) renderCraft();
}
function useBandage() {
  if (items.bandage <= 0) { toast('No bandages. Craft them from hide and feathers.'); return; }
  if (player.health >= player.maxHealth) { toast('Already at full health'); return; }
  items.bandage--;
  player.health = Math.min(player.maxHealth, player.health + 8);
  toast('Bandaged up');
  updateHealth(); if (craftOpen) renderCraft();
}

// ---------- crafting ----------
const stationOk = (st) => !st || creative ||
  structures.near(st === 'fire' ? ['campfire', 'forge'] : ['forge'], player.pos, 4.5);
const haveCount = ([k, id]) => (k === 'm' ? inv[id] : items[id]);
const needName = ([k, id]) => (k === 'm' ? MAT_INFO[id].name : ITEMS[id].name);
const canCraft = (r) => stationOk(r.station) && (creative || r.need.every((n) => haveCount(n) >= n[2]));
function craft(r, times = 1) {
  let made = 0;
  for (let t = 0; t < times && canCraft(r); t++) {
    if (!creative) for (const [k, id, n] of r.need) { if (k === 'm') inv[id] -= n; else items[id] -= n; }
    items[r.out] += r.n;
    made += r.n;
  }
  if (made) toast(`Crafted ${made} × ${ITEMS[r.out].name}`);
  updateHotbar(); renderCraft();
}
function renderCraft() {
  const near = [];
  if (structures.near(['campfire'], player.pos, 4.5)) near.push('campfire');
  if (structures.near(['forge'], player.pos, 4.5)) near.push('forge');
  $('stations').textContent = near.length ? `Near: ${near.join(', ')}` : 'No station nearby';
  const list = $('recipes');
  list.innerHTML = '';
  for (const r of RECIPES) {
    const ok = canCraft(r);
    const card = document.createElement('div');
    card.className = 'recipe' + (ok ? ' ok' : '');
    const needs = r.need.map((n) => {
      const have = haveCount(n), enough = creative || have >= n[2];
      return `<span class="${enough ? 'have' : 'miss'}">${n[2]} ${needName(n)} <small>(${creative ? '∞' : have})</small></span>`;
    }).join('');
    const st = r.station ? `<div class="st ${stationOk(r.station) ? 'have' : 'miss'}">Needs ${r.station === 'fire' ? 'campfire or forge' : 'forge'} nearby</div>` : '';
    card.innerHTML = `<div class="out"><span class="swatch" style="background:${hex(ITEMS[r.out].color)}"></span><b>${ITEMS[r.out].name}</b>${r.n > 1 ? ` ×${r.n}` : ''} <small class="owned">have ${items[r.out]}</small></div>
      <div class="info">${r.info}</div><div class="needs">${needs}</div>${st}`;
    const btn = document.createElement('button');
    btn.textContent = 'Craft';
    btn.disabled = !ok;
    btn.title = 'Shift-click to craft up to 10';
    btn.addEventListener('click', (e) => craft(r, e.shiftKey ? 10 : 1));
    card.appendChild(btn);
    list.appendChild(card);
  }
  const invList = $('invlist');
  const entries = [];
  inv.forEach((n, i) => { if (n > 0 && MAT_INFO[i]) entries.push([MAT_INFO[i], n]); });
  for (const [k, n] of Object.entries(items)) if (n > 0) entries.push([ITEMS[k], n]);
  invList.innerHTML = entries.length
    ? entries.map(([info, n]) => `<span class="inv"><span class="swatch" style="background:${hex(info.color)}"></span>${info.name} <b>${n}</b></span>`).join('')
    : '<span class="hint">Empty. Dig, chop and hunt to gather resources.</span>';
}
function openCraft() { craftOpen = true; renderCraft(); document.exitPointerLock(); }
function closeCraft() {
  craftOpen = false;
  craftEl.classList.add('hidden');
  const r = canvas.requestPointerLock();
  if (r && r.catch) r.catch(() => menu.classList.remove('hidden'));
}
$('craftclose').addEventListener('click', closeCraft);

// ---------- talking, trading & bounties ----------
const SHOPS = {
  merchant: { sells: [['cooked', 4], ['meat', 2], ['bandage', 8], ['campfire', 12]], buys: [['hide', 3], ['feather', 1], ['meat', 1]] },
  smith: { sells: [['ingot', 9], ['powder', 3], ['ammo', 3], ['rifle', 150]], buys: [['ingot', 5], ['powder', 2], ['hide', 2]] },
  keeper: { sells: [['stew', 6], ['cooked', 3]], buys: [['meat', 2], ['cooked', 2]] },
};
const BOUNTIES = [
  { type: 'jackal', need: 3, reward: 30, text: 'Jackals have been taking our chickens at night. Kill three of them.' },
  { type: 'badger', need: 1, reward: 25, text: "There's a honey badger tearing up the fields. Put it down." },
  { type: 'viper', need: 2, reward: 20, text: 'Vipers have been biting farmhands in the long grass. Get rid of two.' },
];
const DIRS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
const dirName = (dx, dz) => DIRS[((Math.round(Math.atan2(dx, -dz) / (Math.PI / 4)) % 8) + 8) % 8];
const standing = (rep) => (rep > 20 ? 'Friendly' : rep > -20 ? 'Neutral' : rep > -50 ? 'Wary' : 'Hostile');
const priceMul = (rep) => (rep < -20 ? 1.5 : rep > 20 ? 0.85 : 1);

function rumor(n) {
  const t = n.town, pool = [
    'Iron shows rusty orange where the hills are cut open. Dig into a cliff face and you will find it.',
    'Sulfur sits deep down. Yellow stuff, smells awful. You need it for gunpowder.',
    "Jackals won't come near a fire. Keep one burning if you camp out.",
    'Careful digging under overhangs. My cousin was nearly buried that way.',
    'Honey badgers fear nothing, not even gunshots.',
    'If a viper rears up in the grass, back away slowly.',
    'There is good clay by the lakes, if you are thinking of building a forge.',
  ];
  const [cx, cz] = world.towns.cellOf(t.x, t.z);
  let other = null, od = Infinity;
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
    const o = world.towns.get(cx + dx, cz + dz);
    if (o && o !== t) { const d = Math.hypot(o.x - t.x, o.z - t.z); if (d < od) { od = d; other = o; } }
  }
  if (other) pool.push(`${other.name} lies about ${Math.round(od / 10) * 10} paces ${dirName(other.x - t.x, other.z - t.z)} of here.`);
  if (n.job === 'smith') pool.push('Bring me iron ingots and I will pay fair. Or buy a rifle, if you have the coin.');
  if (n.job === 'keeper') pool.push('My stew will keep you going all day. Six coins a bowl.');
  if (n.job === 'guard') pool.push(`Keep the peace in ${t.name} and we will get along fine.`);
  if (t.rep < -20) pool.push('People are talking about you, you know. Nothing good.');
  if (t.roads && t.roads.length) {
    for (const r of t.roads) {
      const o = r.a === t ? r.b : r.a;
      pool.push(`The road ${dirName(o.x - t.x, o.z - t.z)} takes you to ${o.name}. Wagons come through most days.`);
    }
  } else if (t.roads) {
    pool.push("No road reaches us here. If you want to go anywhere, it's across the wilds.", 'We hardly see a trader from one season to the next. No roads, you see.');
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

function travelerRumor(t) {
  const pool = [
    `I'm bound for ${t.dest.name}, out of ${t.from.name}.`,
    'Keep to the road after dark. Jackals hunt the verges.',
    'Bandits have been seen along these roads. Not you, I hope?',
    `${t.from.name} had a good market this week.`,
  ];
  const near = towns.nearest(t.horseRoot.position.x, t.horseRoot.position.z);
  if (near && near.town.roads && !near.town.roads.length) pool.push(`${near.town.name}? No road goes there. You'd have to walk.`);
  if (t.kind === 'rider') pool.push(`I carry letters to ${t.dest.name}. Can't stop long.`);
  return pool[Math.floor(Math.random() * pool.length)];
}

function openTalk(n) {
  talkNpc = n;
  talkOpen = true;
  mgr(n).startTalk(n);
  renderTalk('main');
  document.exitPointerLock();
}
function closeTalk(relock = true) {
  if (talkNpc) mgr(talkNpc).endTalk(talkNpc);
  talkNpc = null;
  talkOpen = false;
  talkEl.classList.add('hidden');
  if (relock) {
    const r = canvas.requestPointerLock();
    if (r && r.catch) r.catch(() => menu.classList.remove('hidden'));
  } else menu.classList.remove('hidden');
}
function renderTalk(view, text) {
  const n = talkNpc;
  if (!n) return;
  const trav = !!n.horseRoot;
  const t = trav ? { rep: 0, name: '' } : n.town;
  $('talkname').textContent = n.name;
  $('talkjob').textContent = trav
    ? `${n.kind === 'wagon' ? 'Travelling trader' : 'Rider'}  ·  ${n.from.name} to ${n.dest.name}  ·  ${items.coin} coins`
    : `${JOB_TITLES[n.job]} of ${t.name}  ·  Town standing: ${standing(t.rep)}  ·  ${items.coin} coins`;
  const shopDef = trav ? (n.kind === 'wagon' ? { sells: n.stock, buys: TRAVELER_BUYS } : null) : SHOPS[n.job];
  const opts = $('talkopts'), shop = $('talkshop');
  opts.innerHTML = ''; shop.innerHTML = '';
  const btn = (label, fn, disabled = false) => {
    const b = document.createElement('button');
    b.className = 'secondary'; b.textContent = label; b.disabled = disabled;
    b.addEventListener('click', fn);
    opts.appendChild(b);
  };
  let say = text;
  if (view === 'main' && !say) say = `"${mgr(n).greeting(n, (time % 1) * 24)}"`;
  if (view === 'chat') say = `"${trav ? travelerRumor(n) : rumor(n)}"`;
  if (view === 'trade') {
    const sh = shopDef, mul = priceMul(t.rep);
    if (t.rep < -50) say = '"I won\'t trade with the likes of you."';
    else {
      say = say || (mul > 1 ? '"Prices are higher for you. You know why."' : '"Take a look. Fair prices, all of them."');
      const col = (title, list, buying) => {
        const div = document.createElement('div');
        div.className = 'shopcol';
        div.innerHTML = `<h3>${title}</h3>`;
        for (const [id, base] of list) {
          const price = buying ? Math.max(1, Math.round(base * (mul > 1 ? 0.7 : 1))) : Math.ceil(base * mul);
          const row = document.createElement('div');
          row.className = 'shoprow';
          const have = items[id];
          row.innerHTML = `<span class="swatch" style="background:${hex(ITEMS[id].color)}"></span><span class="nm">${ITEMS[id].name} <small>(have ${have})</small></span><span class="pr">${price} c</span>`;
          const b = document.createElement('button');
          b.textContent = buying ? 'Sell' : 'Buy';
          b.disabled = buying ? have <= 0 : items.coin < price;
          b.addEventListener('click', () => {
            if (buying) { items[id]--; items.coin += price; } else { items.coin -= price; items[id]++; }
            updateHotbar(); renderTalk('trade', buying ? '"Pleasure doing business."' : '"Enjoy."');
          });
          row.appendChild(b);
          div.appendChild(row);
        }
        shop.appendChild(div);
      };
      col('For sale', sh.sells, false);
      col('Will buy', sh.buys, true);
    }
  }
  if (view === 'bounty') {
    if (bounty && bounty.have >= bounty.need) {
      items.coin += bounty.reward;
      t.rep += 10;
      say = `"Good work. Here's your ${bounty.reward} coins."`;
      bounty = null;
      updateHotbar();
    } else if (bounty) {
      say = `"Still waiting on those ${bounty.type}s: ${bounty.have} of ${bounty.need} so far."`;
    } else {
      const b = BOUNTIES[Math.floor(Math.random() * BOUNTIES.length)];
      say = `"${b.text} ${b.reward} coins when it's done."`;
      btn('Accept the job', () => {
        bounty = { type: b.type, need: b.need, have: 0, reward: b.reward };
        renderTalk('main', '"Good luck out there."');
      });
    }
  }
  $('talktext').textContent = say;
  btn('Chat', () => renderTalk('chat'));
  if (shopDef) btn('Trade', () => renderTalk('trade'));
  if (n.job === 'guard') btn(bounty ? (bounty.have >= bounty.need ? 'Claim bounty' : 'About that job…') : 'Any work?', () => renderTalk('bounty'));
  btn('Goodbye', () => closeTalk());
}
$('talkclose').addEventListener('click', () => closeTalk());
$('eatbtn').addEventListener('click', eat);
$('bandbtn').addEventListener('click', useBandage);

// ---------- health ----------
const knock = new THREE.Vector3();
function damage(amount, cause, from) {
  if (creative || dead || amount <= 0) return;
  player.health -= amount;
  sinceHurt = 0;
  hurtEl.style.opacity = Math.min(0.85, 0.35 + amount * 0.08);
  setTimeout(() => (hurtEl.style.opacity = 0), 160);
  if (from) {
    knock.set(player.pos.x - from.x, 0, player.pos.z - from.z);
    if (knock.lengthSq() > 1e-6) knock.normalize().multiplyScalar(5);
    player.vel.x += knock.x; player.vel.z += knock.z;
    player.vel.y = Math.max(player.vel.y, 3);
  }
  updateHealth();
  if (player.health <= 0) {
    dead = true;
    deathEl.textContent = `${cause}.`;
    deathEl.style.display = 'block';
    playBtn.textContent = 'Respawn';
    document.exitPointerLock();
  }
}
function respawn() {
  dead = false;
  npcs.clearWanted();
  items.coin = Math.floor(items.coin / 2);
  player.health = player.maxHealth;
  hunger = Math.max(hunger, 12);
  updateFood();
  player.pos.copy(spawn);
  player.vel.set(0, 0, 0);
  player.fallImpact = 0;
  deathEl.style.display = 'none';
  updateHealth();
}

// ---------- saving ----------
let saveWarned = false;
function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      v: 1, seed, ops: world.ops, removedTrees: [...world.removedTrees], inv, items, creative, time, health: player.health, hunger,
      structures: structures.serialize(), townRep: towns.serializeRep(), bounty,
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
  if (talkOpen && !locked) {
    if (e.code === 'KeyT') closeTalk();
    else if (e.code === 'Escape') closeTalk(false);
    return;
  }
  if (craftOpen && !locked) {
    if (e.code === 'Tab' || e.code === 'Escape') { e.preventDefault(); if (e.code === 'Tab') closeCraft(); else { craftOpen = false; craftEl.classList.add('hidden'); menu.classList.remove('hidden'); } }
    else if (e.code === 'KeyR') eat();
    else if (e.code === 'KeyH') useBandage();
    return;
  }
  if (!locked) return;
  keys.add(e.code);
  if (e.code === 'Tab') { e.preventDefault(); openCraft(); return; }
  if (e.code === 'KeyR') eat();
  if (e.code === 'KeyH') useBandage();
  if (e.code === 'KeyT') {
    if (target && target.npc) {
      const n = target.npc;
      if (mgr(n).canTalk(n) && npcs.law.wanted === 0) openTalk(n);
      else if (n.job !== 'guard' && npcs.law.wanted > 0) mgr(n).say(n, 'Get away from me!');
    } else toast('Look at someone nearby and press T to talk');
  }
  if (e.code.startsWith('Digit')) {
    const n = +e.code.slice(5) - 1;
    if (n >= 0 && n < HOTBAR.length) { sel = n; updateHotbar(); }
  } else if (e.code === 'KeyQ') { brush = Math.max(1, brush - 0.5); updateHotbar(); }
  else if (e.code === 'KeyE') { brush = Math.min(4, brush + 0.5); updateHotbar(); }
  else if (e.code === 'KeyC') {
    creative = !creative;
    if (!creative) player.flying = false;
    toast(creative ? 'Creative mode: unlimited materials, no damage, F to fly' : 'Survival mode');
    updateHotbar();
    updateHealth();
    updateFood();
  } else if (e.code === 'KeyF') {
    if (creative) { player.flying = !player.flying; toast(player.flying ? 'Flying' : 'Walking'); }
    else toast('Flying needs creative mode (C)');
  }
  if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => keys.delete(e.code));

playBtn.addEventListener('click', () => {
  if (dead) respawn();
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
  menu.classList.toggle('hidden', locked || craftOpen || talkOpen);
  craftEl.classList.toggle('hidden', locked || !craftOpen);
  talkEl.classList.toggle('hidden', locked || !talkOpen);
  if (locked) {
    craftOpen = false;
    if (talkOpen) { talkOpen = false; if (talkNpc) mgr(talkNpc).endTalk(talkNpc); talkNpc = null; }
  }
  if (!locked) {
    keys.clear(); digging = building = aiming = false;
    if (!dead) playBtn.textContent = 'Resume';
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
  if (e.button === 0) { digging = true; cooldown = 0; }
  if (e.button === 2) {
    if (selected().i === 'rifle') aiming = true;
    else { building = true; cooldown = 0; }
  }
});
document.addEventListener('mouseup', (e) => {
  if (e.button === 0) digging = false;
  if (e.button === 2) { building = false; aiming = false; }
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
  objs.push(...creatures.roots(), ...structures.roots(), ...npcs.roots(), ...towns.meshes(), ...travelers.roots());
  camera.getWorldDirection(dir);
  raycaster.set(camera.position, dir);
  const hit = raycaster.intersectObjects(objs, true)[0];
  target = null;
  highlight.visible = false;
  if (!hit) return;
  let o = hit.object;
  while (o && !o.userData.creature && !o.userData.structure && !o.userData.npc && !o.userData.traveler && o.userData.kind !== 'town') o = o.parent;
  if (o && o.userData.kind === 'town') return;
  if (o && (o.userData.npc || o.userData.traveler)) {
    if (hit.distance < 4.5) target = { npc: o.userData.npc || o.userData.traveler, point: hit.point };
    return;
  }
  if (o) {
    if (o.userData.creature && hit.distance < 3.6) target = { creature: o.userData.creature, point: hit.point };
    if (o.userData.structure && hit.distance < 4.5) target = { structure: o.userData.structure, point: hit.point };
    return;
  }
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
  if (target.creature) {
    camera.getWorldDirection(dir);
    creatures.hit(target.creature, 4, dir, ctx);
    cooldown = 0.4;
    return;
  }
  if (target.npc) {
    camera.getWorldDirection(dir);
    mgr(target.npc).hit(target.npc, 4, dir, ctx);
    cooldown = 0.45;
    return;
  }
  if (target.structure) {
    items[target.structure.type]++;
    structures.remove(target.structure);
    toast(`Picked up ${ITEMS[target.structure.type].name.toLowerCase()}`);
    updateHotbar();
    return;
  }
  if (target.tree) {
    world.removeTree(target.tree);
    inv[MAT.WOOD] += 6;
    toast('+6 Timber');
    updateHotbar();
    return;
  }
  const p = target.point.clone().addScaledVector(target.normal, -brush * 0.3);
  const counts = world.edit(0, p.x, p.y, p.z, brush, 0);
  const got = [];
  for (let i = 1; i < inv.length; i++) {
    if (i === MAT.BEDROCK || !counts[i]) continue;
    inv[i] += counts[i];
    if (i >= MAT.COAL && i !== MAT.CLAY) got.push(`+${counts[i]} ${MAT_INFO[i].name}`);
  }
  if (got.length) toast(got.join('  '));
  updateHotbar();
  hazards.onDig(target.point, target.normal, brush, ctx);
}

function shoot() {
  if (!hasRifle()) { toast('You have no rifle. Craft one at a forge (Tab).'); return; }
  if (rifle.reload > 0) return;
  if (!creative && items.ammo <= 0) { toast('Out of cartridges'); cooldown = 0.6; return; }
  if (!creative) items.ammo--;
  const objs = [...creatures.roots(), ...structures.roots(), ...npcs.roots(), ...towns.meshes(), ...travelers.roots()];
  const pcx = Math.floor(player.pos.x / CS), pcz = Math.floor(player.pos.z / CS);
  for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
    const c = world.getChunk(pcx + dx, pcz + dz);
    if (!c) continue;
    if (c.mesh) objs.push(c.mesh);
    objs.push(...c.treeMeshes);
  }
  camera.getWorldDirection(dir);
  // A little spread when firing from the hip.
  if (!aiming) dir.add(tmpV.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.04)).normalize();
  raycaster.far = RIFLE_RANGE;
  raycaster.set(camera.position, dir);
  const hit = raycaster.intersectObjects(objs, true)[0];
  raycaster.far = REACH;
  const end = hit ? hit.point : camera.position.clone().addScaledVector(dir, RIFLE_RANGE);
  rifle.shoot(end);
  rifle.reload = RELOAD_TIME;
  player.pitch = Math.min(1.55, player.pitch + (aiming ? 0.02 : 0.04));
  let hitHostile = false, hitNpc = false;
  if (hit) {
    let o = hit.object;
    while (o && !o.userData.creature && !o.userData.npc && !o.userData.traveler) o = o.parent;
    if (o && o.userData.creature) { creatures.hit(o.userData.creature, RIFLE_DAMAGE, dir, ctx); hitHostile = !!o.userData.creature.def.hostile; }
    else if (o && o.userData.npc) { npcs.hit(o.userData.npc, RIFLE_DAMAGE, dir, ctx); hitNpc = true; }
    else if (o && o.userData.traveler) { travelers.hit(o.userData.traveler, RIFLE_DAMAGE, dir, ctx); hitNpc = true; }
    else hazards.puff(hit.point, 0.25);
  }
  creatures.scare(player.pos, 45);
  npcs.onGunshot(player.pos, !hitHostile && !hitNpc, ctx);
  travelers.onGunshot(player.pos);
  updateHotbar();
}

function placeStructure(type) {
  if (!target || !target.normal) return;
  if (!creative && items[type] <= 0) { toast(`You have no ${ITEMS[type].name.toLowerCase()}. Craft one (Tab).`); return; }
  if (target.normal.y < 0.6) { toast('Needs flatter ground'); return; }
  const p = target.point;
  if (Math.hypot(p.x - player.pos.x, p.z - player.pos.z) < 1.2) { toast('Too close — step back'); return; }
  if (structures.list.some((s) => Math.hypot(s.x - p.x, s.z - p.z) < 1.6)) { toast('Too close to another station'); return; }
  structures.add(type, p.x, p.y - 0.05, p.z, player.yaw + Math.PI);
  if (!creative) items[type]--;
  toast(`Placed ${ITEMS[type].name.toLowerCase()}`);
  updateHotbar();
}

function doBuild() {
  if (!target || target.tree || target.creature || target.structure || target.npc) return;
  const s = selected();
  if (s.i) { if (s.i !== 'rifle') placeStructure(s.i); return; }
  const mat = s.m;
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
const ctx = {
  player, keys, creatures, toast, damage,
  get night() { return sunDir.y < -0.05; },
  fireNear: (pos, r) => structures.near(['campfire', 'forge'], pos, r),
  get hour() { return (time % 1) * 24; },
  aiming: false,
  gunFx,
};
const fxLines = [];
function gunFx(from, to) {
  const g = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
  const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.85 }));
  l.frustumCulled = false;
  scene.add(l);
  fxLines.push({ l, t: 0.09 });
  hazards.puff(from, 0.18);
  rifle.playShot(Math.max(0.04, 0.6 * (1 - from.distanceTo(player.pos) / 90)));
}
function giveItem(id, n) {
  items[id] += n;
  toast(`+${n} ${ITEMS[id].name}`);
  updateHotbar();
  if (craftOpen) renderCraft();
}
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
    if (player.fallImpact > 14) damage(Math.round((player.fallImpact - 14) * 1.4), 'Fell from a great height');
    player.fallImpact = 0;
    creatures.update(dt, ctx);
    npcs.update(dt, ctx);
    travelers.update(dt, ctx);
    hazards.update(dt, ctx);
    pickups.update(dt, player.pos, giveItem);
    sinceHurt += dt;
    // Hunger drains faster when sprinting or swimming.
    if (!creative) {
      const moving = keys.has('KeyW') || keys.has('KeyA') || keys.has('KeyS') || keys.has('KeyD');
      const sprint = moving && (keys.has('ShiftLeft') || keys.has('ShiftRight'));
      const prev = Math.ceil(hunger);
      hunger = Math.max(0, hunger - dt * (1 / 45) * (sprint ? 3 : player.inWater ? 2 : 1));
      if (Math.ceil(hunger) !== prev) updateFood();
      if (hunger <= 0) {
        starveT += dt;
        if (starveT > 4) { starveT = 0; damage(1, 'Starved'); }
      }
    }
    if (sinceHurt > 6 && player.health < player.maxHealth && !dead && hunger >= 12) {
      regenT += dt;
      if (regenT > 3) {
        regenT = 0;
        player.health = Math.min(player.maxHealth, player.health + 1);
        if (!creative) hunger = Math.max(0, hunger - 0.4);
        updateHealth(); updateFood();
      }
    }
  }
  camera.position.set(player.pos.x, player.pos.y + EYE, player.pos.z);
  if (hazards.shake > 0) {
    const s = hazards.shake * 0.12;
    camera.position.x += (Math.random() - 0.5) * s;
    camera.position.y += (Math.random() - 0.5) * s;
    camera.position.z += (Math.random() - 0.5) * s;
  }
  camera.rotation.set(player.pitch, player.yaw, 0);

  const rifleOut = selected().i === 'rifle' && hasRifle();
  rifle.root.visible = rifleOut;
  rifle.update(dt, aiming && rifleOut);
  const fov = aiming && rifleOut ? 32 : 72;
  if (Math.abs(camera.fov - fov) > 0.1) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 12); camera.updateProjectionMatrix(); }
  structures.update(dt, player.pos, sunDir.y < -0.05);
  towns.update(player.pos, 1 - smooth(-0.15, 0.1, sunDir.y), dt, (time % 1) * 24);
  for (const f of fxLines.slice()) {
    f.t -= dt;
    if (f.t <= 0) { scene.remove(f.l); f.l.geometry.dispose(); f.l.material.dispose(); fxLines.splice(fxLines.indexOf(f), 1); }
  }
  ctx.aiming = aiming && rifleOut;

  if (locked && ready) {
    updateTarget();
    if (selected().i) highlight.visible = false;
    if (ctx.aiming) {
      camera.getWorldDirection(dir);
      raycaster.far = 35;
      raycaster.set(camera.position, dir);
      const h = raycaster.intersectObjects([...npcs.roots(), ...towns.meshes(), ...travelers.roots()], true)[0];
      raycaster.far = REACH;
      let o = h && h.object;
      while (o && !o.userData.npc && !o.userData.traveler) o = o.parent;
      if (o && o.userData.npc) npcs.aimedAt(o.userData.npc, dt, ctx);
      else if (o) travelers.aimedAt(o.userData.traveler, dt, ctx);
    }
    cooldown -= dt;
    if (cooldown <= 0 && (digging || building)) {
      cooldown = 0.25;
      if (digging && selected().i === 'rifle') { shoot(); digging = false; }
      else if (digging) doDig(); else doBuild();
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
    infoEl.textContent = `Day ${Math.floor(time) + 1}  ${pad2(hrs)}:${pad2(mins)}  ·  ${p.x.toFixed(0)}, ${p.y.toFixed(0)}, ${p.z.toFixed(0)}  ·  ${items.coin} coins  ·  ${creative ? (player.flying ? 'Creative (flying)' : 'Creative') : 'Survival'}`;
    const w = npcs.law.wanted;
    wantedEl.innerHTML = w ? '★'.repeat(w) + '<span class="off">' + '★'.repeat(5 - w) + '</span>' : '';
    wantedEl.classList.toggle('seen', npcs.law.seen);
    const nt = towns.nearest(p.x, p.z);
    if (!nt) townHud.textContent = '';
    else if (nt.dist < nt.town.R + 8) {
      const rs = nt.town.roads || world.roads.roadsOf(nt.town);
      townHud.textContent = rs.length
        ? `${nt.town.name}  ·  roads to ${rs.map((r) => (r.a === nt.town ? r.b : r.a).name).join(', ')}`
        : `${nt.town.name}  ·  no roads in or out`;
    }
    else townHud.textContent = `${nt.town.name}  ·  ${Math.round(nt.dist)} m ${dirName(nt.town.x - p.x, nt.town.z - p.z)}`;
  }
}
requestAnimationFrame(frame);

// Handle for debugging from the console.
window.driftland = { world, player, inv, items, scene, camera, creatures, hazards, pickups, structures, rifle, ctx, npcs, towns, travelers,
  openTalk, renderTalk, get bounty() { return bounty; },
  craft, RECIPES, shoot, eat, openCraft, renderCraft, select: (i) => { sel = i; updateHotbar(); }, get hunger() { return hunger; }, get target() { return target; }, doDig, doBuild, setTime: (t) => { time = t; } };
