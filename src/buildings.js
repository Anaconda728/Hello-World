// Procedural generators for every placeable structure. Each returns world-space
// geometry grouped by material key, plus any animated objects (holograms).
import * as THREE from 'three';
import { Parts } from './geom.js';
import { MAT, NEON_KEYS, SIGN_COUNT, AD_COUNT } from './materials.js';
import { mulberry32 } from './rng.js';
import { TILE } from './config.js';

const PI = Math.PI;
const torusGeo = new THREE.TorusGeometry(2.6, 0.09, 6, 48);
const torusSmall = new THREE.TorusGeometry(1.6, 0.06, 6, 32);
const octaGeo = new THREE.OctahedronGeometry(1.2, 0);
const logoGeo = new THREE.PlaneGeometry(3.6, 1.8);

function sidewalk(P, cx, cz, size = 1) {
  const s = TILE * size - 0.2;
  P.box('concrete', s, 0.2, s, cx, 0.1, cz, 0, false);
}

function ring(P, key, w, d, y, cx, cz, t = 0.16) {
  P.box(key, w + 0.24, t, t, cx, y, cz + d / 2 + 0.06, 0, false);
  P.box(key, w + 0.24, t, t, cx, y, cz - d / 2 - 0.06, 0, false);
  P.box(key, t, t, d + 0.24, cx + w / 2 + 0.06, y, cz, 0, false);
  P.box(key, t, t, d + 0.24, cx - w / 2 - 0.06, y, cz, 0, false);
}

function corners(P, key, w, d, y0, h, cx, cz, t = 0.14) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    P.box(key, t, h, t, cx + sx * (w / 2 + 0.03), y0 + h / 2, cz + sz * (d / 2 + 0.03), 0, false);
  }
}

function fins(P, w, d, y0, h, cx, cz, every) {
  for (let y = y0 + every; y < y0 + h - 2; y += every) {
    P.box('metal', w + 0.5, 0.22, d + 0.5, cx, y, cz, 0, false);
  }
}

function blink(P, x, y, z, s = 0.4) {
  P.box(Math.random() < 0.5 ? 'blinkA' : 'blinkB', s, s, s, x, y, z, 0, false);
}

function antenna(P, r, x, y, z) {
  const h = r.range(4, 13);
  P.cyl('metal', 0.06, 0.12, h, x, y, z, 5, false);
  blink(P, x, y + h + 0.2, z);
}

// Vertical blade sign sticking out of a facade.
function bladeSign(P, r, cx, cz, w, d, y0, h) {
  if (h < 12) return;
  const face = r.int(0, 3);
  const sh = r.range(4, Math.min(12, h * 0.45));
  const lo = y0 + 3.5 + sh / 2, hi = y0 + h - sh / 2 - 1;
  const yc = r.range(lo, Math.max(lo, hi));
  const sw = 1.7;
  const span = face % 2 === 0 ? d : w;
  const t = r.range(-1, 1) * Math.max(0, span / 2 - 1.2);
  const out = 0.2 + sw / 2;
  let x = cx, z = cz, ry = 0;
  if (face === 0) { x = cx + w / 2 + out; z = cz + t; }
  if (face === 2) { x = cx - w / 2 - out; z = cz + t; }
  if (face === 1) { z = cz + d / 2 + out; x = cx + t; ry = PI / 2; }
  if (face === 3) { z = cz - d / 2 - out; x = cx + t; ry = PI / 2; }
  P.plane('sign' + r.int(0, SIGN_COUNT - 1), sw, sh, x, yc, z, ry);
  const nk = 'neon_' + r.pick(NEON_KEYS);
  P.box(nk, sw + 0.1, 0.1, 0.1, x, yc + sh / 2 + 0.05, z, ry, false);
  P.box(nk, sw + 0.1, 0.1, 0.1, x, yc - sh / 2 - 0.05, z, ry, false);
}

// Flat ad panel on a facade.
function flatAd(P, r, cx, cz, w, d, y0, h) {
  const face = r.int(0, 3);
  const span = face % 2 === 0 ? d : w;
  const aw = Math.min(span - 1, 8), ah = aw / 2;
  if (h < ah + 6) return;
  const yc = r.range(y0 + 4 + ah / 2, y0 + h - ah / 2 - 1);
  const key = 'ad' + r.int(0, AD_COUNT - 1);
  const o = 0.08;
  if (face === 1) P.plane(key, aw, ah, cx, yc, cz + d / 2 + o, 0);
  if (face === 3) P.plane(key, aw, ah, cx, yc, cz - d / 2 - o, PI);
  if (face === 0) P.plane(key, aw, ah, cx + w / 2 + o, yc, cz, PI / 2);
  if (face === 2) P.plane(key, aw, ah, cx - w / 2 - o, yc, cz, -PI / 2);
}

