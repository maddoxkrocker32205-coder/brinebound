import * as THREE from 'three';
import { W, D, FLOOR, WATER_Y, clamp } from './config.js';
import { waveHeight } from './water.js';
import { SHIP, HELM, LADDER, SIDE_LADDERS, GUNS, halfWidthAt, hullHalfAt, railY, floorAt, ceilingAt, deckObstacles, gunPlace, HATCH, SCALE, HULL_CIRCLES } from './ship.js';
const OBST = deckObstacles();
import { CRISP } from './world.js';

export const PW = 0.3, PH = 1.75, EYE = 1.6;
const GRAV = 26, JUMP = 8.6;
const STEP = 0.62;                    // smooth ground this much higher is simply walked onto
const SLIDE_H = 1.0;                  // body height while sliding
const CROUCH_H = 0.95, CROUCH_EYE = 1.12, CRAWL_EYE = 0.74;   // crouched you fit a one-block gap, crawling
// emotes: how long each plays (0 = until you move)
export const EMOTES = [['wave', 'Wave', 2.4], ['cheer', 'Cheer', 2.6], ['dance', 'Dance', 0], ['salute', 'Salute', 2], ['point', 'Point', 2], ['sit', 'Sit', 0], ['bow', 'Bow', 2], ['shrug', 'Shrug', 1.7]];
const FOOT = [[0, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const _v = new THREE.Vector3();
const ease = (k) => k * k * (3 - 2 * k);

function pushOut(p, cx, cz, r) {
  const dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz);
  if (d < r) { if (d < 1e-4) { p.x = cx + r; return; } p.x = cx + (dx / d) * r; p.z = cz + (dz / d) * r; }
}

export class Player {
  constructor(game) {
    this.g = game;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.local = new THREE.Vector3(0, SHIP.deck, 2); this.lvy = 0;
    this.yaw = 0; this.pitch = 0;
    this.mode = 'foot'; this.ship = null;   // ship: the deck you're on (null: your own sloop)
    this.onGround = false; this.inWater = false;
    this.hp = 100; this.maxHp = 100; this.hunger = 100; this.alive = true;
    this.boardCD = 0; this.attackCD = 0; this.walkPhase = 0; this.moving = false;
    this.prevShipHeading = 0;
    // movement in the spirit of The Finals: slides that carry momentum, mantling up ledges, landings you feel
    this.climb = false; this.sideLadder = null; this.gun = -1; this.crouch = false; this.cramped = false; this.emote = null;
    this.slide = 0; this.slideCD = 0; this.mantle = null; this.eyeH = EYE; this.landDip = 0; this.eyeLag = 0; this.airT = 0; this.fallV = 0;
  }

  height() { return this.slide > 0 ? SLIDE_H : this.crouch ? CROUCH_H : PH; }
  // is there headroom to stand up straight here?
  canStand() {
    const p = this.pos, w = this.g.world;
    if (this.mode !== 'foot') return true;
    if (w.boxes(p.x - PW, p.y + 0.05, p.z - PW, p.x + PW, p.y + PH, p.z + PW, this._bx || (this._bx = [])).length) return false;
    return w.groundProbe(p.x, p.z, p.y, 0.3, PH) !== Infinity;
  }
  // room for a crouch (rather than a crawl) here?
  headroom(h) {
    const p = this.pos, w = this.g.world;
    if (w.boxes(p.x - PW * 0.8, p.y + 0.05, p.z - PW * 0.8, p.x + PW * 0.8, p.y + h, p.z + PW * 0.8, this._bx || (this._bx = [])).length) return false;
    return w.groundProbe(p.x, p.z, p.y, 0.3, h) !== Infinity;
  }
  setCrouch(on) {
    if (on === this.crouch) return true;
    if (!on && !this.canStand()) return false;
    this.crouch = on;
    return true;
  }
  startEmote(id) {
    const e = EMOTES.find((x) => x[0] === id);
    if (!e || !this.alive || this.climb || this.gun >= 0 || this.mantle || this.inWater || this.slide > 0) return false;
    if (this.mode !== 'foot' && this.mode !== 'deck') return false;
    if (id === 'sit') this.crouch = false;
    this.emote = { id, t: 0, dur: e[2], yaw: this.yaw + Math.PI };
    return true;
  }
  updateEmote(dt, input) {
    const E = this.emote;
    if (!E) return;
    E.t += dt;
    if ((E.dur && E.t > E.dur) || Math.abs(input.move.x) + Math.abs(input.move.y) > 0.2 || input.jumpHeld || input.primaryHeld || !this.onGround || this.inWater) this.emote = null;
  }
  eye(out) { return out.set(this.pos.x, this.pos.y + this.eyeH - this.landDip - this.eyeLag, this.pos.z); }
  viewDir(out) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }
  intersectsBlock(bx, by, bz) {
    const p = this.pos;
    return p.x - PW < bx + 1 && p.x + PW > bx && p.y < by + 1 && p.y + PH > by && p.z - PW < bz + 1 && p.z + PW > bz;
  }

  update(dt, input) {
    const G = this.g;
    if (!this.alive) return;
    if (this.mode !== 'helm') {
      const k = G.guns ? 1 - 0.55 * G.guns.aim : 1;    // steadier aim down a musket barrel
      this.yaw -= input.lookDX * G.sens * k;
      this.pitch = clamp(this.pitch - input.lookDY * G.sensY * k, -1.52, 1.52);
    }
    this.boardCD -= dt; this.attackCD -= dt;
    if (this.mode === 'foot') this.updateFoot(dt, input);
    else if (this.mode === 'deck') this.updateDeck(dt, input);
    else if (this.mode === 'helm') this.updateHelm(dt, input);
    if (this.mode === 'helm') { this.emote = null; this.crouch = false; }
    this.updateEmote(dt, input);
    this.updateSurvival(dt, input);
  }

  // blocks only (crafted blocks, trunks); the smooth ground is handled by terrainBlocked and the floor probe
  collides() { return this.boxAt(this.pos.x, this.pos.y, this.pos.z); }
  // crafted blocks and building pieces, as boxes
  boxAt(px, py, pz) { return this.g.world.boxes(px - PW, py, pz - PW, px + PW, py + this.height(), pz + PW, this._bx || (this._bx = [])).length > 0; }
  // trunks are round: slide around them instead of stopping dead on an invisible square
  pushTrunks() {
    const p = this.pos, w = this.g.world, h = this.height(), c = this._tc || (this._tc = {});
    const y0 = Math.floor(p.y + 0.08), y1 = Math.floor(p.y + h - 0.05);
    let hit = false;
    for (let bz = Math.floor(p.z) - 2; bz <= Math.floor(p.z) + 2; bz++) for (let bx = Math.floor(p.x) - 2; bx <= Math.floor(p.x) + 2; bx++) {
      for (let by = y0; by <= y1; by++) {
        if (!w.trunkCircle(bx, by, bz, c)) continue;
        const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), R = c.r + PW;
        if (d < R) {
          const ox = p.x, oz = p.z;
          if (d < 1e-4) p.x = c.x + R; else { p.x = c.x + (dx / d) * R; p.z = c.z + (dz / d) * R; }
          if (this.collides() || this.terrainBlocked()) { p.x = ox; p.z = oz; }
          else hit = true;
        }
        break;
      }
    }
    return hit;
  }
  // smooth ground cutting into the body above a walkable step
  terrainBlocked() {
    const p = this.pos, w = this.g.world, h = this.height(), k = PW * 0.85;
    for (const [ox, oz] of FOOT) if (w.groundProbe(p.x + ox * k, p.z + oz * k, p.y, STEP, h) === Infinity) return true;
    return false;
  }
  // does the body fit at (x, y, z): no blocks in it, and no ground in it under any part of its footprint?
  fitsAt(x, y, z) {
    if (this.boxAt(x, y, z)) return false;
    const w = this.g.world, h = this.height(), k = PW * 0.85;
    for (const [ox, oz] of FOOT) if (w.groundProbe(x + ox * k, z + oz * k, y, STEP, h) === Infinity) return false;
    return true;
  }
  // a body that ended up inside the ground (dirt placed on it, a bad spawn, a squeeze underground): the
  // nearest place it fits a short step away (underground, that is the tunnel it came from), else the surface above
  unstick() {
    const p = this.pos, w = this.g.world;
    for (const r of [0.2, 0.4, 0.65, 0.95, 1.3]) {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2, x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
        for (const dy of [0, 0.35, -0.35, 0.7]) {
          const y = p.y + dy;
          if (!this.fitsAt(x, y, z)) continue;
          const g = w.groundProbe(x, z, y, STEP, this.height());
          p.set(x, g > y && g - y < STEP ? g : y, z); this.vel.y = Math.min(this.vel.y, 0);
          return;
        }
      }
    }
    for (let k = 1; k <= 10; k++) {
      const y = p.y + k * 0.45;
      if (w.groundProbe(p.x, p.z, y, STEP, this.height()) !== Infinity && !this.boxAt(p.x, y, p.z)) { p.y = Math.max(y, w.groundUnder(p.x, y, p.z)); this.vel.y = 0; return; }
    }
    p.y += 0.45;
  }
  // a horizontal move: blocks stop it (or are stepped onto when barely higher), smooth ground is climbed
  stepH(a, d) {
    if (d === 0) return false;
    const p = this.pos, ox = p.x, oy = p.y, oz = p.z, w = this.g.world;
    let hit = this.moveAxis(a, d);
    if (hit && (this.onGround || this.wasGround)) {
      // something whose top is just above the feet (a stair, a floor, a block half sunk in the ground): step onto it
      const nx = a === 0 ? ox + d : ox, nz = a === 2 ? oz + d : oz;
      const B = w.boxes(nx - PW, oy, nz - PW, nx + PW, oy + 0.72, nz + PW, this._bx || (this._bx = []));
      let top = -Infinity;
      for (const b of B) top = Math.max(top, b[4]);
      if (top - oy > 0 && top - oy <= 0.72 && !this.boxAt(nx, top + 0.001, nz)) {
        p.x = nx; p.z = nz; p.y = top + 0.001; hit = false;
        this.eyeLag = Math.min(0.72, this.eyeLag + (top - oy));     // the view follows the step up smoothly
      }
    }
    if (this.terrainBlocked()) { p.x = ox; p.y = oy; p.z = oz; return true; }
    const f = w.groundProbe(p.x, p.z, p.y, STEP, this.height());
    if (f > p.y) {
      if (this.boxAt(p.x, f, p.z)) { p.x = ox; p.y = oy; p.z = oz; return true; }
      p.y = f;
      if (this.vel.y < 0) this.vel.y = 0;
      this.onGround = true;
    }
    return hit;
  }
  moveAxis(a, d) {
    if (d === 0) return false;
    const p = this.pos, e = 1e-4, h = this.height(), w = this.g.world;
    const orig = a === 0 ? p.x : a === 1 ? p.y : p.z;
    if (a === 0) p.x += d; else if (a === 1) p.y += d; else p.z += d;
    const B = w.boxes(p.x - PW, p.y, p.z - PW, p.x + PW, p.y + h, p.z + PW, this._bx || (this._bx = []));
    if (!B.length) return false;
    // back off to the face of whatever was hit
    let lim = d > 0 ? Infinity : -Infinity;
    for (const b of B) lim = d > 0 ? Math.min(lim, b[a]) : Math.max(lim, b[a + 3]);
    if (a === 0) p.x = d > 0 ? lim - PW - e : lim + PW + e;
    else if (a === 1) p.y = d > 0 ? lim - h - e : lim + e;
    else p.z = d > 0 ? lim - PW - e : lim + PW + e;
    if ((a === 0 ? p.x - orig : a === 1 ? p.y - orig : p.z - orig) * d < 0 || this.collides()) { if (a === 0) p.x = orig; else if (a === 1) p.y = orig; else p.z = orig; }
    return true;
  }
  // climb whatever is in front, if its top is within reach and there is room to stand up there
  tryMantle(maxRise) {
    if (this.mantle || this.inWater) return false;
    const p = this.pos, w = this.g.world;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const ax = p.x + fx * (PW + 0.55), az = p.z + fz * (PW + 0.55);
    const top = w.groundUnder(ax, p.y + maxRise, az);
    const rise = top - p.y;
    if (rise < 0.4 || rise > maxRise) return false;
    if (w.groundProbe(ax, az, top, 0.06, PH) === Infinity || this.boxAt(ax, top + 0.002, az)) return false;
    if (this.boxAt(p.x, top + 0.002, p.z) && this.boxAt(p.x, Math.min(top, p.y + 1.2), p.z)) return false;
    this.mantle = { t: 0, x0: p.x, y0: p.y, z0: p.z, x1: ax, y1: top + 0.002, z1: az, dur: 0.2 + rise * 0.11 };
    this.vel.set(0, 0, 0);
    this.slide = 0;
    this.g.onMantle(rise);
    return true;
  }
  updateMantle(dt) {
    const M = this.mantle, p = this.pos;
    M.t += dt;
    const k = Math.min(1, M.t / M.dur);
    const ky = ease(Math.min(1, k / 0.72)), kx = ease(Math.max(0, (k - 0.3) / 0.7));
    p.set(M.x0 + (M.x1 - M.x0) * kx, M.y0 + (M.y1 - M.y0) * ky, M.z0 + (M.z1 - M.z0) * kx);
    if (k >= 1) {
      this.mantle = null;
      this.onGround = true;
      this.vel.set(-Math.sin(this.yaw) * 2.2, 0, -Math.cos(this.yaw) * 2.2);
    }
  }
  canStepUp(mx, mz) {
    const w = this.g.world, l = Math.hypot(mx, mz) || 1;
    const bx = Math.floor(this.pos.x + (mx / l) * (PW + 0.35)), bz = Math.floor(this.pos.z + (mz / l) * (PW + 0.35)), by = Math.floor(this.pos.y + 0.01);
    const c = (x, y, z) => CRISP[w.get(x, y, z)] === 1;
    return c(bx, by, bz) && !c(bx, by + 1, bz) && !c(bx, by + 2, bz) && !c(Math.floor(this.pos.x), by + 2, Math.floor(this.pos.z));
  }

  updateFoot(dt, input) {
    const G = this.g, w = G.world, p = this.pos;
    const startX = p.x, startZ = p.z, startY = p.y;
    this.cramped = this.crouch && !this.headroom(1.32);
    this.eyeH += ((this.slide > 0 ? 0.92 : this.crouch ? (this.cramped ? CRAWL_EYE : CROUCH_EYE) : EYE) - this.eyeH) * Math.min(1, dt * 12);
    this.landDip = Math.max(0, this.landDip - dt * 1.6);
    this.eyeLag = Math.max(0, this.eyeLag - dt * 5);
    if (this.mantle) { this.updateMantle(dt); this.moving = false; return; }
    const wy = WATER_Y + waveHeight(p.x, p.z, G.waveTime);
    this.inWater = p.y + 0.95 < wy && !w.dryColumn(Math.floor(p.x), Math.floor(p.z));
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const fwdX = -sy, fwdZ = -cy;
    const hs = Math.hypot(this.vel.x, this.vel.z);
    // slide: sprinting, press C. Keeps your speed, speeds up downhill, slips under low things.
    this.slideCD -= dt;
    // C: a slide when you're sprinting, otherwise crouch (sneak, and you won't walk off an edge)
    const cPress = input.take('slide') || input.take('crouch');
    if (this.inWater && this.crouch) this.crouch = false;
    if (this.crouch && ((input.sprint && input.move.y > 0.3) || (input.jumpHeld && this.onGround))) this.setCrouch(false);
    if (cPress && !(this.onGround && !this.inWater && hs > 4.6 && this.slideCD <= 0 && this.slide <= 0 && !this.crouch)) {
      if (!this.setCrouch(!this.crouch)) G.ui.pickup('No room to stand');
    } else if (cPress) {
      this.crouch = false;
      const k = Math.max(hs, 8.6) / (hs || 1);
      this.vel.x *= k; this.vel.z *= k;
      this.slide = 1.15; this.slideCD = 0.6;
      G.onSlide();
    }
    let mx, mz;
    if (this.slide > 0) {
      this.slide -= dt;
      // the ground's tilt along the slide speeds it up or slows it down
      const dx = this.vel.x / (hs || 1), dz = this.vel.z / (hs || 1);
      const ga = w.groundUnder(p.x + dx * 0.6, p.y + 0.8, p.z + dz * 0.6), gb = w.groundUnder(p.x - dx * 0.6, p.y + 0.8, p.z - dz * 0.6);
      const slope = Math.max(-1, Math.min(1, (ga - gb) / 1.2));
      let sp = hs - (5.2 + slope * 14) * dt;
      // steer a little toward the stick
      const ix = (-sy * input.move.y + cy * input.move.x), iz = (-cy * input.move.y - sy * input.move.x);
      let vx = dx + ix * dt * 1.4, vz = dz + iz * dt * 1.4;
      const vl = Math.hypot(vx, vz) || 1;
      if (sp < 3.6 || !this.onGround && this.airT > 0.35) this.slide = 0;
      sp = Math.max(0, Math.min(14, sp));
      this.vel.x = (vx / vl) * sp; this.vel.z = (vz / vl) * sp;
      if (slope < -0.05) this.slide = Math.max(this.slide, 0.25);     // downhill: the slide keeps going
      mx = this.vel.x; mz = this.vel.z;
    } else {
      const speed = this.inWater ? 3.2 : this.crouch ? (this.cramped ? 1.7 : 2.3) : input.sprint ? 6.3 : 4.5;
      mx = (-sy * input.move.y + cy * input.move.x) * speed;
      mz = (-cy * input.move.y - sy * input.move.x) * speed;
      if (this.onGround || this.inWater) {
        this.vel.x += (mx - this.vel.x) * Math.min(1, 14 * dt);
        this.vel.z += (mz - this.vel.z) * Math.min(1, 14 * dt);
        // crouched: stop at an edge instead of walking off it
        if (this.crouch && this.onGround && !this.inWater) {
          const g0 = p.y - 0.62;
          if (Math.abs(this.vel.x) > 0.01 && w.groundUnder(p.x + Math.sign(this.vel.x) * (Math.abs(this.vel.x) * dt + 0.05), p.y + 0.3, p.z) < g0) this.vel.x = 0;
          if (Math.abs(this.vel.z) > 0.01 && w.groundUnder(p.x, p.y + 0.3, p.z + Math.sign(this.vel.z) * (Math.abs(this.vel.z) * dt + 0.05)) < g0) this.vel.z = 0;
        }
      } else {
        // in the air: steer, but never bleed off the speed a slide, a blast or the hook gave you
        const wl = Math.hypot(mx, mz);
        if (wl > 0.01) {
          const ux = mx / wl, uz = mz / wl, add = Math.min(wl - (this.vel.x * ux + this.vel.z * uz), 13 * dt);
          if (add > 0) { this.vel.x += ux * add; this.vel.z += uz * add; }
        }
        const f = Math.max(0, 1 - (this.hooked ? 0.05 : 0.18) * dt);
        this.vel.x *= f; this.vel.z *= f;
      }
    }
    let jumped = false;
    if (this.inWater) {
      const target = wy - 1.3;
      this.vel.y += ((target - p.y) * 10 - this.vel.y * 3) * dt;
      if (input.jumpHeld) this.vel.y = Math.max(this.vel.y, 2.4);
    } else {
      this.vel.y -= GRAV * dt * (this.hooked ? 0.35 : 1);
      if (input.jumpHeld && this.onGround && !this.hooked) {
        this.vel.y = JUMP; this.onGround = false; jumped = true;
        if (this.slide > 0) { this.slide = 0; this.vel.x *= 1.08; this.vel.z *= 1.08; }   // a slide-jump keeps the speed
      }
    }
    this.vel.y = Math.max(this.vel.y, -40);
    const maxV = Math.max(Math.abs(this.vel.x), Math.abs(this.vel.y), Math.abs(this.vel.z));
    const steps = Math.max(1, Math.ceil((maxV * dt) / 0.25));
    const h = dt / steps;
    let hitH = false;
    const wasGround = this.onGround;
    this.wasGround = wasGround && this.vel.y <= 0.01;
    const vy0 = this.vel.y;
    this.onGround = false;
    for (let s = 0; s < steps; s++) {
      if (this.stepH(0, this.vel.x * h)) { hitH = true; this.vel.x = 0; }
      if (this.stepH(2, this.vel.z * h)) { hitH = true; this.vel.z = 0; }
      this.pushTrunks();
      const oy = p.y;
      if (this.moveAxis(1, this.vel.y * h)) { if (this.vel.y < 0) this.onGround = true; this.vel.y = 0; }
      const f = w.groundProbe(p.x, p.z, p.y, STEP, this.height());
      if (f === Infinity) {
        if (this.vel.y > 0) { p.y = oy; this.vel.y = 0; }
        else this.unstick();
      } else if (p.y <= f + 1e-3 && this.vel.y <= 0.01) { p.y = f; this.vel.y = 0; this.onGround = true; }
    }
    // walking down a slope: keep the feet on it instead of skipping off
    if (wasGround && !jumped && !this.onGround && !this.inWater && this.vel.y <= 0) {
      const g = w.groundUnder(p.x, p.y, p.z);
      const gap = p.y - g;
      if (gap > 0 && gap < 0.6 && !this.boxAt(p.x, g, p.z)) { p.y = g; this.onGround = true; this.vel.y = 0; }
    }
    // landings you feel
    if (this.onGround && !wasGround) {
      if (vy0 < -9) { this.landDip = Math.min(0.42, (-vy0 - 9) * 0.035 + 0.08); G.onLand(-vy0); }
    }
    this.airT = this.onGround || this.inWater ? 0 : this.airT + dt;
    // hauled into a wall by the hook: climb it toward the line
    if (this.hooked && hitH && !this.mantle) { if (!this.tryMantle(2.05)) this.vel.y = Math.max(this.vel.y, 7); }
    const wantsOn = input.move.y > 0.35 && !this.inWater;
    if (hitH && wantsOn) {
      // mantle: with jump held, ledges up to two blocks; at a run or on touch, a block's height
      if (!((input.jumpHeld || this.airT > 0.05) && this.tryMantle(2.05)) && (input.sprint || G.autoJump || this.slide > 0)) this.tryMantle(1.08);
    }
    if (hitH && Math.abs(mx) + Math.abs(mz) > 0.5 && !this.mantle) {
      if (this.inWater) this.vel.y = 6.4;
      else if ((this.onGround || wasGround) && G.autoJump && this.canStepUp(mx, mz)) this.vel.y = JUMP;
    }
    p.x = clamp(p.x, 1, W - 1); p.z = clamp(p.z, 1, D - 1);
    if (p.y < FLOOR - 1) p.y = FLOOR + 1;
    this.moving = Math.abs(mx) + Math.abs(mz) > 0.5 && (this.onGround || this.inWater);
    if (this.moving) this.walkPhase += dt * (this.slide > 0 ? 0 : input.sprint ? 12 : 9);
    for (const s of G.boardable()) {
      if (this.tryBoardLadder(s, input)) break;
      this.blockShipHull(s, startX, startY, startZ);
    }
  }

  // a safe place to stand on the main deck or quarterdeck near (lx, lz)
  deckSpot(lx, lz) {
    let z = clamp(lz, SHIP.bow + 1.7 * SCALE, SHIP.stern - 0.45 * SCALE);
    const F = z > SHIP.qdZ ? SHIP.qd : SHIP.deck;
    // the hatch and the quarterdeck stairs fill the main deck just forward of the quarterdeck: step clear of them
    if (F === SHIP.deck && z > HATCH.z0 - 0.1) z = HATCH.z0 - 0.2;
    const m = hullHalfAt(z, F + 1.0) - 0.7;
    let x = clamp(lx, -m, m);
    if (F === SHIP.deck && z > HATCH.z0 - 0.3 && z < HATCH.z1 + 0.3 && Math.abs(x) < HATCH.x1 + 0.35) x = (x < 0 ? -1 : 1) * (HATCH.x1 + 0.35);
    // not inside a gun carriage, the mast or the wheel
    const q = { x, z };
    for (let k = 0; k < 2; k++) for (const [ox, oz, r, y0, y1] of OBST) if (F > y0 - 0.6 && F < y1) pushOut(q, ox, oz, r + PW + 0.02);
    const qm = hullHalfAt(q.z, F + 1.0) - 0.7;
    x = clamp(q.x, -qm, qm);
    const f = floorAt(x, q.z, F + 0.1);
    return [x, f > -Infinity ? f : F, q.z];
  }
  tryBoardLadder(ship, input) {
    if (!ship || ship.sinking || this.boardCD > 0 || input.move.y < 0.35) return false;
    const l = ship.toLocal(this.pos.x, this.pos.z, _v);
    const ly = this.pos.y - ship.pos.y;
    for (const ladder of SIDE_LADDERS) {
      if (Math.abs(l.x - ladder.x) > 0.95 || Math.abs(l.z - ladder.z) > 0.8) continue;
      if (ly < ladder.bottom - 0.25 || ly > SHIP.deck + 0.25) continue;
      this.mode = 'deck'; this.climb = true; this.sideLadder = ladder; this.gun = -1; this.ship = ship;
      this.local.set(ladder.x, clamp(ly, ladder.bottom, SHIP.deck), ladder.z);
      this.lvy = 0; this.prevShipHeading = ship.heading;
      this.vel.set(0, 0, 0); this.inWater = false; this.onGround = false;
      this.syncDeckWorld(ship);
      this.g.onBoard(true);
      return true;
    }
    return false;
  }
  blockShipHull(ship, x0, y0, z0) {
    if (!ship || ship.sinking) return;
    const blockedAt = (x, y, z, out) => {
      ship.toLocal(x, z, out);
      if (out.z < SHIP.bow - 0.15 || out.z > SHIP.stern + 0.15) return null;
      const localY = y - ship.pos.y;
      if (localY > railY(out.z) + 0.1) return null;
      const hw = hullHalfAt(out.z, localY + Math.min(this.height() * 0.45, 0.8));
      return hw > 0.2 && Math.abs(out.x) < hw + PW ? { hw, lx: out.x, lz: out.z } : null;
    };
    const hit = blockedAt(this.pos.x, this.pos.y, this.pos.z, _v);
    if (!hit) return;
    const old = blockedAt(x0, y0, z0, this._oldShipLocal || (this._oldShipLocal = new THREE.Vector3()));
    if (!old) {
      this.pos.x = x0; this.pos.z = z0;
    } else {
      const local = this._oldShipLocal;
      const side = Math.sign(hit.lx) || 1;
      const edge = side * (hit.hw + PW + 0.08);
      const c = Math.cos(ship.heading), s = Math.sin(ship.heading);
      this.pos.x = ship.pos.x + edge * c + hit.lz * s;
      this.pos.z = ship.pos.z - edge * s + hit.lz * c;
      if (local.z < SHIP.bow || local.z > SHIP.stern) { this.pos.x = x0; this.pos.z = z0; }
    }
    this.vel.x = 0; this.vel.z = 0;
  }
  checkBoard(ship) {
    if (!ship || ship.sinking || this.boardCD > 0) return;
    const l = ship.toLocal(this.pos.x, this.pos.z, _v);
    if (l.z < SHIP.bow + 0.6 || l.z > SHIP.stern + 0.25) return;
    const hw = halfWidthAt(l.z);
    if (Math.abs(l.x) > hw + 0.35) return;
    const top = ship.pos.y + (l.z > SHIP.qdZ ? SHIP.qd : SHIP.deck);
    if (this.pos.y > top + 0.45) return;
    if (this.pos.y < ship.pos.y - 2.8) return;
    const climbing = this.pos.y < top - 0.3;
    this.mode = 'deck'; this.climb = false; this.gun = -1; this.ship = ship;
    const [x, y, z] = this.deckSpot(l.x, l.z);
    this.local.set(x, y, z);
    this.lvy = 0;
    this.prevShipHeading = ship.heading;
    this.vel.set(0, 0, 0);
    this.inWater = false;
    this.syncDeckWorld(ship);
    this.g.onBoard(climbing);
  }
  // hauled up the side by the grappling hook: straight onto the deck
  forceBoard(ship) {
    const l = ship.toLocal(this.pos.x, this.pos.z, _v);
    const [x, y, z] = this.deckSpot(l.x, l.z);
    this.mode = 'deck'; this.climb = false; this.sideLadder = null; this.gun = -1; this.ship = ship;
    this.local.set(x, y, z);
    this.lvy = 2; this.prevShipHeading = ship.heading;
    this.vel.set(0, 0, 0); this.inWater = false; this.hooked = false;
    this.syncDeckWorld(ship);
    this.g.onBoard(false);
  }
  // Walking the decks: a floor under every step (the hold, the main deck, the stairs, the quarterdeck, the
  // crow's nest), the bulwarks and bulkheads as walls, a ladder up the mast, and the guns to man.
  updateDeck(dt, input) {
    const G = this.g;
    if (this.ship && this.ship !== G.sloop && !G.hollows.includes(this.ship)) { this.leaveShip(null); return; }
    const ship = this.ship || G.sloop;
    if (!ship || ship.sinking) { this.leaveShip(ship); return; }
    const turn = wrapDelta(ship.heading - this.prevShipHeading);
    this.yaw += turn; if (this.emote) this.emote.yaw += turn;
    this.prevShipHeading = ship.heading;
    const L = this.local, jumpPressed = input.jumpHeld && !this.jumpWas;
    this.jumpWas = input.jumpHeld;
    if (input.take('slide') || input.take('crouch')) this.crouch = !this.crouch;
    if (this.crouch && input.sprint && input.move.y > 0.3) this.crouch = false;
    this.eyeH += ((this.crouch ? (L.y < 0.4 * SCALE ? 1.0 : CROUCH_EYE) : L.y < 0.4 * SCALE ? 1.42 : 1.6) - this.eyeH) * Math.min(1, dt * 8);
    if (this.gun >= 0) { this.updateGun(dt, input, ship); this.syncDeckWorld(ship); return; }
    if (this.climb && this.sideLadder) {
      const ladder = this.sideLadder;
      L.x = ladder.x; L.z = ladder.z;
      L.y += clamp(input.move.y, -1, 1) * 3.2 * dt;
      this.moving = Math.abs(input.move.y) > 0.1;
      if (this.moving) this.walkPhase += dt * 8;
      this.onGround = false; this.lvy = 0;
      if (L.y >= SHIP.deck) {
        L.y = SHIP.deck;
        L.x = ladder.side * (halfWidthAt(L.z) - 1.0);
        this.climb = false; this.sideLadder = null; this.onGround = true;
      } else if (L.y <= ladder.bottom) {
        L.y = ladder.bottom;
        this.climb = false; this.sideLadder = null; this.mode = 'foot'; this.ship = null;
        this.pos.set(ship.pos.x + L.x * Math.cos(ship.heading) + L.z * Math.sin(ship.heading), ship.pos.y + L.y, ship.pos.z - L.x * Math.sin(ship.heading) + L.z * Math.cos(ship.heading));
        this.inWater = true; this.onGround = false; this.boardCD = 0.25;
      } else {
        this.syncDeckWorld(ship);
      }
      return;
    }
    if (this.climb) {
      L.x = LADDER.x; L.z = LADDER.z;
      L.y += clamp(input.move.y, -1, 1) * 3.2 * dt;
      this.moving = Math.abs(input.move.y) > 0.1;
      if (this.moving) this.walkPhase += dt * 8;
      this.onGround = false; this.lvy = 0;
      if (L.y <= SHIP.deck) { L.y = SHIP.deck; this.climb = false; }
      else if (L.y >= SHIP.nest) { L.y = SHIP.nest; this.climb = false; L.z = LADDER.z + 0.08; G.onNest(); }
      else if (jumpPressed) this.climb = false;
      this.syncDeckWorld(ship);
      return;
    }
    const speed = this.crouch ? 2.1 : L.y < 0.4 * SCALE ? 3.0 : input.sprint ? 5.0 : 3.8;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const wx = (-sy * input.move.y + cy * input.move.x) * speed, wz = (-cy * input.move.y - sy * input.move.x) * speed;
    const c = Math.cos(ship.heading), s = Math.sin(ship.heading);
    const lvx = wx * c - wz * s, lvz = wx * s + wz * c;
    // stand, jump, fall
    let f = floorAt(L.x, L.z, L.y);
    if (Number.isNaN(f)) f = L.y;
    if (L.y <= f + 1e-3 && f > -Infinity) { L.y = f; this.lvy = input.jumpHeld ? JUMP * 0.92 : 0; }
    this.lvy -= GRAV * dt;
    L.y += this.lvy * dt;
    const ceil = ceilingAt(L.x, L.z, L.y);
    if (L.y + 1.55 > ceil) { L.y = Math.max(f > -Infinity ? f : L.y, ceil - 1.55); if (this.lvy > 0) this.lvy = 0; }
    f = floorAt(L.x, L.z, L.y);
    if (f > -Infinity && L.y < f) { L.y = f; this.lvy = 0; }
    if (!(f > -Infinity) && L.y < SHIP.low - 1) { this.leaveShip(ship); return; }
    // wedged inside something (under the stairs, in a carriage): out to the nearest clear spot
    if (Number.isNaN(floorAt(L.x, L.z, L.y)) && this.onGround) { const [x, y, z] = this.deckSpot(L.x, L.z); L.set(x, y, z); }
    // walk, one axis at a time so walls are slid along
    const step = (nx, nz) => {
      const g = floorAt(nx, nz, L.y);
      if (Number.isNaN(g)) return 0;
      if (g === -Infinity) {
        // the ship's side: over the rail if you're up high enough, otherwise it's in the way
        const rail = railY(clamp(nz, SHIP.bow, SHIP.stern));
        if (L.y > SHIP.deck + 0.2 && L.y > rail - 0.45) { L.x = nx; L.z = nz; return 2; }
        return 0;
      }
      L.x = nx; L.z = nz; return 1;
    };
    if (step(L.x + lvx * dt, L.z) === 2 || step(L.x, L.z + lvz * dt) === 2) { this.syncDeckWorld(ship); this.leaveShip(ship); return; }
    for (const [ox, oz, r, y0, y1] of OBST) if (L.y > y0 - 0.6 && L.y < y1) pushOut(L, ox, oz, r + PW);
    f = floorAt(L.x, L.z, L.y);
    this.syncDeckWorld(ship);
    this.onGround = f > -Infinity && L.y <= f + 0.02;
    this.inWater = false;
    this.moving = Math.hypot(input.move.x, input.move.y) > 0.1 && this.onGround;
    if (this.moving) this.walkPhase += dt * 9;
  }
  // manning a gun: you stand behind it and aim it where you look
  updateGun(dt, input, ship) {
    const g = GUNS[this.gun], p = gunPlace(g), L = this.local;
    L.set(p.stand, g.y, g.z);
    this.lvy = 0; this.onGround = true; this.moving = false; this.inWater = false;
    const out = ship.heading + (g.side > 0 ? -Math.PI / 2 : Math.PI / 2);
    const rel = clamp(wrapDelta(this.yaw - out), -0.7, 0.7);
    this.yaw = out + rel;
    this.pitch = clamp(this.pitch, -0.28, 0.5);
    ship.gunAim[this.gun][0] = rel; ship.gunAim[this.gun][1] = this.pitch;
  }
  updateHelm(dt, input) {
    const G = this.g, ship = G.sloop;
    if (!ship || ship.sinking) { this.leaveShip(ship); return; }
    this.local.set(HELM.x, SHIP.qd, HELM.z);
    this.climb = false; this.gun = -1;
    this.syncDeckWorld(ship);
    this.inWater = false; this.onGround = true;
    this.yaw = ship.heading; this.pitch = -0.08;
    this.prevShipHeading = ship.heading;
    const r = clamp(input.move.x, -1, 1);
    ship.rudder += (r - ship.rudder) * Math.min(1, dt * (Math.abs(r) > 0.05 ? 3 : 1.6));
    ship.sailLvl = clamp(ship.sailLvl + input.move.y * dt * 0.75, 0, 1);
    ship.reverse = input.move.y < -0.5 && ship.sailLvl <= 0.001;
    G.helmYaw -= input.lookDX * G.sens;
    G.helmPitch = clamp(G.helmPitch - input.lookDY * G.sensY, -0.1, 0.95);
    this.moving = false;
  }

  syncDeckWorld(ship) {
    const c = Math.cos(ship.heading), s = Math.sin(ship.heading);
    this.pos.x = ship.pos.x + this.local.x * c + this.local.z * s;
    this.pos.z = ship.pos.z - this.local.x * s + this.local.z * c;
    this.pos.y = ship.pos.y + this.local.y;
  }

  leaveShip(ship) {
    const wasHelm = this.mode === 'helm';
    this.climb = false; this.sideLadder = null; this.gun = -1;
    this.mode = 'foot'; this.ship = null;
    this.boardCD = 1.0;
    if (ship) {
      const f = ship.forward(_v);
      const c = Math.cos(ship.heading), s = Math.sin(ship.heading);
      const side = this.local.x >= 0 ? 1 : -1;
      this.vel.set(f.x * ship.speed + c * side * 2, Math.max(this.lvy, 2), f.z * ship.speed - s * side * 2);
      if (wasHelm) ship.sailLvl = 0;
    }
    this.g.onLeaveShip();
  }

  updateSurvival(dt, input) {
    const drain = 0.12 + (input.sprint && this.mode === 'foot' && this.moving ? 0.12 : 0) + (this.inWater ? 0.1 : 0);
    this.hunger = Math.max(0, this.hunger - drain * dt);
    if (this.hunger <= 0) this.hurt(dt * 1.2, null, true);
    else if (this.hunger > 55 && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + dt * 0.9);
  }

  get animState() {
    if (!this.alive) return 'dead';
    if (this.mode === 'helm') return 'helm';
    if (this.mantle) return 'climb';
    if (this.slide > 0 && this.mode === 'foot') return 'slide';
    if (this.inWater) return 'swim';
    if (this.mode === 'foot' && !this.onGround) return 'air';
    if (this.mode === 'deck' && this.climb) return 'climb';
    if (this.mode === 'deck' && this.gun >= 0) return 'idle';
    if (this.mode === 'deck' && !this.onGround) return 'air';
    if (this.emote) return this.emote.id;
    if (this.crouch) return this.cramped && this.mode === 'foot' ? (this.moving ? 'creep' : 'crawl') : this.moving ? 'sneak' : 'crouch';
    if (this.moving) return this.g.input.sprint ? 'run' : 'walk';
    return 'idle';
  }
  hurt(n, dir, silent) {
    if (!this.alive) return;
    this.hp -= n;
    if (!silent) {
      this.g.onPlayerHurt(n);
      if (dir && this.mode === 'foot') { this.vel.x += dir.x * 6; this.vel.z += dir.z * 6; this.vel.y = Math.max(this.vel.y, 4); }
    }
    if (this.hp <= 0) { this.hp = 0; this.alive = false; this.g.onPlayerDeath(); }
  }
}

function wrapDelta(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }
