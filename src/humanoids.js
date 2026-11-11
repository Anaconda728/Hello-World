// Instanced, articulated people. Every body part is one InstancedMesh, so hundreds of
// figures cost about a dozen draw calls. Limbs are capsules, torsos are lathed, heads are
// rounded, and the walk cycle has knee lift, hip sway, counter-rotating shoulders, bending
// elbows and a breathing, weight-shifting idle.
// Styles: 'robot' (street androids), 'gang' (hooded crews), 'civ' (pedestrians).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const PI = Math.PI;
const ROOT = new THREE.Matrix4(), PEL = new THREE.Matrix4(), TOR = new THREE.Matrix4(), HEAD = new THREE.Matrix4();
const A = new THREE.Matrix4(), B = new THREE.Matrix4(), C = new THREE.Matrix4(), X = new THREE.Matrix4();
const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
const DARK = new THREE.Color(0x101016);
const T = (m, x, y, z) => m.multiply(X.makeTranslation(x, y, z));
const RX = (m, a) => m.multiply(X.makeRotationX(a));
const RY = (m, a) => m.multiply(X.makeRotationY(a));
const RZ = (m, a) => m.multiply(X.makeRotationZ(a));

// capsule hanging down from the origin (joint at the top)
const limb = (r, len, radial = 6) => new THREE.CapsuleGeometry(r, len, 2, radial).translate(0, -len / 2, 0);
const ball = (r, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => new THREE.SphereGeometry(r, 9, 7).scale(sx, sy, sz).translate(x, y, z);
const merge = (...gs) => mergeGeometries(gs.map((g) => (g.index ? g.toNonIndexed() : g)));
const lathe = (pts, sz, seg = 10) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg).scale(1, 1, sz);

