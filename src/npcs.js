import * as THREE from 'three';
import { Avatar, portrait } from './character.js';

export const NPC_DEFS = {
  mags: {
    name: 'Old Mags', role: 'Quartermaster of Brine Haven',
    look: { skinHex: '#c99a72', coatHex: '#2f5f66', hairHex: '#b9b6ad', hatName: 'Tricorn', beardName: 'None', patch: true },
    extra: { apron: '#d8cfba' }, facing: Math.PI,
  },
  tallow: {
    name: 'Brother Tallow', role: 'Keeper of the Lantern Cay light',
    look: { skinHex: '#e1ae86', coatHex: '#5a4632', hairHex: '#d9d6cc', hatName: 'Hood', beardName: 'Full' },
    extra: { lantern: true }, facing: -Math.PI / 2,
  },
};

export class NPCs {
  constructor(G) {
    this.g = G;
    this.list = [];
    for (const [id, def] of Object.entries(NPC_DEFS)) {
      const site = G.world.sites[id];
      if (!site) continue;
      const av = new Avatar(def.look, def.extra);
      av.root.position.set(site.x, site.y, site.z);
      av.root.rotation.y = def.facing;
      G.scene.add(av.root);
      this.list.push({ id, def, site, av, yaw: def.facing, portrait: portrait(def.look, 96) });
    }
  }
  get(id) { return this.list.find((n) => n.id === id); }
  update(dt) {
    const P = this.g.player;
    for (const n of this.list) {
      const dx = P.pos.x - n.site.x, dz = P.pos.z - n.site.z;
      const near = Math.hypot(dx, dz) < 9 && P.alive;
      const want = near ? Math.atan2(-dx, -dz) : n.def.facing + Math.sin(n.av.t * 0.35) * 0.35;
      let d = want - n.yaw;
      while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      n.yaw += d * Math.min(1, dt * 3);
      n.av.root.rotation.y = n.yaw;
      n.av.pose('idle', dt, {});
      if (n.av.lantern) n.av.lantern.material.color.setScalar(1);
    }
  }
  nearest(P, range = 3.9) {
    let best = null;
    for (const n of this.list) {
      const d = Math.hypot(P.pos.x - n.site.x, P.pos.z - n.site.z);
      if (d < range && Math.abs(P.pos.y - n.site.y) < 2.6 && (!best || d < best.d)) best = { n, d };
    }
    return best ? best.n : null;
  }
}
