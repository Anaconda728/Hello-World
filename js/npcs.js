// Townsfolk: daily routines, reactions to the player and the world, and the law.
import * as THREE from 'three';
import { makeRng } from './noise.js';
import { nearestNode, findPath, pushOut, clearLine } from './towns.js';

// ---------- names & lines ----------
const FIRST_A = ['Al', 'Bel', 'Cor', 'Dan', 'El', 'Fen', 'Gar', 'Hal', 'Is', 'Jor', 'Kel', 'Lin', 'Mar', 'Nor', 'Os', 'Per',
  'Quin', 'Ros', 'Sel', 'Tam', 'Ul', 'Ver', 'Wil', 'Yor', 'Ada', 'Bri', 'Cal', 'Edm'];
const FIRST_B = ['a', 'en', 'ric', 'wyn', 'ia', 'o', 'ard', 'ett', 'ie', 'us', 'ora', 'iel', 'an', 'ith', 'ey', 'ina'];
const SURNAMES = ['Ashby', 'Brook', 'Carter', 'Dale', 'Fletcher', 'Hollow', 'Marsh', 'Penn', 'Reed', 'Stone', 'Thatcher',
  'Wells', 'Ward', 'Fenn', 'Mills', 'Cooper', 'Hayes', 'Tanner', 'Birch', 'Croft'];
export const JOB_TITLES = { merchant: 'Merchant', smith: 'Blacksmith', keeper: 'Innkeeper', guard: 'Town guard', laborer: 'Labourer', idler: 'Townsfolk' };

const pickL = (arr) => arr[Math.floor(Math.random() * arr.length)];
const LINES = {
  morning: ['Morning!', 'Fine day for it.', 'Up early, are we?', 'Lovely morning.'],
  day: ['Afternoon.', 'Busy, busy...', 'Good day to you.', "Can't stop, sorry!"],
  evening: ['Evening, traveller.', 'Off to the tavern?', 'Long day...'],
  night: ['Out late, aren\'t you?', 'Mind the jackals.', 'Should be abed...'],
  cold: ['Hmph.', 'Keep walking.', 'I know what you did.', 'Stay away from me.'],
  panic: ['Run!', 'Help!', 'Guards!', 'Aaah!', 'Murder!', 'Get down!'],
  bump: ['Hey, watch it!', 'Oof!', 'Excuse you!', 'Look where you\'re going!', 'Oi!'],
  handsup: ['Don\'t shoot!', 'Please, I have a family!', 'Easy, easy...', 'Take whatever you want!'],
  warn: ['Lower your weapon!', 'Hold your fire!', 'Put that away!', 'Don\'t try it.'],
  hunt: ['Halt!', 'Stop right there!', 'In the name of the town!', 'There they are!'],
  beast: ['Beast!', 'Get back, creature!', 'Jackal in town!'],
};

// ---------- models ----------
const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
const CONE = new THREE.ConeGeometry(0.5, 1, 8);
const matCache = new Map();
const M = (c) => {
  if (!matCache.has(c)) matCache.set(c, new THREE.MeshLambertMaterial({ color: c, flatShading: true }));
  return matCache.get(c);
};
const LANTERN = new THREE.MeshBasicMaterial({ color: 0xffc66b });
const SKIN = [0xf1d3b3, 0xe0b48f, 0xc68e63, 0x9b6a45, 0x6e4a32];
const HAIR = [0x2b1d14, 0x5a3a22, 0x8a5a2b, 0xc9a560, 0x1a1a1a, 0x9a9a9a];
const CLOTH = [0x6b8e5a, 0x7a4a3a, 0x3f5f8a, 0x8a6a3a, 0x5a5a6e, 0x9a3a3a, 0x4a6a6a, 0xb08a4a, 0x6a4a7a];
const TROUSERS = [0x3a3a44, 0x4a3a2a, 0x2e3a4a, 0x5a4a3a];

function box(parent, color, pos, scl, rot) {
  const m = new THREE.Mesh(BOX, typeof color === 'number' ? M(color) : color);
  m.position.set(...pos); m.scale.set(...scl);
  if (rot) m.rotation.set(...rot);
  parent.add(m);
  return m;
}

