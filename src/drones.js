// Drones of every size: solo/duo air taxis and ship-sized passenger ferries flying the
// avenue grid, plus enforcer drones that patrol the streets scanning citizens.
// Some spawn ambiently around the player; others are deployed with the Drone tool.
import * as THREE from 'three';
import { Parts } from './geom.js';
import { MAT } from './materials.js';
import { TILE, DIRS, tileCenter } from './config.js';
import { Walker, respawnWalkers } from './traffic.js';

const AV = TILE * 12; // main avenues run every 12 tiles
const PI = Math.PI;
const UP = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
const AMBIENT = { taxi1: 22, taxi2: 18, ferry: 6, enforcer: 20 };
const HULL_COLORS = [0xd0d4de, 0x20202a, 0xe0b830, 0xb02040, 0x2a6aa0, 0x1a8a6a, 0x8a3ab0, 0xe86a20];

// One InstancedMesh per material of a merged model.
class InstancedModel {
  constructor(scene, parts, max, tintKey) {
    this.meshes = [];
    for (const [k, g] of parts) {
      const im = new THREE.InstancedMesh(g, MAT[k], max);
      im.frustumCulled = false;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.count = 0;
      scene.add(im);
      this.meshes.push(im);
      if (k === tintKey) this.tint = im;
    }
    this.n = 0;
    this.max = max;
  }
  begin() { this.n = 0; }
  add(matrix, color) {
    if (this.n >= this.max) return;
    for (const im of this.meshes) im.setMatrixAt(this.n, matrix);
    if (color && this.tint) this.tint.setColorAt(this.n, color);
    this.n++;
  }
  end() {
    for (const im of this.meshes) {
      im.count = this.n;
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }
}

function rotors(P, pts, r, y) {
  for (const [x, z] of pts) {
    P.box('metal', 0.08, 0.08, 0.08, x, y - 0.1, z, 0, false);
    const d = new THREE.CircleGeometry(r, 16);
    d.rotateX(-PI / 2);
    P.geo('rotor', d, x, y, z);
    const t = new THREE.TorusGeometry(r, 0.05, 4, 20);
    t.rotateX(PI / 2);
    P.geo('metal', t, x, y, z);
  }
}

function taxiModel(seats) {
  const P = new Parts();
  const w = seats === 1 ? 1.3 : 2.2;
  P.box('hullWhite', w, 0.7, 2.8, 0, 0, 0, 0, false);
  P.box('hullWhite', w * 0.8, 0.4, 0.8, 0, -0.05, 1.6, 0, false);
  const can = new THREE.SphereGeometry(1, 14, 8, 0, PI * 2, 0, PI / 2);
  can.scale(w * 0.46, 0.75, 1.1);
  P.geo('canopy', can, 0, 0.35, 0.2);
  for (let s = 0; s < seats; s++) {
    const x = seats === 1 ? 0 : (s - 0.5) * 0.9;
    P.geo('cable', new THREE.SphereGeometry(0.17, 8, 6), x, 0.62, 0.1);
    P.box('cable', 0.36, 0.3, 0.25, x, 0.36, 0.05, 0, false);
    P.box('neon_cyan', 0.24, 0.04, 0.03, x, 0.64, 0.26, 0, false); // pilot's optic visor
  }
  const ax = w / 2 + 0.7;
  for (const [x, z] of [[-ax, -1], [ax, -1], [-ax, 1], [ax, 1]]) P.box('metal', Math.abs(x) - w / 2 + 0.1, 0.08, 0.12, Math.sign(x) * (w / 2 + (Math.abs(x) - w / 2) / 2), 0.15, z, 0, false);
  rotors(P, [[-ax, -1], [ax, -1], [-ax, 1], [ax, 1]], 0.62, 0.25);
  P.box('neon_white', w * 0.7, 0.07, 0.04, 0, 0, 2.02, 0, false);
  P.box('neon_red', w * 0.8, 0.07, 0.04, 0, 0.1, -1.42, 0, false);
  P.box('neon_magenta', w + 0.02, 0.04, 2.4, 0, -0.33, 0, 0, false);
  return P.merge();
}

function ferryModel() {
  const P = new Parts();
  P.box('hull', 7, 4.2, 26, 0, 0, 0, 0, false);
  const nose = new THREE.CylinderGeometry(0, 3.6, 7, 4, 1);
  nose.rotateY(PI / 4); nose.rotateX(PI / 2); nose.scale(1.36, 0.82, 1);
  P.geo('hull', nose, 0, 0, 16.4);
  P.box('hull', 5.4, 2, 17, 0, 3, -1, 0, false);
  // two decks of passenger windows on both sides
  for (const sx of [-1, 1]) {
    for (const [y, len, z] of [[0.6, 22, 0], [3.1, 15, -1]]) {
      const g = new THREE.PlaneGeometry(len, 1.3);
      const uv = g.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setX(k, uv.getX(k) * (len / 12));
      g.rotateY(sx * PI / 2);
      P.geo('ferryWin', g, sx * ((y > 2 ? 2.7 : 3.5) + 0.03), y, z);
    }
    P.box('neon_cyan', 0.06, 0.1, 22, sx * 3.53, -0.4, 0, 0, false);
    P.plane('ad' + (sx > 0 ? 2 : 5), 9, 2.6, sx * 3.54, -1.3, -6, sx * PI / 2);
  }
  P.box('neon_amber', 6, 0.1, 0.1, 0, 2.15, 12.9, 0, false);
  // four big ducted fans
  for (const [x, z] of [[-5.6, -9], [5.6, -9], [-5.6, 9], [5.6, 9]]) {
    P.box('hull', 2.4, 0.5, 1, Math.sign(x) * 4.2, 0.5, z, 0, false);
    const duct = new THREE.CylinderGeometry(2.4, 2.4, 1.1, 20, 1, true);
    P.geo('metal', duct, x, 0.6, z);
    const d = new THREE.CircleGeometry(2.3, 20);
    d.rotateX(-PI / 2);
    P.geo('rotor', d, x, 0.6, z);
    const ring = new THREE.TorusGeometry(2.4, 0.08, 4, 24);
    ring.rotateX(PI / 2);
    P.geo('neon_cyan', ring, x, 0.05, z);
  }
  P.box('blinkA', 0.5, 0.5, 0.5, -3.6, 2.3, 10, 0, false);
  P.box('neon_green', 0.5, 0.5, 0.5, 3.6, 2.3, 10, 0, false);
  P.box('neon_white', 2.8, 0.25, 0.1, 0, 0.6, 19.7, 0, false);
  P.box('neon_red', 6.4, 0.2, 0.1, 0, 0, -13.05, 0, false);
  return P.merge();
}

function enforcerModel() {
  const P = new Parts();
  P.box('hull', 1.6, 0.55, 2, 0, 0, 0, 0, false);
  P.box('hullWhite', 1.7, 0.18, 1.2, 0, 0.32, -0.1, 0, false);
  P.geo('neon_red', new THREE.SphereGeometry(0.2, 10, 8), 0, -0.25, 0.95); // the scanning eye
  P.box('metal', 0.3, 0.3, 0.6, -0.5, -0.4, 0.4, 0, false);
  P.box('metal', 0.3, 0.3, 0.6, 0.5, -0.4, 0.4, 0, false);
  rotors(P, [[-1.4, -1.1], [1.4, -1.1], [-1.4, 1.1], [1.4, 1.1]], 0.6, 0.15);
  for (const [x, z] of [[-1.4, -1.1], [1.4, -1.1], [-1.4, 1.1], [1.4, 1.1]]) P.box('metal', Math.abs(x) - 0.7, 0.08, 0.12, Math.sign(x) * (0.35 + (Math.abs(x) - 0.7) / 2), 0.1, z, 0, false);
  P.box('paint', 1.62, 0.12, 0.02, 0, 0, 1.01, 0, false);
  return P.merge();
}

// Flies the avenue grid from intersection to intersection, staying near a home if it has one.
class GridFlyer {
  constructor(type, alt, speed, home = null) {
    this.type = type; this.alt = alt; this.speed = speed; this.home = home;
    this.pos = new THREE.Vector3(); this.heading = 0; this.alive = false; this.phase = Math.random() * 10;
    this.color = new THREE.Color(HULL_COLORS[Math.floor(Math.random() * HULL_COLORS.length)]);
  }
  spawnNear(x, z) {
    this.ax = Math.round(x / AV); this.az = Math.round(z / AV);
    this.dir = Math.floor(Math.random() * 4);
    this.t = Math.random();
    this.alive = true;
    this.point(this.pos);
    this.heading = Math.atan2(DIRS[this.dir][0], DIRS[this.dir][1]);
  }
  point(out) {
    const [dx, dz] = DIRS[this.dir];
    const lane = this.type === 'ferry' ? 7 : 3.5;
    const x = (this.ax + dx * this.t) * AV + TILE / 2 + -dz * lane;
    const z = (this.az + dz * this.t) * AV + TILE / 2 + dx * lane;
    return out.set(x, this.alt, z);
  }
  choose() {
    const back = (this.dir + 2) % 4;
    let opts = [0, 1, 2, 3].filter((d) => d !== back);
    if (this.home) {
      const hx = Math.round(this.home.x / AV), hz = Math.round(this.home.z / AV);
      if (Math.abs(this.ax - hx) + Math.abs(this.az - hz) > 2) {
        opts.sort((a, b) => (Math.abs(this.ax + DIRS[a][0] - hx) + Math.abs(this.az + DIRS[a][1] - hz)) - (Math.abs(this.ax + DIRS[b][0] - hx) + Math.abs(this.az + DIRS[b][1] - hz)));
        this.dir = opts[0];
        return;
      }
    }
    this.dir = Math.random() < 0.55 ? this.dir : opts[Math.floor(Math.random() * opts.length)];
  }
  update(dt) {
    this.t += (this.speed * dt) / AV;
    while (this.t >= 1) {
      this.t -= 1;
      this.ax += DIRS[this.dir][0]; this.az += DIRS[this.dir][1];
      this.choose();
    }
    const tgt = this.point(_p);
    this.pos.lerp(tgt, 1 - Math.exp(-dt * 3));
    const want = Math.atan2(DIRS[this.dir][0], DIRS[this.dir][1]);
    let d = want - this.heading;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.heading += d * Math.min(1, dt * 2);
    this.bank = -d * 0.5;
  }
}

// Enforcer: road-following patrol that returns toward its post when it strays.
class PatrolWalker extends Walker {
  choose() {
    if (this.home) {
      const p = tileCenter(this.i, this.j);
      if (Math.hypot(p.x - this.home.x, p.z - this.home.z) > 110) {
        const back = (this.dir + 2) % 4;
        let best = -1, bd = Infinity;
        DIRS.forEach(([dx, dz], d) => {
          if (!this.city.isRoad(this.i + dx, this.j + dz)) return;
          const q = tileCenter(this.i + dx, this.j + dz);
          const dist = Math.hypot(q.x - this.home.x, q.z - this.home.z) + (d === back ? 30 : 0);
          if (dist < bd) { bd = dist; best = d; }
        });
        if (best >= 0) { this.dir = best; return true; }
      }
    }
    return super.choose();
  }
}

export class Drones {
  constructor(scene, city) {
    this.city = city;
    this.models = {
      taxi1: new InstancedModel(scene, taxiModel(1), 80, 'hullWhite'),
      taxi2: new InstancedModel(scene, taxiModel(2), 70, 'hullWhite'),
      ferry: new InstancedModel(scene, ferryModel(), 24, null),
      enforcer: new InstancedModel(scene, enforcerModel(), 60, null),
    };
    // enforcer extras: red/blue lightbar, searchlight cone, sweeping laser scan fan
    this.siren = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.12, 0.25).translate(0, 0.45, -0.1), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), 60);
    const cone = new THREE.ConeGeometry(4.5, 22, 20, 1, true).translate(0, -11, 0);
    const beamMat = MAT.beam.clone();
    beamMat.opacity = 0.07;
    beamMat.color = new THREE.Color(0x9fc4ff).multiplyScalar(0.6);
    this.beam = new THREE.InstancedMesh(cone, beamMat, 60);
    const fan = new THREE.BufferGeometry();
    fan.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -0.28, -1, 0, 0.28, -1, 0], 3));
    fan.computeVertexNormals();
    this.fan = new THREE.InstancedMesh(fan, MAT.scanFan, 60);
    for (const m of [this.siren, this.beam, this.fan]) { m.frustumCulled = false; m.count = 0; scene.add(m); }

    this.ambient = [];
    for (const [type, n] of Object.entries(AMBIENT)) {
      for (let k = 0; k < n; k++) this.ambient.push(this.make(type, null));
    }
    this.placed = new Map(); // placed-drone def -> agent
    this.timer = 0;
    this.scanCd = 0;
    this.onScan = null;
  }

  make(type, home) {
    if (type === 'enforcer') {
      const w = new PatrolWalker(this.city, 0, 5 + Math.random() * 3, 1.2, 3);
      w.type = type; w.home = home; w.alt = 17 + Math.random() * 9; w.phase = Math.random() * 10;
      return w;
    }
    const alt = type === 'ferry' ? 95 + Math.random() * 45 : 24 + Math.random() * 34;
    const speed = type === 'ferry' ? 16 + Math.random() * 6 : 20 + Math.random() * 18;
    return new GridFlyer(type, alt, speed, home);
  }

  spawnAgent(a, focus) {
    const c = a.home || focus;
    if (a.type === 'enforcer') {
      const fi = Math.floor(c.x / TILE), fj = Math.floor(c.z / TILE);
      for (let r = 0; r < 12; r++) for (let k = 0; k < 8; k++) {
        const i = fi + Math.round((Math.random() * 2 - 1) * r), j = fj + Math.round((Math.random() * 2 - 1) * r);
        if (this.city.isRoad(i, j)) { a.spawn(i, j); if (a.alive) return; }
      }
    } else {
      const R = a.home ? 150 : 400;
      a.spawnNear(c.x + (Math.random() * 2 - 1) * R, c.z + (Math.random() * 2 - 1) * R);
    }
  }

  update(dt, t, focus, player) {
    // sync deployed drones with the city's list
    const defs = new Set(this.city.placedDrones);
    for (const [def, a] of this.placed) if (!defs.has(def)) this.placed.delete(def);
    for (const def of defs) {
      if (this.placed.has(def)) continue;
      const home = tileCenter(def.i, def.j);
      const a = this.make(def.type, home);
      a.placed = true;
      this.placed.set(def, a);
    }
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 1;
      for (const a of this.ambient) {
        if (a.alive && Math.hypot(a.pos.x - focus.x, a.pos.z - focus.z) > (a.type === 'enforcer' ? 280 : 650)) a.alive = false;
        if (!a.alive) this.spawnAgent(a, focus);
      }
      for (const a of this.placed.values()) if (!a.alive) this.spawnAgent(a, focus);
    }

    for (const m of Object.values(this.models)) m.begin();
    let e = 0;
    const col = new THREE.Color();
    this.scanCd = Math.max(0, this.scanCd - dt);
    const all = [...this.ambient, ...this.placed.values()];
    for (const a of all) {
      if (!a.alive) continue;
      if (Math.hypot(a.pos.x - focus.x, a.pos.z - focus.z) > 900) continue; // far deployed drones idle
      a.update(dt);
      if (!a.alive) continue;
      if (a.type === 'enforcer') {
        const y = a.alt + Math.sin(t * 0.8 + a.phase) * 1.2;
        _p.set(a.pos.x, y, a.pos.z);
        _q.setFromAxisAngle(UP, a.heading);
        _m.compose(_p, _q, _s.set(1, 1, 1));
        this.models.enforcer.add(_m);
        this.siren.setMatrixAt(e, _m);
        this.siren.setColorAt(e, Math.sin(t * 9 + a.phase) > 0 ? col.setRGB(4, 0.2, 0.3) : col.setRGB(0.3, 0.8, 4));
        _q.setFromEuler(new THREE.Euler(Math.sin(t * 0.9 + a.phase) * 0.35, a.heading, Math.cos(t * 0.7 + a.phase) * 0.35, 'YXZ'));
        _m.compose(_p, _q, _s.set(1, 1, 1));
        this.beam.setMatrixAt(e, _m);
        // laser fan sweeps side to side under the drone
        _q.setFromAxisAngle(UP, a.heading + PI / 2 + Math.sin(t * 1.7 + a.phase) * 0.9);
        _m.compose(_p.set(a.pos.x, y - 0.3, a.pos.z), _q, _s.set(y, y, 1));
        this.fan.setMatrixAt(e, _m);
        e++;
        if (player && this.scanCd <= 0 && Math.hypot(player.x - a.pos.x, player.z - a.pos.z) < 6) {
          this.scanCd = 8;
          this.onScan?.(a);
        }
      } else {
        _p.set(a.pos.x, a.pos.y + Math.sin(t * 1.1 + a.phase) * (a.type === 'ferry' ? 0.8 : 0.4), a.pos.z);
        _q.setFromEuler(new THREE.Euler(0, a.heading, a.bank || 0, 'YXZ'));
        _m.compose(_p, _q, _s.set(1, 1, 1));
        this.models[a.type].add(_m, a.color);
      }
    }
    for (const m of Object.values(this.models)) m.end();
    for (const m of [this.siren, this.beam, this.fan]) {
      m.count = e;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }

  // Deployed-drone anchors, for the build-mode holo markers.
  anchors() { return this.city.placedDrones; }
}
