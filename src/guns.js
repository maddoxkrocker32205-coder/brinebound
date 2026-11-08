// Firearms: a flintlock pistol, a blunderbuss and a long musket. One ball (or a fistful of shot) per pull of
// the trigger, then a reload. Shots are traced instantly against skeletons, sailors, beasts, tentacles, hulls,
// powder kegs and the ground; a puff of smoke, a flash and a streak of light show where they went.
import * as THREE from 'three';
import { WATER_Y, B, BLOCKS } from './config.js';
import { GeoBuilder } from './geo.js';

export const GUN_DEFS = {
  pistol: { dmg: 26, pellets: 1, spread: 0.014, range: 45, reload: 1.5, kick: 0.6, sound: 'pistol' },
  blunderbuss: { dmg: 10, pellets: 7, spread: 0.085, range: 17, reload: 2.3, kick: 1.1, sound: 'blunder' },
  musket: { dmg: 48, pellets: 1, spread: 0.022, aimSpread: 0.0025, range: 95, reload: 2.6, kick: 0.85, zoom: 34, sound: 'musket' },
};
export const isGun = (item) => !!GUN_DEFS[item];

// Held guns are built around the grip, with the barrel pointing forward along -z.
export function gunGeo(item) {
  const g = new GeoBuilder({ round: 0.009 });
  const wood = '#684326', woodD = '#49301e', iron = '#353a3d', steel = '#62696b', brass = '#b58b49';
  if (item === 'pistol') {
    g.box(-0.035, -0.035, -0.19, 0.035, 0.035, 0.18, wood)
      .box(-0.027, -0.16, -0.005, 0.027, 0.018, 0.105, woodD)
      .box(-0.03, -0.01, -0.2, 0.03, 0.045, -0.08, wood)
      .cyl(0, 0.045, -0.56, 0, 0.045, -0.12, 0.014, 0.023, iron, undefined, 16)
      .cyl(0, 0.045, -0.565, 0, 0.045, -0.535, 0.025, 0.025, steel, undefined, 16)
      .cyl(0, 0.045, -0.135, 0, 0.045, -0.11, 0.025, 0.025, brass, undefined, 16)
      .box(-0.033, 0.038, -0.14, 0.033, 0.05, -0.1, steel)
      .box(-0.039, -0.095, 0.09, 0.039, -0.075, 0.115, brass)
      .box(-0.038, -0.065, -0.1, 0.038, 0.048, -0.075, iron)
      .box(-0.039, -0.065, 0.04, 0.039, 0.045, 0.065, steel)
      .cyl(0.034, 0.03, 0.035, 0.06, 0.055, 0.07, 0.012, 0.01, iron, undefined, 10)
      .cyl(0.04, 0.025, 0.03, 0.025, 0.025, 0.055, 0.009, 0.006, steel, undefined, 10)
      .cyl(0, -0.035, 0.015, 0, -0.072, 0.045, 0.005, 0.004, brass, undefined, 8)
      .cyl(-0.029, -0.035, 0.01, -0.029, -0.115, 0.03, 0.004, 0.003, iron, undefined, 8)
      .cyl(-0.029, -0.115, 0.03, 0.029, -0.115, 0.03, 0.003, 0.003, iron, undefined, 8)
      .cyl(0, -0.16, -0.005, 0, -0.18, 0.105, 0.028, 0.028, woodD, undefined, 10);
  } else if (item === 'blunderbuss') {
    g.box(-0.04, -0.04, -0.3, 0.04, 0.04, 0.24, wood)
      .box(-0.03, -0.17, -0.005, 0.03, 0.015, 0.12, woodD)
      .box(-0.035, -0.015, -0.31, 0.035, 0.05, -0.18, woodD)
      .cyl(0, 0.045, -0.66, 0, 0.045, -0.2, 0.05, 0.025, iron, undefined, 18)
      .cyl(0, 0.045, -0.66, 0, 0.045, -0.6, 0.058, 0.05, steel, undefined, 18)
      .cyl(0, 0.045, -0.61, 0, 0.045, -0.57, 0.058, 0.054, brass, undefined, 18)
      .cyl(0, 0.045, -0.205, 0, 0.045, -0.18, 0.028, 0.028, brass, undefined, 16)
      .box(-0.039, -0.065, -0.12, 0.039, 0.047, -0.09, iron)
      .box(-0.042, -0.06, 0.02, 0.042, 0.045, 0.05, steel)
      .cyl(0.04, 0.025, -0.03, 0.065, 0.055, 0.025, 0.013, 0.01, iron, undefined, 10)
      .cyl(0, -0.04, -0.08, 0, -0.08, -0.03, 0.005, 0.004, brass, undefined, 8)
      .cyl(-0.032, -0.04, -0.08, -0.032, -0.12, -0.04, 0.004, 0.003, iron, undefined, 8)
      .cyl(-0.032, -0.12, -0.04, 0.032, -0.12, -0.04, 0.003, 0.003, iron, undefined, 8)
      .cyl(-0.04, 0.045, -0.42, 0.04, 0.045, -0.42, 0.007, 0.007, brass, undefined, 10);
  } else if (item === 'musket') {
    g.box(-0.042, -0.045, -0.58, 0.042, 0.04, 0.32, wood)
      .box(-0.032, -0.16, -0.12, 0.032, 0.015, 0.17, woodD)
      .box(-0.036, -0.015, -0.57, 0.036, 0.05, -0.36, woodD)
      .cyl(0, 0.05, -1.2, 0, 0.05, -0.25, 0.013, 0.024, iron, undefined, 18)
      .cyl(0, 0.05, -1.2, 0, 0.05, -1.17, 0.028, 0.028, steel, undefined, 18)
      .cyl(0, 0.05, -0.63, 0, 0.05, -0.6, 0.026, 0.026, brass, undefined, 16)
      .cyl(0, 0.05, -0.3, 0, 0.05, -0.27, 0.026, 0.026, brass, undefined, 16)
      .box(-0.038, 0.045, -1.16, 0.038, 0.065, -1.13, brass)
      .box(-0.038, 0.038, -0.28, 0.038, 0.052, -0.24, steel)
      .box(-0.042, -0.065, -0.31, 0.042, 0.045, -0.27, iron)
      .box(-0.044, -0.06, 0.03, 0.044, 0.045, 0.07, steel)
      .cyl(0.043, 0.02, 0.02, 0.068, 0.05, 0.055, 0.013, 0.01, iron, undefined, 10)
      .cyl(0.042, 0.015, 0.015, 0.028, 0.015, 0.045, 0.009, 0.006, steel, undefined, 10)
      .cyl(0, -0.04, -0.1, 0, -0.08, -0.05, 0.005, 0.004, brass, undefined, 8)
      .cyl(-0.035, -0.04, -0.1, -0.035, -0.12, -0.07, 0.004, 0.003, iron, undefined, 8)
      .cyl(-0.035, -0.12, -0.07, 0.035, -0.12, -0.07, 0.003, 0.003, iron, undefined, 8)
      .cyl(0, 0.022, -0.3, 0, 0.022, -0.27, 0.008, 0.008, brass, undefined, 10);
    for (const z of [-0.5, -0.86]) {
      g.cyl(0, 0.05, z, 0, 0.05, z + 0.022, 0.026, 0.026, brass, undefined, 12);
    }
  } else return null;
  return g.build();
}

