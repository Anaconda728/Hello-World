// Travellers on the roads: horse-drawn trade wagons and riders on horseback.
import * as THREE from 'three';
import { buildHuman, makeBubble } from './npcs.js';
import { nearestNode, findPath } from './towns.js';

// ---------- models ----------
const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);
const SACK = new THREE.IcosahedronGeometry(0.5, 1);
const CANVAS = (() => {
  const g = new THREE.CylinderGeometry(0.72, 0.72, 2.1, 12, 1, true, 0, Math.PI);
  g.rotateX(Math.PI / 2);
  g.rotateZ(Math.PI / 2);
  return g;
})();
const matCache = new Map();
const M = (c) => {
  if (!matCache.has(c)) matCache.set(c, new THREE.MeshLambertMaterial({ color: c, flatShading: true }));
  return matCache.get(c);
};
const CANVAS_MAT = new THREE.MeshLambertMaterial({ color: 0xe8dcc0, side: THREE.DoubleSide, flatShading: true });
const LAMP = new THREE.MeshBasicMaterial({ color: 0xffc66b });

function part(parent, geo, mat, pos, scl, rot) {
  const m = new THREE.Mesh(geo, typeof mat === 'number' ? M(mat) : mat);
  m.position.set(...pos); m.scale.set(...scl);
  if (rot) m.rotation.set(...rot);
  parent.add(m);
  return m;
}

const COATS = [0x6b4a2e, 0x3a2a1e, 0x8a6a4a, 0xd8d0c0, 0x2a2420, 0x9a7a5a];

function buildHorse(rng) {
  const g = new THREE.Group();
  const coat = COATS[Math.floor(rng() * COATS.length)];
  const mane = coat === 0xd8d0c0 ? 0x9a9488 : 0x1e1612;
  part(g, BOX, coat, [0, 1.25, 0], [0.55, 0.6, 1.5]);
  part(g, BOX, coat, [0, 1.62, 0.78], [0.3, 0.75, 0.36], [0.6, 0, 0]);
  part(g, BOX, mane, [0, 1.72, 0.66], [0.08, 0.7, 0.2], [0.6, 0, 0]);
  const head = new THREE.Group();
  head.position.set(0, 1.95, 1.05);
  g.add(head);
  part(head, BOX, coat, [0, -0.08, 0.2], [0.26, 0.26, 0.6], [0.75, 0, 0]);
  part(head, BOX, 0x1a1a1a, [0, -0.3, 0.42], [0.2, 0.12, 0.1], [0.75, 0, 0]);
  for (const s of [-1, 1]) part(head, BOX, coat, [s * 0.08, 0.14, 0.02], [0.06, 0.16, 0.06]);
  part(g, BOX, mane, [0, 1.1, -0.82], [0.12, 0.7, 0.12], [0.35, 0, 0]);
  const legs = [[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([sx, sz]) => {
    const p = new THREE.Group();
    p.position.set(sx * 0.18, 1.0, sz * 0.55);
    part(p, BOX, coat, [0, -0.45, 0], [0.14, 0.9, 0.16]);
    part(p, BOX, 0x1e1a16, [0, -0.95, 0.01], [0.16, 0.1, 0.18]);
    g.add(p);
    return p;
  });
  return { group: g, legs, head };
}

function buildCart(rng, covered) {
  const g = new THREE.Group();
  const wood = 0x7a5a3a, dark = 0x4a3420;
  part(g, BOX, wood, [0, 0.82, 0], [1.3, 0.14, 2.2]);
  for (const s of [-1, 1]) part(g, BOX, wood, [s * 0.65, 1.05, 0], [0.08, 0.36, 2.2]);
  part(g, BOX, wood, [0, 1.05, -1.08], [1.3, 0.36, 0.08]);
  part(g, BOX, dark, [0, 1.25, 1.0], [1.2, 0.1, 0.42]);
  part(g, BOX, dark, [0, 1.45, 0.8], [1.2, 0.36, 0.06]);
  for (const s of [-1, 1]) part(g, BOX, dark, [s * 0.38, 0.86, 1.85], [0.07, 0.07, 1.8], [0.08, 0, 0]);
  const wheels = [];
  for (const s of [-1, 1]) {
    const w = new THREE.Group();
    w.position.set(s * 0.74, 0.55, -0.35);
    part(w, CYL, dark, [0, 0, 0], [1.1, 0.1, 1.1], [0, 0, Math.PI / 2]);
    part(w, BOX, wood, [0, 0, 0], [0.12, 1.0, 0.08]);
    part(w, BOX, wood, [0, 0, 0], [0.12, 0.08, 1.0]);
    g.add(w);
    wheels.push(w);
  }
  const cargo = [];
  if (covered) {
    part(g, CANVAS, CANVAS_MAT, [0, 1.15, -0.1], [1, 1, 1]);
  }
  for (let i = 0; i < 5; i++) {
    const k = rng(), x = (i % 2 ? 0.3 : -0.3), z = -0.7 + Math.floor(i / 2) * 0.6;
    let m;
    if (k < 0.4) m = part(g, BOX, [0x9a7a4a, 0x8a6a3a][i % 2], [x, 1.1, z], [0.45, 0.4, 0.45]);
    else if (k < 0.7) m = part(g, CYL, 0x6b4a2e, [x, 1.15, z], [0.42, 0.55, 0.42]);
    else m = part(g, SACK, 0xc9b48a, [x, 1.08, z], [0.45, 0.35, 0.5]);
    cargo.push(m);
  }
  const lamp = part(g, BOX, LAMP, [0.6, 1.75, 1.15], [0.12, 0.16, 0.12]);
  part(g, BOX, dark, [0.6, 1.4, 1.15], [0.05, 0.6, 0.05]);
  return { group: g, wheels, cargo, lamp };
}

function seat(person, onHorse) {
  const m = person;
  for (const [i, l] of m.legs.entries()) {
    l.rotation.set(onHorse ? -0.5 : -1.45, 0, onHorse ? (i ? -0.45 : 0.45) : 0);
  }
}

// ---------- routes ----------
function makeRoute(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, cum, total: cum[cum.length - 1] };
}
function sampleRoute(r, s, out) {
  const { pts, cum } = r;
  s = Math.max(0, Math.min(r.total, s));
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= s) lo = mid; else hi = mid; }
  const a = pts[lo], b = pts[Math.min(lo + 1, pts.length - 1)];
  const seg = cum[lo + 1] !== undefined ? cum[lo + 1] - cum[lo] : 1;
  const t = seg > 0 ? (s - cum[lo]) / seg : 0;
  let tx = b[0] - a[0], tz = b[1] - a[1];
  const tl = Math.hypot(tx, tz) || 1;
  out.x = a[0] + tx * t; out.z = a[1] + tz * t; out.tx = tx / tl; out.tz = tz / tl;
  return out;
}

