// 共享材质 + 着色器注入（积雪、湿滩、随风摆动）+ 地上层整体淡出。
// 所有地上材质统一登记，下井时一起变透明，回到地面再恢复。

import * as THREE from '../../vendor/three.bundle.min.js';
import { log } from '../core/logger.js';

export const U = {
  uTime: { value: 0 },
  uWind: { value: 0.2 },
  uSnow: { value: 0 },
  uWaterLevel: { value: 0 },
};

const surfaceMaterials = new Set();
let surfaceFade = 1;

/**
 * 给 Lambert/Basic 材质注入：
 *  snow  朝上的面按 uSnow 盖雪
 *  wet   贴近水位的地面变深（退潮后的湿滩）
 *  sway  按高度随风摆（InstancedMesh 用实例位置做相位）
 */
export function inject(material, opts = {}) {
  const o = Object.assign({ snow: true, wet: false, sway: 0, snowMin: 0.55 }, opts);
  const key = `inj-${o.snow ? 1 : 0}${o.wet ? 1 : 0}${o.sway}-${o.snowMin}`;
  material.customProgramCacheKey = () => key;
  material.onBeforeCompile = (shader) => {
    try {
      shader.uniforms.uTime = U.uTime;
      shader.uniforms.uWind = U.uWind;
      shader.uniforms.uSnow = U.uSnow;
      shader.uniforms.uWaterLevel = U.uWaterLevel;
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform float uTime;
          uniform float uWind;
          varying vec3 vTWorld;`
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          ${
            o.sway > 0
              ? `{
            vec3 basePos = vec3(0.0);
            #ifdef USE_INSTANCING
              basePos = instanceMatrix[3].xyz;
            #endif
            float h = max(position.y, 0.0);
            float ph = basePos.x * 0.21 + basePos.z * 0.17;
            float s = sin(uTime * (1.1 + uWind * 2.2) + ph) * (0.03 + uWind * 0.11)
                    + sin(uTime * (2.7 + uWind * 4.0) + ph * 1.7) * uWind * 0.04;
            transformed.x += s * h * ${o.sway.toFixed(3)};
            transformed.z += s * h * ${(o.sway * 0.6).toFixed(3)};
          }`
              : ''
          }`
        )
        .replace(
          '#include <project_vertex>',
          `#include <project_vertex>
          {
            vec4 tw = vec4(transformed, 1.0);
            #ifdef USE_INSTANCING
              tw = instanceMatrix * tw;
            #endif
            vTWorld = (modelMatrix * tw).xyz;
          }`
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform float uSnow;
          uniform float uWaterLevel;
          uniform float uTime;
          varying vec3 vTWorld;`
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          {
            vec3 fN = normalize(cross(dFdx(vTWorld), dFdy(vTWorld)));
            float up = abs(fN.y);
            ${
              o.wet
                ? `float wetBand = smoothstep(uWaterLevel + 1.6, uWaterLevel + 0.15, vTWorld.y) * step(-6.0, vTWorld.y);
            diffuseColor.rgb *= 1.0 - wetBand * 0.33;
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.85, 0.95, 1.05), wetBand);`
                : ''
            }
            ${
              o.snow
                ? `float snowN = smoothstep(${o.snowMin.toFixed(2)}, ${(o.snowMin + 0.25).toFixed(2)}, up);
            float snowH = smoothstep(uWaterLevel + 0.6, uWaterLevel + 2.2, vTWorld.y);
            vec2 sp = vTWorld.xz * 0.45;
            vec2 si = floor(sp);
            vec2 sf = fract(sp);
            sf = sf * sf * (3.0 - 2.0 * sf);
            float h00 = fract(sin(dot(si, vec2(12.9898, 78.233))) * 43758.5453);
            float h10 = fract(sin(dot(si + vec2(1.0, 0.0), vec2(12.9898, 78.233))) * 43758.5453);
            float h01 = fract(sin(dot(si + vec2(0.0, 1.0), vec2(12.9898, 78.233))) * 43758.5453);
            float h11 = fract(sin(dot(si + vec2(1.0, 1.0), vec2(12.9898, 78.233))) * 43758.5453);
            float speck = mix(mix(h00, h10, sf.x), mix(h01, h11, sf.x), sf.y);
            float snowK = clamp(uSnow * 1.25 - speck * 0.35, 0.0, 1.0) * snowN * snowH;
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.95, 0.98), snowK);`
                : ''
            }
          }`
        );
    } catch (e) {
      log.error('materials.inject.onBeforeCompile', e, { key });
    }
  };
  return material;
}

