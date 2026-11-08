// Crew play: friends who have this page open can sail one shared voyage.
//
// The captain (host) runs the whole world exactly as in solo play. Each crew member runs their own
// pirate (moving, mining, building, gold and gear) inside a copy of the captain's world, and sees the
// captain's sloop, skeletons, ghost ships and kraken as puppets that the captain's game moves.
//
// Everything travels over room presence, the one arm every invited viewer may send on. State is sent
// whole, ten times a second. Changes that must not be lost (block edits, hits, rewards) ride in small
// event logs inside presence and are re-sent until the other side acknowledges them. Nothing a peer
// sends is trusted: numbers are clamped, text is cleaned and only ever drawn as text.
import * as THREE from 'three';
import { W, D, H, FLOOR, SEA, B, BLOCKS, ITEMS, LOOKS, clamp, wrapAngle } from './config.js';
import { Avatar } from './character.js';
import { PARROT_COLORS } from './models.js';
import { Ship, fireBroadside, fireGun, GUNS, SHIP_NAMES } from './ship.js';
import { FLEET_KINDS } from './fleet.js';
import { Skeleton } from './enemies.js';
import { KrakenPuppet } from './kraken.js';
import { isGun } from './guns.js';
import { packEdits, unpackEdits } from './save.js';

const PROTO = 4;                      // 0.6.12: expanded underground world, so older pages keep to themselves
const SEND = 0.1;                     // seconds between presence updates
const BUDGET = 3800;                  // bytes one presence object may reach (the room allows 4096)
const MAX_CREW = 3;
const CHUNK = 900;                    // characters of world snapshot per presence update
const ANIMS = ['idle', 'walk', 'run', 'swim', 'air', 'helm', 'dead', 'climb', 'slide', 'crouch', 'sneak', 'wave', 'cheer', 'dance', 'salute', 'point', 'sit', 'bow', 'shrug', 'crawl', 'creep'];
const MODES = ['foot', 'deck', 'helm'];
const HELD = ['', 'cutlass', 'pick', 'pistol', 'blunderbuss', 'musket'];
const SKK = ['night', 'guard', 'camp', 'captain'];
const ICONS = ['x', 'npc', 'skull', 'vault', 'deep', 'bottle', 'enemy', 'ship', 'chart', 'haven'];
const KINDS = ['', 'good', 'bad', 'curse'];
const GAME_KEYS = ['g', 'role', 'to', 'lk', 'p', 'w', 'ob', 'mk', 'sh', 'hl', 'hs', 'e', 'k', 'L', 'acc', 'ak', 'ev', 'sn', 'got', 'rs', 'hm', 'say'];
const VOLUME = W * D * H;
const PLACEABLE = new Set(Object.values(ITEMS).filter((d) => d.block).map((d) => d.block));
const enc = new TextEncoder();
const size = (o) => enc.encode(JSON.stringify(o)).length;
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const num = (v, lo, hi, d = 0) => (fin(v) ? clamp(v, lo, hi) : d);
const int = (v, lo, hi, d = 0) => Math.round(num(v, lo, hi, d));
const peerId = (v) => (typeof v === 'string' && v.length > 0 && v.length <= 64 ? v : null);
// control, zero-width and direction-changing characters never reach the screen
const BAD = new RegExp('[\\u0000-\\u001f\\u007f-\\u009f\\u00ad\\u061c\\u180e\\u200b-\\u200f\\u2028-\\u202e\\u2060-\\u206f\\ufeff\\ufff9-\\ufffb]', 'g');
const clean = (v, max) => (typeof v === 'string' ? v.replace(BAD, '').replace(/\s+/g, ' ').trim().slice(0, max) : '');
const CODE_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';
const newCode = () => 'bb-' + Array.from({ length: 6 }, () => CODE_CHARS[(Math.random() * CODE_CHARS.length) | 0]).join('');
const okCode = (v) => typeof v === 'string' && /^bb-[a-z0-9]{6}$/.test(v);
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function packLook(L, pet) {
  return [L.skin | 0, L.coat | 0, L.hat | 0, L.hair | 0, L.beard | 0, L.patch ? 1 : 0, L.emblem | 0, L.sail | 0, L.hull | 0, pet ? pet.color | 0 : -1, clean(L.name, 28), clean(L.ship, 32)];
}
function unpackLook(a) {
  if (!Array.isArray(a) || a.length < 12) return null;
  const look = {
    skin: int(a[0], 0, LOOKS.skin.length - 1, 1), coat: int(a[1], 0, LOOKS.coat.length - 1), hat: int(a[2], 0, LOOKS.hat.length - 1),
    hair: int(a[3], 0, LOOKS.hair.length - 1, 1), beard: int(a[4], 0, LOOKS.beard.length - 1), patch: a[5] === 1,
    emblem: int(a[6], 0, LOOKS.emblem.length - 1), sail: int(a[7], 0, LOOKS.sail.length - 1), hull: int(a[8], 0, LOOKS.hull.length - 1),
    name: clean(a[10], 28) || 'A pirate', ship: clean(a[11], 32) || 'A sloop',
  };
  const pc = int(a[9], -1, PARROT_COLORS.length - 1, -1);
  return { look, pet: pc >= 0 ? { color: pc } : null };
}

// ---------------------------------------------------------------- floating text: name tags and chat bubbles
class Label {
  constructor(scene, kind) {
    this.kind = kind; this.scene = scene; this.text = null;
    this.c = document.createElement('canvas'); this.c.width = 512; this.c.height = kind === 'say' ? 192 : 72;
    this.tex = new THREE.CanvasTexture(this.c); this.tex.colorSpace = THREE.SRGBColorSpace;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, depthTest: false, depthWrite: false, transparent: true, fog: false }));
    this.sprite.renderOrder = 6; this.sprite.visible = false;
    this.aspect = this.c.height / this.c.width;
    scene.add(this.sprite);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (this.text != null) this.draw(); });
  }
  set(text) { if (text === this.text) return; this.text = text; this.draw(); }
  draw() {
    const x = this.c.getContext('2d'), w = this.c.width, h = this.c.height;
    x.clearRect(0, 0, w, h);
    if (this.kind === 'tag') {
      x.font = '34px "IM Fell English", Georgia, serif';
      const tw = Math.min(w - 8, x.measureText(this.text).width + 34);
      x.fillStyle = 'rgba(12,22,27,0.74)'; x.fillRect((w - tw) / 2, 8, tw, 54);
      x.fillStyle = '#d8ad52'; x.fillRect((w - tw) / 2, 58, tw, 4);
      x.fillStyle = '#efe2c1'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(this.text, w / 2, 36, w - 30);
    } else {
      x.font = '30px "IM Fell English", Georgia, serif';
      const words = this.text.split(' '), lines = [];
      let line = '';
      for (const wd of words) { const t = line ? line + ' ' + wd : wd; if (x.measureText(t).width > w - 60 && line) { lines.push(line); line = wd; } else line = t; }
      if (line) lines.push(line);
      if (lines.length > 4) { lines.length = 4; lines[3] += '…'; }
      const lh = 36, bh = lines.length * lh + 22, top = h - bh - 16;
      const bw = Math.min(w - 8, Math.max(...lines.map((l) => x.measureText(l).width)) + 40);
      x.fillStyle = 'rgba(236,224,195,0.95)'; x.fillRect((w - bw) / 2, top, bw, bh);
      x.beginPath(); x.moveTo(w / 2 - 12, top + bh); x.lineTo(w / 2 + 12, top + bh); x.lineTo(w / 2, top + bh + 14); x.closePath(); x.fill();
      x.fillStyle = '#2a2017'; x.textAlign = 'center'; x.textBaseline = 'middle';
      lines.forEach((l, i) => x.fillText(l, w / 2, top + 11 + lh / 2 + i * lh, w - 50));
    }
    this.tex.needsUpdate = true;
  }
  // about the same size on screen at any distance, never tiny up close; returns the sprite's world height
  place(x, y, z, dist) {
    const k = this.kind === 'say' ? Math.max(2.2, dist * 0.55) : Math.max(1.5, dist * 0.42);
    const h = k * this.aspect;
    this.sprite.position.set(x, y + h * 0.5, z);
    this.sprite.scale.set(k, h, 1);
    return h;
  }
  dispose() { this.scene.remove(this.sprite); this.tex.dispose(); this.sprite.material.dispose(); }
}