function roof(P, r, cx, cz, w, d, y, opts = {}) {
  P.boxB('roof', w - 0.1, 0.25, d - 0.1, cx, y, cz);
  y += 0.25;
  const n = r.int(0, 3);
  for (let k = 0; k < n; k++) {
    const bw = r.range(1, 2.2), bd = r.range(1, 2.2);
    P.boxB('metal', bw, r.range(0.7, 1.6), bd, cx + r.range(-1, 1) * Math.max(0, w / 2 - bw), y, cz + r.range(-1, 1) * Math.max(0, d / 2 - bd));
  }
  if (w > 4 && r.chance(0.35)) {
    const tx = cx + r.range(-1, 1) * (w / 2 - 1.2), tz = cz + r.range(-1, 1) * (d / 2 - 1.2);
    P.cyl('metal', 0.9, 0.9, 1.8, tx, y + 1, tz, 10, false);
    P.boxB('metal', 0.15, 1, 0.15, tx, y, tz);
  }
  if (r.chance(opts.antenna ?? 0.65)) antenna(P, r, cx + r.range(-1, 1) * w * 0.3, y, cz + r.range(-1, 1) * d * 0.3);
  if (w > 6 && r.chance(opts.billboard ?? 0.25)) {
    const bw = w - 1, bh = bw / 2;
    const alongX = r.chance(0.5);
    const key = 'ad' + r.int(0, AD_COUNT - 1);
    const by = y + 1.5 + bh / 2;
    if (alongX) {
      P.plane(key, bw, bh, cx, by, cz + 0.08, 0);
      P.plane(key, bw, bh, cx, by, cz - 0.08, PI);
      P.box('metal', bw, bh, 0.12, cx, by, cz, 0, false);
    } else {
      P.plane(key, bw, bh, cx + 0.08, by, cz, PI / 2);
      P.plane(key, bw, bh, cx - 0.08, by, cz, -PI / 2);
      P.box('metal', 0.12, bh, bw, cx, by, cz, 0, false);
    }
    P.box('metal', 0.2, 1.5, 0.2, cx, y + 0.75, cz, 0, false);
    return y + 1.5 + bh;
  }
  return y;
}

function holoCrown(anim, x, y, z, magenta = false) {
  const g = new THREE.Group();
  const t1 = new THREE.Mesh(torusGeo, magenta ? MAT.holoM : MAT.holo);
  t1.rotation.x = PI / 2;
  const t2 = new THREE.Mesh(torusSmall, magenta ? MAT.holo : MAT.holoM);
  t2.position.y = 1.2;
  t2.rotation.x = PI / 2;
  const logo = new THREE.Mesh(logoGeo, MAT['ad' + Math.floor(Math.random() * AD_COUNT)]);
  logo.position.y = 2.6;
  g.add(t1, t2, logo);
  g.position.set(x, y, z);
  anim.push({ obj: g, spin: 0.6, bob: 0.3 });
}

