// Snap-together building pieces, the way Rust does it: floors, walls, windows, doorways, stairs, roofs and
// posts that click onto a one-metre grid. Each piece lives in a world cell as a block id:
//   128..191  a cell's floor and the walls on its west and north edges (every edge belongs to one cell):
//             128 + mat * 32 + floor * 16 + west * 4 + north, edge kinds 0 none, 1 wall, 2 window, 3 doorway
//   192..199  stairs (mat * 4 + rot)   200..207 roof (mat * 4 + rot)   208..209 post (mat)
// rot: the way the stairs climb / the roof rises: 0 north (-z), 1 east (+x), 2 south (+z), 3 west (-x).
import { T, FACES } from './config.js';

export const PIECE_LO = 128, PIECE_HI = 209;
export const isPiece = (id) => id >= PIECE_LO && id <= PIECE_HI;
export const isCode = (id) => id >= 128 && id < 192;
export const EDGE = ['none', 'wall', 'window', 'door'];
export const MATS = ['wood', 'stone'];
export function code(mat, floor, west, north) {
  if (!floor && !west && !north) return 0;
  return 128 + mat * 32 + (floor ? 16 : 0) + west * 4 + north;
}
export function parts(id) {
  if (!isCode(id)) return null;
  const c = id - 128;
  return { mat: c >> 5, floor: (c >> 4) & 1, west: (c >> 2) & 3, north: c & 3 };
}
export const pieceMat = (id) => (isCode(id) ? (id - 128) >> 5 : id >= 208 ? id - 208 : ((id - 192) >> 2) & 1);
export const stairsId = (mat, rot) => 192 + mat * 4 + rot;
export const roofId = (mat, rot) => 200 + mat * 4 + rot;
export const postId = (mat) => 208 + mat;
export function shapeOf(id) {
  if (isCode(id)) return 'cell';
  if (id >= 192 && id < 200) return 'stairs';
  if (id >= 200 && id < 208) return 'roof';
  return 'post';
}
export const rotOf = (id) => (id >= 192 && id < 208 ? (id - 192) & 3 : 0);

// what the hammer can put down, and what each costs (planks for wood, bricks for stone)
export const KINDS = [
  { key: 'floor', name: 'Floor', cost: 2 },
  { key: 'wall', name: 'Wall', cost: 2 },
  { key: 'window', name: 'Window', cost: 2 },
  { key: 'door', name: 'Doorway', cost: 2 },
  { key: 'stairs', name: 'Stairs', cost: 3 },
  { key: 'roof', name: 'Roof', cost: 2 },
  { key: 'post', name: 'Post', cost: 1 },
];

// ---------------------------------------------------------------- shapes
// Boxes in cell-local coordinates (0..1), for a piece that climbs/faces north; turned for other rotations.
const R = 0.08;              // half the thickness of a wall
function turn(b, rot) {
  let [x0, y0, z0, x1, y1, z1] = b;
  for (let k = 0; k < rot; k++) {         // (x, z) about the centre: (x, z) -> (1 - z, x)
    const nx0 = 1 - z1, nx1 = 1 - z0, nz0 = x0, nz1 = x1;
    x0 = nx0; x1 = nx1; z0 = nz0; z1 = nz1;
  }
  return [x0, y0, z0, x1, y1, z1];
}
const STAIRS = [0, 1, 2, 3].map((i) => [0, 0, 1 - (i + 1) / 4, 1, (i + 1) / 4, 1 - i / 4]);
const ROOF = [0, 1, 2, 3].map((i) => [0, (i + 1) / 4 - 0.25, 1 - (i + 1) / 4, 1, (i + 1) / 4, 1 - i / 4]);
// edge pieces along the west edge (x = 0), z from 0 to 1; north edges are the same turned a quarter
function edgeBoxes(kind, top) {
  if (kind === 1 || kind === 2) return [[-R, 0, 0, R, 1, 1]];
  if (kind === 3) {
    const b = [[-R, 0, 0, R, 1, 0.08], [-R, 0, 0.92, R, 1, 1]];
    if (top) b.push([-R, 0.95, 0, R, 1, 1]);          // a slim lintel: the doorway clears a pirate
    return b;
  }
  return [];
}
const westToNorth = (b) => [b[2], b[1], b[0], b[5], b[4], b[3]];

