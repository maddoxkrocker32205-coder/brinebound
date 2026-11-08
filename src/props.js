import * as THREE from 'three';
import { W, D, H, WATER_Y, B } from './config.js';
import { waveHeight } from './water.js';
import { GeoBuilder, glowSprite, glowTexture } from './geo.js';
import { voxelMaterial } from './materials.js';

// Floating salvage, message bottles, lantern glows, camp fires and the lighthouse beam.
export class Props {
  constructor(G) {
    this.g = G;
    this.loot = []; this.bottles = []; this.nid = 0;
    this.t = 0; this.glowT = 0;
    this.mat = voxelMaterial();
    this.lootGeo = new GeoBuilder({ round: 0.05 })
      .box(-0.5, -0.32, -0.35, 0.5, 0.18, 0.35, 0x5a3a1c, 24).box(-0.52, 0.18, -0.37, 0.52, 0.42, 0.37, 0x3f6f62, 24)
      .box(-0.08, 0.0, -0.39, 0.08, 0.26, -0.36, 0xd6aa4f).build();
    this.bottleGeo = new GeoBuilder({ round: 0.05 })
      .box(-0.12, -0.3, -0.12, 0.12, 0.12, 0.12, 0x3f8a6a).box(-0.05, 0.12, -0.05, 0.05, 0.3, 0.05, 0x3f8a6a).box(-0.06, 0.3, -0.06, 0.06, 0.37, 0.06, 0x8a6236)
      .box(-0.07, -0.2, -0.07, 0.07, 0.02, 0.07, 0xe9dfc4).build();
    this.glows = [];
    for (let i = 0; i < 28; i++) { const s = glowSprite(0xffc864, 3.4, 0); s.visible = false; G.scene.add(s); this.glows.push(s); }
    // the volcano's crater glow
    const vc = G.world.sites.volcano;
    if (vc) {
      this.lava = glowSprite(0xff7a2a, 22, 0.3);
      this.lava.position.set(vc.x, vc.y + 2, vc.z);
      G.scene.add(this.lava);
      this.smokeT = 0;
    }
    // lighthouse beam
    const lh = G.world.sites.lighthouse;
    if (lh) {
      this.beam = new THREE.Group();
      this.beam.position.set(lh.x, lh.y, lh.z);
      const cone = new THREE.ConeGeometry(4.5, 70, 16, 1, true); cone.translate(0, -35, 0); cone.rotateZ(Math.PI / 2);
      const bm = new THREE.MeshBasicMaterial({ color: 0xfff1c0, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
      const c1 = new THREE.Mesh(cone, bm), c2 = new THREE.Mesh(cone, bm); c2.rotation.y = Math.PI;
      this.beam.add(c1, c2);
      this.beamGlow = glowSprite(0xfff1c0, 9, 0);
      this.beamGlow.position.set(lh.x, lh.y, lh.z);
      G.scene.add(this.beam, this.beamGlow);
      this.beam.visible = false;
    }
  }
  update(dt) {
    const G = this.g, P = G.player;
    this.t += dt;
    const ref = (P.mode === 'deck' || P.mode === 'helm') && G.sloop ? G.sloop.pos : P.pos;
    for (let i = this.loot.length - 1; i >= 0; i--) {
      const L = this.loot[i];
      L.t += dt;
      L.mesh.position.y = WATER_Y + waveHeight(L.x, L.z, G.waveTime) + 0.05;
      L.mesh.rotation.y += dt * 0.6;
      L.glow.position.copy(L.mesh.position); L.glow.position.y += 0.6;
      L.glow.material.opacity = 0.45 + Math.sin(L.t * 4) * 0.2;
      if (L.remote) continue;
      if (Math.hypot(ref.x - L.x, ref.z - L.z) < 5 && P.alive) { G.onLootCollected(L.gold); this.removeLoot(i); }
      else if (L.t > 150) this.removeLoot(i);
    }
    for (let i = this.bottles.length - 1; i >= 0; i--) {
      const b = this.bottles[i];
      b.mesh.position.set(b.x, WATER_Y + waveHeight(b.x, b.z, G.waveTime) + 0.05, b.z);
      b.mesh.rotation.set(Math.sin(this.t * 1.3 + i) * 0.4, this.t * 0.3, Math.cos(this.t + i) * 0.3);
      b.glow.position.set(b.x, b.mesh.position.y + 0.4, b.z);
      b.glow.material.opacity = 0.25 + G.sky.night * 0.5 + Math.sin(this.t * 3 + i) * 0.1;
      if (Math.hypot(ref.x - b.x, ref.z - b.z) < 4.2 && P.alive) { const data = b.data; this.removeBottle(i); G.quests.onBottle(data); }
    }
    // lantern glows near the camera
    this.glowT -= dt;
    if (this.glowT <= 0) {
      this.glowT = 0.4;
      const cx = G.camera.position.x, cz = G.camera.position.z, list = [];
      for (const i of G.world.lamps) {
        const x = i % W, z = ((i / W) | 0) % D, y = (i / (W * D)) | 0;
        const d = (x - cx) * (x - cx) + (z - cz) * (z - cz);
        if (d < 70 * 70) list.push([d, x, y, z]);
      }
      list.sort((a, b) => a[0] - b[0]);
      this.glows.forEach((s, k) => {
        const e = list[k];
        s.visible = !!e;
        if (e) s.position.set(e[1] + 0.5, e[2] + 0.5, e[3] + 0.5);
      });
    }
    const n = G.sky.night;
    for (const s of this.glows) s.material.opacity = 0.18 + n * 0.75;
    // camp fires
    for (const camp of G.quests.campList()) {
      if (!camp.fire || Math.hypot(camp.x - ref.x, camp.z - ref.z) > 70) continue;
      if (Math.random() < dt * 14) G.particles.burst(camp.fire.x, camp.fire.y + 0.2, camp.fire.z, camp.cleared ? 0x777777 : 0x9effc8, 1, 0.4, 1.4, -1.2, 1.2, 0.5);
    }
    const vc = G.world.sites.volcano;
    if (vc && this.lava) {
      const d = Math.hypot(vc.x - G.camera.position.x, vc.z - G.camera.position.z);
      this.lava.material.opacity = 0.25 + n * 0.55 + Math.sin(this.t * 1.7) * 0.05;
      this.smokeT -= dt;
      if (d < 260 && this.smokeT <= 0) {
        this.smokeT = 0.08;
        G.particles.burst(vc.x + (Math.random() - 0.5) * 4, vc.y + 1.5, vc.z + (Math.random() - 0.5) * 4, Math.random() < 0.2 ? 0x8a4a2a : 0x4a4644, 1, 0.6, 2.6, -1.2, 5, 1.5);
      }
    }
    if (this.beam) {
      const lit = G.isLit ? G.isLit() : !!G.quests.flags.lit;
      this.beam.visible = lit && n > 0.2;
      this.beam.rotation.y += dt * 0.6;
      this.beamGlow.material.opacity = lit ? 0.35 + n * 0.65 : 0;
    }
  }
  // nid given: the crew's copy of a crate floating in the captain's world
  spawnLoot(x, z, gold, nid, color) {
    const mesh = new THREE.Mesh(this.lootGeo, this.mat);
    mesh.position.set(x, WATER_Y, z);
    const glow = glowSprite(color || 0x8affc8, 3, 0.5);
    this.g.scene.add(mesh, glow);
    const L = { x, z, gold, mesh, glow, t: 0, nid: nid || ++this.nid, remote: !!nid };
    this.loot.push(L);
    return L;
  }
  removeLoot(i) { const L = this.loot[i]; this.g.scene.remove(L.mesh, L.glow); this.loot.splice(i, 1); }
  clearLoot() { while (this.loot.length) this.removeLoot(0); }
  spawnBottle(x, z, data) {
    const mesh = new THREE.Mesh(this.bottleGeo, this.mat);
    const glow = glowSprite(data && data.story ? 0xffd27a : 0xbff5e0, 2.2, 0.4);
    this.g.scene.add(mesh, glow);
    this.bottles.push({ x, z, data, mesh, glow });
  }
  removeBottle(i) { const b = this.bottles[i]; this.g.scene.remove(b.mesh, b.glow); this.bottles.splice(i, 1); }
  clearBottles() { while (this.bottles.length) this.removeBottle(0); }
}
