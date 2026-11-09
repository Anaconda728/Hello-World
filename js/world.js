// Terrain generation, chunk streaming, sculpting edits and trees.
import * as THREE from 'three';
import { CS, H, SY, WATER, MAT, MAT_INFO, idx, ckey } from './constants.js';
import { Noise, makeRng } from './noise.js';
import { buildChunkGeometry } from './mesher.js';

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const round2 = (v) => Math.round(v * 100) / 100;

export class World {
  constructor(scene, seed, save, radius) {
    this.scene = scene;
    this.seed = seed;
    this.radius = radius;
    this.noise = new Noise(seed);
    this.caveNoise = new Noise(seed ^ 0x5bd1e995);
    this.oreNoise = new Noise(seed ^ 0x27d4eb2f);
    this.oreNoise2 = new Noise(seed ^ 0x165667b1);
    this.chunks = new Map();
    this.ops = save?.ops ? save.ops.slice() : [];
    this.removedTrees = new Set(save?.removedTrees || []);
    this.terrainMat = new THREE.MeshLambertMaterial({ vertexColors: true });

    this.trunkGeo = new THREE.CylinderGeometry(0.2, 0.3, 1, 7);
    this.trunkGeo.translate(0, 0.5, 0);
    this.leafGeo = new THREE.IcosahedronGeometry(1, 1);
    this.pineGeo = new THREE.ConeGeometry(1, 1, 8, 3);
    this.pineGeo.translate(0, 0.5, 0);
    this.trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5434 });
    this.leafMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });

    this.col = { x: NaN, z: NaN, dens: new Float32Array(SY), mats: new Uint8Array(SY) };

    this.offsets = [];
    const r = radius + 1;
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) this.offsets.push([dx, dz]);
    this.offsets.sort((a, b) => a[0] * a[0] + a[1] * a[1] - (b[0] * b[0] + b[1] * b[1]));
  }

  // ---------- generation ----------

  heightAt(x, z) {
    const n = this.noise;
    const base = n.fbm2(x * 0.0045, z * 0.0045, 4);
    const detail = n.fbm2(x * 0.02 + 31.7, z * 0.02 - 12.3, 3);
    let m = Math.max(0, n.fbm2(x * 0.0018 - 200, z * 0.0018 + 90, 3));
    const h = 24 + base * 12 + detail * 2.5 + m * m * 55;
    return Math.min(H - 5, Math.max(3, h));
  }

  forestAt(x, z) { return this.noise.noise2(x * 0.008 + 500, z * 0.008 - 500); }

  // Height of the first solid surface found searching down from just above yHint.
  groundY(x, yHint, z) {
    let top = yHint + 2;
    for (let k = 0; k < 8 && this.sample(x, top, z) > 0; k++) top += 1;
    let prev = top, dPrev = this.sample(x, prev, z);
    if (dPrev > 0) return -Infinity;
    for (let y = top - 0.5; y > yHint - 8; y -= 0.5) {
      const d = this.sample(x, y, z);
      if (d > 0) return prev - (dPrev / (dPrev - d)) * 0.5;
      prev = y; dPrev = d;
    }
    return -Infinity;
  }

  topMat(h, x, z) {
    if (h < WATER + 1.6) return MAT.SAND;
    if (h > 47 + this.noise.noise2(x * 0.05, z * 0.05) * 4) return MAT.SNOW;
    return MAT.GRASS;
  }

  fillColumn(dens, mats, base, wx, wz) {
    const h = this.heightAt(wx, wz);
    let top = this.topMat(h, wx, wz);
    const clayZone = h < WATER + 5 && this.noise.noise2(wx * 0.04 + 77, wz * 0.04 - 33) > -0.1;
    if (clayZone && h < WATER + 0.3) top = MAT.CLAY;               // clay lake beds
    const sub = clayZone && top !== MAT.SNOW ? MAT.CLAY
      : top === MAT.SAND ? MAT.SAND : top === MAT.SNOW ? MAT.STONE : MAT.DIRT;
    const cn = this.caveNoise, on = this.oreNoise, on2 = this.oreNoise2;
    for (let y = 0; y <= H; y++) {
      let d, m;
      if (y <= 1) { d = 6; m = MAT.BEDROCK; }
      else {
        d = h - y;
        if (d > 3 && y > WATER + 1) {
          const c = cn.noise3(wx * 0.035, y * 0.06, wz * 0.035) + 0.5 * cn.noise3(wx * 0.08 + 50, y * 0.1, wz * 0.08);
          if (c > 0.38) d = Math.min(d, (0.38 - c) * 30);
        }
        if (d > 6) d = 6; else if (d < -6) d = -6;
        const depth = h - y;
        m = depth < 1.4 ? top : depth < 4.5 ? sub : MAT.STONE;
        if (m === MAT.STONE) {
          const o = on.noise3(wx * 0.1, y * 0.12, wz * 0.1);
          if (o > 0.4) m = MAT.COAL;
          else if (o < -0.42 && y < 34) m = MAT.IRON;
          else if (y < 26 && on2.noise3(wx * 0.13 + 40, y * 0.13, wz * 0.13) > 0.45) m = MAT.SULFUR;
        }
      }
      dens[base + y] = d;
      mats[base + y] = m;
    }
  }

  // Unedited column for chunks that aren't loaded (cached for repeated lookups).
  rawColumn(wx, wz) {
    const c = this.col;
    if (c.x !== wx || c.z !== wz) {
      this.fillColumn(c.dens, c.mats, 0, wx, wz);
      c.x = wx; c.z = wz;
    }
    return c;
  }

  getChunk(cx, cz) { return this.chunks.get(ckey(cx, cz)); }

  generate(cx, cz) {
    const c = {
      cx, cz,
      dens: new Float32Array(CS * CS * SY),
      mats: new Uint8Array(CS * CS * SY),
      mesh: null, trees: [], treeMeshes: [], dirty: true, meshed: false,
    };
    const x0 = cx * CS, z0 = cz * CS;
    for (let lx = 0; lx < CS; lx++)
      for (let lz = 0; lz < CS; lz++)
        this.fillColumn(c.dens, c.mats, idx(lx, 0, lz), x0 + lx, z0 + lz);
    for (const op of this.ops) if (this.opTouches(c, op)) this.applyOp(c, op, null);
    this.chunks.set(ckey(cx, cz), c);
    this.placeTrees(c);
    return c;
  }

  // ---------- density queries ----------

  getD(x, y, z) {
    if (y < 0) return 6;
    if (y > H) return -6;
    const c = this.chunks.get(ckey(x >> 5, z >> 5));
    if (c) return c.dens[idx(x & 31, y, z & 31)];
    return this.rawColumn(x, z).dens[y];
  }

  // Trilinear density at any point (positive = solid).
  sample(x, y, z) {
    const x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z);
    const fx = x - x0, fy = y - y0, fz = z - z0;
    const g = (a, b, c) => this.getD(a, b, c);
    const c00 = g(x0, y0, z0) * (1 - fx) + g(x0 + 1, y0, z0) * fx;
    const c10 = g(x0, y0 + 1, z0) * (1 - fx) + g(x0 + 1, y0 + 1, z0) * fx;
    const c01 = g(x0, y0, z0 + 1) * (1 - fx) + g(x0 + 1, y0, z0 + 1) * fx;
    const c11 = g(x0, y0 + 1, z0 + 1) * (1 - fx) + g(x0 + 1, y0 + 1, z0 + 1) * fx;
    const c0 = c00 * (1 - fy) + c10 * fy;
    const c1 = c01 * (1 - fy) + c11 * fy;
    return c0 * (1 - fz) + c1 * fz;
  }

  gradient(x, y, z, out) {
    const e = 0.35;
    out.set(
      this.sample(x + e, y, z) - this.sample(x - e, y, z),
      this.sample(x, y + e, z) - this.sample(x, y - e, z),
      this.sample(x, y, z + e) - this.sample(x, y, z - e),
    ).multiplyScalar(1 / (2 * e));
    return out;
  }

  // ---------- sculpting ----------

  opTouches(c, op) {
    const [, ox, , oz, r] = op;
    const m = r + 2, x0 = c.cx * CS, z0 = c.cz * CS;
    return ox + m >= x0 && ox - m <= x0 + CS - 1 && oz + m >= z0 && oz - m <= z0 + CS - 1;
  }

  // op = [type (0 dig, 1 build), x, y, z, radius, material]
  applyOp(c, op, counts) {
    const [type, ox, oy, oz, r, mat] = op;
    const x0 = c.cx * CS, z0 = c.cz * CS, m = r + 2;
    const lx0 = Math.max(0, Math.floor(ox - m) - x0), lx1 = Math.min(CS - 1, Math.ceil(ox + m) - x0);
    const lz0 = Math.max(0, Math.floor(oz - m) - z0), lz1 = Math.min(CS - 1, Math.ceil(oz + m) - z0);
    const y0 = Math.max(0, Math.floor(oy - m)), y1 = Math.min(H - 1, Math.ceil(oy + m));
    const { dens, mats } = c;
    for (let lx = lx0; lx <= lx1; lx++) {
      const dx = x0 + lx - ox;
      for (let lz = lz0; lz <= lz1; lz++) {
        const dz = z0 + lz - oz;
        const base = idx(lx, 0, lz);
        for (let y = y0; y <= y1; y++) {
          const dy = y - oy;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          const i = base + y, d = dens[i];
          if (type === 0) {
            if (mats[i] === MAT.BEDROCK) continue;
            const nd = Math.min(d, dist - r);
            if (counts && d > 0 && nd <= 0) counts[mats[i]]++;
            dens[i] = nd;
          } else {
            const s = r - dist;
            if (s > d) {
              if (counts && d <= 0 && s > 0) counts[mat]++;
              dens[i] = s;
              mats[i] = mat;
            }
          }
        }
      }
    }
  }

  // Applies an edit live, records it for saving, and returns material counts
  // (dug amounts for digging, cost for building).
  edit(type, x, y, z, r, mat) {
    const op = [type, round2(x), round2(y), round2(z), r, mat];
    this.ops.push(op);
    const counts = new Array(MAT_INFO.length).fill(0);
    const m = r + 3;
    const cx0 = Math.floor((op[1] - m) / CS), cx1 = Math.floor((op[1] + m) / CS);
    const cz0 = Math.floor((op[3] - m) / CS), cz1 = Math.floor((op[3] + m) / CS);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        const c = this.getChunk(cx, cz);
        if (c && this.opTouches(c, op)) this.applyOp(c, op, counts);
      }
    }
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        const c = this.getChunk(cx, cz);
        if (!c) continue;
        if (c.meshed) this.buildMesh(c); else c.dirty = true;
        if (type === 0) {
          for (const t of c.trees) {
            if (!t.alive) continue;
            const dd = Math.hypot(t.x - op[1], t.z - op[3]);
            if (dd < r + 1.5 && this.sample(t.x, t.y - 0.5, t.z) <= 0) {
              this.removeTree(t);
              counts[MAT.WOOD] += 4;
            }
          }
        }
      }
    }
    return counts;
  }

  // ---------- trees ----------

  placeTrees(c) {
    const rng = makeRng((Math.imul(c.cx, 73856093) ^ Math.imul(c.cz, 19349663) ^ this.seed) >>> 0);
    const x0 = c.cx * CS, z0 = c.cz * CS;
    for (let i = 0; i < 12; i++) {
      const r1 = rng(), r2 = rng(), r3 = rng(), r4 = rng(), r5 = rng(), r6 = rng();
      const x = x0 + r1 * CS, z = z0 + r2 * CS;
      const forest = this.forestAt(x, z);
      const p = Math.min(0.9, Math.max(0.04, 0.2 + forest * 1.8));
      if (r3 > p) continue;
      const h = this.heightAt(x, z);
      if (h < WATER + 1.8 || h > 55) continue;
      const sx = this.heightAt(x + 1, z) - this.heightAt(x - 1, z);
      const sz = this.heightAt(x, z + 1) - this.heightAt(x, z - 1);
      if (sx * sx + sz * sz > 1.4) continue;
      const id = `${c.cx},${c.cz},${i}`;
      if (this.removedTrees.has(id)) continue;
      if (this.sample(x, h - 0.6, z) <= 0 || this.sample(x, h + 1.5, z) > 0) continue;
      const pine = h > 40 || r4 < 0.2;
      c.trees.push({
        id, x, y: h, z, pine, alive: true, refs: [],
        th: pine ? 1.6 + r5 * 1.2 : 2.4 + r5 * 1.6,
        s: 1.5 + r6 * 0.9, snowy: h > 44, rot: r4 * Math.PI * 2,
      });
    }
  }

  buildTrees(c) {
    if (!c.trees.length) return;
    const rounds = c.trees.filter((t) => !t.pine), pines = c.trees.filter((t) => t.pine);
    const trunks = new THREE.InstancedMesh(this.trunkGeo, this.trunkMat, c.trees.length);
    const mk = (list, geo) => list.length ? new THREE.InstancedMesh(geo, this.leafMat, list.length) : null;
    const leaves = mk(rounds, this.leafGeo), cones = mk(pines, this.pineGeo);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    const col = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);

    c.trees.forEach((t, i) => {
      q.setFromAxisAngle(up, t.rot);
      m.compose(p.set(t.x, t.y - 0.4, t.z), q, s.set(1, t.th + 0.4, 1));
      trunks.setMatrixAt(i, m);
      t.refs.push([trunks, i]);
    });
    rounds.forEach((t, i) => {
      m.compose(p.set(t.x, t.y + t.th + t.s * 0.45, t.z), q.setFromAxisAngle(up, t.rot), s.set(t.s, t.s * 0.85, t.s));
      leaves.setMatrixAt(i, m);
      leaves.setColorAt(i, col.setHSL(0.24 + (t.rot % 1) * 0.06, 0.5, 0.3 + (t.s - 1.5) * 0.06));
      t.refs.push([leaves, i]);
    });
    pines.forEach((t, i) => {
      m.compose(p.set(t.x, t.y + t.th * 0.4, t.z), q.setFromAxisAngle(up, t.rot), s.set(t.s * 0.8, t.s * 2.7, t.s * 0.8));
      cones.setMatrixAt(i, m);
      cones.setColorAt(i, t.snowy ? col.setHSL(0.45, 0.15, 0.62) : col.setHSL(0.37, 0.42, 0.22));
      t.refs.push([cones, i]);
    });

    for (const [mesh, list] of [[trunks, c.trees], [leaves, rounds], [cones, pines]]) {
      if (!mesh) continue;
      mesh.userData = { kind: 'tree', trees: list };
      mesh.computeBoundingSphere();
      this.scene.add(mesh);
      c.treeMeshes.push(mesh);
    }
  }

  removeTree(t) {
    if (!t.alive) return;
    t.alive = false;
    this.removedTrees.add(t.id);
    for (const [mesh, i] of t.refs) {
      mesh.setMatrixAt(i, ZERO);
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  *nearbyTrees(x, z) {
    const cx = Math.floor(x / CS), cz = Math.floor(z / CS);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const c = this.getChunk(cx + dx, cz + dz);
      if (!c) continue;
      for (const t of c.trees) if (t.alive && Math.abs(t.x - x) < 3 && Math.abs(t.z - z) < 3) yield t;
    }
  }

  // ---------- meshing & streaming ----------

  buildMesh(c) {
    c.dirty = false;
    const geo = buildChunkGeometry(this, c);
    if (c.mesh) {
      c.mesh.geometry.dispose();
      if (geo) c.mesh.geometry = geo;
      else { this.scene.remove(c.mesh); c.mesh = null; }
    } else if (geo) {
      c.mesh = new THREE.Mesh(geo, this.terrainMat);
      c.mesh.position.set(c.cx * CS, 0, c.cz * CS);
      c.mesh.userData.kind = 'terrain';
      this.scene.add(c.mesh);
    }
    if (!c.meshed) { c.meshed = true; this.buildTrees(c); }
  }

  neighborsReady(cx, cz) {
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++)
        if (!this.chunks.has(ckey(cx + dx, cz + dz))) return false;
    return true;
  }

  unload(c) {
    if (c.mesh) { this.scene.remove(c.mesh); c.mesh.geometry.dispose(); }
    for (const m of c.treeMeshes) { this.scene.remove(m); m.dispose(); }
    this.chunks.delete(ckey(c.cx, c.cz));
  }

  update(px, pz, budgetMs) {
    const pcx = Math.floor(px / CS), pcz = Math.floor(pz / CS), R = this.radius;
    for (const c of this.chunks.values()) {
      if (Math.max(Math.abs(c.cx - pcx), Math.abs(c.cz - pcz)) > R + 2) this.unload(c);
    }
    const t0 = performance.now();
    for (const [dx, dz] of this.offsets) {
      if (performance.now() - t0 > budgetMs) break;
      const cx = pcx + dx, cz = pcz + dz;
      const c = this.chunks.get(ckey(cx, cz));
      if (!c) { this.generate(cx, cz); continue; }
      if (Math.max(Math.abs(dx), Math.abs(dz)) <= R && c.dirty && this.neighborsReady(cx, cz)) this.buildMesh(c);
    }
  }

  isReadyAt(x, z) {
    const c = this.getChunk(Math.floor(x / CS), Math.floor(z / CS));
    return !!(c && c.meshed);
  }
}
