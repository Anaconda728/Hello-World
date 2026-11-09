// City state: tile grid, buildings, roads, chunked rendering, economy, save/load.
import * as THREE from 'three';
import { GRID, TILE, HALF, CHUNK, DIRS, TOOLS, MAX_LEVEL, tileCenter, inGrid, buildingYield } from './config.js';
import { GENERATORS } from './buildings.js';
import { Parts, meshesFromPartMaps } from './geom.js';
import { MAT } from './materials.js';
import { mulberry32, randSeed } from './rng.js';

const SAVE_KEY = 'neonsprawl.save.v1';
const NCH = GRID / CHUNK;

export class City {
  constructor(scene) {
    this.scene = scene;
    this.road = new Uint8Array(GRID * GRID);
    this.owner = new Int32Array(GRID * GRID).fill(-1); // building id per tile
    this.buildings = new Map();
    this.nextId = 1;
    this.credits = 25000;
    this.sandbox = false;
    this.listeners = new Set();

    this.root = new THREE.Group();
    this.animRoot = new THREE.Group();
    this.warnRoot = new THREE.Group();
    scene.add(this.root, this.animRoot, this.warnRoot);
    this.chunkMeshes = Array.from({ length: NCH * NCH }, () => []);
    this.chunkDirty = new Set();
    this.roadMeshes = [];
    this.roadsDirty = false;
    this.changed = false;
    this.anims = [];
  }

  idx(i, j) { return j * GRID + i; }
  isRoad(i, j) { return inGrid(i, j) && this.road[this.idx(i, j)] === 1; }
  buildingAt(i, j) {
    if (!inGrid(i, j)) return null;
    const id = this.owner[this.idx(i, j)];
    return id >= 0 ? this.buildings.get(id) : null;
  }
  onChange(fn) { this.listeners.add(fn); }
  emit(kind) { this.changed = true; for (const fn of this.listeners) fn(kind); }

  spend(cost) {
    if (this.sandbox) return true;
    if (this.credits < cost) return false;
    this.credits -= cost;
    return true;
  }

  // ------------------------------------------------------------ roads
  canRoad(i, j) { return inGrid(i, j) && !this.isRoad(i, j) && !this.buildingAt(i, j); }
  setRoad(i, j, on, { free = false } = {}) {
    if (!inGrid(i, j)) return false;
    const k = this.idx(i, j);
    if (on) {
      if (!this.canRoad(i, j)) return false;
      if (!free && !this.spend(TOOLS.road.cost)) return 'money';
      this.road[k] = 1;
    } else {
      if (!this.road[k]) return false;
      this.road[k] = 0;
      if (!free && !this.sandbox) this.credits += Math.floor(TOOLS.road.cost / 2);
    }
    this.roadsDirty = true;
    return true;
  }

