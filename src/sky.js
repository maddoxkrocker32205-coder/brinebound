import * as THREE from 'three';
import { mulberry32 } from './noise.js';
import { cloudTexture } from './textures.js';

export const CYCLE = 360;     // seconds per day
const DAYLEN = 238;           // sun above the horizon for this long

// t, horizon, zenith, sunColor, sunI, hemiSky, hemiGround, hemiI, deepWater, shallowWater, stars, clouds
const K = [
  [0, 0xf0b07c, 0x6f8fc0, 0xffb987, 0.9, 0xb9c8e0, 0x6a5440, 0.62, 0x2c5f78, 0x58a9a8, 0.3, 0xffd9c0],
  [30, 0xc4e4f0, 0x4b9fd6, 0xfff3dc, 1.75, 0xd4ebff, 0x7a6448, 1.0, 0x1d6f8f, 0x3fc1c0, 0.0, 0xffffff],
  [200, 0xc4e4f0, 0x4b9fd6, 0xfff3dc, 1.75, 0xd4ebff, 0x7a6448, 1.0, 0x1d6f8f, 0x3fc1c0, 0.0, 0xffffff],
  [228, 0xef9461, 0x5d6fa8, 0xffa266, 1.0, 0xc8a7a0, 0x6a4c3a, 0.66, 0x2a4f68, 0x5aa0a0, 0.1, 0xffc9a0],
  [250, 0x1d3352, 0x08111f, 0xb4c6ff, 0.75, 0x5872a6, 0x34343f, 0.72, 0x0c2436, 0x1d4d5a, 0.95, 0x2a3448],
  [338, 0x1d3352, 0x08111f, 0xb4c6ff, 0.75, 0x5872a6, 0x34343f, 0.72, 0x0c2436, 0x1d4d5a, 0.95, 0x2a3448],
  [360, 0xf0b07c, 0x6f8fc0, 0xffb987, 0.9, 0xb9c8e0, 0x6a5440, 0.62, 0x2c5f78, 0x58a9a8, 0.3, 0xffd9c0],
];
const STORM = { horizon: new THREE.Color(0x6f7a83), zenith: new THREE.Color(0x46505a), deep: new THREE.Color(0x2b4450), shallow: new THREE.Color(0x4f7a7c), clouds: new THREE.Color(0x7d868e) };

