// Arcade hover-car: chase camera, drifting, boost, bumping off buildings.
import * as THREE from 'three';
import { resolveCircle } from './collide.js';
import { MAT } from '../materials.js';

function buildCar() {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: 0x0c0c14, roughness: 0.3, metalness: 0.85, envMapIntensity: 0.55 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x050a14, roughness: 0.05, metalness: 1, envMapIntensity: 2 });
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
  add(new THREE.BoxGeometry(2.1, 0.45, 4.8), paint, 0, 0.62, 0);
  add(new THREE.BoxGeometry(1.7, 0.42, 2.2), glass, 0, 1.04, -0.3);
  add(new THREE.BoxGeometry(1.9, 0.12, 1.2), paint, 0, 0.9, 1.7);
  add(new THREE.BoxGeometry(0.5, 0.35, 1.8), paint, -1.25, 0.5, -0.9);
  add(new THREE.BoxGeometry(0.5, 0.35, 1.8), paint, 1.25, 0.5, -0.9);
  add(new THREE.BoxGeometry(2.2, 0.08, 0.5), paint, 0, 1.15, -2.3); // spoiler
  add(new THREE.BoxGeometry(0.1, 0.3, 0.3), paint, -0.9, 1.0, -2.3);
  add(new THREE.BoxGeometry(0.1, 0.3, 0.3), paint, 0.9, 1.0, -2.3);
  add(new THREE.BoxGeometry(0.6, 0.1, 0.05), MAT.neon_white, -0.65, 0.7, 2.42);
  add(new THREE.BoxGeometry(0.6, 0.1, 0.05), MAT.neon_white, 0.65, 0.7, 2.42);
  add(new THREE.BoxGeometry(2.0, 0.08, 0.05), MAT.neon_red, 0, 0.75, -2.42);
  add(new THREE.BoxGeometry(0.04, 0.04, 4.4), MAT.neon_magenta, -1.07, 0.62, 0);
  add(new THREE.BoxGeometry(0.04, 0.04, 4.4), MAT.neon_magenta, 1.07, 0.62, 0);
  const under = add(new THREE.PlaneGeometry(4.4, 7), new THREE.MeshBasicMaterial({
    map: MAT.pool.map, color: new THREE.Color(0xff2bd6).multiplyScalar(1.2), transparent: true, opacity: 0.8,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }), 0, 0.06, 0);
  under.rotation.x = -Math.PI / 2;
  under.userData.under = true;
  // thruster glow
  for (const sx of [-1.25, 1.25]) add(new THREE.CircleGeometry(0.14, 12), MAT.dim_cyan, sx, 0.5, -1.81).rotation.y = Math.PI;
  return g;
}

