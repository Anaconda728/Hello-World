// First-person on foot through the streets you built.
import * as THREE from 'three';
import { resolveCircle } from './collide.js';

const EYE = 1.7;

export class WalkMode {
  constructor(ctx) {
    this.ctx = ctx;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.keys = new Set();
    this.bob = 0;
    const dom = ctx.renderer.domElement;
    dom.addEventListener('click', () => { if (this.active && document.pointerLockElement !== dom) dom.requestPointerLock?.(); });
    document.addEventListener('pointerlockchange', () => {
      document.body.classList.toggle('unlocked', this.active && document.pointerLockElement !== dom);
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.active || document.pointerLockElement !== dom) return;
      this.yaw -= e.movementX * 0.0022;
      this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * 0.0022, -1.5, 1.5);
    });
    window.addEventListener('keydown', (e) => { if (this.active) this.keys.add(e.code); });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  enter({ x, z, yaw = 0 }) {
    this.active = true;
    this.pos.set(x, 0, z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw; this.pitch = 0.08;
    const cam = this.ctx.camera;
    cam.fov = 72; cam.updateProjectionMatrix();
    this.ctx.scene.fog.density = 0.0042;
    const dom = this.ctx.renderer.domElement;
    dom.requestPointerLock?.();
    document.body.classList.toggle('unlocked', document.pointerLockElement !== dom);
  }
  exit() {
    this.active = false;
    this.keys.clear();
    if (document.pointerLockElement) document.exitPointerLock();
    document.body.classList.remove('unlocked');
  }

  update(dt) {
    const k = this.keys;
    const run = k.has('ShiftLeft') || k.has('ShiftRight');
    const speed = run ? 9 : 4.2;
    let mx = 0, mz = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) mz += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) mz -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
    const len = Math.hypot(mx, mz) || 1;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    const wantX = (fx * mz + rx * mx) / len * speed, wantZ = (fz * mz + rz * mx) / len * speed;
    const a = 1 - Math.exp(-dt * (this.pos.y > 0 ? 2 : 12));
    this.vel.x += (wantX - this.vel.x) * a;
    this.vel.z += (wantZ - this.vel.z) * a;
    if (k.has('Space') && this.pos.y <= 0) this.vel.y = 5.2;
    this.vel.y -= 16 * dt;
    this.pos.addScaledVector(this.vel, dt);
    if (this.pos.y < 0) { this.pos.y = 0; this.vel.y = 0; }
    resolveCircle(this.pos, 0.45, this.ctx.city.obstaclesNear(this.pos.x, this.pos.z));

    const moving = Math.hypot(this.vel.x, this.vel.z);
    this.bob += moving * dt * 1.9;
    const bobY = this.pos.y <= 0 ? Math.sin(this.bob) * 0.05 * Math.min(1, moving / 4) : 0;
    const cam = this.ctx.camera;
    cam.position.set(this.pos.x, this.pos.y + EYE + bobY + 0.2, this.pos.z);
    cam.rotation.set(0, 0, 0);
    cam.rotation.order = 'YXZ';
    cam.rotation.y = this.yaw;
    cam.rotation.x = this.pitch;
    this.ctx.audio.setEngine(0);
  }
}
