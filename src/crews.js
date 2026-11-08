// Sailors for the other ships at sea: a helmsman, gunners, deckhands and a lookout keep their posts, and draw
// steel on anyone who comes over the rail. Clear a deck and the ship's strongbox in the hold is yours.
// The captain's game (or a solo game) runs them; a crewmate's game shows puppets of them (see net.js).
import * as THREE from 'three';
import { Avatar } from './character.js';
// Sailors ride their ship's body, which is drawn SCALE times the size-1 plan, so they walk the plan in plan units
// (and are shrunk back to human size); anything from the world comes in divided by the ship's size.
import { SHIP1 as SHIP, HELM1 as HELM, LADDER1 as LADDER, GUNS1 as GUNS, QSTAIRS1 as QSTAIRS, gunPlace1 as gunPlace, floorAt1 as floorAt, halfWidthAt1 as halfWidthAt, deckObstacles1 as deckObstacles } from './ship.js';
import { LOOKS, wrapAngle } from './config.js';
import { mulberry32 } from './noise.js';

const OBST = deckObstacles();
export const CREW_KINDS = ['merchant', 'navy', 'pirate', 'hollow'];
export const CREW_ROLES = ['helm', 'gun', 'hand', 'nest'];
export const CREW_ANIMS = ['idle', 'walk', 'run', 'helm', 'dead', 'crouch'];
export const FACTIONS = {
  merchant: { roles: ['helm', 'hand', 'hand', 'nest'], hp: 32, dmg: 7, speed: 2.7, bounty: 14, coats: ['#7a5b3a', '#4b6b34', '#b88a2c', '#8a7a5a'], hats: ['None', 'Bandana', 'Hood'], noun: 'deckhand', box: [70, 110] },
  navy: { roles: ['helm', 'gun', 'gun', 'gun', 'hand', 'nest'], hp: 56, dmg: 11, speed: 3.0, bounty: 18, coats: ['#253a63', '#2a4272'], hats: ['Bicorne', 'Tricorn'], noun: 'marine', box: [60, 100] },
  pirate: { roles: ['helm', 'gun', 'gun', 'hand', 'nest'], hp: 44, dmg: 10, speed: 3.1, bounty: 16, coats: ['#9c2f2a', '#2b2b2e', '#5f3a5e', '#4b6b34'], hats: ['Bandana', 'Tricorn', 'None'], noun: 'cutthroat', box: [90, 150] },
  hollow: { roles: ['helm', 'gun', 'hand', 'nest'], hp: 36, dmg: 9, speed: 2.6, bounty: 12, coats: ['#3a4a44', '#2e3a36'], hats: ['None', 'Bandana', 'Hood'], skin: '#cfd6c4', noun: 'drowned sailor', box: [50, 90] },
};
// places to stroll between on the main deck
const WANDER = [[-0.9, -2.3], [0.9, -2.0], [0.85, -0.5], [-0.85, -0.3], [0, -3.7], [-0.6, -4.4], [0.6, -4.4]];
const _l = new THREE.Vector3();

