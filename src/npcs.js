// Street robots (walk the sidewalks, talkable, flee when attacked) and gangs (loiter in dark
// alleys, defend their turf, sometimes start fights, ambush you in the street).
import * as THREE from 'three';
import { TILE, tileCenter } from './config.js';
import { Humanoids } from './humanoids.js';
import { Walker, respawnWalkers } from './traffic.js';
import { robotIdentity, GANGS, gangMemberName } from './dialogue.js';
import { vnoise, hash3 } from './rng.js';
import { resolveCircle } from './modes/collide.js';

const MAX_ROBOTS = 30, MAX_GANG = 90;
const ROBOT_BODIES = [0xd8dde6, 0x1a1a22, 0xc87a2a, 0x2a8a8a, 0xb0b4c0, 0x5a2a6a, 0xe8e0d0];
const ROBOT_GLOWS = [[0.3, 2.8, 3], [3, 0.4, 2.4], [3, 2, 0.3], [0.4, 3, 0.9], [2.8, 2.8, 3]];
const HOODIES = [0x1c1b22, 0x2a1020, 0x101a18, 0x26221a, 0x121826];
const DEAD_TIME = 20;
const TAUNTS = ['Wrong alley, chrome!', 'You lost? You\'re about to be.', 'Get them!', 'Nobody walks our turf!', 'Light them up!', 'Your augments are ours now!'];