// Bright streaks that fade in a blink: one per ball or pellet.
export class Tracers {
  constructor(scene) {
    this.scene = scene; this.pool = [];
    this.geo = new THREE.BoxGeometry(1, 1, 1); this.geo.translate(0, 0, -0.5);
    this.mat = new THREE.MeshBasicMaterial({ color: 0xfff1c4, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending });
    // a soft starburst for muzzle flashes
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,250,220,1)'); gr.addColorStop(0.25, 'rgba(255,200,90,0.9)'); gr.addColorStop(0.6, 'rgba(255,120,30,0.25)'); gr.addColorStop(1, 'rgba(255,90,0,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    this.flashTex = new THREE.CanvasTexture(c);
    this.flashes = [];
  }
  flashAt(p, size) {
    let f = this.flashes.find((q) => q.life <= 0);
    if (!f) {
      if (this.flashes.length > 8) return;
      f = { s: new THREE.Sprite(new THREE.SpriteMaterial({ map: this.flashTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })), life: 0 };
      this.scene.add(f.s); this.flashes.push(f);
    }
    f.s.position.copy(p); f.s.scale.setScalar(size); f.s.material.rotation = Math.random() * 6.28;
    f.s.visible = true; f.life = f.max = 0.06; f.size = size;
  }
  add(a, b, w = 0.016) {
    let t = this.pool.find((q) => q.life <= 0);
    if (!t) {
      if (this.pool.length > 24) return;
      t = { mesh: new THREE.Mesh(this.geo, this.mat.clone()), life: 0 };
      t.mesh.frustumCulled = false;
      this.scene.add(t.mesh); this.pool.push(t);
    }
    const len = a.distanceTo(b);
    t.mesh.position.copy(a);
    t.mesh.lookAt(b);
    t.mesh.scale.set(w, w, len);
    t.mesh.visible = true; t.life = t.max = 0.11;
  }
  update(dt) {
    for (const f of this.flashes) {
      if (f.life <= 0) continue;
      f.life -= dt;
      f.s.material.opacity = Math.max(0, f.life / f.max);
      f.s.scale.setScalar(f.size * (1.3 - 0.3 * Math.max(0, f.life / f.max)));
      if (f.life <= 0) f.s.visible = false;
    }
    for (const t of this.pool) {
      if (t.life <= 0) continue;
      t.life -= dt;
      t.mesh.material.opacity = Math.max(0, t.life / t.max) * 0.85;
      if (t.life <= 0) t.mesh.visible = false;
    }
  }
}

