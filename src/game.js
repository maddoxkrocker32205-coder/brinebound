import * as THREE from 'three';
import { W, D, H, SEA, WATER_Y, FLOOR, WORLD_Y_SHIFT, LEGACY_W, LEGACY_D, PREVIOUS_MAP_W, SEED, B, BLOCKS, ITEMS, RECIPES, DEFAULT_HOTBAR, VERSION, clamp, wrapAngle } from './config.js';
import { World, TERRAIN, CRISP } from './world.js';
import { Ocean, waveHeight, waveState } from './water.js';
import { Sky, CYCLE } from './sky.js';
import { Ship, SHIP, HELM, LADDER, CHEST, GUNS, PLAYER_VESSELS, gunPlace, fireBroadside, fireGun, SCALE } from './ship.js';
import { Player, EMOTES } from './player.js';
import { Enemies, hollowAI } from './enemies.js';
import { Particles, Projectiles } from './fx.js';
import { Physics, kindOf } from './physics.js';
import { Hook } from './hook.js';
import { Builder, withoutPart } from './build.js';
import { Fleet } from './fleet.js';
import { Crews, FACTIONS } from './crews.js';
import { Guns, GUN_DEFS, isGun } from './guns.js';
import { isCode, parts as pieceParts } from './pieces.js';
import { Props } from './props.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { Sheets } from './sheets.js';
import { Sfx } from './audio.js';
import { makeTextureArray, makeDetailTexture, makeFrondTexture } from './textures.js';
import { makeVoxelMaterials, shared } from './materials.js';
import { GeoBuilder } from './geo.js';
import { Avatar, ViewArm, defaultLook } from './character.js';
import { NPCs } from './npcs.js';
import { Quests } from './quests.js';
import { Kraken } from './kraken.js';
import { Weather } from './weather.js';
import { Life } from './life.js';
import { Fauna } from './fauna.js';
import { SaveSystem, packEdits, unpackEdits } from './save.js';
import { Settings, QUALITY, VIEW } from './settings.js';
import { UPGRADES, SUPPLIES, VESSELS, vesselProgress } from './shop.js';
import { Net } from './net.js';

const START_INV = { cutlass: 1, pick: 1, hook: 1, hammer: 1, pistol: 1, shot: 12, wood: 0, plank: 14, stone: 0, brick: 0, sand: 0, dirt: 0, lantern: 2, coconut: 3, grog: 1, ball: 12, bone: 0 };
const QUALITY_ORDER = ['ultra', 'high', 'medium', 'low'];
const IDLE = { move: { x: 0, y: 0 }, lookDX: 0, lookDY: 0, sprint: false, jumpHeld: false, primaryHeld: false, take: () => false };
const _eye = new THREE.Vector3(), _dir = new THREE.Vector3(), _v = new THREE.Vector3(), _o = new THREE.Vector3(), _w = new THREE.Vector3(), _look = new THREE.Vector3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _x = new THREE.Vector3(), _ya = new THREE.Vector3(), _zb = new THREE.Vector3();
const _cameraOrigin = new THREE.Vector3(), _cameraDirection = new THREE.Vector3();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _qs = new THREE.Quaternion(), _eul = new THREE.Euler(), _up = new THREE.Vector3(0, 1, 0);

// A block-shaped mesh for the hand: one tile per face, top and bottom from the block's own tiles.
function blockGeo(id, s) {
  const d = BLOCKS[id];
  const gb = new GeoBuilder();
  gb.box(0, 0, 0, s, s, s, 0xffffff, d.tex[1], 1 / s);
  const face = (f, layer) => { for (let i = 0; i < 6; i++) gb.l[f * 6 + i] = layer; };
  face(3, d.tex[0]); face(2, d.tex[2]); if (d.front) face(5, d.front);
  const g = gb.build(); g.translate(-s / 2, -s / 2, -s / 2);
  return g;
}

