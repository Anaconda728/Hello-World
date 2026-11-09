// Wildlife: low-poly animals with simple behaviours, spawning and combat.
import * as THREE from 'three';
import { WATER } from './constants.js';

// ---------- model helpers ----------
const BOX = new THREE.BoxGeometry(1, 1, 1);
const SPH = new THREE.IcosahedronGeometry(0.5, 1);
const CONE = new THREE.ConeGeometry(0.5, 1, 6);
const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 6);
const SPIKE = new THREE.ConeGeometry(0.5, 1, 4);
const UP = new THREE.Vector3(0, 1, 0);

const matCache = new Map();
const M = (c) => {
  if (!matCache.has(c)) matCache.set(c, new THREE.MeshLambertMaterial({ color: c, flatShading: true }));
  return matCache.get(c);
};
const EYE = new THREE.MeshBasicMaterial({ color: 0x111111 });
const GLOW = new THREE.MeshBasicMaterial({ color: 0xffd23a });

function part(parent, geo, color, pos, scl, rot) {
  const m = new THREE.Mesh(geo, typeof color === 'number' ? M(color) : color);
  m.position.set(pos[0], pos[1], pos[2]);
  m.scale.set(scl[0], scl[1], scl[2]);
  if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
  parent.add(m);
  return m;
}
function leg(parent, color, x, y, z, w, len) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);
  part(pivot, BOX, color, [0, -len / 2, 0], [w, len, w]);
  parent.add(pivot);
  return pivot;
}
const eyes = (p, x, y, z, s = 0.04, mat = EYE) => {
  part(p, BOX, mat, [x, y, z], [s, s, s]);
  part(p, BOX, mat, [-x, y, z], [s, s, s]);
};

