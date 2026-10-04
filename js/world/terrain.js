// 地形：一块被海啃了很久的岛。
// 海岸线 = 不规则半径函数（几组谐波 + 指定的湾与岬 + 噪声扭曲），
// 崖与滩交替由“崖度”控制，退潮时浅滩露出，东南岬外有一条退潮才露的沙洲通往灯塔礁。
// 坐标：y 向上，北 = -z，东 = +x。平潮海面 y = 0。

import * as THREE from '../../lib/three.bundle.min.js';
import { log } from '../core/logger.js';
import { createNoise2D, fbm, smoothstep, lerp, clamp, angleDiff, mulberry32 } from '../core/noise.js';
import { inject, registerSurface, U } from './materials.js';

export const WORLD_HALF = 135; // 地形网格覆盖 [-135, 135]
const GRID = 176;

const nA = createNoise2D(7301);
const nB = createNoise2D(1187);
const nC = createNoise2D(4421);
const nD = createNoise2D(9907);

// ---- 海岸形状 ----
// 角度 θ = atan2(z, x)：东 0，南 +π/2，西 ±π，北 -π/2
const COAST_FEATURES = [
  { a: -0.84, amp: -22, w: 0.17 }, // 东北：海边月牙沙湾（码头）
  { a: -1.92, amp: -13, w: 0.065 }, // 正北偏西：窄湾
  { a: -1.45, amp: 6, w: 0.12 }, // 北：份地前的缓岬
  { a: -2.36, amp: 14, w: 0.12 }, // 西北：小屋岬
  { a: 3.08, amp: 10, w: 0.16 }, // 西：盐风崖凸出
  { a: 2.84, amp: -7, w: 0.05 }, // 崖下的海蚀小口
  { a: 2.55, amp: -15, w: 0.1 }, // 西南：小沙湾
  { a: 1.64, amp: 12, w: 0.2 }, // 南：井下入口所在的丘
  { a: 0.9, amp: -11, w: 0.08 }, // 海岬南侧小湾
  { a: 0.62, amp: 17, w: 0.06 }, // 东南：细长海岬，指向灯塔礁
  { a: 0.36, amp: -9, w: 0.07 }, // 海岬北侧小湾
  { a: -0.12, amp: -12, w: 0.1 }, // 东：岸工坊盐田湾
];

// 崖度：1 = 陡崖，0 = 缓滩
const CLIFF_FEATURES = [
  { a: Math.PI, amp: 1.0, w: 0.55 },
  { a: -2.42, amp: 0.75, w: 0.28 },
  { a: 1.66, amp: 0.95, w: 0.42 },
  { a: 0.62, amp: 0.95, w: 0.12 },
  { a: -1.55, amp: 0.45, w: 0.22 },
  { a: 2.2, amp: 0.55, w: 0.16 },
  { a: 0.25, amp: 0.4, w: 0.16 },
];

function gauss(d, w) {
  return Math.exp(-(d * d) / (2 * w * w));
}

export function coastRadius(theta) {
  let r = 84;
  r += 4.5 * Math.sin(2 * theta + 1.3) + 3.5 * Math.sin(3 * theta + 0.4) + 2.6 * Math.sin(5 * theta + 2.1);
  r += 1.6 * Math.sin(9 * theta + 0.7) + 1.1 * Math.sin(13 * theta + 4.2);
  for (const f of COAST_FEATURES) r += f.amp * gauss(angleDiff(theta, f.a), f.w);
  r += 5.5 * fbm(nA, Math.cos(theta) * 1.7 + 11, Math.sin(theta) * 1.7 - 4, 3);
  return r;
}

export function cliffiness(theta) {
  let c = 0;
  for (const f of CLIFF_FEATURES) c = Math.max(c, f.amp * gauss(angleDiff(theta, f.a), f.w));
  c += 0.22 * nB(Math.cos(theta) * 2.3, Math.sin(theta) * 2.3);
  return clamp(c, 0, 1);
}

