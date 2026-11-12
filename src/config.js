// Shared constants for Brinebound (working title). VERSION below is the one shown on the title screen.
export const VERSION = '0.6.42';
export const WS = 3;                     // world scale: 0.6 made the islands and the sea between them 3x wider (10x the area)
export const WORLD_Y_SHIFT = 48;         // raise the old world to make room for deeper mines below it
export const LEGACY_W = 384 * WS, LEGACY_D = 384 * WS; // map dimensions used by 0.6.15 saves and island placement
export const PREVIOUS_MAP_W = 544 * WS;  // 0.6.16 map width, used to remap old saves and keep its islands in place
export const W = 608 * WS, D = 608 * WS, H = 40 + WORLD_Y_SHIFT; // 0.6.27 expands the chart while preserving the previous map
export const OW = 256 * WS;              // the inner map, where the first nine islands are placed
export const SEA = 12 + WORLD_Y_SHIFT;  // water surface sits at y = SEA
export const WATER_Y = SEA - 0.12;      // mean height of the animated water plane
export const FLOOR = 1;                 // lowest mineable layer; below it is unbreakable bedrock
export const CS = 16;                   // chunk size in x and z
export const NCX = W / CS;              // chunks per row
export const SEED = 20261105;

export const B = {
  AIR: 0, GRASS: 1, DIRT: 2, SAND: 3, STONE: 4, LOG: 5, LEAVES: 6, PALM: 7, FROND: 8,
  PLANK: 9, CHEST: 10, MARK: 11, COCONUT: 12, SLATE: 13, BONE: 14, BRICK: 15, CLOTH: 16,
  VAULT: 17, LAMP: 18, MOSSBRICK: 19, WHITEBRICK: 20,
  BASALT: 21, ASH: 22, OBSIDIAN: 23, MAGMA: 24, JLOG: 25, JLEAVES: 26, CORAL_A: 27, CORAL_B: 28, WRECKWOOD: 29, BARREL: 30, CRATE: 31,
  TALLGRASS: 32, FLOWER_R: 33, FLOWER_Y: 34, FERN: 35, SHELL: 36, KELP: 37, MUSHROOM: 38,
  BAMBOO: 39, VINE: 40, CORAL_P: 41, CORAL_O: 42, CORAL_V: 43, SEAGRASS: 44, KEG: 45,
  BEDROCK: 46,
};

// Texture-array layers. Layers at or above EMIT_START glow in the dark.
export const T = {
  grass_top: 0, grass_side: 1, dirt: 2, sand: 3, stone: 4, log_side: 5, log_top: 6, leaves: 7,
  palm_side: 8, palm_top: 9, frond: 10, plank: 11, chest_side: 12, chest_top: 13, mark: 14,
  coconut: 15, slate: 16, bone: 17, brick: 18, cloth: 19, vault_side: 20, vault_top: 21,
  mossbrick: 22, white: 23, hullwood: 24, whitebrick: 25, chest_front: 26,
  tallgrass: 27, flower_r: 28, flower_y: 29, fern: 30, shell: 31, kelp: 32,
  basalt: 33, ash: 34, obsidian: 35, jlog_side: 36, jlog_top: 37, jleaves: 38, bamboo: 39, vine: 40,
  coral_p: 41, coral_o: 42, coral_v: 43, coralblock_a: 44, coralblock_b: 45, wreckwood: 46,
  barrel_side: 47, barrel_top: 48, crate: 49, seagrass: 50, keg_side: 51, keg_top: 52,
  lamp: 53, mushroom: 54, magma: 55,
};
export const EMIT_START = 53;
export const TILE_COUNT = 56;

