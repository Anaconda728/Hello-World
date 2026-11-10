// Elevated highways on two levels that cross over each other. Lines running along x sit
// at 14 m, lines along z at 24 m. Each line dips to street level now and then: those dips
// are the on/off ramps you can drive (or walk) up.
import * as THREE from 'three';
import { TILE } from './config.js';
import { hash3 } from './rng.js';

const AV = TILE * 12;              // highways follow main avenues (every 12 tiles)
const H = { x: 14, z: 24 };        // deck heights
const RAMP = { x: 66, z: 136 };    // half-length of a dip (flat 6 m + slope)
export const DECK_HALF = 5.75;     // deck half-width (fits inside the avenue tile)
const mod = (a, n) => ((a % n) + n) % n;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class Highways {
  constructor(city) { this.city = city; }
  get seed() { return this.city.seed; }

  // Line along x at avenue row k (tile j = 12k); line along z at avenue column k (tile i = 12k).
  lineX(k) { return hash3(k, 77, this.seed) < 0.3; }
  lineZ(k) { return hash3(91, k, this.seed) < 0.3; }
  dipX(k, m) { return hash3(k * 3 + 1, m, this.seed + 5) < 0.3; }
  // z-ramps are long, so only where no x-highway crosses inside the ramp
  dipZ(k, m) { return hash3(m, k * 5 + 2, this.seed + 9) < 0.35 && !this.lineX(m) && !this.lineX(m + 1); }

  deck(axis, k, s) {
    const top = H[axis], L = RAMP[axis];
    let h = top;
    const m0 = Math.floor(s / AV);
    for (let m = m0 - 1; m <= m0 + 1; m++) {
      if (!(axis === 'x' ? this.dipX(k, m) : this.dipZ(k, m))) continue;
      const d = Math.abs(s - (m + 0.5) * AV);
      if (d < L) h = Math.min(h, top * smooth(6, L, d));
    }
    return h;
  }
  centre(k) { return k * AV + TILE / 2; }

  // Deck surfaces covering a world point: [{ axis, k, h, c }]
  surfacesAt(x, z) {
    const out = [];
    const kz = Math.round((z - TILE / 2) / AV);
    if (Math.abs(z - this.centre(kz)) < DECK_HALF && this.lineX(kz)) out.push({ axis: 'x', k: kz, h: this.deck('x', kz, x), c: this.centre(kz) });
    const kx = Math.round((x - TILE / 2) / AV);
    if (Math.abs(x - this.centre(kx)) < DECK_HALF && this.lineZ(kx)) out.push({ axis: 'z', k: kx, h: this.deck('z', kx, z), c: this.centre(kx) });
    return out;
  }

  // Height of whatever you're standing on: the highest deck at or just below y (ramps climb smoothly).
  groundAt(x, z, y) {
    let best = 0, surf = null;
    for (const s of this.surfacesAt(x, z)) {
      if (s.h > 0.2 && s.h <= y + 1.3 && s.h > best) { best = s.h; surf = s; }
    }
    return { h: best, surf };
  }

  // Keep a body on the deck between the barriers. Returns true if it bumped a barrier.
  constrain(pos, r, surf) {
    if (!surf || surf.h < 1) return false;
    const lim = DECK_HALF - 0.45 - r;
    const key = surf.axis === 'x' ? 'z' : 'x';
    const off = pos[key] - surf.c;
    if (Math.abs(off) > lim) { pos[key] = surf.c + Math.sign(off) * lim; return key; }
    return false;
  }

  onTile(i, j) {
    return (mod(j, 12) === 0 && this.lineX(j / 12)) || (mod(i, 12) === 0 && this.lineZ(i / 12));
  }

  // Pylons near a ground-level point (they stand in the middle of the avenue under the deck).
  pylonRects(x, z) {
    const out = [];
    const kz = Math.round((z - TILE / 2) / AV), kx = Math.round((x - TILE / 2) / AV);
    if (this.lineX(kz) && Math.abs(z - this.centre(kz)) < 8) {
      for (let i = Math.floor(x / TILE) - 2; i <= Math.floor(x / TILE) + 2; i++) {
        if (mod(i, 2) || this.deck('x', kz, i * TILE) < 4) continue;
        const px = i * TILE, pz = this.centre(kz);
        out.push([px - 0.9, pz - 0.9, px + 0.9, pz + 0.9]);
      }
    }
    if (this.lineZ(kx) && Math.abs(x - this.centre(kx)) < 8) {
      for (let j = Math.floor(z / TILE) - 2; j <= Math.floor(z / TILE) + 2; j++) {
        if (mod(j, 2) || this.deck('z', kx, j * TILE) < 4) continue;
        const pz = j * TILE, px = this.centre(kx);
        out.push([px - 0.9, pz - 0.9, px + 0.9, pz + 0.9]);
      }
    }
    return out;
  }

  // Geometry for the highway sections over one road tile.
  addTileParts(P, i, j) {
    if (mod(j, 12) === 0 && this.lineX(j / 12)) this.section(P, 'x', j / 12, i * TILE, i);
    if (mod(i, 12) === 0 && this.lineZ(i / 12)) this.section(P, 'z', i / 12, j * TILE, j);
  }
  section(P, axis, k, s0, idx) {
    const c = this.centre(k);
    const at = (s, off, y) => (axis === 'x' ? [s, y, c + off] : [c + off, y, s]);
    const SEG = 2, step = TILE / SEG;
    for (let q = 0; q < SEG; q++) {
      const a = s0 + q * step, b = a + step;
      const h0 = this.deck(axis, k, a), h1 = this.deck(axis, k, b);
      if (h0 < 0.15 && h1 < 0.15) continue; // at street level the avenue itself is the road
      const len = Math.hypot(step, h1 - h0), ang = Math.atan2(h1 - h0, step), sm = (a + b) / 2, hm = (h0 + h1) / 2;
      const piece = (key, w, hgt, off, y) => {
        const g = new THREE.BoxGeometry(len, hgt, w);
        g.rotateZ(ang);
        if (axis === 'z') g.rotateY(-Math.PI / 2);
        const [x, yy, z] = at(sm, off, hm + y);
        P.geo(key, g, x, yy, z);
      };
      piece('asphalt', DECK_HALF * 2, 0.12, 0, -0.06);
      piece('concrete', DECK_HALF * 2, 1.1, 0, -0.68);
      for (const sg of [-1, 1]) {
        piece('concrete', 0.4, 1, sg * (DECK_HALF - 0.2), 0.5);
        piece('neon_' + (axis === 'x' ? 'cyan' : 'magenta'), 0.08, 0.06, sg * (DECK_HALF - 0.2), 1.03);
        piece('dim_' + (axis === 'x' ? 'cyan' : 'magenta'), 0.1, 0.06, sg * DECK_HALF, -1.25);
      }
      piece('concrete', 0.3, 0.6, 0, 0.3); // centre divider
      if (q === 0) for (const sg of [-1, 1]) piece('paint', 0.12, 0.02, sg * 2.8, 0.01);
    }
    // pylon + crossbeam every other tile
    const h0 = this.deck(axis, k, s0);
    if (mod(idx, 2) === 0 && h0 >= 4) {
      const [x, , z] = at(s0, 0, 0);
      P.cyl('concrete', 0.75, 0.9, h0 - 1.2, x, 0, z, 10, false);
      const beam = new THREE.BoxGeometry(axis === 'x' ? 1.4 : DECK_HALF * 2, 1, axis === 'x' ? DECK_HALF * 2 : 1.4);
      P.geo('concrete', beam, x, h0 - 1.7, z);
      P.box('dim_amber', axis === 'x' ? 1.42 : 0.1, 0.1, axis === 'x' ? 0.1 : 1.42, x, h0 - 2.25, z, 0, false);
    }
    // deck lamps
    if (mod(idx, 3) === 0 && h0 >= 2) {
      for (const sg of [-1, 1]) {
        const [x, y, z] = at(s0 + 3, sg * (DECK_HALF - 0.2), h0 + 1);
        P.cyl('metal', 0.06, 0.08, 4.5, x, y, z, 5, false);
        P.box('lamp', 0.5, 0.12, 0.5, x, y + 4.5, z, 0, false);
      }
    }
  }

  // Lines near a point, for highway traffic.
  linesNear(x, z, R) {
    const out = [];
    const kz0 = Math.round(z / AV), kx0 = Math.round(x / AV), n = Math.ceil(R / AV);
    for (let d = -n; d <= n; d++) {
      if (this.lineX(kz0 + d)) out.push({ axis: 'x', k: kz0 + d });
      if (this.lineZ(kx0 + d)) out.push({ axis: 'z', k: kx0 + d });
    }
    return out;
  }
}
