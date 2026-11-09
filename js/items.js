// Items, crafting recipes, and dropped item pickups.
import * as THREE from 'three';
import { MAT } from './constants.js';

export const ITEMS = {
  meat: { name: 'Raw meat', color: 0xc9554f, food: 3 },
  cooked: { name: 'Cooked meat', color: 0x8a4a2a, food: 8 },
  hide: { name: 'Hide', color: 0xa07850 },
  feather: { name: 'Feather', color: 0xf4a6c0 },
  ingot: { name: 'Iron ingot', color: 0xc9ccd2 },
  powder: { name: 'Gunpowder', color: 0x4a4a4e },
  ammo: { name: 'Cartridge', color: 0xd8b25a },
  rifle: { name: 'Rifle', color: 0x6b4a2e },
  bandage: { name: 'Bandage', color: 0xeeeeee },
  coin: { name: 'Coin', color: 0xe8c547 },
  stew: { name: 'Hearty stew', color: 0xa0603a, food: 12 },
  campfire: { name: 'Campfire', color: 0xe2783a },
  forge: { name: 'Forge', color: 0x7a7f8c },
};

// need: [kind, id, count] — kind 'm' = terrain material units, 'i' = item.
// station: 'fire' (campfire or forge) | 'forge' | undefined.
export const RECIPES = [
  { out: 'campfire', n: 1, need: [['m', MAT.WOOD, 6], ['m', MAT.STONE, 10]],
    info: 'Cook food on it. Jackals keep away from its light.' },
  { out: 'forge', n: 1, need: [['m', MAT.STONE, 30], ['m', MAT.CLAY, 15], ['m', MAT.WOOD, 6]],
    info: 'Smelts iron and makes metal goods.' },
  { out: 'cooked', n: 1, need: [['i', 'meat', 1], ['m', MAT.WOOD, 1]], station: 'fire',
    info: 'Fills 8 hunger (raw meat fills only 3).' },
  { out: 'bandage', n: 1, need: [['i', 'hide', 1], ['i', 'feather', 2]],
    info: 'Heals 8 health. Use with H.' },
  { out: 'ingot', n: 1, need: [['m', MAT.IRON, 8], ['m', MAT.COAL, 3]], station: 'forge',
    info: 'Smelted from iron ore with coal.' },
  { out: 'powder', n: 2, need: [['m', MAT.COAL, 3], ['m', MAT.SULFUR, 2]],
    info: 'Charcoal and sulfur, ground together.' },
  { out: 'ammo', n: 6, need: [['i', 'ingot', 1], ['i', 'powder', 2]], station: 'forge',
    info: 'Rifle rounds. Each shot uses one.' },
  { out: 'rifle', n: 1, need: [['i', 'ingot', 5], ['m', MAT.WOOD, 12], ['i', 'hide', 2]], station: 'forge',
    info: 'Long-range weapon. Hold right click to aim.' },
];

const BOX = new THREE.BoxGeometry(0.3, 0.3, 0.3);
const mats = new Map();
const matFor = (id) => {
  if (!mats.has(id)) mats.set(id, new THREE.MeshLambertMaterial({ color: ITEMS[id].color, emissive: ITEMS[id].color, emissiveIntensity: 0.25 }));
  return mats.get(id);
};

export class Pickups {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.list = [];
  }

  spawn(id, n, pos) {
    const mesh = new THREE.Mesh(BOX, matFor(id));
    mesh.position.set(pos.x + (Math.random() - 0.5) * 0.8, pos.y + 0.6, pos.z + (Math.random() - 0.5) * 0.8);
    this.scene.add(mesh);
    this.list.push({ id, n, mesh, vy: 2 + Math.random() * 2, t: 0, ground: -Infinity });
  }

  update(dt, ppos, give) {
    for (const p of this.list.slice()) {
      p.t += dt;
      const m = p.mesh.position;
      const dx = ppos.x - m.x, dy = ppos.y + 0.8 - m.y, dz = ppos.z - m.z;
      const d = Math.hypot(dx, dy, dz);
      if (p.t > 0.5 && d < 3.5) {             // drift toward the player
        const k = Math.min(1, dt * 6);
        m.x += dx * k; m.y += dy * k; m.z += dz * k;
      } else {
        p.ground = this.world.groundY(m.x, m.y, m.z);
        p.vy -= 20 * dt;
        m.y += p.vy * dt;
        if (m.y < p.ground + 0.25) { m.y = p.ground + 0.25; p.vy = 0; }
      }
      p.mesh.rotation.y += dt * 2;
      if (p.t > 0.5 && d < 1.2) { give(p.id, p.n); this.remove(p); continue; }
      if (p.t > 180) this.remove(p);
    }
  }

  remove(p) {
    this.scene.remove(p.mesh);
    this.list.splice(this.list.indexOf(p), 1);
  }
}