// 半径函数是平滑的，按角度预先查表加速
const RADIUS_LUT_N = 2048;
const radiusLUT = new Float32Array(RADIUS_LUT_N + 1);
const cliffLUT = new Float32Array(RADIUS_LUT_N + 1);
for (let i = 0; i <= RADIUS_LUT_N; i++) {
  const th = -Math.PI + (i / RADIUS_LUT_N) * Math.PI * 2;
  radiusLUT[i] = coastRadius(th);
  cliffLUT[i] = cliffiness(th);
}
function lut(arr, theta) {
  const f = ((theta + Math.PI) / (Math.PI * 2)) * RADIUS_LUT_N;
  const i = clamp(Math.floor(f), 0, RADIUS_LUT_N - 1);
  const t = f - i;
  return arr[i] + (arr[i + 1] - arr[i]) * t;
}

/** 海岸坐标系：s = 1 - r/R，0 在海岸线，正值向内陆；c 为崖度；theta 方向角 */
export function coastCoords(x, z) {
  // 噪声扭曲让海岸线出现小岬和碎湾
  const wx = x + 8.5 * nC(x * 0.03, z * 0.03) + 2.6 * nD(x * 0.1, z * 0.1);
  const wz = z + 8.5 * nC(x * 0.03 + 31.7, z * 0.03 - 12.3) + 2.6 * nD(x * 0.1 - 7.1, z * 0.1 + 3.3);
  const r = Math.hypot(wx, wz);
  const theta = Math.atan2(wz, wx);
  const R = lut(radiusLUT, theta);
  return { s: 1 - r / R, c: lut(cliffLUT, theta), theta, r, R };
}

// ---- 海岸距离场：到海岸线的真实距离（单位），岸上为正，海里为负 ----
// 海岸线的噪声扭曲会把 s 在局部拉伸好几倍，所以滩涂、崖脚这些“宽度”必须按真实距离算。
const SD_N = 300;
const SD_CELL = (2 * WORLD_HALF) / SD_N;
let sdField = null;

function buildCoastField() {
  const t0 = performance.now();
  const N = SD_N;
  const land = new Uint8Array(N * N);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = -WORLD_HALF + (i + 0.5) * SD_CELL;
      const z = -WORLD_HALF + (j + 0.5) * SD_CELL;
      land[j * N + i] = coastCoords(x, z).s > 0 ? 1 : 0;
    }
  }
  // 两遍倒角距离变换：分别求“到最近海格”和“到最近陆格”的距离
  const INF = 1e9;
  const D1 = 1;
  const D2 = Math.SQRT2;
  const transform = (isTarget) => {
    const d = new Float32Array(N * N);
    for (let k = 0; k < N * N; k++) d[k] = isTarget(k) ? 0 : INF;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const k = j * N + i;
        let v = d[k];
        if (i > 0) v = Math.min(v, d[k - 1] + D1);
        if (j > 0) {
          v = Math.min(v, d[k - N] + D1);
          if (i > 0) v = Math.min(v, d[k - N - 1] + D2);
          if (i < N - 1) v = Math.min(v, d[k - N + 1] + D2);
        }
        d[k] = v;
      }
    }
    for (let j = N - 1; j >= 0; j--) {
      for (let i = N - 1; i >= 0; i--) {
        const k = j * N + i;
        let v = d[k];
        if (i < N - 1) v = Math.min(v, d[k + 1] + D1);
        if (j < N - 1) {
          v = Math.min(v, d[k + N] + D1);
          if (i < N - 1) v = Math.min(v, d[k + N + 1] + D2);
          if (i > 0) v = Math.min(v, d[k + N - 1] + D2);
        }
        d[k] = v;
      }
    }
    return d;
  };
  const toSea = transform((k) => land[k] === 0);
  const toLand = transform((k) => land[k] === 1);
  const f = new Float32Array(N * N);
  for (let k = 0; k < N * N; k++) {
    f[k] = land[k] ? (toSea[k] - 0.5) * SD_CELL : -(toLand[k] - 0.5) * SD_CELL;
  }
  log.info('terrain.coastField', '海岸距离场完成', { 耗时ms: Math.round(performance.now() - t0) });
  return f;
}