export class DriveMode {
  constructor(ctx) {
    this.ctx = ctx;
    this.car = buildCar();
    this.body = new THREE.Group();
    this.body.add(this.car);
    this.body.visible = false;
    ctx.scene.add(this.body);

    this.head = new THREE.SpotLight(0xdde8ff, 0, 90, 0.48, 0.6, 1.6);
    this.head.position.set(0, 0.9, 2.2);
    this.head.target.position.set(0, 0, 18);
    this.body.add(this.head, this.head.target);
    this.glow = new THREE.PointLight(0xff2bd6, 0, 9, 2);
    this.glow.position.set(0, 0.3, 0);
    this.body.add(this.glow);

    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector2();
    this.heading = 0; this.steer = 0; this.boost = 1;
    this.camMode = 0;
    this.camPos = new THREE.Vector3();
    this.shake = 0;
    this.keys = new Set();
    window.addEventListener('keydown', (e) => {
      if (!this.active || this.ctx.paused) return;
      this.keys.add(e.code);
      if (e.code === 'KeyC') this.camMode = (this.camMode + 1) % 3;
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  enter({ x, z, heading = 0 }) {
    this.active = true;
    this.pos.set(x, 0, z);
    this.vel.set(0, 0);
    this.heading = heading;
    this.body.visible = true;
    this.head.intensity = 900;
    this.glow.intensity = 40;
    const fx = Math.sin(heading), fz = Math.cos(heading);
    this.camPos.set(x - fx * 10, 4, z - fz * 10);
    this.ctx.scene.fog.density = 0.0034;
  }
  exit() {
    this.active = false;
    this.keys.clear();
    this.head.intensity = 0;
    this.glow.intensity = 0;
    // leave the car parked where it is
  }
  hidePark() { this.body.visible = false; }

  update(dt, t) {
    const k = this.keys;
    const fwd = new THREE.Vector2(Math.sin(this.heading), Math.cos(this.heading));
    const right = new THREE.Vector2(-fwd.y, fwd.x);
    let vF = this.vel.dot(fwd), vL = this.vel.dot(right);

    const throttle = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const steerIn = (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0) - (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0);
    const hand = k.has('Space');
    const boosting = (k.has('ShiftLeft') || k.has('ShiftRight')) && this.boost > 0.02 && throttle > 0;
    this.boost = THREE.MathUtils.clamp(this.boost + (boosting ? -0.35 : 0.12) * dt, 0, 1);

    const maxF = boosting ? 95 : 62;
    if (throttle > 0) vF += (vF < 0 ? 40 : boosting ? 34 : 20) * dt * (1 - Math.max(0, vF) / maxF);
    else if (throttle < 0) vF -= (vF > 0 ? 38 : 12) * dt * (vF < -18 ? 0 : 1);
    vF *= Math.exp(-(throttle === 0 ? 0.5 : 0.12) * dt);
    if (hand) vF *= Math.exp(-0.9 * dt);

    this.steer += (steerIn - this.steer) * (1 - Math.exp(-dt * 8));
    const speedFactor = THREE.MathUtils.clamp(vF / 10, -1, 1);
    const yawRate = this.steer * speedFactor * (hand ? 2.6 : 1.9) * (1 - Math.min(Math.abs(vF) / 160, 0.5));
    this.heading += yawRate * dt;

    const grip = hand ? 1.1 : 7;
    vL *= Math.exp(-grip * dt);

    const nf = new THREE.Vector2(Math.sin(this.heading), Math.cos(this.heading));
    const nr = new THREE.Vector2(-nf.y, nf.x);
    this.vel.set(nf.x * vF + nr.x * vL, nf.y * vF + nr.y * vL);
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.y * dt;

    const hit = resolveCircle(this.pos, 1.5, this.ctx.city.obstaclesNear(this.pos.x, this.pos.z));
    if (hit) {
      const vn = this.vel.x * hit.x + this.vel.y * hit.z;
      if (vn < 0) {
        this.vel.x -= 1.4 * vn * hit.x;
        this.vel.y -= 1.4 * vn * hit.z;
        this.vel.multiplyScalar(0.7);
        if (vn < -6) { this.shake = Math.min(1, -vn / 30); this.ctx.audio.thud(Math.min(1, -vn / 40)); }
      }
    }

    // visuals: hover bob, lean into turns
    const speed = this.vel.length();
    this.body.position.set(this.pos.x, 0.25 + Math.sin(t * 3) * 0.06, this.pos.z);
    this.body.rotation.set(0, this.heading, 0);
    this.car.rotation.z = THREE.MathUtils.lerp(this.car.rotation.z, -vL * 0.02 - this.steer * speedFactor * 0.06, 0.2);
    this.car.rotation.x = THREE.MathUtils.lerp(this.car.rotation.x, -throttle * 0.03, 0.1);

    // camera
    const cam = this.ctx.camera;
    this.shake *= Math.exp(-dt * 6);
    const sh = this.shake;
    const jitter = () => (Math.random() - 0.5) * sh * 0.6;
    if (this.camMode === 2) {
      cam.position.set(this.pos.x + nf.x * 0.3, 1.45, this.pos.z + nf.y * 0.3);
      cam.lookAt(this.pos.x + nf.x * 20, 1.3, this.pos.z + nf.y * 20);
    } else {
      const back = this.camMode === 0 ? 9.5 : 18, up = this.camMode === 0 ? 3.4 : 7.5;
      const want = new THREE.Vector3(this.pos.x - nf.x * back, up, this.pos.z - nf.y * back);
      this.camPos.lerp(want, 1 - Math.exp(-dt * 6));
      const tmp = this.camPos.clone();
      resolveCircle(tmp, 0.8, this.ctx.city.obstaclesNear(tmp.x, tmp.z));
      this.camPos.x = tmp.x; this.camPos.z = tmp.z;
      cam.position.set(this.camPos.x + jitter(), this.camPos.y + jitter(), this.camPos.z + jitter());
      cam.lookAt(this.pos.x + nf.x * 5, 1.4, this.pos.z + nf.y * 5);
    }
    const fov = 66 + Math.min(speed / 95, 1) * 22 + (boosting ? 6 : 0);
    cam.fov += (fov - cam.fov) * (1 - Math.exp(-dt * 4));
    cam.updateProjectionMatrix();

    this.ctx.ui.setSpeed(speed * 3.6, this.boost);
    this.ctx.audio.setEngine(Math.min(1, speed / 90), boosting);
  }
}