// Collision boxes of the piece in cell (x, y, z), in world coordinates, appended to out as 6-number arrays.
export function pieceBoxes(w, x, y, z, id, out) {
  const add = (b) => out.push([x + b[0], y + b[1], z + b[2], x + b[3], y + b[4], z + b[5]]);
  const s = shapeOf(id);
  if (s === 'cell') {
    const p = parts(id);
    if (p.floor) add([0, 0, 0, 1, 0.16, 1]);
    if (p.west) for (const b of edgeBoxes(p.west, p.west === 3 && doorBelow(w, x, y, z, 'west'))) add(b);
    if (p.north) for (const b of edgeBoxes(p.north, p.north === 3 && doorBelow(w, x, y, z, 'north'))) add(westToNorth(b));
  } else if (s === 'stairs') for (const b of STAIRS) add(turn(b, rotOf(id)));
  else if (s === 'roof') for (const b of ROOF) add(turn(b, rotOf(id)));
  else add([0.36, 0, 0.36, 0.64, 1, 0.64]);
  return out;
}
function doorBelow(w, x, y, z, side) {
  const p = parts(w.get(x, y - 1, z));
  return !!p && p[side] === 3;
}
// does the piece fill its cell for a creature trying to walk through? (walls do, floors and stairs don't)
export function pieceBlocks(id) {
  const s = shapeOf(id);
  if (s === 'post') return true;
  if (s !== 'cell') return false;
  const p = parts(id);
  return (p.west === 1 || p.west === 2) || (p.north === 1 || p.north === 2);
}
// for a hit on a cell piece, which part was struck
export function partBoxes(w, x, y, z, id) {
  const p = parts(id), list = [];
  if (!p) return list;
  if (p.floor) list.push(['floor', [x, y, z, x + 1, y + 0.16, z + 1]]);
  if (p.west) list.push(['west', [x - R, y, z, x + R, y + 1, z + 1]]);
  if (p.north) list.push(['north', [x, y, z - R, x + 1, y + 1, z + R]]);
  return list;
}

