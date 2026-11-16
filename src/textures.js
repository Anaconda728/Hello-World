// Procedural surface textures: building facades (colour, lit-window glow, relief, gloss),
// asphalt, paving, roofing, metal, ground, grass and worn road paint. Everything is drawn
// to canvases at load time, so the game still ships with no image files.
import * as THREE from 'three';
import { mulberry32 } from './rng.js';

let ANISO = 4;
export function setAnisotropy(a) { ANISO = a; }

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d', { willReadFrequently: true })];
}
function tex(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = ANISO;
  return t;
}
const grey = (v) => { v = Math.max(0, Math.min(255, Math.round(v))); return `rgb(${v},${v},${v})`; };
const rgba = (r, g, b, a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;

// Tangent-space normal map from a greyscale height canvas (wraps at the edges).
function normalFromHeight(src, strength = 2) {
  const w = src.width, h = src.height;
  const d = src.getContext('2d').getImageData(0, 0, w, h).data;
  const [c, g] = canvas(w, h);
  const out = g.createImageData(w, h), o = out.data;
  const H = (x, y) => d[(((y + h) % h) * w + ((x + w) % w)) * 4];
  const k = strength / 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * k, dy = (H(x, y - 1) - H(x, y + 1)) * k;
    const inv = 1 / Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
    o[i] = (-dx * inv * 0.5 + 0.5) * 255; o[i + 1] = (-dy * inv * 0.5 + 0.5) * 255; o[i + 2] = (inv * 0.5 + 0.5) * 255; o[i + 3] = 255;
  }
  g.putImageData(out, 0, 0);
  return c;
}

// Speckle noise + soft blotches, tiling.
function grain(g, S, r, n, lo, hi, size = 1.5, alpha = 1) {
  g.globalAlpha = alpha;
  for (let k = 0; k < n; k++) {
    g.fillStyle = grey(r.range(lo, hi));
    g.fillRect(r() * S, r() * S, size * r.range(0.6, 1.6), size * r.range(0.6, 1.6));
  }
  g.globalAlpha = 1;
}
function blotches(g, S, r, n, color, rMin, rMax, alpha) {
  for (let k = 0; k < n; k++) {
    const x = r() * S, y = r() * S, rad = r.range(rMin, rMax);
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      if (x + ox + rad < 0 || x + ox - rad > S || y + oy + rad < 0 || y + oy - rad > S) continue;
      const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
      gr.addColorStop(0, color.replace('A', alpha));
      gr.addColorStop(1, color.replace('A', 0));
      g.fillStyle = gr;
      g.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2);
    }
  }
}
function crack(g, S, r, len, width, style) {
  let x = r() * S, y = r() * S, a = r() * Math.PI * 2;
  g.strokeStyle = style; g.lineWidth = width; g.lineCap = 'round';
  g.beginPath(); g.moveTo(x, y);
  for (let k = 0; k < len; k++) {
    a += r.range(-0.7, 0.7);
    x += Math.cos(a) * S * 0.012; y += Math.sin(a) * S * 0.012;
    g.lineTo(x, y);
    if (r() < 0.06) { g.stroke(); crack(g, S, r, len * 0.3, width * 0.7, style); g.beginPath(); g.moveTo(x, y); }
  }
  g.stroke();
}

