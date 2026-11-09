// Minimap and full map: cached terrain tiles with live markers on top.
import { WATER } from './constants.js';

const TILE = 64;   // pixels per tile side

function terrainColor(h, sh, out) {
  let r, g, b;
  if (h < WATER) {
    const d = Math.min(1, (WATER - h) / 8);
    out[0] = 70 - 40 * d; out[1] = 132 - 52 * d; out[2] = 192 - 42 * d;
    return out;
  }
  if (h < WATER + 1.6) { r = 214; g = 200; b = 150; }
  else if (h < 44) { const t = (h - WATER) / 26; r = 96 + 44 * t; g = 162 - 34 * t; b = 78 + 12 * t; }
  else if (h < 50) { r = 140; g = 138; b = 132; }
  else { r = 236; g = 239; b = 243; }
  out[0] = Math.min(255, r * sh); out[1] = Math.min(255, g * sh); out[2] = Math.min(255, b * sh);
  return out;
}

export class MiniMap {
  constructor(world) {
    this.world = world;
    this.cache = new Map();
    this.queue = [];
  }

  tile(mpp, tx, tz) {
    const key = `${mpp}:${tx}:${tz}`;
    const c = this.cache.get(key);
    if (c) return c;
    if (!this.queue.some((q) => q.key === key)) this.queue.push({ key, mpp, tx, tz });
    return null;
  }

  // Build a few queued tiles per frame so the map fills in without hitches.
  pump(n = 2) {
    for (let i = 0; i < n && this.queue.length; i++) {
      const q = this.queue.pop();
      this.cache.set(q.key, this.genTile(q.mpp, q.tx, q.tz));
    }
    if (this.cache.size > 400) this.cache.clear();
  }