const NAMES = ['Odo', 'Mirel', 'Bram', 'Tilda', 'Garrick', 'Yesna', 'Corwin', 'Petra', 'Halvard', 'Inge', 'Rowan', 'Esk', 'Dagny', 'Fulke'];
const SURN = ['of the Road', 'Wainwright', 'Carter', 'Drover', 'Packer', 'Ostler', 'Waggoner', 'Rider'];
const TRADE_POOL = [['ingot', 10], ['powder', 4], ['ammo', 3], ['stew', 7], ['bandage', 9], ['hide', 4], ['cooked', 5], ['meat', 2]];
const BUYS = [['hide', 3], ['meat', 2], ['ingot', 6], ['feather', 2], ['cooked', 3]];
const pickL = (a) => a[Math.floor(Math.random() * a.length)];
const LINES = {
  greet: ['Safe travels!', 'Fine road today.', 'Mind the ruts.', 'Good day, friend.'],
  night: ["Roads aren't safe after dark.", 'Keep your lantern lit.'],
  blocked: ['Out of the way!', 'Move aside!', 'Shift, will you?', 'Coming through!'],
  panic: ['Hyah!', 'Bandits!', 'Run, girl, run!', 'Help!'],
  handsup: ["Don't shoot!", 'Easy now...', 'I want no trouble!'],
  robbed: ["Take it! Just let me go!", 'Here, take the purse!'],
  unload: ['Delivery for the market!', 'Unloading here.', 'Fresh goods from the road!'],
};

let travelerId = 0;
const tmp = { x: 0, z: 0, tx: 0, tz: 1 }, tmp2 = { x: 0, z: 0, tx: 0, tz: 1 };

