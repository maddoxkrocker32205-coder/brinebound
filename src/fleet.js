// Other ships at sea. Merchantmen ply between the islands (and run if you fire on them), a navy cutter keeps
// the peace (and hunts you once you've sunk a merchant or fired on the Crown), and rival pirates come at
// anyone they find. The Hollow Wake's ghost ships are managed by the game itself.
import { W, D, SEA, clamp, wrapAngle } from './config.js';
import { Ship, SHIP_NAMES } from './ship.js';
import { hollowAI } from './enemies.js';

const WANT = { merchant: 2, navy: 1, pirate: 2 };
export const FLEET_KINDS = ['hollow', 'merchant', 'navy', 'pirate'];

function openWater(w, x, z) {
  let n = 0;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) if (!w.solid(Math.floor(x + i * 4), SEA - 1, Math.floor(z + j * 4))) n++;
  return n;
}
// turn toward a heading, swinging away from land seen ahead
function steer(s, G, dt, desired) {
  const w = G.world, fx = -Math.sin(s.heading), fz = -Math.cos(s.heading);
  if (s.avoidT > 0) s.avoidT -= dt;
  else {
    for (const look of [8, 14, 22]) {
      const lk = look * s.size, px = s.pos.x + fx * lk, pz = s.pos.z + fz * lk;
      if (px < 12 || pz < 12 || px > W - 12 || pz > D - 12 || w.solid(Math.floor(px), SEA - 1, Math.floor(pz)) || w.solid(Math.floor(px), SEA, Math.floor(pz))) {
        const rx = Math.cos(s.heading), rz = -Math.sin(s.heading);
        const o = 14 * s.size;
        s.avoidDir = openWater(w, s.pos.x + (fx + rx) * o, s.pos.z + (fz + rz) * o) >= openWater(w, s.pos.x + (fx - rx) * o, s.pos.z + (fz - rz) * o) ? 1 : -1;
        s.avoidT = 1.6;
        break;
      }
    }
  }
  let rud = clamp(-wrapAngle(desired - s.heading) * 2.2, -1, 1);
  if (s.avoidT > 0) rud = s.avoidDir;
  s.rudder += (rud - s.rudder) * Math.min(1, dt * 2.5);
}
const headingTo = (s, x, z) => Math.atan2(-(x - s.pos.x), -(z - s.pos.z));

