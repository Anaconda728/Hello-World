// Procedural canvas textures + the shared material palette.
import * as THREE from 'three';
import { mulberry32 } from './rng.js';

export const MAT = {};
export const NEON = {
  cyan: 0x2ef6ff, magenta: 0xff2bd6, amber: 0xffa424, violet: 0x8a5cff,
  green: 0x39ff9c, red: 0xff2848, pink: 0xff5ea8, white: 0xdfe8ff,
};
export const NEON_KEYS = ['cyan', 'magenta', 'amber', 'violet', 'green', 'pink'];
export const SIGN_COUNT = 10;
export const AD_COUNT = 8;
export const AD_COLS = 4;

let maxAniso = 4;

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
function tex(c, { srgb = true, repeat = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = maxAniso;
  return t;
}

// 8x8 window cells, each cell = one 3m bay x one 3.5m floor. UV (0,0) is always wall.
function windowTexture(seed, palette, lit, style = 'grid') {
  const r = mulberry32(seed);
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#06060b';
  g.fillRect(0, 0, 512, 512);
  // faint panel seams
  g.fillStyle = '#0b0b14';
  for (let y = 0; y < 8; y++) g.fillRect(0, y * 64 + 60, 512, 4);
  const cw = 64, ch = 64;
  for (let row = 0; row < 8; row++) {
    // some floors are mostly dark, some mostly lit -> more natural look
    const floorBias = r() < 0.25 ? -0.25 : r() < 0.2 ? 0.3 : 0;
    for (let col = 0; col < 8; col++) {
      const x = col * cw, y = row * ch;
      const isLit = r() < lit + floorBias;
      if (style === 'ribbon') {
        // continuous glass ribbon, segments lit
        g.fillStyle = isLit ? r.pick(palette) : '#0c1220';
        g.globalAlpha = isLit ? r.range(0.55, 1) : 1;
        g.fillRect(x, y + 18, cw, 30);
        g.globalAlpha = 1;
        g.fillStyle = '#05050a';
        g.fillRect(x, y + 18, 3, 30);
        continue;
      }
      if (style === 'dense') {
        for (let s = 0; s < 2; s++) {
          for (let t = 0; t < 2; t++) {
            const l2 = r() < lit + floorBias;
            g.fillStyle = l2 ? r.pick(palette) : '#0d1019';
            g.globalAlpha = l2 ? r.range(0.5, 1) : 1;
            g.fillRect(x + 6 + s * 28, y + 8 + t * 28, 20, 18);
          }
        }
        g.globalAlpha = 1;
        continue;
      }
      if (isLit) {
        g.fillStyle = r.pick(palette);
        g.globalAlpha = r.range(0.45, 1);
      } else {
        g.fillStyle = r() < 0.5 ? '#0d1019' : '#111523';
      }
      g.fillRect(x + 10, y + 14, cw - 20, ch - 26);
      g.globalAlpha = 1;
      if (isLit && r() < 0.35) {
        // half-drawn blinds
        g.fillStyle = 'rgba(0,0,0,0.55)';
        g.fillRect(x + 10, y + 14, cw - 20, r.range(6, 26));
      }
    }
  }
  return tex(c);
}

function glyphs(r, n) {
  const sets = [
    'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワン',
    'ΛΞΣΦΨΩ∆◇◆●▲▼■□',
    'ABCDEFGHJKLMNPRSTUVWXYZ0123456789',
  ];
  const set = r() < 0.7 ? sets[0] : r.pick(sets);
  let s = '';
  for (let i = 0; i < n; i++) s += set[Math.floor(r() * set.length)];
  return s;
}

function neonCss(key) {
  return '#' + new THREE.Color(NEON[key]).getHexString();
}

// Vertical blade sign: glyphs stacked top to bottom.
function signTexture(seed) {
  const r = mulberry32(seed);
  const [c, g] = canvas(128, 512);
  const col = neonCss(r.pick(NEON_KEYS));
  const col2 = neonCss(r.pick(NEON_KEYS));
  g.fillStyle = '#05030a';
  g.fillRect(0, 0, 128, 512);
  g.strokeStyle = col; g.lineWidth = 6; g.shadowColor = col; g.shadowBlur = 16;
  g.strokeRect(8, 8, 112, 496);
  g.font = 'bold 72px sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const n = r.int(3, 5);
  const text = glyphs(r, n);
  g.fillStyle = r() < 0.5 ? col : col2;
  g.shadowColor = g.fillStyle;
  for (let i = 0; i < n; i++) g.fillText(text[i], 64, 60 + i * (392 / (n - 1)));
  return c;
}

const AD_WORDS = ['SYNTHCOLA', 'NEURAL+', 'KAIJU NOODLE', 'OMNI//CORP', 'DREAMWARE', 'CHROME BAR', 'BIOLUX', 'HYPERLINK', 'VOID SAKE', 'ZENTEK'];
// Horizontal billboard ad.
function adTexture(seed, i) {
  const r = mulberry32(seed);
  const [c, g] = canvas(512, 256);
  const a = neonCss(r.pick(NEON_KEYS));
  const b = neonCss(r.pick(NEON_KEYS));
  const grad = g.createLinearGradient(0, 0, 512, 256);
  grad.addColorStop(0, '#0a0216');
  grad.addColorStop(1, '#02060f');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 256);
  // abstract shapes
  g.globalAlpha = 0.5;
  for (let k = 0; k < 6; k++) {
    g.fillStyle = r() < 0.5 ? a : b;
    g.beginPath();
    g.arc(r.range(0, 512), r.range(0, 256), r.range(20, 90), 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  g.fillStyle = 'rgba(0,0,0,0.45)';
  g.fillRect(0, 0, 512, 256);
  g.shadowColor = a; g.shadowBlur = 24;
  g.fillStyle = a;
  g.font = 'bold 64px sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(AD_WORDS[i % AD_WORDS.length], 256, 110, 480);
  g.shadowColor = b; g.fillStyle = b;
  g.font = '30px sans-serif';
  g.fillText(glyphs(r, 8), 256, 185, 460);
  g.strokeStyle = b; g.lineWidth = 6;
  g.strokeRect(6, 6, 500, 244);
  // scanlines
  g.fillStyle = 'rgba(0,0,0,0.25)';
  for (let y = 0; y < 256; y += 4) g.fillRect(0, y, 512, 1);
  return c;
}

function asphaltTexture() {
  const r = mulberry32(7);
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#0c0c12';
  g.fillRect(0, 0, 256, 256);
  for (let k = 0; k < 4000; k++) {
    const v = r.int(8, 26);
    g.fillStyle = `rgb(${v},${v},${v + 4})`;
    g.fillRect(r() * 256, r() * 256, 1.5, 1.5);
  }
  // puddles (darker, will look glossier)
  for (let k = 0; k < 7; k++) {
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.beginPath();
    g.ellipse(r() * 256, r() * 256, r.range(10, 40), r.range(6, 20), r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  return tex(c);
}

function roughnessTexture() {
  // puddles -> low roughness patches (green channel is used by three)
  const r = mulberry32(11);
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#9a9a9a';
  g.fillRect(0, 0, 256, 256);
  for (let k = 0; k < 14; k++) {
    const x = r() * 256, y = r() * 256, rad = r.range(14, 50);
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, '#101010');
    gr.addColorStop(1, 'rgba(16,16,16,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 256);
  }
  return tex(c, { srgb: false });
}

function plazaTexture() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#07080d';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#1de9b6';
  g.shadowColor = '#1de9b6'; g.shadowBlur = 8;
  g.lineWidth = 2;
  for (let k = 0; k <= 8; k++) {
    g.globalAlpha = k % 4 === 0 ? 0.9 : 0.25;
    g.beginPath(); g.moveTo(k * 32, 0); g.lineTo(k * 32, 256); g.stroke();
    g.beginPath(); g.moveTo(0, k * 32); g.lineTo(256, k * 32); g.stroke();
  }
  g.globalAlpha = 1;
  g.lineWidth = 3;
  g.strokeStyle = '#ff2bd6'; g.shadowColor = '#ff2bd6';
  g.beginPath(); g.arc(128, 128, 54, 0, Math.PI * 2); g.stroke();
  return tex(c, { repeat: false });
}

function poolTexture() {
  const [c, g] = canvas(128, 128);
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)');
  gr.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  return tex(c, { repeat: false });
}

function labelTexture(text, color) {
  const [c, g] = canvas(256, 64);
  g.fillStyle = 'rgba(20,0,10,0.75)';
  g.fillRect(0, 0, 256, 64);
  g.strokeStyle = color; g.lineWidth = 4; g.strokeRect(2, 2, 252, 60);
  g.fillStyle = color; g.font = 'bold 30px monospace';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128, 34);
  return tex(c, { repeat: false });
}

function neonBasic(hex, k = 3) {
  const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), toneMapped: false });
  return m;
}

