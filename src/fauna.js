import * as THREE from 'three';
import { W, D, SEA, WATER_Y, B, wrapAngle } from './config.js';
import { voxelMaterial } from './materials.js';
import { waveHeight } from './water.js';
import { rayBox } from './enemies.js';
import { PARROT_COLORS, parrotModel, crabModel, boarModel, goatModel, turtleModel, fishModel, dolphinModel, sharkModel, whaleModel } from './models.js';

// Wildlife: crabs, boars, goats, turtles and parrots on the islands; fish, dolphins, sharks and whales at sea.
// Animals are local to each player's game (not shared in crews).
const LAND = {
  crab: { hp: 6, speed: 1.5, box: [0.4, 0.3], drop: ['crab', 1], flee: 5 },
  boar: { hp: 30, speed: 2.2, box: [0.35, 0.9], drop: ['meat', 2], flee: 0 },
  goat: { hp: 18, speed: 2.6, box: [0.3, 0.95], drop: ['meat', 1], flee: 7 },
  turtle: { hp: Infinity, speed: 0.6, box: [0.45, 0.5], drop: null, flee: 0 },
};
const FISH = [0xf0c040, 0x3a9ad6, 0xf07a3a, 0x9a6ae0, 0x40c0a0];
const LINES = {
  idle: ['Rawk! Pieces of eight!', 'Rawk! Bank the gold!', 'Rawk! Pretty bird!', 'Rawk! Land ho!', 'Rawk! Mind the Hollowmen!'],
  night: 'Rawk! Dark out! Dark out!',
  sails: 'Rawk! Black sails! Black sails!',
  storm: 'Rawk! Wet feathers!',
};

