// The city: an infinite procedural tile grid, streamed in chunks around a focus point.
// Unedited chunks are regenerated from the world seed on demand. Chunks the player has
// touched are kept (and saved) in full.
import * as THREE from 'three';
import {
  TILE, CHUNK, CHUNK_W, SETTINGS, FREE_ZONE, SUPERBLOCK, DIRS, TOOLS, MAX_LEVEL,
  NO_ROAD_NEEDED, DRONE_TYPES, tileCenter, chunkCoord, chunkKey, buildingYield,
} from './config.js';
import { GENERATORS } from './buildings.js';
import { Parts, meshesFromPartMaps } from './geom.js';
import { MAT } from './materials.js';
import { mulberry32, randSeed, hash3, hashInt, vnoise } from './rng.js';
import { Highways } from './highways.js';

const mod = (a, n) => ((a % n) + n) % n;
export const CORPS = ['Arasaki-Kemp', 'Omnidyne', 'Helix Biotic', 'Vantablack Sys', 'Kuroshio Heavy', 'Neural+', 'Sunward Orbital', 'Mirrorgate', 'Tessellate', 'Black Lotus', 'Cobalt Meridian', 'Zentek'];

class Chunk {
  constructor(cx, cz) {
    this.cx = cx; this.cz = cz;
    this.key = chunkKey(cx, cz);
    this.i0 = cx * CHUNK; this.j0 = cz * CHUNK;
    this.road = new Uint8Array(CHUNK * CHUNK);
    this.owner = new Int32Array(CHUNK * CHUNK).fill(-1);
    this.ids = new Set();     // buildings anchored in this chunk
    this.modified = false;    // touched by the player -> kept + saved
    this.meshes = [];
    this.dirty = true;        // meshes need a rebuild
    this.roadDirty = true;
    this.roadParts = null;
    this.urgent = false;      // rebuild ignoring the frame budget (player edit)
    this.vents = [];          // steam vent positions for the street FX
    this.cx0 = (cx + 0.5) * CHUNK_W; this.cz0 = (cz + 0.5) * CHUNK_W;
  }
  local(i, j) { return (j - this.j0) * CHUNK + (i - this.i0); }
}

