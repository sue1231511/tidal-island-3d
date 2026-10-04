// 世界状态：当前“是哪个状态”严格按时钟公式；画面上的过渡由各维度的权重渐变完成。
// 每个维度保存一组权重（和为 1），状态一变就从当前权重平滑走向新的独热权重。
// 所有画面参数都是 36 种组合预设按权重混合出来的，所以任意时刻切换都不会硬切。

import * as THREE from '../../vendor/three.bundle.min.js';
import { log } from './logger.js';
import { stateAt, DIMS, DIM_SIZE } from './clock.js';
import { smoothstep } from './noise.js';

// 实时模式下各维度的过渡时长（秒）：潮水慢慢退，季节慢慢换
const LIVE_DURATION = { phase: 24, tide: 75, weather: 30, season: 45 };
// 工作台手动切换/拖滑杆时的过渡时长：仍然是渐变，只是快一点方便对比
const PREVIEW_DURATION = { phase: 3.5, tide: 5, weather: 3.5, season: 4 };

const C = (hex) => new THREE.Color(hex);

// ---- 预设 ----
// 时辰：昼 暮 夜
const PHASE = {
  skyTop: [C('#4f9fe0'), C('#41528f'), C('#070f26')],
  skyHorizon: [C('#d4ecf3'), C('#f6b48a'), C('#1a2a52')],
  skyBottom: [C('#a9d6e2'), C('#cc8f88'), C('#0c1630')],
  sunColor: [C('#fff1d6'), C('#ffad6b'), C('#a9bdff')],
  sunIntensity: [2.7, 1.75, 0.6],
  hemiSky: [C('#d6eaff'), C('#f2bfa6'), C('#3b4f86')],
  hemiGround: [C('#6b7a55'), C('#6e5550'), C('#151b2e')],
  hemiIntensity: [1.35, 1.0, 0.62],
  // 光源方向（未归一化）
  sunDir: [new THREE.Vector3(0.55, 1.0, 0.5), new THREE.Vector3(-0.9, 0.3, 0.32), new THREE.Vector3(-0.35, 0.85, -0.45)],
  lamps: [0, 0.9, 1],
  windows: [0.0, 0.75, 1],
  stars: [0, 0.12, 1],
  sunDisc: [1, 1, 0],
  moonDisc: [0, 0.15, 1],
  waterDeep: [C('#1f6f8f'), C('#3b4f78'), C('#0a1c33')],
  waterShallow: [C('#4fd0c8'), C('#c48f86'), C('#1f4a5c')],
  exposure: [1.0, 1.0, 1.1],
};

// 潮汐：退 平 涨（水面高度，单位与地形一致）
const TIDE = {
  level: [-1.45, 0.0, 1.05],
};

// 天气：晴 雾 风
const WEATHER = {
  fogDensity: [0.0017, 0.0042, 0.0027],
  fogColor: [C('#cfe3ea'), C('#c3cfd2'), C('#9eabb3')],
  fogTint: [0.0, 0.8, 0.4], // 雾色对天色的覆盖程度
  wind: [0.22, 0.12, 1.0],
  wave: [0.32, 0.2, 1.0],
  cloud: [0.32, 0.65, 0.95],
  cloudDark: [0.0, 0.12, 0.55],
  desat: [0.0, 0.5, 0.38],
  lightMul: [1.0, 0.72, 0.78],
  whitecap: [0.0, 0.05, 1.0],
  gulls: [1.0, 0.55, 0.22],
  boats: [1.0, 0.7, 0.0],
};