class Traveler {
  constructor(kind, rng) {
    this.id = travelerId++;
    this.kind = kind;
    this.name = NAMES[Math.floor(rng() * NAMES.length)] + ' ' + SURN[Math.floor(rng() * SURN.length)];
    this.horse = buildHorse(rng);
    this.horseRoot = new THREE.Group();
    this.horseRoot.add(this.horse.group);
    this.person = buildHuman(rng, 'laborer', 0);
    this.person.group.scale.setScalar(0.95);
    this.cart = null;
    this.cartRoot = null;
    if (kind === 'wagon') {
      this.cart = buildCart(rng, rng() < 0.5);
      this.cartRoot = new THREE.Group();
      this.cartRoot.add(this.cart.group);
      this.cart.group.add(this.person.group);
      this.person.group.position.set(0, 0.48, 1.0);
      seat(this.person, false);
      this.person.arms.forEach((a) => a.rotation.set(-0.9, 0, 0));
    } else {
      this.horse.group.add(this.person.group);
      this.person.group.position.set(0, 0.72, -0.05);
      seat(this.person, true);
      part(this.horse.group, BOX, 0x5a3a22, [0, 1.58, -0.05], [0.58, 0.08, 0.6]);
    }
    for (const r of [this.horseRoot, this.cartRoot]) if (r) r.userData.traveler = this;
    this.base = kind === 'wagon' ? 3.0 : 5.2;
    this.speed = 0;
    this.s = 0;
    this.off = 1.0;
    this.hp = kind === 'wagon' ? 16 : 12;
    this.state = 'travel';
    this.leg = 'road';
    this.timer = 0;
    this.blockedT = 0;
    this.swerveUntil = -1;
    this.heading = 0;
    this.cartHeading = 0;
    this.hy = null; this.cy = null;
    this.phase = 0;
    this.bubble = null; this.bubbleT = 0; this.bubbleCd = 0;
    this.holdT = 0; this.robbed = false; this.trampleCd = 0;
    this.dead = false; this.deadT = 0;
    this.stock = [];
    const pool = TRADE_POOL.slice().sort(() => rng() - 0.5);
    this.stock = pool.slice(0, 4);
  }
}

