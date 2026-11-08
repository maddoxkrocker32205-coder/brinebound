import * as THREE from 'three';
import { SEA, WATER_Y, W, D, T, LOOKS, clamp, wrapAngle } from './config.js';
import { waveHeight } from './water.js';
import { GeoBuilder, glowSprite } from './geo.js';
import { voxelMaterial } from './materials.js';

// Local ship space: waterline at y = 0, bow toward -z, starboard toward +x.
// Four levels to walk: the hold below (low), the main deck, the quarterdeck over the stern (qd) where the
// wheel is, and the crow's nest up the mast (nest).
export const SHIP1 = { bow: -6.4, stern: 5.6, deck: 1.1, beam: 2.2, qd: 2.25, qdZ: 2.2, low: -0.7, lowZ0: -4.8, lowZ1: 4.9, nest: 9.6, mastZ: -0.5, top: 11.4 };
export const HELM1 = { x: 0, z: 3.45 };                       // where the helmsman stands, facing the bow
export const HATCH1 = { x0: -0.6, x1: 0.6, z0: 0.35, z1: 2.0 }; // the stair down to the hold
export const QSTAIRS1 = { z0: 0.85, z1: 2.2, xs: [[0.95, 1.65], [-1.65, -0.95]] };
export const LADDER1 = { x: 0, z: -0.12 };                     // where you stand to climb the mast
export const NEST_R1 = 0.95;                                   // the crow's nest: a square this far either side of the mast
export const CHEST1 = { x: 0, z: -2.75 };                      // your sea chest, in the hold
// guns that anyone aboard can man: four on the main deck, a swivel each side of the quarterdeck
export const GUNS1 = [[-3.0, 1], [-3.0, -1], [-1.25, 1], [-1.25, -1], [4.15, 1], [4.15, -1]].map(([z, side], i) => ({ i, z, side, y: z > SHIP1.qdZ ? SHIP1.qd : SHIP1.deck }));
export function halfWidthAt1(z) {
  if (z < -1.2) { const k = (z - SHIP1.bow) / (-1.2 - SHIP1.bow); return SHIP1.beam * Math.max(0.12, Math.pow(Math.max(0, k), 0.7)); }
  if (z > 4.0) return SHIP1.beam * (1 - 0.22 * Math.min(1, (z - 4.0) / (SHIP1.stern - 4.0)));
  return SHIP1.beam;
}

const BASE = {
  sloop: { hull2: null, stripe: '#2f6f7e', deck: '#b7895a', rail: '#7a5232', mast: '#8a6440', metal: '#2a2b2d', lantern: 0xffc864, flag: '#1b2a30' },
  hollow: { hull: '#27302c', hull2: '#1c2421', stripe: '#4f9a84', deck: '#3e3b33', rail: '#2b2a24', mast: '#2e2a24', metal: '#1a1c1d', lantern: 0x8affc8, flag: '#6fd1a8', sail: '#5a6a62' },
  merchant: { hull: '#9a7448', stripe: '#d4a947', deck: '#c49a68', rail: '#80582f', mast: '#8a6440', metal: '#3a3b3d', lantern: 0xffd27a, flag: '#2f6fae', sail: '#f1e8d2', emblem: 'Anchor' },
  navy: { hull: '#2a3140', stripe: '#e9e3d2', deck: '#b9915e', rail: '#353b48', mast: '#7d5c3c', metal: '#2a2b2d', lantern: 0xfff0c0, flag: '#b23b2e', sail: '#f6f3ea', emblem: 'Compass' },
  pirate: { hull: '#3b2a22', stripe: '#9a2b23', deck: '#8d6a45', rail: '#2e221b', mast: '#4a3626', metal: '#1d1e20', lantern: 0xffa040, flag: '#141414', sail: '#34302c', emblem: 'Crossed blades' },
};
export const SHIP_NAMES = {
  merchant: ['The Merry Guinea', 'The Saltmarket', 'The Clove Queen', 'The Fair Ledger', 'The Copper Kettle'],
  navy: ['The Crown’s Lantern', 'The Dauntless', 'The Steadfast', 'The Warden'],
  pirate: ['The Red Gull', 'The Black Maren', 'The Gallows Wit', 'The Rusty Hook'],
};

function shadeHex(hex, k) { const c = new THREE.Color(hex); c.multiplyScalar(k); return c; }

// The hull is lofted, not stacked: cross-sections from keel to rail at stations along the length, with a
// sheer that lifts toward the bow and steps up over the quarterdeck, a rounded bilge and a little tumblehome.
const smooth01 = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function baseRail(z) { const b = Math.max(0, (-2 - z) / (-2 - SHIP1.bow)), s = Math.max(0, (z - 3) / (SHIP1.stern - 3)); return 1.62 + 0.42 * b * b + 0.22 * s * s; }
const raise = (z) => 1.0 * smooth01(SHIP1.qdZ - 0.25, SHIP1.qdZ + 0.2, z);
export const railY1 = (z) => baseRail(z) + raise(z);
function keelY(z) { const b = Math.max(0, (-3 - z) / (-3 - SHIP1.bow)), s = Math.max(0, (z - 3.6) / (SHIP1.stern - 3.6)); return -1.45 + 1.7 * b * b + 0.55 * s * s; }
const shape = (t) => (1 - Math.pow(1 - t, 3.2)) * (1 - 0.05 * smooth01(0.82, 1, t));
// half-width of the hull's skin at height y (local)
export function hullHalfAt1(z, y) {
  const y0 = keelY(z), y1 = baseRail(z), w = halfWidthAt1(z);
  if (y <= y1) return w * shape(Math.min(1, Math.max(0, (y - y0) / (y1 - y0))));
  return w * shape(1) * (1 - 0.02 * (y - y1));
}
const holdHalfWidth1 = (z) => Math.max(0.1, hullHalfAt1(z, SHIP1.low + 0.02) - 0.04);
export const SIDE_LADDERS1 = [-1, 1].map((side) => {
  const z = -0.45;
  return { side, x: side * (hullHalfAt1(z, SHIP1.deck + 0.12) + 0.08), z, bottom: -0.65 };
});

// ---------------------------------------------------------------- walking aboard
const PW = 0.3;
// Every floor under the point (x, z): the hold, the main deck (with its hatch), the stairs, the quarterdeck, the nest.
export function deckFloors1(x, z, out = []) {
  out.length = 0;
  const ax = Math.abs(x);
  const inHatch = x >= HATCH1.x0 && x <= HATCH1.x1 && z >= HATCH1.z0 && z <= HATCH1.z1;
  if (z >= SHIP1.bow + 1.3 && z <= SHIP1.qdZ && ax <= hullHalfAt1(z, 1.6) - 0.16 - PW && !inHatch) out.push(SHIP1.deck);
  if (inHatch) out.push(SHIP1.deck - ((z - HATCH1.z0) / (HATCH1.z1 - HATCH1.z0)) * (SHIP1.deck - SHIP1.low));
  if (z >= QSTAIRS1.z0 && z <= QSTAIRS1.z1) for (const [a, b] of QSTAIRS1.xs) if (x >= a && x <= b) out.push(SHIP1.deck + ((z - QSTAIRS1.z0) / (QSTAIRS1.z1 - QSTAIRS1.z0)) * (SHIP1.qd - SHIP1.deck));
  if (z >= SHIP1.qdZ && z <= SHIP1.stern - 0.3 && ax <= hullHalfAt1(z, 2.6) - 0.16 - PW) out.push(SHIP1.qd);
  if (z >= SHIP1.lowZ0 + 0.1 + PW && z <= SHIP1.lowZ1 - 0.1 - PW && ax <= holdHalfWidth1(z) - PW) out.push(SHIP1.low);
  if (ax <= NEST_R1 - 0.1 && Math.abs(z - SHIP1.mastZ) <= NEST_R1 - 0.1) out.push(SHIP1.nest);
  return out;
}
// The floor a body at height y stands on at (x, z): NaN when something in the way is too high to step onto,
// -Infinity when there's no ship under it at all.
const _fl = [];
export function floorAt1(x, z, y) {
  let best = -Infinity, wall = false;
  for (const f of deckFloors1(x, z, _fl)) {
    if (f <= y + 0.45) { if (f > best) best = f; }
    else if (f < y + 1.68) wall = true;
  }
  return wall ? NaN : best;
}
// the lowest thing overhead (a deck above you), for jumps below decks
export function ceilingAt1(x, z, y) {
  let c = Infinity;
  for (const f of deckFloors1(x, z, _fl)) if (f > y + 0.5 && f - 0.12 < c) c = f - 0.12;
  if (y < SHIP1.deck - 0.5 && z > SHIP1.lowZ0 && z < SHIP1.lowZ1) c = Math.min(c, SHIP1.deck - 0.12);
  return c;
}
// round things on deck to walk around: [x, z, radius, from y, to y]
export function deckObstacles1() {
  const o = [[0, SHIP1.mastZ, 0.24, SHIP1.low, SHIP1.top], [HELM1.x, HELM1.z - 0.55, 0.32, SHIP1.qd, SHIP1.qd + 1.4], [CHEST1.x, CHEST1.z, 0.52, SHIP1.low, SHIP1.low + 0.8],
    [-0.75, -2.0, 0.34, SHIP1.low, SHIP1.low + 1], [0.85, -1.4, 0.34, SHIP1.low, SHIP1.low + 1], [-0.8, 2.6, 0.38, SHIP1.low, SHIP1.low + 1]];
  for (const g of GUNS1) { const p = gunPlace1(g); o.push([p.cx, p.z, 0.42, g.y, g.y + 1]); }
  return o;
}
// where a gun sits: the carriage centre, the trunnion the barrel pivots on, where its gunner stands
export function gunPlace1(g) {
  const hw = hullHalfAt1(g.z, g.y + 0.6) - 0.16;
  const cx = g.side * (hw - 0.55);
  return { cx, z: g.z, px: g.side * (hw - 0.55), py: g.y + 0.72, stand: g.side * Math.max(0.05, hw - 1.45), side: g.side };
}