// 季节：春 夏 秋 冬
const SEASON = {
  grass: [C('#8cc463'), C('#5c9f45'), C('#b39d4c'), C('#9aa38f')],
  grassDry: [C('#b3cf74'), C('#8fae4c'), C('#c7894a'), C('#b7b19e')],
  sand: [C('#ead8a6'), C('#efd9a0'), C('#e2cb98'), C('#d9d3c3')],
  rock: [C('#8e8a80'), C('#938c7c'), C('#8a8278'), C('#858a8f')],
  path: [C('#d9ccb0'), C('#ddcfae'), C('#d3c3a2'), C('#cfcac0')],
  soil: [C('#6e5640'), C('#6a5139'), C('#6d5238'), C('#6a6058')],
  crop: [C('#8fd062'), C('#4f9d3a'), C('#d8b446'), C('#7d6d5a')],
  leaf: [C('#a3d77b'), C('#4e9a44'), C('#dc7f36'), C('#8b7a62')],
  leaf2: [C('#f2b3c9'), C('#3f8a3d'), C('#e9b040'), C('#7a6c58')],
  conifer: [C('#4c8455'), C('#3b7246'), C('#4a6e4b'), C('#3e5e52')],
  flower: [C('#f4a3c0'), C('#f7896a'), C('#e8a43a'), C('#e7edf4')],
  flowerAmount: [1.0, 0.85, 0.55, 0.12],
  leafAmount: [0.95, 1.0, 0.85, 0.35],
  snow: [0.0, 0.0, 0.0, 0.82],
  petals: [1.0, 0.0, 0.0, 0.0],
  fireflies: [0.0, 1.0, 0.35, 0.0],
  leaves: [0.0, 0.0, 1.0, 0.0],
  snowfall: [0.0, 0.0, 0.0, 1.0],
  butterflies: [1.0, 0.9, 0.25, 0.0],
  warm: [0.0, 0.08, 0.12, -0.12], // 光色冷暖微调
  fish: [0.5, 1.0, 0.5, 0.25], // 夏有渔汛
};

const tmpColor = new THREE.Color();

function mixNum(arr, w) {
  let s = 0;
  for (let i = 0; i < w.length; i++) s += arr[i] * w[i];
  return s;
}

function mixColor(out, arr, w) {
  out.setRGB(0, 0, 0);
  for (let i = 0; i < w.length; i++) {
    out.r += arr[i].r * w[i];
    out.g += arr[i].g * w[i];
    out.b += arr[i].b * w[i];
  }
  return out;
}

function mixVec(out, arr, w) {
  out.set(0, 0, 0);
  for (let i = 0; i < w.length; i++) out.addScaledVector(arr[i], w[i]);
  return out;
}

function desaturate(color, amount) {
  const l = color.r * 0.299 + color.g * 0.587 + color.b * 0.114;
  color.r += (l - color.r) * amount;
  color.g += (l - color.g) * amount;
  color.b += (l - color.b) * amount;
  return color;
}

function makeEnv() {
  const env = {
    w: { phase: [1, 0, 0], tide: [0, 1, 0], weather: [1, 0, 0], season: [1, 0, 0, 0] },
    time: 0,
  };
  const colorKeys = [
    'skyTop', 'skyHorizon', 'skyBottom', 'sunColor', 'hemiSky', 'hemiGround', 'waterDeep', 'waterShallow',
    'fogColor', 'grass', 'grassDry', 'sand', 'rock', 'path', 'soil', 'crop', 'leaf', 'leaf2', 'conifer', 'flower',
  ];
  colorKeys.forEach((k) => {
    env[k] = new THREE.Color();
  });
  env.sunDir = new THREE.Vector3(0, 1, 0);
  return env;
}