const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _p = new THREE.Vector3(), _m = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3();
// a direction within `cone` (radians, roughly) of d
function scatter(d, cone, out) {
  _r.set(d.z, 0, -d.x); if (_r.lengthSq() < 1e-6) _r.set(1, 0, 0); _r.normalize();
  _u.crossVectors(d, _r).normalize();
  const a = Math.random() * Math.PI * 2, k = Math.sqrt(Math.random()) * cone;
  return out.copy(d).addScaledVector(_r, Math.cos(a) * k).addScaledVector(_u, Math.sin(a) * k).normalize();
}

export class Guns {
  constructor(G) { this.g = G; this.cd = {}; this.held = false; this.aim = 0; this.kick = 0; this.tracers = new Tracers(G.scene); this.shotN = 0; }
  reset() { this.cd = {}; this.aim = 0; this.kick = 0; }
  ready(item) { return (this.cd[item] || 0) <= 0; }
  // 0..1: how far through the reload
  reloadFrac(item) { const D = GUN_DEFS[item]; return D && this.cd[item] > 0 ? 1 - this.cd[item] / D.reload : 1; }
  update(dt) {
    for (const k of Object.keys(this.cd)) this.cd[k] = Math.max(0, this.cd[k] - dt);
    this.kick = Math.max(0, this.kick - dt * 5);
    this.tracers.update(dt);
  }
  // the local player's trigger: called each frame while a gun is in hand
  handle(dt, item) {
    const G = this.g, I = G.input, P = G.player, D = GUN_DEFS[item];
    const want = D.zoom && (I.btnHeld.has('place') || I.rightHeld) ? 1 : 0;
    this.aim += (want - this.aim) * Math.min(1, dt * 10);
    const press = I.primaryHeld && !this.held;
    this.held = I.primaryHeld;
    G.ui.setMineProgress(this.cd[item] > 0 ? this.reloadFrac(item) : 0);
    if (!press || !P.alive) return;
    if (!this.ready(item)) return;
    if (!((G.inv.shot || 0) > 0)) { G.ui.pickup('No lead shot. Melt a cannonball into shot at the craft bench (Tab)'); this.cd[item] = 0.4; return; }
    G.inv.shot--;
    this.cd[item] = D.reload;
    this.fire(item);
  }
  muzzle(out) {
    const G = this.g, P = G.player;
    if (G.camMode === 'third' || P.emote) {
      const c = Math.cos(P.yaw), s = Math.sin(P.yaw);
      return out.set(P.pos.x + c * 0.3 - s * 0.7, P.pos.y + 1.45, P.pos.z - s * 0.3 - c * 0.7);
    }
    const { o, d } = G.aimRay();
    _r.set(d.z, 0, -d.x).normalize();
    const side = 0.22 * (1 - this.aim);
    return out.copy(o).addScaledVector(d, 0.85).addScaledVector(_r, -side).add(_u.set(0, -0.12 * (1 - this.aim * 0.6), 0));
  }
  fire(item) {
    const G = this.g, P = G.player, D = GUN_DEFS[item];
    const { o, d } = G.aimRay();
    _o.copy(o); _d.copy(d);
    const m = this.muzzle(_m);
    const spread = D.aimSpread !== undefined ? D.spread + (D.aimSpread - D.spread) * this.aim : D.spread;
    for (let k = 0; k < D.pellets; k++) {
      const dir = scatter(_d, spread, new THREE.Vector3());
      const hit = this.trace(_o, dir, D.range);
      const end = _p.copy(_o).addScaledVector(dir, hit.t);
      if (D.pellets === 1 || k < 4) this.tracers.add(m, end, D.pellets > 1 ? 0.011 : 0.016);
      this.apply(hit, dir, D.dmg, end);
    }
    this.flash(m.x, m.y, m.z, D, _d, true);
    G.sfx.gun && G.sfx.gun(D.sound, 0);
    P.pitch = Math.min(1.5, P.pitch + D.kick * 0.035 * (1 - this.aim * 0.5));
    this.kick = 1; G.shake(0.05 * D.kick);
    this.shotN++;
  }
  flash(x, y, z, D, dir, mine) {
    const G = this.g, big = D.pellets > 1;
    // your own muzzle is right under your nose: a small flash and the smoke a little way out
    this.tracers.flashAt(_p.set(x + dir.x * 0.12, y + dir.y * 0.12, z + dir.z * 0.12), mine ? (big ? 0.42 : 0.3) : big ? 0.9 : 0.7);
    if (!mine) G.particles.burst(x, y, z, 0xffc860, big ? 8 : 5, 2.4, 0.6, 0, 0.12, 0.05);
    const k = mine ? 1.1 : 0.3;
    G.physics.puffs.add(x + dir.x * k, y + dir.y * k, z + dir.z * k, { color: 0xe9e5dc, size: mine ? (big ? 0.42 : 0.3) : big ? 0.75 : 0.5, grow: 1.6, life: 1.4, opacity: mine ? 0.42 : 0.55, vy: 0.35 });
    const F = G.physics.flash;
    if (F) { F.position.set(x, y, z); G.physics.flashI = 3; G.physics.flashT = G.physics.flashT0 = 0.08; F.distance = 9; }
  }
  // the first thing a ball meets along the ray: { t, kind, ... }
  trace(o, d, range) {
    const G = this.g, P = G.player;
    let best = { t: range, kind: 'none' };
    // the ground and blocks, passing through grass, flowers and ferns
    let t0 = 0;
    for (let k = 0; k < 6; k++) {
      const h = G.world.pick(o.x + d.x * t0, o.y + d.y * t0, o.z + d.z * t0, d.x, d.y, d.z, range - t0);
      if (!h) break;
      const id = h.terrain ? 0 : G.world.get(h.x, h.y, h.z);
      if (!h.terrain && BLOCKS[id] && BLOCKS[id].plant) { t0 += h.t + 0.05; continue; }
      if (h.t + t0 < best.t) best = { t: h.t + t0, kind: 'block', hit: h };
      break;
    }
    if (d.y < -1e-4) {
      const tw = (WATER_Y - o.y) / d.y;
      if (tw > 0 && tw < best.t) {
        _p.copy(o).addScaledVector(d, tw);
        if (!G.world.dryColumn(Math.floor(_p.x), Math.floor(_p.z))) best = { t: tw, kind: 'water' };
      }
    }
    const sk = G.enemies.raycast(o, d, best.t);
    if (sk && sk.t < best.t) best = { t: sk.t, kind: 'skel', s: sk.s };
    const sc = G.crews.raycast(o, d, best.t);
    if (sc && sc.t < best.t) best = { t: sc.t, kind: 'sailor', s: sc.s };
    const an = G.fauna.raycast(o, d, best.t);
    if (an && an.t < best.t) best = { t: an.t, kind: 'fauna', a: an.a };
    if (G.kraken && G.kraken.alive && G.kraken.meleeHit) {
      const tn = G.kraken.meleeHit(o, d, best.t);
      if (tn && tn.t < best.t) best = { t: tn.t, kind: 'tentacle', tn: tn.tn };
    }
    const mine = P.mode === 'helm' || P.mode === 'deck' ? P.ship || G.sloop : null;
    for (const s of [G.sloop, ...G.hollows]) {
      if (!s || s.sinking || s === mine) continue;
      if (Math.hypot(s.pos.x - o.x, s.pos.z - o.z) > best.t + 14) continue;
      for (let t = 0.5; t < best.t; t += 0.4) {
        if (s.containsPoint(o.x + d.x * t, o.y + d.y * t, o.z + d.z * t)) { best = { t, kind: 'ship', ship: s }; break; }
      }
    }
    return best;
  }
  apply(hit, d, dmg, at) {
    const G = this.g, crew = G.net.inCrew, dir = { x: d.x, z: d.z };
    const r2 = (v) => Math.round(v * 100) / 100;
    switch (hit.kind) {
      case 'block': {
        const h = hit.hit, id = G.world.get(h.x, h.y, h.z), bd = BLOCKS[id];
        if (id === B.KEG) { G.lightKeg(h.x, h.y, h.z); break; }
        G.particles.burst(at.x, at.y, at.z, (bd && bd.color) || 0x8a7a66, 5, 2.2, 1.8, 14, 0.4, 0.15);
        G.physics.puffs.add(at.x, at.y, at.z, { color: 0xcfc4a8, size: 0.25, grow: 1.2, life: 0.6, opacity: 0.45, vy: 0.3 });
        break;
      }
      case 'water': G.particles.burst(at.x, WATER_Y + 0.1, at.z, 0xe6f4f7, 6, 1.2, 3, 14, 0.5, 0.15); break;
      case 'skel': {
        const s = hit.s;
        if (crew) { s.flash = 1; G.net.req('gs', 's', s.nid, Math.round(dmg), r2(d.x), r2(d.z)); G.particles.burst(at.x, at.y, at.z, 0xe9e1cb, 6, 2, 2, 14, 0.5, 0.3); }
        else { s.lastBy = null; s.hurt(dmg, dir); }
        break;
      }
      case 'sailor': {
        const s = hit.s;
        if (crew) { s.flash = 1; G.net.req('gs', 'c', s.nid, Math.round(dmg), r2(d.x), r2(d.z)); G.particles.burst(at.x, at.y, at.z, 0xb03a2e, 6, 1.8, 2, 14, 0.45, 0.3); }
        else G.crews.hurt(s, dmg, dir);
        break;
      }
      case 'fauna': G.fauna.hurt(hit.a, dmg, dir); break;
      case 'tentacle': {
        const tn = hit.tn;
        if (crew) { tn.flash = 1; G.net.req('gs', 't', tn.netId ?? tn.nid, Math.round(Math.min(dmg, 20))); }
        else tn.damage(Math.min(dmg, 20));
        G.particles.burst(at.x, at.y, at.z, 0x8a3a6a, 6, 2, 2, 12, 0.6, 0.4);
        break;
      }
      case 'ship': {
        const s = hit.ship;
        G.physics.splinters(at.x, at.y, at.z, s.hullHex || 0x6b4426, 3, 2.5);
        if (!crew && s !== G.sloop) { s.damage(Math.max(0.5, dmg * 0.04), G); G.fleet.onHit(s, G.sloop); }
        break;
      }
      default: break;
    }
  }
  // someone else fired: smoke and a flash at their hands, a streak where they were looking
  remoteShot(x, y, z, yaw, pitch, item) {
    const G = this.g, D = GUN_DEFS[item] || GUN_DEFS.pistol;
    const cp = Math.cos(pitch);
    _d.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
    _m.set(x, y, z);
    this.tracers.add(_m, _p.copy(_m).addScaledVector(_d, Math.min(30, D.range)), 0.014);
    this.flash(x, y, z, D, _d);
    G.sfx.gun && G.sfx.gun(D.sound, G.distToListener(x, z));
  }
}
