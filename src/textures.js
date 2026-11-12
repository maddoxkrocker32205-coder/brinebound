import * as THREE from 'three';
import { T, TILE_COUNT } from './config.js';
import { mulberry32 } from './noise.js';
import { paintLayer, PS } from './paint.js';

// Procedural 16x16 pixel-art tiles for every block face, packed into one texture array.
const S = 16;
const rgb = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

class Tile {
  constructor(seed) { this.px = new Uint8ClampedArray(S * S * 4); this.r = mulberry32(seed * 7919 + 13); }
  set(x, y, c, a = 255) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= S || y >= S) return;
    const i = (y * S + x) * 4;
    this.px[i] = c[0]; this.px[i + 1] = c[1]; this.px[i + 2] = c[2]; this.px[i + 3] = a;
  }
  get(x, y) { const i = (y * S + x) * 4; return [this.px[i], this.px[i + 1], this.px[i + 2], this.px[i + 3]]; }
  fill(c, vary = 0.1) { for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) this.set(x, y, mul(c, 1 + (this.r() - 0.5) * vary)); return this; }
  speck(c, p, vary = 0.08) { for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (this.r() < p) this.set(x, y, mul(c, 1 + (this.r() - 0.5) * vary)); return this; }
  blobs(c, n, size = 2) {
    for (let k = 0; k < n; k++) {
      const x0 = (this.r() * S) | 0, y0 = (this.r() * S) | 0;
      for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) if (this.r() < 0.8) this.set((x0 + dx) % S, (y0 + dy) % S, mul(c, 0.95 + this.r() * 0.1));
    }
    return this;
  }
  walk(c, n, len) {
    for (let k = 0; k < n; k++) {
      let x = (this.r() * S) | 0, y = (this.r() * S) | 0;
      for (let i = 0; i < len; i++) { this.set(x, y, c); x += ((this.r() * 3) | 0) - 1; y += this.r() < 0.6 ? 1 : 0; x = (x + S) % S; y = (y + S) % S; }
    }
    return this;
  }
  clear() { this.px.fill(0); return this; }
  // give fully transparent pixels the average colour of the opaque ones so mipmaps don't darken edges
  bleed() {
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < S * S; i++) if (this.px[i * 4 + 3] > 0) { r += this.px[i * 4]; g += this.px[i * 4 + 1]; b += this.px[i * 4 + 2]; n++; }
    if (!n) return this;
    for (let i = 0; i < S * S; i++) if (this.px[i * 4 + 3] === 0) { this.px[i * 4] = r / n; this.px[i * 4 + 1] = g / n; this.px[i * 4 + 2] = b / n; }
    return this;
  }
}

