// Ambient life: hover-cars on the roads, pedestrians with glowing umbrellas, and
// sky traffic streaming between the towers. All instanced for speed.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { DIRS, TILE, tileCenter } from './config.js';
import { MAT, AD_COUNT } from './materials.js';

const MAX_CARS = 170, MAX_PEDS = 240, N_AIR = 140, N_DRONES = 26, N_BLIMPS = 4, N_STEAM = 40, STEAM_P = 14;
const LIFE_R = 300; // ambient life exists within this many metres of the focus
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
    // cybernetics: glowing optic visors and chrome arms on the crowd
    this.pedVisor = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 0.06, 0.1).translate(0, 1.77, 0.14),
      new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), MAX_PEDS);
    this.pedArm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 0.7, 0.06).translate(0.27, 1.05, 0.02),
      new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), MAX_PEDS);
    const visorCols = [[0.3, 3, 3], [3, 0.3, 2.4], [3, 0.4, 0.3], [0.4, 3, 0.8], [3, 2, 0.2]];
    this.peds = Array.from({ length: MAX_PEDS }, (_, k) => {
      const w = new Walker(city, (k % 2 ? 1 : -1) * 5.1, 1.1 + Math.random() * 0.7, 6, 0.7);
      w.umbrella = Math.random() < 0.65;
      w.visor = Math.random() < 0.55;
      w.arm = Math.random() < 0.3;
      w.phase = Math.random() * 10;
      const vc = visorCols[k % visorCols.length];
      this.pedVisor.setColorAt(k, c.setRGB(vc[0], vc[1], vc[2]));
      this.pedArm.setColorAt(k, c.setRGB(vc[2] * 0.8 + 0.4, vc[1] * 0.8 + 0.4, vc[0] * 0.8 + 0.4));
      return w;
    });

    // sky traffic: straight lanes at altitude, wrapping around
    this.airBody = new THREE.InstancedMesh(body, bodyMat, N_AIR);
    this.airLights = new THREE.InstancedMesh(lights, lightMat, N_AIR);
    for (let k = 0; k < N_AIR; k++) this.airBody.setColorAt(k, c.set(palette[(k * 3) % palette.length]));
    this.air = Array.from({ length: N_AIR }, (_, k) => ({
      alongX: k % 2 === 0, dirSign: Math.random() < 0.5 ? 1 : -1, lanePos: 0, p: 0, init: false,
      alt: [55, 80, 105, 140, 180][Math.floor(Math.random() * 5)] + Math.random() * 6,
      speed: 22 + Math.random() * 26, span: 650,
    }));

    // police / corp patrol drones: hover over the streets, sweeping searchlights
    const dBody = mergeGeometries([
      new THREE.BoxGeometry(1.4, 0.4, 1.4).toNonIndexed(),
      new THREE.BoxGeometry(3.2, 0.1, 0.25).toNonIndexed(),
      new THREE.BoxGeometry(0.25, 0.1, 3.2).toNonIndexed(),
      new THREE.CylinderGeometry(0.35, 0.35, 0.5, 8).translate(0, -0.4, 0.4).toNonIndexed(),
    ]);
    this.droneBody = new THREE.InstancedMesh(dBody, new THREE.MeshStandardMaterial({ color: 0x1a1a22, roughness: 0.4, metalness: 0.8 }), N_DRONES);
    const siren = new THREE.BoxGeometry(0.5, 0.18, 0.3).translate(0, 0.3, 0);
    this.droneSiren = new THREE.InstancedMesh(siren, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), N_DRONES);
    const cone = new THREE.ConeGeometry(4.5, 22, 20, 1, true).translate(0, -11, 0);
    this.droneBeam = new THREE.InstancedMesh(cone, MAT.beam.clone(), N_DRONES);
    this.droneBeam.material.opacity = 0.07;
    this.droneBeam.material.color = new THREE.Color(0x9fc4ff).multiplyScalar(0.6);
    this.drones = Array.from({ length: N_DRONES }, () => {
      const w = new Walker(city, 0, 5 + Math.random() * 4, 1.2, 3);
      w.alt = 16 + Math.random() * 12;
      w.phase = Math.random() * 10;
      return w;
    });

    // advertising blimps drifting high above the sprawl
    this.blimps = [];
    const hull = new THREE.SphereGeometry(1, 20, 12);
    hull.scale(9, 6, 26);
    const hullMat = new THREE.MeshStandardMaterial({ color: 0x15131c, roughness: 0.5, metalness: 0.6 });
    for (let k = 0; k < N_BLIMPS; k++) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(hull, hullMat));
      for (const sx of [-1, 1]) {
        const scr = new THREE.Mesh(new THREE.PlaneGeometry(28, 9), MAT['ad' + ((k * 2 + (sx > 0 ? 1 : 0)) % AD_COUNT)]);
        scr.position.set(sx * 9.2, 0, 0);
        scr.rotation.y = sx * Math.PI / 2;
        g.add(scr);
      }
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.4, 8, 6), hullMat);
      fin.position.set(0, 4, -22);
      g.add(fin);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 40), MAT.neon_magenta);
      strip.position.set(0, -6, 0);
      g.add(strip);
      g.userData = { ang: (k / N_BLIMPS) * Math.PI * 2, rad: 260 + k * 60, alt: 130 + k * 18, speed: 0.012 + k * 0.004 };
      scene.add(g);
      this.blimps.push(g);
    }

    // steam rising from street vents
    const sp = new Float32Array(N_STEAM * STEAM_P * 3);
    const sa = new Float32Array(N_STEAM * STEAM_P);
    for (let k = 0; k < sa.length; k++) sa[k] = Math.random();
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    sg.setAttribute('aSeed', new THREE.BufferAttribute(sa, 1));
    this.steamMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 } },
      vertexShader: `
        attribute float aSeed; uniform float uTime; varying float vA;
        void main(){
          float life = fract(uTime * 0.18 + aSeed);
          vec3 p = position;
          p.y += life * 7.0;
          p.x += sin(aSeed * 40.0 + uTime) * life * 1.5 + life * 1.2;
          p.z += cos(aSeed * 30.0 + uTime * 0.7) * life * 1.5;
          vA = (1.0 - life) * smoothstep(0.0, 0.1, life);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = (90.0 + life * 260.0) / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying float vA;
        void main(){
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d) * vA * 0.16;
          gl_FragColor = vec4(0.85, 0.72, 0.95, a);
        }`,
    });
    this.steam = new THREE.Points(sg, this.steamMat);
    this.steam.frustumCulled = false;
    scene.add(this.steam);
    this.steamTimer = 0;

    this.instanced = [this.carBody, this.carLights, this.pedBody, this.pedUmb, this.pedVisor, this.pedArm, this.airBody, this.airLights, this.droneBody, this.droneSiren, this.droneBeam];
    for (const m of this.instanced) {
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(m);
    }
    this.spawnTimer = 0;
  }

  // Keep each population topped up on loaded road tiles near the focus.
  respawn(list, target, focus, minR = 0) {
    for (const w of list) {
      if (w.alive && Math.hypot(w.pos.x - focus.x, w.pos.z - focus.z) > LIFE_R) w.alive = false;
    }
    let alive = list.filter((w) => w.alive).length;
    const R = Math.floor(LIFE_R / TILE) - 2;
    const fi = Math.floor(focus.x / TILE), fj = Math.floor(focus.z / TILE);
    let tries = 0;
    for (const w of list) {
      if (alive >= target || tries > 400) break;
      if (w.alive) continue;
      while (tries++ < 400) {
        const i = fi + Math.floor((Math.random() * 2 - 1) * R), j = fj + Math.floor((Math.random() * 2 - 1) * R);
        if (Math.hypot(i - fi, j - fj) * TILE < minR) continue;
        const ch = this.city.chunkAt(i, j);
        if (!ch || !ch.meshes.length || !this.city.isRoad(i, j)) continue;
        w.spawn(i, j);
        if (w.alive) { alive++; break; }
      }
    }
  }

  update(dt, t, focus) {
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 0.7;
      this.respawn(this.cars, MAX_CARS, focus);
      this.respawn(this.peds, MAX_PEDS, focus);
      this.respawn(this.drones, N_DRONES, focus);
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
      tmpM.compose(tmpP, tmpQ, tmpS.setScalar(w.visor ? 1 : 0));
      this.pedVisor.setMatrixAt(n, tmpM);
      tmpM.compose(tmpP, tmpQ, tmpS.setScalar(w.arm ? 1 : 0));
      this.pedArm.setMatrixAt(n, tmpM);
      n++;
    }
    this.pedBody.count = this.pedUmb.count = this.pedVisor.count = this.pedArm.count = n;

    n = 0;
    const col = new THREE.Color();
    for (const w of this.drones) {
      if (!w.alive) continue;
      w.update(dt);
      if (!w.alive) continue;
      tmpP.set(w.pos.x, w.alt + Math.sin(t * 0.8 + w.phase) * 1.5, w.pos.z);
      tmpQ.setFromAxisAngle(UP, w.heading);
      tmpM.compose(tmpP, tmpQ, tmpS.set(1, 1, 1));
      this.droneBody.setMatrixAt(n, tmpM);
      this.droneSiren.setMatrixAt(n, tmpM);
      const red = Math.sin(t * 9 + w.phase) > 0;
      this.droneSiren.setColorAt(n, red ? col.setRGB(4, 0.2, 0.3) : col.setRGB(0.3, 0.8, 4));
      // the searchlight wobbles as it scans the street
      const e = new THREE.Euler(Math.sin(t * 0.9 + w.phase) * 0.35, w.heading, Math.cos(t * 0.7 + w.phase) * 0.35, 'YXZ');
      tmpQ.setFromEuler(e);
      tmpM.compose(tmpP, tmpQ, tmpS.set(1, 1, 1));
      this.droneBeam.setMatrixAt(n, tmpM);
      n++;
    }
    this.droneBody.count = this.droneSiren.count = this.droneBeam.count = n;
    if (this.droneSiren.instanceColor) this.droneSiren.instanceColor.needsUpdate = true;

    for (const g of this.blimps) {
      const u = g.userData;
      u.ang += u.speed * dt;
      g.position.set(focus.x + Math.cos(u.ang) * u.rad, u.alt + Math.sin(t * 0.2 + u.rad) * 3, focus.z + Math.sin(u.ang) * u.rad);
      g.rotation.y = -u.ang; // nose along the orbit
    }

    // steam: re-pick vents near the focus now and then
    this.steamMat.uniforms.uTime.value = t;
    this.steamTimer -= dt;
    if (this.steamTimer <= 0) {
      this.steamTimer = 2;
      const vents = [];
      for (const ch of this.city.chunks.values()) {
        if (!ch.meshes.length) continue;
        for (const v of ch.vents) {
          const d = Math.hypot(v[0] - focus.x, v[1] - focus.z);
          if (d < 220) vents.push([d, v]);
        }
      }
      vents.sort((a, b) => a[0] - b[0]);
      const pos = this.steam.geometry.attributes.position;
      for (let k = 0; k < N_STEAM; k++) {
        const v = vents[k]?.[1];
        for (let q = 0; q < STEAM_P; q++) {
          const idx = k * STEAM_P + q;
          if (v) pos.setXYZ(idx, v[0] + (Math.random() - 0.5) * 0.8, 0.1, v[1] + (Math.random() - 0.5) * 0.8);
          else pos.setXYZ(idx, 0, -999, 0);
        }
      }
      pos.needsUpdate = true;
    }

    let k = 0;
    for (const a of this.air) {
      // lanes follow the main avenues; recycle any car that drifts too far from the focus
      const along = a.alongX ? focus.x : focus.z, across = a.alongX ? focus.z : focus.x;
      if (!a.init || Math.abs(a.lanePos - across) > a.span) {
        const AV = TILE * 12;
        a.lanePos = (Math.round(across / AV) + Math.floor((Math.random() * 2 - 1) * 4)) * AV + (a.dirSign > 0 ? 3 : -3);
        a.p = along + (Math.random() * 2 - 1) * a.span;
        a.init = true;
      }
      a.p += a.speed * a.dirSign * dt;
      if (a.p > along + a.span) a.p -= 2 * a.span; else if (a.p < along - a.span) a.p += 2 * a.span;
      const x = a.alongX ? a.p : a.lanePos, z = a.alongX ? a.lanePos : a.p;
      const head = a.alongX ? (a.dirSign > 0 ? Math.PI / 2 : -Math.PI / 2) : (a.dirSign > 0 ? 0 : Math.PI);
      tmpP.set(x, a.alt + Math.sin(t + k) * 0.8, z);
      tmpQ.setFromAxisAngle(UP, head);
      tmpM.compose(tmpP, tmpQ, tmpS.set(1, 1, 1));
      this.airBody.setMatrixAt(k, tmpM);
      this.airLights.setMatrixAt(k, tmpM);
      k++;
    }
    for (const m of this.instanced) m.instanceMatrix.needsUpdate = true;
  }
}