// ---------------------------------------------------------------- the plan in metres
// The plan above is drawn for a ship of size 1. Every ship is built SCALE times bigger: hull, decks, masts, guns,
// everything aboard. People stay their own size, so whatever walks the decks (the player, crewmates) uses this
// copy of the plan in metres, in which a body's margins (a step up, head room, a shoulder's width) are not scaled.
export const SCALE = 2;
const scaled = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v * SCALE]));
export const SHIP = scaled(SHIP1), HELM = scaled(HELM1), HATCH = scaled(HATCH1), LADDER = scaled(LADDER1), CHEST = scaled(CHEST1);
export const SIDE_LADDERS = SIDE_LADDERS1.map((l) => ({ side: l.side, x: l.x * SCALE, z: l.z * SCALE, bottom: l.bottom * SCALE }));
export const QSTAIRS = { z0: QSTAIRS1.z0 * SCALE, z1: QSTAIRS1.z1 * SCALE, xs: QSTAIRS1.xs.map(([a, b]) => [a * SCALE, b * SCALE]) };
export const NEST_R = NEST_R1 * SCALE;
export const GUNS = GUNS1.map((g) => ({ i: g.i, z: g.z * SCALE, side: g.side, y: g.y * SCALE }));
export const halfWidthAt = (z) => halfWidthAt1(z / SCALE) * SCALE;
export const hullHalfAt = (z, y) => hullHalfAt1(z / SCALE, y / SCALE) * SCALE;
export const railY = (z) => railY1(z / SCALE) * SCALE;
export function deckFloors(x, z, out = []) {
  out.length = 0;
  const ax = Math.abs(x), K = SCALE;
  const inHatch = x >= HATCH.x0 && x <= HATCH.x1 && z >= HATCH.z0 && z <= HATCH.z1;
  if (z >= SHIP.bow + 1.3 * K && z <= SHIP.qdZ && ax <= hullHalfAt(z, 1.6 * K) - 0.16 * K - PW && !inHatch) out.push(SHIP.deck);
  if (inHatch) out.push(SHIP.deck - ((z - HATCH.z0) / (HATCH.z1 - HATCH.z0)) * (SHIP.deck - SHIP.low));
  if (z >= QSTAIRS.z0 && z <= QSTAIRS.z1) for (const [a, b] of QSTAIRS.xs) if (x >= a && x <= b) out.push(SHIP.deck + ((z - QSTAIRS.z0) / (QSTAIRS.z1 - QSTAIRS.z0)) * (SHIP.qd - SHIP.deck));
  if (z >= SHIP.qdZ && z <= SHIP.stern - 0.3 * K && ax <= hullHalfAt(z, 2.6 * K) - 0.16 * K - PW) out.push(SHIP.qd);
  if (z >= SHIP.lowZ0 + 0.1 * K + PW && z <= SHIP.lowZ1 - 0.1 * K - PW && ax <= holdHalfWidth1(z / K) * K - PW) out.push(SHIP.low);
  if (ax <= NEST_R - 0.1 * K && Math.abs(z - SHIP.mastZ) <= NEST_R - 0.1 * K) out.push(SHIP.nest);
  return out;
}
const _flm = [];
export function floorAt(x, z, y) {
  let best = -Infinity, wall = false;
  for (const f of deckFloors(x, z, _flm)) {
    if (f <= y + 0.45) { if (f > best) best = f; }
    else if (f < y + 1.68) wall = true;
  }
  return wall ? NaN : best;
}
export function ceilingAt(x, z, y) {
  let c = Infinity;
  for (const f of deckFloors(x, z, _flm)) if (f > y + 0.5 && f - 0.12 * SCALE < c) c = f - 0.12 * SCALE;
  if (y < SHIP.deck - 0.5 && z > SHIP.lowZ0 && z < SHIP.lowZ1) c = Math.min(c, SHIP.deck - 0.12 * SCALE);
  return c;
}
export function deckObstacles() {
  return deckObstacles1().map(([x, z, r, y0, y1]) => [x * SCALE, z * SCALE, r * SCALE, y0 * SCALE, y1 * SCALE]);
}
export function gunPlace(g) {
  const p = gunPlace1({ z: g.z / SCALE, y: g.y / SCALE, side: g.side });
  return { cx: p.cx * SCALE, z: g.z, px: p.px * SCALE, py: p.py * SCALE, stand: p.stand * SCALE, side: g.side };
}

// ---------------------------------------------------------------- collisions
// The hull's footprint for bumping into things: circles down the centreline, as wide as the hull is there, so
// ships can lie alongside each other and a bow can strike a side. In plan units ([z, radius]); times the size.
export const HULL_CIRCLES = [-5.45, -4.1, -2.6, -1.0, 0.6, 2.2, 3.8, 5.0].map((z) => [z, Math.max(0.55, halfWidthAt1(z) * (z < -4 ? 0.92 : 1))]);
// points round the hull's outline at the waterline, about 0.45 plan units apart, for running aground
const OUTLINE = (() => {
  const pts = [[0, SHIP1.bow + 0.35]];
  for (let z = SHIP1.bow + 0.8; z <= SHIP1.stern - 0.25; z += 0.45) { const w = halfWidthAt1(z) * 0.96; pts.push([w, z], [-w, z]); }
  for (let x = -1.4; x <= 1.4; x += 0.45) pts.push([x, SHIP1.stern - 0.15]);
  for (let z = SHIP1.bow + 1.5; z <= SHIP1.stern - 0.8; z += 1.4) pts.push([0, z]);   // and down the keel, for anything poking up inside
  return pts;
})();