function computeEnv(env, info) {
  const wp = env.w.phase;
  const wt = env.w.tide;
  const ww = env.w.weather;
  const ws = env.w.season;

  mixColor(env.skyTop, PHASE.skyTop, wp);
  mixColor(env.skyHorizon, PHASE.skyHorizon, wp);
  mixColor(env.skyBottom, PHASE.skyBottom, wp);
  mixColor(env.sunColor, PHASE.sunColor, wp);
  mixColor(env.hemiSky, PHASE.hemiSky, wp);
  mixColor(env.hemiGround, PHASE.hemiGround, wp);
  mixColor(env.waterDeep, PHASE.waterDeep, wp);
  mixColor(env.waterShallow, PHASE.waterShallow, wp);
  env.sunIntensity = mixNum(PHASE.sunIntensity, wp);
  env.hemiIntensity = mixNum(PHASE.hemiIntensity, wp);
  env.lamps = mixNum(PHASE.lamps, wp);
  env.windows = mixNum(PHASE.windows, wp);
  env.stars = mixNum(PHASE.stars, wp);
  env.sunDisc = mixNum(PHASE.sunDisc, wp);
  env.moonDisc = mixNum(PHASE.moonDisc, wp);
  env.exposure = mixNum(PHASE.exposure, wp);
  env.day = wp[0];
  env.dusk = wp[1];
  env.night = wp[2];

  // 光源方向：按权重混合后，用段内进度做一个首尾连续的轻微摆动
  mixVec(env.sunDir, PHASE.sunDir, wp).normalize();
  const sway = Math.sin(((info && info.progress.phase) || 0) * Math.PI * 2) * 0.12;
  env.sunDir.applyAxisAngle(THREE.Object3D.DEFAULT_UP, sway).normalize();

  env.waterLevel = mixNum(TIDE.level, wt);
  env.ebb = wt[0];
  env.slack = wt[1];
  env.flood = wt[2];

  env.fogDensity = mixNum(WEATHER.fogDensity, ww);
  env.wind = mixNum(WEATHER.wind, ww);
  env.wave = mixNum(WEATHER.wave, ww);
  env.cloud = mixNum(WEATHER.cloud, ww);
  env.cloudDark = mixNum(WEATHER.cloudDark, ww);
  env.whitecap = mixNum(WEATHER.whitecap, ww);
  env.gulls = mixNum(WEATHER.gulls, ww) * (1 - wp[2] * 0.95);
  env.boats = mixNum(WEATHER.boats, ww);
  env.clear = ww[0];
  env.misty = ww[1];
  env.gale = ww[2];
  const desat = mixNum(WEATHER.desat, ww);
  const lightMul = mixNum(WEATHER.lightMul, ww);
  const fogTint = mixNum(WEATHER.fogTint, ww);

  // 天气对天色的影响：去饱和 + 雾色覆盖（夜里雾色跟着暗下来）
  mixColor(env.fogColor, WEATHER.fogColor, ww);
  const nightDim = 1 - wp[2] * 0.82 - wp[1] * 0.3;
  env.fogColor.multiplyScalar(nightDim);
  desaturate(env.skyTop, desat);
  desaturate(env.skyHorizon, desat * 0.8);
  desaturate(env.skyBottom, desat);
  env.skyHorizon.lerp(env.fogColor, fogTint * 0.85);
  env.skyTop.lerp(env.fogColor, fogTint * 0.45);
  env.skyBottom.lerp(env.fogColor, fogTint * 0.7);
  desaturate(env.waterDeep, desat * 0.6);
  desaturate(env.waterShallow, desat * 0.6);
  // 雾的颜色取地平线色，远处的海和天自然融在一起
  env.fogColor.copy(env.skyHorizon);
  env.sunIntensity *= lightMul;
  env.hemiIntensity *= 0.8 + lightMul * 0.2;

  mixColor(env.grass, SEASON.grass, ws);
  mixColor(env.grassDry, SEASON.grassDry, ws);
  mixColor(env.sand, SEASON.sand, ws);
  mixColor(env.rock, SEASON.rock, ws);
  mixColor(env.path, SEASON.path, ws);
  mixColor(env.soil, SEASON.soil, ws);
  mixColor(env.crop, SEASON.crop, ws);
  mixColor(env.leaf, SEASON.leaf, ws);
  mixColor(env.leaf2, SEASON.leaf2, ws);
  mixColor(env.conifer, SEASON.conifer, ws);
  mixColor(env.flower, SEASON.flower, ws);
  env.flowerAmount = mixNum(SEASON.flowerAmount, ws);
  env.leafAmount = mixNum(SEASON.leafAmount, ws);
  env.snow = mixNum(SEASON.snow, ws);
  env.petals = mixNum(SEASON.petals, ws) * (1 - wp[2] * 0.8);
  env.fireflies = mixNum(SEASON.fireflies, ws) * wp[2] * (1 - ww[2] * 0.8);
  env.leaves = mixNum(SEASON.leaves, ws);
  env.snowfall = mixNum(SEASON.snowfall, ws);
  env.butterflies = mixNum(SEASON.butterflies, ws) * wp[0] * (1 - ww[2] * 0.85) * (1 - ww[1] * 0.4);
  env.fish = mixNum(SEASON.fish, ws) * (1 - wp[2] * 0.7) * (1 - ww[2] * 0.6);
  env.doves = wp[0] * (1 - ww[2] * 0.5);
  const warm = mixNum(SEASON.warm, ws);
  env.sunColor.r = Math.max(0, env.sunColor.r + warm * 0.25);
  env.sunColor.b = Math.max(0, env.sunColor.b - warm * 0.25);
  // 冬天整体偏冷偏亮一点点，雪反光
  tmpColor.setRGB(0.92, 0.95, 1.0);
  env.hemiSky.lerp(tmpColor, env.snow * 0.25);
  env.spring = ws[0];
  env.summer = ws[1];
  env.autumn = ws[2];
  env.winter = ws[3];
  return env;
}