export function buildHuman(rng, job, townColor) {
  const r = (arr) => arr[Math.floor(rng() * arr.length)];
  const skin = r(SKIN), hair = r(HAIR), legsC = r(TROUSERS);
  const shirt = job === 'guard' ? 0x5a5f6a : job === 'bandit' ? r([0x2e2626, 0x3a2e24, 0x24282e, 0x4a3a2a]) : r(CLOTH);
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const legs = [-1, 1].map((s) => {
    const p = new THREE.Group();
    p.position.set(s * 0.12, 0.86, 0);
    box(p, legsC, [0, -0.4, 0], [0.17, 0.8, 0.2]);
    box(p, 0x2a1e16, [0, -0.82, 0.03], [0.18, 0.1, 0.26]);
    body.add(p);
    return p;
  });
  box(body, shirt, [0, 1.17, 0], [0.48, 0.62, 0.27]);
  box(body, 0x3a2a1a, [0, 0.9, 0], [0.5, 0.08, 0.29]);
  if (job === 'smith') box(body, 0x3a2a20, [0, 1.05, 0.15], [0.42, 0.62, 0.03]);
  if (job === 'keeper') box(body, 0xeeeae0, [0, 1.0, 0.15], [0.4, 0.5, 0.03]);
  if (job === 'guard') box(body, townColor, [0, 1.15, 0.145], [0.36, 0.52, 0.02]);
  const arms = [-1, 1].map((s) => {
    const p = new THREE.Group();
    p.position.set(s * 0.31, 1.44, 0);
    box(p, shirt, [0, -0.28, 0], [0.13, 0.58, 0.14]);
    box(p, skin, [0, -0.62, 0], [0.11, 0.12, 0.12]);
    body.add(p);
    return p;
  });
  const head = new THREE.Group();
  head.position.set(0, 1.5, 0);
  body.add(head);
  box(head, skin, [0, 0.17, 0], [0.3, 0.32, 0.3]);
  box(head, hair, [0, 0.35, -0.02], [0.32, 0.08, 0.33]);
  box(head, hair, [0, 0.22, -0.15], [0.32, 0.26, 0.04]);
  for (const s of [-1, 1]) box(head, 0x1a1a1a, [s * 0.07, 0.2, 0.152], [0.04, 0.04, 0.01]);
  if (job === 'guard') {
    const h = new THREE.Mesh(CONE, M(0x8a8d94)); h.position.set(0, 0.45, 0); h.scale.set(0.38, 0.24, 0.38); head.add(h);
    box(head, 0x8a8d94, [0, 0.34, 0], [0.36, 0.06, 0.36]);
  } else if (job === 'merchant') {
    const b = new THREE.Mesh(CYL, M(0x5a3a2a)); b.position.set(0, 0.37, 0); b.scale.set(0.52, 0.03, 0.52); head.add(b);
    const c = new THREE.Mesh(CYL, M(0x5a3a2a)); c.position.set(0, 0.46, 0); c.scale.set(0.3, 0.16, 0.3); head.add(c);
  } else if (job === 'bandit') {
    box(head, 0x9a1e1e, [0, 0.1, 0.03], [0.32, 0.14, 0.3]);
    const b = new THREE.Mesh(CYL, M(0x1e1a18)); b.position.set(0, 0.37, 0); b.scale.set(0.56, 0.03, 0.56); head.add(b);
    const c = new THREE.Mesh(CYL, M(0x1e1a18)); c.position.set(0, 0.47, 0); c.scale.set(0.3, 0.18, 0.3); head.add(c);
  } else if (job === 'laborer' && rng() < 0.6) {
    box(head, r(CLOTH), [0, 0.38, 0.03], [0.33, 0.08, 0.36]);
  }
  // Guard's musket follows the right arm.
  let weapon = null;
  if (job === 'guard' || job === 'bandit') {
    weapon = new THREE.Group();
    box(weapon, 0x5a3f28, [0, -0.5, 0.06], [0.06, 0.55, 0.08]);
    box(weapon, 0x3a3d42, [0, -0.95, 0.06], [0.035, 0.6, 0.035]);
    arms[1].add(weapon);
  }
  const lantern = new THREE.Group();
  box(lantern, LANTERN, [0, -0.78, 0.04], [0.13, 0.17, 0.13]);
  box(lantern, 0x2e2e30, [0, -0.66, 0.04], [0.15, 0.04, 0.15]);
  arms[0].add(lantern);
  lantern.visible = false;
  const crate = box(body, 0x9a7a4a, [0, 1.1, 0.32], [0.42, 0.32, 0.32]);
  crate.visible = false;
  return { group: g, body, legs, arms, head, weapon, lantern, crate };
}

