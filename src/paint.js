// Painted 64px surfaces for crafted blocks, bark and plants: soft wood grain, worn bricks, hooped barrels,
// grass blades and flowers drawn with real curves. Everything tiles. Layers without a painter here are
// upscaled from their 16px pixel tiles.
import { T } from './config.js';
import { mulberry32 } from './noise.js';

export const PS = 64;
const rgb = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// tileable value noise: n(x, y) with x, y in pixels, `cells` cells across the tile
function vnoise(seed, cells) {
  const r = mulberry32(seed), g = new Float32Array(cells * cells);
  for (let i = 0; i < g.length; i++) g[i] = r();
  const at = (x, y) => g[((x % cells) + cells) % cells + (((y % cells) + cells) % cells) * cells];
  const k = cells / PS;
  return (x, y) => {
    x *= k; y *= k;
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}
// anisotropic noise: `cx` cells across, `cy` cells down (for grain and fibres)
function anoise(seed, cx, cy) {
  const r = mulberry32(seed), g = new Float32Array(cx * cy);
  for (let i = 0; i < g.length; i++) g[i] = r();
  const at = (x, y) => g[((x % cx) + cx) % cx + (((y % cy) + cy) % cy) * cx];
  return (x, y) => {
    x *= cx / PS; y *= cy / PS;
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

class Img {
  constructor() { this.px = new Uint8ClampedArray(PS * PS * 4); }
  set(x, y, c, a = 255) { const i = ((y & 63) * PS + (x & 63)) * 4; this.px[i] = c[0]; this.px[i + 1] = c[1]; this.px[i + 2] = c[2]; this.px[i + 3] = a; }
  get(x, y) { const i = ((y & 63) * PS + (x & 63)) * 4; return [this.px[i], this.px[i + 1], this.px[i + 2], this.px[i + 3]]; }
  each(fn) { for (let y = 0; y < PS; y++) for (let x = 0; x < PS; x++) { const r = fn(x, y); if (r) this.set(x, y, r, r[3] ?? 255); } return this; }
  // draw with canvas paths (for plants): fn(ctx); result composited with alpha
  canvas(fn) {
    const c = document.createElement('canvas'); c.width = c.height = PS;
    const x = c.getContext('2d');
    fn(x);
    const d = x.getImageData(0, 0, PS, PS).data;
    for (let i = 0; i < PS * PS; i++) {
      const a = d[i * 4 + 3] / 255;
      if (a <= 0) continue;
      const o = i * 4, ia = this.px[o + 3] / 255, oa = a + ia * (1 - a);
      for (let k = 0; k < 3; k++) this.px[o + k] = (d[o + k] * a + this.px[o + k] * ia * (1 - a)) / (oa || 1);
      this.px[o + 3] = oa * 255;
    }
    return this;
  }
  // transparent pixels take the average colour of the opaque ones, so mipmaps keep cut-out edges clean
  bleed() {
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < PS * PS; i++) if (this.px[i * 4 + 3] > 40) { r += this.px[i * 4]; g += this.px[i * 4 + 1]; b += this.px[i * 4 + 2]; n++; }
    if (!n) return this;
    for (let i = 0; i < PS * PS; i++) if (this.px[i * 4 + 3] < 40) { this.px[i * 4] = r / n; this.px[i * 4 + 1] = g / n; this.px[i * 4 + 2] = b / n; }
    return this;
  }
}

// ---------------------------------------------------------------- wood
// Boards running across the tile: grain that wanders, bevelled edges, butt joints, the odd nail.
function planks(seed, base, seam, grain, o = {}) {
  const r = mulberry32(seed), n1 = anoise(seed + 1, 4, 32), n2 = vnoise(seed + 2, 8), warp = anoise(seed + 3, 3, 12);
  const rows = o.rows || 4, h = PS / rows, img = new Img();
  const tone = [], joint = [];
  for (let k = 0; k < rows; k++) { tone.push(0.88 + r() * 0.2); joint.push((r() * PS) | 0); }
  img.each((x, y) => {
    const k = Math.floor(y / h), yy = y - k * h;
    const j = joint[k], dj = Math.min(Math.abs(x - j), PS - Math.abs(x - j));
    const t2 = x > j ? tone[(k + 2) % rows] : tone[k];
    const w = warp(x, y) * 7;
    const g = Math.abs(Math.sin((y + w) * 1.15 + k * 3)) ;
    let c = mix(base, grain, (1 - sstep(0.0, 0.35, g)) * 0.55 * n1(x, y));
    c = mix(c, seam, sstep(0.55, 0.95, n2(x, y)) * 0.18);
    let s = t2 * (0.93 + 0.12 * n1(x * 2, y));
    if (yy < 1.5) s *= 1.14;                       // the board's top edge catches the light
    if (yy > h - 2.5) { c = seam; s = yy > h - 1.5 ? 0.7 : 0.9; }
    if (dj < 1) { c = seam; s = 0.8; }
    else if (dj < 2) s *= 0.88;
    if (o.nails && dj > 2 && dj < 5 && (yy === 4 || yy === h - 6)) { c = [60, 58, 55]; s = 1; }
    return [c[0] * s, c[1] * s, c[2] * s];
  });
  return img;
}
// bark with long fibres and dark furrows
function bark(seed, base, dark, light, o = {}) {
  const fib = anoise(seed, o.cols || 10, 3), fib2 = anoise(seed + 1, (o.cols || 10) * 2, 6), blot = vnoise(seed + 2, 6), furrow = anoise(seed + 3, o.cols ? o.cols / 2 : 5, 4);
  return new Img().each((x, y) => {
    const f = fib(x, y) * 0.65 + fib2(x, y) * 0.35;
    const fr = Math.abs(furrow(x, y) - 0.5) * 2;
    let c = mix(base, light, sstep(0.55, 0.9, f) * 0.6);
    c = mix(c, dark, sstep(0.75, 0.95, 1 - fr) * 0.85);
    if (o.rings) { const ry = (y + Math.sin(x / PS * Math.PI * 2) * 1.5) % (PS / o.rings); if (ry < 2.2) c = mix(c, dark, 0.7); else if (ry < 3.5) c = mix(c, light, 0.25); }
    const s = 0.9 + 0.18 * blot(x, y);
    return [c[0] * s, c[1] * s, c[2] * s];
  });
}
function endGrain(seed, barkC, a, b) {
  const n = vnoise(seed, 8), n2 = vnoise(seed + 1, 16);
  return new Img().each((x, y) => {
    const dx = x - 31.5, dy = y - 31.5, d = Math.hypot(dx, dy) + n(x, y) * 3;
    if (d > 28.5 || Math.max(Math.abs(dx), Math.abs(dy)) > 29) return mix(barkC, [0, 0, 0], 0.2 * n2(x, y));
    const ring = Math.abs(Math.sin(d * 0.75));
    const c = mix(b, a, sstep(0.2, 0.8, ring));
    const s = 0.94 + 0.1 * n2(x, y) - (Math.abs(Math.atan2(dy, dx) * 3 % 1 - 0.5) < 0.02 && d > 6 ? 0.25 : 0);
    return [c[0] * s, c[1] * s, c[2] * s];
  });
}
// ---------------------------------------------------------------- masonry
function masonry(seed, brick, mortar, o = {}) {
  const r = mulberry32(seed), n = vnoise(seed + 1, 16), n2 = vnoise(seed + 2, 32), stain = vnoise(seed + 3, 4);
  const rows = 4, bh = PS / rows, bw = PS / 2, tones = [];
  for (let i = 0; i < 16; i++) tones.push(1 + (r() - 0.5) * (o.vary ?? 0.18));
  const img = new Img().each((x, y) => {
    const row = Math.floor(y / bh), off = row % 2 ? bw / 2 : 0, xx = (x + off) % PS, col = Math.floor(xx / bw);
    const lx = xx - col * bw, ly = y - row * bh;
    const edge = Math.min(lx, bw - 1 - lx, ly, bh - 1 - ly);
    const t = tones[(row * 2 + col) % 16];
    if (edge < 1.2) { const s = 0.85 + 0.15 * n2(x, y); return [mortar[0] * s, mortar[1] * s, mortar[2] * s]; }
    const round = sstep(1.2, 4.5, edge + n(x, y) * 1.5);
    let s = t * (0.88 + 0.16 * n2(x, y)) * (0.78 + 0.22 * round);
    if (ly < 3 && lx > 1) s *= 1.08;            // top bevel
    if (lx < 3 && ly > 1) s *= 1.04;
    let c = brick;
    if (o.moss) c = mix(c, o.moss, sstep(0.55, 0.75, stain(x, y) * 0.7 + n(x, y) * 0.3) * 0.85);
    return [c[0] * s, c[1] * s, c[2] * s];
  });
  return img;
}
// ---------------------------------------------------------------- containers
function staves(seed, wood, hoop, o = {}) {
  const r = mulberry32(seed), n = anoise(seed + 1, 8, 32), tones = [];
  for (let i = 0; i < 8; i++) tones.push(0.88 + r() * 0.2);
  return new Img().each((x, y) => {
    const st = Math.floor(x / 8), lx = x % 8;
    let c = wood, s = tones[st] * (0.9 + 0.16 * n(x, y)) * (0.86 + 0.14 * Math.sin((lx + 0.5) / 8 * Math.PI));
    if (lx === 0) s *= 0.62;
    for (const hy of o.hoops || [7, 54]) {
      const d = y - hy;
      if (d >= 0 && d < 5) { c = hoop; s = d === 0 ? 1.35 : d === 4 ? 0.7 : 1; if ((x + 3) % 16 === 0 && d === 2) s = 1.6; }
    }
    if (o.mark) { const u = x - 32, v = y - 31; if ((Math.abs(u - v) < 2.2 || Math.abs(u + v) < 2.2) && Math.abs(u) < 11 && Math.abs(v) < 11) { c = o.mark; s = 0.95 + 0.1 * n(x, y); } }
    return [c[0] * s, c[1] * s, c[2] * s];
  });
}
function crate(seed) {
  const p = planks(seed, rgb(0xb08350), rgb(0x6d4c2c), rgb(0x8a6236), { rows: 4 });
  const n = vnoise(seed + 9, 16);
  return p.each((x, y) => {
    const e = Math.min(x, 63 - x, y, 63 - y);
    const diag = Math.abs(x - y);
    const frame = rgb(0x8a6236);
    if (e < 6) { const s = (e < 1 ? 0.6 : e > 4 ? 0.82 : 1.05) * (0.9 + 0.15 * n(x, y)); return [frame[0] * s, frame[1] * s, frame[2] * s]; }
    if (diag < 4) { const s = (diag > 3 ? 0.75 : 1) * (0.92 + 0.12 * n(x, y)); return [frame[0] * s * 1.05, frame[1] * s * 1.05, frame[2] * s * 1.05]; }
    return null;
  });
}
function chest(seed, front) {
  const p = planks(seed, rgb(0x7a4b22), rgb(0x3e2412), rgb(0x5e3818), { rows: 4 });
  const iron = rgb(0x3b3c3f), brass = rgb(0xd6aa4f);
  return p.each((x, y) => {
    const band = (x >= 8 && x < 14) || (x >= 50 && x < 56);
    if (band || y < 4 || y > 59) { const s = (x === 8 || x === 50 || y === 0) ? 1.4 : 1; if ((y % 12 === 6) && band && (x === 10 || x === 52)) return mix(brass, [255, 255, 255], 0.2); return [iron[0] * s, iron[1] * s, iron[2] * s]; }
    if (front && x >= 26 && x < 38 && y >= 22 && y < 38) { const e = Math.min(x - 26, 37 - x, y - 22, 37 - y); if (x >= 30 && x < 34 && y >= 27 && y < 33) return [30, 22, 12]; return mix(brass, [90, 60, 20], e < 1 ? 0.5 : 0); }
    return null;
  });
}
// ---------------------------------------------------------------- plants (cut-outs)
function blades(seed, cols, n = 16, o = {}) {
  const r = mulberry32(seed);
  return new Img().canvas((x) => {
    for (let i = 0; i < n; i++) {
      const bx = 6 + r() * 52, h = (o.h || 40) + r() * (o.hv || 22), lean = (r() - 0.5) * (o.lean || 26), w = (o.w || 3) + r() * 2;
      const c = cols[(r() * cols.length) | 0];
      const g = x.createLinearGradient(0, 64, 0, 64 - h);
      g.addColorStop(0, css(mix(c, [0, 0, 0], 0.45))); g.addColorStop(0.5, css(c)); g.addColorStop(1, css(mix(c, [255, 255, 200], 0.25)));
      x.fillStyle = g;
      x.beginPath(); x.moveTo(bx - w, 64);
      x.quadraticCurveTo(bx - w * 0.3 + lean * 0.4, 64 - h * 0.55, bx + lean, 64 - h);
      x.quadraticCurveTo(bx + w * 0.3 + lean * 0.4, 64 - h * 0.55, bx + w, 64);
      x.closePath(); x.fill();
    }
  }).bleed();
}
function flower(seed, petal, centre) {
  const img = blades(seed, [rgb(0x4f8f34), rgb(0x3f7a2a), rgb(0x5fa040)], 6, { h: 30, hv: 12, lean: 14, w: 2 });
  const r = mulberry32(seed + 5);
  return img.canvas((x) => {
    x.strokeStyle = css(rgb(0x3f7a2a)); x.lineWidth = 2.4;
    x.beginPath(); x.moveTo(32, 64); x.quadraticCurveTo(28, 44, 33, 26); x.stroke();
    x.fillStyle = css(rgb(0x4f8f34));
    for (const [lx, ly, a] of [[30, 48, -0.6], [33, 40, 0.7]]) { x.save(); x.translate(lx, ly); x.rotate(a); x.beginPath(); x.ellipse(5, 0, 7, 2.6, 0, 0, 6.3); x.fill(); x.restore(); }
    const cx = 33, cy = 22, np = 5;
    for (let i = 0; i < np; i++) {
      const a = (i / np) * Math.PI * 2 + r() * 0.3;
      x.save(); x.translate(cx, cy); x.rotate(a);
      const g = x.createRadialGradient(6, 0, 1, 6, 0, 9);
      g.addColorStop(0, css(mix(petal, [255, 255, 255], 0.25))); g.addColorStop(1, css(mix(petal, [0, 0, 0], 0.25)));
      x.fillStyle = g; x.beginPath(); x.ellipse(7, 0, 8.5, 5, 0, 0, 6.3); x.fill(); x.restore();
    }
    x.fillStyle = css(centre); x.beginPath(); x.arc(cx, cy, 3.4, 0, 6.3); x.fill();
  }).bleed();
}
function fern(seed) {
  const r = mulberry32(seed);
  return new Img().canvas((x) => {
    for (let f = 0; f < 5; f++) {
      const a = -Math.PI / 2 + (f - 2) * 0.42 + (r() - 0.5) * 0.2, len = 40 + r() * 16;
      const c = mix(rgb(0x3f8a34), rgb(0x6aab45), r());
      x.strokeStyle = css(mix(c, [0, 0, 0], 0.3)); x.lineWidth = 1.6;
      const px = (t) => 32 + Math.cos(a) * len * t + Math.sin(t * 2.2) * 4 * Math.sign(a + Math.PI / 2), py = (t) => 64 + Math.sin(a) * len * t + t * t * 10;
      x.beginPath(); x.moveTo(px(0), py(0)); for (let t = 0.1; t <= 1.001; t += 0.1) x.lineTo(px(t), py(t)); x.stroke();
      x.fillStyle = css(c);
      for (let t = 0.15; t < 0.97; t += 0.08) {
        const l = 7 * (1 - t) + 2;
        for (const sd of [-1, 1]) { x.save(); x.translate(px(t), py(t)); x.rotate(a + sd * 1.1); x.beginPath(); x.ellipse(l * 0.5, 0, l * 0.6, 1.6, 0, 0, 6.3); x.fill(); x.restore(); }
      }
    }
  }).bleed();
}
function ribbons(seed, cols, n, o = {}) {
  const r = mulberry32(seed);
  return new Img().canvas((x) => {
    for (let i = 0; i < n; i++) {
      const bx = 10 + r() * 44, ph = r() * 6, w = (o.w || 3.2) + r() * 1.5, c = cols[(r() * cols.length) | 0];
      x.fillStyle = css(c);
      x.beginPath();
      for (let y = 64; y >= (o.top || 2); y -= 2) x.lineTo(bx + Math.sin(y * 0.12 + ph) * 5 - w, y);
      for (let y = o.top || 2; y <= 64; y += 2) x.lineTo(bx + Math.sin(y * 0.12 + ph) * 5 + w, y);
      x.closePath(); x.fill();
      if (o.bulbs) { x.fillStyle = css(mix(c, [255, 230, 120], 0.5)); for (let y = 12 + r() * 10; y < 60; y += 14) { x.beginPath(); x.arc(bx + Math.sin(y * 0.12 + ph) * 5 + w + 2, y, 2.2, 0, 6.3); x.fill(); } }
    }
  }).bleed();
}
function bamboo(seed) {
  const r = mulberry32(seed);
  return new Img().canvas((x) => {
    for (const bx of [20, 40]) {
      const g = x.createLinearGradient(bx - 5, 0, bx + 5, 0);
      g.addColorStop(0, css(rgb(0x5f8a2e))); g.addColorStop(0.45, css(rgb(0xa8c860))); g.addColorStop(1, css(rgb(0x5a7f2a)));
      x.fillStyle = g; x.fillRect(bx - 5, 0, 10, 64);
      x.fillStyle = css(rgb(0x4a6a22));
      for (let y = (r() * 16) | 0; y < 64; y += 21) { x.fillRect(bx - 6, y, 12, 2.2); x.fillStyle = css(rgb(0xc8dc8a)); x.fillRect(bx - 5, y + 2.2, 10, 1); x.fillStyle = css(rgb(0x4a6a22)); }
      x.fillStyle = css(rgb(0x6aa040));
      x.save(); x.translate(bx + 4, 18 + r() * 20); x.rotate(-0.5); x.beginPath(); x.ellipse(8, 0, 10, 2.6, 0, 0, 6.3); x.fill(); x.restore();
    }
  }).bleed();
}
function vine(seed) {
  const r = mulberry32(seed);
  return new Img().canvas((x) => {
    for (const bx of [16, 34, 50]) {
      x.strokeStyle = css(rgb(0x355e22)); x.lineWidth = 1.6;
      x.beginPath(); for (let y = 0; y <= 64; y += 4) x.lineTo(bx + Math.sin(y * 0.15 + bx) * 3, y); x.stroke();
      for (let y = 4 + r() * 6; y < 62; y += 7 + r() * 4) {
        const sd = r() < 0.5 ? -1 : 1, c = mix(rgb(0x3f7a2c), rgb(0x6aa64a), r());
        x.fillStyle = css(c); x.save(); x.translate(bx + Math.sin(y * 0.15 + bx) * 3, y); x.rotate(sd * 0.9); x.beginPath(); x.ellipse(4, 0, 5, 3, 0, 0, 6.3); x.fill(); x.restore();
      }
    }
  }).bleed();
}
function coral(seed, c, tip) {
  const r = mulberry32(seed);
  return new Img().canvas((x) => {
    const branch = (px, py, len, ang, w, depth) => {
      const ex = px + Math.sin(ang) * len, ey = py - Math.cos(ang) * len;
      x.strokeStyle = css(mix(c, [0, 0, 0], 0.15 * depth)); x.lineWidth = w; x.lineCap = 'round';
      x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + Math.sin(ang + 0.4) * len * 0.5, py - Math.cos(ang + 0.4) * len * 0.5, ex, ey); x.stroke();
      if (depth <= 0) { x.fillStyle = css(tip); x.beginPath(); x.arc(ex, ey, w * 0.8 + 1, 0, 6.3); x.fill(); return; }
      branch(ex, ey, len * 0.72, ang - 0.5 - r() * 0.3, w * 0.72, depth - 1);
      branch(ex, ey, len * 0.72, ang + 0.4 + r() * 0.3, w * 0.72, depth - 1);
    };
    branch(32, 64, 20, (r() - 0.5) * 0.3, 6, 3);
  }).bleed();
}
function mushroom(seed) {
  return new Img().canvas((x) => {
    for (const [cx, h, s] of [[22, 30, 1], [40, 22, 0.75], [50, 34, 0.6]]) {
      x.fillStyle = css(rgb(0xe8f4ea)); x.fillRect(cx - 2.5 * s, 64 - h, 5 * s, h);
      const g = x.createRadialGradient(cx, 64 - h, 1, cx, 64 - h, 13 * s);
      g.addColorStop(0, css(rgb(0xc8fff0))); g.addColorStop(0.6, css(rgb(0x5ae6c8))); g.addColorStop(1, css(rgb(0x2a9a8a)));
      x.fillStyle = g; x.beginPath(); x.ellipse(cx, 64 - h, 12 * s, 7 * s, 0, Math.PI, 0); x.fill();
      x.fillStyle = css(rgb(0xffffff), 0.8); for (const d of [-5, 0, 4]) { x.beginPath(); x.arc(cx + d * s, 64 - h - 3 * s, 1.3, 0, 6.3); x.fill(); }
    }
  }).bleed();
}
function starfish() {
  return new Img().canvas((x) => {
    const g = x.createRadialGradient(32, 32, 2, 32, 32, 26);
    g.addColorStop(0, css(rgb(0xf6a060))); g.addColorStop(1, css(rgb(0xc8582a)));
    x.fillStyle = g; x.beginPath();
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? 9 : 26; x.lineTo(32 + Math.cos(a) * rr, 32 + Math.sin(a) * rr); }
    x.closePath(); x.fill();
    x.fillStyle = css(rgb(0xffe0b0), 0.8);
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 - Math.PI / 2; for (let k = 6; k < 22; k += 4) { x.beginPath(); x.arc(32 + Math.cos(a) * k, 32 + Math.sin(a) * k, 1.1, 0, 6.3); x.fill(); } }
  }).bleed();
}
function lamp() {
  const n = vnoise(7, 8);
  return new Img().each((x, y) => {
    const e = Math.min(x, 63 - x, y, 63 - y), glass = x > 12 && x < 52 && y > 12 && y < 52 && (Math.abs(x - 32) > 2);
    if (glass) { const d = Math.hypot(x - 32, y - 34) / 26; const c = mix([255, 236, 170], [255, 160, 60], clamp01(d)); return [c[0], c[1] * (0.95 + 0.05 * n(x, y)), c[2]]; }
    const s = e < 2 ? 0.7 : e > 10 ? 0.85 : 1.1;
    return [60 * s, 56 * s, 52 * s];
  });
}
function cloth(seed, c) {
  const n = vnoise(seed, 8), fold = anoise(seed + 1, 3, 1);
  return new Img().each((x, y) => {
    const weave = ((x + y) % 2 ? 0.96 : 1.04) * (x % 4 === 0 ? 0.95 : 1);
    const s = weave * (0.82 + 0.25 * fold(x, y)) * (0.94 + 0.1 * n(x, y));
    return [c[0] * s, c[1] * s, c[2] * s];
  });
}
function vault(seed, top) {
  const n = vnoise(seed, 16), base = rgb(0x283430), rim = rgb(0x4f9a84);
  return new Img().each((x, y) => {
    const e = Math.min(x, 63 - x, y, 63 - y), plate = Math.min(x % 32, 31 - (x % 32), y % 32, 31 - (y % 32));
    let c = base, s = 0.85 + 0.25 * n(x, y);
    if (plate < 1.5) s *= 0.6; else if (plate < 3) s *= 1.15;
    if (e < 3) c = rim;
    if (plate > 3 && plate < 5.5 && (x % 32 < 6 || x % 32 > 25) && (y % 32 < 6 || y % 32 > 25)) s *= 1.5;
    if (top && Math.hypot(x - 32, y - 32) < 6) c = rim;
    return [c[0] * s, c[1] * s, c[2] * s];
  });
}

