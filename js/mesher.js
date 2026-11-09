// Surface-nets mesher: turns a chunk's density field into a smooth mesh.
import * as THREE from 'three';
import { CS, H, SY, MAT, MAT_INFO, idx, ckey } from './constants.js';
import { hash3 } from './noise.js';

const P = CS + 2;                    // padded samples per axis (local -1 .. CS)
const NC = CS + 1;                   // cells per axis (local -1 .. CS-1)
const pad = new Float32Array(P * P * SY);
const padM = new Uint8Array(P * P * SY);
const vidx = new Int32Array(NC * NC * H);
const pi = (x, y, z) => (x * P + z) * SY + y;
const ci = (x, y, z) => (x * NC + z) * H + y;

// Corner i: bit0 = x, bit1 = y, bit2 = z.
const CX = [], CY = [], CZ = [], OFF = [];
for (let i = 0; i < 8; i++) {
  CX.push(i & 1); CY.push((i >> 1) & 1); CZ.push((i >> 2) & 1);
  OFF.push(((i & 1) * P + ((i >> 2) & 1)) * SY + ((i >> 1) & 1));
}
const EDGES = [];
for (let i = 0; i < 8; i++) for (const bit of [1, 2, 4]) if (!(i & bit)) EDGES.push(i, i | bit);

const palette = MAT_INFO.map((m) => new THREE.Color(m ? m.color : 0));
const grassDry = new THREE.Color(0xa3b354);
const grassLush = new THREE.Color(0x4f9a45);
const tmp = new THREE.Color();
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function buildChunkGeometry(world, chunk) {
  const x0 = chunk.cx * CS, z0 = chunk.cz * CS;

  // Gather padded densities (including one sample from each neighbour).
  for (let px = 0; px < P; px++) {
    for (let pz = 0; pz < P; pz++) {
      const wx = x0 + px - 1, wz = z0 + pz - 1;
      const c = world.chunks.get(ckey(wx >> 5, wz >> 5));
      const dst = pi(px, 0, pz);
      if (c) {
        const base = idx(wx & 31, 0, wz & 31);
        pad.set(c.dens.subarray(base, base + SY), dst);
        padM.set(c.mats.subarray(base, base + SY), dst);
      } else {
        const col = world.rawColumn(wx, wz);
        pad.set(col.dens, dst);
        padM.set(col.mats, dst);
      }
    }
  }

  vidx.fill(-1);
  const pos = [], nor = [], col = [], ind = [];
  const d = new Float32Array(8);
  let vc = 0;

  for (let x = 0; x < NC; x++) {
    for (let z = 0; z < NC; z++) {
      for (let y = 0; y < H; y++) {
        const base = pi(x, y, z);
        let mask = 0;
        for (let i = 0; i < 8; i++) {
          const v = pad[base + OFF[i]];
          d[i] = v;
          if (v > 0) mask |= 1 << i;
        }
        if (mask === 0 || mask === 255) continue;

        let sx = 0, sy = 0, sz = 0, n = 0;
        for (let e = 0; e < 24; e += 2) {
          const a = EDGES[e], b = EDGES[e + 1];
          const da = d[a], db = d[b];
          if ((da > 0) !== (db > 0)) {
            const t = da / (da - db);
            sx += CX[a] + t * (CX[b] - CX[a]);
            sy += CY[a] + t * (CY[b] - CY[a]);
            sz += CZ[a] + t * (CZ[b] - CZ[a]);
            n++;
          }
        }
        const vx = x - 1 + sx / n, vy = y + sy / n, vz = z - 1 + sz / n;

        const gx = (d[1] - d[0]) + (d[3] - d[2]) + (d[5] - d[4]) + (d[7] - d[6]);
        const gy = (d[2] - d[0]) + (d[3] - d[1]) + (d[6] - d[4]) + (d[7] - d[5]);
        const gz = (d[4] - d[0]) + (d[5] - d[1]) + (d[6] - d[2]) + (d[7] - d[3]);
        const gl = Math.hypot(gx, gy, gz);
        let nx = 0, ny = 1, nz = 0;
        if (gl > 1e-6) { nx = -gx / gl; ny = -gy / gl; nz = -gz / gl; }

        let best = 0;
        for (let i = 1; i < 8; i++) if (d[i] > d[best]) best = i;
        const m = padM[base + OFF[best]];

        const wx = x0 + vx, wz = z0 + vz;
        tmp.copy(palette[m] || palette[MAT.STONE]);
        if (m === MAT.GRASS) {
          const meadow = world.noise.noise2(wx * 0.025 + 300, wz * 0.025);
          if (meadow > 0) tmp.lerp(grassDry, clamp01(meadow * 1.2));
          else tmp.lerp(grassLush, clamp01(-meadow * 1.2));
          if (ny < 0.75) tmp.lerp(palette[MAT.DIRT], clamp01((0.75 - ny) / 0.2));
          if (ny < 0.5) tmp.lerp(palette[MAT.STONE], clamp01((0.5 - ny) / 0.2));
        } else if (m === MAT.SNOW && ny < 0.6) {
          tmp.lerp(palette[MAT.STONE], clamp01((0.6 - ny) / 0.25));
        }
        const j = 0.93 + 0.14 * hash3(Math.floor(wx * 1.5), Math.floor(vy * 1.5), Math.floor(wz * 1.5));
        tmp.multiplyScalar(j);

        pos.push(vx, vy, vz);
        nor.push(nx, ny, nz);
        col.push(tmp.r, tmp.g, tmp.b);
        vidx[ci(x, y, z)] = vc++;
      }
    }
  }
  if (vc === 0) return null;

  const quad = (a, b, c, e, flip) => {
    if (a < 0 || b < 0 || c < 0 || e < 0) return;
    if (flip) ind.push(a, e, c, a, c, b);
    else ind.push(a, b, c, a, c, e);
  };

  // Emit one quad per sign-changing edge owned by this chunk.
  for (let px = 1; px <= CS; px++) {
    for (let pz = 1; pz <= CS; pz++) {
      for (let y = 0; y <= H; y++) {
        const s0 = pad[pi(px, y, pz)] > 0;
        if (y >= 1 && y <= H - 1) {
          if ((pad[pi(px + 1, y, pz)] > 0) !== s0) {
            quad(vidx[ci(px, y - 1, pz - 1)], vidx[ci(px, y, pz - 1)],
                 vidx[ci(px, y, pz)], vidx[ci(px, y - 1, pz)], !s0);
          }
          if ((pad[pi(px, y, pz + 1)] > 0) !== s0) {
            quad(vidx[ci(px - 1, y - 1, pz)], vidx[ci(px, y - 1, pz)],
                 vidx[ci(px, y, pz)], vidx[ci(px - 1, y, pz)], !s0);
          }
        }
        if (y <= H - 1 && (pad[pi(px, y + 1, pz)] > 0) !== s0) {
          quad(vidx[ci(px - 1, y, pz - 1)], vidx[ci(px - 1, y, pz)],
               vidx[ci(px, y, pz)], vidx[ci(px, y, pz - 1)], !s0);
        }
      }
    }
  }
  if (ind.length === 0) return null;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(vc > 65535 ? new THREE.Uint32BufferAttribute(ind, 1) : new THREE.Uint16BufferAttribute(ind, 1));
  geo.computeBoundingSphere();
  return geo;
}