function angleTo(from, to) {
  const d = to - from;
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
      w.talking = false; w.wave = 0; w.hp = 50; w.flee = 0; w.dead = -1;
      return w;
    });
    this.timer = 0;
  }

  identity(w, ctx) {
    if (!w.id || w.idSeed !== w.seed) { w.id = robotIdentity(w.seed, ctx); w.idSeed = w.seed; }
    return w.id;
  }

  collectTargets(out) {
    for (const w of this.list) {
      if (!w.alive || w.dead >= 0) continue;
      out.push({
        kind: 'robot', x: w.pos.x, y: 0.2, z: w.pos.z, r: 0.42, h: 1.95, alive: true, hostile: false,
        hit: (dmg, info) => {
          w.hp -= dmg;
          w.talking = false; w.pinned = false;
          if (w.hp <= 0) { w.dead = 0; w.pinned = true; return true; }
          w.flee = 8; w.fromX = this.lastPlayer?.x ?? w.pos.x; w.fromZ = this.lastPlayer?.z ?? w.pos.z;
          return false;
        },
      });
    }
  }
  noise(pos, r) {
    for (const w of this.list) if (w.alive && w.dead < 0 && !w.flee && w.pos.distanceTo(pos) < r * 0.6) { w.flee = 5; w.fromX = pos.x; w.fromZ = pos.z; }
  }

  update(dt, t, focus, player) {
    this.lastPlayer = player;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 1;
      const before = new Set(this.list.filter((w) => w.alive));
      respawnWalkers(this.city, this.list, MAX_ROBOTS, focus, 0, 220);
      for (const w of this.list) if (w.alive && !before.has(w)) { w.seed = (Math.random() * 0xffffffff) >>> 0; w.id = null; w.hp = 50; w.flee = 0; w.dead = -1; w.pinned = false; }
    }
    this.rig.begin();
    for (const w of this.list) {
      if (!w.alive) continue;
      let amount = 1, headYaw = 0, lie = 0;
      if (w.dead >= 0) {
        w.dead += dt;
        lie = Math.min(1, w.dead * 3);
        amount = 0;
        if (w.dead > DEAD_TIME) { w.alive = false; w.pinned = false; continue; }
      } else if (w.flee > 0) {
        // run away from the danger, ignoring the sidewalk
        w.flee -= dt;
        const want = Math.atan2(w.pos.x - w.fromX, w.pos.z - w.fromZ);
        w.heading += angleTo(w.heading, want) * Math.min(1, dt * 5);
        w.pos.x += Math.sin(w.heading) * 5 * dt;
        w.pos.z += Math.cos(w.heading) * 5 * dt;
        resolveCircle(w.pos, 0.4, this.city.obstaclesNear(w.pos.x, w.pos.z));
        w.phase += dt * 14;
        amount = 1.5;
        if (w.flee <= 0) w.alive = false; // gone, a new one will appear elsewhere
      } else if (w.talking && player) {
        const want = Math.atan2(player.x - w.pos.x, player.z - w.pos.z);
        w.heading += angleTo(w.heading, want) * Math.min(1, dt * 6);
        amount = 0;
      } else {
        w.update(dt);
        if (!w.alive) continue;
        w.phase += dt * w.speed * 4.2;
        if (player) {
          const d = Math.hypot(player.x - w.pos.x, player.z - w.pos.z);
          if (d < 8) headYaw = THREE.MathUtils.clamp(angleTo(w.heading, Math.atan2(player.x - w.pos.x, player.z - w.pos.z)), -1, 1);
        }
      }
      w.wave = Math.max(0, w.wave - dt);
      this.rig.add({
        x: w.pos.x, y: 0.22, z: w.pos.z, heading: w.heading, walk: w.phase, amount, headYaw, lie,
        armRaise: w.flee > 0 ? 0.9 : w.wave > 0 ? 0.6 + Math.sin(t * 12) * 0.3 : 0, scale: 0.95 + (w.seed % 10) / 60,
        body: w.body, glow: w.dead >= 0 ? w.accent : w.glow, accent: w.accent,
      });
    }
    this.rig.end();
  }

  nearest(p, fx, fz, range = 3.6) {
    let best = null, bd = range;
    for (const w of this.list) {
      if (!w.alive || w.dead >= 0 || w.flee > 0) continue;
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
    this.combat = null; // set by main
    this.onTaunt = null;
    this.nextAmbushId = -1;
    this.cleared = new Map(); // alley id -> time its crew was wiped out
    this.clock = 0;
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

  makeMembers(seed, x, z, n, ring) {
    const members = [];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + hash3(seed, k) * 0.6;
      const rad = ring ? 1.6 + hash3(k, seed) * 0.9 : 1 + k * 0.8;
      const mx = x + Math.cos(a) * rad, mz = z + Math.sin(a) * rad;
      members.push({
        pos: new THREE.Vector3(mx, 0, mz), seed: (seed + k * 7919) >>> 0, heading: Math.atan2(x - mx, z - mz), phase: hash3(seed, k, 3) * 10,
        name: gangMemberName(seed + k), body: new THREE.Color(HOODIES[(seed + k) % HOODIES.length]),
        scale: 0.92 + hash3(k, seed, 9) * 0.16, hp: 60, dead: -1, cd: 1 + Math.random() * 2, strafe: Math.random() < 0.5 ? 1 : -1, walk: 0,
      });
    }
    return members;
  }
  addGroup(id, gang, x, z, members, extra = {}) {
    const glow = new THREE.Color(gang.color[0], gang.color[1], gang.color[2]);
    this.groups.set(id, { gang, members, x, z, glow, accent: glow.clone().multiplyScalar(0.5), hostile: false, calm: 0, ...extra });
  }

  refresh(focus) {
    for (const b of this.city.buildings.values()) {
      if (b.type !== 'alley' || this.groups.has(b.id)) continue;
      if (this.clock - (this.cleared.get(b.id) ?? -1e9) < 180) continue; // the turf stays quiet for a while
      const p = tileCenter(b.i, b.j);
      if (Math.hypot(p.x - focus.x, p.z - focus.z) > 190) continue;
      if (!this.city.chunkAt(b.i, b.j)?.meshes.length || this.suppressed(p.x, p.z)) continue;
      this.addGroup(b.id, this.gangFor(b.i, b.j), p.x, p.z, this.makeMembers(b.seed, p.x, p.z, 3 + (b.seed % 4), true), { b });
    }
    for (const [id, g] of [...this.groups]) {
      const far = Math.hypot(g.x - focus.x, g.z - focus.z) > 230;
      const gone = g.b && !this.city.buildings.has(g.b.id);
      const wiped = g.members.every((m) => m.dead > DEAD_TIME * 0.5);
      if (wiped && g.b) this.cleared.set(g.b.id, this.clock);
      if ((far && !g.hostile) || gone || wiped || (far && g.ambush)) this.groups.delete(id);
    }
  }

  // A crew jumps you in the street.
  ambush(player) {
    for (let k = 0; k < 40; k++) {
      const a = Math.random() * Math.PI * 2, d = 28 + Math.random() * 14;
      const x = player.x + Math.cos(a) * d, z = player.z + Math.sin(a) * d;
      const i = Math.floor(x / TILE), j = Math.floor(z / TILE);
      if (!this.city.isRoad(i, j) || !this.city.chunkAt(i, j)?.meshes.length) continue;
      const gang = this.gangFor(i, j);
      const id = this.nextAmbushId--;
      const c = tileCenter(i, j);
      this.addGroup(id, gang, c.x, c.z, this.makeMembers((Math.random() * 1e9) >>> 0, c.x, c.z, 3 + Math.floor(Math.random() * 2), false), { ambush: true, hostile: true });
      return gang;
    }
    return null;
  }

  provoke(g, line = true) {
    if (g.hostile) return;
    g.hostile = true;
    g.calm = 0;
    if (line) this.onTaunt?.(g, TAUNTS[Math.floor(Math.random() * TAUNTS.length)]);
  }

  collectTargets(out) {
    for (const g of this.groups.values()) {
      for (const m of g.members) {
        if (m.dead >= 0) continue;
        out.push({
          kind: 'gang', x: m.pos.x, y: 0.12, z: m.pos.z, r: 0.45, h: 1.9, alive: true, hostile: g.hostile,
          hit: (dmg) => {
            m.hp -= dmg;
            this.provoke(g);
            // the whole crew and its neighbours join in
            for (const o of this.groups.values()) if (o !== g && o.gang === g.gang && Math.hypot(o.x - g.x, o.z - g.z) < 40) this.provoke(o, false);
            if (m.hp <= 0) {
              m.dead = 0;
              this.combat?.dropLoot(m.pos.x, 0, m.pos.z, 20 + Math.floor(Math.random() * 7) * 10);
              return true;
            }
            return false;
          },
        });
      }
    }
  }
  noise(pos, r) {
    for (const g of this.groups.values()) if (!g.hostile && Math.hypot(pos.x - g.x, pos.z - g.z) < Math.min(r, 25)) this.provoke(g);
  }

  update(dt, t, focus, player, friendlyGang) {
    this.clock += dt;
    this.timer -= dt;
    if (this.timer <= 0) { this.timer = 1; this.refresh(focus); }
    const combat = this.combat;
    this.rig.begin();
    for (const g of this.groups.values()) {
      const dp = player ? Math.hypot(player.x - g.x, player.z - g.z) : 1e9;
      const near = dp < 14;
      // loitering on their turf can start a fight
      if (player && near && !g.hostile && g.gang.name !== friendlyGang && Math.random() < 0.012 * dt * 4) this.provoke(g);
      if (g.hostile) {
        g.calm = dp > 70 || !player ? g.calm + dt : 0;
        if (g.calm > 12) { g.hostile = false; g.calm = 0; for (const m of g.members) if (m.dead < 0) { m.pos.set(g.x + (Math.random() - 0.5) * 3, 0, g.z + (Math.random() - 0.5) * 3); } }
      }
      for (const m of g.members) {
        let lie = 0, amount = 0.25, raise = 0;
        if (m.dead >= 0) {
          m.dead += dt;
          if (m.dead > DEAD_TIME) continue;
          lie = Math.min(1, m.dead * 3);
          amount = 0;
        } else if (g.hostile && player) {
          // fight: keep a firing distance, strafe, shoot when there's a clear line
          const dx = player.x - m.pos.x, dz = player.z - m.pos.z, d = Math.hypot(dx, dz) || 1;
          const want = Math.atan2(dx, dz);
          m.heading += angleTo(m.heading, want) * Math.min(1, dt * 6);
          const toward = d > 13 ? 1 : d < 7 ? -1 : 0;
          if (Math.random() < dt * 0.4) m.strafe *= -1;
          const sx = (dx / d) * toward + (-dz / d) * m.strafe * 0.7, sz = (dz / d) * toward + (dx / d) * m.strafe * 0.7;
          const sp = 3.6;
          m.pos.x += sx * sp * dt; m.pos.z += sz * sp * dt;
          resolveCircle(m.pos, 0.4, this.city.obstaclesNear(m.pos.x, m.pos.z));
          m.walk += dt * 10;
          amount = 1;
          raise = 0.85; // gun arm up
          m.cd -= dt;
          if (combat && m.cd <= 0 && d < 45 && Math.abs((player.y || 0)) < 6) {
            m.cd = 0.9 + Math.random() * 1.3;
            const from = new THREE.Vector3(m.pos.x + Math.sin(m.heading) * 0.4, 1.45, m.pos.z + Math.cos(m.heading) * 0.4);
            const to = new THREE.Vector3(player.x, (player.y || 0) + 1.1, player.z);
            const dir = to.clone().sub(from);
            const dist = dir.length();
            if (combat.wallDist(from, dir.normalize(), dist) >= dist - 1) {
              combat.enemyShot(from, to, { dmg: 7, speed: 58, color: g.gang.css, spread: 0.02 + d * 0.0015 });
            }
          }
        } else {
          let want = Math.atan2(g.x - m.pos.x, g.z - m.pos.z);
          if (near || m.talking) want = Math.atan2(player.x - m.pos.x, player.z - m.pos.z);
          m.heading += angleTo(m.heading, want) * Math.min(1, dt * (near ? 3 : 1));
          raise = Math.max(0, Math.sin(t * 0.9 + m.phase)) * (near ? 0.15 : 0.55);
          m.walk = Math.sin(t * 1.3 + m.phase) * 0.25;
        }
        this.rig.add({
          x: m.pos.x, y: 0.12, z: m.pos.z, heading: m.heading, walk: m.walk, amount, lie,
          armRaise: raise, headYaw: m.dead >= 0 || g.hostile ? 0 : Math.sin(t * 0.5 + m.phase) * 0.3, scale: m.scale,
          body: m.body, glow: m.dead >= 0 ? g.accent : g.glow, accent: g.accent,
        });
      }
    }
    this.rig.end();
  }

  hostileNear(p, r = 80) {
    for (const g of this.groups.values()) if (g.hostile && Math.hypot(p.x - g.x, p.z - g.z) < r && g.members.some((m) => m.dead < 0)) return true;
    return false;
  }
  territory(p) {
    for (const g of this.groups.values()) if (!g.ambush && Math.hypot(p.x - g.x, p.z - g.z) < 16) return g;
    return null;
  }
  nearest(p, fx, fz, range = 3.6) {
    let best = null, bd = range;
    for (const g of this.groups.values()) {
      if (g.hostile) continue;
      for (const m of g.members) {
        if (m.dead >= 0) continue;
        const dx = m.pos.x - p.x, dz = m.pos.z - p.z, d = Math.hypot(dx, dz);
        if (d < bd && (dx * fx + dz * fz) / (d || 1) > 0.2) { bd = d; best = { m, g }; }
      }
    }
    return best;
  }
}