export class City {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.animRoot = new THREE.Group();
    this.warnRoot = new THREE.Group();
    scene.add(this.root, this.animRoot, this.warnRoot);
    this.listeners = new Set();
    this.highways = new Highways(this);
    this.reset(1);
  }

  reset(seed, { freeZone = true } = {}) {
    if (this.chunks) for (const c of [...this.chunks.values()]) this.unloadChunk(c, true);
    this.seed = seed >>> 0;
    this.freeZone = freeZone;
    this.chunks = new Map();
    this.buildings = new Map();
    this.owned = new Set();
    this.anims = [];
    this.nextId = 1;
    this.placedDrones = []; // [{ type, i, j, seed }]
    this.credits = 30000;
    this.sandbox = false;
    this.changed = false;
    this.version = 0; // bumps on any visible change (minimap refresh)
  }

  onChange(fn) { this.listeners.add(fn); }
  emit(kind) { this.changed = true; this.version++; for (const fn of this.listeners) fn(kind); }
  spend(cost) {
    if (this.sandbox) return true;
    if (this.credits < cost) return false;
    this.credits -= cost;
    return true;
  }

  // ------------------------------------------------------------ procedural layout (pure)
  baseRoad(i, j) {
    const S = SUPERBLOCK, mi = mod(i, S), mj = mod(j, S);
    if (mi === 0 || mj === 0) return true;
    const sx = Math.floor(i / S), sz = Math.floor(j / S), s = this.seed;
    // open districts keep only the main avenues: big blocks of parkland and empty lots
    if (this.openness(sx * S + S / 2, sz * S + S / 2) > 0.55) return false;
    if (hash3(sx * 7 + 1, sz * 13 + 5, s) < 0.8 && mi === 4 + Math.floor(hash3(sx, sz + 99, s) * 5)) return true;
    if (hash3(sx * 11 + 3, sz * 5 + 9, s) < 0.8 && mj === 4 + Math.floor(hash3(sx + 77, sz, s) * 5)) return true;
    return false;
  }
  inFreeZone(i, j) { return this.freeZone && i >= -FREE_ZONE && i < FREE_ZONE && j >= -FREE_ZONE && j < FREE_ZONE; }
  downtown(i, j) { return vnoise(this.seed, i / 38, j / 38) * 0.75 + vnoise(this.seed + 7, i / 11, j / 11) * 0.25; }
  tech(i, j) { return vnoise(this.seed + 99, i / 24, j / 24); }
  // Open districts (parks, empty lots, low-rise) vs dense ones; downtown is never open.
  openness(i, j) {
    const o = vnoise(this.seed + 300, i / 34, j / 34);
    return this.downtown(i, j) > 0.62 ? 0 : o;
  }

  // ------------------------------------------------------------ tile access
  chunkAt(i, j) { return this.chunks.get(chunkKey(chunkCoord(i), chunkCoord(j))); }
  ensureChunk(cx, cz) {
    const k = chunkKey(cx, cz);
    let c = this.chunks.get(k);
    if (!c) { c = new Chunk(cx, cz); this.chunks.set(k, c); this.populate(c); }
    return c;
  }
  ensureTile(i, j) { return this.ensureChunk(chunkCoord(i), chunkCoord(j)); }
  isRoad(i, j) {
    const c = this.chunkAt(i, j);
    return c ? c.road[c.local(i, j)] === 1 : this.baseRoad(i, j);
  }
  buildingAt(i, j) {
    const c = this.chunkAt(i, j);
    if (!c) return null;
    const id = c.owner[c.local(i, j)];
    return id >= 0 ? this.buildings.get(id) : null;
  }

  // ------------------------------------------------------------ generation
  pickType(r, d, t) {
    const table = d > 0.6
      ? [['corp', 0.42], ['habitat', 0.27], ['dataspire', 0.07], ['billboard', 0.06], ['clinic', 0.05], ['dronehub', 0.05], ['plaza', 0.03], ['powercore', 0.02], ['uplink', 0.008]]
      : [['habitat', 0.68], ['corp', 0.09], ['clinic', 0.05], ['billboard', 0.05], ['plaza', 0.04], ['dronehub', 0.04], ['dataspire', 0.03], ['powercore', 0.02], ['uplink', 0.004]];
    if (t > 0.68 && r.chance((t - 0.68) * 1.6)) return r.pick(['dataspire', 'dataspire', 'dronehub', 'powercore', 'uplink']);
    let x = r() * table.reduce((s, e) => s + e[1], 0);
    for (const [type, w] of table) { x -= w; if (x <= 0) return type; }
    return 'habitat';
  }
  levelFor(r, d) {
    const base = 1 + Math.max(0, d - 0.3) * 9;
    return Math.max(1, Math.min(MAX_LEVEL, Math.round(base * r.range(0.6, 1.2) + r.range(-0.6, 0.8))));
  }
  tileFreeIn(c, i, j) {
    if (i < c.i0 || j < c.j0 || i >= c.i0 + CHUNK || j >= c.j0 + CHUNK) return false;
    const k = c.local(i, j);
    return !c.road[k] && c.owner[k] < 0 && !this.inFreeZone(i, j);
  }
  populate(c) {
    for (let b = 0; b < CHUNK; b++) for (let a = 0; a < CHUNK; a++) {
      c.road[b * CHUNK + a] = this.baseRoad(c.i0 + a, c.j0 + b) ? 1 : 0;
    }
    const r = mulberry32(hashInt(c.cx * 7 + 3, c.cz * 13 + 1, this.seed));
    for (let t = 0; t < 6; t++) {
      const i = c.i0 + r.int(0, CHUNK - 2), j = c.j0 + r.int(0, CHUNK - 2);
      if (this.downtown(i, j) > 0.55 && r.chance(0.6) &&
        this.tileFreeIn(c, i, j) && this.tileFreeIn(c, i + 1, j) && this.tileFreeIn(c, i, j + 1) && this.tileFreeIn(c, i + 1, j + 1)) {
        this.addBuilding('arcology', i, j, { level: this.levelFor(r, this.downtown(i, j)), seed: hashInt(i, j, this.seed + 5), owned: false });
      }
    }
    // dark alleys: one open side onto a street, gangs gather inside
    const nAlleys = r() < 0.75 ? r.int(1, 3) : 0;
    for (let t = 0, made = 0; t < 30 && made < nAlleys; t++) {
      const i = c.i0 + r.int(1, CHUNK - 2), j = c.j0 + r.int(1, CHUNK - 2);
      if (!this.tileFreeIn(c, i, j) || this.downtown(i, j) > 0.72) continue;
      const open = DIRS.map(([dx, dz]) => this.baseRoad(i + dx, j + dz));
      if (open.filter(Boolean).length !== 1) continue;
      this.addBuilding('alley', i, j, { level: 1 + open.indexOf(true), seed: hashInt(i, j, this.seed + 17), owned: false });
      made++;
    }
    for (let b = 0; b < CHUNK; b++) for (let a = 0; a < CHUNK; a++) {
      const i = c.i0 + a, j = c.j0 + b;
      if (!this.tileFreeIn(c, i, j)) continue;
      const S = SUPERBLOCK;
      if (this.openness(Math.floor(i / S) * S + S / 2, Math.floor(j / S) * S + S / 2) > 0.55) {
        // open district: parkland, empty lots, the odd low-rise or billboard
        const roll = r();
        if (roll < 0.5) this.addBuilding('park', i, j, { level: 1, seed: hashInt(i, j, this.seed + 23), owned: false });
        else if (roll < 0.62) this.addBuilding('plaza', i, j, { level: 1, seed: hashInt(i, j, this.seed + 11), owned: false });
        else if (roll < 0.74) this.addBuilding('habitat', i, j, { level: r.int(1, 2), seed: hashInt(i, j, this.seed + 11), owned: false });
        else if (roll < 0.78) this.addBuilding('billboard', i, j, { level: 1, seed: hashInt(i, j, this.seed + 11), owned: false });
        continue; // the rest stays as open lots
      }
      const d = this.downtown(i, j);
      const type = this.pickType(r, d, this.tech(i, j));
      this.addBuilding(type, i, j, { level: type === 'plaza' ? 1 : this.levelFor(r, d), seed: hashInt(i, j, this.seed + 11), owned: false });
    }
  }

  footprint(type, i, j) {
    const s = TOOLS[type].size, out = [];
    for (let a = 0; a < s; a++) for (let b = 0; b < s; b++) out.push([i + a, j + b]);
    return out;
  }
  center(b) {
    const c = tileCenter(b.i, b.j);
    if (b.size === 2) { c.x += TILE / 2; c.z += TILE / 2; }
    return c;
  }
  addBuilding(type, i, j, { level = 1, seed = randSeed(), owned = true }) {
    const id = this.nextId++;
    const b = { id, type, i, j, level, seed, owned, size: TOOLS[type].size, parts: null, anim: null };
    const c0 = this.center(b), h = (TILE * b.size) / 2 - 1;
    b.rects = type === 'plaza' || type === 'alley' || type === 'park' ? [] : [[c0.x - h, c0.z - h, c0.x + h, c0.z + h]];
    b.height = 20;
    b.corp = CORPS[seed % CORPS.length];
    this.buildings.set(id, b);
    for (const [a, c] of this.footprint(type, i, j)) {
      const ch = this.chunkAt(a, c);
      ch.owner[ch.local(a, c)] = id;
    }
    const anchor = this.chunkAt(i, j);
    anchor.ids.add(id);
    anchor.dirty = true;
    if (owned) this.owned.add(id);
    return b;
  }

  // Build (or rebuild) this building's geometry. partsOnly skips re-creating holograms.
  generate(b, partsOnly = false) {
    if (b.parts) for (const g of b.parts.values()) g.dispose();
    const c = this.center(b);
    const res = GENERATORS[b.type](b.level, b.seed, c.x, c.z);
    b.parts = res.parts;
    b.height = res.height;
    b.rects = res.rects || (res.rect ? [res.rect] : []);
    if (partsOnly && b.anim) return;
    this.removeAnims(b);
    b.anim = res.anim;
    for (const a of res.anim) {
      a.baseY = a.obj.position.y;
      a.phase = hash3(b.id, 3) * 6;
      this.animRoot.add(a.obj);
      this.anims.push(a);
    }
  }
  removeAnims(b) {
    if (!b.anim) return;
    for (const a of b.anim) this.animRoot.remove(a.obj);
    const set = new Set(b.anim);
    this.anims = this.anims.filter((a) => !set.has(a));
    b.anim = null;
  }
  disposeGeom(b) {
    if (b.parts) for (const g of b.parts.values()) g.dispose();
    b.parts = null;
    this.removeAnims(b);
    if (b.warn) { this.warnRoot.remove(b.warn); b.warn = null; }
  }

  // ------------------------------------------------------------ player edits
  touch(i, j, roads = false) {
    const c = this.ensureTile(i, j);
    c.modified = true; c.dirty = true; c.urgent = true;
    if (roads) {
      c.roadDirty = true;
      // neighbouring chunks render this tile's edge (sidewalks), refresh them too
      for (const [dx, dz] of DIRS) {
        const n = this.chunkAt(i + dx, j + dz);
        if (n && n !== c) { n.roadDirty = true; n.dirty = true; n.urgent = true; }
      }
    }
    this.changed = true;
  }
  canRoad(i, j) { this.ensureTile(i, j); return !this.isRoad(i, j) && !this.buildingAt(i, j); }
  setRoad(i, j, on, { free = false } = {}) {
    const c = this.ensureTile(i, j);
    const k = c.local(i, j);
    if (on) {
      if (!this.canRoad(i, j)) return false;
      if (!free && !this.spend(TOOLS.road.cost)) return 'money';
      c.road[k] = 1;
    } else {
      if (!c.road[k]) return false;
      c.road[k] = 0;
    }
    this.touch(i, j, true);
    return true;
  }
  canPlace(type, i, j) {
    return this.footprint(type, i, j).every(([a, b]) => { this.ensureTile(a, b); return !this.isRoad(a, b) && !this.buildingAt(a, b) && !this.highways.onTile(a, b); });
  }
  place(type, i, j, { level = 1, seed = randSeed(), free = false, owned = true } = {}) {
    if (!this.canPlace(type, i, j)) return false;
    if (!free && !this.spend(TOOLS[type].cost)) return 'money';
    const b = this.addBuilding(type, i, j, { level, seed, owned });
    for (const [a, c] of this.footprint(type, i, j)) this.touch(a, c);
    this.generate(b);
    return b;
  }
  remove(i, j, { free = false } = {}) {
    const b = this.buildingAt(i, j);
    if (!b) return false;
    for (const [a, c] of this.footprint(b.type, b.i, b.j)) {
      const ch = this.chunkAt(a, c);
      ch.owner[ch.local(a, c)] = -1;
      this.touch(a, c);
    }
    this.chunkAt(b.i, b.j).ids.delete(b.id);
    this.disposeGeom(b);
    this.buildings.delete(b.id);
    if (b.owned && !free && !this.sandbox) this.credits += Math.floor(TOOLS[b.type].cost * (0.5 + 0.3 * (b.level - 1)));
    this.owned.delete(b.id);
    return true;
  }
  growCost(b) { return Math.floor(TOOLS[b.type].cost * 0.6 * b.level); }
  grow(i, j, { free = false } = {}) {
    const b = this.buildingAt(i, j);
    if (!b) return false;
    if (b.level >= MAX_LEVEL || b.type === 'alley' || b.type === 'park') return 'max';
    if (!free && !this.spend(this.growCost(b))) return 'money';
    b.level++;
    b.seed = (Math.imul(b.seed, 1664525) + 1013904223) >>> 0;
    if (!b.owned) { b.owned = true; this.owned.add(b.id); } // investing claims it
    this.generate(b);
    this.touch(b.i, b.j);
    return true;
  }
  // ------------------------------------------------------------ deployed drones
  placeDrone(type, i, j, { free = false, seed = randSeed() } = {}) {
    if (!free && !this.spend(DRONE_TYPES[type].cost)) return 'money';
    this.placedDrones.push({ type, i, j, seed });
    this.changed = true; this.version++;
    return true;
  }
  removeDronesIn(i0, j0, i1, j1) {
    const before = this.placedDrones.length;
    this.placedDrones = this.placedDrones.filter((d) => {
      const hit = d.i >= i0 && d.i <= i1 && d.j >= j0 && d.j <= j1;
      if (hit && !this.sandbox) this.credits += Math.floor(DRONE_TYPES[d.type].cost / 2);
      return !hit;
    });
    if (this.placedDrones.length !== before) { this.changed = true; this.version++; }
    return before - this.placedDrones.length;
  }

  connected(b) {
    const s = b.size;
    for (let a = 0; a < s; a++) {
      if (this.isRoad(b.i + a, b.j - 1) || this.isRoad(b.i + a, b.j + s)) return true;
      if (this.isRoad(b.i - 1, b.j + a) || this.isRoad(b.i + s, b.j + a)) return true;
    }
    return false;
  }

  // ------------------------------------------------------------ streaming
  stream(fx, fz, budgetMs = 6) {
    const ccx = Math.floor(fx / CHUNK_W), ccz = Math.floor(fz / CHUNK_W);
    const R = Math.ceil(SETTINGS.loadDist / CHUNK_W);
    const want = [];
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      const cx = ccx + dx, cz = ccz + dz;
      const d = Math.hypot((cx + 0.5) * CHUNK_W - fx, (cz + 0.5) * CHUNK_W - fz);
      if (d < SETTINGS.loadDist) want.push({ cx, cz, d });
    }
    want.sort((a, b) => a.d - b.d);
    const t0 = performance.now();
    let ready = 0, changed = false;
    for (const w of want) {
      const c = this.ensureChunk(w.cx, w.cz);
      if (c.dirty && (c.urgent || performance.now() - t0 < budgetMs)) {
        if (this.buildChunk(c, t0, c.urgent ? Infinity : budgetMs)) changed = true;
      }
      if (!c.dirty) ready++;
    }
    // edits in chunks outside the load ring still need their state, just no meshes
    for (const c of this.chunks.values()) {
      const d = Math.hypot(c.cx0 - fx, c.cz0 - fz);
      if (d > SETTINGS.unloadDist) this.unloadChunk(c);
    }
    if (changed) { this.refreshWarnings(); this.emit('chunks'); }
    return { ready, total: want.length };
  }

  buildChunk(c, t0, budget) {
    for (const id of c.ids) {
      const b = this.buildings.get(id);
      if (b && !b.parts) {
        if (performance.now() - t0 > budget) return false;
        this.generate(b, true);
      }
    }
    if (c.roadDirty || !c.roadParts) {
      if (c.roadParts) for (const g of c.roadParts.values()) g.dispose();
      c.roadParts = this.roadParts(c);
      c.roadDirty = false;
    }
    for (const m of c.meshes) { this.root.remove(m); m.geometry.dispose(); }
    const maps = [c.roadParts];
    for (const id of c.ids) { const b = this.buildings.get(id); if (b?.parts) maps.push(b.parts); }
    c.meshes = meshesFromPartMaps(maps, MAT, true);
    c.meshes.forEach((m) => this.root.add(m));
    // keep source geometry only where the player builds; elsewhere regenerate if ever needed
    if (!c.modified) {
      for (const id of c.ids) {
        const b = this.buildings.get(id);
        if (b?.parts) { for (const g of b.parts.values()) g.dispose(); b.parts = null; }
      }
    }
    c.dirty = false;
    c.urgent = false;
    return true;
  }

  unloadChunk(c, force = false) {
    for (const m of c.meshes) { this.root.remove(m); m.geometry.dispose(); }
    c.meshes = [];
    if (c.roadParts) for (const g of c.roadParts.values()) g.dispose();
    c.roadParts = null;
    for (const id of c.ids) {
      const b = this.buildings.get(id);
      if (!b) continue;
      this.disposeGeom(b);
      if (!c.modified || force) { this.buildings.delete(id); this.owned.delete(id); }
    }
    if (!c.modified || force) this.chunks.delete(c.key);
    else { c.dirty = true; c.roadDirty = true; }
  }

  // ------------------------------------------------------------ street geometry for one chunk
  roadParts(c) {
    const P = new Parts();
    const PI = Math.PI, s = this.seed;
    c.vents = [];
    for (let b = 0; b < CHUNK; b++) for (let a = 0; a < CHUNK; a++) {
      const i = c.i0 + a, j = c.j0 + b;
      if (!c.road[b * CHUNK + a]) continue;
      const { x, z } = tileCenter(i, j);
      const plane = new THREE.PlaneGeometry(TILE, TILE);
      plane.rotateX(-PI / 2);
      const uv = plane.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * 0.5 + mod(i, 2) * 0.5, uv.getY(k) * 0.5 + mod(j, 2) * 0.5);
      P.geo('asphalt', plane, x, 0.02, z);
      const n = DIRS.map(([dx, dz]) => this.isRoad(i + dx, j + dz));
      const count = n.filter(Boolean).length;
      const straight = count === 2 && ((n[0] && n[2]) || (n[1] && n[3]));
      let lampSide = -1;
      DIRS.forEach(([dx, dz], d) => {
        const alongX = dz !== 0;
        const ex = x + dx * (TILE / 2), ez = z + dz * (TILE / 2);
        if (!n[d]) {
          const sx = x + dx * (TILE / 2 - 0.8), sz = z + dz * (TILE / 2 - 0.8);
          P.box('concrete', alongX ? TILE : 1.6, 0.22, alongX ? 1.6 : TILE, sx, 0.11, sz, 0, false);
          const kx = x + dx * (TILE / 2 - 1.62), kz = z + dz * (TILE / 2 - 1.62);
          P.box('dim_cyan', alongX ? TILE : 0.08, 0.05, alongX ? 0.08 : TILE, kx, 0.2, kz, 0, false);
          if (lampSide < 0) lampSide = d;
          // sidewalk vending machine / data kiosk
          if (hash3(i * 4 + d, j, s + 21) < 0.09) {
            const t = (hash3(i, j * 4 + d, s + 22) - 0.5) * 6;
            const vx = sx + (alongX ? t : 0), vz = sz + (alongX ? 0 : t);
            P.box('metal', alongX ? 1.1 : 0.7, 2, alongX ? 0.7 : 1.1, vx, 1.22, vz, 0, false);
            // screen faces the road (towards the tile centre)
            const ry = alongX ? (dz > 0 ? PI : 0) : (dx > 0 ? -PI / 2 : PI / 2);
            P.plane('ad' + Math.floor(hash3(i, j, s + 23) * 8), 0.9, 1.2, vx - dx * 0.37, 1.45, vz - dz * 0.37, ry);
            P.box('neon_' + ['cyan', 'magenta', 'amber', 'green'][Math.floor(hash3(j, i, s + 24) * 4)], alongX ? 1.12 : 0.72, 0.08, alongX ? 0.72 : 1.12, vx, 2.25, vz, 0, false);
          }
        } else if (count >= 3) {
          for (let k = -2; k <= 2; k++) {
            const off = k * 1.6;
            const cx2 = ex - dx * 1.4, cz2 = ez - dz * 1.4;
            P.box('paint', alongX ? 0.8 : 1.6, 0.02, alongX ? 1.6 : 0.8, cx2 + (alongX ? off : 0), 0.04, cz2 + (alongX ? 0 : off), 0, false);
          }
        } else {
          for (const f of [0.18, 0.62]) {
            const px = x + dx * TILE * f * 0.5 + dx * 0.9, pz = z + dz * TILE * f * 0.5 + dz * 0.9;
            P.box('lane', alongX ? 0.2 : 1.8, 0.02, alongX ? 1.8 : 0.2, px, 0.04, pz, 0, false);
          }
        }
      });
      this.highways.addTileParts(P, i, j);
      const underDeck = this.highways.onTile(i, j);
      if (straight) {
        const alongZ = n[1];
        for (const sg of [-1, 1]) {
          P.box('paint', alongZ ? 0.1 : TILE, 0.02, alongZ ? TILE : 0.1, x + (alongZ ? sg * 4.2 : 0), 0.035, z + (alongZ ? 0 : sg * 4.2), 0, false);
        }
        // power + data cables strung between the buildings across the street, with lanterns
        if (!underDeck && hash3(i, j, s + 31) < 0.45) {
          const nc = 1 + Math.floor(hash3(j, i, s + 32) * 3);
          for (let k = 0; k < nc; k++) {
            const h = 7 + hash3(i + k, j, s + 33) * 20;
            const along = (hash3(i, j + k, s + 34) - 0.5) * 9;
            const sag = 0.8 + hash3(i - k, j, s + 35) * 1.6;
            const SEG = 6, span = TILE + 1;
            for (let q = 0; q < SEG; q++) {
              const u0 = q / SEG - 0.5, u1 = (q + 1) / SEG - 0.5;
              const y0 = h - sag * (1 - 4 * u0 * u0), y1 = h - sag * (1 - 4 * u1 * u1);
              const len = Math.hypot(span / SEG, y1 - y0);
              const ang = Math.atan2(y1 - y0, span / SEG);
              const g = new THREE.BoxGeometry(len, 0.07, 0.07);
              g.rotateZ(ang);
              const um = (u0 + u1) / 2 * span, ym = (y0 + y1) / 2;
              if (alongZ) { g.rotateY(0); P.geo('cable', g, x + um, ym, z + along); }
              else { g.rotateY(PI / 2); P.geo('cable', g, x + along, ym, z + um); }
              if (q % 2 === 1 && hash3(i * 9 + q, j + k, s + 36) < 0.6) {
                const key = 'neon_' + ['magenta', 'amber', 'cyan', 'pink', 'red'][Math.floor(hash3(i, j * 9 + q, s + 37) * 5)];
                const lx = alongZ ? x + (u1 * span) : x + along, lz = alongZ ? z + along : z + (u1 * span);
                P.box(key, 0.35, 0.5, 0.35, lx, y1 - 0.35, lz, 0, false);
              }
            }
          }
        }
      }
      // steam vents (manholes)
      if (hash3(i, j, s + 41) < 0.07) {
        const vx = x + (hash3(i, j, s + 42) - 0.5) * 6, vz = z + (hash3(j, i, s + 43) - 0.5) * 6;
        P.cyl('metal', 0.55, 0.55, 0.03, vx, 0.02, vz, 10, false);
        c.vents.push([vx, vz]);
      }
      if (lampSide >= 0 && mod(i * 7 + j * 13, 3) === 0) {
        const [dx, dz] = DIRS[lampSide];
        const px = x + dx * (TILE / 2 - 0.7), pz = z + dz * (TILE / 2 - 0.7);
        P.cyl('metal', 0.08, 0.12, 7.5, px, 0.22, pz, 6, false);
        const ax = px - dx * 1.3, az = pz - dz * 1.3;
        P.box('metal', Math.abs(dx) * 2.6 + 0.12, 0.12, Math.abs(dz) * 2.6 + 0.12, px - dx * 1.2, 7.6, pz - dz * 1.2, 0, false);
        P.box('lamp', Math.abs(dx) * 0.9 + 0.35, 0.12, Math.abs(dz) * 0.9 + 0.35, ax - dx * 0.6, 7.5, az - dz * 0.6, 0, false);
        const pool = new THREE.PlaneGeometry(9, 9);
        pool.rotateX(-PI / 2);
        P.geo('pool', pool, ax - dx * 1.2, 0.06, az - dz * 1.2);
      }
    }
    // empty lots (cleared by the player or the starting district) get bare ground slabs
    for (let b = 0; b < CHUNK; b++) for (let a = 0; a < CHUNK; a++) {
      const k = b * CHUNK + a;
      if (c.road[k] || c.owner[k] >= 0) continue;
      const { x, z } = tileCenter(c.i0 + a, c.j0 + b);
      P.box('concrete', TILE - 0.3, 0.08, TILE - 0.3, x, 0.04, z, 0, false);
    }
    return P.merge();
  }

  // ------------------------------------------------------------ per frame
  update(dt, t, buildMode) {
    for (const a of this.anims) {
      a.obj.rotation.y += a.spin * dt;
      a.obj.position.y = a.baseY + Math.sin(t * 1.3 + a.phase) * a.bob;
    }
    this.warnRoot.visible = buildMode;
  }

  refreshWarnings() {
    const power = this.power;
    for (const id of this.owned) {
      const b = this.buildings.get(id);
      if (!b) continue;
      const noRoad = !NO_ROAD_NEEDED.has(b.type) && !this.connected(b);
      const noPower = !noRoad && power && power.ratio < 1 && buildingYield(b.type, 1).power < 0;
      const mat = noRoad ? MAT.warnLabel : noPower ? MAT.noPower : null;
      const loaded = this.chunkAt(b.i, b.j)?.meshes.length > 0;
      if (mat && loaded) {
        if (!b.warn) {
          b.warn = new THREE.Sprite(mat);
          const c = this.center(b);
          b.warn.position.set(c.x, Math.min(b.height + 6, 60), c.z);
          b.warn.scale.set(16, 4, 1);
          b.warn.renderOrder = 10;
          this.warnRoot.add(b.warn);
        }
        b.warn.material = mat;
      } else if (b.warn) {
        this.warnRoot.remove(b.warn);
        b.warn = null;
      }
    }
  }

  // ------------------------------------------------------------ economy (player-owned only)
  stats() {
    let pop = 0, jobs = 0, supply = 0, demand = 0, bonus = 0, count = 0;
    for (const id of this.owned) {
      const b = this.buildings.get(id);
      if (!b) continue;
      count++;
      if (!NO_ROAD_NEEDED.has(b.type) && !this.connected(b)) continue;
      const y = buildingYield(b.type, b.level);
      pop += y.pop; jobs += y.jobs; bonus += y.bonus;
      if (y.power > 0) supply += y.power; else demand -= y.power;
    }
    for (const d of this.placedDrones) bonus += DRONE_TYPES[d.type].bonus;
    const ratio = demand > 0 ? Math.min(1, supply / demand) : 1;
    const income = Math.round((pop * 0.002 + Math.min(pop, jobs) * 0.004 + jobs * 0.001 + bonus) * (0.25 + 0.75 * ratio));
    this.power = { supply, demand, ratio };
    return { pop, jobs, income, supply, demand, ratio, count };
  }

  tickEconomy(autoGrowth) {
    const s = this.stats();
    this.credits += s.income;
    this.refreshWarnings();
    if (!autoGrowth || s.ratio < 1) return null;
    const cands = [];
    for (const id of this.owned) {
      const b = this.buildings.get(id);
      if (!b || b.level >= MAX_LEVEL || b.type === 'plaza' || !this.connected(b) || !this.chunkAt(b.i, b.j)?.meshes.length) continue;
      let score = 0;
      for (let a = -2; a <= 2; a++) for (let c = -2; c <= 2; c++) {
        const o = this.buildingAt(b.i + a, b.j + c);
        if (o && o !== b) score += o.type === 'plaza' ? 3 : 1;
      }
      if (b.level < 2 + score / 6) cands.push(b);
    }
    if (cands.length && Math.random() < 0.3) {
      const b = cands[Math.floor(Math.random() * cands.length)];
      this.grow(b.i, b.j, { free: true });
      return b;
    }
    return null;
  }

  // ------------------------------------------------------------ collision
  obstaclesNear(x, z, y = 0) {
    const out = y < 3 ? this.highways.pylonRects(x, z) : [];
    const seen = new Set();
    const ci = Math.floor(x / TILE), cj = Math.floor(z / TILE);
    for (let a = -2; a <= 2; a++) for (let c = -2; c <= 2; c++) {
      const b = this.buildingAt(ci + a, cj + c);
      if (b && !seen.has(b.id)) { seen.add(b.id); out.push(...b.rects); }
    }
    return out;
  }

  // ------------------------------------------------------------ save / load
  serialize() {
    const chunks = {};
    for (const c of this.chunks.values()) {
      if (!c.modified) continue;
      let r = '';
      for (let k = 0; k < c.road.length; k++) r += c.road[k];
      const b = [];
      for (const id of c.ids) {
        const x = this.buildings.get(id);
        if (x) b.push([x.type, x.i, x.j, x.level, x.seed, x.owned ? 1 : 0]);
      }
      chunks[c.key] = { r, b };
    }
    const drones = this.placedDrones.map((d) => [d.type, d.i, d.j, d.seed]);
    return { v: 2, seed: this.seed, freeZone: this.freeZone, credits: Math.floor(this.credits), sandbox: this.sandbox, chunks, drones };
  }
  load(data) {
    this.reset(data.seed, { freeZone: data.freeZone !== false });
    const pending = [];
    for (const [key, cd] of Object.entries(data.chunks || {})) {
      const [cx, cz] = key.split(',').map(Number);
      const c = new Chunk(cx, cz);
      c.modified = true;
      for (let k = 0; k < c.road.length; k++) c.road[k] = cd.r.charCodeAt(k) === 49 ? 1 : 0;
      this.chunks.set(key, c);
      pending.push(...cd.b);
    }
    for (const [type, i, j, level, seed, owned] of pending) {
      if (!GENERATORS[type]) continue;
      for (const [a, b] of this.footprint(type, i, j)) this.ensureTile(a, b);
      if (this.footprint(type, i, j).some(([a, b]) => this.buildingAt(a, b))) continue;
      this.addBuilding(type, i, j, { level, seed, owned: !!owned });
    }
    this.placedDrones = (data.drones || []).filter((d) => DRONE_TYPES[d[0]]).map(([type, i, j, seed]) => ({ type, i, j, seed }));
    this.credits = data.credits ?? 30000;
    this.sandbox = !!data.sandbox;
  }
}
