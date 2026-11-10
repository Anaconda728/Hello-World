// Combat: player weapons + first-person viewmodels, projectiles (player and enemy),
// hit detection against NPCs/drones/buildings, effects, player health, and crime reports.
import * as THREE from 'three';
import { TILE } from './config.js';
import { MAT } from './materials.js';

export const WEAPONS = [
  { id: 'katana', name: 'Mono-Katana', kind: 'melee', dmg: 75, range: 3.4, arc: 1.25, rate: 0.42, clip: 0, color: 0x2ef6ff, key: '1' },
  { id: 'pistol', name: 'SP-9 Smart Pistol', kind: 'hitscan', dmg: 24, rate: 0.2, clip: 14, reload: 1.1, spread: 0.01, assist: 0.13, range: 140, color: 0xffb02e, key: '2' },
  { id: 'plasma', name: 'HX-7 Plasma Rifle', kind: 'bolt', dmg: 17, splash: 2.6, rate: 0.1, clip: 40, reload: 1.8, speed: 95, auto: true, color: 0xff2bd6, key: '3' },
  { id: 'rail', name: 'Tachyon Railgun', kind: 'rail', dmg: 160, rate: 1.15, clip: 4, reload: 2.4, range: 320, color: 0xb388ff, key: '4' },
  { id: 'emp', name: 'EMP Grenade', kind: 'grenade', dmg: 40, radius: 9, rate: 0.7, clip: 3, regen: 10, color: 0x6ad8ff, key: '5' },
];

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const ZF = new THREE.Vector3(0, 0, 1);

function glow(hex, k = 2.5) { return new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), toneMapped: false }); }

// --- first-person weapon models (children of the camera)
function viewmodels() {
  const dark = new THREE.MeshStandardMaterial({ color: 0x16161e, roughness: 0.35, metalness: 0.85 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0x9aa0b0, roughness: 0.2, metalness: 1 });
  const box = (g, w, h, d, x, y, z, mat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); g.add(m); return m; };
  const models = {};
  // katana: glowing monomolecular edge
  let g = new THREE.Group();
  box(g, 0.035, 0.035, 0.22, 0, 0, 0, dark);
  box(g, 0.09, 0.012, 0.03, 0, 0, -0.12, chrome);
  const blade = box(g, 0.012, 0.03, 0.9, 0, 0, -0.58, chrome);
  box(g, 0.004, 0.034, 0.9, 0.008, 0, -0.58, glow(0x2ef6ff, 1.3));
  blade.userData.tip = true;
  g.position.set(0.32, -0.3, -0.45); g.rotation.set(0.5, -0.25, -0.35);
  models.katana = g;
  // pistol
  g = new THREE.Group();
  box(g, 0.05, 0.075, 0.22, 0, 0, -0.06, dark);
  box(g, 0.045, 0.12, 0.06, 0, -0.08, 0.02, dark);
  box(g, 0.052, 0.012, 0.18, 0, 0.042, -0.07, glow(0xffb02e, 1.1));
  box(g, 0.02, 0.02, 0.03, 0, 0.05, -0.15, glow(0xff2848, 1.3)); // smart-link sight
  g.position.set(0.2, -0.2, -0.42);
  models.pistol = g;
  // plasma rifle
  g = new THREE.Group();
  box(g, 0.08, 0.1, 0.55, 0, 0, -0.15, dark);
  box(g, 0.06, 0.13, 0.08, 0, -0.1, 0.02, dark);
  for (let k = 0; k < 4; k++) { const c = new THREE.Mesh(new THREE.TorusGeometry(0.046, 0.007, 6, 16), glow(0xff2bd6, 1.15)); c.position.set(0, 0.01, -0.22 - k * 0.07); g.add(c); }
  box(g, 0.04, 0.04, 0.14, 0, 0.01, -0.48, chrome);
  g.position.set(0.22, -0.22, -0.45);
  models.plasma = g;
  // railgun
  g = new THREE.Group();
  box(g, 0.1, 0.12, 0.5, 0, 0, -0.05, dark);
  box(g, 0.025, 0.02, 0.75, -0.04, 0.03, -0.45, chrome);
  box(g, 0.025, 0.02, 0.75, 0.04, 0.03, -0.45, chrome);
  box(g, 0.012, 0.012, 0.72, 0, 0.03, -0.45, glow(0xb388ff, 1.3));
  box(g, 0.05, 0.05, 0.12, 0, 0.1, -0.05, glow(0xb388ff, 0.8));
  g.position.set(0.22, -0.24, -0.4);
  models.rail = g;
  // grenade in hand
  g = new THREE.Group();
  const nade = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 1), dark); g.add(nade);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.008, 6, 16), glow(0x6ad8ff, 1.2)); g.add(band);
  g.position.set(0.25, -0.22, -0.4);
  models.emp = g;
  for (const m of Object.values(models)) { m.userData.base = m.position.clone(); m.userData.rot = m.rotation.clone(); m.visible = false; }
  return models;
}

