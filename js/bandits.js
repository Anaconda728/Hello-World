// Bandits: camps in the wild, roadside ambushes, and armed raiders (some on horseback).
import * as THREE from 'three';
import { WATER } from './constants.js';
import { makeRng } from './noise.js';
import { TOWN_CELL, clearLine } from './towns.js';
import { buildHuman, makeBubble } from './npcs.js';
import { buildHorse } from './travelers.js';

const CONE4 = new THREE.ConeGeometry(1.4, 2.0, 4);
const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 6);
const CONE = new THREE.ConeGeometry(0.5, 1, 6);
const BOX = new THREE.BoxGeometry(1, 1, 1);
const lam = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
const TENT = [lam(0x6a5a44), lam(0x5a4a3a), lam(0x7a6a50)], LOG = lam(0x5a3f28), CRATE = lam(0x7a5a3a);
const FLAME = new THREE.MeshBasicMaterial({ color: 0xff7a2a }), FLAME2 = new THREE.MeshBasicMaterial({ color: 0xffd04a });

const pickL = (a) => a[Math.floor(Math.random() * a.length)];
const LINES = {
  alert: ['Who goes there?', "There's one!", 'Get them!', 'Your money or your life!', 'Fresh meat!'],
  raid: ['Hand over the goods!', 'Stop the wagon!', 'Nobody move!', 'Kill the driver!'],
  hurt: ['Argh!', "I'm hit!", 'You\'ll pay for that!'],
  flee: ['Run for it!', "I'm out!", 'Not worth it!'],
};
const angDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpC = new THREE.Vector3();

class Bandit {
  constructor(rng, mounted) {
    this.person = buildHuman(rng, 'bandit', 0);
    this.root = new THREE.Group();
    this.mounted = mounted;
    if (mounted) {
      this.horse = buildHorse(rng);
      this.horseSeed = (rng() * 1e9) | 0;
      this.root.add(this.horse.group);
      this.horse.group.add(this.person.group);
      this.person.group.position.set(0, 0.72, -0.05);
      this.person.legs.forEach((l, i) => l.rotation.set(-0.5, 0, i ? -0.45 : 0.45));
    } else {
      this.root.add(this.person.group);
    }
    this.root.userData.bandit = this;
    this.pos = this.root.position;
    this.heading = rng() * Math.PI * 2;
    this.hp = 14;
    this.state = 'idle';
    this.aimT = -Math.random();
    this.atkCd = 0;
    this.speed = 0;
    this.strafe = rng() < 0.5 ? 1 : -1;
    this.strafeT = 2;
    this.phase = rng() * 10;
    this.target = null;
    this.retargetT = 0;
    this.lostT = 0;
    this.dead = false; this.deadT = 0;
    this.bubble = null; this.bubbleT = 0; this.bubbleCd = 0;
    this.sit = !mounted && rng() < 0.5;
  }
}

export class Bandits {
  constructor(scene, world, save) {
    this.scene = scene;
    this.world = world;
    this.list = [];
    this.campCache = new Map();
    this.active = new Map();
    this.cleared = { ...(save?.clearedCamps || {}) };
    this.discovered = new Set(save?.discoveredCamps || []);
    this.ambushT = 40;
    this.onDeath = null;
  }

  roots() { return this.list.filter((b) => !b.dead).map((b) => b.root); }

  // ---------- camps ----------
  camp(cx, cz) {
    const key = cx * 100003 + cz;
    if (!this.campCache.has(key)) this.campCache.set(key, this.genCamp(cx, cz));
    return this.campCache.get(key);
  }