// ------------------------------------------------------------------ ground surfaces
// Each returns { map, normalMap, roughnessMap } (normalMap omitted when detail is false).
export function asphaltSet(q) {
  const detail = q.normals, S = q.hi ? 1024 : 512;
  const r = mulberry32(7);
  const [a, ag] = canvas(S), [h, hg] = canvas(512), [ro, rg] = canvas(512);
  ag.fillStyle = '#3c3d46'; ag.fillRect(0, 0, S, S);
  blotches(ag, S, r, 26, 'rgba(14,14,18,A)', S * 0.06, S * 0.22, 0.5);
  blotches(ag, S, r, 16, 'rgba(96,96,110,A)', S * 0.05, S * 0.18, 0.25);
  grain(ag, S, r, S * 14, 30, 100, S / 512);          // aggregate
  grain(ag, S, r, S * 2, 90, 150, S / 700, 0.7);     // pale stones
  hg.fillStyle = grey(128); hg.fillRect(0, 0, 512, 512);
  grain(hg, 512, r, 9000, 90, 170, 1.6);
  rg.fillStyle = rgba(0, 150, 115); rg.fillRect(0, 0, 512, 512);
  blotches(rg, 512, r, 30, 'rgba(0,70,160,A)', 20, 80, 0.6); // damp sheen
  // resurfacing patches
  for (let k = 0; k < 5; k++) {
    const x = r() * S, y = r() * S, w = r.range(0.08, 0.25) * S, hh = r.range(0.05, 0.16) * S;
    ag.fillStyle = r() < 0.5 ? 'rgba(12,12,16,0.45)' : 'rgba(64,64,74,0.3)';
    ag.fillRect(x, y, w, hh);
    ag.strokeStyle = 'rgba(4,4,6,0.8)'; ag.lineWidth = S / 400; ag.strokeRect(x, y, w, hh);
    hg.fillStyle = grey(140); hg.fillRect(x / S * 512, y / S * 512, w / S * 512, hh / S * 512);
  }
  // cracks and glossy tar seams
  for (let k = 0; k < 9; k++) crack(ag, S, r, r.int(18, 46), S / 520, 'rgba(3,3,5,0.9)');
  const r2 = mulberry32(7 + 99);
  for (let k = 0; k < 9; k++) crack(hg, 512, r2, r2.int(18, 46), 1.6, grey(40));
  for (let k = 0; k < 5; k++) {
    const rr = mulberry32(300 + k);
    crack(ag, S, rr, 40, S / 170, 'rgba(6,6,9,0.95)');
    crack(rg, 512, mulberry32(300 + k), 40, 3.4, rgba(0, 40, 160));
  }
  // oil stains
  blotches(ag, S, r, 7, 'rgba(2,2,6,A)', S * 0.02, S * 0.07, 0.7);
  // puddles: dark, mirror-smooth, flat
  const rp = mulberry32(11);
  for (let k = 0; k < 11; k++) {
    const x = rp(), y = rp(), rad = rp.range(0.04, 0.12);
    for (const [g, s, col] of [[ag, S, 'rgba(4,5,10,A)'], [rg, 512, 'rgba(0,8,255,A)'], [hg, 512, 'rgba(128,128,128,A)']]) {
      const gr = g.createRadialGradient(x * s, y * s, 0, x * s, y * s, rad * s);
      gr.addColorStop(0, col.replace('A', 0.95)); gr.addColorStop(0.7, col.replace('A', 0.8)); gr.addColorStop(1, col.replace('A', 0));
      g.fillStyle = gr; g.fillRect(0, 0, s, s);
    }
  }
  return { map: tex(a), roughnessMap: tex(ro, false), normalMap: detail ? tex(normalFromHeight(h, 2.2), false) : null };
}