// solid: collides and hides neighbouring faces. plant: 'cross' | 'flat' (never solid).
// tex: [top, side, bottom]. cls: tool class for mining speed. map: chart colour.
const blk = (name, o) => ({ name, solid: true, plant: null, hard: 0.5, drop: null, cls: 'soil', ...o });
export const BLOCKS = [];
BLOCKS[B.AIR] = { name: 'Air', solid: false, plant: null };
BLOCKS[B.GRASS] = blk('Grass', { tex: [T.grass_top, T.grass_side, T.dirt], hard: 0.45, drop: 'dirt', color: 0x6fae4f });
BLOCKS[B.DIRT] = blk('Dirt', { tex: [T.dirt, T.dirt, T.dirt], hard: 0.4, drop: 'dirt', color: 0x8a6a45 });
BLOCKS[B.SAND] = blk('Sand', { tex: [T.sand, T.sand, T.sand], hard: 0.32, drop: 'sand', color: 0xe3cf98 });
BLOCKS[B.STONE] = blk('Stone', { tex: [T.stone, T.stone, T.stone], hard: 1.15, drop: 'stone', cls: 'stone', color: 0x8b9094 });
BLOCKS[B.LOG] = blk('Log', { tex: [T.log_top, T.log_side, T.log_top], hard: 0.8, drop: 'wood', cls: 'wood', color: 0x6b4a2b });
BLOCKS[B.LEAVES] = blk('Leaves', { tex: [T.leaves, T.leaves, T.leaves], hard: 0.12, cls: 'wood', color: 0x3e8a3a });
BLOCKS[B.PALM] = blk('Palm trunk', { tex: [T.palm_top, T.palm_side, T.palm_top], hard: 0.7, drop: 'wood', cls: 'wood', color: 0x9b7a50 });
BLOCKS[B.FROND] = blk('Palm frond', { tex: [T.frond, T.frond, T.frond], hard: 0.12, cls: 'wood', color: 0x5fae3e });
BLOCKS[B.PLANK] = blk('Planks', { tex: [T.plank, T.plank, T.plank], hard: 0.6, drop: 'plank', cls: 'wood', color: 0xb98a56 });
BLOCKS[B.CHEST] = blk('Treasure chest', { tex: [T.chest_top, T.chest_side, T.chest_top], front: T.chest_front, hard: 0.5, cls: 'wood', color: 0x7a4b22 });
BLOCKS[B.MARK] = blk('Marked sand', { tex: [T.mark, T.sand, T.sand], hard: 0.32, drop: 'sand', color: 0xb8683e });
BLOCKS[B.COCONUT] = blk('Coconut', { tex: [T.coconut, T.coconut, T.coconut], hard: 0.1, drop: 'coconut', color: 0x6d4a2a });
BLOCKS[B.SLATE] = blk('Slate', { tex: [T.slate, T.slate, T.slate], hard: 1.5, drop: 'stone', cls: 'stone', color: 0x4d535b });
BLOCKS[B.BONE] = blk('Bone', { tex: [T.bone, T.bone, T.bone], hard: 0.9, drop: 'bone', cls: 'stone', color: 0xece4d0 });
BLOCKS[B.BRICK] = blk('Stone bricks', { tex: [T.brick, T.brick, T.brick], hard: 1.3, drop: 'brick', cls: 'stone', color: 0x8d9296 });
BLOCKS[B.CLOTH] = blk('Sailcloth', { tex: [T.cloth, T.cloth, T.cloth], hard: 0.3, cls: 'wood', color: 0xa8342a });
BLOCKS[B.VAULT] = blk('Hollow vault', { tex: [T.vault_top, T.vault_side, T.vault_top], front: T.vault_side, hard: 1.2, cls: 'wood', color: 0x283430 });
BLOCKS[B.LAMP] = blk('Lantern', { tex: [T.lamp, T.lamp, T.lamp], hard: 0.3, drop: 'lantern', cls: 'stone', color: 0xffcc66, glow: true });
BLOCKS[B.MOSSBRICK] = blk('Mossy bricks', { tex: [T.mossbrick, T.mossbrick, T.mossbrick], hard: 1.3, drop: 'brick', cls: 'stone', color: 0x6f7d62 });
BLOCKS[B.WHITEBRICK] = blk('Whitewashed bricks', { tex: [T.whitebrick, T.whitebrick, T.whitebrick], hard: 1.3, drop: 'brick', cls: 'stone', color: 0xe7e3d8 });
BLOCKS[B.BASALT] = blk('Basalt', { tex: [T.basalt, T.basalt, T.basalt], hard: 1.4, drop: 'stone', cls: 'stone', color: 0x3a3c40 });
BLOCKS[B.ASH] = blk('Volcanic ash', { tex: [T.ash, T.ash, T.ash], hard: 0.35, drop: 'sand', color: 0x7c7a76 });
BLOCKS[B.OBSIDIAN] = blk('Obsidian', { tex: [T.obsidian, T.obsidian, T.obsidian], hard: 2.2, drop: 'stone', cls: 'stone', color: 0x231d2c });
BLOCKS[B.MAGMA] = blk('Magma', { tex: [T.magma, T.magma, T.magma], hard: 1.0, cls: 'stone', color: 0xff6a1f, glow: true });
BLOCKS[B.JLOG] = blk('Mahogany log', { tex: [T.jlog_top, T.jlog_side, T.jlog_top], hard: 0.9, drop: 'wood', cls: 'wood', color: 0x6a3b25 });
BLOCKS[B.JLEAVES] = blk('Jungle leaves', { tex: [T.jleaves, T.jleaves, T.jleaves], hard: 0.12, cls: 'wood', color: 0x2f6e2c });
BLOCKS[B.CORAL_A] = blk('Coral', { tex: [T.coralblock_a, T.coralblock_a, T.coralblock_a], hard: 0.6, drop: 'coral', cls: 'stone', color: 0xe0785a });
BLOCKS[B.CORAL_B] = blk('Blue coral', { tex: [T.coralblock_b, T.coralblock_b, T.coralblock_b], hard: 0.6, drop: 'coral', cls: 'stone', color: 0x7a63b8 });
BLOCKS[B.WRECKWOOD] = blk('Wreck timber', { tex: [T.wreckwood, T.wreckwood, T.wreckwood], hard: 0.55, drop: 'plank', cls: 'wood', color: 0x6d6252 });
BLOCKS[B.BARREL] = blk('Barrel', { tex: [T.barrel_top, T.barrel_side, T.barrel_top], hard: 0.4, cls: 'wood', color: 0x8a5a30 });
BLOCKS[B.CRATE] = blk('Crate', { tex: [T.crate, T.crate, T.crate], hard: 0.4, cls: 'wood', color: 0xa57a45 });
BLOCKS[B.KEG] = blk('Powder keg', { tex: [T.keg_top, T.keg_side, T.keg_top], hard: 0.4, cls: 'wood', color: 0x5a3622 });
BLOCKS[B.BEDROCK] = blk('Bedrock', { tex: [T.basalt, T.basalt, T.basalt], hard: Infinity, cls: 'stone', color: 0x25272b });
const plant = (name, tile, kind = 'cross', o = {}) => ({ name, solid: false, plant: kind, tex: [tile, tile, tile], hard: 0.05, drop: null, cls: 'soil', color: 0x5aa03a, ...o });
BLOCKS[B.TALLGRASS] = plant('Tall grass', T.tallgrass);
BLOCKS[B.FLOWER_R] = plant('Hibiscus', T.flower_r, 'cross', { color: 0xd63a3a });
BLOCKS[B.FLOWER_Y] = plant('Sunbloom', T.flower_y, 'cross', { color: 0xf0c83c });
BLOCKS[B.FERN] = plant('Fern', T.fern);
BLOCKS[B.SHELL] = plant('Starfish', T.shell, 'flat', { color: 0xe6824a });
BLOCKS[B.KELP] = plant('Kelp', T.kelp, 'cross', { color: 0x2c6e46 });
BLOCKS[B.MUSHROOM] = plant('Glowcap', T.mushroom, 'cross', { color: 0x5ae6c8, glow: true });
BLOCKS[B.BAMBOO] = plant('Bamboo', T.bamboo, 'cross', { tall: true, color: 0x7fae3e });
BLOCKS[B.VINE] = plant('Vines', T.vine, 'cross', { tall: true, color: 0x3f7a2c });
BLOCKS[B.CORAL_P] = plant('Fan coral', T.coral_p, 'cross', { color: 0xf07aa0 });
BLOCKS[B.CORAL_O] = plant('Fire coral', T.coral_o, 'cross', { color: 0xf0a040 });
BLOCKS[B.CORAL_V] = plant('Tube coral', T.coral_v, 'cross', { color: 0x9a6ae0 });
BLOCKS[B.SEAGRASS] = plant('Seagrass', T.seagrass, 'cross', { color: 0x4a9a5a });
// building pieces (see pieces.js for the layout of ids 128..209)
{
  const MAT = [{ n: 'Wooden', tex: T.plank, color: 0xb98a56, cls: 'wood', drop: 'plank', hard: 0.5 }, { n: 'Stone', tex: T.brick, color: 0x8d9296, cls: 'stone', drop: 'brick', hard: 1.0 }];
  const EDGE = ['', 'wall', 'window', 'doorway'];
  const piece = (id, name, m, o = {}) => { BLOCKS[id] = { name, solid: false, plant: null, piece: true, tex: [m.tex, m.tex, m.tex], hard: m.hard, drop: m.drop, cls: m.cls, color: m.color, ...o }; };
  for (let mat = 0; mat < 2; mat++) {
    const m = MAT[mat];
    for (let c = 1; c < 32; c++) {
      const f = c >> 4, w = (c >> 2) & 3, n = c & 3, what = [f ? 'floor' : '', EDGE[w], EDGE[n]].filter(Boolean);
      piece(128 + mat * 32 + c, `${m.n} ${[...new Set(what)].join(' and ')}`, m);
    }
    for (let r = 0; r < 4; r++) { piece(192 + mat * 4 + r, `${m.n} stairs`, m); piece(200 + mat * 4 + r, `${m.n} roof`, m); }
    piece(208 + mat, `${m.n} post`, m);
  }
}
for (let i = 0; i < 256; i++) if (!BLOCKS[i]) BLOCKS[i] = { name: '?', solid: false, plant: null };
export const isSolid = (id) => id !== 0 && BLOCKS[id].solid;
export const isPlant = (id) => id !== 0 && !!BLOCKS[id].plant;

