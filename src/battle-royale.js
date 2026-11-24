import * as THREE from 'three';
import { W, D, WATER_Y } from './config.js';

// A solo, time-limited survival challenge; there are no simulated rival players.
export const ROUND_SECONDS = 75;
export const RADII = [350, 240, 160, 90, 55];
export const DAMAGE = [2, 4, 7, 12];
export const DROP_INTERVAL = 130;
export const FALL_SECONDS = 15;
const DROP_ITEMS = [['shot', 12], ['coconut', 3], ['grog', 1], ['ball', 6], ['plank', 8]];
const finite = (n, fallback) => Number.isFinite(n) ? n : fallback;

export class BattleRoyale {
  constructor(game, saved = null) {
    this.g = game;
    const sp = game.world.spawn;
    this.x = Math.max(0, Math.min(W, finite(saved?.x, sp.x)));
    this.z = Math.max(0, Math.min(D, finite(saved?.z, sp.z)));
    this.elapsed = Math.max(0, Math.min(ROUND_SECONDS * DAMAGE.length, finite(saved?.elapsed, 0)));
    this.result = ['won', 'lost'].includes(saved?.result) ? saved.result : null;
    this.nextDrop = Math.max(0, finite(saved?.nextDrop, 0));
    this.drops = Array.isArray(saved?.drops) ? saved.drops.filter((d) =>
      Number.isFinite(d.x) && d.x >= 0 && d.x < W && Number.isFinite(d.z) && d.z >= 0 && d.z < D
      && Number.isFinite(d.y) && Number.isFinite(d.expires) && DROP_ITEMS.some(([item]) => item === d.item))
      .slice(0, 6).map((d) => ({ x: d.x, y: d.y, z: d.z, expires: d.expires, lands: finite(d.lands, 0), item: d.item })) : [];
    this.group = new THREE.Group();
    this.wallGeo = new THREE.CylinderGeometry(1, 1, 1, 96, 1, true);
    this.wallMat = new THREE.MeshBasicMaterial({ color: 0x56cadd, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide });
    this.wall = new THREE.Mesh(this.wallGeo, this.wallMat);
    this.group.add(this.wall);
    this.dropGeo = new THREE.BoxGeometry(1.5, 1.5, 1.5);
    this.dropMat = new THREE.MeshBasicMaterial({ color: 0xffd25a });
    this.markers = [];
    game.scene.add(this.group);
    this.syncVisuals();
  }
  get phase() { return Math.min(DAMAGE.length - 1, Math.floor(this.elapsed / ROUND_SECONDS)); }
  get radius() {
    const p = this.phase, t = Math.min(1, (this.elapsed - p * ROUND_SECONDS) / ROUND_SECONDS);
    return RADII[p] + (RADII[p + 1] - RADII[p]) * t;
  }
  get active() { return !this.result; }
  get stage() {
    const t = this.elapsed - this.phase * ROUND_SECONDS;
    return t < 10 ? 'safe' : t < 25 ? 'warning' : 'damage';
  }
  damageAt(x, z) {
    const outside = Math.hypot(x - this.x, z - this.z) - this.radius;
    return this.stage === 'damage' && outside > 0 ? DAMAGE[this.phase] * (1 + Math.min(2, outside / 50)) : 0;
  }
  serialize() {
    return { x: this.x, z: this.z, elapsed: this.elapsed, result: this.result, nextDrop: this.nextDrop, drops: this.drops.map((d) => ({ ...d })) };
  }
  spawnDrop() {
    const G = this.g, r = Math.min(this.radius * 0.65, 110);
    for (let i = 0; i < 20; i++) {
      const a = Math.random() * Math.PI * 2, dist = 10 + Math.random() * Math.max(1, r - 10);
      const x = Math.floor(this.x + Math.cos(a) * dist), z = Math.floor(this.z + Math.sin(a) * dist);
      if (x < 1 || z < 1 || x >= W - 1 || z >= D - 1) continue;
      const y = G.world.standY(x, z);
      if (!Number.isFinite(y) || y < WATER_Y) continue;
      const item = DROP_ITEMS[Math.floor(Math.random() * DROP_ITEMS.length)][0];
      this.drops.push({ x: x + 0.5, y, z: z + 0.5, item, lands: this.elapsed + FALL_SECONDS, expires: this.elapsed + FALL_SECONDS + 120 });
      return;
    }
  }
  syncVisuals() {
    this.wall.visible = this.active;
    this.wall.position.set(this.x, WATER_Y + 45, this.z);
    this.wall.scale.set(this.radius, 140, this.radius);
    while (this.markers.length > this.drops.length) this.group.remove(this.markers.pop());
    while (this.markers.length < this.drops.length) {
      const m = new THREE.Mesh(this.dropGeo, this.dropMat); this.markers.push(m); this.group.add(m);
    }
    this.drops.forEach((d, i) => this.markers[i].position.set(d.x, d.y + 0.75 + 40 * Math.max(0, Math.min(1, (d.lands - this.elapsed) / FALL_SECONDS)), d.z));
    for (const m of this.markers) m.visible = this.active;
  }
  update(dt) {
    if (!this.active || !this.g.player.alive) return;
    const previous = this.phase;
    this.elapsed = Math.min(ROUND_SECONDS * DAMAGE.length, this.elapsed + dt);
    if (this.phase !== previous) this.g.ui.toast('The circle closes', `Phase ${this.phase + 1}: outside damage is ${DAMAGE[this.phase]} health per second.`, 'bad');
    this.drops = this.drops.filter((d) => d.expires > this.elapsed);
    if (this.elapsed >= this.nextDrop) {
      if (this.drops.length < 6) this.spawnDrop();
      this.nextDrop = this.elapsed + DROP_INTERVAL;
    }
    const P = this.g.player;
    this.drops = this.drops.filter((d) => {
      if (this.elapsed < d.lands || Math.hypot(P.pos.x - d.x, P.pos.z - d.z) > 2.5 || Math.abs(P.pos.y - d.y) > 3) return true;
      const reward = DROP_ITEMS.find(([item]) => item === d.item);
      this.g.give(reward[0], reward[1]);
      return false;
    });
    const damage = this.damageAt(P.pos.x, P.pos.z);
    if (damage) P.hurt(damage * dt, null, true);
    if (this.active && this.elapsed >= ROUND_SECONDS * DAMAGE.length) {
      this.result = 'won';
      this.g.onRoyaleEnd();
    }
    this.syncVisuals();
  }
  dispose() {
    this.g.scene.remove(this.group);
    this.wallGeo.dispose(); this.wallMat.dispose(); this.dropGeo.dispose(); this.dropMat.dispose();
  }
}