export class Game {
  constructor(hot) {
    this.hotDoc = hot && (hot.v === 2 || hot.v === 3) && hot.doc ? hot.doc : null;
    this.isTouch = matchMedia('(pointer: coarse)').matches;
    this.settings = new Settings(this.isTouch);
    this.autoQ = this.isTouch ? 'low' : 'high';
    this.autoJump = this.isTouch;
    this.renderer = new THREE.WebGLRenderer({ antialias: !this.isTouch, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setSize(innerWidth, innerHeight);
    document.getElementById('stage').appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.settings.get('fov'), innerWidth / innerHeight, 0.08, 520);
    this.camera.position.set(150, SEA + 18, 190);
    this.scene.add(this.camera);
    // a warm lantern glow that comes up when you're underground, in a pit or below decks
    this.lamp = new THREE.PointLight(0xffc98a, 0, 12, 1.6); this.lampK = 0; this.scene.add(this.lamp);
    this.vmScene = new THREE.Scene();
    this.vmCam = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.01, 10);
    this.vmHemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    this.vmSun = new THREE.DirectionalLight(0xffffff, 1); this.vmSun.position.set(0.4, 1, 0.6);
    this.vmScene.add(this.vmHemi, this.vmSun);
    this.tex = makeTextureArray(this.renderer);
    this.mats = makeVoxelMaterials(this.tex, makeDetailTexture(this.renderer), makeFrondTexture());
    this.sky = new Sky(this.scene, this.qualityPreset());
    this.ocean = new Ocean(this.scene);
    this.world = new World(SEED);
    this.world.setMaterials(this.mats);
    this.scene.add(this.world.group);
    this.particles = new Particles(this.scene);
    this.projectiles = new Projectiles(this.scene);
    this.physics = new Physics(this);
    this.hook = new Hook(this);
    this.builder = new Builder(this);
    this.fleet = new Fleet(this);
    this.crews = new Crews(this);
    this.guns = new Guns(this);
    this.sfx = new Sfx();
    this.player = new Player(this);
    this.enemies = new Enemies(this);
    this.input = new Input(this);
    this.ui = new UI(this);
    this.sheets = new Sheets(this);
    this.saves = new SaveSystem(this);
    this.quests = new Quests(this);
    this.weather = new Weather(this);
    this.state = 'loading';
    this.frameN = 0; this._tgt = []; this._tgtN = -1;
    this.time = 28; this.waveTime = 0; this.titleT = 0;
    this.wind = { angle: 0.9, target: 0.9, t: 20 };
    this.timers = []; this.hollows = []; this.kraken = null; this.sloop = null;
    this.helmYaw = 0; this.helmPitch = 0.3;
    this.camPos = new THREE.Vector3();
    this.cameraRaycaster = new THREE.Raycaster(); this.cameraRaycaster.camera = this.camera; this.cameraRayHits = [];
    this.camMode = this.settings.get('camera') === 'third' ? 'third' : 'first';
    this.tpDist = 4.2; this.shakeAmt = 0; this.previewYaw = 0;
    this.mine = { x: 0, y: 0, z: 0, p: 0 }; this.mineSoundT = 0; this.vmSwing = 0;
    this.repairCD = 0; this.visT = 0; this.saveT = 0; this.lightT = 0; this.creakT = 4; this.flagT = 0;
    this.perfT = 0; this.perfFrames = 0; this.slowT = 0;
    this.look = defaultLook();
    this.resetProgress();
    this.avatar = new Avatar(this.look);
    this.avatar.root.visible = false;
    this.scene.add(this.avatar.root);
    this.viewArm = new ViewArm();
    this.viewArm.setLook(this.look);
    this.vmScene.add(this.viewArm.group);
    this.handMeshes = {};
    this.highlight = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.006, 1.006, 1.006)), new THREE.LineBasicMaterial({ color: 0x0c1418, transparent: true, opacity: 0.6 }));
    this.highlight.visible = false;
    this.scene.add(this.highlight);
    this.digRing = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.46, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfff4d6, transparent: true, opacity: 0.55, depthWrite: false }));
    this.digRing.visible = false;
    this.scene.add(this.digRing);
    this.net = new Net(this);
    this.applySettings();
    addEventListener('resize', () => this.resize());
    const wake = () => { if (this.state !== 'loading') this.sfx.init(); };
    addEventListener('pointerdown', wake, true);
    addEventListener('keydown', wake, true);
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.autosave('hidden', true); });
    addEventListener('pagehide', () => this.saveLocalNow());
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
    setTimeout(() => this.boot(), 40);
  }

  // ---------------------------------------------------------------- settings
  qualityName() { const q = this.settings.get('quality'); return q === 'auto' ? this.autoQ : q; }
  qualityPreset() {
    const name = this.qualityName();
    const q = QUALITY[name] || QUALITY.medium;
    const viewScale = name === 'ultra' ? 1.15 : name === 'low' ? 0.85 : 1;
    return {
      ...q,
      name,
      view: (VIEW[this.settings.get('view')] || VIEW.normal) * viewScale,
      shadows: Math.min(q.shadows, this.renderer.capabilities.maxTextureSize),
    };
  }
  applySettings() {
    const S = this.settings, q = this.qualityPreset();
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, q.ratio));
    this.renderer.setSize(innerWidth, innerHeight);
    this.sky.setQuality(q);
    this.world.setShadows(q.shadows > 0);
    this.baseFov = S.get('fov'); this.camera.fov = this.baseFov; this.camera.updateProjectionMatrix();
    this.sens = 0.0024 * S.get('sens');
    this.sensY = this.sens * (S.get('invertY') ? -1 : 1);
    this.sfx.setVolume(S.get('volume')); this.sfx.setMusic(S.get('music'));
    this.visT = 0;
  }
  // When quality is on Auto and the frame rate stays low, step down one level (never back up mid-session).
  perf(dt) {
    if (this.state !== 'play') { this.perfT = 0; this.perfFrames = 0; return; }
    this.perfT += dt; this.perfFrames++;
    if (this.perfT < 2) return;
    const fps = this.perfFrames / this.perfT;
    this.perfT = 0; this.perfFrames = 0;
    if (this.settings.get('quality') !== 'auto') return;
    this.slowT = fps < 28 ? this.slowT + 2 : 0;
    const i = QUALITY_ORDER.indexOf(this.autoQ);
    if (this.slowT >= 6 && i < QUALITY_ORDER.length - 1) {
      this.slowT = 0; this.autoQ = QUALITY_ORDER[i + 1];
      this.applySettings();
      this.ui.pickup(`Graphics set to ${this.autoQ} for speed`);
    }
  }

  // ---------------------------------------------------------------- boot, voyages, saves
  resetProgress() {
    this.inv = { ...START_INV };
    this.chest = {}; this.chestGold = 0;
    this.hotbar = [...DEFAULT_HOTBAR];
    this.sel = 0; this.gold = 0; this.banked = 0; this.earned = 0; this.level = 0;
    this.stats = { wood: 0, crafted: 0, boarded: 0, kills: 0, ships: 0, blocks: 0, placed: 0, chests: 0 };
    this.upgrades = {}; this.hints = {};
    this.ownedShips = { sloop: true }; this.shipType = 'sloop';
    this.pet = null;
    if (this.avatar) this.avatar.setPet(null);
  }
  async boot() {
    this.world.generate();
    this.world.resetMeshes();
    this.world.buildNear(this.world.islands[0].x + 8, this.world.islands[0].z, 70);
    this.ocean.rebuildDepth(this.world);
    this.npcs = new NPCs(this);
    this.props = new Props(this);
    this.life = new Life(this);
    this.fauna = new Fauna(this);
    this.fauna.populate();
    this.quests.init();
    this.spawnSloop(null);
    this.placeAtSpawn();
    this.ui.buildHotbar();
    this.state = 'title';
    try { window.claude?.hot?.snapshot?.(() => this.hotSnapshot()); } catch (e) { /* not running in the viewer */ }
    if (this.hotDoc) {
      try { await this.loadDoc(this.hotDoc, true); return; } catch (e) { console.warn('Could not resume the last session', e); }
    }
    this.refreshTitle();
  }
  async refreshTitle() {
    let latest = null;
    try { latest = await this.saves.latest(); } catch (e) { latest = null; }
    this.latest = latest;
    if (this.state === 'title') {
      this.ui.titleReady(latest);
      if (!latest && this.saves.hadOld) this.ui.titleNote('Brinebound 0.6 has a new, much bigger world, so voyages from earlier versions can’t continue in it. Set sail on a new one!');
    }
  }
  onNetReady() {
    this.ui.showCrewButton(this.net.available);
    if (this.sheets.name === 'menu' || this.sheets.name === 'crew') this.sheets.render();
  }
  // Everyone the captain's world can hurt: this player, plus the crew when hosting. Built once a frame.
  targets() {
    if (this._tgtN === this.frameN) return this._tgt;
    const P = this.player, out = this._tgt;
    out.length = 0;
    out.push({ x: P.pos.x, y: P.pos.y, z: P.pos.z, alive: P.alive, foot: P.mode === 'foot', water: P.inWater, aboard: P.mode === 'deck' || P.mode === 'helm', peer: null });
    if (this.net.isHost) this.net.addTargets(out);
    this._tgtN = this.frameN;
    return out;
  }
  dayLight() { return this.sky ? Math.max(0, Math.min(1, this.sky.lightLevel)) : 1; }
  hurtTarget(t, dmg, dir) { if (t.peer) this.net.hurtPeer(t.peer, dmg, dir); else this.player.hurt(dmg, dir); }
  isLit() { return this.net.inCrew ? this.net.hostLit : !!this.quests.flags.lit; }
  onCloudReady() {
    if (this.state === 'title') this.refreshTitle();
    if (this.sheets.name === 'saves' || this.sheets.name === 'menu') this.sheets.render();
  }
  serialize() {
    const P = this.player, s = this.sloop;
    const onShip = (P.mode === 'deck' || P.mode === 'helm') && !!s && !s.sinking;
    return {
      v: 4, seed: SEED, version: VERSION, mapW: W, mapD: D,
      look: { ...this.look }, inv: { ...this.inv }, chest: { ...this.chest }, chestGold: this.chestGold || 0, hotbar: [...this.hotbar], sel: this.sel,
      gold: this.gold, banked: this.banked, earned: this.earned, level: this.level,
      stats: { ...this.stats }, upgrades: { ...this.upgrades }, hints: { ...this.hints }, pet: this.pet,
      ownedShips: { ...this.ownedShips }, shipType: this.shipType,
      time: this.time, wind: this.wind.angle, camMode: this.camMode,
      player: { x: P.pos.x, y: P.pos.y, z: P.pos.z, yaw: P.yaw, pitch: P.pitch, hp: P.hp, hunger: P.hunger, onShip, lx: P.local.x, lz: P.local.z },
      ship: s && !s.sinking ? { x: s.pos.x, z: s.pos.z, h: s.heading, hp: s.hp } : null,
      quests: this.quests.serialize(),
    };
  }
  meta() {
    return { savedAt: Date.now(), name: this.look.name, ship: this.look.ship, day: this.sky.day, chapter: this.quests.chapter, banked: this.banked, version: VERSION };
  }
  async buildDoc() {
    if (this.net.inCrew) return this.net.crewDoc();
    const data = this.serialize();
    data.edits = await packEdits(this.world.edits);
    return { meta: this.meta(), data };
  }
  hotSnapshot() {
    if ((this.state === 'play' || this.state === 'sheet') && this.player.alive) {
      try {
        if (this.net.inCrew) { this.lastHot = { v: 3, doc: this.net.crewDoc() }; return this.lastHot; }
        const data = this.serialize();
        data.editsRaw = Array.from(this.world.edits);
        this.lastHot = { v: 3, doc: { meta: this.meta(), data } };
      } catch (e) { /* keep the previous snapshot */ }
    }
    return this.lastHot || {};
  }
  saveLocalNow() {
    if ((this.state !== 'play' && this.state !== 'sheet') || !this.player.alive) return;
    try {
      if (this.net.inCrew) { this.saves.writeLocal('auto', this.net.crewDoc()); return; }
      const data = this.serialize();
      data.editsRaw = Array.from(this.world.edits);
      this.saves.writeLocal('auto', { meta: this.meta(), data });
    } catch (e) { /* storage full or unavailable */ }
  }
  async autosave(reason = 'timer', force = false) {
    if ((this.state !== 'play' && this.state !== 'sheet') || !this.player.alive || this.saving) return false;
    const now = performance.now();
    if (!force && now - (this.lastSave || 0) < 20000) return false;
    this.saving = true;
    try {
      const doc = await this.buildDoc();
      await this.saves.write('auto', doc);
      this.lastSave = now; this.latest = { slot: 'auto', doc };
      return true;
    } catch (e) { console.warn('Autosave failed', reason, e); return false; }
    finally { this.saving = false; }
  }
  async saveToSlot(slot) {
    let ok = false;
    try { const doc = await this.buildDoc(); ok = await this.saves.write(slot, doc); if (ok) this.latest = { slot, doc }; } catch (e) { ok = false; }
    this.ui.toast(ok ? 'Voyage saved' : 'Save failed', ok ? `${this.look.name}, day ${this.sky.day}.` : 'This browser would not store the save.', ok ? 'good' : 'bad');
    return ok;
  }
  async loadSlot(slot) {
    const doc = await this.saves.read(slot);
    if (!doc) { this.ui.toast('Nothing there', 'That slot is empty.', 'bad'); return; }
    try { await this.loadDoc(doc); } catch (e) { this.ui.fade(false); this.ui.toast('Could not load', e.message || 'The save could not be read.', 'bad'); }
  }
  // Continue: the newest save, and if that one won't open, the next newest, saying so on the title screen
  async continueLatest() {
    if (this.busy) return;
    this.busy = true;
    const btn = document.getElementById('bContinue');
    btn.disabled = true; btn.textContent = 'Opening your voyage…';
    this.ui.titleNote('Reading your saves…');
    try {
      let list = [];
      try { list = await this.saves.candidates(); } catch (e) { list = []; }
      if (this.latest && !list.some((c) => c.doc === this.latest.doc)) list.unshift(this.latest);
      if (!list.length) { this.openSheet('captain', { fresh: true }); return; }
      let err = null;
      for (let i = 0; i < list.length; i++) {
        try {
          await this.loadDoc(list[i].doc);
          if (i > 0) this.ui.toast('Opened an older save', `Your newest save would not open (${err && err.message}), so this is the one before it.`, 'bad');
          return;
        } catch (e) { err = e; console.warn('Could not open a save', list[i].slot, e); }
      }
      throw err || new Error('The save could not be read.');
    } catch (e) {
      this.ui.fade(false);
      if (this.state !== 'title') { this.state = 'title'; this.ui.showHud(false); this.ui.showTitle(true); }
      this.ui.titleNote(`Could not open your voyage: ${(e.message || 'the save could not be read').replace(/\.$/, '')}. Try Load, or start a new voyage.`, true);
    } finally {
      this.busy = false; btn.disabled = false; btn.textContent = 'Continue voyage';
    }
  }
  exportSave() { return this.buildDoc().then((doc) => this.saves.exportFile(doc)); }
  async importText(text) { const doc = this.saves.parseFile(text); await this.loadDoc(doc); }

  clearVoyage() {
    for (const h of this.hollows) h.dispose();
    this.hollows = [];
    this.killKraken();
    this.enemies.clear(); this.projectiles.clear(); this.physics.clear(); this.hook.clear(); this.fleet.clear();
    if (this.props) { this.props.clearLoot(); this.props.clearBottles(); }
    this.timers = [];
  }
  killKraken() {
    const k = this.kraken;
    if (!k) return;
    k.dead = true;
    if (k.head) this.scene.remove(k.head);
    for (const t of k.tentacles) t.dispose();
    if (this.sloop) this.sloop.hold = 1;
    this.kraken = null;
  }
  regenerateWorld() {
    this.world.generate();
    this.world.resetMeshes();
    this.world.buildNear(this.world.spawn.x, this.world.spawn.z, 60);
    this.ocean.rebuildDepth(this.world);
    this.ui.mapBase = null; this.ui.roseAt = null;
  }
  async loadDoc(doc, quick = false) {
    let d = doc && doc.data;
    if (d && (d.v === 2 || d.v === 3)) throw new Error('This voyage was sailed in the smaller world before 0.6, so it can’t continue in this one.');
    if (!d || d.v !== 4) throw new Error('This save belongs to a different version of the game.');
    let edits;
    try { edits = d.editsRaw || (d.edits ? await unpackEdits(d.edits) : []); } catch (e) { throw new Error('The save data is damaged.'); }
    const savedVersion = (d.version || doc.meta?.version || '0.0.0').split('.').map(Number);
    const oldWorld = savedVersion.length === 3 && savedVersion.every(Number.isFinite)
      && (savedVersion[0] < 0 || (savedVersion[0] === 0 && (savedVersion[1] < 6 || (savedVersion[1] === 6 && savedVersion[2] < 12))));
    const oldMap = savedVersion.length !== 3 || !savedVersion.every(Number.isFinite)
      || savedVersion[0] < 0 || (savedVersion[0] === 0 && (savedVersion[1] < 6 || (savedVersion[1] === 6 && savedVersion[2] < 16)));
    const sourceW = oldMap ? LEGACY_W : (Number.isInteger(d.mapW) && d.mapW > 0 ? d.mapW : PREVIOUS_MAP_W);
    const sourceD = oldMap ? LEGACY_D : (Number.isInteger(d.mapD) && d.mapD > 0 ? d.mapD : PREVIOUS_MAP_W);
    if (oldMap || sourceW !== W || sourceD !== D) {
      edits = edits.map(([i, id]) => {
        const x = i % sourceW, z = Math.floor(i / sourceW) % sourceD;
        const y = Math.floor(i / (sourceW * sourceD)) + (oldWorld ? WORLD_Y_SHIFT : 0);
        return [x + W * (z + D * y), id];
      });
      if (oldWorld && d.player && Number.isFinite(d.player.y)) d = { ...d, player: { ...d.player, y: d.player.y + WORLD_Y_SHIFT } };
    }
    this.net.end();
    this.ui.fade(true);
    if (this.sheets.name) this.sheets.close();
    this.state = 'loading';
    await new Promise((r) => setTimeout(r, quick ? 0 : 420));
    try { this.applyDoc(d, edits); } catch (e) {
      console.error(e);
      this.state = 'title'; this.ui.showHud(false); this.ui.showTitle(true); this.ui.fade(false); this.refreshTitle();
      throw new Error('The save could not be applied.');
    }
    this.startPlay();
    this.ui.fade(false);
    this.ui.toast('Welcome back', `${this.look.name}, day ${this.sky.day}. ${this.quests.tracked_().text}.`);
  }
  applyDoc(d, edits) {
    this.clearVoyage();
    this.world.generate();
    this.world.applyEdits(edits);
    this.world.resetMeshes();
    const fp = (d.player && d.player.onShip && d.ship) ? d.ship : (d.player || this.world.spawn);
    this.world.buildNear(fp.x ?? this.world.spawn.x, fp.z ?? this.world.spawn.z, 64);
    this.ocean.rebuildDepth(this.world);
    this.ui.mapBase = null; this.ui.roseAt = null;
    this.resetProgress();
    Object.assign(this.inv, d.inv || {});
    this.chest = {}; for (const [k, n] of Object.entries(d.chest || {})) if (ITEMS[k] && n > 0) this.chest[k] = n | 0;
    this.chestGold = Math.max(0, d.chestGold | 0);
    if (Array.isArray(d.hotbar) && d.hotbar.length === 9) this.hotbar = d.hotbar.map((x) => (x && ITEMS[x] ? x : null));
    for (const [tool, slot] of [['hook', 2], ['hammer', 3]]) if (!this.inv[tool]) { this.inv[tool] = 1; const e = this.hotbar.indexOf(null); if (!this.hotbar.includes(tool)) this.hotbar[e >= 0 ? e : slot] = tool; }
    this.sel = clamp(d.sel | 0, 0, 8);
    this.gold = d.gold || 0; this.banked = d.banked || 0; this.earned = d.earned || 0; this.level = d.level || 0;
    Object.assign(this.stats, d.stats || {});
    this.upgrades = { ...(d.upgrades || {}) }; this.hints = { ...(d.hints || {}) };
    if (d.ownedShips && typeof d.ownedShips === 'object' && !Array.isArray(d.ownedShips)) {
      for (const vessel of PLAYER_VESSELS) if (vessel.id !== 'sloop' && d.ownedShips[vessel.id] === true) this.ownedShips[vessel.id] = true;
    }
    if (typeof d.shipType === 'string' && this.ownedShips[d.shipType]) this.shipType = d.shipType;
    // captains from before 0.5 find a pistol in their bag: give it a hotbar slot once
    if (this.inv.pistol && !this.hints.gunGift) {
      this.hints.gunGift = 1;
      if (!this.hotbar.includes('pistol')) { const e = this.hotbar.indexOf(null), w = this.hotbar.indexOf('wood'); this.hotbar[e >= 0 ? e : w >= 0 ? w : 5] = 'pistol'; }
    }
    this.pet = d.pet && typeof d.pet.color === 'number' ? { color: d.pet.color } : null;
    this.avatar.setPet(this.pet);
    this.fauna.populate();
    this.time = d.time ?? 28;
    this.wind.angle = this.wind.target = d.wind ?? 0.9;
    if (d.camMode === 'first' || d.camMode === 'third') this.camMode = d.camMode;
    this.look = { ...defaultLook(), ...(d.look || {}) };
    this.quests.load(d.quests || {});
    if (this.quests.id === 'deep' && this.quests.phase === 1) this.quests.phase = 0;
    for (const q of this.quests.active) if (q.kind === 'hunt' && q.state === 'active') q.spawned = false;
    this.spawnSloop(d.ship);
    this.applyLook('all');
    const P = this.player, p = d.player || {};
    P.alive = true; P.vel.set(0, 0, 0);
    P.hp = clamp(p.hp ?? P.maxHp, 30, P.maxHp); P.hunger = clamp(p.hunger ?? 100, 25, 100);
    if (p.onShip && this.sloop) this.boardSloop(p.lx ?? 0, clamp(p.lz ?? 1.5 * SCALE, SHIP.bow + 1.6 * SCALE, SHIP.stern - 0.4 * SCALE));
    else {
      const sp = this.world.spawn;
      P.mode = 'foot'; P.pos.set(p.x ?? sp.x, p.y ?? SEA + 8, p.z ?? sp.z); P.yaw = p.yaw || 0; P.pitch = p.pitch || 0;
      if (P.collides()) P.pos.y = this.world.standY(Math.floor(P.pos.x), Math.floor(P.pos.z)) + 0.001;
    }
  }
  newVoyage(look) {
    this.net.end();
    this.clearVoyage();
    if (this.world.edits.size) this.regenerateWorld();
    this.fauna.populate();
    this.resetProgress();
    this.look = { ...look };
    this.quests.reset(); this.quests.init();
    this.time = 28; this.wind.angle = this.wind.target = 0.9;
    this.spawnSloop(null);
    this.applyLook('all');
    const P = this.player;
    P.alive = true; P.hp = P.maxHp; P.hunger = 100;
    this.placeAtSpawn();
  }
  beginVoyage(look, showGuide = true) {
    this.sheets.close();
    this.newVoyage(look);
    this.hints.tutorialStep = showGuide ? 0 : 6;
    this.startPlay();
    this.ui.toast('Brine Haven', `Welcome, ${this.look.name}. Old Mags keeps the trading post up the beach, and your sloop waits at the pier.`);
    this.after(7, () => this.ui.toast('Landfall', this.isTouch ? 'Hold Hit on a tree trunk to gather wood. The View button shows your captain.' : 'Hold left click on a tree trunk to gather wood. Press V to see your captain.'));
    this.autosave('new', true);
  }
  advanceTutorial() {
    const step = this.hints.tutorialStep;
    if (!Number.isInteger(step) || step < 0 || step > 5) return;
    this.hints.tutorialStep = step === 5 ? 6 : step + 1;
    if (this.hints.tutorialStep === 6) this.ui.toast('Fair winds', 'Your guide is complete. Replay it any time from the menu.');
  }
  skipTutorial() {
    if (!Number.isInteger(this.hints.tutorialStep) || this.hints.tutorialStep >= 6) return;
    this.hints.tutorialStep = 6;
  }
  replayTutorial() {
    this.hints.tutorialStep = 0;
    this.closeSheet();
  }
  startPlay() {
    this.sfx.init();
    this.state = 'play';
    this.ui.netNote(null);
    this.ui.showTitle(false);
    this.ui.showHud(true);
    this.ui.buildHotbar();
    this.ui.setCaptain(this.look);
    this.input.requestLock();
    this.camPos.copy(this.camera.position);
    this.lastSave = performance.now();
    this.saveT = 0;
    if (this.wantCrew) { this.wantCrew = false; this.after(0.6, () => { if (this.state === 'play') this.openSheet('crew'); }); }
  }
  async quitToTitle() {
    this.cancelStuck();
    await this.autosave('quit', true);
    this.net.end();
    this.sheets.close();
    this.state = 'title';
    this.input.exitLock();
    this.ui.showHud(false);
    this.ui.showTitle(true);
    this.avatar.root.visible = false;
    this.sfx.setMood('title'); this.sfx.setRain(0);
    this.titleT = 0;
    this.refreshTitle();
  }
  placeAtSpawn() {
    const P = this.player, sp = this.world.spawn;
    P.mode = 'foot';
    P.pos.set(sp.x, this.world.standY(Math.floor(sp.x), Math.floor(sp.z)) + 0.001, sp.z);
    P.yaw = sp.yaw; P.pitch = -0.05; P.vel.set(0, 0, 0);
  }
  spawnSloop(sd) {
    this.removeShip(this.sloop);
    const s = new Ship(this.scene, 'sloop', { look: this.look, playerVessel: this.shipType });
    this.sloop = s;
    if (sd && !s.hullHits(this.world, sd.x, sd.z, sd.h)) s.place(sd.x, sd.z, sd.h);
    else { const d = this.world.dock; s.place(d.x, d.z, d.heading); }
    this.applyUpgrades();
    s.hp = sd ? clamp(sd.hp, 1, s.maxHp) : s.maxHp;
  }
  removeShip(s) { if (s) s.dispose(); if (s && s === this.sloop) this.sloop = null; }
  boardSloop(lx, lz) {
    const P = this.player, s = this.sloop;
    P.mode = 'deck'; P.ship = s; P.climb = false; P.gun = -1; P.local.set(...P.deckSpot(lx, lz)); P.lvy = 0;
    P.prevShipHeading = s.heading; P.yaw = s.heading; P.pitch = 0;
    P.syncDeckWorld(s);
  }
  applyLook(what = 'all') {
    if (what !== 'ship') {
      this.avatar.setLook(this.look);
      this.viewArm.setLook(this.look);
      this.ui.setCaptain(this.look);
    }
    if (what !== 'captain' && this.sloop && !this.sloop.remote) this.sloop.setLook(this.look);
  }
  applyUpgrades() {
    const u = this.upgrades, s = this.sloop, P = this.player;
    if (s && !s.remote) {
      s.maxHp = s.design.hp + (u.hull1 ? 40 : 0) + (u.hull2 ? 50 : 0);
      s.hp = Math.min(s.hp, s.maxHp);
      s.baseSpeed = s.design.speed; s.maxSpeed = s.baseSpeed;
      s.speedMul = 1 + (u.sails1 ? 0.12 : 0) + (u.sails2 ? 0.13 : 0);
      s.turnMul = s.design.turn * (u.rudder ? 1.15 : 1);
      s.guns = Math.max(s.design.guns, u.guns ? 3 : 2);
      s.reloadMul = u.reload ? 0.75 : 1;
      s.armorMul = u.keel ? 0.85 : 1;
    }
    P.maxHp = 100 + (u.coat ? 30 : 0);
    P.hp = Math.min(P.hp, P.maxHp);
  }

  // ---------------------------------------------------------------- loop
  loop(now) {
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, Math.max(0, (now - (this.last || now)) / 1000));
    this.last = now;
    this.frame(dt);
  }
  frame(dt) {
    this.waveTime += dt;
    shared.time.value = this.waveTime;
    try {
      if (this.state === 'play') this.updatePlay(dt);
      else if (this.state === 'title') this.updateTitle(dt);
      else if (this.state === 'sheet') this.updateSheet(dt);
      else this.input.update(dt);
    } catch (err) {
      console.error(err);
    }
    try { this.net.update(dt); } catch (err) { console.error(err); }
    this.sky.update(this.time, this.camera.position, this.weather.storm, dt);
    this.ocean.setShips(this.state === 'title' || this.state === 'loading' ? [this.sloop] : [this.sloop, ...this.hollows]);
    this.ocean.update(this.waveTime, this.camera.position, this.sky, this.weather.storm, waveState.amp);
    if (this.state !== 'loading') this.world.meshAround(this.camera.position.x, this.camera.position.z, this.sky.fogFar + 8, this.state === 'play' ? 2 : 3, dt);
    this.visT -= dt;
    if (this.visT <= 0 && this.state !== 'loading') { this.visT = 0.25; this.world.updateVisibility(this.camera.position.x, this.camera.position.z, this.sky.fogFar); }
    this.updateLamp(dt);
    this.renderer.render(this.scene, this.camera);
    if (this.showViewArm()) {
      const dim = this.lampK;
      this.vmHemi.color.copy(this.sky.hemi.color); this.vmHemi.groundColor.copy(this.sky.hemi.groundColor);
      this.vmHemi.intensity = this.sky.hemi.intensity * (1 - 0.3 * dim) + dim * 0.5; this.vmSun.intensity = this.sky.sun.intensity * 0.8 * (1 - 0.85 * dim); this.vmSun.color.copy(this.sky.sun.color);
      this.renderer.autoClear = false;
      this.renderer.clearDepth();
      this.renderer.render(this.vmScene, this.vmCam);
      this.renderer.autoClear = true;
    }
    this.input.endFrame();
    this.perf(dt);
  }
  // emotes: G (or the Emote button) opens a wheel of eight
  openWheel() {
    const P = this.player;
    if (!P.alive || P.mode === 'helm' || this.state !== 'play') return;
    this.wheel = { x: 0, y: 0, sel: -1 };
    this.ui.showEmotes(true);
  }
  closeWheel(confirm) {
    const W = this.wheel;
    if (!W) return;
    this.wheel = null;
    this.ui.showEmotes(false);
    if (confirm && W.sel >= 0) this.playEmote(EMOTES[W.sel][0]);
  }
  updateWheel() {
    const W = this.wheel, I = this.input;
    if (I.locked) {
      W.x += I.lookDX; W.y += I.lookDY;
      const l = Math.hypot(W.x, W.y);
      if (l > 90) { W.x *= 90 / l; W.y *= 90 / l; }
      const n = EMOTES.length;
      W.sel = l > 26 ? ((Math.round((Math.atan2(W.y, W.x) + Math.PI / 2) / ((Math.PI * 2) / n)) % n) + n) % n : -1;
      this.ui.emoteSel(W.sel);
      if (I.mouseL) { I.mouseL = false; this.closeWheel(true); return; }
    }
    I.lookDX = 0; I.lookDY = 0;
    for (let i = 1; i <= EMOTES.length; i++) if (I.take('slot' + i)) { this.pickEmote(i - 1); return; }
  }
  pickEmote(i) {
    if (this.wheel) { this.wheel = null; this.ui.showEmotes(false); }
    this.playEmote(EMOTES[i][0]);
  }
  playEmote(id) {
    const P = this.player;
    if (!P.startEmote(id)) { this.ui.pickup('Not right now'); return; }
    this.tpDist = Math.min(this.tpDist || 4, 1.2);
  }
  // "I'm stuck": hold still for seven seconds and you're lifted out to open air
  startStuck() {
    const P = this.player;
    if (!P.alive || this.state === 'title') return;
    if (this.state === 'sheet') this.closeSheet();
    this.stuck = { t: 7, x: P.pos.x, z: P.pos.z, lx: P.local.x, lz: P.local.z, mode: P.mode };
    this.ui.stuck(7);
    this.sfx.thud && this.sfx.thud();
  }
  cancelStuck(why) {
    if (!this.stuck) return;
    this.stuck = null; this.ui.stuck(-1);
    if (why) this.ui.pickup(why);
  }
  updateStuck(dt) {
    const P = this.player, S = this.stuck;
    if (!P.alive) { this.cancelStuck(); return; }
    const moved = P.mode === 'deck' && S.mode === 'deck' ? Math.hypot(P.local.x - S.lx, P.local.z - S.lz) : Math.hypot(P.pos.x - S.x, P.pos.z - S.z);
    if (moved > 0.4 || (P.mode !== S.mode && !(S.mode === 'deck' && P.mode === 'deck'))) { this.cancelStuck('You moved, so you stay put'); return; }
    S.t -= dt;
    this.ui.stuck(S.t);
    if (S.t <= 0) { this.stuck = null; this.ui.stuck(-1); this.unstick(); }
  }
  unstick() {
    const P = this.player, w = this.world;
    if (P.hooked) this.hook.release(false);
    P.mantle = null; P.slide = 0;
    if (P.mode === 'helm' || P.mode === 'deck') {
      const s = P.ship || this.sloop;
      if (P.mode === 'helm' && this.net.inCrew) this.net.leaveHelm();
      P.mode = 'deck'; P.climb = false; P.gun = -1;
      const [x, y, z] = P.deckSpot(0.9 * SCALE, -1.6 * SCALE);
      P.local.set(x, y, z); P.lvy = 0;
      if (s) P.syncDeckWorld(s);
    } else {
      const x = Math.floor(P.pos.x), z = Math.floor(P.pos.z);
      let y = w.standY(x, z);
      if (!w.dryColumn(x, z) && y < SEA + 1) y = WATER_Y - 0.7;
      P.pos.set(x + 0.5, y + 0.02, z + 0.5);
      P.vel.set(0, 0, 0); P.fallV = 0;
    }
    this.particles.burst(P.pos.x, P.pos.y + 1, P.pos.z, 0xf2e6c8, 16, 1.4, 3, 8, 0.8, 0.6);
    this.ui.pickup('Back on solid footing');
  }
  // How shut in is the camera? Rock or a roof overhead, ground standing high all around, or the hold.
  enclosure() {
    if (this.state !== 'play' && this.state !== 'sheet') return 0;
    const P = this.player, c = this.camera.position, w = this.world;
    if (P.mode === 'deck' && P.local.y < 0.4) return 0.75;
    if (P.dead) return 0;
    const x = Math.floor(c.x), z = Math.floor(c.z);
    for (let y = Math.floor(c.y) + 1; y < H; y++) { const id = w.get(x, y, z); if (TERRAIN[id] || CRISP[id]) return 1; }
    let pit = 0;
    for (const [dx, dz] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) if (w.topSolid(x + dx, z + dz) > c.y + 0.4) pit++;
    return pit >= 3 ? 0.85 : pit === 2 ? 0.4 : 0;
  }
  updateLamp(dt) {
    this.lampK += (this.enclosure() - this.lampK) * Math.min(1, dt * 2.5);
    this.lamp.intensity = this.lampK * 4.5;
    this.lamp.position.set(this.camera.position.x, this.camera.position.y - 0.25, this.camera.position.z);
  }
  showViewArm() {
    const P = this.player;
    return this.state === 'play' && this.camMode === 'first' && P.mode !== 'helm' && P.alive && !P.emote;
  }

  updateTitle(dt) {
    this.input.update(dt);
    this.titleT += dt;
    this.sfx.setMood('title');
    if (this.sheets.name === 'captain') this.creatorCamera(dt);
    else {
      // a slow circle over the harbour at Brine Haven, the sloop at the pier
      const o = this.world.dock || this.world.islands[0];
      const a = this.titleT * 0.04 + 0.55;
      this.camera.position.set(o.x - 10 + Math.cos(a) * 58, SEA + 18, o.z + Math.sin(a) * 58);
      this.camera.lookAt(o.x - 12, SEA + 3, o.z - 3);
      this.camPos.copy(this.camera.position);
    }
    if (this.sloop) { this.sloop.preview = this.sheets.name === 'captain' && this.sheets.opts.tab === 'ship'; this.sloop.update(dt, this); }
    this.props.update(dt);
    this.npcs.update(dt);
    this.life.update(dt);
    this.fauna.update(dt);
    this.updateAvatar(dt);
    this.world.processDirty(4);
    if (this.sheets.name) {
      this.sheets.update(dt);
      if (this.input.take('esc')) this.closeSheet();
    }
  }
  updateSheet(dt) {
    const I = this.input;
    I.update(dt);
    const n = this.sheets.name;
    if (I.take('esc')) { this.closeSheet(); return; }
    I.take('chat');
    for (const a of ['map', 'quests', 'bag', 'menu']) {
      if (I.take(a)) { if (n === a) this.closeSheet(); else this.openSheet(a); return; }
    }
    if (I.take('craft')) { if (n === 'bag' && this.sheets.opts.tab === 'craft') this.closeSheet(); else this.openSheet('bag', { tab: 'craft' }); return; }
    this.sheets.update(dt);
    if (n === 'captain') { this.creatorCamera(dt); this.updateAvatar(dt); }
    // with a crew aboard the world cannot pause for one pirate's menu
    else if (this.net.role) this.simulate(dt, true);
  }

  updatePlay(dt) {
    const I = this.input, P = this.player;
    I.update(dt);
    if (this.wheel && (I.take('esc') || I.take('menu'))) this.closeWheel();
    if (I.take('emote')) { if (this.wheel) this.closeWheel(true); else this.openWheel(); }
    if (this.wheel) this.updateWheel();
    if (I.take('map')) { this.openSheet('map'); return; }
    if (I.take('craft')) { this.openSheet('bag', { tab: 'craft' }); return; }
    if (I.take('bag')) { this.openSheet('bag'); return; }
    if (I.take('quests')) { this.openSheet('quests'); return; }
    if (I.take('menu') || I.take('esc')) { this.openSheet('menu'); return; }
    if (I.take('view')) this.toggleView();
    if (I.take('chat') && this.net.role) { this.ui.openChat(); return; }
    for (let i = 1; i <= 9; i++) if (I.take('slot' + i)) this.selectSlot(i - 1);
    if (I.take('next')) this.selectSlot((this.sel + 1) % 9);
    if (I.take('prev')) this.selectSlot((this.sel + 8) % 9);
    this.repairCD -= dt;
    if (this.stuck) this.updateStuck(dt);
    this.interaction = this.computeInteraction();
    if (P.alive) {
      if (P.mode === 'helm') {
        if (I.take('q') || I.take('port')) this.playerFire(-1);
        if (I.take('e') || I.take('star')) this.playerFire(1);
      }
      const use = I.take('use') || (P.mode !== 'helm' && I.take('e'));
      if (use && this.interaction) this.doInteraction(this.interaction);
      if (I.take('repair')) this.repairShip();
    }
    this.simulate(dt, false);
  }
  // Everything that moves on its own. idle: a menu is open over a shared world, so the player stands still.
  simulate(dt, idle) {
    const P = this.player, I = idle ? IDLE : this.input;
    const crew = this.net.isCrew;
    this.frameN++;
    this.time += dt;
    if (!crew) this.updateWind(dt);
    if (idle) this.repairCD -= dt;
    P.update(dt, I);
    this.groundHazards(dt);
    if (this.sloop) this.sloop.update(dt, this);
    if (crew) for (const h of this.hollows) h.update(dt, this);
    else {
      this.fleet.update(dt);
      for (const h of [...this.hollows]) {
        if (h.kind === 'hollow') { if (h.crew && !h.manned) { h.sailLvl = Math.max(0, h.sailLvl - dt * 0.3); h.rudder *= 0.95; } else hollowAI(h, this, dt); }
        if (this.hollows.includes(h)) h.update(dt, this);
      }
      this.manageHollows(dt);
    }
    if (this.kraken) { this.kraken.update(dt); if (this.kraken && this.kraken.dead) this.kraken = null; }
    if (!crew) this.shipCollisions();
    { const ps = P.mode === 'helm' ? this.sloop : P.mode === 'deck' ? P.ship || this.sloop : null; if (ps) P.syncDeckWorld(ps); }
    this.crews.update(dt);
    this.guns.update(dt);
    if (idle) { this.mine.p = 0; this.highlight.visible = false; this.digRing.visible = false; this.builder.update(dt, null, null, true); } else this.updateActions(dt);
    this.enemies.update(dt);
    this.burnNearLamps(dt);
    this.projectiles.update(dt, this);
    this.physics.update(dt);
    this.particles.update(dt);
    this.props.update(dt);
    this.npcs.update(dt);
    if (crew) this.quests.chartNearby(dt); else this.quests.update(dt);
    this.weather.update(dt);
    this.life.update(dt);
    this.fauna.update(dt);
    this.world.processDirty(3);
    this.ocean.flushDepth(this.world);
    this.updateCamera(dt);
    this.hook.update(dt, I);
    this.updateAvatar(dt);
    this.updateViewModel(dt);
    this.updateTimers(dt);
    this.updateAmbience(dt);
    if (!idle) this.ui.update(dt);
    this.saveT += dt;
    if (this.saveT > 75) { this.saveT = 0; this.autosave('timer'); }
  }
  groundHazards(dt) {
    const P = this.player;
    this.burnT = (this.burnT || 0) - dt;
    if (!P.alive || P.mode !== 'foot' || this.burnT > 0) return;
    // the smooth ground sits up to half a block off the blocks beneath it: check both
    const w = this.world, fx = Math.floor(P.pos.x), fz = Math.floor(P.pos.z);
    if (!P.onGround || (w.get(fx, Math.floor(P.pos.y - 0.05), fz) !== B.MAGMA && w.get(fx, Math.floor(P.pos.y - 0.55), fz) !== B.MAGMA)) return;
    this.burnT = 0.5;
    P.hurt(6, null);
    this.particles.burst(P.pos.x, P.pos.y + 0.2, P.pos.z, 0xff8a2a, 8, 1.2, 2.5, -1, 0.6, 0.4);
    if (!this.hints.magma) { this.hints.magma = 1; this.ui.toast('Magma', 'The crater floor burns. Get off it!', 'bad'); }
  }
  updateWind(dt) {
    const w = this.wind;
    w.t -= dt;
    if (w.t <= 0) { w.t = 40 + Math.random() * 40; w.target = w.angle + (Math.random() - 0.5) * 1.6; }
    w.angle += (w.target - w.angle) * Math.min(1, dt * 0.05);
  }
  after(sec, fn) { this.timers.push({ t: sec, fn }); }
  updateTimers(dt) {
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i];
      t.t -= dt;
      if (t.t <= 0) { this.timers.splice(i, 1); t.fn(); }
    }
  }
  updateAmbience(dt) {
    const P = this.player, s = this.sloop;
    const aboard = (P.mode === 'helm' || (P.mode === 'deck' && (!P.ship || P.ship === s))) && s && !s.sinking;
    this.sfx.setMood(this.musicMood(dt, aboard));
    this.sfx.setMusicLevel((this.lampK > 0.5 ? 0.62 : 1) * (1 - 0.3 * Math.min(1, this.weather.storm)));
    if (aboard && Math.abs(s.speed) > 2) { this.creakT -= dt; if (this.creakT <= 0) { this.creakT = 4 + Math.random() * 6; this.sfx.creak(); } }
    if (this.sky.isNight && !this.hints.night) {
      this.hints.night = 1;
      this.ui.toast('Night falls', 'Hollowmen rise from the sand after dark. Stay in lantern light, or rest at Old Mags’ stall until morning.', 'curse');
    }
  }

  // the soundtrack follows the voyage: a fight wins, then night, then sailing, else the port tune
  musicMood(dt, aboard) {
    const P = this.player, s = this.sloop, px = P.pos.x, pz = P.pos.z;
    const near = (x, z, r) => (x - px) * (x - px) + (z - pz) * (z - pz) < r * r;
    const shipR = aboard || P.inWater ? 110 : 70;
    const fight = (this.kraken && this.kraken.alive)
      || (P.ship && P.ship !== s && !P.ship.taken && P.ship.alertT > 0)
      || this.hollows.some((h) => !h.sinking && !h.taken && this.fleet.hostile(h) && near(h.pos.x, h.pos.z, shipR))
      || this.enemies.list.some((e) => e.state !== 'dying' && e.state !== 'rising' && Math.abs(e.pos.y - P.pos.y) < 6 && near(e.pos.x, e.pos.z, 15));
    this.fightT = fight ? 9 : Math.max(0, (this.fightT || 0) - dt);
    this.sailT = aboard && s && Math.abs(s.speed) > 1.5 ? 12 : Math.max(0, (this.sailT || 0) - dt);
    if (this.fightT > 0) return 'battle';
    if (this.sky.isNight) return 'night';
    return this.sailT > 0 ? 'sea' : 'port';
  }

  // ---------------------------------------------------------------- sheets and pointer lock
  openSheet(name, opts = {}) {
    if (this.state === 'loading') return;
    if (this.wheel) this.closeWheel();
    if (this.state === 'play') {
      this.state = 'sheet';
      const I = this.input;
      I.mouseL = false; I.btnHeld.clear(); I.keys.clear(); I.pressed.clear();
      I.exitLock();
      this.mine.p = 0;
    }
    if (this.state === 'title') this.ui.showTitle(false);
    if (name === 'captain') {
      if (opts.fresh) { this.look = defaultLook(); this.applyLook('all'); }
      if (this.sheets.name !== 'captain') { this.previewYaw = this.pickPreviewYaw(); this.snapCam = true; }
    }
    this.sheets.open(name, opts);
  }
  closeSheet() {
    const was = this.sheets.name;
    this.sheets.close();
    if (this.state === 'sheet') {
      this.state = 'play';
      if (was === 'captain') this.camPos.copy(this.camera.position);
      this.input.requestLock();
    } else if (this.state === 'title') {
      this.ui.showTitle(true);
      this.avatar.root.visible = false;
    }
  }
  // the feel of moving: slides, mantles and hard landings
  onSlide() { this.sfx.slide(); this.fovKick = 6; const P = this.player; this.particles.burst(P.pos.x, P.pos.y + 0.1, P.pos.z, 0xc9b48a, 10, 1.6, 1.2, 6, 0.6, 0.5); }
  onLand(v) {
    const P = this.player, k = Math.min(1, (v - 9) / 14);
    this.sfx.land(0.5 + k * 0.6);
    if (v > 15) this.shake(0.1 + k * 0.25);
    const under = this.world.get(Math.floor(P.pos.x), Math.floor(P.pos.y - 0.3), Math.floor(P.pos.z));
    const c = BLOCKS[under] && BLOCKS[under].color ? BLOCKS[under].color : 0xb9a37a;
    this.particles.burst(P.pos.x, P.pos.y + 0.05, P.pos.z, c, 8 + Math.round(k * 14), 2.2, 1.4, 8, 0.7, 0.5);
  }
  onMantle(rise) { this.sfx.climb(); }
  onLockChange(locked) {
    if (locked || this.ui.chatting) return;
    if (this.input.fallback) {
      if (this.input.gamepadId !== null) return;
      if (!this.hints.drag && !this.isTouch) { this.hints.drag = 1; this.ui.toast('Mouse look', 'This window will not capture the mouse. Drag to look around; press and hold without moving to mine.'); }
      return;
    }
    if (this.state === 'play' && !this.isTouch && this.input.gamepadId === null) this.openSheet('menu');
  }
  get needsClick() { return this.state === 'play' && !this.isTouch && !this.input.locked && !this.input.fallback && this.input.gamepadId === null; }
  enableTouch() {
    if (this.isTouch) return;
    this.isTouch = true; this.autoJump = true;
    this.input.exitLock();
    if (this.state === 'play' || this.state === 'sheet') this.ui.showHud(true);
  }
  resize() {
    this.renderer.setSize(innerWidth, innerHeight);
    this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
    this.vmCam.aspect = this.camera.aspect; this.vmCam.updateProjectionMatrix();
  }
  toggleView() {
    this.camMode = this.camMode === 'third' ? 'first' : 'third';
    this.settings.set('camera', this.camMode);
    this.ui.pickup(this.camMode === 'third' ? 'Third-person camera' : 'First-person camera');
  }
  selectSlot(i) {
    this.sel = i;
    const it = this.hotbar[i];
    this.ui.pickup(it ? ITEMS[it].name : 'Empty hand');
  }

  // ---------------------------------------------------------------- camera, avatar, first-person arm
  cameraYaw() { return this.player.mode === 'helm' && this.sloop ? this.sloop.heading + this.helmYaw : this.player.yaw; }
  cameraBearing() { return -this.cameraYaw(); }
  distToListener(x, z) { return Math.hypot(x - this.camera.position.x, z - this.camera.position.z); }
  shake(a) { this.shakeAmt = Math.max(this.shakeAmt, a); }

  updateCamera(dt) {
    {
      // speed widens the view a touch, a slide kicks it
      const P = this.player, sp = P.mode === 'foot' ? Math.hypot(P.vel.x, P.vel.z) : 0;
      this.fovKick = Math.max(0, (this.fovKick || 0) - dt * 9);
      let want = (this.baseFov || 70) + Math.min(7, Math.max(0, sp - 5.5) * 1.3) + this.fovKick;
      if (this.guns.aim > 0.01) want += (GUN_DEFS.musket.zoom - want) * this.guns.aim;
      if (Math.abs(this.camera.fov - want) > 0.05) { this.camera.fov += (want - this.camera.fov) * Math.min(1, dt * 6); this.camera.updateProjectionMatrix(); }
    }
    const P = this.player, cam = this.camera;
    if (P.mode === 'helm' && this.sloop) { this.helmCamera(dt); this.ui.setCrosshair(false); }
    else if (((this.camMode === 'third' || P.emote) && !(P.mode === 'deck' && P.local.y < 0.4)) || !P.alive) { this.thirdCamera(dt); this.ui.setCrosshair(P.alive && !P.emote); }
    else {
      const bob = P.moving ? Math.sin(P.walkPhase) * 0.045 : 0;
      cam.position.set(P.pos.x, P.pos.y + P.eyeH - P.landDip - P.eyeLag + bob, P.pos.z);
      cam.rotation.set(P.pitch, P.yaw, 0, 'YXZ');
      this.camPos.copy(cam.position);
      this.ui.setCrosshair(P.alive);
    }
    if (this.shakeAmt > 0.001) {
      const a = this.shakeAmt;
      cam.position.x += (Math.random() - 0.5) * a * 0.5; cam.position.y += (Math.random() - 0.5) * a * 0.4; cam.position.z += (Math.random() - 0.5) * a * 0.5;
      this.shakeAmt = Math.max(0, a - dt * 1.6);
    }
  }
  helmCamera(dt) {
    const s = this.sloop, cam = this.camera, I = this.input;
    this.camIdle = (Math.abs(I.lookDX) + Math.abs(I.lookDY) > 0.5) ? 0 : (this.camIdle || 0) + dt;
    let dxE = 0, dzE = 0, combat = false;
    if (this.kraken && this.kraken.alive) {
      combat = true;
      if (this.kraken.head && this.kraken.state === 'head') { dxE = this.kraken.head.position.x - s.pos.x; dzE = this.kraken.head.position.z - s.pos.z; }
    } else {
      let best = null;
      for (const h of this.hollows) { if (h.sinking) continue; const d = Math.hypot(h.pos.x - s.pos.x, h.pos.z - s.pos.z); if (d < 75 && (!best || d < best.d)) best = { h, d }; }
      if (best) { combat = true; dxE = best.h.pos.x - s.pos.x; dzE = best.h.pos.z - s.pos.z; }
    }
    this.combatK = clamp((this.combatK || 0) + (combat ? dt : -dt) * 0.8, 0, 1);
    if (combat && this.camIdle > 2 && (dxE || dzE)) {
      let want = Math.atan2(-dxE, -dzE) - s.heading - this.helmYaw;
      while (want > Math.PI) want -= Math.PI * 2; while (want < -Math.PI) want += Math.PI * 2;
      this.helmYaw += want * Math.min(1, dt * 1.2);
    }
    const yaw = s.heading + this.helmYaw;
    const dist = 15 + this.helmPitch * 4 + this.combatK * 5, hgt = 4.2 + this.helmPitch * 9 + this.combatK * 2.5;
    const targetX = s.pos.x - Math.sin(s.heading) * 3 * (1 - this.combatK * 0.32) + dxE * this.combatK * 0.32;
    const targetZ = s.pos.z - Math.cos(s.heading) * 3 * (1 - this.combatK * 0.32) + dzE * this.combatK * 0.32;
    const targetY = Math.max(s.pos.y + 3.4, this.world.topSolid(Math.floor(targetX), Math.floor(targetZ)) + 2.5);
    const candidates = [
      [yaw, dist, hgt], [yaw - 0.55, dist, hgt], [yaw + 0.55, dist, hgt],
      [yaw, dist * 0.72, hgt + 3], [yaw - 0.8, dist * 0.72, hgt + 3], [yaw + 0.8, dist * 0.72, hgt + 3],
      [yaw, dist * 0.62, hgt + 8],
    ];
    let best = null, bestScore = Infinity;
    for (const [angle, back, lift] of candidates) {
      const cx = clamp(s.pos.x + Math.sin(angle) * back, 2, W - 3);
      const cz = clamp(s.pos.z + Math.cos(angle) * back, 2, D - 3);
      let cy = s.pos.y + lift;
      const length = Math.hypot(cx - targetX, cy - targetY, cz - targetZ);
      const steps = Math.max(2, Math.ceil(length * 2));
      let requiredRaise = 0;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const x = targetX + (cx - targetX) * t, y = targetY + (cy - targetY) * t, z = targetZ + (cz - targetZ) * t;
        const ground = this.world.topSolid(Math.floor(x), Math.floor(z)) + 1.5;
        requiredRaise = Math.max(requiredRaise, (ground - y) / t);
      }
      const raise = Math.max(0, requiredRaise + 1.5);
      cy += raise;
      const score = Math.abs(back - dist) + Math.abs(angle - yaw) * 2 + raise * 2;
      if (score < bestScore) { bestScore = score; best = { x: cx, y: cy, z: cz }; }
      if (raise < 3) break;
    }
    if (best) _v.set(best.x, best.y, best.z);
    if (this.helmCamReset) { this.camPos.copy(_v); this.helmCamReset = false; }
    else this.camPos.lerp(_v, 1 - Math.exp(-dt * 7));
    cam.position.copy(this.camPos);
    cam.lookAt(targetX, targetY, targetZ);
  }
  thirdCamera(dt) {
    const P = this.player, cam = this.camera;
    const pitch = P.alive ? P.pitch : -0.45, yaw = P.yaw;
    const cp = Math.cos(pitch);
    const dx = -Math.sin(yaw) * cp, dy = Math.sin(pitch), dz = -Math.cos(yaw) * cp;
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const ox = P.pos.x, oy = P.pos.y + 1.55, oz = P.pos.z;
    const want = 4.8;
    const side = P.emote ? 0 : 0.65, back = P.emote ? 3.3 : want;
    const cameraPoint = (shoulder, lift) => ({
      x: ox - dx * back + rx * shoulder,
      y: oy - dy * back + lift,
      z: oz - dz * back + rz * shoulder,
    });
    const ship = P.mode === 'deck' ? P.ship || this.sloop : null;
    const shipClearance = (point, length) => {
      if (!ship || ship.sinking) return length;
      const ray = this.cameraRaycaster;
      ray.set(_cameraOrigin.set(ox, oy, oz), _cameraDirection.set(point.x - ox, point.y - oy, point.z - oz).normalize());
      ray.far = length;
      this.cameraRayHits.length = 0;
      ray.intersectObject(ship.group, true, this.cameraRayHits);
      for (const obstruction of this.cameraRayHits) {
        if (obstruction.object.isMesh && obstruction.distance > 0.18) return obstruction.distance;
      }
      return length;
    };
    if (ship && !ship.sinking) ship.group.updateMatrixWorld(true);
    let point = cameraPoint(side, 0.5);
    let length = Math.hypot(point.x - ox, point.y - oy, point.z - oz) || 1;
    if (shipClearance(point, length) < length - 0.35) {
      const alternatives = [
        [side, 1.4], [-side, 1.4], [-1.35, 1.4], [1.35, 1.4],
      ];
      let bestPoint = point, bestLength = length, bestClearance = shipClearance(point, length);
      for (const [shoulder, lift] of alternatives) {
        const candidate = cameraPoint(shoulder, lift);
        const candidateLength = Math.hypot(candidate.x - ox, candidate.y - oy, candidate.z - oz) || 1;
        const clearance = shipClearance(candidate, candidateLength);
        if (clearance >= candidateLength - 0.28) { bestPoint = candidate; bestLength = candidateLength; break; }
        if (clearance > bestClearance) { bestPoint = candidate; bestLength = candidateLength; bestClearance = clearance; }
      }
      point = bestPoint; length = bestLength;
    }
    let vx = (point.x - ox) / length, vy = (point.y - oy) / length, vz = (point.z - oz) / length;
    const hit = this.world.raycast(ox, oy, oz, vx, vy, vz, length, true);
    let k = hit ? Math.max(0.35, hit.t - 0.25) : length;
    const shipHit = shipClearance(point, Math.min(k, length));
    if (shipHit < k - 0.18) k = Math.max(0.35, shipHit - 0.28);
    this.tpDist = k < this.tpDist ? k : this.tpDist + (k - this.tpDist) * Math.min(1, dt * 5);
    let cy = oy + vy * this.tpDist;
    const surface = WATER_Y + waveHeight(ox + vx * this.tpDist, oz + vz * this.tpDist, this.waveTime) + 0.3;
    if (oy > surface && cy < surface) cy = surface;
    cam.position.set(ox + vx * this.tpDist, cy, oz + vz * this.tpDist);
    _look.set(ox + dx * 20, oy + dy * 20, oz + dz * 20);
    cam.lookAt(_look);
    this.camPos.copy(cam.position);
  }
  pickPreviewYaw() {
    const P = this.player, w = this.world;
    const base = (this.world.spawn ? this.world.spawn.yaw : 0) + Math.PI;
    for (let i = 0; i < 16; i++) {
      const yaw = base + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * (Math.PI / 8);
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      if (!w.raycast(P.pos.x, P.pos.y + 1.4, P.pos.z, fx, 0.0, fz, 3.4, true)) return yaw;
    }
    return base;
  }
  creatorCamera(dt) {
    const cam = this.camera, tab = this.sheets.opts.tab || 'captain';
    const shift = innerWidth > 760 ? 1 : 0;
    if (tab === 'ship' && this.sloop) {
      const s = this.sloop;
      s.showSail(1);
      const a = s.heading + Math.PI / 2 + 0.6 + Math.sin(this.waveTime * 0.2) * 0.25;
      const k = s.size;
      _w.set(s.pos.x + Math.sin(a) * 17 * k, s.pos.y + 6.5 * k, s.pos.z + Math.cos(a) * 17 * k);
      _look.set(s.pos.x, s.pos.y + 4.4 * k, s.pos.z);
      this.offsetLook(_w, _look, 4.6 * shift);
    } else {
      const P = this.player, yaw = this.previewYaw;
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      _w.set(P.pos.x + fx * 3.1, P.pos.y + 1.45, P.pos.z + fz * 3.1);
      _look.set(P.pos.x, P.pos.y + 1.0, P.pos.z);
      this.offsetLook(_w, _look, 0.95 * shift);
    }
    if (this.snapCam || this.camPos.distanceTo(_w) > 30) this.camPos.copy(_w);
    else this.camPos.lerp(_w, 1 - Math.exp(-dt * 5));
    this.snapCam = false;
    cam.position.copy(this.camPos);
    cam.lookAt(_look);
  }
  // Aim the camera to the left of its subject so the subject sits in the right half, beside the sheet.
  offsetLook(from, at, amount) {
    let dx = at.x - from.x, dz = at.z - from.z;
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    at.x -= -dz * amount; at.z -= dx * amount;
  }
  updateAvatar(dt) {
    const P = this.player, av = this.avatar;
    const creator = this.sheets.name === 'captain';
    const playing = this.state === 'play' || this.state === 'sheet';
    const third = this.camMode === 'third' || !!P.emote;
    const close = third && P.mode !== 'helm' && P.alive && this.tpDist < 0.95;
    const show = creator || (playing && !close && (P.mode === 'helm' || third || !P.alive));
    av.root.visible = show;
    if (!show) return;
    av.root.position.copy(P.pos);
    let yaw = P.yaw, st = P.animState;
    if (creator) { yaw = this.previewYaw + Math.sin(this.waveTime * 0.6) * 0.35; st = 'idle'; }
    else if (P.mode === 'helm' && this.sloop) yaw = this.sloop.heading;
    else if (P.emote) yaw = P.emote.yaw;
    av.root.rotation.y = yaw;
    const item = this.hotbar[this.sel];
    av.holdItem(item === 'cutlass' || item === 'pick' || (isGun(item) && this.inv[item] > 0) ? item : null);
    av.pose(st, dt, { rudder: this.sloop ? this.sloop.rudder : 0, swing: creator ? 0 : this.vmSwing, look: creator ? 0 : P.pitch * 0.6, kick: this.guns.kick });
  }
  handMesh(item) {
    if (item in this.handMeshes) return this.handMeshes[item];
    const d = ITEMS[item], mat = this.mats.prop;
    let g = null;
    if (d.block) g = blockGeo(d.block, 0.24);
    else if (item === 'coconut') g = new GeoBuilder({ round: 0.04 }).box(-0.1, -0.1, -0.1, 0.1, 0.1, 0.1, 0x6d4a2a).box(-0.03, 0.08, -0.03, 0.03, 0.12, 0.03, 0x3f2a17).build();
    else if (item === 'grog') g = new GeoBuilder({ round: 0.04 }).box(-0.09, -0.12, -0.09, 0.09, 0.1, 0.09, 0x6b4a2b).box(-0.08, 0.1, -0.08, 0.08, 0.14, 0.08, 0xf2ead8).box(0.09, -0.06, -0.02, 0.15, 0.05, 0.02, 0x4b321b).build();
    else if (item === 'hook') g = new GeoBuilder({ round: 0.04 }).box(-0.02, -0.16, -0.02, 0.02, 0.12, 0.02, 0x3a3d40).box(-0.1, -0.18, -0.02, 0.1, -0.14, 0.02, 0x3a3d40).box(-0.12, -0.18, -0.02, -0.08, -0.06, 0.02, 0x3a3d40).box(0.08, -0.18, -0.02, 0.12, -0.06, 0.02, 0x3a3d40).box(-0.07, 0.1, -0.07, 0.07, 0.2, 0.07, 0x8a6a44).build();
    else if (item === 'hammer') g = new GeoBuilder({ round: 0.03 }).box(-0.025, -0.2, -0.025, 0.025, 0.16, 0.025, 0x7a5232).box(-0.05, 0.14, -0.11, 0.05, 0.24, 0.09, 0x5d6266).box(-0.04, 0.16, 0.09, 0.04, 0.22, 0.15, 0x5d6266).build();
    else if (item === 'ball') g = new GeoBuilder({ round: 0.04 }).box(-0.09, -0.09, -0.09, 0.09, 0.09, 0.09, 0x1d1f21).build();
    else if (item === 'meat') g = new GeoBuilder({ round: 0.04 }).box(-0.1, -0.06, -0.08, 0.1, 0.06, 0.08, 0x8a3a2a).box(0.1, -0.025, -0.025, 0.2, 0.025, 0.025, 0xece4d0).build();
    else if (item === 'crab') g = new GeoBuilder({ round: 0.04 }).box(-0.1, -0.04, -0.07, 0.1, 0.04, 0.07, 0xd0482a).box(-0.16, -0.03, -0.12, -0.1, 0.03, -0.05, 0xe05a30).box(0.1, -0.03, -0.12, 0.16, 0.03, -0.05, 0xe05a30).build();
    else if (item === 'bone') g = new GeoBuilder({ round: 0.04 }).box(-0.03, -0.14, -0.03, 0.03, 0.14, 0.03, 0xece4d0).box(-0.06, 0.12, -0.04, 0.06, 0.17, 0.04, 0xece4d0).box(-0.06, -0.17, -0.04, 0.06, -0.12, 0.04, 0xece4d0).build();
    const m = g ? new THREE.Mesh(g, mat) : null;
    this.handMeshes[item] = m;
    return m;
  }
  updateViewModel(dt) {
    const P = this.player;
    this.vmSwing = Math.max(0, this.vmSwing - dt * 4.2);
    if (!this.showViewArm()) return;
    const item = this.hotbar[this.sel];
    const have = !!item && (ITEMS[item].tool || (this.inv[item] || 0) > 0);
    this.viewArm.hold(have ? item : null, have ? this.handMesh(item) : null);
    const sw = Math.sin(this.vmSwing * Math.PI);
    const mv = P.moving ? 1 : 0;
    const bob = Math.sin(P.walkPhase) * mv;
    const tool = item === 'cutlass' || item === 'pick';
    if (isGun(item) && have) { this.gunViewModel(dt, P, mv, bob); return; }
    // Build the arm's orientation from two camera-space directions: shoulder-to-hand, and where the held item points.
    _a.set(-0.24, 0.3, -0.92).normalize();
    _b.set(tool ? -0.1 : 0.15, 1, tool ? -0.4 : 0.25);
    _b.addScaledVector(_a, -_b.dot(_a)).normalize();
    _x.crossVectors(_a, _b);
    _m.makeBasis(_x, _ya.copy(_a).negate(), _zb.copy(_b).negate());
    _q.setFromRotationMatrix(_m);
    _eul.set(-sw * (tool ? 0.95 : 0.5), sw * (tool ? 0.3 : 0.1), 0, 'YXZ');
    _qs.setFromEuler(_eul);
    const g = this.viewArm.group, S = 0.55;
    g.quaternion.multiplyQuaternions(_qs, _q);
    g.scale.setScalar(S);
    this.viewArm.hand.scale.setScalar(1);
    const hx = 0.42 + Math.cos(P.walkPhase * 0.5) * 0.012 * mv, hy = -0.26 + bob * 0.012, hz = -0.9;
    g.position.set(hx - _a.x * 0.72 * S, hy - _a.y * 0.72 * S, hz - _a.z * 0.72 * S);
  }
  gunViewModel(dt, P, mv, bob) {
    const A = this.guns.aim, K = this.guns.kick;
    _a.set(-0.16 + 0.1 * A, 0.13 - 0.07 * A, -1).normalize();
    _b.set(0, 1, 0);
    _b.addScaledVector(_a, -_b.dot(_a)).normalize();
    _x.crossVectors(_a, _b);
    _m.makeBasis(_x, _ya.copy(_a).negate(), _zb.copy(_b).negate());
    _q.setFromRotationMatrix(_m);
    _eul.set(K * 0.3, 0, 0, 'YXZ');
    _qs.setFromEuler(_eul);
    const g = this.viewArm.group, S = 0.55;
    g.quaternion.multiplyQuaternions(_qs, _q);
    g.scale.setScalar(S);
    this.viewArm.hand.scale.setScalar(1);
    const sway = (1 - A) * mv;
    const hx = 0.3 - 0.22 * A + Math.cos(P.walkPhase * 0.5) * 0.012 * sway, hy = -0.27 + A * 0.12 + bob * 0.012 * (1 - A), hz = -0.62 + K * 0.07;
    g.position.set(hx - _a.x * 0.72 * S, hy - _a.y * 0.72 * S, hz - _a.z * 0.72 * S);
  }
  swing() { if (this.vmSwing < 0.35) { this.vmSwing = 1; this.sfx.swing(); } }

  // ---------------------------------------------------------------- hands: mining, fighting, building
  aimRay() {
    const P = this.player;
    if (this.camMode === 'third') {
      const cam = this.camera;
      cam.getWorldDirection(_dir);
      P.eye(_eye);
      const t0 = Math.max(0, _v.subVectors(_eye, cam.position).dot(_dir));
      _o.copy(cam.position).addScaledVector(_dir, t0);
      return { o: _o, d: _dir, max: 5.2 };
    }
    return { o: P.eye(_eye), d: P.viewDir(_dir), max: 5.5 };
  }
  isProtected(x, y, z) {
    for (const n of this.npcs.list) {
      if (Math.abs(x + 0.5 - n.site.x) < 2.2 && Math.abs(z + 0.5 - n.site.z) < 2.2 && y >= n.site.y - 3 && y <= n.site.y + 3) return n;
    }
    return null;
  }
  mineMul(item, id) {
    const cls = BLOCKS[id].cls;
    if (BLOCKS[id].piece) return item === 'hammer' ? 4 : item === 'pick' || item === 'cutlass' ? 1.5 : 1;
    if (item === 'pick') return cls === 'stone' ? (this.upgrades.pick ? 3.5 : 2.2) : cls === 'soil' ? 1.5 : 1;
    if (item === 'cutlass') return cls === 'wood' ? 1.35 : 0.9;
    return 1;
  }
  updateActions(dt) {
    const P = this.player, I = this.input;
    this.highlight.visible = false; this.digRing.visible = false;
    if (!P.alive || P.mode === 'helm') { this.mine.p = 0; this.ui.setMineProgress(0); I.take('place'); return; }
    if (P.mode === 'deck' && P.gun >= 0) { this.gunActions(dt); return; }
    const held = this.hotbar[this.sel];
    if (isGun(held) && (this.inv[held] || 0) > 0) {
      this.mine.p = 0; this.builder.update(dt, null, null, true);
      this.guns.handle(dt, held);
      I.take('place');
      return;
    }
    this.guns.held = I.primaryHeld; this.guns.aim = Math.max(0, this.guns.aim - dt * 8);
    const { o, d, max } = this.aimRay();
    const hit = this.world.pick(o.x, o.y, o.z, d.x, d.y, d.z, max);
    const validHit = hit && hit.y >= FLOOR ? hit : null;
    const sk0 = this.enemies.raycast(o, d, 3.6), sc = this.crews.raycast(o, d, 3.6);
    const sk = sc && (!sk0 || sc.t < sk0.t) ? sc : sk0;
    const an = this.fauna.raycast(o, d, 3.4);
    const tn = this.kraken && this.kraken.alive ? this.kraken.meleeHit(o, d, 3.6) : null;
    const tB = validHit ? validHit.t : 1e9, tS = sk ? sk.t : 1e9, tA = an ? an.t : 1e9, tT = tn ? tn.t : 1e9;
    const tnFirst = tn && tT < tB && tT <= tS && tT <= tA;
    const anFirst = an && !tnFirst && tA < tB && tA <= tS;
    const skFirst = sk && !tnFirst && !anFirst && tS < tB;
    if (validHit && !skFirst && !tnFirst && !anFirst) {
      if (validHit.terrain) {
        // a soft ring on the ground where the dig lands, instead of a block outline
        const R = this.digRing;
        R.visible = true;
        R.position.set(validHit.px + validHit.snx * 0.03, validHit.py + validHit.sny * 0.03, validHit.pz + validHit.snz * 0.03);
        _v.set(validHit.snx, validHit.sny, validHit.snz);
        R.quaternion.setFromUnitVectors(_up, _v);
        R.scale.setScalar(1 + this.mine.p * 0.35);
      } else { this.highlight.visible = true; this.highlight.position.set(validHit.x + 0.5, validHit.y + 0.5, validHit.z + 0.5); }
    }
    const item = this.hotbar[this.sel];
    this.builder.update(dt, skFirst || anFirst || tnFirst ? null : validHit, { o, d });
    if (this.builder.active) this.highlight.visible = false;
    else if (validHit && validHit.piece && this.highlight.visible) this.fitHighlight(validHit);
    else this.highlight.scale.set(1, 1, 1);
    if (I.primaryHeld) {
      if (anFirst) {
        if (P.attackCD <= 0) { this.fauna.hurt(an.a, item === 'cutlass' ? 12 : item === 'pick' ? 7 : 4, { x: d.x, z: d.z }); P.attackCD = 0.42; this.vmSwing = 1; this.sfx.hit(); }
        this.mine.p = 0;
      } else if (tnFirst) {
        if (P.attackCD <= 0) {
          const dmg = item === 'cutlass' ? 9 : 4;
          if (this.net.inCrew) { tn.tn.flash = 1; this.net.req('kt', tn.tn.netId ?? tn.tn.nid, dmg); const m = tn.tn.mid(); this.particles.burst(m.x, m.y, m.z, 0x8a3a6a, 8, 2.2, 2, 12, 0.7, 0.8); }
          else tn.tn.damage(dmg);
          P.attackCD = 0.42; this.vmSwing = 1; this.sfx.hit();
        }
        this.mine.p = 0;
      } else if (skFirst) {
        if (P.attackCD <= 0) {
          const dmg = item === 'cutlass' ? 12 : item === 'pick' ? 7 : 4;
          if (sk.sailor) {
            const q = sk.s;
            if (this.net.inCrew) { q.flash = 1; this.net.req('hc', q.nid, dmg, Math.round(d.x * 100) / 100, Math.round(d.z * 100) / 100); }
            else this.crews.hurt(q, dmg, { x: d.x, z: d.z });
          } else if (this.net.inCrew) { const q = sk.s; q.flash = 1; this.net.req('hk', q.nid, dmg, Math.round(d.x * 100) / 100, Math.round(d.z * 100) / 100); this.particles.burst(q.pos.x, q.pos.y + 1.2, q.pos.z, 0xe9e1cb, 6, 2, 2, 14, 0.5, 0.3); }
          else { sk.s.lastBy = null; sk.s.hurt(dmg, { x: d.x, z: d.z }); }
          P.attackCD = 0.42; this.vmSwing = 1; this.sfx.hit();
        }
        this.mine.p = 0;
      } else if (validHit) {
        const prot = this.isProtected(validHit.x, validHit.y, validHit.z);
        if (prot) {
          if (!this.protMsgT || this.waveTime > this.protMsgT) { this.protMsgT = this.waveTime + 3; this.ui.pickup(`${prot.def.name} won’t have you digging up the floor`); }
          this.mine.p = 0;
        } else {
          if (this.mine.x !== validHit.x || this.mine.y !== validHit.y || this.mine.z !== validHit.z) { this.mine.x = validHit.x; this.mine.y = validHit.y; this.mine.z = validHit.z; this.mine.p = 0; }
          const id = validHit.id, bd = BLOCKS[id];
          if (id === B.BEDROCK) {
            this.mine.p = 0; this.ui.setMineProgress(0);
          } else if (id === B.KEG) {
            // a powder keg isn't dug up: hit it and the fuse catches
            if (P.attackCD <= 0) { P.attackCD = 0.42; this.swing(); this.lightKeg(validHit.x, validHit.y, validHit.z); }
            this.mine.p = 0; this.ui.setMineProgress(0);
            if (I.take('place')) this.useItem(validHit);
            return;
          }
          this.mine.p += (dt * this.mineMul(item, id)) / (bd.hard || 0.5);
          this.mineSoundT -= dt;
          if (this.mineSoundT <= 0) {
            this.mineSoundT = 0.24; this.swing();
            this.sfx.chop(bd.cls === 'stone' ? 'stone' : bd.cls === 'wood' ? (id === B.LEAVES || id === B.FROND ? 'leaf' : 'wood') : 'soft');
            if (validHit.terrain) this.particles.burst(validHit.px, validHit.py, validHit.pz, bd.color || 0x888888, 4, 1.8, 1.8, 14, 0.4, 0.35);
            else this.particles.burst(validHit.x + 0.5 + validHit.nx * 0.52, validHit.y + 0.5 + validHit.ny * 0.52, validHit.z + 0.5 + validHit.nz * 0.52, bd.color || 0x888888, 3, 1.6, 1.5, 14, 0.4, 0.3);
          }
          if (this.mine.p >= 1) { this.breakBlock(validHit.x, validHit.y, validHit.z, id, validHit.part); this.mine.p = 0; }
        }
      } else {
        this.mine.p = 0;
        if (P.attackCD <= 0) { this.swing(); P.attackCD = 0.42; }
      }
    } else this.mine.p = 0;
    this.ui.setMineProgress(this.mine.p);
    if (I.take('place')) { if (this.builder.active) this.builder.place(); else this.useItem(validHit); }
  }
  // on a gun: click to fire it where you're looking; the ring shows it reloading
  gunActions(dt) {
    const P = this.player, s = this.sloop, I = this.input, i = P.gun;
    this.mine.p = 0; I.take('place');
    if (!s) return;
    const cd = s.gunCD[i], full = 2.2 * (s.reloadMul || 1);
    this.ui.setMineProgress(cd > 0 ? 1 - cd / full : 0);
    if (!I.primaryHeld || cd > 0) return;
    if (!(this.inv.ball > 0)) { if (!this.noShotT || this.waveTime > this.noShotT) { this.noShotT = this.waveTime + 3; this.ui.toast('Out of shot', 'Craft cannonballs from stone: 2 stone makes 3 shot. Old Mags sells them too.'); } return; }
    this.inv.ball--;
    s.gunCD[i] = full;
    if (this.net.inCrew) { s.recoil[i] = 1; this.gunFx(s, i); this.net.req('cf', i, Math.round(s.gunAim[i][0] * 1000) / 1000, Math.round(s.gunAim[i][1] * 1000) / 1000); }
    else fireGun(this, s, i, s.gunAim[i][0], s.gunAim[i][1]);
    this.shake(0.12);
  }
  gunFx(s, i) {
    const m = s.muzzle(i);
    this.particles.burst(m.x, m.y, m.z, 0xffb347, 8, 2.5, 1.5, 0, 0.18, 0.2);
    this.physics.puffs.add(m.x + m.dx * 0.8, m.y + 0.2, m.z + m.dz * 0.8, { color: 0xb9bcbf, size: 1.1, grow: 2.2, life: 1.6, opacity: 0.55, vx: m.dx * 2, vy: 0.6, vz: m.dz * 2 });
    this.sfx.boom(this.distToListener(m.x, m.z));
  }
  // the outline around just the part of a building piece being aimed at
  fitHighlight(hit) {
    const H = this.highlight, x = hit.x, y = hit.y, z = hit.z;
    let b = [x, y, z, x + 1, y + 1, z + 1];
    if (hit.part === 'floor') b = [x, y, z, x + 1, y + 0.16, z + 1];
    else if (hit.part === 'west') b = [x - 0.08, y, z, x + 0.08, y + 1, z + 1];
    else if (hit.part === 'north') b = [x, y, z - 0.08, x + 1, y + 1, z + 0.08];
    H.position.set((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2);
    H.scale.set(b[3] - b[0] + 0.01, b[4] - b[1] + 0.01, b[5] - b[2] + 0.01);
  }
  give(item, n = 1) { this.inv[item] = (this.inv[item] || 0) + n; this.ui.pickup(`+${n} ${ITEMS[item].name}`); }
  breakBlock(x, y, z, id, part) {
    if (id === B.BEDROCK) return;
    const bd = BLOCKS[id];
    if (bd.piece) { this.breakPiece(x, y, z, id, part); return; }
    this.world.set(x, y, z, B.AIR);
    this.particles.burst(x + 0.5, y + 0.5, z + 0.5, bd.color || 0x888888, 8, 2.4, 2.6, 16, 0.7, 0.8);
    this.physics.chips(x, y, z, id, bd.plant ? 0 : 4);
    { const P = this.player, dx = x + 0.5 - P.pos.x, dz = z + 0.5 - P.pos.z, l = Math.hypot(dx, dz) || 1; this.physics.queueCheck(x, y, z, dx / l, dz / l); }
    this.sfx.brk();
    this.stats.blocks++;
    if (this.net.inCrew) {
      this.net.req('b', x, y, z);
      if (id === B.CHEST || id === B.VAULT) return;      // the captain's game opens it and sends your share
    }
    if (id === B.CHEST) { this.openChest(x, y, z); return; }
    if (id === B.VAULT) { this.openVault(x, y, z); return; }
    if (id === B.BARREL || id === B.CRATE) { this.lootContainer(id); return; }
    if (bd.drop) { this.give(bd.drop, 1); if (bd.drop === 'wood') this.stats.wood++; }
    if ((id === B.FROND || id === B.LEAVES) && Math.random() < 0.06) this.give('coconut', 1);
  }
  breakPiece(x, y, z, id, part) {
    const w = this.world, bd = BLOCKS[id];
    let next = 0;
    if (isCode(id) && part && part !== 'all') {
      next = withoutPart(id, part);
      // a doorway's upper half goes with its lower half
      const up = w.get(x, y + 1, z), pu = pieceParts(up), p = pieceParts(id);
      if ((part === 'west' || part === 'north') && p[part] === 3 && pu && pu[part] === 3) {
        const n2 = withoutPart(up, part);
        w.set(x, y + 1, z, n2 || B.AIR);
        if (this.net.inCrew) this.net.req('pl', x, y + 1, z, n2);
      }
    }
    w.set(x, y, z, next || B.AIR);
    if (this.net.inCrew) this.net.req('pl', x, y, z, next);
    this.physics.chips(x, y, z, id, 3);
    this.particles.burst(x + 0.5, y + 0.5, z + 0.5, bd.color || 0x888888, 6, 2, 2, 14, 0.6, 0.6);
    this.physics.queueCheck(x, y, z);
    this.sfx.brk();
    this.stats.blocks++;
    if (bd.drop) this.give(bd.drop, 1);
  }
  // What the chest at x, y, z holds. A quest chest also moves the story along.
  rollChest(x, y, z) {
    const site = this.world.sites.loot.find((l) => l.x === x && l.y === y && l.z === z);
    if (site && (site.kind === 'fort' || site.kind === 'cove')) {
      const fort = site.kind === 'fort', gold = fort ? 140 + ((Math.random() * 90) | 0) : 100 + ((Math.random() * 80) | 0);
      return { gold, items: [...(fort ? [['ball', 8], ['keg', 2], ['shot', 12]] : [['keg', 1], ['grog', 2], ['shot', 10]]), ...this.rollValuables(site.kind)], title: fort ? 'The garrison’s pay chest' : 'A smuggler’s stash', text: `+${gold} gold and valuables. Stow them in your sea chest, sell them to Old Mags.`, kind: 'good' };
    }
    if (site) {
      const wreck = site.kind === 'wreck', gold = wreck ? 80 + ((Math.random() * 80) | 0) : 60 + ((Math.random() * 60) | 0);
      return { gold, items: [...(wreck ? [['grog', 1], ['ball', 5]] : [['lantern', 2], ['coconut', 2]]), ...this.rollValuables(wreck ? 'wreck' : 'cache')], title: wreck ? 'A wreck’s strongbox' : 'A buried cache', text: `+${gold} gold. Bank it with Old Mags.`, kind: 'good' };
    }
    const r = this.quests.onChestOpened(x, y, z);
    const gold = r ? r.gold : 25 + ((Math.random() * 25) | 0);
    if (r && r.cursed) return { gold, items: [], title: 'Cursed gold', text: `+${gold} gold. Bank it with Old Mags at Brine Haven. The sand is moving.`, kind: 'curse', cursed: true, story: !!r.story };
    if (r && r.story) return { gold, items: [], quiet: true, story: true };
    if (r) return { gold, items: [], title: 'Treasure', text: `+${gold} gold. Bank it with Old Mags before something takes it from you.`, kind: 'good' };
    return { gold, items: [], title: 'A forgotten chest', text: `+${gold} gold.`, kind: 'good' };
  }
  openChest(x, y, z) {
    this.stats.chests++;
    const r = this.rollChest(x, y, z);
    this.gold += r.gold;
    this.sfx.coin();
    for (const [it, n] of r.items) this.give(it, n);
    if (r.quiet) this.ui.pickup(`+${r.gold} gold`); else this.ui.toast(r.title, r.text, r.kind);
    if (r.cursed) this.curseAt(x, y, z, false);
  }
  // cursed gold wakes guards around the chest, and soon a ghost ship
  curseAt(x, y, z, anyone) {
    this.sfx.curse();
    this.enemies.spawnNear(x + 0.5, z + 0.5, 2 + Math.min(3, this.level), 3.5, 7.5, { kind: 'guard' });
    this.after(7, () => {
      if ((anyone || this.gold > 0) && this.hollows.filter((h) => !h.sinking && h.kind === 'hollow').length < 2 && this.spawnHollow({})) {
        this.ui.toast('The Hollow Wake', 'A ghost sloop has your scent. Black sails on the horizon.', 'curse');
        this.net.toastAll('The Hollow Wake', 'A ghost sloop has the crew’s scent. Black sails on the horizon.', 'curse');
        this.sfx.curse();
      }
    });
  }
  lootContainer(id) {
    const r = Math.random();
    if (id === B.BARREL) { if (r < 0.5) this.give('grog', 1); else if (r < 0.8) this.give('coconut', 2); else this.give('ball', 6); }
    else if (r < 0.4) this.give('plank', 6);
    else if (r < 0.7) this.give('ball', 4);
    else { const g = 15 + ((Math.random() * 20) | 0); this.gold += g; this.ui.pickup(`+${g} gold`); this.sfx.coin(); }
  }
  openVault(x, y, z) {
    this.quests.onVaultOpened();
    this.enemies.spawnNear(x + 0.5, z + 0.5, 4, 3, 7, { kind: 'guard' });
    this.sfx.curse(); this.shake(0.4);
  }
  useItem(hit) {
    const P = this.player, item = this.hotbar[this.sel];
    if (!item) return;
    const def = ITEMS[item];
    if (item === 'hook') { this.hook.use(); return; }
    if (item === 'coconut' && this.inv.coconut > 0) { const r = this.aimRay(); if (this.fauna.tame(r.o, r.d)) { this.vmSwing = 1; return; } }
    if (def.food) {
      if (!(this.inv[item] > 0)) { this.ui.pickup(`No ${def.name.toLowerCase()} left`); return; }
      if (P.hunger > 98 && P.hp >= P.maxHp - 1) { this.ui.pickup('You are full'); return; }
      this.inv[item]--;
      P.hunger = Math.min(100, P.hunger + def.food.hunger);
      P.hp = Math.min(P.maxHp, P.hp + def.food.hp);
      this.sfx.eat(); this.vmSwing = 1;
      this.ui.pickup(item === 'grog' ? `+${def.food.hp} health` : `+${def.food.hunger} hunger`);
      return;
    }
    if (!def.block || !hit) return;
    if (!(this.inv[item] > 0)) { this.ui.pickup(`Out of ${def.name.toLowerCase()}`); return; }
    const tx = hit.place ? hit.place.x : hit.x + hit.nx, ty = hit.place ? hit.place.y : hit.y + hit.ny, tz = hit.place ? hit.place.z : hit.z + hit.nz;
    if (!this.world.inside(tx, ty, tz) || ty < FLOOR || ty >= H - 1) return;
    const cur = this.world.get(tx, ty, tz);
    if (cur !== B.AIR && !BLOCKS[cur].plant) return;
    if (P.mode === 'foot' && P.intersectsBlock(tx, ty, tz)) return;
    if (this.isProtected(tx, ty, tz)) { this.ui.pickup('Not on someone’s doorstep'); return; }
    for (const s of [this.sloop, ...this.hollows]) if (s && !s.sinking && s.containsPoint(tx + 0.5, ty + 0.5, tz + 0.5)) return;
    this.world.set(tx, ty, tz, def.block);
    if (this.net.inCrew) this.net.req('pl', tx, ty, tz, def.block);
    this.inv[item]--;
    this.stats.placed++;
    this.sfx.place(); this.vmSwing = 1;
  }
  canCraft(i, times = 1) { const r = RECIPES[i]; return Object.entries(r.cost).every(([k, v]) => (this.inv[k] || 0) >= v * times); }
  craft(i, times = 1) {
    if (!this.canCraft(i, times)) return false;
    const r = RECIPES[i];
    for (const [k, v] of Object.entries(r.cost)) this.inv[k] -= v * times;
    this.inv[r.out] = (this.inv[r.out] || 0) + r.n * times;
    this.stats.crafted += times;
    this.sfx.place();
    this.ui.pickup(`+${r.n * times} ${ITEMS[r.out].name}`);
    // a new gun goes straight into an empty hotbar slot
    if (r.tool && !this.hotbar.includes(r.out)) {
      const k = this.hotbar.indexOf(null);
      if (k >= 0) { this.hotbar[k] = r.out; this.ui.buildHotbar(); }
      else this.ui.toast(ITEMS[r.out].name, 'Open the Bag to put it on your hotbar. You need lead shot to fire it: melt a cannonball into ten.', '');
      if (!(this.inv.shot > 0)) this.after(0.4, () => this.ui.pickup('Craft lead shot from a cannonball to load it'));
    }
    return true;
  }
  lampNear(x, y, z, r) {
    const r2 = r * r;
    for (const i of this.world.lamps) {
      const lx = i % W, lz = ((i / W) | 0) % D, ly = (i / (W * D)) | 0;
      const dx = lx + 0.5 - x, dy = ly + 0.5 - y, dz = lz + 0.5 - z;
      if (dx * dx + dy * dy + dz * dz < r2) return true;
    }
    return false;
  }
  nearLight() { const P = this.player; return this.nearLightAt(P.pos.x, P.pos.y, P.pos.z); }
  nearLightAt(x, y, z) {
    if (this.lampNear(x, y + 1, z, 9)) return true;
    for (const n of this.npcs.list) if (Math.hypot(n.site.x - x, n.site.z - z) < 16) return true;
    const lh = this.world.sites.lighthouse;
    return !!(lh && this.isLit() && Math.hypot(lh.x - x, lh.z - z) < 45);
  }
  burnNearLamps(dt) {
    this.lightT -= dt;
    if (this.lightT > 0) return;
    this.lightT = 0.5;
    for (const s of this.enemies.list) {
      if (s.kind !== 'night' || s.state !== 'walk') continue;
      if (this.lampNear(s.pos.x, s.pos.y + 1, s.pos.z, 5.5)) { s.hurt(9, null); this.particles.burst(s.pos.x, s.pos.y + 1.4, s.pos.z, 0xffd27a, 5, 0.8, 1.5, -1, 0.7, 0.4); }
    }
  }

  // ---------------------------------------------------------------- interactions
  computeInteraction() {
    const P = this.player;
    if (!P.alive) return null;
    if (P.mode === 'helm') return { id: 'leaveHelm', label: 'Leave the helm', short: 'Leave helm' };
    if (P.mode === 'deck') {
      const L = P.local, at = (y) => Math.abs(L.y - y) < 0.3;
      if (P.gun >= 0) return { id: 'leaveGun', label: 'Leave the gun', short: 'Leave gun' };
      if (P.climb) return null;
      const other = P.ship && P.ship !== this.sloop ? P.ship : null;
      if (other) {
        if (at(SHIP.deck) && Math.hypot(L.x - LADDER.x, L.z - LADDER.z) < 0.9) return { id: 'climbUp', label: 'Climb to the crow’s nest', short: 'Climb' };
        if (at(SHIP.nest) && Math.hypot(L.x - LADDER.x, L.z - LADDER.z) < 0.9) return { id: 'climbDown', label: 'Climb down', short: 'Climb down' };
        if (at(SHIP.low) && Math.hypot(L.x - CHEST.x, L.z - CHEST.z) < 1.0 * SCALE) {
          if (other.looted) return { id: 'busy', label: 'The strongbox is empty', short: 'Empty' };
          if (!other.taken) return { id: 'busy', label: 'Beat her crew first', short: 'Locked' };
          return { id: 'strongbox', ship: other, label: 'Break open the strongbox', short: 'Strongbox' };
        }
        return null;
      }
      if (at(SHIP.qd) && Math.hypot(L.x - HELM.x, L.z - HELM.z) < 1.3) {
        const who = this.net.helmBusy();
        if (who) return { id: 'busy', label: `${who} has the wheel`, short: 'Wheel taken' };
        return { id: 'helm', label: 'Take the helm', short: 'Take helm' };
      }
      let gi = -1, gd = 1.0;
      for (const g of GUNS) { if (!at(g.y)) continue; const p = gunPlace(g), d = Math.hypot(L.x - (p.stand + p.cx) / 2, L.z - g.z); if (d < gd) { gd = d; gi = g.i; } }
      if (gi >= 0) { const who = this.net.gunBusy(gi); return who ? { id: 'busy', label: `${who} is on that gun`, short: 'Gun taken' } : { id: 'gun', gun: gi, label: 'Man the gun', short: 'Man gun' }; }
      if (at(SHIP.deck) && Math.hypot(L.x - LADDER.x, L.z - LADDER.z) < 0.9) return { id: 'climbUp', label: 'Climb to the crow’s nest', short: 'Climb' };
      if (at(SHIP.nest) && Math.hypot(L.x - LADDER.x, L.z - LADDER.z) < 0.9) return { id: 'climbDown', label: 'Climb down', short: 'Climb down' };
      if (at(SHIP.low) && Math.hypot(L.x - CHEST.x, L.z - CHEST.z) < 1.0 * SCALE) return { id: 'chest', label: 'Open your sea chest', short: 'Chest' };
    }
    if (P.mode === 'foot') {
      const n = this.npcs.nearest(P, 3.9);
      if (n) {
        const lv = n.id === 'mags' ? this.lootValue(this.inv) : 0, bank = n.id === 'mags' && this.gold + lv > 0;
        return { id: 'npc', npc: n.id, label: bank ? (lv ? `Talk to Old Mags: sell your loot and bank ${this.gold + lv} gold` : `Talk to Old Mags and bank ${this.gold} gold`) : `Talk to ${n.def.name}`, short: 'Talk' };
      }
    }
    return null;
  }
  doInteraction(it) {
    const P = this.player, s = this.sloop;
    if (it.id === 'busy') return;
    if (it.id === 'helm' && s) {
      if (this.net.inCrew) this.net.takeHelm();
      P.mode = 'helm';
      this.helmYaw = 0; this.helmPitch = 0.3;
      this.helmCamReset = true;
      this.sfx.thud();
      if (!this.hints.helm) {
        this.hints.helm = 1;
        this.ui.toast('At the helm', this.isTouch ? 'Push the stick up to raise sail and sideways to steer. Fire left and right broadsides with the buttons.' : 'W and S trim the sails, A and D steer. Q fires the port guns, E the starboard guns. F leaves the helm.');
      }
    } else if (it.id === 'strongbox') {
      this.openStrongbox(it.ship);
    } else if (it.id === 'leaveHelm' && s) {
      if (this.net.inCrew) this.net.leaveHelm();
      P.mode = 'deck';
      P.local.set(HELM.x, SHIP.qd, HELM.z);
      P.yaw = s.heading; P.pitch = 0; P.prevShipHeading = s.heading;
      if (s.sailLvl > 0.05) this.ui.pickup('Sails furled');
      s.sailLvl = 0; s.rudder = 0;
    } else if (it.id === 'npc') {
      this.sfx.thud();
      this.openSheet('npc', { npc: it.npc });
    } else if (it.id === 'gun' && s) {
      P.gun = it.gun; P.climb = false;
      const g = GUNS[it.gun];
      P.yaw = s.heading + (g.side > 0 ? -Math.PI / 2 : Math.PI / 2); P.pitch = 0.06;
      this.sfx.thud();
      if (!this.hints.gun) { this.hints.gun = 1; this.ui.toast('On the gun', this.isTouch ? 'Look to aim, Hit to fire. Each shot takes a cannonball. Use to step away.' : 'Look to aim, click to fire. Each shot takes a cannonball. F to step away.'); }
    } else if (it.id === 'leaveGun') {
      P.gun = -1;
    } else if (it.id === 'climbUp' && s) {
      P.climb = true; P.local.set(LADDER.x, SHIP.deck + 0.05, LADDER.z);
      P.yaw = s.heading; this.sfx.climb();
    } else if (it.id === 'climbDown' && s) {
      P.climb = true; P.local.set(LADDER.x, SHIP.nest - 0.3, LADDER.z);
      P.yaw = s.heading; this.sfx.climb();
    } else if (it.id === 'chest') {
      this.sfx.thud();
      this.openSheet('chest');
    }
  }
  bank() {
    let g = this.gold;
    // valuables you carry are sold along with the gold
    const lv = this.lootValue(this.inv);
    let sold = 0;
    if (lv > 0) { for (const k of Object.keys(this.inv)) if (ITEMS[k] && ITEMS[k].loot) { sold += this.inv[k]; this.inv[k] = 0; } g += lv; this.stats.sold = (this.stats.sold || 0) + sold; }
    if (g <= 0) return;
    this.banked += g; this.earned += g; this.gold = 0;
    this.sfx.coin();
    let extra = lv > 0 ? ` That includes ${lv} for ${sold} piece${sold > 1 ? 's' : ''} of loot.` : '';
    const s = this.sloop, m = this.npcs.get('mags'), crew = this.net.inCrew;
    if (s && !s.sinking && m && Math.hypot(s.pos.x - m.site.x, s.pos.z - m.site.z) < 50) {
      if ((!crew && s.hp < s.maxHp) || (this.inv.ball || 0) < 12) extra = crew ? ' She tops up your shot.' : ' Her crew patches your hull and tops up your shot.';
      if (!crew) s.hp = s.maxHp;
      this.inv.ball = Math.max(this.inv.ball || 0, 12);
    }
    if (!crew) for (const h of this.hollows) if (h.kind === 'hollow' && !h.huntId && h.variant !== 'flagship') h.leaving = true;
    this.ui.toast(`Banked ${g} gold`, `${this.banked} gold to your name.${extra}`, 'good');
    if (!crew) this.quests.onBank(g);
    this.autosave('bank', true);
  }
  buyUpgrade(id) {
    const u = UPGRADES.find((x) => x.id === id);
    if (!u || this.upgrades[id] || (u.req && !this.upgrades[u.req]) || (u.reqVessel && !this.ownedShips[u.reqVessel]) || this.banked < u.price) return false;
    this.banked -= u.price;
    this.upgrades[id] = true;
    this.applyUpgrades();
    if (id.startsWith('hull') && this.sloop) this.sloop.hp = this.sloop.maxHp;
    if (id === 'coat') this.player.hp = this.player.maxHp;
    this.sfx.coin();
    this.ui.toast(u.name, u.desc, 'good');
    this.autosave('shop', true);
    return true;
  }
  refitVessel(id) {
    const vessel = PLAYER_VESSELS.find((v) => v.id === id);
    if (!vessel || this.net.inCrew || this.player.mode !== 'foot' || this.player.ship || !this.world.dock) return false;
    const hpRatio = this.sloop && this.sloop.maxHp > 0 ? clamp(this.sloop.hp / this.sloop.maxHp, 0, 1) : 1;
    const dock = this.world.dock;
    this.shipType = id;
    this.spawnSloop({ x: dock.x, z: dock.z, h: dock.heading, hp: 1 });
    this.sloop.hp = Math.max(1, Math.round(this.sloop.maxHp * hpRatio));
    this.sfx.place();
    return true;
  }
  selectVessel(id) {
    const vessel = PLAYER_VESSELS.find((v) => v.id === id);
    if (!vessel || this.shipType === id || !this.ownedShips[id] || !this.refitVessel(id)) return false;
    this.autosave('shipyard', true);
    this.ui.toast(`${vessel.label} in service`, 'Old Mags has your previous boat berthed at Brine Haven.', 'good');
    return true;
  }
  buyVessel(id) {
    const vessel = VESSELS.find((v) => v.id === id);
    if (!vessel || this.ownedShips[id] || !this.quests.flags.shipwrightIntro || !this.ownedShips[vessel.requires]
      || !vesselProgress(this, vessel).unlocked || this.banked < vessel.price) return false;
    if (!this.refitVessel(id)) return false;
    this.banked -= vessel.price;
    this.ownedShips[id] = true;
    this.sfx.coin();
    this.ui.toast(`${vessel.name} commissioned`, `${vessel.desc} Old Mags has your former vessel berthed at Brine Haven.`, 'good');
    this.autosave('shipyard', true);
    return true;
  }
  buySupply(i) {
    const s = SUPPLIES[i];
    if (!s || this.banked < s.price) return false;
    this.banked -= s.price;
    this.give(s.item, s.n);
    this.sfx.coin();
    return true;
  }
  skipTo(which) {
    if (this.sheets.name) this.closeSheet();
    this.ui.fade(true);
    this.after(0.9, () => {
      const t = ((this.time % CYCLE) + CYCLE) % CYCLE;
      const target = which === 'day' ? 32 : 250;
      let add = target - t;
      if (add <= 0) add += CYCLE;
      this.time += add;
      if (which === 'day') for (const s of this.enemies.list) if (s.kind === 'night') s.die(false);
      const P = this.player;
      P.hp = P.maxHp; P.hunger = Math.max(P.hunger, 60);
      this.ui.fade(false);
      this.ui.toast(which === 'day' ? 'Morning' : 'Nightfall', which === 'day' ? 'You wake rested. The Hollowmen have crumbled back into the sand.' : 'The lamps are lit. The dead walk where the light does not reach.');
      this.autosave('rest', true);
    });
  }
  showEnding() { this.openSheet('ending'); }
  // from the title: back to your voyage (or a new one), then straight to the crew list
  sailWithFriends() {
    this.wantCrew = true;
    if (this.latest) this.continueLatest(); else this.openSheet('captain', { fresh: true });
  }

  // ---------------------------------------------------------------- ships and the sea
  spawnHollow(opts = {}) {
    const P = this.player;
    const ref = P.mode === 'helm' || (P.mode === 'deck' && (!P.ship || P.ship === this.sloop)) ? (this.sloop ? this.sloop.pos : P.pos) : P.pos;
    for (let i = 0; i < 160; i++) {
      const a = Math.random() * Math.PI * 2, d = 80 + Math.random() * 35;
      const x = ref.x + Math.cos(a) * d, z = ref.z + Math.sin(a) * d;
      if (x < 24 || z < 24 || x > W - 24 || z > D - 24) continue;
      if (this.world.surf[Math.floor(x) + Math.floor(z) * W] > SEA - 3) continue;
      const h = Math.atan2(-(ref.x - x), -(ref.z - z));
      const s = new Ship(this.scene, 'hollow', { variant: opts.variant });
      if (s.hullHits(this.world, x, z, h)) { s.dispose(); continue; }
      s.place(x, z, h);
      const L = Math.min(10, this.level);
      if (s.variant === 'flagship') { s.maxHp = s.hp = 260 + L * 20; s.dmgMul = 1.3; }
      else s.maxHp = s.hp = 110 + L * 22;
      s.huntId = opts.huntId || null;
      this.hollows.push(s);
      this.crews.man(s);
      return s;
    }
    return null;
  }
  removeHollow(s) {
    if (!s) return;
    s.dispose();
    this.hollows = this.hollows.filter((h) => h !== s);
    if (s.huntId && !s.sinking) {
      const q = this.quests.active.find((x) => x.id === s.huntId);
      if (q && q.state === 'active') { q.spawned = false; this.quests.huntTimers[q.id] = 0; }
    }
  }
  hollowFor(id) { return this.hollows.find((h) => h.huntId === id && !h.sinking) || null; }
  manageHollows(dt) {
    const P = this.player;
    for (const h of [...this.hollows]) {
      if (h.sinking) continue;
      let d = 1e9;
      for (const t of this.targets()) d = Math.min(d, Math.hypot(h.pos.x - t.x, h.pos.z - t.z));
      if (h.kind === 'hollow' && d > 230 && !h.huntId && h.variant !== 'flagship') this.removeHollow(h);
    }
    const Q = this.quests;
    if (Q.id === 'vault' && Q.phase === 1 && !this.hollows.some((h) => h.variant === 'flagship' && !h.sinking)) {
      this.flagT += dt;
      if (this.flagT > 12 && (P.mode === 'deck' || P.mode === 'helm')) {
        this.flagT = 0;
        if (this.spawnHollow({ variant: 'flagship' })) this.ui.toast('The flagship rises', 'The Hollow Wake’s flagship comes for its heart.', 'curse');
      }
    } else this.flagT = 0;
  }
  startKraken() {
    if (this.kraken || !this.sloop) return;
    this.kraken = new Kraken(this, this.level);
    this.weather.force(150);
    this.shake(0.8);
    this.ui.toast('The Deep One', 'The sea boils around your hull. Sink its tentacles with cannon fire and your cutlass.', 'curse');
    for (const h of this.hollows) if (h.kind === 'hollow') h.leaving = true;
  }
  // aim assist for a broadside: the kraken first, then the nearest ghost ship off that side
  broadsideTarget(side) {
    const s = this.sloop;
    if (this.kraken && this.kraken.alive && !this.kraken.remote) { const t = this.kraken.aimTarget(s, side); if (t) return t; }
    const rx = Math.cos(s.heading) * side, rz = -Math.sin(s.heading) * side;
    let best = null;
    for (const h of this.hollows) {
      if (h.sinking) continue;
      const dx = h.pos.x - s.pos.x, dz = h.pos.z - s.pos.z, dist = Math.hypot(dx, dz) || 1;
      if (dist < 85 && (dx * rx + dz * rz) / dist > 0.75 && (!best || dist < best.dist)) best = { h, dist };
    }
    if (!best) return null;
    const h = best.h;
    return { x: h.pos.x, z: h.pos.z, vx: -Math.sin(h.heading) * h.speed, vz: -Math.cos(h.heading) * h.speed };
  }
  playerFire(side) {
    const s = this.sloop;
    if (!s || s.sinking) return;
    if (!(this.inv.ball > 0)) { this.ui.toast('Out of shot', 'Craft cannonballs from stone: 2 stone makes 3 shot. Old Mags sells them too.'); return; }
    if (this.net.inCrew) {
      const key = side < 0 ? 'port' : 'star';
      if (s.cool[key] > 0) return;
      s.cool[key] = 2.4;                      // the captain's game fires; your shot is spent when it does
      this.net.req('f', side, Math.min(s.guns || 2, this.inv.ball));
      return;
    }
    const n = fireBroadside(this, s, side, this.broadsideTarget(side), Math.min(s.guns, this.inv.ball));
    if (n) { this.inv.ball -= n; this.shake(0.15); }
  }
  repairShip() {
    const P = this.player, s = this.sloop;
    if (!s || s.sinking || (P.mode !== 'deck' && P.mode !== 'helm') || (P.mode === 'deck' && P.ship && P.ship !== s)) return;
    if (s.hp >= s.maxHp) { this.ui.pickup('The hull is sound'); return; }
    if (!(this.inv.plank > 0)) { this.ui.toast('No planks', 'Craft planks from wood to patch the hull.'); return; }
    if (this.repairCD > 0) return;
    this.inv.plank--; s.hp = Math.min(s.maxHp, s.hp + 14); this.repairCD = 0.45;
    if (this.net.inCrew) this.net.req('rp');
    this.sfx.place();
    this.particles.burst(s.pos.x, s.pos.y + 1.3, s.pos.z, 0xc0915c, 10, 1.5, 2, 12, 0.6, 1.5);
    this.ui.pickup('Hull patched, −1 plank');
  }
  // Ships against ships: separating axes on the waterline hull outlines allow alongside contact and bow-to-side
  // impacts without the oversized gaps and false positives from a chain of circles.
  shipCollisions() {
    const ships = [this.sloop, ...this.hollows].filter((s) => s && !s.sinking);
    const MASS = { sloop: 1, merchant: 1.35, navy: 1.6, pirate: 1.15, hollow: 1.2 };
    for (let i = 0; i < ships.length; i++) for (let j = i + 1; j < ships.length; j++) {
      const a = ships[i], b = ships[j];
      const reach = 6.8 * (a.size + b.size);
      if (Math.abs(b.pos.x - a.pos.x) > reach || Math.abs(b.pos.z - a.pos.z) > reach) continue;
      const best = a.hullContact(b);
      if (!best) continue;
      const ma = (MASS[a.kind] || 1.2) * (a.variant === 'flagship' ? 1.3 : 1), mb = (MASS[b.kind] || 1.2) * (b.variant === 'flagship' ? 1.3 : 1);
      const wa = mb / (ma + mb), wb = ma / (ma + mb), { nx: ux, nz: uz, depth: pen } = best;
      a.pos.x -= ux * pen * wa; a.pos.z -= uz * pen * wa; b.pos.x += ux * pen * wb; b.pos.z += uz * pen * wb;
      const fax = -Math.sin(a.heading), faz = -Math.cos(a.heading), fbx = -Math.sin(b.heading), fbz = -Math.cos(b.heading);
      const na = fax * ux + faz * uz, nb = fbx * ux + fbz * uz;            // how much of each ship's way points along the contact
      const closing = a.speed * na - b.speed * nb;                        // > 0 while they press together
      if (closing <= 0) continue;
      const J = closing * 1.25;                                            // take the closing speed off, with a little bounce
      a.speed -= J * wa * na; b.speed += J * wb * nb;
      // where they touch, off each ship's centreline, turns her: the bows swing apart
      for (const [s, sign, w] of [[a, 1, wa], [b, -1, wb]]) {
        const rx = best.x - s.pos.x, rz = best.z - s.pos.z;
        const torque = (rx * uz - rz * ux) * sign;
        s.heading = wrapAngle(s.heading + clamp(torque * closing * 0.0025 * w, -0.06, 0.06));
      }
      if (closing > 2.2 && a.bumpCD <= 0 && b.bumpCD <= 0) {
        a.bumpCD = 1; b.bumpCD = 1;
        const hard = closing - 1.6;
        if (a.kind !== b.kind || a === this.sloop || b === this.sloop) { a.damage(hard * 2.6 * Math.sqrt(mb / ma), this); b.damage(hard * 2.6 * Math.sqrt(ma / mb), this); }
        this.sfx.crash(this.distToListener(best.x, best.z));
        this.particles.burst(best.x, WATER_Y + 1.5, best.z, 0x6b4426, 12, 3, 3, 12, 0.8, 0.8);
        if (a === this.sloop || b === this.sloop) this.shake(Math.min(0.9, 0.25 + hard * 0.12));
      }
    }
  }
  cannonballStep(b, p) {
    if (b.vis) return this.shotFx(b, p);
    const own = b.owner === this.sloop;
    if (own && this.kraken && this.kraken.alive && this.kraken.projectileHit(p, b.dmg || 1)) {
      this.sfx.crash(this.distToListener(p.x, p.z));
      this.ui.pickup('Hit!');
      return true;
    }
    for (const s of [this.sloop, ...this.hollows]) {
      if (!s || s === b.owner || s.sinking) continue;
      if (b.owner && b.owner !== this.sloop && s !== this.sloop) continue;
      if (s.containsPoint(p.x, p.y, p.z)) {
        s.damage((6 + Math.random() * 4) * (b.dmg || 1), this);
        this.fleet.onHit(s, b.owner);
        if (s !== this.sloop) this.crews.onShipHit(s);
        this.physics.splinters(p.x, p.y, p.z, s.hullHex || 0x6b4426, 7, 4.5);
        this.particles.burst(p.x, p.y, p.z, 0x6b4426, 10, 3, 3, 14, 0.9, 0.6);
        this.particles.burst(p.x, p.y, p.z, 0x8d9296, 8, 1, 2, -2, 1.2, 0.6);
        this.sfx.crash(this.distToListener(p.x, p.z));
        if (s === this.sloop) this.shake(0.3); else this.ui.pickup('Hit!');
        return true;
      }
    }
    if (!own) {
      for (const t of this.targets()) {
        if (!t.alive) continue;
        const dx = p.x - t.x, dy = p.y - (t.y + 0.9), dz = p.z - t.z;
        if (dx * dx + dy * dy + dz * dz < 1.3) { this.hurtTarget(t, 24, { x: b.vx / 34, z: b.vz / 34 }); this.particles.burst(p.x, p.y, p.z, 0xb3402a, 8, 2, 2, 14, 0.5, 0.3); return true; }
      }
    }
    if (own && this.enemies.hitSphere(p, 0.9, 40)) return true;
    const bx = Math.floor(p.x), by = Math.floor(p.y), bz = Math.floor(p.z);
    if (by >= FLOOR && this.world.solid(bx, by, bz)) { this.explode(p.x, p.y, p.z, 1.35, own); return true; }
    if (p.y < WATER_Y + waveHeight(p.x, p.z, this.waveTime)) {
      this.particles.burst(p.x, WATER_Y + 0.2, p.z, 0xe6f4f7, 18, 1.2, 5, 14, 0.9, 0.5);
      this.sfx.splash(this.distToListener(p.x, p.z));
      return true;
    }
    return false;
  }
  // a crew member's copy of the captain's shot: the same flight, the splashes and smoke, but no harm done
  shotFx(b, p) {
    for (const s of [this.sloop, ...this.hollows]) {
      if (!s || s === b.owner || s.sinking) continue;
      if (b.owner && b.owner !== this.sloop && s !== this.sloop) continue;
      if (s.containsPoint(p.x, p.y, p.z)) {
        this.physics.splinters(p.x, p.y, p.z, s.hullHex || 0x6b4426, 7, 4.5);
        this.particles.burst(p.x, p.y, p.z, 0x6b4426, 10, 3, 3, 14, 0.9, 0.6);
        this.particles.burst(p.x, p.y, p.z, 0x8d9296, 8, 1, 2, -2, 1.2, 0.6);
        this.sfx.crash(this.distToListener(p.x, p.z));
        if (s === this.sloop) this.shake(0.3);
        return true;
      }
    }
    if (this.kraken && this.kraken.alive && b.owner === this.sloop) {
      for (const tn of this.kraken.tentacles) if (tn.hit(p, 0.7)) { this.particles.burst(p.x, p.y, p.z, 0x8a3a6a, 10, 2.2, 2, 12, 0.7, 0.8); return true; }
    }
    const bx = Math.floor(p.x), by = Math.floor(p.y), bz = Math.floor(p.z);
    if (by >= FLOOR && this.world.solid(bx, by, bz)) return true;     // the captain's game sends the blast
    if (p.y < WATER_Y + waveHeight(p.x, p.z, this.waveTime)) {
      this.particles.burst(p.x, WATER_Y + 0.2, p.z, 0xe6f4f7, 18, 1.2, 5, 14, 0.9, 0.5);
      this.sfx.splash(this.distToListener(p.x, p.z));
      return true;
    }
    return false;
  }
  // A blast at (x, y, z): fire and smoke, a crater, everything nearby thrown about and hurt, kegs set off,
  // and whatever the crater undermined comes down after it. own: the sloop's own shot (spares the crew).
  explode(x, y, z, r, own, o = {}) {
    const keg = !!o.keg, w = this.world, phys = this.physics, R = r * 2.1;
    if (this.net.isHost) this.net.fx('x', Math.round(x * 100) / 100, Math.round(y * 100) / 100, Math.round(z * 100) / 100, Math.round(r * 100) / 100, keg ? 1 : 0);
    phys.blastFx(x, y, z, r, keg);
    phys.igniteAround(x, y, z, keg ? R : r + 0.6);
    if (!w.isReserved(Math.floor(x), Math.floor(z), 1)) {
      const C = Math.ceil(r);
      for (let bx = Math.floor(x) - C; bx <= Math.floor(x) + C; bx++) for (let by = Math.floor(y) - C; by <= Math.floor(y) + C; by++) for (let bz = Math.floor(z) - C; bz <= Math.floor(z) + C; bz++) {
        const id = w.get(bx, by, bz);
        if (!id || by < FLOOR || id === B.CHEST || id === B.VAULT || id === B.KEG) continue;
        const dx = bx + 0.5 - x, dy = by + 0.5 - y, dz = bz + 0.5 - z;
        if (dx * dx + dy * dy + dz * dz > r * r) continue;
        if (this.isProtected(bx, by, bz)) continue;
        w.set(bx, by, bz, B.AIR);
        const l = Math.hypot(dx, dz) || 1;
        phys.queueCheck(bx, by, bz, dx / l, dz / l);
      }
    }
    // everyone in reach is thrown and hurt; the sloop's own shot spares the crew (a keg spares nobody)
    const dmg = keg ? 46 : 18;
    if (!own || keg) {
      for (const t of this.targets()) {
        if (!t.alive) continue;
        const dx = t.x - x, dy = t.y + 0.9 - y, dz = t.z - z, d = Math.hypot(dx, dy, dz);
        if (d >= R) continue;
        const l = Math.hypot(dx, dz) || 1;
        this.hurtTarget(t, dmg * (1 - d / R) + 3, { x: dx / l, z: dz / l });
      }
      phys.knock(x, y, z, R, keg ? 12.5 : 6);
    }
    for (const s of this.enemies.list) {
      if (s.state === 'dying') continue;
      const dx = s.pos.x - x, dy = s.pos.y + 0.9 - y, dz = s.pos.z - z, d = Math.hypot(dx, dy, dz);
      if (d >= R) continue;
      const l = Math.hypot(dx, dz) || 1;
      s.lastBy = o.by || null;
      s.hurt((keg ? 70 : 26) * (1 - d / R) + 4, { x: (dx / l) * 2, z: (dz / l) * 2 });
      if (s.state !== 'dying') { s.vy = (keg ? 9 : 5) * (1 - d / R) + 2; s.onGround = false; }
    }
    for (const a of this.fauna.list) {
      if (a.dead || !a.pos) continue;
      const d = Math.hypot(a.pos.x - x, a.pos.y - y, a.pos.z - z);
      if (d < R) this.fauna.hurt(a, (keg ? 50 : 14) * (1 - d / R) + 2, { x: (a.pos.x - x) / (d || 1), z: (a.pos.z - z) / (d || 1) });
    }
    if (keg) for (const s of [this.sloop, ...this.hollows]) {
      if (!s || s.sinking) continue;
      const d = Math.hypot(s.pos.x - x, s.pos.z - z);
      if (d < R + 3.5 && y < s.pos.y + 7) { s.damage(30 * Math.min(1, 1.2 - d / (R + 3.5)), this); if (s !== this.sloop) this.fleet.onHit(s, this.sloop); this.physics.splinters(x, Math.max(y, s.pos.y + 1), z, s.hullHex || 0x6b4426, 10, 6); }
    }
  }
  // set a keg's fuse burning (the captain's game keeps the fuse for everyone)
  lightKeg(x, y, z) {
    if (this.net.inCrew) { this.net.req('kg', x, y, z); this.particles.burst(x + 0.5, y + 1.05, z + 0.5, 0xffd060, 6, 1, 2, 8, 0.4, 0.1); this.sfx.fuse(); this.ui.pickup('The fuse is lit. Run!'); return; }
    this.physics.ignite(x, y, z, 2.6);
  }

  // ---------------------------------------------------------------- events from other systems
  // every ship you can climb aboard: your sloop and anything else afloat that's sized like her
  boardable() {
    const out = this._boardable || (this._boardable = []);
    out.length = 0;
    if (this.sloop && !this.sloop.sinking) out.push(this.sloop);
    for (const h of this.hollows) if (!h.sinking) out.push(h);   // every ship walks the same plan since 0.6
    return out;
  }
  // valuables: worth gold when sold to Old Mags, safe only once stowed in the sea chest
  lootValue(from) { let v = 0; for (const [k, n] of Object.entries(from || {})) if (ITEMS[k] && ITEMS[k].loot && n > 0) v += ITEMS[k].loot * n; return v; }
  rollValuables(kind) {
    const r = Math.random(), out = [];
    const T = { cache: [['goblet', 0.6], ['ruby', 0.25]], wreck: [['goblet', 0.7], ['pearls', 0.45]], fort: [['idol', 0.55], ['ruby', 0.6], ['goblet', 0.8]], cove: [['pearls', 0.75], ['goblet', 0.6], ['ruby', 0.3]],
      merchant: [['goblet', 0.8], ['pearls', 0.55]], navy: [['ruby', 0.5], ['goblet', 0.6]], pirate: [['idol', 0.35], ['ruby', 0.45], ['pearls', 0.5]], hollow: [['goblet', 0.5], ['idol', 0.2]] }[kind] || [];
    for (const [it, p] of T) if (Math.random() < p) out.push([it, it === 'goblet' && r < 0.4 ? 2 : 1]);
    return out;
  }
  // stow or take gold in the sea chest
  moveChestGold(toChest, n) {
    if (toChest) { const m = Math.min(n, this.gold); this.gold -= m; this.chestGold = (this.chestGold || 0) + m; }
    else { const m = Math.min(n, this.chestGold || 0); this.chestGold -= m; this.gold += m; }
    this.sfx.coin();
  }
  // the strongbox of a ship whose crew you beat
  openStrongbox(ship) {
    if (!ship || ship.looted) return;
    if (this.net.inCrew) { this.net.req('sb', ship.remote ? ship.remote.nid : ship.nid); ship.looted = true; return; }
    ship.looted = true;
    const r = this.strongboxLoot(ship);
    this.gold += r.gold;
    for (const [it, n] of r.items) this.give(it, n);
    this.sfx.coin();
    this.ui.toast(`The ${ship.name || 'ship'}’s strongbox`, `${r.gold} gold${r.items.length ? ', ' + r.items.map(([it, n]) => `${n} ${ITEMS[it].name.toLowerCase()}`).join(', ') : ''}. Bank it with Old Mags or stow it in your sea chest.`, 'good');
    this.physics.splinters(this.player.pos.x, this.player.pos.y + 0.6, this.player.pos.z, 0x6b4426, 6, 3);
  }
  strongboxLoot(ship) {
    const gold = Math.round((ship.boxGold || 60) * (1 + Math.min(10, this.level) * 0.08));
    const items = [['ball', 3 + ((Math.random() * 4) | 0)], ...this.rollValuables(ship.kind)];
    if (Math.random() < 0.6) items.push(['grog', 1 + ((Math.random() * 2) | 0)]);
    if (Math.random() < 0.5) items.push(['shot', 8]);
    return { gold, items };
  }
  onShipSunk(ship) {
    if (ship !== this.sloop && this.player.mode === 'deck' && this.player.ship === ship) this.player.leaveShip(ship);
    for (let k = 0; k < 4; k++) this.after(k * 0.5, () => this.physics.splinters(ship.pos.x + (Math.random() - 0.5) * 4, ship.pos.y + 1.5, ship.pos.z + (Math.random() - 0.5) * 8, ship.hullHex || 0x6b4426, 8, 5));
    if (ship === this.sloop) {
      const P = this.player;
      if (P.mode === 'deck' || P.mode === 'helm') P.leaveShip(ship);
      P.boardCD = 99;
      const full = Object.keys(this.chest).length || this.chestGold > 0;
      this.ui.toast(`Your ${ship.design.label.toLowerCase()} is going down`, full ? 'Swim clear. Your sea chest, and everything stowed in it, goes down with her.' : 'Swim clear. The tide will carry you back to Brine Haven.', 'bad');
      this.chest = {}; this.chestGold = 0;
      this.net.toastAll('The ship is going down', 'Swim clear! The captain will find a new boat at Brine Haven.', 'bad');
      this.after(4.5, () => this.washAshore());
      return;
    }
    this.stats.ships++;
    if (ship.kind !== 'hollow') {
      const L = Math.min(10, this.level), k = ship.kind;
      const loot = k === 'merchant' ? 80 + L * 20 : k === 'navy' ? 140 + L * 25 : 100 + L * 25;
      this.props.spawnLoot(ship.pos.x, ship.pos.z, loot, 0, 0xffd27a);
      const text = k === 'merchant' ? 'Her strongbox floats free. Sail through it to haul it aboard.' : k === 'navy' ? 'Her pay chest floats free. The Crown won’t forget this.' : 'Their plunder floats free. Sail through it to take it.';
      this.ui.toast(`${ship.name} goes down`, text, k === 'pirate' ? 'good' : 'bad');
      this.net.toastAll(`${ship.name} goes down`, text, k === 'pirate' ? 'good' : 'bad');
      if (k === 'merchant') this.fleet.raise(1, 'You sank a merchantman');
      if (k === 'navy') this.fleet.raise(2, 'You sank a navy ship');
      this.sfx.crash(this.distToListener(ship.pos.x, ship.pos.z));
      this.after(10, () => { if (this.hollows.includes(ship)) this.removeHollow(ship); });
      return;
    }
    this.quests.onShipSunk(ship);
    const L = Math.min(10, this.level);
    const loot = ship.variant === 'flagship' ? 320 + L * 30 : 70 + L * 30;
    this.props.spawnLoot(ship.pos.x, ship.pos.z, loot);
    this.ui.toast(ship.variant === 'flagship' ? 'The flagship sinks' : 'The Hollow Wake sinks', 'Its cursed chest floats free. Sail through it to salvage the gold.', 'good');
    this.net.toastAll(ship.variant === 'flagship' ? 'The flagship sinks' : 'The Hollow Wake sinks', 'Its cursed chest floats free. Whoever reaches it splits the gold with everyone aboard.', 'good');
    this.sfx.curse();
    this.after(10, () => { if (this.hollows.includes(ship)) this.removeHollow(ship); });
  }
  washAshore() {
    const vesselName = this.sloop ? this.sloop.design.label.toLowerCase() : 'boat';
    this.ui.fade(true);
    this.after(1.2, () => {
      const lost = this.gold + this.dropLoot();
      this.gold = 0;
      this.spawnSloop(null);
      this.placeAtSpawn();
      const P = this.player;
      P.alive = true; P.hp = Math.max(P.hp, P.maxHp * 0.6); P.boardCD = 0;
      for (const h of this.hollows) if (h.kind === 'hollow') h.leaving = true;
      this.ui.fade(false);
      this.ui.toast('Washed ashore at Brine Haven', lost > 0 ? `The sea kept your ${lost} unbanked gold. Old Mags found you a new ${vesselName}.` : `Old Mags found you a new ${vesselName} at the pier.`, 'bad');
    });
  }
  onShipBump(ship) { if (ship === this.sloop) { this.sfx.crash(0); this.ui.pickup('Ran aground'); this.shake(0.35); } }
  onNest() {
    this.sfx.thud();
    if (!this.hints.nest) { this.hints.nest = 1; this.ui.toast('The crow’s nest', 'You can see for miles from up here. F to climb back down.'); }
  }
  onBoard(climbing) {
    this.sfx.thud();
    if (climbing) this.particles.burst(this.player.pos.x, WATER_Y + 0.2, this.player.pos.z, 0xe6f4f7, 8, 1, 2.5, 12, 0.6, 0.4);
    const sh = this.player.ship;
    if (sh && sh !== this.sloop) {
      if (!this.hints.boardOther) { this.hints.boardOther = 1; this.ui.toast(`Aboard the ${sh.name || 'ship'}`, sh.taken ? 'Her strongbox is in the hold.' : 'Beat her crew and her strongbox in the hold is yours. Cut down the helmsman and she loses way.'); }
      return;
    }
    this.stats.boarded++;
    if (!this.hints.board) { this.hints.board = 1; this.ui.toast('Aboard', this.isTouch ? 'Walk to the wheel at the stern and tap Take helm.' : 'Walk to the wheel at the stern and press F to take the helm.'); }
  }
  onLeaveShip() { /* the touch layout follows the player's mode */ }
  onLootCollected(g) {
    if (this.net.busy) { this.net.shareSalvage(g, null); return; }
    this.gold += g; this.sfx.coin(); this.ui.toast('Salvage', `+${g} gold from a Hollow chest. Bank it with Old Mags.`, 'good');
  }
  onSkeletonKilled(sk) {
    const g = sk.captain ? 40 : sk.kind === 'night' ? 3 : 5;
    const bones = Math.random() < (sk.captain ? 1 : 0.6) ? (sk.captain ? 3 : 1) : 0, nut = Math.random() < 0.25;
    if (sk.lastBy && this.net.isHost && this.net.crew.has(sk.lastBy)) {
      const items = [];
      if (bones) items.push(['bone', bones]);
      if (nut) items.push(['coconut', 1]);
      this.net.give(sk.lastBy, g, items);
    } else {
      this.stats.kills++;
      this.gold += g;
      this.ui.pickup(`+${g} gold`);
      if (bones) this.give('bone', bones);
      if (nut) this.give('coconut', 1);
    }
    this.quests.onSkeletonKilled(sk);
  }
  onCampAwake(camp) {
    if (camp.warned) return;
    camp.warned = true;
    this.ui.toast('A Hollowmen camp', 'Bones rise around a cursed fire. Put down the captain in the red sash and the rest crumble.', 'curse');
    this.sfx.curse();
  }
  onPlayerHurt(n) { this.ui.flashDamage(); this.sfx.hurt(); this.shake(Math.min(0.5, n / 40)); }
  // carried valuables are lost when you die or wash ashore; returns what they were worth
  dropLoot() {
    const v = this.lootValue(this.inv);
    for (const k of Object.keys(this.inv)) if (ITEMS[k] && ITEMS[k].loot) this.inv[k] = 0;
    return v;
  }
  onPlayerDeath() {
    const P = this.player;
    if (P.mode === 'helm') { if (this.net.inCrew) this.net.leaveHelm(); else if (this.sloop) this.sloop.sailLvl = 0; }
    const lost = this.gold, lostLoot = this.dropLoot();
    this.gold = 0;
    if (!this.net.inCrew) this.quests.onPlayerDeath();
    this.ui.fade(true);
    this.ui.toast('You died', lost > 0 || lostLoot > 0 ? `${lost} unbanked gold${lostLoot ? ` and ${lostLoot} gold of loot` : ''} sank with you. Stow it in your sea chest next time.` : 'The Brine spits you back out.', 'bad');
    this.after(2.6, () => this.respawn());
  }
  respawn() {
    this.cancelStuck();
    const P = this.player, s = this.sloop;
    P.alive = true; P.hp = P.maxHp; P.hunger = Math.max(P.hunger, 60); P.vel.set(0, 0, 0); P.pitch = 0;
    if (s && !s.sinking) this.boardSloop(0, 1.6);
    else this.placeAtSpawn();
    this.ui.fade(false);
  }
  onKrakenDefeated() {
    this.weather.forced = 0;
    this.quests.onKrakenDefeated();
    this.net.toastAll('The Deep One is slain', 'It sinks into the black water. A fine day for the crew.', 'good');
  }
  onKrakenFled() {
    this.weather.forced = 0;
    this.quests.onKrakenFled();
  }
  onStormStart() {
    if (this.state === 'play') this.ui.toast('A squall rolls in', 'Rough seas and a fast wind. Patch your hull with planks and ride it out.', '');
  }
}