// ---------------------------------------------------------------- the hull, decks and fittings
function buildHull(gb, pal) {
  const hull = pal.hull, hull2 = pal.hull2 || shadeHex(pal.hull, 0.78);
  const NT = 14, NR = 3, TOP = NT + NR;
  // stations along the length, with the places where something starts or stops among them
  const zs = [];
  for (let i = 0; i <= 44; i++) zs.push(SHIP1.bow + 0.02 + (SHIP1.stern - SHIP1.bow - 0.02) * (i / 44));
  for (const z of [HATCH1.z0, HATCH1.z1, SHIP1.qdZ, SHIP1.lowZ0, SHIP1.lowZ1, QSTAIRS1.z0]) zs.push(z);
  zs.sort((a, b) => a - b);
  for (let i = zs.length - 1; i > 0; i--) if (zs[i] - zs[i - 1] < 0.06) zs.splice(zs[i] === SHIP1.qdZ || zs[i] === HATCH1.z0 || zs[i] === HATCH1.z1 || zs[i] === SHIP1.lowZ0 || zs[i] === SHIP1.lowZ1 || zs[i] === QSTAIRS1.z0 ? i - 1 : i, 1);
  const NZ = zs.length - 1;
  const P = [], N = [];
  for (let i = 0; i <= NZ; i++) {
    const z = zs[i], y0 = keelY(z), y1 = baseRail(z), w = halfWidthAt1(z), up = raise(z);
    P.push([]);
    for (let j = 0; j <= TOP; j++) {
      if (j <= NT) { const t = j / NT; P[i].push([w * shape(t), y0 + (y1 - y0) * t, z]); }
      else { const y = y1 + up * ((j - NT) / NR); P[i].push([w * shape(1) * (1 - 0.02 * (y - y1)), y, z]); }
    }
  }
  for (let i = 0; i <= NZ; i++) {
    N.push([]);
    for (let j = 0; j <= TOP; j++) {
      const a = P[Math.min(NZ, i + 1)][j], b = P[Math.max(0, i - 1)][j];
      let c = P[i][Math.min(TOP, j + 1)], d = P[i][Math.max(0, j - 1)];
      if (Math.hypot(c[1] - d[1], c[0] - d[0]) < 1e-4) { c = P[i][Math.min(NT, j + 1)]; d = P[i][Math.max(0, Math.min(NT, j) - 1)]; }
      const ux = a[0] - b[0], uy = a[1] - b[1], uz = a[2] - b[2], vx = c[0] - d[0], vy = c[1] - d[1], vz = c[2] - d[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz);
      if (l < 1e-6) { N[i].push(j ? N[i][j - 1].slice() : [1, 0, 0]); continue; }
      nx /= l; ny /= l; nz /= l;
      if (nx < 0) { nx = -nx; ny = -ny; nz = -nz; }
      N[i].push([nx, ny, nz]);
    }
  }
  const colorAt = (j) => (j < 5 ? hull2 : j >= 8 && j < 10 ? pal.stripe : hull);   // bands follow the sheer
  const uvAt = (i, j) => [P[i][j][2] * 0.9, P[i][j][1] * 1.6];
  // the outer skin, both sides
  for (let i = 0; i < NZ; i++) for (let j = 0; j < TOP; j++) {
    if (Math.abs(P[i][j + 1][1] - P[i][j][1]) < 1e-4 && Math.abs(P[i + 1][j + 1][1] - P[i + 1][j][1]) < 1e-4) continue;
    const col = colorAt(j), lay = col === pal.stripe ? T.white : T.hullwood;
    for (const sd of [1, -1]) {
      const m = (q) => [q[0] * sd, q[1], q[2]];
      const a = m(P[i][j]), b = m(P[i + 1][j]), c = m(P[i][j + 1]), d = m(P[i + 1][j + 1]);
      const na = m(N[i][j]), nb = m(N[i + 1][j]), nc = m(N[i][j + 1]), nd = m(N[i + 1][j + 1]);
      // wind each triangle so it faces outward (its averaged normal)
      const tri = (p, np, up, q, nq, uq, r, nr, ur) => {
        const ex = q[0] - p[0], ey = q[1] - p[1], ez = q[2] - p[2], fx = r[0] - p[0], fy = r[1] - p[1], fz = r[2] - p[2];
        const g = (ey * fz - ez * fy) * (np[0] + nq[0] + nr[0]) + (ez * fx - ex * fz) * (np[1] + nq[1] + nr[1]) + (ex * fy - ey * fx) * (np[2] + nq[2] + nr[2]);
        if (g >= 0) gb.tri(p, np, up, q, nq, uq, r, nr, ur, col, lay); else gb.tri(p, np, up, r, nr, ur, q, nq, uq, col, lay);
      };
      tri(a, na, uvAt(i, j), b, nb, uvAt(i + 1, j), c, nc, uvAt(i, j + 1));
      tri(c, nc, uvAt(i, j + 1), b, nb, uvAt(i + 1, j), d, nd, uvAt(i + 1, j + 1));
    }
  }
  // the hold is lined with planks on the inside, so you never see the paint on the outside of the hull
  { const ys = [SHIP1.low, -0.45, -0.15, 0.2, 0.55, SHIP1.deck - 0.08], lin = shadeHex(pal.deck, 0.62);
    for (let i = 0; i < NZ; i++) {
      const za = zs[i], zb = zs[i + 1], zm = (za + zb) / 2;
      if (zm < SHIP1.lowZ0 || zm > SHIP1.lowZ1) continue;
      for (let k = 0; k < ys.length - 1; k++) for (const sd of [1, -1]) {
        const p = (z, y) => [sd * Math.max(0.05, hullHalfAt1(z, y) - 0.05), y, z];
        gb.quad(p(za, ys[k]), p(zb, ys[k]), p(za, ys[k + 1]), p(zb, ys[k + 1]), [-sd, 0, 0], lin, T.plank, [za, ys[k]], [zb, ys[k]], [za, ys[k + 1]], [zb, ys[k + 1]]);
      }
    }
  }
  // inside the bulwark: its inner face, the rail cap along the top, and the decks between
  const T_IN = 0.14, UP = [0, 1, 0];
  const floorOf = (z) => (z < SHIP1.qdZ - 1e-6 ? SHIP1.deck : SHIP1.qd);
  const inner = (i, y) => Math.max(0.05, hullHalfAt1(zs[i], y) - T_IN);
  for (let i = 0; i < NZ; i++) {
    const za = zs[i], zb = zs[i + 1], zm = (za + zb) / 2, F = floorOf(zm);
    const ra = P[i][TOP][1], rb = P[i + 1][TOP][1];
    const xa = inner(i, F + 0.3), xb = inner(i + 1, F + 0.3);
    for (const sd of [1, -1]) {
      const nIn = [-sd, 0, 0];
      gb.quad([xa * sd, F, za], [xb * sd, F, zb], [xa * sd, ra, za], [xb * sd, rb, zb], nIn, pal.rail, T.hullwood, [za, F], [zb, F], [za, ra], [zb, rb]);
      gb.quad([xa * sd, ra, za], [xb * sd, rb, zb], [P[i][TOP][0] * sd, ra, za], [P[i + 1][TOP][0] * sd, rb, zb], UP, pal.rail, T.hullwood);
    }
    // the main deck, open where the hatch goes down; the quarterdeck above the stern
    const deckQuad = (x0a, x1a, x0b, x1b, y) => gb.quad([x0a, y, za], [x1a, y, za], [x0b, y, zb], [x1b, y, zb], UP, pal.deck, T.plank, [x0a, za], [x1a, za], [x0b, zb], [x1b, zb]);
    if (F === SHIP1.qd) deckQuad(-xa, xa, -xb, xb, SHIP1.qd);
    else if (zm > HATCH1.z0 && zm < HATCH1.z1) { deckQuad(-xa, HATCH1.x0, -xb, HATCH1.x0, SHIP1.deck); deckQuad(HATCH1.x1, xa, HATCH1.x1, xb, SHIP1.deck); }
    else deckQuad(-xa, xa, -xb, xb, SHIP1.deck);
    // the hold's floor
    if (zm > SHIP1.lowZ0 && zm < SHIP1.lowZ1) {
      const la = holdHalfWidth1(za), lb = holdHalfWidth1(zb);
      gb.quad([-la, SHIP1.low, za], [la, SHIP1.low, za], [-lb, SHIP1.low, zb], [lb, SHIP1.low, zb], UP, shadeHex(pal.deck, 0.82), T.plank, [-la, za], [la, za], [-lb, zb], [lb, zb]);
    }
    // a plank layer just under the main deck, so the hold has a ceiling
    if (zm > SHIP1.lowZ0 && zm < SHIP1.lowZ1 && !(zm > HATCH1.z0 && zm < HATCH1.z1)) {
      const ca = Math.max(0.1, hullHalfAt1(za, SHIP1.deck - 0.1) - 0.06), cb = Math.max(0.1, hullHalfAt1(zb, SHIP1.deck - 0.1) - 0.06);
      gb.quad([-ca, SHIP1.deck - 0.1, za], [ca, SHIP1.deck - 0.1, za], [-cb, SHIP1.deck - 0.1, zb], [cb, SHIP1.deck - 0.1, zb], [0, -1, 0], shadeHex(pal.deck, 0.6), T.plank);
    }
  }
  // Caulking seams and fasteners break up the hold's broad plank floor.
  gb.round = 0.01;
  for (let z = SHIP1.lowZ0 + 0.35; z < SHIP1.lowZ1 - 0.25; z += 0.42) {
    const half = holdHalfWidth1(z) - 0.08, y = SHIP1.low + 0.004;
    if (half <= 0.12) continue;
    gb.quad([-half, y, z - 0.012], [half, y, z - 0.012], [-half, y, z + 0.012], [half, y, z + 0.012], UP, shadeHex(pal.deck, 0.48), T.hullwood);
    for (const x of [-half + 0.12, half - 0.12]) gb.cyl(x, y, z, x, y + 0.004, z, 0.024, 0.024, '#59412c', T.white, 6);
  }
  gb.round = 0;
  for (const ladder of SIDE_LADDERS1) {
    const x = ladder.x, z = ladder.z, bottom = ladder.bottom, top = SHIP1.deck + 0.18;
    gb.round = 0.025;
    for (const dz of [-0.28, 0.28]) {
      gb.box(x - 0.045, bottom, z + dz - 0.04, x + 0.045, top, z + dz + 0.04, pal.rail, T.hullwood);
      gb.box(x - 0.13, 0.2, z + dz - 0.055, x + 0.04, 0.29, z + dz + 0.055, pal.rail, T.hullwood);
    }
    for (let y = bottom + 0.12; y < top; y += 0.28) {
      gb.box(x - 0.12, y, z - 0.30, x + 0.13, y + 0.075, z + 0.30, pal.deck, T.plank);
    }
    gb.round = 0;
  }
  // the front of the quarterdeck: a wall from the main deck up, with the stairs either side
  { const z = SHIP1.qdZ, x = inner(zs.indexOf(SHIP1.qdZ) >= 0 ? zs.indexOf(SHIP1.qdZ) : 0, SHIP1.qd);
    gb.quad([-x, SHIP1.deck, z], [x, SHIP1.deck, z], [-x, SHIP1.qd, z], [x, SHIP1.qd, z], [0, 0, -1], shadeHex(pal.rail, 1.15), T.hullwood);
    gb.round = 0.03;
    gb.box(-x, SHIP1.qd - 0.02, z - 0.08, x, SHIP1.qd + 0.06, z + 0.04, pal.rail, T.hullwood);
    // a rail along the quarterdeck's front edge, open over the stairs
    for (const [a, b] of [[-x, QSTAIRS1.xs[1][0] - 0.05], [QSTAIRS1.xs[1][1] + 0.05, QSTAIRS1.xs[0][0] - 0.05], [QSTAIRS1.xs[0][1] + 0.05, x]]) {
      if (b - a < 0.1) continue;
      gb.box(a, SHIP1.qd + 0.72, z - 0.05, b, SHIP1.qd + 0.8, z + 0.05, pal.rail, T.hullwood);
      for (let px = a + 0.05; px < b; px += 0.42) gb.box(px - 0.035, SHIP1.qd, z - 0.035, px + 0.035, SHIP1.qd + 0.72, z + 0.035, pal.rail, T.hullwood);
    }
    gb.round = 0;
  }
  // stairs up to the quarterdeck
  for (const [a, b] of QSTAIRS1.xs) {
    const n = 5, dz = (QSTAIRS1.z1 - QSTAIRS1.z0) / n, dy = (SHIP1.qd - SHIP1.deck) / n;
    for (let k = 0; k < n; k++) gb.box(a, SHIP1.deck, QSTAIRS1.z0 + k * dz, b, SHIP1.deck + (k + 1) * dy, QSTAIRS1.z0 + (k + 1) * dz, pal.deck, T.plank);
    gb.box(a - 0.06, SHIP1.deck, QSTAIRS1.z0, a, SHIP1.qd + 0.05, QSTAIRS1.z1, pal.rail, T.hullwood);
    gb.box(b, SHIP1.deck, QSTAIRS1.z0, b + 0.06, SHIP1.qd + 0.05, QSTAIRS1.z1, pal.rail, T.hullwood);
  }
  // the hatch: a coaming around it, and steep stairs down into the hold
  { const { x0, x1, z0, z1 } = HATCH1, n = 7, dz = (z1 - z0) / n, dy = (SHIP1.deck - SHIP1.low) / n;
    for (let k = 0; k < n; k++) { const y = SHIP1.deck - (k + 1) * dy; gb.box(x0 + 0.08, y - 0.06, z0 + k * dz, x1 - 0.08, y, z0 + (k + 1) * dz, pal.deck, T.plank); }
    gb.box(x0 + 0.02, SHIP1.low, z0, x0 + 0.08, SHIP1.deck, z1, pal.rail, T.hullwood); gb.box(x1 - 0.08, SHIP1.low, z0, x1 - 0.02, SHIP1.deck, z1, pal.rail, T.hullwood);
    gb.box(x0 - 0.1, SHIP1.deck, z0 - 0.1, x0, SHIP1.deck + 0.1, z1 + 0.1, pal.rail, T.hullwood); gb.box(x1, SHIP1.deck, z0 - 0.1, x1 + 0.1, SHIP1.deck + 0.1, z1 + 0.1, pal.rail, T.hullwood);
    gb.box(x0, SHIP1.deck, z0 - 0.1, x1, SHIP1.deck + 0.1, z0, pal.rail, T.hullwood);
  }
  // bulkheads closing the hold fore and aft
  for (const [z, nz] of [[SHIP1.lowZ0, 1], [SHIP1.lowZ1, -1]]) {
    const ys = [SHIP1.low, -0.3, 0.1, 0.5, SHIP1.deck];
    for (let k = 0; k < ys.length - 1; k++) {
      const wa = hullHalfAt1(z, ys[k]) - 0.04, wb = hullHalfAt1(z, ys[k + 1]) - 0.04;
      gb.quad([-wa, ys[k], z], [wa, ys[k], z], [-wb, ys[k + 1], z], [wb, ys[k + 1], z], [0, 0, nz], shadeHex(pal.deck, 0.72), T.plank, [-wa, ys[k]], [wa, ys[k]], [-wb, ys[k + 1]], [wb, ys[k + 1]]);
    }
  }
  // the transom across the stern, and the stem closing the bow
  for (const [i, nz] of [[NZ, 1], [0, -1]]) {
    const n = [0, 0, nz], z = P[i][0][2];
    if (i === NZ) {
      for (let j = 0; j < TOP; j++) {
        const a = P[i][j], b = P[i][j + 1];
        gb.quad([-a[0], a[1], z], [a[0], a[1], z], [-b[0], b[1], z], [b[0], b[1], z], n, colorAt(j), T.hullwood);
      }
    } else {
      const c = [0, (keelY(z) + P[i][TOP][1]) / 2, z];
      for (let j = 0; j < TOP; j++) for (const sd of [1, -1]) {
        const a = [P[i][j][0] * sd, P[i][j][1], z], b = [P[i][j + 1][0] * sd, P[i][j + 1][1], z];
        gb.face(c, a, b, n, hull, T.hullwood);
      }
    }
  }
  gb.round = 0.03;
  // stern windows under the quarterdeck, a lantern bracket
  for (const sx of [-0.75, 0, 0.75]) gb.box(sx - 0.2, 1.35, SHIP1.stern + 0.005, sx + 0.2, 1.75, SHIP1.stern + 0.06, '#f2c46a');
  // the mast through every deck, its yards, the bowsprit
  gb.round = 0.05;
  gb.cyl(0, SHIP1.low, SHIP1.mastZ, 0, SHIP1.top, SHIP1.mastZ, 0.21, 0.12, pal.mast, T.log_side, 12);
  gb.cyl(-2.7, 9.12, SHIP1.mastZ, 2.7, 9.12, SHIP1.mastZ, 0.1, 0.1, pal.mast, T.log_side, 8);
  gb.cyl(-2.3, 2.9, SHIP1.mastZ, 2.3, 2.9, SHIP1.mastZ, 0.1, 0.1, pal.mast, T.log_side, 8);
  gb.cyl(0, 1.5, SHIP1.bow + 0.4, 0, 1.75, -8.4, 0.13, 0.07, pal.mast, T.log_side, 8);
  // a ladder up the back of the mast, and the crow's nest it leads to
  gb.round = 0.015;
  const lz = SHIP1.mastZ + 0.24;
  for (const sx of [-0.17, 0.17]) gb.box(sx - 0.03, SHIP1.deck, lz - 0.03, sx + 0.03, SHIP1.nest, lz + 0.03, pal.rail, T.hullwood);
  for (let y = SHIP1.deck + 0.3; y < SHIP1.nest - 0.1; y += 0.34) gb.box(-0.17, y - 0.025, lz - 0.025, 0.17, y + 0.025, lz + 0.025, pal.rail, T.hullwood);
  gb.round = 0.03;
  const R = NEST_R1, nz0 = SHIP1.mastZ;
  gb.box(-R, SHIP1.nest - 0.12, nz0 - R, R, SHIP1.nest, nz0 - 0.25, pal.deck, T.plank);
  gb.box(-R, SHIP1.nest - 0.12, nz0 + 0.25, R, SHIP1.nest, nz0 + R, pal.deck, T.plank);
  gb.box(-R, SHIP1.nest - 0.12, nz0 - 0.25, -0.25, SHIP1.nest, nz0 + 0.25, pal.deck, T.plank);
  gb.box(0.25, SHIP1.nest - 0.12, nz0 - 0.25, R, SHIP1.nest, nz0 + 0.25, pal.deck, T.plank);
  for (const [x0, z0, x1, z1] of [[-R, nz0 - R, R, nz0 - R + 0.08], [-R, nz0 + R - 0.08, R, nz0 + R], [-R, nz0 - R, -R + 0.08, nz0 + R], [R - 0.08, nz0 - R, R, nz0 + R]]) {
    gb.box(x0, SHIP1.nest + 0.55, z0, x1, SHIP1.nest + 0.65, z1, pal.rail, T.hullwood);
    gb.box(x0, SHIP1.nest, z0, x1, SHIP1.nest + 0.22, z1, pal.rail, T.hullwood);
  }
  for (const [x, z] of [[-R, nz0 - R], [R - 0.08, nz0 - R], [-R, nz0 + R - 0.08], [R - 0.08, nz0 + R - 0.08]]) gb.box(x, SHIP1.nest, z, x + 0.08, SHIP1.nest + 0.65, z + 0.08, pal.rail, T.hullwood);
  // carriages for the guns (the barrels are their own pieces, so they can be aimed)
  for (const g of GUNS1) {
    const p = gunPlace1(g), s = g.side, y = g.y;
    gb.box(p.cx - 0.36, y + 0.12, g.z - 0.3, p.cx + 0.36, y + 0.42, g.z + 0.3, pal.rail, T.hullwood);
    gb.box(p.cx - 0.2, y + 0.42, g.z - 0.26, p.cx + 0.2, y + 0.62, g.z - 0.16, pal.rail, T.hullwood);
    gb.box(p.cx - 0.2, y + 0.42, g.z + 0.16, p.cx + 0.2, y + 0.62, g.z + 0.26, pal.rail, T.hullwood);
    for (const wx of [-0.24, 0.24]) for (const wz of [-0.33, 0.33]) gb.cyl(p.cx + wx * s, y + 0.12, g.z + wz, p.cx + wx * s, y + 0.12, g.z + wz + Math.sign(wz) * 0.07, 0.12, 0.12, pal.metal, T.white, 8);
  }
  // the hold: your sea chest, barrels, a crate or two, a lantern
  gb.box(CHEST1.x - 0.45, SHIP1.low, CHEST1.z - 0.3, CHEST1.x + 0.45, SHIP1.low + 0.5, CHEST1.z + 0.3, '#7a4b22', T.chest_side);
  gb.box(CHEST1.x - 0.47, SHIP1.low + 0.48, CHEST1.z - 0.32, CHEST1.x + 0.47, SHIP1.low + 0.66, CHEST1.z + 0.32, '#6a3f1c', T.chest_top);
  gb.box(CHEST1.x - 0.06, SHIP1.low + 0.34, CHEST1.z + 0.31, CHEST1.x + 0.06, SHIP1.low + 0.5, CHEST1.z + 0.34, '#d6aa4f');
  for (const [x, z, h] of [[-0.75, -2.0, 0.85], [0.85, -1.4, 0.85]]) gb.cyl(x, SHIP1.low, z, x, SHIP1.low + h, z, 0.3, 0.3, '#8a5a30', T.barrel_side, 10);
  gb.box(-1.15, SHIP1.low, 2.25, -0.45, SHIP1.low + 0.7, 2.95, '#a57a45', T.crate);
  gb.box(-1.05, SHIP1.low + 0.7, 2.35, -0.55, SHIP1.low + 1.2, 2.85, '#a57a45', T.crate);
  gb.box(0.95, 0.6, -0.9, 1.15, 0.85, -0.7, '#ffcc66');
  gb.round = 0.05;
  // the wheel's stand on the quarterdeck, a lantern post at the stern
  gb.box(-0.14, SHIP1.qd, HELM1.z - 0.7, 0.14, SHIP1.qd + 0.95, HELM1.z - 0.42, pal.rail, T.hullwood);
  gb.box(-0.05, railY1(5.3), 5.3, 0.05, railY1(5.3) + 1.05, 5.4, pal.metal);
  // figurehead
  gb.box(-0.12, 0.9, SHIP1.bow - 0.35, 0.12, 1.5, SHIP1.bow + 0.2, pal.stripe);
}
// a cannon barrel pointing along +x from its trunnion
let barrelGeo = null;
function cannonBarrel() {
  if (barrelGeo) return barrelGeo;
  const g = new GeoBuilder({ round: 0.03 });
  g.cyl(-0.45, 0, 0, 0.85, 0, 0, 0.15, 0.11, '#2a2b2d', T.white, 12);
  g.cyl(0.78, 0, 0, 0.9, 0, 0, 0.13, 0.13, '#2a2b2d', T.white, 12);
  g.cyl(-0.55, 0, 0, -0.45, 0, 0, 0.07, 0.11, '#2a2b2d', T.white, 8);
  g.cyl(0, 0, -0.2, 0, 0, 0.2, 0.05, 0.05, '#2a2b2d', T.white, 8);
  barrelGeo = g.build();
  return barrelGeo;
}
// the hold sits below the waterline: an invisible lid at the waterline keeps the sea from showing inside
function waterMask() {
  const pos = [];
  const y = 0.42;
  for (let i = 0; i < 40; i++) {
    const za = SHIP1.bow + 0.4 + (SHIP1.stern - SHIP1.bow - 0.6) * (i / 40), zb = SHIP1.bow + 0.4 + (SHIP1.stern - SHIP1.bow - 0.6) * ((i + 1) / 40);
    const a = Math.max(0.02, hullHalfAt1(za, y) - 0.02), b = Math.max(0.02, hullHalfAt1(zb, y) - 0.02);
    pos.push(-a, y, za, a, y, za, -b, y, zb, -b, y, zb, a, y, za, b, y, zb);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

function emblemPath(x, name, cx, cy, s, col) {
  x.save(); x.translate(cx, cy); x.strokeStyle = col; x.fillStyle = col; x.lineWidth = s * 0.09; x.lineCap = 'round';
  if (name === 'Compass') {
    x.beginPath(); x.arc(0, 0, s * 0.62, 0, Math.PI * 2); x.stroke();
    x.beginPath(); for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4 - Math.PI / 2, r = i % 2 ? s * 0.28 : s * 0.85; x.lineTo(Math.cos(a) * r, Math.sin(a) * r); } x.closePath(); x.fill();
  } else if (name === 'Anchor') {
    x.beginPath(); x.moveTo(0, -s * 0.7); x.lineTo(0, s * 0.62); x.moveTo(-s * 0.35, -s * 0.4); x.lineTo(s * 0.35, -s * 0.4); x.stroke();
    x.beginPath(); x.arc(0, -s * 0.8, s * 0.13, 0, Math.PI * 2); x.stroke();
    x.beginPath(); x.arc(0, s * 0.12, s * 0.55, 0.15 * Math.PI, 0.85 * Math.PI); x.stroke();
  } else if (name === 'Kraken') {
    x.beginPath(); x.ellipse(0, -s * 0.3, s * 0.38, s * 0.45, 0, 0, Math.PI * 2); x.fill();
    for (let i = 0; i < 5; i++) { const ox = (i - 2) * s * 0.18; x.beginPath(); x.moveTo(ox, 0); x.bezierCurveTo(ox + (i - 2) * s * 0.25, s * 0.35, ox - (i - 2) * s * 0.2, s * 0.55, ox + (i % 2 ? 1 : -1) * s * 0.18, s * 0.8); x.stroke(); }
  } else if (name === 'Crossed blades') {
    for (const sg of [-1, 1]) { x.beginPath(); x.moveTo(sg * -s * 0.6, s * 0.6); x.quadraticCurveTo(sg * s * 0.1, -s * 0.1, sg * s * 0.55, -s * 0.75); x.stroke(); x.fillRect(sg * -s * 0.5 - s * 0.14, s * 0.43, s * 0.28, s * 0.08); }
  } else if (name === 'Gull') {
    x.beginPath(); x.moveTo(-s * 0.8, -s * 0.05); x.quadraticCurveTo(-s * 0.35, -s * 0.5, 0, 0); x.quadraticCurveTo(s * 0.35, -s * 0.5, s * 0.8, -s * 0.05); x.stroke();
  } else if (name === 'Skull') {
    x.beginPath(); x.arc(0, -s * 0.15, s * 0.45, Math.PI, 0); x.lineTo(s * 0.45, s * 0.2); x.lineTo(s * 0.25, s * 0.35); x.lineTo(-s * 0.25, s * 0.35); x.lineTo(-s * 0.45, s * 0.2); x.closePath(); x.fill();
    x.globalCompositeOperation = 'destination-out';
    x.beginPath(); x.arc(-s * 0.18, -s * 0.08, s * 0.12, 0, Math.PI * 2); x.arc(s * 0.18, -s * 0.08, s * 0.12, 0, Math.PI * 2); x.fill();
    x.globalCompositeOperation = 'source-over';
    for (const sg of [-1, 1]) { x.beginPath(); x.moveTo(sg * -s * 0.75, s * 0.55); x.lineTo(sg * s * 0.75, s * 0.9); x.stroke(); }
  }
  x.restore();
}

function sailTexture(color, emblem, tattered, seed = 1) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 160;
  const x = c.getContext('2d');
  x.fillStyle = color; x.fillRect(0, 0, 128, 160);
  const base = new THREE.Color(color);
  const dark = base.clone().multiplyScalar(0.82).getStyle();
  x.strokeStyle = dark; x.lineWidth = 2;
  for (let i = 1; i < 5; i++) { x.beginPath(); x.moveTo(i * 25.6, 0); x.lineTo(i * 25.6, 160); x.stroke(); }
  x.lineWidth = 3; x.strokeRect(1.5, 1.5, 125, 157);
  const lum = base.r * 0.3 + base.g * 0.59 + base.b * 0.11;
  const ink = tattered ? 'rgba(170,255,220,0.75)' : lum > 0.45 ? 'rgba(30,26,22,0.82)' : 'rgba(240,230,205,0.85)';
  if (emblem && emblem !== 'None') emblemPath(x, emblem, 64, 78, 38, ink);
  if (tattered) {
    let s = seed * 9301;
    const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    x.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 9; i++) { x.beginPath(); x.arc(rnd() * 128, 30 + rnd() * 120, 4 + rnd() * 9, 0, Math.PI * 2); x.fill(); }
    x.beginPath(); x.moveTo(0, 160);
    for (let px = 0; px <= 128; px += 8) x.lineTo(px, 140 + rnd() * 20);
    x.lineTo(128, 160); x.closePath(); x.fill();
    x.globalCompositeOperation = 'source-over';
  } else {
    x.fillStyle = dark; x.fillRect(84, 20, 14, 12); x.fillRect(18, 118, 12, 14);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function nameTexture(name) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 64;
  const draw = () => {
    const x = c.getContext('2d');
    x.clearRect(0, 0, 512, 64);
    x.fillStyle = '#2a1d12'; x.fillRect(0, 0, 512, 64);
    x.fillStyle = '#e2bd62'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = 'italic 38px "IM Fell English", Georgia, serif';
    x.fillText(name, 256, 34);
    tex.needsUpdate = true;
  };
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  draw();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);
  return tex;
}
function sailGeo(w, h) {
  const g = new THREE.PlaneGeometry(w, h, 8, 8);
  g.translate(0, -h / 2, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), u = x / (w / 2), v = -y / h;
    p.setZ(i, -(1 - u * u) * Math.sin(Math.PI * Math.min(1, v * 0.95 + 0.05)));
  }
  g.computeVertexNormals();
  return g;
}