export class Travelers {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.list = [];
    this.spawnT = 2;
    this.onLoot = null;
    this.onCrime = null;
  }

  roots() {
    const out = [];
    for (const t of this.list) if (!t.dead) { out.push(t.horseRoot); if (t.cartRoot) out.push(t.cartRoot); }
    return out;
  }

  colliders(x, z) {
    const out = [];
    for (const t of this.list) {
      const hp = t.horseRoot.position;
      if (Math.abs(hp.x - x) > 12 || Math.abs(hp.z - z) > 12) continue;
      out.push({ x0: hp.x - 0.45, x1: hp.x + 0.45, z0: hp.z - 0.45, z1: hp.z + 0.45, bottom: hp.y - 0.5, top: hp.y + 1.6 });
      if (t.cartRoot) {
        const cp = t.cartRoot.position;
        out.push({ x0: cp.x - 0.8, x1: cp.x + 0.8, z0: cp.z - 0.8, z1: cp.z + 0.8, bottom: cp.y - 0.5, top: cp.y + 1.2 });
      }
    }
    return out;
  }

  // ---------- spawning ----------
  trySpawn(ctx) {
    const max = ctx.night ? 1 : 4;
    if (this.list.length >= max) return;
    const p = ctx.player.pos, w = this.world;
    const roads = new Set();
    for (const dx of [-160, 0, 160]) for (const dz of [-160, 0, 160]) for (const r of w.roads.roadsNear(p.x + dx, p.z + dz)) roads.add(r);
    const arr = [...roads];
    if (!arr.length) return;
    const road = arr[Math.floor(Math.random() * arr.length)];
    const cand = [];
    road.pts.forEach(([x, z], i) => {
      const d = Math.hypot(x - p.x, z - p.z);
      if (d > 70 && d < 150 && w.isReadyAt(x, z)) cand.push(i);
    });
    if (!cand.length) return;
    const i = cand[Math.floor(Math.random() * cand.length)];
    const forward = Math.random() < 0.5;
    const pts = forward ? road.pts.slice(i) : road.pts.slice(0, i + 1).reverse();
    if (pts.length < 4) return;
    for (const t of this.list) if (Math.hypot(t.horseRoot.position.x - pts[0][0], t.horseRoot.position.z - pts[0][1]) < 15) return;
    const rng = Math.random;
    const tr = new Traveler(rng() < 0.65 ? 'wagon' : 'rider', rng);
    tr.road = road;
    tr.from = forward ? road.a : road.b;
    tr.dest = forward ? road.b : road.a;
    tr.route = makeRoute(pts);
    tr.s = tr.kind === 'wagon' ? 2.7 : 0.5;
    tr.speed = tr.base;
    this.list.push(tr);
    this.scene.add(tr.horseRoot);
    if (tr.cartRoot) this.scene.add(tr.cartRoot);
    this.place(tr, 1);
  }

  remove(t) {
    this.clearBubble(t);
    this.scene.remove(t.horseRoot);
    if (t.cartRoot) this.scene.remove(t.cartRoot);
    this.list.splice(this.list.indexOf(t), 1);
  }

  // ---------- legs ----------
  gateOf(road, town) { return road.a === town ? road.pts[0] : road.pts[road.pts.length - 1]; }

  townPath(town, from, toCenter) {
    const g = nearestNode(town, from[0], from[1]);
    const ids = findPath(town, g, town.centerNode);
    if (ids.length > 2) ids.pop();       // stop at the edge of the plaza
    const pts = ids.map((i) => [town.nodes[i].x, town.nodes[i].z]);
    return toCenter ? pts : pts.reverse();
  }

  nextLeg(t) {
    const end = t.route.pts[t.route.pts.length - 1];
    if (t.leg === 'road') {
      const inner = this.townPath(t.dest, end, true);
      t.leg = 'in';
      t.route = makeRoute([end, ...inner]);
      t.s = 0;
      if (t.route.total < 2) this.nextLeg(t);
    } else if (t.leg === 'in') {
      t.leg = 'unload';
      t.state = 'unload';
      t.timer = t.kind === 'wagon' ? 18 + Math.random() * 15 : 6 + Math.random() * 6;
    } else if (t.leg === 'unload') {
      const town = t.dest;
      const roads = this.world.roads.roadsOf(town);
      let next = roads.filter((r) => r !== t.road);
      if (!next.length || Math.random() < 0.25) next = roads;
      const road = next[Math.floor(Math.random() * next.length)] || t.road;
      const gate = this.gateOf(road, town);
      const out = this.townPath(town, gate, false);
      const roadPts = road.a === town ? road.pts : road.pts.slice().reverse();
      t.road = road;
      t.from = town;
      t.dest = road.a === town ? road.b : road.a;
      t.route = makeRoute([end, ...out, ...roadPts.slice(1)]);
      t.leg = 'road';
      t.state = 'travel';
      t.s = 0;
      if (t.cart) t.cart.cargo.forEach((c) => (c.visible = true));
    }
  }

  // ---------- speech ----------
  say(t, text, dur = 2.6) {
    this.clearBubble(t);
    t.bubble = makeBubble(text);
    t.person.group.add(t.bubble);
    t.bubbleT = dur;
    t.bubbleCd = dur + 3;
  }
  clearBubble(t) {
    if (!t.bubble) return;
    t.bubble.parent.remove(t.bubble);
    t.bubble.material.map.dispose();
    t.bubble.material.dispose();
    t.bubble = null;
  }

  // ---------- events ----------
  panic(t, time = 9) {
    if (t.dead) return;
    if (t.state !== 'panic') this.say(t, pickL(LINES.panic), 2);
    if (t.leg === 'unload') this.nextLeg(t);          // abandon the delivery and drive off
    t.state = 'panic';
    t.timer = time;
  }

  onGunshot(pos) {
    for (const t of this.list) if (!t.dead && t.horseRoot.position.distanceTo(pos) < 50) this.panic(t);
  }

  hit(t, dmg, dir, ctx) {
    if (t.dead) return;
    t.hp -= dmg;
    this.panic(t, 12);
    if (t.hp <= 0) {
      t.dead = true; t.deadT = 0; t.state = 'dead';
      this.clearBubble(t);
      if (this.onLoot) this.onLoot(t, true);
      if (this.onCrime) this.onCrime(t, 'killing a traveller', 2);
    } else if (this.onCrime) this.onCrime(t, 'attacking a traveller', 1);
  }

  aimedAt(t, dt, ctx) {
    if (t.dead || t.state === 'panic') return;
    if (t.state !== 'handsup') this.say(t, pickL(LINES.handsup));
    t.state = 'handsup';
    t.timer = 0.8;
    t.holdT += dt;
    if (t.holdT > 2 && !t.robbed) {
      t.robbed = true;
      this.say(t, pickL(LINES.robbed));
      if (this.onLoot) this.onLoot(t, false);
      if (this.onCrime) this.onCrime(t, 'highway robbery', 1);
    }
  }

  canTalk(t) { return !t.dead && ['travel', 'unload', 'talk'].includes(t.state); }
  startTalk(t) { t.prevState = t.state === 'talk' ? t.prevState : t.state; t.state = 'talk'; this.clearBubble(t); }
  endTalk(t) { if (t.state === 'talk') t.state = t.prevState || 'travel'; }
  greeting(t, hour) {
    if (hour < 5 || hour > 21) return pickL(LINES.night);
    return t.state === 'unload' ? pickL(LINES.unload) : pickL(LINES.greet);
  }

  // ---------- per-frame ----------
  update(dt, ctx) {
    this.spawnT -= dt;
    if (this.spawnT <= 0) { this.spawnT = 3 + Math.random() * 4; this.trySpawn(ctx); }
    const p = ctx.player.pos;
    for (const t of this.list.slice()) {
      const hp = t.horseRoot.position;
      if (hp.distanceTo(p) > 230) { this.remove(t); continue; }
      if (t.bubble) { t.bubbleT -= dt; if (t.bubbleT <= 0) this.clearBubble(t); }
      t.bubbleCd -= dt; t.trampleCd -= dt;
      if (t.dead) {
        t.deadT += dt;
        t.horse.group.rotation.z = Math.min(Math.PI / 2, t.deadT * 4);
        if (t.kind === 'rider') t.person.group.rotation.z = Math.min(Math.PI / 2, t.deadT * 4);
        else t.person.group.rotation.x = Math.min(1.2, t.deadT * 3);
        if (t.deadT > 45) this.remove(t);
        continue;
      }
      // Decide how fast to go.
      let target = t.base * (t.leg === 'in' ? 0.6 : 1);
      if (t.state === 'unload' || t.state === 'talk' || t.state === 'handsup') target = 0;
      if (t.state === 'panic') {
        target = 8.5;
        t.timer -= dt;
        if (t.timer <= 0) { t.state = 'travel'; this.say(t, 'Whoa, whoa...'); }
      }
      if (t.state === 'handsup') {
        t.timer -= dt;
        if (t.timer <= 0) { t.holdT = 0; this.panic(t, 10); }
      }
      if (t.state === 'unload') {
        t.timer -= dt;
        if (t.cart) t.cart.cargo.forEach((c, i) => (c.visible = t.timer > i * 3));
        if (t.timer <= 0) this.nextLeg(t);
        if (hp.distanceTo(p) < 8 && t.bubbleCd <= 0 && Math.random() < dt * 0.5) this.say(t, pickL(LINES.unload));
      }
      // Traffic: wait for the player or slower travellers ahead.
      const fx = Math.sin(t.heading), fz = Math.cos(t.heading);
      let blocked = false;
      if (t.state === 'travel') {
        const rx = p.x - hp.x, rz = p.z - hp.z, along = rx * fx + rz * fz, lat = rx * fz - rz * fx;
        if (along > 0 && along < 5.5 && Math.abs(lat) < 1.7 && Math.abs(p.y - hp.y) < 2.5) blocked = true;
        for (const o of this.list) {
          if (o === t || o.dead) continue;
          const op = o.cartRoot ? o.cartRoot.position : o.horseRoot.position;
          const ox = op.x - hp.x, oz = op.z - hp.z, oa = ox * fx + oz * fz, ol = ox * fz - oz * fx;
          if (oa > 0 && oa < 5 && Math.abs(ol) < 1.4 && Math.sin(o.heading) * fx + Math.cos(o.heading) * fz > 0.3) { target = Math.min(target, o.speed * 0.8); }
        }
      }
      if (blocked) {
        target = 0;
        t.blockedT += dt;
        if (t.blockedT > 1.2 && t.bubbleCd <= 0) this.say(t, pickL(LINES.blocked));
        if (t.blockedT > 6) { t.swerveUntil = t.s + 14; t.blockedT = 0; }
      } else t.blockedT = Math.max(0, t.blockedT - dt);
      if (t.s < t.swerveUntil) { if (blocked) target = t.base * 0.5; }
      t.speed += (target - t.speed) * Math.min(1, dt * (t.state === 'panic' ? 3 : 1.6));
      t.s += t.speed * dt;
      if (t.s >= t.route.total) {
        if (t.leg === 'road' || t.leg === 'in') this.nextLeg(t);
        else t.s = t.route.total;
      }
      // Trampling.
      if (t.speed > 6 && t.trampleCd <= 0 && Math.hypot(p.x - hp.x, p.z - hp.z) < 1.3 && Math.abs(p.y - hp.y) < 2) {
        t.trampleCd = 1.5;
        ctx.damage(5, 'Trampled by a horse', hp);
      }
      // Greet passers-by.
      if (t.state === 'travel' && !blocked && t.bubbleCd <= 0 && hp.distanceTo(p) < 6 && Math.random() < dt * 0.7) this.say(t, this.greeting(t, ctx.hour));
      this.place(t, dt);
      this.animate(t, dt, ctx);
    }
  }

  place(t, dt) {
    const w = this.world;
    const offTarget = t.s < t.swerveUntil ? 2.8 : t.leg === 'road' ? 1.0 : 0.8;
    t.off += (offTarget - t.off) * Math.min(1, dt * 1.5);
    sampleRoute(t.route, t.s, tmp);
    const hx = tmp.x - tmp.tz * t.off, hz = tmp.z + tmp.tx * t.off;
    const hy = w.groundY(hx, t.hy ?? w.heightAt(hx, hz), hz);
    if (isFinite(hy)) t.hy = hy;
    t.horseRoot.position.set(hx, t.hy ?? 0, hz);
    const wantH = Math.atan2(tmp.tx, tmp.tz);
    t.heading += Math.atan2(Math.sin(wantH - t.heading), Math.cos(wantH - t.heading)) * Math.min(1, dt * 5);
    t.horseRoot.rotation.y = t.heading;
    if (t.cartRoot) {
      // The cart trails behind the horse along the same route.
      sampleRoute(t.route, t.s - 2.7, tmp2);
      let cx = tmp2.x - tmp2.tz * t.off, cz = tmp2.z + tmp2.tx * t.off;
      const dx = hx - Math.sin(t.heading) * 2.7 - cx, dz = hz - Math.cos(t.heading) * 2.7 - cz;
      if (t.s < 2.7) { cx += dx; cz += dz; }
      const cy = w.groundY(cx, t.cy ?? t.hy ?? 0, cz);
      if (isFinite(cy)) t.cy = cy;
      t.cartRoot.position.set(cx, t.cy ?? t.hy ?? 0, cz);
      t.cartRoot.rotation.y = Math.atan2(hx - cx, hz - cz);
    }
  }

  animate(t, dt, ctx) {
    const h = t.horse, sp = t.speed;
    t.phase += dt * (sp * 2.4 + 0.3);
    const gallop = sp > 6, amp = Math.min(1, sp / 3) * (gallop ? 0.75 : 0.4);
    const a = Math.sin(t.phase) * amp, b = Math.sin(t.phase + (gallop ? 0.9 : Math.PI)) * amp;
    h.legs[0].rotation.x = a; h.legs[3].rotation.x = gallop ? a * 0.8 : a;
    h.legs[1].rotation.x = b; h.legs[2].rotation.x = gallop ? b * 0.8 : b;
    h.head.rotation.x = Math.sin(t.phase * 2) * 0.05 * Math.min(1, sp) + (sp < 0.2 ? 0.35 + Math.sin(t.phase * 0.2) * 0.15 : 0);
    h.group.position.y = gallop ? Math.abs(Math.sin(t.phase)) * 0.12 : 0;
    if (t.cart) {
      t.cart.wheels.forEach((w) => (w.rotation.x += (sp * dt) / 0.55));
      t.cart.lamp.material = ctx.night ? LAMP : M(0x3a3a3a);
    }
    const m = t.person;
    m.lantern.visible = ctx.night && t.kind === 'rider';
    if (t.state === 'handsup') m.arms.forEach((ar) => ar.rotation.set(Math.PI, 0, 0));
    else if (t.state === 'panic') m.arms.forEach((ar, i) => ar.rotation.set(-1.1 + Math.sin(t.phase * 2 + i) * 0.3, 0, 0));
    else m.arms.forEach((ar) => ar.rotation.set(-0.9, 0, 0));
    m.body.position.y = gallop ? Math.abs(Math.sin(t.phase)) * 0.06 : 0;
  }
}

export const TRAVELER_BUYS = BUYS;