  // ------------------------------------------------------------ buildings
  footprint(type, i, j) {
    const s = TOOLS[type].size;
    const tiles = [];
    for (let a = 0; a < s; a++) for (let b = 0; b < s; b++) tiles.push([i + a, j + b]);
    return tiles;
  }
  canPlace(type, i, j) {
    return this.footprint(type, i, j).every(([a, b]) => inGrid(a, b) && !this.isRoad(a, b) && !this.buildingAt(a, b));
  }
  place(type, i, j, { level = 1, seed = randSeed(), free = false } = {}) {
    if (!this.canPlace(type, i, j)) return false;
    if (!free && !this.spend(TOOLS[type].cost)) return 'money';
    const id = this.nextId++;
    const b = { id, type, i, j, level, seed, size: TOOLS[type].size };
    this.buildings.set(id, b);
    for (const [a, c] of this.footprint(type, i, j)) this.owner[this.idx(a, c)] = id;
    this.generate(b);
    return b;
  }
  center(b) {
    const c = tileCenter(b.i, b.j);
    if (b.size === 2) { c.x += TILE / 2; c.z += TILE / 2; }
    return c;
  }
  generate(b) {
    this.disposeBuilding(b);
    const c = this.center(b);
    const res = GENERATORS[b.type](b.level, b.seed, c.x, c.z);
    b.parts = res.parts;
    b.height = res.height;
    b.rects = res.rects || (res.rect ? [res.rect] : []);
    b.anim = res.anim;
    for (const a of res.anim) {
      a.baseY = a.obj.position.y;
      a.phase = Math.random() * 6;
      this.animRoot.add(a.obj);
      this.anims.push(a);
    }
    this.markChunk(b.i, b.j);
  }
  disposeBuilding(b) {
    if (b.parts) for (const g of b.parts.values()) g.dispose();
    b.parts = null;
    if (b.anim) {
      for (const a of b.anim) this.animRoot.remove(a.obj);
      this.anims = this.anims.filter((a) => !b.anim.includes(a));
    }
    b.anim = null;
    if (b.warn) { this.warnRoot.remove(b.warn); b.warn = null; }
  }
  remove(i, j, { free = false } = {}) {
    const b = this.buildingAt(i, j);
    if (!b) return false;
    for (const [a, c] of this.footprint(b.type, b.i, b.j)) this.owner[this.idx(a, c)] = -1;
    this.disposeBuilding(b);
    this.buildings.delete(b.id);
    this.markChunk(b.i, b.j);
    if (!free && !this.sandbox) this.credits += Math.floor(TOOLS[b.type].cost * (0.5 + 0.3 * (b.level - 1)));
    return true;
  }
  growCost(b) { return Math.floor(TOOLS[b.type].cost * 0.6 * b.level); }
  grow(i, j, { free = false } = {}) {
    const b = this.buildingAt(i, j);
    if (!b) return false;
    if (b.level >= MAX_LEVEL) return 'max';
    if (!free && !this.spend(this.growCost(b))) return 'money';
    b.level++;
    b.seed = (b.seed * 1664525 + 1013904223) >>> 0; // new silhouette as it grows
    this.generate(b);
    return true;
  }
  connected(b) {
    const s = b.size;
    for (let a = -1; a <= s; a++) {
      for (let c = -1; c <= s; c++) {
        const edge = a === -1 || c === -1 || a === s || c === s;
        const corner = (a === -1 || a === s) && (c === -1 || c === s);
        if (edge && !corner && this.isRoad(b.i + a, b.j + c)) return true;
      }
    }
    return false;
  }

  markChunk(i, j) {
    this.chunkDirty.add(Math.floor(j / CHUNK) * NCH + Math.floor(i / CHUNK));
    this.changed = true;
  }
  rebuildChunk(ci) {
    for (const m of this.chunkMeshes[ci]) { this.root.remove(m); m.geometry.dispose(); }
    const cx = ci % NCH, cz = Math.floor(ci / NCH);
    const maps = [];
    for (const b of this.buildings.values()) {
      if (Math.floor(b.i / CHUNK) === cx && Math.floor(b.j / CHUNK) === cz && b.parts) maps.push(b.parts);
    }
    const meshes = meshesFromPartMaps(maps, MAT);
    meshes.forEach((m) => this.root.add(m));
    this.chunkMeshes[ci] = meshes;
  }