const PAINT = {
  [T.plank]: () => planks(11, rgb(0xb98a56), rgb(0x6e4a2a), rgb(0x8a6236), { nails: true }),
  [T.hullwood]: () => planks(12, rgb(0xd6d6d6), rgb(0x7c7c7c), rgb(0xa4a4a4), { rows: 5, nails: true }),
  [T.wreckwood]: () => masonryMoss(planks(13, rgb(0x6d6252), rgb(0x3e3830), rgb(0x544a3e)), 13),
  [T.log_side]: () => bark(21, rgb(0x6b4a2b), rgb(0x3a2615), rgb(0x8a6844)),
  [T.palm_side]: () => bark(22, rgb(0x9b7a50), rgb(0x5f4a30), rgb(0xc2a273), { cols: 6, rings: 6 }),
  [T.jlog_side]: () => bark(23, rgb(0x6a3b25), rgb(0x34190e), rgb(0x8f5638), { cols: 14 }),
  [T.log_top]: () => endGrain(24, rgb(0x5f4126), rgb(0xb08a58), rgb(0x9a7547)),
  [T.palm_top]: () => endGrain(25, rgb(0x7d6140), rgb(0xc2a273), rgb(0xae8d60)),
  [T.jlog_top]: () => endGrain(26, rgb(0x4a2718), rgb(0xa0583a), rgb(0x8a4a30)),
  [T.brick]: () => masonry(31, rgb(0x969b9f), rgb(0x5f6366)),
  [T.whitebrick]: () => masonry(32, rgb(0xeae6dc), rgb(0xa9a396), { vary: 0.08 }),
  [T.mossbrick]: () => masonry(33, rgb(0x8a8f86), rgb(0x55594f), { moss: rgb(0x4f7a36) }),
  [T.cloth]: () => cloth(41, rgb(0xa8342a)),
  [T.barrel_side]: () => staves(51, rgb(0x8a5a30), rgb(0x3a3b3d)),
  [T.keg_side]: () => staves(52, rgb(0x5a3622), rgb(0x2c2d2f), { mark: rgb(0xe0d2b0) }),
  [T.crate]: () => crate(53),
  [T.chest_side]: () => chest(61, false),
  [T.chest_front]: () => chest(61, true),
  [T.chest_top]: () => chest(62, false),
  [T.vault_side]: () => vault(71, false),
  [T.vault_top]: () => vault(72, true),
  [T.lamp]: () => lamp(),
  [T.tallgrass]: () => blades(81, [rgb(0x5f9e3f), rgb(0x78b84f), rgb(0x4a8330), rgb(0x8ac25a)], 18),
  [T.seagrass]: () => blades(82, [rgb(0x4a9a5a), rgb(0x3a8a4c), rgb(0x5aaa6a)], 14, { h: 44, lean: 34 }),
  [T.flower_r]: () => flower(83, rgb(0xd63a3a), rgb(0xf6d24a)),
  [T.flower_y]: () => flower(84, rgb(0xf0c83c), rgb(0xb5641e)),
  [T.fern]: () => fern(85),
  [T.kelp]: () => ribbons(86, [rgb(0x2c6e46), rgb(0x3a7a4a), rgb(0x4a8a3a)], 5, { w: 3.6, bulbs: true }),
  [T.bamboo]: () => bamboo(87),
  [T.vine]: () => vine(88),
  [T.coral_p]: () => coral(89, rgb(0xf07aa0), rgb(0xffc0d8)),
  [T.coral_o]: () => coral(90, rgb(0xf0a040), rgb(0xffe090)),
  [T.coral_v]: () => coral(91, rgb(0x9a6ae0), rgb(0xd8c0ff)),
  [T.mushroom]: () => mushroom(92),
  [T.shell]: () => starfish(),
};
function masonryMoss(img, seed) {
  const n = vnoise(seed + 40, 6), n2 = vnoise(seed + 41, 24);
  return img.each((x, y) => { const m = sstep(0.62, 0.78, n(x, y) * 0.75 + n2(x, y) * 0.25); if (m <= 0) return null; const c = img.get(x, y); return mix(c, [79, 106, 58], m * 0.8); });
}

// 64x64 RGBA pixels for a layer, or null when it has no painter
export function paintLayer(i) {
  const f = PAINT[i];
  return f ? f().px : null;
}