let NID = 0;
export class Ship {
  constructor(scene, kind, opts = {}) {
    this.scene = scene; this.kind = kind; this.variant = opts.variant || 'normal';
    this.faction = kind === 'sloop' ? 'crew' : kind;
    if (SHIP_NAMES[kind]) this.name = opts.name || SHIP_NAMES[kind][(opts.nameIx ?? (Math.random() * 99) | 0) % SHIP_NAMES[kind].length];
    this.nid = ++NID; this.remote = null;
    this.size = SCALE;   // the flagship stands out by her flags, guns and hull, not her size: everyone walks the same plan
    this.group = new THREE.Group();
    this.body = new THREE.Group(); this.body.scale.setScalar(this.size);
    this.group.add(this.body);
    scene.add(this.group);
    this.pos = new THREE.Vector3(0, WATER_Y, 0);
    this.heading = 0; this.speed = 0; this.sailLvl = 0; this.rudder = 0; this.reverse = false;
    this.baseSpeed = kind === 'sloop' ? 14 : kind === 'merchant' ? 10 : kind === 'navy' ? 12.6 : 11.4;
    this.maxSpeed = this.baseSpeed; this.speedMul = 1; this.hold = 1;
    this.maxHp = kind === 'sloop' ? 120 : kind === 'merchant' ? 90 : kind === 'navy' ? 150 : 110; this.hp = this.maxHp;
    this.guns = this.variant === 'flagship' ? 3 : 2; this.dmgMul = 1; this.reloadMul = 1;
    this.sinking = false; this.sinkT = 0; this.cool = { port: 0, star: 0 };
    this.pitch = 0; this.roll = 0; this.bumpCD = 0; this.smokeT = 0; this.wakeT = 0; this.wf = 1;
    this.build(opts.look);
  }
  build(look) {
    this.body.traverse((o) => {
      if (o === this.body) return;
      if (o.geometry) o.geometry.dispose();
      if (o.material) { if (o.material.map && !o.isSprite) o.material.map.dispose(); o.material.dispose(); }
    });
    this.body.clear();
    const kind = this.kind;
    const base = BASE[kind];
    const pal = { ...base };
    if (kind === 'sloop') {
      const L = look || {};
      pal.hull = (LOOKS.hull[L.hull] || LOOKS.hull[0]).c;
      pal.sail = (LOOKS.sail[L.sail] || LOOKS.sail[0]).c;
      pal.emblem = LOOKS.emblem[L.emblem] || 'Compass';
      pal.name = L.ship || 'The Salt Wren';
    } else if (kind === 'hollow') pal.emblem = 'Skull';
    else { pal.name = this.name || SHIP_NAMES[kind][0]; pal.emblem = base.emblem; }
    const gb = new GeoBuilder(); buildHull(gb, pal);
    this.hullHex = new THREE.Color(pal.hull || '#6b4426').getHex();
    if (kind === 'hollow') {
      for (let i = 0; i < 9; i++) { const z = -4.5 + i * 1.1, s = i % 2 ? 1 : -1, w = halfWidthAt1(z); gb.box(s * w - 0.06, -0.6 - (i % 3) * 0.2, z, s * w + 0.06, 0.9, z + 0.25, '#3f6b45'); }
    }
    this.hull = new THREE.Mesh(gb.build(), voxelMaterial());
    this.hull.castShadow = true; this.hull.receiveShadow = true;
    this.body.add(this.hull);
    // guns that can be aimed one at a time
    this.barrels = GUNS1.map((g) => {
      const p = gunPlace1(g), grp = new THREE.Group();
      grp.position.set(p.px, p.py, g.z);
      grp.rotation.order = 'YZX';
      grp.rotation.y = g.side > 0 ? 0 : Math.PI;
      const m = new THREE.Mesh(cannonBarrel(), this.hull.material); m.castShadow = true;
      grp.add(m); this.body.add(grp);
      return grp;
    });
    this.gunCD = GUNS1.map(() => 0); this.gunAim = GUNS1.map(() => [0, 0.08]); this.recoil = GUNS1.map(() => 0);
    const mask = new THREE.Mesh(waterMask(), new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide }));
    mask.renderOrder = 1;
    this.body.add(mask);
    const sailMat = new THREE.MeshLambertMaterial({ map: sailTexture(pal.sail, pal.emblem, kind === 'hollow', 3), side: THREE.DoubleSide, transparent: kind === 'hollow', alphaTest: kind === 'hollow' ? 0.4 : 0 });
    this.sail = new THREE.Mesh(sailGeo(4.9, 6.0), sailMat);
    this.sail.position.set(0, 9.0, -0.85); this.sail.castShadow = true;
    this.body.add(this.sail);
    const jg = new THREE.BufferGeometry();
    jg.setAttribute('position', new THREE.Float32BufferAttribute([0, 8.6, -0.75, 0, 1.75, -8.2, 0, 1.8, -5.5], 3));
    jg.setAttribute('uv', new THREE.Float32BufferAttribute([0.5, 1, 0, 0, 1, 0], 2));
    jg.computeVertexNormals();
    this.jib = new THREE.Mesh(jg, new THREE.MeshLambertMaterial({ color: kind === 'hollow' ? 0x4a5852 : new THREE.Color(pal.sail).multiplyScalar(0.95), side: THREE.DoubleSide, transparent: kind === 'hollow', opacity: kind === 'hollow' ? 0.85 : 1 }));
    this.jib.castShadow = true;
    this.body.add(this.jib);
    const rig = [0, 11.2, -0.5, 2.0, 1.62, -1.9, 0, 11.2, -0.5, -2.0, 1.62, -1.9, 0, 11.2, -0.5, 2.0, 1.62, 0.6, 0, 11.2, -0.5, -2.0, 1.62, 0.6,
      0, 11.2, -0.5, 0, 1.6, -8.3, 0, 11.2, -0.5, 0, 3.3, 5.3, 2.7, 9.1, -0.5, 2.0, 1.62, -0.6, -2.7, 9.1, -0.5, -2.0, 1.62, -0.6];
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(rig, 3));
    this.body.add(new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: kind === 'hollow' ? 0x3a4a40 : 0x3b2a1c })));
    const fg = new THREE.PlaneGeometry(1.3, 0.7); fg.translate(0.65, 0, 0);
    this.flag = new THREE.Mesh(fg, new THREE.MeshLambertMaterial({ color: pal.flag, side: THREE.DoubleSide }));
    this.flag.position.set(0, SHIP1.top - 0.1, SHIP1.mastZ); this.flag.rotation.y = -Math.PI / 2;
    this.body.add(this.flag);
    this.wheel = new THREE.Group();
    const wm = new THREE.MeshLambertMaterial({ color: pal.rail });
    this.wheel.add(new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 6, 14), wm));
    for (let i = 0; i < 4; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.06, 0.06), wm); s.rotation.z = (i * Math.PI) / 4; this.wheel.add(s); }
    this.wheel.position.set(HELM1.x, SHIP1.qd + 0.98, HELM1.z - 0.56);
    this.body.add(this.wheel);
    this.lantern = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.34, 0.28), new THREE.MeshBasicMaterial({ color: base.lantern }));
    this.lantern.position.set(0, railY1(5.3) + 1.2, 5.35);
    this.body.add(this.lantern);
    this.glow = glowSprite(base.lantern, 3.2, 0);
    this.glow.position.copy(this.lantern.position);
    this.body.add(this.glow);
    if (kind === 'sloop') {
      this.light = new THREE.PointLight(base.lantern, 0, 18, 1.2); this.light.position.set(0, railY1(5.3) + 1.3, 5.2); this.body.add(this.light);
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.32), new THREE.MeshLambertMaterial({ map: nameTexture(pal.name) }));
      plate.position.set(0, 0.6, SHIP1.stern + 0.111); this.body.add(plate);
    } else {
      for (const [x, y, z] of [[-1.6, 1.9, -3.2], [1.6, 1.9, -3.2], [0, SHIP1.nest + 1.0, SHIP1.mastZ], [0, 1.4, SHIP1.bow - 0.4]]) { const s = glowSprite(base.lantern, 2.2, 0.55); s.position.set(x, y, z); this.body.add(s); }
    }
  }
  setLook(look) { if (this.kind === 'sloop') this.build(look); }
  place(x, z, h) { this.pos.set(x, WATER_Y, z); this.heading = h; this.speed = 0; this.sailLvl = 0; this.applyTransform(); }
  forward(out) { return out.set(-Math.sin(this.heading), 0, -Math.cos(this.heading)); }
  toLocal(wx, wz, out) {
    const dx = wx - this.pos.x, dz = wz - this.pos.z, c = Math.cos(this.heading), s = Math.sin(this.heading);
    out.x = dx * c - dz * s; out.z = dx * s + dz * c; return out;
  }
  containsPoint(x, y, z) {
    const dx = x - this.pos.x, dz = z - this.pos.z, c = Math.cos(this.heading), s = Math.sin(this.heading);
    const k = this.size, lx = (dx * c - dz * s) / k, lz = (dx * s + dz * c) / k, ly = (y - this.pos.y) / k;
    return ly > -1.7 && ly < (lz > SHIP1.qdZ ? 3.2 : 2.6) && lz > SHIP1.bow - 0.4 && lz < SHIP1.stern + 0.4 && Math.abs(lx) < halfWidthAt1(lz) + 0.35;
  }
  windFactor(wind) {
    const fx = -Math.sin(this.heading), fz = -Math.cos(this.heading);
    const dot = fx * Math.cos(wind.angle) + fz * Math.sin(wind.angle);
    return 0.45 + 0.55 * (dot + 1) / 2;
  }
  // Where the hull would touch land with its centre at (x, z) and heading h: the middle of the touching points
  // round the outline (null when clear). Two blocks of water under the keel are enough to float.
  groundContact(world, x, z, h) {
    const c = Math.cos(h), s = Math.sin(h), k = this.size;
    let n = 0, sx = 0, sz = 0;
    for (const [lx0, lz0] of OUTLINE) {
      const lx = lx0 * k, lz = lz0 * k, wx = x + lx * c + lz * s, wz = z - lx * s + lz * c;
      const bx = Math.floor(wx), bz = Math.floor(wz);
      if (world.solid(bx, SEA - 1, bz) || world.solid(bx, SEA, bz)) { n++; sx += wx; sz += wz; }
    }
    return n ? { n, x: sx / n, z: sz / n } : null;
  }
  hullHits(world, x, z, h) { return !!this.groundContact(world, x, z, h); }
  // the hull's collision circles in the world, [x, z, radius] each
  hullCircles(out = this.circ || (this.circ = HULL_CIRCLES.map(() => [0, 0, 0]))) {
    const s = Math.sin(this.heading), c = Math.cos(this.heading), k = this.size;
    for (let i = 0; i < HULL_CIRCLES.length; i++) { const [z, r] = HULL_CIRCLES[i]; out[i][0] = this.pos.x + z * k * s; out[i][1] = this.pos.z + z * k * c; out[i][2] = r * k; }
    return out;
  }
  damage(n, G) {
    if (this.sinking) return;
    this.hp -= n;
    if (this.hp <= 0) { this.hp = 0; this.sinking = true; this.sinkT = 0; this.speed = 0; G.onShipSunk(this); }
  }
  // where gun i's muzzle is in the world, and the way it points
  muzzle(i) {
    const b = this.barrels[i];
    this.group.updateMatrixWorld();
    const p = _mv.set(0.95, 0, 0).applyMatrix4(b.matrixWorld), d = _md.set(1, 0, 0).transformDirection(b.matrixWorld);
    return { x: p.x, y: p.y, z: p.z, dx: d.x, dy: d.y, dz: d.z };
  }
  aimGuns(dt) {
    for (let i = 0; i < this.barrels.length; i++) {
      this.gunCD[i] -= dt;
      this.recoil[i] = Math.max(0, this.recoil[i] - dt * 2.6);
      const b = this.barrels[i], g = GUNS1[i];
      b.rotation.y = (g.side > 0 ? 0 : Math.PI) + this.gunAim[i][0];
      b.rotation.z = this.gunAim[i][1];
      b.children[0].position.x = -this.recoil[i] * this.recoil[i] * 0.3;
    }
  }
  update(dt, G) {
    const t = G.waveTime;
    this.cool.port -= dt; this.cool.star -= dt; this.bumpCD -= dt;
    this.aimGuns(dt);
    const n = G.sky.night;
    this.glow.material.opacity = 0.25 + n * 0.75;
    if (this.light) this.light.intensity = n * 9;
    if (this.sinking) {
      this.sinkT += dt;
      this.pos.y -= dt * (0.35 + this.sinkT * 0.22);
      this.pitch += dt * 0.07; this.roll += dt * 0.035;
      this.applyTransform();
      if (Math.random() < dt * 12) G.particles.burst(this.pos.x + (Math.random() - 0.5) * 4, WATER_Y + 0.3, this.pos.z + (Math.random() - 0.5) * 6, 0xd8f0f4, 3, 1.5, 2.5, 9, 0.8, 1);
      return;
    }
    if (this.remote) this.remoteStep(dt, G); else this.physics(dt, G);
    const fx = -Math.sin(this.heading), fz = -Math.cos(this.heading);
    const rx = Math.cos(this.heading), rz = -Math.sin(this.heading);
    const wy = waveHeight(this.pos.x, this.pos.z, t);
    const L4 = 4 * this.size, L2 = 2 * this.size;
    const fY = waveHeight(this.pos.x + fx * L4, this.pos.z + fz * L4, t), bY = waveHeight(this.pos.x - fx * L4, this.pos.z - fz * L4, t);
    const rY = waveHeight(this.pos.x + rx * L2, this.pos.z + rz * L2, t), lY = waveHeight(this.pos.x - rx * L2, this.pos.z - rz * L2, t);
    this.pos.y = WATER_Y + wy * 0.7;
    this.pitch = (fY - bY) * 0.07 / this.size;
    this.roll = (rY - lY) * 0.1 / this.size + this.rudder * Math.min(1, Math.abs(this.speed) / 8) * 0.05;
    this.applyTransform();
    this.showSail(this.preview ? 1 : this.sailLvl);
    this.wheel.rotation.z = -this.rudder * 2.4;
    this.flag.rotation.y = -Math.PI / 2 + Math.sin(t * 7 + this.pos.x) * 0.25;
    // wake and bow spray
    const sp = Math.abs(this.speed);
    if (sp > 1.2) {
      this.wakeT -= dt;
      if (this.wakeT <= 0) {
        this.wakeT = 0.05;
        const k = this.size, sx = this.pos.x - fx * 5.6 * k, sz = this.pos.z - fz * 5.6 * k;
        G.particles.burst(sx + rx * (Math.random() - 0.5) * 2, WATER_Y + 0.15, sz + rz * (Math.random() - 0.5) * 2, 0xeef8fa, 2, 0.6, 0.4, 0.6, 1.6, 0.6);
        if (sp > 4.5) for (const s of [-1, 1]) G.particles.burst(this.pos.x + fx * 4.6 * k + rx * s * 1.3, WATER_Y + 0.4, this.pos.z + fz * 4.6 * k + rz * s * 1.3, 0xf4fbfb, 1, 1.4, 1.6, 9, 0.6, 0.2);
      }
    }
    if (this.hp < this.maxHp * 0.5) {
      this.smokeT -= dt;
      if (this.smokeT <= 0) { this.smokeT = 0.12 + (this.hp / this.maxHp) * 0.3; G.particles.burst(this.pos.x, this.pos.y + 1.6, this.pos.z, 0x55595c, 2, 0.5, 2.5, -2, 1.6, 1.4); }
    }
    if (this.kind === 'hollow' && Math.random() < dt * 8) G.particles.burst(this.pos.x + (Math.random() - 0.5) * 6, this.pos.y + 0.6, this.pos.z + (Math.random() - 0.5) * 9, 0x9fd8c0, 1, 0.3, 0.3, -0.4, 2.2, 1);
  }
  physics(dt, G) {
    this.wf = this.windFactor(G.wind);
    if (this.kind === 'hollow') this.wf = Math.max(this.wf, 0.8);
    const stormBoost = 1 + G.weather.storm * 0.15;
    let target = this.preview ? 0 : this.maxSpeed * this.speedMul * this.sailLvl * this.wf * stormBoost * this.hold;
    if (this.reverse) target = -1.6 * this.hold;
    this.speed += (target - this.speed) * Math.min(1, dt * (target > this.speed ? 0.38 : 0.65));
    const turn = this.rudder * (0.2 + 0.5 * Math.min(1, Math.abs(this.speed) / 6)) * (this.speed < -0.1 ? -1 : 1) / Math.sqrt(this.size);
    const prevH = this.heading, w = G.world;
    const turnH = this.heading - turn * dt;
    const step = (h) => [this.pos.x - Math.sin(h) * this.speed * dt, this.pos.z - Math.cos(h) * this.speed * dt];
    let [nx, nz] = step(turnH);
    const hit = this.groundContact(w, nx, nz, turnH);
    if (!hit) { this.heading = turnH; this.pos.x = nx; this.pos.z = nz; }
    else {
      // which way is off the land, and how squarely the bow meets it (1 = head on, 0 = scraping along)
      let ux = nx - hit.x, uz = nz - hit.z; const ul = Math.hypot(ux, uz) || 1; ux /= ul; uz /= ul;
      const dir = this.speed < 0 ? -1 : 1, fx = -Math.sin(this.heading) * dir, fz = -Math.cos(this.heading) * dir;
      const into = Math.max(0, -(fx * ux + fz * uz));
      let ok = false;
      if (into < 0.8 && Math.abs(this.speed) > 0.3) {
        // a glancing touch: the bow swings off the land and she slides along it, losing some way
        const away = (fx * uz - fz * ux) > 0 ? -1 : 1;
        const h = this.heading + away * dir * (0.35 + 0.9 * into) * dt;
        const sp = this.speed * (1 - 0.6 * into);
        const gx = this.pos.x - Math.sin(h) * sp * dt + ux * 0.03, gz = this.pos.z - Math.cos(h) * sp * dt + uz * 0.03;
        if (!this.hullHits(w, gx, gz, h)) { this.heading = h; this.pos.x = gx; this.pos.z = gz; this.speed = this.speed + (sp - this.speed) * Math.min(1, dt * 4); ok = true; }
      }
      if (!ok) {
        [nx, nz] = step(prevH);
        if (!this.hullHits(w, nx, nz, prevH)) { this.pos.x = nx; this.pos.z = nz; }
        else {
          if (!this.hullHits(w, this.pos.x, this.pos.z, turnH)) this.heading = turnH;
          if (Math.abs(this.speed) > 3.2 && this.bumpCD <= 0) { this.bumpCD = 1.2; this.damage((Math.abs(this.speed) - 2.5) * 3.2 * Math.max(0.35, into), G); G.onShipBump(this); }
          this.speed *= -0.3;
        }
      }
    }
    // still touching (a swell, another ship's shove): ease off the land the way that's open
    const touch = this.groundContact(w, this.pos.x, this.pos.z, this.heading);
    if (touch) {
      let ux = this.pos.x - touch.x, uz = this.pos.z - touch.z; const ul = Math.hypot(ux, uz) || 1;
      this.pos.x += (ux / ul) * 0.08; this.pos.z += (uz / ul) * 0.08;
    }
    const m = 9;
    if (this.pos.x < m || this.pos.z < m || this.pos.x > W - m || this.pos.z > D - m) {
      this.pos.x = clamp(this.pos.x, m, W - m); this.pos.z = clamp(this.pos.z, m, D - m); this.speed *= 0.8;
    }
    this.dHeading = wrapAngle(this.heading - prevH);
  }
  // Crew side: the captain's game sails this ship. Dead-reckon from the last report and ease out the error.
  remoteStep(dt, G) {
    const r = this.remote, now = performance.now();
    const age = Math.min(0.6, Math.max(0, (now - r.at) / 1000));
    const atHelm = r.mine;
    if (!atHelm) { this.rudder = r.rudder; this.sailLvl = r.sail; }
    this.wf = this.windFactor(G.wind);
    if (this.kind === 'hollow') this.wf = Math.max(this.wf, 0.8);
    const turnOf = (rud, sp) => rud * (0.2 + 0.5 * Math.min(1, Math.abs(sp) / 6)) * (sp < -0.1 ? -1 : 1) / Math.sqrt(this.size);
    const prevH = this.heading;
    this.speed = r.speed;
    this.heading -= turnOf(this.rudder, this.speed) * dt;
    this.pos.x -= Math.sin(this.heading) * this.speed * dt;
    this.pos.z -= Math.cos(this.heading) * this.speed * dt;
    const th = r.h - turnOf(r.rudder, r.speed) * age;
    const tx = r.x - Math.sin(th) * r.speed * age, tz = r.z - Math.cos(th) * r.speed * age;
    const ex = tx - this.pos.x, ez = tz - this.pos.z;
    if (ex * ex + ez * ez > 144 || r.snap) { this.pos.x = tx; this.pos.z = tz; this.heading = th; r.snap = false; }
    else {
      const k = 1 - Math.exp(-dt * 3);
      this.pos.x += ex * k; this.pos.z += ez * k;
      this.heading += wrapAngle(th - this.heading) * k;
    }
    this.dHeading = wrapAngle(this.heading - prevH);
  }
  showSail(level) {
    this.sail.scale.y = 0.1 + 0.9 * level;
    this.sail.scale.z = (0.15 + 0.85 * this.wf) * (0.25 + 0.75 * level);
    this.jib.visible = level > 0.25;
  }
  applyTransform() {
    this.group.position.copy(this.pos);
    this.group.rotation.set(this.pitch, this.heading, this.roll, 'YXZ');
  }
  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }
}

