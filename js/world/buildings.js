// 地上 14 处 + 灯塔。每处按它是什么来长：崖是崖、亭是亭、连理所是一条开花的廊。
// 每个地点：一个 Group（局部 +z 朝向正面），静态零件合并，动的部分单独更新。

import * as THREE from '../../vendor/three.bundle.min.js';
import { log } from '../core/logger.js';
import { mulberry32, lerp, clamp, smoothstep } from '../core/noise.js';
import { Parts, G, gableGeometry, hipGeometry, archGeometry, textTexture, drawTextCanvas } from '../core/geo.js';
import { mat, glow, seasonal, inject, registerSurface } from './materials.js';
import { GLOW_GROUP } from './glow.js';
import { heightAt, coastCoords } from './terrain.js';
import { LABELS } from '../core/clock.js';

const TAU = Math.PI * 2;

// ---------- 通用零件 ----------
function house(parts, o) {
  const w = o.w;
  const d = o.d;
  const h = o.h;
  const base = o.base === undefined ? 0.7 : o.base;
  parts.add(mat(o.baseMat || 'stone'), G.box, [0, base / 2 - 0.5, 0], [0, 0, 0], [w + 0.7, base + 1, d + 0.7]);
  parts.add(mat(o.wall), G.box, [0, base + h / 2, 0], [0, 0, 0], [w, h, d]);
  const roofH = o.roofH || h * 0.75;
  if (o.roofKind === 'hip') {
    parts.add(mat(o.roof), hipGeometry(w, d, roofH, o.overhang === undefined ? 0.45 : o.overhang), [0, base + h, 0]);
  } else {
    parts.add(mat(o.roof), gableGeometry(d, w, roofH, o.overhang === undefined ? 0.45 : o.overhang), [0, base + h, 0]);
  }
  if (o.door !== false) {
    parts.add(mat('woodDark'), G.box, [o.doorX || 0, base + 1.05, d / 2 + 0.06], [0, 0, 0], [1.25, 2.1, 0.14]);
  }
  const wy = base + h * 0.58;
  const wins = o.windows || [
    [-w / 3.2, d / 2],
    [w / 3.2, d / 2],
  ];
  wins.forEach(([x, z, side]) => {
    const rotY = side ? Math.PI / 2 : 0;
    const sz = side ? [0.14, 0.95, 0.95] : [0.95, 0.95, 0.14];
    const px = side ? x + Math.sign(x) * 0.07 : x;
    const pz = side ? z : z + 0.07;
    parts.add(glow.window, G.box, [px, wy, pz], [0, 0, 0], sz);
    // 窗框
    parts.add(mat('white'), G.box, [px, wy - 0.55, pz + (side ? 0 : 0.05)], [0, rotY, 0], [1.15, 0.12, 0.2]);
  });
  return base + h + roofH;
}

function lampPost(parts, glows, x, z, h = 3.2, group = GLOW_GROUP.lamps, y0 = 0) {
  parts.add(mat('iron'), G.cyl6, [x, y0 + h / 2, z], [0, 0, 0], [0.16, h, 0.16]);
  parts.add(mat('iron'), G.box, [x, y0 + 0.15, z], [0, 0, 0], [0.5, 0.3, 0.5]);
  parts.add(glow.lamp, G.box, [x, y0 + h + 0.3, z], [0, 0, 0], [0.42, 0.5, 0.42]);
  parts.add(mat('iron'), G.cone4, [x, y0 + h + 0.7, z], [0, Math.PI / 4, 0], [0.7, 0.35, 0.7]);
  glows.push({ local: [x, y0 + h + 0.3, z], color: '#ffc770', size: 3.2, group });
}

function lantern(parts, glows, x, y, z, group = GLOW_GROUP.lamps, size = 2.4) {
  parts.add(glow.lamp, G.box, [x, y, z], [0, 0, 0], [0.32, 0.4, 0.32]);
  parts.add(mat('woodDark'), G.box, [x, y + 0.25, z], [0, 0, 0], [0.4, 0.08, 0.4]);
  glows.push({ local: [x, y, z], color: '#ffbf66', size, group });
}

function fence(parts, pts, h = 0.9, matKey = 'woodLight') {
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, z0] = pts[i];
    const [x1, z1] = pts[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    const ang = Math.atan2(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / 1.6));
    for (let k = 0; k <= n; k++) {
      if (k === n && i < pts.length - 2) continue;
      const t = k / n;
      parts.add(mat(matKey), G.box, [x0 + (x1 - x0) * t, h / 2, z0 + (z1 - z0) * t], [0, ang, 0], [0.16, h, 0.16]);
    }
    parts.add(mat(matKey), G.box, [(x0 + x1) / 2, h * 0.75, (z0 + z1) / 2], [0, ang, 0], [0.08, 0.1, len]);
    parts.add(mat(matKey), G.box, [(x0 + x1) / 2, h * 0.4, (z0 + z1) / 2], [0, ang, 0], [0.08, 0.1, len]);
  }
}

function crate(parts, x, z, s = 0.8, y = 0, rot = 0) {
  parts.add(mat('woodLight'), G.box, [x, y + s / 2, z], [0, rot, 0], [s, s, s]);
}

function barrel(parts, x, z, y = 0) {
  parts.add(mat('wood'), G.cyl8, [x, y + 0.55, z], [0, 0, 0], [0.8, 1.1, 0.8]);
  parts.add(mat('iron'), G.cyl8, [x, y + 0.3, z], [0, 0, 0], [0.84, 0.08, 0.84]);
  parts.add(mat('iron'), G.cyl8, [x, y + 0.8, z], [0, 0, 0], [0.84, 0.08, 0.84]);
}

function bench(parts, x, z, rot = 0) {
  parts.add(mat('wood'), G.box, [x, 0.5, z], [0, rot, 0], [1.8, 0.12, 0.5]);
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  [-0.7, 0.7].forEach((o) => parts.add(mat('woodDark'), G.box, [x + c * o, 0.25, z - s * o], [0, rot, 0], [0.12, 0.5, 0.45]));
}

function tableSet(parts, x, z, round = true, chairs = 3) {
  parts.add(mat('woodLight'), round ? G.cyl8 : G.box, [x, 0.8, z], [0, 0, 0], [1.3, 0.1, 1.3]);
  parts.add(mat('woodDark'), G.cyl6, [x, 0.4, z], [0, 0, 0], [0.15, 0.8, 0.15]);
  for (let i = 0; i < chairs; i++) {
    const a = (i / chairs) * TAU + 0.4;
    parts.add(mat('wood'), G.box, [x + Math.cos(a) * 1.1, 0.45, z + Math.sin(a) * 1.1], [0, -a, 0], [0.5, 0.1, 0.5]);
    parts.add(mat('woodDark'), G.box, [x + Math.cos(a) * 1.1, 0.22, z + Math.sin(a) * 1.1], [0, 0, 0], [0.1, 0.44, 0.1]);
  }
}

function rockPile(parts, rng, x, z, n, spread, size, key = 'stoneDark') {
  for (let i = 0; i < n; i++) {
    const a = rng() * TAU;
    const r = rng() * spread;
    const s = size * (0.5 + rng() * 0.8);
    parts.add(mat(key), G.dodec, [x + Math.cos(a) * r, s * 0.25, z + Math.sin(a) * r], [rng() * 3, rng() * 3, rng() * 3], [s, s * 0.75, s]);
  }
}

function signBoard(parts, tex, x, y, z, w = 2.4, h = 1.2, rot = 0) {
  const m = new THREE.MeshLambertMaterial({ map: tex, flatShading: false });
  m.name = 'sign';
  registerSurface(m);
  const plane = new THREE.PlaneGeometry(w, h);
  parts.add(m, plane, [x, y, z], [0, rot, 0]);
  parts.add(mat('woodDark'), G.box, [x, y, z - 0.06], [0, rot, 0], [w + 0.2, h + 0.2, 0.1]);
  return m;
}

function stripeTexture(c1, c2) {
  try {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 8;
    const ctx = c.getContext('2d');
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 ? c1 : c2;
      ctx.fillRect(i * 8, 0, 8, 8);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    return t;
  } catch (e) {
    log.error('buildings.stripeTexture', e, { c1, c2 });
    return null;
  }
}

function texturedMat(name, tex, opts = {}) {
  const m = new THREE.MeshLambertMaterial(Object.assign({ map: tex, flatShading: true }, opts));
  m.name = name;
  inject(m, { snow: true });
  registerSurface(m);
  return m;
}

// 挥动的旗子：CPU 更新顶点，便宜
function makeFlag(color, w = 2.2, h = 1.3) {
  const geo = new THREE.PlaneGeometry(w, h, 8, 3);
  geo.translate(w / 2, 0, 0);
  const base = geo.attributes.position.array.slice();
  const m = new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide, flatShading: true });
  m.name = 'flag';
  registerSurface(m);
  const mesh = new THREE.Mesh(geo, m);
  mesh.castShadow = true;
  const update = (env, time) => {
    const p = geo.attributes.position.array;
    const amp = 0.08 + env.wind * 0.42;
    const sp = 2 + env.wind * 7;
    for (let i = 0; i < p.length; i += 3) {
      const x = base[i];
      const k = x / w;
      p[i + 2] = Math.sin(time * sp - x * 2.2) * amp * k;
      p[i + 1] = base[i + 1] - (1 - env.wind) * k * 0.35 * (1 - Math.abs(base[i + 1]) / h);
    }
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
  };
  return { mesh, update };
}

function flagPole(group, parts, x, z, h, color, dyn) {
  parts.add(mat('white'), G.cyl6, [x, h / 2, z], [0, 0, 0], [0.14, h, 0.14]);
  parts.add(mat('brass'), G.sphere, [x, h + 0.1, z], [0, 0, 0], [0.3, 0.3, 0.3]);
  const f = makeFlag(color);
  f.mesh.position.set(x, h - 0.75, z);
  group.add(f.mesh);
  dyn.push((env, time) => {
    f.update(env, time);
    // 旗子朝下风方向（风从西南来）
    f.mesh.rotation.y = -0.6 + Math.sin(time * 0.3) * 0.15 * env.wind;
  });
}