/** 到海岸线的有符号距离（单位）：岸上为正 */
export function coastDistance(x, z) {
  if (!sdField) {
    try {
      sdField = buildCoastField();
    } catch (e) {
      log.error('terrain.coastDistance', e);
      sdField = new Float32Array(SD_N * SD_N);
    }
  }
  const fx = (x + WORLD_HALF) / SD_CELL - 0.5;
  const fz = (z + WORLD_HALF) / SD_CELL - 0.5;
  const i = clamp(Math.floor(fx), 0, SD_N - 2);
  const j = clamp(Math.floor(fz), 0, SD_N - 2);
  const tx = clamp(fx - i, 0, 1);
  const tz = clamp(fz - j, 0, 1);
  const k = j * SD_N + i;
  const a = sdField[k] + (sdField[k + 1] - sdField[k]) * tx;
  const b = sdField[k + SD_N] + (sdField[k + SD_N + 1] - sdField[k + SD_N]) * tx;
  let d = a + (b - a) * tz;
  // 网格外：用 s 粗估
  if (fx < 0 || fz < 0 || fx > SD_N - 1 || fz > SD_N - 1) d = coastCoords(x, z).s * 80;
  return d;
}

function bump(x, z, cx, cz, rad) {
  const d = Math.hypot(x - cx, z - cz) / rad;
  return d >= 1 ? 0 : (1 - d * d) * (1 - d * d);
}

// 灯塔礁与沙洲（由 setupFeatures 计算）
const feature = {
  islet: new THREE.Vector2(118, 62),
  barA: new THREE.Vector2(84, 46),
  barB: new THREE.Vector2(112, 59),
  hill: new THREE.Vector2(4, 80),
};

function segDist(px, pz, a, b) {
  const abx = b.x - a.x;
  const abz = b.y - a.y;
  const t = clamp(((px - a.x) * abx + (pz - a.y) * abz) / (abx * abx + abz * abz), 0, 1);
  return { d: Math.hypot(px - (a.x + abx * t), pz - (a.y + abz * t)), t };
}

/** 自然地形高度（不含地点平台） */
export function naturalHeight(x, z) {
  const { s, c, theta } = coastCoords(x, z);
  // 内陆基准海拔
  let E = 3.2 + 5.2 * smoothstep(0.0, 0.42, s);
  E += 2.2 * smoothstep(-20, -45, z) * smoothstep(0.05, 0.3, s); // 北部台地
  // 西侧高崖：只在靠海的一圈抬高，往内陆逐渐落回
  const coastBand = smoothstep(0.0, 0.12, s) * smoothstep(0.6, 0.22, s);
  E += 10 * gauss(angleDiff(theta, Math.PI), 0.45) * coastBand;
  E += 4.0 * gauss(angleDiff(theta, -2.4), 0.3) * coastBand;
  E += 10.5 * bump(x, z, feature.hill.x, feature.hill.y, 26); // 南丘
  E -= 3.6 * gauss(angleDiff(theta, -0.86), 0.3) * smoothstep(0.32, 0.0, s); // 东北海边低缓：一片宽沙滩
  E -= 1.8 * gauss(angleDiff(theta, -0.1), 0.2) * smoothstep(0.3, 0.0, s);
  E += 1.7 * fbm(nA, x * 0.022, z * 0.022, 3) + 0.55 * fbm(nB, x * 0.075, z * 0.075, 2);
  E = Math.max(E, 1.7);

  // 岸线剖面按真实距离 sd（单位）算
  const sd = coastDistance(x, z);
  let h;
  if (sd >= 0) {
    // 滩：上岸后缓缓抬升，前十几个单位都在涨潮能淹到的高度附近
    const beach = 0.15 + 1.3 * smoothstep(0, 9, sd) + (E - 1.45) * Math.pow(smoothstep(4, 26, sd), 0.9);
    const cliff = E * smoothstep(-0.4, 3.2, sd);
    h = lerp(Math.min(beach, Math.max(E, 1.5)), cliff, c);
  } else {
    const d = -sd;
    // 缓滩：先是一大片很浅的滩涂（退潮露出、涨潮淹没），再往外才陡下去
    const beachSea = 0.15 - 0.35 * smoothstep(0, 1.2, d) - 1.25 * smoothstep(0, 11, d) - 8.5 * smoothstep(9, 26, d);
    const cliffTop = E * smoothstep(-0.4, 3.2, 0);
    const cliffSea = lerp(cliffTop, -15, smoothstep(0.0, 7, d));
    h = lerp(beachSea, cliffSea, c);
    // 礁石与潮池起伏
    h += 0.9 * Math.max(0, nD(x * 0.11, z * 0.11) - 0.35) * smoothstep(12, 0.0, d) * 3.0;
    h += 0.35 * nC(x * 0.2, z * 0.2) * smoothstep(8, 0.0, d);
  }

  // 远海逐渐加深（在沙洲和灯塔礁之前做，免得把它们也压下去）
  const rr = Math.hypot(x, z);
  if (h < 0) h -= 6 * smoothstep(108, 135, rr);

  // 沙洲：退潮露出（顶部约 -0.75），平潮淹没
  const sb = segDist(x, z, feature.barA, feature.barB);
  const barW = 3.4 + 1.2 * Math.sin(sb.t * Math.PI * 3 + 1.0);
  const barH = -0.78 + 0.18 * Math.sin(sb.t * Math.PI) + 0.12 * nD(x * 0.3, z * 0.3);
  const barK = smoothstep(barW + 4, barW * 0.5, sb.d);
  if (barK > 0 && h < barH) h = lerp(h, barH, barK);

  // 灯塔礁
  const isl = Math.hypot(x - feature.islet.x, z - feature.islet.y);
  if (isl < 10) {
    const k = smoothstep(10, 2.5, isl);
    const rocky = 4.6 + 1.6 * nB(x * 0.3, z * 0.3) + 1.2 * smoothstep(6, 0, isl);
    h = Math.max(h, lerp(-8, rocky, Math.pow(k, 0.7)));
  }

  return h;
}

