// First-person on foot. The player is augmented: reflex dash, kinetic double jump,
// and an optic implant that scans whatever you look at.
import * as THREE from 'three';
import { resolveCircle } from './collide.js';
import { TILE } from '../config.js';

const EYE = 1.7;
const DASH_TIME = 0.22, DASH_SPEED = 24, DASH_CD = 1.4;

export class WalkMode {
  constructor(ctx) {
    this.ctx = ctx;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.keys = new Set();
    this.bob = 0;
    this.dash = 0; this.dashCd = 0; this.dashDir = new THREE.Vector2();
    this.doubleUsed = false;
    this.kick = 0;
    this.scanTimer = 0;
    const dom = ctx.renderer.domElement;
    dom.addEventListener('click', () => { if (this.active && !ctx.paused && document.pointerLockElement !== dom) dom.requestPointerLock?.(); });
    document.addEventListener('pointerlockchange', () => {
      document.body.classList.toggle('unlocked', this.active && document.pointerLockElement !== dom);
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.active || document.pointerLockElement !== dom) return;
      this.yaw -= e.movementX * 0.0022;
      this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * 0.0022, -1.5, 1.5);
    });
    window.addEventListener('keydown', (e) => {
      if (!this.active || ctx.paused) return;
      this.keys.add(e.code);
      if (e.repeat) return;
      if (e.code === 'Space' && this.pos.y > 0.05 && !this.doubleUsed) {
        this.doubleUsed = true;
        this.vel.y = 7.5;
        this.kick = 1;
        ctx.audio.blip(880);
      }
      if (e.code === 'KeyQ' && this.dashCd <= 0) this.startDash();
    });
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
    this.ctx.ui.setScan(null);
  }

  startDash() {
    const k = this.keys;
    let mx = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    let mz = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
    if (!mx && !mz) mz = 1;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw), rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    this.dashDir.set(fx * mz + rx * mx, fz * mz + rz * mx).normalize();
    this.dash = DASH_TIME;
    this.dashCd = DASH_CD;
    this.kick = 1.4;
    this.ctx.audio.blip(240);
  }

  // Optic implant: march along the view ray and report the first building hit.
  scan() {
    const cam = this.ctx.camera;
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    const p = cam.position.clone();
    for (let d = 2; d < 140; d += 1.5) {
      const x = p.x + dir.x * d, y = p.y + dir.y * d, z = p.z + dir.z * d;
      if (y < 0) break;
      const b = this.ctx.city.buildingAt(Math.floor(x / TILE), Math.floor(z / TILE));
      if (!b || y > b.height) continue;
      for (const [x0, z0, x1, z1] of b.rects) {
        if (x >= x0 - 0.5 && x <= x1 + 0.5 && z >= z0 - 0.5 && z <= z1 + 0.5) return { b, d };
      }
    }
    return null;
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
    this.dashCd = Math.max(0, this.dashCd - dt);
    if (this.dash > 0) {
      this.dash -= dt;
      this.vel.x = this.dashDir.x * DASH_SPEED;
      this.vel.z = this.dashDir.y * DASH_SPEED;
    } else {
      const a = 1 - Math.exp(-dt * (this.pos.y > 0 ? 2 : 12));
      this.vel.x += (wantX - this.vel.x) * a;
      this.vel.z += (wantZ - this.vel.z) * a;
    }
    if (k.has('Space') && this.pos.y <= 0) { this.vel.y = 5.4; this.doubleUsed = false; }
    this.vel.y -= 16 * dt;
    this.pos.addScaledVector(this.vel, dt);
    if (this.pos.y < 0) { this.pos.y = 0; this.vel.y = 0; this.doubleUsed = false; }
    resolveCircle(this.pos, 0.45, this.ctx.city.obstaclesNear(this.pos.x, this.pos.z));

    const moving = Math.hypot(this.vel.x, this.vel.z);
    this.bob += Math.min(moving, 10) * dt * 1.9;
    const bobY = this.pos.y <= 0 ? Math.sin(this.bob) * 0.05 * Math.min(1, moving / 4) : 0;
    const cam = this.ctx.camera;
    cam.position.set(this.pos.x, this.pos.y + EYE + bobY + 0.2, this.pos.z);
    cam.rotation.order = 'YXZ';
    cam.rotation.set(this.pitch, this.yaw, 0);
    this.kick = Math.max(0, this.kick - dt * 4);
    const fov = 72 + this.kick * 10 + (run ? 3 : 0);
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov += (fov - cam.fov) * Math.min(1, dt * 10); cam.updateProjectionMatrix(); }
    this.ctx.audio.setEngine(0);
    this.ctx.ui.setAugments(1 - this.dashCd / DASH_CD, !this.doubleUsed || this.pos.y <= 0);

    this.scanTimer -= dt;
    if (this.scanTimer <= 0) { this.scanTimer = 0.15; this.ctx.ui.setScan(this.scan()); }
  }
}