// ---------- 各地点 ----------
const BUILDERS = {
  hut(ctx) {
    const { parts, glows, rng } = ctx;
    const top = house(parts, {
      w: 8,
      d: 6,
      h: 3.4,
      wall: 'plaster',
      roof: 'roofTeal',
      roofH: 3.0,
      windows: [
        [-2.4, 3],
        [2.4, 3],
        [4, 0.5, true],
        [-4, -0.5, true],
      ],
    });
    // 烟囱
    parts.add(mat('stoneDark'), G.box, [2.3, 5.4, -1.2], [0, 0, 0], [0.9, 3.2, 0.9]);
    // 门廊
    parts.add(mat('plank'), G.box, [0, 0.75, 4.2], [0, 0, 0], [8.4, 0.25, 2.2]);
    [-3.8, 3.8].forEach((x) => parts.add(mat('woodDark'), G.box, [x, 2.0, 5.1], [0, 0, 0], [0.22, 2.6, 0.22]));
    parts.add(mat('roofTealDark'), G.box, [0, 3.35, 4.6], [-0.22, 0, 0], [8.6, 0.18, 2.6]);
    lantern(parts, glows, 1.2, 2.6, 4.9);
    // 篱笆小院
    const fpts = [];
    for (let i = 0; i <= 12; i++) {
      const a = Math.PI * 0.15 + (i / 12) * Math.PI * 0.7;
      fpts.push([Math.cos(a) * 9.5, Math.sin(a) * 8 + 1]);
    }
    fence(parts, fpts);
    // 院子里的晾衣绳、木柴堆、花盆
    parts.add(mat('woodDark'), G.box, [-6, 1.1, -3.5], [0, 0, 0], [0.15, 2.2, 0.15]);
    parts.add(mat('woodDark'), G.box, [-6, 1.1, 2.5], [0, 0, 0], [0.15, 2.2, 0.15]);
    parts.add(mat('rope'), G.box, [-6, 2.1, -0.5], [0, 0, 0], [0.04, 0.04, 6]);
    [mat('canvasA'), mat('blue'), mat('pink')].forEach((m, i) =>
      parts.add(m, G.box, [-6, 1.65, -2.4 + i * 1.6], [0, 0, 0], [0.05, 0.85, 0.9])
    );
    for (let i = 0; i < 5; i++) parts.add(mat('wood'), G.cyl6, [5.2, 0.25 + (i % 2) * 0.35, -2.6 + i * 0.4], [0, 0, Math.PI / 2], [0.35, 1.6, 0.35]);
    for (let i = 0; i < 4; i++) {
      parts.add(mat('roofRed'), G.cyl8, [-2.8 + i * 1.8, 0.95, 5.0], [0, 0, 0], [0.5, 0.45, 0.5]);
      parts.add(seasonal.flower, G.ico0, [-2.8 + i * 1.8, 1.4, 5.0], [0, rng(), 0], [0.6, 0.5, 0.6]);
    }
    // 炊烟
    const smoke = makeSmoke(ctx.group, [2.3, 7.2, -1.2]);
    ctx.dyn.push((env, time, dt, fade) => smoke((env.dusk + env.night * 0.45) * fade, env, time, dt));
    return { hitR: 9, hitH: top + 1, labelY: top + 2.5 };
  },

  allotment(ctx) {
    const { parts, group, dyn, rng } = ctx;
    // 菜畦 3×2
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 3; c++) {
        const x = -8 + c * 6.2;
        const z = 1.5 + r * 5.2;
        parts.add(mat('soilDark'), G.box, [x, 0.12, z], [0, 0, 0], [5.4, 0.5, 4.2]);
        parts.add(mat('woodLight'), G.box, [x, 0.3, z - 2.15], [0, 0, 0], [5.6, 0.25, 0.12]);
        for (let k = 0; k < 4; k++) {
          for (let m = 0; m < 5; m++) {
            const px = x - 2.1 + m * 1.05 + (rng() - 0.5) * 0.2;
            const pz = z - 1.4 + k * 0.95;
            const s = 0.55 + rng() * 0.25;
            parts.add(seasonal.crop, (c + r) % 2 ? G.cone6 : G.ico0, [px, 0.55, pz], [0, rng() * 3, 0], [s, s * 1.1, s]);
          }
        }
      }
    }
    // 温室（不受季节影响：里面的植物用固定绿色）
    const gx = 9;
    const gz = -1;
    parts.add(mat('stone'), G.box, [gx, 0.2, gz], [0, 0, 0], [6.4, 0.5, 9.4]);
    const glassMat = new THREE.MeshLambertMaterial({ color: '#cfeef0', transparent: true, opacity: 0.38, flatShading: true, side: THREE.DoubleSide, depthWrite: false });
    glassMat.name = 'glass';
    registerSurface(glassMat);
    const vault = new THREE.CylinderGeometry(3, 3, 9, 10, 1, true, -Math.PI / 2, Math.PI);
    vault.rotateZ(Math.PI / 2);
    vault.rotateY(Math.PI / 2);
    parts.add(glassMat, vault, [gx, 2.5, gz]);
    parts.add(glassMat, G.box, [gx, 1.5, gz], [0, 0, 0], [6, 2.2, 9]);
    for (let i = 0; i <= 4; i++) {
      const z = gz - 4.5 + i * 2.25;
      parts.add(mat('white'), new THREE.TorusGeometry(3, 0.07, 4, 10, Math.PI), [gx, 2.5, z]);
      [-3, 3].forEach((dx) => parts.add(mat('white'), G.box, [gx + dx, 1.5, z], [0, 0, 0], [0.12, 2.2, 0.12]));
    }
    for (let i = 0; i < 10; i++) {
      parts.add(mat('green'), G.ico0, [gx - 1.8 + (i % 2) * 3.6, 0.9, gz - 3.6 + Math.floor(i / 2) * 1.8], [0, rng() * 3, 0], [1.1, 1.0, 1.1]);
    }
    parts.add(mat('pink'), G.ico0, [gx, 0.9, gz + 3], [0, 0, 0], [0.6, 0.6, 0.6]);
    // 风车
    const wx = -12;
    const wz = -6;
    parts.add(mat('plaster'), G.cyl8, [wx, 4.5, wz], [0, 0, 0], [3.0, 9, 3.0]);
    parts.add(mat('roofTealDark'), G.cone8, [wx, 10.0, wz], [0, 0, 0], [3.6, 2.2, 3.6]);
    parts.add(mat('woodDark'), G.box, [wx, 1.0, wz + 1.45], [0, 0, 0], [1.0, 2.0, 0.2]);
    parts.add(glow.window, G.box, [wx, 5.5, wz + 1.5], [0, 0, 0], [0.7, 0.7, 0.1]);
    const hub = new THREE.Group();
    hub.position.set(wx, 8.4, wz + 1.75);
    const bladeParts = new Parts('windmill-blades');
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU;
      bladeParts.add(mat('woodDark'), G.box, [Math.sin(a) * 2.6, Math.cos(a) * 2.6, 0], [0, 0, -a], [0.18, 5.2, 0.12]);
      bladeParts.add(mat('canvasA'), G.box, [Math.sin(a) * 3.0 + Math.cos(a) * 0.45, Math.cos(a) * 3.0 - Math.sin(a) * 0.45, 0.05], [0, 0, -a], [0.85, 3.8, 0.05]);
    }
    bladeParts.add(mat('brass'), G.sphere, [0, 0, 0.1], [0, 0, 0], [0.6, 0.6, 0.6]);
    bladeParts.build(hub);
    group.add(hub);
    let ang = 0;
    dyn.push((env, time, dt) => {
      ang += dt * (0.35 + env.wind * 3.4);
      hub.rotation.z = ang;
    });
    // 果园：几棵小果树
    for (let i = 0; i < 5; i++) {
      const x = -13 + i * 3.4;
      const z = 12.5;
      parts.add(seasonal.trunk, G.cyl6, [x, 0.8, z], [0, 0, 0], [0.3, 1.6, 0.3]);
      parts.add(seasonal.leaf, G.ico0, [x, 2.2, z], [0, rng() * 3, 0], [2.0, 1.7, 2.0]);
      parts.add(mat('orange'), G.sphere, [x + 0.6, 2.0, z + 0.7], [0, 0, 0], [0.3, 0.3, 0.3]);
    }
    // 水井式的水桶、工具
    barrel(parts, 4.5, 8);
    parts.add(mat('woodDark'), G.box, [5.5, 0.8, 9], [0.3, 0, 0.2], [0.1, 1.8, 0.1]);
    return { hitR: 15, hitH: 10, labelY: 12 };
  },

  beach(ctx) {
    const { parts, group, glows, dyn, rng } = ctx;
    // 码头：局部 +z 指向大海，组的 y 已经设为 0（海平面）
    const deckY = 1.95;
    const len = 26;
    // 码头起点要坐在沙滩上：向内陆回退到地面高于甲板的位置
    parts.add(mat('plank'), G.box, [0, deckY, len / 2 - 2], [0, 0, 0], [3.2, 0.25, len]);
    for (let i = 0; i < len; i += 1.1) parts.add(mat('woodLight'), G.box, [0, deckY + 0.14, i - 2], [0, 0, 0], [3.3, 0.05, 0.12]);
    for (let z = 0; z <= len - 2; z += 3.4) {
      [-1.5, 1.5].forEach((x) => parts.add(mat('woodDark'), G.cyl6, [x, deckY - 4.5, z], [0, 0, 0], [0.32, 9.5, 0.32]));
    }
    // 码头尽头的小平台
    parts.add(mat('plank'), G.box, [0, deckY, len - 1], [0, 0, 0], [7, 0.25, 4]);
    [-3.3, 3.3].forEach((x) => parts.add(mat('woodDark'), G.cyl6, [x, deckY - 4, len - 1], [0, 0, 0], [0.32, 9, 0.32]));
    lampPost(parts, glows, 3, len - 2.4, 3.0, GLOW_GROUP.lamps, deckY);
    // 坐钓的小凳和鱼竿
    parts.add(mat('wood'), G.box, [-2.2, deckY + 0.45, len - 0.4], [0, 0, 0], [0.7, 0.12, 0.7]);
    parts.add(mat('woodDark'), G.cyl6, [-2.6, deckY + 1.6, len + 1.2], [0.9, 0, 0.2], [0.06, 4.4, 0.06]);
    // 沙滩上的东西放在码头根部两侧，跟随地面高度
    const beachItems = [
      [-7, -6],
      [6, -7],
      [-10, -2],
    ];
    const toWorld = (lx, lz) => {
      const v = new THREE.Vector3(lx, 0, lz).applyAxisAngle(THREE.Object3D.DEFAULT_UP, group.rotation.y);
      return v.add(group.position);
    };
    beachItems.forEach(([lx, lz], i) => {
      const w = toWorld(lx, lz);
      const y = Math.max(heightAt(w.x, w.z), 0.4);
      if (i === 0) {
        // 遮阳伞
        parts.add(mat('woodLight'), G.cyl6, [lx, y + 1.3, lz], [0, 0, 0], [0.1, 2.6, 0.1]);
        parts.add(mat('red'), G.cone8, [lx, y + 2.7, lz], [0, 0, 0], [3.2, 0.8, 3.2]);
        parts.add(mat('canvasA'), G.box, [lx + 1.2, y + 0.15, lz + 0.6], [0, 0.4, 0], [1.0, 0.1, 2.0]);
      } else if (i === 1) {
        // 倒扣的小船
        parts.add(mat('teal'), G.box, [lx, y + 0.35, lz], [Math.PI, 0.6, 0], [1.4, 0.6, 3.2]);
      } else {
        rockPile(parts, rng, lx, lz, 4, 1.4, 1.2, 'stone');
      }
    });
    // 系在码头边的小船：随浪起伏
    const boats = [];
    const mkRowboat = (color) => {
      const g = new THREE.Group();
      const p = new Parts('rowboat');
      p.add(mat(color), G.box, [0, 0.25, 0], [0, 0, 0], [1.4, 0.55, 3.0]);
      p.add(mat(color), G.cone4, [0, 0.25, 1.9], [Math.PI / 2, Math.PI / 4, 0], [1.4, 0.9, 0.7]);
      p.add(mat('woodLight'), G.box, [0, 0.45, 0], [0, 0, 0], [1.2, 0.08, 0.4]);
      p.build(g);
      return g;
    };
    const mkSailboat = (sailColor) => {
      const g = new THREE.Group();
      const p = new Parts('sailboat');
      p.add(mat('white'), G.box, [0, 0.35, 0], [0, 0, 0], [1.8, 0.8, 4.6]);
      p.add(mat('white'), G.cone4, [0, 0.35, 2.9], [Math.PI / 2, Math.PI / 4, 0], [1.8, 1.4, 0.95]);
      p.add(mat('woodDark'), G.cyl6, [0, 3.4, -0.2], [0, 0, 0], [0.14, 5.4, 0.14]);
      const sail = new THREE.Shape();
      sail.moveTo(0, 0);
      sail.lineTo(0, 4.6);
      sail.lineTo(2.6, 0.2);
      sail.lineTo(0, 0);
      const sg = new THREE.ExtrudeGeometry(sail, { depth: 0.05, bevelEnabled: false });
      sg.rotateY(Math.PI / 2);
      p.add(mat(sailColor), sg, [0, 1.0, -0.2]);
      p.build(g);
      return g;
    };
    [
      { g: mkRowboat('blue'), moor: [3.4, 8], phase: 0.3 },
      { g: mkRowboat('teal'), moor: [-3.4, 14], phase: 1.7 },
    ].forEach((b) => {
      b.g.position.set(b.moor[0], 0, b.moor[1]);
      group.add(b.g);
      boats.push(b);
    });
    const sailers = [
      { g: mkSailboat('canvasA'), moor: [5.4, 21], r: 30, speed: 0.035, off: 0.4, cx: 8, cz: 56 },
      { g: mkSailboat('roofRed'), moor: [-5.6, 23], r: 22, speed: -0.05, off: 2.2, cx: -8, cz: 46 },
    ];
    sailers.forEach((s) => group.add(s.g));
    dyn.push((env, time) => {
      const lvl = env.waterLevel;
      const amp = 0.08 + env.wave * 0.3;
      boats.forEach((b) => {
        b.g.position.y = lvl + Math.sin(time * 1.3 + b.phase) * amp;
        b.g.rotation.z = Math.sin(time * 1.1 + b.phase) * (0.03 + env.wave * 0.12);
        b.g.rotation.x = Math.sin(time * 0.9 + b.phase * 2) * (0.02 + env.wave * 0.06);
      });
      // 帆船：晴天出海，阵风天回到码头边（按天气权重连续插值）
      sailers.forEach((s) => {
        const a = time * s.speed + s.off;
        const sx = s.cx + Math.cos(a) * s.r;
        const sz = s.cz + Math.sin(a) * s.r * 0.55;
        const k = smoothstep(0, 1, env.boats);
        s.g.position.x = lerp(s.moor[0], sx, k);
        s.g.position.z = lerp(s.moor[1], sz, k);
        s.g.position.y = lvl + Math.sin(time * 1.2 + s.off) * amp;
        const heading = Math.atan2(-Math.sin(a) * Math.sign(s.speed), Math.cos(a) * 0.55 * Math.sign(s.speed));
        s.g.rotation.y = lerp(0, heading, k);
        s.g.rotation.z = Math.sin(time * 0.8 + s.off) * (0.04 + env.wave * 0.1) + k * 0.08;
      });
    });
    return { hitR: 12, hitH: 6, labelY: 7, hitOffset: [0, 0, 4] };
  },

  cliff(ctx) {
    const { parts, glows, rng } = ctx;
    // 崖顶观景：长椅、栏杆、路牌；采矿：矿车、镐、绳梯
    fence(parts, [
      [-5, 3.5],
      [-2, 4.6],
      [2, 4.6],
      [5, 3.5],
    ], 1.0, 'woodDark');
    bench(parts, 0, 1.5, 0);
    parts.add(mat('woodDark'), G.box, [-4, 1.1, -1], [0, 0, 0], [0.18, 2.2, 0.18]);
    parts.add(mat('woodLight'), G.box, [-3.6, 1.9, -1], [0, 0, 0.1], [1.2, 0.4, 0.1]);
    // 矿车与铁轨
    for (let i = 0; i < 6; i++) parts.add(mat('woodDark'), G.box, [3.5, 0.06, -4 + i * 0.9], [0, 0, 0], [1.6, 0.12, 0.3]);
    [-0.5, 0.5].forEach((dx) => parts.add(mat('iron'), G.box, [3.5 + dx, 0.16, -1.8], [0, 0, 0], [0.08, 0.1, 5.4]));
    parts.add(mat('iron'), G.box, [3.5, 0.75, -2.5], [0, 0, 0], [1.4, 0.8, 1.8]);
    parts.add(mat('ore_iron'), G.ico0, [3.4, 1.2, -2.6], [0, 0, 0], [0.9, 0.5, 0.9]);
    parts.add(mat('woodLight'), G.cyl6, [5.2, 0.8, 0.5], [0, 0, 1.0], [0.08, 1.8, 0.08]);
    parts.add(mat('iron'), G.box, [5.6, 1.5, 0.5], [0, 0, 1.0], [0.9, 0.12, 0.12]);
    lantern(parts, glows, -4, 2.4, -1);
    rockPile(parts, rng, -6, -3, 5, 2, 1.2);
    return { hitR: 9, hitH: 6, labelY: 7 };
  },

  workshop(ctx) {
    const { parts, glows } = ctx;
    const top = house(parts, {
      w: 9,
      d: 6.5,
      h: 3.8,
      wall: 'wallWarm',
      roof: 'roofTeal',
      roofH: 2.8,
      door: false,
      windows: [
        [-3, 3.25],
        [4.5, 0, true],
      ],
    });
    // 大门
    parts.add(mat('woodDark'), G.box, [1.6, 2.0, 3.32], [0, 0, 0], [2.8, 2.8, 0.15]);
    parts.add(mat('roofTealDark'), G.box, [1.6, 3.7, 3.9], [-0.3, 0, 0], [3.6, 0.15, 1.4]);
    // 铁砧、炉
    parts.add(mat('iron'), G.box, [-2.5, 0.9, 5.4], [0, 0, 0], [1.2, 0.4, 0.6]);
    parts.add(mat('stoneDark'), G.box, [-2.5, 0.45, 5.4], [0, 0, 0], [0.7, 0.9, 0.5]);
    parts.add(mat('stoneDark'), G.box, [-4.6, 0.9, 5.2], [0, 0, 0], [1.4, 1.8, 1.4]);
    lantern(parts, glows, -4.6, 2.2, 5.2, GLOW_GROUP.lamps, 2.0);
    // 补网架
    [5.5, 9.5].forEach((x) => parts.add(mat('woodDark'), G.box, [x, 1.4, 5], [0, 0, 0], [0.16, 2.8, 0.16]));
    const netMat = new THREE.MeshLambertMaterial({ color: '#9c8a6a', transparent: true, opacity: 0.75, side: THREE.DoubleSide });
    netMat.name = 'net';
    registerSurface(netMat);
    parts.add(netMat, G.plane, [7.5, 1.7, 5], [0, 0, 0], [4, 2, 1]);
    barrel(parts, -5.2, 2.5);
    barrel(parts, -5.6, 1.2);
    crate(parts, 5.5, 2.2, 0.9);
    crate(parts, 6.2, 1.1, 0.7, 0, 0.4);
    return { hitR: 9, hitH: top + 1, labelY: top + 2 };
  },

  plaza(ctx) {
    const { parts, glows, group } = ctx;
    const R = 18.5;
    parts.add(mat('cobble'), new THREE.CylinderGeometry(R, R + 0.4, 1.2, 48), [0, -0.45, 0]);
    // 环纹与罗盘
    const ring = (r0, r1, key, y) => {
      const g = new THREE.RingGeometry(r0, r1, 48);
      g.rotateX(-Math.PI / 2);
      parts.add(mat(key), g, [0, y, 0]);
    };
    ring(R - 1.6, R - 0.9, 'stone', 0.17);
    ring(10.5, 11.2, 'stone', 0.17);
    ring(6.8, 7.3, 'brass', 0.18);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      const long = i % 2 === 0;
      const shape = new THREE.Shape();
      const L = long ? 9.8 : 6.2;
      const Wd = long ? 1.5 : 1.0;
      shape.moveTo(0, 0);
      shape.lineTo(Wd, Wd * 0.2);
      shape.lineTo(0, L);
      shape.lineTo(-Wd, Wd * 0.2);
      shape.lineTo(0, 0);
      const g = new THREE.ShapeGeometry(shape);
      g.rotateX(-Math.PI / 2);
      g.rotateY(-a);
      parts.add(mat(long ? 'teal' : 'cream'), g, [0, long ? 0.2 : 0.19, 0]);
    }
    // 中央碑台
    parts.add(mat('stone'), G.cyl8, [0, 0.5, 0], [0, 0, 0], [5.2, 1.0, 5.2]);
    parts.add(mat('stone'), G.cyl8, [0, 1.2, 0], [0, 0, 0], [3.6, 0.6, 3.6]);
    parts.add(mat('stoneDark'), G.cyl6, [0, 3.0, 0], [0, 0, 0], [1.1, 3.4, 1.1]);
    parts.add(mat('roofTeal'), G.cone6, [0, 5.3, 0], [0, 0, 0], [2.4, 1.4, 2.4]);
    parts.add(mat('brass'), G.ico0, [0, 6.4, 0], [0, 0, 0], [0.8, 1.2, 0.8]);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      parts.add(seasonal.flower, G.ico0, [Math.cos(a) * 2.2, 1.7, Math.sin(a) * 2.2], [0, a, 0], [0.8, 0.6, 0.8]);
    }
    // 路灯一圈
    const lampAngles = [0.4, 1.2, 2.0, 2.75, 3.55, 4.35, 5.15, 5.85];
    lampAngles.forEach((a) => lampPost(parts, glows, Math.cos(a) * (R - 2.6), Math.sin(a) * (R - 2.6)));
    // 彩旗串：挂在路灯之间
    const buntingMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, flatShading: true });
    buntingMat.name = 'bunting';
    inject(buntingMat, { snow: false, sway: 0.05 });
    registerSurface(buntingMat);
    const flagGeos = [];
    const flagColors = ['#e8775c', '#efc94c', '#5fb0a8', '#f3efe6', '#8a6bb5'].map((c) => new THREE.Color(c));
    for (let i = 0; i < lampAngles.length; i++) {
      const a0 = lampAngles[i];
      const a1 = lampAngles[(i + 1) % lampAngles.length];
      const p0 = new THREE.Vector3(Math.cos(a0) * (R - 2.6), 3.5, Math.sin(a0) * (R - 2.6));
      const p1 = new THREE.Vector3(Math.cos(a1) * (R - 2.6), 3.5, Math.sin(a1) * (R - 2.6));
      const n = 7;
      for (let k = 1; k < n; k++) {
        const t = k / n;
        const p = p0.clone().lerp(p1, t);
        p.y -= Math.sin(t * Math.PI) * 0.8;
        const tri = new THREE.BufferGeometry();
        const dir = p1.clone().sub(p0).normalize().multiplyScalar(0.28);
        const v = new Float32Array([
          p.x - dir.x, p.y, p.z - dir.z,
          p.x + dir.x, p.y, p.z + dir.z,
          p.x, p.y - 0.65, p.z,
        ]);
        tri.setAttribute('position', new THREE.BufferAttribute(v, 3));
        const col = flagColors[(i + k) % flagColors.length];
        tri.setAttribute('color', new THREE.BufferAttribute(new Float32Array([col.r, col.g, col.b, col.r, col.g, col.b, col.r, col.g, col.b]), 3));
        tri.computeVertexNormals();
        flagGeos.push(tri);
      }
    }
    // 彩旗需要颜色属性，单独合并
    const merged = mergeWithColor(flagGeos);
    const bunting = new THREE.Mesh(merged, buntingMat);
    bunting.name = 'bunting';
    group.add(bunting);

    // 潮汐公告板（北侧）：画布贴图，状态一变就重画
    const boardTex = textTexture(['潮汐公告', '—', '—'], { w: 320, h: 200, bg: '#3d2f24', fg: '#f6e7c4', font: 44 });
    if (boardTex) {
      signBoard(parts, boardTex, 0, 2.4, -R + 2.2, 4.4, 2.75, 0);
      [-2.2, 2.2].forEach((x) => parts.add(mat('woodDark'), G.box, [x, 1.6, -R + 2.1], [0, 0, 0], [0.22, 3.2, 0.22]));
      parts.add(mat('roofTealDark'), G.box, [0, 4.05, -R + 2.1], [0.25, 0, 0], [5.2, 0.15, 1.2]);
      ctx.signs.notice = boardTex;
    }
    // 杂货铺（西北）
    const shop = new Parts('plaza-shop');
    house(shop, { w: 5, d: 4, h: 3, wall: 'wallBlue', roof: 'roofTealDark', roofH: 2, windows: [[-1.5, 2]] });
    shop.add(stripeMat('#3d6fb0', '#f3efe6'), G.box, [0, 2.9, 2.6], [-0.35, 0, 0], [5.2, 0.12, 1.6]);
    crate(shop, 1.6, 3.2, 0.7);
    crate(shop, 2.2, 3.4, 0.6, 0, 0.5);
    placeSub(group, shop, -12.5, -16.5, 0.7);
    // 乔乔诊所（东北）
    const clinic = new Parts('plaza-clinic');
    house(clinic, { w: 5.5, d: 4.2, h: 3.2, wall: 'white', roof: 'roofRed', roofH: 2, roofKind: 'hip', windows: [[-1.6, 2.1], [1.6, 2.1]] });
    clinic.add(mat('red'), G.box, [0, 3.3, 2.2], [0, 0, 0], [0.9, 0.28, 0.08]);
    clinic.add(mat('red'), G.box, [0, 3.3, 2.2], [0, 0, 0], [0.28, 0.9, 0.08]);
    placeSub(group, clinic, 12.5, -16.5, -0.7);
    // 栗栗流动摊（东南）：小推车 + 伞
    const cart = new Parts('plaza-cart');
    cart.add(mat('woodLight'), G.box, [0, 1.1, 0], [0, 0, 0], [2.4, 0.9, 1.4]);
    [-0.9, 0.9].forEach((x) => cart.add(mat('woodDark'), G.cyl12, [x, 0.5, 0.8], [Math.PI / 2, 0, 0], [0.9, 0.12, 0.9]));
    cart.add(mat('woodDark'), G.cyl6, [0, 2.2, 0], [0, 0, 0], [0.1, 2.4, 0.1]);
    cart.add(stripeMat('#e6873a', '#f3efe6'), G.cone8, [0, 3.4, 0], [0, 0, 0], [3.4, 0.9, 3.4]);
    cart.add(mat('orange'), G.sphere, [-0.5, 1.7, 0], [0, 0, 0], [0.35, 0.35, 0.35]);
    cart.add(mat('yellow'), G.sphere, [0.2, 1.7, 0.2], [0, 0, 0], [0.35, 0.35, 0.35]);
    placeSub(group, cart, 11, 12.5, 2.4);
    // 长椅
    [[-8, 9, 0.9], [8, -9, 0.9 + Math.PI], [-9, -6, -0.6]].forEach(([x, z, r]) => bench(parts, x, z, r));
    return { hitR: 19, hitH: 6, labelY: 9 };
  },

  bar(ctx) {
    const { parts, glows } = ctx;
    const top = house(parts, {
      w: 10,
      d: 7,
      h: 3.8,
      wall: 'wood',
      roof: 'roofSlate',
      roofH: 3.2,
      baseMat: 'stoneDark',
      windows: [
        [-3.2, 3.5],
        [3.2, 3.5],
        [5, -1, true],
        [-5, 1, true],
      ],
    });
    // 露台
    parts.add(mat('plank'), G.box, [0, 0.75, 6], [0, 0, 0], [10.6, 0.3, 4.6]);
    fence(parts, [[-5.2, 8.2], [-1.5, 8.2]], 0.8, 'woodDark');
    fence(parts, [[1.5, 8.2], [5.2, 8.2]], 0.8, 'woodDark');
    const deck = new Parts('bar-deck');
    tableSet(deck, -3, 6, true, 3);
    tableSet(deck, 3, 6.2, true, 3);
    placeSub(ctx.group, deck, 0, 0, 0).position.y = 0.9;
    // 招牌
    const tex = textTexture('酒吧', { w: 256, h: 112, bg: '#2c2420', fg: '#ffd27a', font: 64 });
    if (tex) signBoard(parts, tex, 0, 4.0, 3.62, 2.8, 1.2, 0);
    // 门牌：营业 / 打烊
    const doorTex = textTexture('打烊', { w: 128, h: 64, bg: '#f2e2bf', fg: '#5e4330', font: 34, border: '#5e4330' });
    if (doorTex) {
      signBoard(parts, doorTex, 0, 2.3, 3.72, 0.8, 0.4, 0);
      ctx.signs.barDoor = doorTex;
    }
    // 串灯：露台上方
    for (let i = 0; i <= 10; i++) {
      const x = -5 + i;
      const y = 3.2 - Math.sin((i / 10) * Math.PI) * 0.6;
      parts.add(glow.lamp, G.sphere, [x, y, 8.2], [0, 0, 0], [0.2, 0.25, 0.2]);
      glows.push({ local: [x, y, 8.2], color: '#ffb35c', size: 1.3, group: GLOW_GROUP.lamps });
    }
    [-5.2, 5.2].forEach((x) => parts.add(mat('woodDark'), G.box, [x, 1.9, 8.2], [0, 0, 0], [0.18, 2.6, 0.18]));
    barrel(parts, -6.2, 3);
    barrel(parts, -6.4, 4.3);
    return { hitR: 10, hitH: top + 1, labelY: top + 2 };
  },

  theater(ctx) {
    const { parts, group, glows, dyn } = ctx;
    const top = house(parts, {
      w: 11,
      d: 8,
      h: 4.6,
      wall: 'cream',
      roof: 'roofRed',
      roofKind: 'hip',
      roofH: 3.4,
      door: false,
      windows: [
        [-4, 4],
        [4, 4],
        [5.5, 0, true],
        [-5.5, 0, true],
      ],
    });
    // 拱门入口
    parts.add(mat('woodDark'), G.box, [0, 1.9, 4.06], [0, 0, 0], [2.6, 2.8, 0.12]);
    parts.add(mat('white'), archGeometry(3.2, 0.25, 10), [0, 3.1, 4.15]);
    [-1.6, 1.6].forEach((x) => parts.add(mat('white'), G.box, [x, 1.9, 4.15], [0, 0, 0], [0.5, 2.6, 0.5]));
    // 门头三角楣 + 星
    const ped = new THREE.Shape();
    ped.moveTo(-3.2, 0);
    ped.lineTo(3.2, 0);
    ped.lineTo(0, 1.8);
    ped.lineTo(-3.2, 0);
    parts.add(mat('plaster'), new THREE.ExtrudeGeometry(ped, { depth: 0.5, bevelEnabled: false }), [0, 5.3, 3.9]);
    const star = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 0.55 : 1.3;
      const a = (i / 10) * TAU + Math.PI / 2;
      if (i === 0) star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    star.closePath();
    const starGeo = new THREE.ExtrudeGeometry(star, { depth: 0.35, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 1 });
    const starMesh = new THREE.Mesh(starGeo, glow.star);
    starMesh.position.set(0, 8.1, 4.3);
    group.add(starMesh);
    glows.push({ local: [0, 8.1, 4.8], color: '#ffd25a', size: 6, group: GLOW_GROUP.star });
    dyn.push((env, time) => {
      starMesh.rotation.y = Math.sin(time * 0.6) * 0.25;
    });
    // 台阶
    for (let i = 0; i < 3; i++) parts.add(mat('stone'), G.box, [0, 0.2 + i * 0.22, 5.4 - i * 0.5], [0, 0, 0], [5 - i * 0.4, 0.3, 1.2]);
    // 两侧旗杆
    flagPole(group, parts, -6.2, 5.5, 6, '#e6873a', dyn);
    flagPole(group, parts, 6.2, 5.5, 6, '#5fb0a8', dyn);
    lampPost(parts, glows, -3.4, 6.4, 2.8);
    lampPost(parts, glows, 3.4, 6.4, 2.8);
    return { hitR: 10, hitH: top + 2, labelY: top + 4 };
  },

  market(ctx) {
    const { parts, glows, rng } = ctx;
    const stalls = [
      { x: -5, z: -3, rot: 0.3, a: '#3d6fb0' },
      { x: 1, z: -5, rot: -0.1, a: '#e6873a' },
      { x: 6, z: -1, rot: -0.5, a: '#3d6fb0' },
      { x: -2, z: 3, rot: 0.1, a: '#c9473f' },
    ];
    stalls.forEach((s) => {
      const p = new Parts('stall');
      p.add(mat('woodLight'), G.box, [0, 0.9, 0], [0, 0, 0], [3.4, 0.2, 1.6]);
      p.add(mat('wood'), G.box, [0, 0.45, 0], [0, 0, 0], [3.2, 0.9, 1.4]);
      [[-1.6, -0.8], [1.6, -0.8], [-1.6, 0.8], [1.6, 0.8]].forEach(([x, z]) => p.add(mat('woodDark'), G.box, [x, 1.4, z], [0, 0, 0], [0.12, 2.8 + (z < 0 ? 0.4 : 0), 0.12]));
      p.add(stripeMat(s.a, '#f3efe6'), G.box, [0, 3.0, 0], [0.22, 0, 0], [3.8, 0.12, 2.4]);
      for (let k = 0; k < 4; k++) {
        const cols = ['orange', 'red', 'yellow', 'green', 'purple'];
        p.add(mat('woodLight'), G.box, [-1.1 + k * 0.75, 1.15, 0.1], [0, 0, 0], [0.6, 0.3, 0.6]);
        p.add(mat(cols[Math.floor(rng() * cols.length)]), G.ico0, [-1.1 + k * 0.75, 1.42, 0.1], [0, 0, 0], [0.5, 0.35, 0.5]);
      }
      placeSub(ctx.group, p, s.x, s.z, s.rot);
    });
    for (let i = 0; i < 6; i++) crate(parts, -7 + rng() * 14, -7 + rng() * 3, 0.6 + rng() * 0.3, 0, rng() * 2);
    // 小灯笼串
    for (let i = 0; i < 6; i++) lantern(parts, glows, -6 + i * 2.4, 3.3, 0.5 + Math.sin(i) * 0.6, GLOW_GROUP.lamps, 1.8);
    // 默语花房
    const hx = -4;
    const hz = 8.5;
    parts.add(mat('stone'), G.box, [hx, 0.2, hz], [0, 0, 0], [5.4, 0.5, 4.4]);
    const glassMat = new THREE.MeshLambertMaterial({ color: '#d9f2ee', transparent: true, opacity: 0.35, flatShading: true, depthWrite: false });
    glassMat.name = 'glass-florist';
    registerSurface(glassMat);
    parts.add(glassMat, G.box, [hx, 1.7, hz], [0, 0, 0], [5, 2.6, 4]);
    parts.add(glassMat, hipGeometry(5, 4, 1.8, 0.1), [hx, 3.0, hz]);
    [[-2.5, -2], [2.5, -2], [-2.5, 2], [2.5, 2]].forEach(([x, z]) => parts.add(mat('white'), G.box, [hx + x, 1.7, hz + z], [0, 0, 0], [0.12, 2.6, 0.12]));
    for (let i = 0; i < 9; i++) {
      const cols = ['pink', 'purple', 'yellow', 'white', 'red'];
      parts.add(mat('green'), G.ico0, [hx - 1.6 + (i % 3) * 1.6, 0.8, hz - 1.2 + Math.floor(i / 3) * 1.2], [0, 0, 0], [0.8, 0.6, 0.8]);
      parts.add(mat(cols[i % cols.length]), G.ico0, [hx - 1.6 + (i % 3) * 1.6, 1.2, hz - 1.2 + Math.floor(i / 3) * 1.2], [0, i, 0], [0.45, 0.35, 0.45]);
    }
    return { hitR: 11, hitH: 5, labelY: 7 };
  },

  eatery(ctx) {
    const { parts, glows } = ctx;
    const top = house(parts, {
      w: 8,
      d: 6,
      h: 3.4,
      wall: 'wallWarm',
      roof: 'roofTeal',
      roofH: 2.6,
      windows: [
        [-2.6, 3],
        [2.6, 3],
        [4, 0, true],
      ],
    });
    parts.add(mat('plank'), G.box, [0, 0.72, 5.4], [0, 0, 0], [9, 0.25, 4]);
    const deck = new Parts('eatery-deck');
    tableSet(deck, -2.6, 5.4, true, 2);
    tableSet(deck, 2.6, 5.6, true, 2);
    [-2.6, 2.6].forEach((x) => {
      deck.add(mat('woodDark'), G.cyl6, [x, 1.9, x < 0 ? 5.4 : 5.6], [0, 0, 0], [0.08, 2.4, 0.08]);
      deck.add(stripeMat(x < 0 ? '#5fb0a8' : '#e8775c', '#f3efe6'), G.cone8, [x, 3.1, x < 0 ? 5.4 : 5.6], [0, 0, 0], [2.6, 0.7, 2.6]);
    });
    placeSub(ctx.group, deck, 0, 0, 0).position.y = 0.85;
    const tex = textTexture('小馆', { w: 192, h: 96, bg: '#f2e2bf', fg: '#5e4330', font: 54, border: '#3f8f8c' });
    if (tex) signBoard(parts, tex, 0, 3.6, 3.12, 2.0, 1.0, 0);
    for (let i = 0; i < 4; i++) lantern(parts, glows, -3.6 + i * 2.4, 3.3, 7.2, GLOW_GROUP.lamps, 1.9);
    [-4.3, 4.3].forEach((x) => parts.add(mat('woodDark'), G.box, [x, 1.9, 7.3], [0, 0, 0], [0.16, 2.6, 0.16]));
    return { hitR: 8, hitH: top + 1, labelY: top + 2 };
  },

  ting(ctx) {
    const { parts, group, glows, rng } = ctx;
    const R = 3.3;
    parts.add(mat('stone'), G.cyl6, [0, 0.3, 0], [0, Math.PI / 6, 0], [R * 2.3, 0.8, R * 2.3]);
    parts.add(mat('plank'), G.cyl6, [0, 0.75, 0], [0, Math.PI / 6, 0], [R * 2.15, 0.1, R * 2.15]);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      parts.add(mat('roofRed'), G.cyl6, [Math.cos(a) * R, 2.4, Math.sin(a) * R], [0, 0, 0], [0.32, 3.3, 0.32]);
      if (i !== 1) {
        const a2 = ((i + 1) / 6) * TAU;
        const mx = (Math.cos(a) + Math.cos(a2)) * R * 0.5;
        const mz = (Math.sin(a) + Math.sin(a2)) * R * 0.5;
        parts.add(mat('woodDark'), G.box, [mx, 1.35, mz], [0, -(a + a2) / 2, 0], [0.12, 0.12, R]);
        parts.add(mat('woodDark'), G.box, [mx, 1.0, mz], [0, -(a + a2) / 2, 0], [0.4, 0.08, R]);
      }
    }
    parts.add(mat('roofTeal'), G.cone6, [0, 5.0, 0], [0, Math.PI / 6, 0], [R * 2.9, 2.2, R * 2.9]);
    parts.add(mat('roofTealDark'), G.cyl6, [0, 3.95, 0], [0, Math.PI / 6, 0], [R * 2.9, 0.15, R * 2.9]);
    parts.add(mat('brass'), G.ico0, [0, 6.4, 0], [0, 0, 0], [0.5, 0.8, 0.5]);
    lantern(parts, glows, 0, 3.4, 0, GLOW_GROUP.lamps, 2.6);
    // 木牌墙：框架 + 一片会在风里晃的小木牌
    const wx = 6.5;
    parts.add(mat('woodDark'), G.box, [wx, 1.6, -2.2], [0, 0, 0], [0.22, 3.2, 0.22]);
    parts.add(mat('woodDark'), G.box, [wx, 1.6, 2.2], [0, 0, 0], [0.22, 3.2, 0.22]);
    parts.add(mat('woodDark'), G.box, [wx, 3.1, 0], [0, 0, 0], [0.3, 0.22, 4.9]);
    parts.add(mat('roofTealDark'), G.box, [wx, 3.35, 0], [0, 0, 0.25], [1.1, 0.12, 5.3]);
    [1.0, 1.8, 2.6].forEach((y) => parts.add(mat('woodDark'), G.box, [wx, y, 0], [0, 0, 0], [0.06, 0.06, 4.4]));
    const tagMat = new THREE.MeshLambertMaterial({ color: '#d8b37a', flatShading: true });
    tagMat.name = 'tags';
    inject(tagMat, { snow: false, sway: 0.18 });
    registerSurface(tagMat);
    const tagGeo = new THREE.BoxGeometry(0.06, 0.5, 0.34);
    tagGeo.translate(0, -0.25, 0);
    const tags = new THREE.InstancedMesh(tagGeo, tagMat, 33);
    const m4 = new THREE.Matrix4();
    let n = 0;
    [1.0, 1.8, 2.6].forEach((y) => {
      for (let k = 0; k < 11; k++) {
        const z = -2.0 + k * 0.4 + (rng() - 0.5) * 0.08;
        m4.makeRotationX((rng() - 0.5) * 0.25);
        m4.setPosition(wx + 0.08, y - 0.03, z);
        tags.setMatrixAt(n, m4);
        const shade = 0.75 + rng() * 0.35;
        tags.setColorAt(n, new THREE.Color(shade, shade * 0.92, shade * 0.8));
        n++;
      }
    });
    tags.castShadow = true;
    group.add(tags);
    return { hitR: 7, hitH: 7, labelY: 8.5 };
  },

  hui(ctx) {
    const { parts, group, glows, dyn } = ctx;
    const top = house(parts, {
      w: 12,
      d: 8,
      h: 4.6,
      wall: 'wallBlue',
      roof: 'roofSlate',
      roofKind: 'hip',
      roofH: 3.4,
      windows: [
        [-3.8, 4],
        [3.8, 4],
        [6, -1.5, true],
        [6, 1.5, true],
        [-6, -1.5, true],
        [-6, 1.5, true],
      ],
    });
    // 门廊柱
    parts.add(mat('stone'), G.box, [0, 0.7, 5.3], [0, 0, 0], [7.5, 0.4, 2.6]);
    [-3.2, -1.1, 1.1, 3.2].forEach((x) => parts.add(mat('white'), G.cyl8, [x, 2.9, 6.1], [0, 0, 0], [0.45, 4.2, 0.45]));
    parts.add(mat('white'), G.box, [0, 5.1, 5.6], [0, 0, 0], [8, 0.4, 2.0]);
    const ped = new THREE.Shape();
    ped.moveTo(-4, 0);
    ped.lineTo(4, 0);
    ped.lineTo(0, 1.5);
    ped.lineTo(-4, 0);
    parts.add(mat('roofSlate'), new THREE.ExtrudeGeometry(ped, { depth: 2.0, bevelEnabled: false }), [0, 5.3, 4.6]);
    for (let i = 0; i < 3; i++) parts.add(mat('stone'), G.box, [0, 0.2 + i * 0.2, 7.2 + i * -0.45], [0, 0, 0], [4 - i * 0.4, 0.28, 1.0]);
    // 告示板
    const tex = textTexture(['告示', '岸税 · 基金'], { w: 192, h: 128, bg: '#f2e2bf', fg: '#3d2f24', font: 42, border: '#5e4330' });
    if (tex) signBoard(parts, tex, -5.5, 1.8, 6.5, 1.8, 1.2, 0.3);
    flagPole(group, parts, 6.8, 6.5, 8.5, '#3f8f8c', dyn);
    lampPost(parts, glows, -2.6, 8.4, 2.8);
    lampPost(parts, glows, 2.6, 8.4, 2.8);
    return { hitR: 10, hitH: top + 1, labelY: top + 3 };
  },

  lianli(ctx) {
    const { parts, group, glows, dyn, rng } = ctx;
    const N = 6;
    const span = 3.4;
    const flowerSpots = [];
    for (let i = 0; i < N; i++) {
      const z = -7 + i * 2.8;
      parts.add(mat('white'), archGeometry(span, 0.16, 12), [0, 3.0, z]);
      [-span / 2, span / 2].forEach((x) => parts.add(mat('white'), G.cyl6, [x, 1.5, z], [0, 0, 0], [0.3, 3.0, 0.3]));
      for (let k = 0; k < 9; k++) {
        const a = (k / 8) * Math.PI;
        flowerSpots.push([Math.cos(a) * span * 0.5 + (rng() - 0.5) * 0.4, 3.0 + Math.sin(a) * span * 0.5 + (rng() - 0.5) * 0.3, z + (rng() - 0.5) * 0.8]);
      }
      if (i < N - 1) {
        [-1.2, 0, 1.2].forEach((x) => parts.add(mat('woodLight'), G.box, [x, 3.0 + Math.sqrt(Math.max(0, (span * span) / 4 - x * x)) + 0.05, z + 1.4], [0, 0, 0], [0.12, 0.12, 2.8]));
        lantern(parts, glows, 0, 3.6, z + 1.4, GLOW_GROUP.lamps, 1.6);
      }
    }
    // 石板路
    for (let i = 0; i < 9; i++) parts.add(mat('stone'), G.cyl6, [(rng() - 0.5) * 0.6, 0.05, -7.5 + i * 1.8], [0, rng(), 0], [1.6, 0.18, 1.3]);
    // 尽头的长椅和小钟
    bench(parts, 0, 9.4, 0);
    parts.add(mat('woodDark'), G.box, [2.6, 1.6, 9.2], [0, 0, 0], [0.16, 3.2, 0.16]);
    parts.add(mat('brass'), G.cone8, [2.6, 2.7, 9.6], [0, 0, 0], [0.5, 0.6, 0.5]);
    // 花：实例化，季节决定多少
    const fGeo = new THREE.IcosahedronGeometry(0.5, 0);
    const flowers = new THREE.InstancedMesh(fGeo, seasonal.flower, flowerSpots.length);
    const leafy = new THREE.InstancedMesh(fGeo, seasonal.leaf, flowerSpots.length);
    const base = flowerSpots.map(() => 0.55 + rng() * 0.45);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3();
    const pv = new THREE.Vector3();
    let lastAmt = -1;
    const apply = (amt, leafAmt) => {
      flowerSpots.forEach((p, i) => {
        const s = base[i] * amt;
        q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, i);
        pv.set(p[0], p[1], p[2]);
        sc.set(s, s * 0.8, s);
        m4.compose(pv, q, sc.setScalar(Math.max(0.001, s)));
        flowers.setMatrixAt(i, m4);
        const ls = base[i] * 1.3 * leafAmt;
        pv.set(p[0] * 1.05, p[1] - 0.15, p[2] + 0.2);
        m4.compose(pv, q, sc.setScalar(Math.max(0.001, ls)));
        leafy.setMatrixAt(i, m4);
      });
      flowers.instanceMatrix.needsUpdate = true;
      leafy.instanceMatrix.needsUpdate = true;
    };
    group.add(leafy);
    group.add(flowers);
    flowers.castShadow = true;
    dyn.push((env) => {
      const amt = env.flowerAmount;
      if (Math.abs(amt - lastAmt) > 0.003) {
        lastAmt = amt;
        apply(amt, env.leafAmount);
      }
    });
    apply(1, 1);
    return { hitR: 9, hitH: 6, labelY: 7.5 };
  },

  entrance(ctx) {
    const { parts, glows, rng } = ctx;
    // 山洞口：石块拱 + 黑洞 + 木梯 + 灯笼。局部 +z 朝外（朝广场），洞往 -z 钻进山丘
    const arcR = 3.4;
    for (let i = 0; i <= 12; i++) {
      const a = (i / 12) * Math.PI;
      const s = 1.3 + rng() * 0.7;
      parts.add(mat('stone'), G.dodec, [Math.cos(a) * arcR, Math.sin(a) * arcR * 1.15 + 0.3, 0.3 + rng() * 0.4], [rng() * 3, rng() * 3, rng() * 3], [s, s, s * 1.2]);
    }
    // 山体背板
    for (let i = 0; i < 9; i++) {
      const a = rng() * Math.PI;
      const r = 4.5 + rng() * 3;
      const s = 2.4 + rng() * 2.2;
      parts.add(mat('stoneDark'), G.dodec, [Math.cos(a) * r, Math.sin(a) * r * 0.7, -1.5 - rng() * 2], [rng() * 3, rng() * 3, 0], [s, s, s]);
    }
    const dark = new THREE.MeshBasicMaterial({ color: '#0d0a08' });
    dark.name = 'caveDark';
    registerSurface(dark);
    // 洞口：半圆形的黑面，后面再接一段黑色的短隧道
    const mouth = new THREE.CircleGeometry(arcR * 0.92, 14, 0, Math.PI);
    parts.add(dark, mouth, [0, 0.3, 0.05]);
    parts.add(dark, G.box, [0, 1.4, -1.4], [0, 0, 0], [arcR * 1.75, 2.8, 2.8]);
    // 木梯往下
    const ladder = [-0.55, 0.55];
    ladder.forEach((x) => parts.add(mat('woodLight'), G.box, [x, 0.6, -1.4], [0.5, 0, 0], [0.12, 4.2, 0.12]));
    for (let i = 0; i < 6; i++) parts.add(mat('woodLight'), G.box, [0, -0.9 + i * 0.6, -0.4 - i * 0.33], [0, 0, 0], [1.2, 0.08, 0.1]);
    // 灯笼柱
    [-3.6, 3.6].forEach((x) => {
      parts.add(mat('woodDark'), G.box, [x, 1.3, 2.0], [0, 0, 0], [0.2, 2.6, 0.2]);
      parts.add(mat('woodDark'), G.box, [x * 0.92, 2.6, 2.0], [0, 0, 0], [0.8, 0.1, 0.1]);
      parts.add(glow.lampUnder, G.box, [x * 0.86, 2.2, 2.0], [0, 0, 0], [0.4, 0.5, 0.4]);
      glows.push({ local: [x * 0.86, 2.2, 2.0], color: '#ffbf66', size: 3.0, group: GLOW_GROUP.entrance });
    });
    glows.push({ local: [0, 0.6, -2.0], color: '#ffa94d', size: 6, group: GLOW_GROUP.entrance });
    // 藤蔓
    for (let i = 0; i < 8; i++) {
      const x = -2.8 + i * 0.8;
      const len = 0.8 + rng() * 1.6;
      parts.add(seasonal.leaf, G.box, [x, arcR * 1.1 - len / 2 + 0.6, 0.9], [0, 0, (rng() - 0.5) * 0.2], [0.16, len, 0.16]);
    }
    const tex = textTexture('井下', { w: 128, h: 64, bg: '#3d2f24', fg: '#ffd27a', font: 38 });
    if (tex) {
      signBoard(parts, tex, 4.6, 1.5, 3.2, 1.2, 0.6, -0.4);
      parts.add(mat('woodDark'), G.box, [4.6, 0.7, 3.12], [0, -0.4, 0], [0.14, 1.4, 0.14]);
    }
    rockPile(parts, rng, -5, 3, 4, 1.5, 1.1);
    return { hitR: 7, hitH: 7, labelY: 8.5 };
  },

  lighthouse(ctx) {
    const { parts, group, glows, dyn, rng } = ctx;
    // 塔身红白相间
    const H = 13;
    const seg = 5;
    for (let i = 0; i < seg; i++) {
      const r0 = 1.9 - (i / seg) * 0.6;
      const r1 = 1.9 - ((i + 1) / seg) * 0.6;
      const g = new THREE.CylinderGeometry(r1, r0, H / seg, 12);
      parts.add(mat(i % 2 ? 'red' : 'white'), g, [0, (i + 0.5) * (H / seg), 0]);
    }
    parts.add(mat('stone'), G.cyl12, [0, 0.2, 0], [0, 0, 0], [5, 1.2, 5]);
    parts.add(mat('iron'), G.cyl12, [0, H + 0.1, 0], [0, 0, 0], [3.6, 0.25, 3.6]);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      parts.add(mat('iron'), G.box, [Math.cos(a) * 1.7, H + 0.7, Math.sin(a) * 1.7], [0, 0, 0], [0.08, 1.0, 0.08]);
    }
    parts.add(mat('iron'), new THREE.TorusGeometry(1.7, 0.05, 4, 24), [0, H + 1.15, 0], [Math.PI / 2, 0, 0]);
    const lampMat = new THREE.MeshBasicMaterial({ color: '#fff2c4' });
    lampMat.name = 'lighthouseLamp';
    registerSurface(lampMat);
    parts.add(lampMat, G.cyl8, [0, H + 1.0, 0], [0, 0, 0], [1.9, 1.6, 1.9]);
    parts.add(mat('red'), G.cone8, [0, H + 2.4, 0], [0, 0, 0], [2.6, 1.4, 2.6]);
    parts.add(mat('brass'), G.sphere, [0, H + 3.2, 0], [0, 0, 0], [0.4, 0.4, 0.4]);
    parts.add(glow.window, G.box, [0, 5, 1.62], [0, 0, 0], [0.5, 0.8, 0.1]);
    parts.add(glow.window, G.box, [0, 9, 1.35], [0, 0, 0], [0.45, 0.7, 0.1]);
    // 守塔小屋
    const hutP = new Parts('lh-hut');
    house(hutP, { w: 3.2, d: 2.6, h: 2, wall: 'white', roof: 'roofRed', roofH: 1.2, base: 0.3, windows: [[0.8, 1.3]] });
    placeSub(group, hutP, 3.6, 1.8, -0.8);
    rockPile(parts, rng, 0, 0, 10, 5, 2.2, 'stoneDark');
    glows.push({ local: [0, H + 1.0, 0], color: '#fff1c0', size: 9, group: GLOW_GROUP.lighthouse });
    // 旋转光束：自定义着色器，从灯室往外逐渐变淡（加色混合不走雾，避免被雾染成一整块白）
    const beamMat = new THREE.ShaderMaterial({
      uniforms: { uI: { value: 0 }, uColor: { value: new THREE.Color('#fff1c4') } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform float uI; uniform vec3 uColor; varying vec2 vUv;
        void main(){
          float along = pow(1.0 - vUv.y, 1.8);
          float edge = sin(vUv.x * 3.14159 * 2.0) * 0.5 + 0.5;
          edge = 0.55 + 0.45 * edge;
          gl_FragColor = vec4(uColor * along * edge * uI, 1.0);
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    beamMat.name = 'beam';
    const beamGeo = new THREE.ConeGeometry(3.6, 44, 18, 1, true);
    beamGeo.translate(0, -22, 0);
    beamGeo.rotateZ(Math.PI / 2);
    const beams = new THREE.Group();
    beams.position.set(0, H + 1.0, 0);
    const b1 = new THREE.Mesh(beamGeo, beamMat);
    const b2 = new THREE.Mesh(beamGeo, beamMat);
    b2.rotation.y = Math.PI;
    b1.renderOrder = b2.renderOrder = 6;
    beams.add(b1, b2);
    group.add(beams);
    dyn.push((env, time, dt, fade) => {
      const I = clamp(Math.max(env.lamps * 0.85, env.misty * 0.75), 0, 1);
      beamMat.uniforms.uI.value = I * (0.07 + env.misty * 0.08) * fade;
      beams.visible = beamMat.uniforms.uI.value > 0.002;
      beams.rotation.y += dt * 0.45;
      lampMat.color.setRGB(0.55 + I * 0.45, 0.5 + I * 0.45, 0.4 + I * 0.38);
    });
    return { hitR: 6, hitH: H + 4, labelY: H + 5.5 };
  },
};

// ---------- 辅助 ----------
const stripeCache = new Map();
function stripeMat(c1, c2) {
  const k = `${c1}|${c2}`;
  if (stripeCache.has(k)) return stripeCache.get(k);
  const t = stripeTexture(c1, c2);
  const m = t ? texturedMat(`stripe-${k}`, t) : mat('canvasA');
  stripeCache.set(k, m);
  return m;
}

function placeSub(group, parts, x, z, rot) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = rot;
  parts.build(g);
  group.add(g);
  return g;
}

function mergeWithColor(list) {
  let count = 0;
  list.forEach((g) => {
    count += g.attributes.position.count;
  });
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  let off = 0;
  list.forEach((g) => {
    pos.set(g.attributes.position.array, off * 3);
    nor.set(g.attributes.normal.array, off * 3);
    col.set(g.attributes.color.array, off * 3);
    off += g.attributes.position.count;
    g.dispose();
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}

// 炊烟：几团会上升、变大、变淡的小球
function makeSmoke(group, at) {
  const m = new THREE.MeshLambertMaterial({ color: '#e8e6e2', transparent: true, opacity: 0.0, depthWrite: false, flatShading: true });
  m.name = 'smoke';
  registerSurface(m);
  m.userData.baseOpacity = 1;
  const puffs = [];
  for (let i = 0; i < 6; i++) {
    const p = new THREE.Mesh(G.ico0, m);
    p.userData.t = i / 6;
    group.add(p);
    puffs.push(p);
  }
  return (amount, env, time, dt) => {
    m.opacity = clamp(amount, 0, 1) * 0.55;
    const vis = m.opacity > 0.01;
    puffs.forEach((p) => {
      p.visible = vis;
      if (!vis) return;
      p.userData.t = (p.userData.t + dt * 0.12) % 1;
      const t = p.userData.t;
      const s = 0.6 + t * 2.0;
      p.scale.setScalar(s);
      p.position.set(at[0] + t * (1.5 + env.wind * 6), at[1] + t * 6, at[2] + t * (0.6 + env.wind * 3));
    });
  };
}

// ---------- 对外 ----------
/**
 * 生成全部地上地点。
 * layout: { [id]: { x, y, z, rotY } }
 * 返回 { group, places: [{ id, group, hit, labelPos }], glows, update(env, time, dt, fade), refreshSigns(info) }
 */
export function buildSurfacePlaces(placeDefs, layout, glowField) {
  const root = new THREE.Group();
  root.name = 'surface-places';
  const placed = [];
  const dyn = [];
  const signs = {};
  const rng = mulberry32(5150);

  placeDefs.forEach((def) => {
    const L = layout[def.id];
    const builder = BUILDERS[def.id];
    if (!L || !builder) {
      log.warn('buildings.build', '缺少布局或构建函数，跳过此地点', { id: def.id, hasLayout: !!L, hasBuilder: !!builder });
      return;
    }
    try {
      const group = new THREE.Group();
      group.name = `place:${def.id}`;
      group.position.set(L.x, L.y, L.z);
      group.rotation.y = L.rotY;
      const parts = new Parts(def.id);
      const glows = [];
      const ctx = { parts, group, glows, dyn: [], rng, place: def, signs };
      const meta = builder(ctx);
      parts.build(group);
      root.add(group);
      group.updateMatrixWorld(true);
      glows.forEach((gl) => {
        const v = new THREE.Vector3(gl.local[0], gl.local[1], gl.local[2]).applyMatrix4(group.matrixWorld);
        glowField.add(v, gl.color, gl.size, gl.group);
      });
      ctx.dyn.forEach((fn) => dyn.push({ id: def.id, fn }));
      const hitGeo = new THREE.CylinderGeometry(meta.hitR, meta.hitR, meta.hitH, 10);
      hitGeo.translate(0, meta.hitH / 2 - 1, 0);
      const hit = new THREE.Mesh(hitGeo, new THREE.MeshBasicMaterial({ visible: false }));
      hit.name = `hit:${def.id}`;
      hit.userData.placeId = def.id;
      if (meta.hitOffset) hit.position.set(meta.hitOffset[0], meta.hitOffset[1], meta.hitOffset[2]);
      group.add(hit);
      const labelPos = new THREE.Vector3(0, meta.labelY, 0);
      if (meta.hitOffset) labelPos.set(meta.hitOffset[0], meta.labelY, meta.hitOffset[2]);
      labelPos.applyMatrix4(group.matrixWorld);
      placed.push({ id: def.id, def, group, hit, labelPos, focus: labelPos.clone().setY(L.y + 2) });
    } catch (e) {
      log.error('buildings.build', e, { id: def.id, layout: L });
    }
  });

  function update(env, time, dt, fade) {
    for (let i = 0; i < dyn.length; i++) {
      try {
        dyn[i].fn(env, time, dt, fade);
      } catch (e) {
        log.errorThrottled(`buildings.update.${dyn[i].id}`, e);
      }
    }
  }

  function refreshSigns(info) {
    try {
      if (signs.notice) {
        const o = signs.notice.userData.opts;
        const ctx2 = signs.notice.userData.canvas.getContext('2d');
        drawTextCanvas(
          ctx2,
          ['潮汐公告', `${LABELS.season[info.season]} · ${LABELS.phase[info.phase]}`, `${LABELS.tide[info.tide]} · ${LABELS.weather[info.weather]}`],
          Object.assign({}, o, { font: 46 })
        );
        signs.notice.needsUpdate = true;
      }
      if (signs.barDoor) {
        const o = signs.barDoor.userData.opts;
        const ctx2 = signs.barDoor.userData.canvas.getContext('2d');
        drawTextCanvas(ctx2, info.phase === 0 ? '打烊' : '营业', o);
        signs.barDoor.needsUpdate = true;
      }
    } catch (e) {
      log.error('buildings.refreshSigns', e, { info: info && [info.phase, info.tide, info.weather, info.season] });
    }
  }

  return { group: root, places: placed, update, refreshSigns };
}

/** 盐风崖的矿脉：贴着崖壁找点。返回 { group, update } */
export function buildOreVeins(thetaCenter) {
  const group = new THREE.Group();
  group.name = 'ore-veins';
  const rng = mulberry32(808);
  const kinds = [
    { key: 'ore_iron', list: [] },
    { key: 'ore_copper', list: [] },
    { key: 'ore_salt', list: [] },
    { key: 'ore_rare', list: [] },
  ];
  try {
    for (let i = 0; i < 70; i++) {
      const th = thetaCenter + (rng() - 0.5) * 0.55;
      const dx = Math.cos(th);
      const dz = Math.sin(th);
      // 找崖顶高度
      let topR = 40;
      let topH = 0;
      for (let r = 40; r < 125; r += 0.6) {
        const h = heightAt(dx * r, dz * r);
        if (h > topH) {
          topH = h;
          topR = r;
        }
        if (coastCoords(dx * r, dz * r).s < -0.06) break;
      }
      if (topH < 5) continue;
      const y = 1.6 + rng() * (topH - 3.2);
      // 从崖顶往外找高度跌破 y 的位置：那就是崖壁
      let rr = topR;
      for (; rr < topR + 30; rr += 0.15) {
        if (heightAt(dx * rr, dz * rr) < y) break;
      }
      const x = dx * (rr - 0.25);
      const z = dz * (rr - 0.25);
      const k = rng() < 0.07 ? 3 : Math.floor(rng() * 3);
      kinds[k].list.push({ x, y, z, th, s: 0.5 + rng() * 0.7, r: rng() });
    }
    const geo = new THREE.OctahedronGeometry(0.5, 0);
    geo.scale(0.7, 1.6, 0.7);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    kinds.forEach((kd) => {
      if (!kd.list.length) return;
      const material = mat(kd.key, { flat: true });
      const inst = new THREE.InstancedMesh(geo, material, kd.list.length * 3);
      let n = 0;
      kd.list.forEach((p) => {
        for (let c = 0; c < 3; c++) {
          e.set((p.r - 0.5) * 1.2 + c * 0.5, p.th, Math.PI / 2 - 0.6 + c * 0.45);
          q.setFromEuler(e);
          const s = p.s * (1 - c * 0.22);
          m4.compose(new THREE.Vector3(p.x + (c - 1) * 0.3 * -Math.sin(p.th), p.y + (c - 1) * 0.25, p.z + (c - 1) * 0.3 * Math.cos(p.th)), q, new THREE.Vector3(s, s, s));
          inst.setMatrixAt(n++, m4);
        }
      });
      inst.count = n;
      inst.name = kd.key;
      group.add(inst);
      kd.material = material;
    });
  } catch (e) {
    log.error('buildings.buildOreVeins', e, { thetaCenter });
  }
  const update = (env, time) => {
    try {
      const pulse = 0.75 + Math.sin(time * 1.6) * 0.25;
      const set = (i, v) => {
        if (kinds[i].material) kinds[i].material.emissiveIntensity = v;
      };
      set(0, 0.05 + env.ebb * 0.85 * pulse);
      set(1, 0.05 + env.slack * 0.75 * pulse);
      set(2, 0.05 + env.flood * 0.7 * pulse);
      set(3, 0.1 + env.misty * 1.3 * (0.6 + Math.sin(time * 3.1) * 0.4));
    } catch (e) {
      log.errorThrottled('buildings.ore.update', e);
    }
  };
  return { group, update };
}

/** 岸工坊外的盐田：涨潮时灌水，其余时候慢慢晒出盐 */
export function buildSaltPans(center, rotY, baseY) {
  const group = new THREE.Group();
  group.name = 'salt-pans';
  group.position.set(center.x, baseY, center.z);
  group.rotation.y = rotY;
  const parts = new Parts('salt-pans');
  const cells = [];
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 3; c++) {
      const x = -4.6 + c * 4.6;
      const z = -2.2 + r * 4.4;
      cells.push([x, z]);
      parts.add(mat('stone'), G.box, [x, 0.15, z - 2.0], [0, 0, 0], [4.4, 0.5, 0.35]);
      parts.add(mat('stone'), G.box, [x, 0.15, z + 2.0], [0, 0, 0], [4.4, 0.5, 0.35]);
      parts.add(mat('stone'), G.box, [x - 2.1, 0.15, z], [0, 0, 0], [0.35, 0.5, 4.3]);
      parts.add(mat('stone'), G.box, [x + 2.1, 0.15, z], [0, 0, 0], [0.35, 0.5, 4.3]);
      parts.add(mat('soilDark'), G.box, [x, -0.15, z], [0, 0, 0], [4, 0.3, 3.8]);
    }
  }
  // 木闸
  parts.add(mat('woodDark'), G.box, [7.2, 0.4, 0], [0, 0, 0], [0.3, 1.0, 1.6]);
  parts.add(mat('rope'), G.cyl6, [6.6, 0.3, 4], [0, 0, Math.PI / 2], [0.5, 1.2, 0.5]);
  parts.build(group);
  const waterMat = new THREE.MeshLambertMaterial({ color: '#6fc6c8', transparent: true, opacity: 0.8 });
  waterMat.name = 'saltWater';
  registerSurface(waterMat);
  const saltMat = new THREE.MeshLambertMaterial({ color: '#f6f6f2', transparent: true, opacity: 0.0 });
  saltMat.name = 'saltCrust';
  registerSurface(saltMat);
  const planeList = [];
  const crustList = [];
  cells.forEach(([x, z]) => {
    const g = new THREE.PlaneGeometry(3.9, 3.7);
    g.rotateX(-Math.PI / 2);
    g.translate(x, 0, z);
    planeList.push(g);
    const c2 = new THREE.PlaneGeometry(3.6, 3.4, 3, 3);
    c2.rotateX(-Math.PI / 2);
    c2.translate(x, 0.02, z);
    crustList.push(c2);
  });
  const water = new THREE.Mesh(mergeGeoms(planeList), waterMat);
  const crust = new THREE.Mesh(mergeGeoms(crustList), saltMat);
  group.add(water, crust);
  let fill = 0;
  const update = (env, time, dt, fade) => {
    try {
      // 涨潮时快速灌满，其余时候缓慢蒸发
      const target = env.flood;
      fill += (target - fill) * Math.min(1, dt * (target > fill ? 0.5 : 0.04));
      water.position.y = -0.02 + fill * 0.3;
      waterMat.opacity = (0.2 + fill * 0.65) * fade;
      water.visible = fill > 0.02;
      saltMat.opacity = clamp(1 - fill * 1.6, 0, 1) * 0.9 * fade;
      crust.position.y = 0.0;
    } catch (e) {
      log.errorThrottled('buildings.saltPans.update', e);
    }
  };
  // 初始状态直接与当前潮汐一致
  update.prime = (env) => {
    fill = env.flood;
  };
  return { group, update };
}

function mergeGeoms(list) {
  let count = 0;
  list.forEach((g) => {
    count += (g.index ? g.index.count : g.attributes.position.count);
  });
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  let off = 0;
  list.forEach((g0) => {
    const g = g0.index ? g0.toNonIndexed() : g0;
    pos.set(g.attributes.position.array, off * 3);
    nor.set(g.attributes.normal.array, off * 3);
    off += g.attributes.position.count;
    if (g !== g0) g.dispose();
    g0.dispose();
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}

/** 阵风后冲上岸的漂流物（岸工坊能打捞）：只在阵风权重高时慢慢冒出来 */
export function buildSalvage(points) {
  const group = new THREE.Group();
  group.name = 'salvage';
  const rng = mulberry32(3131);
  const items = [];
  try {
    points.forEach((p, i) => {
      const parts = new Parts('salvage');
      if (i % 3 === 0) {
        parts.add(mat('woodLight'), G.box, [0, 0.35, 0], [0, rng() * 3, 0], [0.9, 0.7, 0.9]);
        parts.add(mat('rope'), G.box, [0, 0.72, 0], [0, rng() * 3, 0], [0.95, 0.06, 0.2]);
      } else if (i % 3 === 1) {
        parts.add(mat('wood'), G.cyl6, [0, 0.22, 0], [0, rng() * 3, Math.PI / 2], [0.4, 2.8 + rng() * 2, 0.4]);
      } else {
        barrel(parts, 0, 0);
      }
      const g = new THREE.Group();
      g.position.set(p.x, p.y, p.z);
      g.rotation.set(0, rng() * 6, (rng() - 0.5) * 0.3);
      parts.build(g);
      group.add(g);
      items.push(g);
    });
  } catch (e) {
    log.error('buildings.buildSalvage', e, { count: points.length });
  }
  const update = (env) => {
    const k = smoothstep(0.05, 0.9, env.gale);
    group.visible = k > 0.01;
    items.forEach((g, i) => g.scale.setScalar(Math.max(0.001, clamp(k * 1.4 - i * 0.06, 0, 1))));
  };
  return { group, update };
}