/** 登记为地上材质：下井时淡出 */
export function registerSurface(material) {
  surfaceMaterials.add(material);
  if (material.userData.baseOpacity === undefined) material.userData.baseOpacity = material.opacity;
  if (material.userData.baseTransparent === undefined) material.userData.baseTransparent = material.transparent;
  return material;
}

/** f = 1 完全不透明，f → 0 越来越透明 */
export function setSurfaceFade(f) {
  try {
    const was = surfaceFade;
    surfaceFade = f;
    const becameOpaque = f >= 0.999 && was < 0.999;
    const becameTransparent = f < 0.999 && was >= 0.999;
    surfaceMaterials.forEach((m) => {
      const base = m.userData.baseOpacity === undefined ? 1 : m.userData.baseOpacity;
      if (becameTransparent && !m.transparent) {
        m.transparent = true;
        m.needsUpdate = true;
      }
      if (becameOpaque && !m.userData.baseTransparent) {
        m.transparent = false;
        m.needsUpdate = true;
      }
      m.opacity = base * f;
      if (m.uniforms && m.uniforms.uOpacity) m.uniforms.uOpacity.value = f;
    });
  } catch (e) {
    log.error('materials.setSurfaceFade', e, { f });
  }
}

export function getSurfaceFade() {
  return surfaceFade;
}

// ---- 调色板材质 ----
const cache = new Map();

const PALETTE = {
  wall: { color: '#efe4cf' },
  wallWarm: { color: '#e8d2b0' },
  wallBlue: { color: '#cfdcde' },
  plaster: { color: '#f3ead8' },
  wood: { color: '#9a6b45' },
  woodLight: { color: '#c39461' },
  woodDark: { color: '#5e4330' },
  plank: { color: '#b88a5c' },
  roofTeal: { color: '#3f8f8c' },
  roofTealDark: { color: '#2f6f72' },
  roofRed: { color: '#b4534a' },
  roofSlate: { color: '#4f5a66' },
  roofThatch: { color: '#c9a464' },
  stone: { color: '#b9b2a4' },
  stoneDark: { color: '#7d776d' },
  cobble: { color: '#d4cab6' },
  brass: { color: '#c9a24a' },
  iron: { color: '#4a4d52' },
  white: { color: '#f4f2ec' },
  red: { color: '#c9473f' },
  cream: { color: '#f2e2bf' },
  teal: { color: '#2f9c96' },
  blue: { color: '#3d6fb0' },
  orange: { color: '#e6873a' },
  yellow: { color: '#efc94c' },
  green: { color: '#5c9a4a' },
  leafDark: { color: '#3f7a43' },
  pink: { color: '#e88aa8' },
  purple: { color: '#8a6bb5' },
  soilDark: { color: '#5b4331' },
  rope: { color: '#cdb48a' },
  canvasA: { color: '#f3efe6' },
  black: { color: '#1b1a1c' },
  felt: { color: '#2f7d66' },
  carpet: { color: '#8f3a34' },
  tileTeal: { color: '#6fb3ac' },
  shell: { color: '#f2d9cc' },
  ore_iron: { color: '#a5502f', emissive: '#7a2a10' },
  ore_copper: { color: '#3fae8f', emissive: '#16735a' },
  ore_salt: { color: '#f4f6f8', emissive: '#a8c8d8' },
  ore_rare: { color: '#9a84e0', emissive: '#6a4fd0' },
};

