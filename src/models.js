import * as THREE from 'three';
import { GeoBuilder } from './geo.js';

// Procedural animal models share one vertex-coloured mesh per body so the game can keep its atlas material.
const mesh = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; return m; };
const limb = (mat, geo, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); g.add(mesh(geo, mat)); return g; };
const modelMesh = (group, builder, mat) => group.add(mesh(builder.build(), mat));

function eyes(g, x, y, z, spacing, size, white = 0xf0e9d8, pupil = 0x171715) {
  for (const side of [-1, 1]) {
    g.ellipsoid(side * spacing, y, z, size, size, size * 0.48, white);
    g.ellipsoid(side * spacing, y, z - size * 0.36, size * 0.48, size * 0.58, size * 0.24, pupil);
  }
}

function fin(g, a, b, c, color) {
  const n = new THREE.Vector3().subVectors(new THREE.Vector3(...b), new THREE.Vector3(...a))
    .cross(new THREE.Vector3().subVectors(new THREE.Vector3(...c), new THREE.Vector3(...a))).normalize().toArray();
  g.face(a, b, c, n, color).face(a, c, b, n.map((v) => -v), color);
}

export const PARROT_COLORS = [
  { body: 0xd63a2a, wing: 0x2a5ad6, tail: 0xf0c040, name: 'scarlet' },
  { body: 0x3aa83a, wing: 0x2a7a2a, tail: 0xf0c040, name: 'green' },
  { body: 0x2a6ad6, wing: 0x1a4aa6, tail: 0x2a6ad6, chest: 0xf0c040, name: 'blue' },
];

export function parrotModel(mat, c = PARROT_COLORS[0]) {
  const group = new THREE.Group(), body = new GeoBuilder();
  body.ellipsoid(0, 0.12, 0, 0.09, 0.14, 0.08, c.body)
    .ellipsoid(0, 0.12, -0.052, 0.065, 0.105, 0.035, c.chest || c.body)
    .ellipsoid(0, 0.29, -0.025, 0.074, 0.075, 0.07, c.body)
    .ellipsoid(0, 0.26, -0.103, 0.036, 0.032, 0.04, c.tail)
    .ellipsoid(0, 0.235, -0.122, 0.027, 0.018, 0.025, 0x24201b);
  eyes(body, 0.048, 0.305, -0.082, 0.052, 0.018);
  body.cyl(-0.035, -0.025, -0.005, -0.025, 0.005, -0.005, 0.009, 0.008, 0x574336, undefined, 8)
    .cyl(0.035, -0.025, -0.005, 0.025, 0.005, -0.005, 0.009, 0.008, 0x574336, undefined, 8);
  modelMesh(group, body, mat);

  const tailGeo = new GeoBuilder()
    .ellipsoid(-0.025, -0.11, 0.04, 0.018, 0.15, 0.025, c.tail)
    .ellipsoid(0.025, -0.1, 0.045, 0.018, 0.14, 0.025, c.wing).build();
  const tail = limb(mat, tailGeo, 0, 0.045, 0.07);
  tail.rotation.x = 0.4; group.add(tail);

  const wings = [];
  for (const side of [-1, 1]) {
    const wing = new GeoBuilder()
      .ellipsoid(side * 0.075, 0, 0, 0.145, 0.028, 0.075, c.wing)
      .ellipsoid(side * 0.16, -0.004, 0.035, 0.065, 0.022, 0.045, c.tail)
      .ellipsoid(side * 0.12, -0.025, 0.035, 0.035, 0.055, 0.023, c.wing)
      .build();
    const w = limb(mat, wing, side * 0.055, 0.17, 0);
    group.add(w); wings.push(w);
  }
  return { group, parts: { wl: wings[0], wr: wings[1], tail } };
}

