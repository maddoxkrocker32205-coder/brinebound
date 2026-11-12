import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneRig } from 'three/addons/utils/SkeletonUtils.js';
import humanModelUrl from './assets/human-base-rigged.glb';
import { LOOKS } from './config.js';
import { GeoBuilder } from './geo.js';
import { voxelMaterial } from './materials.js';
import { parrotModel, PARROT_COLORS } from './models.js';
import { gunGeo, isGun } from './guns.js';

const FIRST = ['Wren', 'Maddox', 'Ash', 'Morgan', 'Rook', 'Juniper', 'Silas', 'Nell', 'Corbin', 'Isla', 'Fen', 'Marlow'];
const SHIPS = ['The Salt Wren', 'The Gull’s Due', 'The Brass Kettle', 'The Lucky Squall', 'The Driftwood Queen', 'The Ninth Tide'];
export function defaultLook() {
  return { name: 'Captain ' + FIRST[(Math.random() * FIRST.length) | 0], ship: SHIPS[(Math.random() * SHIPS.length) | 0], skin: 1, coat: 0, hat: 0, hair: 1, beard: 2, patch: false, emblem: 0, sail: 0, hull: 0 };
}
export function randomLook() {
  const r = (n) => (Math.random() * n) | 0;
  return { ...defaultLook(), skin: r(LOOKS.skin.length), coat: r(LOOKS.coat.length), hat: [0, 1, 2, 4][r(4)], hair: r(LOOKS.hair.length), beard: r(LOOKS.beard.length), patch: Math.random() < 0.3, emblem: r(LOOKS.emblem.length - 1), sail: r(LOOKS.sail.length), hull: r(LOOKS.hull.length) };
}

const C = {
  trousers: '#3b3028', boots: '#1f1a16', shirt: '#e7dcc3', belt: '#3a2a1c', brass: '#d6aa4f', hatBlack: '#1e1d1c',
  bandana: '#b03a2e', eye: '#1d1b1a', mouth: '#6e3b2c', hood: '#5a4632', feather: '#f1ece0',
  leather: '#49382b', steel: '#555954', steelDark: '#343a3b', glove: '#312820',
};
function shade(hex, k) { const c = new THREE.Color(hex); c.multiplyScalar(k); return c; }

// Look fields may also carry NPC-only extras: { coatHex, skinHex, hairHex, hatName, beardName, apron, lantern }
function resolve(look) {
  return {
    skin: look.skinHex || LOOKS.skin[look.skin] || LOOKS.skin[1],
    coat: look.coatHex || (LOOKS.coat[look.coat] || LOOKS.coat[0]).c,
    hair: look.hairHex || LOOKS.hair[look.hair] || LOOKS.hair[1],
    hat: look.hatName || LOOKS.hat[look.hat] || 'None',
    beard: look.beardName || LOOKS.beard[look.beard] || 'None',
    patch: !!look.patch,
    faction: look.faction || '',
  };
}

function surfaceTexture(kind) {
  const size = kind === 'skin' ? 256 : 128, data = new Uint8Array(size * size * 4);
  let seed = kind === 'color' ? 7919 : 104729;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    if (kind === 'color') {
      const weave = ((x % 5 === 0) || (y % 5 === 0)) ? -3 : 0;
      const fiber = Math.sin(x * 0.21 + Math.sin(y * 0.09)) * 2;
      const v = 248 + weave + fiber + Math.round(random() * 10 - 5);
      data[i] = data[i + 1] = data[i + 2] = v;
    } else if (kind === 'skin') {
      const pore = random() > 0.997 ? -14 : 0;
      const mottle = Math.sin(x * 0.035 + Math.sin(y * 0.021)) * 2 + Math.sin(y * 0.018 + x * 0.011) * 1.5;
      const v = 246 + pore + mottle + Math.round(random() * 8 - 4);
      data[i] = v + 1; data[i + 1] = v; data[i + 2] = v - 2;
    } else if (kind === 'roughness') {
      const v = 220 + Math.round(random() * 28 - 14);
      data[i] = data[i + 1] = data[i + 2] = v;
    } else {
      const n = Math.round(random() * 16 - 8);
      data[i] = 128 + n; data[i + 1] = 128 + n; data[i + 2] = 255;
    }
    data[i + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(kind === 'skin' ? 3 : 10, kind === 'skin' ? 3 : 10);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  if (kind === 'color' || kind === 'skin') texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
const COLOR_MAP = surfaceTexture('color');
const SKIN_MAP = surfaceTexture('skin');
const NORMAL_MAP = surfaceTexture('normal');
const ROUGHNESS_MAP = surfaceTexture('roughness');
const HUMAN_MAT = new THREE.MeshStandardMaterial({
  vertexColors: true, roughness: 0.88, map: COLOR_MAP,
  normalMap: NORMAL_MAP, roughnessMap: ROUGHNESS_MAP, normalScale: new THREE.Vector2(0.14, 0.14),
});
const CLOTH_MAT = HUMAN_MAT;
const SKIN_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, map: SKIN_MAP, normalMap: NORMAL_MAP, roughnessMap: ROUGHNESS_MAP, normalScale: new THREE.Vector2(0.05, 0.05) });
const LEATHER_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.68, map: COLOR_MAP, normalMap: NORMAL_MAP, roughnessMap: ROUGHNESS_MAP, normalScale: new THREE.Vector2(0.1, 0.1) });
const METAL_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.48, metalness: 0.48, map: COLOR_MAP, roughnessMap: ROUGHNESS_MAP });
const HAIR_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, map: COLOR_MAP, normalMap: NORMAL_MAP, roughnessMap: ROUGHNESS_MAP, normalScale: new THREE.Vector2(0.06, 0.06) });
const SPHERE = new THREE.SphereGeometry(1, 40, 28);
const HUMAN_MODEL_READY = fetch(humanModelUrl)
  .then((response) => {
    if (!response.ok) throw new Error(`Character model request failed: ${response.status}`);
    return response.arrayBuffer();
  })
  .then((data) => new GLTFLoader().parseAsync(data, ''))
  .then((gltf) => gltf.scene)
  .catch((error) => {
    console.error('Could not load the CC0 human character model; keeping the procedural fallback.', error);
    return null;
  });
let HUMAN_SOURCE = null;
HUMAN_MODEL_READY.then((source) => { HUMAN_SOURCE = source; });