export class Fauna {
  constructor(G) {
    this.g = G; this.list = []; this.schools = []; this.t = 0;
    this.mat = voxelMaterial({ emissive: 0x000000 });
    this.dolT = 25; this.sharkT = 0; this.whaleT = 140 + Math.random() * 120; this.respawnT = 60;
    this.talkT = 40; this.lastNight = false; this.lastSails = 0; this.swimT = 0;
  }
  clear() {
    for (const a of this.list) this.g.scene.remove(a.group);
    for (const s of this.schools) this.g.scene.remove(s.group);
    this.list = []; this.schools = [];
  }
  // ---------------------------------------------------------------- spawning
  populate() {
    this.clear();
    const w = this.g.world;
    w.islands.forEach((o, i) => {
      const n = (k) => Math.round(k * (0.7 + Math.random() * 0.6));
      const plan = {
        outpost: { crab: 2, parrot: 1 }, palm: { crab: n(4), turtle: 1, parrot: 2 }, atoll: { crab: n(4), turtle: 2, parrot: 2 },
        sandbar: { crab: n(3), turtle: 1 }, forest: { boar: n(3), crab: 2, parrot: 1 }, jungle: { boar: n(2), parrot: n(4), crab: 1 },
        rock: { goat: n(3), crab: 1 }, volcano: { goat: 2, crab: 2 }, skull: { crab: n(3) },
      }[o.type] || {};
      for (const [kind, count] of Object.entries(plan)) for (let k = 0; k < count; k++) this.spawnOn(kind, i);
    });
    // fish schools sit over coral
    const corals = [];
    for (let k = 0; k < 6000 && corals.length < 34; k++) {
      const x = 4 + Math.floor(Math.random() * (W - 8)), z = 4 + Math.floor(Math.random() * (D - 8));
      const ty = w.topSolid(x, z);
      if (ty < SEA - 8 || ty > SEA - 3) continue;
      const above = w.get(x, ty + 1, z);
      if (above >= B.CORAL_P && above <= B.CORAL_V) corals.push({ x: x + 0.5, y: ty + 1.6, z: z + 0.5 });
    }
    for (const c of corals) this.spawnSchool(c);
  }
  spot(kind, i) {
    const w = this.g.world, o = w.islands[i];
    for (let tries = 0; tries < 80; tries++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * o.r * 1.1;
      const x = Math.floor(o.x + Math.cos(a) * r), z = Math.floor(o.z + Math.sin(a) * r);
      if (x < 3 || z < 3 || x >= W - 3 || z >= D - 3 || w.islandOf[x + z * W] !== i) continue;
      const g = w.surf[x + z * W];
      if (g <= SEA) continue;
      const top = w.get(x, g - 1, z);
      if (w.solid(x, g, z) || w.solid(x, g + 1, z)) continue;
      if (w.isReserved(x, z, 1) && kind !== 'crab' && kind !== 'parrot') continue;
      if ((kind === 'crab' || kind === 'turtle') && !(top === B.SAND || top === B.ASH) ) continue;
      if (kind === 'boar' && top !== B.GRASS) continue;
      if (kind === 'goat' && top !== B.GRASS && top !== B.STONE && top !== B.BASALT) continue;
      return { x: x + 0.5, y: g, z: z + 0.5 };
    }
    return null;
  }
  spawnOn(kind, i) {
    if (kind === 'parrot') return this.spawnParrot(i);
    const p = this.spot(kind, i);
    if (!p) return null;
    const m = kind === 'crab' ? crabModel(this.mat) : kind === 'boar' ? boarModel(this.mat) : kind === 'goat' ? goatModel(this.mat) : turtleModel(this.mat);
    const a = { kind, island: i, group: m.group, parts: m.parts, pos: new THREE.Vector3(p.x, p.y, p.z), home: { x: p.x, z: p.z }, yaw: Math.random() * 6.28, hp: LAND[kind].hp,
      target: null, waitT: Math.random() * 3, walk: 0, angry: 0, atkCD: 0, flash: 0, dead: false, deadT: 0, vy: 0 };
    a.group.position.copy(a.pos);
    this.g.scene.add(a.group);
    this.list.push(a);
    return a;
  }
  spawnParrot(i) {
    const w = this.g.world, o = w.islands[i];
    const perches = [];
    for (let k = 0; k < 500 && perches.length < 10; k++) {
      const x = Math.floor(o.x + (Math.random() - 0.5) * o.r * 2), z = Math.floor(o.z + (Math.random() - 0.5) * o.r * 2);
      const ty = w.topSolid(x, z), id = w.get(x, ty, z);
      if ((id === B.FROND || id === B.LEAVES || id === B.JLEAVES || id === B.PLANK) && ty > SEA + 3 && !w.solid(x, ty + 1, z)) perches.push({ x: x + 0.5, y: ty + 1, z: z + 0.5 });
    }
    if (!perches.length) return null;
    const c = PARROT_COLORS[Math.floor(Math.random() * PARROT_COLORS.length)];
    const m = parrotModel(this.mat, c);
    m.group.scale.setScalar(1.35);
    const p = perches[Math.floor(Math.random() * perches.length)];
    const a = { kind: 'parrot', island: i, color: PARROT_COLORS.indexOf(c), group: m.group, parts: m.parts, pos: new THREE.Vector3(p.x, p.y, p.z), yaw: Math.random() * 6.28, hp: 4,
      perches, state: 'perch', waitT: 2 + Math.random() * 8, from: null, to: null, ft: 0, flash: 0, dead: false, deadT: 0 };
    a.group.position.copy(a.pos);
    this.g.scene.add(a.group);
    this.list.push(a);
    return a;
  }
  spawnSchool(c) {
    const group = new THREE.Group();
    const color = FISH[Math.floor(Math.random() * FISH.length)];
    const fish = [];
    for (let k = 0; k < 7 + Math.floor(Math.random() * 6); k++) {
      const m = fishModel(this.mat, color);
      group.add(m.group);
      fish.push({ g: m.group, ph: Math.random() * 6.28, r: 1.2 + Math.random() * 1.8, h: (Math.random() - 0.5) * 0.9, sp: 0.6 + Math.random() * 0.5 });
    }
    group.position.set(c.x, c.y, c.z);
    this.g.scene.add(group);
    this.schools.push({ group, fish, c, scatter: 0 });
  }
  // ---------------------------------------------------------------- per frame
  update(dt) {
    const G = this.g, P = G.player, cam = G.camera.position;
    this.t += dt;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const a = this.list[i];
      const far = Math.hypot(a.pos.x - cam.x, a.pos.z - cam.z) > (a.kind === 'whale' ? 220 : 110);
      a.group.visible = !far;
      if (far && !a.sea) continue;
      if (a.dead) {
        a.deadT += dt;
        a.group.rotation.z = Math.min(Math.PI / 2, a.deadT * 5);
        a.group.position.y -= a.sea ? dt * 1.5 : 0;
        if (a.deadT > 1.6) { G.scene.remove(a.group); this.list.splice(i, 1); }
        continue;
      }
      a.flash = Math.max(0, a.flash - dt * 5);
      if (a.kind === 'parrot') this.parrot(a, dt);
      else if (a.kind === 'dolphin') this.dolphin(a, dt);
      else if (a.kind === 'shark') this.shark(a, dt);
      else if (a.kind === 'whale') this.whale(a, dt);
      else this.land(a, dt);
      if (a.gone) { G.scene.remove(a.group); this.list.splice(i, 1); }
    }
    this.mat.emissive.setRGB(0, 0, 0);
    for (const s of this.schools) this.school(s, dt, cam);
    this.seaEvents(dt);
    this.chatter(dt);
    // islands slowly refill
    this.respawnT -= dt;
    if (this.respawnT <= 0) {
      this.respawnT = 45;
      const land = this.list.filter((a) => !a.sea).length;
      if (land < 70) { const i = 1 + Math.floor(Math.random() * (G.world.islands.length - 1)); const o = G.world.islands[i]; if (Math.hypot(o.x - P.pos.x, o.z - P.pos.z) > 60) this.spawnOn(['crab', 'crab', 'parrot', o.type === 'rock' ? 'goat' : 'boar'][Math.floor(Math.random() * 4)], i); }
    }
  }
  land(a, dt) {
    const G = this.g, P = G.player, w = G.world, def = LAND[a.kind];
    a.atkCD -= dt; a.angry = Math.max(0, a.angry - dt);
    const dx = P.pos.x - a.pos.x, dz = P.pos.z - a.pos.z, dist = Math.hypot(dx, dz);
    const playerOnLand = P.alive && P.mode === 'foot' && !P.inWater && Math.abs(P.pos.y - a.pos.y) < 3;
    let mx = 0, mz = 0, speed = def.speed;
    if (a.angry > 0 && playerOnLand && dist < 18) {
      speed = def.speed * 1.6; mx = dx / (dist || 1); mz = dz / (dist || 1);
      if (dist < 1.3 && a.atkCD <= 0) { a.atkCD = 1.2; P.hurt(7, { x: mx, z: mz }); G.sfx.grunt(); }
      if (dist < 1.1) { mx = 0; mz = 0; }
    } else if (def.flee && playerOnLand && dist < def.flee && G.hotbar[G.sel] !== 'coconut') {
      speed = def.speed * 1.7; mx = -dx / (dist || 1); mz = -dz / (dist || 1);
    } else {
      a.waitT -= dt;
      if (!a.target && a.waitT <= 0) {
        const r = a.kind === 'turtle' ? 6 : 7;
        a.target = { x: a.home.x + (Math.random() - 0.5) * r * 2, z: a.home.z + (Math.random() - 0.5) * r * 2 };
      }
      if (a.target) {
        const tx = a.target.x - a.pos.x, tz = a.target.z - a.pos.z, td = Math.hypot(tx, tz);
        if (td < 0.4) { a.target = null; a.waitT = 2 + Math.random() * 5; if (a.kind === 'goat' && Math.random() < 0.3) G.sfx.bleat(G.distToListener(a.pos.x, a.pos.z)); }
        else { mx = tx / td; mz = tz / td; }
      }
    }
    let moved = false;
    if (mx || mz) {
      const want = Math.atan2(-mx, -mz) + (a.kind === 'crab' ? Math.PI / 2 : 0);
      a.yaw += wrapAngle(want - a.yaw) * Math.min(1, dt * 6);
      moved = this.step(a, mx * speed * dt, mz * speed * dt);
      if (!moved) a.target = null;
    }
    // fall onto the smooth ground below
    const gy = w.groundUnder(a.pos.x, a.pos.y + 0.3, a.pos.z);
    if (a.pos.y > gy + 0.02) { a.vy -= 22 * dt; a.pos.y = Math.max(gy, a.pos.y + a.vy * dt); } else { a.vy = 0; a.pos.y = gy; }
    if (moved) a.walk += dt * (a.kind === 'crab' ? 22 : speed * 5);
    const sw = moved ? Math.sin(a.walk) : 0;
    if (a.parts.legs) a.parts.legs.forEach((L, k) => { L.rotation.x = (k === 0 || k === 3 ? sw : -sw) * 0.6; });
    a.group.position.set(a.pos.x, a.pos.y + (a.kind === 'crab' && moved ? Math.abs(sw) * 0.03 : 0), a.pos.z);
    a.group.rotation.y = a.yaw;
    if (a.kind === 'boar' && !moved && !a.angry) a.group.rotation.x = Math.sin(this.t * 0.8 + a.home.x) > 0.6 ? 0.12 : 0;
    else a.group.rotation.x = 0;
  }
  step(a, mx, mz) {
    const w = this.g.world;
    const nx = a.pos.x + mx, nz = a.pos.z + mz;
    if (Math.hypot(nx - a.home.x, nz - a.home.z) > 16 && a.angry <= 0) return false;
    const ny = w.walkStep(a.pos.x, a.pos.y, a.pos.z, nx, nz, 1.05, 2.2, a.kind === 'turtle' ? -1e9 : SEA + 0.02, a.kind === 'crab' ? 0.5 : 1.2);
    if (Number.isNaN(ny)) return false;
    a.pos.x = nx; a.pos.z = nz; a.pos.y = ny;
    return true;
  }
  parrot(a, dt) {
    const G = this.g, P = G.player;
    const flap = (k) => { a.parts.wl.rotation.z = Math.sin(this.t * 24) * 0.9 * k; a.parts.wr.rotation.z = -Math.sin(this.t * 24) * 0.9 * k; };
    if (a.state === 'perch') {
      a.waitT -= dt;
      const near = P.alive && Math.hypot(P.pos.x - a.pos.x, P.pos.z - a.pos.z) < 3.2 && Math.abs(P.pos.y - a.pos.y) < 3 && G.hotbar[G.sel] !== 'coconut';
      flap(0); a.parts.wl.rotation.z = 0.1; a.parts.wr.rotation.z = -0.1;
      a.group.position.set(a.pos.x, a.pos.y + Math.max(0, Math.sin(this.t * 3 + a.pos.x)) * 0.02, a.pos.z);
      a.group.rotation.y = a.yaw + Math.sin(this.t * 0.7 + a.pos.z) * 0.6;
      if (a.waitT <= 0 || near) {
        const to = a.perches[Math.floor(Math.random() * a.perches.length)];
        a.from = a.pos.clone(); a.to = new THREE.Vector3(to.x, to.y, to.z); a.ft = 0; a.state = 'fly';
        a.dur = Math.max(1.2, a.from.distanceTo(a.to) / 6);
        if (Math.random() < 0.35) G.sfx.squawk(G.distToListener(a.pos.x, a.pos.z));
      }
    } else {
      a.ft += dt / a.dur;
      const k = Math.min(1, a.ft);
      a.pos.lerpVectors(a.from, a.to, k);
      a.pos.y += Math.sin(k * Math.PI) * (3 + a.dur);
      const dir = Math.atan2(-(a.to.x - a.from.x), -(a.to.z - a.from.z));
      a.yaw = dir;
      a.group.position.copy(a.pos); a.group.rotation.y = dir;
      flap(1);
      if (k >= 1) { a.state = 'perch'; a.waitT = 5 + Math.random() * 12; a.pos.copy(a.to); }
    }
  }
  school(s, dt, cam) {
    const d = Math.hypot(s.c.x - cam.x, s.c.z - cam.z);
    s.group.visible = d < 60;
    if (!s.group.visible) return;
    const P = this.g.player;
    const pd = Math.hypot(P.pos.x - s.c.x, P.pos.y + 1 - s.c.y, P.pos.z - s.c.z);
    s.scatter = Math.max(0, s.scatter - dt * 0.4);
    if (P.inWater && pd < 4) s.scatter = 1;
    for (const f of s.fish) {
      f.ph += dt * f.sp * (1 + s.scatter * 2);
      const r = f.r * (1 + s.scatter * 1.5);
      f.g.position.set(Math.cos(f.ph) * r, f.h + Math.sin(f.ph * 2) * 0.15, Math.sin(f.ph) * r);
      f.g.rotation.y = -f.ph + Math.sin(this.t * 10 + f.r) * 0.2;
    }
  }
  // ---------------------------------------------------------------- sea life
  seaEvents(dt) {
    const G = this.g, P = G.player, s = G.sloop, w = G.world;
    const aboard = (P.mode === 'deck' || P.mode === 'helm') && s && !s.sinking;
    // dolphins race a moving ship
    this.dolT -= dt;
    if (this.dolT <= 0) {
      this.dolT = 50 + Math.random() * 60;
      if (aboard && Math.abs(s.speed) > 3.5 && w.depthAt(Math.floor(s.pos.x), Math.floor(s.pos.z)) > 0.7 && !this.list.some((a) => a.kind === 'dolphin')) {
        const side = Math.random() < 0.5 ? -1 : 1, n = 2 + Math.floor(Math.random() * 3);
        for (let k = 0; k < n; k++) {
          const m = dolphinModel(this.mat);
          const a = { kind: 'dolphin', sea: true, group: m.group, parts: m.parts, pos: s.pos.clone(), yaw: s.heading, hp: Infinity, life: 22 + Math.random() * 6,
            off: { x: side * (5 + k * 1.6), z: -2 + k * 2.2 }, ph: Math.random() * 6.28, flash: 0, dead: false, deadT: 0 };
          G.scene.add(a.group); this.list.push(a);
        }
        G.sfx.chirp();
      }
    }
    // sharks find swimmers in deep water
    const swimming = P.alive && P.mode === 'foot' && P.inWater && w.depthAt(Math.floor(P.pos.x), Math.floor(P.pos.z)) > 0.65 && (!s || Math.hypot(s.pos.x - P.pos.x, s.pos.z - P.pos.z) > 12);
    this.swimT = swimming ? this.swimT + dt : 0;
    if (this.swimT > 5 && !this.list.some((a) => a.kind === 'shark')) {
      const ang = Math.random() * 6.28;
      const m = sharkModel(this.mat);
      const a = { kind: 'shark', sea: true, group: m.group, parts: m.parts, pos: new THREE.Vector3(P.pos.x + Math.cos(ang) * 22, WATER_Y - 0.9, P.pos.z + Math.sin(ang) * 22), yaw: 0, hp: 40, ang, rad: 22, atkCD: 2, flash: 0, dead: false, deadT: 0, leaving: false };
      G.scene.add(a.group); this.list.push(a);
      if (!G.hints.shark) { G.hints.shark = 1; G.ui.toast('A fin in the water', 'Sharks hunt swimmers in deep water. Get back aboard, or fight it with your cutlass.', 'bad'); }
    }
    // the odd whale far out at sea
    this.whaleT -= dt;
    if (this.whaleT <= 0) {
      this.whaleT = 180 + Math.random() * 160;
      if (aboard && !this.list.some((a) => a.kind === 'whale')) {
        for (let k = 0; k < 20; k++) {
          const ang = Math.random() * 6.28, d = 55 + Math.random() * 30;
          const x = s.pos.x + Math.cos(ang) * d, z = s.pos.z + Math.sin(ang) * d;
          if (x < 20 || z < 20 || x > W - 20 || z > D - 20 || w.depthAt(Math.floor(x), Math.floor(z)) < 0.9) continue;
          const m = whaleModel(this.mat);
          const a = { kind: 'whale', sea: true, group: m.group, parts: m.parts, pos: new THREE.Vector3(x, WATER_Y - 5, z), yaw: ang + Math.PI / 2, hp: Infinity, t: 0, spouted: 0, flash: 0, dead: false, deadT: 0 };
          G.scene.add(a.group); this.list.push(a);
          break;
        }
      }
    }
  }
  dolphin(a, dt) {
    const G = this.g, s = G.sloop;
    a.life -= dt;
    if (!s || s.sinking || a.life < 0) { a.pos.y -= dt * 2; a.group.position.copy(a.pos); if (a.life < -3 || !s) a.gone = true; return; }
    const c = Math.cos(s.heading), sn = Math.sin(s.heading);
    const tx = s.pos.x + a.off.x * c + a.off.z * sn, tz = s.pos.z - a.off.x * sn + a.off.z * c;
    a.pos.x += (tx - a.pos.x) * Math.min(1, dt * 1.5); a.pos.z += (tz - a.pos.z) * Math.min(1, dt * 1.5);
    a.ph += dt * 2.6;
    const arc = Math.sin(a.ph);
    const wy = WATER_Y + waveHeight(a.pos.x, a.pos.z, G.waveTime);
    a.pos.y = wy - 0.7 + Math.max(0, arc) * 1.7;
    if (arc > 0 && Math.sin(a.ph - dt * 2.6) <= 0) { G.particles.burst(a.pos.x, wy + 0.1, a.pos.z, 0xe6f4f7, 10, 1.4, 3, 12, 0.6, 0.6); if (Math.random() < 0.3) G.sfx.chirp(); }
    a.group.position.copy(a.pos);
    a.group.rotation.set(-Math.cos(a.ph) * 0.6 * (arc > -0.3 ? 1 : 0.2), s.heading, 0, 'YXZ');
    a.parts.tail.rotation.x = Math.sin(this.t * 9 + a.off.z) * 0.35;
  }
  shark(a, dt) {
    const G = this.g, P = G.player;
    a.atkCD -= dt;
    const inWater = P.alive && P.mode === 'foot' && P.inWater;
    if (!inWater || a.leaving) {
      a.leaving = true; a.rad += dt * 4;
      if (a.rad > 45) { a.gone = true; return; }
    } else a.rad = Math.max(1.2, a.rad - dt * 1.1);
    a.ang += dt * (0.25 + 3.2 / Math.max(3, a.rad));
    const cx = P.pos.x, cz = P.pos.z;
    const tx = cx + Math.cos(a.ang) * a.rad, tz = cz + Math.sin(a.ang) * a.rad;
    const vx = tx - a.pos.x, vz = tz - a.pos.z;
    a.pos.x += vx * Math.min(1, dt * 2.5); a.pos.z += vz * Math.min(1, dt * 2.5);
    const wy = WATER_Y + waveHeight(a.pos.x, a.pos.z, G.waveTime);
    a.pos.y = wy - (a.rad < 3 ? 0.85 : 0.6);
    if (Math.hypot(vx, vz) > 0.01) a.yaw = Math.atan2(-vx, -vz);
    a.group.position.copy(a.pos); a.group.rotation.y = a.yaw;
    a.parts.tail.rotation.y = Math.sin(this.t * 6) * 0.35;
    const d = Math.hypot(P.pos.x - a.pos.x, P.pos.z - a.pos.z);
    if (inWater && d < 1.9 && a.atkCD <= 0) {
      a.atkCD = 2.2;
      P.hurt(12, { x: (P.pos.x - a.pos.x) / (d || 1), z: (P.pos.z - a.pos.z) / (d || 1) });
      G.particles.burst(P.pos.x, wy + 0.2, P.pos.z, 0xe6f4f7, 16, 2, 4, 12, 0.7, 0.6);
      G.sfx.splash(0);
    }
  }
  whale(a, dt) {
    const G = this.g;
    a.t += dt;
    const fx = -Math.sin(a.yaw), fz = -Math.cos(a.yaw);
    a.pos.x += fx * dt * 2.2; a.pos.z += fz * dt * 2.2;
    const wy = WATER_Y + waveHeight(a.pos.x, a.pos.z, G.waveTime);
    let y, pitch = 0;
    if (a.t < 3) { y = wy - 5 + a.t * 1.35; pitch = -0.12; }
    else if (a.t < 12) { y = wy - 0.55 + Math.sin(a.t * 0.8) * 0.15; if (a.spouted < 2 && a.t > 4 + a.spouted * 4) { a.spouted++; G.particles.burst(a.pos.x + fx * 4.5, wy + 1.2, a.pos.z + fz * 4.5, 0xf4fbfb, 40, 0.8, 7, 10, 1.4, 0.6); G.sfx.whale(); } }
    else if (a.t < 17) { const k = (a.t - 12) / 5; y = wy - 0.55 - k * 5; pitch = 0.45 * Math.sin(k * Math.PI); a.parts.tail.rotation.x = -k * 1.4; }
    else { a.gone = true; return; }
    a.pos.y = y;
    a.group.position.copy(a.pos);
    a.group.rotation.set(pitch, a.yaw, 0, 'YXZ');
    if (a.t < 12) a.parts.tail.rotation.x = Math.sin(a.t * 1.2) * 0.2;
  }
  chatter(dt) {
    const G = this.g;
    if (!G.pet || G.state !== 'play') return;
    const night = G.sky.isNight;
    if (night && !this.lastNight) { this.say(LINES.night); }
    this.lastNight = night;
    const sails = G.hollows.filter((h) => !h.sinking).length;
    if (sails > this.lastSails) this.say(LINES.sails);
    this.lastSails = sails;
    this.talkT -= dt;
    if (this.talkT <= 0) { this.talkT = 70 + Math.random() * 80; this.say(G.weather.storm > 0.6 ? LINES.storm : LINES.idle[Math.floor(Math.random() * LINES.idle.length)]); }
  }
  say(line) { const G = this.g; G.ui.pickup(line); G.sfx.squawk(0); G.avatar.petTalk = 1; }
  // ---------------------------------------------------------------- the player's hands
  raycast(o, d, maxD) {
    let best = null;
    for (const a of this.list) {
      if (a.dead || !a.group.visible || a.kind === 'whale' || a.kind === 'dolphin') continue;
      let r, h, y0 = a.pos.y;
      if (a.kind === 'parrot') { r = 0.3; h = 0.5; }
      else if (a.kind === 'shark') { r = 1.0; h = 1.0; y0 = a.pos.y - 0.4; }
      else { [r, h] = LAND[a.kind].box; }
      const t = rayBox(o, d, a.pos.x - r, y0, a.pos.z - r, a.pos.x + r, y0 + h, a.pos.z + r);
      if (t !== null && t <= maxD && (!best || t < best.t)) best = { a, t };
    }
    return best;
  }
  hurt(a, dmg, dir) {
    const G = this.g;
    if (a.kind === 'turtle') { a.target = null; a.waitT = 4; G.ui.pickup('The turtle tucks into its shell'); return; }
    if (a.kind === 'parrot') { a.waitT = 0; G.sfx.squawk(0); G.ui.pickup('The parrot squawks and flaps away'); return; }
    a.hp -= dmg; a.flash = 1;
    G.particles.burst(a.pos.x, a.pos.y + 0.4, a.pos.z, a.kind === 'shark' ? 0xb3402a : 0xd8c8b0, 6, 1.6, 2, 12, 0.5, 0.3);
    if (a.kind === 'boar') { a.angry = 14; G.sfx.grunt(); }
    if (a.kind === 'goat' || a.kind === 'crab') { a.target = null; if (dir) this.step(a, dir.x * 0.5, dir.z * 0.5); }
    if (a.kind === 'parrot' && a.state === 'perch') a.waitT = 0;
    if (a.hp <= 0) {
      a.dead = true; a.deadT = 0;
      const drop = a.kind === 'shark' ? ['meat', 2] : LAND[a.kind].drop;
      if (drop) G.give(drop[0], drop[1]);
    }
  }
  // feeding a parrot a coconut makes it your shoulder companion
  tame(o, d) {
    const G = this.g;
    if (G.pet) return false;
    let best = null;
    for (const a of this.list) {
      if (a.kind !== 'parrot' || a.dead || !a.group.visible) continue;
      const t = rayBox(o, d, a.pos.x - 0.5, a.pos.y - 0.2, a.pos.z - 0.5, a.pos.x + 0.5, a.pos.y + 0.8, a.pos.z + 0.5);
      if (t !== null && t < 7 && (!best || t < best.t)) best = { a, t };
    }
    if (!best) return false;
    const a = best.a;
    G.inv.coconut--;
    G.pet = { color: a.color };
    G.scene.remove(a.group);
    this.list.splice(this.list.indexOf(a), 1);
    G.avatar.setPet(G.pet);
    G.sfx.squawk(0);
    G.ui.toast('A new shipmate', 'The parrot takes the coconut and settles on your shoulder. It seems to like you.', 'good');
    return true;
  }
}
