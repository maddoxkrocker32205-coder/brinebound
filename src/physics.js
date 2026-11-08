// Things that move like things. Debris that tumbles, bounces, floats and settles; trees that topple when
// their trunk is cut; buildings that come down when nothing holds them up any more; powder kegs that blow
// holes in all of it. In the spirit of The Finals: the world is something you can knock apart.
import * as THREE from 'three';
import { W, D, H, FLOOR, WATER_Y, B, BLOCKS } from './config.js';
import { TERRAIN, LEAFY, WOODY, CRISP, HARD, PIECE } from './world.js';
import { pieceMat } from './pieces.js';
import { waveHeight } from './water.js';

const GRAV = 22, MAXD = 520, MAXP = 80;
const N6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
// palm trunks climb diagonally: a trunk cell also touches the trunk cells a step up or down and to the side
const NDIAG = [[1, 1, 0], [-1, 1, 0], [0, 1, 1], [0, 1, -1], [1, -1, 0], [-1, -1, 0], [0, -1, 1], [0, -1, -1]];
const idx = (x, y, z) => x + W * (z + D * y);
const cx = (i) => i % W, cy = (i) => Math.floor(i / (W * D)), cz = (i) => Math.floor(i / W) % D;
const rnd = (a = 1) => (Math.random() - 0.5) * 2 * a;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _s = new THREE.Vector3(), _p = new THREE.Vector3(), _v = new THREE.Vector3(), _a = new THREE.Vector3(), _r = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const AXES = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];

// how each kind of debris behaves: bounciness, grip on the ground, whether it floats, how long it lasts
const KIND = {
  wood: { bounce: 0.34, fric: 0.62, float: true, life: 11, shape: 0 },
  stone: { bounce: 0.2, fric: 0.5, float: false, life: 9, shape: 1 },
  soil: { bounce: 0.05, fric: 0.3, float: false, life: 3.5, shape: 1 },
  leaf: { bounce: 0.02, fric: 0.3, float: true, life: 4.5, shape: 0, drag: 2.8 },
  bone: { bounce: 0.4, fric: 0.6, float: true, life: 14, shape: 0 },
};
export function kindOf(id) {
  const d = BLOCKS[id] || {};
  if (id === B.BONE) return 'bone';
  if (PIECE[id]) return pieceMat(id) ? 'stone' : 'wood';
  if (LEAFY[id] || id === B.FROND || d.plant) return 'leaf';
  if (id === B.GRASS || id === B.DIRT || id === B.SAND || id === B.MARK || id === B.ASH) return 'soil';
  if (WOODY[id] || d.cls === 'wood') return 'wood';
  return 'stone';
}

