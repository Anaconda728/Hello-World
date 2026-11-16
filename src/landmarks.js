// District beacons: a tall coloured light pillar and a floating name sign at the centre of
// each nearby district. They ignore the fog, so you can navigate by them from far away.
import * as THREE from 'three';
import { TILE } from './config.js';
import { centresNear } from './districts.js';

function nameTexture(name, label, color) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 256;
  const g = c.getContext('2d');
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = color; g.shadowBlur = 28;
  g.fillStyle = color;
  g.font = '900 120px Orbitron, Arial Black, sans-serif';
  g.fillText(name.toUpperCase(), 512, 105, 980);
  g.shadowBlur = 10;
  g.font = '44px "Share Tech Mono", monospace';
  g.fillStyle = '#ffffff';
  g.fillText('◈ ' + label.toUpperCase() + ' ◈', 512, 205, 980);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Landmarks {
  constructor(scene) {
    this.scene = scene;
    this.items = new Map(); // district id -> { group }
    this.pillarGeo = new THREE.CylinderGeometry(2.5, 3.5, 700, 16, 1, true).translate(0, 350, 0);
    this.ringGeo = new THREE.TorusGeometry(16, 0.6, 6, 48).rotateX(Math.PI / 2);
    this.key = '';
  }

  make(d) {
    const col = new THREE.Color(d.theme.color);
    const g = new THREE.Group();
    const pillar = new THREE.Mesh(this.pillarGeo, new THREE.MeshBasicMaterial({
      color: col.clone().multiplyScalar(1.3), transparent: true, opacity: 0.11, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false,
    }));
    const ringMat = new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(2.2), toneMapped: false, fog: false });
    const r1 = new THREE.Mesh(this.ringGeo, ringMat), r2 = new THREE.Mesh(this.ringGeo, ringMat);
    r1.position.y = 150; r2.position.y = 215; r2.scale.setScalar(0.7);
    const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: nameTexture(d.name, d.theme.label, d.theme.color), transparent: true, depthWrite: false, toneMapped: false, fog: false, color: new THREE.Color(1.5, 1.5, 1.5) }));
    sign.scale.set(150, 37.5, 1);
    sign.position.y = 182;
    g.add(pillar, r1, r2, sign);
    g.position.set((d.i + 0.5) * TILE, 0, (d.j + 0.5) * TILE);
    g.userData = { r1, r2 };
    this.scene.add(g);
    return g;
  }

  update(dt, t, seed, focus) {
    const fi = Math.floor(focus.x / TILE), fj = Math.floor(focus.z / TILE);
    const near = centresNear(seed, fi, fj, 1);
    const key = seed + ':' + near[4].id;
    if (key !== this.key) {
      this.key = key;
      const want = new Map(near.map((d) => [seed + ':' + d.id, d]));
      for (const [id, g] of this.items) {
        if (want.has(id)) continue;
        this.scene.remove(g);
        g.traverse((o) => { if (o.material) { o.material.map?.dispose(); o.material.dispose(); } });
        this.items.delete(id);
      }
      for (const [id, d] of want) if (!this.items.has(id)) this.items.set(id, this.make(d));
    }
    for (const g of this.items.values()) {
      g.userData.r1.rotation.y += dt * 0.3;
      g.userData.r2.rotation.y -= dt * 0.45;
    }
  }
}
