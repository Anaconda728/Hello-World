// Ambient life: hover-cars on the roads, pedestrians with glowing umbrellas, and
// sky traffic streaming between the towers. All instanced for speed.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GRID, DIRS, HALF, tileCenter } from './config.js';

const MAX_CARS = 220, MAX_PEDS = 260, N_AIR = 140;
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function coloredBox(w, h, d, x, y, z, r, g, b) {
  const geo = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  geo.translate(x, y, z);
  const c = new Float32Array(geo.attributes.position.count * 3);
  for (let k = 0; k < c.length; k += 3) { c[k] = r; c[k + 1] = g; c[k + 2] = b; }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  geo.deleteAttribute('uv');
  return geo;
}

export function carGeometries() {
  const body = mergeGeometries([
    new THREE.BoxGeometry(1.9, 0.55, 4.3).translate(0, 0.75, 0).toNonIndexed(),
    new THREE.BoxGeometry(1.6, 0.5, 2.2).translate(0, 1.25, -0.25).toNonIndexed(),
    new THREE.BoxGeometry(0.4, 0.3, 1.4).translate(-1.05, 0.55, 0).toNonIndexed(),
    new THREE.BoxGeometry(0.4, 0.3, 1.4).translate(1.05, 0.55, 0).toNonIndexed(),
  ]);
  const lights = mergeGeometries([
    coloredBox(0.5, 0.12, 0.06, -0.62, 0.82, 2.16, 5, 5, 4.6),
    coloredBox(0.5, 0.12, 0.06, 0.62, 0.82, 2.16, 5, 5, 4.6),
    coloredBox(1.7, 0.1, 0.06, 0, 0.85, -2.16, 4, 0.15, 0.25),
    coloredBox(1.5, 0.04, 3.6, 0, 0.42, 0, 0.3, 1.4, 2.2),
  ]);
  return { body, lights };
}

class Walker {
  constructor(city, offset, speed, turnRate, arrive) {
    this.city = city; this.offset = offset; this.speed = speed; this.turnRate = turnRate; this.arrive = arrive;
    this.pos = new THREE.Vector3(); this.heading = 0; this.alive = false;
  }
  spawn(i, j) {
    const opts = [];
    DIRS.forEach(([dx, dz], d) => { if (this.city.isRoad(i + dx, j + dz)) opts.push(d); });
    if (!opts.length) { this.alive = false; return; }
    this.i = i; this.j = j;
    this.dir = opts[Math.floor(Math.random() * opts.length)];
    const c = tileCenter(i, j);
    const [dx, dz] = DIRS[this.dir];
    this.pos.set(c.x + -dz * this.offset, 0, c.z + dx * this.offset);
    this.heading = Math.atan2(dx, dz);
    this.setTarget();
    this.alive = true;
  }
  setTarget() {
    const [dx, dz] = DIRS[this.dir];
    this.ti = this.i + dx; this.tj = this.j + dz;
    const c = tileCenter(this.ti, this.tj);
    this.tx = c.x + -dz * this.offset; this.tz = c.z + dx * this.offset;
  }
  choose() {
    const back = (this.dir + 2) % 4;
    const opts = [];
    DIRS.forEach(([dx, dz], d) => {
      if (d === back || !this.city.isRoad(this.i + dx, this.j + dz)) return;
      const w = d === this.dir ? 3 : 1;
      for (let k = 0; k < w; k++) opts.push(d);
    });
    if (opts.length) this.dir = opts[Math.floor(Math.random() * opts.length)];
    else if (this.city.isRoad(this.i + DIRS[back][0], this.j + DIRS[back][1])) this.dir = back;
    else return false;
    return true;
  }
  update(dt) {
    if (!this.city.isRoad(this.ti, this.tj)) {
      // road under us vanished: try to re-route, otherwise despawn
      if (!this.city.isRoad(this.i, this.j) || !this.choose()) { this.alive = false; return; }
      this.setTarget();
    }
    const dx = this.tx - this.pos.x, dz = this.tz - this.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < this.arrive) {
      this.i = this.ti; this.j = this.tj;
      if (!this.choose()) { this.alive = false; return; }
      this.setTarget();
      return;
    }
    const want = Math.atan2(dx, dz);
    let diff = want - this.heading;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    const maxTurn = this.turnRate * dt;
    this.heading += Math.max(-maxTurn, Math.min(maxTurn, diff));
    const slow = Math.abs(diff) > 0.6 ? 0.55 : 1;
    this.pos.x += Math.sin(this.heading) * this.speed * slow * dt;
    this.pos.z += Math.cos(this.heading) * this.speed * slow * dt;
  }
}

