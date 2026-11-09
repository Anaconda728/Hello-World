// Top-down builder: orbit camera, tile picking, tool placement with live previews.
import * as THREE from 'three';
import { GRID, TILE, HALF, TOOLS, TOOL_ORDER, MAX_LEVEL, worldToTile, tileCenter, inGrid, buildingYield } from '../config.js';

const MAX_PREVIEW = GRID * 2 + 4;

export class BuildMode {
  constructor(ctx) {
    this.ctx = ctx;
    const { scene } = ctx;
    this.target = new THREE.Vector3(0, 0, 0);
    this.yaw = Math.PI * 0.25;
    this.pitch = 0.85;
    this.dist = 330;
    this.smooth = { target: this.target.clone(), yaw: this.yaw, pitch: this.pitch, dist: this.dist };
    this.tool = 'road';
    this.keys = new Set();
    this.raycaster = new THREE.Raycaster();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.mouse = new THREE.Vector2();
    this.hover = null;
    this.drag = null;

    // previews
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    this.ghostMat = new THREE.MeshBasicMaterial({ color: 0x2ef6ff, transparent: true, opacity: 0.25, depthWrite: false, toneMapped: false });
    this.ghost = new THREE.Mesh(geo, this.ghostMat);
    this.ghostEdges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: new THREE.Color(0x2ef6ff).multiplyScalar(2), toneMapped: false }));
    this.ghost.add(this.ghostEdges);
    scene.add(this.ghost);
    this.multi = new THREE.InstancedMesh(geo, this.ghostMat, MAX_PREVIEW);
    this.multi.count = 0;
    this.multi.frustumCulled = false;
    scene.add(this.multi);

    const dom = ctx.renderer.domElement;
    dom.addEventListener('pointerdown', (e) => this.active && this.onDown(e));
    window.addEventListener('pointermove', (e) => this.active && this.onMove(e));
    window.addEventListener('pointerup', (e) => this.active && this.onUp(e));
    dom.addEventListener('wheel', (e) => { if (this.active) { e.preventDefault(); this.dist = THREE.MathUtils.clamp(this.dist * Math.exp(e.deltaY * 0.0012), 40, 700); } }, { passive: false });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => this.active && this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  enter() {
    this.active = true;
    this.ghost.visible = true;
    this.ctx.world.grid.visible = true;
    this.ctx.scene.fog.density = 0.0016;
    this.ctx.camera.fov = 50;
    this.ctx.camera.updateProjectionMatrix();
  }
  exit() {
    this.active = false;
    this.ghost.visible = false;
    this.multi.count = 0;
    this.drag = null;
    this.ctx.world.grid.visible = false;
    this.ctx.ui.setInfo(null);
  }
  focus(x, z) { this.target.set(x, 0, z); }

  setTool(t) {
    this.tool = t;
    const col = new THREE.Color(TOOLS[t].color);
    this.ghostMat.color.copy(col);
    this.ghostEdges.material.color.copy(col).multiplyScalar(2);
    this.ctx.ui.setTool(t);
  }

  onKey(e, down) {
    if (e.target.tagName === 'INPUT') return;
    this.keys.add(e.code);
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= TOOL_ORDER.length) this.setTool(TOOL_ORDER[n - 1]);
  }

  pick(e) {
    const r = this.ctx.renderer.domElement.getBoundingClientRect();
    this.mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.mouse, this.ctx.camera);
    const p = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.plane, p)) return null;
    const t = worldToTile(p.x, p.z);
    return { ...t, x: p.x, z: p.z };
  }

  onDown(e) {
    if (e.button === 2 || e.button === 1) {
      this.drag = { kind: 'orbit', x: e.clientX, y: e.clientY, yaw: this.yaw, pitch: this.pitch };
      return;
    }
    if (e.button !== 0) return;
    this.ctx.audio.unlock();
    const p = this.pick(e);
    if (!p) return;
    if (this.tool === 'road' || this.tool === 'bulldoze') {
      this.drag = { kind: this.tool, start: p, end: p };
    } else {
      this.drag = { kind: 'paint', last: null };
      this.paintAt(p);
    }
    this.updatePreview();
  }

  onMove(e) {
    if (this.drag?.kind === 'orbit') {
      this.yaw = this.drag.yaw - (e.clientX - this.drag.x) * 0.006;
      this.pitch = THREE.MathUtils.clamp(this.drag.pitch + (e.clientY - this.drag.y) * 0.004, 0.25, 1.45);
      return;
    }
    if (e.target !== this.ctx.renderer.domElement && !this.drag) { this.hover = null; this.updatePreview(); return; }
    const p = this.pick(e);
    this.hover = p;
    if (this.drag && p) {
      if (this.drag.kind === 'paint') this.paintAt(p);
      else this.drag.end = p;
    }
    this.updatePreview();
  }

  onUp(e) {
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    if (d.kind === 'road') {
      let placed = 0, broke = false;
      for (const [i, j] of this.roadPath(d.start, d.end)) {
        const r = this.ctx.city.setRoad(i, j, true);
        if (r === 'money') { broke = true; break; }
        if (r) placed++;
      }
      if (broke) this.ctx.ui.toast('Insufficient credits');
      if (placed) this.ctx.audio.blip(520);
    } else if (d.kind === 'bulldoze') {
      let n = 0;
      for (const [i, j] of this.rect(d.start, d.end)) {
        if (this.ctx.city.remove(i, j)) n++;
        if (this.ctx.city.setRoad(i, j, false)) n++;
      }
      if (n) this.ctx.audio.blip(160);
    }
    this.updatePreview();
  }

  paintAt(p) {
    const key = p.i + ',' + p.j;
    if (this.drag.last === key) return;
    this.drag.last = key;
    const city = this.ctx.city;
    if (this.tool === 'grow') {
      const b = city.buildingAt(p.i, p.j);
      if (!b || this.drag[b.id]) return;
      this.drag[b.id] = true; // grow each building once per stroke
      const r = city.grow(p.i, p.j);
      if (r === 'money') this.ctx.ui.toast('Insufficient credits');
      else if (r === 'max') this.ctx.ui.toast('Already at max height');
      else if (r) this.ctx.audio.blip(700);
      return;
    }
    if (!city.canPlace(this.tool, p.i, p.j)) return;
    const r = city.place(this.tool, p.i, p.j);
    if (r === 'money') this.ctx.ui.toast('Insufficient credits');
    else if (r) this.ctx.audio.blip(TOOLS[this.tool].size === 2 ? 300 : 440);
  }

  roadPath(a, b) {
    // L-shaped: along the dominant axis first, then the other
    const out = [];
    const dx = Math.sign(b.i - a.i), dz = Math.sign(b.j - a.j);
    const xFirst = Math.abs(b.i - a.i) >= Math.abs(b.j - a.j);
    let i = a.i, j = a.j;
    out.push([i, j]);
    const stepX = () => { while (i !== b.i) { i += dx; out.push([i, j]); } };
    const stepZ = () => { while (j !== b.j) { j += dz; out.push([i, j]); } };
    if (xFirst) { stepX(); stepZ(); } else { stepZ(); stepX(); }
    return out.filter(([x, z]) => inGrid(x, z)).slice(0, MAX_PREVIEW);
  }
  rect(a, b) {
    const out = [];
    for (let i = Math.min(a.i, b.i); i <= Math.max(a.i, b.i); i++)
      for (let j = Math.min(a.j, b.j); j <= Math.max(a.j, b.j); j++) if (inGrid(i, j)) out.push([i, j]);
    return out;
  }

  updatePreview() {
    const city = this.ctx.city;
    const m = new THREE.Matrix4();
    this.multi.count = 0;
    if (this.drag && (this.drag.kind === 'road' || this.drag.kind === 'bulldoze')) {
      this.ghost.visible = false;
      const tiles = this.drag.kind === 'road' ? this.roadPath(this.drag.start, this.drag.end) : this.rect(this.drag.start, this.drag.end).slice(0, MAX_PREVIEW);
      tiles.forEach(([i, j], k) => {
        const c = tileCenter(i, j);
        const b = city.buildingAt(i, j);
        const h = this.drag.kind === 'bulldoze' && b ? Math.min(b.height, 80) : 0.6;
        m.compose(new THREE.Vector3(c.x, 0, c.z), new THREE.Quaternion(), new THREE.Vector3(TILE * 0.96, h, TILE * 0.96));
        this.multi.setMatrixAt(k, m);
      });
      this.multi.count = tiles.length;
      this.multi.instanceMatrix.needsUpdate = true;
      if (this.drag.kind === 'road') {
        const n = tiles.filter(([i, j]) => city.canRoad(i, j)).length;
        this.ctx.ui.setInfo(`Road × ${n} — ¢${n * TOOLS.road.cost}`);
      } else this.ctx.ui.setInfo(`Demolish ${tiles.length} tiles`);
      return;
    }
    const p = this.hover;
    if (!p || !inGrid(p.i, p.j)) { this.ghost.visible = false; this.ctx.ui.setInfo(null); return; }
    this.ghost.visible = true;
    const b = city.buildingAt(p.i, p.j);
    const t = TOOLS[this.tool];
    if ((this.tool === 'grow' || this.tool === 'bulldoze') && b) {
      const c = city.center(b);
      this.ghost.position.set(c.x, 0, c.z);
      this.ghost.scale.set(TILE * b.size, b.height + 2, TILE * b.size);
    } else {
      const c = tileCenter(p.i, p.j);
      const s = t.size;
      this.ghost.position.set(c.x + (s - 1) * TILE / 2, 0, c.z + (s - 1) * TILE / 2);
      const h = this.tool === 'road' || this.tool === 'bulldoze' ? 0.6 : this.tool === 'plaza' ? 3 : 24;
      this.ghost.scale.set(TILE * s * 0.96, h, TILE * s * 0.96);
    }
    let valid = true;
    if (this.tool === 'road') valid = city.canRoad(p.i, p.j);
    else if (this.tool === 'grow') valid = !!b && b.level < MAX_LEVEL;
    else if (this.tool === 'bulldoze') valid = !!b || city.isRoad(p.i, p.j);
    else valid = city.canPlace(this.tool, p.i, p.j);
    this.ghostMat.opacity = valid ? 0.25 : 0.1;
    this.ghostEdges.material.color.set(valid ? t.color : '#ff3050').multiplyScalar(2);

    if (b) {
      const y = buildingYield(b.type, b.level);
      const conn = b.type === 'plaza' || b.type === 'billboard' || city.connected(b);
      let s = `${TOOLS[b.type].name} · LVL ${b.level} · ${Math.round(b.height)}m`;
      if (y.pop) s += ` · ${y.pop} residents`;
      if (y.jobs) s += ` · ${y.jobs} jobs`;
      s += conn ? '' : ' · NO ROAD ACCESS';
      if (this.tool === 'grow') s += b.level < MAX_LEVEL ? ` — grow ¢${city.growCost(b)}` : ' — max height';
      this.ctx.ui.setInfo(s);
    } else if (this.tool !== 'grow' && this.tool !== 'bulldoze') {
      this.ctx.ui.setInfo(`${t.name} — ¢${t.cost}`);
    } else this.ctx.ui.setInfo(null);
  }

  update(dt) {
    const k = this.keys;
    const speed = this.dist * 1.1 * dt;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    if (k.has('KeyW') || k.has('ArrowUp')) { this.target.x += fx * speed; this.target.z += fz * speed; }
    if (k.has('KeyS') || k.has('ArrowDown')) { this.target.x -= fx * speed; this.target.z -= fz * speed; }
    if (k.has('KeyD') || k.has('ArrowRight')) { this.target.x += rx * speed; this.target.z += rz * speed; }
    if (k.has('KeyA') || k.has('ArrowLeft')) { this.target.x -= rx * speed; this.target.z -= rz * speed; }
    if (k.has('KeyQ')) this.yaw += 1.6 * dt;
    if (k.has('KeyE')) this.yaw -= 1.6 * dt;
    if (k.has('KeyR')) this.dist = Math.max(40, this.dist * (1 - dt * 1.5));
    if (k.has('KeyT')) this.dist = Math.min(700, this.dist * (1 + dt * 1.5));
    const lim = HALF + 60;
    this.target.x = THREE.MathUtils.clamp(this.target.x, -lim, lim);
    this.target.z = THREE.MathUtils.clamp(this.target.z, -lim, lim);

    const s = this.smooth, a = 1 - Math.exp(-dt * 10);
    s.target.lerp(this.target, a);
    s.yaw += (this.yaw - s.yaw) * a;
    s.pitch += (this.pitch - s.pitch) * a;
    s.dist += (this.dist - s.dist) * a;
    const cam = this.ctx.camera;
    cam.position.set(
      s.target.x + Math.sin(s.yaw) * Math.cos(s.pitch) * s.dist,
      s.target.y + Math.sin(s.pitch) * s.dist,
      s.target.z + Math.cos(s.yaw) * Math.cos(s.pitch) * s.dist,
    );
    cam.lookAt(s.target);
    if (this.drag || this.hover) this.updatePreviewThrottled();
  }
  updatePreviewThrottled() {
    // the city can change under a still cursor (growth, new roads) - refresh a few times a second
    const now = performance.now();
    if (now - (this._lastPrev || 0) > 200) { this._lastPrev = now; this.updatePreview(); }
  }
}
