// Procedural towns: site selection, street layout, building meshes and colliders.
import * as THREE from 'three';
import { WATER } from './constants.js';
import { makeRng } from './noise.js';

export const TOWN_CELL = 320;          // at most one town per cell
const BLEND = 18;                      // terrain blend distance around the plateau
const SW = 4;                          // street width

const PREFIX = ['Ash', 'Bram', 'Cold', 'Dun', 'Elm', 'Fair', 'Glen', 'Hart', 'Iron', 'Kings', 'Lark', 'Mill', 'North',
  'Oak', 'Pine', 'Red', 'Stone', 'Thorn', 'Wil', 'Yarrow', 'Marsh', 'Brook', 'High', 'Low', 'Fern', 'Gold', 'Wolds'];
const SUFFIX = ['ford', 'wick', 'ton', 'by', 'dale', 'field', 'stead', 'mere', 'holt', 'bury', 'haven', 'well', 'combe', 'gate'];

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------- site selection & layout (pure data, used by terrain generation) ----------

export class TownMap {
  constructor(world) {
    this.world = world;
    this.cache = new Map();
  }

  cellOf(x, z) { return [Math.floor(x / TOWN_CELL), Math.floor(z / TOWN_CELL)]; }

  get(cx, cz) {
    const key = cx * 100003 + cz;
    if (!this.cache.has(key)) this.cache.set(key, this.generate(cx, cz));
    return this.cache.get(key);
  }

  at(x, z) { const [cx, cz] = this.cellOf(x, z); return this.get(cx, cz); }

  // Blend raw terrain height toward a town's plateau.
  adjustHeight(x, z, h) {
    const t = this.at(x, z);
    if (!t) return h;
    const d = Math.hypot(x - t.x, z - t.z);
    if (d > t.R + BLEND) return h;
    const f = 1 - smooth(t.R, t.R + BLEND, d);
    return h + (t.y - h) * f;
  }

  // 0 = outside, 1 = town grass, 2 = street/plaza.
  surfaceAt(x, z) {
    const t = this.at(x, z);
    if (!t) return 0;
    const lx = x - t.x, lz = z - t.z;
    if (Math.hypot(lx, lz) > t.R + 2) return 0;
    if (lx * lx + lz * lz < t.plazaR * t.plazaR) return 2;
    for (const s of t.streets) {
      const along = s.axis === 'x' ? lx : lz, across = s.axis === 'x' ? lz : lx;
      if (Math.abs(across - s.c) < SW / 2 && along > s.a - 0.5 && along < s.b + 0.5) return 2;
    }
    return 1;
  }

  near(x, z, pad) {
    const t = this.at(x, z);
    return t && Math.hypot(x - t.x, z - t.z) < t.R + pad ? t : null;
  }

  generate(cx, cz) {
    const w = this.world;
    const seed = (Math.imul(cx, 668265263) ^ Math.imul(cz, 374761393) ^ w.seed ^ 0x51ed27) >>> 0;
    const rng = makeRng(seed);
    if (rng() > 0.62) return null;
    const x = (cx + 0.5) * TOWN_CELL + (rng() - 0.5) * 160;
    const z = (cz + 0.5) * TOWN_CELL + (rng() - 0.5) * 160;
    const R = 32 + Math.floor(rng() * 16);
    let sum = 0, min = 1e9, max = -1e9;
    for (let i = 0; i < 9; i++) {
      const a = (i / 8) * Math.PI * 2, r = i === 8 ? 0 : R;
      const h = w.rawHeight(x + Math.cos(a) * r, z + Math.sin(a) * r);
      sum += h; min = Math.min(min, h); max = Math.max(max, h);
    }
    const avg = sum / 9;
    if (avg < WATER + 3 || avg > 38 || max - min > 15) return null;
    const name = PREFIX[Math.floor(rng() * PREFIX.length)] + SUFFIX[Math.floor(rng() * SUFFIX.length)];
    const t = { id: `${cx},${cz}`, cx, cz, x, z, y: Math.round(avg) + 0.3, R, name, seed, plazaR: 7 };
    return layout(t, rng) ? t : null;
  }
}