// ---------------------------------------------------------------- another pirate in the crew
class Mate {
  constructor(net, peer) {
    this.net = net; this.G = net.g; this.peer = peer;
    this.name = 'A pirate'; this.lookKey = ''; this.look = null; this.role = 'crew';
    this.avatar = null;
    this.tag = new Label(this.G.scene, 'tag'); this.bubble = new Label(this.G.scene, 'say');
    this.pos = new THREE.Vector3(); this.tp = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.at = 0; this.has = false;
    this.local = new THREE.Vector3(); this.yaw = 0; this.tyaw = 0; this.pitch = 0;
    this.mode = 'foot'; this.anim = 'idle'; this.item = ''; this.alive = true; this.hp = 100; this.maxHp = 100; this.gun = -1;
    this.swingN = -1; this.shotN = -1; this.kick = 0; this.swing = 0; this.sayAt = -1; this.sayT = 0; this.miss = 0;
  }
  get water() { return this.anim === 'swim'; }
  get aboard() { return this.mode !== 'foot'; }
  apply(pr) {
    const lk = Array.isArray(pr.lk) ? pr.lk : null;
    const key = lk ? JSON.stringify(lk) : '';
    if (key && key !== this.lookKey) {
      const u = unpackLook(lk);
      if (u) {
        this.lookKey = key; this.look = u.look; this.name = u.look.name;
        if (!this.avatar) { this.avatar = new Avatar(u.look); this.avatar.root.visible = false; this.G.scene.add(this.avatar.root); } else this.avatar.setLook(u.look);
        this.avatar.setPet(u.pet);
        this.tag.set(this.role === 'host' ? `⚓ ${this.name}` : this.name);
        this.net.onLook(this);
      }
    }
    const p = pr.p;
    if (Array.isArray(p) && p.length >= 14 && fin(p[0]) && fin(p[2])) {
      const x = num(p[0], 0, W), y = num(p[1], -20, H + 30), z = num(p[2], 0, D);
      const now = performance.now();
      if (this.has && now - this.at > 15) {
        const s = (now - this.at) / 1000;
        this.vel.set((x - this.tp.x) / s, (y - this.tp.y) / s, (z - this.tp.z) / s).clampLength(0, 14);
      }
      if (!this.has || Math.hypot(x - this.tp.x, z - this.tp.z) > 12) { this.pos.set(x, y, z); this.vel.set(0, 0, 0); }
      this.tp.set(x, y, z); this.at = now; this.has = true;
      this.tyaw = num(p[3], -10, 10); this.pitch = num(p[4], -1.6, 1.6);
      this.anim = ANIMS[int(p[5], 0, ANIMS.length - 1)];
      this.item = HELD[int(p[6], 0, HELD.length - 1)];
      this.mode = MODES[int(p[7], 0, MODES.length - 1)];
      this.local.set(num(p[8], -4, 4), num(p[9], -2, 12), num(p[10], -9, 9));
      this.gun = this.mode === 'deck' ? int(p[14], -1, GUNS.length - 1) : -1;
      this.shipNid = this.mode === 'deck' && fin(p[15]) ? int(p[15], 0, 1e9) : 0;
      this.hp = num(p[11], 0, 500, 100); this.maxHp = num(p[12], 1, 500, 100);
      this.alive = this.anim !== 'dead';
      const sw = int(p[13], 0, 1e9);
      if (this.swingN >= 0 && sw !== this.swingN) this.swing = 1;
      this.swingN = sw;
      // a shot: smoke and a flash at their hands
      const sn = fin(p[16]) ? int(p[16], 0, 1000) : -1;
      if (this.shotN >= 0 && sn >= 0 && sn !== this.shotN && isGun(this.item) && this.G.state !== 'title') {
        const c = Math.cos(this.tyaw), s2 = Math.sin(this.tyaw);
        this.G.guns.remoteShot(this.tp.x + c * 0.3 - s2 * 0.7, this.tp.y + 1.45, this.tp.z - s2 * 0.3 - c * 0.7, this.tyaw, this.pitch, this.item);
        this.kick = 1;
      }
      this.shotN = sn;
    }
    // a line already said before we met is old news; anything newer is shown
    const say = Array.isArray(pr.say) && pr.say.length === 2 && fin(pr.say[0]) ? pr.say : null;
    if (this.sayAt === -1) this.sayAt = say ? say[0] : 0;
    else if (say && say[0] !== this.sayAt) {
      this.sayAt = say[0];
      const t = clean(say[1], 120);
      if (t) { this.bubble.set(t); this.sayT = 7; this.net.onChat(this, t); }
    }
  }
  update(dt) {
    if (!this.avatar || !this.has) return;
    const G = this.G, s = G.sloop, av = this.avatar;
    const age = Math.min(0.25, (performance.now() - this.at) / 1000);
    const k = 1 - Math.exp(-dt * 10);
    this.pos.x += (this.tp.x + this.vel.x * age - this.pos.x) * k;
    this.pos.y += (this.tp.y + this.vel.y * age - this.pos.y) * k;
    this.pos.z += (this.tp.z + this.vel.z * age - this.pos.z) * k;
    const on = this.mode === 'foot' ? null : this.shipNid ? this.net.shipByNid(this.shipNid) : s;
    if (on && !on.sinking) {
      const c = Math.cos(on.heading), sn = Math.sin(on.heading);
      this.pos.set(on.pos.x + this.local.x * c + this.local.z * sn, on.pos.y + this.local.y, on.pos.z - this.local.x * sn + this.local.z * c);
      // a crewmate on a gun swings it where they look
      if (on === s && this.gun >= 0 && s.gunAim) {
        const g = GUNS[this.gun], out = s.heading + (g.side > 0 ? -Math.PI / 2 : Math.PI / 2);
        s.gunAim[this.gun][0] = Math.max(-0.7, Math.min(0.7, wrapAngle(this.tyaw - out))); s.gunAim[this.gun][1] = Math.max(-0.28, Math.min(0.5, this.pitch));
      }
    }
    this.yaw += wrapAngle(this.tyaw - this.yaw) * k;
    const playing = G.state === 'play' || G.state === 'sheet';
    const cam = G.camera.position, d = this.pos.distanceTo(cam);
    av.root.visible = playing && d < 220;
    av.root.position.copy(this.pos);
    av.root.rotation.y = this.anim === 'helm' && s ? s.heading : this.yaw;
    av.holdItem(this.item || null);
    this.swing = Math.max(0, this.swing - dt * 4.2);
    this.kick = Math.max(0, (this.kick || 0) - dt * 5);
    av.pose(this.anim, dt, { rudder: s ? s.rudder : 0, swing: this.swing, look: this.pitch * 0.6, kick: this.kick });
    this.tag.sprite.visible = playing && d < 180;
    const top = this.pos.y + (this.anim === 'dead' ? 0.7 : 2.2);
    const th = this.tag.place(this.pos.x, top, this.pos.z, d);
    this.sayT -= dt;
    this.bubble.sprite.visible = playing && this.sayT > 0 && d < 90;
    if (this.bubble.sprite.visible) this.bubble.place(this.pos.x, top + th * 0.8, this.pos.z, d);
  }
  dispose() {
    if (this.avatar) { this.G.scene.remove(this.avatar.root); this.avatar.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
    this.tag.dispose(); this.bubble.dispose();
  }
}

// ---------------------------------------------------------------- the crew link
export class Net {
  constructor(G) {
    this.g = G;
    this.room = null; this.available = false; this.connected = false;
    this.me = null; this.lobby = []; this.lobbyKey = ''; this.lobbyT = 0; this.lobbyVer = 0;
    this.role = null; this.code = null; this.ch = null; this.shared = false;
    this.mates = new Map();
    this.chat = []; this.banned = new Set(); this.boomAt = 0;
    this.swingN = 0; this.prevSwing = 0;
    this.reset();
    this.init();
  }
  reset() {
    this.out = []; this.seq = 0; this.sendT = 0; this.say = null;
    // captain
    this.crew = new Map(); this.batch = []; this.snap = null; this.needSnap = false; this.snapBusy = false; this.helmPeer = null; this.closed = false;
    // crew
    this.hostPeer = null; this.hostName = ''; this.hostShip = ''; this.hostPres = null; this.hostLook = null; this.hostSeen = false;
    this.hostAck = 0; this.accepted = false; this.joined = false; this.buf = []; this.asm = null; this.gotSnap = 0; this.rs = 0;
    this.joinT = 0; this.goneT = 0; this.helmLost = 0; this.hostTime = 0; this.hostTimeAt = 0; this.hostLit = false;
    this.obj = null; this.marks = null; this.helmHolder = null; this.leaving = false; this.entering = false; this.hostAt = 0; this.stalled = false;
    this.hollowMap = new Map(); this.skelMap = new Map(); this.lootMap = new Map();
  }
  get isCrew() { return this.role === 'crew'; }
  get isHost() { return this.role === 'host'; }
  get inCrew() { return this.role === 'crew' && this.joined; }
  get busy() { return this.role === 'host' && this.crew.size > 0; }

  async init() {
    try {
      const c = window.claude;
      if (!c || typeof c.use !== 'function') return;
      const room = await c.use('room');
      if (!room) return;
      this.room = room; this.available = true;
      room.onPeers((ch) => {
        this.lobby = ch.peers; this.lobbyVer++;
        const me = ch.peers.find((p) => p.isMe && p.sameTab);
        if (me) this.me = me.peer;
      }, (e) => this.lost(e));
      room.onConnection((ok) => { this.connected = ok; }, () => {});
      this.g.onNetReady();
    } catch (e) { this.available = false; }
  }
  // the room went away for good (access withdrawn, capability removed): carry on alone
  lost() {
    this.available = false;
    if (this.role === 'crew') this.leave('The link to the crew was lost.');
    else if (this.role === 'host') this.teardown();
  }

