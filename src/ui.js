// DOM HUD: stats, toolbar, toasts, help, speedometer, minimap, optic scan, menus.
import { TOOLS, TOOL_ORDER, TILE, DRONE_TYPES, DRONE_ORDER, buildingYield } from './config.js';
import { listSlots } from './saves.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.floor(n).toLocaleString('en-US');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const HELP = {
  build: `<b>LMB</b> place / drag · <b>RMB</b> orbit<br><b>WASD</b> pan (<b>Shift</b> fast) · <b>Q/E</b> rotate · <b>wheel</b> zoom<br><b>1-9 0 -</b> build · <b>G</b> grow · <b>X</b> demolish<br><b>F</b> walk · <b>V</b> drive · <b>Esc</b> menu · <b>H</b> hide HUD`,
  walk: `<b>WASD</b> move · <b>Shift</b> run · <b>Space</b> jump<br><b>Mouse</b> look · <b>E</b> talk to robots &amp; gangs<br><b>M</b> clear marker · <b>V</b> summon car<br><b>B</b> builder · <b>Esc</b> menu · <b>H</b> hide HUD`,
  drive: `<b>W/S</b> throttle / brake · <b>A/D</b> steer<br><b>Space</b> drift · <b>Shift</b> boost · <b>C</b> camera<br><b>X</b> optic overlay · <b>F</b> get out · <b>B</b> builder · <b>Esc</b> menu`,
};
const TYPE_COLORS = { alley: [120, 16, 30], habitat: [255, 176, 46], corp: [46, 246, 255], arcology: [255, 43, 214], plaza: [57, 255, 156], billboard: [255, 94, 168], powercore: [255, 106, 46], dataspire: [57, 255, 156], dronehub: [158, 243, 255], clinic: [255, 94, 168], uplink: [138, 92, 255] };
const MM = 72; // tiles shown across the minimap

function timeAgo(ts) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + ' min ago';
  if (s < 86400) return Math.floor(s / 3600) + ' h ago';
  return Math.floor(s / 86400) + ' d ago';
}

export class UI {
  constructor(handlers) {
    this.h = handlers;
    const bar = $('toolbar');
    TOOL_ORDER.forEach((key) => {
      const t = TOOLS[key];
      const b = document.createElement('button');
      b.className = 'tool';
      b.dataset.tool = key;
      b.title = `${t.name} — ${t.desc}`;
      b.style.color = t.color;
      b.style.setProperty('--tc', t.color);
      b.innerHTML = `<span class="key">${t.key}</span><span class="ico">${t.icon}</span><span class="nm">${t.name}</span><span class="cost">${t.cost ? '¢' + fmt(t.cost) : '&nbsp;'}</span>`;
      b.onclick = () => handlers.tool(key);
      bar.appendChild(b);
    });
    document.querySelectorAll('.modes button[data-mode]').forEach((b) => (b.onclick = () => handlers.mode(b.dataset.mode)));
    $('btn-menu').onclick = () => handlers.menu(true);
    for (const id of ['rain', 'sound', 'fx', 'growth', 'sandbox']) {
      const el = $('tg-' + id);
      el.onchange = () => { handlers.toggle(id, el.checked); el.blur(); };
    }
    // title screen
    $('t-continue').onclick = () => { const s = listSlots()[0]; if (s) handlers.loadSlot(s.id); };
    $('t-new').onclick = () => this.showPanel('new');
    $('t-load').onclick = () => { this.renderSlots(); this.showPanel('load'); };
    $('t-import').onclick = () => handlers.importSave();
    document.querySelectorAll('[data-back]').forEach((b) => (b.onclick = () => this.showPanel('main')));
    $('nw-reroll').onclick = () => { $('nw-seed').value = Math.floor(Math.random() * 1e9); };
    $('nw-start').onclick = () => {
      const name = $('nw-name').value.trim() || 'New Sprawl';
      const seed = parseInt($('nw-seed').value, 10) || Math.floor(Math.random() * 1e9);
      handlers.newWorld({ name, seed, sandbox: $('nw-sandbox').checked });
    };
    // pause menu
    $('m-resume').onclick = () => handlers.menu(false);
    $('m-save').onclick = () => handlers.save();
    $('m-saveas').onclick = () => handlers.saveAs();
    $('m-export').onclick = () => handlers.exportSave();
    $('m-quit').onclick = () => handlers.quit();

    const db = $('dronebar');
    DRONE_ORDER.forEach((key) => {
      const d = DRONE_TYPES[key];
      const b = document.createElement('button');
      b.dataset.drone = key;
      b.title = d.desc;
      b.innerHTML = `${d.name}<small>¢${fmt(d.cost)}</small>`;
      b.onclick = () => handlers.droneType(key);
      db.appendChild(b);
    });
    this.dialogChoices = [];
    this.mm = $('minimap').getContext('2d');
    this.mmBase = document.createElement('canvas');
    this.mmBase.width = this.mmBase.height = MM;
    this.mmCtx = this.mmBase.getContext('2d');
    this.mmImg = this.mmCtx.createImageData(MM, MM);
    this.mmOrigin = { i: 0, j: 0 };
    this.scanKey = null;
  }

