// Saves: three slots plus an autosave. Always kept in this browser; mirrored to the cloud
// (per-person private storage) when the page runs inside Claude with the db capability.
export const SLOTS = ['auto', 's1', 's2', 's3'];
const LKEY = (s) => 'brinebound-v2-' + s;

// ---- compact encoding for block edits: sorted, delta + varint, then deflate when available
function b64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
function unb64(str) { const s = atob(str); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
async function pipe(u8, Stream, fmt) { return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new Stream(fmt))).arrayBuffer()); }

// A small DEFLATE decoder (after zlib's puff.c) for browsers and app web views without
// DecompressionStream, or whose stream never finishes: a save written on one device must open on another.
const LBASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LEXT = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DBASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DEXT = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
export function inflateRaw(src) {
  let pos = 0, bit = 0, op = 0, out = new Uint8Array(Math.max(1024, src.length * 4));
  const room = (n) => { if (op + n <= out.length) return; let l = out.length * 2; while (l < op + n) l *= 2; const o = new Uint8Array(l); o.set(out); out = o; };
  const bits = (n) => {
    let v = 0;
    for (let i = 0; i < n; i++) { if (pos >= src.length) throw new Error('truncated'); v |= ((src[pos] >> bit) & 1) << i; if (++bit === 8) { bit = 0; pos++; } }
    return v;
  };
  const table = (lens) => {
    const count = new Uint16Array(16), offs = new Uint16Array(16), sym = new Uint16Array(lens.length);
    for (const l of lens) count[l]++;
    count[0] = 0;
    for (let i = 1; i < 15; i++) offs[i + 1] = offs[i] + count[i];
    for (let s = 0; s < lens.length; s++) if (lens[s]) sym[offs[lens[s]]++] = s;
    return { count, sym };
  };
  const decode = (h) => {
    let code = 0, first = 0, index = 0;
    for (let len = 1; len < 16; len++) {
      code |= bits(1);
      const c = h.count[len];
      if (code - c < first) return h.sym[index + (code - first)];
      index += c; first += c; first <<= 1; code <<= 1;
    }
    throw new Error('bad code');
  };
  const block = (lt, dt) => {
    for (;;) {
      let s = decode(lt);
      if (s < 256) { room(1); out[op++] = s; continue; }
      if (s === 256) return;
      s -= 257;
      const len = LBASE[s] + bits(LEXT[s]);
      const ds = decode(dt), dist = DBASE[ds] + bits(DEXT[ds]);
      if (dist > op) throw new Error('bad distance');
      room(len);
      for (let k = 0; k < len; k++, op++) out[op] = out[op - dist];
    }
  };
  let fixed = null;
  let last = 0;
  while (!last) {
    last = bits(1);
    const type = bits(2);
    if (type === 0) {
      if (bit) { bit = 0; pos++; }
      const len = src[pos] | (src[pos + 1] << 8); pos += 4;
      if (pos + len > src.length) throw new Error('truncated');
      room(len); out.set(src.subarray(pos, pos + len), op); op += len; pos += len;
    } else if (type === 1) {
      if (!fixed) {
        const l = new Uint8Array(288); l.fill(8, 0, 144); l.fill(9, 144, 256); l.fill(7, 256, 280); l.fill(8, 280, 288);
        fixed = [table(l), table(new Uint8Array(30).fill(5))];
      }
      block(fixed[0], fixed[1]);
    } else if (type === 2) {
      const nlen = bits(5) + 257, ndist = bits(5) + 1, ncode = bits(4) + 4;
      const cl = new Uint8Array(19);
      for (let i = 0; i < ncode; i++) cl[ORDER[i]] = bits(3);
      const ct = table(cl), lens = new Uint8Array(nlen + ndist);
      for (let i = 0; i < nlen + ndist;) {
        const s = decode(ct);
        if (s < 16) { lens[i++] = s; continue; }
        let rep = 0, v = 0;
        if (s === 16) { if (!i) throw new Error('bad repeat'); v = lens[i - 1]; rep = 3 + bits(2); }
        else if (s === 17) rep = 3 + bits(3);
        else rep = 11 + bits(7);
        if (i + rep > nlen + ndist) throw new Error('bad lengths');
        while (rep--) lens[i++] = v;
      }
      block(table(lens.subarray(0, nlen)), table(lens.subarray(nlen)));
    } else throw new Error('bad block');
  }
  return out.subarray(0, op);
}
export function gunzip(u8) {
  if (u8[0] !== 0x1f || u8[1] !== 0x8b) throw new Error('not gzip');
  const flg = u8[3];
  let p = 10;
  if (flg & 4) p += 2 + (u8[p] | (u8[p + 1] << 8));
  if (flg & 8) { while (u8[p++]); }
  if (flg & 16) { while (u8[p++]); }
  if (flg & 2) p += 2;
  return inflateRaw(u8.subarray(p));
}
// the browser's own decompressor when it has one (and it answers in time), the one above when not
async function decompress(raw, fmt) {
  if (typeof DecompressionStream !== 'undefined') {
    try { return await Promise.race([pipe(raw, DecompressionStream, fmt), new Promise((_, no) => setTimeout(() => no(new Error('slow')), 4000))]); } catch (e) { /* fall through */ }
  }
  return fmt === 'gzip' ? gunzip(raw) : inflateRaw(raw);
}
export async function packEdits(edits) {
  const arr = Array.from(edits).sort((a, b) => a[0] - b[0]);
  const out = []; let prev = 0;
  for (const [i, id] of arr) { let d = i - prev; prev = i; while (d >= 128) { out.push((d & 127) | 128); d = Math.floor(d / 128); } out.push(d); out.push(id); }
  const raw = Uint8Array.from(out);
  if (typeof CompressionStream !== 'undefined') {
    for (const fmt of ['deflate-raw', 'gzip']) { try { return { z: fmt, n: arr.length, b: b64(await pipe(raw, CompressionStream, fmt)) }; } catch (e) { /* try next */ } }
  }
  return { z: '', n: arr.length, b: b64(raw) };
}
export async function unpackEdits(p) {
  if (!p || !p.b) return [];
  let raw = unb64(p.b);
  if (p.z) raw = await decompress(raw, p.z);
  const out = []; let i = 0, prev = 0;
  while (i < raw.length) { let d = 0, mul = 1, b; do { b = raw[i++]; d += (b & 127) * mul; mul *= 128; } while (b & 128); prev += d; out.push([prev, raw[i++]]); }
  return out;
}

