import * as THREE from 'three';
import { FACES, T } from './config.js';

const _c = new THREE.Color();
const TRI = [0, 1, 2, 2, 1, 3];

// Merges axis-aligned boxes into one geometry with vertex colours and optional texture-array tiles.
const GRID = [0, 1 / 3, 2 / 3, 1];
export function appendRoundedBox(A, x0, y0, z0, x1, y1, z1, layers, shade = 1, radius = 0.06, cornerFactors = null, faceUVs = null, adjacent = null) {
  const lo = [x0, y0, z0], hi = [x1, y1, z1];
  const r = Math.min(radius, 0.45 * (x1 - x0), 0.45 * (y1 - y0), 0.45 * (z1 - z0));
  const P = [0, 0, 0], Q = [0, 0, 0];
  for (let f = 0; f < 6; f++) {
    if (layers[f] == null) continue;
    const F = FACES[f], v = A.n;
    const c0 = F.corners[0], c1 = F.corners[1], c2 = F.corners[2];
    const vertex = (s, t) => {
      for (let axis = 0; axis < 3; axis++) {
        const u = c0[axis] + (c1[axis] - c0[axis]) * s + (c2[axis] - c0[axis]) * t;
        const a = Math.round(u * 3) / 3;
        P[axis] = a === 0 ? lo[axis] : a === 1 ? hi[axis] : a < 0.5 ? lo[axis] + r : hi[axis] - r;
        const edge = a === 0 ? axis * 2 : a === 1 ? axis * 2 + 1 : -1;
        Q[axis] = adjacent && edge >= 0 && adjacent[edge] ? P[axis] : Math.min(hi[axis] - r, Math.max(lo[axis] + r, P[axis]));
      }
      let nx = P[0] - Q[0], ny = P[1] - Q[1], nz = P[2] - Q[2];
      const length = Math.hypot(nx, ny, nz);
      if (length > 1e-7) {
        nx /= length; ny /= length; nz /= length;
        P[0] = Q[0] + nx * r; P[1] = Q[1] + ny * r; P[2] = Q[2] + nz * r;
      } else {
        nx = F.dir[0]; ny = F.dir[1]; nz = F.dir[2];
      }
      A.pos.push(P[0], P[1], P[2]); A.nor.push(nx, ny, nz); A.lay.push(layers[f]);
      let ao = 1;
      const factors = cornerFactors && cornerFactors[f];
      if (factors) ao = factors[0] * (1 - s) * (1 - t) + factors[1] * s * (1 - t) + factors[2] * (1 - s) * t + factors[3] * s * t;
      const k = shade * ao * (ny < -0.1 ? 0.7 : 1);
      A.col.push(k, k, k);
      if (faceUVs && faceUVs[f]) {
        const uv = faceUVs[f];
        A.uv.push(
          uv[0][0] * (1 - s) * (1 - t) + uv[1][0] * s * (1 - t) + uv[2][0] * (1 - s) * t + uv[3][0] * s * t,
          uv[0][1] * (1 - s) * (1 - t) + uv[1][1] * s * (1 - t) + uv[2][1] * (1 - s) * t + uv[3][1] * s * t,
        );
      } else if (F.axis === 0) A.uv.push(P[2], P[1]);
      else if (F.axis === 1) A.uv.push(P[0], P[2]);
      else A.uv.push(P[0], P[1]);
    };
    let local = 0;
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
      const s0 = GRID[i], s1 = GRID[i + 1], t0 = GRID[j], t1 = GRID[j + 1];
      vertex(s0, t0); vertex(s1, t0); vertex(s0, t1);
      vertex(s0, t1); vertex(s1, t0); vertex(s1, t1);
      A.ind.push(v + local, v + local + 1, v + local + 2, v + local + 3, v + local + 4, v + local + 5);
      local += 6;
    }
    A.n += 54;
  }
}