// Sidewalk / precast concrete: slabs with joints, stains, the odd cracked one. 4x4 slabs per tile.
export function pavingSet(detail, S = 512) {
  const r = mulberry32(21);
  const [a, ag] = canvas(S), [h, hg] = canvas(S), [ro, rg] = canvas(256);
  ag.fillStyle = '#3a3b42'; ag.fillRect(0, 0, S, S);
  hg.fillStyle = grey(170); hg.fillRect(0, 0, S, S);
  rg.fillStyle = rgba(0, 215, 20); rg.fillRect(0, 0, 256, 256);
  const N = 4, c = S / N;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const v = r.range(-9, 9);
    ag.fillStyle = rgba(58 + v, 59 + v, 66 + v); ag.fillRect(i * c, j * c, c, c);
    hg.fillStyle = grey(170 + r.range(-12, 12)); hg.fillRect(i * c + 3, j * c + 3, c - 6, c - 6);
  }
  grain(ag, S, r, 16000, 34, 86, 1.4, 0.55);
  grain(hg, S, r, 5000, 150, 190, 1.5, 0.6);
  blotches(ag, S, r, 14, 'rgba(8,8,12,A)', S * 0.04, S * 0.16, 0.5);
  blotches(rg, 256, r, 8, 'rgba(0,60,40,A)', 18, 50, 0.8); // damp patches
  for (let k = 0; k < 40; k++) { ag.fillStyle = 'rgba(6,6,8,0.7)'; ag.beginPath(); ag.arc(r() * S, r() * S, r.range(1, 2.6), 0, 7); ag.fill(); } // gum
  for (let k = 0; k <= N; k++) {
    for (const [g, col, w] of [[ag, 'rgba(8,8,11,0.95)', 3], [hg, grey(60), 5]]) {
      g.fillStyle = col;
      g.fillRect(k * c - w / 2, 0, w, S); g.fillRect(0, k * c - w / 2, S, w);
    }
  }
  for (let k = 0; k < 3; k++) { const rr = mulberry32(50 + k); crack(ag, S, rr, 16, 1.4, 'rgba(5,5,7,0.9)'); crack(hg, S, mulberry32(50 + k), 16, 2.2, grey(70)); }
  return { map: tex(a), roughnessMap: tex(ro, false), normalMap: detail ? tex(normalFromHeight(h, 1.6), false) : null };
}

// Flat roofing: bitumen sheets with lapped seams, patches and ponding.
export function roofSet(detail, S = 512) {
  const r = mulberry32(33);
  const [a, ag] = canvas(S), [h, hg] = canvas(S), [ro, rg] = canvas(256);
  ag.fillStyle = '#1b1c22'; ag.fillRect(0, 0, S, S);
  hg.fillStyle = grey(128); hg.fillRect(0, 0, S, S);
  rg.fillStyle = rgba(0, 190, 40); rg.fillRect(0, 0, 256, 256);
  grain(ag, S, r, 20000, 14, 52, 1.3, 0.8);
  grain(hg, S, r, 7000, 100, 160, 1.4);
  blotches(ag, S, r, 12, 'rgba(60,60,72,A)', S * 0.05, S * 0.2, 0.25);
  for (let k = 0; k < 4; k++) {
    const y = (k + 0.5) * S / 4;
    ag.fillStyle = 'rgba(4,4,6,0.9)'; ag.fillRect(0, y, S, 3);
    ag.fillStyle = 'rgba(70,70,80,0.35)'; ag.fillRect(0, y + 3, S, 2);
    hg.fillStyle = grey(175); hg.fillRect(0, y - 6, S, 8);
  }
  for (let k = 0; k < 4; k++) {
    const x = r() * S * 0.8, y = r() * S * 0.8, w = r.range(30, 90), hh = r.range(24, 60);
    ag.fillStyle = 'rgba(40,40,50,0.6)'; ag.fillRect(x, y, w, hh);
    ag.strokeStyle = 'rgba(3,3,5,0.9)'; ag.lineWidth = 2; ag.strokeRect(x, y, w, hh);
    hg.fillStyle = grey(165); hg.fillRect(x, y, w, hh);
  }
  blotches(rg, 256, r, 6, 'rgba(0,15,200,A)', 16, 46, 0.95);
  blotches(ag, S, mulberry32(34), 6, 'rgba(3,4,8,A)', 30, 90, 0.6);
  return { map: tex(a), roughnessMap: tex(ro, false), normalMap: detail ? tex(normalFromHeight(h, 1.4), false) : null };
}

