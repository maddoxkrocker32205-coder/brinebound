import * as THREE from 'three';
import { SEA, W, D, B, FLOOR, clamp, wrapAngle } from './config.js';
import { GeoBuilder } from './geo.js';
import { voxelMaterial } from './materials.js';
import { fireBroadside } from './ship.js';

const BONE = 0xe9e1cb, BONE_D = 0xcfc5a9;
let SK = null;
function parts() {
  if (SK) return SK;
  const torso = new GeoBuilder({ round: 0.06 })
    .box(-0.2, 0.78, -0.08, 0.2, 0.9, 0.08, BONE_D, 17)
    .box(-0.05, 0.9, -0.03, 0.05, 1.5, 0.05, BONE_D, 17)
    .box(-0.22, 1.12, -0.13, 0.22, 1.19, 0.12, BONE, 17)
    .box(-0.23, 1.24, -0.14, 0.23, 1.31, 0.13, BONE, 17)
    .box(-0.24, 1.36, -0.14, 0.24, 1.43, 0.13, BONE, 17)
    .box(-0.3, 1.45, -0.08, 0.3, 1.53, 0.08, BONE, 17)
    .box(-0.2, 1.57, -0.2, 0.2, 1.93, 0.2, BONE, 17)
    .box(-0.15, 1.5, -0.2, 0.15, 1.58, 0.08, BONE_D, 17)
    .box(-0.17, 1.6, -0.205, -0.02, 1.66, -0.19, 0x2a2a28)
    .box(0.02, 1.6, -0.205, 0.17, 1.66, -0.19, 0x2a2a28)
    .build();
  const captainExtras = new GeoBuilder({ round: 0.06 })
    .box(-0.26, 1.06, -0.16, 0.26, 1.16, 0.16, 0x8a1f1a).box(0.12, 0.84, -0.17, 0.2, 1.08, -0.15, 0x8a1f1a)
    .box(-0.31, 1.9, -0.31, 0.31, 1.95, 0.31, 0x1e1d1c).box(-0.21, 1.95, -0.21, 0.21, 2.1, 0.21, 0x1e1d1c)
    .box(-0.31, 1.95, -0.31, -0.2, 2.02, 0.31, 0x1e1d1c).box(0.2, 1.95, -0.31, 0.31, 2.02, 0.31, 0x1e1d1c).box(-0.31, 1.95, 0.2, 0.31, 2.02, 0.31, 0x1e1d1c)
    .box(-0.31, 1.945, -0.315, 0.31, 1.965, -0.3, 0xd6aa4f)
    .build();
  const leg = new GeoBuilder({ round: 0.06 }).box(-0.06, -0.8, -0.06, 0.06, 0, 0.06, BONE, 17).box(-0.08, -0.84, -0.14, 0.08, -0.76, 0.06, BONE_D, 17).build();
  const arm = new GeoBuilder({ round: 0.06 }).box(-0.05, -0.62, -0.05, 0.05, 0, 0.05, BONE, 17).build();
  const sword = new GeoBuilder({ round: 0.06 }).box(-0.02, -1.32, -0.035, 0.02, -0.66, 0.035, 0x9a8f7a).box(-0.1, -0.68, -0.05, 0.1, -0.62, 0.05, 0x7d5a2a).build();
  const eye = new THREE.BoxGeometry(0.08, 0.07, 0.02);
  SK = { torso, captainExtras, leg, arm, sword, eye, eyeG: new THREE.MeshBasicMaterial({ color: 0x8affc8 }), eyeR: new THREE.MeshBasicMaterial({ color: 0xff5a3c }) };
  return SK;
}