// a soft, lumpy puff for smoke, dust and fire
function puffTexture() {
  const N = 64, c = document.createElement('canvas'); c.width = c.height = N;
  const x = c.getContext('2d');
  for (let k = 0; k < 8; k++) {
    const a = k * 2.39996, d = k ? 6 + (k % 3) * 2.5 : 0;
    const px = N / 2 + Math.cos(a) * d, py = N / 2 + Math.sin(a) * d, rad = k ? 13 + (k % 2) * 4 : 21;
    const g = x.createRadialGradient(px, py, 0, px, py, rad);
    g.addColorStop(0, 'rgba(255,255,255,0.5)'); g.addColorStop(0.55, 'rgba(255,255,255,0.2)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, N, N);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------- loose bits
class Debris {
  constructor(G) {
    this.g = G; this.list = [];
    const box = new THREE.BoxGeometry(1, 1, 1);
    const rock = new THREE.IcosahedronGeometry(0.56, 0);
    const mats = [new THREE.MeshLambertMaterial({ color: 0xffffff }), new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true })];
    this.meshes = [box, rock].map((geo, k) => {
      const m = new THREE.InstancedMesh(geo, mats[k], MAXD);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAXD * 3), 3);
      m.instanceColor.setUsage(THREE.DynamicDrawUsage);
      m.count = 0; m.frustumCulled = false;
      m.castShadow = true; m.receiveShadow = true;
      G.scene.add(m);
      return m;
    });
  }
  setShadows(on) { for (const m of this.meshes) { m.castShadow = on; m.receiveShadow = on; } }
  clear() { this.list.length = 0; this.render(); }
  // size: [sx, sy, sz]; q: an orientation to start from (else random)
  spawn(x, y, z, vx, vy, vz, sx, sy, sz, hex, kind, o = {}) {
    const K = KIND[kind] || KIND.stone;
    if (this.list.length >= MAXD) this.list.splice(0, 8);
    const d = {
      x, y, z, vx, vy, vz, sx, sy, sz, K, r: 0.5 * Math.min(sx, sy, sz),
      q: new THREE.Quaternion(), wx: rnd(o.spin ?? 7), wy: rnd(o.spin ?? 7), wz: rnd(o.spin ?? 7),
      col: new THREE.Color(hex).multiplyScalar(0.82 + Math.random() * 0.3),
      life: (o.life || K.life) * (0.75 + Math.random() * 0.5), sleep: false, still: 0, inW: false, wake: 0,
      shape: o.shape ?? K.shape, big: !!o.big, kind,
    };
    if (o.q) d.q.copy(o.q); else d.q.setFromAxisAngle(_a.set(rnd(), rnd(), rnd()).normalize(), Math.random() * 6.28);
    this.list.push(d);
    return d;
  }
  update(dt) {
    const G = this.g, w = G.world, wt = G.waveTime, L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const d = L[i];
      d.life -= dt;
      if (d.life <= 0) { L.splice(i, 1); continue; }
      if (d.sleep) {
        d.wake -= dt;
        if (d.wake <= 0) { d.wake = 0.4 + Math.random() * 0.3; if (w.groundUnder(d.x, d.y, d.z) < d.y - d.r - 0.3) { d.sleep = false; d.still = 0; } }
        continue;
      }
      this.step(d, dt, w, wt);
    }
  }
  step(d, dt, w, wt) {
    const K = d.K, G = this.g;
    const wy = WATER_Y + waveHeight(d.x, d.z, wt);
    const inW = d.y < wy;
    if (inW && !d.inW && d.vy < -3) G.particles.burst(d.x, wy + 0.1, d.z, 0xe6f4f7, 3, 0.8, 2.2, 12, 0.5, 0.2);
    d.inW = inW;
    if (inW) {
      const f = Math.max(0, 1 - 2.2 * dt); d.vx *= f; d.vz *= f;
      if (K.float) { d.vy += ((wy - 0.06 - d.y) * 30 - d.vy * 4) * dt; d.wx *= 0.97; d.wy *= 0.97; d.wz *= 0.97; }
      else { d.vy -= GRAV * 0.2 * dt; d.vy = Math.max(d.vy * Math.max(0, 1 - 3 * dt), -1.8); }
    } else {
      d.vy -= GRAV * dt;
      if (K.drag) {
        const f = Math.max(0, 1 - K.drag * dt); d.vx *= f; d.vz *= f;
        if (d.vy < -2.6) d.vy = -2.6;
        d.vx += Math.sin(d.life * 6 + d.sx * 50) * dt * 3; d.vz += Math.cos(d.life * 5 + d.sz * 40) * dt * 3;
      }
    }
    let nx = d.x + d.vx * dt, ny = d.y + d.vy * dt, nz = d.z + d.vz * dt;
    d.r = this.upHalf(d);
    let g = w.groundUnder(nx, ny + d.r + 0.2, nz);
    // a block or a steep bank in the way: knock back off it
    if (g > ny + d.r + 0.45 || CRISP[w.get(Math.floor(nx), Math.floor(ny), Math.floor(nz))]) {
      d.vx *= -0.3; d.vz *= -0.3; nx = d.x; nz = d.z;
      g = w.groundUnder(nx, ny + d.r + 0.2, nz);
    }
    let ground = false;
    if (ny - d.r < g) {
      ny = g + d.r;
      if (d.vy < 0) {
        const hit = -d.vy;
        d.vy = hit > 1.8 ? hit * K.bounce : 0;
        d.vx *= K.fric; d.vz *= K.fric;
        if (hit > 2) { d.wx *= 0.55; d.wy *= 0.55; d.wz *= 0.55; }
        if (d.big && hit > 6.5) { this.crumble(d); d.life = 0; return; }
        if (hit > 6 && G.physics.clack <= 0 && G.distToListener(d.x, d.z) < 26) { G.physics.clack = 0.07; G.sfx.thud(); }
      }
      ground = true;
    }
    d.x = nx; d.y = ny; d.z = nz;
    if (ground) {
      const f = Math.max(0, 1 - 6 * dt); d.wx *= f; d.wy *= f; d.wz *= f;
      if (d.shape === 0) this.settle(d, Math.min(1, dt * 7));
    }
    const wl = Math.hypot(d.wx, d.wy, d.wz);
    if (wl > 0.02) { _a.set(d.wx / wl, d.wy / wl, d.wz / wl); _q.setFromAxisAngle(_a, wl * dt); d.q.premultiply(_q); }
    const sp = Math.abs(d.vx) + Math.abs(d.vy) + Math.abs(d.vz);
    if (ground && !inW && sp < 0.4) {
      d.still += dt;
      if (d.still > 0.35) { d.sleep = true; d.vx = d.vy = d.vz = 0; d.wx = d.wy = d.wz = 0; d.wake = 0.5; }
    } else d.still = 0;
  }
  // half the piece's extent along world up (exact for a box)
  upHalf(d) {
    _q.copy(d.q).invert(); _v.copy(UP).applyQuaternion(_q);
    return 0.5 * (Math.abs(_v.x) * d.sx + Math.abs(_v.y) * d.sy + Math.abs(_v.z) * d.sz);
  }
  // a box lying on the ground tips over onto its nearest face rather than balancing on an edge
  settle(d, k) {
    let best = 0, bs = 1, bd = -1;
    for (let a = 0; a < 3; a++) {
      _v.copy(AXES[a]).applyQuaternion(d.q);
      const dd = Math.abs(_v.y);
      if (dd > bd) { bd = dd; best = a; bs = _v.y >= 0 ? 1 : -1; }
    }
    if (bd > 0.9995) return;
    _v.copy(AXES[best]).applyQuaternion(d.q).multiplyScalar(bs);
    _q2.setFromUnitVectors(_v, UP).multiply(d.q);
    d.q.slerp(_q2, k);
  }
  // a big falling block that lands hard breaks into a few smaller bits
  crumble(d) {
    const n = 3 + ((Math.random() * 2) | 0);
    for (let k = 0; k < n; k++) {
      const s = d.sx * (0.36 + Math.random() * 0.16);
      this.spawn(d.x + rnd(0.3), d.y + 0.1, d.z + rnd(0.3), d.vx * 0.4 + rnd(2.4), 2 + Math.random() * 3, d.vz * 0.4 + rnd(2.4), s, s * (0.7 + Math.random() * 0.5), s, d.col.getHex(), d.kind === 'soil' ? 'soil' : d.kind);
    }
    this.g.particles.burst(d.x, d.y, d.z, d.col.getHex(), 6, 1.6, 1.6, 12, 0.6, 0.5);
  }
  render() {
    const cnt = [0, 0];
    for (const d of this.list) {
      const m = this.meshes[d.shape], i = cnt[d.shape]++;
      const f = d.life < 1 ? Math.max(0.02, d.life) : 1;
      _p.set(d.x, d.y - (1 - f) * d.r, d.z); _s.set(d.sx * f, d.sy * f, d.sz * f);
      _m.compose(_p, d.q, _s); m.setMatrixAt(i, _m); m.setColorAt(i, d.col);
    }
    for (let k = 0; k < 2; k++) {
      const m = this.meshes[k];
      if (cnt[k] || m.count) { m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; }
      m.count = cnt[k];
    }
  }
}