const SKY_VERT = `varying vec3 vDir;
void main() { vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = vec4(p.xy, p.w * 0.99999, p.w); }`;
const SKY_FRAG = `uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uSunDir; uniform vec3 uGlow; uniform float uGlowK;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uZenith, pow(smoothstep(-0.02, 0.62, h), 0.75));
  float s = max(dot(d, uSunDir), 0.0);
  col += uGlow * (pow(s, 6.0) * 0.35 + pow(s, 48.0) * 0.5) * uGlowK;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const CLOUD_VERT = `varying vec3 vW; void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`;
const CLOUD_FRAG = `uniform sampler2D uTex; uniform vec3 uColor; uniform vec3 uShade; uniform vec2 uOff; uniform float uOpacity; uniform vec3 uCam; uniform vec2 uSun; uniform float uCover;
varying vec3 vW;
float dens(vec2 p) {
  vec4 a = texture2D(uTex, p);
  vec4 b = texture2D(uTex, p * 3.1 + vec2(0.37, 0.71));
  return a.r * 0.78 + b.g * 0.22;
}
void main() {
  vec2 p = (vW.xz + uOff) / 520.0;
  float d = dens(p);
  float a = smoothstep(uCover, uCover + 0.2, d);
  float far = 1.0 - smoothstep(170.0, 420.0, length(vW.xz - uCam.xz));
  a *= far * uOpacity;
  if (a < 0.01) discard;
  // lit from the sun's side, shaded where the cloud is thick behind
  float lit = clamp(0.62 + (d - dens(p + uSun * 0.018)) * 5.0, 0.0, 1.0);
  float core = smoothstep(uCover + 0.08, uCover + 0.38, d);
  vec3 col = mix(uColor, uShade, core * (1.0 - lit) * 0.9);
  col = mix(col, uColor * 1.06, (1.0 - core) * 0.5);
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function discTexture(inner, outer) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, inner); g.addColorStop(0.42, inner); g.addColorStop(0.5, outer); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Sky {
  constructor(scene, quality) {
    this.scene = scene;
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.5);
    this.sun.shadow.camera.near = 1; this.sun.shadow.camera.far = 320;
    this.sun.shadow.bias = -0.0006; this.sun.shadow.normalBias = 0.05;
    scene.add(this.hemi, this.sun, this.sun.target);
    this.fogFar = 160;
    scene.fog = new THREE.Fog(0xc4e4f0, 55, 160);
    scene.background = null;
    this.keys = K.map((k) => ({ t: k[0], horizon: new THREE.Color(k[1]), zenith: new THREE.Color(k[2]), sun: new THREE.Color(k[3]), sunI: k[4], hs: new THREE.Color(k[5]), hg: new THREE.Color(k[6]), hi: k[7], deep: new THREE.Color(k[8]), shallow: new THREE.Color(k[9]), stars: k[10], clouds: new THREE.Color(k[11]) }));
    this.horizon = new THREE.Color(); this.zenith = new THREE.Color();
    this.deepWater = new THREE.Color(); this.shallowWater = new THREE.Color(); this.cloudColor = new THREE.Color();
    this.lightDir = new THREE.Vector3(0, 1, 0);
    this.isNight = false; this.night = 0; this.day = 1; this.tod = 0; this.lightLevel = 1; this.specular = 1;
    this.flash = 0;
    // dome
    this.domeU = { uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3() }, uGlow: { value: new THREE.Color(0xfff0d0) }, uGlowK: { value: 1 } };
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(450, 32, 16), new THREE.ShaderMaterial({ uniforms: this.domeU, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false }));
    this.dome.renderOrder = -10; this.dome.frustumCulled = false;
    scene.add(this.dome);
    // clouds
    this.cloudU = { uTex: { value: cloudTexture() }, uColor: { value: new THREE.Color() }, uShade: { value: new THREE.Color() }, uOff: { value: new THREE.Vector2() }, uOpacity: { value: 0.85 }, uCam: { value: new THREE.Vector3() }, uSun: { value: new THREE.Vector2(1, 0) }, uCover: { value: 0.52 } };
    const cg = new THREE.PlaneGeometry(900, 900); cg.rotateX(Math.PI / 2);
    this.clouds = new THREE.Mesh(cg, new THREE.ShaderMaterial({ uniforms: this.cloudU, vertexShader: CLOUD_VERT, fragmentShader: CLOUD_FRAG, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide }));
    this.clouds.position.y = 74; this.clouds.renderOrder = -5; this.clouds.frustumCulled = false;
    scene.add(this.clouds);
    this.cloudDrift = 0;
    // stars, sun, moon
    const n = 500, p = new Float32Array(n * 3), r = mulberry32(7);
    for (let i = 0; i < n; i++) {
      const th = r() * Math.PI * 2, ph = Math.acos(1 - r() * 0.92);
      p[i * 3] = Math.sin(ph) * Math.cos(th) * 300; p[i * 3 + 1] = Math.cos(ph) * 300; p[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * 300;
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(p, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xfff6e0, size: 1.7, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.stars.frustumCulled = false; this.stars.renderOrder = -9;
    scene.add(this.stars);
    this.sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: discTexture('#fff6d8', 'rgba(255,214,140,0.35)'), fog: false, depthWrite: false, transparent: true }));
    this.sunSprite.scale.set(46, 46, 1); this.sunSprite.renderOrder = -8;
    this.moonSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: discTexture('#eef3ff', 'rgba(190,210,255,0.25)'), fog: false, depthWrite: false, transparent: true }));
    this.moonSprite.scale.set(30, 30, 1); this.moonSprite.renderOrder = -8;
    scene.add(this.sunSprite, this.moonSprite);
    this._d = new THREE.Vector3();
    this.setQuality(quality);
  }
  setQuality(q) {
    this.quality = q;
    const far = q.view;
    this.fogFar = far;
    this.sun.castShadow = q.shadows > 0;
    if (q.shadows > 0) {
      this.sun.shadow.mapSize.set(q.shadows, q.shadows);
      const ext = q.shadows >= 2048 ? 64 : 46;
      const c = this.sun.shadow.camera;
      c.left = -ext; c.right = ext; c.top = ext; c.bottom = -ext; c.updateProjectionMatrix();
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
    this.clouds.visible = q.clouds;
  }

  update(time, cam, storm = 0, dt = 0) {
    const t = ((time % CYCLE) + CYCLE) % CYCLE;
    let i = 0;
    while (i < this.keys.length - 2 && this.keys[i + 1].t <= t) i++;
    const a = this.keys[i], b = this.keys[i + 1], f = (t - a.t) / (b.t - a.t);
    this.horizon.lerpColors(a.horizon, b.horizon, f).lerp(STORM.horizon, storm * 0.85);
    this.zenith.lerpColors(a.zenith, b.zenith, f).lerp(STORM.zenith, storm * 0.85);
    this.deepWater.lerpColors(a.deep, b.deep, f).lerp(STORM.deep, storm * 0.7);
    this.shallowWater.lerpColors(a.shallow, b.shallow, f).lerp(STORM.shallow, storm * 0.7);
    this.cloudColor.lerpColors(a.clouds, b.clouds, f).lerp(STORM.clouds, storm);
    this.scene.fog.color.copy(this.horizon);
    this.scene.fog.far = this.fogFar * (1 - storm * 0.42);
    this.scene.fog.near = this.scene.fog.far * 0.32;
    this.sun.color.lerpColors(a.sun, b.sun, f);
    this.sun.intensity = (a.sunI + (b.sunI - a.sunI) * f) * (1 - storm * 0.6);
    this.hemi.color.lerpColors(a.hs, b.hs, f);
    this.hemi.groundColor.lerpColors(a.hg, b.hg, f);
    this.hemi.intensity = (a.hi + (b.hi - a.hi) * f) * (1 - storm * 0.25) + this.flash * 2.2;
    this.flash = Math.max(0, this.flash - dt * 6);
    const stars = (a.stars + (b.stars - a.stars) * f) * (1 - storm);
    this.stars.material.opacity = stars; this.stars.visible = stars > 0.01;
    this.night = a.stars + (b.stars - a.stars) * f;
    this.lightLevel = Math.min(1, 0.35 + this.hemi.intensity * 0.55 + this.sun.intensity * 0.12);
    this.specular = (1 - this.night * 0.6) * (1 - storm * 0.8);
    const sunA = t < DAYLEN ? (t / DAYLEN) * Math.PI : -1;
    const moonA = t >= DAYLEN ? ((t - DAYLEN) / (CYCLE - DAYLEN)) * Math.PI : -1;
    const ang = sunA >= 0 ? sunA : moonA;
    this.lightDir.set(Math.cos(ang), Math.max(0.24, Math.sin(ang)), 0.32).normalize();
    const snap = (v) => Math.round(v / 2) * 2;
    this.sun.target.position.set(snap(cam.x), 12, snap(cam.z));
    this.sun.position.copy(this.sun.target.position).addScaledVector(this.lightDir, 140);
    const cd = this._d.set(Math.cos(ang), Math.sin(ang), 0.32).normalize();
    this.sunSprite.visible = sunA >= 0 && storm < 0.7;
    this.moonSprite.visible = moonA >= 0 && storm < 0.7;
    (sunA >= 0 ? this.sunSprite : this.moonSprite).position.copy(cam).addScaledVector(cd, 280);
    this.dome.position.copy(cam);
    this.stars.position.copy(cam);
    this.domeU.uZenith.value.copy(this.zenith);
    this.domeU.uHorizon.value.copy(this.horizon);
    this.domeU.uSunDir.value.copy(cd);
    { const l = Math.hypot(cd.x, cd.z) || 1; this.cloudU.uSun.value.set(cd.x / l, cd.z / l); }
    this.domeU.uGlowK.value = (sunA >= 0 ? 1 : 0.25) * (1 - storm);
    this.cloudDrift += dt * (2.5 + storm * 6);
    this.cloudU.uOff.value.set(this.cloudDrift, this.cloudDrift * 0.4);
    this.cloudU.uColor.value.copy(this.cloudColor);
    this.cloudU.uOpacity.value = 0.9 + storm * 0.1;
    this.cloudU.uCover.value = 0.53 - storm * 0.2;
    this.cloudU.uShade.value.copy(this.cloudColor).multiplyScalar(0.62).lerp(this.hemiGround || this.cloudColor, 0.15);
    this.cloudU.uCam.value.copy(cam);
    this.clouds.position.x = cam.x; this.clouds.position.z = cam.z;
    this.isNight = t > 244 && t < 352;
    this.day = Math.floor(time / CYCLE) + 1;
    this.tod = t;
  }
}
