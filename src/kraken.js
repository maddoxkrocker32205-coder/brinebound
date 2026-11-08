import * as THREE from 'three';
import { WATER_Y } from './config.js';
import { GeoBuilder, glowSprite } from './geo.js';
import { voxelMaterial } from './materials.js';

const FLESH = 0x5a2b4a, FLESH_D = 0x45203a, CUP = 0xc98aa0;
let SEG = null;
function segGeo() {
  if (SEG) return SEG;
  SEG = new GeoBuilder({ round: 0.12 })
    .box(-0.5, -0.5, -0.5, 0.5, 0.5, 0.5, FLESH)
    .box(-0.32, -0.3, -0.56, -0.08, -0.06, -0.5, CUP).box(0.08, 0.06, -0.56, 0.32, 0.3, -0.5, CUP)
    .box(-0.5, 0.42, -0.5, 0.5, 0.5, 0.5, FLESH_D)
    .build();
  return SEG;
}
const N = 13;

let NID = 0;
export class Tentacle {
  constructor(K, angle, radius, hp, phase) {
    this.K = K; this.angle = angle; this.radius = radius; this.nid = ++NID;
    this.maxHp = hp; this.hp = hp; this.alive = true; this.rise = 0; this.phase = phase ?? Math.random() * 6.28;
    this.slam = 0; this.slamHit = false; this.flash = 0; this.sink = 0;
    this.mat = voxelMaterial({ emissive: 0x000000 });
    this.group = new THREE.Group();
    this.segs = [];
    for (let i = 0; i < N; i++) {
      const m = new THREE.Mesh(segGeo(), this.mat);
      const s = 1.35 - (i / (N - 1)) * 0.95;
      m.scale.setScalar(s); m.castShadow = true;
      m.userData.r = s * 0.62;
      this.group.add(m); this.segs.push(m);
    }
    K.g.scene.add(this.group);
    this.base = new THREE.Vector3();
  }
  update(dt, t, ship) {
    const K = this.K;
    this.flash = Math.max(0, this.flash - dt * 5);
    this.mat.emissive.setRGB(this.flash * 0.8, this.flash * 0.2, 0);
    if (!this.alive) {
      this.sink += dt;
      this.group.position.y -= dt * 6;
      if (this.sink > 2.5) { K.g.scene.remove(this.group); this.gone = true; }
      return;
    }
    this.rise = Math.min(1, this.rise + dt * 0.55);
    const dirx = Math.cos(this.angle), dirz = Math.sin(this.angle);
    this.base.set(ship.pos.x + dirx * this.radius, WATER_Y - 1.5, ship.pos.z + dirz * this.radius);
    let lean = 2.5, height = 11.5, curl = 1;
    if (this.slam > 0) {
      this.slam -= dt;
      const p = 1 - this.slam / 2.2;
      if (p < 0.55) { height = 20; lean = 0.5; curl = 0.4; }
      else { const q = Math.min(1, (p - 0.55) / 0.25); height = 20 - q * 15; lean = 0.5 + q * (this.radius - 0.5); curl = 0.2;
        if (q >= 1 && !this.slamHit) { this.slamHit = true; K.onSlam(this); } }
      if (this.slam <= 0) this.slamHit = false;
    }
    const px = -dirz, pz = dirx;
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1);
      const sway = Math.sin(t * 1.5 + this.phase + u * 3) * u * 1.4 * curl;
      const m = this.segs[i];
      m.position.set(
        this.base.x - dirx * lean * u * u + px * sway,
        this.base.y + u * height * this.rise + Math.sin(t * 2 + i) * 0.05,
        this.base.z - dirz * lean * u * u + pz * sway);
      m.rotation.set(Math.sin(t + i) * 0.2, this.angle, Math.cos(t * 1.2 + i) * 0.2);
    }
  }
  hit(p, pad = 0.35) {
    if (!this.alive) return false;
    for (const m of this.segs) {
      const r = m.userData.r + pad;
      if (m.position.distanceToSquared(p) < r * r) return true;
    }
    return false;
  }
  damage(n) {
    if (!this.alive) return;
    this.hp -= n; this.flash = 1;
    const tip = this.segs[(N / 2) | 0].position;
    this.K.g.particles.burst(tip.x, tip.y, tip.z, 0x8a3a6a, 10, 2.2, 2, 12, 0.7, 0.8);
    if (this.hp <= 0) {
      this.alive = false;
      this.K.g.particles.burst(this.base.x, WATER_Y + 0.4, this.base.z, 0xe6f4f7, 40, 3, 7, 12, 1.2, 1.5);
      this.K.g.sfx.splash(0); this.K.g.sfx.roar();
    }
  }
  mid() { return this.segs[(N * 0.55) | 0].position; }
  dispose() { this.K.g.scene.remove(this.group); }
}

