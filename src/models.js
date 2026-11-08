import * as THREE from 'three';
import { GeoBuilder } from './geo.js';

// Box-built animal models. Every model faces -z (its front), feet at y = 0 unless it swims.
// Each builder returns { group, parts } where parts are the pieces worth animating.

const mesh = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; return m; };
const limb = (mat, geo, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); g.add(mesh(geo, mat)); return g; };

export const PARROT_COLORS = [
  { body: 0xd63a2a, wing: 0x2a5ad6, tail: 0xf0c040, name: 'scarlet' },
  { body: 0x3aa83a, wing: 0x2a7a2a, tail: 0xf0c040, name: 'green' },
  { body: 0x2a6ad6, wing: 0x1a4aa6, tail: 0x2a6ad6, chest: 0xf0c040, name: 'blue' },
];

export function parrotModel(mat, c = PARROT_COLORS[0]) {
  const group = new THREE.Group();
  const body = new GeoBuilder({ round: 0.08 })
    .box(-0.07, 0, -0.08, 0.07, 0.22, 0.08, c.body)
    .box(-0.065, 0.02, -0.085, 0.065, 0.14, -0.06, c.chest || c.body)
    .box(-0.07, 0.2, -0.1, 0.07, 0.33, 0.05, c.body)
    .box(-0.03, 0.21, -0.17, 0.03, 0.3, -0.1, 0xf0c040)
    .box(-0.02, 0.2, -0.15, 0.02, 0.23, -0.1, 0x2a2a2a)
    .box(-0.072, 0.26, -0.07, -0.06, 0.29, -0.04, 0x111111).box(0.06, 0.26, -0.07, 0.072, 0.29, -0.04, 0x111111)
    .box(-0.02, -0.03, -0.02, -0.005, 0.0, 0.02, 0x555555).box(0.005, -0.03, -0.02, 0.02, 0.0, 0.02, 0x555555)
    .build();
  group.add(mesh(body, mat));
  const tailGeo = new GeoBuilder({ round: 0.08 }).box(-0.03, -0.2, 0, 0.03, 0.02, 0.05, c.tail).box(-0.02, -0.26, 0.01, 0.02, -0.2, 0.04, c.wing).build();
  const tail = limb(mat, tailGeo, 0, 0.04, 0.07); tail.rotation.x = 0.5; group.add(tail);
  const wingGeoL = new GeoBuilder({ round: 0.08 }).box(-0.2, -0.015, -0.07, 0, 0.015, 0.09, c.wing).box(-0.24, -0.012, -0.03, -0.18, 0.012, 0.1, c.tail).build();
  const wingGeoR = new GeoBuilder({ round: 0.08 }).box(0, -0.015, -0.07, 0.2, 0.015, 0.09, c.wing).box(0.18, -0.012, -0.03, 0.24, 0.012, 0.1, c.tail).build();
  const wl = limb(mat, wingGeoL, -0.07, 0.16, 0); const wr = limb(mat, wingGeoR, 0.07, 0.16, 0);
  group.add(wl, wr);
  return { group, parts: { wl, wr, tail } };
}

export function crabModel(mat) {
  const group = new THREE.Group();
  const g = new GeoBuilder({ round: 0.08 })
    .box(-0.22, 0.06, -0.15, 0.22, 0.2, 0.15, 0xd0482a).box(-0.18, 0.2, -0.12, 0.18, 0.24, 0.12, 0xb03a22)
    .box(-0.09, 0.2, -0.17, -0.05, 0.32, -0.13, 0x2a1a10).box(0.05, 0.2, -0.17, 0.09, 0.32, -0.13, 0x2a1a10)
    .box(-0.38, 0.08, -0.32, -0.22, 0.2, -0.16, 0xe05a30).box(0.22, 0.08, -0.34, 0.4, 0.22, -0.16, 0xe05a30);
  for (let k = 0; k < 3; k++) {
    g.box(-0.34, 0, -0.08 + k * 0.09, -0.22, 0.08, -0.04 + k * 0.09, 0xb03a22);
    g.box(0.22, 0, -0.08 + k * 0.09, 0.34, 0.08, -0.04 + k * 0.09, 0xb03a22);
  }
  group.add(mesh(g.build(), mat));
  return { group, parts: {} };
}