  // ---------------------------------------------------------------- lobby
  crews() {
    const out = [];
    for (const p of this.lobby) {
      const pr = p.presence;
      if (p.sameTab || !pr || pr.bb !== PROTO || !okCode(pr.open)) continue;
      out.push({ peer: p.peer, code: pr.open, name: clean(pr.n, 28) || 'A captain', ship: clean(pr.ship, 32) || 'a sloop', day: int(pr.day, 1, 99999, 1), n: int(pr.crew, 0, 9), full: !!pr.full, guest: !!p.guest, mine: !!p.isMe });
    }
    return out;
  }
  sailors() {
    const out = [];
    for (const p of this.lobby) {
      const pr = p.presence;
      if (p.sameTab || !pr || pr.bb !== PROTO || okCode(pr.open)) continue;
      out.push({ name: clean(pr.n, 28) || 'A pirate', at: pr.at === 'crew' ? 'crew' : pr.at === 'sea' ? 'sea' : 'port' });
    }
    return out;
  }
  lobbyState() {
    const G = this.g, playing = G.state === 'play' || G.state === 'sheet';
    return {
      bb: PROTO, n: clean(G.look.name, 28), at: this.role === 'crew' ? 'crew' : playing ? 'sea' : 'port',
      open: this.role === 'host' && !this.closed ? this.code : null, ship: clean(G.look.ship, 32), day: G.sky.day, crew: this.crew.size, full: this.crew.size >= MAX_CREW,
    };
  }
  publishLobby(force) {
    if (!this.room || !this.available) return;
    const st = this.lobbyState();
    const key = JSON.stringify(st);
    if (!force && key === this.lobbyKey) return;
    this.lobbyKey = key;
    this.room.presence(st).catch(() => {});
  }

  // ---------------------------------------------------------------- the game's channel: a named room per crew
  async openChannel(code) {
    this.code = code;
    try { this.ch = await this.room.join(code); this.shared = false; }
    catch (e) { this.ch = this.room; this.shared = true; }     // no named rooms here: share the lobby, filtered by code
    if (!this.shared) {
      const ch = this.ch;
      ch.onPeers(() => {}, () => { if (this.ch === ch) this.channelLost(); });
    }
  }
  // the crew's room ended under us (after a reconnect that could not rejoin it)
  async channelLost() {
    if (this.role === 'crew') { this.leave('The link to the crew was lost.'); return; }
    if (this.role !== 'host') return;
    try { this.ch = await this.room.join(this.code); const ch = this.ch; ch.onPeers(() => {}, () => { if (this.ch === ch) this.channelLost(); }); }
    catch (e) { this.teardown(); this.g.ui.toast('Crew link lost', 'Your crew went back to their own voyages.', 'bad'); }
  }
  closeChannel() {
    const ch = this.ch, shared = this.shared;
    this.ch = null;
    if (!ch) return;
    if (shared) { const z = {}; for (const k of GAME_KEYS) z[k] = null; ch.presence(z).catch(() => {}); }
    else ch.leave().catch(() => {});
  }

  // ---------------------------------------------------------------- every frame
  update(frameDt) {
    if (!this.room) return;
    const G = this.g, now = performance.now();
    const dt = Math.min(1, Math.max(0, (now - (this.clock || now)) / 1000));
    this.clock = now;
    if (G.vmSwing > this.prevSwing + 0.2) this.swingN++;
    this.prevSwing = G.vmSwing;
    if (this.role && this.ch) {
      this.readChannel(dt);
      if (this.role === 'host') this.hostTick(dt);
      else if (this.role === 'crew') this.crewTick(dt);
    }
    if (this.role && this.ch) {
      this.sendT -= dt;
      if (this.sendT <= 0) { this.sendT = Math.max(0.02, this.sendT + SEND); this.publish(); }
    }
    this.lobbyT -= dt;
    if (this.lobbyT <= 0 && !(this.role && this.shared)) { this.lobbyT = 1; this.publishLobby(); }
    for (const m of this.mates.values()) m.update(frameDt);
  }
  mate(peer) {
    let m = this.mates.get(peer);
    if (!m) { m = new Mate(this, peer); this.mates.set(peer, m); }
    return m;
  }
  dropMate(peer) { const m = this.mates.get(peer); if (m) { m.dispose(); this.mates.delete(peer); } }
  readChannel(dt) {
    const seen = new Set();
    this.hostSeen = false;
    for (const p of this.ch.peers()) {
      if (p.sameTab || p.kind === 'agent') continue;
      const pr = p.presence;
      if (!pr || pr.bb !== PROTO || pr.g !== this.code) continue;
      if (this.role === 'host') { if (this.hostSees(p, pr)) seen.add(p.peer); }
      else if (this.crewSees(p, pr)) seen.add(p.peer);
    }
    if (this.role === 'host') {
      for (const [peer, rec] of this.crew) {
        if (seen.has(peer)) { rec.gone = 0; continue; }
        rec.gone = (rec.gone || 0) + dt;
        if (rec.gone > 7) this.dropCrew(peer, `${rec.mate.name} went back to their own voyage.`);
      }
    } else {
      for (const [peer, m] of this.mates) {
        if (seen.has(peer)) { m.miss = 0; continue; }
        m.miss += dt;
        if (m.miss > 7 && peer !== this.hostPeer) this.dropMate(peer);
      }
    }
  }
  publish() {
    if (!this.ch) return;
    const o = this.role === 'host' ? this.hostState() : this.crewState();
    if (this.shared) Object.assign(o, this.lobbyState());
    for (const k of GAME_KEYS) if (!has(o, k)) o[k] = null;
    this.ch.presence(o).catch((e) => { if (e && e.code === 'invalid_argument') console.warn('Crew update too large', size(o)); });
  }
  myP() {
    const G = this.g, P = G.player, item = G.hotbar[G.sel];
    return [r2(P.pos.x), r2(P.pos.y), r2(P.pos.z), r2(wrapAngle(P.emote ? P.emote.yaw : P.yaw)), r2(P.pitch), Math.max(0, ANIMS.indexOf(P.animState)), Math.max(0, HELD.indexOf(item === 'cutlass' || item === 'pick' || (isGun(item) && G.inv[item] > 0) ? item : '')),
      Math.max(0, MODES.indexOf(P.mode)), r2(P.local.x), r2(P.local.y), r2(P.local.z), Math.round(P.hp), P.maxHp, this.swingN, P.mode === 'deck' ? P.gun : -1,
      P.mode === 'deck' && P.ship && P.ship !== G.sloop ? (P.ship.remote ? P.ship.remote.nid : P.ship.nid) : 0, G.guns.shotN % 1000];
  }
  // fit the newest object under the byte budget: trim skeletons, then events, then the snapshot slice
  fit(o) {
    let sz = size(o);
    while (sz > BUDGET) {
      if (o.cr && o.cr.length > 10) o.cr = o.cr.slice(0, Math.floor(o.cr.length * 0.7));
      else if (o.e && o.e.length > 4) o.e = o.e.slice(0, Math.floor(o.e.length * 0.6));
      else if (o.ev && o.ev.length > 1) o.ev = o.ev.slice(0, Math.max(1, Math.floor(o.ev.length * 0.6)));
      else if (o.sn) delete o.sn;
      else if (o.mk && o.mk.length) o.mk = [];
      else if (o.e && o.e.length) o.e = [];
      else break;
      sz = size(o);
    }
    return o;
  }
  push(type, ...args) { this.out.push([++this.seq, type, ...args]); }
  // world edits so far go out first, so a crew member's copy of what follows sees the same world
  flushEdits() { if (this.batch.length) { for (let i = 0; i < this.batch.length; i += 160) this.push('w', ...this.batch.slice(i, i + 160)); this.batch = []; } }
  // something physical everyone should see: a blast, a tree coming down, a wall collapsing
  fx(...args) { if (!this.isHost || !this.crew.size) return; this.flushEdits(); this.push('fx', ...args); }
  onChat(mate, t) { this.addChat(mate.name, t, false); this.g.sfx.chirp(); }
  addChat(name, t, mine) {
    this.chat.push({ name, t, mine, at: performance.now() });
    if (this.chat.length > 6) this.chat.shift();
    this.g.ui.showChat(this.chat);
  }
  sendChat(t) {
    t = clean(t, 120);
    if (!t || !this.role) return;
    this.say = [Date.now() % 1e9, t];
    this.addChat(this.g.look.name, t, true);
  }
  onLook(m) {
    if (this.role === 'crew' && m.peer === this.hostPeer) {
      this.hostLook = m.look; this.hostName = m.name; this.hostShip = m.look.ship;
      const s = this.g.sloop;
      if (s && s.remote) s.setLook(m.look);
    }
  }