// ---------- speech bubbles ----------
export function makeBubble(text) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  g.font = '600 30px system-ui, sans-serif';
  const w = Math.ceil(g.measureText(text).width) + 30;
  c.width = w; c.height = 50;
  g.font = '600 30px system-ui, sans-serif';
  g.fillStyle = 'rgba(255,255,255,0.92)';
  g.beginPath();
  g.roundRect(1, 1, w - 2, 48, 14);
  g.fill();
  g.fillStyle = '#222';
  g.textBaseline = 'middle';
  g.fillText(text, 15, 26);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  s.scale.set(w / 120, 50 / 120, 1);
  s.position.y = 2.3;
  return s;
}

// ---------- NPC ----------
const angDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
let npcCounter = 0;

class NPC {
  constructor(town, job, home, rng) {
    this.id = npcCounter++;
    this.town = town;
    this.job = job;
    this.home = home;
    this.name = FIRST_A[Math.floor(rng() * FIRST_A.length)] + FIRST_B[Math.floor(rng() * FIRST_B.length)] + ' ' + SURNAMES[Math.floor(rng() * SURNAMES.length)];
    const townColor = [0x9a2a2a, 0x2a4a9a, 0x2a7a3a, 0x8a6a1a][town.seed % 4];
    this.model = buildHuman(rng, job, townColor);
    this.root = new THREE.Group();
    this.root.add(this.model.group);
    this.root.userData.npc = this;
    this.pos = this.root.position;
    this.heading = 0;
    this.hp = job === 'guard' ? 20 : 10;
    this.state = 'routine';
    this.path = []; this.pi = 0; this.act = null; this.actKey = null; this.arrived = false;
    this.inside = false; this.insideOf = null;
    this.timer = 0; this.phase = rng() * 10; this.speed = 0;
    this.shift = (rng() - 0.5) * 1.2;
    this.lunchTavern = rng() < 0.5; this.eveTavern = rng() < 0.4;
    this.leisureIdx = Math.floor(rng() * 100);
    this.laborIdx = 0; this.laborSeq = [];
    this.patrolIdx = 0; this.patrolNode = town.centerNode;
    this.bubble = null; this.bubbleT = 0; this.bubbleCd = rng() * 5;
    this.fear = new THREE.Vector3(); this.cower = false;
    this.aimT = 0; this.atkCd = 0; this.warnT = 0; this.flash = 0;
    this.kx = 0; this.kz = 0;
    this.dead = false; this.deadT = 0;
    this.prey = null; this.preyT = 0;
  }
}

const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpC = new THREE.Vector3();