function layout(t, rng) {
  const R = t.R;
  const streets = [
    { axis: 'x', c: 0, a: -R + 3, b: R - 3 },
    { axis: 'z', c: 0, a: -R + 3, b: R - 3 },
  ];
  if (R >= 38) for (const c of [-15, 15]) streets.push({ axis: 'x', c, a: -Math.round(R * 0.62), b: Math.round(R * 0.62) });
  t.streets = streets;

  const rect = (s) => (s.axis === 'x'
    ? [s.a - 1, s.b + 1, s.c - SW / 2 - 0.6, s.c + SW / 2 + 0.6]
    : [s.c - SW / 2 - 0.6, s.c + SW / 2 + 0.6, s.a - 1, s.b + 1]);
  const rects = streets.map(rect);
  const overlaps = (a, b) => a[0] < b[1] && a[1] > b[0] && a[2] < b[3] && a[3] > b[2];

  const bld = [];
  streets.forEach((s, si) => {
    for (const side of [-1, 1]) {
      for (let pos = s.a + 4; pos < s.b - 3; pos += 8.5 + rng() * 2) {
        const bw = 5.5 + rng() * 2.5, bd = 5.5 + rng() * 2, hw = 2.8 + rng() * 0.8;
        const r1 = rng(), r2 = rng(), r3 = rng();
        const off = s.c + side * (SW / 2 + 1.3 + bd / 2);
        const cx = s.axis === 'x' ? pos : off, cz = s.axis === 'x' ? off : pos;
        const ex = s.axis === 'x' ? bw / 2 : bd / 2, ez = s.axis === 'x' ? bd / 2 : bw / 2;
        const r = [cx - ex, cx + ex, cz - ez, cz + ez];
        const padded = [r[0] - 1.2, r[1] + 1.2, r[2] - 1.2, r[3] + 1.2];
        const dc = Math.hypot(cx, cz);
        if (dc + Math.max(ex, ez) > R - 1.5) continue;
        if (dc < t.plazaR + Math.max(ex, ez) + 2) continue;
        if (rects.some((q) => overlaps(q, r))) continue;
        if (bld.some((b) => overlaps(b.rect, padded))) continue;
        const rot = s.axis === 'x' ? (side > 0 ? Math.PI : 0) : (side > 0 ? -Math.PI / 2 : Math.PI / 2);
        const fx = Math.sin(rot), fz = Math.cos(rot);
        const door = [cx + fx * (bd / 2 + 0.15), cz + fz * (bd / 2 + 0.15)];
        const proj = s.axis === 'x' ? [door[0], s.c] : [s.c, door[1]];
        bld.push({ x: cx, z: cz, W: bw, D: bd, hw, rot, rect: r, ex, ez, door, proj, street: si, type: 'house', r1, r2, r3 });
      }
    }
  });
  if (bld.length < 5) return false;
  bld.sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
  bld[0].type = 'tavern'; bld[0].hw = 4.8;
  bld[1].type = 'smithy';
  bld[bld.length - 1].type = 'guardhouse'; bld[bld.length - 1].hw = 6.5;
  t.buildings = bld;
  t.tavern = bld[0]; t.smithy = bld[1]; t.guardhouse = bld[bld.length - 1];

  // Market stalls on the plaza diagonals, a well on the last one.
  const nSt = 2 + (rng() < 0.5 ? 1 : 0);
  t.stalls = [];
  for (let i = 0; i < nSt; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2, r = t.plazaR - 1.8;
    t.stalls.push({ a, x: Math.cos(a) * r, z: Math.sin(a) * r, rot: Math.atan2(-Math.cos(a), -Math.sin(a)), hue: rng() });
  }
  t.well = { x: Math.cos(-Math.PI / 4) * 4.4, z: Math.sin(-Math.PI / 4) * 4.4 };

  // Lamps along the main street.
  t.lamps = [];
  for (let x = -R + 6; x < R - 6; x += 10) {
    if (Math.abs(x) < t.plazaR + 2) continue;
    t.lamps.push({ x, z: (x / 10) % 2 ? SW / 2 + 0.5 : -SW / 2 - 0.5 });
  }

  // Road graph.
  const nodes = [], keyMap = new Map();
  const node = (x, z) => {
    const k = Math.round(x * 2) + ',' + Math.round(z * 2);
    if (keyMap.has(k)) return keyMap.get(k);
    nodes.push({ x, z, links: new Set() });
    keyMap.set(k, nodes.length - 1);
    return nodes.length - 1;
  };
  const link = (a, b) => { if (a !== b) { nodes[a].links.add(b); nodes[b].links.add(a); } };
  streets.forEach((s, si) => {
    const pts = [s.a, s.b];
    for (const o of streets) if (o.axis !== s.axis && o.c >= s.a && o.c <= s.b && s.c >= o.a && s.c <= o.b) pts.push(o.c);
    for (const b of bld) if (b.street === si) pts.push(s.axis === 'x' ? b.proj[0] : b.proj[1]);
    pts.sort((a, b) => a - b);
    let prev = null;
    for (const p of pts) {
      const id = s.axis === 'x' ? node(p, s.c) : node(s.c, p);
      if (prev !== null) link(prev, id);
      prev = id;
    }
  });
  for (const b of bld) {
    b.projNode = node(b.proj[0], b.proj[1]);
    b.doorNode = node(b.door[0], b.door[1]);
    link(b.doorNode, b.projNode);
  }
  t.centerNode = node(0, 0);
  for (const st of t.stalls) {
    const rr = t.plazaR - 0.8;
    st.spot = [Math.cos(st.a) * rr, Math.sin(st.a) * rr];
    st.face = st.rot;
    const side = node(Math.cos(st.a + 0.5) * rr, Math.sin(st.a + 0.5) * rr);
    st.node = node(st.spot[0], st.spot[1]);
    link(t.centerNode, side);
    link(side, st.node);
  }
  t.leisure = [];
  for (let i = 0; i < 4; i++) {
    for (const off of [-0.25, 0.25]) {
      const a = (i * Math.PI) / 2 + off, r = 2.6 + (i % 2) * 1.2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      t.leisure.push({ pos: [x, z], face: Math.atan2(-x, -z) });
    }
  }
  t.patrol = nodes.map((n, i) => i).filter((i) => nodes[i].links.size === 1 && !bld.some((b) => b.doorNode === i) && !t.stalls.some((s) => s.node === i));
  t.patrol.push(t.centerNode);
  t.nodes = nodes;

  // Shift everything into world space.
  const X = t.x, Z = t.z;
  for (const n of nodes) { n.x += X; n.z += Z; }
  for (const b of bld) {
    b.x += X; b.z += Z;
    b.rect = [b.rect[0] + X, b.rect[1] + X, b.rect[2] + Z, b.rect[3] + Z];
    b.door = [b.door[0] + X, b.door[1] + Z];
    b.proj = [b.proj[0] + X, b.proj[1] + Z];
  }
  for (const s of t.stalls) { s.x += X; s.z += Z; s.spot = [s.spot[0] + X, s.spot[1] + Z]; }
  for (const l of t.leisure) l.pos = [l.pos[0] + X, l.pos[1] + Z];
  for (const l of t.lamps) { l.x += X; l.z += Z; }
  t.well.x += X; t.well.z += Z;
  return true;
}