function makeHead() {
  const g = new GeoBuilder({ round: 0.12 });
  for (let y = 0; y < 5; y++) { const r = 3.2 - y * 0.5; g.box(-r, y, -r * 0.9, r, y + 1, r * 0.9, y % 2 ? FLESH : FLESH_D); }
  g.box(-3.3, -2, -2.9, 3.3, 0, 2.9, FLESH_D);
  const head = new THREE.Group();
  const mesh = new THREE.Mesh(g.build(), voxelMaterial({ emissive: 0x000000 }));
  mesh.castShadow = true;
  head.add(mesh);
  for (const sx of [-1.5, 1.5]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 0.3), new THREE.MeshBasicMaterial({ color: 0xffd23a }));
    eye.position.set(sx, 1.6, -2.75);
    const pupil = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.95, 0.32), new THREE.MeshBasicMaterial({ color: 0x120c08 }));
    pupil.position.set(sx, 1.6, -2.8);
    const glow = glowSprite(0xffc23a, 4, 0.7); glow.position.set(sx, 1.6, -3.2);
    head.add(eye, pupil, glow);
  }
  return { head, mesh };
}

export class Kraken {
  constructor(G, level = 0) {
    this.g = G; this.t = 0; this.state = 'tentacles';
    this.tentacleHp = 45 + level * 5;
    this.tentacles = [];
    const n = 6;
    for (let i = 0; i < n; i++) this.tentacles.push(new Tentacle(this, (i / n) * Math.PI * 2 + 0.3, (8 + Math.random() * 3.5) * 1.75, this.tentacleHp));   // round a ship twice the old size
    this.attackT = 5; this.spawnT = 0;
    this.headHp = 200; this.headMax = 200; this.head = null; this.dead = false; this.dying = 0;
    G.particles.burst(G.sloop.pos.x, WATER_Y + 0.5, G.sloop.pos.z, 0xe6f4f7, 80, 6, 6, 10, 1.4, 12);
  }
  get alive() { return !this.dead; }
  buildHead(at) {
    const { head, mesh } = makeHead();
    this.head = head; this.headMesh = mesh;
    const s = this.g.sloop, a = Math.random() * Math.PI * 2;
    this.headPos = at ? at.clone() : new THREE.Vector3(s.pos.x + Math.cos(a) * 20, WATER_Y - 7, s.pos.z + Math.sin(a) * 20);
    this.head.position.copy(this.headPos);
    this.g.scene.add(this.head);
    this.g.sfx.roar();
    this.g.ui.toast('The Deep One rises', 'Its eye is the weak point. Turn your broadside on it.', 'curse');
  }
  onSlam(tent) {
    const G = this.g, s = G.sloop;
    if (!s || s.sinking) return;
    s.damage(11, G);
    G.particles.burst(s.pos.x, s.pos.y + 1.4, s.pos.z, 0x6b4426, 18, 3, 3, 14, 0.9, 2);
    G.particles.burst(tent.base.x, WATER_Y + 0.5, tent.base.z, 0xe6f4f7, 25, 3, 5, 12, 1, 2);
    G.sfx.crash(0); G.shake(0.6);
    const P = G.player;
    if ((P.mode === 'deck' || P.mode === 'helm') && Math.random() < 0.6) P.hurt(10, null);
    G.net.hurtAboard(10, 0.6);
  }
  update(dt) {
    const G = this.g, s = G.sloop;
    if (!s || s.sinking) { this.submerge(); return; }
    this.t += dt;
    s.hold = 0.12;
    for (const tn of this.tentacles) tn.update(dt, this.t, s);
    this.tentacles = this.tentacles.filter((tn) => !tn.gone);
    const alive = this.tentacles.filter((tn) => tn.alive);
    this.attackT -= dt;
    if (this.attackT <= 0 && alive.length) {
      this.attackT = 3.5 + Math.random() * 2.5;
      const tn = alive[(Math.random() * alive.length) | 0];
      if (tn.slam <= 0 && tn.rise >= 1) tn.slam = 2.2;
    }
    if (this.state === 'tentacles' && alive.length === 0 && this.t > 4) { this.state = 'head'; this.buildHead(); this.spawnT = 12; }
    if (this.state === 'head' && this.head) {
      const k = Math.min(1, (this.t % 1000) * 0.5);
      this.headPos.y += (WATER_Y - 1.2 - this.headPos.y) * Math.min(1, dt * 0.8);
      this.head.position.set(this.headPos.x, this.headPos.y + Math.sin(this.t * 1.3) * 0.4, this.headPos.z);
      this.head.lookAt(s.pos.x, this.head.position.y, s.pos.z);
      this.head.rotateY(Math.PI);
      this.headMesh.material.emissive.setRGB(this.headFlash || 0, 0, 0);
      this.headFlash = Math.max(0, (this.headFlash || 0) - dt * 4);
      this.spawnT -= dt;
      if (this.spawnT <= 0 && alive.length < 3) {
        this.spawnT = 16;
        for (let i = 0; i < 2; i++) this.tentacles.push(new Tentacle(this, Math.random() * Math.PI * 2, (8 + Math.random() * 3) * 1.75, this.tentacleHp * 0.7));
        G.sfx.roar();
      }
      void k;
    }
    if (this.state === 'dying') {
      this.dying += dt;
      if (this.head) { this.head.position.y -= dt * 2.5; this.head.rotation.z += dt * 0.3; }
      if (this.dying > 4) this.finish();
    }
  }
  headHit(p) {
    if (!this.head || this.state !== 'head') return false;
    const dx = p.x - this.head.position.x, dy = p.y - (this.head.position.y + 1.5), dz = p.z - this.head.position.z;
    return dx * dx + dy * dy * 1.5 + dz * dz < 3.4 * 3.4;
  }
  // returns true if a projectile at p hit something
  projectileHit(p, dmgMul = 1) {
    for (const tn of this.tentacles) if (tn.hit(p, 0.7)) { tn.damage(15 * dmgMul); return true; }
    if (this.headHit(p)) {
      this.headHp -= 16 * dmgMul; this.headFlash = 1;
      this.g.particles.burst(p.x, p.y, p.z, 0x8a3a6a, 16, 2.6, 2, 12, 0.8, 1);
      if (this.headHp <= 0 && this.state === 'head') this.defeat();
      return true;
    }
    return false;
  }
  meleeHit(o, d, reach) {
    for (const tn of this.tentacles) {
      if (!tn.alive) continue;
      for (const m of tn.segs) {
        const vx = m.position.x - o.x, vy = m.position.y - o.y, vz = m.position.z - o.z;
        const t = vx * d.x + vy * d.y + vz * d.z;
        if (t < 0 || t > reach) continue;
        const cx = o.x + d.x * t - m.position.x, cy = o.y + d.y * t - m.position.y, cz = o.z + d.z * t - m.position.z;
        if (cx * cx + cy * cy + cz * cz < (m.userData.r + 0.2) ** 2) return { tn, t };
      }
    }
    return null;
  }
  // a target for the sloop's aim assist on the given side
  aimTarget(ship, side) {
    const rx = Math.cos(ship.heading) * side, rz = -Math.sin(ship.heading) * side;
    let best = null;
    const consider = (x, y, z) => {
      const dx = x - ship.pos.x, dz = z - ship.pos.z, d = Math.hypot(dx, dz) || 1;
      const c = (dx * rx + dz * rz) / d;
      if (c > 0.55 && d < 70 && (!best || c > best.c)) best = { x, z, y, c };
    };
    for (const tn of this.tentacles) if (tn.alive) { const m = tn.mid(); consider(m.x, m.y - WATER_Y, m.z); }
    if (this.head && this.state === 'head') consider(this.head.position.x, 1.5, this.head.position.z);
    return best;
  }
  defeat() {
    this.state = 'dying'; this.dying = 0;
    const h = this.head.position;
    this.g.particles.burst(h.x, WATER_Y + 1, h.z, 0xe6f4f7, 120, 6, 8, 10, 1.6, 6);
    this.g.sfx.roar(); this.g.shake(1);
    for (const tn of this.tentacles) if (tn.alive) { tn.hp = 0; tn.alive = false; }
  }
  finish() {
    if (this.dead) return;
    this.dead = true;
    if (this.head) this.g.scene.remove(this.head);
    for (const tn of this.tentacles) tn.dispose();
    if (this.g.sloop) this.g.sloop.hold = 1;
    this.g.onKrakenDefeated();
  }
  submerge() {
    if (this.dead) return;
    this.dead = true; this.fled = true;
    if (this.head) this.g.scene.remove(this.head);
    for (const tn of this.tentacles) tn.dispose();
    if (this.g.sloop) this.g.sloop.hold = 1;
    this.g.onKrakenFled();
  }
}