// ---- 地点平台与小路 ----
let pads = [];
let paths = [];

function padBlend(x, z, h) {
  for (const p of pads) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < p.r + p.soft) {
      const k = 1 - smoothstep(p.r, p.r + p.soft, d);
      h = lerp(h, p.h, k);
    }
  }
  return h;
}

function pathWeight(x, z) {
  let w = 0;
  for (const seg of paths) {
    const { d } = segDist(x, z, seg.a, seg.b);
    if (d < seg.w + 1.6) w = Math.max(w, 1 - smoothstep(seg.w * 0.6, seg.w + 1.4, d));
  }
  return w;
}

/** 最终地面高度（含平台） */
export function heightAt(x, z) {
  return padBlend(x, z, naturalHeight(x, z));
}

/** 沿方向 θ 从中心往外找海岸点；inset > 0 往内陆收 */
export function coastPoint(theta, inset = 0) {
  let lo = 10;
  let hi = 130;
  const dx = Math.cos(theta);
  const dz = Math.sin(theta);
  // 二分找最外侧一个 s = 0 的点（先粗扫，避免被内凹干扰）
  let last = lo;
  for (let r = lo; r < 130; r += 1.5) {
    if (coastCoords(dx * r, dz * r).s > 0) last = r;
  }
  lo = last;
  hi = last + 1.5;
  for (let i = 0; i < 18; i++) {
    const m = (lo + hi) / 2;
    if (coastCoords(dx * m, dz * m).s > 0) lo = m;
    else hi = m;
  }
  const r = lo - inset;
  return new THREE.Vector3(dx * r, 0, dz * r);
}

/** 由地点数据计算礁石、沙洲位置（必须在 buildTerrain 前调用） */
export function setupFeatures() {
  try {
    const tip = coastPoint(0.62, -1);
    const dir = new THREE.Vector2(Math.cos(0.62), Math.sin(0.62));
    const perp = new THREE.Vector2(-dir.y, dir.x);
    feature.barA.set(tip.x - dir.x * 3, tip.z - dir.y * 3);
    feature.islet.set(tip.x + dir.x * 15 + perp.x * 3, tip.z + dir.y * 15 + perp.y * 3);
    // 灯塔礁不能出地形边界（网格在半径 131 外裁掉）
    const ir = feature.islet.length();
    if (ir > 119) feature.islet.multiplyScalar(119 / ir);
    feature.barB.set(feature.islet.x - dir.x * 6, feature.islet.y - dir.y * 6);
    log.info('terrain.setupFeatures', '海岬与灯塔礁', { tip: [tip.x, tip.z], islet: feature.islet.toArray() });
  } catch (e) {
    log.error('terrain.setupFeatures', e);
  }
  return feature;
}

