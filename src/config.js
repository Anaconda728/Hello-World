// Grid + world constants shared by every module.
export const GRID = 40;          // tiles per side
export const TILE = 12;          // metres per tile
export const HALF = (GRID * TILE) / 2;
export const CHUNK = 8;          // tiles per render chunk (buildings are merged per chunk)
export const BOUNDS = HALF + 160; // how far the player may roam outside the grid

export const DIRS = [
  [1, 0],  // E (+x)
  [0, 1],  // S (+z)
  [-1, 0], // W (-x)
  [0, -1], // N (-z)
];

export function tileCenter(i, j) {
  return { x: (i + 0.5) * TILE - HALF, z: (j + 0.5) * TILE - HALF };
}
export function worldToTile(x, z) {
  return { i: Math.floor((x + HALF) / TILE), j: Math.floor((z + HALF) / TILE) };
}
export function inGrid(i, j) {
  return i >= 0 && j >= 0 && i < GRID && j < GRID;
}

// Build tools. `size` is the footprint in tiles.
export const TOOLS = {
  road:      { name: 'Road',       icon: '▦', cost: 15,   size: 1, color: '#2ef6ff', desc: 'Drag to lay roads. Buildings need a road next to them.' },
  habitat:   { name: 'Hab Stack',  icon: '▥', cost: 500,  size: 1, color: '#ffb02e', desc: 'Residential tower. Houses people.' },
  corp:      { name: 'Corp Tower', icon: '◈', cost: 1500, size: 1, color: '#2ef6ff', desc: 'Corporate spire. Provides jobs.' },
  arcology:  { name: 'Arcology',   icon: '▣', cost: 6000, size: 2, color: '#ff2bd6', desc: '2×2 megastructure. Homes and jobs.' },
  plaza:     { name: 'Neon Plaza', icon: '✦', cost: 250,  size: 1, color: '#39ff9c', desc: 'Glowing park. Boosts nearby growth.' },
  billboard: { name: 'Holo-Ad',    icon: '◧', cost: 300,  size: 1, color: '#ff5ea8', desc: 'Towering holographic billboard.' },
  grow:      { name: 'Grow',       icon: '▲', cost: 0,    size: 1, color: '#8a5cff', desc: 'Click a building to add height (costs 60% of base per level).' },
  bulldoze:  { name: 'Demolish',   icon: '✖', cost: 0,    size: 1, color: '#ff4060', desc: 'Drag a box to demolish. Refunds 50%.' },
};
export const TOOL_ORDER = ['road', 'habitat', 'corp', 'arcology', 'plaza', 'billboard', 'grow', 'bulldoze'];
export const MAX_LEVEL = 6;

export function buildingYield(type, level) {
  switch (type) {
    case 'habitat': return { pop: 60 * level, jobs: 0 };
    case 'corp': return { pop: 0, jobs: 90 * level };
    case 'arcology': return { pop: 260 * level, jobs: 180 * level };
    default: return { pop: 0, jobs: 0 };
  }
}