export class NPCs {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.list = [];
    this.law = { wanted: 0, unseen: 0, seen: false, reason: '' };
    this.onDeath = null;
  }

  roots() { return this.list.filter((n) => !n.dead && !n.inside).map((n) => n.root); }

  // ---------- population ----------
  populate(t, hour) {
    const rng = makeRng(t.seed ^ 0x9e3779b1);
    const homes = t.buildings.filter((b) => b.type === 'house');
    const jobs = t.stalls.map((st) => ['merchant', st]);
    jobs.push(['smith'], ['keeper']);
    const guards = t.R >= 40 ? 4 : 3;
    for (let i = 0; i < guards; i++) jobs.push(['guard']);
    const pop = Math.min(20, Math.max(jobs.length + 3, homes.length * 2 + 2));
    while (jobs.length < pop) jobs.push([rng() < 0.55 ? 'laborer' : 'idler']);
    let gi = 0;
    jobs.forEach(([job, stall], i) => {
      const home = job === 'guard' ? t.guardhouse : job === 'keeper' ? t.tavern : job === 'smith' ? t.smithy : homes[i % homes.length];
      const n = new NPC(t, job, home, rng);
      n.stall = stall;
      if (job === 'guard') { n.nightShift = gi % 3 === 2; gi++; n.patrolNode = t.patrol[Math.floor(rng() * t.patrol.length)]; }
      if (job === 'laborer') for (let k = 0; k < 6; k++) n.laborSeq.push(Math.floor(rng() * t.buildings.length));
      this.list.push(n);
      this.scene.add(n.root);
      this.placeNow(n, hour);
    });
  }

  // Put everyone where they should be right now (called on the first update after populating).
  placeNow(n, hour) {
    const act = this.activity(n, hour);
    n.actKey = act.key; n.act = act; n.arrived = true; n.path = [];
    const t = n.town;
    if (act.enter) { n.inside = true; n.insideOf = act.building; n.root.visible = false; n.pos.set(act.pos[0], t.y, act.pos[1]); return; }
    const p = act.pos || [t.nodes[act.node].x, t.nodes[act.node].z];
    n.pos.set(p[0], t.y, p[1]);
    if (act.face !== undefined) n.heading = act.face;
  }

  depopulate(t) {
    for (const n of this.list.slice()) if (n.town === t) this.remove(n);
  }

  remove(n) {
    this.clearBubble(n);
    this.scene.remove(n.root);
    this.list.splice(this.list.indexOf(n), 1);
  }

  // ---------- speech ----------
  say(n, text, dur = 2.8) {
    this.clearBubble(n);
    n.bubble = makeBubble(text);
    n.root.add(n.bubble);
    n.bubbleT = dur;
    n.bubbleCd = dur + 4 + Math.random() * 6;
  }

  clearBubble(n) {
    if (!n.bubble) return;
    n.root.remove(n.bubble);
    n.bubble.material.map.dispose();
    n.bubble.material.dispose();
    n.bubble = null;
  }

  // ---------- schedules ----------
  activity(n, hour) {
    const t = n.town, h = (hour + n.shift + 24) % 24;
    const door = (b, enter, key) => ({ key, node: b.doorNode, pos: b.door, face: b.rot, enter, building: b });
    if (n.job === 'guard') {
      const onDuty = n.nightShift ? (h >= 19 || h < 7) : (h >= 7 && h < 19);
      if (!onDuty) return door(n.home, true, 'home');
      return { key: 'patrol-' + n.patrolIdx, node: n.patrolNode, patrol: true };
    }
    if (h < 6 || h >= 22) return door(n.home, true, 'home');
    if (h < 7) return door(n.home, false, 'morning');
    if (h >= 12 && h < 13) return n.lunchTavern ? door(t.tavern, true, 'lunch') : this.plazaSpot(n, 'lunch');
    if (h >= 18) return n.eveTavern ? door(t.tavern, true, 'evening') : this.plazaSpot(n, 'evening');
    const b = t.smithy, f = [Math.sin(b.rot), Math.cos(b.rot)], l = [Math.cos(b.rot), -Math.sin(b.rot)];
    switch (n.job) {
      case 'merchant':
        return { key: 'work', node: n.stall.node, pos: n.stall.spot, face: n.stall.face, work: 'sell' };
      case 'smith':
        return { key: 'work', node: b.doorNode, pos: [b.door[0] + f[0] * 1.45 + l[0] * 0.7, b.door[1] + f[1] * 1.45 + l[1] * 0.7], face: Math.atan2(-l[0], -l[1]), work: 'hammer' };
      case 'keeper': {
        const tv = t.tavern;
        return { key: 'work', node: tv.doorNode, pos: [tv.door[0] + Math.sin(tv.rot) * 1.0, tv.door[1] + Math.cos(tv.rot) * 1.0], face: tv.rot, work: 'idle' };
      }
      case 'laborer': {
        const bb = t.buildings[n.laborSeq[n.laborIdx % n.laborSeq.length]];
        return { key: 'work-' + n.laborIdx, node: bb.doorNode, pos: bb.door, face: bb.rot + Math.PI, work: 'deliver' };
      }
      default:
        return this.plazaSpot(n, 'idle-' + Math.floor(h));
    }
  }

  plazaSpot(n, key) {
    const t = n.town;
    const s = t.leisure[(n.leisureIdx + Math.floor(n.shift * 10 + 50)) % t.leisure.length];
    return { key, node: t.centerNode, pos: s.pos, face: s.face, work: 'chat' };
  }

  plan(n, act) {
    const t = n.town;
    if (n.inside) {
      n.inside = false;
      n.root.visible = true;
      const d = n.insideOf ? n.insideOf.door : n.home.door;
      n.pos.set(d[0], t.y, d[1]);
    }
    const start = nearestNode(t, n.pos.x, n.pos.z);
    n.path = findPath(t, start, act.node).map((i) => [t.nodes[i].x, t.nodes[i].z]);
    if (act.pos) n.path.push(act.pos);
    n.pi = 0;
    n.act = act;
    n.arrived = false;
  }

  // ---------- events from the game ----------
  witnesses(pos, r, except) {
    return this.list.some((o) => o !== except && !o.dead && !o.inside && o.pos.distanceTo(pos) < r);
  }

  raiseWanted(level, reason, ctx) {
    const before = this.law.wanted;
    this.law.wanted = Math.min(5, Math.max(this.law.wanted, level));
    this.law.unseen = 0;
    if (this.law.wanted > before && reason) ctx.toast(`Wanted: ${reason}`);
  }

  addWanted(n, reason, ctx) { this.raiseWanted(Math.min(5, this.law.wanted + n), reason, ctx); }

  clearWanted() { this.law.wanted = 0; this.law.unseen = 0; }

  onGunshot(pos, reckless, ctx) {
    let guardNear = false;
    for (const n of this.list) {
      if (n.dead || n.inside) continue;
      const d = n.pos.distanceTo(pos);
      if (d > 45) continue;
      if (n.job === 'guard') { if (d < 35) guardNear = true; continue; }
      this.panic(n, pos, 8 + Math.random() * 6, d < 14 && Math.random() < 0.45);
    }
    if (reckless && guardNear && this.law.wanted === 0) {
      const g = this.list.find((n) => n.job === 'guard' && !n.dead && !n.inside && n.pos.distanceTo(pos) < 35);
      if (g) this.say(g, pickL(LINES.warn));
      this.raiseWanted(1, 'firing a weapon in town', ctx);
    }
  }

  panic(n, from, time, cower) {
    if (n.dead || n.job === 'guard') return;
    if (n.state === 'talk') n.state = 'routine';
    n.state = 'panic';
    n.timer = time;
    n.cower = cower;
    n.fear.copy(from);
    if (n.inside) return;
    if (n.bubbleCd <= 0 || Math.random() < 0.3) this.say(n, pickL(LINES.panic), 2);
  }

  // Player is aiming a weapon at this NPC.
  aimedAt(n, dt, ctx) {
    if (n.dead || n.inside) return;
    if (n.job === 'guard') {
      if (this.law.wanted > 0) return;
      n.warnT += dt;
      if (n.warnT > 0.3 && n.warnT - dt <= 0.3) this.say(n, pickL(LINES.warn));
      if (n.warnT > 3) this.raiseWanted(1, 'threatening a guard', ctx);
      return;
    }
    if (n.state !== 'handsup') this.say(n, pickL(LINES.handsup), 2.5);
    n.state = 'handsup';
    n.timer = 0.8;
    n.fear.copy(ctx.player.pos);
  }

  hit(n, dmg, dir, ctx) {
    if (n.dead) return;
    n.hp -= dmg;
    n.flash = 1;
    n.kx += dir.x * 5; n.kz += dir.z * 5;
    const t = n.town;
    const guard = n.job === 'guard';
    if (n.hp <= 0) {
      n.dead = true; n.deadT = 0; n.state = 'dead';
      this.clearBubble(n);
      t.rep -= guard ? 40 : 30;
      if (this.onDeath) this.onDeath(n);
      this.addWanted(guard ? 3 : this.witnesses(n.pos, 30, n) ? 2 : 1, guard ? 'killing a guard' : 'murder', ctx);
      for (const o of this.list) if (!o.dead && o !== n && o.pos.distanceTo(n.pos) < 30) this.panic(o, ctx.player.pos, 12, false);
      return;
    }
    t.rep -= 8;
    if (guard) {
      this.say(n, pickL(LINES.hunt));
      this.addWanted(2, 'assaulting a guard', ctx);
    } else {
      this.panic(n, ctx.player.pos, 12, false);
      this.addWanted(1, 'assault', ctx);
      for (const o of this.list) if (!o.dead && o !== n && o.pos.distanceTo(n.pos) < 18) this.panic(o, ctx.player.pos, 10, Math.random() < 0.3);
    }
  }

  canTalk(n) {
    return !n.dead && !n.inside && this.law.wanted === 0 && (n.state === 'routine' || n.state === 'talk');
  }

  startTalk(n) { n.state = 'talk'; this.clearBubble(n); }
  endTalk(n) { if (n.state === 'talk') { n.state = 'routine'; n.actKey = null; } }

  greeting(n, hour) {
    if (n.town.rep < -30) return pickL(LINES.cold);
    const h = (hour + 24) % 24;
    return pickL(h < 5 || h >= 21 ? LINES.night : h < 11 ? LINES.morning : h < 17 ? LINES.day : LINES.evening);
  }

  // ---------- per-frame ----------
  update(dt, ctx) {
    const p = ctx.player.pos, law = this.law;
    law.seen = false;
    for (const n of this.list.slice()) {
      if (n.dead) {
        n.deadT += dt;
        n.root.rotation.z = Math.min(Math.PI / 2, n.deadT * 5);
        if (n.deadT > 40) this.remove(n);
        continue;
      }
      if (n.bubble) { n.bubbleT -= dt; if (n.bubbleT <= 0) this.clearBubble(n); }
      n.bubbleCd -= dt; n.atkCd -= dt; n.flash = Math.max(0, n.flash - dt * 4);
      if (n.warnT > 0 && !ctx.aiming) n.warnT = Math.max(0, n.warnT - dt);
      const dx = p.x - n.pos.x, dz = p.z - n.pos.z, dist = Math.hypot(dx, dz);

      if (n.job === 'guard' && law.wanted > 0 && dist < 90 && (!n.inside || law.wanted >= 2)) n.state = 'hunt';
      else if (n.state === 'hunt') { n.state = 'routine'; n.actKey = null; }

      n.speed = 0;
      switch (n.state) {
        case 'routine': this.routine(n, dt, ctx, dist); break;
        case 'panic': this.panicStep(n, dt, ctx); break;
        case 'handsup':
          n.timer -= dt;
          n.heading += angDiff(n.heading, Math.atan2(dx, dz)) * Math.min(1, dt * 6);
          if (n.timer <= 0) this.panic(n, p, 7, false);
          break;
        case 'talk':
          n.heading += angDiff(n.heading, Math.atan2(dx, dz)) * Math.min(1, dt * 6);
          if (dist > 7) this.endTalk(n);
          break;
        case 'hunt': this.hunt(n, dt, ctx, dx, dz, dist); break;
      }
      // Knockback and keeping out of the player's way.
      if (Math.abs(n.kx) + Math.abs(n.kz) > 0.01) {
        n.pos.x += n.kx * dt; n.pos.z += n.kz * dt;
        n.kx *= 1 - Math.min(1, dt * 6); n.kz *= 1 - Math.min(1, dt * 6);
      }
      if (!n.inside && dist < 0.75 && Math.abs(p.y - n.pos.y) < 1.8) {
        const k = (0.75 - dist) / Math.max(dist, 1e-3);
        n.pos.x -= dx * k; n.pos.z -= dz * k;
        const pv = Math.hypot(ctx.player.vel.x, ctx.player.vel.z);
        if (pv > 3.5 && n.bubbleCd <= 0 && n.job !== 'guard' && n.state === 'routine') this.say(n, pickL(LINES.bump));
      }
      this.groundAndAnimate(n, dt, ctx);
    }
    // Keep people from walking through each other.
    const live = this.list.filter((n) => !n.dead && !n.inside);
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i].pos, b = live[j].pos;
        const dx = b.x - a.x, dz = b.z - a.z, d2 = dx * dx + dz * dz;
        if (d2 < 0.36 && d2 > 1e-6) {
          const d = Math.sqrt(d2), k = (0.6 - d) / d * 0.5;
          a.x -= dx * k; a.z -= dz * k; b.x += dx * k; b.z += dz * k;
        } else if (d2 <= 1e-6) { b.x += 0.3; }
      }
    }
    if (law.wanted > 0) {
      law.unseen = law.seen ? 0 : law.unseen + dt;
      if (law.unseen > 20) { law.wanted--; law.unseen = 0; if (law.wanted === 0) ctx.toast('The guards have lost your trail'); }
    }
  }

  routine(n, dt, ctx, dist) {
    const law = this.law;
    // Civilians keep away from wanted players and dangerous animals.
    if (n.job !== 'guard' && !n.inside) {
      if (law.wanted > 0 && dist < 10) { this.panic(n, ctx.player.pos, 6, false); return; }
      for (const c of ctx.creatures.list) {
        if (!c.dead && c.def.hostile && c.type !== 'viper' && c.pos.distanceTo(n.pos) < 9) { this.panic(n, c.pos, 6, false); return; }
      }
    }
    // Guards defend the town against hostile animals.
    if (n.job === 'guard' && !n.inside && this.guardAnimals(n, dt, ctx)) return;

    const act = this.activity(n, ctx.hour);
    if (act.key !== n.actKey) { n.actKey = act.key; this.plan(n, act); }
    if (n.inside) return;
    n.model.crate.visible = n.job === 'laborer' && n.act && n.act.work === 'deliver' && !n.arrived;
    if (!n.arrived) {
      const tgt = n.path[n.pi];
      if (!tgt) { n.arrived = true; return; }
      const tx = tgt[0] - n.pos.x, tz = tgt[1] - n.pos.z, d = Math.hypot(tx, tz);
      if (d < 0.3) {
        n.pi++;
        if (n.pi >= n.path.length) {
          n.arrived = true;
          const a = n.act;
          if (a.enter) { n.inside = true; n.insideOf = a.building; n.root.visible = false; this.clearBubble(n); }
          if (a.work === 'deliver' || a.patrol) n.timer = 2.5 + Math.random() * 3;
        }
        return;
      }
      const sp = n.job === 'guard' ? 1.5 : 1.35;
      n.heading += angDiff(n.heading, Math.atan2(tx, tz)) * Math.min(1, dt * 8);
      const step = Math.min(d, sp * dt);
      n.pos.x += (tx / d) * step; n.pos.z += (tz / d) * step;
      n.speed = sp;
    } else {
      const a = n.act;
      if (a.face !== undefined) n.heading += angDiff(n.heading, a.face) * Math.min(1, dt * 4);
      if (a.work === 'deliver' || a.patrol) {
        n.timer -= dt;
        if (n.timer <= 0) {
          if (a.patrol) { n.patrolIdx++; n.patrolNode = n.town.patrol[Math.floor(Math.random() * n.town.patrol.length)]; }
          else n.laborIdx++;
        }
      }
    }
    // Greetings.
    if (dist < 4 && n.bubbleCd <= 0 && Math.random() < dt * 0.8) this.say(n, this.greeting(n, ctx.hour));
  }

  guardAnimals(n, dt, ctx) {
    n.preyT -= dt;
    if (n.preyT <= 0) {
      n.preyT = 0.5;
      n.prey = null;
      let bd = 24;
      for (const c of ctx.creatures.list) {
        if (c.dead || !c.def.hostile) continue;
        const d = c.pos.distanceTo(n.pos);
        if (d < bd && Math.hypot(c.pos.x - n.town.x, c.pos.z - n.town.z) < n.town.R + 25) { bd = d; n.prey = c; }
      }
      if (n.prey && !n.preyAnnounced) { n.preyAnnounced = true; this.say(n, pickL(LINES.beast)); }
      if (!n.prey) n.preyAnnounced = false;
    }
    const c = n.prey;
    if (!c || c.dead) { n.aimT = 0; return false; }
    tmpA.set(n.pos.x, n.pos.y + 1.5, n.pos.z);
    tmpB.set(c.pos.x, c.pos.y + 0.5, c.pos.z);
    n.heading += angDiff(n.heading, Math.atan2(c.pos.x - n.pos.x, c.pos.z - n.pos.z)) * Math.min(1, dt * 8);
    n.aiming = true;
    n.aimT += dt;
    if (n.aimT > 1.0) {
      n.aimT = -1.2;
      const hit = Math.random() < 0.7;
      ctx.gunFx(this.muzzle(n, tmpC), hit ? tmpB : tmpB.clone().add(new THREE.Vector3(Math.random() - 0.5, 0.5, Math.random() - 0.5)));
      if (hit) ctx.creatures.hit(c, 10, tmpB.clone().sub(tmpA).normalize(), ctx);
    }
    return true;
  }

  muzzle(n, out) {
    return out.set(n.pos.x + Math.sin(n.heading) * 0.9 + Math.cos(n.heading) * 0.3, n.pos.y + 1.42, n.pos.z + Math.cos(n.heading) * 0.9 - Math.sin(n.heading) * 0.3);
  }

  panicStep(n, dt, ctx) {
    n.timer -= dt;
    if (n.timer <= 0) { n.state = 'routine'; n.actKey = null; n.cower = false; return; }
    if (n.inside) return;
    if (n.cower) return;
    const ax = n.pos.x - n.fear.x, az = n.pos.z - n.fear.z, ad = Math.hypot(ax, az) || 1;
    n.heading += angDiff(n.heading, Math.atan2(ax, az) + Math.sin(n.phase * 0.3) * 0.4) * Math.min(1, dt * 6);
    const sp = 4.2;
    n.pos.x += Math.sin(n.heading) * sp * dt;
    n.pos.z += Math.cos(n.heading) * sp * dt;
    n.speed = sp;
    if (ad > 40) n.cower = true;
  }

  hunt(n, dt, ctx, dx, dz, dist) {
    const t = n.town, p = ctx.player.pos;
    if (n.inside) this.plan(n, { node: nearestNode(t, n.pos.x, n.pos.z), key: 'hunt' });
    n.path = []; n.arrived = true;
    const cols = t.colliders || [];
    tmpA.set(n.pos.x, n.pos.y + 1.5, n.pos.z);
    tmpB.set(p.x, p.y + 1.5, p.z);
    const sees = dist < 42 && clearLine(this.world, cols, tmpA, tmpB);
    if (sees) {
      this.law.seen = true;
      n.lastSeen = p.clone();
      if (!n.huntCalled) { n.huntCalled = true; this.say(n, pickL(LINES.hunt)); }
    }
    const face = Math.atan2(dx, dz);
    if (sees && dist < 1.8) {
      n.heading += angDiff(n.heading, face) * Math.min(1, dt * 10);
      if (n.atkCd <= 0) { n.atkCd = 1.1; n.swingT = 0.3; ctx.damage(3, 'Beaten by a town guard', n.pos); }
      n.aimT = 0;
    } else if (sees && dist < 24) {
      n.heading += angDiff(n.heading, face) * Math.min(1, dt * 8);
      n.aiming = true;
      n.aimT += dt;
      if (n.aimT > 1.1) {
        n.aimT = -1.5;
        const pv = Math.hypot(ctx.player.vel.x, ctx.player.vel.z);
        const chance = Math.max(0.15, Math.min(0.8, 0.72 - dist * 0.012 - (pv > 3 ? 0.25 : 0)));
        const hit = Math.random() < chance;
        const end = tmpB.clone();
        if (!hit) end.add(new THREE.Vector3((Math.random() - 0.5) * 2.5, Math.random() * 1.5, (Math.random() - 0.5) * 2.5));
        ctx.gunFx(this.muzzle(n, tmpC), end);
        if (hit) ctx.damage(4, 'Shot by a town guard', n.pos);
      }
    } else {
      const goal = n.lastSeen || p;
      const gx = goal.x - n.pos.x, gz = goal.z - n.pos.z, gd = Math.hypot(gx, gz);
      if (gd > 1) {
        n.heading += angDiff(n.heading, Math.atan2(gx, gz)) * Math.min(1, dt * 8);
        const sp = 4.0;
        n.pos.x += Math.sin(n.heading) * sp * dt;
        n.pos.z += Math.cos(n.heading) * sp * dt;
        n.speed = sp;
      } else n.lastSeen = null;
      n.aimT = Math.min(n.aimT, 0);
    }
  }

  groundAndAnimate(n, dt, ctx) {
    const t = n.town, m = n.model;
    if (n.inside) return;
    if (t.colliders) pushOut(n.pos, 0.3, 1.8, t.colliders);
    const dTown = Math.hypot(n.pos.x - t.x, n.pos.z - t.z);
    if (dTown < t.R - 1) n.pos.y = t.y;
    else {
      const g = this.world.groundY(n.pos.x, n.pos.y, n.pos.z);
      if (isFinite(g)) n.pos.y = g;
    }
    n.root.rotation.y = n.heading;
    n.phase += dt * (n.speed > 0 ? n.speed * 3.2 : 1);
    const sw = n.speed > 0 ? Math.sin(n.phase) * Math.min(1, n.speed / 1.4) * 0.7 : 0;
    m.legs[0].rotation.x = sw; m.legs[1].rotation.x = -sw;
    let la = -sw * 0.8, ra = sw * 0.8, laz = 0, raz = 0;
    let bodyY = n.speed > 0 ? Math.abs(Math.sin(n.phase)) * 0.04 : 0;
    m.head.rotation.x = 0;
    if (n.state === 'handsup') { la = ra = Math.PI; laz = -0.2; raz = 0.2; }
    else if (n.state === 'panic' && n.cower) { bodyY = -0.35; la = ra = -2.6; m.legs[0].rotation.x = m.legs[1].rotation.x = -1.0; m.head.rotation.x = 0.4; }
    else if (n.state === 'panic') { la = -sw * 1.4 - 0.3; ra = sw * 1.4 - 0.3; }
    else if (n.aiming) { ra = -Math.PI / 2; la = -1.25; laz = 0.5; }
    else if (n.swingT > 0) { n.swingT -= dt; ra = -2.2 + (0.3 - n.swingT) * 6; }
    else if (n.state === 'routine' && n.arrived && n.act) {
      const tt = n.phase;
      if (n.act.work === 'hammer') ra = -1.4 - Math.max(0, Math.sin(tt * 2.2)) * 1.0;
      else if (n.act.work === 'sell') { if (Math.sin(tt * 0.5) > 0.6) ra = -0.9 + Math.sin(tt * 4) * 0.3; }
      else if (n.act.work === 'chat') { if (Math.sin(tt * 0.7 + n.id) > 0.4) la = -0.7 + Math.sin(tt * 3) * 0.3; m.head.rotation.x = Math.sin(tt * 0.4) * 0.1; }
    } else if (n.state === 'talk') m.head.rotation.x = Math.sin(n.phase * 1.5) * 0.08;
    n.aiming = false;
    m.arms[0].rotation.set(la, 0, laz);
    m.arms[1].rotation.set(ra, 0, raz);
    m.body.position.y = bodyY;
    m.lantern.visible = ctx.night;
    m.crate.visible = m.crate.visible && n.state === 'routine';
    const s = 1 + 0.1 * n.flash;
    n.root.scale.set(s, 1, s);
  }
}
