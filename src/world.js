import * as THREE from 'three';
import { W, D, H, SEA, FLOOR, CS, NCX, OW, WS, LEGACY_W, LEGACY_D, PREVIOUS_MAP_W, B, BLOCKS, T, FACES, FACE_UV, AO_OFF } from './config.js';
// 0.6 scaled the islands up WS times: peaks rise PS times; the coastline and hill
// noise runs at NF of its old frequency so a big island gets bigger features and still plenty of them, the
// the underwater shelf eases down to the shared bedrock floor, and rolling hills break up the inland.
const PS = 1.3, NF = 0.5;
const SHELF_OUTER = -2.5;
const shelfHeight = (t) => FLOOR + (SEA - FLOOR) * smooth(SHELF_OUTER, 0.22, t);
import { mulberry32, makeNoise2, fbm, hash3 } from './noise.js';
import { surfaceNets, triangulate, columnIndex, columnDown, columnRay, RELAX } from './surface.js';
import { PIECE_LO, PIECE_HI, isCode, pieceBoxes, pieceBlocks, partBoxes, emitPiece } from './pieces.js';
import { appendRoundedBox, GeoBuilder } from './geo.js';

const AO_CURVE = [0.5, 0.66, 0.83, 1.0];
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const ISLAND_NAMES = ['Gullwreck Key', 'Saltbone Isle', 'Kettle Rock', 'Driftglass Atoll', 'Widow’s Shoal', 'Lantern Cay', 'Marrow Cay', 'Thimble Isle'];
const ISLAND_TYPES = ['palm', 'forest', 'rock', 'palm', 'forest', 'palm', 'skull', 'rock'];
const OPAQUE = new Uint8Array(256);
for (let i = 0; i < 256; i++) OPAQUE[i] = BLOCKS[i] && BLOCKS[i].solid ? 1 : 0;