export function getFeature() {
  return feature;
}

export function setPadsAndPaths(padList, pathList) {
  pads = padList.map((p) => ({
    x: p.x,
    z: p.z,
    r: p.r,
    soft: p.soft || 7,
    h: p.h !== undefined ? p.h : naturalHeight(p.x, p.z),
  }));
  paths = [];
  pathList.forEach((pl) => {
    for (let i = 0; i < pl.pts.length - 1; i++) {
      paths.push({
        a: new THREE.Vector2(pl.pts[i][0], pl.pts[i][1]),
        b: new THREE.Vector2(pl.pts[i + 1][0], pl.pts[i + 1][1]),
        w: pl.w || 1.5,
      });
    }
  });
  return pads;
}

export function padHeight(x, z) {
  return heightAt(x, z);
}

export function slopeAt(x, z) {
  const e = 0.8;
  const hx = heightAt(x + e, z) - heightAt(x - e, z);
  const hz = heightAt(x, z + e) - heightAt(x, z - e);
  return Math.hypot(hx, hz) / (2 * e);
}

export function isLand(x, z, minH = 0.8) {
  return heightAt(x, z) > minH;
}

export function pathWeightAt(x, z) {
  return pathWeight(x, z);
}

// ---- 构建网格 ----
export const terrainUniforms = {
  uGrass: { value: new THREE.Color() },
  uGrassDry: { value: new THREE.Color() },
  uSand: { value: new THREE.Color() },
  uRock: { value: new THREE.Color() },
  uPath: { value: new THREE.Color() },
};

function makeTerrainMaterial() {
  const m = new THREE.MeshLambertMaterial({ flatShading: true, vertexColors: true });
  m.name = 'terrain';
  inject(m, { snow: true, wet: true, snowMin: 0.6 });
  const base = m.onBeforeCompile;
  m.onBeforeCompile = (shader) => {
    try {
      base(shader);
      Object.assign(shader.uniforms, terrainUniforms);
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          attribute vec4 aW;
          attribute vec2 aV;
          uniform vec3 uGrass;
          uniform vec3 uGrassDry;
          uniform vec3 uSand;
          uniform vec3 uRock;
          uniform vec3 uPath;`
        )
        .replace(
          '#include <color_vertex>',
          `vec3 grassC = mix(uGrass, uGrassDry, aV.x);
          vec3 c = grassC * aW.x + uSand * aW.y + uRock * aW.z + uPath * aW.w;
          float sum = max(aW.x + aW.y + aW.z + aW.w, 0.001);
          vColor = vec4((c / sum) * (0.93 + aV.y * 0.14), 1.0);
          // 深水下的海床更暗
          vColor.rgb *= mix(0.55, 1.0, smoothstep(-9.0, -1.0, position.y));`
        );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        if (length(vTWorld.xz) > 131.0) discard;`
      );
    } catch (e) {
      log.error('terrain.material.onBeforeCompile', e);
    }
  };
  m.customProgramCacheKey = () => 'terrain-v1';
  registerSurface(m);
  return m;
}