function humanMaterial(L) {
  const palette = {
    skin: new THREE.Color(L.skin),
    facialHair: new THREE.Color(L.hair),
    beardDensity: L.beard === 'None' ? 0 : L.beard === 'Stubble' ? 0.2 : L.beard === 'Braided' ? 0.82 : 0.72,
    coat: new THREE.Color(L.faction === 'hollow' ? '#3d4943' : L.coat),
    shirt: new THREE.Color(L.faction === 'navy' ? '#d9d4c7' : '#cbbd9e'),
    trousers: new THREE.Color(L.faction === 'navy' ? '#2e3e55' : '#514437'),
    boots: new THREE.Color('#352b23'),
    glove: new THREE.Color('#49392b'),
  };
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.82, map: SKIN_MAP,
    normalMap: NORMAL_MAP, roughnessMap: ROUGHNESS_MAP,
    normalScale: new THREE.Vector2(0.05, 0.05), side: THREE.DoubleSide,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.pirateSkin = { value: palette.skin };
    shader.uniforms.pirateFacialHair = { value: palette.facialHair };
    shader.uniforms.pirateBeardDensity = { value: palette.beardDensity };
    shader.uniforms.pirateCoat = { value: palette.coat };
    shader.uniforms.pirateShirt = { value: palette.shirt };
    shader.uniforms.pirateTrousers = { value: palette.trousers };
    shader.uniforms.pirateBoots = { value: palette.boots };
    shader.uniforms.pirateGlove = { value: palette.glove };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPiratePosition;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPiratePosition = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vPiratePosition;
uniform vec3 pirateSkin;
uniform vec3 pirateFacialHair;
uniform float pirateBeardDensity;
uniform vec3 pirateCoat;
uniform vec3 pirateShirt;
uniform vec3 pirateTrousers;
uniform vec3 pirateBoots;
uniform vec3 pirateGlove;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
vec3 pirateSurface = pirateSkin;
if (vPiratePosition.y < 0.17) pirateSurface = pirateBoots;
else if (abs(vPiratePosition.x) > 0.29 && vPiratePosition.y > 0.78 && vPiratePosition.y < 1.12) pirateSurface = pirateGlove;
else if (vPiratePosition.y < 0.99) pirateSurface = pirateTrousers;
else if (vPiratePosition.y > 0.98 && vPiratePosition.y < 1.43) {
  pirateSurface = pirateCoat;
  if (abs(vPiratePosition.x) < 0.105 && vPiratePosition.z > 0.095 && vPiratePosition.y > 1.06) pirateSurface = pirateShirt;
}
vec3 facePos = vPiratePosition;
float jawWidth = mix(0.022, 0.066, smoothstep(1.455, 1.48, facePos.y));
jawWidth *= 1.0 - 0.28 * smoothstep(1.485, 1.501, facePos.y);
float jaw = smoothstep(1.451, 1.459, facePos.y) * (1.0 - smoothstep(1.492, 1.501, facePos.y));
jaw *= 1.0 - smoothstep(jawWidth - 0.003, jawWidth + 0.004, abs(facePos.x));
float mouthGap = (1.0 - smoothstep(0.018, 0.026, abs(facePos.x)))
  * smoothstep(1.482, 1.487, facePos.y) * (1.0 - smoothstep(1.494, 1.499, facePos.y));
jaw *= 1.0 - mouthGap;
float moustache = smoothstep(1.501, 1.506, facePos.y) * (1.0 - smoothstep(1.516, 1.522, facePos.y));
moustache *= smoothstep(0.006, 0.012, abs(facePos.x)) * (1.0 - smoothstep(0.034, 0.041, abs(facePos.x)));
float faceFront = smoothstep(0.098 + abs(facePos.x) * 0.3, 0.112 + abs(facePos.x) * 0.3, facePos.z);
float beardRegion = max(jaw, moustache) * faceFront;
float follicleNoise = fract(sin(dot(floor(facePos.xy * vec2(980.0, 620.0)), vec2(127.1, 311.7))) * 43758.5453);
float follicle = (1.0 - smoothstep(0.12, 0.36, follicleNoise)) * beardRegion;
float edge = min(min(jawWidth - abs(facePos.x), facePos.y - 1.451), 1.522 - facePos.y);
float softEdge = smoothstep(-0.002, 0.006, edge) * faceFront;
float baseHair = beardRegion * pirateBeardDensity;
float stubble = follicle * pirateBeardDensity * 0.7;
vec3 skinWithBeard = mix(pirateSkin, pirateFacialHair, clamp(baseHair * (0.56 + follicle * 0.3) + stubble, 0.0, 0.88));
diffuseColor.rgb *= mix(pirateSurface, skinWithBeard, softEdge);`);
  };
  material.customProgramCacheKey = () => 'brinebound-pirate-human-v2';
  return material;
}

function roundedBoxGeometry() {
  const source = new THREE.BoxGeometry(1, 1, 1, 6, 6, 6);
  const positions = source.getAttribute('position');
  const sourceIndex = source.getIndex();
  const vertices = [], indices = [], shared = new Map(), radius = 0.14;
  const vertexAt = (i) => {
    let x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const cx = THREE.MathUtils.clamp(x, -0.5 + radius, 0.5 - radius);
    const cy = THREE.MathUtils.clamp(y, -0.5 + radius, 0.5 - radius);
    const cz = THREE.MathUtils.clamp(z, -0.5 + radius, 0.5 - radius);
    let dx = x - cx, dy = y - cy, dz = z - cz;
    const length = Math.hypot(dx, dy, dz);
    if (length > 0) {
      const scale = radius / length;
      x = cx + dx * scale; y = cy + dy * scale; z = cz + dz * scale;
    }
    const key = `${x.toFixed(5)},${y.toFixed(5)},${z.toFixed(5)}`;
    if (shared.has(key)) return shared.get(key);
    const index = vertices.length / 3;
    vertices.push(x, y, z); shared.set(key, index);
    return index;
  };
  const count = sourceIndex ? sourceIndex.count : positions.count;
  for (let i = 0; i < count; i += 3) {
    for (let j = 0; j < 3; j++) indices.push(vertexAt(sourceIndex ? sourceIndex.getX(i + j) : i + j));
  }
  source.dispose();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
const SOFT_BOX = roundedBoxGeometry();

function part(geometry, color, position, scale, rotation = [0, 0, 0], surface = 'cloth') {
  const c = new THREE.Color(color);
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
    new THREE.Vector3(...scale),
  );
  geometry.applyMatrix4(matrix);
  return { geometry, color: c, surface };
}
function sphere(color, position, scale, rotation, surface) {
  return part(SPHERE.clone(), color, position, scale, rotation, surface);
}
function capsule(color, position, radius, length, scale = [1, 1, 1], rotation, surface) {
  return part(new THREE.CapsuleGeometry(radius, length, 10, 20), color, position, scale, rotation, surface);
}
function box(color, position, scale, rotation, surface) {
  return part(SOFT_BOX.clone(), color, position, scale, rotation, surface);
}
function profile(color, rings, segments = 20, position = [0, 0, 0], scale = [1, 1, 1], surface = 'cloth') {
  segments = Math.max(segments, 32);
  const geometry = new THREE.BufferGeometry(), positions = [], indices = [];
  for (const [y, rx, rz, z = 0] of rings) {
    for (let i = 0; i < segments; i++) {
      const a = i / segments * Math.PI * 2;
      positions.push(Math.cos(a) * rx, y, Math.sin(a) * rz + z);
    }
  }
  for (let r = 0; r < rings.length - 1; r++) {
    for (let i = 0; i < segments; i++) {
      const a = r * segments + i, b = (r + 1) * segments + i;
      const c = r * segments + (i + 1) % segments, d = (r + 1) * segments + (i + 1) % segments;
      indices.push(a, b, c, c, b, d);
    }
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return part(geometry, color, position, scale, [0, 0, 0], surface);
}
function mergeParts(parts) {
  const positions = [], normals = [], colors = [], uvs = [];
  for (const p of parts) {
    const position = p.geometry.getAttribute('position'), normal = p.geometry.getAttribute('normal');
    const index = p.geometry.getIndex();
    for (let i = 0; i < (index ? index.count : position.count); i++) {
      const vertex = index ? index.getX(i) : i;
      positions.push(position.getX(vertex), position.getY(vertex), position.getZ(vertex));
      normals.push(normal.getX(vertex), normal.getY(vertex), normal.getZ(vertex));
      colors.push(p.color.r, p.color.g, p.color.b);
      uvs.push(position.getX(vertex) * 10, position.getY(vertex) * 10);
    }
    p.geometry.dispose();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return geometry;
}
function mesh(parent, parts) {
  const surfaces = { cloth: CLOTH_MAT, skin: SKIN_MAT, leather: LEATHER_MAT, metal: METAL_MAT, hair: HAIR_MAT };
  const groups = new Map();
  for (const p of parts) {
    const surface = surfaces[p.surface] ? p.surface : 'cloth';
    if (!groups.has(surface)) groups.set(surface, []);
    groups.get(surface).push(p);
  }
  for (const [surface, pieces] of groups) {
    const m = new THREE.Mesh(mergeParts(pieces), surfaces[surface]);
    m.castShadow = true; m.receiveShadow = true;
    parent.add(m);
  }
}

function beardShape(color) {
  const shape = new THREE.Shape();
  shape.moveTo(-0.115, 0.095);
  shape.quadraticCurveTo(-0.16, 0.045, -0.12, -0.035);
  shape.quadraticCurveTo(-0.085, -0.12, 0, -0.155);
  shape.quadraticCurveTo(0.085, -0.12, 0.12, -0.035);
  shape.quadraticCurveTo(0.16, 0.045, 0.115, 0.095);
  shape.quadraticCurveTo(0.06, 0.075, 0, 0.07);
  shape.quadraticCurveTo(-0.06, 0.075, -0.115, 0.095);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.018, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.008, bevelThickness: 0.008, curveSegments: 8 });
  return part(geometry, color, [0, 0, -0.125], [1, 1, 1], [0, Math.PI, 0], 'hair');
}

function hatBrimGeometry(style) {
  const segments = 48, positions = [], indices = [];
  const bicorne = style === 'Bicorne';
  const rx = bicorne ? 0.16 : 0.145, rz = bicorne ? 0.105 : 0.12;
  const peaks = bicorne ? [0, Math.PI] : [Math.PI / 2, Math.PI * 7 / 6, Math.PI * 11 / 6];
  const edge = [];
  for (let i = 0; i < segments; i++) {
    const a = i / segments * Math.PI * 2;
    const lift = Math.max(...peaks.map((peak) => Math.pow(Math.max(0, Math.cos(a - peak)), 3)));
    const flare = 1 + lift * 0.08;
    const y = 0.12 + lift * 0.065;
    edge.push([Math.cos(a) * rx * flare, y, Math.sin(a) * rz * flare]);
  }
  for (let layer = 0; layer < 4; layer++) {
    for (let i = 0; i < segments; i++) {
      const a = i / segments * Math.PI * 2;
      const [x, y, z] = edge[i];
      if (layer === 0) positions.push(Math.cos(a) * 0.08, 0.12, Math.sin(a) * 0.07);
      else if (layer === 1) positions.push(x, y, z);
      else if (layer === 2) positions.push(Math.cos(a) * 0.08, 0.105, Math.sin(a) * 0.07);
      else positions.push(x, y - 0.012, z);
    }
  }
  for (let i = 0; i < segments; i++) {
    const j = (i + 1) % segments;
    const ti = i, to = segments + i, tj = j, toj = segments + j;
    const bi = segments * 2 + i, bo = segments * 3 + i, bj = segments * 2 + j, boj = segments * 3 + j;
    indices.push(ti, tj, to, to, tj, toj, bi, bo, bj, bo, boj, bj, to, toj, bo, toj, boj, bo);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function headParts(L) {
  const p = [
    profile(L.skin, [[-0.045, 0.055, 0.065], [-0.015, 0.095, 0.105], [0.045, 0.13, 0.125], [0.12, 0.15, 0.14], [0.22, 0.15, 0.14], [0.30, 0.12, 0.12], [0.345, 0.065, 0.075]], 28, [0, 0, 0], [1, 1, 1], 'skin'),
    sphere(L.skin, [-0.15, 0.13, 0], [0.032, 0.05, 0.04], [0, 0, 0], 'skin'),
    sphere(L.skin, [0.15, 0.13, 0], [0.032, 0.05, 0.04], [0, 0, 0], 'skin'),
    profile(shade(L.skin, 0.84), [[0.08, 0.015, 0.02, -0.13], [0.14, 0.018, 0.024, -0.145], [0.21, 0.026, 0.023, -0.13]], 14, [0, 0, 0], [1, 1, 1], 'skin'),
    sphere(L.skin, [0, 0.125, -0.154], [0.025, 0.018, 0.02], [0, 0, 0], 'skin'),
    sphere(shade(L.skin, 0.72), [-0.018, 0.117, -0.169], [0.005, 0.004, 0.004], [0, 0, 0], 'skin'),
    sphere(shade(L.skin, 0.72), [0.018, 0.117, -0.169], [0.005, 0.004, 0.004], [0, 0, 0], 'skin'),
    sphere(shade(L.skin, 1.06), [-0.065, 0.11, -0.095], [0.045, 0.043, 0.025], [0, 0, 0], 'skin'),
    sphere(shade(L.skin, 1.06), [0.065, 0.11, -0.095], [0.045, 0.043, 0.025], [0, 0, 0], 'skin'),
    sphere('#d7c8b7', [-0.06, 0.202, -0.12], [0.024, 0.012, 0.011]),
    sphere('#d7c8b7', [0.06, 0.202, -0.12], [0.024, 0.012, 0.011]),
    sphere('#52706b', [-0.06, 0.202, -0.132], [0.0085, 0.0105, 0.0055]),
    sphere('#52706b', [0.06, 0.202, -0.132], [0.0085, 0.0105, 0.0055]),
    sphere('#171716', [-0.06, 0.202, -0.137], [0.0035, 0.0075, 0.0035]),
    sphere('#171716', [0.06, 0.202, -0.137], [0.0035, 0.0075, 0.0035]),
    capsule(L.skin, [-0.06, 0.216, -0.12], 0.007, 0.039, [1, 1, 0.7], [0, 0, -0.08], 'skin'),
    capsule(L.skin, [0.06, 0.216, -0.12], 0.007, 0.039, [1, 1, 0.7], [0, 0, 0.08], 'skin'),
    capsule(shade(L.skin, 0.86), [-0.06, 0.188, -0.122], 0.004, 0.034, [1, 1, 0.7], [0, 0, -0.06], 'skin'),
    capsule(shade(L.skin, 0.86), [0.06, 0.188, -0.122], 0.004, 0.034, [1, 1, 0.7], [0, 0, 0.06], 'skin'),
    capsule(shade(L.skin, 0.76), [-0.06, 0.232, -0.12], 0.009, 0.05, [1, 1, 0.7], [0, 0, -0.08], 'skin'),
    capsule(shade(L.skin, 0.76), [0.06, 0.232, -0.12], 0.009, 0.05, [1, 1, 0.7], [0, 0, 0.08], 'skin'),
    capsule(L.hair, [-0.06, 0.246, -0.115], 0.007, 0.055, [1, 1, 0.7], [0, 0, -0.08], 'hair'),
    capsule(L.hair, [0.06, 0.246, -0.115], 0.007, 0.055, [1, 1, 0.7], [0, 0, 0.08], 'hair'),
    part(new THREE.SphereGeometry(1, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), L.hair, [0, 0.16, 0.015], [0.15, 0.17, 0.14], [0, 0, 0], 'hair'),
    capsule(L.hair, [-0.132, 0.105, 0.005], 0.03, 0.13, [1, 1, 1], [0, 0, -0.12], 'hair'),
    capsule(L.hair, [0.132, 0.105, 0.005], 0.03, 0.13, [1, 1, 1], [0, 0, 0.12], 'hair'),
  ];
  if (L.beard === 'Stubble') p.push(sphere(shade(L.hair, 0.65), [0, 0.025, -0.105], [0.095, 0.038, 0.045]));
  if (L.beard === 'Full' || L.beard === 'Braided') {
    p.push(beardShape(L.hair));
    p.push(capsule(L.hair, [-0.045, 0.08, -0.157], 0.018, 0.045, [1, 1, 0.7], [0, 0, -0.3]));
    p.push(capsule(L.hair, [0.045, 0.08, -0.157], 0.018, 0.045, [1, 1, 0.7], [0, 0, 0.3]));
    if (L.beard === 'Braided') p.push(capsule(L.hair, [0, -0.11, -0.12], 0.018, 0.11));
  } else {
    p.push(box(C.mouth, [0, 0.052, -0.143], [0.045, 0.009, 0.009]));
  }
  if (L.patch) {
    p.push(
      sphere('#171615', [0.06, 0.202, -0.15], [0.041, 0.038, 0.018]),
      capsule('#171615', [0, 0.241, -0.135], 0.006, 0.2, [1, 1, 1], [0, 0, Math.PI / 2]),
    );
  }
  if (L.hat === 'Tricorn') {
    p.push(
      part(hatBrimGeometry('Tricorn'), C.hatBlack, [0, 0.14, 0], [1, 1, 1]),
      profile(C.hatBlack, [[0.26, 0.084, 0.073], [0.29, 0.084, 0.073], [0.36, 0.066, 0.06]], 32),
      profile(C.brass, [[0.285, 0.085, 0.074], [0.302, 0.082, 0.072]], 32),
      sphere(C.brass, [0, 0.31, 0.079], [0.012, 0.014, 0.008], [0, 0, 0], 'metal'),
    );
  } else if (L.hat === 'Bandana') {
    p.push(
      profile(C.bandana, [[0.27, 0.16, 0.15], [0.31, 0.17, 0.15], [0.35, 0.15, 0.13]], 24),
      sphere(C.bandana, [0, 0.25, 0.13], [0.045, 0.035, 0.045]),
      capsule(C.bandana, [0.035, 0.17, 0.16], 0.016, 0.13, [1, 1, 0.8], [0, 0, -0.3]),
    );
  } else if (L.hat === 'Bicorne') {
    p.push(
      part(hatBrimGeometry('Bicorne'), C.hatBlack, [0, 0.14, 0], [1, 1, 1]),
      profile(C.hatBlack, [[0.26, 0.084, 0.073], [0.29, 0.084, 0.073], [0.35, 0.068, 0.058]], 32),
      profile(C.brass, [[0.285, 0.085, 0.074], [0.302, 0.082, 0.072]], 32),
      capsule(C.feather, [0.066, 0.375, 0.02], 0.009, 0.055, [1, 1, 0.75], [0, 0, -0.55]),
      sphere(C.brass, [0.065, 0.32, 0.065], [0.012, 0.014, 0.008], [0, 0, 0], 'metal'),
    );
  } else if (L.hat === 'Hood') {
    const hood = part(new THREE.SphereGeometry(1, 24, 18, 0, Math.PI * 2, 0, Math.PI / 2), C.hood, [0, 0.14, 0.045], [0.19, 0.25, 0.18]);
    p.push(hood, capsule(C.hood, [0, -0.015, 0.04], 0.055, 0.15, [1.3, 1, 0.7]));
  }
  for (const shape of p) shape.geometry.scale(0.86, 0.9, 0.86);
  return p;
}

function torsoParts(L, extra) {
  const coatD = shade(L.coat, 0.72), leather = C.leather;
  const jacket = [
    [-0.18, 0.155, 0.105], [-0.11, 0.18, 0.12], [0.02, 0.16, 0.11],
    [0.19, 0.18, 0.12], [0.36, 0.225, 0.14], [0.49, 0.22, 0.125],
    [0.6, 0.17, 0.1], [0.66, 0.125, 0.075],
  ];
  const p = [
    profile(L.skin, [[0.52, 0.072, 0.069], [0.58, 0.082, 0.078], [0.68, 0.074, 0.069], [0.73, 0.055, 0.055]], 32, [0, 0, 0], [1, 1, 1], 'skin'),
    profile(L.coat, jacket, 24),
    profile(C.shirt, [[0.08, 0.105, 0.04], [0.16, 0.12, 0.045], [0.35, 0.12, 0.045], [0.51, 0.095, 0.035]], 20, [0, 0, -0.09]),
    box(coatD, [-0.095, 0.39, -0.149], [0.075, 0.32, 0.025], [0, 0, -0.22]),
    box(coatD, [0.095, 0.39, -0.149], [0.075, 0.32, 0.025], [0, 0, 0.22]),
    box(L.coat, [-0.205, 0.53, -0.015], [0.1, 0.09, 0.14], [0, 0, -0.08]),
    box(L.coat, [0.205, 0.53, -0.015], [0.1, 0.09, 0.14], [0, 0, 0.08]),
    box(C.shirt, [-0.13, 0.605, -0.015], [0.13, 0.075, 0.1], [0, 0, 0.44]),
    box(C.shirt, [0.13, 0.605, -0.015], [0.13, 0.075, 0.1], [0, 0, -0.44]),
    box(leather, [-0.16, 0.33, -0.155], [0.045, 0.45, 0.022], [0, 0, 0.34]),
    box(shade(leather, 0.7), [-0.176, 0.33, -0.17], [0.012, 0.42, 0.008], [0, 0, 0.34]),
    sphere(coatD, [-0.205, 0.55, -0.02], [0.065, 0.035, 0.09]),
    sphere(coatD, [0.205, 0.55, -0.02], [0.065, 0.035, 0.09]),
    part(new THREE.TorusGeometry(0.215, 0.035, 8, 24), C.belt, [0, 0.095, 0], [1, 1, 0.78], [Math.PI / 2, 0, 0]),
    box(C.brass, [0, 0.095, -0.173], [0.075, 0.065, 0.022]),
    box(C.belt, [0, 0.095, -0.188], [0.035, 0.035, 0.012]),
    box(leather, [0.185, 0.08, -0.075], [0.1, 0.13, 0.075], [0, 0, -0.1]),
    box(leather, [-0.19, 0.08, -0.075], [0.075, 0.12, 0.06]),
    box(shade(leather, 0.72), [0.185, 0.12, -0.118], [0.083, 0.018, 0.018]),
    box(shade(leather, 0.72), [-0.19, 0.12, -0.11], [0.06, 0.016, 0.014]),
    box(C.brass, [0.185, 0.12, -0.131], [0.022, 0.025, 0.012]),
    box(shade(L.coat, 0.66), [-0.075, 0.39, -0.169], [0.009, 0.28, 0.008]),
    box(shade(L.coat, 0.66), [0.075, 0.39, -0.169], [0.009, 0.28, 0.008]),
    box(coatD, [-0.095, -0.11, -0.075], [0.05, 0.035, 0.012]),
    box(coatD, [0.095, -0.11, -0.075], [0.05, 0.035, 0.012]),
    sphere(leather, [0, 0.385, -0.105], [0.18, 0.255, 0.035], [0, 0, 0], 'leather'),
    sphere(C.steelDark, [0, 0.47, -0.14], [0.12, 0.105, 0.025], [0, 0, 0], 'metal'),
    sphere(C.steel, [-0.06, 0.315, -0.14], [0.061, 0.076, 0.019], [0, 0, -0.12], 'metal'),
    sphere(C.steel, [0.06, 0.315, -0.14], [0.061, 0.076, 0.019], [0, 0, 0.12], 'metal'),
    box(C.leather, [0, 0.39, -0.171], [0.035, 0.48, 0.026], [0, 0, 0.52], 'leather'),
    box(C.leather, [0, 0.17, -0.169], [0.34, 0.045, 0.025], [0, 0, 0], 'leather'),
    sphere(C.leather, [-0.205, 0.535, -0.055], [0.087, 0.063, 0.094], [0, 0, -0.1], 'leather'),
    sphere(C.leather, [0.205, 0.535, -0.055], [0.087, 0.063, 0.094], [0, 0, 0.1], 'leather'),
    sphere(C.leather, [-0.205, 0.535, 0.055], [0.087, 0.063, 0.094], [0, 0, -0.1], 'leather'),
    sphere(C.leather, [0.205, 0.535, 0.055], [0.087, 0.063, 0.094], [0, 0, 0.1], 'leather'),
    sphere(C.steel, [-0.205, 0.55, -0.112], [0.055, 0.032, 0.022], [0, 0, -0.1], 'metal'),
    sphere(C.steel, [0.205, 0.55, -0.112], [0.055, 0.032, 0.022], [0, 0, 0.1], 'metal'),
    box(C.leather, [0.225, 0.105, -0.035], [0.085, 0.145, 0.11], [0, 0, -0.12], 'leather'),
    box(C.leather, [-0.22, 0.105, -0.035], [0.075, 0.13, 0.095], [0, 0, 0.12], 'leather'),
    box(C.brass, [0.225, 0.105, -0.094], [0.045, 0.026, 0.012], [0, 0, 0], 'metal'),
    box(C.brass, [-0.22, 0.105, -0.087], [0.042, 0.026, 0.012], [0, 0, 0], 'metal'),
    box(C.leather, [0.245, 0.08, 0.01], [0.045, 0.26, 0.035], [0, 0, -0.24], 'leather'),
    box(C.steelDark, [0.2, 0.255, -0.126], [0.05, 0.18, 0.03], [0, 0, -0.4], 'metal'),
    box(C.leather, [-0.065, 0.39, 0.122], [0.032, 0.48, 0.018], [0, 0, -0.38], 'leather'),
    box(C.leather, [0.065, 0.39, 0.122], [0.032, 0.48, 0.018], [0, 0, 0.38], 'leather'),
    box(C.leather, [0, 0.17, 0.135], [0.34, 0.04, 0.024], [0, 0, 0], 'leather'),
    box(C.leather, [-0.17, 0.085, 0.135], [0.085, 0.12, 0.07], [0, 0, 0.1], 'leather'),
    box(C.leather, [0.17, 0.085, 0.135], [0.085, 0.12, 0.07], [0, 0, -0.1], 'leather'),
    sphere(C.brass, [0, 0.17, 0.153], [0.021, 0.018, 0.008], [0, 0, 0], 'metal'),
  ];
  for (const y of [0.2, 0.3, 0.4, 0.5]) p.push(sphere(C.brass, [0, y, -0.17], [0.011, 0.011, 0.008], [0, 0, 0], 'metal'));
  for (const x of [-0.09, -0.04, 0.04, 0.09]) p.push(sphere(C.brass, [x, 0.47, -0.158], [0.006, 0.006, 0.004], [0, 0, 0], 'metal'));
  if (L.faction === 'navy') {
    p.push(
      box(C.brass, [-0.2, 0.58, -0.04], [0.12, 0.035, 0.11]),
      box(C.brass, [0.2, 0.58, -0.04], [0.12, 0.035, 0.11]),
      box(C.brass, [-0.205, 0.57, -0.105], [0.08, 0.018, 0.015]),
      box(C.brass, [0.205, 0.57, -0.105], [0.08, 0.018, 0.015]),
    );
    for (const x of [-0.055, 0.015, 0.085]) {
      p.push(box('#282521', [x, 0.31, -0.176], [0.018, 0.065, 0.022]));
      p.push(box(C.brass, [x, 0.35, -0.19], [0.009, 0.018, 0.008]));
    }
  } else {
    p.push(box(L.faction === 'pirate' ? '#8a3028' : C.brass, [0.13, 0.34, -0.151], [0.035, 0.11, 0.018], [0, 0, -0.18]));
    if (L.faction === 'pirate') {
      p.push(
        profile('#8a3028', [[0.56, 0.125, 0.085], [0.59, 0.15, 0.095], [0.62, 0.14, 0.09]], 18),
        box('#d7c6a0', [0.03, 0.26, -0.167], [0.018, 0.024, 0.009], [0, 0, 0.3]),
      );
    }
  }
  if (extra && extra.apron) {
    p.push(box(extra.apron, [0, 0.03, -0.151], [0.28, 0.31, 0.025], [0, 0, 0.04]));
    p.push(box(C.belt, [0, 0.2, -0.17], [0.29, 0.025, 0.025]));
  }
  return p;
}

function upperArmParts(L) {
  return [
    profile(L.coat, [[-0.32, 0.056, 0.063], [-0.27, 0.065, 0.072], [-0.17, 0.073, 0.08], [-0.07, 0.079, 0.084], [0, 0.062, 0.066]], 18),
    sphere(shade(L.coat, 0.82), [0, -0.31, 0], [0.06, 0.035, 0.065]),
    box(C.leather, [0, -0.17, -0.076], [0.09, 0.13, 0.025], [0, 0, 0], 'leather'),
    box(C.steel, [0, -0.17, -0.092], [0.062, 0.088, 0.012], [0, 0, 0], 'metal'),
    box(C.leather, [0, -0.09, -0.078], [0.13, 0.022, 0.022], [0, 0, 0], 'leather'),
    box(C.leather, [0, -0.25, -0.078], [0.13, 0.022, 0.022], [0, 0, 0], 'leather'),
  ];
}
function forearmParts(L, withHand = true) {
  const p = [
    profile(L.coat, [[-0.29, 0.045, 0.052], [-0.25, 0.052, 0.058], [-0.14, 0.06, 0.063], [-0.045, 0.066, 0.069], [0, 0.058, 0.062]], 18),
    capsule(shade(L.coat, 0.72), [0, -0.29, 0], 0.054, 0.025),
    capsule(C.leather, [0, -0.32, 0], 0.057, 0.03, [1, 1, 1], [0, 0, 0], 'leather'),
    box(C.steel, [0, -0.35, -0.045], [0.058, 0.035, 0.012], [0, 0, 0], 'metal'),
  ];
  if (withHand) p.push(
    sphere(C.glove, [0, -0.38, -0.004], [0.049, 0.067, 0.043], [0, 0, 0], 'leather'),
    ...[-1, 0, 1].map((x) => capsule(C.glove, [x * 0.026, -0.405, -0.026], 0.012, 0.045, [1, 1, 0.8], [0, 0, x * 0.12], 'leather')),
    capsule(C.glove, [-0.05, -0.36, -0.025], 0.014, 0.048, [1, 1, 0.8], [0, 0, 0.55], 'leather'),
  );
  return p;
}

function viewGripParts(L) {
  const nail = shade(L.skin, 1.18), knuckle = shade(L.skin, 1.06);
  return [
    sphere(L.skin, [0, 0.005, 0.105], [0.071, 0.056, 0.092], [0, 0, 0], 'skin'),
    ...[-1.5, -0.5, 0.5, 1.5].flatMap((i) => {
      const x = i * 0.032;
      return [
        sphere(knuckle, [x, -0.022, 0.12], [0.023, 0.03, 0.046], [0, 0, 0], 'skin'),
        sphere(L.skin, [x * 0.92, -0.019, 0.16], [0.018, 0.024, 0.034], [0, 0, 0], 'skin'),
        sphere(nail, [x * 0.92, -0.041, 0.174], [0.009, 0.003, 0.011], [0, 0, 0], 'skin'),
      ];
    }),
    capsule(L.skin, [-0.065, 0.024, 0.13], 0.026, 0.07, [1, 1, 0.85], [0, 0, 0.9], 'skin'),
    box(C.leather, [0, 0.005, -0.025], [0.13, 0.072, 0.07], [0, 0, 0], 'leather'),
    ...[-0.045, 0, 0.045].map((x) => box(C.brass, [x, 0.045, 0.12], [0.004, 0.003, 0.045], [0, 0, 0], 'metal')),
  ];
}

function thighParts() {
  return [
    profile(C.trousers, [[-0.39, 0.065, 0.075], [-0.3, 0.078, 0.09], [-0.12, 0.087, 0.1], [0.015, 0.09, 0.105]], 18),
    box(shade(C.trousers, 0.8), [0, -0.34, -0.07], [0.09, 0.012, 0.012]),
    sphere(C.leather, [0, -0.31, -0.074], [0.071, 0.075, 0.027], [0, 0, 0], 'leather'),
    sphere(C.steel, [0, -0.31, -0.094], [0.051, 0.05, 0.015], [0, 0, 0], 'metal'),
    box(C.leather, [0, -0.225, -0.078], [0.14, 0.022, 0.02], [0, 0, 0], 'leather'),
    box(C.leather, [0, -0.385, -0.078], [0.14, 0.022, 0.02], [0, 0, 0], 'leather'),
  ];
}
function shinParts() {
  return [
    profile(C.trousers, [[-0.17, 0.055, 0.063], [-0.11, 0.065, 0.07], [0.015, 0.07, 0.075]], 18),
    profile(C.boots, [[-0.36, 0.073, 0.078], [-0.32, 0.078, 0.08], [-0.16, 0.071, 0.073]], 18, [0, 0, 0], [1, 1, 1], 'leather'),
    sphere(C.boots, [0, -0.35, -0.06], [0.074, 0.05, 0.12], [0, 0, 0], 'leather'),
    box('#14110f', [0, -0.395, -0.025], [0.13, 0.022, 0.18]),
    box(shade(C.boots, 1.4), [0, -0.18, -0.075], [0.11, 0.025, 0.018], [0, 0, 0], 'leather'),
    box(shade(C.boots, 0.78), [0, -0.25, -0.08], [0.055, 0.012, 0.012], [0, 0, 0], 'metal'),
    box(shade(C.boots, 0.78), [0, -0.29, -0.08], [0.055, 0.012, 0.012], [0, 0, 0], 'metal'),
    box(C.leather, [0, -0.2, -0.076], [0.14, 0.02, 0.022], [0, 0, 0], 'leather'),
    box(C.leather, [0, -0.27, -0.08], [0.14, 0.02, 0.022], [0, 0, 0], 'leather'),
  ];
}

export function itemGeo(item) {
  if (isGun(item)) return gunGeo(item);
  const g = new GeoBuilder({ round: 0.012 });
  if (item === 'cutlass') {
    const stations = [
      { z: -0.045, x: 0, w: 0.018 },
      { z: -0.22, x: -0.006, w: 0.033 },
      { z: -0.43, x: -0.018, w: 0.036 },
      { z: -0.65, x: -0.039, w: 0.025 },
      { z: -0.82, x: -0.057, w: 0.002 },
    ];
    const steel = '#c9d0d2', bevel = '#8f999d';
    const strip = (a, b, side, color) => {
      const y = side * 0.006;
      const edgeA = [a.x - a.w, y, a.z], ridgeA = [a.x, y * 0.65, a.z];
      const edgeB = [b.x - b.w, y, b.z], ridgeB = [b.x, y * 0.65, b.z];
      const ridgeRA = [a.x, y * 0.65, a.z], edgeRA = [a.x + a.w, y, a.z];
      const ridgeRB = [b.x, y * 0.65, b.z], edgeRB = [b.x + b.w, y, b.z];
      const normal = [0, side, 0];
      g.quad(edgeA, edgeB, ridgeA, ridgeB, normal, color);
      g.quad(ridgeRA, ridgeRB, edgeRA, edgeRB, normal, color);
    };
    for (let i = 0; i < stations.length - 1; i++) {
      const a = stations[i], b = stations[i + 1];
      strip(a, b, -1, steel); strip(a, b, 1, '#aeb8bb');
      for (const edge of [-1, 1]) {
        const xA = a.x + edge * a.w, xB = b.x + edge * b.w;
        g.quad([xA, -0.006, a.z], [xB, -0.006, b.z], [xA, 0.006, a.z], [xB, 0.006, b.z],
          [edge, 0, 0], bevel);
      }
    }
    g.cyl(0, 0, -0.025, 0, 0, 0.19, 0.024, 0.022, '#533821', undefined, 12)
      .cyl(0, 0, 0.19, 0, 0, 0.215, 0.04, 0.032, '#b48a46', undefined, 12)
      .cyl(-0.12, 0, -0.02, 0.12, 0, -0.02, 0.014, 0.014, '#b48a46', undefined, 12)
      .cyl(-0.12, 0, -0.02, -0.15, 0.025, -0.055, 0.012, 0.006, '#b48a46', undefined, 10)
      .cyl(0.12, 0, -0.02, 0.15, 0.025, -0.055, 0.012, 0.006, '#b48a46', undefined, 10);
    for (let z = 0.025; z < 0.16; z += 0.035) {
      g.cyl(0, 0, z, 0, 0, z + 0.008, 0.025, 0.025, z < 0.08 ? '#765034' : '#654329', undefined, 10);
    }
  } else if (item === 'pick') {
    g.cyl(0, 0, 0.28, 0, 0, -0.39, 0.027, 0.024, '#765034', undefined, 12)
      .cyl(0, 0, -0.32, 0, 0, -0.39, 0.042, 0.04, '#34383a', undefined, 12)
      .cyl(-0.09, 0.015, -0.36, 0.12, 0.015, -0.36, 0.052, 0.045, '#888e90', undefined, 12)
      .cyl(0.12, 0.015, -0.36, 0.34, -0.025, -0.36, 0.045, 0.006, '#9ba1a2', undefined, 12)
      .cyl(-0.09, 0.015, -0.36, -0.33, 0.07, -0.36, 0.05, 0.008, '#a3a8a8', undefined, 12)
      .cyl(0, 0, 0.16, 0, 0, 0.19, 0.03, 0.03, '#3f2d20', undefined, 10);
    for (let z = -0.08; z < 0.12; z += 0.055) {
      g.cyl(0, 0, z, 0, 0, z + 0.009, 0.028, 0.028, '#5c412c', undefined, 10);
    }
  } else return null;
  return g.build();
}

function humanGearParts(L, extra) {
  const leather = L.faction === 'navy' ? '#3b3028' : C.leather;
  const brass = L.faction === 'hollow' ? '#777b70' : C.brass;
  const parts = [
    part(new THREE.TorusGeometry(0.215, 0.021, 10, 48), leather, [0, 0.91, 0], [1, 1, 0.64], [Math.PI / 2, 0, 0], 'leather'),
    box(brass, [0, 0.91, 0.145], [0.085, 0.075, 0.024], [0, 0, 0], 'metal'),
    box(leather, [0, 0.91, 0.161], [0.039, 0.039, 0.014], [0, 0, 0], 'leather'),
    box(leather, [-0.205, 0.875, 0.105], [0.115, 0.15, 0.09], [0, 0, -0.08], 'leather'),
    box(leather, [0.205, 0.875, 0.105], [0.115, 0.15, 0.09], [0, 0, 0.08], 'leather'),
    box(shade(leather, 0.72), [-0.205, 0.935, 0.155], [0.095, 0.018, 0.012], [0, 0, -0.08], 'leather'),
    box(shade(leather, 0.72), [0.205, 0.935, 0.155], [0.095, 0.018, 0.012], [0, 0, 0.08], 'leather'),
    box(brass, [-0.205, 0.935, 0.165], [0.023, 0.026, 0.012], [0, 0, 0], 'metal'),
    box(brass, [0.205, 0.935, 0.165], [0.023, 0.026, 0.012], [0, 0, 0], 'metal'),
    box(leather, [0.24, 0.84, 0.005], [0.07, 0.29, 0.045], [0, 0, -0.18], 'leather'),
    box(C.steelDark, [0.225, 0.99, 0.13], [0.065, 0.22, 0.035], [0, 0, -0.35], 'metal'),
    box(L.faction === 'pirate' ? '#8a3028' : shade(L.coat, 0.72), [0, 0.87, 0.157], [0.24, 0.045, 0.018], [0, 0, 0], 'cloth'),
  ];
  const strap = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.22, 1.4, 0.075),
    new THREE.Vector3(-0.18, 1.31, 0.145),
    new THREE.Vector3(-0.07, 1.18, 0.165),
    new THREE.Vector3(0.04, 1.06, 0.17),
    new THREE.Vector3(0.2, 0.91, 0.13),
  ]);
  parts.push(part(new THREE.TubeGeometry(strap, 32, 0.027, 10, false), leather, [0, 0, 0], [1, 1, 1], [0, 0, 0], 'leather'));
  for (let i = 0; i < 6; i++) {
    const t = 0.29 + i * 0.08, point = strap.getPoint(t), tangent = strap.getTangent(t);
    parts.push(box(brass, point.toArray(), [0.023, 0.032, 0.012], [0, 0, Math.atan2(tangent.x, tangent.y)], 'metal'));
  }
  for (const x of [-0.18, 0.18]) {
    parts.push(
      sphere(leather, [x, 1.34, 0.035], [0.08, 0.065, 0.09], [0, 0, 0], 'leather'),
      sphere(C.steel, [x, 1.34, 0.11], [0.052, 0.038, 0.022], [0, 0, 0], 'metal'),
    );
  }
  if (extra && extra.apron) {
    parts.push(
      box(extra.apron, [0, 0.77, 0.145], [0.27, 0.3, 0.025]),
      box(leather, [0, 0.93, 0.16], [0.28, 0.025, 0.022], [0, 0, 0], 'leather'),
    );
  }
  return parts;
}

const GROOM_CACHE = new Map();
function groomGeometry(style) {
  if (GROOM_CACHE.has(style)) return GROOM_CACHE.get(style);
  const positions = [], colors = [];
  let seed = style === 'scalp' ? 15731 : style === 'Stubble' ? 38117 : style === 'Full' ? 59357 : 7919;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const fiber = (root, tip, width, normal, brightness) => {
    const direction = tip.clone().sub(root).normalize();
    const side = new THREE.Vector3().crossVectors(direction, normal).normalize().multiplyScalar(width * 0.5);
    const a = root.clone().add(side), b = root.clone().sub(side);
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, tip.x, tip.y, tip.z);
    const rootTone = brightness * (0.76 + random() * 0.12), tipTone = brightness * (0.86 + random() * 0.14);
    colors.push(rootTone, rootTone, rootTone, rootTone, rootTone, rootTone, tipTone, tipTone, tipTone);
  };
  const rx = 0.09, ry = 0.105, rz = 0.082, thetaMax = 1.28;
  const point = (theta, phi) => new THREE.Vector3(
    rx * Math.sin(theta) * Math.cos(phi),
    0.047 + ry * Math.cos(theta),
    -0.012 + rz * Math.sin(theta) * Math.sin(phi),
  );
  for (let i = 0; i < 2600; i++) {
    const theta = Math.acos(1 - random() * (1 - Math.cos(thetaMax)));
    const phi = random() * Math.PI * 2;
    const root = point(theta, phi);
    const normal = new THREE.Vector3(
      (root.x / rx) / rx,
      ((root.y - 0.047) / ry) / ry,
      ((root.z + 0.012) / rz) / rz,
    ).normalize();
    const tip = point(Math.min(thetaMax + 0.025, theta + 0.018 + random() * 0.025), phi + 0.04 + random() * 0.12)
      .addScaledVector(normal, 0.0015);
    root.addScaledVector(normal, 0.0012);
    fiber(root, tip, 0.0004 + random() * 0.0004, normal, 0.5 + random() * 0.38);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  GROOM_CACHE.set(style, geometry);
  return geometry;
}

function humanHeadwear(L, head) {
  const hairMaterial = new THREE.MeshStandardMaterial({ color: L.hair, roughness: 0.96 });
  const fiberMaterial = new THREE.MeshStandardMaterial({
    color: L.hair, vertexColors: true, roughness: 0.98, side: THREE.DoubleSide,
  });
  const clothMaterial = new THREE.MeshStandardMaterial({ color: L.faction === 'navy' ? '#20272f' : C.hatBlack, roughness: 0.9 });
  const addMesh = (parent, geometry, material, position, scale = [1, 1, 1]) => {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(...position); m.scale.set(...scale); m.castShadow = true; m.receiveShadow = true; parent.add(m);
    return m;
  };
  const scalp = addMesh(
    head,
    new THREE.SphereGeometry(1, 48, 32, 0, Math.PI * 2, 0, 1.34),
    hairMaterial,
    [0, 0.047, -0.012],
    [0.09, 0.105, 0.082],
  );
  const fibers = new THREE.Mesh(groomGeometry('scalp'), fiberMaterial);
  fibers.userData.sharedHumanModel = true;
  fibers.castShadow = false; fibers.receiveShadow = false; head.add(fibers);

  const scleraMaterial = new THREE.MeshStandardMaterial({ color: '#cbbda9', roughness: 0.58 });
  const irisMaterial = new THREE.MeshStandardMaterial({ color: '#563a25', roughness: 0.42 });
  const pupilMaterial = new THREE.MeshStandardMaterial({ color: '#171311', roughness: 0.28 });
  const glintMaterial = new THREE.MeshBasicMaterial({ color: '#eee8dc' });
  const skinMaterial = new THREE.MeshStandardMaterial({ color: L.skin, roughness: 0.82, map: SKIN_MAP });
  const eyelids = [];
  for (const side of [-1, 1]) {
    const sclera = addMesh(head, new THREE.SphereGeometry(1, 24, 16), scleraMaterial, [side * 0.036, 0.054, 0.079], [0.0085, 0.006, 0.002]);
    const iris = addMesh(head, new THREE.SphereGeometry(1, 20, 14), irisMaterial, [side * 0.036, 0.054, 0.0808], [0.0052, 0.0062, 0.0018]);
    const pupil = addMesh(head, new THREE.SphereGeometry(1, 16, 12), pupilMaterial, [side * 0.036, 0.054, 0.0823], [0.0022, 0.0034, 0.001]);
    const glint = addMesh(head, new THREE.SphereGeometry(1, 10, 8), glintMaterial, [side * 0.036 - 0.0012, 0.056, 0.0831], [0.0007, 0.0007, 0.0004]);
    const brow = addMesh(head, new THREE.SphereGeometry(1, 16, 10), hairMaterial, [side * 0.036, 0.063, 0.078], [0.010, 0.0022, 0.0022]);
    brow.rotation.z = side * -0.08;
    const lid = addMesh(head, new THREE.SphereGeometry(1, 20, 12), skinMaterial, [side * 0.036, 0.054, 0.084], [0.008, 0.0002, 0.0024]);
    lid.userData.openScale = lid.scale.y;
    lid.userData.closedScale = 0.0064;
    eyelids.push(lid);
    for (const eye of [sclera, iris, pupil, glint, brow, lid]) eye.castShadow = false;
  }
  addMesh(head, new THREE.SphereGeometry(1, 20, 14), skinMaterial, [0, 0.035, 0.083], [0.0065, 0.014, 0.007]);
  addMesh(head, new THREE.SphereGeometry(1, 20, 14), skinMaterial, [0, 0.025, 0.088], [0.009, 0.007, 0.008]);

  if (L.patch) {
    const patchMaterial = new THREE.MeshStandardMaterial({ color: '#181715', roughness: 0.95 });
    addMesh(head, new THREE.SphereGeometry(1, 24, 16), patchMaterial, [0.035, -0.005, 0.09], [0.04, 0.033, 0.018]);
  }
  if (L.hat === 'Bandana') {
    const bandanaMaterial = new THREE.MeshStandardMaterial({ color: C.bandana, roughness: 0.98 });
    addMesh(head, new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.48), bandanaMaterial, [0, 0.045, -0.005], [0.12, 0.085, 0.115]);
    addMesh(head, new THREE.CapsuleGeometry(0.012, 0.12, 6, 8), bandanaMaterial, [0.08, -0.04, -0.025], [1, 1, 0.8]);
  } else if (L.hat === 'Hood') {
    const hood = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.75), clothMaterial);
    hood.position.set(0, 0.035, -0.025); hood.scale.set(0.13, 0.16, 0.13); hood.castShadow = true; head.add(hood);
  } else if (L.hat === 'Tricorn' || L.hat === 'Bicorne') {
    const brim = addMesh(head, hatBrimGeometry(L.hat), clothMaterial, [0, 0, 0]);
    const crown = addMesh(head, new THREE.CylinderGeometry(0.068, 0.084, 0.086, 32, 1), clothMaterial, [0, 0.166, -0.004]);
    const band = addMesh(head, new THREE.TorusGeometry(0.078, 0.0045, 8, 32), new THREE.MeshStandardMaterial({ color: C.brass, metalness: 0.45, roughness: 0.52 }), [0, 0.145, -0.004]);
    band.rotation.x = Math.PI / 2;
    const pinX = L.hat === 'Bicorne' ? 0.066 : 0;
    addMesh(head, new THREE.SphereGeometry(0.011, 12, 8), new THREE.MeshStandardMaterial({ color: C.brass, metalness: 0.55, roughness: 0.42 }), [pinX, 0.158, 0.081]);
    if (L.hat === 'Bicorne') {
      const feather = addMesh(head, new THREE.CapsuleGeometry(0.008, 0.052, 4, 8), new THREE.MeshStandardMaterial({ color: C.feather, roughness: 0.9 }), [0.066, 0.232, 0.015]);
      feather.rotation.z = -0.55;
    }
    brim.userData.sharedHumanModel = false; crown.userData.sharedHumanModel = false; band.userData.sharedHumanModel = false;
  }
  return eyelids;
}

export class Avatar {
  constructor(look, extra = {}) {
    this.extra = extra;
    this.root = new THREE.Group();
    this.mat = voxelMaterial();
    this.t = Math.random() * 10; this.blinkOffset = Math.random() * 4.5; this.phase = 0; this.swing = 0; this.item = null;
    this.setLook(look);
    HUMAN_MODEL_READY.then((source) => {
      if (!source) return;
      HUMAN_SOURCE = source;
      if (!this.humanRig) this.setLook(this.look);
    });
  }
  setLook(look) {
    this.look = { ...look };
    const L = resolve(look);
    this.root.traverse((o) => { if (o.geometry && !o.userData.sharedHumanModel) o.geometry.dispose(); });
    this.root.clear();
    this.humanRig = null;
    this.humanBones = null;
    this.humanPoseBasis = null;
    this.humanFace = null;
    if (HUMAN_SOURCE) {
      this.buildHuman(L);
      return;
    }
    const leg = (x) => {
      const g = new THREE.Group(); g.position.set(x, 0.76, 0); mesh(g, thighParts());
      g.shin = new THREE.Group(); g.shin.position.set(0, -0.38, 0); mesh(g.shin, shinParts()); g.add(g.shin);
      return g;
    };
    this.legL = leg(-0.11); this.legR = leg(0.11);
    this.torso = new THREE.Group(); this.torso.position.set(0, 0.76, 0); mesh(this.torso, torsoParts(L, this.extra));
    this.head = new THREE.Group(); this.head.position.set(0, 0.68, 0); mesh(this.head, headParts(L));
    this.armL = new THREE.Group(); this.armL.position.set(-0.29, 0.6, 0); mesh(this.armL, upperArmParts(L));
    this.armL.elbow = new THREE.Group(); this.armL.elbow.position.y = -0.31; mesh(this.armL.elbow, forearmParts(L)); this.armL.add(this.armL.elbow);
    this.armR = new THREE.Group(); this.armR.position.set(0.29, 0.6, 0); mesh(this.armR, upperArmParts(L));
    this.armR.elbow = new THREE.Group(); this.armR.elbow.position.y = -0.31; mesh(this.armR.elbow, forearmParts(L)); this.armR.add(this.armR.elbow);
    this.hand = new THREE.Group(); this.hand.position.set(0, -0.39, -0.01); this.armR.elbow.add(this.hand);
    this.torso.add(this.head, this.armL, this.armR);
    this.root.add(this.legL, this.legR, this.torso);
    if (this.extra.lantern) {
      const lg = new GeoBuilder({ round: 0.1 }).box(-0.07, -0.2, -0.07, 0.07, 0.0, 0.07, '#2a2b2d').box(-0.05, -0.18, -0.05, 0.05, -0.02, 0.05, '#ffd27a').build();
      this.lantern = new THREE.Mesh(lg, new THREE.MeshBasicMaterial({ vertexColors: true }));
      const lh = new THREE.Group(); lh.position.set(0, -0.62, 0); lh.add(this.lantern); this.armL.add(lh);
    }
    this.holdItem(this.item, true);
    this.petGroup = null;
    if (this.pet) this.setPet(this.pet);
  }
  buildHuman(L) {
    this.humanRig = cloneRig(HUMAN_SOURCE);
    this.humanRig.rotation.y = Math.PI;
    this.humanRig.traverse((o) => {
      if (o.isBone) (this.humanBones || (this.humanBones = {}))[o.name] = o;
      if (o.isSkinnedMesh) {
        o.material = humanMaterial(L);
        o.userData.sharedHumanModel = true;
        o.castShadow = true; o.receiveShadow = true;
      }
    });
    this.root.add(this.humanRig);
    this.humanRig.updateMatrixWorld(true);
    this.humanRest = {};
    for (const [name, bone] of Object.entries(this.humanBones)) this.humanRest[name] = bone.quaternion.clone();
    this.root.updateMatrixWorld(true);
    const actorWorldInverse = this.root.getWorldQuaternion(new THREE.Quaternion()).invert();
    this.humanPoseBasis = {};
    for (const [name, bone] of Object.entries(this.humanBones)) {
      this.humanPoseBasis[name] = actorWorldInverse.clone().multiply(bone.parent.getWorldQuaternion(new THREE.Quaternion()));
    }
    const gear = new THREE.Group();
    mesh(gear, humanGearParts(L, this.extra));
    this.humanRig.add(gear);
    this.humanRig.updateMatrixWorld(true);
    this.humanBones.pelvis.attach(gear);
    this.humanFace = humanHeadwear(L, this.humanBones.head);
    this.hand = new THREE.Group();
    this.hand.rotation.x = Math.PI / 2;
    this.humanBones.hand_r.add(this.hand);
    if (this.extra.lantern) {
      const lanternGeo = new GeoBuilder({ round: 0.1 })
        .box(-0.07, -0.2, -0.07, 0.07, 0, 0.07, '#2a2b2d')
        .box(-0.05, -0.18, -0.05, 0.05, -0.02, 0.05, '#ffd27a')
        .build();
      const lantern = new THREE.Mesh(lanternGeo, new THREE.MeshBasicMaterial({ vertexColors: true }));
      lantern.position.set(0, 0.08, 0); lantern.castShadow = true; this.humanBones.hand_l.add(lantern);
    }
    this.holdItem(this.item, true);
    this.petGroup = null;
    if (this.pet) this.setPet(this.pet);
  }
  // a companion parrot riding on the left shoulder
  setPet(pet) {
    if (this.petGroup) { this.petGroup.parent.remove(this.petGroup); this.petGroup = null; }
    this.pet = pet || null;
    if (!pet) return;
    const m = parrotModel(this.mat, PARROT_COLORS[pet.color] || PARROT_COLORS[0]);
    m.group.position.set(-0.23, this.humanRig ? 1.4 : 0.68, 0.02);
    this.petGroup = m.group; this.petParts = m.parts;
    (this.humanRig || this.torso).add(m.group);
  }
  holdItem(item, force) {
    if (item === this.item && !force) return;
    this.item = item;
    this.hand.clear();
    const g = item ? itemGeo(item) : null;
    if (g) {
      const m = new THREE.Mesh(g, this.mat); m.castShadow = true;
      m.position.set(0, isGun(item) ? 0.08 : 0, item === 'cutlass' ? -0.08 : isGun(item) ? -0.05 : 0);
      const scale = item === 'cutlass' ? 0.85 : item === 'pick' ? 0.82 : item === 'musket' ? 0.82 : 0.8;
      m.scale.setScalar(this.humanRig ? scale : 1);
      this.hand.add(m);
    }
  }
  poseHuman(state, dt, o, pose) {
    const bones = this.humanBones, rest = this.humanRest, basis = this.humanPoseBasis, k = Math.min(1, dt * 12);
    const poseEuler = new THREE.Euler(), poseRotation = new THREE.Quaternion(), target = new THREE.Quaternion();
    const set = (name, x = 0, y = 0, z = 0) => {
      const bone = bones[name];
      if (!bone) return;
      poseRotation.setFromEuler(poseEuler.set(x, y, z));
      target.copy(basis[name]).invert().multiply(poseRotation).multiply(basis[name]).multiply(rest[name]);
      bone.quaternion.slerp(target, k);
    };
    const { legL, legR, kneeL, kneeR, footL, footR, armL, armR, armRy, armLz, armRz, elbowL, elbowR, pelvisX, torsoX, torsoY, torsoZ, rootY, headX, headY } = pose;
    this.humanRig.position.y = rootY;
    this.root.rotation.x = state === 'dead' ? -Math.PI / 2 + 0.1 : 0;
    set('pelvis', pelvisX);
    set('thigh_l', legL); set('thigh_r', legR);
    set('calf_l', kneeL); set('calf_r', kneeR);
    set('foot_l', footL); set('foot_r', footR);
    set('upperarm_l', armL, 0, 0.65 + armLz);
    set('upperarm_r', armR, armRy, -0.65 + armRz);
    set('lowerarm_l', elbowL); set('lowerarm_r', elbowR);
    const breathing = state === 'idle' || state === 'helm' ? Math.sin(this.t * 1.6) * 0.012 : 0;
    set('spine_01', -torsoX * 0.25 - breathing, torsoY * 0.25, torsoZ * 0.25);
    set('spine_02', -torsoX * 0.35 - breathing * 0.6, torsoY * 0.35, torsoZ * 0.35);
    set('spine_03', -torsoX * 0.3, torsoY * 0.3, torsoZ * 0.3);
    set('head', headX + (o.look || 0), headY + (state === 'idle' ? Math.sin(this.t * 0.55) * 0.012 : 0), 0);
    const blinkPhase = (this.t + this.blinkOffset) % 4.5;
    const blink = state !== 'dead' && blinkPhase < 0.14 ? Math.sin(Math.PI * blinkPhase / 0.14) : 0;
    for (const lid of this.humanFace || []) lid.scale.y = lid.userData.openScale + (lid.userData.closedScale - lid.userData.openScale) * blink;
    if (this.petGroup) {
      const busy = state === 'run' || state === 'air' || o.swing > 0;
      this.petGroup.position.y = 1.4 + (busy ? 0.06 + Math.abs(Math.sin(this.t * 22)) * 0.05 : Math.max(0, Math.sin(this.t * 2.3)) * 0.012);
      const flap = busy ? Math.sin(this.t * 26) * 0.9 : 0.1;
      this.petParts.wl.rotation.z = flap; this.petParts.wr.rotation.z = -flap;
      this.petGroup.rotation.y = Math.sin(this.t * 0.6) * 0.5;
    }
  }
  // state: idle | walk | run | swim | air | helm | dead | slide | climb | crouch | sneak | an emote
  pose(state, dt, o = {}) {
    this.t += dt;
    const k = Math.min(1, dt * 12);
    const lerp = (obj, prop, v) => { obj[prop] += (v - obj[prop]) * k; };
    // Rotation signs: +x swings a limb forward (toward -z, the way the character faces); +z on the right arm swings it outward.
    let legL = 0, legR = 0, armL = 0, armR = 0, armRy = 0, armLz = -0.06, armRz = 0.06, elbowL = 0.12, elbowR = 0.12, pelvisX = 0, torsoX = 0, torsoY = 0, torsoZ = 0, rootY = 0, headX = 0, headY = 0, legY = 0.76, legZ = 0, kneeL = 0, kneeR = 0, footL = 0, footR = 0;
    const T = this.t;
    if (state !== this.lastState) { this.lastState = state; this.stateT = 0; }
    this.stateT = (this.stateT || 0) + dt;
    const st = this.stateT;
    if (state === 'walk' || state === 'run') {
      this.phase += dt * (state === 'run' ? 11 : 8);
      const s = Math.sin(this.phase), amp = state === 'run' ? 0.85 : 0.6;
      legL = s * amp; legR = -s * amp; armL = -s * amp * 0.8; armR = s * amp * 0.8;
      kneeL = -Math.max(0, Math.sin(this.phase - 1.3)) * amp * 1.3; kneeR = -Math.max(0, Math.sin(this.phase - 1.3 + Math.PI)) * amp * 1.3;
      rootY = Math.abs(Math.cos(this.phase)) * 0.04; torsoX = state === 'run' ? 0.12 : 0.04;
    } else if (state === 'crouch' || state === 'sneak') {
      // hips down, knees bent, leaning in
      let sw = 0;
      if (state === 'sneak') { this.phase += dt * 6; sw = Math.sin(this.phase) * 0.35; }
      rootY = -0.3 + (state === 'sneak' ? Math.abs(Math.cos(this.phase)) * 0.025 : Math.sin(T * 1.6) * 0.008);
      legL = 1.05 + sw; legR = 0.75 - sw; kneeL = -1.55 - sw * 0.6; kneeR = -1.25 + sw * 0.6;
      torsoX = 0.32; headX = 0.24; armL = 0.55 - sw * 0.5; armR = 0.6 + sw * 0.5; armLz = -0.12; armRz = 0.12;
    } else if (state === 'crawl' || state === 'creep') {
      // on hands and knees, for one-block gaps
      let sw = 0;
      if (state === 'creep') { this.phase += dt * 5; sw = Math.sin(this.phase); }
      rootY = -0.4; torsoX = 1.35; headX = 1.15;
      legL = 0.05 + sw * 0.3; legR = 0.05 - sw * 0.3; kneeL = -1.5; kneeR = -1.5;
      armL = 1.25 - sw * 0.35; armR = 1.25 + sw * 0.35; armLz = -0.08; armRz = 0.08;
    } else if (state === 'wave') {
      armRz = 2.55 + Math.sin(st * 9) * 0.32; armR = 0.25; armL = 0.05; headY = -0.12; torsoZ = -0.05;
    } else if (state === 'cheer') {
      const b = Math.abs(Math.sin(st * 7));
      rootY = b * 0.1; armLz = -2.75 - b * 0.15; armRz = 2.75 + b * 0.15; armL = 0.2; armR = 0.2; headX = 0.3;
      kneeL = kneeR = -(1 - b) * 0.35; legL = legR = (1 - b) * 0.18;
    } else if (state === 'dance') {
      const a = st * 5.2, s = Math.sin(a), c = Math.cos(a);
      rootY = Math.abs(s) * 0.06 - 0.04; torsoY = s * 0.35; torsoZ = c * 0.08; headY = -s * 0.25;
      armL = 0.6 + c * 0.9; armR = 0.6 - c * 0.9; armLz = -0.6 - Math.max(0, s) * 1.6; armRz = 0.6 + Math.max(0, -s) * 1.6;
      legL = Math.max(0, s) * 0.55; legR = Math.max(0, -s) * 0.55; kneeL = -Math.max(0, s) * 1.0; kneeR = -Math.max(0, -s) * 1.0;
    } else if (state === 'salute') {
      armR = 2.35; armRz = -0.62; torsoX = -0.04; headX = -0.06;
    } else if (state === 'point') {
      armR = 1.55; armRz = 0.06; torsoY = -0.12; headX = -0.05; armL = -0.1;
    } else if (state === 'sit') {
      // on the ground, knees up, hands behind
      rootY = -0.6; legL = 2.0; legR = 1.8; kneeL = -1.75; kneeR = -1.45;
      torsoX = -0.18; armL = -0.6; armR = -0.6; armLz = -0.3; armRz = 0.3; headX = -0.1;
    } else if (state === 'bow') {
      const k = Math.min(1, st * 3) * (st > 1.4 ? Math.max(0, 1 - (st - 1.4) * 3) : 1);
      torsoX = 0.95 * k; headX = -0.15 * k; armR = 0.9 * k; armRz = -0.25 * k; armL = -0.35 * k; legR = -0.12 * k; kneeR = -0.25 * k;
    } else if (state === 'shrug') {
      const k = Math.sin(Math.min(1, st / 1.7) * Math.PI);
      armL = 0.8 * k; armR = 0.8 * k; armLz = -0.75 * k; armRz = 0.75 * k; headX = -0.1 * k; torsoZ = 0.08 * k; rootY = 0.02 * k;
    } else if (state === 'swim') {
      this.phase += dt * 4;
      const s = Math.sin(this.phase);
      pelvisX = -1.05; torsoX = 0.18; rootY = 0.15; headX = 1.1;
      armL = 0.95 + s * 0.32; armR = 0.95 - s * 0.32; armLz = -0.14; armRz = 0.14;
      legL = s * 0.2; legR = -s * 0.2;
      kneeL = -0.22 - Math.max(0, s) * 0.42; kneeR = -0.22 - Math.max(0, -s) * 0.42;
      footL = -0.08; footR = -0.08;
    } else if (state === 'air') {
      legL = 0.5; legR = -0.3; kneeL = -0.7; kneeR = -0.35; armL = 0.4; armR = 0.3; armLz = -0.45; armRz = 0.45;
    } else if (state === 'helm') {
      const r = o.rudder || 0;
      armL = 1.2 + Math.sin(this.t * 1.3) * 0.03 + r * 0.15; armR = 1.2 - r * 0.15; armLz = 0.16; armRz = -0.16; torsoY = -r * 0.2;
    } else if (state === 'dead') {
      torsoX = 0.3; legL = 0.2; legR = -0.2;
    } else if (state === 'slide') {
      torsoX = -0.62; rootY = -0.42; legL = 1.45; legR = 1.25; kneeL = -0.15; kneeR = -1.1; armL = -0.6; armR = 0.5; armLz = -0.7; armRz = 0.5; headX = 0.35;
    } else if (state === 'climb') {
      armL = 2.7; armR = 2.6; armLz = -0.15; armRz = 0.15; legL = 0.9; legR = -0.1; kneeL = -1.3; kneeR = -0.3; torsoX = 0.25;
    } else {
      armL = Math.sin(this.t * 1.4) * 0.04; armR = -Math.sin(this.t * 1.4) * 0.04; rootY = Math.sin(this.t * 1.4) * 0.006;
    }
    const gun = isGun(this.item) && (state === 'idle' || state === 'walk' || state === 'run' || state === 'crouch' || state === 'sneak' || state === 'air');
    if (gun) {
      armR = 1.42 + (o.look || 0) * 0.9 + (o.kick || 0) * 0.5; armRz = -0.05;
      elbowR = -0.2;
      if (this.item !== 'pistol') { armL = 1.3 + (o.look || 0) * 0.9 + (o.kick || 0) * 0.5; armLz = 0.42; elbowL = -0.2; torsoY = 0.25; }
    } else if (o.swing > 0 && this.item === 'cutlass') {
      const p = 1 - o.swing;
      const smooth = (a, b, x) => {
        const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
        return t * t * (3 - 2 * t);
      };
      if (p < 0.24) {
        const t = smooth(0, 0.24, p);
        armR = 0.35 + t * 0.55; armRy = -0.18 - t * 0.36; armRz = 0.12 + t * 0.18;
        elbowR = -0.24 - t * 0.28; torsoY -= t * 0.12;
      } else if (p < 0.72) {
        const t = smooth(0.24, 0.72, p);
        armR = 0.9 - t * 0.68; armRy = -0.54 + t * 1.22; armRz = 0.3 - t * 0.2;
        elbowR = -0.52 + t * 0.42; torsoY += 0.28 * Math.sin(t * Math.PI * 0.5);
      } else {
        const t = smooth(0.72, 1, p);
        armR = 0.22 + t * 0.16; armRy = 0.68 * (1 - t); armRz = 0.1 * (1 - t) + 0.06 * t;
        elbowR = -0.1 * (1 - t) + 0.12 * t; torsoY += 0.28 * (1 - t);
      }
    } else if (o.swing > 0) {
      const p = 1 - o.swing;
      armR = p < 0.25 ? 0.4 + (p / 0.25) * 2.3 : 2.7 - ((p - 0.25) / 0.75) * 2.2;
      armRz = 0.2; torsoY += Math.sin(p * Math.PI) * 0.25;
    } else if (this.item && (state === 'idle' || state === 'walk' || state === 'run')) armR = Math.max(armR, 0.35);
    if (this.humanRig) {
      this.poseHuman(state, dt, o, { legL, legR, kneeL, kneeR, footL, footR, armL, armR, armRy, armLz, armRz, elbowL, elbowR, pelvisX, torsoX, torsoY, torsoZ, rootY, headX, headY });
      return;
    }
    lerp(this.legL.rotation, 'x', legL); lerp(this.legR.rotation, 'x', legR);
    lerp(this.legL.shin.rotation, 'x', state === 'swim' ? 0 : kneeL); lerp(this.legR.shin.rotation, 'x', state === 'swim' ? 0 : kneeR);
    lerp(this.torso.rotation, 'z', torsoZ); lerp(this.head.rotation, 'y', headY);
    lerp(this.armL.rotation, 'x', armL); lerp(this.armR.rotation, 'x', armR);
    lerp(this.armR.rotation, 'y', armRy);
    lerp(this.armL.rotation, 'z', armLz); lerp(this.armR.rotation, 'z', armRz);
    lerp(this.armL.elbow.rotation, 'x', elbowL); lerp(this.armR.elbow.rotation, 'x', elbowR);
    lerp(this.torso.rotation, 'x', -torsoX); lerp(this.torso.rotation, 'y', torsoY);
    lerp(this.head.rotation, 'x', headX + (o.look || 0));
    this.torso.position.y = 0.76 + rootY;
    if (state === 'swim') legY = 0.76 + rootY;
    this.legL.position.y = this.legR.position.y = legY + (state === 'swim' ? 0 : rootY);
    this.legL.position.z = this.legR.position.z = legZ;
    this.root.rotation.x = state === 'dead' ? -Math.PI / 2 + 0.1 : 0;
    if (this.petGroup) {
      const busy = state === 'run' || state === 'air' || (o.swing > 0);
      this.petGroup.position.y = 0.68 + (busy ? 0.06 + Math.abs(Math.sin(this.t * 22)) * 0.05 : Math.max(0, Math.sin(this.t * 2.3)) * 0.012);
      const f = busy ? Math.sin(this.t * 26) * 0.9 : 0.1;
      this.petParts.wl.rotation.z = f; this.petParts.wr.rotation.z = -f;
      this.petGroup.rotation.y = Math.sin(this.t * 0.6) * 0.5;
    }
  }
}

// first-person arm holding the current item
export class ViewArm {
  constructor() { this.group = new THREE.Group(); this.mat = voxelMaterial(); this.look = null; }
  setLook(look) {
    const L = resolve(look);
    this.group.clear();
    const forearm = forearmParts(L, false);
    for (const p of forearm) p.geometry.translate(0, -0.31, 0);
    this.arm = new THREE.Group();
    mesh(this.arm, [...upperArmParts(L), ...forearm]);
    this.arm.scale.setScalar(1.25);
    this.group.add(this.arm);
    this.hand = new THREE.Group(); this.hand.position.set(0, -0.72, -0.03); this.group.add(this.hand);
    mesh(this.hand, viewGripParts(L));
    this.tool = new THREE.Group(); this.tool.scale.setScalar(0.62); this.hand.add(this.tool);
    this.item = undefined;
  }
  hold(item, blockMesh) {
    if (item === this.item) return;
    this.item = item;
    this.tool.clear();
    this.hand.rotation.set(0, 0, 0);
    const g = itemGeo(item);
    if (g) {
      this.hand.rotation.x = -Math.PI / 2;
      const m = new THREE.Mesh(g, this.mat);
      m.position.set(0, isGun(item) ? 0.08 : 0, item === 'cutlass' ? -0.08 : isGun(item) ? -0.05 : 0);
      m.scale.setScalar(item === 'musket' ? 2.5 : item === 'pistol' ? 2 : item === 'blunderbuss' ? 1.7 : item === 'cutlass' ? 2.3 : 1.8);
      this.tool.add(m);
    } else {
      if (item) this.hand.rotation.x = -Math.PI / 2;
      if (blockMesh) { blockMesh.position.set(0, 0, -0.05); this.tool.add(blockMesh); }
    }
  }
}

// 16x16 pixel portrait for dialogs and the HUD
export function portrait(look, size = 64) {
  const L = resolve(look);
  const c = document.createElement('canvas'); c.width = c.height = 16;
  const x = c.getContext('2d');
  const px = (col, a, b, w = 1, h = 1) => { x.fillStyle = col; x.fillRect(a, b, w, h); };
  px(L.coat, 2, 13, 12, 3); px(C.shirt, 6, 13, 4, 3);
  px(L.skin, 4, 4, 8, 9);
  px(L.hair, 4, 4, 8, 2); px(L.hair, 3, 5, 1, 6); px(L.hair, 12, 5, 1, 6);
  px(C.eye, 5, 8, 2, 1); if (!L.patch) px(C.eye, 9, 8, 2, 1); else { px('#111', 9, 7, 3, 2); px('#111', 4, 7, 8, 1); }
  px(shade(L.skin, 0.8).getStyle(), 7, 9, 2, 2);
  if (L.beard === 'Full' || L.beard === 'Braided') { px(L.hair, 4, 10, 8, 3); px(C.mouth, 7, 11, 2, 1); if (L.beard === 'Braided') px(L.hair, 7, 13, 2, 2); }
  else if (L.beard === 'Stubble') { px(shade(L.hair, 0.9).getStyle(), 4, 11, 8, 2); px(C.mouth, 6, 11, 4, 1); }
  else px(C.mouth, 6, 11, 4, 1);
  if (L.hat === 'Tricorn') { px(C.hatBlack, 1, 2, 14, 2); px(C.hatBlack, 4, 0, 8, 2); px(C.brass, 1, 3, 14, 1); }
  else if (L.hat === 'Bandana') { px(C.bandana, 3, 2, 10, 3); px('#f1ece0', 5, 3, 1, 1); px('#f1ece0', 9, 2, 1, 1); }
  else if (L.hat === 'Bicorne') { px(C.hatBlack, 0, 2, 16, 2); px(C.hatBlack, 3, 0, 10, 2); px(C.brass, 0, 3, 16, 1); px(C.feather, 11, 0, 1, 2); }
  else if (L.hat === 'Hood') { px(C.hood, 2, 1, 12, 3); px(C.hood, 2, 3, 2, 10); px(C.hood, 12, 3, 2, 10); }
  else px(L.hair, 4, 2, 8, 2);
  if (size === 16) return c;
  const o = document.createElement('canvas'); o.width = o.height = size;
  const ox = o.getContext('2d'); ox.imageSmoothingEnabled = false; ox.drawImage(c, 0, 0, size, size);
  return o;
}
