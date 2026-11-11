// Drones of every size: solo/duo air taxis and ship-sized passenger ferries flying the
// avenue grid, plus enforcer drones that patrol the streets scanning citizens.
// Some spawn ambiently around the player; others are deployed with the Drone tool.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Parts } from './geom.js';
import { MAT } from './materials.js';
import { TILE, DIRS, tileCenter } from './config.js';
import { Walker, respawnWalkers } from './traffic.js';

const AV = TILE * 12; // main avenues run every 12 tiles
const PI = Math.PI;
const UP = new THREE.Vector3(0, 1, 0);
const _m2 = new THREE.Matrix4(), _m3 = new THREE.Matrix4(), _e = new THREE.Euler();
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

// Rotor positions per model [x, y, z, radius]: the blades are drawn separately so they spin.
const ROTORS = {};
const ell = (rx, ry, rz, w = 16, h = 10) => new THREE.SphereGeometry(1, w, h).scale(rx, ry, rz);
// strut between two points
function strut(P, key, x0, y0, z0, x1, y1, z1, rad) {
  const a = new THREE.Vector3(x0, y0, z0), b = new THREE.Vector3(x1, y1, z1);
  const g = new THREE.CylinderGeometry(rad, rad, a.distanceTo(b), 6);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, b.clone().sub(a).normalize()));
  P.geo(key, g, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
}
// ducted fan: shroud ring, hub, faint blur disc
function duct(P, x, y, z, r, glow) {
  const ring = new THREE.TorusGeometry(r, r * 0.09, 6, 22);
  ring.rotateX(PI / 2);
  P.geo('metal', ring, x, y, z);
  if (glow) {
    const under = new THREE.TorusGeometry(r, r * 0.03, 4, 22);
    under.rotateX(PI / 2);
    P.geo(glow, under, x, y - r * 0.1, z);
  }
  P.geo('metal', ell(r * 0.14, r * 0.12, r * 0.14, 8, 6), x, y, z);
  const d = new THREE.CircleGeometry(r * 0.95, 18);
  d.rotateX(-PI / 2);
  P.geo('rotor', d, x, y + 0.01, z);
}

function taxiModel(seats) {
  const P = new Parts();
  const w = seats === 1 ? 1.25 : 2.0;
  // teardrop pod with a tapering tail boom and fin
  P.geo('hullWhite', ell(w / 2 + 0.12, 0.5, 1.65), 0, 0, 0);
  const boom = new THREE.CylinderGeometry(0.05, 0.3, 1.5, 8);
  boom.rotateX(-PI / 2);
  P.geo('hullWhite', boom, 0, 0.1, -2.0);
  const fin = new THREE.CylinderGeometry(0.02, 0.28, 0.6, 4);
  fin.scale(0.2, 1, 1);
  P.geo('hullWhite', fin, 0, 0.42, -2.6);
  P.geo('canopy', ell(w * 0.43, 0.5, 1.0, 14, 8), 0, 0.2, 0.5);
  for (let k = 0; k < seats; k++) {
    const x = seats === 1 ? 0 : (k - 0.5) * 0.8;
    P.geo('cable', ell(0.15, 0.17, 0.16, 8, 6), x, 0.44, 0.45);
    P.geo('cable', ell(0.2, 0.2, 0.14, 8, 6), x, 0.14, 0.4);
    const visor = new THREE.CylinderGeometry(0.15, 0.15, 0.04, 8, 1, true, -0.9, 1.8);
    P.geo('neon_cyan', visor, x, 0.46, 0.46);
  }
  const ax = w / 2 + 0.95;
  ROTORS['taxi' + seats] = [];
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    strut(P, 'metal', sx * w * 0.3, 0.05, sz * 0.7, sx * ax, 0.22, sz * 1.25, 0.05);
    duct(P, sx * ax, 0.25, sz * 1.25, 0.62);
    ROTORS['taxi' + seats].push([sx * ax, 0.25, sz * 1.25, 0.58]);
  }
  for (const sx of [-1, 1]) {
    const skid = new THREE.CylinderGeometry(0.03, 0.03, 2.2, 5);
    skid.rotateX(PI / 2);
    P.geo('metal', skid, sx * w * 0.36, -0.68, 0.1);
    strut(P, 'metal', sx * w * 0.3, -0.35, 0.7, sx * w * 0.36, -0.68, 0.8, 0.025);
    strut(P, 'metal', sx * w * 0.3, -0.35, -0.5, sx * w * 0.36, -0.68, -0.6, 0.025);
  }
  P.geo('neon_white', ell(0.12, 0.07, 0.06, 8, 6), 0, -0.08, 1.62);
  P.geo('neon_red', ell(0.08, 0.08, 0.05, 8, 6), 0, 0.12, -2.74);
  const belly = new THREE.TorusGeometry(1, 0.03, 4, 24);
  belly.rotateX(PI / 2); belly.scale(w / 2, 1, 1.4);
  P.geo('neon_magenta', belly, 0, -0.3, 0);
  return P.merge();
}