  genCamp(cx, cz) {
    const w = this.world;
    const rng = makeRng((Math.imul(cx, 2246822519) ^ Math.imul(cz, 326648991) ^ w.seed ^ 0xb4d17) >>> 0);
    if (rng() > 0.5) return null;
    for (let tries = 0; tries < 8; tries++) {
      const x = (cx + 0.1 + rng() * 0.8) * TOWN_CELL, z = (cz + 0.1 + rng() * 0.8) * TOWN_CELL;
      const h = w.heightAt(x, z);
      if (h < WATER + 2.5 || h > 46) continue;
      let flat = true;
      for (let a = 0; a < 4 && flat; a++) if (Math.abs(w.heightAt(x + Math.cos(a * 1.57) * 7, z + Math.sin(a * 1.57) * 7) - h) > 2.2) flat = false;
      if (!flat) continue;
      let nearTown = false;
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        const t = w.towns.get(cx + dx, cz + dz);
        if (t && Math.hypot(t.x - x, t.z - z) < t.R + 80) nearTown = true;
      }
      if (nearTown || w.roads.onRoad(x, z) < 20) continue;
      return { id: `${cx},${cz}`, x, z, y: h, n: 3 + Math.floor(rng() * 3), mounted: rng() < 0.6 ? 1 : 0, seed: (rng() * 1e9) | 0 };
    }
    return null;
  }

  campsNear(x, z, cells = 1) {
    const out = [];
    const cx = Math.floor(x / TOWN_CELL), cz = Math.floor(z / TOWN_CELL);
    for (let dx = -cells; dx <= cells; dx++) for (let dz = -cells; dz <= cells; dz++) {
      const c = this.camp(cx + dx, cz + dz);
      if (c) out.push(c);
    }
    return out;
  }

  isCleared(c, days) { return this.cleared[c.id] !== undefined && days - this.cleared[c.id] < 2; }

  activateCamp(c) {
    const w = this.world, rng = makeRng(c.seed);
    const g = new THREE.Group();
    const place = (m, x, z, yo = 0) => { m.position.set(c.x + x, w.groundY(c.x + x, c.y + 3, c.z + z) + yo, c.z + z); g.add(m); return m; };
    const tents = 2 + Math.floor(rng() * 2);
    for (let i = 0; i < tents; i++) {
      const a = (i / tents) * Math.PI * 2 + 0.4;
      const t = place(new THREE.Mesh(CONE4, TENT[i % 3]), Math.cos(a) * 5, Math.sin(a) * 5, 0.95);
      t.rotation.y = Math.PI / 4 + a;
    }
    for (let i = 0; i < 3; i++) {
      const l = place(new THREE.Mesh(CYL, LOG), 0, 0, 0.12);
      l.scale.set(0.15, 0.9, 0.15); l.rotation.set(0, (i * Math.PI) / 3, Math.PI / 2 - 0.2);
    }
    const f1 = place(new THREE.Mesh(CONE, FLAME), 0, 0, 0.45); f1.scale.set(0.45, 0.8, 0.45);
    const f2 = place(new THREE.Mesh(CONE, FLAME2), 0, 0, 0.35); f2.scale.set(0.25, 0.5, 0.25);
    for (let i = 0; i < 3; i++) {
      const cr = place(new THREE.Mesh(BOX, CRATE), 2.5 + i * 0.7, -2.6 + (i % 2) * 0.6, 0.3);
      cr.scale.setScalar(0.6); cr.rotation.y = rng() * 2;
    }
    this.scene.add(g);
    const state = { camp: c, group: g, flames: [f1, f2], members: [] };
    for (let i = 0; i < c.n; i++) {
      const mounted = i < c.mounted;
      const a = (i / c.n) * Math.PI * 2;
      const b = this.spawnAt(c.x + Math.cos(a) * 2.6, c.z + Math.sin(a) * 2.6, mounted, rng);
      b.camp = c; b.home = [c.x, c.z]; b.heading = Math.atan2(-Math.cos(a), -Math.sin(a));
      state.members.push(b);
    }
    this.active.set(c.id, state);
  }

  deactivateCamp(state) {
    this.scene.remove(state.group);
    for (const b of state.members) if (this.list.includes(b)) this.remove(b);
    this.active.delete(state.camp.id);
  }

  spawnAt(x, z, mounted, rng = Math.random) {
    const b = new Bandit(rng, mounted);
    const y = this.world.groundY(x, this.world.heightAt(x, z) + 3, z);
    b.pos.set(x, isFinite(y) ? y : this.world.heightAt(x, z), z);
    this.list.push(b);
    this.scene.add(b.root);
    return b;
  }

  remove(b) {
    this.clearBubble(b);
    this.scene.remove(b.root);
    const i = this.list.indexOf(b);
    if (i >= 0) this.list.splice(i, 1);
  }

  // Raiders appearing by a road, optionally going after a traveller.
  spawnAmbush(x, z, n, mountedCount, focus) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 6;
      const b = this.spawnAt(x + Math.cos(a) * r, z + Math.sin(a) * r, i < mountedCount);
      b.raider = true; b.state = 'fight'; b.focus = focus || null; b.sit = false;
      if (i === 0) this.say(b, pickL(focus ? LINES.raid : LINES.alert));
      out.push(b);
    }
    return out;
  }

  // ---------- speech ----------
  say(b, text, dur = 2.4) {
    this.clearBubble(b);
    b.bubble = makeBubble(text);
    b.person.group.add(b.bubble);
    b.bubbleT = dur;
    b.bubbleCd = dur + 3;
  }
  clearBubble(b) {
    if (!b.bubble) return;
    b.bubble.parent.remove(b.bubble);
    b.bubble.material.map.dispose();
    b.bubble.material.dispose();
    b.bubble = null;
  }

  alertCamp(b) {
    for (const o of this.list) {
      if (o.dead || o.state !== 'idle') continue;
      if ((b.camp && o.camp === b.camp) || o.pos.distanceTo(b.pos) < 30) { o.state = 'fight'; o.sit = false; }
    }
  }

  hit(b, dmg, dir) {
    if (b.dead) return;
    b.hp -= dmg;
    b.knock = (b.knock || 0) + 1;
    if (b.state === 'idle') this.say(b, pickL(LINES.alert));
    else if (Math.random() < 0.4) this.say(b, pickL(LINES.hurt), 1.5);
    b.state = b.hp <= 4 && Math.random() < 0.5 ? 'flee' : 'fight';
    if (b.state === 'flee') { b.fleeT = 14; this.say(b, pickL(LINES.flee)); }
    b.sit = false;
    b.target = 'player';
    this.alertCamp(b);
    if (b.hp <= 0) {
      b.dead = true; b.deadT = 0; b.state = 'dead';
      this.clearBubble(b);
      if (this.onDeath) this.onDeath(b);
    }
  }

  // ---------- per-frame ----------
  update(dt, ctx) {
    const p = ctx.player.pos, w = this.world;
    // Camps come and go with distance.
    for (const c of this.campsNear(p.x, p.z)) {
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d < 100 && !this.discovered.has(c.id)) { this.discovered.add(c.id); ctx.toast('You spotted a bandit camp'); }
      if (d < 170 && !this.active.has(c.id) && !this.isCleared(c, ctx.days)) this.activateCamp(c);
    }
    for (const st of this.active.values()) {
      const c = st.camp, d = Math.hypot(c.x - p.x, c.z - p.z);
      const f = 1 + Math.sin(performance.now() / 90 + c.seed) * 0.1;
      st.flames[0].scale.set(0.45 * f, 0.8 * (2 - f), 0.45 * f);
      if (d > 250) { this.deactivateCamp(st); continue; }
      if (st.members.length && st.members.every((b) => b.dead || !this.list.includes(b) || b.state === 'flee')) {
        if (this.cleared[c.id] === undefined || !this.isCleared(c, ctx.days)) {
          this.cleared[c.id] = ctx.days;
          ctx.toast('Bandit camp cleared');
          if (this.onCampCleared) this.onCampCleared(c);
        }
      }
    }
    // Roadside ambushes.
    this.ambushT -= dt;
    if (this.ambushT <= 0) {
      this.ambushT = 45 + Math.random() * 30;
      const onRoad = w.roads.onRoad(p.x, p.z) < 10;
      const nt = ctx.towns.nearest(p.x, p.z);
      const farFromTown = !nt || nt.dist > nt.town.R + 60;
      if (farFromTown && this.list.filter((b) => !b.dead).length < 6) {
        const tr = ctx.travelers.list.find((t) => !t.dead && !t.escort && t.leg === 'road' && t.horseRoot.position.distanceTo(p) < 110);
        if (tr && Math.random() < 0.25) {
          const hp = tr.horseRoot.position;
          this.spawnAmbush(hp.x + Math.sin(tr.heading) * 30 + Math.cos(tr.heading) * 10, hp.z + Math.cos(tr.heading) * 30 - Math.sin(tr.heading) * 10, 2 + Math.floor(Math.random() * 2), 1, tr);
        } else if (onRoad && Math.random() < 0.2) {
          const yaw = ctx.player.yaw;
          const ax = p.x - Math.sin(yaw) * 55 + Math.cos(yaw) * 14, az = p.z - Math.cos(yaw) * 55 - Math.sin(yaw) * 14;
          if (w.isReadyAt(ax, az)) this.spawnAmbush(ax, az, 2 + Math.floor(Math.random() * 2), Math.random() < 0.5 ? 1 : 0, null);
        }
      }
    }

    for (const b of this.list.slice()) {
      if (b.bubble) { b.bubbleT -= dt; if (b.bubbleT <= 0) this.clearBubble(b); }
      b.bubbleCd -= dt; b.atkCd -= dt;
      if (b.dead) {
        b.deadT += dt;
        b.root.rotation.z = Math.min(Math.PI / 2, b.deadT * 4);
        if (b.deadT > 30) this.remove(b);
        continue;
      }
      const dp = b.pos.distanceTo(p);
      if (dp > 260 || (b.raider && dp > 160 && b.state !== 'fight')) { this.remove(b); continue; }
      this.think(b, dt, ctx, dp);
      this.animate(b, dt, ctx);
    }
  }

  pickTarget(b, ctx, dp) {
    const p = ctx.player;
    let best = null, bd = Infinity;
    if (!ctx.creative && dp < (b.state === 'fight' ? 60 : 32)) { best = 'player'; bd = dp * (b.target === 'player' ? 0.6 : 0.8); }
    for (const t of ctx.travelers.list) {
      if (t.dead) continue;
      const d = t.horseRoot.position.distanceTo(b.pos);
      const score = d * (b.focus === t ? 0.5 : 1);
      if (d < 45 && score < bd) { bd = score; best = t; }
    }
    return best;
  }

  think(b, dt, ctx, dp) {
    const w = this.world, p = ctx.player.pos;
    b.retargetT -= dt;
    if (b.retargetT <= 0) {
      b.retargetT = 0.6;
      const t = this.pickTarget(b, ctx, dp);
      if (b.state === 'idle' && t) {
        tmpA.set(b.pos.x, b.pos.y + 1.5, b.pos.z);
        const tp = t === 'player' ? p : t.horseRoot.position;
        tmpB.set(tp.x, tp.y + 1.5, tp.z);
        if (dp < 14 || clearLine(w, [], tmpA, tmpB)) {
          b.state = 'fight'; b.sit = false;
          this.say(b, pickL(t === 'player' ? LINES.alert : LINES.raid));
          this.alertCamp(b);
        }
      }
      b.target = b.state === 'fight' ? t : null;
    }
    let goalX = 0, goalZ = 0, speed = 0;
    const tgt = b.target;
    const tp = tgt === 'player' ? p : tgt ? tgt.horseRoot.position : null;

    if (b.state === 'flee') {
      b.fleeT -= dt;
      goalX = b.pos.x - p.x; goalZ = b.pos.z - p.z; speed = b.mounted ? 10 : 4.5;
      if (b.fleeT <= 0 && dp > 60) { this.remove(b); return; }
    } else if (b.state === 'fight' && tp) {
      // Never follow into a town: the guards would have them.
      const inTown = ctx.towns.current(tp.x, tp.z);
      const dx = tp.x - b.pos.x, dz = tp.z - b.pos.z, d = Math.hypot(dx, dz) || 1;
      if (inTown && d > 8) { goalX = -dx; goalZ = -dz; speed = b.mounted ? 7 : 3.5; b.lostT += dt; }
      else {
        const keep = b.mounted ? 10 : 12;
        b.strafeT -= dt;
        if (b.strafeT <= 0) { b.strafeT = 2 + Math.random() * 2.5; if (Math.random() < 0.5) b.strafe *= -1; }
        if (d > keep + 5) { goalX = dx; goalZ = dz; speed = b.mounted ? 9 : 3.8; }
        else if (d < keep - 5 && !b.mounted) { goalX = -dx; goalZ = -dz; speed = 3; }
        else { goalX = -dz * b.strafe + dx * 0.2; goalZ = dx * b.strafe + dz * 0.2; speed = b.mounted ? 7 : 2.2; }
        // Aim and fire.
        tmpA.set(b.pos.x, b.pos.y + (b.mounted ? 2.3 : 1.5), b.pos.z);
        tmpB.set(tp.x, tp.y + (tgt === 'player' ? 1.4 : 1.2), tp.z);
        const sees = d < 34 && clearLine(w, [], tmpA, tmpB);
        if (sees) {
          b.lostT = 0;
          b.aiming = true;
          b.aimT += dt;
          if (b.aimT > 1.4) {
            b.aimT = -1.5 - Math.random() * 1.5;
            const tv = tgt === 'player' ? Math.hypot(ctx.player.vel.x, ctx.player.vel.z) : tgt.speed;
            const chance = Math.max(0.1, 0.5 - d * 0.012 - (tv > 6 ? 0.25 : tv > 3 ? 0.12 : 0) - (b.mounted && b.speed > 4 ? 0.12 : 0));
            const hit = Math.random() < chance;
            const end = tmpB.clone();
            if (!hit) end.add(new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 1.5, (Math.random() - 0.5) * 3));
            const mz = this.muzzle(b, tmpC);
            ctx.gunFx(mz, end);
            if (hit) {
              if (tgt === 'player') ctx.damage(3, 'Shot by a bandit', b.pos);
              else ctx.travelers.hit(tgt, 4, tmpB.clone().sub(tmpA).normalize(), ctx, true);
            }
          }
        } else { b.lostT += dt; b.aimT = Math.min(b.aimT, 0); }
        if (!b.mounted && d < 1.8 && b.atkCd <= 0 && tgt === 'player') { b.atkCd = 1.2; ctx.damage(3, 'Beaten by a bandit', b.pos); }
      }
      if (b.lostT > 25) { b.state = b.raider ? 'flee' : 'idle'; b.fleeT = 20; b.lostT = 0; }
    } else if (b.state === 'fight') {
      b.lostT += dt;
      if (b.lostT > 8) { b.state = b.raider ? 'flee' : 'idle'; b.fleeT = 20; b.lostT = 0; }
    } else if (b.home) {
      // Idle at camp: drift back towards the fire.
      const hx = b.home[0] - b.pos.x, hz = b.home[1] - b.pos.z, hd = Math.hypot(hx, hz);
      if (hd > 4) { goalX = hx; goalZ = hz; speed = b.mounted ? 3 : 1.5; }
    }

    if (speed > 0) b.heading += angDiff(b.heading, Math.atan2(goalX, goalZ)) * Math.min(1, dt * 5);
    if (b.target && b.aiming) {
      const tp2 = tp;
      if (tp2 && (!b.mounted || speed < 4)) b.heading += angDiff(b.heading, Math.atan2(tp2.x - b.pos.x, tp2.z - b.pos.z)) * Math.min(1, dt * 6);
    }
    b.speed += (speed - b.speed) * Math.min(1, dt * 3);
    const step = b.speed * dt;
    if (step > 1e-4) {
      const mx = Math.sin(Math.atan2(goalX, goalZ)), mz = Math.cos(Math.atan2(goalX, goalZ));
      const nx = b.pos.x + mx * step, nz = b.pos.z + mz * step;
      const g = w.groundY(nx, b.pos.y + 1, nz);
      if (isFinite(g) && g - b.pos.y < step * 1.5 + 0.08 && g > WATER - 1) { b.pos.x = nx; b.pos.z = nz; b.pos.y = g; }
      else { b.strafe *= -1; b.speed *= 0.3; }
    } else {
      const g = w.groundY(b.pos.x, b.pos.y + 1, b.pos.z);
      if (isFinite(g)) b.pos.y = g;
    }
  }

  muzzle(b, out) {
    const h = b.heading, y = b.mounted ? 2.2 : 1.42;
    return out.set(b.pos.x + Math.sin(h) * 0.9 + Math.cos(h) * 0.3, b.pos.y + y, b.pos.z + Math.cos(h) * 0.9 - Math.sin(h) * 0.3);
  }

  animate(b, dt, ctx) {
    const m = b.person;
    b.root.rotation.y = b.heading;
    b.phase += dt * (b.speed * (b.mounted ? 2.3 : 3.2) + 0.5);
    if (b.mounted) {
      const h = b.horse, gallop = b.speed > 6, amp = Math.min(1, b.speed / 3) * (gallop ? 0.75 : 0.4);
      const a = Math.sin(b.phase) * amp, c = Math.sin(b.phase + (gallop ? 0.9 : Math.PI)) * amp;
      h.legs[0].rotation.x = a; h.legs[3].rotation.x = a * 0.85; h.legs[1].rotation.x = c; h.legs[2].rotation.x = c * 0.85;
      h.group.position.y = gallop ? Math.abs(Math.sin(b.phase)) * 0.12 : 0;
    } else {
      const sw = b.speed > 0.2 ? Math.sin(b.phase) * Math.min(1, b.speed / 1.5) * 0.7 : 0;
      m.legs[0].rotation.x = sw; m.legs[1].rotation.x = -sw;
      m.body.position.y = b.sit && b.state === 'idle' ? -0.45 : 0;
      if (b.sit && b.state === 'idle') { m.legs[0].rotation.x = m.legs[1].rotation.x = -1.4; }
    }
    if (b.aiming) { m.arms[1].rotation.set(-Math.PI / 2, 0, 0); m.arms[0].rotation.set(-1.25, 0, 0.5); }
    else { m.arms[1].rotation.set(-0.2, 0, 0); m.arms[0].rotation.set(b.state === 'idle' ? -0.3 : -0.6, 0, 0); }
    b.aiming = false;
    m.lantern.visible = false;
  }

  serialize() {
    return { clearedCamps: this.cleared, discoveredCamps: [...this.discovered] };
  }
}
