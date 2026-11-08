// The grappling hook: throw it at anything solid (a cliff, a mast, a fort wall, your own sloop) and get
// hauled toward it, keeping the momentum when you let go. Jump to let go early.
import * as THREE from 'three';
import { WATER_Y } from './config.js';

const RANGE = 34, SPEED = 75, PULL = 44, MAXV = 24;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _h = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

export class Hook {
  constructor(G) {
    this.g = G;
    this.state = 'idle';           // idle | flying | attached | back
    this.anchor = new THREE.Vector3(); this.head = new THREE.Vector3(); this.from = new THREE.Vector3();
    this.ship = null; this.local = new THREE.Vector3(); this.t = 0; this.blockedT = 0;
    const rope = new THREE.CylinderGeometry(0.022, 0.022, 1, 5, 1, true); rope.translate(0, 0.5, 0);
    this.rope = new THREE.Mesh(rope, new THREE.MeshLambertMaterial({ color: 0x8a6a44 }));
    this.rope.visible = false; this.rope.frustumCulled = false;
    const iron = new THREE.MeshLambertMaterial({ color: 0x3a3d40 });
    this.claw = new THREE.Group();
    const shank = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.36, 6), iron); this.claw.add(shank);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      const tine = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.022, 4, 8, Math.PI * 0.75), iron);
      tine.rotation.set(0, a, Math.PI * 0.5); tine.position.set(Math.cos(a) * 0.08, -0.12, Math.sin(a) * 0.08);
      this.claw.add(tine);
    }
    this.claw.visible = false;
    G.scene.add(this.rope, this.claw);
  }
  get busy() { return this.state !== 'idle'; }
  // where the rope leaves your hand
  hand(out) {
    const G = this.g, P = G.player, cam = G.camera;
    if (G.camMode === 'first' && P.mode !== 'helm') {
      _w.set(0.32, -0.22, -0.55).applyQuaternion(cam.quaternion);
      return out.copy(cam.position).add(_w);
    }
    _w.set(Math.cos(P.yaw) * 0.32, 0, -Math.sin(P.yaw) * 0.32);
    return out.set(P.pos.x + _w.x, P.pos.y + 1.25, P.pos.z + _w.z);
  }
  use() {
    if (this.state === 'attached' || this.state === 'flying') { this.release(false); return; }
    if (this.state !== 'idle') return;
    const G = this.g, P = G.player;
    if (P.mode === 'helm' || !P.alive) return;
    const o = P.eye(new THREE.Vector3()), d = P.viewDir(new THREE.Vector3());
    let best = RANGE + 1, ship = null;
    const hit = G.world.pick(o.x, o.y, o.z, d.x, d.y, d.z, RANGE);
    if (hit && hit.t < best) best = hit.t;
    for (const s of [G.sloop, ...G.hollows]) {
      if (!s || s.sinking) continue;
      for (let t = 0.6; t < Math.min(best, RANGE); t += 0.35) {
        if (P.mode !== 'foot' && s === (P.ship || G.sloop) && t < 6) continue;
        if (s.containsPoint(o.x + d.x * t, o.y + d.y * t, o.z + d.z * t)) { best = t; ship = s; break; }
      }
    }
    this.hand(this.from);
    this.head.copy(this.from);
    this.t = 0; this.blockedT = 0;
    if (best > RANGE) {       // nothing to catch on: the hook flies out and drops back
      this.anchor.copy(o).addScaledVector(d, RANGE * 0.7);
      this.ship = null; this.state = 'flying'; this.miss = true;
    } else {
      this.anchor.copy(o).addScaledVector(d, best - 0.05);
      this.ship = ship;
      if (ship) ship.toLocal(this.anchor.x, this.anchor.z, this.local), this.local.y = this.anchor.y - ship.pos.y;
      this.state = 'flying'; this.miss = false;
    }
    G.sfx.swing();
    G.vmSwing = 1;
  }
  release(jump) {
    const G = this.g, P = G.player;
    if (this.state === 'attached' && jump && P.mode === 'foot') { P.vel.y = Math.max(P.vel.y, 0) + 5.5; P.onGround = false; }
    this.state = this.state === 'idle' ? 'idle' : 'back';
    P.hooked = false;
  }
  anchorNow() {
    const s = this.ship;
    if (s) {
      if (s.sinking) { this.release(false); return this.anchor; }
      const c = Math.cos(s.heading), n = Math.sin(s.heading);
      this.anchor.set(s.pos.x + this.local.x * c + this.local.z * n, s.pos.y + this.local.y, s.pos.z - this.local.x * n + this.local.z * c);
    }
    return this.anchor;
  }
  update(dt, input) {
    const G = this.g, P = G.player, jumpPressed = input.jumpHeld && !this.lastJump;
    this.lastJump = input.jumpHeld;
    if (this.state === 'idle') { this.rope.visible = this.claw.visible = false; return; }
    if (!P.alive || P.mode === 'helm' || G.hotbar[G.sel] !== 'hook' && this.state !== 'back') this.release(false);
    this.hand(this.from);
    const A = this.anchorNow();
    if (this.state === 'flying') {
      _v.subVectors(A, this.head);
      const l = _v.length(), step = SPEED * dt;
      if (l <= step) {
        this.head.copy(A);
        if (this.miss) this.state = 'back';
        else {
          this.state = 'attached'; this.t = 0;
          G.sfx.hit(); G.particles.burst(A.x, A.y, A.z, 0xcfc4a8, 6, 1.2, 1.2, 10, 0.4, 0.15);
          if (P.mode === 'deck' && this.ship !== (P.ship || G.sloop)) P.leaveShip(P.ship || G.sloop);
        }
      } else this.head.addScaledVector(_v, step / l);
    } else if (this.state === 'attached') {
      this.head.copy(A);
      this.t += dt;
      if (P.mode === 'deck') { if (this.ship === (P.ship || G.sloop)) { this.release(false); } else P.leaveShip(P.ship || G.sloop); }
      _v.set(P.pos.x, P.pos.y + 0.9, P.pos.z);
      _w.subVectors(A, _v);
      const dist = _w.length();
      if (jumpPressed || this.t > 5) { this.release(true); }
      else if (dist < 1.5) {
        // arrived: on your own sloop you're aboard; anywhere else you pop up over the edge
        this.release(false);
        if (this.ship && !this.ship.sinking && G.boardable().includes(this.ship)) P.forceBoard(this.ship);
        else if (P.mode === 'foot') { P.vel.y = Math.max(P.vel.y, 6.5); P.onGround = false; }
      } else {
        // the line must stay clear: snag it on the ground for a moment and it slips
        const hit = G.world.pick(_v.x, _v.y, _v.z, _w.x / dist, _w.y / dist, _w.z / dist, dist - 0.4);
        this.blockedT = hit ? this.blockedT + dt : 0;
        if (this.blockedT > 0.35) this.release(false);
        else if (P.mode === 'foot') {
          P.hooked = true;
          P.vel.addScaledVector(_w, (PULL * dt) / dist);
          if (_w.y > 0 && P.onGround) { P.onGround = false; P.vel.y = Math.max(P.vel.y, 3); }
          const sp = P.vel.length();
          if (sp > MAXV) P.vel.multiplyScalar(MAXV / sp);
          if (P.inWater && _w.y > 0) P.vel.y = Math.max(P.vel.y, 4);
        }
      }
    }
    if (this.state === 'back') {
      P.hooked = false;
      _v.subVectors(this.from, this.head);
      const l = _v.length(), step = SPEED * 1.2 * dt;
      if (l <= step + 0.05) { this.state = 'idle'; this.rope.visible = this.claw.visible = false; return; }
      this.head.addScaledVector(_v, step / l);
    }
    // draw the line and the claw
    _h.subVectors(this.head, this.from);
    const len = _h.length();
    this.rope.visible = this.claw.visible = true;
    this.rope.position.copy(this.from);
    if (len > 1e-4) this.rope.quaternion.setFromUnitVectors(_up, _h.divideScalar(len));
    this.rope.scale.set(1, Math.max(0.01, len), 1);
    this.claw.position.copy(this.head);
    this.claw.quaternion.copy(this.rope.quaternion);
    if (this.head.y < WATER_Y && this.state === 'back') this.state = 'idle';
  }
  clear() { this.state = 'idle'; this.rope.visible = this.claw.visible = false; if (this.g.player) this.g.player.hooked = false; }
}