// window band wrapped around a hull of the given radii (unit cylinder section, then scaled)
function windowBand(P, side, lo, hi, len, rx, ry, rz, y, z) {
  const t0 = side > 0 ? PI / 2 + lo : 1.5 * PI - hi;
  const g = new THREE.CylinderGeometry(1.006, 1.006, len / rz, 8, 1, true, t0, hi - lo);
  const uv = g.attributes.uv;
  for (let k = 0; k < uv.count; k++) { const u = uv.getX(k), v = uv.getY(k); uv.setXY(k, v * (len / 12), side > 0 ? u : 1 - u); }
  g.rotateX(PI / 2);
  g.scale(rx, ry, rz);
  P.geo('ferryWin', g, 0, y, z);
}

function ferryModel() {
  const P = new Parts();
  // airship-like lifting body: long rounded hull with a smaller observation deck on top
  const hull = new THREE.CapsuleGeometry(1, 5.2, 6, 18);
  hull.rotateX(PI / 2); hull.scale(3.6, 2.3, 3.6);
  P.geo('hull', hull, 0, 0, 0);
  const deck = new THREE.CapsuleGeometry(1, 3.6, 5, 14);
  deck.rotateX(PI / 2); deck.scale(2.7, 1.5, 2.9);
  P.geo('hull', deck, 0, 2.0, -1);
  P.geo('canopy', ell(2.3, 1.0, 2.2, 14, 8), 0, 1.1, 10.4); // bridge
  for (const sx of [-1, 1]) {
    windowBand(P, sx, 0.06, 0.42, 18, 3.6, 2.3, 3.6, 0, 0);
    windowBand(P, sx, 0.05, 0.6, 10, 2.7, 1.5, 2.9, 2.0, -1);
    const strip = new THREE.CylinderGeometry(0.06, 0.06, 18, 5);
    strip.rotateX(PI / 2);
    P.geo('neon_cyan', strip, sx * 3.5, -0.55, 0);
    const fin = new THREE.BoxGeometry(0.25, 3.2, 4.2);
    fin.rotateZ(-sx * 0.45);
    P.geo('hull', fin, sx * 1.9, 2.5, -10.6);
    P.geo(sx < 0 ? 'blinkA' : 'neon_green', ell(0.3, 0.3, 0.3, 8, 6), sx * 3.6, 0.2, 6);
  }
  P.plane('ad2', 11, 4.4, 0, -2.34, 0, PI / 2, PI / 2); // belly screen, readable from the street
  ROTORS.ferry = [];
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const x = sx * 5.9, z = sz * 8;
    strut(P, 'hull', sx * 3.0, 0.2, z, sx * 3.7, 0.5, z, 0.45);
    duct(P, x, 0.5, z, 2.3, 'neon_cyan');
    const shroud = new THREE.CylinderGeometry(2.42, 2.3, 0.9, 22, 1, true);
    P.geo('hull', shroud, x, 0.5, z);
    ROTORS.ferry.push([x, 0.5, z, 2.2]);
  }
  P.geo('neon_white', ell(1.2, 0.18, 0.2, 10, 6), 0, 0.1, 12.9);
  P.geo('neon_red', ell(2.2, 0.16, 0.2, 10, 6), 0, 0.2, -12.85);
  return P.merge();
}