export function crabModel(mat) {
  const group = new THREE.Group(), g = new GeoBuilder();
  g.ellipsoid(0, 0.14, 0, 0.27, 0.14, 0.23, 0xc84429)
    .ellipsoid(0, 0.205, 0.015, 0.215, 0.075, 0.17, 0xe05a30)
    .ellipsoid(0, 0.075, 0.015, 0.21, 0.045, 0.17, 0x9d3828);
  for (const side of [-1, 1]) {
    g.cyl(side * 0.09, 0.22, -0.13, side * 0.11, 0.34, -0.18, 0.023, 0.016, 0xa9442c, undefined, 10)
      .ellipsoid(side * 0.11, 0.35, -0.18, 0.033, 0.041, 0.028, 0x30231d)
      .ellipsoid(side * 0.11, 0.36, -0.2, 0.012, 0.018, 0.012, 0xf0e4ce);
    const clawX = side * 0.34;
    g.cyl(side * 0.19, 0.13, -0.11, side * 0.31, 0.15, -0.22, 0.06, 0.075, 0xc84429, undefined, 12)
      .ellipsoid(clawX, 0.16, -0.25, 0.105, 0.08, 0.095, 0xe05a30)
      .ellipsoid(clawX, 0.11, -0.325, 0.035, 0.045, 0.05, 0xe05a30);
    for (let k = 0; k < 3; k++) {
      const z = -0.07 + k * 0.095;
      g.cyl(side * 0.19, 0.1, z, side * 0.35, 0.035, z + 0.055, 0.028, 0.018, 0xb43b29, undefined, 9);
    }
  }
  modelMesh(group, g, mat);
  return { group, parts: {} };
}