export function crewLook(kind, seed) {
  const F = FACTIONS[kind] || FACTIONS.pirate, r = mulberry32(seed * 7919 + 13);
  const pick = (a) => a[(r() * a.length) | 0];
  return {
    skinHex: F.skin || LOOKS.skin[(r() * LOOKS.skin.length) | 0], coatHex: pick(F.coats), hairHex: pick(LOOKS.hair),
    hatName: pick(F.hats), beardName: pick(LOOKS.beard), patch: r() < 0.18, faction: kind,
  };
}
// which deck a ship-local point is on
function level(y, z) {
  if (y > 7) return 'nest';
  if (y < 0.35) return 'hold';
  if (y > 1.75 && z > SHIP.qdZ - 0.25) return 'qd';
  return 'main';
}
function pushOut(p, cx, cz, r) {
  const dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz);
  if (d < r) { if (d < 1e-4) { p.x = cx + r; return; } p.x = cx + (dx / d) * r; p.z = cz + (dz / d) * r; }
}
// world position of a ship-local point (the deck's frame, ignoring the roll)
// a point in the size-1 plan of this ship, in the world
export function shipToWorld(ship, L, out) {
  const c = Math.cos(ship.heading), s = Math.sin(ship.heading), k = ship.size;
  return out.set(ship.pos.x + (L.x * c + L.z * s) * k, ship.pos.y + L.y * k, ship.pos.z + (-L.x * s + L.z * c) * k);
}
function rayBox(o, d, x0, y0, z0, x1, y1, z1) {
  let t0 = 0, t1 = 1e9;
  for (const [oo, dd, a, b] of [[o.x, d.x, x0, x1], [o.y, d.y, y0, y1], [o.z, d.z, z0, z1]]) {
    if (Math.abs(dd) < 1e-9) { if (oo < a || oo > b) return null; continue; }
    let ta = (a - oo) / dd, tb = (b - oo) / dd;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return null;
  }
  return t0;
}

