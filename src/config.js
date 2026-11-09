// World + tool constants shared by every module. The world is an infinite tile grid
// streamed in square chunks around the player.
export const TILE = 12;              // metres per tile
export const CHUNK = 16;             // tiles per chunk side
export const CHUNK_W = CHUNK * TILE; // metres per chunk side
export const LOAD_DIST = CHUNK_W * 2.35; // chunks whose centre is within this get built
export const UNLOAD_DIST = CHUNK_W * 3.4;
export const FREE_ZONE = 8;          // tiles around the origin left empty for the player in new worlds
export const SUPERBLOCK = 12;        // main avenues every N tiles

export const DIRS = [
  [1, 0],  // E (+x)
  [0, 1],  // S (+z)
  [-1, 0], // W (-x)
  [0, -1], // N (-z)
];

export function tileCenter(i, j) {
  return { x: (i + 0.5) * TILE, z: (j + 0.5) * TILE };
}
export function worldToTile(x, z) {
  return { i: Math.floor(x / TILE), j: Math.floor(z / TILE) };
}
export const chunkCoord = (t) => Math.floor(t / CHUNK);
export const chunkKey = (cx, cz) => cx + ',' + cz;

// Build tools. `size` is the footprint in tiles; `key` is the keyboard shortcut.
export const TOOLS = {
  road:      { name: 'Road',        icon: '▦', cost: 15,   size: 1, key: '1', color: '#2ef6ff', desc: 'Drag to lay roads. Most buildings need a road next to them.' },
  habitat:   { name: 'Hab Stack',   icon: '▥', cost: 500,  size: 1, key: '2', color: '#ffb02e', desc: 'Residential tower. Houses people. Uses power.' },
  corp:      { name: 'Corp Tower',  icon: '◈', cost: 1500, size: 1, key: '3', color: '#2ef6ff', desc: 'Corporate spire. Provides jobs. Uses power.' },
  arcology:  { name: 'Arcology',    icon: '▣', cost: 6000, size: 2, key: '4', color: '#ff2bd6', desc: '2×2 megastructure. Homes and jobs. Power hungry.' },
  powercore: { name: 'Fusion Core', icon: '◉', cost: 2500, size: 1, key: '5', color: '#ff6a2e', desc: 'Plasma reactor. Supplies power to the district. No road needed.' },
  dataspire: { name: 'Data Spire',  icon: '▤', cost: 2200, size: 1, key: '6', color: '#39ff9c', desc: 'Server tower streaming data. Jobs and bonus income.' },
  dronehub:  { name: 'Drone Hub',   icon: '✈', cost: 1800, size: 1, key: '7', color: '#9ef3ff', desc: 'Delivery drone port. Jobs and bonus income.' },
  clinic:    { name: 'Chrome Clinic', icon: '⚕', cost: 1600, size: 1, key: '8', color: '#ff5ea8', desc: 'Cybernetics clinic with augmentation vats. Jobs, attracts residents.' },
  uplink:    { name: 'Uplink Array', icon: '⟟', cost: 2800, size: 1, key: '9', color: '#8a5cff', desc: 'Orbital uplink tower beaming to the satellites. Big bonus income.' },
  plaza:     { name: 'Neon Plaza',  icon: '✦', cost: 250,  size: 1, key: '0', color: '#39ff9c', desc: 'Glowing park. Speeds up growth nearby. No road needed.' },
  billboard: { name: 'Holo-Ad',     icon: '◧', cost: 300,  size: 1, key: '-', color: '#ff5ea8', desc: 'Towering holographic billboard. Small bonus income.' },
  drone:     { name: 'Drone',       icon: '⌖', cost: 0,    size: 1, key: 'N', color: '#ffd23e', desc: 'Deploy a drone that operates around the spot you click: air taxis, transport ferries or enforcer scanners.' },
  grow:      { name: 'Grow',        icon: '▲', cost: 0,    size: 1, key: 'G', color: '#c08bff', desc: 'Click a building to add height (60% of base cost per level). Claims sprawl buildings.' },
  bulldoze:  { name: 'Demolish',    icon: '✖', cost: 0,    size: 1, key: 'X', color: '#ff4060', desc: 'Drag a box to demolish. Refunds 50% of your own buildings.' },
};
  // generated only (never in the toolbar): dark alleys where gangs hang out
TOOLS.alley = { name: 'Dark Alley', icon: '░', cost: 0, size: 1, key: '', color: '#ff2848', desc: 'Gang hangout.', hidden: true };
export const TOOL_ORDER = Object.keys(TOOLS).filter((k) => !TOOLS[k].hidden);

// Deployable drones (Drone tool).
export const DRONE_TYPES = {
  taxi1:    { name: 'Air Taxi (solo)',  cost: 400,  bonus: 3,  desc: 'Single-occupant air taxi. Cruises the avenues.' },
  taxi2:    { name: 'Air Taxi (duo)',   cost: 650,  bonus: 5,  desc: 'Two-seat air taxi. Cruises the avenues.' },
  ferry:    { name: 'Transport Ferry',  cost: 3500, bonus: 16, desc: 'Ship-sized passenger drone carrying dozens of people.' },
  enforcer: { name: 'Enforcer Scanner', cost: 900,  bonus: 0,  desc: 'Patrols the streets scanning citizens. Gangs clear out nearby.' },
};
export const DRONE_ORDER = Object.keys(DRONE_TYPES);
export const MAX_LEVEL = 6;
export const NO_ROAD_NEEDED = new Set(['plaza', 'billboard', 'powercore', 'alley']);

// What each building contributes when owned + connected.
export function buildingYield(type, level) {
  const L = level;
  switch (type) {
    case 'habitat':   return { pop: 60 * L, jobs: 0, power: -8 * L, bonus: 0 };
    case 'corp':      return { pop: 0, jobs: 90 * L, power: -20 * L, bonus: 0 };
    case 'arcology':  return { pop: 260 * L, jobs: 180 * L, power: -70 * L, bonus: 0 };
    case 'powercore': return { pop: 0, jobs: 15 * L, power: 450 * L, bonus: 0 };
    case 'dataspire': return { pop: 0, jobs: 50 * L, power: -45 * L, bonus: 14 * L };
    case 'dronehub':  return { pop: 0, jobs: 40 * L, power: -18 * L, bonus: 8 * L };
    case 'clinic':    return { pop: 25 * L, jobs: 35 * L, power: -15 * L, bonus: 6 * L };
    case 'uplink':    return { pop: 0, jobs: 20 * L, power: -35 * L, bonus: 22 * L };
    case 'billboard': return { pop: 0, jobs: 0, power: -2 * L, bonus: 2 * L };
    default:          return { pop: 0, jobs: 0, power: 0, bonus: 0 };
  }
}