export const ITEMS = {
  cutlass: { name: 'Cutlass', tool: true },
  pick: { name: 'Pickaxe', tool: true },
  hook: { name: 'Grappling hook', tool: true },
  hammer: { name: 'Builder’s hammer', tool: true },
  pistol: { name: 'Flintlock pistol', tool: true, gun: true },
  blunderbuss: { name: 'Blunderbuss', tool: true, gun: true },
  musket: { name: 'Long musket', tool: true, gun: true },
  shot: { name: 'Lead shot' },
  goblet: { name: 'Silver goblet', loot: 30 },
  pearls: { name: 'String of pearls', loot: 55 },
  ruby: { name: 'Ruby', loot: 85 },
  idol: { name: 'Golden idol', loot: 140 },
  wood: { name: 'Wood', block: B.LOG },
  plank: { name: 'Planks', block: B.PLANK },
  stone: { name: 'Stone', block: B.STONE },
  brick: { name: 'Stone bricks', block: B.BRICK },
  sand: { name: 'Sand', block: B.SAND },
  dirt: { name: 'Dirt', block: B.DIRT },
  lantern: { name: 'Lantern', block: B.LAMP },
  keg: { name: 'Powder keg', block: B.KEG },
  coconut: { name: 'Coconut', food: { hunger: 28, hp: 4 } },
  grog: { name: 'Coconut grog', food: { hunger: 8, hp: 35 } },
  meat: { name: 'Meat', food: { hunger: 30, hp: 6 } },
  crab: { name: 'Crab', food: { hunger: 16, hp: 3 } },
  coral: { name: 'Coral', block: B.CORAL_A },
  bone: { name: 'Bone' },
  ball: { name: 'Cannonballs' },
  oil: { name: 'Crate of lamp oil', cargo: true },
  rum: { name: 'Barrel of rum', cargo: true },
  candles: { name: 'Box of bone candles', cargo: true },
  skull: { name: 'Captain’s skull', quest: true },
  page1: { name: 'Log page I', quest: true },
  page2: { name: 'Log page II', quest: true },
  page3: { name: 'Log page III', quest: true },
  heart: { name: 'Heart of the Hollow', quest: true },
  pearl: { name: 'Kraken pearl', quest: true },
};
export const DEFAULT_HOTBAR = ['cutlass', 'pick', 'hook', 'hammer', 'plank', 'pistol', 'lantern', 'coconut', 'grog'];
export const RECIPES = [
  { out: 'plank', n: 4, cost: { wood: 1 }, note: 'Build with them, or patch your hull with R.' },
  { out: 'ball', n: 3, cost: { stone: 2 }, note: 'Shot for the sloop’s cannons.' },
  { out: 'brick', n: 2, cost: { stone: 2 }, note: 'Sturdy walls for a hideout.' },
  { out: 'lantern', n: 2, cost: { plank: 2, coconut: 1 }, note: 'Coconut oil in a plank frame. Glows all night.' },
  { out: 'grog', n: 1, cost: { coconut: 2 }, note: 'Drink it to restore 35 health.' },
  { out: 'keg', n: 1, cost: { plank: 2, ball: 3 }, note: 'Black powder in a stout keg. Hit it to light the fuse, then run.' },
  { out: 'shot', n: 10, cost: { ball: 1 }, note: 'Melt a cannonball down into balls for your guns.' },
  { out: 'pistol', n: 1, cost: { plank: 2, ball: 4 }, tool: true, note: 'One shot, then a reload. Two balls drop a skeleton.' },
  { out: 'blunderbuss', n: 1, cost: { plank: 3, ball: 8 }, tool: true, note: 'A fistful of shot at close range. Clears a deck.' },
  { out: 'musket', n: 1, cost: { plank: 5, ball: 10 }, tool: true, note: 'Long and slow. Hold right click (or Place) to aim down the barrel.' },
];

