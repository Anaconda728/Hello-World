// Unstable cliffs: digging into a cliff face or under an overhang sometimes
// shakes loose a slab of terrain that tumbles down as boulders.
import * as THREE from 'three';
import { WATER, MAT_INFO } from './constants.js';

const ROCK = new THREE.IcosahedronGeometry(1, 1);
const DUST = new THREE.IcosahedronGeometry(1, 1);
const rockMats = new Map();
const rockMat = (m) => {
  if (!rockMats.has(m)) {
    const c = new THREE.Color(MAT_INFO[m]?.color ?? 0x8d8e93).multiplyScalar(0.85);
    rockMats.set(m, new THREE.MeshLambertMaterial({ color: c, flatShading: true }));
  }
  return rockMats.get(m);
};

const g = new THREE.Vector3(), n = new THREE.Vector3(), tmp = new THREE.Vector3(), axis = new THREE.Vector3();
const q = new THREE.Quaternion();

export class Hazards {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.pending = [];
    this.boulders = [];
    this.puffs = [];
    this.shake = 0;
  }

  // Called after the player digs. `normal` points out of the terrain.
  onDig(point, normal, brush, ctx) {
    const w = this.world;
    const steep = normal.y < 0.55, ceiling = normal.y < -0.3;
    if (!steep) return;
    if (this.pending.some((p) => p.p.distanceTo(point) < 6)) return;
    // How much solid ground hangs above the dig?
    let over = 0;
    for (let k = 1; k <= 6; k++) {
      if (w.sample(point.x - normal.x, point.y + brush + k * 0.8, point.z - normal.z) > 0) over++;
    }
    if (over < 2) return;
    const chance = ceiling ? 0.55 : 0.18 + over * 0.07;
    if (Math.random() > chance) return;
    this.pending.push({ t: 1.0, p: point.clone(), n: normal.clone(), over, brush });
    this.shake = Math.max(this.shake, 0.35);
    ctx.toast('The cliff groans…');
  }

  collapse(ev, ctx) {
    const w = this.world;
    const hn = tmp.set(ev.n.x, 0, ev.n.z);
    if (hn.lengthSq() < 1e-4) hn.set(1, 0, 0); else hn.normalize();
    const S = 1.8 + ev.over * 0.3 + Math.random() * 0.8;
    const C = ev.p.clone().addScaledVector(hn, -S * 0.45);
    C.y += ev.brush + S * 0.6;
    const counts = w.edit(0, C.x, C.y, C.z, S, 0);
    let removed = 0, mat = 3, best = 0;
    for (let i = 1; i < counts.length; i++) {
      removed += counts[i];
      if (counts[i] > best) { best = counts[i]; mat = i; }
    }
    if (mat === 6) mat = 3;
    if (removed < 5) return;
    const count = Math.max(1, Math.min(5, Math.round(removed / 30)));
    const rb = Math.max(0.6, Math.min(1.6, Math.cbrt((removed * 0.6 / count) * 3 / (4 * Math.PI))));
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(ROCK, rockMat(mat));
      const r = rb * (0.85 + Math.random() * 0.3);
      mesh.scale.set(r * (0.9 + Math.random() * 0.2), r * (0.8 + Math.random() * 0.2), r * (0.9 + Math.random() * 0.2));
      mesh.position.set(
        C.x + hn.x * S * 0.8 + (Math.random() - 0.5) * S * 0.6,
        C.y + (Math.random() - 0.5) * S * 0.5,
        C.z + hn.z * S * 0.8 + (Math.random() - 0.5) * S * 0.6,
      );
      mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      this.scene.add(mesh);
      this.boulders.push({
        mesh, r, mat, pos: mesh.position, life: 0, rest: 0, hitCd: 0, hitList: new Set(),
        vel: new THREE.Vector3(hn.x * (3 + Math.random() * 2.5), Math.random() * 1.5, hn.z * (3 + Math.random() * 2.5)),
      });
    }
    this.puff(C, S);
    this.shake = Math.max(this.shake, 0.7);
    ctx.toast('Rockslide!');
  }

  puff(pos, size) {
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(DUST, new THREE.MeshBasicMaterial({ color: 0xb8ad9a, transparent: true, opacity: 0.45, depthWrite: false }));
      m.position.set(pos.x + (Math.random() - 0.5) * size, pos.y + (Math.random() - 0.5) * size, pos.z + (Math.random() - 0.5) * size);
      m.scale.setScalar(size * 0.3);
      this.scene.add(m);
      this.puffs.push({ m, t: 0, s: size * (0.5 + Math.random() * 0.4) });
    }
  }

  update(dt, ctx) {
    const w = this.world;
    this.shake = Math.max(0, this.shake - dt * 0.8);

    for (const ev of this.pending.slice()) {
      ev.t -= dt;
      if (ev.t <= 0) {
        this.pending.splice(this.pending.indexOf(ev), 1);
        this.collapse(ev, ctx);
      }
    }

    for (const p of this.puffs.slice()) {
      p.t += dt;
      p.m.scale.setScalar(p.s * (0.6 + p.t));
      p.m.position.y += dt * 0.6;
      p.m.material.opacity = 0.45 * Math.max(0, 1 - p.t / 1.4);
      if (p.t > 1.4) {
        this.scene.remove(p.m);
        p.m.material.dispose();
        this.puffs.splice(this.puffs.indexOf(p), 1);
      }
    }

    const player = ctx.player;
    for (const b of this.boulders.slice()) {
      b.life += dt;
      b.hitCd -= dt;
      if (!w.getChunk(Math.floor(b.pos.x / 32), Math.floor(b.pos.z / 32))) { this.removeBoulder(b); continue; }
      const steps = 3, h = dt / steps;
      let grounded = false;
      for (let s = 0; s < steps; s++) {
        b.vel.y -= 22 * h;
        if (b.pos.y < WATER) b.vel.multiplyScalar(1 - Math.min(1, 2.5 * h));
        b.pos.addScaledVector(b.vel, h);
        const d = w.sample(b.pos.x, b.pos.y, b.pos.z);
        if (d < -b.r - 1) continue;
        w.gradient(b.pos.x, b.pos.y, b.pos.z, g);
        const gl = g.length();
        if (gl < 1e-5) { b.pos.y += 0.3; continue; }
        const pen = d / gl + b.r;
        if (pen <= 0) continue;
        n.copy(g).multiplyScalar(-1 / gl);
        b.pos.addScaledVector(n, pen);
        const vn = b.vel.dot(n);
        if (vn < 0) b.vel.addScaledVector(n, -vn * 1.25);
        b.vel.multiplyScalar(1 - Math.min(1, 0.8 * h));
        grounded = true;
      }
      // Roll.
      const sp = b.vel.length();
      axis.set(b.vel.z, 0, -b.vel.x);
      if (axis.lengthSq() > 1e-6) {
        q.setFromAxisAngle(axis.normalize(), (sp * dt) / b.r);
        b.mesh.quaternion.premultiply(q);
      }
      // Hurt anything it hits.
      if (sp > 2.5) {
        const fy = Math.max(player.pos.y + 0.4, Math.min(player.pos.y + 1.4, b.pos.y));
        const dist = tmp.set(player.pos.x, fy, player.pos.z).distanceTo(b.pos);
        if (dist < b.r + 0.45 && b.hitCd <= 0) {
          b.hitCd = 1;
          ctx.damage(Math.round(Math.min(16, sp * 1.4 * b.r)), 'Crushed by a rockslide', b.pos);
        }
        for (const c of ctx.creatures.list) {
          if (c.dead || b.hitList.has(c)) continue;
          if (c.pos.distanceTo(b.pos) < b.r + c.def.r + 0.2) {
            b.hitList.add(c);
            ctx.creatures.hit(c, Math.min(20, sp * 2 * b.r), tmp.copy(b.vel).normalize(), ctx);
          }
        }
      }
      b.rest = grounded && sp < 0.7 ? b.rest + dt : 0;
      if (b.rest > 0.5 || b.life > 14) {
        w.edit(1, b.pos.x, b.pos.y, b.pos.z, b.r * 0.95, b.mat);
        this.puff(b.pos, b.r);
        this.removeBoulder(b);
      }
    }
  }

  removeBoulder(b) {
    this.scene.remove(b.mesh);
    this.boulders.splice(this.boulders.indexOf(b), 1);
  }
}
