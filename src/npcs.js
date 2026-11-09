// Street robots (walk the sidewalks, can be talked to) and gangs (loiter in dark alleys).
import * as THREE from 'three';
import { TILE, tileCenter } from './config.js';
import { Humanoids } from './humanoids.js';
import { Walker, respawnWalkers } from './traffic.js';
import { robotIdentity, GANGS, gangMemberName } from './dialogue.js';
import { vnoise, hash3 } from './rng.js';

const MAX_ROBOTS = 30, MAX_GANG = 80;
const ROBOT_BODIES = [0xd8dde6, 0x1a1a22, 0xc87a2a, 0x2a8a8a, 0xb0b4c0, 0x5a2a6a, 0xe8e0d0];
const ROBOT_GLOWS = [[0.3, 2.8, 3], [3, 0.4, 2.4], [3, 2, 0.3], [0.4, 3, 0.9], [2.8, 2.8, 3]];
const HOODIES = [0x1c1b22, 0x2a1020, 0x101a18, 0x26221a, 0x121826];
const c = new THREE.Color();

function angleTo(from, to) {
  let d = to - from;
  return Math.atan2(Math.sin(d), Math.cos(d));
}

export class Robots {
  constructor(scene, city) {
    this.city = city;
    this.rig = new Humanoids(scene, MAX_ROBOTS, 'robot');
    this.list = Array.from({ length: MAX_ROBOTS }, (_, k) => {
      const w = new Walker(city, (k % 2 ? 1 : -1) * 4.5, 0.9 + Math.random() * 0.5, 4, 0.6);
      w.phase = Math.random() * 10;
      w.seed = (Math.random() * 0xffffffff) >>> 0;
      w.body = new THREE.Color(ROBOT_BODIES[k % ROBOT_BODIES.length]);
      const g = ROBOT_GLOWS[k % ROBOT_GLOWS.length];
      w.glow = new THREE.Color(g[0], g[1], g[2]);
      w.accent = w.glow.clone().multiplyScalar(0.35);
      w.talking = false;
      w.wave = 0;
      return w;
    });
    this.timer = 0;
  }

  identity(w, ctx) {
    if (!w.id || w.idSeed !== w.seed) { w.id = robotIdentity(w.seed, ctx); w.idSeed = w.seed; }
    return w.id;
  }

  update(dt, t, focus, player) {
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 1;
      const before = new Set(this.list.filter((w) => w.alive));
      respawnWalkers(this.city, this.list, MAX_ROBOTS, focus, 0, 220);
      for (const w of this.list) if (w.alive && !before.has(w)) { w.seed = (Math.random() * 0xffffffff) >>> 0; w.id = null; }
    }
    this.rig.begin();
    for (const w of this.list) {
      if (!w.alive) continue;
      let amount = 1, headYaw = 0;
      if (w.talking && player) {
        // stop and face the player
        const want = Math.atan2(player.x - w.pos.x, player.z - w.pos.z);
        w.heading += angleTo(w.heading, want) * Math.min(1, dt * 6);
        amount = 0;
      } else {
        w.update(dt);
        if (!w.alive) continue;
        w.phase += dt * w.speed * 4.2;
        // glance at a nearby player
        if (player) {
          const d = Math.hypot(player.x - w.pos.x, player.z - w.pos.z);
          if (d < 8) headYaw = THREE.MathUtils.clamp(angleTo(w.heading, Math.atan2(player.x - w.pos.x, player.z - w.pos.z)), -1, 1);
        }
      }
      w.wave = Math.max(0, w.wave - dt);
      this.rig.add({
        x: w.pos.x, y: 0.22, z: w.pos.z, heading: w.heading, walk: w.phase, amount, headYaw,
        armRaise: w.wave > 0 ? 0.6 + Math.sin(t * 12) * 0.3 : 0, scale: 0.95 + (w.seed % 10) / 60,
        body: w.body, glow: w.glow, accent: w.accent,
      });
    }
    this.rig.end();
  }

  nearest(p, fx, fz, range = 3.6) {
    let best = null, bd = range;
    for (const w of this.list) {
      if (!w.alive) continue;
      const dx = w.pos.x - p.x, dz = w.pos.z - p.z, d = Math.hypot(dx, dz);
      if (d < bd && (dx * fx + dz * fz) / (d || 1) > 0.2) { bd = d; best = w; }
    }
    return best;
  }
}