// ---------------------------------------------------------------- smoke, dust and fire
class Puffs {
  constructor(G) { this.g = G; this.tex = puffTexture(); this.pool = []; this.list = []; }
  add(x, y, z, o = {}) {
    if (this.list.length >= MAXP) { const old = this.list.shift(); this.g.scene.remove(old.s); this.pool.push(old.s); }
    const s = this.pool.pop() || new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthWrite: false }));
    const M = s.material;
    M.blending = o.fire ? THREE.AdditiveBlending : THREE.NormalBlending;
    M.color.setHex(o.color ?? 0xffffff);
    if (!o.fire) M.color.multiplyScalar(this.g.dayLight ? 0.35 + 0.65 * this.g.dayLight() : 1);
    M.opacity = 0; M.rotation = Math.random() * 6.28;
    s.position.set(x, y, z); s.scale.setScalar(o.size || 1);
    s.renderOrder = 4;
    this.g.scene.add(s);
    this.list.push({ s, t: 0, life: o.life || 1.5, size: o.size || 1, grow: o.grow ?? 2, op: o.opacity ?? 0.8, vx: o.vx || 0, vy: o.vy ?? 0.6, vz: o.vz || 0, spin: rnd(0.5) });
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.t += dt;
      const k = p.t / p.life;
      if (k >= 1) { this.g.scene.remove(p.s); this.pool.push(p.s); this.list.splice(i, 1); continue; }
      const f = Math.max(0, 1 - 1.6 * dt);
      p.vx *= f; p.vz *= f; p.vy *= Math.max(0, 1 - 0.8 * dt);
      p.s.position.x += p.vx * dt; p.s.position.y += p.vy * dt; p.s.position.z += p.vz * dt;
      p.s.scale.setScalar(p.size * (1 + p.grow * (1 - (1 - k) * (1 - k))));
      p.s.material.opacity = p.op * (k < 0.1 ? k / 0.1 : Math.pow(1 - (k - 0.1) / 0.9, 1.5));
      p.s.material.rotation += p.spin * dt;
    }
  }
  clear() { for (const p of this.list) { this.g.scene.remove(p.s); this.pool.push(p.s); } this.list = []; }
}

// ---------------------------------------------------------------- the whole system
export class Physics {
  constructor(G) {
    this.g = G;
    this.debris = new Debris(G);
    this.puffs = new Puffs(G);
    this.fallers = [];
    this.kegs = new Map();       // lit powder kegs: cell index -> { t, x, y, z, by }
    this.queue = [];             // emptied cells whose neighbours may have lost their support
    this.later = [];             // [seconds, fn]
    this.flash = new THREE.PointLight(0xffa046, 0, 20, 1.5);
    G.scene.add(this.flash);
    this.flashT = 0; this.flashI = 0; this.flashT0 = 1;
    this.clack = 0;
  }
  clear() {
    this.debris.clear(); this.puffs.clear();
    for (const f of this.fallers) this.drop(f);
    this.fallers = []; this.kegs.clear(); this.queue = []; this.later = [];
  }
  update(dt) {
    const G = this.g, w = G.world;
    this.clack -= dt;
    for (const [i, k] of this.kegs) {
      k.t -= dt;
      if (Math.random() < dt * 40) G.particles.burst(k.x + 0.5 + rnd(0.1), k.y + 1.05, k.z + 0.5 + rnd(0.1), Math.random() < 0.5 ? 0xffd060 : 0xff8a30, 1, 0.9, 2.2, 8, 0.3, 0.05);
      if (k.t > 0) continue;
      this.kegs.delete(i);
      if (w.get(k.x, k.y, k.z) !== B.KEG) continue;
      w.set(k.x, k.y, k.z, B.AIR);
      G.explode(k.x + 0.5, k.y + 0.5, k.z + 0.5, 3.1, false, { keg: true, by: k.by });
    }
    for (let i = this.later.length - 1; i >= 0; i--) { const L = this.later[i]; L[0] -= dt; if (L[0] <= 0) { this.later.splice(i, 1); L[1](); } }
    if (this.queue.length) { if (G.net.inCrew) this.queue = []; else this.runChecks(); }
    for (let i = this.fallers.length - 1; i >= 0; i--) if (!this.stepFaller(this.fallers[i], dt)) this.fallers.splice(i, 1);
    this.debris.update(dt);
    this.debris.render();
    this.puffs.update(dt);
    if (this.flashT > 0) { this.flashT -= dt; this.flash.intensity = Math.max(0, this.flashT / this.flashT0) * this.flashI; }
    else if (this.flash.intensity) this.flash.intensity = 0;
  }