export function createWorldState() {
  const now = Date.now();
  const info0 = stateAt(now);
  const self = {
    mode: 'live', // live | scrub | manual
    offsetMs: 0,
    manual: { phase: info0.phase, tide: info0.tide, weather: info0.weather, season: info0.season },
    info: info0,
    current: { phase: info0.phase, tide: info0.tide, weather: info0.weather, season: info0.season },
    env: makeEnv(),
    transitions: {},
    listeners: new Set(),
    elapsed: 0,
    fastUntil: 0,
  };

  DIMS.forEach((d) => {
    const w = new Array(DIM_SIZE[d]).fill(0);
    w[self.current[d]] = 1;
    self.env.w[d] = w;
    self.transitions[d] = null;
  });

  function emit() {
    self.listeners.forEach((fn) => {
      try {
        fn(self);
      } catch (e) {
        log.error('state.emit.listener', e, { mode: self.mode });
      }
    });
  }

  function startTransition(dim, idx) {
    // 刚从工作台切回实时，也用快速过渡，免得等一分多钟
    const fast = self.mode !== 'live' || self.elapsed < self.fastUntil;
    const dur = fast ? PREVIEW_DURATION[dim] : LIVE_DURATION[dim];
    const target = new Array(DIM_SIZE[dim]).fill(0);
    target[idx] = 1;
    self.transitions[dim] = { from: self.env.w[dim].slice(), to: target, t: 0, dur };
  }

  function computeTarget(nowMs) {
    if (self.mode === 'manual') {
      const live = stateAt(nowMs);
      return Object.assign({}, live, self.manual, { manualView: true });
    }
    return stateAt(nowMs + (self.mode === 'scrub' ? self.offsetMs : 0));
  }

  self.update = function update(dt, nowMs) {
    try {
      self.elapsed += dt;
      self.env.time = self.elapsed;
      const info = computeTarget(nowMs);
      self.info = info;
      let changed = false;
      DIMS.forEach((d) => {
        if (info[d] !== self.current[d]) {
          log.info('state.switch', `${d}: ${self.current[d]} → ${info[d]}`, { mode: self.mode });
          self.current[d] = info[d];
          startTransition(d, info[d]);
          changed = true;
        }
        const tr = self.transitions[d];
        if (tr) {
          tr.t += dt;
          const k = smoothstep(0, 1, tr.t / tr.dur);
          const w = self.env.w[d];
          for (let i = 0; i < w.length; i++) w[i] = tr.from[i] + (tr.to[i] - tr.from[i]) * k;
          if (tr.t >= tr.dur) self.transitions[d] = null;
        }
      });
      computeEnv(self.env, info);
      if (changed) emit();
    } catch (e) {
      log.errorThrottled('state.update', e, { mode: self.mode, offsetMs: self.offsetMs, current: self.current });
    }
  };

  self.isTransitioning = function isTransitioning() {
    return DIMS.some((d) => self.transitions[d]);
  };

  self.setLive = function setLive() {
    self.mode = 'live';
    self.offsetMs = 0;
    self.fastUntil = self.elapsed + 1.5;
    emit();
  };

  self.setOffset = function setOffset(ms) {
    if (!Number.isFinite(ms)) {
      log.warn('state.setOffset', '偏移不是有限数，忽略', { ms });
      return;
    }
    self.mode = ms === 0 ? 'live' : 'scrub';
    self.offsetMs = ms;
    self.fastUntil = self.elapsed + 1.5;
    emit();
  };

  self.setManual = function setManual(dim, idx) {
    if (!DIMS.includes(dim) || !(idx >= 0 && idx < DIM_SIZE[dim])) {
      log.warn('state.setManual', '维度或索引不合法', { dim, idx });
      return;
    }
    if (self.mode !== 'manual') {
      // 进入手动模式时，以当前看到的状态为起点
      DIMS.forEach((d) => {
        self.manual[d] = self.current[d];
      });
    }
    self.mode = 'manual';
    self.manual[dim] = idx;
    self.fastUntil = self.elapsed + 1.5;
    emit();
  };

  self.onChange = function onChange(fn) {
    self.listeners.add(fn);
    return () => self.listeners.delete(fn);
  };

  computeEnv(self.env, info0);
  return self;
}