function quadruped(mat, o) {
  const group = new THREE.Group();
  const body = new GeoBuilder({ round: 0.08 });
  body.box(-o.w, o.legH, -o.l, o.w, o.legH + o.h, o.l, o.c);
  body.box(-o.hw, o.legH + o.h * 0.15, -o.l - o.hl, o.hw, o.legH + o.h * 0.15 + o.hh, -o.l + 0.04, o.hc || o.c);
  for (const [a, b] of o.extra || []) body.box(...a, b);
  group.add(mesh(body.build(), mat));
  const legGeo = new GeoBuilder({ round: 0.08 }).box(-o.lw, -o.legH, -o.lw, o.lw, 0, o.lw, o.lc).build();
  const legs = [];
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const L = limb(mat, legGeo, sx * (o.w - o.lw - 0.02), o.legH, sz * (o.l - o.lw - 0.06));
    group.add(L); legs.push(L);
  }
  return { group, parts: { legs } };
}

export function boarModel(mat) {
  const hl = 0.3, l = 0.45, legH = 0.36;
  return quadruped(mat, {
    w: 0.27, l, h: 0.44, legH, c: 0x5a3a26, hw: 0.19, hl, hh: 0.34, hc: 0x4e321f, lw: 0.07, lc: 0x3a2416,
    extra: [
      [[-0.06, legH + 0.44, -0.4, 0.06, legH + 0.54, 0.2], 0x3a2416],
      [[-0.1, legH + 0.08, -l - hl - 0.12, 0.1, legH + 0.22, -l - hl + 0.02], 0xc08a78],
      [[-0.15, legH + 0.14, -l - hl - 0.1, -0.11, legH + 0.26, -l - hl - 0.05], 0xf0e8d8],
      [[0.11, legH + 0.14, -l - hl - 0.1, 0.15, legH + 0.26, -l - hl - 0.05], 0xf0e8d8],
      [[-0.15, legH + 0.32, -l - hl + 0.06, -0.1, legH + 0.37, -l - hl + 0.1], 0x111111],
      [[0.1, legH + 0.32, -l - hl + 0.06, 0.15, legH + 0.37, -l - hl + 0.1], 0x111111],
      [[-0.18, legH + 0.46, -l - 0.12, -0.08, legH + 0.56, -l - 0.04], 0x4e321f],
      [[0.08, legH + 0.46, -l - 0.12, 0.18, legH + 0.56, -l - 0.04], 0x4e321f],
      [[-0.02, legH + 0.2, l, 0.02, legH + 0.36, l + 0.12], 0x3a2416],
    ],
  });
}

export function goatModel(mat) {
  const hl = 0.24, l = 0.38, legH = 0.42;
  return quadruped(mat, {
    w: 0.21, l, h: 0.4, legH, c: 0xe8e4dc, hw: 0.13, hl, hh: 0.3, hc: 0xdedad2, lw: 0.055, lc: 0xb8b2a6,
    extra: [
      [[-0.12, legH + 0.42, -l - 0.18, -0.07, legH + 0.62, -l - 0.06], 0x8a7a64],
      [[0.07, legH + 0.42, -l - 0.18, 0.12, legH + 0.62, -l - 0.06], 0x8a7a64],
      [[-0.12, legH + 0.58, -l - 0.08, -0.07, legH + 0.64, 0.0 - l + 0.08], 0x8a7a64],
      [[0.07, legH + 0.58, -l - 0.08, 0.12, legH + 0.64, 0.0 - l + 0.08], 0x8a7a64],
      [[-0.05, legH - 0.06, -l - hl + 0.02, 0.05, legH + 0.08, -l - hl + 0.1], 0xd8d0c4],
      [[-0.135, legH + 0.3, -l - hl + 0.05, -0.1, legH + 0.34, -l - hl + 0.09], 0x111111],
      [[0.1, legH + 0.3, -l - hl + 0.05, 0.135, legH + 0.34, -l - hl + 0.09], 0x111111],
      [[-0.03, legH + 0.3, l, 0.03, legH + 0.42, l + 0.08], 0xdedad2],
    ],
  });
}

export function turtleModel(mat) {
  const group = new THREE.Group();
  const g = new GeoBuilder({ round: 0.08 })
    .box(-0.38, 0.1, -0.42, 0.38, 0.38, 0.42, 0x5a7a3a).box(-0.28, 0.38, -0.32, 0.28, 0.46, 0.32, 0x4a6a32)
    .box(-0.3, 0.08, -0.36, 0.3, 0.12, 0.36, 0xd8c890)
    .box(-0.09, 0.14, -0.62, 0.09, 0.3, -0.4, 0x8aa86a).box(-0.08, 0.24, -0.6, -0.05, 0.27, -0.56, 0x111111).box(0.05, 0.24, -0.6, 0.08, 0.27, -0.56, 0x111111);
  group.add(mesh(g.build(), mat));
  const fl = new GeoBuilder({ round: 0.08 }).box(-0.12, -0.03, -0.08, 0.12, 0.03, 0.08, 0x7a9a5a).build();
  const legs = [];
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const L = limb(mat, fl, sx * 0.4, 0.14, sz * 0.3); group.add(L); legs.push(L); }
  return { group, parts: { legs } };
}