// ---------------------------------------------------------------- habitat
export function genHabitat(level, seed, cx, cz) {
  const r = mulberry32(seed);
  const P = new Parts();
  const anim = [];
  sidewalk(P, cx, cz);
  const H = 16 + level * 15 + r.range(0, 14);
  const win = r.pick(['winA', 'winA', 'winB', 'winC', 'winD']);
  const neon = 'neon_' + r.pick(NEON_KEYS);
  const style = r();
  let top = H;

  if (style < 0.55) {
    let w = r.range(8.2, 9.8), d = r.range(8.2, 9.8), y = 0.2, rem = H, ox = 0, oz = 0;
    const tiers = Math.max(1, Math.min(r.int(1, 3), 1 + Math.floor(level / 2)));
    const base = { w, d };
    for (let t = 0; t < tiers; t++) {
      const th = t === tiers - 1 ? rem : rem * r.range(0.45, 0.7);
      P.boxB(win, w, th, d, cx + ox, y, cz + oz);
      if (t === 0) { base.h = th; }
      if (r.chance(0.45)) fins(P, w, d, y, th, cx + ox, cz + oz, 7);
      if (r.chance(0.75)) ring(P, neon, w, d, y + th, cx + ox, cz + oz);
      if (t === 0 && r.chance(0.25)) corners(P, neon, w, d, y, th, cx, cz);
      y += th; rem -= th;
      if (t === tiers - 1) {
        top = roof(P, r, cx + ox, cz + oz, w, d, y);
      } else {
        const nw = w * r.range(0.62, 0.85), nd = d * r.range(0.62, 0.85);
        ox += r.range(-1, 1) * (w - nw) / 2; oz += r.range(-1, 1) * (d - nd) / 2;
        roof(P, r, cx + ox, cz + oz, w, d, y, { antenna: 0, billboard: 0 });
        w = nw; d = nd;
      }
    }
    const ns = r.int(1, 3);
    for (let k = 0; k < ns; k++) bladeSign(P, r, cx, cz, base.w, base.d, 0.2, base.h);
    if (r.chance(0.4)) flatAd(P, r, cx, cz, base.w, base.d, 0.2, base.h);
  } else if (style < 0.78) {
    const ph = r.range(6, 10);
    P.boxB(win, 9.6, ph, 9.6, cx, 0.2, cz);
    ring(P, neon, 9.6, 9.6, ph + 0.2, cx, cz);
    const alongX = r.chance(0.5);
    const h1 = (H - ph) * r.range(0.85, 1), h2 = (H - ph) * r.range(0.55, 0.85);
    const tw = r.range(3.6, 4.2);
    const pos = [-2.5, 2.5];
    [h1, h2].forEach((h, k) => {
      const x = cx + (alongX ? pos[k] : 0), z = cz + (alongX ? 0 : pos[k]);
      P.boxB(win, tw, h, tw, x, ph + 0.2, z);
      if (r.chance(0.7)) ring(P, neon, tw, tw, ph + 0.2 + h, x, z);
      roof(P, r, x, z, tw, tw, ph + 0.2 + h, { billboard: 0 });
      bladeSign(P, r, x, z, tw, tw, ph + 0.2, h);
    });
    const by = ph + 0.2 + Math.min(h1, h2) * r.range(0.4, 0.8);
    const gap = 5 - tw;
    if (alongX) {
      P.box('metal', gap + 0.2, 1.6, 1.6, cx, by, cz, 0, false);
      P.box(neon, gap + 0.2, 0.1, 1.7, cx, by - 0.85, cz, 0, false);
    } else {
      P.box('metal', 1.6, 1.6, gap + 0.2, cx, by, cz, 0, false);
      P.box(neon, 1.7, 0.1, gap + 0.2, cx, by - 0.85, cz, 0, false);
    }
    top = ph + h1;
    bladeSign(P, r, cx, cz, 9.6, 9.6, 0.2, ph + 6);
  } else {
    let rad = r.range(4.2, 4.8), y = 0.2, rem = H;
    const secs = r.int(1, 3);
    for (let s = 0; s < secs; s++) {
      const h = s === secs - 1 ? rem : rem * r.range(0.5, 0.7);
      P.cyl(win, rad, rad, h, cx, y, cz, 20);
      P.cyl(neon, rad + 0.12, rad + 0.12, 0.18, cx, y + h - 0.1, cz, 24, false);
      y += h; rem -= h;
      P.cyl('roof', rad, rad, 0.2, cx, y, cz, 20, false);
      if (s < secs - 1) rad *= r.range(0.7, 0.88);
    }
    antenna(P, r, cx, y, cz);
    top = y;
    for (let k = 0; k < 2; k++) bladeSign(P, r, cx, cz, rad * 2 - 1, rad * 2 - 1, 0.2, Math.min(H, 30));
  }
  return { parts: P.merge(), anim, height: top, rect: [cx - 5, cz - 5, cx + 5, cz + 5] };
}