// ---------------------------------------------------------------- drawing
const TILES = [
  { panel: T.plank, frame: T.log_side, floor: T.plank, roof: T.wreckwood, post: T.log_side },
  { panel: T.brick, frame: T.whitebrick, floor: T.slate, roof: T.slate, post: T.brick },
];
// a textured box into the chunk arrays; texture coordinates in metres so neighbouring pieces line up
function boxA(A, x0, y0, z0, x1, y1, z1, tile, shade) {
  for (let f = 0; f < 6; f++) {
    const F = FACES[f], n = F.dir, v = A.n;
    for (const cr of F.corners) {
      const px = cr[0] ? x1 : x0, py = cr[1] ? y1 : y0, pz = cr[2] ? z1 : z0;
      A.pos.push(px, py, pz); A.nor.push(n[0], n[1], n[2]);
      if (F.axis === 0) A.uv.push(pz, py); else if (F.axis === 1) A.uv.push(px, pz); else A.uv.push(px, py);
      A.lay.push(tile);
      const k = shade * (n[1] < 0 ? 0.7 : 1);
      A.col.push(k, k, k);
    }
    A.ind.push(v, v + 1, v + 2, v + 2, v + 1, v + 3);
    A.n += 4;
  }
}
// a slanted slab (a roof): the top surface rises from the south edge (y0) to the north edge (y1)
function slopeA(A, x, y, z, rot, tile, shade, th = 0.12) {
  const pt = (lx, ly, lz) => { let px = lx, pz = lz; for (let k = 0; k < rot; k++) { const t = px; px = 1 - pz; pz = t; } return [x + px, y + ly, z + pz]; };
  const top = [pt(0, 0.12, 1.06), pt(1, 0.12, 1.06), pt(0, 1.0, -0.02), pt(1, 1.0, -0.02)];
  const bot = top.map((p) => [p[0], p[1] - th, p[2]]);
  const quad = (a, b, c, d, n) => {
    const v = A.n;
    for (const p of [a, b, c, d]) {
      A.pos.push(p[0], p[1], p[2]); A.nor.push(n[0], n[1], n[2]);
      const u = rot % 2 ? p[2] : p[0], w = Math.hypot(p[1] - y, (rot % 2 ? p[0] - x : p[2] - z)) * 1.2;
      A.uv.push(u, w); A.lay.push(tile);
      const k = shade * (n[1] < -0.1 ? 0.65 : 1);
      A.col.push(k, k, k);
    }
    A.ind.push(v, v + 1, v + 2, v + 2, v + 1, v + 3);
    A.n += 4;
  };
  const up = [0, 0.7071, 0.7071], d = [0, -0.7071, -0.7071];
  const turnN = (n) => { let [a, b, c] = n; for (let k = 0; k < rot; k++) { const t = a; a = -c; c = t; } return [a, b, c]; };
  quad(top[0], top[1], top[2], top[3], turnN(up));
  quad(bot[1], bot[0], bot[3], bot[2], turnN(d));
  quad(bot[0], top[0], bot[2], top[2], turnN([-1, 0, 0]));
  quad(top[1], bot[1], top[3], bot[3], turnN([1, 0, 0]));
  quad(bot[0], bot[1], top[0], top[1], turnN([0, 0, 1]));
  quad(top[2], top[3], bot[2], bot[3], turnN([0, 0, -1]));
}
// Geometry for the piece in cell (x, y, z) into the chunk's crafted-surface arrays.
export function emitPiece(w, A, x, y, z, id) {
  const s = shapeOf(id), m = pieceMat(id), TL = TILES[m];
  if (s === 'post') { boxA(A, x + 0.36, y, z + 0.36, x + 0.64, y + 1, z + 0.64, TL.post, 0.8); return; }
  if (s === 'stairs') {
    const rot = rotOf(id);
    for (const b of STAIRS) { const t = turn(b, rot); boxA(A, x + t[0], y + t[1], z + t[2], x + t[3], y + t[4], z + t[5], TL.floor, 0.95); }
    return;
  }
  if (s === 'roof') { slopeA(A, x, y, z, rotOf(id), TL.roof, 0.92); return; }
  const p = parts(id);
  if (p.floor) boxA(A, x, y, z, x + 1, y + 0.16, z + 1, TL.floor, 0.95);
  // west edge: x = const; north edge: z = const. dir: 0 west, 1 north
  const edge = (kind, dir) => {
    const top = kind === 3 && doorBelow(w, x, y, z, dir ? 'north' : 'west');
    const B = (a0, y0, b0, a1, y1, b1, tile, sh) => {
      // a: across the edge (-R..R), b: along it (0..1)
      if (dir === 0) boxA(A, x + a0, y + y0, z + b0, x + a1, y + y1, z + b1, tile, sh);
      else boxA(A, x + b0, y + y0, z + a0, x + b1, y + y1, z + a1, tile, sh);
    };
    const r = R - 0.01;
    if (kind === 1) B(-r, 0, 0, r, 1, 1, TL.panel, 0.95);
    else if (kind === 2) {
      B(-r, 0, 0, r, 0.36, 1, TL.panel, 0.95); B(-r, 0.84, 0, r, 1, 1, TL.panel, 0.95);
      B(-r, 0.36, 0, r, 0.84, 0.16, TL.panel, 0.95); B(-r, 0.36, 0.84, r, 0.84, 1, TL.panel, 0.95);
      B(-R - 0.05, 0.32, 0.12, R + 0.05, 0.38, 0.88, TL.frame, 0.85);
      B(-0.02, 0.36, 0.48, 0.02, 0.84, 0.52, TL.frame, 0.7); B(-0.02, 0.58, 0.16, 0.02, 0.62, 0.84, TL.frame, 0.7);
    } else if (kind === 3) {
      B(-R, 0, 0, R, 1, 0.08, TL.frame, 0.8); B(-R, 0, 0.92, R, 1, 1, TL.frame, 0.8);
      if (top) B(-R, 0.95, 0, R, 1, 1, TL.frame, 0.8);
    }
    // corner posts: at this edge's start, and at its far end when the wall doesn't carry on there
    const pw = dir === 0 ? 0.11 : 0.1;
    if (kind !== 3) {
      B(-pw, 0, -pw, pw, 1, pw, TL.post, 0.72);
      const nb = parts(dir === 0 ? w.get(x, y, z + 1) : w.get(x + 1, y, z));
      if (!nb || !(dir === 0 ? nb.west : nb.north)) B(-pw, 0, 1 - pw, pw, 1, 1 + pw, TL.post, 0.72);
    }
  };
  if (p.west) edge(p.west, 0);
  if (p.north) edge(p.north, 1);
}