function dirt(t) {
  return t.fill(rgb(0x7a5a3a), 0.14).speck(rgb(0x5f452c), 0.16).speck(rgb(0x947049), 0.1).blobs(rgb(0x6e6a62), 3, 1);
}
function grassTop(t) {
  t.fill(rgb(0x5f9e3f), 0.16).speck(rgb(0x78b84f), 0.2).speck(rgb(0x4a8330), 0.16);
  for (let k = 0; k < 7; k++) { const x = (t.r() * S) | 0, y = (t.r() * S) | 0; t.set(x, y, rgb(0x3f7429)); t.set(x, (y + 1) % S, rgb(0x4a8330)); }
  return t;
}
function planks(t, base, seam, grain) {
  t.fill(base, 0.06);
  for (let row = 0; row < 4; row++) {
    const y0 = row * 4, joint = (row * 7 + 3) % S;
    const k = 0.92 + t.r() * 0.16;
    for (let y = y0; y < y0 + 4; y++) for (let x = 0; x < S; x++) t.set(x, y, mul(base, k * (1 + (t.r() - 0.5) * 0.06)));
    for (let x = 0; x < S; x++) t.set(x, y0 + 3, seam);
    for (let y = y0; y < y0 + 3; y++) t.set(joint, y, seam);
    for (let g = 0; g < 2; g++) { const gy = y0 + ((t.r() * 3) | 0), gx = (t.r() * 12) | 0; for (let x = gx; x < gx + 3 + ((t.r() * 3) | 0); x++) t.set(x, gy, grain); }
    t.set((joint + 2) % S, y0 + 1, mul(seam, 0.7));
  }
  return t;
}
function bricks(t, brick, mortar, vary = 0.14) {
  t.fill(mortar, 0.05);
  for (let row = 0; row < 4; row++) {
    const y0 = row * 4, off = row % 2 ? 4 : 0;
    for (let bx = -1; bx < 3; bx++) {
      const x0 = bx * 8 + off, k = 1 + (t.r() - 0.5) * vary;
      for (let y = y0; y < y0 + 3; y++) for (let x = x0; x < x0 + 7; x++) if (x >= 0 && x < S) t.set(x, y, mul(brick, k * (1 + (t.r() - 0.5) * 0.08)));
    }
  }
  return t;
}
function rings(t, bark, a, b) {
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    const c = d > 6.6 ? bark : (Math.floor(d) % 2 ? a : b);
    t.set(x, y, mul(c, 1 + (t.r() - 0.5) * 0.08));
  }
  return t;
}
function cutout(t) { t.clear(); return t; }
function coralPlant(t, c, tip) {
  cutout(t);
  const branch = (x, y, len, ang, depth) => {
    for (let i = 0; i < len; i++) { t.set(x, y, c); t.set(x + 1, y, mul(c, 0.85)); x += Math.sin(ang) * 0.8; y -= Math.cos(ang) * 0.95; }
    t.set(x, y, tip); t.set(x + 1, y, tip);
    if (depth > 0) { branch(x, y, len * 0.72, ang - 0.65, depth - 1); branch(x, y, len * 0.72, ang + 0.55, depth - 1); }
  };
  branch(7, 15, 5, 0, 2);
  return t.bleed();
}