// How each block is drawn and how bodies meet it:
//   TERRAIN  smooth ground (one rounded surface across all of them); bodies walk on that surface
//   LEAFY    smooth leafy canopies; bodies pass through
//   WOODY    round trunks and logs; bodies bump into them as blocks
//   CRISP    crafted things with block collision; props and building materials get shaped visuals
const wrapA = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
export const TERRAIN = new Uint8Array(256), LEAFY = new Uint8Array(256), WOODY = new Uint8Array(256), CRISP = new Uint8Array(256), HARD = new Uint8Array(256), PIECE = new Uint8Array(256);
for (let i = PIECE_LO; i <= PIECE_HI; i++) PIECE[i] = 1;
for (const id of [B.GRASS, B.DIRT, B.SAND, B.STONE, B.MARK, B.SLATE, B.BONE, B.BASALT, B.ASH, B.OBSIDIAN, B.MAGMA, B.CORAL_A, B.CORAL_B, B.BEDROCK]) TERRAIN[id] = 1;
for (const id of [B.LEAVES, B.JLEAVES]) LEAFY[id] = 1;
const CANOPY = new Uint8Array(256);
for (const id of [B.LEAVES, B.JLEAVES, B.FROND, B.COCONUT, B.VINE]) CANOPY[id] = 1;
for (const id of [B.LOG, B.PALM, B.JLOG]) WOODY[id] = 1;
for (const id of [B.PLANK, B.CHEST, B.BRICK, B.CLOTH, B.VAULT, B.LAMP, B.MOSSBRICK, B.WHITEBRICK, B.WRECKWOOD, B.BARREL, B.CRATE, B.KEG]) CRISP[id] = 1;
for (let i = 0; i < 256; i++) HARD[i] = CRISP[i] || WOODY[i] || PIECE[i];
const _c = new THREE.Color();
function toGeometry(Q) {
  if (!Q.n) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(Q.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(Q.nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(Q.col, 3));
  if (Q.lay) { g.setAttribute('tuv', new THREE.Float32BufferAttribute(Q.uv, 2)); g.setAttribute('layer', new THREE.Float32BufferAttribute(Q.lay, 1)); }
  else g.setAttribute('uv', new THREE.Float32BufferAttribute(Q.uv, 2));
  if (Q.sway) g.setAttribute('sway', new THREE.Float32BufferAttribute(Q.sway, 1));
  g.setIndex(Q.ind);
  return g;
}
rawRoof(x, y, z, id) {
  if (!this.inside(x, y, z)) return;
  this.raw(x, y, z, id);
  if (id !== B.AIR) this.hiddenRoofCells.add(x + W * (z + D * y));
}
const lin = (hex) => { _c.setHex(hex); return [_c.r, _c.g, _c.b]; };
// ground colours (top, side), detail mix (sand, grass, rock, dirt) and glow
const TM = [];
const tm = (id, top, side, det, glow = 0) => { TM[id] = { top: lin(top), side: lin(side), det, glow }; };
tm(B.GRASS, 0x63a646, 0x8a6a45, [0, 1, 0, 0]);
tm(B.DIRT, 0x8a6a42, 0x7a5c3a, [0, 0, 0, 1]);
tm(B.SAND, 0xe8d49c, 0xdcc48e, [1, 0, 0, 0]);
tm(B.MARK, 0xe8d49c, 0xdcc48e, [1, 0, 0, 0]);
tm(B.STONE, 0x8f9396, 0x7d8185, [0, 0, 1, 0]);
tm(B.SLATE, 0x5f656d, 0x4f555c, [0, 0, 1, 0]);
tm(B.BONE, 0xeee4ca, 0xd8ccb0, [0.5, 0, 0.5, 0]);
tm(B.BASALT, 0x4b4e54, 0x3c3f44, [0, 0, 1, 0]);
tm(B.ASH, 0x8c8984, 0x78756f, [0.5, 0, 0, 0.5]);
tm(B.OBSIDIAN, 0x2e2737, 0x231d2b, [0, 0, 1, 0]);
tm(B.MAGMA, 0xff8a33, 0xe8641f, [0, 0, 1, 0], 1);
tm(B.CORAL_A, 0xe8846a, 0xcc6c55, [1, 0, 0, 0]);
tm(B.CORAL_B, 0x8c74c8, 0x7059aa, [1, 0, 0, 0]);
tm(B.BEDROCK, 0x25272b, 0x191b1e, [0, 0, 1, 0]);
tm(B.LEAVES, 0x58a347, 0x2f6c2e, [0, 1, 0, 0]);
tm(B.JLEAVES, 0x43923e, 0x22592a, [0, 1, 0, 0]);
// trunk radius at the base, how fast it narrows per block, bark tile
const BARK = { [B.LOG]: [0.34, 0.035, 0.2, T.log_side], [B.PALM]: [0.27, 0.012, 0.19, T.palm_side], [B.JLOG]: [0.5, 0.02, 0.32, T.jlog_side] };

export class World {
  constructor(seed) {
    this.seed = seed;
    this.data = new Uint8Array(W * D * H);
    this.treeFoliage = null;
    this.surf = new Int16Array(W * D);
    this.islandOf = new Int8Array(W * D);
    this.edits = new Map();
    this.islands = [];
    this.reserved = [];
    this.sites = {};
    this.group = new THREE.Group();
    this.meshes = new Map();
    this.structureDetails = [];
    this.hiddenRoofCells = new Set();
    this.dirty = new Set();
    this.depthDirty = new Set();
    this.lamps = new Set();
    this.mats = null;
    this.shadows = false;
    this.built = new Uint8Array(NCX * NCX);
    this.phys = new Array(NCX * NCX).fill(null);
    this.bw = W; this.bd = D;
    this.meshQueue = []; this.meshQT = 0; this.meshQX = -999; this.meshQZ = -999;
  }
  setMaterials(m) { this.mats = m; }

  inside(x, y, z) { return x >= 0 && z >= 0 && y >= 0 && x < W && z < D && y < H; }
  get(x, y, z) {
    if (x < 0 || z < 0 || x >= W || z >= D || y >= H) return 0;
    if (y < FLOOR) return B.BEDROCK;
    return this.data[x + W * (z + D * y)];
  }
  solid(x, y, z) { return OPAQUE[this.get(x, y, z)] === 1; }
  raw(x, y, z, id) {
    if (!this.inside(x, y, z)) return;
    const i = x + W * (z + D * y), old = this.data[i];
    this.data[i] = id;
    if (this.treeFoliage && (CANOPY[id] || CANOPY[old])) {
      if (CANOPY[id]) this.treeFoliage.add(i);
      else this.treeFoliage.delete(i);
    }
  }
  rawIfAir(x, y, z, id) {
    if (!this.inside(x, y, z)) return;
    const i = x + W * (z + D * y);
    if (this.data[i] === 0) {
      this.data[i] = id;
      if (this.treeFoliage && CANOPY[id]) this.treeFoliage.add(i);
    }
  }
  set(x, y, z, id, record = true) {
    if (!this.inside(x, y, z) || y < FLOOR) return false;
    const i = x + W * (z + D * y);
    const old = this.data[i];
    if (old === id) return false;
    this.hiddenRoofCells.delete(i);
    this.data[i] = id;
    if (this.treeFoliage && (CANOPY[id] || CANOPY[old])) {
      if (CANOPY[id]) this.treeFoliage.add(i);
      else this.treeFoliage.delete(i);
    }
    if (record) { this.edits.set(i, id); if (this.onEdit) this.onEdit(i, id); }
    if (old === B.LAMP) this.lamps.delete(i);
    if (id === B.LAMP) this.lamps.add(i);
    this.markDirty(x, z);
    if (y >= SEA - 9 && y <= SEA + 1) this.depthDirty.add(x + z * W);
    if (id === B.AIR && y + 1 < H) {
      const up = this.data[i + W * D];
      if (up && BLOCKS[up].plant) this.set(x, y + 1, z, B.AIR, record);
    }
    return true;
  }
  // an edit reshapes the smooth surface up to RELAX + 2 blocks away, so nearby chunks redraw too
  markDirty(x, z) {
    const r = RELAX + 2;
    const ax = Math.max(0, (x - r) >> 4), bx = Math.min(NCX - 1, (x + r) >> 4), az = Math.max(0, (z - r) >> 4), bz = Math.min(NCX - 1, (z + r) >> 4);
    for (let a = ax; a <= bx; a++) for (let b = az; b <= bz; b++) { const k = a + b * NCX; this.dirty.add(k); this.phys[k] = null; }
  }
  topSolid(x, z) {
    if (x < 0 || z < 0 || x >= W || z >= D) return FLOOR - 1;
    for (let y = H - 1; y >= FLOOR; y--) if (OPAQUE[this.data[x + W * (z + D * y)]]) return y;
    return FLOOR - 1;
  }
  anchorTreeRoots() {
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
      const y = this.surf[x + z * W], id = this.get(x, y, z);
      if (!WOODY[id] || this.solid(x, y - 1, z)) continue;
      let ground = y - 2, groundId = B.AIR;
      for (; ground >= FLOOR; ground--) {
        groundId = this.get(x, ground, z);
        if (this.solid(x, ground, z) && !WOODY[groundId] && !LEAFY[groundId] && groundId !== B.FROND && groundId !== B.VINE && groundId !== B.BAMBOO) break;
      }
      if (ground < FLOOR) continue;
      const support = ground < SEA ? B.LOG : B.DIRT;
      for (let py = ground + 1; py < y; py++) if (this.get(x, py, z) === B.AIR) this.raw(x, py, z, support);
    }
  }
  pruneDetachedFoliage() {
    const foliage = this.treeFoliage;
    if (!foliage) return;
    const plane = W * D, queue = [];
    while (foliage.size) {
      const seed = foliage.values().next().value;
      foliage.delete(seed);
      queue.push(seed);
      let anchored = false;
      for (let head = 0; head < queue.length; head++) {
        const i = queue[head], y = Math.floor(i / plane), rem = i - y * plane;
        const z = Math.floor(rem / W), x = rem - z * W;
        for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy, zz = z + dz;
          if (!this.inside(xx, yy, zz)) continue;
          const n = xx + W * (zz + D * yy), id = this.data[n];
          if (WOODY[id]) anchored = true;
          if (foliage.delete(n)) queue.push(n);
        }
      }
      if (!anchored) for (const i of queue) {
        const y = Math.floor(i / plane), rem = i - y * plane;
        const z = Math.floor(rem / W);
        this.raw(rem - z * W, y, z, B.AIR);
      }
      queue.length = 0;
    }
  }
  supportGround(x, z, baseY, landId = B.STONE, waterId = B.LOG, record = false) {
    const ground = this.topSolid(x, z), id = ground < SEA ? waterId : landId;
    for (let y = ground + 1; y < baseY; y++) {
      if (this.get(x, y, z) !== B.AIR) continue;
      if (record) this.set(x, y, z, id);
      else this.raw(x, y, z, id);
    }
  }
  groundBelow(x, fromY, z) {
    for (let y = Math.min(H - 1, fromY); y >= FLOOR; y--) if (this.solid(x, y, z)) return y;
    return FLOOR - 1;
  }
  standY(x, z) {
    for (let y = H - 2; y > FLOOR; y--) {
      const below = this.get(x, y - 1, z);
      if (OPAQUE[below] && below !== B.LEAVES && below !== B.JLEAVES && below !== B.FROND && below !== B.COCONUT && !this.solid(x, y, z) && !this.solid(x, y + 1, z)) return y;
    }
    return SEA + 1;
  }
  // land stands above the waterline here, so a pit or tunnel dug below sea level stays dry
  dryColumn(x, z) {
    if (x < 0 || z < 0 || x >= W || z >= D) return false;
    if (this.landMask && this.landMask[x + z * W]) return true;
    for (let y = H - 1; y >= SEA; y--) if (TERRAIN[this.data[x + W * (z + D * y)]]) return true;
    return false;
  }
  depthAt(x, z) {
    const top = this.topSolid(x, z) + 1;
    return Math.max(0, Math.min(1, (SEA - top) / 7));
  }
  isReserved(x, z, pad = 0) { return this.reserved.some((r) => x >= r.x0 - pad && x <= r.x1 + pad && z >= r.z0 - pad && z <= r.z1 + pad); }
  islandAt(x, z) { const i = this.islandOf[Math.floor(x) + Math.floor(z) * W]; return i; }

  // ---------------------------------------------------------------- generation
  generate() {
    this.data.fill(0); this.surf.fill(FLOOR); this.islandOf.fill(-1);
    this.edits.clear(); this.reserved = []; this.dirty.clear(); this.depthDirty.clear(); this.lamps.clear();
    this.sites = { wrecks: [], loot: [], villages: [], structures: [] };
    this.structureDetails = [];
    this.hiddenRoofCells.clear();
    this.bw = OW; this.bd = OW;
    const rnd = mulberry32(this.seed);
    const nWarp = makeNoise2(this.seed + 11), nH = makeNoise2(this.seed + 23), nD = makeNoise2(this.seed + 37);
    this.nWarp = nWarp; this.nH = nH; this.nD = nD;
    const hills = (x, z, t) => this.hills(x, z, t);
    const isl = [{ name: 'Brine Haven', x: 114 * WS, z: 128 * WS, r: 38 * WS, placementR: 30 * WS, peak: 8 * PS, type: 'outpost' }];
    for (let tries = 0; isl.length < 9 && tries < 8000; tries++) {
      const type = ISLAND_TYPES[isl.length - 1];
      const r = WS * (type === 'rock' ? 15 + rnd() * 7 : type === 'palm' ? 17 + rnd() * 8 : 21 + rnd() * 9);
      const x = 26 * WS + rnd() * (OW - 52 * WS), z = 26 * WS + rnd() * (OW - 52 * WS);
      if (isl.some((o) => Math.hypot(o.x - x, o.z - z) < (o.placementR ?? o.r) + r + 10 * WS)) continue;
      const peak = PS * (type === 'palm' ? 3 + rnd() * 2.5 : type === 'forest' ? 8 + rnd() * 5 : type === 'rock' ? 13 + rnd() * 6 : 8 + rnd() * 3);
      isl.push({ name: ISLAND_NAMES[isl.length - 1], x, z, r, peak, type });
    }
    this.islands = isl;
    this.legacyCount = isl.length;
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
      let best = -1e9, bi = -1;
      for (let i = 0; i < isl.length; i++) {
        const o = isl[i];
        const dx = x + 0.5 - o.x, dz = z + 0.5 - o.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > o.r * 5) continue;
        const warp = 0.74 + 0.5 * fbm(nWarp, x * 0.04 * NF + i * 17.3, z * 0.04 * NF - i * 9.1, 3);
        const t = 1 - dist / (o.r * warp);
        if (t < SHELF_OUTER) continue;
        const hn = fbm(nH, x * 0.07 * NF + i * 5.7, z * 0.07 * NF + i * 2.9, 4);
        let h = shelfHeight(t) + hills(x, z, t);
        const inland = smooth(0.18, 1.0, t);
        let shape = inland * (0.5 + 0.7 * hn);
        if (o.type === 'rock') shape = Math.pow(inland, 0.6) * (0.45 + 0.85 * hn);
        if (o.type === 'outpost') shape = inland * (0.55 + 0.45 * hn);
        h += o.peak * shape;
        if (h > best) { best = h; bi = i; }
      }
      if (bi < 0) continue;
      const s = Math.min(H - 8, Math.floor(best));
      this.surf[x + z * W] = s;
      this.islandOf[x + z * W] = bi;
      if (s <= FLOOR) continue;
      const type = isl[bi].type;
      const dn = nD(x * 0.15, z * 0.15);
      let top;
      if (s <= SEA + 1) top = (type === 'skull' && dn > 0.62) ? B.SLATE : B.SAND;
      else if (type === 'palm') top = s <= SEA + 3 ? B.SAND : B.GRASS;
      else if (type === 'rock') top = (s > SEA + 7 || dn < 0.42) ? B.STONE : B.GRASS;
      else if (type === 'skull') top = s <= SEA + 2 ? B.SAND : B.SLATE;
      else top = s <= SEA + 2 ? B.SAND : B.GRASS;
      for (let y = FLOOR; y < s; y++) {
        const depth = s - 1 - y;
        let id;
        if (depth === 0) id = top;
        else if (depth <= 3) id = top === B.GRASS ? B.DIRT : top;
        else id = type === 'skull' ? B.SLATE : B.STONE;
        this.data[x + W * (z + D * y)] = id;
      }
    }
    const idx = (name) => isl.findIndex((o) => o.name === name);
    this.buildOutpost();
    this.buildVillage(isl[0], 'major');
    const lc = idx('Lantern Cay'); if (lc >= 0) this.buildLighthouse(lc);
    const sb = idx('Saltbone Isle'); if (sb >= 0) this.sites.camp = this.buildCamp(sb, rnd, false);
    this.treeFoliage = new Set();
    this.decorate(rnd);
    const mc = isl.findIndex((o) => o.type === 'skull');
    if (mc >= 0) this.ribs(isl[mc]);
    this.plants(rnd);
    this.firstMap = this.placeTreasure(rnd, this.pickTreasureIsland(rnd, 0, true), false);
    this.bw = W; this.bd = D;
    this.expand();
    this.moreIslands();
    this.frontierIslands();
    this.extendedIslands();
    this.anchorTreeRoots();
    this.pruneDetachedFoliage();
    this.treeFoliage = null;
    this.dirty.clear(); this.depthDirty.clear();
    // where land stood above the waterline when the world was made: digging there never lets the sea in
    this.landMask = new Uint8Array(W * D);
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) this.landMask[x + z * W] = this.dryColumn(x, z) ? 1 : 0;
    this.scanLamps();
  }
  scanLamps() {
    this.lamps.clear();
    for (let i = 0; i < this.data.length; i++) if (this.data[i] === B.LAMP) this.lamps.add(i);
  }

  // level a roughly circular patch of island to height g, leaving the coastline alone
  flatten(cx, cz, rad, g, topId) {
    const grade = Math.max(3, Math.min(7, Math.round(rad * 0.18)));
    for (let x = cx - rad; x <= cx + rad; x++) for (let z = cz - rad; z <= cz + rad; z++) {
      const i = x + z * W, distance = Math.hypot(x - cx, z - cz);
      if (!this.inside(x, 0, z) || distance > rad + 0.5) continue;
      const original = this.surf[i];
      if (original < SEA - 1) continue;
      const edge = smooth(rad - grade, rad, distance);
      const level = Math.round(g + (original - g) * edge);
      for (let y = FLOOR; y < level; y++) if (!OPAQUE[this.data[x + W * (z + D * y)]]) this.raw(x, y, z, y < level - 1 ? B.DIRT : topId);
      this.raw(x, level - 1, z, topId);
      for (let y = level; y < H; y++) this.raw(x, y, z, B.AIR);
      this.surf[i] = level;
    }
  }

  buildOutpost() {
    const o = this.islands[0];
    const zc = Math.round(o.z);
    let sx = Math.round(o.x);
    while (sx < W - 30 && this.surf[sx + zc * W] > SEA) sx++;
    const px0 = sx - 4, px1 = sx + 22;
    for (let x = sx; x <= sx + 42; x++) for (let z = zc + 2; z <= zc + 15; z++) {
      for (let y = SEA - 4; y < H; y++) this.raw(x, y, z, B.AIR);
      if (this.surf[x + z * W] > SEA - 4) this.surf[x + z * W] = SEA - 4;
    }
    for (let x = px0; x <= px1; x++) for (let z = zc - 1; z <= zc + 1; z++) {
      for (let y = SEA + 1; y < H; y++) this.raw(x, y, z, B.AIR);
      if (x >= sx - 1 && z !== zc && (x - sx) % 4 === 1) for (let y = FLOOR; y < SEA; y++) this.raw(x, y, z, B.LOG);
      this.raw(x, SEA, z, B.PLANK);
    }
    this.raw(px1, SEA + 1, zc - 1, B.LOG); this.raw(px1, SEA + 1, zc + 1, B.LOG);
    this.raw(px1, SEA + 2, zc - 1, B.LAMP);
    const stx = sx - 10, stz = zc - 6;
    const g = Math.min(SEA + 4, Math.max(SEA + 2, this.surf[stx + stz * W]));
    for (let x = stx - 4; x <= stx + 4; x++) for (let z = stz - 4; z <= stz + 4; z++) {
      const topId = this.get(x, this.surf[x + z * W] - 1, z) === B.GRASS ? B.GRASS : B.SAND;
      for (let y = FLOOR; y < g; y++) if (!this.data[x + W * (z + D * y)]) this.raw(x, y, z, topId === B.GRASS ? B.DIRT : B.SAND);
      this.raw(x, g - 1, z, topId);
      for (let y = g; y < H; y++) this.raw(x, y, z, B.AIR);
    }
    for (let x = stx - 2; x <= stx + 2; x++) for (let z = stz - 2; z <= stz + 2; z++) this.raw(x, g - 1, z, B.PLANK);
    for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) for (let y = g; y < g + 3; y++) this.raw(stx + dx, y, stz + dz, B.LOG);
    for (let x = stx - 3; x <= stx + 3; x++) for (let z = stz - 3; z <= stz + 3; z++) this.raw(x, g + 3, z, B.PLANK);
    for (let x = stx - 2; x <= stx + 2; x++) for (let z = stz - 1; z <= stz + 1; z++) this.raw(x, g + 4, z, B.CLOTH);
    for (let x = stx - 1; x <= stx + 1; x++) this.raw(x, g, stz + 2, B.PLANK);
    for (let x = stx - 1; x <= stx + 1; x++) for (let y = g; y < g + 2; y++) this.raw(x, y, stz - 2, B.PLANK);
    this.raw(stx + 3, g, stz + 1, B.LOG); this.raw(stx + 3, g, stz, B.PLANK); this.raw(stx + 3, g + 1, stz + 1, B.PLANK);
    this.raw(stx - 3, g, stz + 2, B.CHEST);
    this.raw(stx + 2, g + 2, stz + 3, B.LAMP);
    this.sites.mags = { x: stx + 0.5, y: g, z: stz + 0.6 };
    this.sites.stall = { x: stx, y: g, z: stz };
    this.mags = this.sites.mags; this.stall = this.sites.stall;
    this.spawn = { x: stx - 3.5, z: zc + 2.5, yaw: -Math.PI / 3 };
    this.dock = { x: sx + 17, z: zc + 7, heading: -Math.PI / 2 };   // a 2x sloop alongside the pier, clear of it
    this.sites.dock = this.dock;
    this.reserved.push({ x0: stx - 7, x1: sx + 42, z0: stz - 5, z1: zc + 15 });
  }

  buildVillage(o, tier) {
    const island = this.islands.indexOf(o), major = tier === 'major', village = tier === 'village';
    if (island < 0) return null;
    const radius = Math.min(major ? 42 : village ? 27 : 19, Math.floor(o.r * 0.55));
    const angle = o.name === 'Brine Haven' ? Math.PI : hash3(island, Math.round(o.x), Math.round(o.z)) * Math.PI * 2;
    let cx = Math.floor(o.x + Math.cos(angle) * o.r * 0.18), cz = Math.floor(o.z + Math.sin(angle) * o.r * 0.18);
    if (this.islandOf[cx + cz * W] !== island || this.surf[cx + cz * W] <= SEA + 1) {
      let nearest = null, nearestD = Infinity;
      for (let x = Math.floor(o.x - o.r * 0.4); x <= o.x + o.r * 0.4; x++) for (let z = Math.floor(o.z - o.r * 0.4); z <= o.z + o.r * 0.4; z++) {
        const d = Math.hypot(x - cx, z - cz), i = x + z * W;
        if (d < nearestD && this.islandOf[i] === island && this.surf[i] > SEA + 1) { nearest = [x, z]; nearestD = d; }
      }
      if (!nearest) return null;
      [cx, cz] = nearest;
    }
    const center = cx + cz * W, g = Math.max(SEA + 2, this.surf[center]);
    this.flatten(cx, cz, radius, g, B.GRASS);
    const spacing = Math.max(7, Math.floor(radius / (major ? 3.5 : village ? 2.5 : 2)));
    const grid = major ? [-2, -1, 0, 1, 2] : [-1, 0, 1];
    const roadLimit = Math.max(1, radius - 7);
    for (let lane = 0; lane <= grid.length; lane++) {
      const road = Math.round((lane - grid.length / 2) * spacing);
      for (let k = -roadLimit; k <= roadLimit; k++) {
        this.supportGround(cx + road, cz + k, g);
        this.supportGround(cx + k, cz + road, g);
        this.raw(cx + road, g, cz + k, B.STONE);
        this.raw(cx + k, g, cz + road, B.STONE);
      }
    }
    for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) {
      this.supportGround(cx + dx, cz + dz, g);
      this.raw(cx + dx, g, cz + dz, B.BRICK);
    }
    for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) this.raw(cx + dx, g + 1, cz + dz, B.BRICK);
    this.raw(cx, g + 1, cz, B.BARREL);
    const lots = [];
    for (const x of grid) for (const z of grid) {
      if (x === 0 && z === 0) continue;
      if (z === 0 && x > 0) continue;
      if (!major && !village && Math.abs(x) !== 1) continue;
      lots.push([x, z]);
    }
    for (const [x, z] of lots) {
      let role = 'house';
      if (major && x === -1 && z === 0) role = 'inn';
      else if (major && x === 0 && z === -1) role = 'chapel';
      else if (x === 1 && z === 1) role = 'market';
      else if (x === 0 && z === 1) role = 'warehouse';
      else if (x === -2 && z === -1) role = 'workshop';
      const hw = role === 'chapel' || role === 'inn' || role === 'warehouse' ? (major ? 4 : 3) : (major ? 3 : 2);
      const hd = role === 'chapel' || role === 'inn' || role === 'warehouse' ? (major ? 4 : 3) : (major ? 3 : 2);
      this.villageHouse(cx + x * spacing, cz + z * spacing, g, hw, hd, role);
    }
    const stallOffset = Math.max(3, Math.floor(spacing / 3));
    const stallCorners = [[-stallOffset, -stallOffset], [stallOffset, -stallOffset], [-stallOffset, stallOffset], [stallOffset, stallOffset]];
    for (let stall = 0; stall < 2; stall++) {
      const [dx, dz] = stallCorners[(island + stall) % stallCorners.length];
      const alongX = dx * dz > 0;
      for (let k = -1; k <= 1; k++) {
        const x = cx + dx + (alongX ? k : 0), z = cz + dz + (alongX ? 0 : k);
        this.supportGround(x, z, g);
        this.raw(x, g, z, B.PLANK);
        this.raw(x, g + 4, z, B.CLOTH);
      }
      for (const k of [-1, 1]) {
        const x = cx + dx + (alongX ? k : 0), z = cz + dz + (alongX ? 0 : k);
        for (let y = g + 1; y <= g + 3; y++) this.raw(x, y, z, B.LOG);
      }
      this.raw(cx + dx, g + 1, cz + dz, (dx + dz) % 2 ? B.BARREL : B.CRATE);
    }
    const lights = major ? [-2, -1, 0, 1, 2] : [-1, 0, 1];
    for (const k of lights) {
      for (const [x, z] of [[cx + k * spacing, cz - radius + 3], [cx + k * spacing, cz + radius - 3], [cx - radius + 3, cz + k * spacing], [cx + radius - 3, cz + k * spacing]]) {
        this.supportGround(x, z, g + 1);
        this.raw(x, g + 1, z, B.LOG); this.raw(x, g + 2, z, B.LOG); this.raw(x, g + 3, z, B.LAMP);
      }
    }
    const dx = o.name === 'Brine Haven' ? -1 : 1, dz = 0;
    let shore = 0;
    for (let d = 1; d < o.r * 2; d++) {
      const x = Math.floor(cx + dx * d), z = Math.floor(cz + dz * d);
      if (!this.inside(x, 0, z) || this.islandOf[x + z * W] !== island || this.surf[x + z * W] <= SEA + 1) { shore = d; break; }
    }
    if (!shore) shore = Math.floor(o.r * 1.15);
    for (let d = 0; d < shore - 1; d++) {
      const x = Math.floor(cx + dx * d), z = Math.floor(cz + dz * d), y = Math.max(SEA + 1, this.surf[x + z * W]);
      for (let side = -1; side <= 1; side++) {
        const px = Math.floor(x - dz * side), pz = Math.floor(z + dx * side);
        this.raw(px, y, pz, B.STONE);
      }
    }
    const dockX = Math.floor(cx + dx * (shore - 1)), dockZ = Math.floor(cz + dz * (shore - 1));
    for (let k = 0; k < 18; k++) for (let side = -1; side <= 1; side++) {
      const x = Math.floor(dockX + dx * k - dz * side), z = Math.floor(dockZ + dz * k + dx * side);
      this.raw(x, SEA + 1, z, B.PLANK);
      if (side && k % 4 === 0) {
        const bottom = this.topSolid(x, z);
        for (let y = bottom + 1; y < SEA + 1; y++) this.raw(x, y, z, B.LOG);
      }
    }
    this.raw(dockX + Math.round(dx * 16), SEA + 1, dockZ + Math.round(dz * 16), B.CRATE);
    this.sites.villages.push({ island, name: o.name, x: cx + 0.5, y: g, z: cz + 0.5, tier });
    const endX = Math.floor(dockX + dx * 18), endZ = Math.floor(dockZ + dz * 18);
    this.reserved.push({ x0: Math.min(cx - radius - 2, endX - 2), x1: Math.max(cx + radius + 2, endX + 2), z0: Math.min(cz - radius - 2, endZ - 2), z1: Math.max(cz + radius + 2, endZ + 2) });
  }

  villageHouse(cx, cz, g, hw, hd, role) {
    const wallH = role === 'chapel' ? 5 : 3;
    const wall = role === 'chapel' || role === 'warehouse' ? B.WHITEBRICK : B.PLANK;
    const roof = role === 'chapel' ? B.SLATE : B.WRECKWOOD;
    for (let dx = -hw - 1; dx <= hw + 1; dx++) for (let dz = -hd - 1; dz <= hd + 1; dz++) {
      if (Math.abs(dx) === hw + 1 || Math.abs(dz) === hd + 1) {
        this.supportGround(cx + dx, cz + dz, g - 1);
        this.raw(cx + dx, g - 1, cz + dz, B.STONE);
      }
    }
    for (let dx = -hw; dx <= hw; dx++) for (let dz = -hd; dz <= hd; dz++) {
      const edge = Math.abs(dx) === hw || Math.abs(dz) === hd;
      this.supportGround(cx + dx, cz + dz, g);
      this.raw(cx + dx, g, cz + dz, edge ? B.BRICK : B.PLANK);
      for (let y = g + 1; y <= g + wallH; y++) {
        if (!edge || (dz === hd && dx === 0 && y <= g + 2)) continue;
        const window = y === g + 2 && ((Math.abs(dx) === hw && Math.abs(dz) === 1) || (Math.abs(dz) === hd && Math.abs(dx) === 2 && Math.abs(dx) < hw));
        if (!window) this.raw(cx + dx, y, cz + dz, wall);
      }
    }
    for (const [dx, dz] of [[-hw, -hd], [-hw, hd], [hw, -hd], [hw, hd]]) {
      for (let y = g + 1; y <= g + wallH; y++) this.raw(cx + dx, y, cz + dz, B.LOG);
    }
    const windows = [
      ...[-1, 1].flatMap((dz) => [[-hw, dz], [hw, dz]]),
      ...[-2, 2].filter((dx) => Math.abs(dx) < hw).flatMap((dx) => [[dx, -hd], [dx, hd]]),
    ];
    for (const [dx, dz] of windows) {
      this.raw(cx + dx, g + 1, cz + dz, B.WRECKWOOD);
      this.raw(cx + dx, g + 3, cz + dz, B.WRECKWOOD);
    }
    for (const dx of [-1, 1]) for (let y = g + 1; y <= g + wallH; y++) this.raw(cx + dx, y, cz + hd, B.WRECKWOOD);
    for (let dx = -1; dx <= 1; dx++) this.raw(cx + dx, g + wallH, cz + hd, B.WRECKWOOD);
    for (const sx of [-1, 1]) for (let y = g + 1; y < g + wallH; y++) this.raw(cx + sx * hw, y, cz, B.WRECKWOOD);
    for (let y = g + 1; y < g + wallH; y++) this.raw(cx, y, cz - hd, B.WRECKWOOD);
    for (let dx = -hw; dx <= hw; dx++) for (let dz = -hd; dz <= hd; dz++) {
      if (Math.abs(dx) === hw || Math.abs(dz) === hd) this.raw(cx + dx, g + wallH, cz + dz, B.LOG);
    }
    const rise = hd + 1;
    for (let dz = -rise; dz <= rise; dz++) {
      const y = g + wallH + rise - Math.abs(dz);
      for (let dx = -hw - 1; dx <= hw + 1; dx++) {
        this.raw(cx + dx, y - 1, cz + dz, roof);
        this.raw(cx + dx, y, cz + dz, roof);
      }
    }
    for (let dx = -hw; dx <= hw; dx++) this.raw(cx + dx, g + wallH + rise, cz, B.LOG);
    for (let dx = -1; dx <= 1; dx++) {
      this.supportGround(cx + dx, cz + hd + 1, g);
      this.raw(cx + dx, g, cz + hd + 1, B.PLANK);
      this.raw(cx + dx, g - 1, cz + hd + 1, B.STONE);
    }
    if (role !== 'chapel' && role !== 'warehouse') {
      const chimneyX = cx + hw - 1, chimneyZ = cz - hd;
      for (let y = g + wallH + 2; y <= g + wallH + 4; y++) this.raw(chimneyX, y, chimneyZ, B.BRICK);
    }
    if (role === 'inn' || role === 'market') {
      for (const dx of [-2, 2]) for (let y = g + 1; y <= g + 3; y++) this.raw(cx + dx, y, cz + hd + 2, B.LOG);
      for (let dx = -2; dx <= 2; dx++) this.raw(cx + dx, g + 3, cz + hd + 2, B.CLOTH);
      this.raw(cx, g + 4, cz + hd + 2, B.LAMP);
    }
    if (role === 'inn' || role === 'warehouse' || role === 'workshop') {
      this.raw(cx - hw - 1, g, cz + hd - 1, role === 'inn' ? B.BARREL : B.CRATE);
      this.raw(cx + hw + 1, g, cz + hd - 1, role === 'workshop' ? B.KEG : B.BARREL);
    }
    if (role === 'chapel') {
      for (let y = g + wallH + rise + 1; y <= g + wallH + rise + 3; y++) this.raw(cx, y, cz - 1, B.WHITEBRICK);
      this.raw(cx, g + wallH + rise + 4, cz - 1, B.LAMP);
    }
    this.raw(cx, g + 2, cz, B.LAMP);
  }

  buildLighthouse(i) {
    const o = this.islands[i];
    let lx = Math.round(o.x), lz = Math.round(o.z);
    let best = null;
    for (let dz = -6; dz <= 6; dz += 2) for (let dx = -6; dx <= 6; dx += 2) {
      const s = this.surf[(lx + dx) + (lz + dz) * W];
      if (!best || s > best.s) best = { x: lx + dx, z: lz + dz, s };
    }
    lx = best.x; lz = best.z;
    const g = Math.max(SEA + 2, Math.min(SEA + 6, best.s));
    this.flatten(lx + 3, lz, 7, g, B.GRASS);
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) this.supportGround(lx + dx, lz + dz, g);
    const top = g + 13;
    for (let y = g; y < top; y++) for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
      const inner = Math.abs(dx) < 2 && Math.abs(dz) < 2;
      if (inner && y < top - 1) { this.raw(lx + dx, y, lz + dz, B.AIR); continue; }
      this.raw(lx + dx, y, lz + dz, (y - g) % 5 === 4 ? B.BRICK : B.WHITEBRICK);
    }
    for (let y = g; y < g + 2; y++) this.raw(lx + 2, y, lz, B.AIR);
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) if (!(Math.abs(dx) === 3 && Math.abs(dz) === 3)) this.raw(lx + dx, top, lz + dz, B.PLANK);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) for (let y = top + 1; y <= top + 2; y++) this.raw(lx + dx, y, lz + dz, B.LOG);
    this.raw(lx, top + 1, lz, B.LAMP);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) this.raw(lx + dx, top + 3, lz + dz, B.SLATE);
    this.raw(lx, top + 4, lz, B.SLATE);
    // keeper's hut
    const hx = lx + 6, hz = lz - 1;
    for (let dx = 0; dx < 4; dx++) for (let dz = 0; dz < 4; dz++) this.supportGround(hx + dx, hz + dz, g);
    for (let dx = 0; dx < 4; dx++) for (let dz = 0; dz < 4; dz++) for (let y = g; y < g + 3; y++) {
      const wall = dx === 0 || dx === 3 || dz === 0 || dz === 3;
      this.raw(hx + dx, y, hz + dz, wall ? B.PLANK : B.AIR);
    }
    for (let y = g; y < g + 2; y++) this.raw(hx, y, hz + 2, B.AIR);
    for (let dx = -1; dx < 5; dx++) for (let dz = -1; dz < 5; dz++) this.raw(hx + dx, g + 3, hz + dz, B.SLATE);
    this.raw(hx, g + 2, hz + 1, B.LOG);
    this.raw(hx - 1, g + 2, hz + 1, B.LAMP);
    this.sites.lighthouse = { x: lx + 0.5, y: top + 1.5, z: lz + 0.5, base: g };
    this.sites.tallow = { x: lx + 4.5, y: g, z: lz + 1.5 };
    this.reserved.push({ x0: lx - 4, x1: hx + 6, z0: lz - 5, z1: lz + 5 });
  }

  // Ruined Hollowmen camp: crumbling walls, two tents, a cursed fire and a bone totem.
  buildCamp(i, rnd, record) {
    const o = this.islands[i];
    let spot = null;
    for (let tries = 0; tries < 400 && !spot; tries++) {
      const a = rnd() * Math.PI * 2, rr = rnd() * o.r * 0.55;
      const x = Math.floor(o.x + Math.cos(a) * rr), z = Math.floor(o.z + Math.sin(a) * rr);
      if (x < 8 || z < 8 || x >= this.bw - 8 || z >= this.bd - 8) continue;
      const s = this.topSolid(x, z) + 1;
      if (s < SEA + 2 || s > SEA + 12) continue;
      let ok = true;
      for (let dx = -4; dx <= 4 && ok; dx += 2) for (let dz = -4; dz <= 4 && ok; dz += 2) if (Math.abs(this.topSolid(x + dx, z + dz) + 1 - s) > 2) ok = false;
      if (ok && !this.isReserved(x, z, 6)) spot = { x, z, s };
    }
    if (!spot) { const x = Math.floor(o.x), z = Math.floor(o.z); spot = { x, z, s: this.topSolid(x, z) + 1 }; }
    const { x: cx, z: cz, s: g } = spot;
    const put = (x, y, z, id) => { if (record) this.set(x, y, z, id); else this.raw(x, y, z, id); };
    for (let x = cx - 5; x <= cx + 5; x++) for (let z = cz - 5; z <= cz + 5; z++) {
      for (let y = g; y < g + 8; y++) if (this.get(x, y, z) !== B.AIR) put(x, y, z, B.AIR);
      this.supportGround(x, z, g, B.DIRT, B.LOG, record);
    }
    for (let k = -4; k <= 4; k++) for (const [x, z] of [[cx + k, cz - 4], [cx + k, cz + 4], [cx - 4, cz + k], [cx + 4, cz + k]]) {
      if (rnd() < 0.3 || (Math.abs(k) < 1 && (x === cx || z === cz))) continue;
      const h = 1 + ((rnd() * 2.6) | 0);
      for (let y = g; y < g + h; y++) put(x, y, z, rnd() < 0.6 ? B.MOSSBRICK : B.BRICK);
    }
    for (const [tx, tz] of [[cx - 2, cz - 1], [cx + 2, cz + 1]]) {
      for (let dz = -1; dz <= 1; dz++) { put(tx - 1, g, tz + dz, B.CLOTH); put(tx + 1, g, tz + dz, B.CLOTH); put(tx, g + 1, tz + dz, B.CLOTH); }
    }
    for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) put(cx + dx, g - 1, cz + dz + 2, B.STONE);
    put(cx, g - 1, cz + 2, B.LAMP);
    put(cx + 3, g, cz - 3, B.BONE); put(cx + 3, g + 1, cz - 3, B.BONE); put(cx + 3, g + 2, cz - 3, B.BONE);
    put(cx - 3, g, cz + 3, B.BONE);
    this.reserved.push({ x0: cx - 6, x1: cx + 6, z0: cz - 6, z1: cz + 6 });
    return { island: i, x: cx + 0.5, z: cz + 0.5, y: g, fire: { x: cx + 0.5, y: g, z: cz + 2.5 } };
  }

  decorate(rnd) {
    const trees = [];
    const near = (x, z, r) => trees.some((t) => Math.abs(t.x - x) <= r && Math.abs(t.z - z) <= r);
    for (let z = 4; z < OW - 4; z++) for (let x = 4; x < OW - 4; x++) {
      const i = this.islandOf[x + z * W];
      if (i < 0) continue;
      const s = this.surf[x + z * W];
      if (s <= SEA) continue;
      if (this.get(x, s, z) !== B.AIR || this.isReserved(x, z, 3)) continue;
      if (this.get(x, s - 1, z) === B.AIR) continue;
      const type = this.islands[i].type;
      const top = this.get(x, s - 1, z);
      const r = rnd();
      if ((type === 'forest' || type === 'outpost') && top === B.GRASS && r < (type === 'forest' ? 0.05 : 0.025) && !near(x, z, 3)) { this.oak(x, s, z, rnd); trees.push({ x, z }); }
      else if (top === B.SAND && s <= SEA + 5 && r < (type === 'palm' ? 0.035 : 0.01) && !near(x, z, 3)) { this.palm(x, s, z, rnd); trees.push({ x, z }); }
      else if (top === B.GRASS && type === 'palm' && r < 0.03 && !near(x, z, 3)) { this.palm(x, s, z, rnd); trees.push({ x, z }); }
      else if (type === 'rock' && top === B.GRASS && r < 0.025 && !near(x, z, 3)) { this.oak(x, s, z, rnd); trees.push({ x, z }); }
      else if (type === 'rock' && r < 0.012) this.boulder(x, s, z, rnd, B.STONE);
      else if (type === 'skull' && top === B.SLATE && r < 0.01) this.spire(x, s, z, rnd);
      else if (type === 'skull' && top === B.SAND && r < 0.006) this.boulder(x, s, z, rnd, B.SLATE);
    }
  }
  plants(rnd) {
    for (let z = 2; z < OW - 2; z++) for (let x = 2; x < OW - 2; x++) this.plantAt(x, z, rnd);
  }
  plantAt(x, z, rnd) {
    {
      const i = this.islandOf[x + z * W];
      if (i < 0) return;
      const ty = this.topSolid(x, z);
      if (ty < FLOOR) return;
      const y = ty + 1;
      if (y >= H || this.get(x, y, z) !== B.AIR) return;
      const top = this.get(x, ty, z);
      const type = this.islands[i].type;
      const r = rnd();
      if (y <= SEA - 1) {
        if ((top === B.SAND || top === B.STONE) && y >= SEA - 6 && r < 0.07) this.raw(x, y, z, B.KELP);
        return;
      }
      if (this.isReserved(x, z)) { if (top === B.GRASS && r < 0.05) this.raw(x, y, z, B.TALLGRASS); return; }
      if (top === B.GRASS) {
        if (type === 'jungle') {
          if (r < 0.26) this.raw(x, y, z, B.TALLGRASS);
          else if (r < 0.36) this.raw(x, y, z, B.FERN);
          else if (r < 0.39) this.raw(x, y, z, B.FLOWER_R);
          else if (r < 0.405) this.raw(x, y, z, B.MUSHROOM);
        } else if (r < 0.2) this.raw(x, y, z, B.TALLGRASS);
        else if (r < 0.24) this.raw(x, y, z, B.FERN);
        else if (r < 0.265) this.raw(x, y, z, B.FLOWER_R);
        else if (r < 0.29) this.raw(x, y, z, B.FLOWER_Y);
      } else if (top === B.SAND && y <= SEA + 2) {
        if (r < 0.02) this.raw(x, y, z, B.SHELL);
        else if (r < 0.035 && type !== 'skull') this.raw(x, y, z, B.TALLGRASS);
      } else if (type === 'skull' && (top === B.SLATE || top === B.SAND) && r < 0.035) this.raw(x, y, z, B.MUSHROOM);
      else if (type === 'volcano' && top === B.ASH && r < 0.01) this.raw(x, y, z, B.SHELL);
    }
  }
  oak(x, s, z, rnd) {
    const h = 7 + Math.floor(rnd() * 3);
    // Keep the old generator's draw count so later island details remain stable.
    for (let i = 0; i < 12; i++) rnd();
    for (let y = s; y < s + h; y++) this.raw(x, y, z, B.LOG);
    const top = s + h;
    const arms = [];
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (const [i, [dx, dz]] of dirs.entries()) {
      const branchY = s + h - 3 + (hash3(x + i, s, z - i) > 0.5 ? 1 : 0);
      const len = 2 + Math.floor(hash3(x - i, branchY, z + i) * 2);
      let bx = x, bz = z;
      for (let step = 1; step <= len; step++) {
        const nx = bx + dx, nz = bz + dz, id = this.get(nx, branchY, nz);
        if (id && !WOODY[id]) break;
        if (id === B.AIR) this.raw(nx, branchY, nz, B.LOG);
        bx = nx; bz = nz;
        if (id) break;
      }
      if (bx !== x || bz !== z) arms.push([bx, branchY, bz]);
    }
    const crown = (cx, cy, cz, rx, ry, rz) => {
      for (let dy = -Math.ceil(ry); dy <= Math.ceil(ry); dy++) {
        for (let dx = -Math.ceil(rx); dx <= Math.ceil(rx); dx++) for (let dz = -Math.ceil(rz); dz <= Math.ceil(rz); dz++) {
          const d = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) + (dz * dz) / (rz * rz);
          const edge = (hash3(cx + dx, cy + dy, cz + dz) - 0.5) * 0.3;
          if (d > 1 + edge || (d > 0.82 && hash3(cx + dx * 3, cy + dy * 3, cz + dz * 3) < 0.035)) continue;
          const leaf = hash3(cx + dx * 5, cy + dy * 5, cz + dz * 5) > 0.78 ? B.JLEAVES : B.LEAVES;
          this.rawIfAir(cx + dx, cy + dy, cz + dz, leaf);
        }
      }
    }
    crown(x, top - 1, z, 2.6, 2.35, 2.6);
    for (const [ax, ay, az] of arms) crown(ax, top - 2 + (ay - (top - 3)), az, 1.55, 1.45, 1.55);
  }
  palm(x, s, z, rnd) {
    const h = 5 + Math.floor(rnd() * 3);
    const lean = Math.floor(rnd() * 4), ldx = [1, -1, 0, 0][lean], ldz = [0, 0, 1, -1][lean];
    const bend = 2 + Math.floor(rnd() * 2);
    let tx = x, tz = z;
    for (let k = 0; k < h; k++) {
      if (k === bend || (k === h - 2 && rnd() < 0.5)) { tx += ldx; tz += ldz; }
      this.raw(tx, s + k, tz, B.PALM);
    }
    const ty = s + h;
    this.raw(tx, ty, tz, B.FROND);
    for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      let connected = true;
      for (const [step, dy] of [[1, 0], [2, 0], [3, -1]]) {
        const fx = tx + step * ax, fy = ty + dy, fz = tz + step * az;
        if (!connected || this.get(fx, fy, fz) !== B.AIR) { connected = false; continue; }
        this.raw(fx, fy, fz, B.FROND);
      }
      if (rnd() < 0.6) this.rawIfAir(tx + ax, ty - 1, tz + az, B.COCONUT);
    }
    for (const [ax, az] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      let connected = true;
      for (const [step, dy] of [[1, 0], [2, -1]]) {
        const fx = tx + step * ax, fy = ty + dy, fz = tz + step * az;
        if (!connected || this.get(fx, fy, fz) !== B.AIR) { connected = false; continue; }
        this.raw(fx, fy, fz, B.FROND);
      }
    }
  }
  boulder(x, s, z, rnd, id) {
    const r = rnd() < 0.4 ? 2 : 1;
    for (let dx = -r; dx <= r; dx++) for (let dy = -1; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) {
      if (dx * dx + dy * dy + dz * dz <= r * r + 0.5 && rnd() < 0.9) this.rawIfAir(x + dx, s + dy, z + dz, id);
    }
  }
  spire(x, s, z, rnd, id = B.SLATE) {
    const h = 3 + Math.floor(rnd() * 6);
    for (let y = s; y < s + h; y++) this.raw(x, y, z, id);
    if (h > 5) { this.rawIfAir(x + 1, s, z, id); this.rawIfAir(x, s, z + 1, id); this.rawIfAir(x + 1, s + 1, z, id); }
  }
  ribs(o) {
    const cx = Math.round(o.x), cz = Math.round(o.z);
    for (let x = cx - 8; x <= cx + 8; x++) {
      const g = this.topSolid(x, cz) + 1;
      if (g > SEA) this.raw(x, g, cz, B.BONE);
    }
    for (let i = -3; i <= 3; i++) {
      const x = cx + i * 2;
      const R = 5.4 - Math.abs(i) * 0.7;
      for (let a = 0.1; a < Math.PI - 0.08; a += 0.08) {
        const z = cz + Math.round(Math.cos(a) * R), ground = this.surf[x + z * W];
        const rise = Math.max(0, Math.round(Math.sin(a) * R * 1.15) - 1);
        this.rawIfAir(x, ground + rise, z, B.BONE);
      }
    }
    const hx = cx + 10, g = this.topSolid(hx, cz) + 1;
    for (let dx = 0; dx < 4; dx++) for (let dy = 0; dy < 3; dy++) for (let dz = -1; dz <= 1; dz++) this.raw(hx + dx, g + dy, cz + dz, B.BONE);
    this.raw(hx + 1, g + 1, cz - 1, B.AIR); this.raw(hx + 1, g + 1, cz + 1, B.AIR);
    for (let dz = -1; dz <= 1; dz++) this.raw(hx + 3, g, cz + dz, B.AIR);
    // the Hollow vault lies under the beast's skull
    for (let dx = 0; dx < 3; dx++) for (let dz = -1; dz <= 1; dz++) this.raw(hx + dx, g - 1, cz + dz, B.MOSSBRICK);
    this.raw(hx + 1, g - 2, cz, B.VAULT);
    this.sites.vault = { x: hx + 1, y: g - 2, z: cz, island: this.islands.indexOf(o) };
    this.sites.ribs = { x: cx, z: cz };
    this.reserved.push({ x0: cx - 9, x1: hx + 4, z0: cz - 6, z1: cz + 6 });
  }

  pickTreasureIsland(rnd, exclude, first) {
    const o0 = this.islands[0];
    const c = this.islands.map((o, i) => ({ o, i })).filter((e) => e.i !== 0 && e.i !== exclude && (!first || e.o.type === 'palm') && e.o.name !== 'Lantern Cay' && e.o.type !== 'volcano');
    if (!c.length) return 1;
    if (first) {
      c.sort((a, b) => Math.hypot(a.o.x - o0.x, a.o.z - o0.z) - Math.hypot(b.o.x - o0.x, b.o.z - o0.z));
      return c[0].i;
    }
    return c[Math.floor(rnd() * c.length)].i;
  }

  placeTreasure(rnd, idx, record, chestId = B.CHEST) {
    const o = this.islands[idx];
    let spot = null;
    for (let tries = 0; tries < 600 && !spot; tries++) {
      const a = rnd() * Math.PI * 2, rr = rnd() * o.r * 0.75;
      const x = Math.floor(o.x + Math.cos(a) * rr), z = Math.floor(o.z + Math.sin(a) * rr);
      if (x < 4 || z < 4 || x >= this.bw - 4 || z >= this.bd - 4 || this.isReserved(x, z, 2)) continue;
      const s = this.topSolid(x, z) + 1;
      if (s < SEA + 1 || s > SEA + 9) continue;
      const top = this.get(x, s - 1, z);
      if (top !== B.SAND && top !== B.GRASS && top !== B.SLATE && top !== B.ASH) continue;
      let ok = true;
      for (let dx = -2; dx <= 2 && ok; dx++) for (let dz = -2; dz <= 2 && ok; dz++) {
        if (Math.abs(this.topSolid(x + dx, z + dz) + 1 - s) > 1) ok = false;
        for (let y = s; y < s + 3 && ok; y++) if (this.solid(x + dx, y, z + dz)) ok = false;
      }
      if (ok) spot = { x, z, s };
    }
    if (!spot) {
      for (let rr = 0; rr < o.r && !spot; rr += 1) for (let a = 0; a < 6.28 && !spot; a += 0.3) {
        const x = Math.floor(o.x + Math.cos(a) * rr), z = Math.floor(o.z + Math.sin(a) * rr), s = this.topSolid(x, z) + 1;
        if (s >= SEA + 1 && !this.isReserved(x, z, 1)) spot = { x, z, s };
      }
    }
    if (!spot) { const x = Math.floor(o.x), z = Math.floor(o.z); spot = { x, z, s: this.topSolid(x, z) + 1 }; }
    const { x, z, s } = spot;
    const put = (xx, yy, zz, id) => (record ? this.set(xx, yy, zz, id) : this.raw(xx, yy, zz, id));
    for (const [dx, dz] of [[0, 0], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const ty = this.topSolid(x + dx, z + dz);
      if (this.get(x + dx, ty + 1, z + dz)) put(x + dx, ty + 1, z + dz, B.AIR);
      put(x + dx, ty, z + dz, B.MARK);
    }
    put(x, s - 3, z, chestId);
    return { island: idx, x, z, y: s - 3, dug: false };
  }

  // ---------------------------------------------------------------- meshing
  ao(x, y, z, o) {
    const s1 = OPAQUE[this.get(x + o[0][0], y + o[0][1], z + o[0][2])];
    const s2 = OPAQUE[this.get(x + o[1][0], y + o[1][1], z + o[1][2])];
    if (s1 && s2) return 0;
    const c = OPAQUE[this.get(x + o[2][0], y + o[2][1], z + o[2][2])];
    return 3 - s1 - s2 - c;
  }

  // ---- the smooth ground of one chunk, plus the column index physics asks "how high is the ground here"
  // (it includes triangles of neighbouring chunks that reach into this one)
  terrainSurface(key) {
    const cx = key % NCX, cz = (key / NCX) | 0, x0 = cx * CS, z0 = cz * CS;
    const S = surfaceNets(this.data, x0, z0, TERRAIN);
    this.phys[key] = { C: S ? columnIndex(S, triangulate(S, false), x0, z0) : null, x0, z0 };
    return S;
  }
  physAt(x, z) {
    const cx = Math.floor(x) >> 4, cz = Math.floor(z) >> 4;
    if (cx < 0 || cz < 0 || cx >= NCX || cz >= NCX) return null;
    const key = cx + cz * NCX;
    if (!this.phys[key]) this.terrainSurface(key);
    return this.phys[key];
  }
  buildChunk(key) {
    this.built[key] = 1;
    const cx = key % NCX, cz = (key / NCX) | 0;
    const x0 = cx * CS, z0 = cz * CS;
    const data = this.data;
    const S = this.terrainSurface(key);
    const TG = S ? this.surfaceGeometry(S, triangulate(S, true), false) : null;
    const LS = surfaceNets(data, x0, z0, LEAFY);
    const LG = LS ? this.surfaceGeometry(LS, triangulate(LS, true), true) : null;
    const A = { pos: [], nor: [], col: [], uv: [], lay: [], ind: [], n: 0 };
    const P = { pos: [], nor: [], col: [], uv: [], lay: [], sway: [], ind: [], n: 0 };
    const F = { pos: [], nor: [], col: [], uv: [], ind: [], n: 0 };
    for (let y = FLOOR; y < H; y++) for (let z = z0; z < z0 + CS; z++) for (let x = x0; x < x0 + CS; x++) {
      const id = data[x + W * (z + D * y)];
      if (id === 0 || TERRAIN[id] || LEAFY[id]) continue;
      const def = BLOCKS[id];
      const h = hash3(x, y, z);
      if (def.plant) { this.emitPlant(P, x, y, z, def, h, id); continue; }
      if (WOODY[id]) { this.emitTrunk(A, x, y, z, id); continue; }
      if (id === B.COCONUT) { this.emitCoconut(A, x, y, z); continue; }
      if (id === B.FROND) { if (this.get(x, y - 1, z) === B.PALM) this.emitCrown(F, x, y, z); continue; }
      if (CRISP[id]) this.emitBlock(A, x, y, z, id, def, h);
      else if (PIECE[id]) emitPiece(this, A, x, y, z, id);
    }
    for (const kind of ['t', 'l', 's', 'p', 'f']) {
      const k = key + ':' + kind;
      const old = this.meshes.get(k);
      if (old) { this.group.remove(old); old.geometry.dispose(); this.meshes.delete(k); }
    }
    const add = (g, mat, kind, cast) => {
      if (!g) return;
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, mat);
      m.matrixAutoUpdate = false; m.updateMatrix();
      m.userData.cx = x0 + 8; m.userData.cz = z0 + 8; m.userData.cast = cast;
      m.castShadow = cast && this.shadows;
      m.receiveShadow = this.shadows;
      this.group.add(m);
      this.meshes.set(key + ':' + kind, m);
    };
    add(TG, this.mats.terrain, 't', true);
    add(LG, this.mats.leaves, 'l', true);
    add(toGeometry(A), this.mats.solid, 's', true);
    add(toGeometry(P), this.mats.plant, 'p', false);
    add(toGeometry(F), this.mats.frond, 'f', true);
  }
  // Geometry for a smooth surface: every vertex takes its colours from the blocks around it.
  surfaceGeometry(S, tris, leafy) {
    const { pos, nor, box } = S;
    if (!tris.length) return null;
    const map = new Int32Array(S.n).fill(-1);
    const P = [], N = [], C1 = [], C2 = [], DT = [], GL = [], I = [];
    const fallback = leafy ? TM[B.LEAVES] : TM[B.STONE];
    let m = 0;
    for (const v of tris) {
      if (map[v] < 0) {
        map[v] = m++;
        let px = pos[v * 3], py = pos[v * 3 + 1], pz = pos[v * 3 + 2];
        const nx = nor[v * 3], ny = nor[v * 3 + 1], nz = nor[v * 3 + 2];
        if (leafy) { const k = (hash3(Math.round(px * 2.3), Math.round(py * 2.3), Math.round(pz * 2.3)) - 0.3) * 0.42; px += nx * k; py += ny * k; pz += nz * k; }
        P.push(px, py, pz); N.push(nx, ny, nz);
        const vx = Math.round(box[v * 3] - 0.5), vy = Math.round(box[v * 3 + 1] - 0.5), vz = Math.round(box[v * 3 + 2] - 0.5);
        let t0 = 0, t1 = 0, t2 = 0, s0 = 0, s1 = 0, s2 = 0, d0 = 0, d1 = 0, d2 = 0, d3 = 0, gl = 0, cnt = 0;
        for (let k = 0; k < 8; k++) {
          const id = this.get(vx + (k & 1), vy + ((k >> 1) & 1), vz + (k >> 2));
          if (leafy ? !LEAFY[id] : !TERRAIN[id]) continue;
          const M = TM[id];
          cnt++;
          t0 += M.top[0]; t1 += M.top[1]; t2 += M.top[2]; s0 += M.side[0]; s1 += M.side[1]; s2 += M.side[2];
          d0 += M.det[0]; d1 += M.det[1]; d2 += M.det[2]; d3 += M.det[3]; gl += M.glow;
        }
        if (!cnt) { const M = fallback; cnt = 1; [t0, t1, t2] = M.top; [s0, s1, s2] = M.side; [d0, d1, d2, d3] = M.det; }
        const ao = Math.min(1.08, Math.max(0.62, 1 - (cnt - 4) * 0.085));
        const vary = 0.88 + 0.24 * (this.nD ? this.nD(px * 0.09, pz * 0.09) : 0.5);
        const leafShade = leafy ? 0.9 + 0.18 * hash3(Math.floor(px * 1.7), Math.floor(py * 1.7), Math.floor(pz * 1.7)) : 1;
        const k = (ao * vary * leafShade) / cnt;
        C1.push(t0 * k, t1 * k, t2 * k); C2.push(s0 * k, s1 * k, s2 * k);
        DT.push(d0 / cnt, d1 / cnt, d2 / cnt, d3 / cnt); GL.push(gl / cnt);
      }
      I.push(map[v]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(C1, 3));
    g.setAttribute('color2', new THREE.Float32BufferAttribute(C2, 3));
    g.setAttribute('detail', new THREE.Float32BufferAttribute(DT, 4));
    g.setAttribute('glow', new THREE.Float32BufferAttribute(GL, 1));
    g.setIndex(m > 65535 ? new THREE.Uint32BufferAttribute(I, 1) : new THREE.Uint16BufferAttribute(I, 1));
    return g;
  }
  // a tapered round segment from (x0,y0,z0) to (x1,y1,z1), bark wrapped around it
  cyl(A, x0, y0, z0, x1, y1, z1, r0, r1, tile, shade = 1, segs = 8) {
    let dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
    const L = Math.hypot(dx, dy, dz) || 1; dx /= L; dy /= L; dz /= L;
    let ux, uy, uz;
    if (Math.abs(dy) < 0.9) { ux = -dz; uy = 0; uz = dx; } else { ux = 1; uy = 0; uz = 0; }
    const ul = Math.hypot(ux, uy, uz); ux /= ul; uy /= ul; uz /= ul;
    const vx = dy * uz - dz * uy, vy = dz * ux - dx * uz, vz = dx * uy - dy * ux;
    const base = A.n, tw = hash3(Math.floor(x0 * 3), Math.floor(y0 * 3), Math.floor(z0 * 3)) * 6.28;
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2 + tw, ca = Math.cos(a), sa = Math.sin(a);
      const nx = ux * ca + vx * sa, ny = uy * ca + vy * sa, nz = uz * ca + vz * sa;
      A.pos.push(x0 + nx * r0, y0 + ny * r0, z0 + nz * r0, x1 + nx * r1, y1 + ny * r1, z1 + nz * r1);
      A.nor.push(nx, ny, nz, nx, ny, nz);
      A.uv.push(i / segs, y0 * 0.7, i / segs, y0 * 0.7 + L * 0.7);
      A.lay.push(tile, tile);
      A.col.push(shade * 0.82, shade * 0.82, shade * 0.82, shade, shade, shade);
    }
    for (let i = 0; i < segs; i++) { const a = base + i * 2; A.ind.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    A.n += (segs + 1) * 2;
  }
  // A stretch of trunk from P1 to P2 along a Catmull-Rom curve (P0, P3 the neighbours), rings framed only by
  // the local direction so the stretches above and below meet without a seam.
  tube(A, P0, P1, P2, P3, r1, r2, tile, n = 4, segs = 9) {
    const base = A.n;
    for (let k = 0; k <= n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const p = [0, 0, 0], d = [0, 0, 0];
      for (let a = 0; a < 3; a++) {
        const p0 = P0[a], p1 = P1[a], p2 = P2[a], p3 = P3[a];
        p[a] = 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
        d[a] = 0.5 * ((-p0 + p2) + 2 * (2 * p0 - 5 * p1 + 4 * p2 - p3) * t + 3 * (-p0 + 3 * p1 - 3 * p2 + p3) * t2);
      }
      const dl = Math.hypot(d[0], d[1], d[2]) || 1; d[0] /= dl; d[1] /= dl; d[2] /= dl;
      // u = d x Z (horizontal for an upright trunk), v = u x d
      let ux = d[1], uy = -d[0], uz = 0; const ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul;
      const vx = uy * d[2] - uz * d[1], vy = uz * d[0] - ux * d[2], vz = ux * d[1] - uy * d[0];
      const r = r1 + (r2 - r1) * t;
      for (let i = 0; i <= segs; i++) {
        const a = (i / segs) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        const nx = ux * ca + vx * sa, ny = uy * ca + vy * sa, nz = uz * ca + vz * sa;
        A.pos.push(p[0] + nx * r, p[1] + ny * r, p[2] + nz * r);
        A.nor.push(nx, ny, nz);
        A.uv.push(i / segs, p[1] * 0.7);
        A.lay.push(tile);
        const sh = 0.96;
        A.col.push(sh, sh, sh);
      }
    }
    for (let k = 0; k < n; k++) for (let i = 0; i < segs; i++) {
      const a = base + k * (segs + 1) + i, b = a + segs + 1;
      A.ind.push(a, b, a + 1, a + 1, b, b + 1);
    }
    A.n += (n + 1) * (segs + 1);
  }
  // trunks and logs: round, tapering up the tree, flared where they meet the ground
  emitTrunk(A, x, y, z, id) {
    const g = (xx, yy, zz) => this.get(xx, yy, zz);
    const cx = x + 0.5, cy = y + 0.5, cz = z + 0.5;
    if (id === B.JLOG) {
      const at = (xx, yy, zz) => g(xx, yy, zz) === B.JLOG;
      const quad = (xx, yy, zz) => at(xx, yy, zz) && at(xx + 1, yy, zz) && at(xx, yy, zz + 1) && at(xx + 1, yy, zz + 1);
      let gx = null, gz = null;
      for (const [ox, oz] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) if (quad(x + ox, y, z + oz)) { gx = x + ox; gz = z + oz; break; }
      if (gx !== null) {
        if (gx !== x || gz !== z) return;
        let k = 0; while (k < 16 && quad(x, y - k - 1, z)) k++;
        const r = Math.max(0.62, 1.02 - 0.028 * k), ru = Math.max(0.62, 1.02 - 0.028 * (k + 1));
        const mx = x + 1, mz = z + 1;
        if (quad(x, y + 1, z)) this.cyl(A, mx, cy, mz, mx, cy + 1, mz, r, ru, BARK[id][3], 1, 12);
        else this.cyl(A, mx, cy, mz, mx, cy + 0.6, mz, r, r * 0.75, BARK[id][3], 1, 12);
        if (k === 0) this.cyl(A, mx, cy - 1.3, mz, mx, cy, mz, r * 1.45, r, BARK[id][3], 0.9, 12);
        return;
      }
    }
    const [r0, taper, rMin, tile] = BARK[id];
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    const stepUp = (xx, yy, zz) => {
      if (g(xx, yy + 1, zz) === id) return [xx, zz];
      if (id === B.PALM) for (const [dx, dz] of nb) if (g(xx + dx, yy + 1, zz + dz) === B.PALM) return [xx + dx, zz + dz];
      return null;
    };
    const stepDown = (xx, yy, zz) => {
      if (g(xx, yy - 1, zz) === id) return [xx, zz];
      if (id === B.PALM) for (const [dx, dz] of nb) if (g(xx + dx, yy - 1, zz + dz) === B.PALM) return [xx + dx, zz + dz];
      return null;
    };
    const up = stepUp(x, y, z), down = stepDown(x, y, z);
    if (up || down) {
      let k = 0, px = x, pz = z;
      for (let d; k < 16 && (d = stepDown(px, y - k, pz)); k++) { px = d[0]; pz = d[1]; }
      const r = Math.max(rMin, r0 - taper * k), ru = Math.max(rMin, r0 - taper * (k + 1));
      if (up) {
        // a smooth curve through the cell centres below and above, so leaning palms bend instead of kinking
        const uu = stepUp(up[0], y + 1, up[1]);
        const P1 = [cx, cy, cz], P2 = [up[0] + 0.5, cy + 1, up[1] + 0.5];
        const P0 = down ? [down[0] + 0.5, cy - 1, down[1] + 0.5] : [2 * P1[0] - P2[0], cy - 1, 2 * P1[2] - P2[2]];
        const P3 = uu ? [uu[0] + 0.5, cy + 2, uu[1] + 0.5] : [2 * P2[0] - P1[0], cy + 2, 2 * P2[2] - P1[2]];
        this.tube(A, P0, P1, P2, P3, r, ru, tile, id === B.PALM ? 4 : 2);
      } else this.cyl(A, cx, cy, cz, cx, cy + 0.45, cz, r, r * 0.72, tile);
      if (!down) this.cyl(A, cx, cy - 1.2, cz, cx, cy, cz, r * 1.4, r, tile, 0.9);
      return;
    }
    // lying logs, and branches reaching back to a trunk
    let any = false;
    const ly = y + 0.32;
    for (const [dx, dz] of nb) {
      const nid = g(x + dx, y, z + dz);
      if (!WOODY[nid]) continue;
      any = true;
      const trunk = !!(stepUp(x + dx, y, z + dz) || stepDown(x + dx, y, z + dz));
      if (trunk && (dx > 0 || (dx === 0 && dz > 0))) this.cyl(A, cx, cy + 0.2, cz, cx + dx, cy - 0.1, cz + dz, r0 * 0.55, r0 * 0.7, tile);
      else if (!trunk && (dx > 0 || (dx === 0 && dz > 0))) this.cyl(A, cx, ly, cz, cx + dx, ly, cz + dz, r0 * 0.85, r0 * 0.85, tile);
    }
    if (!any) this.cyl(A, cx - 0.5, ly, cz, cx + 0.5, ly, cz, r0 * 0.85, r0 * 0.8, tile);
  }
  emitCoconut(A, x, y, z) {
    const cx = x + 0.5, cy = y + 0.78, cz = z + 0.5;
    this.cyl(A, cx, cy - 0.17, cz, cx, cy + 0.17, cz, 0.15, 0.13, T.coconut, 0.9, 6);
    this.cyl(A, cx, cy - 0.22, cz, cx, cy - 0.17, cz, 0.04, 0.15, T.coconut, 0.75, 6);
    this.cyl(A, cx, cy + 0.17, cz, cx, cy + 0.24, cz, 0.13, 0.03, T.coconut, 0.9, 6);
  }
  // a palm's crown: long drooping fronds fanned around the top of the trunk
  emitCrown(F, x, y, z) {
    const cx = x + 0.5, cy = y + 0.25, cz = z + 0.5;
    const n = 9, rot = hash3(x, y, z) * 6.28;
    for (let i = 0; i < n; i++) {
      const a = rot + (i / n) * Math.PI * 2 + (hash3(x + i, y, z) - 0.5) * 0.4;
      const len = 2.9 + hash3(x, y + i, z) * 0.9, lift = 0.45 + hash3(x, y, z + i) * 0.5;
      const dx = Math.cos(a), dz = Math.sin(a), px = -dz, pz = dx;
      const segs = 6, base = F.n;
      for (let s = 0; s <= segs; s++) {
        const t = s / segs;
        const along = len * t, h = lift * Math.sin(Math.PI * t * 0.9) - 1.7 * t * t;
        const w = 0.62 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.1 + 0.08)), 0.6) + 0.02;
        const mx = cx + dx * along, my = cy + h, mz = cz + dz * along;
        const droop = 0.18 * t;   // the blade folds down along its midrib
        for (const side of [-1, 1]) {
          F.pos.push(mx + px * w * side, my - droop, mz + pz * w * side);
          F.nor.push(0, 1, 0);
          F.uv.push(side < 0 ? 0 : 1, t);
          const c = 0.8 + 0.25 * t;
          F.col.push(c, c, c);
        }
      }
      for (let s = 0; s < segs; s++) { const a0 = base + s * 2; F.ind.push(a0, a0 + 2, a0 + 1, a0 + 1, a0 + 2, a0 + 3); }
      F.n += (segs + 1) * 2;
    }
  }
  emitCoopered(A, x, y, z, def, h, kind) {
    const profile = kind === B.KEG
      ? [[0.08, 0.3], [0.19, 0.37], [0.5, 0.39], [0.81, 0.37], [0.92, 0.3]]
      : [[0.04, 0.32], [0.16, 0.4], [0.5, 0.43], [0.84, 0.4], [0.96, 0.32]];
    const segments = 18, tint = 0.93 + 0.12 * h, sideTile = def.tex[1];
    const normalAt = (row, angle) => {
      const prev = profile[Math.max(0, row - 1)], next = profile[Math.min(profile.length - 1, row + 1)];
      const slope = (next[1] - prev[1]) / Math.max(0.001, next[0] - prev[0]);
      const n = [Math.cos(angle), -slope, Math.sin(angle)], length = Math.hypot(n[0], n[1], n[2]);
      return n.map((v) => v / length);
    };
    for (let row = 0; row < profile.length - 1; row++) for (let i = 0; i < segments; i++) {
      const a0 = i / segments * Math.PI * 2, a1 = (i + 1) / segments * Math.PI * 2;
      const r0 = profile[row][1], r1 = profile[row + 1][1], y0 = profile[row][0], y1 = profile[row + 1][0], v = A.n;
      const push = (radius, yy, angle, uvY, rowIndex) => {
        const nx = Math.cos(angle), nz = Math.sin(angle), n = normalAt(rowIndex, angle);
        A.pos.push(x + 0.5 + nx * radius, y + yy, z + 0.5 + nz * radius);
        A.nor.push(n[0], n[1], n[2]); A.uv.push(i / segments + (angle === a1 ? 1 / segments : 0), uvY);
        A.lay.push(sideTile);
        const k = tint * (0.92 + 0.08 * Math.max(0, n[1]));
        A.col.push(k, k, k);
      };
      push(r0, y0, a0, y0, row); push(r0, y0, a1, y0, row);
      push(r1, y1, a0, y1, row + 1); push(r1, y1, a1, y1, row + 1);
      A.ind.push(v, v + 2, v + 1, v + 1, v + 2, v + 3); A.n += 4;
    }
    for (const top of [false, true]) {
      const row = top ? profile.length - 1 : 0, yy = profile[row][0], radius = profile[row][1], v = A.n, normalY = top ? 1 : -1;
      A.pos.push(x + 0.5, y + yy, z + 0.5); A.nor.push(0, normalY, 0); A.uv.push(0.5, 0.5); A.lay.push(top ? def.tex[0] : def.tex[2]);
      const k = tint * (top ? 1 : 0.72); A.col.push(k, k, k);
      for (let i = 0; i < segments; i++) {
        const angle = i / segments * Math.PI * 2, nx = Math.cos(angle), nz = Math.sin(angle);
        A.pos.push(x + 0.5 + nx * radius, y + yy, z + 0.5 + nz * radius);
        A.nor.push(0, normalY, 0); A.uv.push(0.5 + nx * 0.5, 0.5 + nz * 0.5); A.lay.push(top ? def.tex[0] : def.tex[2]);
        A.col.push(k, k, k);
      }
      for (let i = 0; i < segments; i++) {
        const a = v + 1 + i, b = v + 1 + (i + 1) % segments;
        if (top) A.ind.push(v, b, a); else A.ind.push(v, a, b);
      }
      A.n += segments + 1;
    }
  }
  // A crafted block: beveled faces, with smaller isolated forms for storage props.
  emitBlock(A, x, y, z, id, def, h) {
    if (id === B.BARREL || id === B.KEG) { this.emitCoopered(A, x, y, z, def, h, id); return; }
    const tint = 0.93 + 0.12 * h;
    const layers = new Array(6).fill(null), factors = new Array(6);
    const inset = id === B.CHEST || id === B.CRATE ? 0.07 : 0;
    const bounds = [x + inset, y + inset, z + inset, x + 1 - inset, y + 1 - inset, z + 1 - inset];
    for (let f = 0; f < 6; f++) {
      const Fc = FACES[f], d = Fc.dir;
      if (!inset && CRISP[this.get(x + d[0], y + d[1], z + d[2])]) continue;
      let tile = d[1] === 1 ? def.tex[0] : d[1] === -1 ? def.tex[2] : def.tex[1];
      if (def.front && d[1] === 0) tile = def.front;
      layers[f] = tile;
      factors[f] = AO_OFF[f].map((offset) => AO_CURVE[this.ao(x, y, z, offset)]);
    }
    const adjacent = inset ? null : [
      OPAQUE[this.get(x - 1, y, z)], OPAQUE[this.get(x + 1, y, z)],
      OPAQUE[this.get(x, y - 1, z)], OPAQUE[this.get(x, y + 1, z)],
      OPAQUE[this.get(x, y, z - 1)], OPAQUE[this.get(x, y, z + 1)],
    ];
    appendRoundedBox(A, ...bounds, layers, tint, inset ? 0.15 : 0.18, factors, FACE_UV, adjacent);
  }
  hard(x, y, z) { return HARD[this.get(x, y, z)] === 1; }
  // What a body standing at (x, z) with feet near y rests on: the smooth ground or the top of a block.
  groundUnder(x, y, z) {
    let g = -1e9;
    // look a little above the feet (the smooth ground can sit up to half a block above a block's top),
    // and if that start point is inside an overhang, look again from just under it
    let r = this.terrainBelow(x, y + 0.6, z);
    if (r && r.ceiling) r = this.terrainBelow(x, r.y - 0.01, z);
    if (r && !r.ceiling) g = r.y;
    const bx = Math.floor(x), bz = Math.floor(z), lo = Math.max(FLOOR, Math.floor(y) - 4);
    for (let by = Math.floor(y + 0.3); by >= lo; by--) {
      const id = this.get(bx, by, bz);
      if (PIECE[id]) {
        const B = pieceBoxes(this, bx, by, bz, id, this._pb || (this._pb = []));
        let top = -1e9;
        for (const b of B) if (x >= b[0] && x <= b[3] && z >= b[2] && z <= b[5] && b[4] <= y + 0.6 && b[4] > top) top = b[4];
        B.length = 0;
        if (top > -1e9) { if (top > g) g = top; break; }
        continue;
      }
      if (HARD[id] && (!WOODY[id] || this.inTrunk(x, z, bx, by, bz))) { if (by + 1 > g) g = by + 1; break; }
    }
    // a wall standing on the edge of the next cell over reaches into this one
    for (const [ox, oz] of [[1, 0], [0, 1]]) {
      const nx = bx + ox, nz = bz + oz;
      if ((ox && nx - x > 0.09) || (oz && nz - z > 0.09)) continue;
      for (let by = Math.floor(y + 0.3); by >= lo; by--) {
        const id = this.get(nx, by, nz);
        if (!isCode(id)) continue;
        const B = pieceBoxes(this, nx, by, nz, id, this._pb || (this._pb = []));
        for (const b of B) if (x >= b[0] && x <= b[3] && z >= b[2] && z <= b[5] && b[4] <= y + 0.6 && b[4] > g) g = b[4];
        B.length = 0;
        break;
      }
    }
    return g;
  }
  // Solid boxes (crafted blocks, building pieces) overlapping a region, as [x0, y0, z0, x1, y1, z1].
  boxes(x0, y0, z0, x1, y1, z1, out) {
    out.length = 0;
    for (let y = Math.floor(y0); y <= Math.floor(y1); y++) for (let z = Math.floor(z0) - 1; z <= Math.floor(z1) + 1; z++) for (let x = Math.floor(x0) - 1; x <= Math.floor(x1) + 1; x++) {
      const id = this.get(x, y, z);
      if (CRISP[id]) { if (x + 1 > x0 && x < x1 && z + 1 > z0 && z < z1 && y + 1 > y0 && y < y1) out.push([x, y, z, x + 1, y + 1, z + 1]); }
      else if (PIECE[id]) {
        const n = out.length;
        pieceBoxes(this, x, y, z, id, out);
        for (let i = out.length - 1; i >= n; i--) { const b = out[i]; if (!(b[3] > x0 && b[0] < x1 && b[5] > z0 && b[2] < z1 && b[4] > y0 && b[1] < y1)) out.splice(i, 1); }
      }
    }
    return out;
  }
  // for walking creatures: does this cell bar the way like a block would?
  blocker(x, y, z) { const id = this.get(x, y, z); return PIECE[id] ? pieceBlocks(id) : HARD[id] === 1; }
  // A trunk is a round post, not a full block: the circle it fills at cell (x, y, z), or null.
  // Thick mahogany trunks (2x2 cells) share one circle around their middle.
  trunkCircle(x, y, z, out = {}) {
    const id = this.get(x, y, z);
    if (!WOODY[id]) return null;
    if (id === B.JLOG) {
      const at = (xx, zz) => this.get(xx, y, zz) === B.JLOG;
      for (const [ox, oz] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) {
        const gx = x + ox, gz = z + oz;
        if (at(gx, gz) && at(gx + 1, gz) && at(gx, gz + 1) && at(gx + 1, gz + 1)) { out.x = gx + 1; out.z = gz + 1; out.r = 0.95; return out; }
      }
    }
    const [r0, taper, rMin] = BARK[id];
    let k = 0; while (k < 8 && this.get(x, y - k - 1, z) === id) k++;
    out.x = x + 0.5; out.z = z + 0.5; out.r = Math.max(rMin, r0 - taper * k) + 0.04;
    return out;
  }
  inTrunk(px, pz, x, y, z) {
    const c = this.trunkCircle(x, y, z, this._tc || (this._tc = {}));
    return !!c && Math.hypot(px - c.x, pz - c.z) < c.r;
  }
  // Meshes for a loose set of cells (a felled tree, a section of wall coming down), drawn exactly the way
  // the world's own chunks would draw them, in world coordinates.
  buildLoose(cells) {
    const S = this.scratch || (this.scratch = new Uint8Array(this.data.length));
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, leafy = false;
    for (const c of cells) {
      S[c.x + W * (c.z + D * c.y)] = c.id;
      if (c.x < x0) x0 = c.x; if (c.x > x1) x1 = c.x; if (c.z < z0) z0 = c.z; if (c.z > z1) z1 = c.z;
      if (LEAFY[c.id]) leafy = true;
    }
    const vol = Object.create(this);
    vol.data = S;
    const group = new THREE.Group();
    const add = (g, mat) => {
      if (!g) return;
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, mat);
      m.castShadow = this.shadows; m.receiveShadow = this.shadows;
      group.add(m);
    };
    try {
      if (leafy) {
        for (let cz = Math.max(0, Math.floor((z0 - 1) / CS)); cz <= Math.min(NCX - 1, Math.floor((z1 + 1) / CS)); cz++)
          for (let cx = Math.max(0, Math.floor((x0 - 1) / CS)); cx <= Math.min(NCX - 1, Math.floor((x1 + 1) / CS)); cx++) {
            const LS = surfaceNets(S, cx * CS, cz * CS, LEAFY);
            if (LS) add(vol.surfaceGeometry(LS, triangulate(LS, true), true), this.mats.leaves);
          }
      }
      const A = { pos: [], nor: [], col: [], uv: [], lay: [], ind: [], n: 0 };
      const P = { pos: [], nor: [], col: [], uv: [], lay: [], sway: [], ind: [], n: 0 };
      const F = { pos: [], nor: [], col: [], uv: [], ind: [], n: 0 };
      for (const c of cells) {
        const id = c.id, def = BLOCKS[id], h = hash3(c.x, c.y, c.z);
        if (def.plant) vol.emitPlant(P, c.x, c.y, c.z, def, h, id);
        else if (WOODY[id]) vol.emitTrunk(A, c.x, c.y, c.z, id);
        else if (id === B.COCONUT) vol.emitCoconut(A, c.x, c.y, c.z);
        else if (id === B.FROND) { if (vol.get(c.x, c.y - 1, c.z) === B.PALM) vol.emitCrown(F, c.x, c.y, c.z); }
        else if (CRISP[id]) vol.emitBlock(A, c.x, c.y, c.z, id, def, h);
        else if (PIECE[id]) emitPiece(vol, A, c.x, c.y, c.z, id);
      }
      add(toGeometry(A), this.mats.solid);
      add(toGeometry(P), this.mats.plant);
      add(toGeometry(F), this.mats.frond);
    } finally {
      for (const c of cells) S[c.x + W * (c.z + D * c.y)] = 0;
    }
    return group;
  }
  // The smooth ground in the way of a body at (x, z): +Infinity when terrain cuts into the space between
  // feet + step and the top of the head (a cliff, an overhang, a tunnel roof), else the floor height there.
  groundProbe(x, z, feet, step, head) {
    const ph = this.physAt(x, z);
    if (!ph || !ph.C) return -1e9;
    const r = columnDown(ph.C, ph.x0, ph.z0, x, feet + head, z);
    // No surface at all below the head: the head is inside solid ground (the world's floor is solid, so open
    // air always has some surface under it). This is what stops a body at the upright walls of dug tunnels,
    // which a column index can't see because they have no footprint from above.
    if (!r) return Infinity;
    if (r.ceiling || r.y > feet + step) return Infinity;
    return r.y;
  }
  // One step for a walking creature from feet (x, y, z) toward (nx, nz): the new feet height, or NaN when
  // the way is blocked (a wall or cliff, a drop deeper than `drop`, or ground below `minY`, i.e. water).
  walkStep(x, y, z, nx, nz, step = 1.05, drop = 3.5, minY = -1e9, height = 1.8) {
    const mx = nx - x, mz = nz - z;
    const hx = Math.floor(nx + Math.sign(mx) * 0.3), hz = Math.floor(nz + Math.sign(mz) * 0.3), fy = Math.floor(y + 0.05);
    let ny = y;
    if (this.blocker(hx, fy, hz)) {
      if (step < 1 || this.blocker(hx, fy + 1, hz) || this.blocker(hx, fy + 2, hz)) return NaN;
      ny = fy + 1;
    } else if (this.blocker(hx, fy + 1, hz)) return NaN;
    const t = this.groundProbe(nx, nz, ny, Math.min(step, 0.95), height);
    if (t === Infinity) return NaN;
    const g = Math.max(t, this.groundUnder(nx, ny, nz));
    if (g < minY || ny - g > drop) return NaN;
    return Math.max(ny, g);
  }
  // the smooth ground height under (x, z), from y downward (null if none within the world)
  terrainBelow(x, y, z) {
    const ph = this.physAt(x, z);
    if (!ph || !ph.C) return null;
    return columnDown(ph.C, ph.x0, ph.z0, x, y, z);
  }
  emitPlant(P, x, y, z, def, h, id) {
    const tile = def.tex[0];
    const base = P.n;
    // stand on the smooth ground rather than the block below (a tall stalk moves as one piece)
    let gy = y, yb = y;
    if (def.tall) while (yb > FLOOR && this.get(x, yb - 1, z) === id) yb--;
    if (TERRAIN[this.get(x, yb - 1, z)]) {
      const r = this.terrainBelow(x + 0.5, yb + 0.9, z + 0.5);
      if (r && !r.ceiling && r.y > yb - 1.3) gy = y + (r.y - 0.04 - yb);
    }
    if (def.plant === 'flat') {
      const yy = gy + 0.03, rot = h > 0.5;
      const cs = [[0, 0], [1, 0], [0, 1], [1, 1]];
      for (const [a, b] of cs) {
        P.pos.push(x + a, yy, z + b); P.nor.push(0, 1, 0); P.uv.push(rot ? b : a, rot ? a : b); P.lay.push(tile); P.col.push(1, 1, 1); P.sway.push(0);
      }
      P.ind.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
      P.n += 4;
      return;
    }
    const tall = !!def.tall;
    const jx = (hash3(x + 7, tall ? 0 : y, z) - 0.5) * (tall ? 0.2 : 0.3), jz = (hash3(x, tall ? 5 : y + 5, z) - 0.5) * (tall ? 0.2 : 0.3);
    const ht = tall ? 1 : 0.75 + h * 0.3;
    const k = 0.9 + h * 0.15;
    const quads = [[[0.15, 0.15], [0.85, 0.85]], [[0.85, 0.15], [0.15, 0.85]]];
    const by = gy;
    for (const [[ax, az], [bx, bz]] of quads) {
      const v = P.n;
      const pts = [[ax, 0, az, 0, 0], [bx, 0, bz, 1, 0], [ax, ht, az, 0, 1], [bx, ht, bz, 1, 1]];
      for (const [px, py, pz, u, vv] of pts) {
        P.pos.push(x + px + jx, by + py, z + pz + jz); P.nor.push(0, 1, 0); P.uv.push(u, vv); P.lay.push(tile);
        const c = (vv ? 1 : 0.7) * k; P.col.push(c, c, c); P.sway.push(vv);
      }
      P.ind.push(v, v + 1, v + 2, v + 2, v + 1, v + 3);
      P.n += 4;
    }
  }
  buildAll() { this.dirty.clear(); for (let k = 0; k < NCX * NCX; k++) this.buildChunk(k); }
  resetMeshes() {
    for (const m of this.meshes.values()) { this.group.remove(m); m.geometry.dispose(); }
    this.meshes.clear(); this.built.fill(0); this.dirty.clear(); this.meshQueue = []; this.meshQX = -999;
  }
  chunkDist(key, x, z) { const cx = (key % NCX) * CS + CS / 2, cz = ((key / NCX) | 0) * CS + CS / 2; return Math.hypot(cx - x, cz - z); }
  // build every missing chunk within r of (x, z) right now
  buildNear(x, z, r) {
    for (let k = 0; k < NCX * NCX; k++) if (!this.built[k] && this.chunkDist(k, x, z) < r + 12) this.buildChunk(k);
  }
  // build a few missing chunks per frame, nearest first
  meshAround(x, z, r, budget, dt) {
    this.meshQT -= dt;
    if (this.meshQT <= 0 || Math.hypot(x - this.meshQX, z - this.meshQZ) > 12) {
      this.meshQT = 0.6; this.meshQX = x; this.meshQZ = z;
      this.meshQueue = [];
      for (let k = 0; k < NCX * NCX; k++) if (!this.built[k]) { const d = this.chunkDist(k, x, z); if (d < r + 16) this.meshQueue.push([d, k]); }
      this.meshQueue.sort((a, b) => b[0] - a[0]);
    }
    let n = 0;
    while (n < budget && this.meshQueue.length) { const [, k] = this.meshQueue.pop(); if (!this.built[k]) { this.buildChunk(k); n++; } }
    return this.meshQueue.length;
  }
  setShadows(on) {
    this.shadows = on;
    for (const m of this.meshes.values()) { m.castShadow = on && !!m.userData.cast; m.receiveShadow = on; }
  }
  processDirty(max = 2) {
    let n = 0;
    for (const k of this.dirty) { this.dirty.delete(k); this.buildChunk(k); if (++n >= max) break; }
  }
  updateVisibility(x, z, far) {
    const r2 = (far + 14) * (far + 14);
    for (const m of this.meshes.values()) {
      const dx = m.userData.cx - x, dz = m.userData.cz - z;
      m.visible = dx * dx + dz * dz < r2;
    }
  }

  // ---------------------------------------------------------------- queries
  // What the player is aiming at: the smooth ground as drawn, or the first other block on the way.
  // A ground hit carries the block to dig (just behind the surface) and the cell to build in (just in front).
  pick(ox, oy, oz, dx, dy, dz, maxD) {
    const vox = this.raycast(ox, oy, oz, dx, dy, dz, maxD, false, true);
    const ter = this.pickTerrain(ox, oy, oz, dx, dy, dz, vox ? vox.t + 0.02 : maxD);
    return ter || vox;
  }
  pickTerrain(ox, oy, oz, dx, dy, dz, maxD) {
    let cx = Math.floor(ox), cz = Math.floor(oz);
    const sx = dx > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
    const tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity, tdz = dz !== 0 ? Math.abs(1 / dz) : Infinity;
    let tmx = dx > 0 ? (cx + 1 - ox) * tdx : dx < 0 ? (ox - cx) * tdx : Infinity;
    let tmz = dz > 0 ? (cz + 1 - oz) * tdz : dz < 0 ? (oz - cz) * tdz : Infinity;
    let t0 = 0;
    const out = { nx: 0, ny: 1, nz: 0 };
    for (let i = 0; i < 96 && t0 <= maxD; i++) {
      const t1 = Math.min(tmx, tmz, maxD);
      const ph = this.physAt(cx + 0.5, cz + 0.5);
      if (ph && ph.C) {
        const t = columnRay(ph.C, ph.x0, ph.z0, cx, cz, ox, oy, oz, dx, dy, dz, t0 - 1e-4, t1 + 1e-4, out);
        if (t >= 0) {
          let { nx, ny, nz } = out;
          if (nx * dx + ny * dy + nz * dz > 0) { nx = -nx; ny = -ny; nz = -nz; }
          const px = ox + dx * t, py = oy + dy * t, pz = oz + dz * t;
          const c = this.terrainCellNear(px - nx * 0.45, py - ny * 0.45, pz - nz * 0.45);
          if (!c) return null;
          const ax = Math.floor(px + nx * 0.55), ay = Math.floor(py + ny * 0.55), az = Math.floor(pz + nz * 0.55);
          return { x: c[0], y: c[1], z: c[2], nx: 0, ny: 0, nz: 0, t, id: this.get(c[0], c[1], c[2]), terrain: true, px, py, pz, snx: nx, sny: ny, snz: nz, place: { x: ax, y: ay, z: az } };
        }
      }
      if (tmx < tmz) { cx += sx; t0 = tmx; tmx += tdx; } else { cz += sz; t0 = tmz; tmz += tdz; }
    }
    return null;
  }
  // the ground block whose centre is nearest a point just under the smooth surface
  terrainCellNear(x, y, z) {
    const fx = Math.floor(x), fy = Math.floor(y), fz = Math.floor(z);
    if (TERRAIN[this.get(fx, fy, fz)] && fy >= FLOOR) return [fx, fy, fz];
    let best = null, bd = 9;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
      const X = fx + a, Y = fy + b, Z = fz + c;
      if (Y < FLOOR || !TERRAIN[this.get(X, Y, Z)]) continue;
      const d = (X + 0.5 - x) ** 2 + (Y + 0.5 - y) ** 2 + (Z + 0.5 - z) ** 2;
      if (d < bd) { bd = d; best = [X, Y, Z]; }
    }
    return best;
  }
  raycast(ox, oy, oz, dx, dy, dz, maxD, solidOnly = false, skipSmooth = false) {
    let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
    const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
    const tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity, tdy = dy !== 0 ? Math.abs(1 / dy) : Infinity, tdz = dz !== 0 ? Math.abs(1 / dz) : Infinity;
    let tmx = dx > 0 ? (x + 1 - ox) * tdx : dx < 0 ? (ox - x) * tdx : Infinity;
    let tmy = dy > 0 ? (y + 1 - oy) * tdy : dy < 0 ? (oy - y) * tdy : Infinity;
    let tmz = dz > 0 ? (z + 1 - oz) * tdz : dz < 0 ? (oz - z) * tdz : Infinity;
    let nx = 0, ny = 0, nz = 0, t = 0;
    for (let i = 0; i < 256; i++) {
      const id = this.get(x, y, z);
      if (PIECE[id]) { const h = this.rayPiece(x, y, z, id, ox, oy, oz, dx, dy, dz); if (h && h.t <= maxD) return h; }
      else if (id !== 0 && (!solidOnly || OPAQUE[id]) && !(skipSmooth && (TERRAIN[id] || LEAFY[id] || id === B.FROND))) return { x, y, z, nx, ny, nz, t, id };
      if (tmx < tmy && tmx < tmz) { x += sx; t = tmx; tmx += tdx; nx = -sx; ny = 0; nz = 0; }
      else if (tmy < tmz) { y += sy; t = tmy; tmy += tdy; nx = 0; ny = -sy; nz = 0; }
      else { z += sz; t = tmz; tmz += tdz; nx = 0; ny = 0; nz = -sz; }
      if (t > maxD) return null;
    }
    return null;
  }

  // a ray against the boxes of the piece in a cell: the nearest hit, with the struck part and face
  rayPiece(x, y, z, id, ox, oy, oz, dx, dy, dz) {
    const list = isCode(id) ? partBoxes(this, x, y, z, id) : pieceBoxes(this, x, y, z, id, []).map((b) => ['all', b]);
    let best = null;
    for (const [part, b] of list) {
      let t0 = 0, t1 = 1e9, ax = -1, sgn = 0;
      const o = [ox, oy, oz], d = [dx, dy, dz];
      let ok = true;
      for (let a = 0; a < 3 && ok; a++) {
        if (Math.abs(d[a]) < 1e-9) { if (o[a] < b[a] || o[a] > b[a + 3]) ok = false; continue; }
        let ta = (b[a] - o[a]) / d[a], tb = (b[a + 3] - o[a]) / d[a], s = -1;
        if (ta > tb) { const q = ta; ta = tb; tb = q; s = 1; }
        if (ta > t0) { t0 = ta; ax = a; sgn = s; }
        if (tb < t1) t1 = tb;
        if (t0 > t1) ok = false;
      }
      if (!ok || ax < 0) continue;
      if (!best || t0 < best.t) {
        const n = [0, 0, 0]; n[ax] = sgn;
        best = { x, y, z, nx: n[0], ny: n[1], nz: n[2], t: t0, id, part, px: ox + dx * t0, py: oy + dy * t0, pz: oz + dz * t0, piece: true };
      }
    }
    return best;
  }
  applyEdits(list) {
    for (const [i, id] of list) { this.data[i] = id; this.edits.set(i, id); }
    this.scanLamps();
  }

  // ---------------------------------------------------------------- 0.3 expansion: new islands, reefs, wrecks
  expand() {
    const rnd = mulberry32(this.seed * 7 + 3);
    const NEW = [
      ['Emberpeak', 'volcano'], ['Parrot’s Rest', 'jungle'], ['Coral Crown', 'atoll'], ['Sixpence Bar', 'sandbar'],
      ['Fiddler’s Reach', 'forest'], ['Gannet Rock', 'rock'], ['Bramble Key', 'jungle'], ['Drowned Bell', 'sandbar'], ['Sunfish Key', 'palm'],
    ];
    const R = { volcano: [23, 4], jungle: [19, 6], atoll: [17, 4], sandbar: [7, 3], forest: [18, 7], rock: [14, 5], palm: [15, 6] };
    const PEAK = { volcano: [19, 4], jungle: [9, 4], atoll: [2, 1], sandbar: [1, 0.6], forest: [8, 5], rock: [13, 6], palm: [3, 2.5] };
    const added = [];
    for (const [name, type] of NEW) {
      for (let tries = 0; tries < 8000; tries++) {
        const r = WS * (R[type][0] + rnd() * R[type][1]);
        const x = 22 * WS + r + rnd() * (LEGACY_W - 44 * WS - 2 * r), z = 22 * WS + r + rnd() * (LEGACY_D - 44 * WS - 2 * r);
        if (tries < 6000 && x < OW + 4 && z < OW + 4) continue;
        if (this.islands.some((o) => Math.hypot(o.x - x, o.z - z) < (o.placementR ?? o.r) + r + 15 * WS)) continue;
        const o = { name, x, z, r, peak: PS * (PEAK[type][0] + rnd() * PEAK[type][1]), type };
        this.islands.push(o); added.push(o);
        break;
      }
    }
    for (const o of added) this.terrainFor(o, this.islands.indexOf(o));
    for (const o of added) this.decorateIsland(o, this.islands.indexOf(o), rnd);
    this.decorateEdge(rnd);
    for (const o of added) this.plantArea(o, rnd);
    this.reefs(rnd);
    this.wrecks(rnd);
    const ruinOn = ['Fiddler’s Reach', 'Bramble Key', 'Gannet Rock', 'Emberpeak', 'Parrot’s Rest', 'Sunfish Key', 'Kettle Rock', 'Marrow Cay'];
    for (const name of ruinOn) { const o = this.islands.find((q) => q.name === name); if (o) this.ruin(o, rnd); }
  }
  // low rolling hills across the inland of the big islands, so they aren't one smooth dome
  hills(x, z, t) {
    const n = this.nHill || (this.nHill = makeNoise2(this.seed + 59));
    return 2.6 * smooth(0.25, 0.7, t) * (fbm(n, x * 0.03, z * 0.03, 3) - 0.35);
  }
  shape(o, i, x, z) {
    const dx = x + 0.5 - o.x, dz = z + 0.5 - o.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > o.r * 5) return null;
    const warp = 0.74 + 0.5 * fbm(this.nWarp, x * 0.04 * NF + i * 17.3, z * 0.04 * NF - i * 9.1, 3);
    const t = 1 - dist / (o.r * warp);
    if (t < SHELF_OUTER) return null;
    const hn = fbm(this.nH, x * 0.07 * NF + i * 5.7, z * 0.07 * NF + i * 2.9, 4);
    let h = shelfHeight(t) + (o.type === 'atoll' || o.type === 'sandbar' || o.type === 'cove' ? 0 : this.hills(x, z, t));
    const inland = smooth(0.18, 1.0, t);
    if (o.type === 'volcano') {
      h += o.peak * Math.pow(smooth(0.04, 1, t), 1.45) * (0.9 + 0.22 * hn);
      if (t > 0.8) h -= (t - 0.8) * o.peak * 1.9;
    } else if (o.type === 'atoll') {
      const rho = dist / (o.r * warp);
      const gap = hn < 0.33 ? 2.2 : 0;
      if (rho < 0.55) h = SEA - 3.2 - (0.55 - rho) * 2 - hn * 0.6;
      else if (rho < 0.98) { const ring = 1 - Math.abs(rho - 0.76) / 0.22; h = SEA - 3 + 5.6 * smooth(0, 0.55, ring) + 1.2 * hn * ring - gap * ring; }
      else h = Math.min(SEA - 3, shelfHeight(t));
    } else if (o.type === 'cove') {
      // a horseshoe of cliffs round a lagoon, open to the sea on one side
      const rho = dist / (o.r * warp), ang = Math.atan2(dz, dx);
      const gap = Math.abs(wrapA(ang - o.mouth)) < 0.42 + 0.1 * hn;
      if (rho < 0.46) h = SEA - 2.6 - (0.46 - rho) * 3 - hn * 0.5;
      else if (rho < 1.02) {
        const ring = 1 - Math.abs(rho - 0.74) / 0.28;
        h = SEA - 3 + (o.peak + 3) * smooth(0, 0.62, ring) * (0.78 + 0.34 * hn);
        if (gap) h = Math.min(h, SEA - 2.4 - ring);
      } else h = Math.min(SEA - 3, shelfHeight(t));
    } else if (o.type === 'fort') {
      // a flat-topped rock with cliffs: room for the old fort on top
      h += o.peak * smooth(0.22, 0.48, t) * (0.92 + 0.12 * hn);
    } else if (o.type === 'twin') {
      // two small hills joined by a sandbar
      const ax = Math.cos(o.axis), az = Math.sin(o.axis), along = dx * ax + dz * az, across = -dx * az + dz * ax;
      const hill = (c) => { const d2 = Math.hypot(along - c * o.r * 0.48, across) / (o.r * 0.5 * warp); return 1 - d2; };
      const tt = Math.max(hill(1), hill(-1));
      const bar = Math.abs(along) < o.r * 0.5 && Math.abs(across) < 2.4 + hn * 1.5 ? 1 : 0;
      h = shelfHeight(t) + o.peak * smooth(0.18, 1, tt) * (0.5 + 0.7 * hn);
      if (bar && h < SEA + 0.6) h = Math.max(h, SEA + 0.4 + hn * 0.4);
    } else if (o.type === 'sandbar') h += o.peak * inland;
    else if (o.type === 'rock') h += o.peak * Math.pow(inland, 0.6) * (0.45 + 0.85 * hn);
    else h += o.peak * inland * (0.5 + 0.7 * hn);
    return { h, t };
  }
  terrainFor(o, i) {
    const r = Math.ceil(o.r * 5);
    for (let z = Math.max(0, Math.floor(o.z) - r); z < Math.min(D, Math.floor(o.z) + r); z++) for (let x = Math.max(0, Math.floor(o.x) - r); x < Math.min(W, Math.floor(o.x) + r); x++) {
      const sh = this.shape(o, i, x, z);
      if (!sh) continue;
      const s = Math.min(H - 8, Math.floor(sh.h));
      const ci = x + z * W;
      if (s <= this.surf[ci]) continue;
      if (this.islandOf[ci] >= 0 && this.islandOf[ci] !== i && (this.surf[ci] > SEA - 2 || (o.late && !o.extended))) continue;
      const dn = this.nD(x * 0.15, z * 0.15);
      let top = B.SAND, sub = B.SAND, deep = B.STONE;
      if (o.type === 'volcano') {
        deep = B.BASALT; sub = B.BASALT;
        const ang = Math.atan2(z + 0.5 - o.z, x + 0.5 - o.x);
        const flow = Math.abs(((ang - (o.flow ?? (o.flow = i * 1.7)) + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.07 + 0.04 * Math.sin(sh.t * 20);
        if (s <= SEA + 1) { top = B.ASH; sub = B.ASH; }
        else if (sh.t > 0.86) { top = B.MAGMA; sub = B.MAGMA; }
        else if (flow && sh.t > 0.22) top = B.MAGMA;
        else if (s > SEA + o.peak * 0.7) top = dn > 0.5 ? B.OBSIDIAN : B.BASALT;
        else if (dn > 0.62 && s < SEA + o.peak * 0.4) { top = B.GRASS; sub = B.DIRT; }
        else top = B.BASALT;
      } else if (s <= SEA + 1) { top = B.SAND; sub = B.SAND; }
      else if (o.type === 'jungle' || o.type === 'forest') { if (s > SEA + 2) { top = B.GRASS; sub = B.DIRT; } }
      else if (o.type === 'palm') { if (s > SEA + 3) { top = B.GRASS; sub = B.DIRT; } }
      else if (o.type === 'rock') { if (s > SEA + 7 || dn < 0.42) { top = B.STONE; sub = B.STONE; } else { top = B.GRASS; sub = B.DIRT; } }
      else if (o.type === 'cove' || o.type === 'fort') { if (s > SEA + 2 && (dn > 0.36 || s > SEA + 9)) { top = B.GRASS; sub = B.DIRT; } else if (s > SEA + 2) { top = B.STONE; sub = B.STONE; } }
      else if (o.type === 'twin') { if (s > SEA + 3) { top = B.GRASS; sub = B.DIRT; } }
      for (let y = FLOOR; y < H; y++) {
        const depth = s - 1 - y;
        const id = y >= s ? B.AIR : depth === 0 ? top : depth <= 3 ? sub : deep;
        this.data[x + W * (z + D * y)] = id;
      }
      this.surf[ci] = s;
      this.islandOf[ci] = i;
      if (o.type === 'volcano' && sh.t > 0.95 && !this.sites.volcano) this.sites.volcano = { x: x + 0.5, y: s, z: z + 0.5, island: i };
    }
    if (o.type === 'volcano' && !this.sites.volcano) this.sites.volcano = { x: o.x, y: this.topSolid(Math.floor(o.x), Math.floor(o.z)) + 1, z: o.z, island: i };
  }
  decorateIsland(o, i, rnd) {
    const trees = [];
    const near = (x, z, r) => trees.some((q) => Math.abs(q.x - x) <= r && Math.abs(q.z - z) <= r);
    const R = Math.ceil(o.r * 1.8);
    let palms = 0;
    for (let z = Math.max(4, Math.floor(o.z) - R); z < Math.min(D - 4, Math.floor(o.z) + R); z++) for (let x = Math.max(4, Math.floor(o.x) - R); x < Math.min(W - 4, Math.floor(o.x) + R); x++) {
      if (this.islandOf[x + z * W] !== i) continue;
      const s = this.surf[x + z * W];
      if (s <= SEA || this.get(x, s, z) !== B.AIR || this.isReserved(x, z, 3)) continue;
      const top = this.get(x, s - 1, z);
      const r = rnd();
      switch (o.type) {
        case 'volcano':
          if (top === B.GRASS && r < 0.03 && !near(x, z, 3)) { this.deadTree(x, s, z, rnd); trees.push({ x, z }); }
          else if ((top === B.BASALT || top === B.ASH) && r < 0.012) this.boulder(x, s, z, rnd, B.BASALT);
          else if (top === B.OBSIDIAN && r < 0.02) this.spire(x, s, z, rnd, B.OBSIDIAN);
          break;
        case 'jungle':
          if (top === B.GRASS && r < 0.011 && !near(x, z, 5)) { this.mahogany(x, s, z, rnd); trees.push({ x, z }, { x: x + 1, z: z + 1 }); }
          else if (top === B.GRASS && r < 0.05 && !near(x, z, 3)) { this.jungleTree(x, s, z, rnd); trees.push({ x, z }); }
          else if (top === B.GRASS && r < 0.07 && !near(x, z, 1)) this.bamboo(x, s, z, rnd);
          else if (top === B.SAND && r < 0.03 && !near(x, z, 3)) { this.palm(x, s, z, rnd); trees.push({ x, z }); }
          break;
        case 'atoll':
          if (top === B.SAND && s >= SEA + 1 && r < 0.06 && !near(x, z, 3)) { this.palm(x, s, z, rnd); trees.push({ x, z }); }
          break;
        case 'sandbar':
          if (top === B.SAND && palms < 1 && r < 0.03) { this.palm(x, s, z, rnd); trees.push({ x, z }); palms++; }
          else if (r < 0.006) this.raw(x, s, z, r < 0.003 ? B.BARREL : B.CRATE);
          break;
        case 'forest':
          if (top === B.GRASS && r < 0.05 && !near(x, z, 3)) { this.oak(x, s, z, rnd); trees.push({ x, z }); }
          else if (top === B.SAND && r < 0.01 && !near(x, z, 3)) { this.palm(x, s, z, rnd); trees.push({ x, z }); }
          break;
        case 'cove':
          if (top === B.SAND && s <= SEA + 3 && r < 0.05 && !near(x, z, 3)) { this.palm(x, s, z, rnd); trees.push({ x, z }); }
          else if (top === B.GRASS && r < 0.03 && !near(x, z, 3)) { this.oak(x, s, z, rnd); trees.push({ x, z }); }
          break;
        case 'fort':
          if (top === B.GRASS && r < 0.012 && !near(x, z, 4)) { this.oak(x, s, z, rnd); trees.push({ x, z }); }
          else if (r < 0.008) this.boulder(x, s, z, rnd, B.STONE);
          break;
        case 'twin':
          if ((top === B.SAND || top === B.GRASS) && r < 0.045 && !near(x, z, 3)) { this.palm(x, s, z, rnd); trees.push({ x, z }); }
          break;
        case 'rock':
          if (top === B.GRASS && r < 0.025 && !near(x, z, 3)) { this.oak(x, s, z, rnd); trees.push({ x, z }); }
          else if (r < 0.012) this.boulder(x, s, z, rnd, B.STONE);
          break;
        default:
          if (top === B.SAND && s <= SEA + 5 && r < 0.035 && !near(x, z, 3)) { this.palm(x, s, z, rnd); trees.push({ x, z }); }
          else if (top === B.GRASS && r < 0.03 && !near(x, z, 3)) { this.palm(x, s, z, rnd); trees.push({ x, z }); }
      }
      if (top === B.SAND && s <= SEA + 2 && r > 0.995 && o.type !== 'sandbar') this.driftwood(x, s, z, rnd);
    }
  }
  // old islands whose land spills past the edge of the 0.2 map get the usual trees and plants there
  decorateEdge(rnd) {
    for (let z = 4; z < D - 4; z++) for (let x = 4; x < W - 4; x++) {
      if (x < OW - 4 && z < OW - 4) continue;
      const i = this.islandOf[x + z * W];
      if (i < 0 || i >= this.legacyCount) continue;
      const s = this.surf[x + z * W];
      if (s <= SEA || this.get(x, s, z) !== B.AIR || this.get(x, s - 1, z) === B.AIR) continue;
      const type = this.islands[i].type, top = this.get(x, s - 1, z), r = rnd();
      if (type === 'forest' && top === B.GRASS && r < 0.04) this.oak(x, s, z, rnd);
      else if (top === B.SAND && s <= SEA + 5 && r < (type === 'palm' ? 0.03 : 0.008)) this.palm(x, s, z, rnd);
      else if (type === 'rock' && r < 0.01) this.boulder(x, s, z, rnd, B.STONE);
    }
    for (let z = 2; z < D - 2; z++) for (let x = 2; x < W - 2; x++) {
      if (x < OW - 2 && z < OW - 2) continue;
      const i = this.islandOf[x + z * W];
      if (i >= 0 && i < this.legacyCount) this.plantAt(x, z, rnd);
    }
  }
  plantArea(o, rnd) {
    const i = this.islands.indexOf(o), R = Math.ceil(o.r * 1.8);
    for (let z = Math.max(2, Math.floor(o.z) - R); z < Math.min(D - 2, Math.floor(o.z) + R); z++) for (let x = Math.max(2, Math.floor(o.x) - R); x < Math.min(W - 2, Math.floor(o.x) + R); x++) {
      if (this.islandOf[x + z * W] === i) this.plantAt(x, z, rnd);
    }
  }
  deadTree(x, s, z, rnd) {
    const h = 3 + Math.floor(rnd() * 3);
    for (let y = s; y < s + h; y++) this.raw(x, y, z, B.LOG);
    const [ax, az] = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(rnd() * 4)];
    this.rawIfAir(x + ax, s + h - 1, z + az, B.LOG);
  }
  mahogany(x, s, z, rnd) {
    const h = 9 + Math.floor(rnd() * 4);
    for (let y = s; y < s + h; y++) for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) this.raw(x + dx, y, z + dz, B.JLOG);
    for (const [dx, dz] of [[-1, 0], [2, 1], [0, -1], [1, 2]]) if (rnd() < 0.7) this.rawIfAir(x + dx, s, z + dz, B.JLOG);
    const top = s + h;
    for (let dy = -3; dy <= 1; dy++) {
      const rad = dy === 1 ? 2.4 : dy === -3 ? 3.4 : 4.7 - Math.abs(dy + 1) * 0.55;
      for (let dx = -5; dx <= 6; dx++) for (let dz = -5; dz <= 6; dz++) {
        if (Math.hypot(dx - 0.5, dz - 0.5) > rad || rnd() < 0.07) continue;
        this.rawIfAir(x + dx, top + dy, z + dz, B.JLEAVES);
      }
    }
    for (let k = 0; k < 12; k++) {
      const vx = x + Math.round((rnd() - 0.5) * 8), vz = z + Math.round((rnd() - 0.5) * 8);
      if (this.get(vx, top - 3, vz) !== B.JLEAVES) continue;
      const len = 2 + Math.floor(rnd() * 5);
      for (let i = 0, y = top - 4; i < len && this.get(vx, y, vz) === B.AIR && y > s; i++, y--) this.raw(vx, y, vz, B.VINE);
    }
  }
  jungleTree(x, s, z, rnd) {
    const h = 5 + Math.floor(rnd() * 3);
    for (let y = s; y < s + h; y++) this.raw(x, y, z, B.JLOG);
    const top = s + h;
    for (let dy = -2; dy <= 1; dy++) {
      const rad = dy === 1 ? 1.2 : 2.6;
      for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) if (Math.hypot(dx, dz) <= rad && rnd() > 0.08) this.rawIfAir(x + dx, top + dy, z + dz, B.JLEAVES);
    }
    for (let k = 0; k < 3; k++) {
      const vx = x + Math.round((rnd() - 0.5) * 4), vz = z + Math.round((rnd() - 0.5) * 4);
      if (this.get(vx, top - 2, vz) !== B.JLEAVES) continue;
      for (let i = 0, y = top - 3; i < 3 && this.get(vx, y, vz) === B.AIR && y > s; i++, y--) this.raw(vx, y, vz, B.VINE);
    }
  }
  bamboo(x, s, z, rnd) {
    const n = 3 + Math.floor(rnd() * 4);
    for (let k = 0; k < n; k++) {
      const bx = x + Math.round((rnd() - 0.5) * 3), bz = z + Math.round((rnd() - 0.5) * 3);
      const g = this.topSolid(bx, bz) + 1;
      if (Math.abs(g - s) > 1 || this.get(bx, g - 1, bz) !== B.GRASS) continue;
      const h = 3 + Math.floor(rnd() * 5);
      for (let y = g; y < g + h && this.get(bx, y, bz) === B.AIR; y++) this.raw(bx, y, bz, B.BAMBOO);
    }
  }
  driftwood(x, s, z, rnd) {
    const along = rnd() < 0.5;
    const n = 2 + Math.floor(rnd() * 2);
    for (let k = 0; k < n; k++) { const xx = along ? x + k : x, zz = along ? z : z + k; if (this.get(xx, s, zz) === B.AIR && this.solid(xx, s - 1, zz)) this.raw(xx, s, zz, B.LOG); }
  }
  // corals, sea grass and the odd coral head on shallow sea floors around every island
  reefs(rnd) {
    const atollOf = new Set(this.islands.map((o, i) => (o.type === 'atoll' ? i : -1)).filter((i) => i >= 0));
    for (let z = 2; z < D - 2; z++) for (let x = 2; x < W - 2; x++) {
      const ci = x + z * W, i = this.islandOf[ci];
      if (i < 0) continue;
      const ty = this.topSolid(x, z);
      if (ty < SEA - 8 || ty > SEA - 3) continue;
      const y = ty + 1;
      if (this.get(x, y, z) !== B.AIR) continue;
      const top = this.get(x, ty, z);
      if (top !== B.SAND && top !== B.STONE) continue;
      if (this.isReserved(x, z, 2)) continue;
      const rich = atollOf.has(i) ? 3 : 1;
      const r = rnd();
      if (r < 0.006 * rich) {
        this.raw(x, y, z, rnd() < 0.5 ? B.CORAL_A : B.CORAL_B);
        if (y + 1 <= SEA - 2 && rnd() < 0.7) this.raw(x, y + 1, z, [B.CORAL_P, B.CORAL_O, B.CORAL_V][Math.floor(rnd() * 3)]);
      } else if (r < 0.03 * rich) this.raw(x, y, z, [B.CORAL_P, B.CORAL_O, B.CORAL_V][Math.floor(rnd() * 3)]);
      else if (r < 0.03 * rich + 0.05) this.raw(x, y, z, B.SEAGRASS);
    }
  }
  wrecks(rnd) {
    const homes = ['Sixpence Bar', 'Drowned Bell', 'Widow’s Shoal', 'Gullwreck Key', 'Coral Crown'];
    for (const name of homes) {
      const o = this.islands.find((q) => q.name === name);
      if (!o) continue;
      for (let tries = 0; tries < 600; tries++) {
        const a = rnd() * Math.PI * 2, d = o.r * (0.9 + rnd() * 0.9) + (o.r < 12 ? 4 + rnd() * 6 : 0);
        const x = Math.round(o.x + Math.cos(a) * d), z = Math.round(o.z + Math.sin(a) * d);
        if (x < 16 || z < 16 || x > W - 16 || z > D - 16) continue;
        const h = rnd() * Math.PI * 2;
        if (!this.wreckFits(x, z, h, tries < 450 ? SEA - 6 : SEA - 9)) continue;
        this.buildWreck(x, z, h, rnd, o);
        break;
      }
    }
  }
  wreckFits(x, z, h, lo) {
    const c = Math.cos(h), s = Math.sin(h);
    for (let u = -7; u <= 7; u += 2) for (let v = -3; v <= 3; v += 2) {
      const xx = Math.round(x + u * c - v * s), zz = Math.round(z + u * s + v * c);
      const t = this.surf[xx + zz * W];
      if (t > SEA - 1 || t < lo || this.isReserved(xx, zz, 4)) return false;
    }
    return true;
  }
  buildWreck(x, z, h, rnd, o) {
    const c = Math.cos(h), s = Math.sin(h);
    const at = (u, v) => [Math.round(x + u * c - v * s), Math.round(z + u * s + v * c)];
    let floor = 99;
    for (let u = -6; u <= 6; u++) { const [xx, zz] = at(u, 0); floor = Math.min(floor, this.topSolid(xx, zz) + 1); }
    for (let u = -6; u <= 6; u++) {
      const hw = u > 3 ? Math.max(0, 3 - (u - 3)) : u < -5 ? 2 : 3;
      const lift = u > 1 ? Math.floor((u - 1) * 0.9) : 0;
      const broken = u >= -1 && u <= 0;
      for (let v = -hw; v <= hw; v++) {
        const [xx, zz] = at(u, v);
        const base = floor + lift;
        if (!broken || rnd() < 0.35) this.raw(xx, base, zz, B.WRECKWOOD);
        if (Math.abs(v) === hw) {
          const top = broken ? 1 : 2 + (u > 3 ? 1 : 0);
          for (let y = base + 1; y <= base + top; y++) if (rnd() < (broken ? 0.4 : 0.88)) this.raw(xx, y, zz, B.WRECKWOOD);
        }
      }
    }
    // a snapped mast leaning over the side, with a scrap of sail
    const [mx, mz] = at(-1, 0);
    const mastH = Math.max(7, SEA + 3 - floor);
    for (let k = 0; k < mastH; k++) { const [lx, lz] = at(-1 + Math.round(k * 0.15), Math.round(k * 0.4)); this.raw(lx, floor + 1 + k, lz, B.LOG); }
    const [sx, sz] = at(-1, Math.round(mastH * 0.4) - 1);
    for (let y = floor + mastH - 3; y < floor + mastH; y++) if (rnd() < 0.85) this.rawIfAir(sx, y, sz, B.CLOTH);
    void mx; void mz;
    // the captain's strongbox in the stern, with barrels and crates about
    const [cx, cz] = at(-4, 0);
    this.raw(cx, floor + 1, cz, B.CHEST);
    for (const [u, v] of [[-3, 1], [-3, -1], [2, 1], [4, -1], [-5, 1]]) { const [bx, bz] = at(u, v); if (rnd() < 0.8) { const by = floor + 1 + (u > 1 ? Math.floor((u - 1) * 0.9) : 0); let id = rnd() < 0.5 ? B.BARREL : B.CRATE; if (id === B.BARREL && hash3(bx, by, bz) < 0.4) id = B.KEG; this.rawIfAir(bx, by, bz, id); } }
    this.sites.wrecks.push({ x: cx, y: floor + 1, z: cz, island: this.islands.indexOf(o), h });
    this.sites.loot.push({ x: cx, y: floor + 1, z: cz, kind: 'wreck' });
  }
  // 0.5: six more islands in the open water between the old ones. They use their own dice, so every
  // island, wreck and reef from before stays exactly where it was.
  moreIslands() {
    const rnd = mulberry32(this.seed * 13 + 11);
    const NEW = [['Smuggler’s Hollow', 'cove', 15, 2, 8, 3], ['Fort Brackwater', 'fort', 14, 2, 7, 2], ['Mango Key', 'jungle', 13, 3, 8, 3],
      ['Tern Shoals', 'twin', 12, 2, 4, 2], ['Cutlass Point', 'rock', 10, 2, 11, 3]];
    const added = [];
    const clear = (x, z, r) => {
      if (this.islands.some((o) => Math.hypot(o.x - x, o.z - z) < ((o.placementR ?? o.r) + r) * 1.2 + 18 * WS)) return false;
      for (const w of this.sites.wrecks) if (Math.hypot(w.x - x, w.z - z) < r * 1.9 + 8 * WS) return false;
      for (let k = 0; k < 32; k++) {
        const a = (k / 32) * Math.PI * 2, d = r * (k % 2 ? 0.6 : 1.15);
        const px = Math.floor(x + Math.cos(a) * d), pz = Math.floor(z + Math.sin(a) * d);
        if (px < 2 || pz < 2 || px >= W - 2 || pz >= D - 2 || this.surf[px + pz * W] > SEA - 4) return false;
      }
      return true;
    };
    for (const [name, type, r0, rr, p0, pr] of NEW) {
      for (let tries = 0; tries < 6000; tries++) {
        const r = WS * (r0 + rnd() * rr);
        const x = 24 + r * 1.8 + rnd() * (LEGACY_W - 48 - 3.6 * r), z = 24 + r * 1.8 + rnd() * (LEGACY_D - 48 - 3.6 * r);
        if (!clear(x, z, r)) continue;
        const o = { name, x, z, r, peak: PS * (p0 + rnd() * pr), type, late: true };
        if (type === 'cove') o.mouth = rnd() * Math.PI * 2;
        if (type === 'twin') o.axis = rnd() * Math.PI;
        this.islands.push(o); added.push(o);
        break;
      }
    }
    for (const o of added) this.terrainFor(o, this.islands.indexOf(o));
    for (const o of added) {
      if (o.type === 'fort') this.sites.fort = this.fort(o, rnd);
      if (o.type === 'cove') this.smugglersCave(o, rnd);
    }
    for (const o of added) this.decorateIsland(o, this.islands.indexOf(o), rnd);
    for (const o of added) this.plantArea(o, rnd);
  }
  frontierIslands() {
    const rnd = mulberry32(this.seed * 29 + 17);
    const NEW = [
      ['Bellwether Key', 'rock', 12, 4, 8, 3], ['Crow’s Nest Cay', 'palm', 14, 5, 4, 3],
      ['Glassfin Isle', 'atoll', 14, 4, 2, 1], ['Rookery Reach', 'jungle', 15, 5, 9, 4],
      ['Widowmaker Rock', 'rock', 11, 5, 14, 5], ['Moonwake Key', 'forest', 16, 5, 7, 4],
      ['The Far Lantern', 'palm', 13, 4, 5, 3], ['Cinderhook', 'volcano', 16, 5, 17, 5],
      ['Blueglass Shoals', 'twin', 12, 4, 4, 2], ['Saltwind Bar', 'sandbar', 9, 4, 2, 1],
      ['Whalebone Cay', 'rock', 14, 5, 12, 4], ['Greenwake Isle', 'jungle', 15, 5, 8, 4],
      ['The Quiet Crown', 'atoll', 16, 5, 2, 1], ['Stormwatch Key', 'forest', 15, 5, 9, 4],
      ['Black Gull Rock', 'rock', 11, 4, 13, 5], ['Turtleback Isle', 'palm', 16, 5, 4, 3],
      ['Lost Mast Cay', 'sandbar', 9, 4, 2, 1], ['Farrier’s Rest', 'forest', 15, 5, 8, 4],
      ['Redwake Isle', 'jungle', 14, 5, 9, 4], ['The Outer Bell', 'cove', 15, 5, 10, 4],
      ['Glimmer Key', 'atoll', 13, 4, 2, 1], ['Northstar Rock', 'rock', 12, 5, 14, 5],
      ['Last Sail Cay', 'palm', 15, 5, 5, 3],
    ];
    const added = [];
    const clear = (x, z, r) => {
      if (this.islands.some((o) => Math.hypot(o.x - x, o.z - z) < ((o.placementR ?? o.r) + r) * 1.2 + 18 * WS)) return false;
      for (const w of this.sites.wrecks) if (Math.hypot(w.x - x, w.z - z) < r * 1.9 + 8 * WS) return false;
      for (let k = 0; k < 32; k++) {
        const a = (k / 32) * Math.PI * 2, d = r * (k % 2 ? 0.6 : 1.15);
        const px = Math.floor(x + Math.cos(a) * d), pz = Math.floor(z + Math.sin(a) * d);
        if (px < 2 || pz < 2 || px >= W - 2 || pz >= D - 2 || this.surf[px + pz * W] > SEA - 4) return false;
      }
      return true;
    };
    for (const [name, type, r0, rr, p0, pr] of NEW) {
      for (let tries = 0; tries < 6000; tries++) {
        const r = WS * (r0 + rnd() * rr);
        const x = 24 + r * 1.8 + rnd() * (PREVIOUS_MAP_W - 48 - 3.6 * r), z = 24 + r * 1.8 + rnd() * (PREVIOUS_MAP_W - 48 - 3.6 * r);
        if (!clear(x, z, r)) continue;
        const o = { name, x, z, r, peak: PS * (p0 + rnd() * pr), type, late: true, frontier: true };
        if (type === 'cove') o.mouth = rnd() * Math.PI * 2;
        if (type === 'twin') o.axis = rnd() * Math.PI;
        this.islands.push(o); added.push(o);
        break;
      }
    }
    for (const o of added) this.terrainFor(o, this.islands.indexOf(o));
    for (const o of added) {
      if (o.r >= 42 && !['volcano', 'atoll', 'sandbar', 'twin'].includes(o.type)) this.buildVillage(o, o.r >= 48 ? 'village' : 'hamlet');
    }
    for (const o of added) this.decorateIsland(o, this.islands.indexOf(o), rnd);
    for (const o of added) this.plantArea(o, rnd);
  }
  extendedIslands() {
    const rnd = mulberry32(this.seed * 41 + 23);
    const NEW = [
      ['Mariner’s Rest', 'forest', 17, 7, 8, 4], ['Copperleaf Haven', 'jungle', 17, 7, 9, 4],
      ['Sable Harbor', 'palm', 16, 7, 5, 3], ['Kingsport Isle', 'forest', 18, 7, 10, 4],
      ['Morrow’s Green', 'jungle', 17, 7, 8, 4], ['Lanternfall', 'cove', 16, 7, 9, 4],
      ['Crown Harbor', 'palm', 18, 7, 6, 3], ['Stonewake Isle', 'rock', 18, 7, 13, 5],
    ];
    const added = [];
    const clear = (x, z, r) => {
      if (this.islands.some((o) => Math.hypot(o.x - x, o.z - z) < (o.r + r) * 1.2 + 18 * WS)) return false;
      for (const w of this.sites.wrecks) if (Math.hypot(w.x - x, w.z - z) < r * 1.9 + 8 * WS) return false;
      for (let k = 0; k < 32; k++) {
        const a = (k / 32) * Math.PI * 2, d = r * (k % 2 ? 0.6 : 1.15);
        const px = Math.floor(x + Math.cos(a) * d), pz = Math.floor(z + Math.sin(a) * d);
        if (px < 2 || pz < 2 || px >= W - 2 || pz >= D - 2 || this.surf[px + pz * W] > SEA - 4) return false;
      }
      return true;
    };
    for (const [name, type, r0, rr, p0, pr] of NEW) {
      for (let tries = 0; tries < 6000; tries++) {
        const r = WS * (r0 + rnd() * rr);
        const x = 24 + r * 1.8 + rnd() * (W - 48 - 3.6 * r), z = 24 + r * 1.8 + rnd() * (D - 48 - 3.6 * r);
        if (!clear(x, z, r)) continue;
        const o = { name, x, z, r, peak: PS * (p0 + rnd() * pr), type, late: true, extended: true };
        this.islands.push(o); added.push(o);
        break;
      }
    }
    for (const o of added) this.terrainFor(o, this.islands.indexOf(o));
    for (let i = 0; i < added.length; i++) this.buildVillage(added[i], i < 3 ? 'major' : 'village');
    for (const o of added) this.decorateIsland(o, this.islands.indexOf(o), rnd);
    for (const o of added) this.plantArea(o, rnd);
  }
  // the old fort on Fort Brackwater: crumbling walls, four towers, a keep with the garrison's pay chest
  fort(o, rnd) {
    const i = this.islands.indexOf(o), cx = Math.floor(o.x), cz = Math.floor(o.z);
    let g = 0, n = 0;
    for (let dx = -7; dx <= 7; dx++) for (let dz = -7; dz <= 7; dz++) { g += this.surf[(cx + dx) + (cz + dz) * W]; n++; }
    g = Math.max(SEA + 3, Math.round(g / n));
    const brick = () => (rnd() < 0.55 ? B.MOSSBRICK : rnd() < 0.7 ? B.BRICK : B.WHITEBRICK);
    // level the ground inside and just outside the walls
    for (let dx = -9; dx <= 9; dx++) for (let dz = -9; dz <= 9; dz++) {
      const x = cx + dx, z = cz + dz;
      for (let y = g; y < g + 9; y++) { const id = this.get(x, y, z); if (id && id !== B.LOG) this.raw(x, y, z, B.AIR); }
      for (let y = FLOOR; y < g; y++) if (!this.solid(x, y, z)) this.raw(x, y, z, y === g - 1 ? (Math.abs(dx) <= 6 && Math.abs(dz) <= 6 ? B.STONE : B.GRASS) : B.DIRT);
      this.surf[x + z * W] = Math.max(this.surf[x + z * W], g);
      this.islandOf[x + z * W] = i;
    }
    // curtain walls with breaches
    for (let k = -6; k <= 6; k++) for (const [x, z] of [[cx + k, cz - 6], [cx + k, cz + 6], [cx - 6, cz + k], [cx + 6, cz + k]]) {
      const breach = (Math.abs(k) <= 1 && (x === cx || z === cz)) || rnd() < 0.12;
      const h = breach ? (rnd() < 0.5 ? 0 : 1) : 3 + ((rnd() * 2) | 0);
      for (let y = g; y < g + h; y++) this.raw(x, y, z, brick());
    }
    // corner towers
    for (const [tx, tz] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) {
      const h = 5 + ((rnd() * 3) | 0);
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (let y = g; y < g + h; y++) {
        if (Math.abs(dx) + Math.abs(dz) === 0 && y < g + h - 1) continue;
        if (y === g + h - 1 && (dx + dz) % 2 && rnd() < 0.5) continue;
        this.raw(cx + tx + dx, y, cz + tz + dz, brick());
      }
    }
    // the keep: four walls, a doorway, the chest inside, powder kegs by the walls
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      if (Math.abs(dx) < 2 && Math.abs(dz) < 2) continue;
      if (dz === 2 && dx === 0) continue;
      for (let y = g; y < g + 3; y++) this.raw(cx + dx, y, cz + dz, brick());
    }
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) if (rnd() < 0.7) this.raw(cx + dx, g + 3, cz + dz, B.PLANK);
    this.raw(cx, g, cz - 1, B.CHEST);
    this.raw(cx - 1, g, cz - 1, B.BARREL); this.raw(cx + 1, g, cz, B.CRATE);
    for (const [kx, kz] of [[-5, -3], [5, 2], [-4, 5], [3, -5]]) this.raw(cx + kx, g, cz + kz, B.KEG);
    this.raw(cx - 3, g, cz + 3, B.LAMP);
    this.sites.loot.push({ x: cx, y: g, z: cz - 1, kind: 'fort' });
    this.reserved.push({ x0: cx - 10, x1: cx + 10, z0: cz - 10, z1: cz + 10 });
    return { island: i, x: cx + 0.5, z: cz + 3.5, y: g, fire: { x: cx - 2.5, y: g, z: cz + 3.5 } };
  }
  // a smugglers' cave dug into the cove's cliffs, reached from the lagoon
  smugglersCave(o, rnd) {
    const i = this.islands.indexOf(o);
    for (let tries = 0; tries < 400; tries++) {
      const a = o.mouth + Math.PI + (rnd() - 0.5) * 2.2, d = o.r * (0.5 + rnd() * 0.14);
      const x = Math.floor(o.x + Math.cos(a) * d), z = Math.floor(o.z + Math.sin(a) * d);
      if (this.islandOf[x + z * W] !== i) continue;
      const ux = Math.cos(a), uz = Math.sin(a);
      // the cave mouth sits just above the lagoon, with rock at least four blocks above it all the way in
      const y0 = SEA + 1;
      let ok = true;
      for (let k = 1; k <= 6 && ok; k++) if (this.surf[Math.floor(x + ux * k) + Math.floor(z + uz * k) * W] < y0 + 4) ok = false;
      if (!ok) continue;
      for (let k = -1; k <= 4; k++) for (let w = -1; w <= 1; w++) for (let y = y0; y < y0 + 2 + (k > 2 ? 1 : 0); y++) {
        const px = Math.floor(x + ux * k - uz * w), pz = Math.floor(z + uz * k + ux * w);
        this.raw(px, y, pz, B.AIR);
      }
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let y = y0; y < y0 + 3; y++) this.raw(Math.floor(x + ux * 5) + dx, y, Math.floor(z + uz * 5) + dz, B.AIR);
      const cxp = Math.floor(x + ux * 6), czp = Math.floor(z + uz * 6);
      this.raw(cxp, y0, czp, B.CHEST);
      this.raw(cxp + 1, y0, czp, B.KEG); this.raw(cxp - 1, y0, czp + 1, B.BARREL); this.raw(cxp, y0, czp - 1, B.CRATE);
      this.raw(Math.floor(x + ux * 4), y0, Math.floor(z + uz * 4) + 1, B.LAMP);
      // a little jetty out into the lagoon
      for (let k = 1; k <= 4; k++) for (const w of [0, 1]) { const px = Math.floor(x - ux * k - uz * w), pz = Math.floor(z - uz * k + ux * w); if (!this.solid(px, SEA, pz)) this.raw(px, SEA, pz, B.PLANK); }
      this.sites.loot.push({ x: cxp, y: y0, z: czp, kind: 'cove' });
      this.reserved.push({ x0: cxp - 4, x1: cxp + 4, z0: czp - 4, z1: czp + 4 });
      return;
    }
  }
  ruin(o, rnd) {
    const i = this.islands.indexOf(o);
    for (let tries = 0; tries < 300; tries++) {
      const a = rnd() * Math.PI * 2, rr = rnd() * o.r * 0.65;
      const x = Math.floor(o.x + Math.cos(a) * rr), z = Math.floor(o.z + Math.sin(a) * rr);
      const g = this.surf[x + z * W];
      if (g < SEA + 2 || this.islandOf[x + z * W] !== i) continue;
      let ok = true;
      for (let dx = -4; dx <= 4 && ok; dx += 2) for (let dz = -4; dz <= 4 && ok; dz += 2) if (Math.abs(this.surf[(x + dx) + (z + dz) * W] - g) > (tries < 200 ? 2 : 3)) ok = false;
      if (!ok) continue;
      for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) {
        for (let y = g; y < g + 7; y++) { const id = this.get(x + dx, y, z + dz); if (id && id !== B.LOG && id !== B.JLOG) this.raw(x + dx, y, z + dz, B.AIR); }
        if (Math.abs(dx) <= 3 && Math.abs(dz) <= 3) {
          this.supportGround(x + dx, z + dz, g - 1, B.MOSSBRICK, B.MOSSBRICK);
          this.raw(x + dx, g - 1, z + dz, rnd() < 0.6 ? B.MOSSBRICK : B.BRICK);
        }
      }
      for (const [px, pz] of [[-3, -3], [3, -3], [-3, 3], [3, 3], [0, -3], [0, 3]]) {
        const h = 1 + Math.floor(rnd() * 4);
        for (let y = g; y < g + h; y++) this.raw(x + px, y, z + pz, rnd() < 0.6 ? B.MOSSBRICK : B.BRICK);
      }
      for (let k = -3; k <= 3; k++) if (rnd() < 0.55) this.raw(x + k, g + 4, z - 3, B.MOSSBRICK);
      this.raw(x, g, z, B.CHEST);
      this.raw(x - 1, g, z, B.MOSSBRICK); this.raw(x + 1, g, z, B.MOSSBRICK);
      this.sites.loot.push({ x, y: g, z, kind: 'ruin' });
      return;
    }
  }
}