let NID = 0;
export class Skeleton {
  constructor(G, x, y, z, opts = {}) {
    this.g = G; this.nid = opts.nid || ++NID; this.atkN = 0; this.lastBy = null;
    this.kind = opts.kind || 'night';         // night | guard | camp | captain
    this.campId = opts.campId || null;
    this.cursed = this.kind !== 'night';
    this.captain = this.kind === 'captain';
    this.pos = new THREE.Vector3(x, y, z); this.vy = 0;
    this.maxHp = this.captain ? 130 : 30; this.hp = this.maxHp;
    this.state = 'rising'; this.t = 0; this.cd = 0.9; this.yaw = Math.random() * 6.28; this.walk = 0;
    this.flash = 0; this.atk = 0; this.dead = false; this.onGround = true;
    const P = parts();
    this.mat = voxelMaterial({ emissive: 0x000000 });
    this.group = new THREE.Group();
    const add = (geo, parent) => { const m = new THREE.Mesh(geo, this.mat); m.castShadow = true; parent.add(m); return m; };
    add(P.torso, this.group);
    if (this.captain) add(P.captainExtras, this.group);
    for (const ex of [-0.095, 0.095]) { const e = new THREE.Mesh(P.eye, this.captain ? P.eyeR : P.eyeG); e.position.set(ex, 1.63, -0.215); this.group.add(e); }
    this.legL = new THREE.Group(); this.legL.position.set(-0.12, 0.8, 0); add(P.leg, this.legL);
    this.legR = new THREE.Group(); this.legR.position.set(0.12, 0.8, 0); add(P.leg, this.legR);
    this.armL = new THREE.Group(); this.armL.position.set(-0.3, 1.48, 0); add(P.arm, this.armL);
    this.armR = new THREE.Group(); this.armR.position.set(0.3, 1.48, 0); add(P.arm, this.armR); add(P.sword, this.armR);
    this.group.add(this.legL, this.legR, this.armL, this.armR);
    if (this.captain) this.group.scale.setScalar(1.3);
    this.group.position.set(x, y - 1.9, z);
    G.scene.add(this.group);
  }
  get height() { return this.captain ? 2.5 : 1.95; }
  hurt(n, dir) {
    if (this.state === 'dying') return;
    this.hp -= n; this.flash = 1;
    if (this.state === 'rising') { if (this.hp <= 0) this.die(true); return; }
    if (dir && !this.captain) { this.tryMove(dir.x * 0.6, dir.z * 0.6); this.vy = 3.5; this.onGround = false; }
    this.g.particles.burst(this.pos.x, this.pos.y + 1.2, this.pos.z, BONE, 6, 2, 2, 14, 0.5, 0.3);
    if (this.hp <= 0) this.die(true);
  }
  die(byPlayer) {
    if (this.state === 'dying') return;
    this.state = 'dying'; this.t = 0;
    this.g.particles.burst(this.pos.x, this.pos.y + 0.9, this.pos.z, BONE, this.captain ? 24 : 12, 2.6, 2.5, 14, 0.9, 0.6);
    this.g.physics.bones(this.pos.x, this.pos.y, this.pos.z, this.captain);
    this.group.visible = false;
    this.g.sfx.bones();
    if (byPlayer) this.g.onSkeletonKilled(this);
  }
  tryMove(mx, mz) {
    const w = this.g.world;
    const ny = w.walkStep(this.pos.x, this.pos.y, this.pos.z, this.pos.x + mx, this.pos.z + mz, this.onGround ? 1.05 : 0.6, 3.5, SEA);
    if (Number.isNaN(ny)) return false;
    this.pos.x += mx; this.pos.z += mz; this.pos.y = ny;
    return true;
  }
  update(dt) {
    const G = this.g, w = G.world;
    this.t += dt; this.cd -= dt; this.atk = Math.max(0, this.atk - dt);
    this.flash = Math.max(0, this.flash - dt * 5);
    this.mat.emissive.setRGB(this.flash * 0.7, 0, 0);
    if (this.state === 'rising') {
      const k = Math.min(1, this.t / 1.2);
      this.group.position.set(this.pos.x, this.pos.y - this.height * (1 - k), this.pos.z);
      this.group.rotation.y = this.yaw;
      if (Math.random() < dt * 25) G.particles.burst(this.pos.x, this.pos.y + 0.1, this.pos.z, 0xd9c48f, 2, 1.5, 2, 12, 0.5, 0.5);
      if (k >= 1) this.state = 'walk';
      return;
    }
    if (this.state === 'dying') {
      this.group.scale.y = Math.max(0.05, (this.captain ? 1.3 : 1) * (1 - this.t * 2.5));
      this.group.rotation.z = this.t * 2;
      if (this.t > 0.45) this.dead = true;
      return;
    }
    if (this.kind === 'night' && !G.sky.isNight) {
      this.hp -= dt * 12;
      if (Math.random() < dt * 10) G.particles.burst(this.pos.x, this.pos.y + 1.5, this.pos.z, 0x6b6b6b, 2, 0.4, 1.5, -2, 1, 0.4);
      if (this.hp <= 0) { this.die(false); return; }
    }
    // chase the nearest pirate on foot: the captain, or (in a crew) any of the crew
    let tg = null, dx = 0, dz = 0, dist = 1e9, dy = 0;
    for (const t of G.targets()) {
      if (!t.alive || !t.foot || t.water) continue;
      const ex = t.x - this.pos.x, ez = t.z - this.pos.z, d = Math.hypot(ex, ez) || 1e-3, ey = t.y - this.pos.y;
      if (d < (this.cursed ? 40 : 34) && Math.abs(ey) < 7 && d < dist) { tg = t; dx = ex; dz = ez; dist = d; dy = ey; }
    }
    const target = !!tg;
    let moved = false;
    const reach = this.captain ? 1.6 : 1.15;
    if (target && dist > reach) {
      const ux = dx / dist, uz = dz / dist;
      this.yaw = Math.atan2(-ux, -uz);
      const sp = (this.captain ? 2.2 : this.cursed ? 2.6 : 2.35) * dt;
      moved = this.tryMove(ux * sp, uz * sp);
      if (!moved) moved = this.tryMove(ux * sp, 0) || this.tryMove(0, uz * sp);
    } else if (!target && this.home) {
      const hx = this.home.x - this.pos.x, hz = this.home.z - this.pos.z, hd = Math.hypot(hx, hz);
      if (hd > 3) { this.yaw = Math.atan2(-hx / hd, -hz / hd); moved = this.tryMove((hx / hd) * 1.5 * dt, (hz / hd) * 1.5 * dt); }
    }
    // stand on the smooth ground (or a block), fall when there is nothing underfoot
    const gnd = w.groundUnder(this.pos.x, this.pos.y, this.pos.z);
    if (this.pos.y > gnd + 0.02 || this.vy > 0) {
      this.vy -= 22 * dt;
      this.pos.y += this.vy * dt;
      if (this.vy <= 0 && this.pos.y <= gnd) { this.pos.y = gnd; this.vy = 0; }
      this.onGround = this.pos.y <= gnd + 0.02;
    } else { this.pos.y = gnd; this.vy = 0; this.onGround = true; }
    if (this.pos.y < FLOOR) this.dead = true;
    if (target && dist < reach + 0.6 && Math.abs(dy) < 1.8 && this.cd <= 0) {
      this.cd = this.captain ? 1.6 : 1.3; this.atk = 0.35; this.atkN++;
      G.hurtTarget(tg, this.captain ? 18 : this.cursed ? 11 : 9, { x: dx / dist, z: dz / dist });
      G.sfx.hit();
    }
    if (moved) this.walk += dt * 8;
    const sw = Math.sin(this.walk) * 0.6;
    this.legL.rotation.x = sw; this.legR.rotation.x = -sw;
    this.armL.rotation.x = 1.2 + Math.sin(this.walk) * 0.15;
    this.armR.rotation.x = this.atk > 0 ? 2.4 - (0.35 - this.atk) * 6 : 1.15 - Math.sin(this.walk) * 0.15;
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
    if (this.captain && Math.random() < dt * 6) G.particles.burst(this.pos.x, this.pos.y + 2.3, this.pos.z, 0xff6a4a, 1, 0.3, 0.6, -0.5, 0.8, 0.4);
  }
  // Crew side: the captain's game moves this skeleton; here it only eases toward that and animates.
  remoteUpdate(dt) {
    const G = this.g, r = this.net;
    this.t += dt; this.atk = Math.max(0, this.atk - dt);
    this.flash = Math.max(0, this.flash - dt * 5);
    this.mat.emissive.setRGB(this.flash * 0.7, 0, 0);
    if (r.st === 2 && this.state !== 'dying') { this.state = 'dying'; this.t = 0; G.particles.burst(this.pos.x, this.pos.y + 0.9, this.pos.z, BONE, this.captain ? 24 : 12, 2.6, 2.5, 14, 0.9, 0.6); G.physics.bones(this.pos.x, this.pos.y, this.pos.z, this.captain); this.group.visible = false; G.sfx.bones(); }
    if (this.state === 'dying') {
      this.group.scale.y = Math.max(0.05, (this.captain ? 1.3 : 1) * (1 - this.t * 2.5));
      this.group.rotation.z = this.t * 2;
      if (this.t > 0.45) this.group.visible = false;
      return;
    }
    const k = 1 - Math.exp(-dt * 10);
    const ox = this.pos.x, oz = this.pos.z;
    if (Math.hypot(r.x - this.pos.x, r.z - this.pos.z) > 6) this.pos.set(r.x, r.y, r.z);
    else { this.pos.x += (r.x - this.pos.x) * k; this.pos.y += (r.y - this.pos.y) * k; this.pos.z += (r.z - this.pos.z) * k; }
    let dy = r.yaw - this.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
    this.yaw += dy * k;
    if (r.st === 0) {
      if (this.state !== 'rising') { this.state = 'rising'; this.t = 0; }
      const q = Math.min(1, this.t / 1.2);
      this.group.position.set(this.pos.x, this.pos.y - this.height * (1 - q), this.pos.z);
      this.group.rotation.y = this.yaw;
      if (Math.random() < dt * 25) G.particles.burst(this.pos.x, this.pos.y + 0.1, this.pos.z, 0xd9c48f, 2, 1.5, 2, 12, 0.5, 0.5);
      return;
    }
    this.state = 'walk';
    if (r.atkN !== this.atkN) { this.atkN = r.atkN; this.atk = 0.35; }
    const moved = Math.hypot(this.pos.x - ox, this.pos.z - oz) > dt * 0.4;
    if (moved) this.walk += dt * 8;
    const sw = Math.sin(this.walk) * 0.6;
    this.legL.rotation.x = sw; this.legR.rotation.x = -sw;
    this.armL.rotation.x = 1.2 + Math.sin(this.walk) * 0.15;
    this.armR.rotation.x = this.atk > 0 ? 2.4 - (0.35 - this.atk) * 6 : 1.15 - Math.sin(this.walk) * 0.15;
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
    if (this.captain && Math.random() < dt * 6) G.particles.burst(this.pos.x, this.pos.y + 2.3, this.pos.z, 0xff6a4a, 1, 0.3, 0.6, -0.5, 0.8, 0.4);
  }
  dispose() { this.g.scene.remove(this.group); }
}

