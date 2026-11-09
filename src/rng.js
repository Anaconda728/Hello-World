// Small deterministic RNG so buildings regenerate identically from a saved seed.
export function mulberry32(seed) {
  let a = seed >>> 0;
  const r = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (a0, b0) => a0 + r() * (b0 - a0);
  r.int = (a0, b0) => Math.floor(a0 + r() * (b0 - a0 + 1));
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.chance = (p) => r() < p;
  return r;
}
export function randSeed() {
  return (Math.random() * 0xffffffff) >>> 0;
}
