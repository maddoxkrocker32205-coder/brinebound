// Smooth surfaces from block data: constrained Surface Nets (after Gibson, 1998).
//
// A vertex sits in every lattice cell (the cube between eight neighbouring block centres) that the
// surface passes through. Each vertex is then relaxed toward its neighbours a few times, but never
// leaves its cell, so the smooth surface stays within half a block of the block boundary. Thin things
// (a single rib of bone, a one-block pillar) survive, and gameplay can keep reasoning in blocks.
//
// Chunks are 16x16 columns. Each chunk is computed over a wider region (an apron of APRON columns on
// every side), so a vertex shared by two chunks relaxes to exactly the same place in both.
import { W, D, H, FLOOR } from './config.js';

export const APRON = 6, RELAX = 5;
const R = 16 + APRON * 2;            // columns per side of the region
const RC = R - 1;                    // lattice cells per side

// scratch buffers, reused for every chunk
let occ = new Uint8Array(0), cellV = new Int32Array(0);
let vpos = new Float32Array(0), vtmp = new Float32Array(0), vbox = new Float32Array(0), vnor = new Float32Array(0);
let quads = new Int32Array(0), qown = new Uint8Array(0);
const grow = (a, n, T) => (a.length >= n ? a : new T(Math.max(n, a.length * 2)));