export class Enemies {
  constructor(G) { this.g = G; this.list = []; this.spawnT = 4; }
  update(dt) {
    const G = this.g;
    if (G.net.isCrew) { for (const s of this.list) s.remoteUpdate(dt); return; }
    const tg = G.targets();
    const nearest = (x, z) => { let d = 1e9; for (const t of tg) d = Math.min(d, Math.hypot(t.x - x, t.z - z)); return d; };
    this.spawnT -= dt;
    if (G.sky.isNight && this.spawnT <= 0) {
      this.spawnT = 5 + Math.random() * 3;
      const cap = 3 + Math.min(4, G.level) + (tg.length - 1) * 2;
      const n = this.list.filter((s) => s.kind === 'night' && s.state !== 'dying').length;
      const open = tg.filter((t) => t.alive && t.foot && !t.water && !G.nearLightAt(t.x, t.y, t.z));
      if (n < cap && open.length) { const t = open[(Math.random() * open.length) | 0]; this.spawnNear(t.x, t.z, 1, 10, 22, { kind: 'night' }); }
    }
    for (const camp of G.quests.activeCamps()) {
      const d = nearest(camp.x, camp.z);
      const alive = this.list.filter((s) => s.campId === camp.id && s.state !== 'dying').length;
      if (d < 48 && alive === 0 && !camp.spawned) {
        camp.spawned = true;
        const left = camp.total - camp.killed;
        const grunts = Math.max(0, left - (camp.captainDead ? 0 : 1));
        const made = this.spawnNear(camp.x, camp.z, grunts, 1.5, 5.5, { kind: 'camp', campId: camp.id, home: camp });
        if (!camp.captainDead) this.spawnNear(camp.x, camp.z, 1, 0.5, 2.5, { kind: 'captain', campId: camp.id, home: camp });
        if (made || !camp.captainDead) G.onCampAwake(camp);
      }
      if (d > 95 && camp.spawned) {
        for (const s of this.list) if (s.campId === camp.id) s.dead = true;
        camp.spawned = false;
      }
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const s = this.list[i];
      s.update(dt);
      const far = nearest(s.pos.x, s.pos.z) > 100;
      if (s.dead || (far && !s.campId)) { s.dispose(); this.list.splice(i, 1); }
    }
  }
  spawnNear(cx, cz, n, r0, r1, opts) {
    const w = this.g.world;
    let made = 0;
    for (let t = 0; t < 80 && made < n; t++) {
      const a = Math.random() * Math.PI * 2, r = r0 + Math.random() * (r1 - r0);
      const x = Math.floor(cx + Math.cos(a) * r), z = Math.floor(cz + Math.sin(a) * r);
      if (x < 2 || z < 2 || x >= W - 2 || z >= D - 2) continue;
      const top = w.topSolid(x, z);
      if (top + 1 < SEA + 1) continue;
      const id = w.get(x, top, z);
      if (id === B.LEAVES || id === B.FROND || id === B.COCONUT || id === B.LOG || id === B.PALM || id === B.CLOTH) continue;
      if (w.solid(x, top + 1, z) || w.solid(x, top + 2, z)) continue;
      const s = new Skeleton(this.g, x + 0.5, top + 1, z + 0.5, opts);
      if (opts.home) s.home = opts.home;
      this.list.push(s);
      made++;
    }
    return made;
  }
  raycast(o, d, maxD) {
    let best = null;
    for (const s of this.list) {
      if (s.state === 'dying') continue;
      const yb = s.state === 'rising' ? s.group.position.y : s.pos.y;
      const r = s.captain ? 0.5 : 0.38;
      const t = rayBox(o, d, s.pos.x - r, yb, s.pos.z - r, s.pos.x + r, yb + s.height, s.pos.z + r);
      if (t !== null && t <= maxD && (!best || t < best.t)) best = { s, t };
    }
    return best;
  }
  hitSphere(p, r, dmg) {
    for (const s of this.list) {
      if (s.state === 'dying') continue;
      const dx = p.x - s.pos.x, dy = p.y - (s.pos.y + 0.9), dz = p.z - s.pos.z;
      if (dx * dx + dy * dy + dz * dz < r * r) { s.hurt(dmg, null); return true; }
    }
    return false;
  }
  clear() { for (const s of this.list) s.dispose(); this.list = []; }
}

