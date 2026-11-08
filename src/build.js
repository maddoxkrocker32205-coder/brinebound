// The builder's hammer: pick a piece (floor, wall, window, doorway, stairs, roof, post) and a material, see a
// ghost of it snapped to the grid where you aim, and put it down. Walls snap to the edge of the cell you look
// at; stairs and roofs climb away from you.
import * as THREE from 'three';
import { W, D, H, FLOOR, B, BLOCKS } from './config.js';
import { TERRAIN, HARD, PIECE } from './world.js';
import { KINDS, MATS, code, parts, isCode, stairsId, roofId, postId, pieceBoxes, emitPiece } from './pieces.js';

const COST_ITEM = ['plank', 'brick'];
const ICON = {
  floor: '<path d="M2 15 L12 10 L22 15 L12 20 Z" fill="currentColor"/>',
  wall: '<path d="M5 5 L19 5 L19 20 L5 20 Z" fill="currentColor"/><path d="M5 10 H19 M5 15 H19" stroke="#0f1b20" stroke-width="1.2"/>',
  window: '<path d="M5 5 H19 V20 H5 Z M8.5 8.5 V15.5 H15.5 V8.5 Z" fill="currentColor" fill-rule="evenodd"/><path d="M12 8.5 V15.5 M8.5 12 H15.5" stroke="currentColor" stroke-width="1.2"/>',
  door: '<path d="M5 4 H19 V21 H15 V8 H9 V21 H5 Z" fill="currentColor"/>',
  stairs: '<path d="M3 21 V17 H8 V13 H13 V9 H18 V5 H21 V21 Z" fill="currentColor"/>',
  roof: '<path d="M2 20 L12 5 L22 20 L19 20 L12 9.5 L5 20 Z" fill="currentColor"/>',
  post: '<path d="M10 3 H14 V21 H10 Z" fill="currentColor"/><path d="M8 3 H16 V5 H8 Z M8 19 H16 V21 H8 Z" fill="currentColor"/>',
};