// Character creation options
export const LOOKS = {
  skin: ['#f2c9a6', '#e1ae86', '#c68e62', '#a9724a', '#7f5034', '#5b3a25'],
  coat: [
    { name: 'Teal', c: '#2f6f7e' }, { name: 'Crimson', c: '#9c2f2a' }, { name: 'Navy', c: '#253a63' },
    { name: 'Mustard', c: '#b88a2c' }, { name: 'Moss', c: '#4b6b34' }, { name: 'Coal', c: '#2b2b2e' }, { name: 'Plum', c: '#5f3a5e' },
  ],
  hat: ['Tricorn', 'Bandana', 'Bicorne', 'Hood', 'None'],
  hair: ['#2b1d14', '#5a3a22', '#a8743a', '#d9c08a', '#8a8a86', '#b44a22'],
  beard: ['None', 'Stubble', 'Full', 'Braided'],
  emblem: ['Compass', 'Anchor', 'Kraken', 'Crossed blades', 'Gull', 'None'],
  sail: [{ name: 'Canvas', c: '#eadfc4' }, { name: 'Crimson', c: '#a83a30' }, { name: 'Midnight', c: '#2a3550' }, { name: 'Sea-green', c: '#4f8f7f' }, { name: 'Gold', c: '#d9b45a' }],
  hull: [{ name: 'Oak', c: '#6b4426' }, { name: 'Tar', c: '#2e2a26' }, { name: 'Teal', c: '#2f6f7e' }, { name: 'Crimson', c: '#7c2a24' }, { name: 'Ivory', c: '#d8cfba' }],
};

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const wrapAngle = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