  // ================================================================= captain
  async startHost() {
    const G = this.g;
    if (!this.available || this.role || (G.state !== 'play' && G.state !== 'sheet')) return false;
    this.reset();
    this.role = 'host';
    await this.openChannel(newCode());
    if (this.role !== 'host') return false;
    G.world.onEdit = (i, id) => this.batch.push(i, id);
    this.publishLobby(true);
    G.ui.toast('Your voyage is open', 'Friends with this page open can join from Crew in their menu.', 'good');
    return true;
  }
  closeHost() {
    if (this.role !== 'host') return;
    this.teardown();
    this.g.ui.toast('Voyage closed', 'Your crew went back to their own voyages.', '');
  }
  setClosed(v) { this.closed = !!v; this.publishLobby(true); }
  kick(peer) {
    const rec = this.crew.get(peer);
    if (!rec) return;
    this.banned.add(peer);
    this.dropCrew(peer, `${rec.mate.name} was put ashore.`);
  }
  hostSees(p, pr) {
    if (pr.role !== 'crew' || pr.to !== this.me) return false;
    const G = this.g;
    let rec = this.crew.get(p.peer);
    if (!rec) {
      if ((this.banned && this.banned.has(p.peer)) || this.crew.size >= MAX_CREW || this.closed) return false;
      rec = { peer: p.peer, ack: this.seq, inSeq: 0, got: 0, rs: int(pr.rs, 0, 1e6), pres: null, mate: this.mate(p.peer), hm: null, gone: 0 };
      this.crew.set(p.peer, rec);
      this.needSnap = true; this.snap = null;
      rec.mate.apply(pr);
      G.ui.toast(`${rec.mate.name} is coming aboard`, 'They keep their own gold and gear. You call the course.', 'good');
      this.toastAll(`${rec.mate.name} joined the crew`, '', 'good', p.peer);
      this.publishLobby();
    }
    if (pr === rec.pres) return true;
    rec.pres = pr;
    rec.mate.apply(pr);
    if (fin(pr.ak)) rec.ack = clamp(Math.max(rec.ack, pr.ak), 0, this.seq);
    rec.got = int(pr.got, 0, 1e9);
    const rs = int(pr.rs, 0, 1e6);
    if (rs !== rec.rs) { rec.rs = rs; rec.ack = this.seq; rec.got = 0; this.needSnap = true; this.snap = null; }
    if (Array.isArray(pr.ev)) {
      for (const e of pr.ev) {
        if (!Array.isArray(e) || !fin(e[0]) || e[0] <= rec.inSeq) continue;
        rec.inSeq = e[0];
        try { this.hostHandle(rec, e); } catch (err) { console.warn('Crew request failed', err); }
      }
    }
    rec.hm = Array.isArray(pr.hm) ? pr.hm : null;
    return true;
  }
  dropCrew(peer, why) {
    const rec = this.crew.get(peer);
    if (!rec) return;
    this.crew.delete(peer);
    if (this.helmPeer === peer) this.releaseHelm();
    this.dropMate(peer);
    if (why) this.g.ui.toast('Crew', why, '');
    this.publishLobby();
  }
  releaseHelm() {
    const s = this.g.sloop;
    this.helmPeer = null;
    if (s) { s.sailLvl = 0; s.rudder = 0; s.reverse = false; }
  }
  hostHandle(rec, e) {
    const G = this.g, w = G.world, s = G.sloop;
    switch (e[1]) {
      case 'b': this.crewBreak(rec, int(e[2], 0, W - 1), int(e[3], 0, H - 1), int(e[4], 0, D - 1)); break;
      case 'cf': {
        // a crewmate fires the gun they're manning
        const i = int(e[2], 0, GUNS.length - 1), sl = G.sloop, m = rec.mate;
        if (!sl || sl.sinking || !m.has || m.mode !== 'deck' || m.gun !== i || sl.gunCD[i] > 0.4) break;
        sl.gunCD[i] = 2.2 * (sl.reloadMul || 1);
        fireGun(G, sl, i, num(e[3], -0.7, 0.7), num(e[4], -0.3, 0.5));
        break;
      }
      case 'kg': { const x = int(e[2], 0, W - 1), y = int(e[3], 0, H - 1), z = int(e[4], 0, D - 1); if (G.world.get(x, y, z) === B.KEG && rec.mate.has && Math.hypot(rec.mate.pos.x - x, rec.mate.pos.z - z) < 8) G.physics.ignite(x, y, z, 2.6, rec.peer); break; }
      case 'pl': {
        const x = int(e[2], 0, W - 1), y = int(e[3], 0, H - 1), z = int(e[4], 0, D - 1), id = int(e[5], 0, 255);
        const cur = w.get(x, y, z);
        const free = cur === B.AIR || BLOCKS[cur].plant, code = (v) => v >= 128 && v < 192;
        // building pieces: a cell's floor and walls can be added to or taken away from
        const piece = (id >= 128 && id <= 209 && (free || (code(id) && code(cur)))) || (id === 0 && BLOCKS[cur] && BLOCKS[cur].piece);
        const ok = (PLACEABLE.has(id) && free || piece) && y >= FLOOR && y < H - 1 && !G.isProtected(x, y, z);
        if (ok) w.set(x, y, z, id);
        else this.push('w', x + W * (z + D * y), cur);
        break;
      }
      case 'hk': {
        const sk = G.enemies.list.find((q) => q.nid === e[2]);
        if (sk && sk.state !== 'dying') { sk.lastBy = rec.peer; sk.hurt(num(e[3], 0, 14), { x: num(e[4], -1, 1), z: num(e[5], -1, 1) }); }
        break;
      }
      case 'hc': {
        const sc = G.crews.byNid(e[2]), m = rec.mate;
        if (!sc || sc.state === 'dead' || !m.has) break;
        const wp = G.crews.worldPos(sc, new THREE.Vector3());
        if (Math.hypot(wp.x - m.pos.x, wp.z - m.pos.z) > 5) break;
        G.crews.hurt(sc, num(e[3], 0, 30), { x: num(e[4], -1, 1), z: num(e[5], -1, 1) });
        break;
      }
      case 'gs': {
        // a crewmate's shot hit something: skeleton (s), sailor (c) or tentacle (t)
        const m = rec.mate, kind = e[2], dmg = num(e[4], 0, 60), dir = { x: num(e[5], -1, 1), z: num(e[6], -1, 1) };
        if (!m.has) break;
        if (kind === 's') {
          const sk = G.enemies.list.find((q) => q.nid === e[3]);
          if (sk && sk.state !== 'dying' && Math.hypot(sk.pos.x - m.pos.x, sk.pos.z - m.pos.z) < 100) { sk.lastBy = rec.peer; sk.hurt(dmg, dir); }
        } else if (kind === 'c') {
          const sc = G.crews.byNid(e[3]);
          if (sc && sc.state !== 'dead') { const wp = G.crews.worldPos(sc, new THREE.Vector3()); if (Math.hypot(wp.x - m.pos.x, wp.z - m.pos.z) < 100) G.crews.hurt(sc, dmg, dir); }
        } else if (kind === 't') {
          const k = G.kraken;
          if (k && k.alive && !k.remote) { const tn = k.tentacles.find((t) => t.nid === e[3]); if (tn) tn.damage(Math.min(20, dmg)); }
        }
        break;
      }
      case 'sb': {
        const sh = G.hollows.find((h) => h.nid === e[2]), m = rec.mate;
        if (!sh || !sh.taken || sh.looted || !m.has || Math.hypot(sh.pos.x - m.pos.x, sh.pos.z - m.pos.z) > 9) break;
        sh.looted = true;
        const r = G.strongboxLoot(sh);
        this.give(rec.peer, r.gold, r.items, `The ${sh.name || 'ship'}’s strongbox`, `${r.gold} gold and more. Bank it with Old Mags or stow it in the sea chest.`, 'good');
        break;
      }
      case 'kt': {
        const k = G.kraken;
        if (k && k.alive && !k.remote) { const tn = k.tentacles.find((t) => t.nid === e[2]); if (tn) tn.damage(num(e[3], 0, 10)); }
        break;
      }
      case 'f': {
        if (this.helmPeer !== rec.peer || !s || s.sinking) break;
        const n = fireBroadside(G, s, e[2] < 0 ? -1 : 1, G.broadsideTarget(e[2] < 0 ? -1 : 1), Math.min(s.guns, int(e[3], 0, 3)));
        if (n) this.push('fd', rec.peer, n);
        break;
      }
      case 'rp':
        if (s && !s.sinking && s.hp < s.maxHp) { s.hp = Math.min(s.maxHp, s.hp + 14); G.particles.burst(s.pos.x, s.pos.y + 1.3, s.pos.z, 0xc0915c, 10, 1.5, 2, 12, 0.6, 1.5); }
        break;
      case 'hl':
        if (e[2]) { if (!this.helmPeer && G.player.mode !== 'helm' && s && !s.sinking) this.helmPeer = rec.peer; }
        else if (this.helmPeer === rec.peer) this.releaseHelm();
        break;
      default: break;
    }
  }
  crewBreak(rec, x, y, z) {
    const G = this.g, w = G.world;
    const id = w.get(x, y, z);
    if (!id || y < FLOOR) return;
    if (G.isProtected(x, y, z)) { this.push('w', x + W * (z + D * y), id); return; }
    w.set(x, y, z, B.AIR);
    { const m = rec.mate, dx = x + 0.5 - (m.has ? m.pos.x : x), dz = z + 0.5 - (m.has ? m.pos.z : z), l = Math.hypot(dx, dz) || 1; G.physics.queueCheck(x, y, z, dx / l, dz / l, rec.peer); }
    if (id === B.CHEST) {
      const r = G.rollChest(x, y, z);
      if (r.story) {
        G.gold += r.gold; G.sfx.coin();
        G.ui.toast(r.title || 'Treasure', `${rec.mate.name} dug it up. +${r.gold} gold for the captain.`, r.kind || 'good');
        this.toast(rec.peer, r.title || 'Treasure', `The story’s gold goes into the captain’s purse.`, r.kind || 'good');
      } else this.give(rec.peer, r.gold, r.items, r.title, r.text, r.kind);
      if (r.cursed) G.curseAt(x, y, z, true);
    } else if (id === B.VAULT) G.openVault(x, y, z);
  }
  give(peer, gold, items = [], title = '', text = '', kind = '') {
    const flat = [];
    for (const [it, n] of items) flat.push(it, n);
    this.push('g', peer, Math.round(gold), flat, clean(title, 60), clean(text, 200), Math.max(0, KINDS.indexOf(kind)));
  }
  toast(peer, title, text, kind = '') { this.push('m', peer, clean(title, 60), clean(text, 200), Math.max(0, KINDS.indexOf(kind))); }
  toastAll(title, text, kind = '', except = null) {
    if (this.role !== 'host') return;
    for (const peer of this.crew.keys()) if (peer !== except) this.toast(peer, title, text, kind);
  }
  hurtPeer(peer, dmg, dir) {
    if (this.role !== 'host' || !this.crew.has(peer)) return;
    this.push('h', peer, Math.round(dmg), r2(dir ? dir.x : 0), r2(dir ? dir.z : 0));
  }
  // the kraken's slam shakes everyone on the captain's deck
  hurtAboard(dmg, chance) {
    if (this.role !== 'host') return;
    for (const rec of this.crew.values()) if (rec.mate.has && rec.mate.aboard && rec.mate.alive && Math.random() < chance) this.hurtPeer(rec.peer, dmg, null);
  }
  // a ship by the captain's id for it (the crew's copies are keyed by that id too)
  shipByNid(n) {
    if (!n) return null;
    if (this.role === 'crew') return this.hollowMap.get(n) || null;
    return this.g.hollows.find((h) => h.nid === n) || null;
  }
  addTargets(out) {
    for (const rec of this.crew.values()) {
      const m = rec.mate;
      if (!m.has) continue;
      out.push({ x: m.pos.x, y: m.pos.y, z: m.pos.z, alive: m.alive, foot: m.mode === 'foot', water: m.water, aboard: m.mode !== 'foot', peer: rec.peer });
    }
  }
  onShot(ship, x, y, z, vx, vy, vz) {
    if (this.role !== 'host' || !this.crew.size) return;
    this.push('pb', r2(x), r2(y), r2(z), r2(vx), r2(vy), r2(vz), ship === this.g.sloop ? 0 : ship.nid);
  }
  // salvage gold: shared by everyone on the captain's deck when the one who reached it is aboard
  shareSalvage(gold, collector) {
    const G = this.g, P = G.player;
    const aboard = [...this.crew.values()].filter((r) => r.mate.has && r.mate.aboard && r.mate.alive).map((r) => r.peer);
    const hostAboard = (P.mode === 'deck' || P.mode === 'helm') && P.alive;
    const collectorAboard = collector ? aboard.includes(collector) : hostAboard;
    let takers = collectorAboard ? [...(hostAboard ? [null] : []), ...aboard] : [collector];
    if (!takers.length) takers = [collector];
    const share = Math.max(1, Math.floor(gold / takers.length));
    for (const t of takers) {
      if (t === null) { G.gold += share; G.sfx.coin(); G.ui.toast('Salvage', takers.length > 1 ? `+${share} gold, your share of a Hollow chest.` : `+${share} gold from a Hollow chest. Bank it with Old Mags.`, 'good'); }
      else this.give(t, share, [], 'Salvage', takers.length > 1 ? `+${share} gold, your share of a Hollow chest.` : `+${share} gold from a Hollow chest. Bank it with Old Mags.`, 'good');
    }
  }
  hostTick(dt) {
    const G = this.g;
    if (this.batch.length) {
      for (let i = 0; i < this.batch.length; i += 160) this.push('w', ...this.batch.slice(i, i + 160));
      this.batch = [];
    }
    if (this.helmPeer) {
      const rec = this.crew.get(this.helmPeer), s = G.sloop;
      if (!rec || !s || s.sinking) this.releaseHelm();
      else if (rec.hm) { s.sailLvl = num(rec.hm[0], 0, 1); s.rudder = num(rec.hm[1], -1, 1); s.reverse = rec.hm[2] === 1; }
    }
    // a crew member who reaches a floating Hollow chest first gets it
    const loot = G.props.loot;
    for (let i = loot.length - 1; i >= 0; i--) {
      const L = loot[i];
      if (L.remote) continue;
      for (const rec of this.crew.values()) {
        const m = rec.mate;
        if (m.has && m.alive && Math.hypot(m.pos.x - L.x, m.pos.z - L.z) < 5) { this.shareSalvage(L.gold, rec.peer); G.props.removeLoot(i); break; }
      }
    }
    if (this.needSnap && !this.snapBusy) this.buildSnap();
    // drop events everyone has; a crew member far behind gets a fresh world instead of the backlog
    let minAck = this.seq;
    for (const rec of this.crew.values()) {
      if (this.seq - rec.ack > 400) rec.ack = this.seq;
      minAck = Math.min(minAck, rec.ack);
    }
    if (this.out.length && this.out[0][0] <= minAck) this.out = this.out.filter((e) => e[0] > minAck);
  }
  async buildSnap() {
    this.snapBusy = true; this.needSnap = false; this.snap = null;
    if (this.batch.length) { for (let i = 0; i < this.batch.length; i += 160) this.push('w', ...this.batch.slice(i, i + 160)); this.batch = []; }
    const base = this.seq;
    try {
      const p = await packEdits(this.g.world.edits);
      if (this.needSnap || this.role !== 'host') { this.snapBusy = false; return; }   // someone else came aboard meanwhile: take it again
      const chunks = [];
      for (let i = 0; i < p.b.length; i += CHUNK) chunks.push(p.b.slice(i, i + CHUNK));
      if (!chunks.length) chunks.push('');
      this.snap = { id: (this.snap ? this.snap.id : 0) + 1, base, z: p.z, n: p.n, chunks, i: 0 };
    } catch (e) { this.needSnap = true; }
    this.snapBusy = false;
  }
  hostState() {
    const G = this.g, P = G.player, s = G.sloop;
    const o = { bb: PROTO, g: this.code, role: 'host', lk: packLook(G.look, G.pet), p: this.myP() };
    o.w = [r1(G.time), r2(G.weather.storm), r2(G.weather.target), r3(G.wind.angle), G.isLit() ? 1 : 0];
    const tr = G.quests.tracked_();
    const mk = tr.marker;
    o.ob = [clean(tr.title, 60), clean(tr.text, 160), mk ? r1(mk.x) : null, mk ? r1(mk.z) : null, mk ? ICONS.indexOf(mk.icon) : -1];
    o.mk = G.quests.markers().slice(0, 5).map((m) => [ICONS.indexOf(m.icon), r1(m.x), r1(m.z), m.tracked ? 1 : 0, m.r ? r1(m.r) : 0]);
    if (s) o.sh = [s.nid, r2(s.pos.x), r2(s.pos.z), r3(s.heading), r2(s.speed), r2(s.sailLvl), r2(s.rudder), Math.round(s.hp), s.maxHp, s.sinking ? 1 : 0, s.guns, s.reverse ? 1 : 0];
    o.hl = this.helmPeer || (P.mode === 'helm' && P.alive ? this.me : null);
    o.hs = G.hollows.slice(0, 7).map((h) => [h.nid, h.variant === 'flagship' ? 1 : 0, r2(h.pos.x), r2(h.pos.z), r3(h.heading), r2(h.speed), r2(h.sailLvl), r2(h.rudder), Math.round(h.hp), h.maxHp, h.sinking ? 1 : 0, Math.max(0, FLEET_KINDS.indexOf(h.kind)), SHIP_NAMES[h.kind] ? Math.max(0, SHIP_NAMES[h.kind].indexOf(h.name)) : 0, h.taken ? 1 : 0, h.looted ? 1 : 0]);
    {
      const cp = [...this.crew.values()].filter((r) => r.mate.has).map((r) => r.mate.pos);
      o.cr = G.crews.state((ship) => cp.some((q) => Math.hypot(q.x - ship.pos.x, q.z - ship.pos.z) < 110));
    }
    // skeletons near any crew member, nearest first
    const crewPos = [...this.crew.values()].filter((r) => r.mate.has).map((r) => r.mate.pos);
    const near = [];
    for (const sk of G.enemies.list) {
      let d = 1e9;
      for (const q of crewPos) d = Math.min(d, Math.hypot(q.x - sk.pos.x, q.z - sk.pos.z));
      if (d < 85) near.push([d, sk]);
    }
    near.sort((a, b) => a[0] - b[0]);
    o.e = near.slice(0, 18).map(([, sk]) => [sk.nid, Math.max(0, SKK.indexOf(sk.kind)), r2(sk.pos.x), r2(sk.pos.y), r2(sk.pos.z), r2(wrapAngle(sk.yaw)), sk.state === 'rising' ? 0 : sk.state === 'dying' ? 2 : 1, sk.atkN % 1000, Math.max(0, Math.round((sk.hp / sk.maxHp) * 100))]);
    const k = G.kraken;
    if (k && !k.dead && !k.remote) {
      const hp = k.head ? k.head.position : null;
      o.k = [k.state === 'head' ? 1 : k.state === 'dying' ? 2 : 0, Math.max(0, Math.round(k.headHp)), k.headMax, hp ? r2(hp.x) : 0, hp ? r2(hp.y) : 0, hp ? r2(hp.z) : 0,
        k.tentacles.slice(0, 10).map((t) => [t.nid, r3(t.angle), r2(t.radius), r2(t.rise), r2(Math.max(0, t.slam)), t.alive ? 1 : 0, r2(Math.max(0, t.hp) / t.maxHp), r2(t.phase)])];
    }
    o.L = G.props.loot.filter((L) => !L.remote).slice(0, 8).map((L) => [L.nid, r1(L.x), r1(L.z)]);
    o.acc = [...this.crew.keys()];
    o.ak = [...this.crew.values()].map((r) => [r.peer, r.inSeq]);
    o.say = this.say;
    o.ev = this.out.slice(0, 60);
    const want = this.snap && [...this.crew.values()].some((r) => r.got !== this.snap.id && r.got === 0);
    if (want) {
      const S = this.snap, i = S.i % S.chunks.length;
      S.i = i + 1;
      o.sn = [S.id, S.base, S.z, S.n, S.chunks.length, i, S.chunks[i]];
    }
    return this.fit(o);
  }