export class Builder {
  constructor(G) {
    this.g = G; this.kind = 1; this.mat = 0; this.target = null; this.shownKey = '';
    this.ghostMat = new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.42, depthWrite: false });
    this.ghost = new THREE.Mesh(new THREE.BufferGeometry(), this.ghostMat);
    this.ghost.visible = false; this.ghost.renderOrder = 6;
    G.scene.add(this.ghost);
    this.strip = null;
  }
  get active() { const G = this.g; return G.state === 'play' && G.hotbar[G.sel] === 'hammer' && G.player.alive && G.player.mode !== 'helm'; }
  // the strip of pieces above the hotbar (clickable, tappable)
  buildStrip() {
    if (this.strip) return;
    const el = document.createElement('div');
    el.id = 'pieceStrip'; el.className = 'hidden';
    el.setAttribute('role', 'group'); el.setAttribute('aria-label', 'Building pieces');
    KINDS.forEach((k, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'piece'; b.title = k.name;
      b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[k.key]}</svg><span>${k.name}</span>`;
      b.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.kind = i; this.sync(); });
      el.append(b);
    });
    const m = document.createElement('button');
    m.type = 'button'; m.className = 'piece mat';
    m.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.toggleMat(); });
    el.append(m);
    this.costEl = document.createElement('div'); this.costEl.className = 'pcost';
    el.append(this.costEl);
    document.getElementById('hud').append(el);
    this.strip = el; this.matBtn = m;
    this.sync();
  }
  sync() {
    if (!this.strip) return;
    [...this.strip.querySelectorAll('.piece:not(.mat)')].forEach((b, i) => b.classList.toggle('sel', i === this.kind));
    this.matBtn.textContent = MATS[this.mat] === 'wood' ? 'Wood' : 'Stone';
    this.matBtn.setAttribute('aria-label', `Material: ${this.matBtn.textContent}. Tap to switch.`);
    this.updateCost();
  }
  updateCost() {
    if (!this.costEl) return;
    const k = KINDS[this.kind], it = COST_ITEM[this.mat], have = this.g.inv[it] || 0;
    this.costEl.textContent = `${k.name} · ${k.cost} ${it === 'plank' ? 'planks' : 'bricks'} (${have})`;
    this.costEl.classList.toggle('short', have < k.cost);
  }
  cycle(d) { this.kind = (this.kind + d + KINDS.length) % KINDS.length; this.sync(); }
  toggleMat() { this.mat = 1 - this.mat; this.sync(); }

  // Where the selected piece would go for the current aim: { cells: [[x, y, z, id, part]], ok, why }
  plan(hit, aim) {
    const G = this.g, w = G.world, P = G.player, k = KINDS[this.kind].key, mat = this.mat;
    if (!hit) return null;
    const px = hit.px ?? aim.o.x + aim.d.x * hit.t, py = hit.py ?? aim.o.y + aim.d.y * hit.t, pz = hit.pz ?? aim.o.z + aim.d.z * hit.t;
    const onFloor = isCode(hit.id) && hit.part === 'floor' && hit.ny > 0;
    const place = hit.place ? [hit.place.x, hit.place.y, hit.place.z] : [hit.x + hit.nx, hit.y + hit.ny, hit.z + hit.nz];
    const out = { cells: [], ok: true, why: '' };
    const cellOk = (x, y, z) => { const id = w.get(x, y, z); return id === B.AIR || BLOCKS[id].plant || isCode(id); };
    const sameMat = (id) => !isCode(id) || parts(id).mat === mat;
    if (k === 'floor') {
      let [x, y, z] = place;
      if (onFloor) {
        // aiming near the edge of a floor: the next floor along
        const fx = px - hit.x, fz = pz - hit.z, e = Math.min(fx, 1 - fx, fz, 1 - fz);
        if (e > 0.3) return { cells: [], ok: false, why: 'There’s a floor here already' };
        x = hit.x + (fx === e ? -1 : 1 - fx === e ? 1 : 0); z = hit.z + (fz === e ? -1 : 1 - fz === e ? 1 : 0); y = hit.y;
      }
      const cur = w.get(x, y, z), p = parts(cur);
      if (!cellOk(x, y, z) || (p && p.floor)) return { cells: [], ok: false, why: 'No room for a floor' };
      if (!sameMat(cur)) return { cells: [], ok: false, why: 'Wood and stone can’t share a cell' };
      out.cells.push([x, y, z, code(mat, 1, p ? p.west : 0, p ? p.north : 0), code(mat, 1, 0, 0)]);
    } else if (k === 'wall' || k === 'window' || k === 'door') {
      const kind = k === 'wall' ? 1 : k === 'window' ? 2 : 3;
      let [cx, cy, cz] = onFloor ? [hit.x, hit.y, hit.z] : place;
      // which edge of the cell the aim is nearest
      let fx = px - cx, fz = pz - cz;
      fx = Math.min(1, Math.max(0, fx)); fz = Math.min(1, Math.max(0, fz));
      const d = [fx, 1 - fx, fz, 1 - fz], side = d.indexOf(Math.min(...d));
      let x = cx, z = cz, edge = 'west';
      if (side === 1) x = cx + 1; else if (side === 2) edge = 'north'; else if (side === 3) { z = cz + 1; edge = 'north'; }
      const put = (y) => {
        const cur = w.get(x, y, z), p = parts(cur);
        if (!cellOk(x, y, z) || (p && p[edge])) return false;
        if (!sameMat(cur)) return false;
        const f = p ? p.floor : 0, wv = edge === 'west' ? kind : p ? p.west : 0, nv = edge === 'north' ? kind : p ? p.north : 0;
        out.cells.push([x, y, z, code(mat, f, wv, nv), code(mat, 0, edge === 'west' ? kind : 0, edge === 'north' ? kind : 0)]);
        return true;
      };
      if (!put(cy)) return { cells: [], ok: false, why: 'That edge is taken' };
      if (kind === 3 && cy + 1 < H - 1) put(cy + 1);          // a doorway is two cells tall
    } else {
      const [x, y, z] = place;
      if (!cellOk(x, y, z) || isCode(w.get(x, y, z))) return { cells: [], ok: false, why: 'No room here' };
      const rot = ((-Math.round(P.yaw / (Math.PI / 2))) % 4 + 4) % 4;
      const id = k === 'stairs' ? stairsId(mat, rot) : k === 'roof' ? roofId(mat, rot) : postId(mat);
      out.cells.push([x, y, z, id, id]);
    }
    // the rules: inside the world, not someone's doorstep, not on a ship, not inside you, holding onto something
    for (const [x, y, z, id] of out.cells) {
      if (x < 1 || z < 1 || x >= W - 1 || z >= D - 1 || y < FLOOR || y >= H - 1) return { cells: [], ok: false, why: 'Out of reach' };
      if (G.isProtected(x, y, z)) return { cells: [], ok: false, why: 'Not on someone’s doorstep' };
      for (const s of [G.sloop, ...G.hollows]) if (s && !s.sinking && s.containsPoint(x + 0.5, y + 0.5, z + 0.5)) return { cells: [], ok: false, why: 'Not on a ship' };
      if (P.mode === 'foot') {
        const bx = pieceBoxes(w, x, y, z, id, []);
        for (const b of bx) if (b[3] > P.pos.x - 0.3 && b[0] < P.pos.x + 0.3 && b[5] > P.pos.z - 0.3 && b[2] < P.pos.z + 0.3 && b[4] > P.pos.y + 0.02 && b[1] < P.pos.y + 1.75) return { cells: out.cells, ok: false, why: 'You’re in the way' };
      }
    }
    const [x0, y0, z0] = out.cells[0];
    if (!this.anchored(x0, y0, z0)) return { cells: out.cells, ok: false, why: 'It needs something to rest on' };
    const cost = KINDS[this.kind].cost, it = COST_ITEM[mat];
    if ((G.inv[it] || 0) < cost) return { cells: out.cells, ok: false, why: `Needs ${cost} ${it === 'plank' ? 'planks' : 'bricks'}` };
    return out;
  }
  // a piece must touch the ground or something already built
  anchored(x, y, z) {
    const w = this.g.world;
    if (isCode(w.get(x, y, z))) return true;
    for (const [dx, dy, dz] of [[0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [1, -1, 0], [-1, -1, 0], [0, -1, 1], [0, -1, -1]]) {
      const id = w.get(x + dx, y + dy, z + dz);
      if (TERRAIN[id] || HARD[id] || y + dy < FLOOR) return true;
    }
    return w.groundUnder(x + 0.5, y + 0.4, z + 0.5) > y - 0.6;
  }
  update(dt, hit, aim, hide) {
    const on = this.active && !hide;
    if (on) this.buildStrip();
    if (this.strip) this.strip.classList.toggle('hidden', !on);
    if (!on) { this.ghost.visible = false; this.target = null; return; }
    const I = this.g.input;
    if (I.take('q')) this.cycle(1);
    if (I.take('mat')) this.toggleMat();
    const plan = this.plan(hit, aim);
    this.target = plan;
    this.updateCost();
    if (!plan || !plan.cells.length) { this.ghost.visible = false; return; }
    const key = plan.cells.map((c) => c.join(',')).join(';');
    if (key !== this.shownKey) {
      this.shownKey = key;
      const A = { pos: [], nor: [], col: [], uv: [], lay: [], ind: [], n: 0 };
      for (const [x, y, z, , only] of plan.cells) emitPiece(this.g.world, A, x, y, z, only);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(A.pos, 3));
      g.setIndex(A.ind);
      this.ghost.geometry.dispose();
      this.ghost.geometry = g;
    }
    this.ghostMat.color.setHex(plan.ok ? 0x9fe8ff : 0xff7a6a);
    this.ghost.visible = true;
  }
  // put the planned piece down (true if it went down)
  place() {
    const G = this.g, plan = this.target;
    if (!plan || !plan.cells.length) return false;
    if (!plan.ok) { G.ui.pickup(plan.why); return false; }
    const it = COST_ITEM[this.mat];
    G.inv[it] -= KINDS[this.kind].cost;
    for (const [x, y, z, id] of plan.cells) {
      G.world.set(x, y, z, id);
      if (G.net.inCrew) G.net.req('pl', x, y, z, id);
    }
    G.stats.placed++;
    G.sfx.place(); G.vmSwing = 1;
    const [x, y, z] = plan.cells[0];
    G.particles.burst(x + 0.5, y + 0.3, z + 0.5, this.mat ? 0x9a9fa3 : 0xc89a64, 6, 1.2, 1.5, 12, 0.4, 0.5);
    this.shownKey = '';
    G.ui.buildHotbar();
    return true;
  }
}

// What a cell becomes when one part of it is knocked out (0 when nothing is left).
export function withoutPart(id, part) {
  const p = parts(id);
  if (!p) return 0;
  return code(p.mat, part === 'floor' ? 0 : p.floor, part === 'west' ? 0 : p.west, part === 'north' ? 0 : p.north);
}
