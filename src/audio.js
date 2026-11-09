// Procedural ambience: rain hiss, a slow synth drone, and a hover-engine whine.
export class Audio {
  constructor() { this.enabled = false; this.ctx = null; }

  unlock() {
    if (this.ctx || !this.enabled) { this.ctx?.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = 0.7;
    this.master.connect(ctx.destination);

    // rain: filtered noise
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buf; noise.loop = true;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 6000;
    this.rainGain = ctx.createGain(); this.rainGain.gain.value = 0.12;
    noise.connect(hp).connect(lp).connect(this.rainGain).connect(this.master);
    noise.start();

    // drone pad
    const padLp = ctx.createBiquadFilter(); padLp.type = 'lowpass'; padLp.frequency.value = 380; padLp.Q.value = 6;
    const padGain = ctx.createGain(); padGain.gain.value = 0.05;
    padLp.connect(padGain).connect(this.master);
    for (const f of [55, 55.3, 82.4, 110.2]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      o.connect(padLp); o.start();
    }
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lfoAmt = ctx.createGain(); lfoAmt.gain.value = 220;
    lfo.connect(lfoAmt).connect(padLp.frequency); lfo.start();

    // engine
    this.eng = ctx.createOscillator(); this.eng.type = 'sawtooth'; this.eng.frequency.value = 60;
    this.eng2 = ctx.createOscillator(); this.eng2.type = 'square'; this.eng2.frequency.value = 90;
    this.engLp = ctx.createBiquadFilter(); this.engLp.type = 'lowpass'; this.engLp.frequency.value = 500;
    this.engGain = ctx.createGain(); this.engGain.gain.value = 0;
    this.eng.connect(this.engLp); this.eng2.connect(this.engLp);
    this.engLp.connect(this.engGain).connect(this.master);
    this.eng.start(); this.eng2.start();
  }

  setEnabled(on) {
    this.enabled = on;
    if (on) { this.unlock(); this.master && (this.master.gain.value = 0.7); }
    else if (this.master) this.master.gain.value = 0;
  }
  setRain(on) { if (this.rainGain) this.rainGain.gain.value = on ? 0.12 : 0; }

  setEngine(level, boost = false) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.engGain.gain.setTargetAtTime(level > 0 ? 0.04 + level * 0.06 : 0, t, 0.1);
    this.eng.frequency.setTargetAtTime(55 + level * 140 + (boost ? 40 : 0), t, 0.1);
    this.eng2.frequency.setTargetAtTime(82 + level * 210 + (boost ? 60 : 0), t, 0.1);
    this.engLp.frequency.setTargetAtTime(400 + level * 1800, t, 0.1);
  }

  blip(freq = 440) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 1.5, t + 0.08);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.2);
  }
  thud(v) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(30, t + 0.25);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.4 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.32);
  }
}
