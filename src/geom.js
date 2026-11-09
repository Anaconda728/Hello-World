// Collects world-space geometry per material key so a whole building (and later a
// whole chunk of buildings) can be merged into a handful of draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SIGN_COUNT, AD_COUNT, AD_COLS } from './materials.js';

const AD_ROWS = AD_COUNT / AD_COLS;

const WU = 24; // texture repeat width (8 bays * 3m)
const WV = 28; // texture repeat height (8 floors * 3.5m)

function normalize(g) {
  let geo = g.index ? g.toNonIndexed() : g;
  if (geo !== g) g.dispose();
  for (const name of Object.keys(geo.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv') geo.deleteAttribute(name);
  }
  if (!geo.attributes.uv) {
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
  }
  if (!geo.attributes.normal) geo.computeVertexNormals();
  geo.clearGroups();
  return geo;
}

// Box whose side UVs are scaled to world size, so windows are a constant size.
export function boxGeo(w, h, d, worldUV = true) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (!worldUV) return g;
  const uv = g.attributes.uv;
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const idx = f * 4 + k;
      if (f === 2 || f === 3) { uv.setXY(idx, 0.002, 0.002); continue; }
      const span = f < 2 ? d : w;
      uv.setXY(idx, uv.getX(idx) * span / WU, uv.getY(idx) * h / WV);
    }
  }
  return g;
}

export function cylGeo(rt, rb, h, seg = 16, worldUV = true) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, false);
  if (!worldUV) return g;
  const uv = g.attributes.uv;
  const torso = (seg + 1) * 2;
  const circ = Math.PI * (rt + rb);
  for (let i = 0; i < uv.count; i++) {
    if (i >= torso) uv.setXY(i, 0.002, 0.002);
    else uv.setXY(i, uv.getX(i) * circ / WU, uv.getY(i) * h / WV);
  }
  return g;
}

export class Parts {
  constructor() { this.lists = new Map(); }

  add(key, geo) {
    const g = normalize(geo);
    if (!this.lists.has(key)) this.lists.set(key, []);
    this.lists.get(key).push(g);
    return g;
  }
  // Box centred at (x, y, z).
  box(key, w, h, d, x, y, z, ry = 0, worldUV = true) {
    const g = boxGeo(w, h, d, worldUV);
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    return this.add(key, g);
  }
  // Box sitting on y = base.
  boxB(key, w, h, d, x, base, z, ry = 0) {
    return this.box(key, w, h, d, x, base + h / 2, z, ry);
  }
  cyl(key, rt, rb, h, x, base, z, seg = 16, worldUV = true) {
    const g = cylGeo(rt, rb, h, seg, worldUV);
    g.translate(x, base + h / 2, z);
    return this.add(key, g);
  }
  plane(key, w, h, x, y, z, ry = 0, rx = 0) {
    const g = new THREE.PlaneGeometry(w, h);
    // redirect individual sign/ad keys into their atlas
    let m;
    if ((m = /^sign(\d+)$/.exec(key))) {
      const n = +m[1], uv = g.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setX(k, (n + uv.getX(k)) / SIGN_COUNT);
      key = 'signAtlas';
    } else if ((m = /^ad(\d+)$/.exec(key))) {
      const n = +m[1], col = n % AD_COLS, row = Math.floor(n / AD_COLS), uv = g.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, (col + uv.getX(k)) / AD_COLS, (AD_ROWS - 1 - row + uv.getY(k)) / AD_ROWS);
      key = 'adAtlas';
    }
    if (rx) g.rotateX(rx);
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    return this.add(key, g);
  }
  geo(key, g, x, y, z) {
    g.translate(x, y, z);
    return this.add(key, g);
  }

  // Merge all lists -> Map(key -> single geometry)
  merge() {
    const out = new Map();
    for (const [key, list] of this.lists) {
      if (!list.length) continue;
      const m = list.length === 1 ? list[0] : mergeGeometries(list, false);
      if (list.length > 1) list.forEach((g) => g.dispose());
      out.set(key, m);
    }
    this.lists.clear();
    return out;
  }
}

// Merge several Map(key->geo) into meshes. Source geometries are left untouched.
export function meshesFromPartMaps(maps, MAT) {
  const byKey = new Map();
  for (const m of maps) {
    for (const [k, g] of m) {
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k).push(g);
    }
  }
  const meshes = [];
  for (const [k, list] of byKey) {
    const geo = list.length === 1 ? list[0].clone() : mergeGeometries(list, false);
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, MAT[k]);
    mesh.matrixAutoUpdate = false;
    meshes.push(mesh);
  }
  return meshes;
}
