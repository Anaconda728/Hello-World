// Vegetation: tree, bush and rock models, plus swaying grass and wildflowers.
import * as THREE from 'three';
import { MAT, WATER } from './constants.js';
import { makeRng, hash3 } from './noise.js';

export const windUniform = { value: 0 };

// ---------- geometry helpers ----------
const h3 = (x, y, z, k) => hash3(Math.round(x * 97) + k * 13, Math.round(y * 97), Math.round(z * 97));

function merge(geos) {
  const pos = [], nor = [], col = [];
  for (const g of geos) {
    const p = g.attributes.position, n = g.attributes.normal, c = g.attributes.color;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
      col.push(c ? c.getX(i) : 1, c ? c.getY(i) : 1, c ? c.getZ(i) : 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}

// Lumpy spheres with soft normals and darker undersides (cheap ambient occlusion).
function blobs(list, detail, rough, dark = 0.55, light = 1.12) {
  const parts = [];
  let minY = Infinity, maxY = -Infinity;
  for (const [x, y, z, r] of list) { minY = Math.min(minY, y - r); maxY = Math.max(maxY, y + r); }
  for (const [x, y, z, r] of list) {
    const g = new THREE.IcosahedronGeometry(r, detail);
    const p = g.attributes.position, nor = new Float32Array(p.count * 3), col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i), l = Math.hypot(vx, vy, vz) || 1;
      const k = 1 + (h3(vx + x, vy + y, vz + z, 1) - 0.5) * rough;
      p.setXYZ(i, vx * k + x, vy * k + y, vz * k + z);
      nor[i * 3] = vx / l; nor[i * 3 + 1] = vy / l; nor[i * 3 + 2] = vz / l;
      const t = (vy + y - minY) / (maxY - minY || 1);
      const v = (dark + (light - dark) * t) * (0.9 + h3(vx + x, vy + y, vz + z, 2) * 0.2);
      col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v;
    }
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    parts.push(g);
  }
  return merge(parts);
}