// ---------------------------------------------------------------- corp tower
export function genCorp(level, seed, cx, cz) {
  const r = mulberry32(seed);
  const P = new Parts();
  const anim = [];
  sidewalk(P, cx, cz);
  const H = 38 + level * 26 + r.range(0, 24);
  const win = r.pick(['winCorp', 'winCorp', 'winCorp2', 'winB']);
  const neon = 'neon_' + r.pick(NEON_KEYS);
  const neon2 = 'neon_' + r.pick(NEON_KEYS);
  const style = r();
  let top;

  if (style < 0.4) {
    const secs = [[9.6, 0.55], [7.4, 0.25], [5.2, 0.2]];
    let y = 0.2;
    secs.forEach(([w, f], k) => {
      const h = H * f;
      P.boxB(win, w, h, w, cx, y, cz);
      ring(P, k === 0 ? neon : neon2, w, w, y + h, cx, cz);
      if (k === 0) corners(P, neon, w, w, y, h, cx, cz);
      if (k === 0 && r.chance(0.5)) fins(P, w, w, y, h, cx, cz, 10.5);
      y += h;
      P.boxB('roof', w - 0.1, 0.2, w - 0.1, cx, y, cz);
    });
    const sh = H * 0.2;
    P.cyl('metal', 0.04, 0.35, sh, cx, y, cz, 6, false);
    blink(P, cx, y + sh + 0.2, cz, 0.5);
    top = y + sh;
    if (r.chance(0.6)) holoCrown(anim, cx, y + 3, cz, r.chance(0.5));
    for (let k = 0; k < 2; k++) bladeSign(P, r, cx, cz, 9.6, 9.6, 0.2, H * 0.55);
  } else if (style < 0.72) {
    const rot = r.chance(0.5);
    const w = rot ? 6.4 : 9.8, d = rot ? 9.8 : 6.4;
    P.boxB(win, w, H, d, cx, 0.2, cz);
    ring(P, neon, w, d, H + 0.2, cx, cz);
    ring(P, neon2, w, d, H * 0.33, cx, cz, 0.1);
    ring(P, neon2, w, d, H * 0.66, cx, cz, 0.1);
    // giant vertical sign on the narrow face
    const sh = H * r.range(0.35, 0.55), sy = r.range(6 + sh / 2, H - sh / 2 - 2);
    const key = 'sign' + r.int(0, SIGN_COUNT - 1);
    if (rot) { P.plane(key, 3.2, sh, cx, sy, cz + d / 2 + 0.1, 0); P.plane(key, 3.2, sh, cx, sy, cz - d / 2 - 0.1, PI); }
    else { P.plane(key, 3.2, sh, cx + w / 2 + 0.1, sy, cz, PI / 2); P.plane(key, 3.2, sh, cx - w / 2 - 0.1, sy, cz, -PI / 2); }
    // open neon crown
    const ch = r.range(5, 9);
    P.boxB('roof', w - 0.1, 0.2, d - 0.1, cx, H + 0.2, cz);
    corners(P, neon, w - 0.4, d - 0.4, H + 0.2, ch, cx, cz, 0.18);
    ring(P, neon, w - 0.4, d - 0.4, H + 0.2 + ch, cx, cz, 0.18);
    antenna(P, r, cx, H + 0.4, cz);
    top = H + ch;
    if (r.chance(0.4)) holoCrown(anim, cx, H + ch * 0.5, cz, true);
  } else {
    const radii = [4.9, 4.1, 3.2];
    let y = 0.2;
    radii.forEach((rad, k) => {
      const h = H * [0.5, 0.3, 0.2][k];
      P.cyl(k === 1 ? 'glass' : win, rad, rad, h, cx, y, cz, 24);
      P.cyl(k % 2 ? neon2 : neon, rad + 0.12, rad + 0.12, 0.2, cx, y + h - 0.1, cz, 28, false);
      y += h;
    });
    P.cyl('glass', 0.2, 3.2, 6, cx, y, cz, 24, false);
    blink(P, cx, y + 6.3, cz, 0.5);
    top = y + 6;
    if (r.chance(0.5)) holoCrown(anim, cx, y + 8, cz, r.chance(0.5));
    for (let k = 0; k < 2; k++) bladeSign(P, r, cx, cz, 8.8, 8.8, 0.2, H * 0.5);
  }
  return { parts: P.merge(), anim, height: top, rect: [cx - 5, cz - 5, cx + 5, cz + 5] };
}

