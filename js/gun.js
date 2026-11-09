// First-person rifle: model, recoil, muzzle flash, tracer and gunshot sound.
import * as THREE from 'three';

const lam = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });

export class Rifle {
  constructor(camera, scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.position.set(0.28, -0.26, -0.55);
    camera.add(this.root);
    const wood = lam(0x6b4a2e), steel = lam(0x3a3d42), brass = lam(0xb8954a);
    const add = (geo, mat, pos, scl, rot) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(...pos); m.scale.set(...scl);
      if (rot) m.rotation.set(...rot);
      this.root.add(m);
      return m;
    };
    const box = new THREE.BoxGeometry(1, 1, 1), cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
    add(box, wood, [0, -0.02, 0.18], [0.07, 0.1, 0.5]);                         // stock
    add(box, wood, [0, -0.07, 0.38], [0.065, 0.14, 0.14], [0.35, 0, 0]);        // butt
    add(box, wood, [0, 0, -0.25], [0.06, 0.06, 0.45]);                          // forend
    add(cyl, steel, [0, 0.035, -0.32], [0.03, 0.75, 0.03], [Math.PI / 2, 0, 0]); // barrel
    add(box, steel, [0, 0.02, 0.02], [0.075, 0.07, 0.14]);                      // lock
    add(box, brass, [0, -0.045, 0.06], [0.02, 0.05, 0.06]);                     // trigger guard
    add(box, steel, [0, 0.065, -0.66], [0.012, 0.025, 0.02]);                   // front sight
    this.muzzle = new THREE.Vector3(0, 0.035, -0.7);

    this.flash = new THREE.Mesh(new THREE.IcosahedronGeometry(0.08, 0), new THREE.MeshBasicMaterial({ color: 0xffd36a }));
    this.flash.position.copy(this.muzzle);
    this.flash.visible = false;
    this.root.add(this.flash);

    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
    this.tracer = new THREE.Line(tg, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.8 }));
    this.tracer.frustumCulled = false;
    this.tracer.visible = false;
    scene.add(this.tracer);

    this.kick = 0;
    this.reload = 0;
    this.flashT = 0;
    this.tracerT = 0;
    this.aim = 0;
    this.root.visible = false;
  }

  muzzleWorld(out) { return this.root.localToWorld(out.copy(this.muzzle)); }

  shoot(hitPoint) {
    this.kick = 1;
    this.flashT = 0.06;
    this.flash.visible = true;
    const start = this.muzzleWorld(new THREE.Vector3());
    const pos = this.tracer.geometry.attributes.position;
    pos.setXYZ(0, start.x, start.y, start.z);
    pos.setXYZ(1, hitPoint.x, hitPoint.y, hitPoint.z);
    pos.needsUpdate = true;
    this.tracer.visible = true;
    this.tracerT = 0.07;
    this.playShot();
  }

  playShot(volume = 0.7) {
    try {
      const ac = this.ac || (this.ac = new (window.AudioContext || window.webkitAudioContext)());
      const len = Math.floor(ac.sampleRate * 0.6);
      const buf = ac.createBuffer(1, len, ac.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 5);
      const src = ac.createBufferSource();
      src.buffer = buf;
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 1600;
      const g = ac.createGain();
      g.gain.value = volume;
      src.connect(lp).connect(g).connect(ac.destination);
      src.start();
    } catch { /* audio unavailable */ }
  }

  update(dt, aiming) {
    this.kick = Math.max(0, this.kick - dt * 6);
    this.reload = Math.max(0, this.reload - dt);
    this.aim += ((aiming ? 1 : 0) - this.aim) * Math.min(1, dt * 10);
    const r = this.reload > 0 ? Math.sin(Math.min(1, this.reload / 1.6) * Math.PI) : 0;
    this.root.position.set(0.28 * (1 - this.aim), -0.26 + this.aim * 0.17 - r * 0.15, -0.55 + this.kick * 0.1);
    this.root.rotation.set(this.kick * 0.25 - r * 0.6, 0, r * 0.5);
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.flash.visible = false; }
    if (this.tracerT > 0) { this.tracerT -= dt; if (this.tracerT <= 0) this.tracer.visible = false; }
  }
}