const DRAW = {
  [T.grass_top]: grassTop,
  [T.grass_side]: (t) => {
    dirt(t);
    for (let x = 0; x < S; x++) {
      const h = 3 + ((t.r() * 3) | 0);
      for (let y = 0; y < h; y++) t.set(x, y, mul(rgb(y === h - 1 ? 0x4a8330 : 0x5f9e3f), 1 + (t.r() - 0.5) * 0.15));
    }
    return t;
  },
  [T.dirt]: dirt,
  [T.sand]: (t) => t.fill(rgb(0xe3cf98), 0.06).speck(rgb(0xd0b97e), 0.2).speck(rgb(0xf0e0b2), 0.12).speck(rgb(0xb59d6e), 0.02),
  [T.stone]: (t) => t.fill(rgb(0x8b9094), 0.08).blobs(rgb(0x767b7f), 7, 2).walk(rgb(0x646a6e), 2, 7).speck(rgb(0xa5aaad), 0.07),
  [T.log_side]: (t) => {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const stripe = (x + ((y / 5) | 0)) % 4 === 0;
      t.set(x, y, mul(rgb(stripe ? 0x4f361f : 0x6b4a2b), 1 + (t.r() - 0.5) * 0.14));
    }
    return t.speck(rgb(0x84603b), 0.06);
  },
  [T.log_top]: (t) => rings(t, rgb(0x5f4126), rgb(0xb08a58), rgb(0x9a7547)),
  [T.leaves]: (t) => t.fill(rgb(0x3e8a3a), 0.12).blobs(rgb(0x2e6c2b), 12, 2).speck(rgb(0x58a44c), 0.12).speck(rgb(0x1f4f22), 0.05),
  [T.palm_side]: (t) => {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) t.set(x, y, mul(rgb((y + ((x / 6) | 0)) % 3 === 0 ? 0x7d6140 : 0x9b7a50), 1 + (t.r() - 0.5) * 0.1));
    return t;
  },
  [T.palm_top]: (t) => rings(t, rgb(0x7d6140), rgb(0xc2a273), rgb(0xae8d60)),
  [T.frond]: (t) => {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) t.set(x, y, mul(rgb((x + y) % 4 === 0 ? 0x478f30 : 0x5fae3e), 1 + (t.r() - 0.5) * 0.12));
    for (let i = 0; i < S; i++) t.set(i, i, rgb(0x8fcf5a));
    return t;
  },
  [T.plank]: (t) => planks(t, rgb(0xb98a56), rgb(0x8a6236), rgb(0xcd9f68)),
  [T.hullwood]: (t) => planks(t, rgb(0xd2d2d2), rgb(0x8c8c8c), rgb(0xeeeeee)),
  [T.chest_side]: (t) => {
    planks(t, rgb(0x7a4b22), rgb(0x55331a), rgb(0x8d5a2c));
    for (let y = 0; y < S; y++) { t.set(1, y, rgb(0xd6aa4f)); t.set(2, y, rgb(0xb88d3c)); t.set(13, y, rgb(0xd6aa4f)); t.set(14, y, rgb(0xb88d3c)); }
    for (let x = 0; x < S; x++) { t.set(x, 4, rgb(0xd6aa4f)); t.set(x, 5, rgb(0xa47b33)); }
    return t;
  },
  [T.chest_front]: (t) => {
    DRAW[T.chest_side](t);
    for (let y = 6; y < 11; y++) for (let x = 6; x < 10; x++) t.set(x, y, rgb(0xe0b85a));
    t.set(7, 8, rgb(0x2a1a0c)); t.set(8, 8, rgb(0x2a1a0c)); t.set(7, 9, rgb(0x2a1a0c));
    return t;
  },
  [T.chest_top]: (t) => {
    planks(t, rgb(0x8a5628), rgb(0x5f3a1c), rgb(0x9d6634));
    for (let i = 0; i < S; i++) { t.set(i, 0, rgb(0xd6aa4f)); t.set(i, 15, rgb(0xd6aa4f)); t.set(0, i, rgb(0xd6aa4f)); t.set(15, i, rgb(0xd6aa4f)); }
    return t;
  },
  [T.mark]: (t) => {
    DRAW[T.sand](t);
    for (let i = 1; i < 15; i++) {
      t.set(i, i, rgb(0xa7432a)); t.set(i + 1, i, rgb(0xb8583a));
      t.set(15 - i, i, rgb(0xa7432a)); t.set(14 - i, i, rgb(0xb8583a));
    }
    return t;
  },
  [T.coconut]: (t) => t.fill(rgb(0x6d4a2a), 0.1).walk(rgb(0x4f3420), 5, 6).speck(rgb(0x8d6a43), 0.08),
  [T.slate]: (t) => {
    t.fill(rgb(0x4d535b), 0.08);
    for (let y = 2; y < S; y += 5) for (let x = 0; x < S; x++) if (t.r() < 0.85) t.set(x, y, rgb(0x3b4047));
    return t.speck(rgb(0x5f6873), 0.08);
  },
  [T.bone]: (t) => t.fill(rgb(0xece4d0), 0.05).walk(rgb(0xcfc4a8), 3, 6).speck(rgb(0xf7f1e2), 0.08),
  [T.brick]: (t) => bricks(t, rgb(0x969b9f), rgb(0x6b7074)),
  [T.whitebrick]: (t) => bricks(t, rgb(0xeae6dc), rgb(0xb9b3a6), 0.06),
  [T.mossbrick]: (t) => bricks(t, rgb(0x8a8f86), rgb(0x5d6359)).blobs(rgb(0x4f7a36), 9, 2).speck(rgb(0x6a9a46), 0.05),
  [T.cloth]: (t) => {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) t.set(x, y, mul(rgb(((x / 4) | 0) % 2 ? 0xe4d6b8 : 0xa8342a), (y % 5 === 4 ? 0.88 : 1) * (1 + (t.r() - 0.5) * 0.05)));
    return t;
  },
  [T.vault_side]: (t) => {
    planks(t, rgb(0x2c3833), rgb(0x1b231f), rgb(0x3b4a43));
    for (let y = 0; y < S; y++) { t.set(0, y, rgb(0x9fd8b8)); t.set(15, y, rgb(0x9fd8b8)); }
    const skull = ['.xxxx.', 'xxxxxx', 'x.xx.x', 'xxxxxx', '.x.x..'];
    skull.forEach((row, yy) => { for (let xx = 0; xx < 6; xx++) if (row[xx] === 'x') t.set(5 + xx, 5 + yy, rgb(0xd6ccb0)); });
    return t;
  },
  [T.vault_top]: (t) => {
    planks(t, rgb(0x2c3833), rgb(0x1b231f), rgb(0x3b4a43));
    for (let i = 0; i < S; i++) { t.set(i, 0, rgb(0x9fd8b8)); t.set(i, 15, rgb(0x9fd8b8)); t.set(0, i, rgb(0x9fd8b8)); t.set(15, i, rgb(0x9fd8b8)); }
    return t;
  },
  [T.white]: (t) => t.fill([255, 255, 255], 0),
  [T.tallgrass]: (t) => {
    cutout(t);
    for (let k = 0; k < 9; k++) {
      let x = 1 + t.r() * 14; const h = 6 + ((t.r() * 9) | 0), lean = (t.r() - 0.5) * 0.5;
      const c = rgb([0x5fae3e, 0x4f9a34, 0x78c04f][k % 3]);
      for (let y = 0; y < h; y++) { t.set(x, 15 - y, mul(c, 0.8 + (y / h) * 0.35)); x += lean; }
    }
    return t.bleed();
  },
  [T.flower_r]: (t) => {
    cutout(t);
    for (let y = 6; y < 16; y++) t.set(7, y, rgb(0x3f8a2c));
    t.set(6, 11, rgb(0x4f9a34)); t.set(5, 10, rgb(0x4f9a34)); t.set(8, 12, rgb(0x4f9a34)); t.set(9, 11, rgb(0x4f9a34));
    for (let y = 1; y < 7; y++) for (let x = 4; x < 11; x++) { const d = Math.hypot(x - 7, y - 4); if (d < 3.2) t.set(x, y, rgb(d < 1.2 ? 0xf0c83c : 0xd63a3a)); }
    return t.bleed();
  },
  [T.flower_y]: (t) => {
    cutout(t);
    for (let y = 7; y < 16; y++) t.set(8, y, rgb(0x3f8a2c));
    t.set(7, 12, rgb(0x4f9a34)); t.set(9, 10, rgb(0x4f9a34));
    for (let y = 2; y < 8; y++) for (let x = 5; x < 12; x++) { const d = Math.hypot(x - 8, y - 5); if (d < 3) t.set(x, y, rgb(d < 1.1 ? 0xc8641e : 0xf0c83c)); }
    return t.bleed();
  },
  [T.fern]: (t) => {
    cutout(t);
    for (let k = 0; k < 4; k++) {
      const dir = k % 2 ? 1 : -1; let x = 8, y = 15;
      for (let i = 0; i < 11; i++) { t.set(x, y, rgb(0x3f8a2c)); if (i % 2) t.set(x + dir, y, rgb(0x5fae3e)); y -= 1; x += dir * (i < 5 ? 0.6 : 0.3) * (k < 2 ? 1 : 0.5); }
    }
    return t.bleed();
  },
  [T.shell]: (t) => {
    cutout(t);
    const c = rgb(0xe6824a);
    for (let a = 0; a < 5; a++) {
      const ang = (a / 5) * Math.PI * 2 - Math.PI / 2;
      for (let r = 0; r < 5; r++) { t.set(8 + Math.cos(ang) * r, 8 + Math.sin(ang) * r, mul(c, 1 - r * 0.05)); t.set(8 + Math.cos(ang) * r + 0.5, 8 + Math.sin(ang) * r, mul(c, 0.9)); }
    }
    t.set(8, 8, rgb(0xf2a070));
    return t.bleed();
  },
  [T.kelp]: (t) => {
    cutout(t);
    for (let k = 0; k < 3; k++) {
      const x0 = 3 + k * 5;
      for (let y = 0; y < S; y++) { const x = x0 + Math.round(Math.sin(y * 0.6 + k) * 1.2); t.set(x, y, rgb(0x2c6e46)); if (y % 3 === 0) t.set(x + 1, y, rgb(0x3f8a5a)); }
    }
    return t.bleed();
  },
  [T.lamp]: (t) => {
    t.fill(rgb(0x2a2b2d), 0.05);
    for (let y = 2; y < 14; y++) for (let x = 2; x < 14; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      t.set(x, y, rgb(d < 2.5 ? 0xfff0b8 : d < 4.5 ? 0xffd27a : 0xf2a83a));
    }
    for (let i = 2; i < 14; i++) { t.set(i, 7, rgb(0x3a3b3d)); t.set(7, i, rgb(0x3a3b3d)); }
    return t;
  },
  [T.basalt]: (t) => {
    t.fill(rgb(0x55585e), 0.1).speck(rgb(0x43464b), 0.2).speck(rgb(0x6a6e74), 0.1);
    for (let x = 0; x < S; x += 5) for (let y = 0; y < S; y++) if (t.r() < 0.8) t.set((x + ((y / 6) | 0) * 2) % S, y, rgb(0x34363a));
    return t;
  },
  [T.ash]: (t) => t.fill(rgb(0x7c7a76), 0.08).speck(rgb(0x5f5d5a), 0.2).speck(rgb(0x96938e), 0.12).speck(rgb(0x2a2a2a), 0.03),
  [T.obsidian]: (t) => {
    t.fill(rgb(0x2e2638), 0.1).blobs(rgb(0x221c2a), 6, 3).speck(rgb(0x5a4a72), 0.06);
    for (let k = 0; k < 4; k++) t.set((t.r() * S) | 0, (t.r() * S) | 0, rgb(0x9a86c8));
    return t;
  },
  [T.magma]: (t) => {
    t.fill(rgb(0x3a1a10), 0.12);
    for (let k = 0; k < 4; k++) {
      let x = (t.r() * S) | 0, y = (t.r() * S) | 0;
      for (let i = 0; i < 14; i++) { t.set(x, y, rgb(i % 3 ? 0xff7a1a : 0xffd04a)); x = (x + ((t.r() * 3) | 0) - 1 + S) % S; y = (y + ((t.r() * 3) | 0) - 1 + S) % S; }
    }
    return t.blobs(rgb(0xff9a2a), 5, 2);
  },
  [T.jlog_side]: (t) => {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const stripe = (x + ((y / 4) | 0)) % 3 === 0; t.set(x, y, mul(rgb(stripe ? 0x4a2718 : 0x6a3b25), 1 + (t.r() - 0.5) * 0.14)); }
    return t.speck(rgb(0x7d4a30), 0.06).speck(rgb(0x4f7a36), 0.03);
  },
  [T.jlog_top]: (t) => rings(t, rgb(0x4a2718), rgb(0xa0583a), rgb(0x8a4a30)),
  [T.jleaves]: (t) => t.fill(rgb(0x2f6e2c), 0.14).blobs(rgb(0x235623), 12, 2).speck(rgb(0x4a8f3a), 0.12).speck(rgb(0x8fbf4a), 0.04),
  [T.bamboo]: (t) => {
    cutout(t);
    for (const x0 of [3, 9]) {
      for (let y = 0; y < S; y++) for (let x = x0; x < x0 + 3; x++) t.set(x, y, mul(rgb(y % 8 === 0 ? 0x5f8a2c : 0x8fbf4a), x === x0 ? 0.82 : 1));
      t.set(x0 + 3, 4, rgb(0x6fae3e)); t.set(x0 + 4, 3, rgb(0x6fae3e)); t.set(x0 - 1, 11, rgb(0x6fae3e)); t.set(x0 - 2, 10, rgb(0x6fae3e));
    }
    return t.bleed();
  },
  [T.vine]: (t) => {
    cutout(t);
    for (let k = 0; k < 4; k++) {
      let x = 2 + k * 4;
      for (let y = 0; y < S; y++) {
        t.set(x, y, rgb(0x3f7a2c)); if (y % 3 === 1) t.set(Math.min(15, x + 1), y, rgb(0x5f9e3f));
        if (t.r() < 0.25) x = Math.max(0, Math.min(15, x + (t.r() < 0.5 ? -1 : 1)));
        if (y > 9 + k * 2) break;
      }
    }
    return t.bleed();
  },
  [T.coral_p]: (t) => coralPlant(t, rgb(0xf07aa0), rgb(0xffc0d8)),
  [T.coral_o]: (t) => coralPlant(t, rgb(0xf0a040), rgb(0xffe090)),
  [T.coral_v]: (t) => {
    cutout(t);
    for (const x0 of [2, 7, 11]) {
      const h = 6 + ((t.r() * 8) | 0);
      for (let y = 15; y > 15 - h; y--) { t.set(x0, y, rgb(0x9a6ae0)); t.set(x0 + 1, y, rgb(0x7a4ac0)); }
      t.set(x0, 15 - h, rgb(0xd8c0ff)); t.set(x0 + 1, 15 - h, rgb(0xd8c0ff));
    }
    return t.bleed();
  },
  [T.coralblock_a]: (t) => t.fill(rgb(0xe0785a), 0.1).speck(rgb(0xb85a40), 0.3).speck(rgb(0xffa080), 0.12),
  [T.coralblock_b]: (t) => t.fill(rgb(0x7a63b8), 0.1).speck(rgb(0x5a4398), 0.3).speck(rgb(0xa08ae0), 0.12),
  [T.wreckwood]: (t) => planks(t, rgb(0x6d6252), rgb(0x4a4236), rgb(0x857a68)).blobs(rgb(0x4f6a3a), 6, 2).speck(rgb(0x3a3a30), 0.05),
  [T.barrel_side]: (t) => {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) t.set(x, y, mul(rgb(x % 4 === 0 ? 0x6e4524 : 0x8a5a30), 1 + (t.r() - 0.5) * 0.1));
    for (const yb of [2, 3, 12, 13]) for (let x = 0; x < S; x++) t.set(x, yb, rgb(yb % 2 ? 0x2a2b2d : 0x45464a));
    return t;
  },
  [T.barrel_top]: (t) => rings(t, rgb(0x2a2b2d), rgb(0x8a5a30), rgb(0x7a4e28)),
  [T.keg_side]: (t) => {
    t.fill(rgb(0x5a3622), 0.08);
    for (let x = 0; x < S; x += 4) for (let y = 0; y < S; y++) t.set(x, y, rgb(0x3e2515));
    for (const y of [2, 13]) for (let x = 0; x < S; x++) { t.set(x, y, rgb(0x2a2b2d)); t.set(x, y + 1, rgb(0x45474a)); }
    for (let k = 0; k < 6; k++) { t.set(5 + k, 5 + k, rgb(0xd8c8a0)); t.set(10 - k, 5 + k, rgb(0xd8c8a0)); }
    return t;
  },
  [T.keg_top]: (t) => { rings(t, rgb(0x2a2b2d), rgb(0x5a3622), rgb(0x4a2c1a)); for (const [x, y] of [[7, 7], [8, 7], [7, 8], [8, 8]]) t.set(x, y, rgb(0x111111)); return t; },
  [T.crate]: (t) => {
    planks(t, rgb(0xa57a45), rgb(0x7a5530), rgb(0xb88a52));
    for (let i = 0; i < S; i++) { t.set(i, i, rgb(0x6e4a28)); t.set(15 - i, i, rgb(0x6e4a28)); t.set(i, 0, rgb(0x5a3a1c)); t.set(i, 15, rgb(0x5a3a1c)); t.set(0, i, rgb(0x5a3a1c)); t.set(15, i, rgb(0x5a3a1c)); }
    return t;
  },
  [T.seagrass]: (t) => {
    cutout(t);
    for (let k = 0; k < 8; k++) { let x = 1 + t.r() * 14; const h = 5 + ((t.r() * 10) | 0); for (let y = 0; y < h; y++) { t.set(x, 15 - y, mul(rgb(0x4a9a5a), 0.8 + (y / h) * 0.3)); x += Math.sin(y * 0.5 + k) * 0.3; } }
    return t.bleed();
  },
  [T.mushroom]: (t) => {
    cutout(t);
    const cap = (cx, cy, r) => { for (let y = cy - r; y <= cy; y++) for (let x = cx - r; x <= cx + r; x++) if (Math.hypot(x - cx, (y - cy) * 1.4) <= r) t.set(x, y, rgb(Math.hypot(x - cx, y - cy) < r * 0.45 ? 0xb8fff0 : 0x52dcc0)); };
    for (let y = 8; y < 16; y++) t.set(5, y, rgb(0xd8efe8));
    for (let y = 11; y < 16; y++) t.set(11, y, rgb(0xd8efe8));
    cap(5, 8, 3); cap(11, 11, 2);
    return t.bleed();
  },
};

