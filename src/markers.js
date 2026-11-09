// A single active map marker: a light pillar in the world, a compass on the HUD, a dot on
// the minimap. Courier jobs use it too and pay out on arrival.
import * as THREE from 'three';
import { MAT } from './materials.js';

export class Marker {
  constructor(scene) {
    this.group = new THREE.Group();
    this.pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 400, 16, 1, true).translate(0, 200, 0), MAT.marker);
    this.gem = new THREE.Mesh(new THREE.OctahedronGeometry(1.4, 0), MAT.neon_amber);
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(3, 0.12, 6, 40).rotateX(Math.PI / 2), MAT.neon_amber);
    this.ring.position.y = 0.3;
    this.group.add(this.pillar, this.gem, this.ring);
    this.group.visible = false;
    scene.add(this.group);
    this.active = null;
  }

  set(m) {
    this.active = { ...m };
    const job = m.kind === 'job';
    this.pillar.material = job ? MAT.markerJob : MAT.marker;
    this.gem.material = this.ring.material = job ? MAT.neon_red : MAT.neon_amber;
    this.group.position.set(m.x, 0, m.z);
    this.group.visible = true;
  }
  clear() { this.active = null; this.group.visible = false; }

  // Returns the marker if the player just reached it.
  update(dt, t, player) {
    if (!this.active) return null;
    this.gem.position.y = 9 + Math.sin(t * 2) * 0.8;
    this.gem.rotation.y += dt * 1.5;
    this.ring.scale.setScalar(1 + (t % 1.5) * 0.6);
    if (player && Math.hypot(player.x - this.active.x, player.z - this.active.z) < 10) {
      const m = this.active;
      this.clear();
      return m;
    }
    return null;
  }
}