  // In-game replacement for prompt()/confirm() (desktop builds don't support prompt).
  // Resolves to the entered text (input mode), true (confirm mode), or null when cancelled.
  ask({ title, text = '', value = null, ok = 'OK' }) {
    return new Promise((resolve) => {
      const box = $('ask'), input = $('ask-input');
      $('ask-title').textContent = title;
      $('ask-text').textContent = text;
      $('ask-text').style.display = text ? '' : 'none';
      $('ask-ok').textContent = ok;
      const wantsText = value !== null;
      input.style.display = wantsText ? '' : 'none';
      input.value = wantsText ? value : '';
      box.classList.add('show');
      if (wantsText) setTimeout(() => { input.focus(); input.select(); }, 30);
      const done = (v) => {
        box.classList.remove('show');
        $('ask-ok').onclick = $('ask-cancel').onclick = input.onkeydown = null;
        resolve(v);
      };
      $('ask-ok').onclick = () => done(wantsText ? input.value.trim() || null : true);
      $('ask-cancel').onclick = () => done(null);
      input.onkeydown = (e) => { if (e.key === 'Enter') $('ask-ok').click(); if (e.key === 'Escape') done(null); e.stopPropagation(); };
    });
  }

  // ---------------------------------------------------------------- title / menus
  showTitle(on) {
    document.body.classList.toggle('title', on);
    if (on) {
      const has = listSlots().length > 0;
      $('t-continue').style.display = has ? '' : 'none';
      $('t-load').style.display = has ? '' : 'none';
      if (has) $('t-continue').querySelector('small').textContent = listSlots()[0].name;
      this.showPanel('main');
    }
  }
  showPanel(name) {
    document.querySelectorAll('#title .panel').forEach((p) => p.classList.toggle('show', p.dataset.panel === name));
    if (name === 'new') {
      $('nw-seed').value = Math.floor(Math.random() * 1e9);
      $('nw-name').value = '';
      setTimeout(() => $('nw-name').focus(), 50);
    }
  }
  renderSlots() {
    const list = listSlots();
    const el = $('slot-list');
    el.innerHTML = list.length ? '' : '<p class="dim">No saved cities yet.</p>';
    for (const s of list) {
      const row = document.createElement('div');
      row.className = 'slot';
      row.innerHTML = `<div class="si"><b>${esc(s.name)}</b><span>seed ${s.seed} · ${fmt(s.pop || 0)} residents · ¢${fmt(s.credits || 0)} · ${timeAgo(s.updated)}</span></div>
        <button class="go">Load</button><button class="ex" title="Export to file">⤓</button><button class="del" title="Delete">✖</button>`;
      row.querySelector('.go').onclick = () => this.h.loadSlot(s.id);
      row.querySelector('.ex').onclick = () => this.h.exportSlot(s.id);
      row.querySelector('.del').onclick = async () => {
        if (await this.ask({ title: 'Delete city?', text: `"${s.name}" will be deleted permanently.`, ok: 'Delete' })) { this.h.deleteSlot(s.id); this.renderSlots(); }
      };
      el.appendChild(row);
    }
  }
  showMenu(on, name = '') {
    document.body.classList.toggle('paused', on);
    if (on) $('m-name').textContent = name;
  }
  setLoading(on, progress = 0, label = '') {
    document.body.classList.toggle('loading', on);
    $('load-bar').style.width = Math.round(progress * 100) + '%';
    if (label) $('load-label').textContent = label;
  }