// ---------------------------------------------------------------- arcology (2x2)
export function genArcology(level, seed, cx, cz) {
  const r = mulberry32(seed);
  const P = new Parts();
  const anim = [];
  sidewalk(P, cx, cz, 2);
  const neon = 'neon_' + r.pick(NEON_KEYS);
  const neon2 = 'neon_' + r.pick(NEON_KEYS);
  const ph = 12 + r.range(0, 8) + level * 1.5;
  const W = 22.4;
  P.boxB('winMega', W, ph, W, cx, 0.2, cz);
  ring(P, neon, W, W, ph + 0.2, cx, cz, 0.22);
  ring(P, neon2, W, W, 5, cx, cz, 0.12);
  fins(P, W, W, 0.2, ph, cx, cz, 7);
  P.boxB('roof', W - 0.1, 0.3, W - 0.1, cx, ph + 0.2, cz);
  // podium ads on two faces
  const ad1 = 'ad' + r.int(0, AD_COUNT - 1), ad2 = 'ad' + r.int(0, AD_COUNT - 1);
  const ay = Math.max(6, ph * 0.55);
  P.plane(ad1, 14, 7, cx, ay, cz + W / 2 + 0.3, 0);
  P.plane(ad2, 14, 7, cx + W / 2 + 0.3, ay, cz, PI / 2);
  for (let k = 0; k < 3; k++) bladeSign(P, r, cx, cz, W, W, 0.2, ph + 4);

  const quads = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const n = Math.min(4, 2 + (level > 2 ? 1 : 0) + (level > 4 ? 1 : 0));
  const start = r.int(0, 3);
  const towers = [];
  let top = ph;
  for (let k = 0; k < n; k++) {
    const q = quads[(start + k) % 4];
    const w = r.range(7.6, 9.2);
    const x = cx + q[0] * 5.4, z = cz + q[1] * 5.4;
    const h = (70 + level * 30) * (k === 0 ? 1 : r.range(0.5, 0.9));
    const win = r.pick(['winCorp', 'winMega', 'winB', 'winA']);
    const h1 = h * r.range(0.6, 0.75);
    let y = ph + 0.2;
    P.boxB(win, w, h1, w, x, y, z);
    ring(P, neon, w, w, y + h1, x, z);
    if (r.chance(0.5)) corners(P, neon2, w, w, y, h1, x, z);
    bladeSign(P, r, x, z, w, w, y, h1);
    y += h1;
    const w2 = w * r.range(0.6, 0.8);
    P.boxB(win, w2, h - h1, w2, x, y, z);
    ring(P, neon2, w2, w2, y + (h - h1), x, z);
    y += h - h1;
    y = roof(P, r, x, z, w2, w2, y, { billboard: 0.1 });
    towers.push({ x, z, h: ph + h1, w });
    top = Math.max(top, y);
    if (k === 0) holoCrown(anim, x, y + 4, z, r.chance(0.5));
  }
  // skybridges between adjacent towers
  for (let k = 0; k + 1 < towers.length; k++) {
    const a = towers[k], b = towers[k + 1];
    const by = ph + Math.min(a.h, b.h) * r.range(0.3, 0.6) - ph * 0.3;
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
    if (Math.abs(a.x - b.x) > 1) {
      P.box('glass', Math.abs(a.x - b.x) - a.w / 2, 2.2, 2.6, mx, by, mz, 0, false);
      P.box(neon, Math.abs(a.x - b.x) - a.w / 2, 0.12, 2.7, mx, by - 1.15, mz, 0, false);
    } else {
      P.box('glass', 2.6, 2.2, Math.abs(a.z - b.z) - a.w / 2, mx, by, mz, 0, false);
      P.box(neon, 2.7, 0.12, Math.abs(a.z - b.z) - a.w / 2, mx, by - 1.15, mz, 0, false);
    }
  }
  return { parts: P.merge(), anim, height: top, rect: [cx - 11.2, cz - 11.2, cx + 11.2, cz + 11.2] };
}