let NID = 0;
export class Crews {
  constructor(G) { this.g = G; this.list = []; this.puppets = new Map(); }
  clear() {
    for (const s of this.list) s.ship.body.remove(s.av.root);
    for (const s of this.puppets.values()) if (s.ship) s.ship.body.remove(s.av.root);
    this.list = []; this.puppets.clear();
  }
  // put a crew aboard a newly spawned ship
  man(ship) {
    if (ship.crew || ship.kind === 'sloop' || this.g.net.isCrew) return;
    const F = FACTIONS[ship.kind];
    if (!F) return;
    ship.crew = []; ship.manned = true; ship.taken = false; ship.looted = false;
    const r = mulberry32(ship.nid * 131 + 7);
    ship.boxGold = Math.round(F.box[0] + r() * (F.box[1] - F.box[0]));
    let gun = 0, hand = 0;
    for (const role of F.roles) {
      const s = this.make(ship, ship.kind, role, ++NID, (ship.nid * 17 + ship.crew.length * 5) % 9973);
      if (role === 'gun') s.gun = [0, 1, 2, 3][gun++ % 4];
      if (role === 'hand') s.wi = (hand++ * 3) % WANDER.length;
      this.post(s, true);
      ship.crew.push(s);
      this.list.push(s);
    }
  }
  make(ship, kind, role, nid, seed) {
    const F = FACTIONS[kind] || FACTIONS.pirate;
    const av = new Avatar(crewLook(kind, seed));
    ship.body.add(av.root);
    av.root.scale.setScalar(1 / ship.size);   // the body is drawn at the ship's size; the sailor stays human
    return {
      nid, ship, kind, role, seed, av, L: new THREE.Vector3(), yaw: 0, hp: F.hp, maxHp: F.hp, state: 'post', atkCD: 0, atkN: 0,
      swing: 0, deadT: 0, flash: 0, moved: false, wi: 0, wanderT: 2 + Math.random() * 6, atPost: true, gun: -1, anim: 'idle',
    };
  }
  // where this sailor belongs, and (snap) put them there
  post(s, snap) {
    let x = 0, z = 0, y = SHIP.deck, yaw = 0;
    if (s.role === 'helm') { x = HELM.x; z = HELM.z + 0.05; y = SHIP.qd; yaw = 0; }
    else if (s.role === 'nest') { x = 0.45; z = SHIP.mastZ - 0.45; y = SHIP.nest; yaw = -0.7; }
    else if (s.role === 'gun') { const g = GUNS[s.gun], p = gunPlace(g); x = p.stand; z = g.z; y = g.y; yaw = g.side > 0 ? -Math.PI / 2 : Math.PI / 2; }
    else { const w = WANDER[s.wi]; x = w[0]; z = w[1]; y = SHIP.deck; yaw = s.yaw; }
    s.home = { x, y, z, yaw };
    if (snap) { s.L.set(x, y, z); s.yaw = yaw; }
    return s.home;
  }
  // ---------------------------------------------------------------- the captain's side
  update(dt) {
    const G = this.g;
    if (G.net.isCrew) { this.updatePuppets(dt); return; }
    // ships that left the world take their crews with them
    if (this.list.length) this.list = this.list.filter((s) => G.hollows.includes(s.ship));
    const T = G.targets(), cam = G.camera.position;
    for (const ship of G.hollows) {
      if (!ship.crew) continue;
      const near = Math.hypot(cam.x - ship.pos.x, cam.z - ship.pos.z) < 75;
      if (ship.sinking) { ship.manned = false; for (const s of ship.crew) s.av.root.visible = false; continue; }
      const aboard = [];
      for (const t of T) {
        if (!t.alive) continue;
        const k = ship.size, l = ship.toLocal(t.x, t.z, _l), ly = (t.y - ship.pos.y) / k; l.x /= k; l.z /= k;
        if (l.z > SHIP.bow - 0.6 && l.z < SHIP.stern + 0.6 && Math.abs(l.x) < halfWidthAt(l.z) + 0.4 && ly > SHIP.low - 0.8 && ly < SHIP.top + 0.6) aboard.push({ t, x: l.x, y: ly, z: l.z });
      }
      if (aboard.length && !ship.taken) { if (!(ship.alertT > 0)) this.onBoarded(ship); ship.alertT = 25; }
      else ship.alertT = Math.max(0, (ship.alertT || 0) - dt);
      let helm = false;
      for (const s of ship.crew) { this.think(s, ship, aboard, dt); if (s.role === 'helm' && s.state !== 'dead' && s.atPost) helm = true; }
      ship.manned = helm;
      if (!ship.taken && ship.crew.every((s) => s.state === 'dead')) this.onTaken(ship);
      for (const s of ship.crew) this.animate(s, ship, dt, near);
    }
  }
  onBoarded(ship) {
    const G = this.g;
    if ((ship.kind === 'merchant' || ship.kind === 'navy') && !ship.reported) {
      ship.reported = true;
      G.fleet.raise(ship.kind === 'navy' ? 2 : 1, ship.kind === 'navy' ? 'You boarded a navy cutter' : 'You boarded a merchantman');
    }
    ship.angryT = Math.max(ship.angryT || 0, 80);
    if (!ship.boardedOnce) { ship.boardedOnce = true; G.ui.pickup(`The ${FACTIONS[ship.kind].noun}s of the ${ship.name || 'ship'} draw steel`); }
  }
  onTaken(ship) {
    const G = this.g;
    ship.taken = true; ship.manned = false;
    G.ui.toast(`The ${ship.name || 'ship'} is yours`, 'Her crew is beaten. Break open the strongbox in her hold.', 'good');
    G.net.toastAll(`The ${ship.name || 'ship'} is taken`, 'Her strongbox waits in the hold.', 'good');
    G.sfx.fanfare && G.sfx.fanfare();
  }
  think(s, ship, aboard, dt) {
    const G = this.g, F = FACTIONS[s.kind];
    s.atkCD -= dt; s.swing = Math.max(0, s.swing - dt * 3.2); s.flash = Math.max(0, s.flash - dt * 4);
    if (s.state === 'dead') { s.deadT += dt; return; }
    if (s.role === 'nest') { this.lookout(s, ship, aboard, dt); return; }
    let tgt = null;
    if (aboard.length && s.role !== 'nest') {
      for (const b of aboard) {
        const lv = level(b.y, b.z);
        const d = Math.hypot(b.x - s.L.x, b.z - s.L.z) + Math.abs(b.y - s.L.y) * 1.5 + (lv === 'nest' ? 4 : 0);
        if (!tgt || d < tgt.d) tgt = { ...b, d, lv };
      }
      if (s.role === 'helm' && tgt.d > 3.2) tgt = null;      // the helmsman holds the wheel unless you come to him
    }
    let goal;
    if (tgt) {
      s.state = 'fight';
      goal = tgt.lv === 'nest' ? { x: LADDER.x + 0.5, y: SHIP.deck, z: LADDER.z + 0.4 } : tgt;
    } else {
      s.state = 'post';
      if (s.role === 'hand') {
        s.wanderT -= dt;
        if (s.wanderT <= 0) { s.wanderT = 5 + Math.random() * 8; s.wi = (s.wi + 1 + ((Math.random() * 3) | 0)) % WANDER.length; }
      }
      goal = this.post(s, false);
    }
    s.moved = this.walk(s, ship, goal, dt, tgt ? 0.95 / ship.size : 0.12, F.speed * (tgt ? 1 : 0.55) / ship.size);
    const home = s.home;
    s.atPost = !tgt && Math.hypot(s.L.x - home.x, s.L.z - home.z) < 0.35 && Math.abs(s.L.y - home.y) < 0.4;
    if (s.atPost && !s.moved) s.yaw += wrapAngle(home.yaw - s.yaw) * Math.min(1, dt * 4);
    if (tgt) {
      const dx = tgt.x - s.L.x, dz = tgt.z - s.L.z, d = Math.hypot(dx, dz);
      if (d < 2.5) s.yaw = Math.atan2(-dx, -dz);
      if (d < 1.3 / ship.size && Math.abs(tgt.y - s.L.y) < 1.0 / ship.size && s.atkCD <= 0) {
        s.atkCD = 1.2 + Math.random() * 0.4; s.atkN++; s.swing = 1;
        const c = Math.cos(ship.heading), sn = Math.sin(ship.heading), ux = dx / (d || 1), uz = dz / (d || 1);
        const lvl = Math.min(8, G.level || 0);
        G.hurtTarget(tgt.t, Math.round(F.dmg * (1 + lvl * 0.06)), { x: ux * c + uz * sn, z: -ux * sn + uz * c });
        G.sfx.hit();
      }
    }
  }
  // the lookout stays aloft and takes shots with a long musket at anyone on the deck below
  lookout(s, ship, aboard, dt) {
    const G = this.g;
    s.moved = false; s.atPost = true;
    s.alert = aboard.length > 0 && ship.alertT > 0;
    let b = null;
    for (const q of aboard) { const lv = level(q.y, q.z); if (lv === 'nest') continue; const d = Math.hypot(q.x - s.L.x, q.z - s.L.z); if (!b || d < b.d) b = { ...q, d }; }
    if (!s.alert || !b) { s.yaw += wrapAngle(s.home.yaw - s.yaw) * Math.min(1, dt * 2); s.shootCD = Math.max(s.shootCD || 0, 1.5); return; }
    s.yaw = Math.atan2(-(b.x - s.L.x), -(b.z - s.L.z));
    s.shootCD = (s.shootCD ?? 2) - dt;
    if (s.shootCD > 0) return;
    s.shootCD = 3.2 + Math.random() * 1.8; s.atkN++;
    const from = shipToWorld(ship, { x: s.L.x, y: s.L.y + 1.4 / ship.size, z: s.L.z }, new THREE.Vector3());
    const to = new THREE.Vector3(b.t.x, b.t.y + 1.1, b.t.z);
    const hit = Math.random() < 0.42;
    if (!hit) to.x += (Math.random() - 0.5) * 2.5, to.z += (Math.random() - 0.5) * 2.5, to.y -= 0.8;
    this.shotFx(from, to);
    if (hit) {
      const dx = to.x - from.x, dz = to.z - from.z, l = Math.hypot(dx, dz) || 1;
      G.hurtTarget(b.t, Math.round(9 * (1 + Math.min(8, G.level || 0) * 0.05)), { x: dx / l, z: dz / l });
    }
  }
  shotFx(from, to) {
    const G = this.g;
    if (!G.guns) return;
    G.guns.tracers.add(from, to, 0.016);
    const d = to.clone().sub(from).normalize();
    G.guns.flash(from.x + d.x * 0.6, from.y + d.y * 0.6, from.z + d.z * 0.6, { pellets: 1 }, d);
    G.sfx.gun && G.sfx.gun('musket', G.distToListener(from.x, from.z));
  }
  // stairs and the hatch: where to head next to get from one deck to another
  waypoint(s, from, to) {
    const L = s.L;
    if (from === 'nest') return { x: L.x, z: L.z };
    if (from === 'hold' && to !== 'hold') return Math.abs(L.x) < 0.35 && L.z > 0.25 ? { x: 0, z: -0.05 } : { x: 0, z: 2.5 };
    if (to === 'hold') return Math.abs(L.x) < 0.35 && L.z > 0.0 && L.z < 2.3 ? { x: 0, z: 2.5 } : { x: 0, z: 0.05 };
    const sx = (L.x >= 0 ? 1 : -1) * 1.3;
    if (from === 'main' && to === 'qd') return Math.abs(L.x - sx) < 0.3 && L.z < 2.4 ? { x: sx, z: 2.6 } : { x: sx, z: 0.5 };
    if (from === 'qd' && to === 'main') return Math.abs(L.x - sx) < 0.3 && L.z < 2.7 ? { x: sx, z: 0.45 } : { x: sx, z: 2.65 };
    return { x: L.x, z: L.z };
  }
  walk(s, ship, goal, dt, stop, speed) {
    const L = s.L, from = level(L.y, L.z), to = level(goal.y, goal.z);
    let gx = goal.x, gz = goal.z;
    if (from !== to && !(from === 'nest' && to === 'nest')) {
      if (from === 'nest') return false;                          // the lookout stays aloft
      const w = this.waypoint(s, from, to); gx = w.x; gz = w.z; stop = 0.1;
    }
    const dx = gx - L.x, dz = gz - L.z, d = Math.hypot(dx, dz);
    if (d < stop) return false;
    const step = Math.min(d, speed * dt), ux = dx / d, uz = dz / d;
    s.yaw += wrapAngle(Math.atan2(-ux, -uz) - s.yaw) * Math.min(1, dt * 10);
    const tryAt = (x, z) => { const f = floorAt(x, z, L.y); if (Number.isNaN(f) || f === -Infinity) return false; L.x = x; L.z = z; L.y = f; return true; };
    const ok = tryAt(L.x + ux * step, L.z + uz * step) || tryAt(L.x + ux * step, L.z) || tryAt(L.x, L.z + uz * step);
    for (const [ox, oz, r, y0, y1] of OBST) if (L.y > y0 - 0.6 && L.y < y1) pushOut(L, ox, oz, r + 0.26);
    for (const o of ship.crew || []) {
      if (o === s || o.state === 'dead' || Math.abs(o.L.y - L.y) > 0.8) continue;
      const ex = L.x - o.L.x, ez = L.z - o.L.z, e = Math.hypot(ex, ez);
      if (e < 0.5 && e > 1e-4) { const k = (0.5 - e) / e * 0.5; L.x += ex * k; L.z += ez * k; }
    }
    const f = floorAt(L.x, L.z, L.y + 0.3);
    if (f > -Infinity && !Number.isNaN(f)) L.y = f;
    return ok;
  }
  animate(s, ship, dt, near) {
    const av = s.av;
    av.root.visible = near && !(s.state === 'dead' && s.deadT > 6);
    if (!av.root.visible) return;
    av.root.position.copy(s.L);
    av.root.rotation.y = s.yaw;
    av.holdItem(s.role === 'nest' ? (s.alert ? 'musket' : null) : s.state === 'fight' || s.swing > 0 ? 'cutlass' : null);
    let st = s.state === 'dead' ? 'dead' : s.moved ? (s.state === 'fight' ? 'run' : 'walk') : s.role === 'helm' && s.atPost ? 'helm' : 'idle';
    if (s.state === 'dead' && s.deadT > 3) av.root.position.y -= Math.min(0.6, (s.deadT - 3) * 0.2);
    s.anim = st;
    av.pose(st, dt, { rudder: ship.rudder, swing: s.swing });
    if (av.mat.emissive) av.mat.emissive.setRGB(s.flash * 0.6, 0, 0);
  }
  // ---------------------------------------------------------------- fighting them
  alive(s) { return s.state !== 'dead'; }
  worldPos(s, out) { return shipToWorld(s.ship, s.L, out); }
  raycast(o, d, maxD) {
    let best = null;
    const all = this.g.net.isCrew ? this.puppets.values() : this.list;
    for (const s of all) {
      if (s.state === 'dead' || !s.ship || s.ship.sinking || !s.av.root.visible) continue;
      const p = shipToWorld(s.ship, s.L, _l), r = 0.36;
      const t = rayBox(o, d, p.x - r, p.y, p.z - r, p.x + r, p.y + 1.8, p.z + r);
      if (t !== null && t <= maxD && (!best || t < best.t)) best = { s, t, sailor: true };
    }
    return best;
  }
  // a hit from a cutlass, a shot or a blast (dir in the world)
  hurt(s, n, dir) {
    if (!s || s.state === 'dead') return;
    const G = this.g, ship = s.ship;
    s.hp -= n; s.flash = 1;
    const p = shipToWorld(ship, s.L, _l);
    G.particles.burst(p.x, p.y + 1.2, p.z, 0xb03a2e, 6, 1.8, 2, 14, 0.45, 0.3);
    if (dir) {
      const c = Math.cos(ship.heading), sn = Math.sin(ship.heading);
      const lx = dir.x * c - dir.z * sn, lz = dir.x * sn + dir.z * c;
      const f = floorAt(s.L.x + lx * 0.35, s.L.z + lz * 0.35, s.L.y);
      if (f > -Infinity && !Number.isNaN(f) && Math.abs(f - s.L.y) < 0.3) { s.L.x += lx * 0.35; s.L.z += lz * 0.35; }
    }
    if (ship.alertT !== undefined) ship.alertT = Math.max(ship.alertT, 20);
    if (s.hp <= 0) this.kill(s);
  }
  kill(s) {
    if (s.state === 'dead') return;
    const G = this.g, ship = s.ship, F = FACTIONS[s.kind];
    s.state = 'dead'; s.deadT = 0; s.hp = 0;
    ship.boxGold = (ship.boxGold || 0) + F.bounty;
    G.stats.sailors = (G.stats.sailors || 0) + 1;
    G.sfx.hit();
  }
  // a cannonball through the bulwarks sometimes takes a sailor with it
  onShipHit(ship) {
    if (!ship.crew || ship.sinking || this.g.net.isCrew) return;
    const live = ship.crew.filter((s) => s.state !== 'dead' && s.role !== 'helm' && s.role !== 'nest');
    if (live.length && Math.random() < 0.3) this.kill(live[(Math.random() * live.length) | 0]);
  }
  byNid(nid) { return this.list.find((s) => s.nid === nid) || null; }
  // ---------------------------------------------------------------- crew games: puppets of the captain's sailors
  state(near) {
    const out = [];
    for (const s of this.list) {
      if (s.ship.sinking || (s.state === 'dead' && s.deadT > 7)) continue;
      if (!near(s.ship)) continue;
      out.push([s.nid, s.ship.nid, CREW_KINDS.indexOf(s.kind), CREW_ROLES.indexOf(s.role), s.seed, Math.round(s.L.x * 100) / 100, Math.round(s.L.y * 100) / 100, Math.round(s.L.z * 100) / 100,
        Math.round(wrapAngle(s.yaw) * 100) / 100, Math.max(0, CREW_ANIMS.indexOf(s.anim)), s.atkN % 1000, Math.max(0, Math.round((s.hp / s.maxHp) * 100))]);
      if (out.length >= 28) break;
    }
    return out;
  }
  syncPuppets(list, shipBy) {
    const seen = new Set();
    for (const e of list) {
      const [nid, snid, ki, ri, seed, x, y, z, yaw, ai, atkN, hp] = e;
      const ship = shipBy(snid);
      if (!ship) continue;
      seen.add(nid);
      let s = this.puppets.get(nid);
      if (!s || s.ship !== ship) {
        if (s && s.ship) s.ship.body.remove(s.av.root);
        s = this.make(ship, CREW_KINDS[ki] || 'pirate', CREW_ROLES[ri] || 'hand', nid, seed);
        s.L.set(x, y, z); s.yaw = yaw; s.atkN = atkN;
        this.puppets.set(nid, s);
      }
      s.tL = { x, y, z, yaw };
      if (atkN !== s.atkN) {
        s.atkN = atkN;
        if (s.role === 'nest') {
          const from = shipToWorld(ship, { x: s.L.x, y: s.L.y + 1.4 / ship.size, z: s.L.z }, new THREE.Vector3());
          const c = Math.cos(ship.heading + s.yaw), sn = Math.sin(ship.heading + s.yaw);
          this.shotFx(from, new THREE.Vector3(from.x - sn * 12, from.y - 8, from.z - c * 12));
          s.alert = true;
        } else s.swing = 1;
      }
      if (hp < Math.round((s.hp / s.maxHp) * 100)) s.flash = 1;
      s.hp = (hp / 100) * s.maxHp;
      s.anim = CREW_ANIMS[ai] || 'idle';
      if (hp <= 0 && s.state !== 'dead') { s.state = 'dead'; s.deadT = 0; }
      else if (hp > 0) s.state = s.anim === 'run' ? 'fight' : 'post';
      s.miss = 0;
    }
    for (const [nid, s] of this.puppets) {
      if (seen.has(nid)) continue;
      if (++s.miss < 6) continue;
      if (s.ship) s.ship.body.remove(s.av.root);
      this.puppets.delete(nid);
    }
  }
  updatePuppets(dt) {
    const G = this.g, cam = G.camera.position;
    for (const [nid, s] of this.puppets) {
      if (!G.hollows.includes(s.ship)) { this.puppets.delete(nid); continue; }
      s.swing = Math.max(0, s.swing - dt * 3.2); s.flash = Math.max(0, s.flash - dt * 4);
      if (s.state === 'dead') s.deadT += dt;
      const t = s.tL;
      if (t) {
        const k = 1 - Math.exp(-dt * 10), ox = s.L.x, oz = s.L.z;
        s.L.x += (t.x - s.L.x) * k; s.L.y += (t.y - s.L.y) * k; s.L.z += (t.z - s.L.z) * k;
        s.yaw += wrapAngle(t.yaw - s.yaw) * k;
        s.moved = Math.hypot(s.L.x - ox, s.L.z - oz) > dt * 0.3;
      }
      const near = Math.hypot(cam.x - s.ship.pos.x, cam.z - s.ship.pos.z) < 75;
      const av = s.av;
      av.root.visible = near && !s.ship.sinking && !(s.state === 'dead' && s.deadT > 6);
      if (!av.root.visible) continue;
      av.root.position.copy(s.L);
      if (s.state === 'dead' && s.deadT > 3) av.root.position.y -= Math.min(0.6, (s.deadT - 3) * 0.2);
      av.root.rotation.y = s.yaw;
      av.holdItem(s.role === 'nest' ? (s.alert ? 'musket' : null) : s.state === 'fight' || s.swing > 0 ? 'cutlass' : null);
      av.pose(s.state === 'dead' ? 'dead' : s.anim, dt, { rudder: s.ship.rudder, swing: s.swing });
      if (av.mat.emissive) av.mat.emissive.setRGB(s.flash * 0.6, 0, 0);
    }
  }
}
