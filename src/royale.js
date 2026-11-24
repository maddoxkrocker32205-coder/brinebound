// Storm Royale: an opt-in match mode. A storm wall closes over the chart in stages (faster near the end),
// hurting everyone outside the safe circle; ships still afloat are counted, eliminations are announced.
import * as THREE from 'three';
import { W, D, SEA, clamp } from './config.js';

export const STAGES = [
  { r: 1000, hold: 90, shrink: 60, dmg: 1 },
  { r: 650, hold: 75, shrink: 50, dmg: 2 },
  { r: 380, hold: 60, shrink: 40, dmg: 4 },
  { r: 200, hold: 45, shrink: 30, dmg: 6 },
  { r: 90, hold: 30, shrink: 20, dmg: 9 },
  { r: 25, hold: 20, shrink: 15, dmg: 12 },
];
const START_R = Math.hypot(W, D) / 2;

export function fmtTime(s) { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }

export class Royale {
  constructor(G) {
    this.g = G; this.active = false;
    this.wall = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1, 160, 96, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x9b4dff, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, fog: false }));
    this.wall.visible = false; this.wall.frustumCulled = false;
    G.scene.add(this.wall);
    this.el = document.getElementById('royale');
  }
  setActive(on) { if (on && !this.active) this.start(); else if (!on && this.active) this.stop(); }
  start() {
    this.active = true;
    this.cx = W / 2; this.cz = D / 2; this.r = START_R;
    this.fromX = this.cx; this.fromZ = this.cz; this.fromR = this.r;
    this.toX = this.cx; this.toZ = this.cz; this.toR = this.r;
    this.stage = -1; this.t = 6; this.phase = 'hold'; this.tick = 0;
    this.stats = { elims: 0, time: 0, stormDmg: 0, dealt: 0 };
    this.warned = false; this.over = false;
    this.wall.visible = true;
    this.g.ui.toast('Storm Royale', 'A storm will close over the chart. Stay inside the circle and be the last ship afloat.', 'curse');
    this.render();
  }
  stop() { this.active = false; this.wall.visible = false; if (this.el) this.el.classList.add('hidden'); }
  nextStage() {
    this.stage++;
    const S = STAGES[this.stage];
    if (!S) return this.win();
    this.fromX = this.cx; this.fromZ = this.cz; this.fromR = this.r;
    this.toR = S.r;
    const slack = Math.max(0, this.fromR - S.r);
    const a = Math.random() * Math.PI * 2, d = Math.random() * slack * 0.8;
    this.toX = clamp(this.cx + Math.cos(a) * d, S.r, W - S.r); this.toZ = clamp(this.cz + Math.sin(a) * d, S.r, D - S.r);
    this.phase = 'hold'; this.t = S.hold; this.warned = false;
    this.g.ui.toast(`Circle ${this.stage + 1} of ${STAGES.length}`, this.stage >= STAGES.length - 2 ? 'The final circles close fast. The storm bites hard.' : 'The storm is gathering. Mind the purple wall.', 'curse');
    this.g.sfx.curse();
  }
  inside(x, z, pad = 0) { return Math.hypot(x - this.cx, z - this.cz) <= this.r + pad; }
  alive() { return this.g.hollows.filter((s) => s.kind !== 'hollow' && !s.sinking && this.inside(s.pos.x, s.pos.z)).length + 1; }
  update(dt) {
    if (!this.active || this.over) return;
    const G = this.g, P = G.player;
    this.stats.time += dt;
    this.t -= dt;
    if (this.phase === 'hold') {
      if (!this.warned && this.t < 10 && this.stage >= 0) { this.warned = true; G.ui.pickup('The storm closes in 10 seconds'); G.sfx.curse(); }
      if (this.t <= 0) {
        if (this.stage < 0) this.nextStage();
        else { this.phase = 'shrink'; this.t = STAGES[this.stage].shrink; }
      }
    } else {
      const k = 1 - clamp(this.t / STAGES[this.stage].shrink, 0, 1);
      this.cx = this.fromX + (this.toX - this.fromX) * k; this.cz = this.fromZ + (this.toZ - this.fromZ) * k;
      this.r = this.fromR + (this.toR - this.fromR) * k;
      if (this.t <= 0) { this.cx = this.toX; this.cz = this.toZ; this.r = this.toR; this.nextStage(); if (this.over) return; }
    }
    this.wall.position.set(this.cx, SEA, this.cz);
    this.wall.scale.set(this.r, 1, this.r);
    this.tick += dt;
    if (this.tick >= 1) {
      this.tick = 0;
      const S = STAGES[Math.max(0, this.stage)];
      for (const s of G.hollows) if (!s.sinking && s.kind !== 'hollow' && !this.inside(s.pos.x, s.pos.z)) { s.stormKilled = true; s.damage(S.dmg * 4, G); }
      const ref = G.fleet.ref();
      if (P.alive && !this.inside(ref.x, ref.z)) { P.hurt(S.dmg, null); this.stats.stormDmg += S.dmg; if (G.sloop && !G.sloop.sinking && !this.inside(G.sloop.pos.x, G.sloop.pos.z)) G.sloop.damage(S.dmg * 2, G); }
    }
    this.render();
  }
  render() {
    const el = this.el; if (!el) return;
    el.classList.toggle('hidden', !this.active || this.over);
    if (!this.active || this.over) return;
    const ref = this.g.fleet.ref(), out = !this.inside(ref.x, ref.z);
    const label = this.stage < 0 ? 'Storm gathers' : this.phase === 'shrink' ? 'Storm closing' : `Circle ${this.stage + 1}`;
    el.classList.toggle('out', out);
    const txt = `${label} ${fmtTime(this.t)} · Ships ${this.alive()} · Elims ${this.stats.elims}${out ? ' · IN THE STORM' : ''}`;
    if (this.last !== txt) { this.last = txt; el.textContent = txt; }
  }
  // a ship went down: say who was eliminated and by what
  onShipSunk(ship) {
    if (!this.active || ship.kind === 'hollow' || ship === this.g.sloop) return;
    const by = ship.stormKilled ? 'the storm' : 'you';
    if (!ship.stormKilled) this.stats.elims++;
    this.g.ui.toast(`${ship.name} eliminated`, `Sunk by ${by}. ${this.alive() - 1} ships remain.`, ship.stormKilled ? 'curse' : 'good');
  }
  onPlayerDeath() {
    if (!this.active || this.over) return;
    this.over = true; this.render();
    this.g.ui.toast('Eliminated', `Placed #${this.alive()} · ${this.stats.elims} elims · survived ${fmtTime(this.stats.time)} · ${Math.round(this.stats.stormDmg)} storm damage.`, 'bad');
    this.wall.visible = false;
  }
  win() {
    this.over = true; this.render(); this.wall.visible = false;
    this.g.sfx.curse();
    this.g.ui.toast('VICTORY ROYALE', `${this.stats.elims} elims · survived ${fmtTime(this.stats.time)} · ${Math.round(this.stats.stormDmg)} storm damage taken.`, 'chapter');
  }
}
