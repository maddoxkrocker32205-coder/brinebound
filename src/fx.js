import * as THREE from 'three';

const _col = new THREE.Color();

export class Particles {
  constructor(scene, max = 1200) {
    this.max = max; this.cursor = 0;
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.grav = new Float32Array(max);
    for (let i = 0; i < max; i++) this.pos[i * 3 + 1] = -9999;
    const g = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3); this.posAttr.setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(this.col, 3); this.colAttr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.posAttr); g.setAttribute('color', this.colAttr);
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.22, vertexColors: true, sizeAttenuation: true }));
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
    scene.add(this.points);
    this.live = 0;
  }
  // grav < 0 makes particles rise (smoke)
  burst(x, y, z, hex, count, speed = 3, up = 2, grav = 14, life = 0.8, spread = 0.3) {
    _col.setHex(hex);
    for (let k = 0; k < count; k++) {
      const i = this.cursor; this.cursor = (this.cursor + 1) % this.max;
      this.pos[i * 3] = x + (Math.random() - 0.5) * spread;
      this.pos[i * 3 + 1] = y + (Math.random() - 0.5) * spread;
      this.pos[i * 3 + 2] = z + (Math.random() - 0.5) * spread;
      this.vel[i * 3] = (Math.random() - 0.5) * 2 * speed;
      this.vel[i * 3 + 1] = up * (0.3 + Math.random());
      this.vel[i * 3 + 2] = (Math.random() - 0.5) * 2 * speed;
      this.life[i] = life * (0.6 + Math.random() * 0.7);
      this.grav[i] = grav;
      const v = 0.82 + Math.random() * 0.3;
      this.col[i * 3] = _col.r * v; this.col[i * 3 + 1] = _col.g * v; this.col[i * 3 + 2] = _col.b * v;
    }
    this.colAttr.needsUpdate = true;
    this.live = 1;
  }
  update(dt) {
    if (!this.live) return;
    let any = 0;
    const drag = Math.max(0, 1 - 1.4 * dt);
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -9999; continue; }
      any = 1;
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      this.vel[i * 3] *= drag; this.vel[i * 3 + 2] *= drag;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
    }
    this.posAttr.needsUpdate = true;
    this.live = any;
  }
}

export class Projectiles {
  constructor(scene) {
    this.scene = scene; this.list = []; this.pool = [];
    this.geo = new THREE.SphereGeometry(0.24, 8, 6);
    this.mat = new THREE.MeshLambertMaterial({ color: 0x1d1f21 });
  }
  // vis: a crew member's copy of the captain's shot, drawn and splashed but never doing damage
  spawn(x, y, z, vx, vy, vz, owner, dmg = 1, vis = false) {
    const m = this.pool.pop() || new THREE.Mesh(this.geo, this.mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    this.scene.add(m);
    this.list.push({ m, vx, vy, vz, owner, dmg, vis, life: 0 });
  }
  update(dt, G) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const b = this.list[i];
      b.life += dt;
      let dead = false;
      const h = dt / 3;
      for (let s = 0; s < 3 && !dead; s++) {
        b.vy -= 9.8 * h;
        const p = b.m.position;
        p.x += b.vx * h; p.y += b.vy * h; p.z += b.vz * h;
        dead = G.cannonballStep(b, p);
      }
      if (Math.random() < dt * 30) G.particles.burst(b.m.position.x, b.m.position.y, b.m.position.z, 0xb9bcbf, 1, 0.2, 0.3, -0.5, 0.5, 0.1);
      if (dead || b.life > 7) { this.scene.remove(b.m); this.pool.push(b.m); this.list.splice(i, 1); }
    }
  }
  clear() { for (const b of this.list) { this.scene.remove(b.m); this.pool.push(b.m); } this.list = []; }
}
