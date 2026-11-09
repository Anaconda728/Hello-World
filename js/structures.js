// Placeable crafting stations: campfires and forges.
import * as THREE from 'three';

const SPH = new THREE.IcosahedronGeometry(0.5, 0);
const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 6);
const CONE = new THREE.ConeGeometry(0.5, 1, 6);
const lam = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
const STONE = lam(0x77787e), LOG = lam(0x6b4a2e), BRICK = lam(0x7b7f88), CLAY = lam(0xa0705a), SOOT = lam(0x2e2c2c);
const FLAME = new THREE.MeshBasicMaterial({ color: 0xff7a2a });
const FLAME2 = new THREE.MeshBasicMaterial({ color: 0xffd04a });
const MOUTH = new THREE.MeshBasicMaterial({ color: 0xff8a30 });

function part(g, geo, mat, pos, scl, rot) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...pos);
  m.scale.set(...scl);
  if (rot) m.rotation.set(...rot);
  g.add(m);
  return m;
}

function buildCampfire() {
  const g = new THREE.Group();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    part(g, SPH, STONE, [Math.cos(a) * 0.45, 0.08, Math.sin(a) * 0.45], [0.3, 0.22, 0.3], [a, a * 2, 0]);
  }
  for (let i = 0; i < 3; i++) part(g, CYL, LOG, [0, 0.12, 0], [0.14, 0.8, 0.14], [0, (i * Math.PI) / 3, Math.PI / 2 - 0.25]);
  const f1 = part(g, CONE, FLAME, [0, 0.42, 0], [0.38, 0.65, 0.38]);
  const f2 = part(g, CONE, FLAME2, [0, 0.34, 0], [0.22, 0.42, 0.22]);
  return { group: g, flames: [f1, f2] };
}

function buildForge() {
  const g = new THREE.Group();
  part(g, BOX, BRICK, [0, 0.45, 0], [1.3, 0.9, 1.3]);
  part(g, BOX, CLAY, [0, 1.1, 0], [1.1, 0.45, 1.1]);
  part(g, BOX, SOOT, [0.3, 1.7, -0.3], [0.35, 0.9, 0.35]);
  const mouth = part(g, BOX, MOUTH, [0, 0.5, 0.64], [0.55, 0.38, 0.06]);
  return { group: g, flames: [mouth] };
}

export class Structures {
  constructor(scene, saved) {
    this.scene = scene;
    this.list = [];
    // One shared light, moved to the nearest fire (avoids shader recompiles).
    this.light = new THREE.PointLight(0xff9a4a, 0, 18, 1.4);
    scene.add(this.light);
    for (const [type, x, y, z, rot] of saved || []) this.add(type, x, y, z, rot);
  }

  add(type, x, y, z, rot = 0) {
    const model = type === 'forge' ? buildForge() : buildCampfire();
    model.group.position.set(x, y, z);
    model.group.rotation.y = rot;
    const s = { type, x, y, z, rot, model, root: model.group, phase: Math.random() * 10 };
    model.group.userData.structure = s;
    this.scene.add(model.group);
    this.list.push(s);
    return s;
  }

  remove(s) {
    this.scene.remove(s.root);
    this.list.splice(this.list.indexOf(s), 1);
  }

  roots() { return this.list.map((s) => s.root); }

  near(types, pos, r) {
    return this.list.some((s) => types.includes(s.type) && Math.hypot(s.x - pos.x, s.y - pos.y, s.z - pos.z) < r);
  }

  serialize() {
    const r = (v) => Math.round(v * 100) / 100;
    return this.list.map((s) => [s.type, r(s.x), r(s.y), r(s.z), r(s.rot)]);
  }

  update(dt, ppos, night) {
    let best = null, bd = 30;
    for (const s of this.list) {
      s.phase += dt * 9;
      const f = 1 + Math.sin(s.phase) * 0.08 + Math.sin(s.phase * 2.3) * 0.06;
      if (s.type === 'campfire') {
        s.model.flames[0].scale.set(0.38 * f, 0.65 * (2 - f), 0.38 * f);
        s.model.flames[1].scale.set(0.22 * (2 - f), 0.42 * f, 0.22 * (2 - f));
      }
      const d = Math.hypot(s.x - ppos.x, s.z - ppos.z);
      if (d < bd) { bd = d; best = s; }
    }
    if (best) {
      const flick = 1 + Math.sin(best.phase * 1.7) * 0.1;
      this.light.position.set(best.x, best.y + (best.type === 'forge' ? 0.9 : 0.8), best.z);
      this.light.intensity = (night ? 9 : 3) * flick;
    } else {
      this.light.intensity = 0;
    }
  }
}
