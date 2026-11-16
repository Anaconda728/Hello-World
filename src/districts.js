// Districts: the endless city is divided into named neighbourhoods, each with its own
// colour scheme, building style and mix, so you can tell where you are.
import { hash3 } from './rng.js';

export const CELL = 30; // tiles between district centres (360 m)

// neon: sign/trim colours. hab/corp: facade sets. mix: building-type weight multipliers.
// level: height bias. open: bias toward parkland. alleys: extra gang alleys per chunk.
export const THEMES = [
  { id: 'neon', label: 'Entertainment district', color: '#ff2bd6', rgb: [255, 43, 214], neon: ['magenta', 'pink', 'violet'],
    hab: ['winC', 'winE', 'winC', 'winF'], corp: ['winCorp2', 'winC', 'winCorp2'], mix: { billboard: 5, clinic: 2, corp: 0.8, plaza: 0.6 }, level: 0.3, open: -0.25, alleys: 0 },
  { id: 'corp', label: 'Financial district', color: '#2ef6ff', rgb: [46, 246, 255], neon: ['cyan', 'white', 'cyan'],
    hab: ['winB', 'winCorp', 'winB'], corp: ['winCorp', 'winCorp', 'winB'], mix: { corp: 3.5, habitat: 0.35, billboard: 0.4, powercore: 0.3 }, level: 1.6, open: -0.3, alleys: -1 },
  { id: 'industrial', label: 'Industrial zone', color: '#ffa424', rgb: [255, 164, 36], neon: ['amber', 'red', 'amber'],
    hab: ['winD', 'winB', 'winD'], corp: ['winServer', 'winCorp2'], mix: { powercore: 7, uplink: 5, dronehub: 4, dataspire: 2, habitat: 0.55, corp: 0.4, plaza: 0.3 }, level: -1.1, open: 0.05, alleys: 1 },
  { id: 'old', label: 'Old town', color: '#ffb86a', rgb: [255, 184, 106], neon: ['amber', 'pink', 'amber'],
    hab: ['winE', 'winA', 'winE', 'winA'], corp: ['winCorp2', 'winA'], mix: { habitat: 2.2, corp: 0.25, plaza: 1.6, dataspire: 0.2, uplink: 0.1 }, level: -1.4, open: 0.05, alleys: 0 },
  { id: 'garden', label: 'Garden district', color: '#39ff9c', rgb: [57, 255, 156], neon: ['green', 'cyan', 'green'],
    hab: ['winA', 'winF', 'winB'], corp: ['winCorp', 'winB'], mix: { plaza: 4, corp: 0.6, powercore: 0.2, billboard: 0.5 }, level: -0.6, open: 0.32, alleys: -1 },
  { id: 'data', label: 'Data quarter', color: '#8a5cff', rgb: [138, 92, 255], neon: ['violet', 'cyan', 'violet'],
    hab: ['winB', 'winF', 'winB'], corp: ['winServer', 'winCorp', 'winServer'], mix: { dataspire: 8, uplink: 3, dronehub: 2.5, habitat: 0.6 }, level: 0.6, open: -0.12, alleys: 0 },
  { id: 'slum', label: 'Undercity', color: '#ff2848', rgb: [255, 40, 72], neon: ['red', 'magenta', 'red'],
    hab: ['winD', 'winD', 'winF', 'winE'], corp: ['winD', 'winCorp2'], mix: { habitat: 1.7, corp: 0.2, clinic: 2.5, billboard: 0.6, plaza: 0.3, dataspire: 0.3 }, level: -0.4, open: -0.2, alleys: 2 },
];
export const DEFAULT_THEME = { id: 'none', label: '', color: '#2ef6ff', rgb: [46, 246, 255], neon: ['cyan', 'magenta', 'amber', 'violet', 'green', 'pink'],
  hab: ['winA', 'winA', 'winB', 'winC', 'winD', 'winE', 'winE', 'winF'], corp: ['winCorp', 'winCorp', 'winCorp2', 'winB'], mix: {}, level: 0, open: 0, alleys: 0 };

const FIRST = ['Kuro', 'Neo', 'Shin', 'Akai', 'Hoshi', 'Tetsu', 'Mizu', 'Yami', 'Kage', 'Riku', 'Volt', 'Chrome', 'Ash', 'Ember', 'Null', 'Cobalt', 'Lotus', 'Onyx', 'Halo', 'Zenith', 'Vanta', 'Sora', 'Iron', 'Glass', 'Raven', 'Opal'];
const LAST = {
  neon: ['Strip', 'Ginza', 'Lights', 'Arcade', 'Row'],
  corp: ['Plaza', 'Exchange', 'Heights', 'Spires', 'Centre'],
  industrial: ['Works', 'Foundry', 'Yards', 'Docks', 'Furnace'],
  old: ['Old Town', 'Terrace', 'Quarter', 'Lanes', 'Market'],
  garden: ['Gardens', 'Commons', 'Greens', 'Park', 'Fields'],
  data: ['Grid', 'Stack', 'Labs', 'Array', 'Node'],
  slum: ['Warrens', 'Undercity', 'Maze', 'Bottoms', 'Stacks'],
};

const cache = new Map();
let cacheSeed = null;

// District containing tile (i, j): nearest jittered centre (Voronoi).
export function districtAt(seed, i, j) {
  if (seed !== cacheSeed) { cache.clear(); cacheSeed = seed; }
  const key = (((i >> 1) + 32768) * 65536) + ((j >> 1) + 32768);
  let d = cache.get(key);
  if (d) return d;
  const gx = Math.floor(i / CELL), gz = Math.floor(j / CELL);
  let best = null, bd = Infinity;
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
    const c = centre(seed, gx + a, gz + b);
    const dist = (c.i - i) ** 2 + (c.j - j) ** 2;
    if (dist < bd) { bd = dist; best = c; }
  }
  if (cache.size > 60000) cache.clear();
  cache.set(key, best);
  return best;
}

const centres = new Map();
export function centre(seed, gx, gz) {
  const key = seed + ':' + gx + ',' + gz;
  let c = centres.get(key);
  if (c) return c;
  const i = Math.floor((gx + 0.2 + 0.6 * hash3(gx, gz, seed + 801)) * CELL);
  const j = Math.floor((gz + 0.2 + 0.6 * hash3(gz, gx, seed + 802)) * CELL);
  const theme = THEMES[Math.floor(hash3(gx * 3 + 1, gz * 7 + 2, seed + 803) * THEMES.length)];
  const names = LAST[theme.id];
  const name = FIRST[Math.floor(hash3(gx, gz, seed + 804) * FIRST.length)] + ' ' + names[Math.floor(hash3(gz, gx, seed + 805) * names.length)];
  c = { id: gx + ',' + gz, gx, gz, i, j, theme, name };
  if (centres.size > 4000) centres.clear();
  centres.set(key, c);
  return c;
}

// The district centres around a tile (for beacons).
export function centresNear(seed, i, j, R = 1) {
  const gx = Math.floor(i / CELL), gz = Math.floor(j / CELL), out = [];
  for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) out.push(centre(seed, gx + a, gz + b));
  return out;
}