  // ================================================================= crew
  async join(entry) {
    const G = this.g;
    if (!this.available || this.role || !entry || !okCode(entry.code) || (G.state !== 'play' && G.state !== 'sheet')) return;
    let solo;
    try { solo = await G.buildDoc(); } catch (e) { G.ui.toast('Could not join', 'Your own voyage could not be saved first.', 'bad'); return; }
    if (this.role) return;
    G.saves.write('auto', solo);
    this.soloDoc = solo;
    this.reset();
    this.role = 'crew'; this.hostPeer = entry.peer; this.hostName = entry.name; this.hostShip = entry.ship;
    if (G.sheets.name) G.sheets.close();
    G.state = 'loading';
    G.input.exitLock();
    G.ui.showHud(false); G.ui.fade(true);
    G.ui.netNote(`Rowing out to ${entry.ship}…`);
    await this.openChannel(entry.code);
    this.publishLobby(true);
  }
  // back to your own voyage, carrying your gold, gear and look
  async leave(reason) {
    if (this.role !== 'crew' || this.leaving) return;
    this.leaving = true;
    const G = this.g, was = this.joined;
    const doc = was ? this.crewDoc() : this.soloDoc;
    this.teardown();
    G.ui.netNote(null);
    try { await G.loadDoc(doc, true); }
    catch (e) { console.error(e); G.ui.fade(false); G.state = 'title'; G.ui.showTitle(true); G.refreshTitle(); }
    if (was) G.saves.write('auto', doc);
    if (reason) G.ui.toast('Back on your own voyage', reason, '');
  }
  // the save written while crewing: your own voyage, with your personal progress from the crew session
  crewDoc() {
    const G = this.g, base = this.soloDoc;
    const data = JSON.parse(JSON.stringify(base.data));
    Object.assign(data, {
      look: { ...G.look }, inv: { ...G.inv }, hotbar: [...G.hotbar], sel: G.sel, gold: G.gold, banked: G.banked, earned: G.earned,
      stats: { ...G.stats }, upgrades: { ...G.upgrades }, hints: { ...G.hints }, pet: G.pet, camMode: G.camMode,
    });
    if (data.player) { data.player.hp = Math.max(30, Math.round(G.player.hp)); data.player.hunger = Math.round(G.player.hunger); }
    if (data.quests && Array.isArray(data.quests.discovered)) data.quests.discovered = [...new Set([...data.quests.discovered, ...G.quests.discovered])];
    return { meta: { ...base.meta, savedAt: Date.now(), name: G.look.name, ship: G.look.ship, banked: G.banked }, data };
  }
  crewSees(p, pr) {
    if (p.peer === this.hostPeer) {
      if (pr.role !== 'host') return false;
      this.hostSeen = true;
      this.crewHost(pr);
      return true;
    }
    if (pr.role !== 'crew' || pr.to !== this.hostPeer || !this.joined) return false;
    const acc = this.hostPres && Array.isArray(this.hostPres.acc) ? this.hostPres.acc : [];
    if (!acc.includes(p.peer)) return false;
    this.mate(p.peer).apply(pr);
    return true;
  }
  crewHost(pr) {
    if (pr === this.hostPres) return;
    this.hostPres = pr; this.hostAt = performance.now();
    if (this.stalled) { this.stalled = false; if (this.joined) this.g.ui.pickup('The captain is back'); }
    const acc = Array.isArray(pr.acc) ? pr.acc : [];
    const inside = !!this.me && acc.includes(this.me);
    if (inside) this.accepted = true;
    else if (this.accepted) { this.leave('The captain put you ashore.'); return; }
    const hm = this.mate(this.hostPeer);
    hm.role = 'host';
    hm.apply(pr);
    if (Array.isArray(pr.ak)) for (const a of pr.ak) if (Array.isArray(a) && a[0] === this.me && fin(a[1])) { const n = a[1]; if (this.out.length && this.out[0][0] <= n) this.out = this.out.filter((e) => e[0] > n); }
    if (!this.accepted) return;
    if (Array.isArray(pr.ev)) {
      for (const e of pr.ev) {
        if (!Array.isArray(e) || !fin(e[0]) || e[0] <= this.hostAck) continue;
        if (this.hostAck && e[0] !== this.hostAck + 1) { this.resync(); break; }
        this.hostAck = e[0];
        if (this.joined && !this.entering) this.crewHandle(e);
        if (!this.joined || this.entering || this.gotSnap === 0) this.buf.push(e);
      }
    }
    if (Array.isArray(pr.sn) && (!this.joined || this.gotSnap === 0)) this.collect(pr.sn);
    if (this.joined && !this.entering) this.applyHostState(pr);
  }
  resync() {
    this.rs++; this.gotSnap = 0; this.hostAck = 0; this.buf = []; this.asm = null;
  }
  collect(sn) {
    const [id, base, z, n, count, idx, data] = sn;
    if (!fin(id) || !fin(base) || !fin(count) || count < 1 || count > 4000 || !fin(idx) || typeof data !== 'string') return;
    if (!this.asm || this.asm.id !== id) this.asm = { id, base, z: z === 'deflate-raw' || z === 'gzip' ? z : '', n: int(n, 0, VOLUME), count, parts: new Array(count).fill(null), have: 0 };
    const A = this.asm;
    if (idx >= 0 && idx < A.count && A.parts[idx] == null) { A.parts[idx] = data; A.have++; }
    if (!this.joined) this.g.ui.netNote(`Rowing out to ${this.hostShip || 'the ship'}… ${Math.round((A.have / A.count) * 100)}%`);
    if (A.have === A.count && !A.busy) this.finishSnap(A);
  }
  async finishSnap(A) {
    A.busy = true;
    let edits;
    try { edits = await unpackEdits({ z: A.z, n: A.n, b: A.parts.join('') }); }
    catch (e) { this.resync(); return; }
    if (this.role !== 'crew' || this.asm !== A) return;
    const ok = [];
    for (const [i, id] of edits) if (fin(i) && i >= 0 && i < VOLUME && BLOCKS[id]) ok.push([i, id]);
    const later = this.buf.filter((e) => e[0] > A.base).sort((a, b) => a[0] - b[0]);
    this.buf = []; this.asm = null; this.gotSnap = A.id;
    if (!this.joined) this.enterWorld(ok, later);
    else this.reloadWorld(ok, later);
  }
  enterWorld(edits, later) {
    const G = this.g, pr = this.hostPres;
    this.entering = true;
    try {
      G.clearVoyage();
      G.removeShip(G.sloop);
      G.world.generate();
      G.world.applyEdits(edits);
      G.world.resetMeshes();
      const sh = pr && Array.isArray(pr.sh) ? pr.sh : null, hp = pr && Array.isArray(pr.p) ? pr.p : null;
      const fx = sh ? num(sh[1], 0, W) : hp ? num(hp[0], 0, W) : G.world.spawn.x, fz = sh ? num(sh[2], 0, D) : hp ? num(hp[2], 0, D) : G.world.spawn.z;
      G.world.buildNear(fx, fz, 64);
      G.ocean.rebuildDepth(G.world);
      G.ui.mapBase = null; G.ui.roseAt = null;
      G.fauna.populate();
      this.joined = true;
      for (const e of later) this.crewHandle(e);
      this.applyHostState(pr);
      const P = G.player;
      P.alive = true; P.vel.set(0, 0, 0); P.boardCD = 0;
      const hostAboard = hp && int(hp[7], 0, 2) > 0;
      if (G.sloop && (hostAboard || !hp)) G.boardSloop((Math.random() - 0.5) * 1.6, 0.6 + Math.random() * 1.6);
      else {
        const x = hp ? num(hp[0], 1, W - 1) : G.world.spawn.x, z = hp ? num(hp[2], 1, D - 1) : G.world.spawn.z;
        P.mode = 'foot'; P.pos.set(x + 1.2, (hp ? num(hp[1], 0, H) : SEA + 8) + 0.3, z + 1.2);
        if (P.collides()) P.pos.y = G.world.standY(Math.floor(P.pos.x), Math.floor(P.pos.z)) + 0.001;
      }
    } finally { this.entering = false; }
    G.startPlay();
    G.ui.fade(false); G.ui.netNote(null);
    G.ui.toast(`Aboard ${this.hostShip || 'the ship'}`, `You sail with ${this.hostName}. Your gold and gear are your own; the course and the story are the captain’s.`, 'good');
    G.after(6, () => { if (this.inCrew) G.ui.toast('Crew', G.isTouch ? 'Chat with the Chat button. Take the wheel when the captain leaves it.' : 'Press T to chat. Take the wheel when the captain leaves it.'); });
  }
  reloadWorld(edits, later) {
    const G = this.g, P = G.player;
    G.world.generate();
    G.world.applyEdits(edits);
    G.world.resetMeshes();
    G.world.buildNear(P.pos.x, P.pos.z, 64);
    G.ocean.rebuildDepth(G.world);
    G.ui.mapBase = null;
    for (const e of later) if (e[1] === 'w') this.crewHandle(e);     // everything else already happened once
  }
  crewHandle(e) {
    const G = this.g, me = this.me;
    switch (e[1]) {
      case 'w':
        for (let k = 2; k + 1 < e.length; k += 2) {
          const i = e[k], id = e[k + 1];
          if (!fin(i) || i < 0 || i >= VOLUME || !fin(id) || !BLOCKS[id]) continue;
          G.world.set(i % W, Math.floor(i / (W * D)), Math.floor(i / W) % D, id);
        }
        break;
      case 'h': if (e[2] === me && G.player.alive) G.player.hurt(num(e[3], 0, 60), { x: num(e[4], -1, 1), z: num(e[5], -1, 1) }); break;
      case 'g':
        if (e[2] === me) {
          const gold = int(e[3], 0, 5000);
          G.gold += gold;
          if (gold) G.sfx.coin();
          const items = Array.isArray(e[4]) ? e[4] : [];
          for (let k = 0; k + 1 < items.length; k += 2) { const it = items[k], n = int(items[k + 1], 0, 50); if (typeof it === 'string' && has(ITEMS, it) && n > 0) { G.give(it, n); if (it === 'wood') G.stats.wood += n; } }
          const title = clean(e[5], 60), text = clean(e[6], 200);
          if (title) G.ui.toast(title, text, KINDS[int(e[7], 0, 3)]); else if (gold) G.ui.pickup(`+${gold} gold`);
        }
        break;
      case 'm': if (e[2] === me) G.ui.toast(clean(e[3], 60), clean(e[4], 200), KINDS[int(e[5], 0, 3)]); break;
      case 'fx': G.physics.onFx(e.slice(2)); break;
      case 'fd': if (e[2] === me) { G.inv.ball = Math.max(0, (G.inv.ball || 0) - int(e[3], 0, 3)); G.shake(0.15); } break;
      case 'pb': {
        const v = e.slice(2, 8);
        if (!v.every(fin)) break;
        const owner = e[8] === 0 ? G.sloop : this.hollowMap.get(e[8]) || null;
        G.projectiles.spawn(num(v[0], -50, W + 50), num(v[1], -10, 80), num(v[2], -50, D + 50), num(v[3], -80, 80), num(v[4], -80, 80), num(v[5], -80, 80), owner, 1, true);
        if (owner) G.particles.burst(v[0], v[1], v[2], 0xffb347, 6, 2.5, 1.5, 0, 0.18, 0.2);
        const t = performance.now();
        if (t - this.boomAt > 250) { this.boomAt = t; G.sfx.boom(G.distToListener(v[0], v[2])); }
        break;
      }
      default: break;
    }
  }
  applyHostState(pr) {
    if (!pr) return;
    const G = this.g, now = performance.now();
    if (Array.isArray(pr.w)) {
      this.hostTime = num(pr.w[0], -1e7, 1e9, G.time); this.hostTimeAt = now;
      const storm = num(pr.w[1], 0, 1), target = num(pr.w[2], 0, 1);
      G.weather.follow = target;
      if (Math.abs(G.weather.storm - storm) > 0.25) G.weather.storm = storm;
      G.wind.angle = G.wind.target = num(pr.w[3], -1000, 1000, G.wind.angle);
      this.hostLit = pr.w[4] === 1;
    }
    if (Array.isArray(pr.ob)) {
      const o = pr.ob, ic = ICONS[int(o[4], -1, ICONS.length - 1, -1)];
      this.obj = { title: 'Captain’s orders', text: clean(o[1], 160) || 'Follow the captain', marker: fin(o[2]) && fin(o[3]) && ic ? { x: num(o[2], 0, W), z: num(o[3], 0, D), icon: ic } : null, id: 'crew' };
    }
    if (Array.isArray(pr.mk)) {
      this.marks = pr.mk.slice(0, 6).filter((m) => Array.isArray(m) && ICONS[m[0]]).map((m) => ({ icon: ICONS[m[0]], x: num(m[1], 0, W), z: num(m[2], 0, D), tracked: m[3] === 1, r: m[4] > 0 ? num(m[4], 0, 40) : undefined }));
    }
    this.helmHolder = peerId(pr.hl);
    this.syncSloop(pr.sh, now);
    this.syncHollows(Array.isArray(pr.hs) ? pr.hs : [], now);
    this.syncSkeletons(Array.isArray(pr.e) ? pr.e : []);
    G.crews.syncPuppets((Array.isArray(pr.cr) ? pr.cr : []).filter((e) => Array.isArray(e) && e.length >= 12 && e.every(fin)).slice(0, 32)
      .map((e) => [e[0], e[1], int(e[2], 0, 3), int(e[3], 0, 3), int(e[4], 0, 1e5), num(e[5], -4, 4), num(e[6], -2, 12), num(e[7], -9, 9), num(e[8], -10, 10), int(e[9], 0, 5), int(e[10], 0, 1000), int(e[11], 0, 100)]), (n) => this.hollowMap.get(n) || null);
    this.syncKraken(Array.isArray(pr.k) ? pr.k : null);
    this.syncLoot(Array.isArray(pr.L) ? pr.L : []);
  }
  syncSloop(sh, now) {
    const G = this.g, P = G.player;
    let s = G.sloop;
    if (!Array.isArray(sh) || sh.length < 12 || !sh.slice(0, 9).every(fin)) {
      if (s && s.remote) { if (P.mode !== 'foot') P.leaveShip(s); G.removeShip(s); }
      return;
    }
    const nid = sh[0], x = num(sh[1], 0, W), z = num(sh[2], 0, D), h = num(sh[3], -1000, 1000);
    if (!s || !s.remote || s.remote.nid !== nid) {
      if (s) { if (P.mode !== 'foot') P.leaveShip(s); G.removeShip(s); }
      s = new Ship(G.scene, 'sloop', { look: this.hostLook || G.look });
      s.remote = { nid, x, z, h, speed: 0, sail: 0, rudder: 0, at: now, snap: true, mine: false };
      s.place(x, z, h);
      G.sloop = s;
    }
    const r = s.remote;
    r.x = x; r.z = z; r.h = h; r.at = now;
    r.speed = num(sh[4], -5, 30); r.sail = num(sh[5], 0, 1); r.rudder = num(sh[6], -1, 1);
    r.mine = P.mode === 'helm';
    s.hp = num(sh[7], 0, 2000); s.maxHp = num(sh[8], 1, 2000, 120); s.guns = int(sh[10], 1, 3, 2);
    if (sh[9] === 1 && !s.sinking) { s.sinking = true; s.sinkT = 0; s.speed = 0; }
  }
  syncHollows(list, now) {
    const G = this.g, seen = new Set();
    for (const e of list.slice(0, 7)) {
      if (!Array.isArray(e) || e.length < 11 || !e.slice(0, 10).every(fin)) continue;
      const nid = e[0];
      seen.add(nid);
      let s = this.hollowMap.get(nid);
      const x = num(e[2], 0, W), z = num(e[3], 0, D), h = num(e[4], -1000, 1000);
      if (!s) {
        s = new Ship(G.scene, FLEET_KINDS[int(e[11], 0, FLEET_KINDS.length - 1)] || 'hollow', { variant: e[1] === 1 ? 'flagship' : 'normal', nameIx: int(e[12], 0, 9) });
        s.remote = { nid, x, z, h, speed: 0, sail: 0, rudder: 0, at: now, snap: true, mine: false };
        s.place(x, z, h);
        this.hollowMap.set(nid, s); G.hollows.push(s);
      }
      const r = s.remote;
      r.x = x; r.z = z; r.h = h; r.at = now; r.speed = num(e[5], -5, 30); r.sail = num(e[6], 0, 1); r.rudder = num(e[7], -1, 1);
      s.hp = num(e[8], 0, 5000); s.maxHp = num(e[9], 1, 5000, 110);
      if (e[10] === 1 && !s.sinking) { s.sinking = true; s.sinkT = 0; s.speed = 0; }
      s.taken = e[13] === 1; if (e[14] === 1) s.looted = true;
    }
    for (const [nid, s] of this.hollowMap) {
      if (seen.has(nid)) continue;
      s.dispose(); G.hollows = G.hollows.filter((x) => x !== s); this.hollowMap.delete(nid);
    }
  }
  syncSkeletons(list) {
    const G = this.g, E = G.enemies, seen = new Set();
    for (const e of list.slice(0, 24)) {
      if (!Array.isArray(e) || e.length < 9 || !e.every(fin)) continue;
      const nid = e[0];
      seen.add(nid);
      const st = int(e[6], 0, 2), x = num(e[2], 0, W), y = num(e[3], -10, H + 10), z = num(e[4], 0, D);
      let sk = this.skelMap.get(nid);
      if (!sk) {
        if (st === 2) continue;
        sk = new Skeleton(G, x, y, z, { kind: SKK[int(e[1], 0, 3)], nid });
        sk.net = { x, y, z, yaw: 0, st, atkN: 0 };
        if (st === 1) { sk.state = 'walk'; sk.group.position.set(x, y, z); }
        sk.atkN = int(e[7], 0, 1000); sk.netHp = e[8];
        this.skelMap.set(nid, sk); E.list.push(sk);
      }
      sk.miss = 0;
      sk.net = { x, y, z, yaw: num(e[5], -10, 10), st, atkN: int(e[7], 0, 1000) };
      if (e[8] < sk.netHp) sk.flash = 1;
      sk.netHp = e[8];
    }
    for (const [nid, sk] of this.skelMap) {
      if (seen.has(nid)) continue;
      sk.miss = (sk.miss || 0) + 1;
      if (sk.miss < 6 && sk.state !== 'dying') continue;
      sk.dispose(); this.skelMap.delete(nid);
      const i = E.list.indexOf(sk); if (i >= 0) E.list.splice(i, 1);
    }
  }
  syncKraken(k) {
    const G = this.g;
    if (k && k.length >= 7 && k.slice(0, 6).every(fin) && Array.isArray(k[6])) {
      if (!G.kraken || !G.kraken.remote) {
        if (G.kraken) G.killKraken();
        G.kraken = new KrakenPuppet(G);
        G.ui.toast('The Deep One', 'The sea boils around the hull. Hack at the tentacles with your cutlass!', 'curse');
      }
      const tents = k[6].slice(0, 12).filter((t) => Array.isArray(t) && t.length >= 8 && t.every(fin)).map((t) => [t[0], num(t[1], -100, 100), num(t[2], 2, 20), num(t[3], 0, 1), num(t[4], 0, 3), t[5], num(t[6], 0, 1), num(t[7], -100, 100)]);
      G.kraken.apply([int(k[0], 0, 2), num(k[1], 0, 1e4), num(k[2], 1, 1e4, 200), num(k[3], 0, W), num(k[4], -40, 40), num(k[5], 0, D), tents]);
    } else if (G.kraken && G.kraken.remote) { G.kraken.dispose(); G.kraken = null; if (G.sloop) G.sloop.hold = 1; }
  }
  syncLoot(list) {
    const G = this.g, seen = new Set();
    for (const e of list.slice(0, 10)) {
      if (!Array.isArray(e) || e.length < 3 || !e.every(fin)) continue;
      seen.add(e[0]);
      if (!this.lootMap.has(e[0])) this.lootMap.set(e[0], G.props.spawnLoot(num(e[1], 0, W), num(e[2], 0, D), 0, e[0]));
    }
    for (const [nid, L] of this.lootMap) {
      if (seen.has(nid)) continue;
      const i = G.props.loot.indexOf(L);
      if (i >= 0) { G.particles.burst(L.x, L.mesh.position.y + 0.4, L.z, 0x8affc8, 12, 1.6, 2, 6, 0.8, 0.6); G.props.removeLoot(i); }
      this.lootMap.delete(nid);
    }
  }
  crewTick(dt) {
    const G = this.g, P = G.player;
    if (!this.hostSeen) {
      this.goneT += dt;
      if (this.goneT > (this.joined ? 9 : 20)) { this.leave(this.joined ? 'The captain’s ship has sailed out of reach.' : 'That ship could not be reached.'); return; }
    } else this.goneT = 0;
    if (!this.joined) {
      this.joinT += dt;
      if (this.joinT > 45) this.leave('That ship could not be reached.');
      else if (this.hostSeen && !this.accepted && this.joinT > 12) this.leave('That crew is full.');
      return;
    }
    // a captain whose tab is hidden stops the world: say so instead of leaving everyone puzzled
    if (!this.stalled && this.hostAt && performance.now() - this.hostAt > 5000) { this.stalled = true; G.ui.toast('The captain’s game is paused', 'Their window may be hidden. The sea waits for them.', ''); }
    if (this.hostTimeAt && !this.stalled) {
      const target = this.hostTime + (performance.now() - this.hostTimeAt) / 1000, d = target - G.time;
      G.time = Math.abs(d) > 4 ? target : G.time + d * Math.min(1, dt * 0.8);
    }
    if (P.mode === 'helm') {
      if (!G.sloop || G.sloop.sinking) { P.mode = 'deck'; this.helmLost = 0; }
      else if (this.helmHolder !== this.me) {
        this.helmLost += dt;
        if (this.helmLost > 2) {
          this.helmLost = 0;
          P.mode = 'deck'; P.local.set(0, P.local.y, 3.0);
          G.ui.toast('The wheel is taken', 'Someone else is steering.', '');
          this.push('hl', 0);
        }
      } else this.helmLost = 0;
    }
  }
  crewState() {
    const G = this.g, P = G.player, s = G.sloop;
    const o = { bb: PROTO, g: this.code, role: 'crew', to: this.hostPeer, lk: packLook(G.look, G.pet), p: this.joined ? this.myP() : null, ak: this.hostAck, got: this.gotSnap, rs: this.rs, say: this.say };
    o.hm = P.mode === 'helm' && s ? [r2(s.sailLvl), r2(s.rudder), s.reverse ? 1 : 0] : null;
    o.ev = this.out.slice(0, 40);
    return this.fit(o);
  }
  // ---- what the crew member's own actions turn into
  req(type, ...args) { if (this.inCrew) this.push(type, ...args); }
  helmFree() { return !this.helmHolder; }
  takeHelm() { this.helmLost = 0; this.helmHolder = this.helmHolder || this.me; this.push('hl', 1); }
  leaveHelm() { this.push('hl', 0); }
  crewObjective() { return this.inCrew ? this.obj : null; }
  crewMarkers() { return this.inCrew ? this.marks || [] : null; }
  // who holds the captain's wheel, if not this player: shown at the wheel
  // the name of whoever else is on gun i, if anyone
  gunBusy(i) {
    for (const m of this.mates.values()) if (m.has && m.alive && m.mode === 'deck' && m.gun === i) return m.name;
    return null;
  }
  helmBusy() {
    if (this.role === 'host') return this.helmPeer ? this.mates.get(this.helmPeer)?.name || 'A crewmate' : null;
    if (this.inCrew) {
      const h = this.helmHolder;
      if (!h || h === this.me) return null;
      return this.mates.get(h)?.name || 'The captain';
    }
    return null;
  }

