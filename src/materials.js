import * as THREE from 'three';
import { EMIT_START, T } from './config.js';

// One texture array + a small Lambert patch shared by terrain, plants, ships and characters.
export const shared = { tex: null, detail: null, frond: null, time: { value: 0 } };
const RELIEF_NORMAL = `vec3 brineReliefNormal(vec3 surfPos, vec3 surfNorm, float height, float scale) {
  vec3 sigmaX = dFdx(surfPos);
  vec3 sigmaY = dFdy(surfPos);
  vec3 r1 = cross(sigmaY, surfNorm);
  vec3 r2 = cross(surfNorm, sigmaX);
  float det = dot(sigmaX, r1);
  if (abs(det) < 1e-6) return surfNorm;
  vec3 grad = sign(det) * (dFdx(height) * r1 + dFdy(height) * r2);
  return normalize(abs(det) * surfNorm - scale * grad);
}`;

export function voxelMaterial({ cutout = false, sway = false, side = THREE.DoubleSide, emissive = 0x000000 } = {}) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, side, emissive, roughness: 0.88, metalness: 0.025 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTex = { value: shared.tex };
    sh.uniforms.uTime = shared.time;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec2 tuv;
attribute float layer;
${sway ? 'attribute float sway;\nuniform float uTime;' : ''}
varying vec2 vTuv;
varying float vLayer;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vTuv = tuv; vLayer = layer;
${sway ? `transformed.x += sin(uTime * 1.7 + position.x * 0.61 + position.z * 0.43) * 0.07 * sway;
transformed.z += cos(uTime * 1.3 + position.z * 0.71 + position.x * 0.2) * 0.07 * sway;` : ''}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform highp sampler2DArray uTex;
varying vec2 vTuv;
varying float vLayer;
${RELIEF_NORMAL}`)
      .replace('#include <map_fragment>', `vec4 texel = texture(uTex, vec3(vTuv, floor(vLayer + 0.5)));
diffuseColor *= texel;
${cutout ? 'if (diffuseColor.a < 0.5) discard;' : ''}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = clamp(roughnessFactor + (dot(texel.rgb, vec3(0.299, 0.587, 0.114)) - 0.5) * 0.12, 0.7, 1.0);`)
      .replace('#include <normal_fragment_begin>', cutout ? `#include <normal_fragment_begin>
normal = normalize(vNormal);` : `#include <normal_fragment_begin>
float reliefScale = 0.22;
if (abs(vLayer - ${T.plank}.0) < 0.5 || abs(vLayer - ${T.wreckwood}.0) < 0.5 ||
    abs(vLayer - ${T.log_side}.0) < 0.5 || abs(vLayer - ${T.hullwood}.0) < 0.5) reliefScale = 0.38;
else if (abs(vLayer - ${T.brick}.0) < 0.5 || abs(vLayer - ${T.whitebrick}.0) < 0.5 ||
         abs(vLayer - ${T.mossbrick}.0) < 0.5 || abs(vLayer - ${T.slate}.0) < 0.5 ||
         abs(vLayer - ${T.stone}.0) < 0.5 || abs(vLayer - ${T.bone}.0) < 0.5) reliefScale = 0.32;
