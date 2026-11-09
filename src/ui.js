// DOM HUD: stats, toolbar, toasts, help text, speedometer, minimap.
import { GRID, TOOLS, TOOL_ORDER, HALF, TILE } from './config.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.floor(n).toLocaleString('en-US');

const HELP = {
  build: `<b>LMB</b> place / drag · <b>RMB</b> orbit<br><b>WASD</b> pan · <b>Q/E</b> rotate · <b>wheel</b> zoom<br><b>1-8</b> tools · <b>F</b> walk · <b>V</b> drive · <b>H</b> hide HUD`,
  walk: `<b>WASD</b> move · <b>Shift</b> run · <b>Space</b> jump<br><b>Mouse</b> look · <b>V</b> summon car<br><b>B</b> back to builder · <b>H</b> hide HUD`,
  drive: `<b>W/S</b> throttle / brake · <b>A/D</b> steer<br><b>Space</b> drift · <b>Shift</b> boost · <b>C</b> camera<br><b>F</b> get out · <b>B</b> builder · <b>H</b> hide HUD`,
};

export class UI {
  constructor(handlers) {
    this.h = handlers;
    const bar = $('toolbar');
    TOOL_ORDER.forEach((key, k) => {
      const t = TOOLS[key];
      const b = document.createElement('button');
      b.className = 'tool';
      b.dataset.tool = key;
      b.title = t.desc;
      b.style.color = t.color;
      b.style.setProperty('--tc', t.color);
      b.innerHTML = `<span class="key">${k + 1}</span><span class="ico">${t.icon}</span><span>${t.name}</span><span class="cost">${t.cost ? '¢' + t.cost : '&nbsp;'}</span>`;
      b.onclick = () => handlers.tool(key);
      bar.appendChild(b);
    });
    document.querySelectorAll('.modes button').forEach((b) => (b.onclick = () => handlers.mode(b.dataset.mode)));
    $('btn-generate').onclick = handlers.generate;
    $('btn-clear').onclick = handlers.clear;
    for (const id of ['rain', 'sound', 'fx', 'growth', 'sandbox']) {
      const el = $('tg-' + id);
      el.onchange = () => { handlers.toggle(id, el.checked); el.blur(); };
    }
    this.mm = $('minimap').getContext('2d');
    this.mmBase = document.createElement('canvas');
    this.mmBase.width = this.mmBase.height = GRID;
  }

  setToggle(id, v) { $('tg-' + id).checked = v; }
  setMode(m) {
    document.body.classList.remove('mode-build', 'mode-walk', 'mode-drive');
    document.body.classList.add('mode-' + m);
    document.querySelectorAll('.modes button').forEach((b) => b.classList.toggle('active', b.dataset.mode === m));
    $('help').innerHTML = HELP[m];
  }
  setTool(key) {
    document.querySelectorAll('.tool').forEach((b) => b.classList.toggle('active', b.dataset.tool === key));
  }
  setStats(credits, s, sandbox) {
    $('st-credits').textContent = sandbox ? '∞' : '¢' + fmt(credits);
    $('st-pop').textContent = fmt(s.pop);
    $('st-jobs').textContent = fmt(s.jobs);
    $('st-income').textContent = '+¢' + fmt(s.income) + '/s';
  }
  setInfo(text) {
    const el = $('info');
    if (!text) { el.classList.remove('show'); return; }
    el.textContent = text;
    el.classList.add('show');
  }
  toast(msg, good = false) {
    const el = document.createElement('div');
    el.className = 'toast' + (good ? ' good' : '');
    el.textContent = msg;
    $('toasts').appendChild(el);
    setTimeout(() => el.remove(), 2700);
    while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
  }
  setSpeed(kmh, boost) {
    $('speed').textContent = Math.round(kmh);
    $('boostbar').style.width = (boost * 100).toFixed(0) + '%';
  }

  drawMinimapBase(city) {
    const g = this.mmBase.getContext('2d');
    g.fillStyle = '#07040f';
    g.fillRect(0, 0, GRID, GRID);
    const colors = { habitat: '#ffb02e', corp: '#2ef6ff', arcology: '#ff2bd6', plaza: '#39ff9c', billboard: '#ff5ea8' };
    for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
      if (city.isRoad(i, j)) { g.fillStyle = '#3c3f5c'; g.fillRect(i, j, 1, 1); continue; }
      const b = city.buildingAt(i, j);
      if (b) {
        g.globalAlpha = 0.45 + 0.09 * b.level;
        g.fillStyle = colors[b.type];
        g.fillRect(i, j, 1, 1);
        g.globalAlpha = 1;
      }
    }
  }
  drawMinimap(x, z, yaw) {
    const g = this.mm, W = 180;
    g.imageSmoothingEnabled = false;
    g.drawImage(this.mmBase, 0, 0, W, W);
    const s = W / (GRID * TILE);
    const px = (x + HALF) * s, pz = (z + HALF) * s;
    g.save();
    g.translate(px, pz);
    g.rotate(-yaw);
    g.fillStyle = '#fff';
    g.shadowColor = '#2ef6ff'; g.shadowBlur = 8;
    g.beginPath(); g.moveTo(0, -7); g.lineTo(5, 5); g.lineTo(0, 2); g.lineTo(-5, 5); g.closePath(); g.fill();
    g.restore();
  }
}