// Dark plated metal: brushed, with panel seams and rivets.
export function metalSet(detail, S = 512) {
  const r = mulberry32(44);
  const [a, ag] = canvas(S), [h, hg] = canvas(S), [ro, rg] = canvas(256);
  ag.fillStyle = '#2b2c36'; ag.fillRect(0, 0, S, S);
  hg.fillStyle = grey(150); hg.fillRect(0, 0, S, S);
  rg.fillStyle = rgba(0, 105, 220); rg.fillRect(0, 0, 256, 256);
  for (let k = 0; k < 2600; k++) { // brushing
    ag.fillStyle = rgba(255, 255, 255, r.range(0.015, 0.06)); ag.fillRect(r() * S, r() * S, r.range(20, 120), 1);
    ag.fillStyle = rgba(0, 0, 0, r.range(0.03, 0.1)); ag.fillRect(r() * S, r() * S, r.range(20, 120), 1);
  }
  blotches(ag, S, r, 10, 'rgba(70,40,24,A)', 20, 70, 0.22); // rust bloom
  blotches(rg, 256, r, 10, 'rgba(0,230,120,A)', 10, 36, 0.7);
  const N = 2, c = S / N;
  for (let k = 0; k <= N; k++) {
    for (const [g, col, w] of [[ag, 'rgba(5,5,8,0.95)', 3], [hg, grey(50), 5]]) { g.fillStyle = col; g.fillRect(k * c - w / 2, 0, w, S); g.fillRect(0, k * c - w / 2, S, w); }
  }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) for (let q = 0; q < 8; q++) {
    const t = (q + 0.5) / 8;
    for (const [x, y] of [[i * c + t * c, j * c + 12], [i * c + 12, j * c + t * c]]) {
      ag.fillStyle = 'rgba(90,92,104,0.9)'; ag.beginPath(); ag.arc(x, y, 2.6, 0, 7); ag.fill();
      ag.fillStyle = 'rgba(0,0,0,0.6)'; ag.beginPath(); ag.arc(x + 0.8, y + 1, 2.6, 0, 7); ag.fill();
      hg.fillStyle = grey(235); hg.beginPath(); hg.arc(x, y, 3, 0, 7); hg.fill();
    }
  }
  return { map: tex(a), roughnessMap: tex(ro, false), normalMap: detail ? tex(normalFromHeight(h, 1.5), false) : null };
}

// Bare ground beyond the streets: cracked, stained hardpan.
export function groundSet(detail, S = 512) {
  const r = mulberry32(55);
  const [a, ag] = canvas(S), [h, hg] = canvas(S);
  ag.fillStyle = '#34323e'; ag.fillRect(0, 0, S, S);
  hg.fillStyle = grey(128); hg.fillRect(0, 0, S, S);
  blotches(ag, S, r, 20, 'rgba(10,10,14,A)', S * 0.06, S * 0.25, 0.55);
  blotches(ag, S, r, 12, 'rgba(90,80,100,A)', S * 0.05, S * 0.2, 0.3);
  grain(ag, S, r, 18000, 24, 90, 1.5, 0.7);
  grain(hg, S, r, 8000, 96, 164, 1.8);
  for (let k = 0; k < 10; k++) { const rr = mulberry32(70 + k); crack(ag, S, rr, 30, 1.5, 'rgba(2,2,4,0.9)'); crack(hg, S, mulberry32(70 + k), 30, 2.4, grey(40)); }
  return { map: tex(a), normalMap: detail ? tex(normalFromHeight(h, 1.8), false) : null };
}