const _mv = new THREE.Vector3(), _md = new THREE.Vector3();
// One shot from gun i of the ship, aimed rel radians off straight out and pitched up by pitch.
export function fireGun(G, ship, i, rel, pitch) {
  if (ship.sinking || !ship.barrels[i]) return false;
  ship.gunAim[i][0] = clamp(rel, -0.7, 0.7); ship.gunAim[i][1] = clamp(pitch, -0.28, 0.5);
  ship.aimGuns(0);
  const m = ship.muzzle(i), V0 = 36;
  const fx = -Math.sin(ship.heading), fz = -Math.cos(ship.heading);
  const vx = m.dx * V0 + fx * ship.speed, vy = m.dy * V0, vz = m.dz * V0 + fz * ship.speed;
  G.projectiles.spawn(m.x, m.y, m.z, vx, vy, vz, ship, ship.dmgMul || 1);
  G.net.onShot(ship, m.x, m.y, m.z, vx, vy, vz);
  ship.recoil[i] = 1;
  G.gunFx(ship, i);
  return true;
}
// Fire a broadside of up to `count` balls. target: {x, z, vx, vz} for aim assist, or null for a flat lob.
export function fireBroadside(G, ship, side, target, count) {
  count = Math.min(count == null ? ship.guns : count, ship.guns);
  if (ship.sinking || count <= 0) return 0;
  const key = side < 0 ? 'port' : 'star';
  if (ship.cool[key] > 0) return 0;
  ship.cool[key] = (ship.kind === 'sloop' ? 2.4 : 4.4) * ship.reloadMul;
  const c = Math.cos(ship.heading), s = Math.sin(ship.heading);
  const rx = c * side, rz = -s * side, fx = -s, fz = -c;
  const V0 = 34;
  let elev = 0.15, yawOff = 0;
  if (target) {
    let px = target.x, pz = target.z;
    for (let i = 0; i < 2; i++) {
      const tf = Math.hypot(px - ship.pos.x, pz - ship.pos.z) / V0;
      px = target.x + (target.vx || 0) * tf; pz = target.z + (target.vz || 0) * tf;
    }
    const d2 = Math.hypot(px - ship.pos.x, pz - ship.pos.z);
    elev = 0.5 * Math.asin(Math.min(1, ((d2 - (target.y || 0) * 0.5) * 9.8) / (V0 * V0))) - 0.01;
    const lim = ship.kind === 'sloop' ? 0.75 : 0.6;
    yawOff = clamp(wrapAngle(Math.atan2(pz - ship.pos.z, px - ship.pos.x) - Math.atan2(rz, rx)), -lim, lim);
  }
  const spread = ship.kind === 'sloop' ? 0.04 : 0.1;
  // the main-deck guns on that side, and a third from the quarterdeck for a flagship
  const idx = GUNS1.filter((g) => g.side === side && (g.y === SHIP1.deck || count > 2)).map((g) => g.i).slice(0, count);
  for (const gi of idx) {
    ship.recoil[gi] = 1;
    const m = ship.muzzle(gi), ox = m.x, oy = m.y, oz = m.z;
    const a = Math.atan2(rz, rx) + yawOff + (Math.random() - 0.5) * spread;
    const e = elev + (Math.random() - 0.5) * spread * 0.6;
    const vx = Math.cos(a) * Math.cos(e) * V0 + fx * ship.speed, vy = Math.sin(e) * V0, vz = Math.sin(a) * Math.cos(e) * V0 + fz * ship.speed;
    G.projectiles.spawn(ox, oy, oz, vx, vy, vz, ship, ship.dmgMul);
    G.net.onShot(ship, ox, oy, oz, vx, vy, vz);
    G.particles.burst(ox, oy, oz, 0xffb347, 6, 2.5, 1.5, 0, 0.18, 0.2);
    G.particles.burst(ox + rx * 0.6, oy + 0.2, oz + rz * 0.6, 0x9a9da0, 7, 1.2, 1.6, -1.5, 1.3, 0.5);
  }
  G.sfx.boom(G.distToListener(ship.pos.x, ship.pos.z));
  return idx.length;
}