let built = null;
export function buildTiles() {
  if (built) return built;
  const tiles = [];
  for (let i = 0; i < TILE_COUNT; i++) {
    const t = new Tile(i + 1);
    (DRAW[i] || ((x) => x.fill([255, 0, 255], 0)))(t);
    tiles.push(t);
  }
  built = tiles;
  return tiles;
}

// The world's texture array: painted 64px surfaces where there is a painter, the 16px tile scaled up elsewhere.
export function makeTextureArray(renderer) {
  const tiles = buildTiles(), N = PS;
  const data = new Uint8Array(N * N * 4 * tiles.length);
  tiles.forEach((t, i) => {
    const painted = paintLayer(i), base = i * N * N * 4;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const o = base + (N - 1 - y) * N * 4 + x * 4;
      const src = painted || t.px, k = painted ? (y * N + x) * 4 : (((y * S) / N | 0) * S + ((x * S) / N | 0)) * 4;
      data[o] = src[k]; data[o + 1] = src[k + 1]; data[o + 2] = src[k + 2]; data[o + 3] = src[k + 3];
    }
  });
  const tex = new THREE.DataArrayTexture(data, N, N, tiles.length);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  if (renderer) tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------- UI icons
function tilePixel(tile, u, v) {
  const x = Math.min(15, Math.max(0, Math.floor(u * 16))), y = Math.min(15, Math.max(0, Math.floor(v * 16)));
  return tile.get(x, y);
}
export function cubeIconCanvas(top, side, size = 32) {
  const tiles = buildTiles();
  const tt = tiles[top], ts = tiles[side];
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d'); const img = x.createImageData(size, size);
  const k = size / 32;
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    const X = (px + 0.5) / k, Y = (py + 0.5) / k;
    let col = null, sh = 1;
    { const dx = X - 16, dy = Y - 2; const u = (dx / 14 + dy / 7) / 2, v = (dy / 7 - dx / 14) / 2; if (u >= 0 && u <= 1 && v >= 0 && v <= 1) { col = tilePixel(tt, u, v); sh = 1.0; } }
    if (!col) { const dx = X - 2, dy = Y - 9; const u = dx / 14, v = (dy - 7 * u) / 14; if (u >= 0 && u <= 1 && v >= 0 && v <= 1) { col = tilePixel(ts, u, v); sh = 0.8; } }
    if (!col) { const dx = X - 16, dy = Y - 16; const u = dx / 14, v = (dy + 7 * u) / 14; if (u >= 0 && u <= 1 && v >= 0 && v <= 1) { col = tilePixel(ts, u, v); sh = 0.62; } }
    if (col && col[3] > 0) { const i = (py * size + px) * 4; img.data[i] = col[0] * sh; img.data[i + 1] = col[1] * sh; img.data[i + 2] = col[2] * sh; img.data[i + 3] = 255; }
  }
  x.putImageData(img, 0, 0);
  return c;
}
export function tileCanvas(index, size = 32) {
  const t = buildTiles()[index];
  const c = document.createElement('canvas'); c.width = c.height = 16;
  const x = c.getContext('2d'); const img = x.createImageData(16, 16); img.data.set(t.px);
  for (let i = 0; i < 256; i++) if (img.data[i * 4 + 3] < 128) img.data[i * 4 + 3] = 0;
  x.putImageData(img, 0, 0);
  if (size === 16) return c;
  const o = document.createElement('canvas'); o.width = o.height = size;
  const ox = o.getContext('2d'); ox.imageSmoothingEnabled = false; ox.drawImage(c, 0, 0, size, size);
  return o;
}
// Soft tiling cloud noise: r = big billows, g = fine detail. The sky shader thresholds and lights it.
export function cloudTexture() {
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N;
  const x = c.getContext('2d'); const img = x.createImageData(N, N);
  const A = periodic(11, 8), B2 = periodic(23, 16), C2 = periodic(37, 32), E = periodic(53, 64);
  for (let y = 0; y < N; y++) for (let xx = 0; xx < N; xx++) {
    const u = xx / N, v = y / N;
    const big = A(u * 8, v * 8) * 0.55 + B2(u * 16, v * 16) * 0.3 + C2(u * 32, v * 32) * 0.15;
    const fine = C2(u * 32, v * 32) * 0.5 + E(u * 64, v * 64) * 0.5;
    const i = (y * N + xx) * 4;
    img.data[i] = Math.round(big * 255); img.data[i + 1] = Math.round(fine * 255); img.data[i + 2] = 0; img.data[i + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ---------------------------------------------------------------- painted detail for smooth ground
// A tiling 256x256 RGBA texture: r sand grain, g grass clumps, b rock cracks, a dirt clods / large tint.
function periodic(seed, period) {
  const r = mulberry32(seed);
  const g = new Float32Array(period * period);
  for (let i = 0; i < g.length; i++) g[i] = r();
  const at = (x, y) => g[(((x % period) + period) % period) + (((y % period) + period) % period) * period];
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}
function worley(seed, period) {
  const r = mulberry32(seed);
  const pts = new Float32Array(period * period * 2);
  for (let i = 0; i < pts.length; i++) pts[i] = r();
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    let f1 = 9, f2 = 9;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const cx = xi + dx, cy = yi + dy;
      const k = ((((cx % period) + period) % period) + (((cy % period) + period) % period) * period) * 2;
      const px = cx + pts[k], py = cy + pts[k + 1];
      const d = Math.hypot(px - x, py - y);
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
    }
    return [f1, f2];
  };
}
export function makeDetailTexture(renderer) {
  const N = 256;
  const n8 = periodic(11, 8), n16 = periodic(12, 16), n32 = periodic(13, 32), n64 = periodic(14, 64), n128 = periodic(15, 128);
  const n4 = periodic(16, 4), w12 = worley(17, 12), w6 = worley(18, 6);
  const data = new Uint8Array(N * N * 4);
  const cl = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N;
    // sand: fine grain over soft ripples
    const ripple = 0.5 + 0.5 * Math.sin((v * 22 + n8(u * 8, v * 8) * 3.2) * Math.PI * 2);
    const sand = 0.5 + (n128(u * 128, v * 128) - 0.5) * 0.2 + (n64(u * 64, v * 64) - 0.5) * 0.28 + (ripple - 0.5) * 0.16;
    // grass: clumps of light and dark with flecks
    const cl1 = n16(u * 16, v * 16), cl2 = n32(u * 32, v * 32), fl = n128(u * 128 + 7, v * 128 + 3);
    const grass = 0.5 + (cl1 - 0.5) * 0.7 + (cl2 - 0.5) * 0.45 + (fl > 0.78 ? 0.06 : fl < 0.2 ? -0.05 : 0);
    // rock: cracked plates with mottling and faint layers
    const [a1, a2] = w12(u * 12, v * 12), [b1, b2] = w6(u * 6, v * 6);
    const crack = Math.min(1, (a2 - a1) * 6) * 0.65 + Math.min(1, (b2 - b1) * 5) * 0.35;
    const rock = 0.36 + crack * 0.34 + (n32(u * 32 + 5, v * 32) - 0.5) * 0.25 + (n64(u * 64, v * 64 + 9) - 0.5) * 0.07;
    // dirt and large-scale tint
    const dirt = 0.5 + (n4(u * 4, v * 4) - 0.5) * 0.5 + (n16(u * 16 + 3, v * 16 + 8) - 0.5) * 0.45 + (n64(u * 64 + 1, v * 64 + 2) - 0.5) * 0.1;
    const i = (x + y * N) * 4;
    data[i] = cl(sand); data[i + 1] = cl(grass); data[i + 2] = cl(rock); data[i + 3] = cl(dirt);
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  if (renderer) tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  tex.needsUpdate = true;
  return tex;
}
// a palm leaf: midrib and long leaflets, transparent between them
export function makeFrondTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 256;
  const x = c.getContext('2d');
  x.clearRect(0, 0, 64, 256);
  const r = mulberry32(77);
  for (let i = 0; i < 46; i++) {
    const t = i / 46, y = 8 + t * 240;
    for (const side of [-1, 1]) {
      const len = 30 * Math.sin(Math.PI * Math.min(1, t * 1.05 + 0.05)) + 2;
      const g = Math.round(110 + 60 * t + r() * 30), rr = Math.round(60 + 30 * t + r() * 20);
      x.strokeStyle = `rgb(${rr},${g},${Math.round(40 + r() * 20)})`;
      x.lineWidth = 3.2;
      x.beginPath(); x.moveTo(32, y); x.quadraticCurveTo(32 + side * len * 0.5, y + 4, 32 + side * len, y + 10 + r() * 4); x.stroke();
    }
  }
  x.strokeStyle = '#c8b46a'; x.lineWidth = 3; x.beginPath(); x.moveTo(32, 0); x.lineTo(32, 256); x.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