// solid: Uint8Array lookup by block id (1 = this block is part of the surface's volume)
// returns { n, pos, nor, cell, quads, nq, own } with vertices in world coordinates, or null if empty
export function surfaceNets(data, x0, z0, solid) {
  const rx0 = x0 - APRON, rz0 = z0 - APRON;
  // vertical extent: only the layers where something changes
  let ylo = H, yhi = FLOOR - 1;
  const Y0 = FLOOR - 1, Y1 = H;               // occupancy layers Y0..Y1 (Y1 is open sky)
  const NY = Y1 - Y0 + 1;
  occ = grow(occ, R * R * NY, Uint8Array);
  for (let rz = 0; rz < R; rz++) {
    const vz = rz0 + rz;
    for (let rx = 0; rx < R; rx++) {
      const vx = rx0 + rx;
      const inside = vx >= 0 && vz >= 0 && vx < W && vz < D;
      let prev = 1;
      for (let y = Y0; y <= Y1; y++) {
        let o;
        if (y < FLOOR) o = 1;
        else if (y >= H || !inside) o = 0;
        else o = solid[data[vx + W * (vz + D * y)]];
        occ[rx + R * (rz + R * (y - Y0))] = o;
        if (o !== prev) { if (y - 1 < ylo) ylo = y - 1; if (y > yhi) yhi = y; }
        prev = o;
      }
    }
  }
  if (ylo > yhi) return null;
  ylo = Math.max(Y0, ylo - 1); yhi = Math.min(Y1 - 1, yhi + 1);   // cells have min corner in [ylo, yhi - 1]
  const CY = yhi - ylo;                                              // cell layers
  const O = (rx, y, rz) => occ[rx + R * (rz + R * (y - Y0))];
  const nCells = RC * RC * CY;
  cellV = grow(cellV, nCells, Int32Array);
  cellV.fill(-1, 0, nCells);
  // ---- one vertex per crossed cell, starting at the cell centre
  let n = 0;
  const cap0 = 4096;
  vpos = grow(vpos, cap0 * 3, Float32Array); vbox = grow(vbox, cap0 * 3, Float32Array);
  for (let cy = 0; cy < CY; cy++) {
    const y = ylo + cy;
    for (let cz = 0; cz < RC; cz++) for (let cx = 0; cx < RC; cx++) {
      const a = O(cx, y, cz), b = O(cx + 1, y, cz), c = O(cx, y, cz + 1), d = O(cx + 1, y, cz + 1);
      const e = O(cx, y + 1, cz), f = O(cx + 1, y + 1, cz), g = O(cx, y + 1, cz + 1), h = O(cx + 1, y + 1, cz + 1);
      const s = a + b + c + d + e + f + g + h;
      if (s === 0 || s === 8) continue;
      if (n * 3 + 3 > vpos.length) { const np = new Float32Array(vpos.length * 2); np.set(vpos); vpos = np; const nb = new Float32Array(vbox.length * 2); nb.set(vbox); vbox = nb; }
      const wx = rx0 + cx + 0.5, wy = y + 0.5, wz = rz0 + cz + 0.5;   // cell min corner (a block centre)
      vbox[n * 3] = wx; vbox[n * 3 + 1] = wy; vbox[n * 3 + 2] = wz;
      vpos[n * 3] = wx + 0.5; vpos[n * 3 + 1] = wy + 0.5; vpos[n * 3 + 2] = wz + 0.5;
      cellV[cx + RC * (cz + RC * cy)] = n++;
    }
  }
  if (!n) return null;
  // ---- one quad per lattice edge whose two ends differ
  let nq = 0;
  quads = grow(quads, 4096 * 4, Int32Array); qown = grow(qown, 4096, Uint8Array);
  const V = (cx, cy, cz) => (cx < 0 || cz < 0 || cx >= RC || cz >= RC || cy < 0 || cy >= CY ? -1 : cellV[cx + RC * (cz + RC * cy)]);
  const addQuad = (a, b, c, d, flip, own) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (nq * 4 + 4 > quads.length) { const nqq = new Int32Array(quads.length * 2); nqq.set(quads); quads = nqq; const no = new Uint8Array(qown.length * 2); no.set(qown); qown = no; }
    if (flip) { quads[nq * 4] = a; quads[nq * 4 + 1] = d; quads[nq * 4 + 2] = c; quads[nq * 4 + 3] = b; }
    else { quads[nq * 4] = a; quads[nq * 4 + 1] = b; quads[nq * 4 + 2] = c; quads[nq * 4 + 3] = d; }
    qown[nq++] = own ? 1 : 0;
  };
  for (let cy = 0; cy <= CY; cy++) {
    const y = ylo + cy;
    if (y > Y1) break;
    for (let rz = 0; rz < R; rz++) for (let rx = 0; rx < R; rx++) {
      const o = O(rx, y, rz);
      const own = rx >= APRON && rx < APRON + 16 && rz >= APRON && rz < APRON + 16;
      // edge along +x: cells (rx, y-1..y, rz-1..rz)
      if (rx + 1 < R && o !== O(rx + 1, y, rz)) addQuad(V(rx, cy - 1, rz - 1), V(rx, cy, rz - 1), V(rx, cy, rz), V(rx, cy - 1, rz), o === 0, own);
      // edge along +y: cells (rx-1..rx, y, rz-1..rz)
      if (y + 1 <= Y1 && cy < CY && o !== O(rx, y + 1, rz)) addQuad(V(rx - 1, cy, rz - 1), V(rx - 1, cy, rz), V(rx, cy, rz), V(rx, cy, rz - 1), o === 0, own);
      // edge along +z: cells (rx-1..rx, y-1..y, rz)
      if (rz + 1 < R && o !== O(rx, y, rz + 1)) addQuad(V(rx - 1, cy - 1, rz), V(rx - 1, cy, rz), V(rx, cy, rz), V(rx, cy - 1, rz), o !== 0, own);
    }
  }
  // ---- relax: Laplacian smoothing along the mesh, each vertex kept inside its own cell
  const deg = new Int32Array(n + 1);
  for (let q = 0; q < nq; q++) for (let k = 0; k < 4; k++) deg[quads[q * 4 + k] + 1] += 2;
  for (let i = 0; i < n; i++) deg[i + 1] += deg[i];
  const adj = new Int32Array(deg[n]), fill = deg.slice(0, n);
  for (let q = 0; q < nq; q++) for (let k = 0; k < 4; k++) {
    const a = quads[q * 4 + k], b = quads[q * 4 + ((k + 1) & 3)], c = quads[q * 4 + ((k + 3) & 3)];
    adj[fill[a]++] = b; adj[fill[a]++] = c;
  }
  // which corners of each vertex's cell are solid: smoothing may round a corner, but never closer
  // than THICK to a solid block's centre, so one-block ribs and pillars stay round instead of thinning away
  const cmask = new Uint8Array(n);
  // Per-axis limits for each vertex. Smoothing shrinks thin features: left alone, a one-block shaft
  // dug into the ground closes up to a sliver around the player and the camera ends up inside the
  // rock (seeing through the world). Where an air gap (up to AIRRUN blocks) or a solid rib (one block)
  // meets a crossing edge, the vertex keeps at least AIRK / SOLK from that block's centre.
  const AIRK = 0.43, SOLK = 0.38, AIRRUN = 3, SOLRUN = 1;
  const vlo = new Float32Array(n * 3), vhi = new Float32Array(n * 3);
  const Os = (rx, y, rz) => (rx < 0 || rz < 0 || rx >= R || rz >= R ? -1 : y < Y0 ? 1 : y > Y1 ? 0 : O(rx, y, rz));
  const run = (x, y, z, ax, dir, want, max) => {     // same-kind blocks from (x,y,z) along dir, capped at max + 1
    let c = 0;
    for (let s = 1; s <= max; s++) {
      const o = Os(x + (ax === 0 ? dir * s : 0), y + (ax === 1 ? dir * s : 0), z + (ax === 2 ? dir * s : 0));
      if (o < 0) return max + 1;
      if (o !== want) return c;
      c++;
    }
    return max + 1;
  };
  // an air block is "tight" when solid closes in on it along some axis within AIRRUN blocks
  const tightC = new Map();
  const tight = (x, y, z) => {
    const key = x + R * (z + R * (y - Y0 + 1));
    let t = tightC.get(key);
    if (t !== undefined) return t;
    t = false;
    for (let a = 0; a < 3 && !t; a++) {
      const l = run(x, y, z, a, -1, 0, AIRRUN);
      if (l < AIRRUN && 1 + l + run(x, y, z, a, 1, 0, AIRRUN - 1 - l) <= AIRRUN) t = true;
    }
    tightC.set(key, t);
    return t;
  };
  for (let i = 0; i < n; i++) {
    const cx = Math.round(vbox[i * 3] - 0.5) - rx0, y = Math.round(vbox[i * 3 + 1] - 0.5), cz = Math.round(vbox[i * 3 + 2] - 0.5) - rz0;
    let m = 0;
    for (let k = 0; k < 8; k++) if (O(cx + (k & 1), y + ((k >> 1) & 1), cz + (k >> 2))) m |= 1 << k;
    cmask[i] = m;
    for (let a = 0; a < 3; a++) {
      let lo = 0.02, hi = 0.98;
      const bit = 1 << a;
      for (let k = 0; k < 8; k++) {
        if (k & bit) continue;
        const o0 = (m >> k) & 1, o1 = (m >> (k | bit)) & 1;
        if (o0 === o1) continue;
        const x = cx + (k & 1), yy = y + ((k >> 1) & 1), z = cz + (k >> 2);       // low corner of this edge
        const hx = x + (a === 0 ? 1 : 0), hy = yy + (a === 1 ? 1 : 0), hz = z + (a === 2 ? 1 : 0);
        if (o0 === 0) {   // air at the low end, solid at the high end
          if (tight(x, yy, z)) lo = Math.max(lo, AIRK);
          if (run(hx, hy, hz, a, 1, 1, SOLRUN) < SOLRUN) hi = Math.min(hi, 1 - SOLK);
        } else {
          if (tight(hx, hy, hz)) hi = Math.min(hi, 1 - AIRK);
          if (run(x, yy, z, a, -1, 1, SOLRUN) < SOLRUN) lo = Math.max(lo, SOLK);
        }
      }
      if (lo > hi) lo = hi = (lo + hi) / 2;
      vlo[i * 3 + a] = vbox[i * 3 + a] + lo; vhi[i * 3 + a] = vbox[i * 3 + a] + hi;
    }
  }
  const THICK = 0.4, T2 = THICK * THICK;
  vtmp = grow(vtmp, n * 3, Float32Array);
  let src = vpos, dst = vtmp;
  for (let it = 0; it < RELAX; it++) {
    for (let i = 0; i < n; i++) {
      const s0 = deg[i], s1 = deg[i + 1];
      const lx = vlo[i * 3], ly = vlo[i * 3 + 1], lz = vlo[i * 3 + 2], ux = vhi[i * 3], uy = vhi[i * 3 + 1], uz = vhi[i * 3 + 2];
      if (s1 === s0) { dst[i * 3] = Math.min(ux, Math.max(lx, src[i * 3])); dst[i * 3 + 1] = Math.min(uy, Math.max(ly, src[i * 3 + 1])); dst[i * 3 + 2] = Math.min(uz, Math.max(lz, src[i * 3 + 2])); continue; }
      let sx = 0, sy = 0, sz = 0;
      for (let j = s0; j < s1; j++) { const k = adj[j] * 3; sx += src[k]; sy += src[k + 1]; sz += src[k + 2]; }
      const m = 1 / (s1 - s0);
      const bx = vbox[i * 3], by = vbox[i * 3 + 1], bz = vbox[i * 3 + 2];
      let px = Math.min(ux, Math.max(lx, sx * m));
      let py = Math.min(uy, Math.max(ly, sy * m));
      let pz = Math.min(uz, Math.max(lz, sz * m));
      const cm = cmask[i];
      for (let k = 0; k < 8; k++) {
        if (!(cm & (1 << k))) continue;
        const ex = px - (bx + (k & 1)), ey = py - (by + ((k >> 1) & 1)), ez = pz - (bz + (k >> 2));
        const d2 = ex * ex + ey * ey + ez * ez;
        if (d2 < T2 && d2 > 1e-8) { const f = THICK / Math.sqrt(d2); px = bx + (k & 1) + ex * f; py = by + ((k >> 1) & 1) + ey * f; pz = bz + (k >> 2) + ez * f; }
      }
      dst[i * 3] = Math.min(ux, Math.max(lx, px));
      dst[i * 3 + 1] = Math.min(uy, Math.max(ly, py));
      dst[i * 3 + 2] = Math.min(uz, Math.max(lz, pz));
    }
    const t = src; src = dst; dst = t;
  }
  const pos = src === vpos ? vpos.slice(0, n * 3) : vtmp.slice(0, n * 3);
  // ---- smooth normals from every quad around each vertex
  const nor = new Float32Array(n * 3);
  const tri = (a, b, c) => {
    const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2];
    const ux = pos[b * 3] - ax, uy = pos[b * 3 + 1] - ay, uz = pos[b * 3 + 2] - az;
    const vx = pos[c * 3] - ax, vy = pos[c * 3 + 1] - ay, vz = pos[c * 3 + 2] - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const v of [a, b, c]) { nor[v * 3] += nx; nor[v * 3 + 1] += ny; nor[v * 3 + 2] += nz; }
  };
  for (let q = 0; q < nq; q++) { const a = quads[q * 4], b = quads[q * 4 + 1], c = quads[q * 4 + 2], d = quads[q * 4 + 3]; tri(a, b, c); tri(a, c, d); }
  for (let i = 0; i < n; i++) {
    const x = nor[i * 3], y = nor[i * 3 + 1], z = nor[i * 3 + 2], l = Math.hypot(x, y, z) || 1;
    nor[i * 3] = x / l; nor[i * 3 + 1] = y / l; nor[i * 3 + 2] = z / l;
  }
  return { n, pos, nor, box: vbox.slice(0, n * 3), quads: quads.slice(0, nq * 4), own: qown.slice(0, nq), nq };
}