export class Combat {
  constructor(ctx) {
    this.ctx = ctx; // { scene, camera, city, audio, ui, sources: [], onCrime, onDeath }
    const { scene, camera } = ctx;
    scene.add(camera);
    this.hp = 100; this.maxHp = 100;
    this.shield = 60; this.maxShield = 60;
    this.hurtT = 99; this.dead = false;
    this.weapon = -1;
    this.ammo = WEAPONS.map((w) => w.clip);
    this.cool = 0; this.reloadT = 0; this.nadeT = 0;
    this.trigger = false; this.aiming = false;
    this.recoil = 0; this.swing = 0;

    this.vm = viewmodels();
    this.vmRoot = new THREE.Group();
    Object.values(this.vm).forEach((m) => this.vmRoot.add(m));
    camera.add(this.vmRoot);
    this.flash = new THREE.PointLight(0xffc070, 0, 14, 2);
    this.flash.position.set(0.2, -0.15, -0.9);
    camera.add(this.flash);

    // bolts (player + enemy), stretched spheres
    this.bolts = [];
    this.boltMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), 240);
    this.boltMesh.frustumCulled = false; this.boltMesh.count = 0;
    scene.add(this.boltMesh);
    // tracers
    this.tracers = [];
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(64 * 6), 3));
    tg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(64 * 6), 3));
    this.tracerLines = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.tracerLines.frustumCulled = false;
    scene.add(this.tracerLines);
    // sparks
    this.sparks = [];
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(600 * 3), 3));
    sg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(600 * 3), 3));
    this.sparkPts = new THREE.Points(sg, new THREE.PointsMaterial({ size: 0.18, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.sparkPts.frustumCulled = false;
    scene.add(this.sparkPts);
    // explosions, rail beams, katana slashes, loot chips: small mesh pools
    this.pool = (n, make) => Array.from({ length: n }, () => { const m = make(); m.visible = false; scene.add(m); return { m, t: 0, life: 1 }; });
    const sph = new THREE.SphereGeometry(1, 20, 14);
    this.booms = this.pool(10, () => new THREE.Mesh(sph, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })));
    const cyl = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5);
    this.beams = this.pool(6, () => new THREE.Mesh(cyl, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xb388ff).multiplyScalar(3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })));
    const arc = new THREE.TorusGeometry(1.6, 0.03, 4, 24, Math.PI * 0.8).rotateX(Math.PI / 2).rotateY(Math.PI * 0.1);
    this.slashes = this.pool(3, () => new THREE.Mesh(arc, new THREE.MeshBasicMaterial({ color: new THREE.Color(0x2ef6ff).multiplyScalar(3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })));
    const chip = new THREE.OctahedronGeometry(0.22, 0);
    this.loot = this.pool(30, () => new THREE.Mesh(chip, MAT.neon_amber));
  }

  // ------------------------------------------------------------ targets + geometry queries
  targets() {
    const out = [];
    for (const s of this.ctx.sources) s.collectTargets(out);
    return out;
  }
  // Distance along a ray to the first building (or the ground), up to max.
  wallDist(o, d, max) {
    const city = this.ctx.city;
    for (let t = 0.5; t < max; t += 0.8) {
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
      if (y < 0) return t;
      const b = city.buildingAt(Math.floor(x / TILE), Math.floor(z / TILE));
      if (!b || y > b.height) continue;
      for (const [x0, z0, x1, z1] of b.rects) if (x >= x0 && x <= x1 && z >= z0 && z <= z1) return t;
    }
    return max;
  }
  // Ray vs target: drones are spheres, people are upright cylinders. Returns distance or -1.
  rayHit(o, d, tg, max) {
    if (tg.sphere) {
      _v.set(tg.x - o.x, tg.y - o.y, tg.z - o.z);
      const t = _v.dot(d);
      if (t < 0 || t > max) return -1;
      const dist2 = _v.lengthSq() - t * t;
      return dist2 < tg.r * tg.r ? t : -1;
    }
    const dd = d.x * d.x + d.z * d.z;
    if (dd < 1e-6) return -1;
    const t = ((tg.x - o.x) * d.x + (tg.z - o.z) * d.z) / dd;
    if (t < 0 || t > max) return -1;
    const px = o.x + d.x * t - tg.x, pz = o.z + d.z * t - tg.z, py = o.y + d.y * t;
    if (px * px + pz * pz > tg.r * tg.r || py < tg.y || py > tg.y + tg.h) return -1;
    return t;
  }
  centre(tg) { return _w.set(tg.x, tg.sphere ? tg.y : tg.y + tg.h * 0.6, tg.z); }

  // ------------------------------------------------------------ dealing damage
  deal(tg, dmg, info = {}) {
    if (!tg.alive) return;
    const wasHostile = tg.hostile;
    const killed = tg.hit(dmg, info);
    this.ctx.onCrime?.(tg, { wasHostile, killed, vehicle: info.vehicle });
    this.ctx.ui.hitmarker(killed);
    const c = this.centre(tg);
    this.burst(c, tg.kind === 'drone' || tg.kind === 'robot' ? 0x9ef3ff : 0xff3050, killed ? 26 : 10, 5);
  }
  explode(pos, radius, dmg, { emp = false, owner = 'player' } = {}) {
    this.boom(pos, radius, emp ? 0x6ad8ff : 0xff7a2a);
    this.burst(pos, emp ? 0x6ad8ff : 0xffa040, 40, 12);
    this.ctx.audio.thud(0.8);
    this.noise(pos, 40);
    if (owner === 'player') {
      for (const tg of this.targets()) {
        const c = this.centre(tg);
        const d = c.distanceTo(pos);
        if (d > radius) continue;
        const k = 1 - d / radius;
        this.deal(tg, (tg.kind === 'drone' && emp ? dmg * 3.5 : dmg) * (0.4 + 0.6 * k), { emp });
        if (emp) tg.stun?.(4);
      }
    } else if (this.player && pos.distanceTo(this.playerCentre()) < radius) this.hurt(dmg);
  }
  // Gunfire is loud: pedestrians panic, nearby gangs get jumpy.
  noise(pos, r) { for (const s of this.ctx.sources) s.noise?.(pos, r); }

  // ------------------------------------------------------------ enemy fire
  enemyShot(from, to, { dmg = 6, speed = 60, color = 0xffa040, spread = 0.03 } = {}) {
    if (this.bolts.length > 220) return;
    const d = new THREE.Vector3().subVectors(to, from).normalize();
    d.x += (Math.random() - 0.5) * spread * 2; d.y += (Math.random() - 0.5) * spread; d.z += (Math.random() - 0.5) * spread * 2;
    d.normalize();
    this.bolts.push({ p: from.clone(), v: d.multiplyScalar(speed), owner: 'enemy', dmg, color: new THREE.Color(color).multiplyScalar(3), life: 2.5 });
    this.ctx.audio.zap?.(from, 0.25);
  }
  playerCentre() { return _w.set(this.player.x, this.player.y + (this.inCar ? 0.9 : 1.1), this.player.z); }
  hurt(dmg) {
    if (this.dead) return;
    if (this.inCar) dmg *= 0.55; // armoured car
    this.hurtT = 0;
    const s = Math.min(this.shield, dmg);
    this.shield -= s;
    this.hp -= dmg - s;
    this.ctx.ui.damage(Math.min(1, dmg / 25), s > 0);
    if (this.hp <= 0) { this.hp = 0; this.dead = true; this.trigger = false; this.ctx.onDeath?.(); }
  }
  revive() { this.hp = this.maxHp; this.shield = this.maxShield; this.dead = false; this.hurtT = 99; this.bolts.length = 0; }

  // ------------------------------------------------------------ player weapons
  select(i) {
    if (this.weapon === i) i = -1; // press again to holster
    this.weapon = i;
    this.reloadT = 0;
    this.cool = Math.max(this.cool, 0.25);
    for (const [k, m] of Object.entries(this.vm)) m.visible = i >= 0 && WEAPONS[i].id === k;
    this.ctx.audio.blip(i < 0 ? 300 : 500);
  }
  cycle(dir) { this.select(((this.weapon < 0 ? 0 : this.weapon) + dir + WEAPONS.length) % WEAPONS.length); }
  reload() {
    const w = WEAPONS[this.weapon];
    if (!w || !w.reload || this.reloadT > 0 || this.ammo[this.weapon] === w.clip) return;
    this.reloadT = w.reload;
    this.ctx.audio.blip(220);
  }

  muzzle() {
    const cam = this.ctx.camera;
    return new THREE.Vector3(0.2, -0.16, -0.9).applyMatrix4(cam.matrixWorld);
  }

  fire() {
    const w = WEAPONS[this.weapon];
    const cam = this.ctx.camera;
    const o = cam.getWorldPosition(new THREE.Vector3());
    const dir = cam.getWorldDirection(new THREE.Vector3());
    const targets = this.targets();
    this.cool = w.rate;
    if (w.kind === 'melee') {
      this.swing = 1;
      this.slash();
      this.ctx.audio.blip(160);
      const fx = dir.x, fz = dir.z, fl = Math.hypot(fx, fz) || 1;
      for (const tg of targets) {
        if (tg.sphere) continue;
        const dx = tg.x - o.x, dz = tg.z - o.z, d = Math.hypot(dx, dz);
        if (d > w.range || Math.abs(tg.y - (o.y - 1.7)) > 2.5) continue;
        if (Math.acos(Math.max(-1, Math.min(1, (dx * fx + dz * fz) / (d * fl || 1)))) > w.arc / 2 + 0.25) continue;
        this.deal(tg, w.dmg, { melee: true });
      }
      return;
    }
    if (w.clip) {
      if (this.ammo[this.weapon] <= 0) { if (w.reload) this.reload(); else this.ctx.audio.blip(120); return; }
      this.ammo[this.weapon]--;
    }
    this.recoil = w.kind === 'rail' ? 1 : w.kind === 'grenade' ? 0.3 : 0.5;
    const m = this.muzzle();
    if (w.kind !== 'grenade') { this.flash.color.set(w.color); this.flash.intensity = w.kind === 'rail' ? 30 : 12; }
    this.noise(o, w.kind === 'grenade' ? 0 : 35);

    if (w.kind === 'hitscan') {
      this.ctx.audio.shot?.(0.5);
      const d = dir.clone();
      // smart-link: bend toward the target nearest the crosshair
      let best = null, ba = w.assist;
      for (const tg of targets) {
        const c = this.centre(tg).clone();
        const to = c.sub(o);
        const dist = to.length();
        if (dist > w.range) continue;
        const a = to.normalize().angleTo(dir);
        if (a < ba && this.wallDist(o, to, dist) >= dist - 0.5) { ba = a; best = to.clone(); }
      }
      if (best) d.copy(best);
      d.x += (Math.random() - 0.5) * w.spread; d.y += (Math.random() - 0.5) * w.spread; d.normalize();
      const wall = this.wallDist(o, d, w.range);
      let hit = null, ht = wall;
      for (const tg of targets) { const t = this.rayHit(o, d, tg, ht); if (t >= 0 && t < ht) { ht = t; hit = tg; } }
      const end = o.clone().addScaledVector(d, ht);
      this.tracer(m, end, w.color);
      if (hit) this.deal(hit, w.dmg);
      else if (wall < w.range) this.burst(end, w.color, 8, 4);
    } else if (w.kind === 'rail') {
      this.ctx.audio.shot?.(1);
      const wall = this.wallDist(o, dir, w.range);
      const end = o.clone().addScaledVector(dir, wall);
      this.beam(m, end);
      for (const tg of targets) { const t = this.rayHit(o, dir, tg, wall); if (t >= 0) this.deal(tg, w.dmg, { pierce: true }); }
      if (wall < w.range) this.burst(end, w.color, 20, 7);
      this.ctx.ui.shake?.(0.4);
    } else if (w.kind === 'bolt') {
      this.ctx.audio.zap?.(o, 0.5);
      const d = dir.clone();
      d.x += (Math.random() - 0.5) * 0.02; d.y += (Math.random() - 0.5) * 0.02; d.normalize();
      this.bolts.push({ p: m, v: d.multiplyScalar(w.speed), owner: 'player', dmg: w.dmg, splash: w.splash, color: new THREE.Color(w.color).multiplyScalar(3), life: 2 });
    } else if (w.kind === 'grenade') {
      this.ctx.audio.blip(420);
      const v = dir.clone().multiplyScalar(22);
      v.y += 5;
      this.bolts.push({ p: m, v, owner: 'player', grenade: true, dmg: w.dmg, radius: w.radius, color: new THREE.Color(w.color).multiplyScalar(3), life: 1.6, gravity: true });
      if (this.ammo[this.weapon] < w.clip && this.nadeT <= 0) this.nadeT = w.regen;
    }
  }

  // Running people over with the car.
  vehicleHits(pos, speed) {
    if (speed < 7) return;
    for (const tg of this.targets()) {
      if (tg.sphere) continue;
      if (Math.abs(tg.y - pos.y) > 2 || Math.hypot(tg.x - pos.x, tg.z - pos.z) > 2.3) continue;
      this.deal(tg, 999, { vehicle: true });
    }
  }

  // ------------------------------------------------------------ effects
  tracer(a, b, color) {
    this.tracers.push({ a: a.clone(), b: b.clone(), c: new THREE.Color(color).multiplyScalar(2.5), t: 0, life: 0.12 });
    if (this.tracers.length > 64) this.tracers.shift();
  }
  burst(p, color, n, speed) {
    const c = new THREE.Color(color).multiplyScalar(2.5);
    for (let k = 0; k < n && this.sparks.length < 600; k++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.3 + Math.random()));
      this.sparks.push({ p: p.clone(), v, c, life: 0.4 + Math.random() * 0.5, t: 0 });
    }
  }
  take(pool) { return pool.find((e) => !e.m.visible) || pool[0]; }
  boom(p, r, color) {
    const e = this.take(this.booms);
    e.m.visible = true; e.m.position.copy(p); e.t = 0; e.life = 0.55; e.r = r;
    e.m.material.color.set(color).multiplyScalar(2.5);
  }
  beam(a, b) {
    const e = this.take(this.beams);
    e.m.visible = true; e.m.position.copy(a); e.m.lookAt(b); e.t = 0; e.life = 0.35;
    e.len = a.distanceTo(b);
  }
  slash() {
    const e = this.take(this.slashes);
    const cam = this.ctx.camera;
    e.m.visible = true; e.t = 0; e.life = 0.18;
    e.m.position.copy(cam.getWorldPosition(new THREE.Vector3())).add(cam.getWorldDirection(new THREE.Vector3()).multiplyScalar(0.6));
    e.m.quaternion.copy(cam.getWorldQuaternion(new THREE.Quaternion()));
    e.m.position.y -= 0.2;
  }
  dropLoot(x, y, z, amount) {
    const e = this.take(this.loot);
    e.m.visible = true; e.m.position.set(x, y + 0.6, z); e.amount = amount; e.t = 0; e.life = 60;
  }

  // ------------------------------------------------------------ per frame
  // player: { x, y, z } or null (not on foot/in car). firing: walk-mode trigger state.
  update(dt, t, player, { inCar = false, onFoot = false, moving = 0 } = {}) {
    this.player = player; this.inCar = inCar;
    const W = WEAPONS[this.weapon];
    this.cool = Math.max(0, this.cool - dt);
    this.hurtT += dt;
    if (!this.dead && this.hurtT > 4) {
      this.shield = Math.min(this.maxShield, this.shield + 18 * dt);
      if (this.hurtT > 8) this.hp = Math.min(this.maxHp, this.hp + 2 * dt);
    }
    // reloading / grenade fabrication
    if (this.reloadT > 0) { this.reloadT -= dt; if (this.reloadT <= 0) this.ammo[this.weapon] = W.clip; }
    const ni = WEAPONS.findIndex((w) => w.kind === 'grenade');
    if (this.ammo[ni] < WEAPONS[ni].clip) {
      if (this.nadeT <= 0) this.nadeT = WEAPONS[ni].regen;
      this.nadeT -= dt;
      if (this.nadeT <= 0) { this.ammo[ni]++; this.nadeT = this.ammo[ni] < WEAPONS[ni].clip ? WEAPONS[ni].regen : 0; }
    }
    if (onFoot && !this.dead && W && this.trigger && this.cool <= 0 && this.reloadT <= 0) {
      this.fire();
      if (!W.auto) this.trigger = W.kind === 'melee' ? this.trigger : false;
    }
    this.vmRoot.visible = onFoot && !this.dead;
    // viewmodel motion
    this.recoil = Math.max(0, this.recoil - dt * 6);
    this.swing = Math.max(0, this.swing - dt * 5);
    for (const [k, m] of Object.entries(this.vm)) {
      if (!m.visible) continue;
      const b = m.userData.base, r = m.userData.rot;
      const bob = Math.sin(t * 9) * 0.012 * Math.min(1, moving / 4);
      const rl = this.reloadT > 0 ? Math.sin(Math.min(1, (W.reload - this.reloadT) / W.reload) * Math.PI) * 0.25 : 0;
      m.position.set(b.x + (this.aiming ? -b.x + 0.02 : 0), b.y + bob - rl + (this.aiming ? 0.06 : 0), b.z + this.recoil * 0.08);
      m.rotation.set(r.x + this.recoil * 0.25 - rl * 2, r.y, r.z);
      if (k === 'katana') { const s = this.swing; m.rotation.set(r.x - s * 1.6, r.y + s * 1.9, r.z - s * 0.6); m.position.x = b.x - s * 0.35; }
    }
    this.flash.intensity = Math.max(0, this.flash.intensity - dt * 160);

    // bolts
    const targets = this.bolts.length ? this.targets() : null;
    let n = 0;
    const keep = [];
    for (const bl of this.bolts) {
      bl.life -= dt;
      if (bl.gravity) bl.v.y -= 20 * dt;
      const from = bl.p.clone();
      bl.p.addScaledVector(bl.v, dt);
      let done = bl.life <= 0;
      const step = from.distanceTo(bl.p), dir = bl.v.clone().normalize();
      if (!done && this.wallDist(from, dir, step + 0.1) < step) done = true;
      if (!done && bl.owner === 'player' && !bl.grenade) {
        for (const tg of targets) {
          const tt = this.rayHit(from, dir, { ...tg, r: tg.r + 0.25 }, step);
          if (tt >= 0) { this.deal(tg, bl.dmg); done = true; break; }
        }
      } else if (!done && bl.grenade) {
        for (const tg of targets) if (this.centre(tg).distanceTo(bl.p) < tg.r + 0.4) { done = true; break; }
      } else if (!done && bl.owner === 'enemy' && this.player && !this.dead) {
        const pc = this.playerCentre();
        _v.subVectors(pc, from);
        const tt = Math.max(0, Math.min(step, _v.dot(dir)));
        const closest = from.clone().addScaledVector(dir, tt);
        const hitR = this.inCar ? 1.8 : 0.65;
        const vertical = this.inCar ? 1.2 : 1.1;
        if (Math.hypot(closest.x - pc.x, closest.z - pc.z) < hitR && Math.abs(closest.y - pc.y) < vertical) { this.hurt(bl.dmg); done = true; }
      }
      if (done) {
        if (bl.grenade) this.explode(bl.p, bl.radius, bl.dmg, { emp: true });
        else if (bl.splash) { this.boom(bl.p, bl.splash * 0.6, 0xff2bd6); this.splash(bl.p, bl.splash, bl.dmg * 0.5, targets); }
        else this.burst(bl.p, bl.owner === 'enemy' ? 0xff4030 : 0xffffff, 6, 3);
        continue;
      }
      keep.push(bl);
      if (n < 240) {
        const stretch = bl.grenade ? 1 : Math.min(6, bl.v.length() * 0.05);
        _q.setFromUnitVectors(ZF, dir);
        _m.compose(bl.p, _q, _s.set(bl.grenade ? 1.2 : 1, bl.grenade ? 1.2 : 1, stretch));
        this.boltMesh.setMatrixAt(n, _m);
        this.boltMesh.setColorAt(n, bl.color);
        n++;
      }
    }
    this.bolts = keep;
    this.boltMesh.count = n;
    this.boltMesh.instanceMatrix.needsUpdate = true;
    if (this.boltMesh.instanceColor) this.boltMesh.instanceColor.needsUpdate = true;

    // tracers
    const tp = this.tracerLines.geometry.attributes.position, tc = this.tracerLines.geometry.attributes.color;
    this.tracers = this.tracers.filter((tr) => (tr.t += dt) < tr.life);
    for (let k = 0; k < 64; k++) {
      const tr = this.tracers[k];
      if (!tr) { tp.setXYZ(k * 2, 0, -999, 0); tp.setXYZ(k * 2 + 1, 0, -999, 0); continue; }
      const f = 1 - tr.t / tr.life;
      tp.setXYZ(k * 2, tr.a.x, tr.a.y, tr.a.z); tp.setXYZ(k * 2 + 1, tr.b.x, tr.b.y, tr.b.z);
      tc.setXYZ(k * 2, tr.c.r * f * 0.4, tr.c.g * f * 0.4, tr.c.b * f * 0.4); tc.setXYZ(k * 2 + 1, tr.c.r * f, tr.c.g * f, tr.c.b * f);
    }
    tp.needsUpdate = tc.needsUpdate = true;
    // sparks
    const sp = this.sparkPts.geometry.attributes.position, sc = this.sparkPts.geometry.attributes.color;
    this.sparks = this.sparks.filter((s) => (s.t += dt) < s.life);
    for (let k = 0; k < 600; k++) {
      const s = this.sparks[k];
      if (!s) { sp.setXYZ(k, 0, -999, 0); continue; }
      s.v.y -= 9 * dt;
      s.p.addScaledVector(s.v, dt);
      const f = 1 - s.t / s.life;
      sp.setXYZ(k, s.p.x, s.p.y, s.p.z);
      sc.setXYZ(k, s.c.r * f, s.c.g * f, s.c.b * f);
    }
    sp.needsUpdate = sc.needsUpdate = true;
    // pools
    for (const e of this.booms) if (e.m.visible) { e.t += dt; const f = e.t / e.life; e.m.scale.setScalar(e.r * (0.3 + f)); e.m.material.opacity = 1 - f; if (f >= 1) e.m.visible = false; }
    for (const e of this.beams) if (e.m.visible) { e.t += dt; const f = e.t / e.life; e.m.scale.set(0.12 * (1 - f) + 0.02, 0.12 * (1 - f) + 0.02, e.len); e.m.material.opacity = 1 - f; if (f >= 1) e.m.visible = false; }
    for (const e of this.slashes) if (e.m.visible) { e.t += dt; const f = e.t / e.life; e.m.material.opacity = 1 - f; e.m.rotateY(dt * 9); if (f >= 1) e.m.visible = false; }
    for (const e of this.loot) {
      if (!e.m.visible) continue;
      e.t += dt;
      e.m.rotation.y += dt * 3;
      e.m.position.y += Math.sin(t * 3 + e.amount) * 0.003;
      if (e.t > e.life) { e.m.visible = false; continue; }
      if (player && !inCar && Math.hypot(player.x - e.m.position.x, player.z - e.m.position.z) < 1.6) {
        e.m.visible = false;
        if (!this.ctx.city.sandbox) this.ctx.city.credits += e.amount;
        this.ctx.ui.toast(`+¢${e.amount} (scavenged)`, true);
        this.ctx.audio.blip(1300);
      }
    }
  }
  splash(p, r, dmg, targets) {
    for (const tg of targets || this.targets()) { if (this.centre(tg).distanceTo(p) < r + tg.r) this.deal(tg, dmg); }
  }
}