// ---------- graph helpers ----------

export function nearestNode(t, x, z) {
  let best = 0, bd = Infinity;
  t.nodes.forEach((n, i) => { const d = (n.x - x) ** 2 + (n.z - z) ** 2; if (d < bd) { bd = d; best = i; } });
  return best;
}

export function findPath(t, a, b) {
  if (a === b) return [a];
  const prev = new Map([[a, -1]]), q = [a];
  while (q.length) {
    const cur = q.shift();
    if (cur === b) break;
    for (const nb of t.nodes[cur].links) if (!prev.has(nb)) { prev.set(nb, cur); q.push(nb); }
  }
  if (!prev.has(b)) return [b];
  const path = [];
  for (let c = b; c !== -1; c = prev.get(c)) path.push(c);
  return path.reverse();
}

// Push a vertical cylinder (feet at pos.y) out of box colliders. Returns true if moved.
export function pushOut(pos, r, height, colliders) {
  let moved = false;
  for (const c of colliders) {
    if (pos.y >= c.top - 0.05 || pos.y + height <= c.bottom) continue;
    const cx = Math.max(c.x0, Math.min(c.x1, pos.x)), cz = Math.max(c.z0, Math.min(c.z1, pos.z));
    const dx = pos.x - cx, dz = pos.z - cz, d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2);
      pos.x += (dx / d) * (r - d); pos.z += (dz / d) * (r - d);
    } else {
      const opts = [[c.x0 - r - pos.x, 0], [c.x1 + r - pos.x, 0], [0, c.z0 - r - pos.z], [0, c.z1 + r - pos.z]];
      opts.sort((a, b) => Math.abs(a[0] + a[1]) - Math.abs(b[0] + b[1]));
      pos.x += opts[0][0]; pos.z += opts[0][1];
    }
    moved = true;
  }
  return moved;
}