else if (abs(vLayer - ${T.cloth}.0) < 0.5) reliefScale = 0.42;
float reliefHeight = dot(texel.rgb, vec3(0.299, 0.587, 0.114));
normal = brineReliefNormal(-vViewPosition, normalize(normal), reliefHeight, reliefScale);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
if (vLayer > ${EMIT_START}.0 - 0.5) totalEmissiveRadiance += texel.rgb * 1.15;`);
  };
  mat.customProgramCacheKey = () => `vox-${cutout ? 1 : 0}-${sway ? 1 : 0}`;
  return mat;
}

// Smooth ground and canopies: vertex colours (a top and a side colour, blended by slope) painted with a
// tiling detail texture projected from three sides, so there are no texture seams on curved ground.
// detail channels: r sand grain, g grass clumps, b rock cracks, a dirt clods (also a large-scale tint)
export function terrainMaterial({ leaf = false } = {}) {
  // Ground is drawn on both sides: if the camera ever ends up inside the rock (a tight tunnel, the
  // third-person camera against a cliff) it sees the dark inside of the rock, never through the world.
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: leaf ? 0.84 : 0.97, metalness: 0 });
  if (!leaf) mat.shadowSide = THREE.BackSide;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uDetail = { value: shared.detail };
    sh.uniforms.uTime = shared.time;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec3 color2;
attribute vec4 detail;
attribute float glow;
uniform float uTime;
varying vec3 vCol2;
varying vec4 vDet;
varying float vGlow;
varying vec3 vWPos;
varying vec3 vWNor;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vCol2 = color2; vDet = detail; vGlow = glow; vWNor = normal; vWPos = position;
${leaf ? `transformed.x += sin(uTime * 1.3 + position.x * 0.45 + position.y * 0.3) * 0.06;
transformed.z += cos(uTime * 1.1 + position.z * 0.45 + position.y * 0.2) * 0.06;` : ''}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D uDetail;
varying vec3 vCol2;
varying vec4 vDet;
varying float vGlow;
varying vec3 vWPos;
varying vec3 vWNor;
${leaf ? '' : RELIEF_NORMAL}`)
      .replace('void main() {', leaf ? 'void main() {' : `void main() {
if (!gl_FrontFacing) { gl_FragColor = vec4(0.035, 0.03, 0.026, 1.0); return; }`)
      .replace('#include <color_fragment>', `
vec3 tn = normalize(vWNor);
vec3 bw = pow(abs(tn), vec3(3.0)); bw /= (bw.x + bw.y + bw.z);
float sc = ${leaf ? '0.42' : '0.24'};
vec4 dd = texture2D(uDetail, vWPos.zy * sc) * bw.x + texture2D(uDetail, vWPos.xz * sc) * bw.y + texture2D(uDetail, vWPos.xy * sc) * bw.z;
float top = smoothstep(${leaf ? '-0.2, 0.75' : '0.5, 0.82'}, tn.y);
vec4 w = vDet;
${leaf ? '' : 'w.a += w.g * (1.0 - top); w.g *= top;'}
float det = dot(dd, w) / max(0.001, w.r + w.g + w.b + w.a);
float macro = texture2D(uDetail, vWPos.xz * 0.019).a;
vec3 base = mix(vCol2, vColor.rgb, top);
diffuseColor.rgb *= base * (0.6 + 0.66 * det) * (0.86 + 0.28 * macro);`)
      .replace('#include <normal_fragment_begin>', leaf ? '#include <normal_fragment_begin>' : `#include <normal_fragment_begin>
normal = brineReliefNormal(-vViewPosition, normalize(normal), det, 0.22);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += base * vGlow * (0.9 + 0.5 * det);`);
  };
  mat.customProgramCacheKey = () => `terrain-${leaf ? 1 : 0}`;
  return mat;
}

// palm fronds: a leaf texture with cut-out edges, swaying from the tip
export function frondMaterial() {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: shared.frond, alphaTest: 0.45, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = shared.time;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
float tip = uv.y * uv.y;
transformed.y += sin(uTime * 1.7 + position.x * 0.4 + position.z * 0.35) * 0.16 * tip;
transformed.x += cos(uTime * 1.3 + position.z * 0.5) * 0.1 * tip;`);
  };
  mat.customProgramCacheKey = () => 'frond';
  return mat;
}

export function makeVoxelMaterials(tex, detail, frond) {
  shared.tex = tex; shared.detail = detail; shared.frond = frond;
  return {
    solid: voxelMaterial(),
    plant: voxelMaterial({ cutout: true, sway: true, side: THREE.DoubleSide }),
    prop: voxelMaterial(),
    terrain: terrainMaterial(),
    leaves: terrainMaterial({ leaf: true }),
    frond: frondMaterial(),
  };
}
