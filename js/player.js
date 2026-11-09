// First-person movement with collision against the smooth density field.
import * as THREE from 'three';
import { WATER } from './constants.js';
import { pushOut } from './towns.js';

const RADIUS = 0.4;
const SPHERES = [0.4, 0.9, 1.4];   // collision sphere heights above the feet
export const EYE = 1.62;

const fwd = new THREE.Vector3(), right = new THREE.Vector3(), wish = new THREE.Vector3();
const c = new THREE.Vector3(), g = new THREE.Vector3(), n = new THREE.Vector3();

export class Player {
  constructor(world) {
    this.world = world;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.grounded = false;
    this.flying = false;
    this.inWater = false;
    this.headUnder = false;
    this.health = 20;
    this.maxHealth = 20;
    this.fallImpact = 0;   // strongest landing speed since last read
  }

  update(dt, keys) {
    fwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const mz = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const mx = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    wish.set(0, 0, 0).addScaledVector(fwd, mz).addScaledVector(right, mx);
    if (wish.lengthSq() > 0) wish.normalize();
    const jump = keys.has('Space');
    const shift = keys.has('ShiftLeft') || keys.has('ShiftRight');

    this.inWater = this.pos.y + 0.8 < WATER;
    const v = this.vel;

    if (this.flying) {
      const speed = 16;
      const k = 1 - Math.exp(-10 * dt);
      v.x += (wish.x * speed - v.x) * k;
      v.z += (wish.z * speed - v.z) * k;
      v.y += (((jump ? 1 : 0) - (shift ? 1 : 0)) * speed - v.y) * k;
    } else {
      let speed = shift ? 7.2 : 4.4;
      if (this.inWater) speed *= 0.6;
      const accel = this.grounded ? 14 : this.inWater ? 4 : 2.5;
      const k = Math.min(1, accel * dt);
      v.x += (wish.x * speed - v.x) * k;
      v.z += (wish.z * speed - v.z) * k;
      if (this.inWater) {
        v.y -= 6 * dt;
        v.y *= 1 - Math.min(1, 2.5 * dt);
        if (jump) v.y = Math.min(v.y + 22 * dt, 3.6);
      } else {
        v.y -= 25 * dt;
        if (jump && this.grounded) v.y = 8.3;
      }
      if (v.y < -50) v.y = -50;
    }

    this.grounded = false;
    const steps = Math.max(1, Math.ceil(dt * 90));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.pos.addScaledVector(v, h);
      this.collide();
    }
    this.headUnder = this.pos.y + EYE < WATER;
  }

  collide() {
    const w = this.world, p = this.pos, v = this.vel;
    for (let iter = 0; iter < 4; iter++) {
      let moved = false;
      for (const oy of SPHERES) {
        c.set(p.x, p.y + oy, p.z);
        const d = w.sample(c.x, c.y, c.z);
        if (d < -1.5) continue;
        if (d > 3) { p.y += 0.5; moved = true; continue; }   // buried: pop up
        w.gradient(c.x, c.y, c.z, g);
        const gl = g.length();
        if (gl < 1e-5) continue;
        const pen = d / gl + RADIUS;
        if (pen <= 0) continue;
        n.copy(g).multiplyScalar(-1 / gl);            // points out of the ground
        if (n.y > 0.6) {
          p.y += pen / n.y;                           // walkable: resolve vertically, no sliding
          if (v.y < 0) {
            if (!this.flying && !this.inWater) this.fallImpact = Math.max(this.fallImpact, -v.y);
            v.y = 0;
          }
          this.grounded = true;
        } else {
          p.addScaledVector(n, pen);
          const vn = v.dot(n);
          if (vn < 0) v.addScaledVector(n, -vn);
        }
        moved = true;
      }
      if (!moved) break;
    }
    // Town buildings: push out sideways, or stand on flat tops.
    if (w.colliderProvider) {
      const cols = w.colliderProvider.colliders(p.x, p.z);
      for (const k of cols) {
        if (p.x > k.x0 && p.x < k.x1 && p.z > k.z0 && p.z < k.z1 && p.y < k.top && p.y > k.top - 0.45 && v.y <= 0) {
          p.y = k.top; v.y = 0; this.grounded = true;
        }
      }
      pushOut(p, RADIUS, 1.8, cols);
    }
    // Tree trunks.
    for (const t of w.nearbyTrees(p.x, p.z)) {
      if (p.y > t.y + t.th || p.y + 1.8 < t.y) continue;
      const dx = p.x - t.x, dz = p.z - t.z, dist = Math.hypot(dx, dz), min = 0.3 + RADIUS;
      if (dist < min && dist > 1e-4) {
        p.x = t.x + (dx / dist) * min;
        p.z = t.z + (dz / dist) * min;
      }
    }
  }
}
