// Shared world constants.
// CS must stay 32: chunk lookups use `>> 5` and `& 31`.
export const CS = 32;          // chunk width/depth in grid units
export const H = 72;           // world height in grid units
export const SY = H + 1;       // density samples per column
export const WATER = 18;       // sea level

export const MAT = { AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, SAND: 4, SNOW: 5, WOOD: 6, BEDROCK: 7, COAL: 8, IRON: 9, SULFUR: 10, CLAY: 11, ROAD: 12 };

export const MAT_INFO = [
  null,
  { name: 'Turf', color: 0x6aa84f },
  { name: 'Soil', color: 0x8b6a47 },
  { name: 'Stone', color: 0x8d8e93 },
  { name: 'Sand', color: 0xdcca8e },
  { name: 'Snow', color: 0xf1f4f8 },
  { name: 'Timber', color: 0x9c6b3e },
  { name: 'Bedrock', color: 0x3a3a40 },
  { name: 'Coal', color: 0x2e2e33 },
  { name: 'Iron ore', color: 0xb8794a },
  { name: 'Sulfur', color: 0xd9c43c },
  { name: 'Clay', color: 0x9aa0b4 },
  { name: 'Cobbles', color: 0x8a8275 },
];


// Index into a chunk's column-major density array (y is contiguous).
export const idx = (lx, y, lz) => (lx * CS + lz) * SY + y;
export const ckey = (cx, cz) => (cx + 32768) * 65536 + (cz + 32768);