const SHAPES = {
  robot: {
    shoulder: 0.225, lean: 0.02,
    pelvis: () => ball(0.13, 0, 0, 0, 1, 0.75, 0.8),
    torso: () => merge(
      lathe([[0.001, 0], [0.085, 0.0], [0.1, 0.1], [0.17, 0.3], [0.19, 0.42], [0.13, 0.5], [0.001, 0.53]], 0.72),
      ball(0.065, -0.225, 0.45, 0), ball(0.065, 0.225, 0.45, 0), // shoulder joints
      new THREE.CylinderGeometry(0.03, 0.04, 0.1, 6).translate(0, 0.55, 0)),
    head: () => merge(
      new THREE.CapsuleGeometry(0.092, 0.07, 3, 9).translate(0, 0.15, 0),
      new THREE.CylinderGeometry(0.03, 0.03, 0.03, 8).rotateZ(PI / 2).translate(0.1, 0.15, 0),
      new THREE.CylinderGeometry(0.03, 0.03, 0.03, 8).rotateZ(PI / 2).translate(-0.1, 0.15, 0),
      new THREE.CylinderGeometry(0.006, 0.006, 0.14, 4).translate(0.07, 0.3, -0.03)),
    visor: () => new THREE.CylinderGeometry(0.097, 0.097, 0.045, 10, 1, true, -1.15, 2.3).translate(0, 0.17, 0),
    chest: () => new THREE.CircleGeometry(0.045, 12).translate(0, 0.36, 0.136),
    thigh: () => limb(0.062, 0.42), shin: () => merge(limb(0.045, 0.4), ball(0.058)),
    foot: () => new THREE.CapsuleGeometry(0.045, 0.14, 2, 6).rotateX(PI / 2).translate(0, -0.07, 0.05),
    uarm: () => limb(0.04, 0.25), farm: () => merge(limb(0.046, 0.23), ball(0.05), ball(0.045, 0, -0.26, 0, 1, 1.2, 0.8)),
    roles: { pelvis: 'legs', thigh: 'body', shin: 'legs', foot: 'body', uarm: 'legs', farm: 'body', head: 'body' },
    mat: { roughness: 0.25, metalness: 0.85, envMapIntensity: 1.2 },
  },
  gang: {
    shoulder: 0.235, lean: 0.1,
    pelvis: () => ball(0.16, 0, 0, 0, 1, 0.72, 0.78),
    torso: () => lathe([[0.001, -0.06], [0.175, -0.06], [0.19, 0.12], [0.215, 0.32], [0.2, 0.44], [0.13, 0.52], [0.001, 0.55]], 0.74),
    // hood: big rounded cowl with the face lost in shadow
    head: () => merge(ball(0.135, 0, 0.14, -0.01, 1, 1.08, 1.1), ball(0.11, 0, 0.02, -0.04, 1.2, 0.7, 1)),
    visor: () => merge(ball(0.016, -0.04, 0.15, 0.142), ball(0.016, 0.04, 0.15, 0.142)),
    chest: () => new THREE.BoxGeometry(0.035, 0.34, 0.012).rotateZ(0.45).translate(0.02, 0.3, 0.158),
    thigh: () => limb(0.08, 0.42), shin: () => limb(0.062, 0.4),
    foot: () => new THREE.CapsuleGeometry(0.055, 0.15, 2, 6).rotateX(PI / 2).translate(0, -0.06, 0.05),
    uarm: () => limb(0.062, 0.25), farm: () => merge(limb(0.052, 0.23), ball(0.045, 0, -0.26, 0)),
    roles: { pelvis: 'legs', thigh: 'legs', shin: 'legs', foot: 'legs', uarm: 'body', farm: 'body', head: 'body' },
    mat: { roughness: 0.9, metalness: 0.02, envMapIntensity: 0.3 },
  },
  civ: {
    shoulder: 0.205, lean: 0.03,
    // hips plus the hem of a jacket
    pelvis: () => merge(ball(0.15, 0, 0, 0, 1, 0.72, 0.76), lathe([[0.165, 0.08], [0.175, -0.08], [0.19, -0.2]], 0.76)),
    torso: () => lathe([[0.001, -0.02], [0.155, -0.02], [0.165, 0.14], [0.185, 0.32], [0.18, 0.44], [0.11, 0.51], [0.001, 0.54]], 0.68),
    head: () => merge(ball(0.105, 0, 0.15, 0, 0.92, 1.1, 1), new THREE.CylinderGeometry(0.042, 0.05, 0.1, 7).translate(0, 0.03, 0)),
    visor: () => new THREE.CylinderGeometry(0.1, 0.1, 0.032, 9, 1, true, -1.0, 2.0).translate(0, 0.17, 0.004),
    chest: () => new THREE.BoxGeometry(0.014, 0.42, 0.01).translate(0.045, 0.24, 0.126),
    thigh: () => limb(0.07, 0.42), shin: () => limb(0.054, 0.4),
    foot: () => new THREE.CapsuleGeometry(0.046, 0.14, 2, 6).rotateX(PI / 2).translate(0, -0.065, 0.05),
    uarm: () => limb(0.05, 0.25), farm: () => merge(limb(0.042, 0.23), ball(0.042, 0, -0.26, 0)),
    roles: { pelvis: 'body', thigh: 'legs', shin: 'legs', foot: 'legs', uarm: 'body', farm: 'body', head: 'skin' },
    mat: { roughness: 0.8, metalness: 0.05, envMapIntensity: 0.4, side: THREE.DoubleSide },
  },
};
const PAIRED = ['thigh', 'shin', 'foot', 'uarm', 'farm'];