function quadruped(mat, o) {
  const group = new THREE.Group(), body = new GeoBuilder();
  const bodyY = o.legH + o.h * 0.52, headY = o.legH + o.h * 0.69, headZ = -o.l - o.hl * 0.48;
  body.ellipsoid(0, bodyY, 0, o.w, o.h * 0.53, o.l, o.c)
    .ellipsoid(0, bodyY + o.h * 0.02, o.l * 0.66, o.w * 0.48, o.h * 0.34, o.l * 0.31, o.c)
    .ellipsoid(0, bodyY + o.h * 0.18, -o.l * 0.68, o.hw * 0.82, o.h * 0.45, o.l * 0.52, o.c)
    .ellipsoid(0, headY, -o.l * 0.68, o.hw * 0.8, o.hh * 0.36, o.hl * 0.75, o.hc || o.c)
    .ellipsoid(0, headY + o.hh * 0.1, headZ, o.hw, o.hh * 0.5, o.hl * 0.55, o.hc || o.c)
    .ellipsoid(0, headY - o.hh * 0.24, headZ - o.hl * 0.48, o.hw * 0.75, o.hh * 0.25, o.hl * 0.25, o.muzzle || o.hc || o.c);
  eyes(body, o.hw * 0.79, headY + o.hh * 0.11, headZ - o.hl * 0.34, o.hw * 0.8, o.eyeSize || 0.024, 0xe9dfca, 0x171513);

  for (const side of [-1, 1]) {
    body.ellipsoid(side * o.hw * 0.78, headY + o.hh * 0.47, headZ + o.hl * 0.13, o.hw * 0.29, o.hh * 0.46, o.hl * 0.22, o.ear || o.hc || o.c);
    if (o.kind === 'boar') {
      body.ellipsoid(side * 0.13, headY - 0.06, headZ - o.hl * 0.34, 0.035, 0.055, 0.04, 0xf0e8d8);
      body.cyl(side * 0.13, headY - 0.05, headZ - o.hl * 0.27, side * 0.18, headY + 0.02, headZ - o.hl * 0.56, 0.025, 0.004, 0xe8dcc2, undefined, 10);
    }
    if (o.kind === 'goat') {
      body.cyl(side * 0.09, headY + o.hh * 0.34, headZ + 0.015, side * 0.13, headY + o.hh * 0.72, headZ + 0.04, 0.052, 0.035, 0x8a7a64, undefined, 12)
        .cyl(side * 0.13, headY + o.hh * 0.72, headZ + 0.04, side * 0.12, headY + o.hh * 0.92, headZ + 0.01, 0.035, 0.009, 0x8a7a64, undefined, 12);
    }
  }
  if (o.kind === 'boar') {
    body.ellipsoid(0, bodyY + o.h * 0.1, o.l * 0.98, 0.045, 0.05, 0.1, 0x3a2416);
  } else {
    body.cyl(0, bodyY + 0.02, o.l * 0.93, 0.015, bodyY + 0.08, o.l * 1.24, 0.035, 0.012, o.c, undefined, 9);
  }
  modelMesh(group, body, mat);

  const legRoot = bodyY - o.h * 0.28;
  const hoof = o.kind === 'boar' ? 0x30271f : 0x574a3b;
  const legBuilder = new GeoBuilder();
  legBuilder
    .cyl(0, -0.015, 0, 0, -legRoot * 0.58, -0.01, o.lw * 1.25, o.lw * 0.95, o.lc, undefined, 12)
    .ellipsoid(0, -legRoot * 0.56, -0.012, o.lw * 1.02, legRoot * 0.13, o.lw * 0.95, o.lc)
    .cyl(0, -legRoot * 0.55, -0.01, 0, -legRoot * 0.9, -0.03, o.lw * 0.9, o.lw * 0.62, o.lc, undefined, 12)
    .ellipsoid(0, -legRoot * 0.92, -0.052, o.lw * 1.12, legRoot * 0.09, o.lw * 1.28, hoof);
  if (o.kind === 'boar') {
    legBuilder
      .ellipsoid(-o.lw * 0.42, -legRoot * 0.95, -0.07, o.lw * 0.48, legRoot * 0.055, o.lw * 0.68, hoof)
      .ellipsoid(o.lw * 0.42, -legRoot * 0.95, -0.07, o.lw * 0.48, legRoot * 0.055, o.lw * 0.68, hoof);
  } else {
    legBuilder
      .cyl(-0.035, -legRoot * 0.87, -0.03, -0.035, -legRoot * 0.985, -0.08, o.lw * 0.22, o.lw * 0.14, hoof, undefined, 8)
      .cyl(0.035, -legRoot * 0.87, -0.03, 0.035, -legRoot * 0.985, -0.08, o.lw * 0.22, o.lw * 0.14, hoof, undefined, 8);
  }
  const leg = legBuilder.build();
  const legs = [];
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const L = limb(mat, leg, sx * o.w * 0.54, legRoot, sz * o.l * 0.5);
    group.add(L); legs.push(L);
  }
  return { group, parts: { legs } };
}

export function boarModel(mat) {
  return quadruped(mat, {
    kind: 'boar', w: 0.27, l: 0.45, h: 0.44, legH: 0.36, c: 0x5a3a26, hc: 0x4e321f, muzzle: 0xc08a78,
    hw: 0.19, hl: 0.3, hh: 0.34, lw: 0.07, lc: 0x3a2416, ear: 0x4e321f, eyeSize: 0.021,
  });
}

export function goatModel(mat) {
  return quadruped(mat, {
    kind: 'goat', w: 0.21, l: 0.38, h: 0.4, legH: 0.42, c: 0xe8e4dc, hc: 0xdedad2, muzzle: 0xd8d0c4,
    hw: 0.13, hl: 0.24, hh: 0.3, lw: 0.055, lc: 0xb8b2a6, ear: 0xc5bba9, eyeSize: 0.019,
  });
}

