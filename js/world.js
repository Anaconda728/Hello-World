// Terrain generation, chunk streaming, sculpting edits and trees.
import * as THREE from 'three';
import { CS, H, SY, WATER, MAT, MAT_INFO, idx, ckey } from './constants.js';
import { Noise, makeRng } from './noise.js';
import { buildChunkGeometry } from './mesher.js';
import { TownMap } from './towns.js';
import { RoadMap, ROAD_HALF } from './roads.js';
import { GEO, MATS, buildGrass } from './vegetation.js';

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
    this.towns = new TownMap(this);
    this.roads = new RoadMap(this);
    this.colliderProvider = null;
    this.ops = save?.ops ? save.ops.slice() : [];
    this.removedTrees = new Set(save?.removedTrees || []);
    this.picked = new Map(Object.entries(save?.pickedBushes || {}));
    this.day = 0;
    this.terrainMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    // Break up the flat vertex colours with fine procedural detail.
    this.terrainMat.onBeforeCompile = (sh) => {
      sh.vertexShader = 'varying vec3 vWPos;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = `varying vec3 vWPos;
        float hsh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vnz(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hsh(i), hsh(i + vec2(1.0, 0.0)), f.x), mix(hsh(i + vec2(0.0, 1.0)), hsh(i + vec2(1.0, 1.0)), f.x), f.y); }
        ` + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
          vec2 tp = vWPos.xz + vWPos.y * 0.37;
          float dn = vnz(tp * 0.8) * 0.16 + vnz(tp * 3.1 + 17.0) * 0.1 + vnz(tp * 9.0) * 0.06 + (vnz(tp * 0.11) - 0.5) * 0.14;
          diffuseColor.rgb *= 0.84 + dn;`);
    };

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

  heightAt(x, z) { return this.roads.adjustHeight(x, z, this.towns.adjustHeight(x, z, this.rawHeight(x, z))); }

  rawHeight(x, z) {
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
    const townSurf = this.towns.surfaceAt(wx, wz);
    const roadDist = this.roads.onRoad(wx, wz);
    const inTown = townSurf > 0 || !!this.towns.near(wx, wz, 12) || roadDist < 8;
    const clayZone = !inTown && h < WATER + 5 && this.noise.noise2(wx * 0.04 + 77, wz * 0.04 - 33) > -0.1;
    if (clayZone && h < WATER + 0.3) top = MAT.CLAY;               // clay lake beds
    let sub = clayZone && top !== MAT.SNOW ? MAT.CLAY
      : top === MAT.SAND ? MAT.SAND : top === MAT.SNOW ? MAT.STONE : MAT.DIRT;
    if (townSurf) { top = townSurf === 2 ? MAT.ROAD : MAT.GRASS; sub = MAT.DIRT; }
    else if (roadDist < ROAD_HALF) { top = MAT.PATH; sub = MAT.DIRT; }
    else if (roadDist < ROAD_HALF + 3 && top === MAT.SAND) top = MAT.GRASS;
    const cn = this.caveNoise, on = this.oreNoise, on2 = this.oreNoise2;
    for (let y = 0; y <= H; y++) {
      let d, m;
      if (y <= 1) { d = 6; m = MAT.BEDROCK; }
      else {
        d = h - y;
        if (d > 3 && y > WATER + 1 && !inTown) {
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
      mesh: null, trees: [], bushes: [], rocks: [], treeMeshes: [], grassMeshes: [], dirty: true, meshed: false,
    };
    const x0 = cx * CS, z0 = cz * CS;
    for (let lx = 0; lx < CS; lx++)
      for (let lz = 0; lz < CS; lz++)
        this.fillColumn(c.dens, c.mats, idx(lx, 0, lz), x0 + lx, z0 + lz);
    for (const op of this.ops) if (this.opTouches(c, op)) this.applyOp(c, op, null);
    this.chunks.set(ckey(cx, cz), c);
    this.placeTrees(c);
    this.placeBushes(c);
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
    for (let i = 0; i < 24; i++) {
      const r1 = rng(), r2 = rng(), r3 = rng(), r4 = rng(), r5 = rng(), r6 = rng();
      const x = x0 + r1 * CS, z = z0 + r2 * CS;
      const forest = this.forestAt(x, z);
      const p = Math.min(0.92, Math.max(0.05, 0.24 + forest * 2.0));
      if (r3 > p) continue;
      const h = this.heightAt(x, z);
      if (h < WATER + 1.8 || h > 55) continue;
      if (this.towns.near(x, z, 6) || this.roads.onRoad(x, z) < ROAD_HALF + 2.5) continue;
      const sx = this.heightAt(x + 1, z) - this.heightAt(x - 1, z);
      const sz = this.heightAt(x, z + 1) - this.heightAt(x, z - 1);
      if (sx * sx + sz * sz > 1.4) continue;
      const id = `${c.cx},${c.cz},${i}`;
      if (this.removedTrees.has(id)) continue;
      if (this.sample(x, h - 0.6, z) <= 0 || this.sample(x, h + 1.5, z) > 0) continue;
      const pine = h > 40 || r4 < 0.18;
      const birch = !pine && r4 > 0.8;
      c.trees.push({
        id, x, y: h, z, pine, birch, alive: true, refs: [],
        th: pine ? 1.6 + r5 * 1.2 : birch ? 3.2 + r5 * 1.8 : 2.4 + r5 * 1.6,
        s: (birch ? 1.2 : 1.5) + r6 * 0.9, snowy: h > 44, rot: r4 * Math.PI * 2,
      });
    }
  }

  // Wild bushes (some with berries) and rocks.
  placeBushes(c) {
    const rng = makeRng((Math.imul(c.cx, 2654435761) ^ Math.imul(c.cz, 40503) ^ this.seed ^ 0xb055) >>> 0);
    const x0 = c.cx * CS, z0 = c.cz * CS;
    for (let i = 0; i < 26; i++) {
      const r1 = rng(), r2 = rng(), r3 = rng(), r4 = rng(), r5 = rng();
      const x = x0 + r1 * CS, z = z0 + r2 * CS;
      const forest = this.forestAt(x, z);
      const rock = r4 < 0.16;
      if (r3 > (rock ? 0.6 : 0.3 + Math.max(0, forest) * 0.8)) continue;
      const h = this.heightAt(x, z);
      if (h < WATER + 1 || h > (rock ? 62 : 50)) continue;
      if (this.towns.near(x, z, 4) || this.roads.onRoad(x, z) < ROAD_HALF + 1.5) continue;
      if (this.sample(x, h - 0.4, z) <= 0 || this.sample(x, h + 1.0, z) > 0) continue;
      const id = `${c.cx},${c.cz},${i}`;
      if (rock) c.rocks.push({ x, y: h, z, s: 0.5 + r5 * 1.3, rot: r2 * 6.28 });
      else c.bushes.push({ id, x, y: h, z, s: 0.6 + r5 * 0.7, rot: r1 * 6.28, berry: r5 < 0.35 && h < 44, blue: r2 < 0.4, refs: [] });
    }
  }

  buildTrees(c) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    const col = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
    const add = (mesh, kind, list) => {
      mesh.userData = { kind, trees: list, bushes: list };
      mesh.computeBoundingSphere();
      this.scene.add(mesh);
      c.treeMeshes.push(mesh);
    };
    if (c.trees.length) {
      const trunks = new THREE.InstancedMesh(GEO.trunk, MATS.bark, c.trees.length);
      c.trees.forEach((t, i) => {
        q.setFromAxisAngle(up, t.rot);
        const girth = t.birch ? 0.75 : t.pine ? 0.9 : 1 + (t.s - 1.5) * 0.4;
        m.compose(p.set(t.x, t.y - 0.4, t.z), q, s.set(girth, t.th + (t.pine ? 0.6 : 0.9), girth));
        trunks.setMatrixAt(i, m);
        trunks.setColorAt(i, t.birch ? col.setHex(0xe2ddd0) : col.setHex(t.pine ? 0x4e3a2a : 0x5e4630));
        t.refs.push([trunks, i]);
      });
      add(trunks, 'tree', c.trees);
      for (const kind of ['oak', 'birch', 'pine']) {
        const list = c.trees.filter((t) => (kind === 'pine' ? t.pine : kind === 'birch' ? t.birch : !t.pine && !t.birch));
        if (!list.length) continue;
        const im = new THREE.InstancedMesh(GEO[kind], MATS.leaves, list.length);
        list.forEach((t, i) => {
          q.setFromAxisAngle(up, t.rot);
          if (kind === 'pine') {
            m.compose(p.set(t.x, t.y + t.th * 0.45, t.z), q, s.set(t.s * 0.95, t.s * 1.35, t.s * 0.95));
            im.setColorAt(i, t.snowy ? col.setHSL(0.42, 0.12, 0.66) : col.setHSL(0.36, 0.45, 0.2 + (t.rot % 0.3) * 0.1));
          } else if (kind === 'birch') {
            m.compose(p.set(t.x, t.y + t.th * 0.8, t.z), q, s.set(t.s, t.s * 1.05, t.s));
            im.setColorAt(i, col.setHSL(0.2 + (t.rot % 0.4) * 0.05, 0.55, 0.42));
          } else {
            m.compose(p.set(t.x, t.y + t.th + t.s * 0.45, t.z), q, s.set(t.s * 1.15, t.s, t.s * 1.15));
            im.setColorAt(i, col.setHSL(0.25 + (t.rot % 1) * 0.05, 0.5, 0.27 + (t.s - 1.5) * 0.06));
          }
          im.setMatrixAt(i, m);
          t.refs.push([im, i]);
        });
        add(im, 'tree', list);
      }
    }
    if (c.bushes.length) {
      const im = new THREE.InstancedMesh(GEO.bush, MATS.bush, c.bushes.length);
      const berries = c.bushes.filter((b) => b.berry);
      const bm = berries.length ? new THREE.InstancedMesh(GEO.berries, MATS.berries, berries.length) : null;
      c.bushes.forEach((b, i) => {
        q.setFromAxisAngle(up, b.rot);
        m.compose(p.set(b.x, b.y + b.s * 0.35, b.z), q, s.set(b.s, b.s * 0.85, b.s));
        im.setMatrixAt(i, m);
        im.setColorAt(i, col.setHSL(0.26 + (b.rot % 1) * 0.06, 0.45, 0.26 + b.s * 0.05));
        b.refs.push([im, i]);
        if (b.berry) {
          const k = berries.indexOf(b);
          const pickedDay = this.picked.get(b.id);
          b.ripe = pickedDay === undefined || this.day - pickedDay > 1.5;
          bm.setMatrixAt(k, b.ripe ? m : ZERO);
          bm.setColorAt(k, col.setHex(b.blue ? 0x3a3a9a : 0xc8202a));
          b.berryRef = [bm, k];
          b.refs.push([bm, k]);
        }
      });
      add(im, 'bush', c.bushes);
      if (bm) add(bm, 'bush', berries);
    }
    if (c.rocks.length) {
      const im = new THREE.InstancedMesh(GEO.rock, MATS.rock, c.rocks.length);
      c.rocks.forEach((r, i) => {
        q.setFromAxisAngle(up, r.rot);
        m.compose(p.set(r.x, r.y - r.s * 0.1, r.z), q, s.set(r.s, r.s, r.s * 0.8));
        im.setMatrixAt(i, m);
        im.setColorAt(i, col.setHSL(0.08, 0.04, 0.42 + (r.rot % 1) * 0.12));
      });
      im.computeBoundingSphere();
      this.scene.add(im);
      c.treeMeshes.push(im);
      im.userData.kind = 'rock';
    }
  }

  // Pick a bush's berries. Returns how many were gathered.
  pickBerries(b) {
    if (!b.berry || !b.ripe) return 0;
    b.ripe = false;
    this.picked.set(b.id, this.day);
    const [mesh, i] = b.berryRef;
    mesh.setMatrixAt(i, ZERO);
    mesh.instanceMatrix.needsUpdate = true;
    return 3 + Math.floor(b.s * 2);
  }

  setGrass(c, on) {
    for (const g of c.grassMeshes) { this.scene.remove(g); g.dispose(); }
    c.grassMeshes = [];
    if (on) { c.grassMeshes = buildGrass(this, c); for (const g of c.grassMeshes) this.scene.add(g); }
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
    if (c.grassMeshes.length || c.wantGrass) this.setGrass(c, true);
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
    for (const g of c.grassMeshes) { this.scene.remove(g); g.dispose(); }
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
    // Grass only near the player; build at most one patch per frame.
    let built = 0;
    for (const c of this.chunks.values()) {
      const near = Math.max(Math.abs(c.cx - pcx), Math.abs(c.cz - pcz)) <= 2;
      c.wantGrass = near;
      if (near && c.mesh && !c.grassMeshes.length && !c.noGrass && built < 1) { this.setGrass(c, true); built++; if (!c.grassMeshes.length) c.noGrass = true; }
      else if (!near && c.grassMeshes.length) this.setGrass(c, false);
    }
  }

  isReadyAt(x, z) {
    const c = this.getChunk(Math.floor(x / CS), Math.floor(z / CS));
    return !!(c && c.meshed);
  }
}