  // ------------------------------------------------------------ road mesh
  rebuildRoads() {
    for (const m of this.roadMeshes) { this.root.remove(m); m.geometry.dispose(); }
    const P = new Parts();
    const PI = Math.PI;
    for (let j = 0; j < GRID; j++) {
      for (let i = 0; i < GRID; i++) {
        if (!this.isRoad(i, j)) continue;
        const { x, z } = tileCenter(i, j);
        const plane = new THREE.PlaneGeometry(TILE, TILE);
        plane.rotateX(-PI / 2);
        const uv = plane.attributes.uv;
        for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * 0.5 + (i % 2) * 0.5, uv.getY(k) * 0.5 + (j % 2) * 0.5);
        P.geo('asphalt', plane, x, 0.02, z);
        const n = DIRS.map(([dx, dz]) => this.isRoad(i + dx, j + dz));
        const count = n.filter(Boolean).length;
        const straight = count === 2 && ((n[0] && n[2]) || (n[1] && n[3]));
        let lampSide = -1;
        DIRS.forEach(([dx, dz], d) => {
          const alongX = dz !== 0; // the side runs along x when the neighbour is N/S
          const ex = x + dx * (TILE / 2), ez = z + dz * (TILE / 2);
          if (!n[d]) {
            // sidewalk + glowing kerb on this edge
            const sx = x + dx * (TILE / 2 - 0.8), sz = z + dz * (TILE / 2 - 0.8);
            P.box('concrete', alongX ? TILE : 1.6, 0.22, alongX ? 1.6 : TILE, sx, 0.11, sz, 0, false);
            const kx = x + dx * (TILE / 2 - 1.62), kz = z + dz * (TILE / 2 - 1.62);
            P.box('dim_cyan', alongX ? TILE : 0.08, 0.05, alongX ? 0.08 : TILE, kx, 0.2, kz, 0, false);
            if (lampSide < 0) lampSide = d;
          } else if (count >= 3) {
            // crosswalk stripes at intersections
            for (let s = -2; s <= 2; s++) {
              const off = s * 1.6;
              const cx2 = ex - dx * 1.4 + (alongX ? 0 : 0), cz2 = ez - dz * 1.4;
              P.box('paint', alongX ? 0.8 : 1.6, 0.02, alongX ? 1.6 : 0.8, cx2 + (alongX ? off : 0), 0.04, cz2 + (alongX ? 0 : off), 0, false);
            }
          } else {
            // dashed centre line heading out of the tile
            for (const f of [0.18, 0.62]) {
              const px = x + dx * TILE * f * 0.5 + dx * 0.9, pz = z + dz * TILE * f * 0.5 + dz * 0.9;
              P.box('lane', alongX ? 0.2 : 1.8, 0.02, alongX ? 1.8 : 0.2, px, 0.04, pz, 0, false);
            }
          }
        });
        if (straight) {
          // edge lane lines on straight roads
          const alongZ = n[1];
          for (const s of [-1, 1]) {
            P.box('paint', alongZ ? 0.1 : TILE, 0.02, alongZ ? TILE : 0.1, x + (alongZ ? s * 4.2 : 0), 0.035, z + (alongZ ? 0 : s * 4.2), 0, false);
          }
        }
        if (lampSide >= 0 && ((i * 7 + j * 13) % 3 === 0)) {
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
    }
    const meshes = meshesFromPartMaps([P.merge()], MAT);
    meshes.forEach((m) => this.root.add(m));
    this.roadMeshes = meshes;
  }

  // ------------------------------------------------------------ per frame
  update(dt, t, buildMode) {
    if (this.roadsDirty) {
      this.rebuildRoads();
      this.roadsDirty = false;
      this.emit('roads');
      this.refreshWarnings();
    }
    if (this.chunkDirty.size) {
      for (const ci of this.chunkDirty) this.rebuildChunk(ci);
      this.chunkDirty.clear();
      this.emit('buildings');
      this.refreshWarnings();
    }
    for (const a of this.anims) {
      a.obj.rotation.y += a.spin * dt;
      a.obj.position.y = a.baseY + Math.sin(t * 1.3 + a.phase) * a.bob;
    }
    this.warnRoot.visible = buildMode;
  }

  refreshWarnings() {
    for (const b of this.buildings.values()) {
      const needs = b.type !== 'plaza' && b.type !== 'billboard';
      const bad = needs && !this.connected(b);
      if (bad && !b.warn) {
        const s = new THREE.Sprite(MAT.warnLabel);
        const c = this.center(b);
        s.position.set(c.x, Math.min(b.height + 6, 60), c.z);
        s.scale.set(16, 4, 1);
        s.renderOrder = 10;
        this.warnRoot.add(s);
        b.warn = s;
      } else if (!bad && b.warn) {
        this.warnRoot.remove(b.warn);
        b.warn = null;
      }
    }
  }

  // ------------------------------------------------------------ economy
  stats() {
    let pop = 0, jobs = 0;
    for (const b of this.buildings.values()) {
      if (!this.connected(b)) continue;
      const y = buildingYield(b.type, b.level);
      pop += y.pop; jobs += y.jobs;
    }
    const income = Math.round(pop * 0.002 + Math.min(pop, jobs) * 0.004 + jobs * 0.001);
    return { pop, jobs, income };
  }

  tickEconomy(autoGrowth) {
    const s = this.stats();
    this.credits += s.income;
    if (!autoGrowth) return null;
    // the sprawl grows by itself: connected buildings near plazas/neighbours gain height
    const cands = [];
    for (const b of this.buildings.values()) {
      if (b.level >= MAX_LEVEL || b.type === 'plaza' || !this.connected(b)) continue;
      let score = 0;
      for (let a = -2; a <= 2; a++) for (let c = -2; c <= 2; c++) {
        const o = this.buildingAt(b.i + a, b.j + c);
        if (o && o !== b) score += o.type === 'plaza' ? 3 : 1;
      }
      if (b.level < 2 + score / 4) cands.push(b);
    }
    if (cands.length && Math.random() < 0.35) {
      const b = cands[Math.floor(Math.random() * cands.length)];
      this.grow(b.i, b.j, { free: true });
      return b;
    }
    return null;
  }

  // ------------------------------------------------------------ collision
  // Axis-aligned rects [minX, minZ, maxX, maxZ] of buildings around a point.
  obstaclesNear(x, z) {
    const out = [];
    const seen = new Set();
    const ci = Math.floor((x + HALF) / TILE), cj = Math.floor((z + HALF) / TILE);
    for (let a = -2; a <= 2; a++) for (let c = -2; c <= 2; c++) {
      const b = this.buildingAt(ci + a, cj + c);
      if (b && !seen.has(b.id)) { seen.add(b.id); out.push(...b.rects); }
    }
    return out;
  }

  // ------------------------------------------------------------ lifecycle
  clear() {
    for (const b of [...this.buildings.values()]) this.disposeBuilding(b);
    this.buildings.clear();
    this.owner.fill(-1);
    this.road.fill(0);
    for (let k = 0; k < NCH * NCH; k++) this.chunkDirty.add(k);
    this.roadsDirty = true;
  }

  generateCity(seed = randSeed()) {
    this.clear();
    const r = mulberry32(seed);
    const lo = 6, hi = GRID - 7;
    const lines = (start) => {
      const out = [];
      let p = start;
      while (p <= hi) { out.push(p); p += r.int(4, 6); }
      return out;
    };
    const xs = lines(lo + r.int(0, 2));
    const zs = lines(lo + r.int(0, 2));
    for (const i of xs) for (let j = lo; j <= hi; j++) this.setRoad(i, j, true, { free: true });
    for (const j of zs) for (let i = lo; i <= hi; i++) this.setRoad(i, j, true, { free: true });
    // a few stub alleys
    for (let k = 0; k < 10; k++) {
      const i = r.int(lo, hi), j = r.int(lo, hi);
      const d = DIRS[r.int(0, 3)];
      for (let s = 0; s < r.int(2, 4); s++) this.setRoad(i + d[0] * s, j + d[1] * s, true, { free: true });
    }
    const mid = GRID / 2;
    // arcologies first (need 2x2 space), near the centre
    for (let k = 0; k < 40; k++) {
      const i = r.int(lo, hi - 1), j = r.int(lo, hi - 1);
      const dist = Math.hypot(i - mid, j - mid);
      if (dist < 9 && r.chance(0.5) && this.canPlace('arcology', i, j)) {
        const b = { size: 2, i, j };
        if (this.connected(b)) this.place('arcology', i, j, { free: true, level: r.int(1, 4) });
      }
    }
    for (let j = lo; j <= hi; j++) {
      for (let i = lo; i <= hi; i++) {
        if (!this.canPlace('habitat', i, j)) continue;
        const dist = Math.hypot(i - mid, j - mid) / (GRID / 2);
        const conn = this.connected({ size: 1, i, j });
        if (!conn && r.chance(0.85)) continue;
        const roll = conn ? r() : 0;
        let type = 'habitat';
        if (roll < 0.06) type = 'plaza';
        else if (roll < 0.1) type = 'billboard';
        else if (roll < 0.1 + (1 - dist) * 0.4) type = 'corp';
        const lvl = Math.max(1, Math.min(MAX_LEVEL, Math.round((1 - dist) * 5 * r.range(0.5, 1.2) + r.range(0, 1))));
        this.place(type, i, j, { free: true, level: type === 'plaza' ? 1 : lvl });
      }
    }
  }

  serialize() {
    const roads = [];
    for (let k = 0; k < this.road.length; k++) if (this.road[k]) roads.push(k);
    return {
      v: 1, credits: Math.floor(this.credits), sandbox: this.sandbox, roads,
      buildings: [...this.buildings.values()].map((b) => [b.type, b.i, b.j, b.level, b.seed]),
    };
  }
  save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.serialize())); } catch (e) { /* storage unavailable */ }
  }
  load() {
    let data;
    try { data = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { data = null; }
    if (!data || data.v !== 1) return false;
    this.clear();
    for (const k of data.roads) this.road[k] = 1;
    for (const [type, i, j, level, seed] of data.buildings) {
      if (GENERATORS[type]) this.place(type, i, j, { level, seed, free: true });
    }
    this.credits = data.credits;
    this.sandbox = !!data.sandbox;
    return true;
  }
}