export function rayBox(o, d, x0, y0, z0, x1, y1, z1) {
  let tmin = 0, tmax = 1e9;
  const lo = [x0, y0, z0], hi = [x1, y1, z1], oo = [o.x, o.y, o.z], dd = [d.x, d.y, d.z];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(dd[i]) < 1e-8) { if (oo[i] < lo[i] || oo[i] > hi[i]) return null; continue; }
    let t1 = (lo[i] - oo[i]) / dd[i], t2 = (hi[i] - oo[i]) / dd[i];
    if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin;
}

// Ghost-ship behaviour: close in, turn broadside, fire, keep off the rocks.
export function hollowAI(s, G, dt) {
  if (s.sinking) return;
  const w = G.world, sl = G.sloop && !G.sloop.sinking ? G.sloop : null;
  const tg = G.targets();
  let tp = null, onShip = false, best = 1e9;
  if (sl && tg.some((t) => t.alive && t.aboard)) { best = Math.hypot(sl.pos.x - s.pos.x, sl.pos.z - s.pos.z); tp = sl.pos; onShip = true; }
  for (const t of tg) {
    if (!t.alive || t.aboard) continue;
    const d = Math.hypot(t.x - s.pos.x, t.z - s.pos.z);
    if (d < best) { best = d; tp = t; onShip = false; }
  }
  const tx = tp ? tp.x : s.pos.x + 1, tz = tp ? tp.z : s.pos.z;
  const dx = tx - s.pos.x, dz = tz - s.pos.z, dist = Math.hypot(dx, dz) || 1;
  const toT = Math.atan2(-dx, -dz);
  let desired;
  if (s.leaving || !tp) {
    desired = Math.atan2(dx, dz);
    s.sailLvl = 1;
    if (dist > 150 && s.leaving) { G.removeHollow(s); return; }
  } else if (dist > 40) {
    desired = toT; s.sailLvl = 1;
  } else {
    const rx = Math.cos(s.heading), rz = -Math.sin(s.heading);
    const side = dx * rx + dz * rz >= 0 ? 1 : -1;
    desired = toT + side * (Math.PI / 2 + clamp((20 * s.size - dist) * 0.045, -0.5, 0.5));
    s.sailLvl = 0.7;
  }
  const fx = -Math.sin(s.heading), fz = -Math.cos(s.heading);
  if (s.avoidT > 0) s.avoidT -= dt;
  else {
    for (const look of [8, 14, 22]) {
      const lk = look * s.size, px = s.pos.x + fx * lk, pz = s.pos.z + fz * lk;
      if (px < 12 || pz < 12 || px > W - 12 || pz > D - 12 || w.solid(Math.floor(px), SEA - 1, Math.floor(pz)) || w.solid(Math.floor(px), SEA, Math.floor(pz))) {
        const rx = Math.cos(s.heading), rz = -Math.sin(s.heading);
        const openR = openWater(w, s.pos.x + (fx + rx) * 14, s.pos.z + (fz + rz) * 14);
        const openL = openWater(w, s.pos.x + (fx - rx) * 14, s.pos.z + (fz - rz) * 14);
        s.avoidDir = openR >= openL ? 1 : -1; s.avoidT = 1.6;
        break;
      }
    }
  }
  let rud = clamp(-wrapAngle(desired - s.heading) * 2.2, -1, 1);
  if (s.avoidT > 0) rud = s.avoidDir;
  s.rudder += (rud - s.rudder) * Math.min(1, dt * 2.5);
  if (!s.leaving && tp && dist < 50 * s.size) {
    const rx = Math.cos(s.heading), rz = -Math.sin(s.heading);
    const c = (dx * rx + dz * rz) / dist;
    const tgt = onShip ? { x: sl.pos.x, z: sl.pos.z, vx: -Math.sin(sl.heading) * sl.speed, vz: -Math.cos(sl.heading) * sl.speed } : { x: tx, z: tz };
    if (c > 0.85) fireBroadside(G, s, 1, tgt);
    else if (c < -0.85) fireBroadside(G, s, -1, tgt);
  }
}
function openWater(w, x, z) {
  let n = 0;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) if (!w.solid(Math.floor(x + i * 4), SEA - 1, Math.floor(z + j * 4))) n++;
  return n;
}