// Cube faces: outward normal, axis, and the 4 corners of each quad (two triangles 0-1-2, 2-1-3).
export const FACES = [
  { dir: [-1, 0, 0], axis: 0, corners: [[0, 1, 0], [0, 0, 0], [0, 1, 1], [0, 0, 1]] },
  { dir: [1, 0, 0], axis: 0, corners: [[1, 1, 1], [1, 0, 1], [1, 1, 0], [1, 0, 0]] },
  { dir: [0, -1, 0], axis: 1, corners: [[1, 0, 1], [0, 0, 1], [1, 0, 0], [0, 0, 0]] },
  { dir: [0, 1, 0], axis: 1, corners: [[0, 1, 1], [1, 1, 1], [0, 1, 0], [1, 1, 0]] },
  { dir: [0, 0, -1], axis: 2, corners: [[1, 0, 0], [0, 0, 0], [1, 1, 0], [0, 1, 0]] },
  { dir: [0, 0, 1], axis: 2, corners: [[0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]] },
];
// texture coordinates per face corner so side textures stand upright
export const FACE_UV = FACES.map((F, f) => F.corners.map((c) => {
  switch (f) {
    case 0: return [c[2], c[1]];
    case 1: return [1 - c[2], c[1]];
    case 2: return [c[0], c[2]];
    case 3: return [c[0], 1 - c[2]];
    case 4: return [1 - c[0], c[1]];
    default: return [c[0], c[1]];
  }
}));
export const AO_OFF = FACES.map((F) => F.corners.map((cr) => {
  const a = F.axis, u = (a + 1) % 3, v = (a + 2) % 3;
  const s1 = F.dir.slice(); s1[u] += cr[u] ? 1 : -1;
  const s2 = F.dir.slice(); s2[v] += cr[v] ? 1 : -1;
  const c = F.dir.slice(); c[u] += cr[u] ? 1 : -1; c[v] += cr[v] ? 1 : -1;
  return [s1, s2, c];
}));
