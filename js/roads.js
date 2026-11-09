// Dirt roads linking some neighbouring towns. Other towns stay isolated.
import { WATER, H } from './constants.js';
import { TOWN_CELL } from './towns.js';

export const ROAD_HALF = 2.4;       // half-width of the packed-dirt surface
const BLEND = 5;                    // terrain smoothing either side of the road
const STEP = 7;                     // spacing of road points
const FORWARD = [[1, 0], [0, 1], [1, 1], [1, -1]];

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const hash = (...n) => {
  let h = 0x811c9dc5;
  for (const v of n) { h = Math.imul(h ^ (v | 0), 16777619); h ^= h >>> 13; }
  return (h >>> 0) / 4294967296;
};

export class RoadMap {
  constructor(world) {
    this.world = world;
    this.pairCache = new Map();
    this.cellCache = new Map();
  }

  isIsolated(t) { return hash(this.world.seed, t.cx, t.cz, 77) < 0.3; }

  // Road between the towns of two neighbouring cells, or null.
  between(ax, az, bx, bz) {
    const key = `${ax},${az}|${bx},${bz}`;
    if (!this.pairCache.has(key)) this.pairCache.set(key, this.build(ax, az, bx, bz));
    return this.pairCache.get(key);
  }

  build(ax, az, bx, bz) {
    const tm = this.world.towns;
    const a = tm.get(ax, az), b = tm.get(bx, bz);
    if (!a || !b || this.isIsolated(a) || this.isIsolated(b)) return null;
    if (hash(this.world.seed, ax, az, bx, bz) > 0.75) return null;
    const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz);
    if (L > 560) return null;