export function fishModel(mat, color) {
  const group = new THREE.Group();
  const dark = new THREE.Color(color).multiplyScalar(0.7);
  group.add(mesh(new GeoBuilder({ round: 0.08 }).box(-0.04, -0.05, -0.13, 0.04, 0.05, 0.12, color).box(-0.005, -0.07, 0.11, 0.005, 0.07, 0.19, dark).build(), mat));
  return { group, parts: {} };
}

export function dolphinModel(mat) {
  const group = new THREE.Group();
  const g = new GeoBuilder({ round: 0.08 })
    .box(-0.26, -0.26, -0.9, 0.26, 0.26, 0.9, 0x7a8a96).box(-0.21, -0.29, -0.7, 0.21, -0.2, 0.7, 0xc8d0d6)
    .box(-0.11, -0.13, -1.25, 0.11, 0.05, -0.9, 0x6a7a86)
    .box(-0.04, 0.26, -0.05, 0.04, 0.55, 0.3, 0x5a6a76)
    .box(-0.45, -0.1, -0.35, -0.25, -0.05, -0.1, 0x5a6a76).box(0.25, -0.1, -0.35, 0.45, -0.05, -0.1, 0x5a6a76);
  group.add(mesh(g.build(), mat));
  const tail = limb(mat, new GeoBuilder({ round: 0.08 }).box(-0.42, -0.04, 0, 0.42, 0.04, 0.28, 0x5a6a76).build(), 0, 0, 0.9);
  group.add(tail);
  return { group, parts: { tail } };
}

export function sharkModel(mat) {
  const group = new THREE.Group();
  const g = new GeoBuilder({ round: 0.08 })
    .box(-0.3, -0.3, -1.2, 0.3, 0.3, 1.2, 0x5a6670).box(-0.26, -0.33, -1.0, 0.26, -0.2, 0.9, 0xe0e4e6)
    .box(-0.25, -0.22, -1.62, 0.25, 0.18, -1.2, 0x56626c).box(-0.2, -0.26, -1.6, 0.2, -0.2, -1.3, 0xe0e4e6)
    .box(-0.06, 0.3, -0.25, 0.06, 0.7, 0.2, 0x4a5660).box(-0.05, 0.7, -0.1, 0.05, 1.0, 0.2, 0x4a5660)
    .box(-0.75, -0.2, -0.6, -0.3, -0.12, -0.2, 0x4a5660).box(0.3, -0.2, -0.6, 0.75, -0.12, -0.2, 0x4a5660)
    .box(-0.27, 0.02, -1.5, -0.24, 0.07, -1.45, 0x111111).box(0.24, 0.02, -1.5, 0.27, 0.07, -1.45, 0x111111);
  group.add(mesh(g.build(), mat));
  const tail = limb(mat, new GeoBuilder({ round: 0.08 }).box(-0.05, -0.55, 0, 0.05, 0.75, 0.38, 0x4a5660).build(), 0, 0, 1.15);
  group.add(tail);
  return { group, parts: { tail } };
}

export function whaleModel(mat) {
  const group = new THREE.Group();
  const g = new GeoBuilder({ round: 0.08 })
    .box(-1.6, -1.4, -5, 1.6, 1.2, 4.6, 0x3a4a5a).box(-1.3, -1.5, -4.6, 1.3, -1.2, 2.5, 0x9aa6ae)
    .box(-1.4, -1.0, -6.2, 1.4, 0.9, -5, 0x34424f)
    .box(-0.2, 1.2, 1.5, 0.2, 1.6, 2.4, 0x34424f)
    .box(-2.6, -0.9, -2.2, -1.6, -0.7, -0.6, 0x34424f).box(1.6, -0.9, -2.2, 2.6, -0.7, -0.6, 0x34424f)
    .box(-1.42, 0.1, -5.4, -1.36, 0.3, -5.2, 0x111111).box(1.36, 0.1, -5.4, 1.42, 0.3, -5.2, 0x111111);
  group.add(mesh(g.build(), mat));
  const tail = limb(mat, new GeoBuilder({ round: 0.08 }).box(-0.6, -0.6, 0, 0.6, 0.5, 2.2, 0x3a4a5a).box(-2.6, -0.15, 1.6, 2.6, 0.15, 3.0, 0x34424f).build(), 0, 0, 4.4);
  group.add(tail);
  return { group, parts: { tail } };
}