  // ---- bits flying off things
  // a block broken by hand: a few chunks of it pop out
  chips(x, y, z, id, n = 4) {
    const kind = kindOf(id), col = BLOCKS[id].color || 0x888888;
    for (let k = 0; k < n; k++) {
      const s = kind === 'leaf' ? 0.2 : 0.16 + Math.random() * 0.14;
      this.debris.spawn(x + 0.5 + rnd(0.3), y + 0.5 + rnd(0.3), z + 0.5 + rnd(0.3), rnd(2.2), 1.5 + Math.random() * 2.5, rnd(2.2), s, kind === 'leaf' ? 0.04 : s * (0.7 + Math.random() * 0.5), s, col, kind, { life: kind === 'leaf' ? 2.5 : 4 });
    }
  }
  // splinters off a hull that took a hit
  splinters(x, y, z, hex, n = 6, push = 4) {
    for (let k = 0; k < n; k++) {
      const l = 0.35 + Math.random() * 0.5;
      this.debris.spawn(x + rnd(0.3), y + rnd(0.3), z + rnd(0.3), rnd(push), 2 + Math.random() * push, rnd(push), 0.1 + Math.random() * 0.08, 0.06, l, hex, 'wood', { spin: 12 });
    }
  }
  // a skeleton coming apart: bones everywhere
  bones(x, y, z, big) {
    const n = big ? 14 : 9;
    for (let k = 0; k < n; k++) {
      const l = k === 0 ? 0.32 : 0.18 + Math.random() * 0.32, t = k === 0 ? 0.3 : 0.07 + Math.random() * 0.04;
      this.debris.spawn(x + rnd(0.25), y + 0.4 + Math.random() * 1.2, z + rnd(0.25), rnd(2.6), 1.5 + Math.random() * 3.5, rnd(2.6), t, k === 0 ? 0.3 : t, l, 0xe9e1cb, 'bone', { spin: 10 });
    }
  }
  // dust thrown up where something heavy hit the ground
  dust(x, y, z, n = 4, size = 1.4, hex = 0xb9a888) {
    for (let k = 0; k < n; k++) this.puffs.add(x + rnd(size), y + 0.3 + Math.random() * 0.4, z + rnd(size), { color: hex, size: size * (0.7 + Math.random() * 0.5), grow: 1.8, life: 1.6 + Math.random() * 1.2, opacity: 0.45, vx: rnd(1.2), vy: 0.5 + Math.random() * 0.6, vz: rnd(1.2) });
  }
  // The light, fire, smoke and flying bits of an explosion. Reads the world but changes nothing in it.
  blastFx(x, y, z, r, keg) {
    const G = this.g, w = G.world, dist = G.distToListener(x, z);
    G.sfx.explode(dist);
    if (keg) G.sfx.rumble(dist);
    this.flash.position.set(x, y + 0.6, z);
    this.flashI = keg ? 14 : 6; this.flashT = this.flashT0 = keg ? 0.4 : 0.24; this.flash.distance = keg ? 28 : 15;
    const fire = keg ? 8 : 3, smoke = keg ? 10 : 4;
    for (let k = 0; k < fire; k++) this.puffs.add(x + rnd(r * 0.5), y + rnd(r * 0.4) + 0.2, z + rnd(r * 0.5), { fire: true, color: k % 2 ? 0xffb050 : 0xff7a26, size: r * 0.85, grow: 1.3, life: 0.3 + Math.random() * 0.25, opacity: 0.95, vy: 2 });
    for (let k = 0; k < smoke; k++) this.puffs.add(x + rnd(r * 0.6), y + Math.random() * r * 0.5, z + rnd(r * 0.6), { color: 0x6c6763, size: r * 0.75, grow: 2.6, life: 2.4 + Math.random() * 1.8, opacity: 0.6, vx: rnd(1.6), vy: 1.1 + Math.random() * 1.5, vz: rnd(1.6) });
    G.particles.burst(x, y, z, 0xffc060, keg ? 34 : 12, keg ? 8 : 3.5, 4.5, 9, 0.5, 0.4);
    // water nearby: a white column
    if (y < WATER_Y + 1.6 && !w.solid(Math.floor(x), Math.floor(WATER_Y - 0.5), Math.floor(z))) {
      G.particles.burst(x, WATER_Y + 0.2, z, 0xe6f4f7, keg ? 40 : 18, keg ? 2.5 : 1.3, keg ? 9 : 6, 14, 1.1, 0.8);
      for (let k = 0; k < (keg ? 5 : 2); k++) this.puffs.add(x + rnd(r * 0.4), WATER_Y + 0.6 + Math.random() * r, z + rnd(r * 0.4), { color: 0xf2f7f8, size: r * 0.6, grow: 1.6, life: 1.1, opacity: 0.6, vy: 2.5 });
    }
    // chunks of whatever was in the way
    const R = Math.ceil(r), cap = keg ? 80 : 26, speed = keg ? 9 : 5.5;
    let n = 0;
    for (let by = Math.floor(y) - R; by <= Math.floor(y) + R && n < cap; by++) for (let bz = Math.floor(z) - R; bz <= Math.floor(z) + R && n < cap; bz++) for (let bx = Math.floor(x) - R; bx <= Math.floor(x) + R && n < cap; bx++) {
      const id = w.get(bx, by, bz);
      if (!id || by < FLOOR || BLOCKS[id].plant) continue;
      const dx = bx + 0.5 - x, dy = by + 0.5 - y, dz = bz + 0.5 - z, d = Math.hypot(dx, dy, dz);
      if (d > r + 0.4) continue;
      const kind = kindOf(id), col = BLOCKS[id].color || 0x888888;
      if (kind === 'leaf') {
        if (Math.random() < 0.35) this.debris.spawn(bx + 0.5, by + 0.5, bz + 0.5, dx * 3 + rnd(2), 3 + Math.random() * 3, dz * 3 + rnd(2), 0.26, 0.03, 0.26, col, 'leaf');
        G.particles.burst(bx + 0.5, by + 0.5, bz + 0.5, col, 2, 2.5, 2, 6, 0.9, 0.5);
        continue;
      }
      for (let k = 0; k < 2 && n < cap; k++, n++) {
        const s = (keg ? 0.24 : 0.18) + Math.random() * (keg ? 0.26 : 0.16), v = speed * (0.55 + Math.random() * 0.8) / Math.max(0.6, d);
        this.debris.spawn(bx + 0.5 + rnd(0.3), by + 0.5 + rnd(0.3), bz + 0.5 + rnd(0.3), dx * v + rnd(1.5), Math.abs(dy) * v * 0.5 + (keg ? 5 : 3) + Math.random() * 4, dz * v + rnd(1.5), s, s * (0.6 + Math.random() * 0.6), s, col, kind);
      }
    }
    const P = G.player, pd = Math.hypot(P.pos.x - x, P.pos.y - y, P.pos.z - z);
    G.shake(Math.max(0, 1 - pd / (keg ? 45 : 20)) * (keg ? 1.3 : 0.55));
  }
  // the local player thrown by a blast (rocket jumps welcome)
  knock(x, y, z, R, push) {
    const P = this.g.player;
    if (P.mode !== 'foot' || !P.alive) return;
    const dx = P.pos.x - x, dy = P.pos.y + 0.9 - y, dz = P.pos.z - z, d = Math.hypot(dx, dy, dz);
    if (d >= R) return;
    const k = 1 - d / R, l = Math.hypot(dx, dz) || 1;
    P.vel.x += (dx / l) * push * k; P.vel.z += (dz / l) * push * k;
    P.vel.y = Math.max(P.vel.y, push * 0.55 * k + 2.5);
    P.onGround = false; P.slide = 0;
  }