function enforcerModel() {
  const P = new Parts();
  // armoured saucer body, white carapace, gimballed red eye, twin gun pods
  P.geo('hull', ell(0.85, 0.36, 1.1), 0, 0, 0);
  const shell = new THREE.SphereGeometry(1, 14, 6, 0, PI * 2, 0, PI / 2);
  shell.scale(0.72, 0.3, 0.86);
  P.geo('hullWhite', shell, 0, 0.14, -0.06);
  P.geo('metal', ell(0.27, 0.24, 0.27, 10, 8), 0, -0.3, 0.62);
  P.geo('neon_red', ell(0.13, 0.13, 0.1, 10, 8), 0, -0.34, 0.86);
  for (const sx of [-1, 1]) {
    const pod = new THREE.CapsuleGeometry(0.09, 0.55, 2, 6);
    pod.rotateX(PI / 2);
    P.geo('metal', pod, sx * 0.48, -0.36, 0.25);
    P.geo('neon_red', ell(0.04, 0.04, 0.03, 6, 4), sx * 0.48, -0.36, 0.63);
  }
  P.cyl('metal', 0.012, 0.012, 0.7, -0.3, 0.3, -0.6, 4, false);
  ROTORS.enforcer = [];
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    strut(P, 'metal', sx * 0.6, 0.05, sz * 0.6, sx * 1.35, 0.16, sz * 1.15, 0.055);
    duct(P, sx * 1.35, 0.18, sz * 1.15, 0.6);
    ROTORS.enforcer.push([sx * 1.35, 0.18, sz * 1.15, 0.56]);
  }
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
    this.next = this.pick(this.ax + DIRS[this.dir][0], this.az + DIRS[this.dir][1], this.dir);
    this.t = Math.random();
    this.alive = true;
    this.cur = this.speed; this.bank = 0; this.pitch = 0;
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
  // Which way to go on arriving at intersection (ax, az) while heading `dir`.
  pick(ax, az, dir) {
    const back = (dir + 2) % 4;
    const opts = [0, 1, 2, 3].filter((d) => d !== back);
    if (this.home) {
      const hx = Math.round(this.home.x / AV), hz = Math.round(this.home.z / AV);
      if (Math.abs(ax - hx) + Math.abs(az - hz) > 2) {
        const dist = (d) => Math.abs(ax + DIRS[d][0] - hx) + Math.abs(az + DIRS[d][1] - hz);
        opts.sort((a, b) => dist(a) - dist(b));
        return opts[0];
      }
    }
    return Math.random() < 0.55 ? dir : opts[Math.floor(Math.random() * opts.length)];
  }
  update(dt) {
    // ease off the throttle coming into a turn, power out of it
    const turning = (this.next !== this.dir && this.t > 0.74) || (this.turned && this.t < 0.14);
    const before = this.cur;
    this.cur += (this.speed * (turning ? 0.45 : 1) - this.cur) * Math.min(1, dt * 1.3);
    const accel = (this.cur - before) / Math.max(dt, 1e-3);
    this.t += (this.cur * dt) / AV;
    while (this.t >= 1) {
      this.t -= 1;
      this.ax += DIRS[this.dir][0]; this.az += DIRS[this.dir][1];
      this.turned = this.next !== this.dir;
      this.dir = this.next;
      this.next = this.pick(this.ax + DIRS[this.dir][0], this.az + DIRS[this.dir][1], this.dir);
    }
    const tgt = this.point(_p);
    this.pos.lerp(tgt, 1 - Math.exp(-dt * 2.2));
    const want = Math.atan2(DIRS[this.dir][0], DIRS[this.dir][1]);
    let d = want - this.heading;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    const turn = d * Math.min(1, dt * 1.6);
    this.heading += turn;
    // roll into turns, nose down with speed, pitch with acceleration
    const heavy = this.type === 'ferry' ? 0.35 : 1;
    const k = Math.min(1, dt * 3);
    const yawRate = turn / Math.max(dt, 1e-3);
    this.bank += (THREE.MathUtils.clamp(-yawRate * 0.6, -0.6, 0.6) * heavy - this.bank) * k;
    this.pitch += ((0.03 + (this.cur / this.speed) * 0.07 + THREE.MathUtils.clamp(accel * 0.012, -0.12, 0.12)) * heavy - this.pitch) * k;
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
    this.siren = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.07, 0.6, 3, 8).rotateZ(PI / 2).translate(0, 0.47, -0.1), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), 60);
    const cone = new THREE.ConeGeometry(4.5, 22, 20, 1, true).translate(0, -11, 0);
    const beamMat = MAT.beam.clone();
    beamMat.opacity = 0.07;
    beamMat.color = new THREE.Color(0x9fc4ff).multiplyScalar(0.6);
    this.beam = new THREE.InstancedMesh(cone, beamMat, 60);
    const fan = new THREE.BufferGeometry();
    fan.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -0.17, -1, 0, 0.17, -1, 0], 3));
    fan.computeVertexNormals();
    this.fan = new THREE.InstancedMesh(fan, MAT.scanFan, 60);
    for (const m of [this.siren, this.beam, this.fan]) { m.frustumCulled = false; m.count = 0; scene.add(m); }
    // rotor blades for every drone, spun individually
    const bl = [];
    for (let k = 0; k < 3; k++) bl.push(new THREE.BoxGeometry(1, 0.02, 0.13).translate(0.5, 0, 0).rotateY((k / 3) * PI * 2).toNonIndexed());
    this.blades = new THREE.InstancedMesh(mergeGeometries(bl), new THREE.MeshStandardMaterial({ color: 0x0c0c12, roughness: 0.5, metalness: 0.6 }), 1300);
    this.blades.frustumCulled = false; this.blades.count = 0;
    this.blades.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.blades);
    this.nb = 0;

    this.ambient = [];
    for (const [type, n] of Object.entries(AMBIENT)) {
      for (let k = 0; k < n; k++) this.ambient.push(this.make(type, null));
    }
    this.placed = new Map(); // placed-drone def -> agent
    this.pursuers = [];      // hunting a wanted player
    this.wrecks = [];        // shot-down drones falling out of the sky
    this.stars = 0;
    this.combat = null;      // set by main
    this.timer = 0;
    this.scanCd = 0;
    this.onScan = null;
  }

  make(type, home) {
    if (type === 'enforcer') {
      const w = new PatrolWalker(this.city, 0, 5 + Math.random() * 3, 1.2, 3);
      w.type = type; w.home = home; w.alt = 17 + Math.random() * 9; w.phase = Math.random() * 10;
      w.hp = 40; w.stunT = 0;
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
      // deployed drones start at their post; ambient patrols are scattered around the area
      for (let r = a.home ? 0 : 6; r < 20; r++) for (let k = 0; k < 6; k++) {
        const ang = Math.random() * PI * 2, rr = a.home ? Math.random() * r : r + Math.random() * 12;
        const i = fi + Math.round(Math.cos(ang) * rr), j = fj + Math.round(Math.sin(ang) * rr);
        if (this.city.isRoad(i, j)) { a.spawn(i, j); if (a.alive) return; }
      }
    } else {
      const R = a.home ? 150 : 400;
      a.spawnNear(c.x + (Math.random() * 2 - 1) * R, c.z + (Math.random() * 2 - 1) * R);
    }
  }

  update(dt, t, focus, player, seen = false, chase = player) {
    this.updatePursuit(dt, t, chase, seen);
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
    this.nb = 0;
    let e = 0;
    const col = new THREE.Color();
    this.scanCd = Math.max(0, this.scanCd - dt);
    const all = [...this.ambient, ...this.placed.values()];
    for (const a of all) {
      if (!a.alive) continue;
      if (Math.hypot(a.pos.x - focus.x, a.pos.z - focus.z) > 900) continue; // far deployed drones idle
      if (a.stunT > 0) { a.stunT -= dt; a.alt = Math.max(4, a.alt - 5 * dt); } else a.update(dt);
      if (!a.alive) continue;
      if (a.type === 'enforcer') {
        // hover: slow drift plus a faster shimmy, leaning into its motion
        const y = a.alt + Math.sin(t * 0.8 + a.phase) * 1.0 + Math.sin(t * 2.3 + a.phase * 3) * 0.15;
        _p.set(a.pos.x, y, a.pos.z);
        this.lean(a, dt, a.pos.x, a.pos.z, a.heading);
        const wob = a.stunT > 0 ? 0.5 : 0.03;
        _q.setFromEuler(_e.set(a.rp + Math.sin(t * 1.9 + a.phase) * wob, a.heading + Math.sin(t * 0.6 + a.phase) * 0.12, a.rb + Math.cos(t * 1.6 + a.phase) * wob, 'YXZ'));
        _m.compose(_p, _q, _s.set(1, 1, 1));
        this.models.enforcer.add(_m);
        this.spin(_m, 'enforcer', a.stunT > 0 ? t * 0.1 : t, a.phase);
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
        const ferry = a.type === 'ferry';
        _p.set(a.pos.x, a.pos.y + Math.sin(t * (ferry ? 0.5 : 1.1) + a.phase) * (ferry ? 0.9 : 0.35) + Math.sin(t * 2.7 + a.phase * 2) * (ferry ? 0 : 0.06), a.pos.z);
        _q.setFromEuler(_e.set(a.pitch + Math.sin(t * 0.9 + a.phase) * 0.015, a.heading, a.bank + Math.sin(t * 0.7 + a.phase * 2) * (ferry ? 0.012 : 0.03), 'YXZ'));
        _m.compose(_p, _q, _s.set(1, 1, 1));
        this.models[a.type].add(_m, a.color);
        this.spin(_m, a.type, t, a.phase);
      }
    }
    for (const d of [...this.pursuers, ...this.wrecks]) {
      const wreck = !d.pursuer;
      _p.copy(d.pos);
      if (!wreck) _p.y += Math.sin(t * 2 + d.phase) * 0.4;
      if (wreck) _q.setFromEuler(_e.set(d.spin * 0.7, d.spin, d.spin * 0.4, 'YXZ'));
      else {
        this.lean(d, dt, d.pos.x, d.pos.z, d.heading);
        const wob = d.stunT > 0 ? 0.5 : 0.04;
        _q.setFromEuler(_e.set(d.rp + 0.12 + Math.sin(t * 2.1 + d.phase) * wob, d.heading, d.rb + Math.cos(t * 1.7 + d.phase) * wob, 'YXZ'));
      }
      const s = d.heavy ? 1.8 : 1;
      _m.compose(_p, _q, _s.set(s, s, s));
      this.models.enforcer.add(_m);
      this.spin(_m, 'enforcer', wreck || d.stunT > 0 ? t * 0.15 : t, d.phase || 0);
      if (wreck || e >= 60) continue;
      this.siren.setMatrixAt(e, _m);
      this.siren.setColorAt(e, Math.sin(t * 14 + d.phase) > 0 ? col.setRGB(5, 0.2, 0.3) : col.setRGB(0.3, 0.8, 5));
      _q.setFromEuler(new THREE.Euler(0.5, d.heading, 0, 'YXZ'));
      _m.compose(_p, _q, _s.set(s, s, s));
      this.beam.setMatrixAt(e, _m);
      _m.compose(_p.set(0, -9999, 0), _q, _s.set(1, 1, 1));
      this.fan.setMatrixAt(e, _m);
      e++;
    }
    this.blades.count = this.nb;
    this.blades.instanceMatrix.needsUpdate = true;
    for (const m of Object.values(this.models)) m.end();
    for (const m of [this.siren, this.beam, this.fan]) {
      m.count = e;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }

  // Add the spinning blades for one drone (matrix = its final transform).
  spin(matrix, type, t, phase, scale = 1) {
    for (let k = 0; k < 4; k++) {
      if (this.nb >= 1300) return;
      const r = ROTORS[type][k];
      _m2.makeTranslation(r[0], r[1], r[2]);
      _m3.makeRotationY((t * 31 + phase * 7) * (k % 2 ? 1 : -1) + k);
      _m2.multiply(_m3).multiply(_m3.makeScale(r[3], 1, r[3]));
      _m3.multiplyMatrices(matrix, _m2);
      this.blades.setMatrixAt(this.nb++, _m3);
    }
  }
  // Smoothed lean for a hovering drone from how its position and heading are changing.
  lean(a, dt, x, z, heading) {
    if (a.lx === undefined) { a.lx = x; a.lz = z; a.lh = heading; a.rp = 0; a.rb = 0; }
    const inv = 1 / Math.max(dt, 1e-3);
    const vx = (x - a.lx) * inv, vz = (z - a.lz) * inv;
    const dh = Math.atan2(Math.sin(heading - a.lh), Math.cos(heading - a.lh)) * inv;
    a.lx = x; a.lz = z; a.lh = heading;
    const fwd = vx * Math.sin(heading) + vz * Math.cos(heading), lat = vx * Math.cos(heading) - vz * Math.sin(heading);
    const k = Math.min(1, dt * 4);
    a.rp += (THREE.MathUtils.clamp(fwd * 0.022, -0.35, 0.35) - a.rp) * k;
    a.rb += (THREE.MathUtils.clamp(-lat * 0.022 - dh * 0.35, -0.4, 0.4) - a.rb) * k;
  }

  // ------------------------------------------------------------ combat
  enforcers() {
    const out = [];
    for (const a of this.ambient) if (a.type === 'enforcer' && a.alive) out.push(a);
    for (const a of this.placed.values()) if (a.type === 'enforcer' && a.alive) out.push(a);
    return out;
  }
  collectTargets(out) {
    const hostile = this.stars > 0;
    const add = (a, x, y, z, r, list) => out.push({
      kind: 'drone', sphere: true, x, y, z, r, alive: true, hostile,
      hit: (dmg) => {
        a.hp -= dmg;
        if (this.stars === 0) this.alarm = true; // shooting at a patrol drone gets you noticed
        if (a.hp <= 0) { this.destroy(a, list); return true; }
        return false;
      },
      stun: (s) => { a.stunT = s; },
    });
    for (const a of this.enforcers()) add(a, a.pos.x, a.alt + 0.2, a.pos.z, 1.6, null);
    for (const p of this.pursuers) if (p.hp > 0) add(p, p.pos.x, p.pos.y, p.pos.z, p.heavy ? 2.6 : 1.6, this.pursuers);
  }
  destroy(a, list) {
    const pos = new THREE.Vector3(a.pos.x, a.pursuer ? a.pos.y : a.alt, a.pos.z);
    this.combat?.burst(pos, 0xffa040, 30, 9);
    this.combat?.boom(pos, a.heavy ? 4 : 2.5, 0xff7a2a);
    this.wrecks.push({ pos, vel: new THREE.Vector3((Math.random() - 0.5) * 6, 2, (Math.random() - 0.5) * 6), spin: 0, heavy: !!a.heavy, t: 0 });
    if (list) { const k = list.indexOf(a); if (k >= 0) list.splice(k, 1); } else a.alive = false;
  }
  // Does any drone have eyes on the player? Inside an alley they only spot you up close.
  anySees(p, hidden) {
    const r = hidden ? 16 : 95;
    for (const d of this.pursuers) if (d.hp > 0 && Math.hypot(d.pos.x - p.x, d.pos.z - p.z) < r) return true;
    for (const a of this.enforcers()) if (Math.hypot(a.pos.x - p.x, a.pos.z - p.z) < (hidden ? 12 : 40)) return true;
    return false;
  }
  nearestEnforcerDist(p) {
    let best = Infinity;
    for (const a of this.enforcers()) best = Math.min(best, Math.hypot(a.pos.x - p.x, a.pos.z - p.z));
    for (const d of this.pursuers) best = Math.min(best, Math.hypot(d.pos.x - p.x, d.pos.z - p.z));
    return best;
  }

  // Pursuit flight: chase the player above the rooftops, circle them in the street, shoot.
  updatePursuit(dt, t, player, seen) {
    const city = this.city;
    const want = player ? Math.min(12, this.stars * 2 + (this.stars >= 4 ? 2 : 0)) : 0;
    while (player && this.pursuers.length < want) {
      const a = Math.random() * Math.PI * 2, d = 140 + Math.random() * 60;
      const heavy = this.stars >= 3 && this.pursuers.filter((p) => p.heavy).length < Math.floor(this.stars / 2);
      this.pursuers.push({
        pursuer: true, heavy, hp: heavy ? 170 : 45, stunT: 0, cd: 2 + Math.random() * 2, phase: Math.random() * 10,
        pos: new THREE.Vector3(player.x + Math.cos(a) * d, 60, player.z + Math.sin(a) * d), heading: 0,
        last: new THREE.Vector3(player.x, 0, player.z),
      });
    }
    for (let k = this.pursuers.length - 1; k >= 0; k--) {
      const d = this.pursuers[k];
      if (!player || this.stars === 0) {
        // stand down: climb and leave
        d.pos.y += 15 * dt;
        d.leaving = (d.leaving || 0) + dt;
        if (d.leaving > 6) this.pursuers.splice(k, 1);
        continue;
      }
      if (d.stunT > 0) { d.stunT -= dt; d.pos.y = Math.max(3, d.pos.y - 4 * dt); continue; }
      if (seen) d.last.set(player.x, player.y || 0, player.z);
      const orbit = d.heavy ? 18 : 12;
      const ang = d.phase + t * (d.heavy ? 0.25 : 0.45);
      const tx = d.last.x + Math.cos(ang) * orbit, tz = d.last.z + Math.sin(ang) * orbit;
      // fly over buildings, drop into the street near the target
      const b = city.buildingAt(Math.floor(d.pos.x / TILE), Math.floor(d.pos.z / TILE));
      const roof = b ? b.height + 6 : 0;
      const close = Math.hypot(d.pos.x - d.last.x, d.pos.z - d.last.z) < 30;
      const ty = Math.max(roof, close ? (d.last.y || 0) + (d.heavy ? 16 : 11) : 34);
      const sp = d.heavy ? 15 : 21;
      const dx = tx - d.pos.x, dz = tz - d.pos.z, dist = Math.hypot(dx, dz) || 1;
      const step = Math.min(dist, sp * dt);
      d.pos.x += (dx / dist) * step; d.pos.z += (dz / dist) * step;
      d.pos.y += (ty - d.pos.y) * Math.min(1, dt * 1.5);
      d.heading = Math.atan2(player.x - d.pos.x, player.z - d.pos.z);
      d.cd -= dt;
      const pd = Math.hypot(player.x - d.pos.x, player.z - d.pos.z);
      if (seen && this.combat && d.cd <= 0 && pd < 70) {
        d.cd = d.heavy ? 0.35 + Math.random() * 0.3 : 1.1 + Math.random() * 0.8;
        const from = d.pos.clone(); from.y -= 0.4;
        const to = new THREE.Vector3(player.x, (player.y || 0) + 1, player.z);
        const dir = to.clone().sub(from), len = dir.length();
        if (this.combat.wallDist(from, dir.normalize(), len) >= len - 1.5) {
          this.combat.enemyShot(from, to, { dmg: d.heavy ? 8 : 6, speed: 85, color: 0xff2040, spread: d.heavy ? 0.04 : 0.025 });
        }
      }
    }
    // wrecks fall, spin, explode on impact
    for (let k = this.wrecks.length - 1; k >= 0; k--) {
      const w = this.wrecks[k];
      w.t += dt; w.vel.y -= 22 * dt; w.pos.addScaledVector(w.vel, dt); w.spin += dt * 9;
      if (w.pos.y <= 0.5 || w.t > 6) {
        this.combat?.explode(new THREE.Vector3(w.pos.x, 0.8, w.pos.z), w.heavy ? 5 : 3, 0, { owner: 'none' });
        this.wrecks.splice(k, 1);
      }
    }
  }

  // Deployed-drone anchors, for the build-mode holo markers.
  anchors() { return this.city.placedDrones; }
}
