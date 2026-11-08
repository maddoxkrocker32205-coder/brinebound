// The soundtrack: five original tunes in the manner of sea shanties, jigs, hornpipes and reels, played live by
// a small synthesized band: fiddle, concertina, tin whistle, mandolin, upright bass, bodhrán and a
// hurdy-gurdy drone. Nothing is sampled or borrowed: every note is written below, so the music is ours to use.
//
//   title   "Brinebound"      G minor shanty, slow and stamped, for the title screen
//   sea     "The Salt Road"   D dorian jig, for sailing
//   port    "Brine Haven"     G major hornpipe, for the islands by day
//   night   "Lantern Watch"   E minor waltz, for the dark hours
//   battle  "Black Powder"    D minor reel, for a fight
//
// Melodies are written as note names with lengths in the tune's unit (an eighth note): "D5:2 A4 B4" is a
// quarter-note D then two eighths. "R" is a rest and "|" marks a bar line (each bar is checked).

export const TRACKS = {
  title: {
    name: 'Brinebound', bpm: 84, upb: 2, bar: 8, style: 'anthem', vol: 1.0, rest: [10, 16],
    parts: {
      A: { mel: 'D4:2 G4:2 G4 A4 Bb4:2 | A4:2 G4:2 F4:2 D4:2 | G4:2 Bb4:2 D5:3 C5 | Bb4:2 A4:2 G4:4 | D5:2 D5:2 C5 Bb4 A4:2 | Bb4:2 C5 Bb4 A4:2 F4:2 | G4:2 A4 Bb4 A4:2 F4 D4 | G4:6 R:2', ch: 'Gm Dm Gm Gm Bb F Dm Gm' },
      B: { mel: 'Bb4:2 D5:2 F5:3 Eb5 | D5:2 C5:2 Bb4:2 A4:2 | G4:2 Bb4:2 C5:3 D5 | A4:6 R:2 | D5:2 G5:2 F5 Eb5 D5:2 | C5:2 Eb5 D5 C5:2 A4:2 | Bb4 C5 D5:2 A4:2 F#4:2 | G4:6 R:2', ch: 'Bb F Cm D Gm Cm D7 Gm' },
    },
    form: [['A', 'concertina'], ['B', 'fiddle'], ['A', 'fiddle+whistle8'], ['B', 'fiddle+whistle8']],
  },
  sea: {
    name: 'The Salt Road', bpm: 108, upb: 3, bar: 6, style: 'jig', vol: 0.92, rest: [18, 34],
    parts: {
      A: { mel: 'D5:2 A4 A4:2 B4 | C5:2 B4 A4:2 G4 | F4:2 A4 A4 G4 F4 | E4:2 D4 E4:3 | D5:2 A4 A4:2 B4 | C5 D5 C5 B4:2 A4 | G4 B4 A4 G4 F4 E4 | D4:3 D4:2 R', ch: 'Dm C F C Dm Am G Dm' },
      B: { mel: 'A5:2 G5 A5:2 B5 | C6:2 B5 A5:2 G5 | F5 A5 F5 E5:2 D5 | E5:3 A4:3 | A5:2 G5 A5:2 B5 | C6 B5 A5 G5:2 E5 | D5 E5 F5 E5 C5 E5 | D5:4 R:2', ch: 'Am C Dm Am Am C Dm Dm' },
    },
    form: [['A', 'fiddle'], ['A', 'fiddle+whistle8'], ['B', 'fiddle'], ['B', 'fiddle+whistle'], ['A', 'whistle8'], ['A', 'fiddle+whistle8'], ['B', 'fiddle'], ['B', 'fiddle+whistle']],
  },
  port: {
    name: 'Brine Haven', bpm: 96, upb: 2, bar: 8, style: 'hornpipe', swing: 0.17, vol: 1.0, rest: [22, 40],
    parts: {
      A: { mel: 'G4:2 B4 D5 G5:2 F#5 E5 | D5:2 B4 G4 A4:2 B4:2 | C5:2 E5 C5 B4:2 D5 B4 | A4:2 F#4 A4 D5:4 | G4:2 B4 D5 G5:2 A5 G5 | F#5:2 D5 F#5 E5:2 C5:2 | B4 D5 C5 A4 F#4:2 A4:2 | G4:4 G4:2 R:2', ch: 'G G C D G D D7 G' },
      B: { mel: 'D5:2 G5 G5 G5:2 F#5 G5 | A5:2 F#5 D5 D5:4 | E5:2 C5 E5 D5:2 B4 D5 | C5:2 A4 C5 B4:4 | D5:2 G5 G5 G5:2 B5 A5 | G5:2 E5 C5 D5:2 B4:2 | A4 B4 C5 A4 D5:2 F#4:2 | G4:4 G4:2 R:2', ch: 'G D C Am G C D G' },
    },
    form: [['A', 'whistle8'], ['A', 'whistle8+fiddle'], ['B', 'fiddle'], ['B', 'fiddle+whistle']],
  },
  night: {
    name: 'Lantern Watch', bpm: 78, upb: 2, bar: 6, style: 'waltz', vol: 1.42, rest: [30, 55],
    parts: {
      A: { mel: 'E4:2 G4 B4:3 | A4:2 G4 F#4 E4:2 | D4:2 F#4 A4:3 | G4:2 F#4 E4 F#4:2 | E4:2 G4 B4:2 E5 | D5:2 C5 B4 A4:2 | G4:2 A4 F#4:2 D4 | E4:6', ch: 'Em Am D Em Em C D Em' },
      B: { mel: 'B4:2 C5 D5:3 | E5:2 D5 C5 B4:2 | A4:2 B4 C5:3 | B4:2 A4 G4 F#4:2 | G4:2 A4 B4:2 E5 | D5:2 B4 G4 A4:2 | B4:2 F#4 A4:2 F#4 | E4:6', ch: 'G C Am B7 Em G B7 Em' },
    },
    form: [['A', 'whistle8'], ['B', 'whistle8'], ['A', 'fiddle'], ['B', 'fiddle+whistle8']],
  },
  battle: {
    name: 'Black Powder', bpm: 150, upb: 2, bar: 8, style: 'reel', vol: 0.95, rest: [0, 0],
    parts: {
      A: { mel: 'D5 D5 A4 D5 F5:2 E5 D5 | C#5 E5 A4 C#5 E5:2 D5 C#5 | D5 F5 A5 F5 G5 F5 E5 D5 | E5:2 A4 C#5 E5:2 A5:2 | D5 D5 A4 D5 F5:2 E5 D5 | Bb4 D5 F5 Bb5 A5:2 G5 F5 | E5 G5 F5 E5 D5 C#5 B4 C#5 | D5:4 D4:2 R:2', ch: 'Dm A Dm A Dm Bb A7 Dm' },
      B: { mel: 'A4:2 A4 Bb4 A4:2 G4 F4 | E4:2 E4 F4 G4:2 A4:2 | Bb4:2 Bb4 C5 Bb4:2 A4 G4 | A4:2 C#5 E5 A5:4 | A4:2 A4 Bb4 A4:2 G4 F4 | E4 F4 G4 A4 Bb4 C#5 D5 E5 | F5 E5 D5 C#5 D5 A4 F4 E4 | D4:4 D5:2 R:2', ch: 'Dm A Gm A Dm A7 Dm Dm' },
    },
    form: [['A', 'fiddle'], ['A', 'fiddle+concertina'], ['B', 'fiddle'], ['B', 'fiddle+whistle8']],
  },
};

