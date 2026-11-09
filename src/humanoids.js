// Instanced, articulated bipeds. Every body part is one InstancedMesh, so dozens of
// walking figures cost about a dozen draw calls. Used for street robots and gang members.
import * as THREE from 'three';

const _m = new THREE.Matrix4(), _p = new THREE.Matrix4(), _r = new THREE.Matrix4(), _t = new THREE.Matrix4(), _s = new THREE.Matrix4();
const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1);

function box(w, h, d, ox = 0, oy = 0, oz = 0) {
  return new THREE.BoxGeometry(w, h, d).translate(ox, oy, oz);
}

// style: 'robot' | 'gang'
export class Humanoids {
  constructor(scene, max, style) {
    this.max = max;
    this.style = style;
    const robot = style === 'robot';
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: robot ? 0.25 : 0.85, metalness: robot ? 0.85 : 0.05, envMapIntensity: robot ? 1.2 : 0.4 });
    const jointMat = new THREE.MeshStandardMaterial({ color: robot ? 0x15151b : 0x0e0d12, roughness: 0.6, metalness: robot ? 0.7 : 0 });
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    const defs = {
      pelvis: [box(0.34, 0.16, 0.2), jointMat],
      torso: [robot ? box(0.44, 0.52, 0.26, 0, 0.26, 0) : box(0.48, 0.56, 0.3, 0, 0.28, 0), bodyMat],
      head: [robot ? box(0.24, 0.27, 0.25, 0, 0.14, 0) : box(0.3, 0.32, 0.32, 0, 0.15, -0.02), robot ? bodyMat : jointMat],
      visor: [robot ? box(0.22, 0.055, 0.03, 0, 0.16, 0.13) : box(0.2, 0.03, 0.03, 0, 0.15, 0.15), glowMat],
      chest: [robot ? box(0.12, 0.12, 0.02, 0, 0.36, 0.135) : box(0.05, 0.4, 0.02, 0.12, 0.3, 0.155), glowMat],
      thigh: [box(0.13, 0.46, 0.14, 0, -0.23, 0), robot ? bodyMat : jointMat],
      shin: [box(0.11, 0.44, 0.12, 0, -0.22, 0), robot ? jointMat : jointMat],
      foot: [box(0.13, 0.07, 0.24, 0, -0.035, 0.05), jointMat],
      uarm: [box(0.1, 0.32, 0.1, 0, -0.16, 0), robot ? jointMat : bodyMat],
      farm: [box(0.09, 0.3, 0.09, 0, -0.15, 0), robot ? bodyMat : jointMat],
    };
    this.parts = {};
    for (const [k, [g, m]] of Object.entries(defs)) {
      const n = ['thigh', 'shin', 'foot', 'uarm', 'farm'].includes(k) ? max * 2 : max;
      const im = new THREE.InstancedMesh(g, m, n);
      im.frustumCulled = false;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.count = 0;
      scene.add(im);
      this.parts[k] = im;
    }
    this.n = 0;
  }

  begin() { this.n = 0; }

  // pose: { x, y, z, heading, walk (phase radians), amount (0..1), headYaw, armRaise (0..1), scale,
  //         body: Color, glow: Color, accent: Color }
  add(pose) {
    if (this.n >= this.max) return;
    const k = this.n++;
    const s = pose.scale || 1;
    const P = this.parts;
    _q.setFromAxisAngle(_v.set(0, 1, 0), pose.heading);
    const bob = Math.abs(Math.sin(pose.walk)) * 0.04 * pose.amount;
    _m.compose(_v.set(pose.x, (pose.y || 0) + bob, pose.z), _q, _one.set(s, s, s));
    _one.set(1, 1, 1);
    const set = (im, idx, local) => { _p.multiplyMatrices(_m, local); im.setMatrixAt(idx, _p); };

    const sw = Math.sin(pose.walk) * 0.6 * pose.amount;
    set(P.pelvis, k, _t.makeTranslation(0, 0.98, 0));
    const lean = this.style === 'gang' ? 0.08 : 0;
    const torso = new THREE.Matrix4().makeTranslation(0, 1.04, 0).multiply(_r.makeRotationX(lean)).multiply(_s.makeRotationY(Math.sin(pose.walk) * 0.08 * pose.amount));
    set(P.torso, k, torso);
    set(P.chest, k, torso);
    const head = torso.clone().multiply(_t.makeTranslation(0, this.style === 'gang' ? 0.56 : 0.54, 0)).multiply(_r.makeRotationY(pose.headYaw || 0));
    set(P.head, k, head);
    set(P.visor, k, head);
    for (let side = 0; side < 2; side++) {
      const sg = side ? 1 : -1;
      const ph = side ? sw : -sw;
      const hip = new THREE.Matrix4().makeTranslation(sg * 0.1, 0.94, 0).multiply(_r.makeRotationX(ph));
      set(P.thigh, k * 2 + side, hip);
      const knee = hip.clone().multiply(_t.makeTranslation(0, -0.46, 0)).multiply(_r.makeRotationX(-Math.max(0, -ph) * 1.1 - 0.05));
      set(P.shin, k * 2 + side, knee);
      const foot = knee.clone().multiply(_t.makeTranslation(0, -0.44, 0)).multiply(_r.makeRotationX(Math.max(0, -ph) * 0.4));
      set(P.foot, k * 2 + side, foot);
      // arms: counter-swing; the right arm can be raised (gesturing / waving)
      const raise = side === 1 ? (pose.armRaise || 0) : 0;
      const sh = torso.clone().multiply(_t.makeTranslation(sg * 0.29, 0.48, 0))
        .multiply(_r.makeRotationX(-ph * 0.8 - raise * 1.9)).multiply(_s.makeRotationZ(sg * (0.08 + raise * 0.25)));
      set(P.uarm, k * 2 + side, sh);
      const el = sh.clone().multiply(_t.makeTranslation(0, -0.32, 0)).multiply(_r.makeRotationX(-0.25 - Math.abs(ph) * 0.3 - raise * 0.9));
      set(P.farm, k * 2 + side, el);
    }
    if (pose.body) { P.torso.setColorAt(k, pose.body); P.head.setColorAt(k, pose.body); P.thigh.setColorAt(k * 2, pose.body); P.thigh.setColorAt(k * 2 + 1, pose.body); P.farm.setColorAt(k * 2, pose.body); P.farm.setColorAt(k * 2 + 1, pose.body); P.uarm.setColorAt(k * 2, pose.body); P.uarm.setColorAt(k * 2 + 1, pose.body); }
    if (pose.glow) P.visor.setColorAt(k, pose.glow);
    if (pose.accent) P.chest.setColorAt(k, pose.accent);
  }

  end() {
    for (const [key, im] of Object.entries(this.parts)) {
      im.count = ['thigh', 'shin', 'foot', 'uarm', 'farm'].includes(key) ? this.n * 2 : this.n;
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }
}