// All models face +z.
function buildDeer() {
  const g = new THREE.Group(), c = 0x9a6a3f, dark = 0x6e4a2c;
  part(g, BOX, c, [0, 1.0, 0], [0.45, 0.5, 1.1]);
  part(g, BOX, 0xd9c3a3, [0, 0.78, 0.05], [0.4, 0.1, 0.9]);
  part(g, BOX, 0xf3ece0, [0, 1.12, -0.58], [0.12, 0.16, 0.08]);
  const head = new THREE.Group();
  head.position.set(0, 1.15, 0.45);
  g.add(head);
  part(head, BOX, c, [0, 0.25, 0.08], [0.22, 0.55, 0.24], [0.45, 0, 0]);
  part(head, BOX, c, [0, 0.55, 0.28], [0.24, 0.24, 0.42]);
  part(head, BOX, 0x2a2018, [0, 0.53, 0.5], [0.1, 0.1, 0.05]);
  for (const s of [-1, 1]) part(head, BOX, c, [s * 0.14, 0.7, 0.18], [0.06, 0.18, 0.1], [0, 0, -s * 0.5]);
  eyes(head, 0.125, 0.6, 0.36);
  if (Math.random() < 0.5) {
    for (const s of [-1, 1]) {
      part(head, CYL, 0xd8c8a8, [s * 0.1, 0.84, 0.18], [0.04, 0.32, 0.04], [0, 0, -s * 0.35]);
      part(head, CYL, 0xd8c8a8, [s * 0.18, 0.92, 0.26], [0.03, 0.2, 0.03], [0.7, 0, -s * 0.2]);
      part(head, CYL, 0xd8c8a8, [s * 0.2, 1.0, 0.12], [0.03, 0.18, 0.03], [-0.3, 0, -s * 0.4]);
    }
  }
  const legs = [[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([sx, sz]) => leg(g, dark, sx * 0.15, 0.78, sz * 0.42, 0.1, 0.78));
  return { group: g, legs, head };
}

function buildCapybara() {
  const g = new THREE.Group(), c = 0x9b6b43, dark = 0x7a5232;
  part(g, SPH, c, [0, 0.5, 0], [0.7, 0.62, 1.15]);
  const head = new THREE.Group();
  g.add(head);
  part(head, BOX, c, [0, 0.68, 0.58], [0.36, 0.36, 0.46]);
  part(head, BOX, dark, [0, 0.62, 0.83], [0.32, 0.26, 0.08]);
  for (const s of [-1, 1]) part(head, SPH, 0x5e3f26, [s * 0.14, 0.89, 0.46], [0.09, 0.08, 0.06]);
  eyes(head, 0.185, 0.76, 0.68);
  const legs = [[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([sx, sz]) => leg(g, dark, sx * 0.2, 0.3, sz * 0.3, 0.12, 0.3));
  return { group: g, legs, head };
}

function buildFlamingo() {
  const g = new THREE.Group(), pink = 0xf28aa5;
  part(g, SPH, pink, [0, 1.0, 0], [0.42, 0.38, 0.62]);
  for (const s of [-1, 1]) part(g, SPH, 0xe0708f, [s * 0.17, 1.03, -0.04], [0.12, 0.26, 0.5]);
  part(g, SPH, 0x2a2a2a, [0, 1.02, -0.33], [0.12, 0.08, 0.12]);
  const head = new THREE.Group();
  head.position.set(0, 1.08, 0.22);
  g.add(head);
  part(head, CYL, pink, [0, 0.22, 0.04], [0.07, 0.46, 0.07], [0.2, 0, 0]);
  part(head, CYL, pink, [0, 0.6, 0.02], [0.065, 0.38, 0.065], [-0.35, 0, 0]);
  part(head, SPH, pink, [0, 0.8, 0.06], [0.15, 0.14, 0.17]);
  part(head, BOX, 0xf3e6dc, [0, 0.76, 0.2], [0.06, 0.06, 0.14], [0.5, 0, 0]);
  part(head, BOX, 0x1b1b1b, [0, 0.71, 0.26], [0.05, 0.05, 0.06], [0.8, 0, 0]);
  eyes(head, 0.06, 0.83, 0.1, 0.03);
  const legs = [-1, 1].map((s) => leg(g, 0xd56a86, s * 0.07, 0.88, 0, 0.04, 0.88));
  return { group: g, legs, head };
}

function buildHedgehog() {
  const g = new THREE.Group();
  const ball = new THREE.Group();
  ball.position.set(0, 0.2, 0);
  g.add(ball);
  part(ball, SPH, 0x5c4630, [0, 0, 0], [0.45, 0.34, 0.55]);
  const dir = new THREE.Vector3();
  for (let i = 0; i < 18; i++) {
    dir.set(Math.random() * 2 - 1, Math.random() * 1.1 - 0.1, Math.random() * 2 - 1.2).normalize();
    const m = part(ball, SPIKE, 0x3a2c20, [dir.x * 0.2, dir.y * 0.15, dir.z * 0.25], [0.06, 0.16, 0.06]);
    m.quaternion.setFromUnitVectors(UP, dir);
  }
  const face = new THREE.Group();
  g.add(face);
  part(face, CONE, 0xc9a27e, [0, 0.15, 0.32], [0.16, 0.22, 0.16], [Math.PI / 2, 0, 0]);
  part(face, SPH, EYE, [0, 0.15, 0.44], [0.05, 0.05, 0.05]);
  eyes(face, 0.07, 0.22, 0.3, 0.03);
  const legs = [[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([sx, sz]) => leg(g, 0x8a6a4a, sx * 0.12, 0.1, sz * 0.15, 0.06, 0.1));
  return { group: g, legs, ball, face };
}

function buildJackal() {
  const g = new THREE.Group(), c = 0xb98a52, dark = 0x4a3a2c;
  part(g, BOX, c, [0, 0.6, 0], [0.3, 0.32, 0.8]);
  part(g, BOX, dark, [0, 0.77, -0.05], [0.31, 0.08, 0.6]);
  part(g, CONE, 0x8a6a42, [0, 0.58, -0.55], [0.13, 0.5, 0.13], [-2.1, 0, 0]);
  const head = new THREE.Group();
  g.add(head);
  part(head, BOX, c, [0, 0.82, 0.48], [0.24, 0.22, 0.3]);
  part(head, BOX, 0xd8c09a, [0, 0.77, 0.7], [0.12, 0.1, 0.22]);
  part(head, BOX, EYE, [0, 0.79, 0.82], [0.05, 0.05, 0.03]);
  for (const s of [-1, 1]) part(head, CONE, dark, [s * 0.08, 1.0, 0.44], [0.09, 0.18, 0.06]);
  eyes(head, 0.075, 0.86, 0.63, 0.045, GLOW);
  const legs = [[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([sx, sz]) => leg(g, 0xa47a48, sx * 0.1, 0.46, sz * 0.3, 0.08, 0.46));
  return { group: g, legs, head };
}

function buildBadger() {
  const g = new THREE.Group(), black = 0x1e1e20, silver = 0xd8d8d0;
  part(g, BOX, black, [0, 0.36, 0], [0.45, 0.3, 0.75]);
  part(g, BOX, silver, [0, 0.54, -0.02], [0.46, 0.1, 0.78]);
  part(g, BOX, black, [0, 0.42, -0.42], [0.1, 0.1, 0.14], [0.4, 0, 0]);
  const head = new THREE.Group();
  g.add(head);
  part(head, BOX, black, [0, 0.4, 0.46], [0.3, 0.24, 0.28]);
  part(head, BOX, silver, [0, 0.54, 0.44], [0.31, 0.08, 0.3]);
  part(head, BOX, 0x2c2c2e, [0, 0.36, 0.63], [0.14, 0.12, 0.1]);
  eyes(head, 0.1, 0.45, 0.6, 0.04, GLOW);
  const legs = [[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([sx, sz]) => leg(g, black, sx * 0.17, 0.24, sz * 0.26, 0.1, 0.24));
  return { group: g, legs, head };
}

function buildViper() {
  const g = new THREE.Group(), N = 13, segs = [];
  for (let i = 0; i < N; i++) {
    const r = 0.1 * (1 - (i / N) * 0.65);
    segs.push(part(g, SPH, i % 3 === 1 ? 0x3a3620 : 0x6e6a3a, [0, r, -i * 0.15], [r * 2.2, r * 1.7, r * 2.6]));
  }
  const head = new THREE.Group();
  g.add(head);
  part(head, SPH, 0x5a5630, [0, 0, 0], [0.24, 0.12, 0.3]);
  eyes(head, 0.08, 0.04, 0.06, 0.035, GLOW);
  return { group: g, legs: [], segs, head };
}

// ---------- species ----------
export const SPECIES = {
  deer: { name: 'Deer', build: buildDeer, hp: 10, walk: 1.8, run: 8.0, r: 0.5, stride: 5, skittish: 10, cap: 5, idle: 0.45, ai: 'grazer',
    spawn: (w, x, z, g) => g > WATER + 3 && g < 44 && w.forestAt(x, z) < 0.25 },
  capybara: { name: 'Capybara', build: buildCapybara, hp: 8, walk: 1.0, run: 3.6, r: 0.5, stride: 9, skittish: 0, swims: true, cap: 5, idle: 0.6, ai: 'grazer',
    spawn: (w, x, z, g) => g > WATER + 0.2 && g < WATER + 5 },
  flamingo: { name: 'Flamingo', build: buildFlamingo, hp: 5, walk: 0.9, run: 4.5, r: 0.35, stride: 5, skittish: 5, wades: true, cap: 5, idle: 0.65, ai: 'grazer',
    spawn: (w, x, z, g) => g > WATER - 0.7 && g < WATER + 1.2 },
  hedgehog: { name: 'Hedgehog', build: buildHedgehog, hp: 4, walk: 0.7, run: 0.7, r: 0.3, stride: 18, cap: 3, idle: 0.4, ai: 'hedgehog',
    dmg: 1, cause: 'Pricked by a hedgehog',
    spawn: (w, x, z, g) => g > WATER + 2 && g < 46 && w.forestAt(x, z) > 0 },
  jackal: { name: 'Jackal', build: buildJackal, hp: 8, walk: 2.2, run: 6.6, r: 0.35, stride: 7, cap: 5, biteCd: 1.5, idle: 0.3, ai: 'jackal', hostile: true, night: true,
    dmg: 2, reach: 1.35, sight: 26, cause: 'Hunted down by jackals',
    spawn: (w, x, z, g) => g > WATER + 1 },
  badger: { name: 'Honey badger', build: buildBadger, hp: 16, walk: 1.4, run: 5.4, r: 0.38, stride: 12, cap: 2, idle: 0.4, ai: 'badger', hostile: true,
    dmg: 3, reach: 1.2, sight: 7, cause: 'Mauled by a honey badger',
    spawn: (w, x, z, g) => g > WATER + 2 && g < 44 },
  viper: { name: 'Viper', build: buildViper, hp: 4, walk: 0.8, run: 2.2, r: 0.3, stride: 6, cap: 4, idle: 0.8, ai: 'viper', hostile: true,
    dmg: 4, reach: 2.1, sight: 3.4, cause: 'Bitten by a viper',
    spawn: (w, x, z, g) => g > WATER + 2 && g < 50 && w.forestAt(x, z) < 0.3 },
};
const PASSIVE_CAP = 14;

const angDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

class Creature {
  constructor(type, x, y, z) {
    this.type = type;
    this.def = SPECIES[type];
    this.model = this.def.build();
    this.root = new THREE.Group();
    this.root.add(this.model.group);
    this.root.position.set(x, y, z);
    this.root.userData.creature = this;
    this.pos = this.root.position;
    this.vx = 0; this.vz = 0; this.vy = 0;
    this.heading = Math.random() * Math.PI * 2;
    this.wantSpeed = 0;
    this.state = 'idle';
    this.timer = Math.random() * 3;
    this.hp = this.def.hp;
    this.hurtT = 0; this.atkCd = 0; this.flash = 0;
    this.phase = Math.random() * 10;
    this.dead = false; this.deadT = 0;
    this.aggro = false; this.curled = false; this.blocked = false;
    this.flank = (Math.random() - 0.5) * 1.2;
    this.strikeT = 0;
  }
}

export class Creatures {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.list = [];
    this.spawnT = 1;
  }

  roots() { return this.list.filter((c) => !c.dead).map((c) => c.root); }

  add(type, x, y, z) {
    const c = new Creature(type, x, y, z);
    this.list.push(c);
    this.scene.add(c.root);
    return c;
  }

  remove(c) {
    this.scene.remove(c.root);
    const i = this.list.indexOf(c);
    if (i >= 0) this.list.splice(i, 1);
  }

  trySpawn(ctx) {
    const counts = {};
    let passive = 0;
    for (const c of this.list) {
      counts[c.type] = (counts[c.type] || 0) + 1;
      if (!c.def.hostile) passive++;
    }
    const options = Object.keys(SPECIES).filter((k) => {
      const d = SPECIES[k];
      if ((counts[k] || 0) >= d.cap) return false;
      if (d.night && !ctx.night) return false;
      if (!d.hostile && passive >= PASSIVE_CAP) return false;
      return true;
    });
    if (!options.length) return;
    const type = options[Math.floor(Math.random() * options.length)];
    const def = SPECIES[type], w = this.world, p = ctx.player.pos;
    for (let t = 0; t < 6; t++) {
      const a = Math.random() * Math.PI * 2, d = 26 + Math.random() * 34;
      const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
      if (!w.isReadyAt(x, z)) continue;
      const g = w.groundY(x, w.heightAt(x, z) + 4, z);
      if (!isFinite(g) || !def.spawn(w, x, z, g)) continue;
      if (!def.swims && !def.wades && g < WATER - 0.25) continue;
      this.add(type, x, def.swims ? Math.max(g, WATER - 0.45) : g, z);
      if (type === 'jackal') {
        const extra = Math.min(def.cap - (counts[type] || 0) - 1, 1 + Math.floor(Math.random() * 3));
        for (let i = 0; i < extra; i++) {
          const jx = x + (Math.random() - 0.5) * 5, jz = z + (Math.random() - 0.5) * 5;
          const jg = w.groundY(jx, g + 2, jz);
          if (isFinite(jg) && jg > WATER) this.add(type, jx, jg, jz);
        }
      }
      return;
    }
  }

  // Player attack. Returns true if it landed.
  hit(c, dmg, dir, ctx) {
    if (c.dead) return false;
    if (c.type === 'hedgehog' && c.curled) {
      ctx.damage(1, 'Pricked by a hedgehog', c.pos);
      dmg *= 0.5;
    }
    c.hp -= dmg;
    c.hurtT = 4;
    c.flash = 1;
    c.vx += dir.x * 6; c.vz += dir.z * 6; c.vy = 3.5;
    if (c.def.hostile) c.aggro = true;
    if (c.hp <= 0) { c.dead = true; c.deadT = 0; }
    return true;
  }

  update(dt, ctx) {
    this.spawnT -= dt;
    if (this.spawnT <= 0) { this.spawnT = 0.6; this.trySpawn(ctx); }
    const p = ctx.player.pos;
    for (const c of this.list.slice()) {
      if (c.dead) {
        c.deadT += dt;
        c.root.rotation.z = Math.min(Math.PI / 2, c.deadT * 6);
        if (c.deadT > 1) c.pos.y -= dt * 0.8;
        if (c.deadT > 1.8) this.remove(c);
        continue;
      }
      const dx = p.x - c.pos.x, dz = p.z - c.pos.z, dist = Math.hypot(dx, dz);
      const dy = p.y - c.pos.y;
      if (dist > 95 || !this.world.getChunk(Math.floor(c.pos.x / 32), Math.floor(c.pos.z / 32))) { this.remove(c); continue; }
      c.hurtT -= dt; c.atkCd -= dt; c.flash = Math.max(0, c.flash - dt * 4);
      c.near = dist < 40;
      this.think(c, dt, ctx, dx, dz, dist, Math.abs(dy) < 2.2);
      if (c.removed) { this.remove(c); continue; }
      this.move(c, dt);
      this.animate(c, dt);
      // Keep out of the player's body.
      const min = c.def.r + 0.45;
      if (dist < min && dist > 1e-4 && Math.abs(dy) < 1.8) {
        c.pos.x -= (dx / dist) * (min - dist);
        c.pos.z -= (dz / dist) * (min - dist);
      }
    }
  }

  think(c, dt, ctx, dx, dz, dist, sameLevel) {
    const d = c.def;
    const toward = Math.atan2(dx, dz), away = toward + Math.PI;
    const wander = () => {
      c.timer -= dt;
      if (c.timer <= 0 || c.blocked) {
        if (Math.random() < d.idle && !c.blocked) { c.state = 'idle'; c.timer = 2 + Math.random() * 4; }
        else { c.state = 'walk'; c.timer = 2 + Math.random() * 4; c.goal = Math.random() * Math.PI * 2; }
      }
      c.wantSpeed = c.state === 'walk' ? d.walk : 0;
      if (c.state === 'walk') c.goalHeading = c.goal;
    };
    const bite = () => {
      if (dist < d.reach && sameLevel && c.atkCd <= 0) {
        c.atkCd = d.biteCd || 1;
        ctx.damage(d.dmg, d.cause, c.pos);
      }
    };
    const chase = () => {
      c.state = 'chase';
      let h = toward;
      if (d.ai === 'jackal' && dist > 4) h += c.flank;      // packs fan out to surround
      if (c.blocked) c.detour = (Math.random() < 0.5 ? -1 : 1) * 0.9;
      if (c.detour) { h += c.detour; c.detourT = (c.detourT || 0) + dt; if (c.detourT > 0.8) { c.detour = 0; c.detourT = 0; } }
      c.goalHeading = h;
      c.wantSpeed = dist < d.reach * 0.8 ? 0 : d.run;
      bite();
    };
    const flee = () => { c.state = 'flee'; c.goalHeading = away + (c.blocked ? 1.2 : 0); c.wantSpeed = d.run; };

    switch (d.ai) {
      case 'grazer': {
        const sprinting = ctx.keys.has('ShiftLeft') || ctx.keys.has('ShiftRight');
        if (c.hurtT > 0 || (d.skittish && dist < d.skittish * (sprinting ? 1.4 : 1))) flee();
        else wander();
        break;
      }
      case 'hedgehog': {
        c.curled = dist < 3.2 || c.hurtT > 0;
        if (c.curled) {
          c.wantSpeed = 0;
          if (dist < d.r + 0.6 && sameLevel && c.atkCd <= 0) { c.atkCd = 1; ctx.damage(d.dmg, d.cause, c.pos); }
        } else wander();
        break;
      }
      case 'jackal': {
        if (c.hp <= 3) { flee(); break; }
        if (!ctx.night && c.hurtT <= 0) { c.aggro = false; flee(); if (dist > 30) c.removed = true; break; }
        if (dist < d.sight || c.aggro) { c.aggro = dist < d.sight * 1.6; chase(); }
        else wander();
        break;
      }
      case 'badger': {
        if (dist < d.sight || c.hurtT > 0) c.aggro = true;
        if (dist > 22) c.aggro = false;
        if (c.aggro) chase(); else wander();
        break;
      }
      case 'viper': {
        if (c.hurtT > 0) { c.state = 'slither'; flee(); c.wantSpeed = d.run; break; }
        c.wantSpeed = 0;
        if (c.state === 'rear') {
          c.heading += angDiff(c.heading, toward) * Math.min(1, dt * 8);
          c.timer -= dt;
          if (c.timer <= 0) {
            c.state = 'strike'; c.timer = 0.3; c.atkCd = 2.2;
            if (dist < d.reach && sameLevel) ctx.damage(d.dmg, d.cause, c.pos);
          }
        } else if (c.state === 'strike') {
          c.timer -= dt;
          if (c.timer <= 0) c.state = 'coil';
        } else if (c.state === 'slither' || c.state === 'walk') {
          c.timer -= dt; c.goalHeading = c.goal; c.wantSpeed = d.walk;
          if (c.timer <= 0 || c.blocked) c.state = 'coil';
        } else {
          c.state = 'coil';
          if (dist < d.sight && c.atkCd <= 0) { c.state = 'rear'; c.timer = 0.65; }
          else if (dist > 10 && Math.random() < dt * 0.08) { c.state = 'walk'; c.timer = 3; c.goal = Math.random() * Math.PI * 2; }
        }
        break;
      }
    }
  }

  move(c, dt) {
    const d = c.def, w = this.world;
    if (c.wantSpeed > 0.01 && c.goalHeading !== undefined) {
      const turn = angDiff(c.heading, c.goalHeading);
      c.heading += Math.sign(turn) * Math.min(Math.abs(turn), dt * 7);
    }
    const tvx = Math.sin(c.heading) * c.wantSpeed, tvz = Math.cos(c.heading) * c.wantSpeed;
    const k = Math.min(1, dt * 8);
    c.vx += (tvx - c.vx) * k;
    c.vz += (tvz - c.vz) * k;

    c.blocked = false;
    const step = Math.hypot(c.vx, c.vz) * dt;
    if (step > 1e-5) {
      const nx = c.pos.x + c.vx * dt, nz = c.pos.z + c.vz * dt;
      const g = w.groundY(nx, c.pos.y, nz);
      let ok = isFinite(g) && g - c.pos.y <= step * 1.6 + (d.swims ? 0.25 : 0.06);
      if (ok && !d.swims) ok = d.wades ? g > WATER - 0.9 : g > WATER - 0.25;
      if (ok) { c.pos.x = nx; c.pos.z = nz; } else { c.blocked = true; c.vx = 0; c.vz = 0; }
    }
    const g = w.groundY(c.pos.x, c.pos.y, c.pos.z);
    if (!isFinite(g)) { c.removed = true; return; }
    const floor = d.swims ? Math.max(g, WATER - 0.45) : g;
    if (c.pos.y > floor + 0.6 || c.vy > 0) {
      c.vy -= 25 * dt;
      c.pos.y += c.vy * dt;
      if (c.pos.y <= floor) { c.pos.y = floor; c.vy = 0; }
    } else {
      c.pos.y = floor;
      c.vy = 0;
    }
  }

  animate(c, dt) {
    const m = c.model, d = c.def;
    const sp = Math.hypot(c.vx, c.vz);
    c.phase += sp * dt * d.stride;
    const swing = Math.sin(c.phase) * 0.7 * Math.min(1, sp / 1.5);
    c.root.rotation.y = c.heading;
    const s = 1 + 0.18 * c.flash;
    c.root.scale.set(s, 1 - 0.12 * c.flash, s);

    if (m.legs.length === 4) {
      m.legs[0].rotation.x = swing; m.legs[3].rotation.x = swing;
      m.legs[1].rotation.x = -swing; m.legs[2].rotation.x = -swing;
    }
    switch (c.type) {
      case 'deer':
      case 'capybara': {
        const graze = c.state === 'idle' && Math.sin(c.phase * 0.1 + c.timer) > -0.2 ? (c.type === 'deer' ? 1.0 : 0.25) : 0;
        m.head.rotation.x += (graze - m.head.rotation.x) * Math.min(1, dt * 3);
        if (c.type === 'capybara' && c.pos.y < WATER - 0.3) m.legs.forEach((l) => (l.rotation.x = Math.sin(c.phase * 2) * 0.8));
        break;
      }
      case 'flamingo': {
        const tuck = c.state === 'idle' ? -1.4 : swing;
        m.legs[0].rotation.x = c.state === 'idle' ? 0 : -swing;
        m.legs[1].rotation.x += (tuck - m.legs[1].rotation.x) * Math.min(1, dt * 4);
        m.head.rotation.x = c.state === 'idle' ? 0.25 + Math.sin(performance.now() / 900 + c.flank * 5) * 0.2 : 0;
        break;
      }
      case 'hedgehog': {
        const t = c.curled ? 1 : 0;
        c.curlT = (c.curlT || 0) + (t - (c.curlT || 0)) * Math.min(1, dt * 6);
        m.ball.scale.set(1 - c.curlT * 0.1, 1 + c.curlT * 0.25, 1 - c.curlT * 0.2);
        m.face.visible = c.curlT < 0.5;
        m.legs.forEach((l) => (l.visible = c.curlT < 0.5));
        break;
      }
      case 'jackal':
      case 'badger':
        m.group.position.y = Math.abs(Math.sin(c.phase)) * 0.05 * Math.min(1, sp / 2);
        m.head.rotation.x = c.state === 'chase' && c.atkCd > 0.7 ? 0.35 : 0;
        break;
      case 'viper':
        this.poseViper(c, dt);
        break;
    }
  }

  poseViper(c, dt) {
    const { segs, head } = c.model;
    const k = Math.min(1, dt * 10);
    const moving = c.wantSpeed > 0.05;
    const N = segs.length;
    const t = performance.now() / 1000;
    for (let i = 0; i < N; i++) {
      let x, y, z;
      if (moving) {
        x = Math.sin(c.phase - i * 0.8) * 0.13; y = segs[i].scale.y * 0.5; z = -i * 0.15;
      } else {
        const a = i * 0.72 + 1.2, r = 0.1 + i * 0.028;
        x = Math.cos(a) * r; z = Math.sin(a) * r; y = segs[i].scale.y * 0.5 + (N - i) * 0.006;
        if ((c.state === 'rear' || c.state === 'strike') && i < 3) { y += (3 - i) * 0.1; z += (3 - i) * 0.04; }
      }
      segs[i].position.x += (x - segs[i].position.x) * k;
      segs[i].position.y += (y - segs[i].position.y) * k;
      segs[i].position.z += (z - segs[i].position.z) * k;
    }
    let hx = 0, hy = 0.18, hz = 0.12;
    if (moving) { hx = Math.sin(c.phase + 0.8) * 0.08; hy = 0.08; hz = 0.16; }
    else if (c.state === 'rear') { hy = 0.45 + Math.sin(t * 20) * 0.01; hz = 0.18; }
    else if (c.state === 'strike') { hy = 0.25; hz = 0.95; }
    head.position.x += (hx - head.position.x) * k * 1.5;
    head.position.y += (hy - head.position.y) * k * 1.5;
    head.position.z += (hz - head.position.z) * Math.min(1, k * (c.state === 'strike' ? 3 : 1.5));
  }
}