// Merges boxes into one geometry with vertex colours and optional texture-array tiles. With { round } the
// boxes get softly rounded edges (smooth normals over a bevel of that radius), so models read as carved
// and sculpted rather than built from cubes.
export class GeoBuilder {
  constructor(o = {}) { this.p = []; this.n = []; this.c = []; this.uv = []; this.l = []; this.round = o.round || 0; }
  box(x0, y0, z0, x1, y1, z1, color, layer = T.white, uvScale = 2) {
    const r = Math.min(this.round, 0.45 * Math.min(x1 - x0, y1 - y0, z1 - z0));
    if (r > 0.004) return this.rbox(x0, y0, z0, x1, y1, z1, color, layer, uvScale, r);
    _c.set(color);
    for (let f = 0; f < 6; f++) {
      const F = FACES[f], d = F.dir;
      for (const i of TRI) {
        const cr = F.corners[i];
        const px = cr[0] ? x1 : x0, py = cr[1] ? y1 : y0, pz = cr[2] ? z1 : z0;
        this.p.push(px, py, pz);
        this.n.push(d[0], d[1], d[2]);
        this.c.push(_c.r, _c.g, _c.b);
        if (f < 2) this.uv.push(pz * uvScale, py * uvScale);
        else if (f < 4) this.uv.push(px * uvScale, pz * uvScale);
        else this.uv.push(px * uvScale, py * uvScale);
        this.l.push(layer);
      }
    }
    return this;
  }
  rbox(x0, y0, z0, x1, y1, z1, color, layer, uvScale, r) {
    _c.set(color);
    const lo = [x0, y0, z0], hi = [x1, y1, z1];
    const map = (a, u) => (u === 0 ? lo[a] : u === 1 ? hi[a] : u < 0.5 ? lo[a] + r : hi[a] - r);
    const P = [0, 0, 0], Q = [0, 0, 0];
    const vert = (F, f, s, t) => {
      const c0 = F.corners[0], c1 = F.corners[1], c2 = F.corners[2];
      for (let a = 0; a < 3; a++) {
        const u = c0[a] + (c1[a] - c0[a]) * s + (c2[a] - c0[a]) * t;
        P[a] = map(a, Math.round(u * 3) / 3);
        Q[a] = Math.min(hi[a] - r, Math.max(lo[a] + r, P[a]));
      }
      let dx = P[0] - Q[0], dy = P[1] - Q[1], dz = P[2] - Q[2];
      const l = Math.hypot(dx, dy, dz);
      if (l > 1e-7) { dx /= l; dy /= l; dz /= l; P[0] = Q[0] + dx * r; P[1] = Q[1] + dy * r; P[2] = Q[2] + dz * r; }
      else { dx = F.dir[0]; dy = F.dir[1]; dz = F.dir[2]; }
      this.p.push(P[0], P[1], P[2]);
      this.n.push(dx, dy, dz);
      this.c.push(_c.r, _c.g, _c.b);
      if (f < 2) this.uv.push(P[2] * uvScale, P[1] * uvScale);
      else if (f < 4) this.uv.push(P[0] * uvScale, P[2] * uvScale);
      else this.uv.push(P[0] * uvScale, P[1] * uvScale);
      this.l.push(layer);
    };
    for (let f = 0; f < 6; f++) {
      const F = FACES[f];
      for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
        const s0 = GRID[i], s1 = GRID[i + 1], t0 = GRID[j], t1 = GRID[j + 1];
        vert(F, f, s0, t0); vert(F, f, s1, t0); vert(F, f, s0, t1);
        vert(F, f, s0, t1); vert(F, f, s1, t0); vert(F, f, s1, t1);
      }
    }
    return this;
  }
  // one triangle with its own normals and texture coordinates
  tri(a, na, ua, b, nb, ub, c, nc, uc, color, layer = T.white) {
    _c.set(color);
    for (const [p, n, u] of [[a, na, ua], [b, nb, ub], [c, nc, uc]]) {
      this.p.push(p[0], p[1], p[2]); this.n.push(n[0], n[1], n[2]); this.c.push(_c.r, _c.g, _c.b); this.uv.push(u[0], u[1]); this.l.push(layer);
    }
    return this;
  }
  // A quad a b / c d (a and d opposite corners), wound so that it faces n whatever order the corners came in.
  quad(a, b, c, d, n, color, layer = T.white, ua = [0, 0], ub = [1, 0], uc = [0, 1], ud = [1, 1]) {
    const e1x = b[0] - a[0], e1y = b[1] - a[1], e1z = b[2] - a[2], e2x = c[0] - a[0], e2y = c[1] - a[1], e2z = c[2] - a[2];
    const gx = e1y * e2z - e1z * e2y, gy = e1z * e2x - e1x * e2z, gz = e1x * e2y - e1y * e2x;
    if (gx * n[0] + gy * n[1] + gz * n[2] >= 0) return this.tri(a, n, ua, b, n, ub, c, n, uc, color, layer).tri(c, n, uc, b, n, ub, d, n, ud, color, layer);
    return this.tri(a, n, ua, c, n, uc, b, n, ub, color, layer).tri(c, n, uc, d, n, ud, b, n, ub, color, layer);
  }
  // a triangle wound to face the way its normals point
  otri(p, np, up, q, nq, uq, r, nr, ur, color, layer) {
    const ex = q[0] - p[0], ey = q[1] - p[1], ez = q[2] - p[2], fx = r[0] - p[0], fy = r[1] - p[1], fz = r[2] - p[2];
    const g = (ey * fz - ez * fy) * (np[0] + nq[0] + nr[0]) + (ez * fx - ex * fz) * (np[1] + nq[1] + nr[1]) + (ex * fy - ey * fx) * (np[2] + nq[2] + nr[2]);
    return g >= 0 ? this.tri(p, np, up, q, nq, uq, r, nr, ur, color, layer) : this.tri(p, np, up, r, nr, ur, q, nq, uq, color, layer);
  }
  // one flat-shaded triangle facing n
  face(p, q, r, n, color, layer = T.white) {
    const ex = q[0] - p[0], ey = q[1] - p[1], ez = q[2] - p[2], fx = r[0] - p[0], fy = r[1] - p[1], fz = r[2] - p[2];
    const g = (ey * fz - ez * fy) * n[0] + (ez * fx - ex * fz) * n[1] + (ex * fy - ey * fx) * n[2];
    const u = (v) => [v[0] + v[2], v[1]];
    return g >= 0 ? this.tri(p, n, u(p), q, n, u(q), r, n, u(r), color, layer) : this.tri(p, n, u(p), r, n, u(r), q, n, u(q), color, layer);
  }
  ellipsoid(cx, cy, cz, rx, ry, rz, color, layer = T.white, segments = 10, rings = 6) {
    const point = (theta, phi) => [cx + rx * Math.sin(theta) * Math.cos(phi), cy + ry * Math.cos(theta), cz + rz * Math.sin(theta) * Math.sin(phi)];
    const normal = (p) => {
      const n = [(p[0] - cx) / (rx * rx), (p[1] - cy) / (ry * ry), (p[2] - cz) / (rz * rz)];
      const length = Math.hypot(n[0], n[1], n[2]);
      return [n[0] / length, n[1] / length, n[2] / length];
    };
    for (let j = 0; j < rings; j++) for (let i = 0; i < segments; i++) {
      const u0 = i / segments, u1 = (i + 1) / segments;
      const v0 = j / rings, v1 = (j + 1) / rings;
      const p00 = point(v0 * Math.PI, u0 * Math.PI * 2), p10 = point(v0 * Math.PI, u1 * Math.PI * 2);
      const p01 = point(v1 * Math.PI, u0 * Math.PI * 2), p11 = point(v1 * Math.PI, u1 * Math.PI * 2);
      this.otri(p00, normal(p00), [u0, v0], p01, normal(p01), [u0, v1], p10, normal(p10), [u1, v0], color, layer);
      this.otri(p10, normal(p10), [u1, v0], p01, normal(p01), [u0, v1], p11, normal(p11), [u1, v1], color, layer);
    }
    return this;
  }
  // a tapered round post from (x0, y0, z0) to (x1, y1, z1)
  cyl(x0, y0, z0, x1, y1, z1, r0, r1, color, layer = T.white, segs = 10, caps = true) {
    const ax = new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0), len = ax.length();
    ax.divideScalar(len);
    const u = Math.abs(ax.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const e1 = new THREE.Vector3().crossVectors(ax, u).normalize(), e2 = new THREE.Vector3().crossVectors(ax, e1);
    const ring = (k, r, y) => { const a = (k / segs) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a); return [[(y ? x1 : x0) + (e1.x * c + e2.x * s) * r, (y ? y1 : y0) + (e1.y * c + e2.y * s) * r, (y ? z1 : z0) + (e1.z * c + e2.z * s) * r], [e1.x * c + e2.x * s, e1.y * c + e2.y * s, e1.z * c + e2.z * s]]; };
    for (let k = 0; k < segs; k++) {
      const [a0, n0] = ring(k, r0, 0), [a1, n1] = ring(k + 1, r0, 0), [b0] = ring(k, r1, 1), [b1] = ring(k + 1, r1, 1);
      const u0 = [k / segs * 2, 0], u1 = [(k + 1) / segs * 2, 0], v0 = [k / segs * 2, len], v1 = [(k + 1) / segs * 2, len];
      this.otri(a0, n0, u0, b1, n1, v1, b0, n0, v0, color, layer).otri(a0, n0, u0, a1, n1, u1, b1, n1, v1, color, layer);
      if (caps) {
        const na = [-ax.x, -ax.y, -ax.z], nb = [ax.x, ax.y, ax.z];
        this.otri([x0, y0, z0], na, [0, 0], a0, na, [0, 0], a1, na, [0, 0], color, layer);
        this.otri([x1, y1, z1], nb, [0, 0], b1, nb, [0, 0], b0, nb, [0, 0], color, layer);
      }
    }
    return this;
  }
  get empty() { return this.p.length === 0; }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('tuv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('layer', new THREE.Float32BufferAttribute(this.l, 1));
    g.computeBoundingSphere();
    return g;
  }
}

let glowTex = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}
export function glowSprite(color, size, opacity = 1) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity }));
  s.scale.set(size, size, 1);
  return s;
}