// Split each quad along its shorter diagonal. Returns triangle vertex indices (3 per triangle).
export function triangulate(S, ownedOnly) {
  const out = [];
  const { pos, quads, own, nq } = S;
  const d2 = (a, b) => { const x = pos[a * 3] - pos[b * 3], y = pos[a * 3 + 1] - pos[b * 3 + 1], z = pos[a * 3 + 2] - pos[b * 3 + 2]; return x * x + y * y + z * z; };
  for (let q = 0; q < nq; q++) {
    if (ownedOnly && !own[q]) continue;
    const a = quads[q * 4], b = quads[q * 4 + 1], c = quads[q * 4 + 2], d = quads[q * 4 + 3];
    if (d2(a, c) <= d2(b, d)) out.push(a, b, c, a, c, d);
    else out.push(a, b, d, b, c, d);
  }
  return out;
}

// A column index over triangles for fast "what is the ground height here" questions.
// tris: flat array of vertex indices; returns { tp: Float32Array 9 per tri, start, list } for columns
// x0..x0+15, z0..z0+15 (each column lists the triangles whose footprint overlaps it).
export function columnIndex(S, tris, x0, z0) {
  const { pos } = S;
  const nt = tris.length / 3;
  const tp = new Float32Array(nt * 9);
  const buckets = Array.from({ length: 256 }, () => []);
  let kept = 0;
  for (let t = 0; t < nt; t++) {
    let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9;
    for (let k = 0; k < 3; k++) {
      const v = tris[t * 3 + k];
      const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
      tp[kept * 9 + k * 3] = x; tp[kept * 9 + k * 3 + 1] = y; tp[kept * 9 + k * 3 + 2] = z;
      if (x < minx) minx = x; if (x > maxx) maxx = x; if (z < minz) minz = z; if (z > maxz) maxz = z;
    }
    const cx0 = Math.max(0, Math.floor(minx) - x0), cx1 = Math.min(15, Math.floor(maxx) - x0);
    const cz0 = Math.max(0, Math.floor(minz) - z0), cz1 = Math.min(15, Math.floor(maxz) - z0);
    if (cx0 > cx1 || cz0 > cz1) continue;
    for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) buckets[cx + cz * 16].push(kept);
    kept++;
  }
  const start = new Uint32Array(257);
  for (let i = 0; i < 256; i++) start[i + 1] = start[i] + buckets[i].length;
  const list = new Uint32Array(start[256]);
  for (let i = 0; i < 256; i++) list.set(buckets[i], start[i]);
  return { tp: tp.slice(0, kept * 9), start, list };
}

