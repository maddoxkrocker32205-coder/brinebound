import * as THREE from 'three';
import { GeoBuilder, glowTexture } from './geo.js';
import { voxelMaterial } from './materials.js';

// Seagulls by day, fireflies on land at night.
export class Life {
  constructor(G) {
    this.g = G;
    const mat = voxelMaterial();
    const body = new GeoBuilder().box(-0.12, -0.1, -0.35, 0.12, 0.1, 0.3, 0xf2efe6).box(-0.06, -0.02, -0.5, 0.06, 0.06, -0.35, 0xe9b04a).box(-0.1, -0.05, 0.3, 0.1, 0.05, 0.45, 0x9aa3a8).build();
    const wing = new GeoBuilder().box(0, -0.02, -0.18, 0.9, 0.02, 0.15, 0xe4e7e8).box(0.65, -0.025, -0.18, 0.9, 0.025, 0.15, 0x4a4f54).build();
    this.gulls = [];
    const isl = G.world.islands;
    for (let i = 0; i < 10; i++) {
      const o = isl[i % isl.length];
      const grp = new THREE.Group();
      grp.add(new THREE.Mesh(body, mat));
      const wl = new THREE.Mesh(wing, mat); wl.scale.x = -1;
      const wr = new THREE.Mesh(wing, mat);
      grp.add(wl, wr);
      G.scene.add(grp);
      this.gulls.push({ grp, wl, wr, cx: o.x, cz: o.z, r: 12 + Math.random() * 20, h: 20 + Math.random() * 10, a: Math.random() * 6.28, sp: (0.25 + Math.random() * 0.2) * (Math.random() < 0.5 ? -1 : 1), ph: Math.random() * 6 });
    }
    this.cryT = 4;
    const n = 60;
    this.ff = new Float32Array(n * 3); this.ffSeed = [];
    for (let i = 0; i < n; i++) this.ffSeed.push([Math.random() * 24 - 12, Math.random() * 3 + 0.5, Math.random() * 24 - 12, Math.random() * 6]);
    const g = new THREE.BufferGeometry();
    this.ffAttr = new THREE.BufferAttribute(this.ff, 3); this.ffAttr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.ffAttr);
    this.fireflies = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xd8ff8a, map: glowTexture(), size: 0.35, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.fireflies.frustumCulled = false;
    G.scene.add(this.fireflies);
    this.t = 0;
  }
  update(dt) {
    const G = this.g, P = G.player;
    this.t += dt;
    const day = 1 - G.sky.night;
    const showGulls = day > 0.4 && G.weather.storm < 0.6;
    for (const b of this.gulls) {
      b.grp.visible = showGulls;
      if (!showGulls) continue;
      b.a += b.sp * dt;
      const x = b.cx + Math.cos(b.a) * b.r, z = b.cz + Math.sin(b.a) * b.r, y = b.h + Math.sin(this.t * 0.7 + b.ph) * 1.5;
      b.grp.position.set(x, y, z);
      b.grp.rotation.y = -b.a + (b.sp > 0 ? Math.PI : 0);
      b.grp.rotation.z = b.sp > 0 ? 0.25 : -0.25;
      const flap = Math.sin(this.t * 7 + b.ph) * 0.5;
      b.wl.rotation.z = -flap; b.wr.rotation.z = flap;
    }
    if (showGulls) {
      this.cryT -= dt;
      if (this.cryT <= 0) {
        this.cryT = 5 + Math.random() * 9;
        const near = this.gulls.some((b) => b.grp.position.distanceTo(G.camera.position) < 45);
        if (near) G.sfx.gull();
      }
    }
    const night = G.sky.night;
    const onLand = P.mode === 'foot' && !P.inWater && G.world.islandAt(P.pos.x, P.pos.z) >= 0;
    const target = night > 0.6 && onLand ? 0.9 : 0;
    this.fireflies.material.opacity += (target - this.fireflies.material.opacity) * Math.min(1, dt * 0.8);
    this.fireflies.visible = this.fireflies.material.opacity > 0.02;
    if (this.fireflies.visible) {
      this.ffSeed.forEach((s, i) => {
        this.ff[i * 3] = P.pos.x + s[0] + Math.sin(this.t * 0.5 + s[3]) * 1.5;
        this.ff[i * 3 + 1] = P.pos.y + s[1] + Math.sin(this.t * 1.1 + s[3] * 2) * 0.4;
        this.ff[i * 3 + 2] = P.pos.z + s[2] + Math.cos(this.t * 0.4 + s[3]) * 1.5;
      });
      this.ffAttr.needsUpdate = true;
    }
  }
}