export class Traffic {
  constructor(scene, city) {
    this.city = city;
    const { body, lights } = carGeometries();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25, metalness: 0.8 });
    const lightMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });

    this.carBody = new THREE.InstancedMesh(body, bodyMat, MAX_CARS);
    this.carLights = new THREE.InstancedMesh(lights, lightMat, MAX_CARS);
    const palette = [0x111118, 0x1b1b26, 0x2a1a3a, 0x0c2230, 0x3a3a46, 0xc9a227, 0x6a0f2a, 0xd0d4e0];
    const c = new THREE.Color();
    for (let k = 0; k < MAX_CARS; k++) this.carBody.setColorAt(k, c.set(palette[k % palette.length]));
    this.cars = Array.from({ length: MAX_CARS }, () => new Walker(city, 2.4, 9 + Math.random() * 7, 2.6, 2.2));

    // pedestrians
    const ped = mergeGeometries([
      new THREE.CylinderGeometry(0.2, 0.24, 1.35, 6).translate(0, 0.9, 0).toNonIndexed(),
      new THREE.SphereGeometry(0.17, 6, 4).translate(0, 1.75, 0).toNonIndexed(),
    ]);
    ped.deleteAttribute('uv');
    this.pedBody = new THREE.InstancedMesh(ped, new THREE.MeshStandardMaterial({ color: 0x15131c, roughness: 0.8 }), MAX_PEDS);
    const umb = new THREE.ConeGeometry(0.62, 0.28, 10, 1, true).translate(0, 2.15, 0);
    this.pedUmb = new THREE.InstancedMesh(umb, new THREE.MeshBasicMaterial({
      color: 0xffffff, toneMapped: false, transparent: true, opacity: 0.85, side: THREE.DoubleSide,
    }), MAX_PEDS);
    const neon = [[0.2, 2.4, 2.6], [2.6, 0.3, 2.1], [2.6, 1.4, 0.2], [1.2, 0.6, 2.8], [0.4, 2.6, 1.0], [2.4, 2.4, 2.6]];
    for (let k = 0; k < MAX_PEDS; k++) {
      const n = neon[k % neon.length];
      this.pedUmb.setColorAt(k, c.setRGB(n[0], n[1], n[2]));
    }
    this.peds = Array.from({ length: MAX_PEDS }, (_, k) => {
      const w = new Walker(city, (k % 2 ? 1 : -1) * 5.1, 1.1 + Math.random() * 0.7, 6, 0.7);
      w.umbrella = Math.random() < 0.7;
      w.phase = Math.random() * 10;
      return w;
    });

    // sky traffic: straight lanes at altitude, wrapping around
    this.airBody = new THREE.InstancedMesh(body, bodyMat, N_AIR);
    this.airLights = new THREE.InstancedMesh(lights, lightMat, N_AIR);
    for (let k = 0; k < N_AIR; k++) this.airBody.setColorAt(k, c.set(palette[(k * 3) % palette.length]));
    const span = HALF + 300;
    this.air = Array.from({ length: N_AIR }, (_, k) => {
      const lane = Math.floor(Math.random() * 14);
      const alongX = k % 2 === 0;
      return {
        alongX, dirSign: Math.random() < 0.5 ? 1 : -1,
        lanePos: (lane - 7) * 24 + 6 + (Math.random() - 0.5) * 3,
        alt: [45, 70, 95, 130, 170][Math.floor(Math.random() * 5)] + Math.random() * 6,
        p: (Math.random() * 2 - 1) * span, speed: 22 + Math.random() * 26, span,
      };
    });

    for (const m of [this.carBody, this.carLights, this.pedBody, this.pedUmb, this.airBody, this.airLights]) {
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(m);
    }
    this.spawnTimer = 0;
  }

  roadTiles() {
    const out = [];
    for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) if (this.city.isRoad(i, j)) out.push([i, j]);
    return out;
  }

  respawn(list, target) {
    const tiles = this.roadTiles();
    if (!tiles.length) { list.forEach((w) => (w.alive = false)); return; }
    let alive = list.filter((w) => w.alive).length;
    for (const w of list) {
      if (alive >= target) break;
      if (w.alive) continue;
      const [i, j] = tiles[Math.floor(Math.random() * tiles.length)];
      w.spawn(i, j);
      if (w.alive) alive++;
    }
    // trim extras when roads shrink
    for (const w of list) { if (alive <= target) break; if (w.alive) { w.alive = false; alive--; } }
  }

  update(dt, t) {
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 1.5;
      let roads = 0;
      for (let k = 0; k < this.city.road.length; k++) roads += this.city.road[k];
      this.respawn(this.cars, Math.min(MAX_CARS, Math.floor(roads * 0.4)));
      this.respawn(this.peds, Math.min(MAX_PEDS, Math.floor(roads * 0.5)));
    }
    let n = 0;
    for (const w of this.cars) {
      if (!w.alive) continue;
      w.update(dt);
      if (!w.alive) continue;
      tmpP.set(w.pos.x, 0.25 + Math.sin(t * 2 + w.offset + n) * 0.06, w.pos.z);
      tmpQ.setFromAxisAngle(UP, w.heading);
      tmpM.compose(tmpP, tmpQ, tmpS.set(1, 1, 1));
      this.carBody.setMatrixAt(n, tmpM);
      this.carLights.setMatrixAt(n, tmpM);
      n++;
    }
    this.carBody.count = this.carLights.count = n;

    n = 0;
    for (const w of this.peds) {
      if (!w.alive) continue;
      w.update(dt);
      if (!w.alive) continue;
      const bob = Math.abs(Math.sin(t * 7 + w.phase)) * 0.05;
      tmpP.set(w.pos.x, 0.22 + bob, w.pos.z);
      tmpQ.setFromAxisAngle(UP, w.heading);
      tmpM.compose(tmpP, tmpQ, tmpS.set(1, 1, 1));
      this.pedBody.setMatrixAt(n, tmpM);
      tmpM.compose(tmpP, tmpQ, tmpS.setScalar(w.umbrella ? 1 : 0));
      this.pedUmb.setMatrixAt(n, tmpM);
      n++;
    }
    this.pedBody.count = this.pedUmb.count = n;

    let k = 0;
    for (const a of this.air) {
      a.p += a.speed * a.dirSign * dt;
      if (a.p > a.span) a.p = -a.span; else if (a.p < -a.span) a.p = a.span;
      const x = a.alongX ? a.p : a.lanePos, z = a.alongX ? a.lanePos : a.p;
      const head = a.alongX ? (a.dirSign > 0 ? Math.PI / 2 : -Math.PI / 2) : (a.dirSign > 0 ? 0 : Math.PI);
      tmpP.set(x, a.alt + Math.sin(t + k) * 0.8, z);
      tmpQ.setFromAxisAngle(UP, head);
      tmpM.compose(tmpP, tmpQ, tmpS.set(1, 1, 1));
      this.airBody.setMatrixAt(k, tmpM);
      this.airLights.setMatrixAt(k, tmpM);
      k++;
    }
    for (const m of [this.carBody, this.carLights, this.pedBody, this.pedUmb, this.airBody, this.airLights]) m.instanceMatrix.needsUpdate = true;
  }
}