// Vertical ray at (x, z) going down from y: the highest surface point below y, with its normal's y.
// up: only surfaces facing up count (a floor), otherwise any.
export function columnDown(C, x0, z0, x, y, z) {
  const cx = Math.floor(x) - x0, cz = Math.floor(z) - z0;
  if (cx < 0 || cz < 0 || cx > 15 || cz > 15) return null;
  const { tp, start, list } = C, ci = cx + cz * 16;
  let best = -1e9, bny = 0, bdown = false;
  for (let j = start[ci]; j < start[ci + 1]; j++) {
    const t = list[j] * 9;
    const ax = tp[t], ay = tp[t + 1], az = tp[t + 2], bx = tp[t + 3], by = tp[t + 4], bz = tp[t + 5], cxx = tp[t + 6], cy = tp[t + 7], czz = tp[t + 8];
    // barycentric in xz
    const v0x = bx - ax, v0z = bz - az, v1x = cxx - ax, v1z = czz - az, v2x = x - ax, v2z = z - az;
    const den = v0x * v1z - v1x * v0z;
    if (Math.abs(den) < 1e-9) continue;
    const u = (v2x * v1z - v1x * v2z) / den, v = (v0x * v2z - v2x * v0z) / den;
    if (u < -1e-5 || v < -1e-5 || u + v > 1 + 1e-5) continue;
    const hy = ay + u * (by - ay) + v * (cy - ay);
    if (hy > y || hy <= best) continue;
    // face normal y (sign tells floor from ceiling)
    const ux = bx - ax, uy = by - ay, uz = bz - az, wx = cxx - ax, wy = cy - ay, wz = czz - az;
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const l = Math.hypot(nx, ny, nz) || 1;
    best = hy; bny = ny / l; bdown = ny < 0;
  }
  return best > -1e8 ? { y: best, ny: bny, ceiling: bdown } : null;
}