// The crew's copy of the captain's kraken: the same tentacles and head, moved by the captain's game.
// Damage is never decided here; hits go to the captain as requests.
export class KrakenPuppet {
  constructor(G) {
    this.g = G; this.t = 0; this.state = 'tentacles'; this.remote = true;
    this.tentacles = []; this.byId = new Map(); this.goneIds = new Set();
    this.headHp = 200; this.headMax = 200; this.head = null; this.headMesh = null; this.headPos = new THREE.Vector3();
    this.dead = false; this.headFlash = 0;
    G.particles.burst(G.sloop ? G.sloop.pos.x : 0, WATER_Y + 0.5, G.sloop ? G.sloop.pos.z : 0, 0xe6f4f7, 60, 6, 6, 10, 1.4, 12);
    G.shake(0.8);
  }
  get alive() { return !this.dead; }
  // k = [state, headHp, headMax, hx, hy, hz, [[id, angle, radius, rise, slam, alive, hpFrac, phase], ...]]
  apply(k) {
    const G = this.g;
    const st = ['tentacles', 'head', 'dying'][k[0]] || 'tentacles';
    const seen = new Set();
    for (const e of k[6] || []) {
      const id = e[0];
      seen.add(id);
      let tn = this.byId.get(id);
      if (!tn) {
        if (!e[5] || this.goneIds.has(id)) continue;
        tn = new Tentacle(this, e[1], e[2], 100, e[7]);
        tn.rise = e[3]; tn.netHp = e[6]; tn.netId = id;
        this.byId.set(id, tn); this.tentacles.push(tn);
      }
      if (e[6] < tn.netHp - 0.001) tn.flash = 1;
      tn.netHp = e[6];
      tn.rise = Math.max(tn.rise, e[3]);
      if (tn.alive && tn.slam <= 0 && e[4] > 1.2) tn.slam = e[4];
      if (!e[5] && tn.alive) {
        tn.alive = false;
        G.particles.burst(tn.base.x, WATER_Y + 0.4, tn.base.z, 0xe6f4f7, 40, 3, 7, 12, 1.2, 1.5);
        G.sfx.splash(0); G.sfx.roar();
      }
    }
    for (const [id, tn] of this.byId) if (!seen.has(id) && tn.alive) { tn.alive = false; }
    if (k[1] < this.headHp - 0.01) this.headFlash = 1;
    this.headHp = k[1]; this.headMax = k[2] || 200;
    if ((st === 'head' || st === 'dying') && !this.head) {
      const { head, mesh } = makeHead();
      this.head = head; this.headMesh = mesh;
      this.headPos.set(k[3], k[4], k[5]);
      head.position.copy(this.headPos);
      G.scene.add(head);
      G.sfx.roar();
      G.ui.toast('The Deep One rises', 'Its eye is the weak point. Help your captain turn the broadside on it.', 'curse');
    }
    if (this.head) this.headPos.set(k[3], k[4], k[5]);
    if (st === 'dying' && this.state !== 'dying') {
      G.particles.burst(this.headPos.x, WATER_Y + 1, this.headPos.z, 0xe6f4f7, 120, 6, 8, 10, 1.6, 6);
      G.sfx.roar(); G.shake(1);
    }
    this.state = st;
  }
  onSlam(tent) {
    const G = this.g, s = G.sloop;
    if (!s) return;
    G.particles.burst(s.pos.x, s.pos.y + 1.4, s.pos.z, 0x6b4426, 18, 3, 3, 14, 0.9, 2);
    G.particles.burst(tent.base.x, WATER_Y + 0.5, tent.base.z, 0xe6f4f7, 25, 3, 5, 12, 1, 2);
    G.sfx.crash(0); G.shake(0.6);
  }
  update(dt) {
    const s = this.g.sloop;
    this.t += dt;
    if (s) for (const tn of this.tentacles) tn.update(dt, this.t, s);
    this.tentacles = this.tentacles.filter((tn) => !tn.gone);
    for (const [id, tn] of this.byId) if (tn.gone) { this.byId.delete(id); this.goneIds.add(id); }
    if (this.head) {
      const target = this.headPos;
      const p = this.head.position;
      const k = 1 - Math.exp(-dt * 4);
      p.x += (target.x - p.x) * k; p.z += (target.z - p.z) * k;
      p.y += (target.y + Math.sin(this.t * 1.3) * 0.4 - p.y) * k;
      if (s) { this.head.lookAt(s.pos.x, p.y, s.pos.z); this.head.rotateY(Math.PI); }
      if (this.state === 'dying') this.head.rotation.z += dt * 0.3;
      this.headMesh.material.emissive.setRGB(this.headFlash, 0, 0);
      this.headFlash = Math.max(0, this.headFlash - dt * 4);
    }
  }
  meleeHit(o, d, reach) { return Kraken.prototype.meleeHit.call(this, o, d, reach); }
  aimTarget(ship, side) { return Kraken.prototype.aimTarget.call(this, ship, side); }
  dispose() {
    this.dead = true;
    if (this.head) this.g.scene.remove(this.head);
    for (const tn of this.tentacles) tn.dispose();
    this.tentacles = []; this.byId.clear();
  }
}