// Line of sight: blocked by terrain or buildings?
const _p = new THREE.Vector3();
export function clearLine(world, colliders, a, b) {
  const d = a.distanceTo(b), steps = Math.ceil(d / 0.8);
  for (let i = 1; i < steps; i++) {
    _p.lerpVectors(a, b, i / steps);
    if (world.sample(_p.x, _p.y, _p.z) > 0.2) return false;
    for (const c of colliders) {
      if (_p.x > c.x0 && _p.x < c.x1 && _p.z > c.z0 && _p.z < c.z1 && _p.y > c.bottom && _p.y < c.top) return false;
    }
  }
  return true;
}

// ---------- meshes ----------

const BOXN = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
const CYLN = new THREE.CylinderGeometry(0.5, 0.5, 1, 10).toNonIndexed();
const PRISM = (() => {
  const v = [
    -0.5, 0, 0.5, 0.5, 0, 0.5, 0.5, 1, 0, -0.5, 0, 0.5, 0.5, 1, 0, -0.5, 1, 0,
    0.5, 0, -0.5, -0.5, 0, -0.5, -0.5, 1, 0, 0.5, 0, -0.5, -0.5, 1, 0, 0.5, 1, 0,
    -0.5, 0, -0.5, -0.5, 0, 0.5, -0.5, 1, 0,
    0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 1, 0,
    -0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
})();

export const townSolidMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
export const townGlowMat = new THREE.MeshBasicMaterial({ color: 0x2a3340 });

class GeoBuilder {
  constructor() { this.pos = []; this.nor = []; this.col = []; }
  add(geo, m, color) {
    const p = geo.attributes.position, n = geo.attributes.normal;
    const nm = new THREE.Matrix3().getNormalMatrix(m);
    const c = new THREE.Color(color), v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m);
      this.pos.push(v.x, v.y, v.z);
      v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize();
      this.nor.push(v.x, v.y, v.z);
      this.col.push(c.r, c.g, c.b);
    }
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    return g;
  }
}

const PLASTER = [0xe8dcc4, 0xd9c7a5, 0xc9b48f, 0xe4d2b0, 0xbfae92, 0xd8cdb8];
const ROOF = [0x8e3b2f, 0x6e4a33, 0x4f5560, 0x7a3a2a, 0x5d3b2a];
const TIMBER = 0x5a3f28, STONE = 0x8a8a8f, DARKSTONE = 0x6c6c72, DOOR = 0x4a3020;
const pick = (arr, r) => arr[Math.floor(r * arr.length) % arr.length];