function trunkGeo() {
  const g = new THREE.CylinderGeometry(0.12, 0.27, 1, 8, 5).toNonIndexed();
  g.translate(0, 0.5, 0);
  const p = g.attributes.position, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const bend = Math.sin(y * 2.3) * 0.04;
    p.setX(i, x + bend); p.setZ(i, z + Math.cos(y * 1.7) * 0.03);
    const v = h3(x * 0.3, Math.floor(y * 6) / 6, z * 0.3, 3) > 0.78 ? 0.4 : 0.85 + h3(x, y, z, 4) * 0.25;
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

function pineGeo() {
  const parts = [];
  for (let k = 0; k < 4; k++) {
    const r = 1.0 - k * 0.2, hgt = 0.95;
    const g = new THREE.ConeGeometry(r, hgt, 10, 2).toNonIndexed();
    g.translate(0, k * 0.55 + hgt / 2, 0);
    const p = g.attributes.position, col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const j = (h3(x, y, z, 5) - 0.5) * 0.18;
      p.setXYZ(i, x * (1 + j), y + j * 0.3, z * (1 + j));
      const t = (y - k * 0.55) / hgt;
      const v = (0.6 + t * 0.5) * (0.9 + h3(x, y, z, 6) * 0.2);
      col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    parts.push(g);
  }
  return merge(parts);
}

function berryGeo() {
  const parts = [], rng = makeRng(77);
  for (let i = 0; i < 16; i++) {
    const g = new THREE.IcosahedronGeometry(0.075, 0);
    const a = rng() * Math.PI * 2, e = rng() * 1.2 - 0.2;
    g.translate(Math.cos(a) * Math.cos(e) * 0.66, Math.sin(e) * 0.5 + 0.05, Math.sin(a) * Math.cos(e) * 0.66);
    parts.push(g);
  }
  return merge(parts);
}

function rockGeo() {
  const g = new THREE.IcosahedronGeometry(0.5, 1);
  const p = g.attributes.position, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 0.75 + h3(x, y, z, 7) * 0.5;
    p.setXYZ(i, x * k, y * k * 0.6, z * k);
    const v = 0.75 + h3(x, y, z, 8) * 0.35;
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

function grassGeo() {
  const pos = [], col = [], nor = [], rng = makeRng(31);
  for (let b = 0; b < 7; b++) {
    const a = rng() * Math.PI * 2, r = rng() * 0.22, bx = Math.cos(a) * r, bz = Math.sin(a) * r;
    const ang = rng() * Math.PI, w = 0.035 + rng() * 0.02, hgt = 0.32 + rng() * 0.3;
    const lean = (rng() - 0.5) * 0.25, ldir = rng() * Math.PI * 2;
    const dx = Math.cos(ang) * w, dz = Math.sin(ang) * w;
    const tx = bx + Math.cos(ldir) * lean, tz = bz + Math.sin(ldir) * lean;
    pos.push(bx - dx, 0, bz - dz, bx + dx, 0, bz + dz, tx, hgt, tz);
    col.push(0.45, 0.45, 0.45, 0.45, 0.45, 0.45, 1.2, 1.2, 1.05);
    nor.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

function flowerGeo() {
  const pos = [], col = [], nor = [];
  const y = 0.34, s = 0.07;
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2, a2 = a + 0.6;
    pos.push(0, y + 0.01, 0, Math.cos(a) * s * 1.6, y, Math.sin(a) * s * 1.6, Math.cos(a2) * s * 1.6, y, Math.sin(a2) * s * 1.6);
    col.push(1, 1, 0.7, 1, 1, 1, 1, 1, 1);
    nor.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
  }
  // stem
  pos.push(-0.01, 0, 0, 0.01, 0, 0, 0, y, 0);
  col.push(0.25, 0.45, 0.2, 0.25, 0.45, 0.2, 0.3, 0.5, 0.25);
  nor.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

// Wind sway for anything whose height is in position.y.
function addWind(mat, amount) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = windUniform;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec4 wp = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      #else
        vec4 wp = vec4(0.0);
      #endif
      float sway = position.y * ${amount.toFixed(3)};
      transformed.x += sin(uTime * 1.6 + wp.x * 0.31 + wp.z * 0.17) * sway;
      transformed.z += cos(uTime * 1.25 + wp.z * 0.27 - wp.x * 0.11) * sway * 0.7;`);
    // Light both sides of thin blades as if facing up.
    if (mat.side === THREE.DoubleSide) {
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal);');
    }
  };
  return mat;
}

export const GEO = {
  trunk: trunkGeo(),
  oak: blobs([[0, 0, 0, 0.75], [0.5, 0.15, 0.2, 0.55], [-0.45, 0.1, -0.25, 0.55], [0.1, 0.45, -0.35, 0.5], [-0.15, 0.4, 0.45, 0.5], [0.2, -0.25, -0.1, 0.5], [-0.3, -0.2, 0.3, 0.45]], 1, 0.22),
  birch: blobs([[0, 0, 0, 0.5], [0.2, 0.5, 0.1, 0.45], [-0.2, 0.9, -0.1, 0.4], [0.1, 1.25, 0, 0.32], [-0.25, 0.3, 0.25, 0.38], [0.25, 0.15, -0.25, 0.36]], 1, 0.25),
  pine: pineGeo(),
  bush: blobs([[0, 0, 0, 0.6], [0.45, -0.05, 0.1, 0.45], [-0.4, -0.05, -0.15, 0.45], [0.05, 0.2, 0.4, 0.4], [-0.1, 0.15, -0.4, 0.4]], 1, 0.3, 0.5, 1.1),
  berries: berryGeo(),
  rock: rockGeo(),
  grass: grassGeo(),
  flower: flowerGeo(),
};

export const MATS = {
  bark: new THREE.MeshLambertMaterial({ vertexColors: true }),
  leaves: addWind(new THREE.MeshLambertMaterial({ vertexColors: true }), 0.015),
  bush: new THREE.MeshLambertMaterial({ vertexColors: true }),
  berries: new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x220000 }),
  rock: new THREE.MeshLambertMaterial({ vertexColors: true }),
  grass: addWind(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), 0.16),
  flower: addWind(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), 0.1),
};

const FLOWER_COLORS = [0xffffff, 0xf5d142, 0xb57be0, 0xe0505a, 0xf08ab8, 0x7aa8f0].map((c) => new THREE.Color(c));

// Grass tufts and flowers for one chunk, placed on its grassy, fairly flat vertices.
export function buildGrass(world, c) {
  const geo = c.mesh && c.mesh.geometry;
  if (!geo || !geo.userData.mats) return [];
  const pos = geo.attributes.position, nor = geo.attributes.normal, col = geo.attributes.color, mats = geo.userData.mats;
  const rng = makeRng((Math.imul(c.cx, 92837111) ^ Math.imul(c.cz, 689287499) ^ 0x6a55) >>> 0);
  const x0 = c.cx * 32, z0 = c.cz * 32;
  const grass = [], flowers = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const tint = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    if (mats[i] !== MAT.GRASS || nor.getY(i) < 0.82) continue;
    const y = pos.getY(i);
    if (y < WATER + 0.4) continue;
    const vx = pos.getX(i), vz = pos.getZ(i);
    const town = world.towns.near(x0 + vx, z0 + vz, 2);
    if (town && town.buildings.some((b) => x0 + vx > b.rect[0] - 0.3 && x0 + vx < b.rect[1] + 0.3 && z0 + vz > b.rect[2] - 0.3 && z0 + vz < b.rect[3] + 0.3)) continue;
    const meadow = world.noise.noise2((x0 + vx) * 0.03 + 11, (z0 + vz) * 0.03 - 7);
    const n = 1 + (rng() < 0.4 + meadow * 0.5 ? 1 : 0);
    for (let k = 0; k < n; k++) {
      const gx = vx + (rng() - 0.5) * 1.1, gz = vz + (rng() - 0.5) * 1.1;
      const sc = 0.75 + rng() * 0.6 + Math.max(0, meadow) * 0.5;
      q.setFromAxisAngle(up, rng() * Math.PI * 2);
      m.compose(p.set(gx, y - 0.04, gz), q, s.set(sc, sc * (0.8 + rng() * 0.5), sc));
      tint.setRGB(col.getX(i), col.getY(i), col.getZ(i)).multiplyScalar(1.12);
      grass.push(m.clone(), tint.clone());
    }
    if (rng() < 0.03 + Math.max(0, meadow) * 0.12) {
      const fx = vx + (rng() - 0.5), fz = vz + (rng() - 0.5);
      q.setFromAxisAngle(up, rng() * Math.PI * 2);
      const sc = 0.8 + rng() * 0.5;
      m.compose(p.set(fx, y - 0.03, fz), q, s.set(sc, sc, sc));
      const fc = FLOWER_COLORS[Math.floor(Math.abs(world.noise.noise2((x0 + fx) * 0.09, (z0 + fz) * 0.09)) * 9 + rng() * 1.5) % FLOWER_COLORS.length];
      flowers.push(m.clone(), fc);
    }
  }
  const out = [];
  const make = (list, g, mat) => {
    const count = list.length / 2;
    if (!count) return;
    const im = new THREE.InstancedMesh(g, mat, count);
    for (let k = 0; k < count; k++) { im.setMatrixAt(k, list[k * 2]); im.setColorAt(k, list[k * 2 + 1]); }
    im.position.set(x0, 0, z0);
    im.userData.noShadow = true;
    im.computeBoundingSphere();
    out.push(im);
  };
  make(grass, GEO.grass, MATS.grass);
  make(flowers, GEO.flower, MATS.flower);
  return out;
}