function windowMat(t, intensity = 0.95) {
  return new THREE.MeshStandardMaterial({
    map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: intensity,
    roughness: 0.55, metalness: 0.4, envMapIntensity: 0.6,
  });
}

// A tiny scene of neon panels rendered to a PMREM env map: gives wet, glossy reflections.
function buildEnvironment(renderer) {
  const env = new THREE.Scene();
  env.background = new THREE.Color(0x05030a);
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const add = (color, k, x, y, z, sx, sy, sz) => {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k) }));
    m.position.set(x, y, z); m.scale.set(sx, sy, sz); env.add(m);
  };
  add(0xff2bd6, 2.2, -8, 3, 0, 0.5, 4, 10);
  add(0x2ef6ff, 2.0, 8, 4, -2, 0.5, 6, 8);
  add(0xffa424, 1.6, 0, 2, 9, 10, 2, 0.5);
  add(0x8a5cff, 1.2, 0, 2, -9, 8, 3, 0.5);
  add(0x30204a, 1.0, 0, 9, 0, 20, 0.5, 20);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(env, 0.035);
  pm.dispose();
  return rt.texture;
}

export function initMaterials(renderer) {
  maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const envMap = buildEnvironment(renderer);

  const warm = ['#ffcf86', '#ffb35a', '#fff1c9', '#ff9d4d', '#ffe0a8'];
  const cool = ['#9ef3ff', '#5fd4ff', '#e6fbff', '#4aa8ff', '#b7c8ff'];
  const pink = ['#ff7ae0', '#ff4fc3', '#ffc2f0', '#c08bff', '#9ef3ff'];
  const mixed = [...warm.slice(0, 3), ...cool.slice(0, 2), '#ff7ae0'];

  MAT.winA = windowMat(windowTexture(101, warm, 0.26));
  MAT.winB = windowMat(windowTexture(202, cool, 0.22));
  MAT.winC = windowMat(windowTexture(303, pink, 0.2));
  MAT.winD = windowMat(windowTexture(404, mixed, 0.1));
  MAT.winCorp = windowMat(windowTexture(505, ['#7fdcff', '#d4f6ff', '#5ab0ff', '#a6b8ff'], 0.3, 'ribbon'), 0.9);
  MAT.winCorp2 = windowMat(windowTexture(606, ['#ffd38a', '#fff3d6', '#ff9a8a'], 0.28, 'ribbon'), 0.9);
  MAT.winMega = windowMat(windowTexture(707, mixed, 0.24, 'dense'));
  MAT.winSky = windowMat(windowTexture(808, mixed, 0.08), 0.8); // distant skyline
  MAT.winSky.fog = true;

  MAT.metal = new THREE.MeshStandardMaterial({ color: 0x16161f, roughness: 0.45, metalness: 0.85 });
  MAT.concrete = new THREE.MeshStandardMaterial({ color: 0x1a1a22, roughness: 0.6, metalness: 0.2 });
  MAT.roof = new THREE.MeshStandardMaterial({ color: 0x0c0c12, roughness: 0.7, metalness: 0.4 });
  MAT.glass = new THREE.MeshStandardMaterial({ color: 0x0a1424, roughness: 0.08, metalness: 0.95, envMapIntensity: 1.4 });

  const asphalt = asphaltTexture();
  MAT.asphalt = new THREE.MeshStandardMaterial({
    map: asphalt, roughnessMap: roughnessTexture(), color: 0xffffff,
    roughness: 0.55, metalness: 0.45, envMapIntensity: 0.9,
  });
  MAT.ground = new THREE.MeshStandardMaterial({ color: 0x0b0a12, roughness: 0.55, metalness: 0.45, envMapIntensity: 0.8 });
  const pt = plazaTexture();
  MAT.plaza = new THREE.MeshStandardMaterial({ map: pt, emissiveMap: pt, emissive: 0xffffff, emissiveIntensity: 0.8, roughness: 0.3, metalness: 0.5 });

  for (const k of Object.keys(NEON)) {
    MAT['neon_' + k] = neonBasic(NEON[k], 2.4);
    MAT['dim_' + k] = neonBasic(NEON[k], 1.1);
  }
  MAT.lane = neonBasic(0xffa424, 1.0);
  MAT.paint = neonBasic(0x9aa4c0, 0.6);
  MAT.lamp = neonBasic(0xffe2b8, 4);
  MAT.leafC = new THREE.MeshStandardMaterial({ color: 0x041a14, emissive: 0x1de9b6, emissiveIntensity: 0.55, roughness: 0.6, flatShading: true });
  MAT.leafM = new THREE.MeshStandardMaterial({ color: 0x1a0414, emissive: 0xff2bd6, emissiveIntensity: 0.5, roughness: 0.6, flatShading: true });
  MAT.blinkA = neonBasic(NEON.red, 4);
  MAT.blinkB = neonBasic(NEON.red, 4);

  // Signs and ads are packed into atlases so a whole chunk's signage is one draw call.
  const [sa, sg] = canvas(128 * SIGN_COUNT, 512);
  for (let i = 0; i < SIGN_COUNT; i++) sg.drawImage(signTexture(9000 + i * 17), i * 128, 0);
  MAT.signAtlas = new THREE.MeshBasicMaterial({ map: tex(sa, { repeat: false }), color: new THREE.Color(1.3, 1.3, 1.3), toneMapped: false, side: THREE.DoubleSide });
  const [aa, ag] = canvas(512 * AD_COLS, 256 * (AD_COUNT / AD_COLS));
  for (let i = 0; i < AD_COUNT; i++) {
    const c = adTexture(4000 + i * 31, i);
    ag.drawImage(c, (i % AD_COLS) * 512, Math.floor(i / AD_COLS) * 256);
    // standalone copies for animated hologram logos
    MAT['ad' + i] = new THREE.MeshBasicMaterial({ map: tex(c, { repeat: false }), color: new THREE.Color(1.15, 1.15, 1.15), toneMapped: false, side: THREE.DoubleSide });
  }
  MAT.adAtlas = new THREE.MeshBasicMaterial({ map: tex(aa, { repeat: false }), color: new THREE.Color(1.15, 1.15, 1.15), toneMapped: false, side: THREE.DoubleSide });

  const pool = poolTexture();
  MAT.pool = new THREE.MeshBasicMaterial({
    map: pool, color: new THREE.Color(0xffc888).multiplyScalar(0.55), transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  MAT.holo = new THREE.MeshBasicMaterial({
    color: new THREE.Color(NEON.cyan).multiplyScalar(1.6), transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
  });
  MAT.holoM = MAT.holo.clone();
  MAT.holoM.color = new THREE.Color(NEON.magenta).multiplyScalar(1.6);
  MAT.holoWire = MAT.holo.clone();
  MAT.holoWire.wireframe = true;
  MAT.beam = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0x8fb8ff).multiplyScalar(0.35), transparent: true, opacity: 0.18,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
  });
  MAT.warnLabel = new THREE.SpriteMaterial({ map: labelTexture('⚠ NO ROAD', '#ff3a5c'), depthTest: false, toneMapped: false, color: new THREE.Color(1.5, 1.5, 1.5) });

  return envMap;
}

// Per-frame animation of shared materials (blinking beacons, flickering holograms).
export function animateMaterials(t) {
  const a = Math.sin(t * 3.1) > 0.6 ? 4 : 0.15;
  const b = Math.sin(t * 2.3 + 2) > 0.6 ? 4 : 0.15;
  MAT.blinkA.color.setRGB(a, a * 0.08, a * 0.12);
  MAT.blinkB.color.setRGB(b, b * 0.08, b * 0.12);
  const flick = 0.5 + 0.08 * Math.sin(t * 23) + (Math.random() < 0.02 ? -0.3 : 0);
  MAT.holo.opacity = flick;
  MAT.holoM.opacity = flick;
  MAT.holoWire.opacity = flick + 0.2;
}