export function turtleModel(mat) {
  const group = new THREE.Group(), body = new GeoBuilder();
  body.ellipsoid(0, 0.17, 0, 0.34, 0.15, 0.39, 0x668247)
    .ellipsoid(0, 0.29, 0.02, 0.34, 0.25, 0.39, 0x4a6a32)
    .ellipsoid(0, 0.095, 0.02, 0.28, 0.035, 0.33, 0xd8c890)
    .ellipsoid(0, 0.19, -0.47, 0.12, 0.11, 0.17, 0x8aa86a);
  body.ellipsoid(0, 0.43, 0.02, 0.12, 0.075, 0.14, 0x5a7937);
  for (const [x, z] of [[0, 0.02], [-0.17, -0.12], [0.17, -0.12], [-0.17, 0.16], [0.17, 0.16], [0, 0.27]]) {
    const y = 0.29 + 0.25 * Math.sqrt(Math.max(0.1, 1 - (x / 0.36) ** 2 - (z / 0.42) ** 2));
    body.ellipsoid(x, y, z, 0.09, 0.018, 0.095, 0x5b7838);
  }
  eyes(body, 0.082, 0.22, -0.59, 0.082, 0.019, 0xe9dfc8, 0x171513);
  modelMesh(group, body, mat);

  const leg = new GeoBuilder()
    .ellipsoid(0, 0, -0.025, 0.13, 0.09, 0.16, 0x7a9a5a)
    .ellipsoid(0, -0.02, -0.11, 0.1, 0.055, 0.12, 0x668247).build();
  const legs = [];
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const L = limb(mat, leg, sx * 0.3, 0.14, sz * 0.27);
    group.add(L); legs.push(L);
  }
  return { group, parts: { legs } };
}

export function fishModel(mat, color) {
  const group = new THREE.Group(), body = new GeoBuilder();
  const dark = new THREE.Color(color).multiplyScalar(0.72).getHex();
  body.ellipsoid(0, 0, -0.005, 0.105, 0.078, 0.19, color)
    .ellipsoid(0, -0.024, -0.02, 0.087, 0.035, 0.15, 0xe2c997);
  eyes(body, 0.07, 0.022, -0.1, 0.078, 0.014, 0xf0e8d7, 0x171513);
  body.cyl(0, 0.06, 0.04, 0, 0.12, -0.02, 0.032, 0.008, dark, undefined, 10)
    .cyl(0, -0.05, 0.03, 0, -0.1, 0.0, 0.025, 0.006, dark, undefined, 10);
  modelMesh(group, body, mat);
  const tailGeo = new GeoBuilder()
    .ellipsoid(0, 0, 0.07, 0.045, 0.035, 0.09, dark)
    .ellipsoid(-0.045, 0.005, 0.17, 0.055, 0.09, 0.025, dark)
    .ellipsoid(0.045, 0.005, 0.17, 0.055, 0.09, 0.025, dark).build();
  const tail = limb(mat, tailGeo, 0, 0, 0.12);
  group.add(tail);
  return { group, parts: { tail } };
}

export function dolphinModel(mat) {
  const group = new THREE.Group(), body = new GeoBuilder();
  body.ellipsoid(0, 0, -0.05, 0.28, 0.29, 0.83, 0x71838f)
    .ellipsoid(0, -0.12, -0.08, 0.225, 0.15, 0.67, 0xc8d0d6)
    .ellipsoid(0, -0.025, -0.87, 0.18, 0.14, 0.34, 0x71838f)
    .ellipsoid(0, -0.06, -1.12, 0.13, 0.085, 0.2, 0x667984);
  eyes(body, 0.22, 0.08, -0.78, 0.22, 0.032, 0x171a1c, 0x101112);
  body.ellipsoid(0, 0.24, 0.04, 0.07, 0.19, 0.22, 0x5b6d79);
  for (const side of [-1, 1]) {
    body.ellipsoid(side * 0.35, -0.16, -0.25, 0.2, 0.035, 0.34, 0x5b6d79);
    body.ellipsoid(side * 0.24, -0.2, -0.45, 0.15, 0.025, 0.21, 0x71838f);
  }
  modelMesh(group, body, mat);
  const tailGeo = new GeoBuilder()
    .cyl(0, 0, 0, 0, 0, 0.4, 0.11, 0.06, 0x71838f, undefined, 14)
    .ellipsoid(-0.18, 0.025, 0.38, 0.21, 0.045, 0.17, 0x5b6d79)
    .ellipsoid(0.18, 0.025, 0.38, 0.21, 0.045, 0.17, 0x5b6d79).build();
  const tail = limb(mat, tailGeo, 0, 0, 0.72);
  group.add(tail);
  return { group, parts: { tail } };
}