export class Gangs {
  constructor(scene, city) {
    this.city = city;
    this.rig = new Humanoids(scene, MAX_GANG, 'gang');
    this.groups = new Map();
    this.timer = 0;
  }

  gangFor(i, j) {
    return GANGS[Math.floor(vnoise(this.city.seed + 500, i / 40, j / 40) * GANGS.length * 0.999)];
  }

  suppressed(x, z) {
    for (const d of this.city.placedDrones) {
      if (d.type !== 'enforcer') continue;
      const p = tileCenter(d.i, d.j);
      if (Math.hypot(p.x - x, p.z - z) < 150) return true;
    }
    return false;
  }

  refresh(focus) {
    const live = new Set();
    for (const b of this.city.buildings.values()) {
      if (b.type !== 'alley') continue;
      const p = tileCenter(b.i, b.j);
      if (Math.hypot(p.x - focus.x, p.z - focus.z) > 190) continue;
      if (!this.city.chunkAt(b.i, b.j)?.meshes.length || this.suppressed(p.x, p.z)) continue;
      live.add(b.id);
      if (this.groups.has(b.id)) continue;
      const gang = this.gangFor(b.i, b.j);
      const n = 3 + (b.seed % 4);
      const members = [];
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + hash3(b.id, k) * 0.6;
        const rad = 1.6 + hash3(k, b.id) * 0.9;
        const x = p.x + Math.cos(a) * rad, z = p.z + Math.sin(a) * rad;
        members.push({
          x, z, seed: (b.seed + k * 7919) >>> 0, heading: Math.atan2(p.x - x, p.z - z), phase: hash3(b.id, k, 3) * 10,
          name: gangMemberName(b.seed + k), body: new THREE.Color(HOODIES[(b.seed + k) % HOODIES.length]),
          scale: 0.92 + hash3(k, b.id, 9) * 0.16,
        });
      }
      const glow = new THREE.Color(gang.color[0], gang.color[1], gang.color[2]);
      this.groups.set(b.id, { b, gang, members, x: p.x, z: p.z, glow, accent: glow.clone().multiplyScalar(0.5) });
    }
    for (const id of [...this.groups.keys()]) if (!live.has(id)) this.groups.delete(id);
  }

  update(dt, t, focus, player) {
    this.timer -= dt;
    if (this.timer <= 0) { this.timer = 1; this.refresh(focus); }
    this.rig.begin();
    for (const g of this.groups.values()) {
      const near = player && Math.hypot(player.x - g.x, player.z - g.z) < 14;
      for (const m of g.members) {
        let want = Math.atan2(g.x - m.x, g.z - m.z); // face the fire
        if (near || m.talking) want = Math.atan2(player.x - m.x, player.z - m.z); // eye the stranger
        m.heading += angleTo(m.heading, want) * Math.min(1, dt * (near ? 3 : 1));
        const gesture = Math.max(0, Math.sin(t * 0.9 + m.phase)) * (near ? 0.15 : 0.55);
        this.rig.add({
          x: m.x, y: 0.12, z: m.z, heading: m.heading, walk: Math.sin(t * 1.3 + m.phase) * 0.25, amount: 0.25,
          armRaise: gesture, headYaw: Math.sin(t * 0.5 + m.phase) * 0.3, scale: m.scale,
          body: m.body, glow: g.glow, accent: g.accent,
        });
      }
    }
    this.rig.end();
  }

  territory(p) {
    for (const g of this.groups.values()) if (Math.hypot(p.x - g.x, p.z - g.z) < 16) return g;
    return null;
  }

  nearest(p, fx, fz, range = 3.6) {
    let best = null, bd = range;
    for (const g of this.groups.values()) {
      for (const m of g.members) {
        const dx = m.x - p.x, dz = m.z - p.z, d = Math.hypot(dx, dz);
        if (d < bd && (dx * fx + dz * fz) / (d || 1) > 0.2) { bd = d; best = { m, g }; }
      }
    }
    return best;
  }
}