// Any ray against the triangles of one column (for aiming). Returns the nearest t in [t0, t1] or -1.
export function columnRay(C, x0, z0, cx, cz, ox, oy, oz, dx, dy, dz, t0, t1, out) {
  const lx = cx - x0, lz = cz - z0;
  if (lx < 0 || lz < 0 || lx > 15 || lz > 15) return -1;
  const { tp, start, list } = C, ci = lx + lz * 16;
  let best = -1;
  for (let j = start[ci]; j < start[ci + 1]; j++) {
    const t = list[j] * 9;
    const ax = tp[t], ay = tp[t + 1], az = tp[t + 2];
    const e1x = tp[t + 3] - ax, e1y = tp[t + 4] - ay, e1z = tp[t + 5] - az;
    const e2x = tp[t + 6] - ax, e2y = tp[t + 7] - ay, e2z = tp[t + 8] - az;
    const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-9) continue;
    const inv = 1 / det;
    const sx = ox - ax, sy = oy - ay, sz = oz - az;
    const u = (sx * px + sy * py + sz * pz) * inv;
    if (u < 0 || u > 1) continue;
    const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
    const v = (dx * qx + dy * qy + dz * qz) * inv;
    if (v < 0 || u + v > 1) continue;
    const tt = (e2x * qx + e2y * qy + e2z * qz) * inv;
    if (tt < t0 || tt > t1 || (best >= 0 && tt >= best)) continue;
    best = tt;
    if (out) {
      let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
      const l = Math.hypot(nx, ny, nz) || 1;
      out.nx = nx / l; out.ny = ny / l; out.nz = nz / l;
    }
  }
  return best;
}