export function buildTownMeshes(t) {
  const solid = new GeoBuilder(), glow = new GeoBuilder();
  const colliders = [];
  const Y = t.y;
  const base = new THREE.Matrix4(), local = new THREE.Matrix4(), m = new THREE.Matrix4();
  const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), P = new THREE.Vector3(), S = new THREE.Vector3();
  let target = solid;
  const part = (geo, x, y, z, sx, sy, sz, color, ry = 0) => {
    q.setFromAxisAngle(up, ry);
    local.compose(P.set(x, y, z), q, S.set(sx, sy, sz));
    m.multiplyMatrices(base, local);
    target.add(geo, m, color);
  };
  const setBase = (x, z, rot) => { q.setFromAxisAngle(up, rot); base.compose(P.set(x, Y, z), q, S.set(1, 1, 1)); };

  for (const b of t.buildings) {
    setBase(b.x, b.z, b.rot);
    const { W, D, hw } = b;
    const stone = b.type === 'smithy' || b.type === 'guardhouse';
    const wall = stone ? STONE : pick(PLASTER, b.r1);
    const roofC = pick(ROOF, b.r2);
    let top = hw;
    target = solid;
    part(BOXN, 0, -0.3, 0, W + 0.2, 0.9, D + 0.2, DARKSTONE);                        // foundation
    part(BOXN, 0, hw / 2, 0, W, hw, D, wall);                                          // walls
    part(BOXN, 0, 1.0, D / 2 + 0.05, 1.1, 2.0, 0.12, DOOR);                            // door
    if (!stone) {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) part(BOXN, sx * (W / 2 - 0.05), hw / 2, sz * (D / 2 - 0.05), 0.2, hw, 0.2, TIMBER);
      part(BOXN, 0, hw * 0.55, D / 2 + 0.03, W, 0.16, 0.08, TIMBER);
    }
    if (b.type === 'guardhouse') {
      for (let i = 0; i < 4; i++) for (const s of [-1, 1]) {
        const along = s * (W / 2 - 0.5);
        const pos = [[along, D / 2 - 0.3], [along, -D / 2 + 0.3], [W / 2 - 0.3, along], [-W / 2 + 0.3, along]][i];
        part(BOXN, pos[0], hw + 0.35, pos[1], 0.7, 0.7, 0.7, STONE);
      }
      part(BOXN, 0, hw + 0.05, 0, W, 0.1, D, DARKSTONE);
      part(BOXN, 0, hw + 1.6, 0, 0.08, 3.2, 0.08, TIMBER);
      part(BOXN, 0.5, hw + 2.8, 0, 1.0, 0.6, 0.04, [0x9a2a2a, 0x2a4a9a, 0x2a7a3a, 0x8a6a1a][t.seed % 4]);
      top = hw + 0.7;
    } else {
      const rh = Math.min(W, D) * 0.38;
      part(PRISM, 0, hw, 0, W + 0.7, rh, D + 0.8, roofC);
      part(BOXN, W * 0.25, hw + rh * 0.55, -D * 0.2, 0.6, rh + 1.0, 0.6, b.type === 'smithy' ? 0x3a3838 : STONE);
      top = hw + rh;
    }
    if (b.type === 'tavern') {
      part(BOXN, W / 2 + 0.5, 1.6, D / 2 + 0.4, 0.12, 3.2, 0.12, TIMBER);
      part(BOXN, W / 2 + 0.5, 2.9, D / 2 + 0.8, 0.1, 0.1, 0.9, TIMBER);
      part(BOXN, W / 2 + 0.5, 2.4, D / 2 + 1.0, 0.06, 0.7, 0.9, 0x8a5a2a);
      for (const s of [-1, 1]) part(CYLN, s * 1.4, 0.45, D / 2 + 0.6, 0.6, 0.9, 0.6, 0x6b4a2e);
    }
    if (b.type === 'smithy') {
      part(BOXN, 0, 0.4, D / 2 + 1.6, 0.5, 0.8, 0.3, 0x5a5a5e);
      part(BOXN, 0, 0.85, D / 2 + 1.6, 0.8, 0.18, 0.35, 0x3a3a3e);
    }
    // windows
    target = glow;
    const wy = b.type === 'tavern' ? [1.4, 3.4] : b.type === 'guardhouse' ? [2, 4.5] : [hw * 0.5];
    for (const y of wy) {
      for (const sx of [-1, 1]) part(BOXN, sx * W * 0.3, y, D / 2 + 0.05, 0.7, 0.7, 0.08, 0xffffff);
      for (const sx of [-1, 1]) part(BOXN, sx * (W / 2 + 0.05), y, 0, 0.08, 0.7, 0.7, 0xffffff);
    }
    if (b.type === 'smithy') part(BOXN, -W * 0.3, 0.6, D / 2 + 0.06, 0.8, 0.5, 0.06, 0xffffff);
    target = solid;
    colliders.push({ x0: b.rect[0], x1: b.rect[1], z0: b.rect[2], z1: b.rect[3], bottom: Y - 1, top: Y + top, building: b });
  }

  // Market stalls.
  for (const st of t.stalls) {
    setBase(st.x, st.z, st.rot);
    const cloth = new THREE.Color().setHSL(st.hue, 0.55, 0.5).getHex();
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) part(BOXN, sx * 1.15, 1.1, sz * 0.75, 0.1, 2.2, 0.1, TIMBER);
    part(BOXN, 0, 0.45, 0.6, 2.4, 0.9, 0.45, 0x7a5a3a);
    part(PRISM, 0, 2.2, 0, 2.8, 0.55, 2.0, cloth);
    for (let i = 0; i < 4; i++) part(BOXN, -0.8 + i * 0.55, 0.98, 0.6, 0.3, 0.16, 0.3, [0xc94a3a, 0xe0b040, 0x6aa84f, 0x9a6a3a][(i + Math.floor(st.hue * 4)) % 4]);
    const c = Math.cos(st.rot), s = Math.sin(st.rot);
    const fx = st.x + s * 0.6, fz = st.z + c * 0.6;
    colliders.push({ x0: fx - 1.0, x1: fx + 1.0, z0: fz - 1.0, z1: fz + 1.0, bottom: Y - 1, top: Y + 0.9 });
  }

  // Well.
  setBase(t.well.x, t.well.z, 0);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    part(BOXN, Math.cos(a) * 0.85, 0.4, Math.sin(a) * 0.85, 0.7, 0.8, 0.35, STONE, -a + Math.PI / 2);
  }
  part(CYLN, 0, 0.3, 0, 1.4, 0.05, 1.4, 0x1e3a50);
  for (const s of [-1, 1]) part(BOXN, s * 0.85, 1.3, 0, 0.12, 1.8, 0.12, TIMBER);
  part(PRISM, 0, 2.1, 0, 2.2, 0.6, 1.4, 0x6e4a33);
  colliders.push({ x0: t.well.x - 1.1, x1: t.well.x + 1.1, z0: t.well.z - 1.1, z1: t.well.z + 1.1, bottom: Y - 1, top: Y + 0.8 });

  // Street lamps.
  for (const l of t.lamps) {
    setBase(l.x, l.z, 0);
    target = solid;
    part(BOXN, 0, 1.5, 0, 0.12, 3.0, 0.12, 0x2e2e30);
    part(PRISM, 0, 3.25, 0, 0.45, 0.25, 0.45, 0x2e2e30);
    target = glow;
    part(BOXN, 0, 3.05, 0, 0.3, 0.38, 0.3, 0xffffff);
    target = solid;
  }

  const group = new THREE.Group();
  const sm = new THREE.Mesh(solid.build(), townSolidMat);
  const gm = new THREE.Mesh(glow.build(), townGlowMat);
  sm.userData.kind = gm.userData.kind = 'town';
  group.add(sm, gm);
  return { group, colliders };
}