  // ---- powder kegs
  ignite(x, y, z, t = 2.6, by = null) {
    const i = idx(x, y, z), G = this.g;
    if (this.kegs.has(i) || G.world.get(x, y, z) !== B.KEG) return false;
    this.kegs.set(i, { t, x, y, z, by });
    if (t > 1) { G.sfx.fuse(); G.ui.pickup('The fuse is lit. Run!'); }
    return true;
  }
  igniteAround(x, y, z, R) {
    const w = this.g.world, r = Math.ceil(R);
    for (let by = Math.floor(y) - r; by <= Math.floor(y) + r; by++) for (let bz = Math.floor(z) - r; bz <= Math.floor(z) + r; bz++) for (let bx = Math.floor(x) - r; bx <= Math.floor(x) + r; bx++) {
      if (w.get(bx, by, bz) !== B.KEG) continue;
      const d = Math.hypot(bx + 0.5 - x, by + 0.5 - y, bz + 0.5 - z);
      if (d > R) continue;
      const k = this.kegs.get(idx(bx, by, bz));
      if (k) k.t = Math.min(k.t, 0.12 + d * 0.05);
      else this.ignite(bx, by, bz, 0.12 + d * 0.05);
    }
  }

  // ---- what holds things up
  // A cell was emptied: whatever was resting on it gets checked at the end of the step.
  queueCheck(x, y, z, dx = 0, dz = 0, by = null) { this.queue.push({ x, y, z, dx, dz, by }); }
  runChecks() {
    const G = this.g, w = G.world, q = this.queue;
    this.queue = [];
    const ok = new Set(), gone = new Set();
    let n = 0;
    for (const c of q) {
      for (const [dx, dy, dz] of N6.concat(NDIAG)) {
        const x = c.x + dx, y = c.y + dy, z = c.z + dz;
        if (y < FLOOR || y >= H || x < 0 || z < 0 || x >= W || z >= D) continue;
        const i = idx(x, y, z), nid = w.get(x, y, z);
        if (ok.has(i) || gone.has(i) || !HARD[nid] || (dx && dy || dz && dy) && !WOODY[nid]) continue;
        const comp = this.scan(x, y, z, ok);
        if (!comp) continue;
        for (const j of comp) gone.add(j);
        this.fall(comp, c, false);
        if (++n >= 6) return;
      }
    }
  }
  // The connected hard blocks from (x, y, z), or null when anything holds them up: the natural ground,
  // the seabed, a chest or vault (never lost to a collapse), a protected place, or simply too many to fall.
  scan(x, y, z, ok) {
    const G = this.g, w = G.world;
    const sid = w.get(x, y, z);
    if (sid === B.CHEST || sid === B.VAULT) return null;
    const start = idx(x, y, z), seen = new Set([start]), list = [start];
    const held = () => { for (const i of seen) ok.add(i); return null; };
    for (let h = 0; h < list.length; h++) {
      const i = list[h], x0 = cx(i), y0 = cy(i), z0 = cz(i), woody = WOODY[w.data[i]];
      for (const [dx, dy, dz] of woody ? N6.concat(NDIAG) : N6) {
        const nx = x0 + dx, ny = y0 + dy, nz = z0 + dz;
        if (ny < FLOOR) return held();
        if (nx < 0 || nz < 0 || nx >= W || nz >= D || ny >= H) continue;
        const id = w.get(nx, ny, nz), diag = dy !== 0 && (dx !== 0 || dz !== 0);
        if (diag && !WOODY[id]) continue;
        if (TERRAIN[id] || id === B.CHEST || id === B.VAULT) return held();
        if (!HARD[id]) continue;
        const j = idx(nx, ny, nz);
        if (seen.has(j)) continue;
        if (ok.has(j)) return held();
        seen.add(j); list.push(j);
      }
      if (list.length > 900) return held();
    }
    for (const i of list) if (G.isProtected(cx(i), cy(i), cz(i))) return held();
    return list;
  }
  // Leaves, fronds, coconuts and vines hanging off a felled trunk come down with it.
  crownOf(cells) {
    const w = this.g.world, trunk = cells.slice(), have = new Set(cells.map((c) => idx(c.x, c.y, c.z)));
    const minY = Math.min(...trunk.map((c) => c.y)) - 1;
    const near = (x, z) => { let m = 1e9; for (const t of trunk) m = Math.min(m, Math.hypot(x - t.x, z - t.z)); return m; };
    const open = trunk.map((c) => [c.x, c.y, c.z]);
    const out = [];
    while (open.length && out.length < 700) {
      const [x0, y0, z0] = open.pop();
      for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const x = x0 + dx, y = y0 + dy, z = z0 + dz;
        if (y < minY || y >= H) continue;
        const i = idx(x, y, z);
        if (have.has(i)) continue;
        const id = w.get(x, y, z);
        if (!(LEAFY[id] || id === B.FROND || id === B.COCONUT || id === B.VINE)) continue;
        if (near(x, z) > (id === B.FROND ? 5.5 : 4.6)) continue;
        have.add(i); out.push({ x, y, z, id }); open.push([x, y, z]);
      }
    }
    return out;
  }
  // A group of cells with nothing under it comes down: a tree topples from its stump, anything else drops
  // as one piece and breaks apart where it lands. fx: a crew member's copy (no drops, no harm, no blasts).
  fall(comp, cause, fx) {
    const G = this.g, w = G.world;
    const cells = comp.map((i) => ({ x: cx(i), y: cy(i), z: cz(i), id: w.data[i] }));
    const tree = cells.every((c) => WOODY[c.id]);
    const seed = cells[0];
    let dx = cause.dx, dz = cause.dz;
    if (!dx && !dz) { let sx = 0, sz = 0; for (const c of cells) { sx += c.x + 0.5; sz += c.z + 0.5; } dx = sx / cells.length - (cause.x + 0.5); dz = sz / cells.length - (cause.z + 0.5); }
    if (!dx && !dz) { const a = Math.random() * 6.28; dx = Math.cos(a); dz = Math.sin(a); }
    const l = Math.hypot(dx, dz); dx /= l; dz /= l;
    if (!fx && G.net.isHost) G.net.fx(tree ? 'tf' : 'cl', seed.x, seed.y, seed.z, Math.round(dx * 100) / 100, Math.round(dz * 100) / 100);
    const all = tree ? cells.concat(this.crownOf(cells)) : cells;
    // a powder keg in a falling wall still goes off where it lands
    const group = w.buildLoose(all.filter((c) => c.id !== B.KEG || fx));
    for (const c of all) w.set(c.x, c.y, c.z, B.AIR);
    const f = { cells: all, tree, fx: !!fx, by: cause.by || null, t: 0, bounced: false, samples: [] };
    const root = new THREE.Group();
    if (tree) {
      let bx = 0, bz = 0, by = 1e9, n = 0;
      for (const c of cells) by = Math.min(by, c.y);
      for (const c of cells) if (c.y === by) { bx += c.x + 0.5; bz += c.z + 0.5; n++; }
      root.position.set(bx / n, by, bz / n);
      let hy = 0, m = 0;
      for (const c of all) { const k = WOODY[c.id] ? 2 : 0.5; hy += (c.y + 0.5 - by) * k; m += k; }
      f.L = Math.max(2.5, 2 * hy / m);
      f.axis = new THREE.Vector3(dz, 0, -dx);
      f.theta = 0.02; f.omega = 0.3;
      G.sfx.creakBig(G.distToListener(root.position.x, root.position.z));
    } else {
      let sx = 0, sy = 0, sz = 0;
      for (const c of all) { sx += c.x + 0.5; sy += c.y + 0.5; sz += c.z + 0.5; }
      root.position.set(sx / all.length, sy / all.length, sz / all.length);
      f.vel = new THREE.Vector3(dx * 0.6, 0, dz * 0.6);
      f.spin = new THREE.Vector3(dz, 0, -dx).multiplyScalar(0.5 + Math.random() * 0.6 + Math.min(1, 6 / all.length));
      G.sfx.creakBig(G.distToListener(root.position.x, root.position.z));
    }
    f.origin = root.position.clone();
    group.position.set(-f.origin.x, -f.origin.y, -f.origin.z);
    root.add(group);
    G.scene.add(root);
    f.root = root;
    // contact points: spread over the piece; for a tree, not the stump end that stays put
    const step = Math.max(1, Math.floor(all.length / 40));
    for (let i = 0; i < all.length; i += step) {
      const c = all[i];
      const v = new THREE.Vector3(c.x + 0.5, c.y + 0.5, c.z + 0.5).sub(f.origin);
      if (tree && v.length() < 1.6) continue;
      v.pad = LEAFY[c.id] || c.id === B.FROND ? 0.35 : 0.5;
      f.samples.push(v);
    }
    if (!f.samples.length) f.samples.push(new THREE.Vector3(0, 0, 0));
    this.fallers.push(f);
    return f;
  }
  stepFaller(f, dt) {
    const G = this.g, w = G.world, root = f.root;
    f.t += dt;
    if (f.tree) {
      f.omega += ((1.5 * 9.8 / f.L) * Math.sin(f.theta) + 0.2) * dt;
      f.theta += f.omega * dt;
      root.quaternion.setFromAxisAngle(f.axis, f.theta);
    } else {
      f.vel.y -= GRAV * dt;
      root.position.addScaledVector(f.vel, dt);
      const wl = f.spin.length();
      if (wl > 0) { _q.setFromAxisAngle(_a.copy(f.spin).divideScalar(wl), wl * dt); root.quaternion.premultiply(_q); }
    }
    let hit = null;
    for (const s of f.samples) {
      _p.copy(s).applyQuaternion(root.quaternion).add(root.position);
      if (_p.y < WATER_Y - 0.3) { hit = _p.clone(); hit.water = true; break; }
      const g = w.groundUnder(_p.x, _p.y + 1.2, _p.z);
      if (_p.y - s.pad < g || CRISP[w.get(Math.floor(_p.x), Math.floor(_p.y), Math.floor(_p.z))]) { hit = _p.clone(); break; }
    }
    if (!hit && f.tree && f.theta > 1.7) hit = _p.copy(f.samples[f.samples.length - 1]).applyQuaternion(root.quaternion).add(root.position).clone();
    if (!hit && f.t > 7) hit = root.position.clone();
    if (!hit) return true;
    if (f.tree && !f.bounced && f.omega > 1.1 && !hit.water) {
      f.bounced = true; f.omega = -f.omega * 0.18;
      this.dust(hit.x, hit.y, hit.z, 3, 1.4, 0x9a8c6c);
      this.crush(f, 34);
      G.sfx.thud(); G.sfx.crash(G.distToListener(hit.x, hit.z));
      const P = G.player; G.shake(Math.max(0, 1 - Math.hypot(P.pos.x - hit.x, P.pos.z - hit.z) / 30) * 0.5);
      return true;
    }
    this.shatter(f, hit);
    return false;
  }
  // anyone under a falling tree or wall when it comes down
  crush(f, dmg) {
    if (f.fx) return;
    const G = this.g, root = f.root, pts = f.samples.map((s) => s.clone().applyQuaternion(root.quaternion).add(root.position));
    const near = (x, y, z, r) => pts.some((p) => Math.abs(p.x - x) < r && Math.abs(p.z - z) < r && p.y > y - 0.5 && p.y < y + 2.4);
    for (const t of G.targets()) if (t.alive && near(t.x, t.y, t.z, 1.1)) G.hurtTarget(t, dmg, null);
    for (const s of G.enemies.list) if (s.state !== 'dying' && near(s.pos.x, s.pos.y, s.pos.z, 1.2)) s.hurt(dmg * 1.5, null);
    for (const a of G.fauna.list) if (!a.dead && a.pos && near(a.pos.x, a.pos.y, a.pos.z, 1.0)) G.fauna.hurt(a, dmg, null);
  }
  drop(f) {
    this.g.scene.remove(f.root);
    f.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }
  shatter(f, at) {
    const G = this.g, root = f.root, q = root.quaternion;
    this.drop(f);
    this.crush(f, f.tree ? 30 : 26);
    let wood = 0, nuts = 0, spawned = 0, leaves = 0;
    const budget = f.tree ? 150 : 240;
    const w = f.tree ? null : f.spin;
    for (const c of f.cells) {
      _r.set(c.x + 0.5, c.y + 0.5, c.z + 0.5).sub(f.origin).applyQuaternion(q);
      _p.copy(_r).add(root.position);
      // the cell's speed as the piece swung or tumbled
      if (f.tree) _v.copy(f.axis).cross(_r).multiplyScalar(f.omega * 0.35);
      else _v.copy(w).cross(_r).add(f.vel).multiplyScalar(0.45);
      const id = c.id, col = BLOCKS[id].color || 0x888888;
      if (WOODY[id]) {
        wood++;
        for (let k = 0; k < 2; k++) this.debris.spawn(_p.x + rnd(0.2), _p.y + rnd(0.3), _p.z + rnd(0.2), _v.x + rnd(1.2), _v.y + 1 + Math.random() * 2, _v.z + rnd(1.2), 0.36, 0.5 + Math.random() * 0.35, 0.36, col, 'wood', { q, spin: 3 });
        spawned += 2;
      } else if (LEAFY[id] || id === B.FROND || id === B.VINE) {
        leaves++;
        if (Math.random() < 0.22 && spawned < budget) { spawned++; const fr = id === B.FROND; this.debris.spawn(_p.x, _p.y, _p.z, _v.x + rnd(1), _v.y + Math.random() * 1.5, _v.z + rnd(1), fr ? 0.16 : 0.26, 0.03, fr ? 0.55 : 0.26, col, 'leaf'); }
        if (leaves % 3 === 0) G.particles.burst(_p.x, _p.y, _p.z, col, 2, 1.6, 1.4, 6, 0.9, 0.6);
      } else if (id === B.COCONUT) {
        nuts++;
        this.debris.spawn(_p.x, _p.y, _p.z, _v.x + rnd(1.5), _v.y + 1.5, _v.z + rnd(1.5), 0.28, 0.3, 0.28, col, 'wood', { shape: 1, life: 6 });
      } else if (id === B.KEG) {
        if (!f.fx) { const x = _p.x, y = _p.y, z = _p.z; this.later.push([0.08 + Math.random() * 0.2, () => G.explode(x, y, z, 3.1, false, { keg: true })]); }
      } else if (PIECE[id] && spawned < budget) {
        // building pieces come apart into boards and blocks of stone
        const stone = pieceMat(id) === 1;
        for (let k = 0; k < 2; k++) { spawned++; this.debris.spawn(_p.x + rnd(0.3), _p.y + rnd(0.3), _p.z + rnd(0.3), _v.x + rnd(2), _v.y + 0.5 + Math.random() * 2.5, _v.z + rnd(2), stone ? 0.42 : 0.9, stone ? 0.3 : 0.08, stone ? 0.3 : 0.22, col, stone ? 'stone' : 'wood', { q, spin: 5, shape: 0 }); }
      } else if (spawned < budget) {
        spawned++;
        this.debris.spawn(_p.x, _p.y, _p.z, _v.x + rnd(1.6), _v.y + 0.5 + Math.random() * 2, _v.z + rnd(1.6), 0.92, 0.92, 0.92, col, kindOf(id), { q, big: true, spin: 2.5 });
      } else if (spawned < budget + 300 && Math.random() < 0.3) G.particles.burst(_p.x, _p.y, _p.z, col, 3, 2, 2, 12, 0.7, 0.5);
    }
    const d = G.distToListener(at.x, at.z);
    G.sfx.crash(d); G.sfx.rumble(d);
    if (at.water) G.particles.burst(at.x, WATER_Y + 0.2, at.z, 0xe6f4f7, 30, 2.4, 6, 14, 1.0, 1.4);
    else this.dust(at.x, at.y, at.z, f.tree ? 5 : 8, f.tree ? 1.6 : 2.2, f.tree ? 0x9a8c6c : 0xa8a196);
    const P = G.player;
    G.shake(Math.max(0, 1 - Math.hypot(P.pos.x - at.x, P.pos.z - at.z) / 34) * (f.tree ? 0.55 : 0.8));
    if (f.fx || !f.tree) return;
    const items = [];
    if (wood) items.push(['wood', wood]);
    if (nuts) items.push(['coconut', nuts]);
    if (!items.length) return;
    if (f.by) G.net.give(f.by, 0, items);
    else { for (const [it, n] of items) G.give(it, n); G.stats.wood += wood; }
  }
  // a crew member's copy of something the captain's world did
  onFx(e) {
    const G = this.g, w = G.world, kind = e[0];
    const n = (v, a, b) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : null);
    if (kind === 'x') {
      const x = n(e[1], -20, W + 20), y = n(e[2], -10, H + 30), z = n(e[3], -20, D + 20), r = n(e[4], 0.5, 4);
      if (x === null || y === null || z === null || r === null) return;
      this.blastFx(x, y, z, r, e[5] === 1);
      this.knock(x, y, z, r * 2.1, e[5] === 1 ? 12.5 : 6);
      return;
    }
    if (kind === 'tf' || kind === 'cl') {
      const x = n(e[1], 0, W - 1), y = n(e[2], FLOOR, H - 1), z = n(e[3], 0, D - 1), dx = n(e[4], -1, 1) || 0, dz = n(e[5], -1, 1) || 0;
      if (x === null || y === null || z === null || !HARD[w.get(x, y, z)]) return;
      const comp = this.scan(x | 0, y | 0, z | 0, new Set());
      if (comp) this.fall(comp, { x, y: y - 1, z, dx, dz }, true);
    }
  }
}