  // ---------------------------------------------------------------- shared
  roster() {
    const out = [];
    for (const m of this.mates.values()) if (m.has) out.push({ name: m.name, hp: m.hp, maxHp: m.maxHp, alive: m.alive, host: m.role === 'host', aboard: m.aboard, x: m.pos.x, z: m.pos.z });
    return out;
  }
  // leave whatever crew this is, without touching the world (the caller is about to replace it)
  end() {
    if (!this.role) return;
    this.teardown();
  }
  teardown() {
    const G = this.g;
    this.closeChannel();
    for (const m of this.mates.values()) m.dispose();
    this.mates.clear();
    G.world.onEdit = null;
    G.weather.follow = null;
    for (const s of this.hollowMap.values()) { s.dispose(); G.hollows = G.hollows.filter((x) => x !== s); }
    for (const sk of this.skelMap.values()) { sk.dispose(); const i = G.enemies.list.indexOf(sk); if (i >= 0) G.enemies.list.splice(i, 1); }
    for (const L of this.lootMap.values()) { const i = G.props.loot.indexOf(L); if (i >= 0) G.props.removeLoot(i); }
    if (G.kraken && G.kraken.remote) { G.kraken.dispose(); G.kraken = null; }
    // the captain's ship stays with the captain: put your own sloop back at the pier until your voyage reloads
    if (G.sloop && G.sloop.remote) {
      const P = G.player;
      if (P.mode !== 'foot') { P.mode = 'foot'; P.vel.set(0, 0, 0); }
      G.spawnSloop(null);
    }
    const banned = this.banned;
    this.role = null; this.code = null;
    this.reset();
    this.banned = banned || new Set();
    this.chat = [];
    G.ui.showChat(this.chat);
    this.publishLobby(true);
  }
}