  genTile(mpp, tx, tz) {
    const w = this.world, N = TILE + 1;
    const hs = new Float32Array(N * N);
    const bx = tx * TILE * mpp, bz = tz * TILE * mpp;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = bx + (i - 0.5) * mpp, z = bz + (j - 0.5) * mpp;
      hs[j * N + i] = w.towns.adjustHeight(x, z, w.rawHeight(x, z));
    }
    const c = document.createElement('canvas');
    c.width = c.height = TILE;
    const g = c.getContext('2d');
    const img = g.createImageData(TILE, TILE);
    const col = [0, 0, 0];
    for (let j = 0; j < TILE; j++) for (let i = 0; i < TILE; i++) {
      const h = hs[(j + 1) * N + i + 1], hNW = hs[j * N + i];
      const sh = Math.max(0.72, Math.min(1.25, 1 + (h - hNW) * (0.18 / Math.sqrt(mpp))));
      terrainColor(h, sh, col);
      const k = (j * TILE + i) * 4;
      img.data[k] = col[0]; img.data[k + 1] = col[1]; img.data[k + 2] = col[2]; img.data[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  // o: { cx, cz, radius, size, mpp, circle, yaw, towns, roads, camps, travelers, bandits, horse, escort, structures }
  draw(g, o) {
    const { cx, cz, radius, size, mpp } = o;
    const scale = size / (2 * radius);
    const x0 = cx - radius, z0 = cz - radius;
    const S = (x, z) => [(x - x0) * scale, (z - z0) * scale];
    g.save();
    g.clearRect(0, 0, size, size);
    if (o.circle) { g.beginPath(); g.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2); g.clip(); }
    g.fillStyle = '#1b2a3a';
    g.fillRect(0, 0, size, size);
    const tw = TILE * mpp;
    for (let tx = Math.floor(x0 / tw); tx <= Math.floor((cx + radius) / tw); tx++) {
      for (let tz = Math.floor(z0 / tw); tz <= Math.floor((cz + radius) / tw); tz++) {
        const c = this.tile(mpp, tx, tz);
        if (c) g.drawImage(c, (tx * tw - x0) * scale, (tz * tw - z0) * scale, tw * scale + 1, tw * scale + 1);
      }
    }
    // Roads.
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = '#8a6f4e';
    g.lineWidth = Math.max(1.6, 4.8 * scale);
    for (const r of o.roads) {
      g.beginPath();
      r.pts.forEach(([x, z], i) => { const [sx, sy] = S(x, z); if (i) g.lineTo(sx, sy); else g.moveTo(sx, sy); });
      g.stroke();
    }
    // Towns.
    for (const t of o.towns) {
      const [sx, sy] = S(t.x, t.z);
      g.fillStyle = 'rgba(190,176,148,0.85)';
      g.beginPath(); g.arc(sx, sy, Math.max(4, t.R * scale), 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#7d7468';
      g.lineWidth = Math.max(1, 4 * scale);
      for (const s of t.streets) {
        g.beginPath();
        if (s.axis === 'x') { g.moveTo(...S(t.x + s.a, t.z + s.c)); g.lineTo(...S(t.x + s.b, t.z + s.c)); }
        else { g.moveTo(...S(t.x + s.c, t.z + s.a)); g.lineTo(...S(t.x + s.c, t.z + s.b)); }
        g.stroke();
      }
      if (scale > 0.5) {
        g.fillStyle = '#8e4a38';
        for (const b of t.buildings) {
          const [ax, az] = S(b.rect[0], b.rect[2]);
          g.fillRect(ax, az, (b.rect[1] - b.rect[0]) * scale, (b.rect[3] - b.rect[2]) * scale);
        }
      }
    }
    // Discovered bandit camps.
    for (const c of o.camps) {
      const [sx, sy] = S(c.x, c.z);
      g.fillStyle = c.cleared ? '#777' : '#d23a2a';
      g.strokeStyle = '#000a'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(sx, sy - 6); g.lineTo(sx + 6, sy + 5); g.lineTo(sx - 6, sy + 5); g.closePath(); g.fill(); g.stroke();
    }
    // Your campfires and forges.
    for (const s of o.structures) {
      const [sx, sy] = S(s.x, s.z);
      g.fillStyle = s.type === 'forge' ? '#c9ccd2' : '#ff8a3a';
      g.fillRect(sx - 2.5, sy - 2.5, 5, 5);
    }
    const dot = (x, z, r, fill, ring) => {
      const [sx, sy] = S(x, z);
      g.beginPath(); g.arc(sx, sy, r, 0, Math.PI * 2);
      g.fillStyle = fill; g.fill();
      if (ring) { g.strokeStyle = ring; g.lineWidth = 1.5; g.stroke(); }
    };
    for (const t of o.travelers) dot(t.x, t.z, t.escort ? 4.5 : 3, t.escort ? '#4ad8ff' : '#f2d04a', '#000a');
    for (const b of o.bandits) dot(b.x, b.z, 3, '#ff3a2a', '#000a');
    if (o.horse) dot(o.horse.x, o.horse.z, 3.5, '#8a5a32', '#fff');
    if (o.escort) {
      const [sx, sy] = S(o.escort.x, o.escort.z);
      g.fillStyle = '#ffd84a'; g.strokeStyle = '#000'; g.lineWidth = 1;
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 3.5 : 8;
        const px = Math.min(size - 8, Math.max(8, sx)) + Math.cos(a) * r, py = Math.min(size - 8, Math.max(8, sy)) + Math.sin(a) * r;
        if (i) g.lineTo(px, py); else g.moveTo(px, py);
      }
      g.closePath(); g.fill(); g.stroke();
    }
    // Town names.
    g.font = `600 ${o.circle ? 10 : 12}px system-ui, sans-serif`;
    g.textAlign = 'center';
    for (const t of o.towns) {
      const [sx, sy] = S(t.x, t.z);
      const label = t.name + (o.circle ? '' : t.roadCount === 0 ? ' (no roads)' : '');
      g.lineWidth = 3; g.strokeStyle = '#000b'; g.strokeText(label, sx, sy - Math.max(6, t.R * scale) - 4);
      g.fillStyle = '#fff'; g.fillText(label, sx, sy - Math.max(6, t.R * scale) - 4);
    }
    // Player arrow (north is up).
    const [px, py] = S(o.player.x, o.player.z);
    const fx = -Math.sin(o.yaw), fz = -Math.cos(o.yaw), a = Math.atan2(fz, fx);
    g.save();
    g.translate(px, py); g.rotate(a);
    g.beginPath(); g.moveTo(8, 0); g.lineTo(-5, 5); g.lineTo(-2, 0); g.lineTo(-5, -5); g.closePath();
    g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 1.5; g.fill(); g.stroke();
    g.restore();
    g.restore();
    // Frame and north marker.
    if (o.circle) {
      g.beginPath(); g.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
      g.strokeStyle = '#ffffff55'; g.lineWidth = 2; g.stroke();
      g.font = '700 11px system-ui, sans-serif'; g.textAlign = 'center';
      g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 3;
      g.strokeText('N', size / 2, 13); g.fillText('N', size / 2, 13);
    }
  }
}