// Park lawn: dark blades, clumps, and specks of bioluminescent moss that glow faintly.
export function grassSet(S = 512) {
  const r = mulberry32(66);
  const [a, ag] = canvas(S), [e, eg] = canvas(256);
  ag.fillStyle = '#10261f'; ag.fillRect(0, 0, S, S);
  blotches(ag, S, r, 24, 'rgba(4,14,10,A)', S * 0.05, S * 0.2, 0.7);
  blotches(ag, S, r, 14, 'rgba(34,74,52,A)', S * 0.04, S * 0.14, 0.4);
  for (let k = 0; k < 14000; k++) {
    const x = r() * S, y = r() * S, v = r.range(0.4, 1.3);
    ag.strokeStyle = rgba(20 * v, 60 * v, 44 * v, 0.8); ag.lineWidth = 1;
    ag.beginPath(); ag.moveTo(x, y); ag.lineTo(x + r.range(-2, 2), y - r.range(2, 6)); ag.stroke();
  }
  eg.fillStyle = '#000'; eg.fillRect(0, 0, 256, 256);
  for (let k = 0; k < 130; k++) {
    eg.fillStyle = r() < 0.7 ? rgba(40, 255, 190, r.range(0.4, 1)) : rgba(255, 60, 220, r.range(0.4, 1));
    eg.beginPath(); eg.arc(r() * 256, r() * 256, r.range(0.5, 1.4), 0, 7); eg.fill();
  }
  return { map: tex(a), emissiveMap: tex(e) };
}

// Road paint: chipped and tyre-worn. Multiplies the paint colour.
export function paintWear() {
  const r = mulberry32(88), S = 256;
  const [a, ag] = canvas(S);
  ag.fillStyle = '#fff'; ag.fillRect(0, 0, S, S);
  grain(ag, S, r, 5000, 120, 255, 1.6, 0.6);
  blotches(ag, S, r, 26, 'rgba(30,30,36,A)', 8, 34, 0.85);
  for (let k = 0; k < 500; k++) { ag.fillStyle = rgba(20, 20, 26, r.range(0.4, 0.95)); ag.fillRect(r() * S, r() * S, r.range(1, 5), r.range(1, 4)); }
  for (let k = 0; k < 5; k++) crack(ag, S, mulberry32(90 + k), 20, 1.6, 'rgba(15,15,20,0.9)');
  return tex(a);
}