    const gate = (t, tx, tz) => {
      const opts = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      let best = opts[0], bd = -Infinity;
      for (const o of opts) { const d = o[0] * tx + o[1] * tz; if (d > bd) { bd = d; best = o; } }
      return { x: t.x + best[0] * (t.R - 3), z: t.z + best[1] * (t.R - 3), ax: best[0], az: best[1] };
    };
    const ga = gate(a, dx / L, dz / L), gb = gate(b, -dx / L, -dz / L);
    const span = Math.hypot(gb.x - ga.x, gb.z - ga.z);
    const P0 = [ga.x, ga.z], P1 = [ga.x + ga.ax * span * 0.35, ga.z + ga.az * span * 0.35];
    const P3 = [gb.x, gb.z], P2 = [gb.x + gb.ax * span * 0.35, gb.z + gb.az * span * 0.35];
    const amp = (hash(this.world.seed, bx, bz, ax, az) - 0.5) * 0.18 * span;
    const n = Math.max(8, Math.ceil(span / STEP));
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = 1 - t;
      let x = u * u * u * P0[0] + 3 * u * u * t * P1[0] + 3 * u * t * t * P2[0] + t * t * t * P3[0];
      let z = u * u * u * P0[1] + 3 * u * u * t * P1[1] + 3 * u * t * t * P2[1] + t * t * t * P3[1];
      const w = Math.sin(t * Math.PI) * (amp * Math.sin(t * Math.PI * 2) + amp * 0.3);
      x += (-dz / L) * w; z += (dx / L) * w;
      pts.push([x, z]);
    }
    // Height profile: follow the land, smoothed, never under water, flat at the towns.
    const raw = pts.map(([x, z]) => tm.adjustHeight(x, z, this.world.rawHeight(x, z)));
    if (Math.max(...raw) > 52) return null;                            // mountains in the way
    for (const [x, z] of pts) {
      const o = tm.at(x, z);
      if (o && o !== a && o !== b && Math.hypot(x - o.x, z - o.z) < o.R + 10) return null;
    }
    const hs = raw.map((_, i) => {
      let s = 0, c = 0;
      for (let k = -3; k <= 3; k++) { const v = raw[i + k]; if (v !== undefined) { s += v; c++; } }
      return Math.max(WATER + 1.2, s / c);
    });
    pts.forEach(([x, z], i) => {
      for (const t of [a, b]) {
        const d = Math.hypot(x - t.x, z - t.z);
        if (d < t.R + 18) hs[i] = t.y + (hs[i] - t.y) * smooth(t.R, t.R + 18, d);
      }
    });
    for (let i = 1; i < hs.length; i++) if (Math.abs(hs[i] - hs[i - 1]) > STEP * 0.6) return null;   // too steep
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const pad = ROAD_HALF + BLEND + 1;
    return { id: `${a.id}|${b.id}`, a, b, pts, hs: hs.map((h) => Math.min(H - 6, h)), cum, length: cum[cum.length - 1], box: [x0 - pad, x1 + pad, z0 - pad, z1 + pad] };
  }

  // Roads that could pass through a given town cell.
  forCell(cx, cz) {
    const key = cx * 100003 + cz;
    if (this.cellCache.has(key)) return this.cellCache.get(key);
    const list = new Set();
    for (let dx = -2; dx <= 1; dx++) for (let dz = -2; dz <= 2; dz++) {
      const ax = cx + dx, az = cz + dz;
      for (const [fx, fz] of FORWARD) {
        const r = this.between(ax, az, ax + fx, az + fz);
        if (!r) continue;
        const [x0, x1, z0, z1] = r.box;
        const c0x = cx * TOWN_CELL, c0z = cz * TOWN_CELL;
        if (x1 >= c0x && x0 <= c0x + TOWN_CELL && z1 >= c0z && z0 <= c0z + TOWN_CELL) list.add(r);
      }
    }
    const arr = [...list];
    this.cellCache.set(key, arr);
    return arr;
  }

  roadsNear(x, z) { return this.forCell(Math.floor(x / TOWN_CELL), Math.floor(z / TOWN_CELL)); }

  // Every road leaving a town.
  roadsOf(t) {
    const out = [];
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      if (!dx && !dz) continue;
      const bx = t.cx + dx, bz = t.cz + dz;
      const forward = FORWARD.some(([fx, fz]) => fx === dx && fz === dz);
      const r = forward ? this.between(t.cx, t.cz, bx, bz) : this.between(bx, bz, t.cx, t.cz);
      if (r) out.push(r);
    }
    return out;
  }

  // Closest point on any road: { road, dist, h, i, t }.
  nearest(x, z) {
    if (x === this.lastX && z === this.lastZ) return this.last;
    this.lastX = x; this.lastZ = z;
    this.last = this.findNearest(x, z);
    return this.last;
  }

  findNearest(x, z) {
    let best = null;
    for (const r of this.roadsNear(x, z)) {
      const [x0, x1, z0, z1] = r.box;
      if (x < x0 || x > x1 || z < z0 || z > z1) continue;
      const p = r.pts;
      for (let i = 0; i < p.length - 1; i++) {
        const ax = p[i][0], az = p[i][1], bx = p[i + 1][0], bz = p[i + 1][1];
        const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz;
        let t = l2 > 0 ? ((x - ax) * vx + (z - az) * vz) / l2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = ax + vx * t - x, qz = az + vz * t - z, d = qx * qx + qz * qz;
        if (!best || d < best.d2) best = { road: r, d2: d, i, t };
      }
    }
    if (!best) return null;
    best.dist = Math.sqrt(best.d2);
    best.h = best.road.hs[best.i] + (best.road.hs[best.i + 1] - best.road.hs[best.i]) * best.t;
    return best;
  }

  adjustHeight(x, z, h) {
    if (this.world.towns.near(x, z, -1)) return h;
    const q = this.nearest(x, z);
    if (!q || q.dist > ROAD_HALF + BLEND) return h;
    return h + (q.h - h) * (1 - smooth(ROAD_HALF, ROAD_HALF + BLEND, q.dist));
  }

  onRoad(x, z) {
    const q = this.nearest(x, z);
    return q ? q.dist : Infinity;
  }
}