const STEP = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export function midi(name) {
  if (name === 'R') return null;
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error('bad note ' + name);
  return 12 * (+m[3] + 1) + STEP[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const QUAL = { '': [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10], dim: [0, 3, 6] };
// a chord symbol as notes around middle C (root between G3 and F#4)
export function chordNotes(sym) {
  const m = /^([A-G][#b]?)(m7|m|7|dim)?$/.exec(sym);
  if (!m) throw new Error('bad chord ' + sym);
  let root = midi(m[1] + '3');
  if (root < 55) root += 12;
  return QUAL[m[2] || ''].map((i) => root + i);
}
// parse a part into bars of [midi|null, units], checking every bar adds up
export function parsePart(mel, barUnits, label = '') {
  const bars = mel.split('|').map((b) => b.trim().split(/\s+/).filter(Boolean).map((t) => { const [n, d] = t.split(':'); return [midi(n), d ? +d : 1]; }));
  bars.forEach((b, i) => { const u = b.reduce((a, n) => a + n[1], 0); if (Math.abs(u - barUnits) > 1e-6) console.warn(`music: ${label} bar ${i + 1} has ${u} units, not ${barUnits}`); });
  return bars;
}

// ---------------------------------------------------------------- the band
class Band {
  constructor(ctx, noise) { this.c = ctx; this.noise = noise; }
  env(g, t, dur, v, a, d, s, r) {
    const p = Math.max(0.0002, v), sv = Math.max(0.0001, v * s), hold = Math.max(a + d, dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(p, t + a);
    g.gain.exponentialRampToValueAtTime(sv, t + a + d);
    g.gain.setValueAtTime(sv, t + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + hold + r);
    return t + hold + r + 0.05;
  }
  osc(type, f, t, end) { const o = this.c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.start(t); o.stop(end); return o; }
  filt(type, f, q = 0.7) { const b = this.c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }
  noiseSrc(t, end) { const s = this.c.createBufferSource(); s.buffer = this.noise; s.start(t, Math.random() * 1.5); s.stop(end); return s; }
  vibrato(o, f, t, depth, rate, delay, end) {
    const l = this.osc('sine', rate, t, end), g = this.c.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(f * depth, t + delay);
    l.connect(g).connect(o.frequency);
  }
  fiddle(out, t, m, dur, v) {
    const f = hz(m), g = this.c.createGain(), end = this.env(g, t, dur, v, 0.04, 0.14, 0.72, 0.1);
    const o = this.osc('sawtooth', f, t, end);
    this.vibrato(o, f, t, 0.0065, 5.3 + Math.random() * 0.6, Math.min(0.32, dur * 0.7), end);
    const lp = this.filt('lowpass', Math.min(6500, 1700 + f * 2.4), 0.9), pk = this.filt('peaking', 2700, 1.3); pk.gain.value = 5;
    o.connect(lp).connect(pk).connect(g).connect(out);
  }
  whistle(out, t, m, dur, v) {
    const f = hz(m), g = this.c.createGain(), end = this.env(g, t, dur, v, 0.025, 0.08, 0.82, 0.07);
    const o = this.osc('sine', f, t, end), o2 = this.osc('triangle', f, t, end);
    o.frequency.setValueAtTime(f * 0.97, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.045);
    this.vibrato(o, f, t, 0.008, 5.6, Math.min(0.4, dur * 0.8), end);
    const g2 = this.c.createGain(); g2.gain.value = 0.35;
    o.connect(g); o2.connect(g2).connect(g); g.connect(out);
    // breath at the start of the note
    const bg = this.c.createGain(), bend = this.env(bg, t, 0.02, v * 0.25, 0.008, 0.04, 0.3, 0.04);
    this.noiseSrc(t, bend).connect(this.filt('bandpass', f * 2, 1.5)).connect(bg).connect(out);
  }
  concertina(out, t, ms, dur, v) {
    const g = this.c.createGain(), end = this.env(g, t, dur, v, 0.045, 0.1, 0.8, 0.09);
    const trem = this.osc('sine', 5.8, t, end), tg = this.c.createGain(); tg.gain.value = v * 0.12;
    trem.connect(tg).connect(g.gain);
    const lp = this.filt('lowpass', 2300, 0.6);
    for (const m of ms) for (const d of [-6, 7]) { const o = this.osc('square', hz(m), t, end); o.detune.value = d; const og = this.c.createGain(); og.gain.value = 0.5; o.connect(og).connect(lp); }
    lp.connect(g).connect(out);
  }
  pluck(out, t, m, v) {
    const f = hz(m), g = this.c.createGain(), end = this.env(g, t, 0.01, v, 0.004, 0.75, 0.0003, 0.05);
    const o = this.osc('sawtooth', f, t, end), lp = this.filt('lowpass', 5200, 1.1);
    lp.frequency.setValueAtTime(5200, t); lp.frequency.setTargetAtTime(Math.max(500, f * 1.5), t + 0.004, 0.06);
    o.connect(lp).connect(g).connect(out);
  }
  bass(out, t, m, dur, v) {
    const f = hz(m), g = this.c.createGain(), end = this.env(g, t, dur, v, 0.008, 0.18, 0.45, 0.08);
    const o = this.osc('triangle', f, t, end), o2 = this.osc('sine', f, t, end), lp = this.filt('lowpass', 750, 0.8);
    o.connect(lp); o2.connect(lp); lp.connect(g).connect(out);
  }
  drone(out, t, ms, dur, v) {
    const g = this.c.createGain(), end = t + dur + 1.2;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.9); g.gain.setValueAtTime(v, t + dur); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 1.1);
    const lp = this.filt('lowpass', 950, 0.7);
    for (const m of ms) { const o = this.osc('sawtooth', hz(m), t, end); o.detune.value = (Math.random() - 0.5) * 6; o.connect(lp); }
    const buzz = this.osc('square', hz(ms[0] + 12), t, end), bz = this.c.createGain(); bz.gain.value = 0.18;
    buzz.connect(this.filt('bandpass', 1400, 2)).connect(bz).connect(g);
    lp.connect(g).connect(out);
  }
  kick(out, t, v, pitch = 1) {
    const g = this.c.createGain(), end = this.env(g, t, 0.005, v, 0.003, 0.3, 0.001, 0.02);
    const o = this.osc('sine', 125 * pitch, t, end); o.frequency.exponentialRampToValueAtTime(52 * pitch, t + 0.11);
    o.connect(g).connect(out);
    const ng = this.c.createGain(), nend = this.env(ng, t, 0.004, v * 0.35, 0.002, 0.06, 0.01, 0.02);
    this.noiseSrc(t, nend).connect(this.filt('lowpass', 520, 0.7)).connect(ng).connect(out);
  }
  tap(out, t, v) {
    const g = this.c.createGain(), end = this.env(g, t, 0.004, v, 0.002, 0.09, 0.01, 0.02);
    const o = this.osc('sine', 230, t, end); o.frequency.exponentialRampToValueAtTime(150, t + 0.06);
    o.connect(g).connect(out);
    const ng = this.c.createGain(), nend = this.env(ng, t, 0.003, v * 0.5, 0.002, 0.04, 0.01, 0.02);
    this.noiseSrc(t, nend).connect(this.filt('bandpass', 1600, 0.9)).connect(ng).connect(out);
  }
  stomp(out, t, v) {
    const ng = this.c.createGain(), nend = this.env(ng, t, 0.004, v, 0.002, 0.12, 0.02, 0.03);
    this.noiseSrc(t, nend).connect(this.filt('bandpass', 950, 0.8)).connect(ng).connect(out);
    const g = this.c.createGain(), end = this.env(g, t, 0.004, v * 0.6, 0.002, 0.1, 0.01, 0.02);
    const o = this.osc('sine', 170, t, end); o.frequency.exponentialRampToValueAtTime(85, t + 0.08);
    o.connect(g).connect(out);
  }
  clap(out, t, v) {
    for (let k = 0; k < 3; k++) {
      const s = t + k * 0.011, g = this.c.createGain(), end = this.env(g, s, 0.002, v * (k === 2 ? 1 : 0.7), 0.001, k === 2 ? 0.12 : 0.025, 0.01, 0.02);
      this.noiseSrc(s, end).connect(this.filt('bandpass', 1250, 0.9)).connect(g).connect(out);
    }
  }
  shake(out, t, v) {
    const g = this.c.createGain(), end = this.env(g, t, 0.01, v, 0.006, 0.05, 0.01, 0.02);
    this.noiseSrc(t, end).connect(this.filt('highpass', 5600, 0.7)).connect(g).connect(out);
  }
  // the melody, on one or two instruments ("fiddle+whistle8": a whistle an octave above the fiddle)
  lead(out, spec, t, m, dur, v) {
    for (const part of spec.split('+')) {
      const up = part.endsWith('8') ? 12 : 0, inst = part.replace(/8$/, '');
      const k = spec.includes('+') ? 0.72 : 1;
      if (inst === 'fiddle') this.fiddle(out, t, m + up, dur, v * k);
      else if (inst === 'whistle') this.whistle(out, t, m + up, dur, v * 0.9 * k);
      else if (inst === 'concertina') this.concertina(out, t, [m + up - (spec.includes('+') ? 12 : 0)], dur, v * 0.55 * k);
    }
  }
}

// ---------------------------------------------------------------- the rhythm section, one bar at a time
const STYLES = {
  // 6/8: two beats of three eighths
  jig(B, o, b, t, u, ch) {
    const r = ch[0];
    B.kick(o, t, 0.34); B.tap(o, t + 2 * u, 0.09); B.kick(o, t + 3 * u, 0.22); B.tap(o, t + 5 * u, 0.1);
    B.bass(o, t, r - 12, 2.5 * u, 0.2); B.bass(o, t + 3 * u, r - 5, 2.5 * u, 0.15);
    B.concertina(o, t, ch, 2.2 * u, 0.045); B.concertina(o, t + 3 * u, ch, 2.2 * u, 0.035);
    if (b.round) for (let i = 0; i < 6; i++) B.shake(o, t + i * u, i % 3 ? 0.018 : 0.03);
  },
  // 4/4 hornpipe, swung eighths: offbeat mandolin, walking bass
  hornpipe(B, o, b, t, u, ch, T) {
    const r = ch[0], sw = (T.swing || 0) * u;
    B.kick(o, t, 0.24); B.kick(o, t + 4 * u, 0.17);
    B.bass(o, t, r - 12, 1.8 * u, 0.19); B.bass(o, t + 2 * u, r - 5, 1.8 * u, 0.14); B.bass(o, t + 4 * u, r - 12, 1.8 * u, 0.17); B.bass(o, t + 6 * u, ch[1] - 12, 1.8 * u, 0.14);
    for (const k of [2, 6]) ch.forEach((m, j) => B.pluck(o, t + k * u + j * 0.014, m + 12, 0.07));
    for (let i = 0; i < 4; i++) B.shake(o, t + (2 * i + 1) * u + sw, 0.025);
    if (b.last) B.tap(o, t + 7 * u + sw, 0.12);
  },
  // 3/4 waltz: a plucked arpeggio over a drone that breathes every four bars
  waltz(B, o, b, t, u, ch, T, P) {
    const r = ch[0];
    B.pluck(o, t, r - 12, 0.12); B.pluck(o, t + 2 * u, ch[2], 0.08); B.pluck(o, t + 4 * u, ch[1] + 12, 0.08);
    if (b.i % 2 === 0) B.kick(o, t, 0.1, 0.8);
    if (b.i % 4 === 0) B.drone(o, t, [P.tonic - 12, P.tonic - 5], 4 * 6 * u - 0.6, 0.026);
  },
  // the fight: driving bass, stamps on two and four, concertina stabs on the offbeat, a fill at the turn
  reel(B, o, b, t, u, ch) {
    const r = ch[0];
    for (let i = 0; i < 8; i++) { B.bass(o, t + i * u, i % 2 ? r : r - 12, 0.85 * u, 0.15); B.shake(o, t + i * u, i % 2 ? 0.03 : 0.018); }
    B.kick(o, t, 0.4); B.kick(o, t + 3 * u, 0.22); B.kick(o, t + 4 * u, 0.34);
    B.stomp(o, t + 2 * u, 0.28); B.stomp(o, t + 6 * u, 0.28);
    for (let i = 0; i < 4; i++) B.concertina(o, t + (2 * i + 1) * u, ch, 0.6 * u, 0.032);
    if (b.last) { for (const [k, p] of [[6, 1.6], [6.5, 1.4], [7, 1.2], [7.5, 1.0]]) B.kick(o, t + k * u, 0.22, p); }
  },
  // the title shanty: stamp and clap, held chords, a drone, the bass on one and three
  anthem(B, o, b, t, u, ch, T, P) {
    const r = ch[0];
    B.kick(o, t, 0.3); B.clap(o, t + 2 * u, 0.12); B.kick(o, t + 4 * u, 0.24); B.clap(o, t + 6 * u, 0.12);
    B.bass(o, t, r - 12, 3.6 * u, 0.2); B.bass(o, t + 4 * u, r - 5, 3.6 * u, 0.15);
    B.concertina(o, t, ch, 7.4 * u, b.lead.startsWith('concertina') ? 0.022 : 0.032);
    if (b.i % 4 === 0) B.drone(o, t, [P.tonic - 12, P.tonic - 5], 4 * 8 * u - 0.6, 0.024);
    if (b.part === 'B') for (const k of [1, 3, 5, 7]) ch.forEach((m, j) => B.pluck(o, t + k * u + j * 0.012, m + 12, 0.045));
  },
};
const BUS = 0.66; // the whole band, before the game's master volume
const TONIC = { title: 'G3', sea: 'D3', port: 'G3', night: 'E3', battle: 'D3' };

// ---------------------------------------------------------------- the player: which tune, when, how loud
export class Music {
  constructor(ctx, noise, dest) {
    this.c = ctx; this.band = new Band(ctx, noise);
    this.mood = null; this.on = true; this.level = 1;
    this.cur = null; this.curId = null; this.restUntil = 0;
    // a hall for the band: a convolution reverb made from shaped noise
    this.bus = ctx.createGain(); this.bus.gain.value = BUS;
    const dry = ctx.createGain(); dry.gain.value = 0.82;
    const wet = ctx.createGain(); wet.gain.value = 0.3;
    try {
      const len = Math.floor(ctx.sampleRate * 2.3), ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch); let lp = 0;
        for (let i = 0; i < len; i++) { lp += ((Math.random() * 2 - 1) - lp) * 0.35; d[i] = lp * Math.pow(1 - i / len, 2.6); }
      }
      const conv = ctx.createConvolver(); conv.buffer = ir;
      this.bus.connect(conv).connect(wet).connect(dest);
    } catch (e) { /* no reverb on this device */ }
    this.bus.connect(dry).connect(dest);
    this.parsed = {};
    for (const [id, T] of Object.entries(TRACKS)) {
      this.parsed[id] = {};
      for (const [k, p] of Object.entries(T.parts)) this.parsed[id][k] = { bars: parsePart(p.mel, T.bar, `${id} ${k}`), chords: p.ch.split(/\s+/).map(chordNotes) };
    }
  }
  setLevel(v) { this.level = v; this.bus.gain.setTargetAtTime(BUS * v, this.c.currentTime, 0.6); }
  start(id, t) {
    const T = TRACKS[id], c = this.c, unit = 60 / T.bpm / T.upb, bars = [];
    T.form.forEach(([part, lead], round) => {
      const pd = this.parsed[id][part];
      pd.bars.forEach((notes, i) => bars.push({ notes, chord: pd.chords[i], lead, part, i: bars.length, last: i === pd.bars.length - 1, round }));
    });
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, t); gain.gain.exponentialRampToValueAtTime(T.vol, t + 1.4);
    gain.connect(this.bus);
    this.cur = { id, T, unit, barDur: unit * T.bar, bars, bar: 0, next: t, gain, tonic: midi(TONIC[id] || 'C3') };
  }
  stop(P, sec) {
    if (!P) return;
    const g = P.gain.gain, now = this.c.currentTime;
    try { g.cancelScheduledValues(now); g.setValueAtTime(Math.max(0.0001, g.value), now); g.exponentialRampToValueAtTime(0.0001, now + sec); } catch (e) { /* ignore */ }
    setTimeout(() => { try { P.gain.disconnect(); } catch (e) { /* gone */ } }, (sec + 2) * 1000);
  }
  bar(P, b, t) {
    const B = this.band, o = P.gain, u = P.unit;
    let at = 0;
    for (const [m, n] of b.notes) {
      if (m !== null) {
        const jit = (Math.random() - 0.5) * 0.012, v = (b.lead.startsWith('whistle') ? 0.15 : 0.17) * (0.92 + Math.random() * 0.16) * (at === 0 ? 1.08 : 1);
        B.lead(o, b.lead, t + at * u + jit, m, n * u * 0.94, v);
      }
      at += n;
    }
    STYLES[P.T.style](B, o, b, t, u, b.chord, P.T, P);
  }
  // called ten times a second: switch tunes when the mood changes, schedule the next bars, rest between plays
  update(ahead = 0.45) {
    const now = this.c.currentTime, want = this.on ? this.mood : null;
    if (want !== this.curId) {
      this.stop(this.cur, want === 'battle' ? 1.2 : 2.6);
      this.cur = null; this.curId = want; this.restUntil = 0;
      if (want && TRACKS[want]) this.start(want, now + (want === 'battle' ? 0.1 : 0.6));
      return;
    }
    const P = this.cur;
    if (!P) {
      if (want && TRACKS[want] && now >= this.restUntil) this.start(want, Math.max(now + 0.05, this.restUntil));
      return;
    }
    if (P.next < now - 0.25) P.next = now + 0.05; // the clock jumped (a frozen tab): pick up the beat again rather than cram
    while (P.next < now + ahead) {
      if (P.bar >= P.bars.length) {
        const [a, b] = P.T.rest;
        this.restUntil = P.next + a + Math.random() * (b - a);
        this.stop(P, 0.4); this.cur = null;
        return;
      }
      this.bar(P, P.bars[P.bar], P.next);
      P.next += P.barDur; P.bar++;
    }
  }
  // render a tune offline (for checks): returns the AudioBuffer of `bars` bars
  static async render(id, bars = 8, sampleRate = 22050) {
    const T = TRACKS[id], unit = 60 / T.bpm / T.upb, dur = unit * T.bar * bars + 2;
    const ctx = new OfflineAudioContext(2, Math.ceil(dur * sampleRate), sampleRate);
    const noise = ctx.createBuffer(1, sampleRate * 2, sampleRate), nd = noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const m = new Music(ctx, noise, ctx.destination);
    m.start(id, 0.05);
    for (let i = 0; i < bars && i < m.cur.bars.length; i++) { m.bar(m.cur, m.cur.bars[i], m.cur.next); m.cur.next += m.cur.barDur; }
    return ctx.startRendering();
  }
}
