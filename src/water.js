import * as THREE from 'three';
import { W, D, SEA, WATER_Y } from './config.js';

const MAX_SHIPS = 10;   // ships whose hulls the sea stays out of

// Shared wave state: storms raise waveState.amp; the shader and gameplay use the same formula.
export const waveState = { amp: 1 };
export const waveHeight = (x, z, t) =>
  waveState.amp * (0.2 * Math.sin(0.11 * x + 0.85 * t) + 0.15 * Math.sin(0.15 * z - 1.05 * t + 1.3) + 0.08 * Math.sin(0.21 * (x + z) + 1.6 * t));

const VERT = /* glsl */`
uniform float uTime;
uniform float uAmp;
varying vec3 vWorld;
varying float vWave;
#include <fog_pars_vertex>
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  float w = 0.2 * sin(0.11 * wp.x + 0.85 * uTime) + 0.15 * sin(0.15 * wp.z - 1.05 * uTime + 1.3) + 0.08 * sin(0.21 * (wp.x + wp.z) + 1.6 * uTime);
  wp.y += w * uAmp;
  vWave = w;
  vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = /* glsl */`
uniform sampler2D uDepth;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uFoam;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uSky;
uniform float uTime;
uniform float uLight;
uniform float uSpec;
uniform float uStorm;
varying vec3 vWorld;
varying float vWave;
// Ships keep the sea out of their hulls: each is (x, z, heading, size) and (y, pitch, roll); size 0 = none.
// The hull's shape is the size-1 plan in ship.js (bow -6.4, stern 5.6, half beam 2.2), at the fragment's own height.
uniform vec4 uShipA[${MAX_SHIPS}];
uniform vec4 uShipB[${MAX_SHIPS}];
float hwPlan(float z) {
  if (z < -1.2) return 2.2 * max(0.12, pow(max(0.0, (z + 6.4) / 5.2), 0.7));
  if (z > 4.0) return 2.2 * (1.0 - 0.22 * min(1.0, (z - 4.0) / 1.6));
  return 2.2;
}
float keelPlan(float z) { float b = max(0.0, (-3.0 - z) / 3.4), s = max(0.0, (z - 3.6) / 2.0); return -1.45 + 1.7 * b * b + 0.55 * s * s; }
float railPlan(float z) { float b = max(0.0, (-2.0 - z) / 4.4), s = max(0.0, (z - 3.0) / 2.6); return 1.62 + 0.42 * b * b + 0.22 * s * s; }
float hullPlan(float z, float y) {
  float y0 = keelPlan(z), t = clamp((y - y0) / (railPlan(z) - y0), 0.0, 1.0);
  return hwPlan(z) * (1.0 - pow(1.0 - t, 3.2)) * (1.0 - 0.05 * smoothstep(0.82, 1.0, t));
}
bool inHull(vec3 p) {
  for (int i = 0; i < ${MAX_SHIPS}; i++) {
    vec4 A = uShipA[i];
    if (A.w <= 0.0) continue;
    vec4 B = uShipB[i];
    vec3 d = p - vec3(A.x, B.x, A.y);
    if (abs(d.x) > 14.0 * A.w || abs(d.z) > 14.0 * A.w) continue;
    float ch = cos(A.z), sh = sin(A.z), cp = cos(B.y), sp = sin(B.y), cr = cos(B.z), sr = sin(B.z);
    vec3 q = vec3(ch * d.x - sh * d.z, d.y, sh * d.x + ch * d.z);          // undo the heading
    q = vec3(q.x, q.y * cp + q.z * sp, -q.y * sp + q.z * cp);              // the pitch
    q = vec3(q.x * cr + q.y * sr, -q.x * sr + q.y * cr, q.z) / A.w;        // the roll, then into plan units
    if (q.z > -6.3 && q.z < 5.55 && q.y > keelPlan(q.z) && abs(q.x) < hullPlan(q.z, q.y) - 0.04) return true;
  }
  return false;
}
#include <fog_pars_fragment>
void main() {
  if (inHull(vWorld)) discard;
  vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  if (n.y < 0.0) n = -n;
  vec2 uv = vec2(vWorld.x / ${W}.0, vWorld.z / ${D}.0);
  float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  vec4 dt = texture2D(uDepth, uv);
  // no sea in pits and tunnels dug below the waterline inside an island (looked up block by block)
  if (inside > 0.5 && texelFetch(uDepth, ivec2(clamp(floor(vWorld.x), 0.0, ${W - 1}.0), clamp(floor(vWorld.z), 0.0, ${D - 1}.0)), 0).g > 0.5) discard;
  float depth = mix(1.0, dt.r, inside);
  vec3 base = mix(uShallow, uDeep, smoothstep(0.03, 0.75, depth));
  vec3 V = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - max(dot(n, V), 0.0), 4.0);
  float diff = 0.62 + 0.38 * max(dot(n, uSunDir), 0.0);
  vec3 Hh = normalize(uSunDir + V);
  float spec = pow(max(dot(n, Hh), 0.0), 90.0) * uSpec;
  vec3 col = base * diff * uLight + uSky * fres * 0.35 + uSunCol * spec;
  float shore = (1.0 - smoothstep(0.0, 0.17, depth)) * inside;
  float band = step(0.6, 0.5 + 0.5 * sin(depth * 70.0 - uTime * 2.2 + vWorld.x * 0.13 + vWorld.z * 0.07));
  float foam = shore * band + (1.0 - smoothstep(0.0, 0.035, depth)) * inside * 0.8;
  foam = max(foam, smoothstep(0.3, 0.4, vWave) * (0.18 + uStorm * 0.8));
  foam = clamp(foam, 0.0, 1.0);
  col = mix(col, uFoam * (0.5 + 0.5 * uLight), foam);
  float alpha = mix(0.5, 0.9, smoothstep(0.0, 0.5, depth));
  alpha = clamp(max(alpha, foam * 0.95) + fres * 0.12, 0.0, 1.0);
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export class Ocean {
  constructor(scene) {
    const size = 480, seg = 160;
    this.step = size / seg;
    const g = new THREE.PlaneGeometry(size, size, seg, seg);
    g.rotateX(-Math.PI / 2);
    this.depthData = new Uint8Array(W * D * 4).fill(255);
    this.depthTex = new THREE.DataTexture(this.depthData, W, D, THREE.RGBAFormat);
    this.depthTex.magFilter = THREE.LinearFilter; this.depthTex.minFilter = THREE.LinearFilter;
    this.depthTex.wrapS = this.depthTex.wrapT = THREE.ClampToEdgeWrapping;
    this.depthTex.needsUpdate = true;
    this.uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 }, uAmp: { value: 1 }, uDepth: { value: null },
      uDeep: { value: new THREE.Color(0x1d6f8f) }, uShallow: { value: new THREE.Color(0x3fc1c0) }, uFoam: { value: new THREE.Color(0xf4fbfb) },
      uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.3) }, uSunCol: { value: new THREE.Color(0xfff3dc) }, uSky: { value: new THREE.Color(0xbfe2f0) },
      uLight: { value: 1 }, uSpec: { value: 1 }, uStorm: { value: 0 },
    }]);
    this.uniforms.uDepth.value = this.depthTex;
    this.uniforms.uShipA = { value: Array.from({ length: MAX_SHIPS }, () => new THREE.Vector4()) };
    this.uniforms.uShipB = { value: Array.from({ length: MAX_SHIPS }, () => new THREE.Vector4()) };
    this.mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, fog: true });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.position.y = WATER_Y;
    this.mesh.renderOrder = 2;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }
  setDepthColumn(world, x, z) {
    const v = Math.round(world.depthAt(x, z) * 255);
    const i = (x + z * W) * 4;
    this.depthData[i] = this.depthData[i + 2] = v;
    // dug out at the waterline inside an island: the sea must not show in the pit or tunnel
    this.depthData[i + 1] = world.dryColumn(x, z) && (!world.solid(x, SEA, z) || !world.solid(x, SEA - 1, z)) ? 255 : 0;
  }
  rebuildDepth(world) {
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) this.setDepthColumn(world, x, z);
    this.depthTex.needsUpdate = true;
  }
  flushDepth(world) {
    if (!world.depthDirty.size) return;
    for (const c of world.depthDirty) this.setDepthColumn(world, c % W, (c / W) | 0);
    world.depthDirty.clear();
    this.depthTex.needsUpdate = true;
  }
  // the ships afloat this frame (sinking ones fill with water, so they are left out)
  setShips(ships) {
    const A = this.uniforms.uShipA.value, Bv = this.uniforms.uShipB.value;
    let n = 0;
    for (const s of ships) {
      if (!s || s.sinking || n >= MAX_SHIPS) continue;
      A[n].set(s.pos.x, s.pos.z, s.heading, s.size); Bv[n].set(s.pos.y, s.pitch || 0, s.roll || 0, 0); n++;
    }
    for (; n < MAX_SHIPS; n++) A[n].w = 0;
  }
  update(t, cam, sky, storm, amp) {
    const u = this.uniforms;
    u.uTime.value = t; u.uAmp.value = amp; u.uStorm.value = storm;
    if (sky) {
      u.uDeep.value.copy(sky.deepWater); u.uShallow.value.copy(sky.shallowWater);
      u.uSunDir.value.copy(sky.lightDir); u.uSunCol.value.copy(sky.sun.color).multiplyScalar(Math.min(1.2, sky.sun.intensity * 0.7));
      u.uSky.value.copy(sky.zenith); u.uLight.value = sky.lightLevel; u.uSpec.value = sky.specular;
    }
    this.mesh.position.x = Math.round(cam.x / this.step) * this.step;
    this.mesh.position.z = Math.round(cam.z / this.step) * this.step;
  }
}