export function buildTerrain() {
  const t0 = performance.now();
  const rand = mulberry32(2026);
  const N = GRID;
  const step = (WORLD_HALF * 2) / N;
  const verts = (N + 1) * (N + 1);
  const P = new Float32Array(verts * 3);
  const W = new Float32Array(verts * 4);
  const V = new Float32Array(verts * 2);
  const heights = new Float32Array(verts);

  for (let j = 0; j <= N; j++) {
    for (let i = 0; i <= N; i++) {
      const idx = j * (N + 1) + i;
      let x = -WORLD_HALF + i * step;
      let z = -WORLD_HALF + j * step;
      // 内部顶点轻微抖动，让三角面不那么规整
      if (i > 0 && i < N && j > 0 && j < N) {
        x += (rand() - 0.5) * step * 0.55;
        z += (rand() - 0.5) * step * 0.55;
      }
      const h = heightAt(x, z);
      heights[idx] = h;
      P[idx * 3] = x;
      P[idx * 3 + 1] = h;
      P[idx * 3 + 2] = z;
    }
  }

  // 顶点颜色权重
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i <= N; i++) {
      const idx = j * (N + 1) + i;
      const x = P[idx * 3];
      const z = P[idx * 3 + 2];
      const h = heights[idx];
      const iL = Math.max(0, i - 1);
      const iR = Math.min(N, i + 1);
      const jD = Math.max(0, j - 1);
      const jU = Math.min(N, j + 1);
      const dx = (heights[j * (N + 1) + iR] - heights[j * (N + 1) + iL]) / ((iR - iL) * step);
      const dz = (heights[jU * (N + 1) + i] - heights[jD * (N + 1) + i]) / ((jU - jD) * step);
      const slope = Math.hypot(dx, dz);
      const { c } = coastCoords(x, z);
      let rock = smoothstep(0.75, 1.35, slope);
      const toIslet = Math.hypot(x - feature.islet.x, z - feature.islet.y);
      if (toIslet < 10 && h > 0.5) rock = Math.max(rock, 0.75);
      rock = Math.max(rock, smoothstep(0.55, 0.9, c) * smoothstep(5.5, 1.0, h) * smoothstep(-12, -0.5, h));
      rock = Math.max(rock, smoothstep(0.62, 0.8, nD(x * 0.06, z * 0.06)) * 0.8 * (h > 2 ? 1 : 0));
      let sand = smoothstep(2.1 + 0.8 * nA(x * 0.1, z * 0.1), 0.9, h) * (1 - c * 0.6);
      if (h < -0.2) sand = Math.max(sand, 0.85 - rock);
      let path = h > 0.9 ? pathWeight(x, z) : 0;
      path *= 1 - rock * 0.7;
      let grass = 1 - Math.max(rock, sand);
      grass = Math.max(0, grass) * (1 - path);
      rock *= 1 - path * 0.8;
      sand *= 1 - path;
      W[idx * 4] = grass;
      W[idx * 4 + 1] = sand;
      W[idx * 4 + 2] = rock;
      W[idx * 4 + 3] = path;
      V[idx * 2] = clamp(0.5 + 0.9 * nB(x * 0.035, z * 0.035), 0, 1);
      V[idx * 2 + 1] = clamp(0.5 + 0.45 * nC(x * 0.13 + 9.1, z * 0.13 - 3.7) + (rand() - 0.5) * 0.25, 0, 1);
    }
  }

  const index = [];
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const a = j * (N + 1) + i;
      const b = a + 1;
      const c2 = a + (N + 1);
      const d = c2 + 1;
      // 交替对角线，避免一个方向的条纹
      if ((i + j) % 2 === 0) index.push(a, c2, b, b, c2, d);
      else index.push(a, c2, d, a, d, b);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
  geo.setAttribute('aW', new THREE.BufferAttribute(W, 4));
  geo.setAttribute('aV', new THREE.BufferAttribute(V, 2));
  geo.setIndex(index);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();

  const mesh = new THREE.Mesh(geo, makeTerrainMaterial());
  mesh.name = 'terrain';
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  log.info('terrain.build', '地形完成', { 顶点: verts, 耗时ms: Math.round(performance.now() - t0) });
  return mesh;
}

/** 给海水着色器的高度贴图：用 tanh 压缩，让海平面附近精度最高 */
export function buildHeightTexture(size = 256) {
  const data = new Uint8Array(size * size);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = -WORLD_HALF + ((i + 0.5) / size) * WORLD_HALF * 2;
      const z = -WORLD_HALF + ((j + 0.5) / size) * WORLD_HALF * 2;
      const h = heightAt(x, z);
      const v = 0.5 + 0.5 * Math.tanh(h / 4);
      data[j * size + i] = Math.round(clamp(v, 0, 1) * 255);
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RedFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

export function updateTerrain(env) {
  try {
    terrainUniforms.uGrass.value.copy(env.grass);
    terrainUniforms.uGrassDry.value.copy(env.grassDry);
    terrainUniforms.uSand.value.copy(env.sand);
    terrainUniforms.uRock.value.copy(env.rock);
    terrainUniforms.uPath.value.copy(env.path);
    U.uWaterLevel.value = env.waterLevel;
  } catch (e) {
    log.errorThrottled('terrain.update', e);
  }
}
