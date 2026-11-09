// Dialogue flows for talking to robots and gang members (walk mode, E key).
import { TOOLS, TILE, tileCenter } from './config.js';
import { robotGreeting, robotDay, robotQuestion, gangLine } from './dialogue.js';
import { mulberry32 } from './rng.js';

const PLACES = ['clinic', 'dataspire', 'uplink', 'dronehub', 'powercore', 'plaza', 'arcology'];

export class Conversation {
  constructor(ctx) {
    this.ctx = ctx; // { city, ui, marker, audio, player(), onClose }
    this.open = false;
  }

  nearestOfType(type, p) {
    let best = null, bd = Infinity;
    for (const b of this.ctx.city.buildings.values()) {
      if (b.type !== type) continue;
      const c = this.ctx.city.center(b);
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d > 25 && d < bd) { bd = d; best = { b, x: c.x, z: c.z, d }; }
    }
    return best;
  }

  show(o) { this.ctx.ui.openDialog(o); }
  close() {
    this.open = false;
    this.ctx.ui.closeDialog();
    if (this.robot) { this.robot.talking = false; this.robot.pinned = false; this.robot = null; }
    if (this.member) { this.member.talking = false; this.member = null; }
    this.ctx.onClose?.();
  }

  // ---------------------------------------------------------------- robots
  talkRobot(w, robots) {
    this.open = true;
    this.robot = w;
    w.talking = true; w.pinned = true; w.wave = 1.2;
    const id = robots.identity(w, { landmark: 'Uplink Array' });
    this.speaker = `${id.designation} “${id.name}”`;
    this.sub = `${id.role} · ${id.corp} · mood: ${id.mood}`;
    this.robotMenu(robotGreeting(id), id);
  }
  robotMenu(text, id) {
    this.show({
      speaker: this.speaker, sub: this.sub, text, kind: 'robot',
      choices: [
        { label: 'How was your day?', fn: () => this.robotMenu(robotDay(id), id) },
        { label: 'Can you mark somewhere on my map?', fn: () => this.robotMark(id) },
        { label: 'Got a question for me?', fn: () => this.robotAsk(id) },
        { label: 'Goodbye.', fn: () => this.close() },
      ],
    });
  }
  robotMark(id) {
    const p = this.ctx.player();
    const opts = [];
    for (const type of PLACES) {
      const n = this.nearestOfType(type, p);
      if (n) opts.push({ label: `Nearest ${TOOLS[type].name} (${Math.round(n.d)} m)`, x: n.x, z: n.z, name: TOOLS[type].name });
    }
    opts.sort((a, b) => parseInt(a.label.match(/\((\d+)/)[1]) - parseInt(b.label.match(/\((\d+)/)[1]));
    const picks = opts.slice(0, 3);
    const alley = this.nearestOfType('alley', p);
    if (alley) picks.push({ label: `A gang hangout (${Math.round(alley.d)} m), if you're brave`, x: alley.x, z: alley.z, name: 'Gang hangout', warn: true });
    picks.push({ label: 'The centre of your district', x: 6, z: 6, name: 'Your district' });
    this.show({
      speaker: this.speaker, sub: this.sub, kind: 'robot',
      text: 'Of course. I have the whole city map cached. Where would you like to go?',
      choices: [
        ...picks.map((o) => ({
          label: o.label,
          fn: () => {
            this.ctx.marker.set({ x: o.x, z: o.z, label: o.name.toUpperCase(), kind: 'poi' });
            this.ctx.audio.blip(990);
            this.robotMenu(o.warn ? 'Marked. Please do not tell them I sent you. I like my servos where they are.' : `Marked on your map. Follow the light pillar. ${['Safe travels!', 'Mind the drones.', 'Bring an umbrella.'][id.seed % 3]}`, id);
          },
        })),
        { label: 'Never mind.', fn: () => this.robotMenu('Okay. What else?', id) },
      ],
    });
  }
  robotAsk(id) {
    const q = robotQuestion(id);
    this.show({
      speaker: this.speaker, sub: this.sub, kind: 'robot', text: q.q,
      choices: q.a.map(([ans, reply]) => ({
        label: ans,
        fn: () => {
          let text = reply;
          const r = mulberry32(id.seed + id.asked.size * 31);
          if (r() < 0.3) {
            const tip = 25 + Math.floor(r() * 4) * 25;
            this.ctx.city.credits += tip;
            text += ` Here, a data-chit for your time. (+¢${tip})`;
          }
          this.robotMenu(text, id);
        },
      })),
    });
  }

  // ---------------------------------------------------------------- gangs
  talkGang(hit) {
    this.open = true;
    const { m, g } = hit;
    this.member = m;
    m.talking = true;
    this.speaker = `${m.name}`;
    this.sub = `${g.gang.name}`;
    this.gangColor = g.gang.css;
    this.gangMenu(gangLine('greet', m.seed), hit);
  }
  gangMenu(text, hit) {
    const { m, g } = hit;
    this.show({
      speaker: this.speaker, sub: this.sub, text, kind: 'gang', color: this.gangColor,
      choices: [
        { label: 'Just passing through.', fn: () => this.gangEnd(gangLine('pass', m.seed)) },
        { label: 'Got any work for me?', fn: () => this.gangJob(hit) },
        { label: 'Whose turf is this?', fn: () => this.gangMenu(`${g.gang.name}. ${g.gang.vibe} We answer to ${g.gang.boss}.`, hit) },
        { label: 'Leave.', fn: () => this.gangEnd(gangLine('bye', m.seed)) },
      ],
    });
  }
  gangEnd(text) {
    this.show({ speaker: this.speaker, sub: this.sub, text, kind: 'gang', color: this.gangColor, choices: [{ label: 'Walk away.', fn: () => this.close() }] });
  }
  gangJob(hit) {
    const mk = this.ctx.marker.active;
    if (mk && mk.kind === 'job') return this.gangEnd(gangLine('busy', hit.m.seed));
    const p = this.ctx.player();
    const city = this.ctx.city;
    let drop = null;
    for (let k = 0; k < 60 && !drop; k++) {
      const a = Math.random() * Math.PI * 2, d = 160 + Math.random() * 280;
      const i = Math.floor((p.x + Math.cos(a) * d) / TILE), j = Math.floor((p.z + Math.sin(a) * d) / TILE);
      if (city.isRoad(i, j)) drop = tileCenter(i, j);
    }
    if (!drop) return this.gangEnd('Nothing for you today.');
    const reward = 400 + Math.floor(Math.random() * 12) * 100;
    this.ctx.marker.set({ x: drop.x, z: drop.z, label: `DROP · ${hit.g.gang.name.toUpperCase()}`, kind: 'job', reward, gang: hit.g.gang.name });
    this.ctx.audio.blip(330);
    this.gangEnd(`${gangLine('job', hit.m.seed)} Pays ¢${reward}.`);
  }
}
