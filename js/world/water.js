// 海：径向网格（近处密、远处疏），水面高度 = 潮位。
// 颜色按水深（地形高度贴图）从浅绿到深蓝；岸边一圈浪花；阵风起白浪；退潮时浅滩闪光。

import * as THREE from '../../vendor/three.bundle.min.js';
import { log } from '../core/logger.js';
import { WORLD_HALF } from './terrain.js';
import { registerSurface } from './materials.js';

function radialGrid() {
  const radii = [0];
  let r = 0;
  while (r < 170) {
    r += 2.2;
    radii.push(r);
  }
  while (r < 5000) {
    r *= 1.12;
    radii.push(r);
  }
  const SEG = 192;
  const pos = [];
  radii.forEach((rr, i) => {
    if (i === 0) {
      pos.push(0, 0, 0);
      return;
    }
    for (let k = 0; k < SEG; k++) {
      const a = (k / SEG) * Math.PI * 2;
      pos.push(Math.cos(a) * rr, 0, Math.sin(a) * rr);
    }
  });
  const idx = [];
  for (let k = 0; k < SEG; k++) idx.push(0, 1 + ((k + 1) % SEG), 1 + k);
  for (let i = 1; i < radii.length - 1; i++) {
    const a0 = 1 + (i - 1) * SEG;
    const a1 = 1 + i * SEG;
    for (let k = 0; k < SEG; k++) {
      const k1 = (k + 1) % SEG;
      idx.push(a0 + k, a0 + k1, a1 + k);
      idx.push(a0 + k1, a1 + k1, a1 + k);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uWave;
  uniform float uLevel;
  uniform sampler2D uHeight;
  uniform float uHalf;
  varying vec3 vWorld;
  varying float vDepth;
  varying float vCrest;
  #include <fog_pars_vertex>

  float terrainH(vec2 xz) {
    vec2 uv = xz / (uHalf * 2.0) + 0.5;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return -40.0;
    float v = clamp(texture2D(uHeight, uv).r, 0.002, 0.998);
    float x = 2.0 * v - 1.0;
    return 4.0 * 0.5 * log((1.0 + x) / (1.0 - x));
  }

  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    float depth = uLevel - terrainH(wp.xz);
    float att = smoothstep(0.0, 5.0, depth) * (1.0 - smoothstep(600.0, 1400.0, length(wp.xz)));
    float t = uTime;
    float a = 0.18 + uWave * 0.55;
    float h = sin(dot(wp.xz, vec2(0.09, 0.05)) + t * 1.1) * 0.5
            + sin(dot(wp.xz, vec2(-0.06, 0.11)) + t * 1.4) * 0.3
            + sin(dot(wp.xz, vec2(0.16, -0.13)) + t * 2.1) * 0.2 * (0.4 + uWave);
    wp.y += h * a * att;
    vCrest = h;
    vDepth = depth;
    vWorld = wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uWave;
  uniform float uWind;
  uniform float uWhitecap;
  uniform float uLevel;
  uniform float uEbb;
  uniform float uOpacity;
  uniform float uDay;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uSky;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  uniform float uSunI;
  uniform float uStars;
  varying vec3 vWorld;
  varying float vDepth;
  varying float vCrest;
  #include <fog_pars_fragment>

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }

  void main() {
    vec2 p = vWorld.xz;
    float t = uTime;
    // 法线：几层斜向波纹，风大时更碎
    float k = 0.6 + uWind * 1.4;
    vec2 g = vec2(0.0);
    g += vec2(0.09, 0.05) * cos(dot(p, vec2(0.09, 0.05)) + t * 1.1) * 0.5;
    g += vec2(-0.06, 0.11) * cos(dot(p, vec2(-0.06, 0.11)) + t * 1.4) * 0.3;
    g += vec2(0.37, 0.21) * cos(dot(p, vec2(0.37, 0.21)) + t * 2.6) * 0.12 * k;
    g += vec2(-0.29, 0.43) * cos(dot(p, vec2(-0.29, 0.43)) + t * 3.1) * 0.1 * k;
    g += vec2(0.71, -0.52) * cos(dot(p, vec2(0.71, -0.52)) + t * 4.3) * 0.05 * k;
    vec3 N = normalize(vec3(-g.x * 2.2, 1.0, -g.y * 2.2));
    vec3 V = normalize(cameraPosition - vWorld);

    float depth = vDepth;
    vec3 col = mix(uShallow, uDeep, smoothstep(0.2, 9.0, depth));
    // 天光反射
    float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    col = mix(col, uSky, clamp(fres * 0.75, 0.0, 0.85));
    // 太阳/月亮高光
    vec3 R = reflect(-normalize(uSunDir), N);
    float spec = pow(max(dot(R, V), 0.0), 90.0);
    col += uSunColor * spec * uSunI * 0.45;

    // 岸边浪花：浅处一圈，随时间推拉
    float n1 = vnoise(p * 0.55 + vec2(t * 0.35, t * 0.2));
    float n2 = vnoise(p * 1.3 - vec2(t * 0.25, -t * 0.4));
    float band = 1.0 - smoothstep(0.0, 0.55 + uWave * 0.7, depth);
    float pulse = 0.5 + 0.5 * sin(depth * 6.0 - t * 2.2 + n1 * 3.0);
    float foam = band * smoothstep(0.45, 0.75, n1 * 0.6 + n2 * 0.4 + pulse * 0.35);
    foam = max(foam, (1.0 - smoothstep(0.0, 0.18, depth)) * 0.9);
    // 阵风白浪
    float capN = vnoise(p * 0.9 + vec2(t * 0.9, -t * 0.5)) * 0.6 + vnoise(p * 2.3 - t * 0.7) * 0.4;
    float cap = uWhitecap * smoothstep(0.55, 0.95, vCrest) * smoothstep(0.62, 0.78, capN) * smoothstep(1.0, 4.0, depth);
    foam = max(foam, cap * 0.7);
    vec3 foamCol = mix(vec3(0.92, 0.96, 0.97), uSky, 0.25) * (0.35 + 0.65 * max(uDay, 0.35));
    col = mix(col, foamCol, clamp(foam, 0.0, 1.0));

    // 退潮时浅滩的小闪光
    float glint = uEbb * (1.0 - smoothstep(0.0, 1.2, depth)) * step(0.985, hash(floor(p * 3.0) + floor(t * 2.0)));
    col += vec3(1.0, 0.97, 0.88) * glint * (0.4 + 0.6 * uDay);
    // 夜里星光的一点点碎光
    col += vec3(0.6, 0.7, 1.0) * uStars * step(0.995, hash(floor(p * 2.0) + floor(t * 1.5))) * 0.25;

    float alpha = mix(0.5, 1.0, smoothstep(0.0, 2.2, depth));
    alpha = max(alpha, foam);
    gl_FragColor = vec4(col, alpha * uOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

export function buildWater(heightTex) {
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uTime: { value: 0 },
      uWave: { value: 0.3 },
      uWind: { value: 0.2 },
      uWhitecap: { value: 0 },
      uLevel: { value: 0 },
      uEbb: { value: 0 },
      uOpacity: { value: 1 },
      uDay: { value: 1 },
      uHalf: { value: WORLD_HALF },
      uHeight: { value: null },
      uDeep: { value: new THREE.Color() },
      uShallow: { value: new THREE.Color() },
      uSky: { value: new THREE.Color() },
      uSunColor: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunI: { value: 1 },
      uStars: { value: 0 },
    },
  ]);
  uniforms.uHeight.value = heightTex;
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    fog: true,
    depthWrite: true,
  });
  material.name = 'water';
  material.userData.baseTransparent = true;
  registerSurface(material);
  const mesh = new THREE.Mesh(radialGrid(), material);
  mesh.name = 'water';
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  mesh.receiveShadow = false;

  function update(env, time) {
    try {
      const u = material.uniforms;
      u.uTime.value = time;
      u.uWave.value = env.wave;
      u.uWind.value = env.wind;
      u.uWhitecap.value = env.whitecap;
      u.uLevel.value = env.waterLevel;
      u.uEbb.value = env.ebb;
      u.uDay.value = env.day + env.dusk * 0.6;
      u.uDeep.value.copy(env.waterDeep);
      u.uShallow.value.copy(env.waterShallow);
      u.uSky.value.copy(env.skyHorizon);
      u.uSunColor.value.copy(env.sunColor);
      u.uSunDir.value.copy(env.sunDir);
      u.uSunI.value = env.sunIntensity * (1 - env.misty * 0.6);
      u.uStars.value = env.stars;
      mesh.position.y = env.waterLevel;
    } catch (e) {
      log.errorThrottled('water.update', e);
    }
  }

  return { mesh, material, update };
}