// ---------------------------------------------------------------- plaza
export function genPlaza(level, seed, cx, cz) {
  const r = mulberry32(seed);
  const P = new Parts();
  const anim = [];
  P.box('concrete', 11.8, 0.14, 11.8, cx, 0.07, cz, 0, false);
  P.plane('plaza', 11.2, 11.2, cx, 0.15, cz, 0, -PI / 2);
  const leaf = r.chance(0.5) ? 'leafC' : 'leafM';
  const spots = [[-3.6, -3.6], [3.6, -3.6], [3.6, 3.6], [-3.6, 3.6]];
  for (const [sx, sz] of spots) {
    if (r.chance(0.15)) continue;
    const x = cx + sx + r.range(-0.6, 0.6), z = cz + sz + r.range(-0.6, 0.6);
    const th = r.range(2, 3.2);
    P.cyl('metal', 0.12, 0.18, th, x, 0.15, z, 6, false);
    const crown = new THREE.IcosahedronGeometry(r.range(1.1, 1.7), 0);
    crown.rotateY(r() * 3);
    P.geo(r.chance(0.8) ? leaf : (leaf === 'leafC' ? 'leafM' : 'leafC'), crown, x, 0.15 + th + 0.8, z);
    P.cyl('dim_cyan', 0.6, 0.6, 0.06, x, 0.16, z, 12, false);
  }
  P.boxB('metal', 2.4, 0.45, 0.6, cx, 0.15, cz - 2.2);
  P.boxB('metal', 2.4, 0.45, 0.6, cx, 0.15, cz + 2.2);
  P.cyl('neon_magenta', 1.6, 1.6, 0.08, cx, 0.16, cz, 32, false);
  P.cyl('metal', 1.2, 1.4, 0.5, cx, 0.15, cz, 16, false);
  const g = new THREE.Group();
  const o = new THREE.Mesh(octaGeo, r.chance(0.5) ? MAT.holoWire : MAT.holo);
  g.add(o);
  g.position.set(cx, 3, cz);
  anim.push({ obj: g, spin: 1.1, bob: 0.4 });
  return { parts: P.merge(), anim, height: 5, rect: null };
}

// ---------------------------------------------------------------- holo billboard
export function genBillboard(level, seed, cx, cz) {
  const r = mulberry32(seed);
  const P = new Parts();
  const anim = [];
  sidewalk(P, cx, cz);
  const H = 16 + level * 5 + r.range(0, 6);
  P.cyl('metal', 0.3, 0.55, H, cx, 0.2, cz, 10, false);
  P.cyl('neon_' + r.pick(NEON_KEYS), 0.62, 0.62, 0.2, cx, 3, cz, 12, false);
  const bw = 14, bh = 7, by = H + bh / 2 + 0.2;
  const alongX = r.chance(0.5);
  const key = 'ad' + r.int(0, AD_COUNT - 1);
  const nk = 'neon_' + r.pick(NEON_KEYS);
  if (alongX) {
    P.box('metal', bw + 0.3, bh + 0.3, 0.3, cx, by, cz, 0, false);
    P.plane(key, bw, bh, cx, by, cz + 0.17, 0);
    P.plane(key, bw, bh, cx, by, cz - 0.17, PI);
    P.box(nk, bw + 0.5, 0.18, 0.4, cx, by + bh / 2 + 0.2, cz, 0, false);
    P.box(nk, bw + 0.5, 0.18, 0.4, cx, by - bh / 2 - 0.2, cz, 0, false);
    blink(P, cx - bw / 2, by + bh / 2 + 0.5, cz); blink(P, cx + bw / 2, by + bh / 2 + 0.5, cz);
  } else {
    P.box('metal', 0.3, bh + 0.3, bw + 0.3, cx, by, cz, 0, false);
    P.plane(key, bw, bh, cx + 0.17, by, cz, PI / 2);
    P.plane(key, bw, bh, cx - 0.17, by, cz, -PI / 2);
    P.box(nk, 0.4, 0.18, bw + 0.5, cx, by + bh / 2 + 0.2, cz, 0, false);
    P.box(nk, 0.4, 0.18, bw + 0.5, cx, by - bh / 2 - 0.2, cz, 0, false);
    blink(P, cx, by + bh / 2 + 0.5, cz - bw / 2); blink(P, cx, by + bh / 2 + 0.5, cz + bw / 2);
  }
  // little kiosk at the base
  P.boxB('winC', 3, 2.6, 3, cx + 3, 0.2, cz + 3);
  P.boxB('roof', 3.4, 0.2, 3.4, cx + 3, 2.8, cz + 3);
  bladeSign(P, r, cx + 3, cz + 3, 3, 3, 0.2, 14);
  return { parts: P.merge(), anim, height: by + bh / 2, rects: [[cx - 0.7, cz - 0.7, cx + 0.7, cz + 0.7], [cx + 1.5, cz + 1.5, cx + 4.5, cz + 4.5]] };
}

export const GENERATORS = {
  habitat: genHabitat,
  corp: genCorp,
  arcology: genArcology,
  plaza: genPlaza,
  billboard: genBillboard,
};