export function sharkModel(mat) {
  const group = new THREE.Group(), body = new GeoBuilder();
  body.ellipsoid(0, 0, 0, 0.31, 0.31, 1.05, 0x586873)
    .ellipsoid(0, -0.16, -0.08, 0.275, 0.15, 0.91, 0xd6dcdd)
    .ellipsoid(0, -0.02, -0.96, 0.21, 0.18, 0.45, 0x566570);
  eyes(body, 0.23, 0.08, -0.81, 0.23, 0.031, 0x17191a, 0x101112);
  body.ellipsoid(0, -0.19, -1.12, 0.17, 0.018, 0.26, 0x252b30);
  for (const side of [-1, 1]) {
    for (let k = 0; k < 4; k++) body.ellipsoid(side * 0.285, 0.015 - k * 0.055, -0.35 + k * 0.065, 0.012, 0.04, 0.018, 0x3e4a53);
    body.ellipsoid(side * 0.49, -0.17, -0.32, 0.27, 0.04, 0.37, 0x4e5e68);
    body.ellipsoid(side * 0.28, -0.2, 0.55, 0.16, 0.025, 0.27, 0x4e5e68);
  }
  fin(body, [0, 0.22, -0.3], [0, 0.66, 0.08], [0, 0.22, 0.35], 0x4b5963);
  fin(body, [0, -0.18, 0.25], [0, 0.14, 0.62], [0, -0.18, 0.78], 0x4b5963);
  modelMesh(group, body, mat);
  const tailGeo = new GeoBuilder()
    .cyl(0, 0, 0, 0, 0, 0.35, 0.11, 0.055, 0x56636d, undefined, 12)
    .ellipsoid(0, 0.34, 0.25, 0.055, 0.42, 0.22, 0x4b5963)
    .ellipsoid(0, -0.28, 0.29, 0.055, 0.34, 0.2, 0x4b5963).build();
  const tail = limb(mat, tailGeo, 0, 0, 1.0);
  group.add(tail);
  return { group, parts: { tail } };
}

export function whaleModel(mat) {
  const group = new THREE.Group(), body = new GeoBuilder();
  body.ellipsoid(0, -0.05, -0.2, 1.55, 1.23, 4.65, 0x3d5060)
    .ellipsoid(0, -0.58, -0.22, 1.32, 0.62, 3.78, 0x9aa6ae)
    .ellipsoid(0, 0.43, -3.72, 1.18, 0.77, 1.27, 0x384955)
    .ellipsoid(0, 1.12, 0.95, 0.25, 0.2, 0.48, 0x34424f)
    .ellipsoid(0, 1.18, -3.98, 0.09, 0.035, 0.16, 0x25343c);
  eyes(body, 1.12, 0.28, -4.48, 1.12, 0.085, 0x171a1c, 0x101112);
  body.ellipsoid(-1.28, -0.48, -0.85, 0.76, 0.12, 1.05, 0x34424f)
    .ellipsoid(1.28, -0.48, -0.85, 0.76, 0.12, 1.05, 0x34424f);
  modelMesh(group, body, mat);
  const tailGeo = new GeoBuilder()
    .cyl(0, 0, 0, 0, 0, 1.35, 0.42, 0.23, 0x3d5060, undefined, 16)
    .ellipsoid(-0.48, 0.02, 1.2, 0.58, 0.1, 0.72, 0x34424f)
    .ellipsoid(0.48, 0.02, 1.2, 0.58, 0.1, 0.72, 0x34424f).build();
  const tail = limb(mat, tailGeo, 0, -0.05, 4.05);
  group.add(tail);
  return { group, parts: { tail } };
}
