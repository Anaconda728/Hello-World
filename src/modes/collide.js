// Push a circle (pos.x, pos.z, radius r) out of axis-aligned rects. Returns the
// last collision normal {x, z} or null.
export function resolveCircle(pos, r, rects) {
  let hit = null;
  for (const [x0, z0, x1, z1] of rects) {
    const cx = Math.max(x0, Math.min(pos.x, x1));
    const cz = Math.max(z0, Math.min(pos.z, z1));
    let dx = pos.x - cx, dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 > r * r) continue;
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2);
      dx /= d; dz /= d;
      pos.x = cx + dx * r; pos.z = cz + dz * r;
      hit = { x: dx, z: dz };
    } else {
      // centre inside the rect: leave via the nearest side
      const pen = [pos.x - x0, x1 - pos.x, pos.z - z0, z1 - pos.z];
      const m = pen.indexOf(Math.min(...pen));
      if (m === 0) { pos.x = x0 - r; hit = { x: -1, z: 0 }; }
      if (m === 1) { pos.x = x1 + r; hit = { x: 1, z: 0 }; }
      if (m === 2) { pos.z = z0 - r; hit = { x: 0, z: -1 }; }
      if (m === 3) { pos.z = z1 + r; hit = { x: 0, z: 1 }; }
    }
  }
  return hit;
}
