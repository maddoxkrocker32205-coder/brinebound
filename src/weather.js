import * as THREE from 'three';
import { waveState } from './water.js';

// Storm cycle: calm spells, then a squall with rain, rough seas and lightning.
const DROPS = 1400;
export class Weather {
  constructor(G) {
    this.g = G;
    this.storm = 0; this.target = 0;
    this.state = 'clear'; this.timer = 260 + Math.random() * 160;
    this.forced = 0; this.boltT = 6; this.follow = null;
    this.pos = new Float32Array(DROPS * 6);
    this.seed = new Float32Array(DROPS * 3);
    for (let i = 0; i < DROPS; i++) { this.seed[i * 3] = Math.random() * 60 - 30; this.seed[i * 3 + 1] = Math.random() * 40; this.seed[i * 3 + 2] = Math.random() * 60 - 30; }
    const g = new THREE.BufferGeometry();
    this.attr = new THREE.BufferAttribute(this.pos, 3); this.attr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.attr);
    this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xb8cad6, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    this.rain.frustumCulled = false; this.rain.visible = false;
    G.scene.add(this.rain);
    this.fall = 0;
  }
  force(seconds) { this.forced = Math.max(this.forced, seconds); }
  update(dt) {
    const G = this.g;
    this.timer -= dt;
    if (this.follow != null) this.target = this.follow;          // a crew member's sky follows the captain's
    else if (this.forced > 0) { this.forced -= dt; this.target = 1; }
    else if (this.timer <= 0) {
      if (this.state === 'clear') { this.state = 'storm'; this.timer = 100 + Math.random() * 70; this.target = 1; G.onStormStart(); }
      else { this.state = 'clear'; this.timer = 300 + Math.random() * 200; this.target = 0; }
    } else this.target = this.state === 'storm' ? 1 : 0;
    this.storm += (this.target - this.storm) * Math.min(1, dt * 0.045);
    if (Math.abs(this.target - this.storm) < 0.002) this.storm = this.target;
    waveState.amp = 1 + this.storm * 1.35;
    const s = this.storm;
    this.rain.visible = s > 0.12;
    if (this.rain.visible) {
      this.rain.material.opacity = Math.min(0.55, (s - 0.12) * 0.9);
      const cam = G.camera.position;
      this.fall += dt * 38;
      const wx = Math.cos(G.wind.angle) * 0.35, wz = Math.sin(G.wind.angle) * 0.35;
      const n = Math.floor(DROPS * Math.min(1, s * 1.2));
      for (let i = 0; i < DROPS; i++) {
        const o = i * 6;
        if (i >= n) { this.pos[o + 1] = this.pos[o + 4] = -999; continue; }
        const y = ((this.seed[i * 3 + 1] - this.fall) % 40 + 40) % 40;
        const x = cam.x + this.seed[i * 3] + wx * y, z = cam.z + this.seed[i * 3 + 2] + wz * y, yy = cam.y - 12 + y;
        this.pos[o] = x; this.pos[o + 1] = yy; this.pos[o + 2] = z;
        this.pos[o + 3] = x - wx * 0.9; this.pos[o + 4] = yy - 0.9; this.pos[o + 5] = z - wz * 0.9;
      }
      this.attr.needsUpdate = true;
    }
    if (s > 0.6) {
      this.boltT -= dt;
      if (this.boltT <= 0) {
        this.boltT = 5 + Math.random() * 10;
        G.sky.flash = 1;
        G.ui.flashScreen();
        const delay = 0.4 + Math.random() * 1.6;
        setTimeout(() => G.sfx.thunder(), delay * 1000);
      }
    }
    G.sfx.setRain(s);
  }
}