export class Humanoids {
  constructor(scene, max, style) {
    this.max = max;
    this.style = style;
    const S = (this.shape = SHAPES[style]);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, ...S.mat });
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, side: THREE.DoubleSide });
    this.parts = {};
    for (const k of ['pelvis', 'torso', 'head', 'visor', 'chest', ...PAIRED]) {
      const g = S[k]();
      g.computeVertexNormals();
      const im = new THREE.InstancedMesh(g, k === 'visor' || k === 'chest' ? glowMat : bodyMat, PAIRED.includes(k) ? max * 2 : max);
      im.frustumCulled = false;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.count = 0;
      scene.add(im);
      this.parts[k] = im;
    }
    this.n = 0;
    this.t = 0;
  }

  begin(t = 0) { this.n = 0; this.t = t; }

  // pose: { x, y, z, heading, walk (phase), amount (0 idle, 1 walk, 1.5 run), headYaw, armRaise (0..1),
  //         hold (umbrella arm), lie (0..1), scale, seed, body, legs, skin, glow, accent: Color }
  add(pose) {
    if (this.n >= this.max) return;
    const k = this.n++, P = this.parts, S = this.shape, R = S.roles;
    const sc = pose.scale || 1, a = pose.amount || 0, p = pose.walk || 0;
    const s = Math.sin(p), lie = pose.lie || 0;
    const idle = (1 - Math.min(1, a)) * (1 - lie), seed = pose.seed ?? k * 1.7, t = this.t;
    const breath = Math.sin(t * 1.7 + seed) * 0.006 * (1 - lie);
    const sway = Math.sin(t * 0.55 + seed) * 0.022 * idle; // shifting weight from foot to foot
    const run = Math.max(0, a - 1);

    _q.setFromAxisAngle(UP, pose.heading);
    ROOT.compose(_v.set(pose.x, (pose.y || 0) + lie * 0.14, pose.z), _q, _s.set(sc, sc, sc));
    if (lie) RX(ROOT, -lie * PI / 2);

    // pelvis: bobs twice per stride, swings side to side, twists with the legs
    PEL.copy(ROOT);
    T(PEL, sway + s * 0.014 * a, 0.94 + Math.cos(2 * p) * 0.022 * a - run * 0.03, 0);
    RY(PEL, s * 0.13 * a);
    RZ(PEL, sway * 1.4);
    P.pelvis.setMatrixAt(k, PEL);

    // torso counter-rotates against the hips and leans into the motion
    const lean = S.lean + 0.05 * Math.min(1, a) + run * 0.28;
    TOR.copy(PEL);
    T(TOR, 0, 0.06 + breath, 0);
    RY(TOR, -s * 0.25 * a);
    RX(TOR, lean);
    RZ(TOR, -sway * 2.2);
    P.torso.setMatrixAt(k, TOR);
    P.chest.setMatrixAt(k, TOR);

    HEAD.copy(TOR);
    T(HEAD, 0, 0.53, 0);
    RY(HEAD, s * 0.13 * a + (pose.headYaw || 0) + Math.sin(t * 0.37 + seed * 2) * 0.12 * idle);
    RX(HEAD, -lean * 0.7 + Math.sin(t * 0.23 + seed) * 0.04 * idle);
    P.head.setMatrixAt(k, HEAD);
    P.visor.setMatrixAt(k, HEAD);

    for (let side = 0; side < 2; side++) {
      const sg = side ? 1 : -1, pl = p + (side ? PI : 0), i2 = k * 2 + side;
      // leg: thigh swings, knee folds while the leg travels forward, foot stays near level
      const F = Math.sin(pl) * (0.5 + run * 0.5) * a;
      const K = 0.07 + Math.max(0, Math.cos(pl)) * (0.85 + run * 0.9) * a;
      A.copy(PEL);
      T(A, sg * 0.085, -0.02, 0);
      RX(A, -F + lean * 0.3);
      RZ(A, sg * 0.02 - sway * 0.8);
      P.thigh.setMatrixAt(i2, A);
      B.copy(A); T(B, 0, -0.42, 0); RX(B, K);
      P.shin.setMatrixAt(i2, B);
      C.copy(B); T(C, 0, -0.4, 0); RX(C, (F - K) * 0.75);
      P.foot.setMatrixAt(i2, C);

      // arm: swings opposite the leg, elbow bends on the forward swing
      let Fa = -Math.sin(pl) * (0.42 + run * 0.5) * a + Math.sin(t * 0.8 + seed + side) * 0.04 * idle;
      let E = 0.18 + 0.35 * Math.min(1, a) + run * 1.1 + Math.max(0, Fa) * 0.6;
      let out = 0.07;
      if (side === 1) {
        const raise = pose.armRaise || 0;
        if (pose.hold) { Fa = 0.35; E = 1.9; out = 0.02; }
        else if (raise) { Fa = Fa * (1 - raise) + raise * 1.5; E = E * (1 - raise) + 0.12 * raise; }
      }
      A.copy(TOR);
      T(A, sg * S.shoulder, 0.45, 0);
      RX(A, -Fa);
      RZ(A, sg * out);
      P.uarm.setMatrixAt(i2, A);
      B.copy(A); T(B, 0, -0.25, 0); RX(B, -E);
      P.farm.setMatrixAt(i2, B);
    }

    const body = pose.body || DARK, legs = pose.legs || DARK, skin = pose.skin || body;
    const col = (role) => (role === 'body' ? body : role === 'legs' ? legs : skin);
    P.torso.setColorAt(k, body);
    P.pelvis.setColorAt(k, col(R.pelvis));
    P.head.setColorAt(k, col(R.head));
    for (let side = 0; side < 2; side++) {
      for (const part of PAIRED) P[part].setColorAt(k * 2 + side, col(R[part]));
    }
    P.visor.setColorAt(k, pose.glow || DARK);
    P.chest.setColorAt(k, pose.accent || DARK);
  }

  end() {
    for (const [key, im] of Object.entries(this.parts)) {
      im.count = PAIRED.includes(key) ? this.n * 2 : this.n;
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }
}