export class SaveSystem {
  constructor(game) {
    this.g = game; this.db = null; this.uid = null; this.cloud = 'checking';
    this.queue = {}; this.busy = {};
    this.initCloud();
  }
  async initCloud() {
    try {
      const c = window.claude;
      if (!c || typeof c.use !== 'function') { this.cloud = 'off'; return; }
      const [db, user] = await Promise.all([c.use('db'), c.use('user')]);
      if (!db || !user) { this.cloud = 'off'; return; }
      const uid = await user.id();
      if (!uid) { this.cloud = 'off'; return; }
      this.db = db; this.uid = uid; this.cloud = 'on';
      this.g.onCloudReady && this.g.onCloudReady();
    } catch (e) { this.cloud = 'off'; }
  }
  ref(slot) { return this.db.collection('data/users/' + this.uid).doc('slot-' + slot); }
  readLocal(slot) { try { const s = localStorage.getItem(LKEY(slot)); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  writeLocal(slot, doc) { try { localStorage.setItem(LKEY(slot), JSON.stringify(doc)); return true; } catch (e) { return false; } }
  async readCloud(slot) {
    if (this.cloud !== 'on') return null;
    try {
      const snap = await Promise.race([this.ref(slot).get(), new Promise((r) => setTimeout(() => r(null), 5000))]);
      return snap && snap.exists ? snap.data() : null;
    } catch (e) { return null; }
  }
  // doc = { meta: {...}, data: {...} }
  async write(slot, doc, cloud = true) {
    const okLocal = this.writeLocal(slot, doc);
    if (cloud && this.cloud === 'on') this.enqueue(slot, doc);
    return okLocal || this.cloud === 'on';
  }
  enqueue(slot, doc) {
    this.queue[slot] = doc;
    if (this.busy[slot]) return;
    const run = async () => {
      this.busy[slot] = true;
      while (this.queue[slot]) {
        const d = this.queue[slot]; this.queue[slot] = null;
        try { await this.ref(slot).set(JSON.parse(JSON.stringify(d))); }
        catch (e) {
          if (e && (e.code === 'invalid_argument' || e.code === 'revoked' || e.code === 'not_granted')) { this.cloud = 'readonly'; break; }
          if (e && e.code === 'quota_exceeded') { this.g.ui.toast('Cloud save full', 'Your save is kept in this browser only.', 'bad'); break; }
          if (e && e.code === 'unavailable') { await new Promise((r) => setTimeout(r, 1500 + Math.random() * 1500)); try { await this.ref(slot).set(JSON.parse(JSON.stringify(d))); } catch (e2) { /* give up for now */ } }
        }
      }
      this.busy[slot] = false;
    };
    run();
  }
  async read(slot) {
    const local = this.readLocal(slot);
    const cloud = await this.readCloud(slot);
    if (local && cloud) return (cloud.meta?.savedAt || 0) > (local.meta?.savedAt || 0) ? cloud : local;
    return cloud || local;
  }
  async list() {
    const out = [];
    for (const slot of SLOTS) {
      const doc = await this.read(slot);
      out.push({ slot, meta: doc ? doc.meta : null });
    }
    return out;
  }
  async remove(slot) {
    try { localStorage.removeItem(LKEY(slot)); } catch (e) { /* ignore */ }
    if (this.cloud === 'on') { try { await this.ref(slot).delete(); } catch (e) { /* ignore */ } }
  }
  async latest() { return (await this.candidates())[0] || null; }
  // every save there is, this browser's and the cloud's copies, newest first (to fall back on if one won't open)
  async candidates() {
    const all = await Promise.all(SLOTS.map(async (slot) => {
      const local = this.readLocal(slot), cloud = await this.readCloud(slot);
      return [cloud, local].filter((d) => d && d.meta && d.data).map((doc) => ({ slot, doc }));
    }));
    // voyages from before 0.6 were sailed in the smaller world: they can't continue in this one
    this.hadOld = all.flat().some((c) => !(c.doc.data.v >= 4));
    const out = all.flat().filter((c) => c.doc.data.v >= 4).sort((a, b) => (b.doc.meta.savedAt || 0) - (a.doc.meta.savedAt || 0));
    return out.filter((c, i) => i === 0 || c.doc.meta.savedAt !== out[i - 1].doc.meta.savedAt || c.slot !== out[i - 1].slot);
  }
  async exportFile(doc) {
    const name = `brinebound-${(doc.meta.name || 'captain').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-day${doc.meta.day || 1}.json`;
    const text = JSON.stringify({ brinebound: 3, ...doc });
    try {
      const c = window.claude;
      const dl = c && typeof c.use === 'function' ? await c.use('downloads') : null;
      if (dl) { await dl.save({ filename: name, data: text }); return { ok: true }; }
      if (!c) { // an ordinary browser, outside the Claude app: a normal download
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
        a.download = name; document.body.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        return { ok: true };
      }
    } catch (e) { if (e && e.code === 'declined') return { ok: false, declined: true }; }
    return { ok: false, text };
  }
  parseFile(text) {
    const o = JSON.parse(text);
    if (!o || (o.brinebound !== 2 && o.brinebound !== 3) || !o.data || !o.meta) throw new Error('This file is not a Brinebound save.');
    return { meta: o.meta, data: o.data };
  }
}