// ---------- active town manager ----------

export class Towns {
  constructor(scene, world, npcs, savedRep) {
    this.scene = scene;
    this.world = world;
    this.npcs = npcs;
    this.rep = { ...(savedRep || {}) };
    this.active = new Map();
  }

  update(ppos, nightF, dt, hour) {
    this.hour = hour;
    const map = this.world.towns;
    const [pcx, pcz] = map.cellOf(ppos.x, ppos.z);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const t = map.get(pcx + dx, pcz + dz);
      if (t && !this.active.has(t.id) && Math.hypot(t.x - ppos.x, t.z - ppos.z) < 230) this.activate(t);
    }
    for (const t of this.active.values()) if (Math.hypot(t.x - ppos.x, t.z - ppos.z) > 320) this.deactivate(t);
    townGlowMat.color.setHex(0x2a3340).lerp(new THREE.Color(0xffc66b), nightF);
    // Bad reputations slowly fade (about 3 points per minute).
    for (const t of this.active.values()) if (t.rep < 0) t.rep = Math.min(0, t.rep + dt * 0.05);
  }

  activate(t) {
    const { group, colliders } = buildTownMeshes(t);
    t.group = group;
    t.colliders = colliders;
    t.rep = this.rep[t.id] ?? 0;
    this.scene.add(group);
    this.active.set(t.id, t);
    this.npcs.populate(t, this.hour ?? 12);
  }

  deactivate(t) {
    this.scene.remove(t.group);
    t.group.children.forEach((m) => m.geometry.dispose());
    t.group = null;
    this.rep[t.id] = t.rep;
    this.npcs.depopulate(t);
    this.active.delete(t.id);
  }

  colliders(x, z) {
    const out = [];
    for (const t of this.active.values()) if (Math.hypot(t.x - x, t.z - z) < t.R + 6) out.push(...t.colliders);
    return out;
  }

  meshes() {
    const out = [];
    for (const t of this.active.values()) out.push(...t.group.children);
    return out;
  }

  current(x, z) {
    for (const t of this.active.values()) if (Math.hypot(t.x - x, t.z - z) < t.R + 8) return t;
    return null;
  }

  nearest(x, z) {
    const map = this.world.towns;
    const [pcx, pcz] = map.cellOf(x, z);
    let best = null, bd = Infinity;
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      const t = map.get(pcx + dx, pcz + dz);
      if (!t) continue;
      const d = Math.hypot(t.x - x, t.z - z);
      if (d < bd) { bd = d; best = t; }
    }
    return best ? { town: best, dist: bd } : null;
  }

  serializeRep() {
    for (const t of this.active.values()) this.rep[t.id] = Math.round(t.rep);
    return this.rep;
  }
}