// ------------------------------------------------------------------ building facades
// 8x8 cells; each cell is one 3 m bay by one 3.5 m floor. Returns colour, glow, relief and
// gloss textures drawn in lockstep so every lit window lines up across all four.
const WALLS = {
  concrete: { base: [58, 60, 68], rough: 215, metal: 10 },
  brick: { base: [66, 40, 36], rough: 225, metal: 0 },
  panel: { base: [44, 50, 62], rough: 110, metal: 190 },
  stucco: { base: [70, 62, 58], rough: 235, metal: 0 },
  dark: { base: [30, 32, 40], rough: 150, metal: 120 },
};
export function facadeSet(seed, palette, lit, style = 'grid', wallName = 'concrete', q = { hi: false, normals: true }) {
  const r = mulberry32(seed);
  const detail = q.normals;
  const SA = q.hi ? 1024 : 512, K = SA / 512;
  const [a, ag] = canvas(SA), [e, eg] = canvas(512), [h, hg] = canvas(512), [ro, rg] = canvas(512);
  const wall = WALLS[wallName];
  const [wr, wg, wb] = wall.base;
  // paint the same rectangle on every layer (coordinates in the 512 base space)
  const A = (x, y, w, hh, col) => { ag.fillStyle = col; ag.fillRect(x * K, y * K, w * K, hh * K); };
  const E = (x, y, w, hh, col) => { eg.fillStyle = col; eg.fillRect(x, y, w, hh); };
  const Hh = (x, y, w, hh, v) => { hg.fillStyle = grey(v); hg.fillRect(x, y, w, hh); };
  const R = (x, y, w, hh, rough, metal) => { rg.fillStyle = rgba(0, rough, metal); rg.fillRect(x, y, w, hh); };

  // ---- wall
  A(0, 0, 512, 512, rgba(wr, wg, wb));
  eg.fillStyle = '#000'; eg.fillRect(0, 0, 512, 512);
  Hh(0, 0, 512, 512, 150);
  R(0, 0, 512, 512, wall.rough, wall.metal);
  if (wallName === 'brick') {
    for (let row = 0; row < 64; row++) {
      const y = row * 8, off = row % 2 ? 8 : 0;
      for (let col = -1; col < 32; col++) {
        const v = r.range(-12, 12);
        A(col * 16 + off + 1, y + 1, 14, 6, rgba(wr + v, wg + v * 0.6, wb + v * 0.5));
        Hh(col * 16 + off + 1, y + 1, 14, 6, 165 + r.range(-8, 8));
      }
      A(0, y, 512, 1, 'rgba(18,14,14,0.9)'); Hh(0, y, 512, 1.5, 110);
    }
  } else if (wallName === 'panel' || wallName === 'dark') {
    for (let k = 0; k < 8; k++) {
      A(k * 64, 0, 1.5, 512, 'rgba(6,7,10,0.9)'); Hh(k * 64, 0, 2.5, 512, 90);
      A(k * 64 + 1.5, 0, 1, 512, 'rgba(120,128,150,0.25)');
    }
    for (let k = 0; k < 900; k++) { ag.fillStyle = rgba(255, 255, 255, r.range(0.01, 0.05)); ag.fillRect(r() * SA, r() * SA, 1, r.range(20, 90) * K); }
  } else {
    grain(ag, SA, r, SA * 12, wr - 26, wr + 22, K * 1.3, 0.5);
    grain(hg, 512, r, 5000, 135, 165, 1.4, 0.7);
    for (let k = 0; k < 8; k++) { A(0, k * 64 + 61, 512, 1.5, 'rgba(10,10,13,0.75)'); Hh(0, k * 64 + 60, 512, 3, 105); } // floor lines
  }
  blotches(ag, SA, r, 16, 'rgba(6,6,9,A)', SA * 0.05, SA * 0.2, 0.42); // weathering

  const glass = () => rgba(8 + r.range(0, 8), 12 + r.range(0, 8), 20 + r.range(0, 10));
  // one window pane, optionally lit, with whatever is going on inside
  const pane = (x, y, w, hh, on, opts = {}) => {
    if (!opts.frameless) {
      A(x - 2, y - 2, w + 4, hh + 4, rgba(wr * 0.45, wg * 0.45, wb * 0.5));       // reveal shadow
      A(x - 1.5, y - 1.5, w + 3, hh + 3, rgba(wr + 34, wg + 34, wb + 38));        // frame
      Hh(x - 2.5, y - 2.5, w + 5, hh + 5, 205);
    }
    A(x, y, w, hh, glass());
    Hh(x, y, w, hh, 62);
    R(x, y, w, hh, 26, 235);
    // reflection streak on the glass
    ag.fillStyle = 'rgba(150,170,210,0.07)';
    ag.beginPath(); ag.moveTo(x * K, (y + hh) * K); ag.lineTo((x + w * 0.45) * K, y * K); ag.lineTo((x + w * 0.7) * K, y * K); ag.lineTo((x + w * 0.25) * K, (y + hh) * K); ag.fill();
    if (w > 16 && !opts.frameless) { A(x + w / 2 - 0.6, y, 1.2, hh, rgba(wr + 20, wg + 20, wb + 24)); Hh(x + w / 2 - 1, y, 2, hh, 190); } // mullion
    if (!on) { if (r() < 0.3) A(x, y, w, hh * r.range(0.2, 0.9), 'rgba(60,62,72,0.55)'); return; }
    const col = r.pick(palette), b = r.range(0.5, 1);
    eg.globalAlpha = b; E(x, y, w, hh, col); eg.globalAlpha = 1;
    // room: brighter ceiling light band, darker floor
    const gr = eg.createLinearGradient(0, y, 0, y + hh);
    gr.addColorStop(0, 'rgba(255,255,255,0.22)'); gr.addColorStop(0.25, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.45)');
    eg.fillStyle = gr; eg.fillRect(x, y, w, hh);
    const what = r();
    if (what < 0.3) { const bh = hh * r.range(0.25, 0.85); for (let q = 0; q < bh; q += 2.5) E(x, y + q, w, 1.2, 'rgba(0,0,0,0.6)'); }   // blinds
    else if (what < 0.42) E(x, y, w * r.range(0.25, 0.5), hh, 'rgba(0,0,0,0.62)');                                                       // curtain
    else if (what < 0.52 && hh > 20) {                                                                                                   // someone at the window
      const px = x + r.range(0.25, 0.75) * w;
      eg.fillStyle = 'rgba(0,0,0,0.85)';
      eg.beginPath(); eg.arc(px, y + hh * 0.45, 2.6, 0, 7); eg.fill(); eg.fillRect(px - 3.6, y + hh * 0.52, 7.2, hh * 0.5);
    } else if (what < 0.6) E(x + w * 0.55, y + hh * 0.45, w * 0.32, hh * 0.3, 'rgba(120,190,255,0.9)');                                  // screen glow
    else if (what < 0.66 && hh > 20) { eg.fillStyle = 'rgba(0,40,10,0.8)'; eg.beginPath(); eg.arc(x + w * 0.2, y + hh * 0.78, 4, 0, 7); eg.fill(); } // plant
    if (!opts.frameless && w > 16) E(x + w / 2 - 0.6, y, 1.2, hh, 'rgba(0,0,0,0.75)');
  };

  for (let row = 0; row < 8; row++) {
    const bias = r() < 0.22 ? -0.22 : r() < 0.18 ? 0.28 : 0;
    for (let col = 0; col < 8; col++) {
      const x = col * 64, y = row * 64;
      const on = () => r() < lit + bias;
      if (style === 'ribbon') {
        // curtain wall: continuous glazing between spandrel panels
        for (let q = 0; q < 2; q++) pane(x + q * 32 + 1, y + 16, 30, 34, on(), { frameless: true });
        A(x, y + 14, 64, 2, rgba(wr + 40, wg + 40, wb + 46)); A(x, y + 50, 64, 2, rgba(wr + 40, wg + 40, wb + 46));
        Hh(x, y + 13, 64, 3, 215); Hh(x, y + 50, 64, 3, 215);
        A(x + 31.4, y + 16, 1.2, 34, rgba(wr + 30, wg + 30, wb + 36)); A(x, y + 16, 1, 34, rgba(wr + 30, wg + 30, wb + 36));
        Hh(x + 31, y + 16, 2, 34, 200); Hh(x, y + 16, 1.5, 34, 200);
        continue;
      }
      if (style === 'dense') {
        for (let s = 0; s < 2; s++) for (let t = 0; t < 2; t++) pane(x + 6 + s * 28, y + 7 + t * 28, 20, 18, on());
        if (r() < 0.18) { A(x + 28, y, 3, 64, 'rgba(14,15,20,0.95)'); Hh(x + 27, y, 5, 64, 215); } // conduit
        continue;
      }
      if (style === 'server') {
        // louvred plant floors with status LEDs
        A(x + 4, y + 6, 56, 52, 'rgb(16,19,26)'); Hh(x + 4, y + 6, 56, 52, 95); R(x + 4, y + 6, 56, 52, 95, 210);
        for (let q = 0; q < 12; q++) { A(x + 5, y + 8 + q * 4.2, 54, 1.6, 'rgba(70,76,92,0.9)'); Hh(x + 5, y + 8 + q * 4.2, 54, 2, 190); }
        for (let s = 0; s < 4; s++) for (let t = 0; t < 6; t++) if (r() < lit + bias) E(x + 8 + t * 8.5, y + 12 + s * 12, 4, 3, r.pick(palette));
        continue;
      }
      // standard punched window with sill, sometimes an AC unit and a rust streak below
      const lit1 = on();
      pane(x + 11, y + 13, 42, 36, lit1);
      A(x + 8, y + 50, 48, 3, rgba(wr + 46, wg + 46, wb + 50)); Hh(x + 8, y + 50, 48, 4, 230); // sill
      const gs = ag.createLinearGradient(0, (y + 53) * K, 0, (y + 64) * K);
      gs.addColorStop(0, 'rgba(5,5,7,0.55)'); gs.addColorStop(1, 'rgba(5,5,7,0)');
      ag.fillStyle = gs; ag.fillRect((x + 12 + r.range(0, 20)) * K, (y + 53) * K, r.range(4, 16) * K, 11 * K);
      if (r() < 0.16) {
        const ax = x + 14 + r.range(0, 18);
        A(ax, y + 40, 18, 11, 'rgb(74,78,88)'); Hh(ax, y + 40, 18, 11, 245); R(ax, y + 40, 18, 11, 120, 200);
        for (let q = 0; q < 4; q++) A(ax + 2, y + 42 + q * 2.2, 10, 0.9, 'rgba(10,10,14,0.9)');
        A(ax + 13.5, y + 42, 3, 7, 'rgba(12,12,16,0.9)');
      }
    }
  }
  if (style === 'grid') {
    // drainpipe and cable runs between bays
    for (let k = 0; k < 2; k++) {
      const x = r.int(0, 7) * 64 + 2;
      A(x, 0, 3, 512, 'rgba(20,21,27,0.95)'); A(x + 0.6, 0, 0.8, 512, 'rgba(110,114,130,0.5)'); Hh(x - 0.5, 0, 4, 512, 225);
      for (let q = 0; q < 8; q++) { A(x - 1, q * 64 + 30, 5, 2, 'rgb(84,88,100)'); Hh(x - 1.5, q * 64 + 30, 6, 2.5, 245); }
    }
  }
  // keep the very first texel plain wall: box tops sample it
  A(0, 506, 6, 6, rgba(wr * 0.5, wg * 0.5, wb * 0.55)); E(0, 506, 6, 6, '#000');
  return { map: tex(a), emissiveMap: tex(e), roughnessMap: tex(ro, false), normalMap: detail ? tex(normalFromHeight(h, 2.0), false) : null };
}