export class Fleet {
  constructor(G) { this.g = G; this.t = 0; this.notoriety = 0; this.notT = 0; }
  get ships() { return this.g.hollows.filter((s) => s.kind !== 'hollow'); }
  clear() { this.notoriety = 0; this.notT = 0; }
  // the player's position at sea or ashore
  ref() { const G = this.g, P = G.player; return (P.mode === 'helm' || (P.mode === 'deck' && (!P.ship || P.ship === G.sloop))) && G.sloop ? G.sloop.pos : P.pos; }
  // somewhere off an island's shore, in open water
  harbour(o, from) {
    const w = this.g.world;
    const a0 = Math.atan2(from.z - o.z, from.x - o.x);
    for (let k = 0; k < 12; k++) {
      const a = a0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.5, r = o.r + 16;
      const x = o.x + Math.cos(a) * r, z = o.z + Math.sin(a) * r;
      if (x > 20 && z > 20 && x < W - 20 && z < D - 20 && openWater(w, x, z) >= 8) return { x, z };
    }
    return { x: clamp(o.x + 40, 20, W - 20), z: clamp(o.z + 40, 20, D - 20) };
  }
  pickDest(s) {
    const isl = this.g.world.islands;
    const far = isl.filter((o) => Math.hypot(o.x - s.pos.x, o.z - s.pos.z) > 70);
    const o = (far.length ? far : isl)[(Math.random() * (far.length || isl.length)) | 0];
    s.dest = this.harbour(o, s.pos);
  }
  spawn(kind) {
    const G = this.g, w = G.world, ref = this.ref();
    for (let i = 0; i < 120; i++) {
      const a = Math.random() * Math.PI * 2, d = 150 + Math.random() * 80;
      const x = ref.x + Math.cos(a) * d, z = ref.z + Math.sin(a) * d;
      if (x < 30 || z < 30 || x > W - 30 || z > D - 30) continue;
      if (w.surf[Math.floor(x) + Math.floor(z) * W] > SEA - 3 || openWater(w, x, z) < 9) continue;
      if (G.hollows.some((h) => Math.hypot(h.pos.x - x, h.pos.z - z) < 40)) continue;
      const used = G.hollows.filter((h) => h.kind === kind).map((h) => h.name), names = SHIP_NAMES[kind] || [];
      const free = names.map((n, k) => k).filter((k) => !used.includes(names[k]));
      const s = new Ship(G.scene, kind, { nameIx: free.length ? free[(Math.random() * free.length) | 0] : 0 });
      const L = Math.min(10, G.level);
      s.maxHp = s.hp = s.maxHp + L * (kind === 'navy' ? 22 : 15);
      if (kind === 'navy') s.dmgMul = 1.15;
      s.place(x, z, 0);
      this.pickDest(s);
      s.heading = headingTo(s, s.dest.x, s.dest.z);
      if (s.hullHits(w, x, z, s.heading)) { s.dispose(); continue; }
      s.sailLvl = 0.8;
      G.hollows.push(s);
      G.crews.man(s);
      return s;
    }
    return null;
  }
  // a ship of the fleet took a hit from the player's side
  onHit(s, by) {
    const G = this.g;
    if (s.kind === 'hollow' || by !== G.sloop) return;
    s.angryT = s.kind === 'merchant' ? 45 : 80;
    if ((s.kind === 'merchant' || s.kind === 'navy') && !s.reported) {
      s.reported = true;
      this.raise(s.kind === 'navy' ? 2 : 1, s.kind === 'navy' ? 'You fired on the Crown' : 'You fired on a merchantman');
    }
  }
  raise(n, why) {
    const G = this.g, was = this.notoriety;
    this.notoriety = Math.min(4, this.notoriety + n); this.notT = 0;
    if (was === 0 && this.notoriety > 0) {
      G.ui.toast(why, 'The navy has your colours now. Their cutter will hunt you until the talk dies down.', 'bad');
      G.net.toastAll(why, 'The navy is hunting this crew for a while.', 'bad');
    }
  }
  hostile(s) {
    if (s.kind === 'hollow') return true;
    if (s.kind === 'pirate') return true;
    if (s.kind === 'navy') return this.notoriety > 0 || s.angryT > 0;
    return false;
  }
  update(dt) {
    const G = this.g;
    if (G.net.isCrew) return;
    this.t -= dt;
    if (this.notoriety > 0) { this.notT += dt; if (this.notT > 150) { this.notT = 0; this.notoriety--; if (!this.notoriety) G.ui.pickup('The navy has lost interest in you'); } }
    for (const s of this.ships) this.ai(s, dt);
    if (this.t > 0) return;
    this.t = 6;
    if (!G.sloop || G.state === 'title') return;
    const live = this.ships.filter((s) => !s.sinking);
    // far-off ships nobody is dealing with drift out of the world; new ones sail in
    for (const s of live) {
      let d = 1e9;
      for (const t of G.targets()) d = Math.min(d, Math.hypot(s.pos.x - t.x, s.pos.z - t.z));
      if (d > 330 && !(s.angryT > 0)) G.removeHollow(s);
    }
    for (const kind of Object.keys(WANT)) {
      const have = this.ships.filter((s) => s.kind === kind && !s.sinking).length;
      if (have < WANT[kind] && G.hollows.length < 8) { this.spawn(kind); break; }
    }
  }
  ai(s, dt) {
    const G = this.g;
    if (s.sinking) return;
    s.angryT = Math.max(0, (s.angryT || 0) - dt);
    // nobody at the wheel (beaten, or off fighting boarders): she loses way and drifts
    if (s.crew && !s.manned) { s.sailLvl = Math.max(0, s.sailLvl - dt * 0.3); s.rudder *= 0.95; s.reverse = false; return; }
    // run aground or wedged in a bay: back off, then try somewhere else
    if (s.backT > 0) { s.backT -= dt; s.reverse = true; s.sailLvl = 0; s.rudder = s.avoidDir || 1; return; }
    s.reverse = false;
    s.stuckT = Math.abs(s.speed) < 0.6 && s.sailLvl > 0.4 ? (s.stuckT || 0) + dt : 0;
    if (s.stuckT > 6) { s.stuckT = 0; s.backT = 2.5; this.pickDest(s); return; }
    const sl = G.sloop && !G.sloop.sinking ? G.sloop : null, ref = this.ref();
    const dist = Math.hypot(ref.x - s.pos.x, ref.z - s.pos.z);
    // pirates and an angry navy fight like the ghosts do: close in, turn broadside, fire
    if (this.hostile(s) && sl && dist < (s.kind === 'pirate' ? 105 : 160)) { s.leaving = false; hollowAI(s, G, dt); return; }
    // a merchant under fire runs downwind of trouble
    if (s.kind === 'merchant' && s.angryT > 0) {
      s.sailLvl = 1;
      steer(s, G, dt, headingTo(s, s.pos.x + (s.pos.x - ref.x), s.pos.z + (s.pos.z - ref.z)));
      return;
    }
    if (!s.dest || Math.hypot(s.dest.x - s.pos.x, s.dest.z - s.pos.z) < 22) this.pickDest(s);
    s.sailLvl = s.kind === 'merchant' ? 0.75 : 0.85;
    steer(s, G, dt, headingTo(s, s.dest.x, s.dest.z));
  }
}