/** 取一种调色板材质（带积雪注入，登记为地上） */
export function mat(key, opts = {}) {
  const ck = `${key}|${opts.underground ? 'u' : 's'}|${opts.flat === false ? 'n' : 'f'}|${opts.side || 0}`;
  if (cache.has(ck)) return cache.get(ck);
  const p = PALETTE[key];
  if (!p) {
    log.warn('materials.mat', '调色板里没有这个材质键，用石色兜底', { key });
  }
  const def = p || PALETTE.stone;
  const m = new THREE.MeshLambertMaterial({
    color: new THREE.Color(def.color),
    flatShading: opts.flat !== false,
    side: opts.side || THREE.FrontSide,
  });
  if (def.emissive) {
    m.emissive = new THREE.Color(def.emissive);
    m.emissiveIntensity = 0;
  }
  m.name = key;
  if (!opts.underground) {
    inject(m, { snow: true });
    registerSurface(m);
  }
  cache.set(ck, m);
  return m;
}

// ---- 会随时辰变化的发光材质 ----
export const glow = {
  window: null,
  lamp: null,
  lampUnder: null,
  star: null,
  beam: null,
};

export function initGlowMaterials() {
  glow.window = new THREE.MeshLambertMaterial({ color: '#3d4a55', emissive: '#ffc77a', emissiveIntensity: 0 });
  glow.window.name = 'window';
  registerSurface(glow.window);
  glow.lamp = new THREE.MeshBasicMaterial({ color: '#6d6252' });
  glow.lamp.name = 'lamp';
  registerSurface(glow.lamp);
  glow.star = new THREE.MeshLambertMaterial({ color: '#f2c84b', emissive: '#ffd25a', emissiveIntensity: 0.2 });
  glow.star.name = 'theaterStar';
  registerSurface(glow.star);
  // 井下的灯常亮，不随地上淡出
  glow.lampUnder = new THREE.MeshBasicMaterial({ color: '#ffd38a' });
  glow.lampUnder.name = 'lampUnder';
  return glow;
}

const lampOff = new THREE.Color('#6d6252');
const lampOn = new THREE.Color('#ffd98f');

export function updateMaterials(env, time) {
  try {
    U.uTime.value = time;
    U.uWind.value = env.wind;
    U.uSnow.value = env.snow;
    U.uWaterLevel.value = env.waterLevel;
    if (glow.window) glow.window.emissiveIntensity = env.windows * 1.15;
    if (glow.lamp) glow.lamp.color.copy(lampOff).lerp(lampOn, env.lamps);
    if (glow.star) glow.star.emissiveIntensity = 0.25 + env.lamps * 0.9 + Math.sin(time * 2.3) * 0.12 * env.lamps;
    if (glow.lampUnder) {
      const f = 0.92 + Math.sin(time * 7.1) * 0.04 + Math.sin(time * 13.7) * 0.03;
      glow.lampUnder.color.setRGB(1.0 * f, 0.83 * f, 0.54 * f);
    }
  } catch (e) {
    log.errorThrottled('materials.updateMaterials', e);
  }
}

// ---- 跟着季节变色的共享材质（树冠、庄稼、花） ----
export const seasonal = {
  leaf: null,
  leaf2: null,
  conifer: null,
  crop: null,
  flower: null,
  trunk: null,
};

export function initSeasonalMaterials() {
  const mk = (name, sway) => {
    const m = new THREE.MeshLambertMaterial({ color: '#7fb35a', flatShading: true });
    m.name = name;
    inject(m, { snow: true, sway, snowMin: 0.35 });
    registerSurface(m);
    return m;
  };
  seasonal.leaf = mk('leaf', 0.12);
  seasonal.leaf2 = mk('leaf2', 0.12);
  seasonal.conifer = mk('conifer', 0.08);
  seasonal.crop = mk('crop', 0.25);
  seasonal.flower = mk('flower', 0.15);
  seasonal.trunk = mk('trunk', 0.04);
  seasonal.trunk.color.set('#7a5638');
  return seasonal;
}

export function updateSeasonalMaterials(env) {
  try {
    if (!seasonal.leaf) return;
    seasonal.leaf.color.copy(env.leaf);
    seasonal.leaf2.color.copy(env.leaf2);
    seasonal.conifer.color.copy(env.conifer);
    seasonal.crop.color.copy(env.crop);
    seasonal.flower.color.copy(env.flower);
  } catch (e) {
    log.errorThrottled('materials.updateSeasonalMaterials', e);
  }
}
