// Rideable horses: the player's own horse and riderless horses left by bandits.
import * as THREE from 'three';
import { buildHorse } from './travelers.js';
import { makeRng } from './noise.js';

const SADDLE = new THREE.MeshLambertMaterial({ color: 0x5a3a22, flatShading: true });
const BAG = new THREE.MeshLambertMaterial({ color: 0x6a4a2a, flatShading: true });
const BUCKLE = new THREE.MeshLambertMaterial({ color: 0xb8954a });
const BOX = new THREE.BoxGeometry(1, 1, 1);
const angDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

class Horse {
  constructor(seed, owned) {
    this.seed = seed;
    this.model = buildHorse(makeRng(seed));
    const saddle = new THREE.Mesh(BOX, SADDLE);
    saddle.position.set(0, 1.58, -0.05);
    saddle.scale.set(0.58, 0.08, 0.6);
    this.model.group.add(saddle);
    this.root = new THREE.Group();
    this.root.add(this.model.group);
    this.root.userData.horse = this;
    this.pos = this.root.position;
    this.heading = 0;
    this.owned = owned;
    this.speed = 0;
    this.phase = Math.random() * 10;
    this.goal = null;          // where it is walking to (whistle)
    this.bags = null;          // saddlebag contents, once fitted
    this.rentUntil = null;     // rented horses go back to the stable
    this.wanderT = Math.random() * 5;
  }
}

export class Horses {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.list = [];
  }

  owned() { return this.list.find((h) => h.owned) || null; }

  add(x, y, z, owned, seed = (Math.random() * 1e9) | 0, heading = 0, bags = null) {
    if (owned) for (const h of this.list) h.owned = false;
    const h = new Horse(seed, owned);
    h.pos.set(x, y, z);
    h.heading = heading;
    this.scene.add(h.root);
    this.list.push(h);
    if (bags) this.fitBags(h, bags);
    return h;
  }

  remove(h) {
    this.scene.remove(h.root);
    this.list.splice(this.list.indexOf(h), 1);
  }

  roots() { return this.list.map((h) => h.root); }

  // Hang a pair of leather bags behind the saddle.
  fitBags(h, contents = {}) {
    h.bags = contents;
    if (h.bagMesh) return;
    const g = new THREE.Group();
    for (const s of [-1, 1]) {
      const m = new THREE.Mesh(BOX, BAG);
      m.position.set(s * 0.36, 1.32, -0.45); m.scale.set(0.16, 0.42, 0.5);
      const b = new THREE.Mesh(BOX, BUCKLE);
      b.position.set(s * 0.45, 1.38, -0.45); b.scale.set(0.02, 0.08, 0.1);
      g.add(m, b);
    }
    h.model.group.add(g);
    h.bagMesh = g;
  }

  nearest(pos, r) {
    let best = null, bd = r;
    for (const h of this.list) {
      const d = Math.hypot(h.pos.x - pos.x, h.pos.z - pos.z);
      if (d < bd && Math.abs(h.pos.y - pos.y) < 3) { bd = d; best = h; }
    }
    return best;
  }

  // Call your horse over.
  whistle(pos) {
    const h = this.owned();
    if (!h) return 'none';
    const d = h.pos.distanceTo(pos);
    if (d > 220) return 'far';
    h.goal = pos.clone();
    return 'coming';
  }

  update(dt, player, ctx) {
    const w = this.world;
    for (const h of this.list.slice()) {
      if (player.mounted === h) {
        // Ridden: the horse sits under the player and faces where they move.
        const v = player.vel, sp = Math.hypot(v.x, v.z);
        if (sp > 0.6) h.heading += angDiff(h.heading, Math.atan2(v.x, v.z)) * Math.min(1, dt * 8);
        h.pos.set(player.pos.x - Math.sin(h.heading) * 0.15, player.pos.y, player.pos.z - Math.cos(h.heading) * 0.15);
        h.speed = sp;
        h.airborne = !player.grounded && !player.inWater;
      } else {
        // Loose: graze, or trot to a whistle.
        let tx = 0, tz = 0, target = 0;
        if (h.goal) {
          tx = h.goal.x - h.pos.x; tz = h.goal.z - h.pos.z;
          const d = Math.hypot(tx, tz);
          if (d < 3.5) h.goal = null;
          else target = d > 25 ? 11 : 5;
        } else {
          h.wanderT -= dt;
          if (h.wanderT < 0) { h.wanderT = 4 + Math.random() * 8; h.wanderDir = Math.random() < 0.5 ? null : Math.random() * Math.PI * 2; }
          if (h.wanderDir !== null && h.wanderDir !== undefined && h.wanderT > 2) { tx = Math.sin(h.wanderDir); tz = Math.cos(h.wanderDir); target = 1.1; }
          if (!h.owned && Math.hypot(player.pos.x - h.pos.x, player.pos.z - h.pos.z) > 200) { this.remove(h); continue; }
        }
        if (target > 0) h.heading += angDiff(h.heading, Math.atan2(tx, tz)) * Math.min(1, dt * 5);
        h.speed += (target - h.speed) * Math.min(1, dt * 3);
        const nx = h.pos.x + Math.sin(h.heading) * h.speed * dt, nz = h.pos.z + Math.cos(h.heading) * h.speed * dt;
        const g = w.groundY(nx, h.pos.y + 1, nz);
        if (isFinite(g) && g - h.pos.y < Math.max(0.1, h.speed * dt * 1.4)) { h.pos.x = nx; h.pos.z = nz; h.pos.y = Math.max(g, ctx.water - 1.2); }
        else { h.speed = 0; h.wanderT = 0; }
        h.airborne = false;
      }
      h.root.rotation.y = h.heading;
      this.animate(h, dt);
    }
  }

  animate(h, dt) {
    const m = h.model, sp = h.speed;
    h.phase += dt * (sp * 2.2 + 0.3);
    const gallop = sp > 7, amp = Math.min(1, sp / 3) * (gallop ? 0.8 : 0.4);
    const a = Math.sin(h.phase) * amp, b = Math.sin(h.phase + (gallop ? 0.9 : Math.PI)) * amp;
    if (h.airborne) { m.legs[0].rotation.x = m.legs[1].rotation.x = -0.9; m.legs[2].rotation.x = m.legs[3].rotation.x = 0.8; }
    else {
      m.legs[0].rotation.x = a; m.legs[3].rotation.x = gallop ? a * 0.8 : a;
      m.legs[1].rotation.x = b; m.legs[2].rotation.x = gallop ? b * 0.8 : b;
    }
    m.head.rotation.x = sp < 0.3 ? 0.4 + Math.sin(h.phase * 0.25) * 0.2 : Math.sin(h.phase * 2) * 0.05;
    m.group.position.y = gallop && !h.airborne ? Math.abs(Math.sin(h.phase)) * 0.12 : 0;
  }

  serialize() {
    const h = this.owned();
    return h ? { x: h.pos.x, y: h.pos.y, z: h.pos.z, seed: h.seed, heading: h.heading, bags: h.bags, rentUntil: h.rentUntil } : null;
  }
}