// ------------------------------------------------------------------ world-space mapping
// Projects a material's textures from world position, so every box, slab, pylon and ramp is
// textured seamlessly without touching its geometry UVs. `vary` adds large-scale tone drift
// that hides the tiling.
export function worldMapped(mat, tileMetres, vary = 0) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uWScale = { value: 1 / tileMetres };
    sh.uniforms.uWVary = { value: vary };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWScale;\nvarying vec3 vWPos;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>
#ifdef USE_INSTANCING
  vec3 wPos = position;
#else
  vec3 wPos = (modelMatrix * vec4(position, 1.0)).xyz;
#endif
  vWPos = wPos;
  vec2 wUv = (abs(normal.y) > 0.6 ? wPos.xz : vec2(wPos.x + wPos.z, wPos.y)) * uWScale;
#ifdef USE_MAP
  vMapUv = wUv;
#endif
#ifdef USE_NORMALMAP
  vNormalMapUv = wUv;
#endif
#ifdef USE_ROUGHNESSMAP
  vRoughnessMapUv = wUv;
#endif
#ifdef USE_METALNESSMAP
  vMetalnessMapUv = wUv;
#endif
#ifdef USE_EMISSIVEMAP
  vEmissiveMapUv = wUv;
#endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uWVary;
varying vec3 vWPos;
float wHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float wNoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(wHash(i), wHash(i + vec2(1.0, 0.0)), f.x), mix(wHash(i + vec2(0.0, 1.0)), wHash(i + vec2(1.0, 1.0)), f.x), f.y); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
  diffuseColor.rgb *= 1.0 + uWVary * (wNoise(vWPos.xz * 0.045) * 0.7 + wNoise(vWPos.xz * 0.19 + 7.0) * 0.3 - 0.5);`);
  };
  mat.customProgramCacheKey = () => 'world-mapped';
  return mat;
}