  // ---------------------------------------------------------------- hud
  setToggle(id, v) { $('tg-' + id).checked = v; }
  setMode(m) {
    document.body.classList.remove('mode-build', 'mode-walk', 'mode-drive');
    document.body.classList.add('mode-' + m);
    document.querySelectorAll('.modes button[data-mode]').forEach((b) => b.classList.toggle('active', b.dataset.mode === m));
    $('help').innerHTML = HELP[m];
  }
  setTool(key) {
    document.querySelectorAll('.tool').forEach((b) => b.classList.toggle('active', b.dataset.tool === key));
    document.body.classList.toggle('drone-tool', key === 'drone');
  }
  setDroneType(key) {
    document.querySelectorAll('#dronebar button').forEach((b) => b.classList.toggle('active', b.dataset.drone === key));
  }

  // ---------------------------------------------------------------- interaction
  setPrompt(text) {
    const el = $('prompt');
    if (!text) { el.classList.remove('show'); return; }
    if (el.dataset.t !== text) { el.innerHTML = `<kbd>E</kbd> ${esc(text)}`; el.dataset.t = text; }
    el.classList.add('show');
  }
  setTerritory(g) {
    const el = $('territory');
    if (!g) { el.classList.remove('show'); return; }
    el.textContent = `⚠ ${g.name} territory`;
    el.style.color = g.css;
    el.classList.add('show');
  }
  setMarker(m, dist, rel) {
    const el = $('markerhud');
    if (!m) { el.classList.remove('show'); return; }
    el.classList.add('show');
    el.classList.toggle('job', m.kind === 'job');
    el.querySelector('.ml').textContent = '◆ ' + m.label + (m.reward ? ` · ¢${fmt(m.reward)}` : '');
    el.querySelector('.md').textContent = dist < 1000 ? Math.round(dist) + ' m' : (dist / 1000).toFixed(1) + ' km';
    el.querySelector('.arrow').style.transform = `rotate(${rel}rad)`;
  }
  alert(title, sub = '') {
    const el = $('alert');
    el.innerHTML = `${esc(title)}${sub ? `<small>${esc(sub)}</small>` : ''}`;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }
  openDialog({ speaker, sub, text, choices, kind, color }) {
    const el = $('dialog');
    el.classList.add('show');
    el.classList.toggle('gang', kind === 'gang');
    if (color) el.style.setProperty('--gc', color);
    el.querySelector('.ds').textContent = speaker;
    el.querySelector('.dsub').textContent = sub || '';
    const dt = el.querySelector('.dt');
    // typewriter reveal
    clearInterval(this.typer);
    let n = 0;
    dt.textContent = '';
    this.typer = setInterval(() => { n += 2; dt.textContent = text.slice(0, n); if (n >= text.length) clearInterval(this.typer); }, 16);
    const dc = el.querySelector('.dc');
    dc.innerHTML = '';
    this.dialogChoices = choices;
    choices.forEach((c, k) => {
      const b = document.createElement('button');
      b.innerHTML = `<kbd>${k + 1}</kbd>${esc(c.label)}`;
      b.onclick = () => c.fn();
      dc.appendChild(b);
    });
    document.body.classList.add('talking');
  }
  closeDialog() {
    clearInterval(this.typer);
    $('dialog').classList.remove('show');
    document.body.classList.remove('talking');
    this.dialogChoices = [];
  }
  pickChoice(k) { this.dialogChoices[k]?.fn(); }
  setStats(credits, s, sandbox) {
    $('st-credits').textContent = sandbox ? '∞' : '¢' + fmt(credits);
    $('st-pop').textContent = fmt(s.pop);
    $('st-jobs').textContent = fmt(s.jobs);
    $('st-income').textContent = '+¢' + fmt(s.income) + '/s';
    const p = $('st-power');
    p.textContent = `${fmt(s.demand)}/${fmt(s.supply)} MW`;
    p.classList.toggle('bad', s.ratio < 1);
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
  setAugments(dash, legs) {
    $('aug-dash').style.width = Math.round(dash * 100) + '%';
    $('aug-dash').parentElement.parentElement.classList.toggle('ready', dash >= 1);
    $('aug-legs').parentElement.classList.toggle('ready', legs);
  }
  setScan(hit) {
    const el = $('scan');
    if (!hit) { if (this.scanKey !== null) { el.classList.remove('show'); this.scanKey = null; } return; }
    const b = hit.b;
    const key = b.id + ':' + b.level + ':' + Math.round(hit.d);
    if (key === this.scanKey) return;
    this.scanKey = key;
    const y = buildingYield(b.type, b.level);
    const occ = b.owned ? 'YOURS' : esc(b.corp);
    const sec = ['LOW', 'MED', 'HIGH', 'BLACK-ICE'][b.seed % 4];
    el.innerHTML = `<div class="sh">◢ OPTIC SCAN ◣</div>
      <div class="sn">${esc(TOOLS[b.type].name)} <i>LVL ${b.level}</i></div>
      <div class="sr"><span>OWNER</span><b>${occ}</b></div>
      <div class="sr"><span>HEIGHT</span><b>${Math.round(b.height)} m</b></div>
      <div class="sr"><span>RANGE</span><b>${Math.round(hit.d)} m</b></div>
      ${y.pop ? `<div class="sr"><span>OCCUPANTS</span><b>${fmt(y.pop)}</b></div>` : ''}
      ${y.jobs ? `<div class="sr"><span>WORKFORCE</span><b>${fmt(y.jobs)}</b></div>` : ''}
      <div class="sr"><span>NET SECURITY</span><b class="${sec === 'BLACK-ICE' ? 'bad' : ''}">${sec}</b></div>
      <div class="sr"><span>NODE</span><b>${(b.seed >>> 8).toString(16).toUpperCase().padStart(6, '0')}</b></div>`;
    el.classList.add('show');
  }

  // ---------------------------------------------------------------- minimap (local window)
  drawMinimapBase(city, fx, fz) {
    const ci = Math.floor(fx / TILE) - MM / 2, cj = Math.floor(fz / TILE) - MM / 2;
    this.mmOrigin = { i: ci, j: cj };
    const d = this.mmImg.data;
    for (let b = 0; b < MM; b++) for (let a = 0; a < MM; a++) {
      const o = (b * MM + a) * 4;
      const i = ci + a, j = cj + b;
      let r = 7, g = 4, bl = 15;
      const loaded = city.chunkAt(i, j);
      if (city.isRoad(i, j)) { r = 60; g = 63; bl = 92; }
      else if (loaded) {
        const x = city.buildingAt(i, j);
        if (x) {
          const c = TYPE_COLORS[x.type];
          const k = x.owned ? 1 : 0.22 + 0.04 * x.level;
          r = c[0] * k; g = c[1] * k; bl = c[2] * k;
        }
      }
      d[o] = r; d[o + 1] = g; d[o + 2] = bl; d[o + 3] = 255;
    }
    this.mmCtx.putImageData(this.mmImg, 0, 0);
  }
  drawMinimap(x, z, yaw, marker) {
    const g = this.mm, W = $('minimap').width;
    g.imageSmoothingEnabled = false;
    g.drawImage(this.mmBase, 0, 0, W, W);
    const s = W / MM;
    const px = (x / TILE - this.mmOrigin.i) * s, pz = (z / TILE - this.mmOrigin.j) * s;
    g.save();
    g.translate(px, pz);
    g.rotate(-yaw);
    g.fillStyle = '#fff';
    g.shadowColor = '#2ef6ff'; g.shadowBlur = 8;
    g.beginPath(); g.moveTo(0, -7); g.lineTo(5, 5); g.lineTo(0, 2); g.lineTo(-5, 5); g.closePath(); g.fill();
    g.restore();
    if (marker) {
      let mx = (marker.x / TILE - this.mmOrigin.i) * s, mz = (marker.z / TILE - this.mmOrigin.j) * s;
      mx = Math.max(5, Math.min(W - 5, mx)); mz = Math.max(5, Math.min(W - 5, mz));
      g.fillStyle = marker.kind === 'job' ? '#ff2848' : '#ffd23e';
      g.shadowColor = g.fillStyle; g.shadowBlur = 10;
      g.beginPath(); g.moveTo(mx, mz - 6); g.lineTo(mx + 5, mz); g.lineTo(mx, mz + 6); g.lineTo(mx - 5, mz); g.closePath(); g.fill();
      g.shadowBlur = 0;
    }
    g.fillStyle = 'rgba(46,246,255,0.7)';
    g.font = '10px monospace';
    g.fillText(`${Math.round(x)}, ${Math.round(z)}`, 4, W - 5);
  }
}
