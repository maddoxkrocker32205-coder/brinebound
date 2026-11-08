// Small synthesized sound kit (no audio files). The soundtrack is in music.js.
import { Music } from './music.js';

export class Sfx {
  constructor() { this.ctx = null; this.on = true; this.volume = 0.8; this.musicOn = true; this.mood = null; this.music = null; this.musicLevel = 1; }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.on ? 0.6 * this.volume : 0;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.sea();
      this.rainLoop();
      try { this.music = new Music(this.ctx, this.noise, this.master); this.music.setLevel(this.musicLevel); } catch (e) { this.music = null; console.warn('No music on this device', e); }
      this.musicTimer = setInterval(() => this.tickMusic(), 100);
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    } catch (e) { this.ctx = null; }
  }
  setOn(v) { this.on = v; if (this.master) this.master.gain.value = v ? 0.6 * this.volume : 0; }
  setVolume(v) { this.volume = v; this.setOn(this.on); }
  setMusic(on) { this.musicOn = on; }
  // which tune fits right now: 'title', 'port', 'sea', 'night', 'battle' (null for silence)
  setMood(m) { this.mood = m; }
  setMusicLevel(v) { if (Math.abs(v - this.musicLevel) < 0.03) return; this.musicLevel = v; if (this.music) this.music.setLevel(v); }
  tickMusic() {
    const m = this.music;
    if (!m || !this.ctx || this.ctx.state !== 'running') return;
    m.on = this.musicOn && this.on;
    m.mood = this.mood;
    // a hidden tab only gets a timer tick about once a second, so schedule further ahead
    try { m.update(document.hidden ? 2.4 : 0.45); } catch (e) { console.warn('Music hiccup', e); }
  }
  roar() { this.tone('sawtooth', 70, 38, 0.35, 0.3, 1.8); this.nz('lowpass', 300, 1, 0.5, 0.2, 1.8); this.tone('sine', 52, 30, 0.4, 0.2, 2.0); }
  thunder() { if (!this.ctx) return; this.nz('lowpass', 260, 0.6, 0.9, 0.02, 2.6); this.nz('lowpass', 900, 0.6, 0.35, 0.005, 0.5); }
  gull() { for (let i = 0; i < 3; i++) this.tone('square', 1500 + Math.random() * 300, 1100, 0.025, 0.02, 0.18, 1, i * 0.22); }
  creak() { this.tone('sawtooth', 120 + Math.random() * 60, 90, 0.03, 0.15, 0.5); }
  rainLoop() {
    const c = this.ctx;
    const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1400;
    this.rainGain = c.createGain(); this.rainGain.gain.value = 0;
    src.connect(f).connect(this.rainGain).connect(this.master); src.start();
  }
  setRain(s) { if (this.rainGain) this.rainGain.gain.setTargetAtTime(s * 0.16, this.ctx.currentTime, 0.5); }
  env(g, t0, a, peak, dcy) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + dcy);
  }
  nz(type, freq, q, peak, a, dcy, vol = 1) {
    const c = this.ctx;
    if (!c || !this.on || vol <= 0.01) return;
    const t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = this.noise; src.playbackRate.value = 0.7 + Math.random() * 0.6;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); this.env(g, t, a, peak * vol, dcy);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random()); src.stop(t + a + dcy + 0.05);
  }
  tone(type, f0, f1, peak, a, dcy, vol = 1, delay = 0) {
    const c = this.ctx;
    if (!c || !this.on || vol <= 0.01) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + a + dcy);
    const g = c.createGain(); this.env(g, t, a, peak * vol, dcy);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + a + dcy + 0.05);
  }
  vol(d) { return Math.max(0, 1 - d / 150); }
  boom(d = 0) { const v = this.vol(d); this.tone('sine', 95, 30, 0.9, 0.005, 0.75, v); this.nz('lowpass', 520, 0.7, 0.9, 0.004, 0.9, v); this.nz('bandpass', 1900, 1, 0.25, 0.002, 0.14, v); }
  gun(kind, d = 0) {
    const v = this.vol(d * 0.7);
    if (kind === 'blunder') { this.nz('lowpass', 1500, 0.7, 0.95, 0.002, 0.4, v); this.nz('highpass', 1200, 0.8, 0.5, 0.001, 0.12, v); this.tone('sine', 120, 42, 0.55, 0.003, 0.32, v); }
    else if (kind === 'musket') { this.nz('highpass', 950, 0.7, 0.85, 0.001, 0.2, v); this.nz('lowpass', 750, 0.8, 0.6, 0.002, 0.55, v); this.tone('sine', 150, 48, 0.4, 0.002, 0.28, v); }
    else { this.nz('highpass', 1700, 0.8, 0.75, 0.001, 0.13, v); this.nz('lowpass', 950, 0.8, 0.45, 0.002, 0.28, v); this.tone('sine', 190, 60, 0.3, 0.002, 0.16, v); }
  }
  splash(d = 0) { this.nz('bandpass', 850, 0.8, 0.4, 0.01, 0.5, this.vol(d)); }
  crash(d = 0) { const v = this.vol(d); this.nz('highpass', 1300, 0.8, 0.5, 0.003, 0.35, v); this.tone('triangle', 150, 70, 0.3, 0.004, 0.3, v); }
  explode(d = 0) { const v = this.vol(d); this.nz('lowpass', 900, 0.6, 0.8, 0.004, 0.6, v); this.tone('sine', 70, 35, 0.5, 0.004, 0.5, v); }
  chop(kind) { const f = kind === 'stone' ? 2600 : kind === 'wood' ? 650 : kind === 'leaf' ? 3600 : 1300; this.nz('bandpass', f, 3, 0.22, 0.002, 0.07); }
  brk() { this.nz('bandpass', 900, 1.2, 0.35, 0.003, 0.16); this.tone('triangle', 200, 110, 0.12, 0.003, 0.1); }
  place() { this.nz('lowpass', 500, 1, 0.35, 0.003, 0.09); this.tone('sine', 160, 100, 0.2, 0.003, 0.08); }
  hit() { this.nz('highpass', 2600, 1, 0.3, 0.002, 0.07); this.tone('square', 280, 120, 0.06, 0.002, 0.08); }
  swing() { this.nz('bandpass', 1800, 0.9, 0.1, 0.03, 0.08); }
  bones() { for (let i = 0; i < 6; i++) this.tone('square', 1800 + Math.random() * 1600, 0, 0.03, 0.001, 0.03, 1, i * 0.045); }
  coin() { this.tone('triangle', 988, 0, 0.2, 0.004, 0.12); this.tone('triangle', 1319, 0, 0.2, 0.004, 0.3, 1, 0.09); }
  hurt() { this.tone('sawtooth', 190, 70, 0.14, 0.004, 0.22); }
  eat() { for (let i = 0; i < 3; i++) setTimeout(() => this.nz('bandpass', 700, 2, 0.18, 0.004, 0.06), i * 110); }
  thud() { this.tone('sine', 120, 60, 0.3, 0.004, 0.15); }
  land(k = 1) { this.tone('sine', 95, 45, 0.32 * k, 0.003, 0.2); this.nz('lowpass', 420, 0.8, 0.28 * k, 0.003, 0.18); }
  slide() { this.nz('bandpass', 700, 0.7, 0.2, 0.04, 0.55); this.nz('highpass', 2400, 0.6, 0.06, 0.05, 0.45); }
  climb() { this.nz('bandpass', 1100, 1, 0.12, 0.01, 0.12); this.tone('triangle', 180, 140, 0.05, 0.01, 0.12, 1, 0.08); }
  rumble(d = 0) { const v = this.vol(d); this.nz('lowpass', 180, 0.7, 0.7, 0.05, 1.6, v); this.nz('bandpass', 600, 0.8, 0.25, 0.02, 1.1, v); }
  creakBig(d = 0) { const v = this.vol(d); this.tone('sawtooth', 160, 70, 0.08, 0.05, 1.2, v); this.nz('bandpass', 420, 4, 0.12, 0.08, 0.9, v); }
  fuse() { this.nz('highpass', 4200, 0.7, 0.08, 0.02, 1.1); }
  curse() { this.tone('sine', 110, 52, 0.25, 0.3, 2.2); this.tone('sine', 131, 62, 0.18, 0.4, 2.0); this.tone('triangle', 220, 104, 0.06, 0.5, 1.8); }
  squawk(d = 0) { const v = this.vol(d); this.tone('square', 1250, 700, 0.06, 0.005, 0.12, v); this.tone('sawtooth', 900, 1500, 0.045, 0.005, 0.1, v, 0.13); }
  grunt(d = 0) { const v = this.vol(d); this.tone('sawtooth', 115, 80, 0.12, 0.01, 0.2, v); this.nz('lowpass', 300, 1, 0.1, 0.01, 0.15, v); }
  bleat(d = 0) { const v = this.vol(d); for (let i = 0; i < 4; i++) this.tone('triangle', 540 - i * 20, 480, 0.05, 0.01, 0.08, v, i * 0.07); }
  chirp() { for (let i = 0; i < 3; i++) this.tone('sine', 2200 + Math.random() * 600, 3200, 0.04, 0.005, 0.08, 1, i * 0.1); }
  whale() { this.tone('sine', 180, 120, 0.12, 0.6, 2.8); this.tone('sine', 240, 310, 0.06, 0.8, 2.4, 1, 0.5); }
  bell() { this.tone('sine', 660, 0, 0.18, 0.004, 1.4); this.tone('sine', 1320, 0, 0.06, 0.004, 0.9); }
  sea() {
    const c = this.ctx;
    const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380;
    const g = c.createGain(); g.gain.value = 0.09;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.11;
    const lg = c.createGain(); lg.gain.value = 0.06;
    lfo.connect(lg).connect(g.gain);
    src.connect(f).connect(g).connect(this.master);
    src.start(); lfo.start();
  }
}
