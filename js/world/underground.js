// 井下：把岛剖开，地表变成半透明的壳，下面是一整层洞穴。
// 十处地点各自坐在一根岩柱顶上，按井下总览图从上（入口）到下（K 室）逐层下沉，
// 石阶和栈道把它们连起来；洞底是一池地下水，水位跟着外面的潮汐涨落。

import * as THREE from '../../vendor/three.bundle.min.js';
import { log } from '../core/logger.js';
import { mulberry32, smoothstep } from '../core/noise.js';
import { Parts, G } from '../core/geo.js';
import { mat, glow } from './materials.js';
import { GLOW_GROUP } from './glow.js';
import { coastRadius } from './terrain.js';
import { UNDER, UNDER_LINKS, underPos } from './places-data.js';

const TAU = Math.PI * 2;
const FLOOR_Y = -47;
const U = (k) => mat(k, { underground: true });

export const shellUniforms = {
  uCam: { value: new THREE.Vector2() },
  uCenter: { value: new THREE.Vector2() },
};

// 岩壳：只留下背对镜头的那一半，像把岛从镜头这一侧剖开
function rockMat() {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
  m.name = 'shell';
  m.onBeforeCompile = (shader) => {
    try {
      shader.uniforms.uCam = shellUniforms.uCam;
      shader.uniforms.uCenter = shellUniforms.uCenter;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          varying vec3 vShellW;`)
        .replace('#include <project_vertex>', `#include <project_vertex>
          vShellW = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform vec2 uCam;
          uniform vec2 uCenter;
          varying vec3 vShellW;`)
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
          {
            vec2 toP = vShellW.xz - uCenter;
            vec2 toC = uCam - uCenter;
            if (length(toC) > 0.001 && length(toP) > 0.001 && dot(normalize(toP), normalize(toC)) > -0.12) discard;
          }`);
    } catch (e) {
      log.error('underground.shell.onBeforeCompile', e);
    }
  };
  m.customProgramCacheKey = () => 'shell-cutaway';
  return m;
}

/** 岛体外壳：从海岸线往下收成一只碗，内壁有岩层条纹 */
function buildShell(rng) {
  const SEG = 120;
  const levels = [
    { y: 1.5, f: 1.0 },
    { y: -6, f: 0.97 },
    { y: -14, f: 0.93 },
    { y: -24, f: 0.86 },
    { y: -34, f: 0.76 },
    { y: -42, f: 0.62 },
    { y: -49, f: 0.4 },
    { y: -53, f: 0.0 },
  ];
  const pos = [];
  const col = [];
  const strata = ['#6b5a4a', '#7c6a56', '#5a4c42', '#857561', '#4f453f', '#6e6052'].map((c) => new THREE.Color(c));
  const tmp = new THREE.Color();
  const grid = levels.map((lv, li) => {
    const row = [];
    for (let k = 0; k < SEG; k++) {
      const a = (k / SEG) * TAU - Math.PI;
      const R = coastRadius(a) * lv.f * (0.96 + rng() * 0.06) - 2;
      row.push(new THREE.Vector3(Math.cos(a) * R, lv.y + (li > 0 && li < levels.length - 1 ? (rng() - 0.5) * 2.2 : 0), Math.sin(a) * R));
    }
    return row;
  });
  const pushV = (v) => {
    pos.push(v.x, v.y, v.z);
    const band = Math.floor((-v.y + 3) / 4.3);
    tmp.copy(strata[((band % strata.length) + strata.length) % strata.length]);
    const k = 0.9 + rng() * 0.2;
    col.push(tmp.r * k, tmp.g * k, tmp.b * k);
  };
  for (let i = 0; i < levels.length - 1; i++) {
    for (let k = 0; k < SEG; k++) {
      const k1 = (k + 1) % SEG;
      const a = grid[i][k];
      const b = grid[i][k1];
      const c = grid[i + 1][k];
      const d = grid[i + 1][k1];
      pushV(a);
      pushV(c);
      pushV(b);
      pushV(b);
      pushV(c);
      pushV(d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, rockMat());
  mesh.name = 'earth-shell';
  mesh.receiveShadow = false;
  return mesh;
}

function jitterCyl(rt, rb, h, seg, rng, amt = 0.4) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 3);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (Math.abs(y - h / 2) < 0.01) continue; // 顶面保持平整
    p.setX(i, p.getX(i) * (1 + (rng() - 0.5) * amt * 0.3));
    p.setZ(i, p.getZ(i) * (1 + (rng() - 0.5) * amt * 0.3));
    p.setY(i, y + (rng() - 0.5) * amt);
  }
  g.computeVertexNormals();
  return g;
}

// ---- 各处的陈设（局部坐标：+z 朝向默认视角，-z 是“里面”的墙） ----
const PROPS = {
  'u-entrance'(p, glows, rng, r) {
    p.add(U('stone'), G.cyl12, [0, 0.05, -1], [0, 0, 0], [6.5, 0.3, 6.5]);
    const water = new THREE.MeshLambertMaterial({ color: '#2e8f98', emissive: '#0f4c55', emissiveIntensity: 0.6, transparent: true, opacity: 0.85 });
    water.name = 'poolU';
    p.add(water, G.cyl12, [0, 0.12, -1], [0, 0, 0], [5.6, 0.1, 5.6]);
    [-3, 3].forEach((x) => {
      p.add(U('woodDark'), G.box, [x, 1.4, 2.6], [0, 0, 0], [0.2, 2.8, 0.2]);
      lanternU(p, glows, x, 2.9, 2.6);
    });
  },
  'u-backroom'(p, glows, rng, r) {
    const red = U('carpet');
    p.add(red, G.box, [-3.2, 3, -r + 2.2], [0, 0.25, 0], [3.0, 6, 0.15]);
    p.add(red, G.box, [3.2, 3, -r + 2.2], [0, -0.25, 0], [3.0, 6, 0.15]);
    p.add(U('woodDark'), G.box, [0, 6.2, -r + 2.0], [0, 0, 0], [9, 0.4, 0.4]);
    for (let s = 0; s < 3; s++) {
      p.add(U('wood'), G.box, [0, 1.2 + s * 1.3, -r + 1.3], [0, 0, 0], [4.4, 0.15, 1.0]);
      for (let k = 0; k < 7; k++) {
        const c = ['teal', 'brass', 'red', 'purple', 'green', 'yellow', 'white'][Math.floor(rng() * 7)];
        p.add(U(c), G.cyl6, [-1.9 + k * 0.62, 1.55 + s * 1.3, -r + 1.3], [0, 0, 0], [0.32, 0.55 + rng() * 0.3, 0.32]);
      }
    }
    p.add(U('wood'), G.box, [0, 0.6, -0.5], [0, 0, 0], [4.2, 1.2, 1.2]);
    p.add(U('woodLight'), G.box, [0, 1.25, -0.5], [0, 0, 0], [4.4, 0.12, 1.4]);
    lanternU(p, glows, -2.6, 2.4, 0.5);
    lanternU(p, glows, 2.4, 2.0, -0.2);
  },
  'u-bounty'(p, glows, rng, r) {
    p.add(U('woodDark'), G.box, [0, 3.2, -r + 1.2], [0, 0, 0], [8.5, 5.2, 0.4]);
    p.add(U('woodLight'), G.box, [0, 3.2, -r + 1.45], [0, 0, 0], [8.0, 4.7, 0.1]);
    for (let i = 0; i < 34; i++) {
      const x = -3.6 + rng() * 7.2;
      const y = 1.3 + rng() * 3.8;
      p.add(U(rng() < 0.75 ? 'canvasA' : 'cream'), G.box, [x, y, -r + 1.53], [0, 0, (rng() - 0.5) * 0.3], [0.7, 0.85, 0.03]);
    }
    p.add(U('stone'), new THREE.RingGeometry(2.5, 3.2, 24).rotateX(-Math.PI / 2), [0, 0.06, 1.5]);
    lanternU(p, glows, -4.6, 3.0, -r + 1.6);
    lanternU(p, glows, 4.6, 3.0, -r + 1.6);
  },
  'u-bank'(p, glows, rng, r) {
    p.add(U('teal'), G.cyl12, [0, 0.05, 0.5], [0, 0, 0], [9, 0.1, 9]);
    p.add(U('brass'), new THREE.RingGeometry(4.2, 4.45, 32).rotateX(-Math.PI / 2), [0, 0.12, 0.5]);
    // 猫爪印
    p.add(U('roofTealDark'), G.cyl8, [0, 0.12, 1.4], [0, 0, 0], [1.4, 0.04, 1.2]);
    [[-0.75, 2.4], [-0.25, 2.75], [0.25, 2.75], [0.75, 2.4]].forEach(([x, z]) => p.add(U('roofTealDark'), G.cyl8, [x, 0.12, z], [0, 0, 0], [0.45, 0.04, 0.45]));
    p.add(U('woodDark'), G.box, [0, 0.9, -1.8], [0, 0, 0], [4.2, 0.2, 1.8]);
    p.add(U('wood'), G.box, [-1.8, 0.45, -1.8], [0, 0, 0], [0.4, 0.9, 1.6]);
    p.add(U('wood'), G.box, [1.8, 0.45, -1.8], [0, 0, 0], [0.4, 0.9, 1.6]);
    p.add(U('canvasA'), G.box, [-0.8, 1.15, -1.8], [0, 0.3, 0], [0.9, 0.3, 0.7]);
    p.add(U('teal'), G.box, [0, 0.9, -3.4], [0, 0, 0], [1.3, 1.8, 1.0]);
    for (let s = 0; s < 4; s++) {
      p.add(U('woodDark'), G.box, [-3.8, 0.8 + s * 1.2, -r + 2.0], [0, 0.35, 0], [3.0, 0.15, 0.9]);
      for (let k = 0; k < 6; k++) p.add(U(['red', 'teal', 'brass', 'blue', 'purple', 'cream'][(k + s) % 6]), G.box, [-4.9 + k * 0.42, 1.15 + s * 1.2, -r + 2.0 + k * 0.15], [0, 0.35, 0], [0.32, 0.6, 0.65]);
    }
    // 鸟笼
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * TAU;
      p.add(U('brass'), G.box, [3.6 + Math.cos(a) * 0.7, 2.8, -2.5 + Math.sin(a) * 0.7], [0, 0, 0], [0.05, 2.0, 0.05]);
    }
    p.add(U('brass'), G.cone8, [3.6, 4.0, -2.5], [0, 0, 0], [1.6, 0.6, 1.6]);
    p.add(U('brass'), G.cyl8, [3.6, 1.8, -2.5], [0, 0, 0], [1.5, 0.12, 1.5]);
    p.add(U('woodDark'), G.cyl6, [3.6, 0.9, -2.5], [0, 0, 0], [0.18, 1.8, 0.18]);
    lanternU(p, glows, -2.2, 1.4, -1.8, 1.8);
    lanternU(p, glows, 4.4, 2.6, 1.6);
  },
  'u-pit'(p, glows, rng, r) {
    // 一圈圈往下的石阶
    for (let i = 0; i < 6; i++) {
      const rr = r - 0.8 - i * 1.5;
      p.add(U(i % 2 ? 'stone' : 'cobble'), G.cyl12, [0, -i * 0.55, 0], [0, 0, 0], [rr * 2, 0.6, rr * 2]);
    }
    p.add(U('cream'), G.cyl12, [0, -3.0, 0], [0, 0, 0], [5.4, 0.3, 5.4]);
    p.add(U('brass'), new THREE.RingGeometry(1.5, 1.8, 24).rotateX(-Math.PI / 2), [0, -2.83, 0]);
    p.add(U('brass'), new THREE.RingGeometry(0.4, 0.6, 24).rotateX(-Math.PI / 2), [0, -2.83, 0]);
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * TAU;
      p.add(U('woodDark'), G.cyl6, [Math.cos(a) * (r - 0.4), 0.8, Math.sin(a) * (r - 0.4)], [0, 0, 0], [0.22, 1.6, 0.22]);
      const a2 = ((k + 0.5) / 12) * TAU;
      p.add(U('carpet'), G.box, [Math.cos(a2) * (r - 0.45), 1.3, Math.sin(a2) * (r - 0.45)], [0, -a2, 0], [0.08, 0.08, (TAU * (r - 0.4)) / 12]);
      if (k % 3 === 0) lanternU(p, glows, Math.cos(a) * (r - 0.4), 1.9, Math.sin(a) * (r - 0.4), 2.2);
    }
  },
  'u-casino'(p, glows, rng, r) {
    p.add(U('carpet'), G.cyl12, [0, 0.05, 0], [0, 0, 0], [r * 1.7, 0.1, r * 1.7]);
    [[-2.6, 0.6], [2.4, 2.4], [0.6, -2.4]].forEach(([x, z]) => {
      p.add(U('felt'), G.cyl12, [x, 1.0, z], [0, 0, 0], [3.2, 0.25, 2.0]);
      p.add(U('woodDark'), G.cyl12, [x, 0.92, z], [0, 0, 0], [3.4, 0.15, 2.2]);
      p.add(U('woodDark'), G.cyl6, [x, 0.45, z], [0, 0, 0], [0.4, 0.9, 0.4]);
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * TAU + 0.3;
        p.add(U('wood'), G.box, [x + Math.cos(a) * 1.9, 0.5, z + Math.sin(a) * 1.4], [0, -a, 0], [0.5, 0.1, 0.5]);
      }
      p.add(U('white'), G.box, [x + 0.3, 1.2, z], [0.5, 0.5, 0], [0.22, 0.22, 0.22]);
      p.add(U('white'), G.box, [x - 0.2, 1.2, z + 0.2], [0.2, 0.9, 0], [0.22, 0.22, 0.22]);
    });
    // 老虎机
    p.add(U('brass'), G.box, [4.6, 1.5, -3.6], [0, -0.6, 0], [1.6, 3.0, 1.2]);
    p.add(glow.lampUnder, G.box, [4.2, 2.0, -3.0], [0, -0.6, 0], [1.1, 0.6, 0.1]);
    p.add(U('red'), G.sphere, [5.2, 2.6, -3.3], [0, 0, 0], [0.3, 0.3, 0.3]);
    glows.push({ local: [4.2, 2.0, -2.8], color: '#ff9a6a', size: 3.2 });
    lanternU(p, glows, -4.8, 2.8, -2.6);
    lanternU(p, glows, 0, 3.4, -r + 1.4);
  },
  'u-tavern'(p, glows, rng, r) {
    p.add(U('wood'), G.cyl12, [0, 0.05, 0], [0, 0, 0], [r * 1.7, 0.1, r * 1.7]);
    // 吧台：一段弧
    for (let k = 0; k < 10; k++) {
      const a = Math.PI * 1.15 + (k / 9) * Math.PI * 0.7;
      p.add(U('woodDark'), G.box, [Math.cos(a) * 3.4, 0.6, Math.sin(a) * 3.4], [0, -a + Math.PI / 2, 0], [1.2, 1.2, 0.5]);
      p.add(U('woodLight'), G.box, [Math.cos(a) * 3.4, 1.25, Math.sin(a) * 3.4], [0, -a + Math.PI / 2, 0], [1.3, 0.1, 0.8]);
      if (k % 2 === 0) {
        p.add(U('red'), G.cyl8, [Math.cos(a) * 2.4, 0.9, Math.sin(a) * 2.4], [0, 0, 0], [0.55, 0.15, 0.55]);
        p.add(U('iron'), G.cyl6, [Math.cos(a) * 2.4, 0.45, Math.sin(a) * 2.4], [0, 0, 0], [0.1, 0.9, 0.1]);
      }
    }
    // 青瓦檐
    p.add(U('roofTeal'), G.box, [0, 4.4, -r + 2.4], [0.4, 0, 0], [8.5, 0.3, 3.0]);
    [-3.8, 3.8].forEach((x) => p.add(U('woodDark'), G.box, [x, 2.2, -r + 3.2], [0, 0, 0], [0.3, 4.4, 0.3]));
    barrelU(p, -4.6, -2.0);
    barrelU(p, -4.9, -0.7);
    tableU(p, 2.6, 3.4);
    tableU(p, -2.4, 3.6);
    for (let k = 0; k < 5; k++) lanternU(p, glows, -3.2 + k * 1.6, 3.6, -r + 3.3, 1.6);
  },
  'u-medic'(p, glows, rng, r) {
    p.add(U('tileTeal'), G.cyl12, [0, 0.05, 0], [0, 0, 0], [r * 1.7, 0.1, r * 1.7]);
    p.add(U('white'), G.box, [-1.8, 0.6, -1.5], [0, 0.2, 0], [2.0, 0.5, 3.6]);
    p.add(U('canvasA'), G.box, [-1.8, 0.95, -2.8], [0, 0.2, 0], [1.4, 0.25, 0.7]);
    [[-2.6, -3.0], [-1.0, -3.3], [-2.6, 0.1], [-1.0, -0.2]].forEach(([x, z]) => p.add(U('iron'), G.box, [x, 0.25, z], [0, 0, 0], [0.1, 0.5, 0.1]));
    for (let k = 0; k < 3; k++) {
      p.add(U('white'), G.box, [1.6 + k * 1.3, 1.6, -r + 1.8], [0, 0, 0], [1.2, 3.2, 0.8]);
      p.add(glow.lampUnder, G.box, [1.6 + k * 1.3, 2.0, -r + 2.22], [0, 0, 0], [0.9, 1.6, 0.05]);
    }
    glows.push({ local: [2.9, 2.0, -r + 2.6], color: '#7fe0d2', size: 5 });
    p.add(U('woodLight'), G.cyl8, [2.2, 0.8, 1.6], [0, 0, 0], [1.4, 0.1, 1.4]);
    p.add(U('teal'), G.cyl6, [2.2, 1.05, 1.6], [0, 0, 0], [0.3, 0.4, 0.3]);
    lanternU(p, glows, -3.8, 2.8, 1.8);
  },
  'u-jail'(p, glows, rng, r) {
    p.add(U('stoneDark'), G.cyl12, [0, 0.05, 0], [0, 0, 0], [r * 1.7, 0.1, r * 1.7]);
    const R = r - 1.6;
    for (let k = 0; k < 28; k++) {
      const a = (k / 28) * TAU;
      p.add(U('iron'), G.cyl6, [Math.cos(a) * R, 1.8, Math.sin(a) * R], [0, 0, 0], [0.12, 3.6, 0.12]);
    }
    p.add(U('iron'), new THREE.TorusGeometry(R, 0.1, 4, 28), [0, 3.5, 0], [Math.PI / 2, 0, 0]);
    p.add(U('iron'), new THREE.TorusGeometry(R, 0.08, 4, 28), [0, 0.5, 0], [Math.PI / 2, 0, 0]);
    tableU(p, 0, 0);
    lanternU(p, glows, R + 0.9, 2.8, 0);
    lanternU(p, glows, -R - 0.9, 2.8, 0);
  },
  'u-k'(p, glows, rng, r) {
    // 后墙 + 圆门
    p.add(U('stoneDark'), G.box, [0, 3.5, -r + 1.0], [0, 0, 0], [12, 7, 1.0]);
    p.add(U('wood'), G.cyl12, [0, 3.0, -r + 1.55], [Math.PI / 2, 0, 0], [4.4, 0.25, 4.4]);
    p.add(U('brass'), new THREE.TorusGeometry(2.3, 0.18, 6, 24), [0, 3.0, -r + 1.7]);
    p.add(U('brass'), new THREE.TorusGeometry(0.6, 0.1, 6, 16), [0, 3.0, -r + 1.75]);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU;
      p.add(U('brass'), G.box, [Math.cos(a) * 1.4, 3.0 + Math.sin(a) * 1.4, -r + 1.72], [0, 0, a], [0.12, 1.4, 0.06]);
    }
    // 帘幔
    [-3.6, 3.6].forEach((x) => {
      p.add(U('teal'), G.box, [x, 3.4, -r + 1.8], [0, 0, x > 0 ? -0.08 : 0.08], [1.6, 6.2, 0.15]);
      p.add(U('brass'), G.sphere, [x * 1.3, 4.6, -r + 1.9], [0, 0, 0], [0.4, 0.4, 0.4]);
    });
    // 贝壳
    for (let k = 0; k < 8; k++) {
      const a = Math.PI * 0.1 + (k / 7) * Math.PI * 0.8;
      p.add(U('shell'), G.cone8, [Math.cos(a) * 3.3, 3.0 + Math.sin(a) * 3.3, -r + 1.7], [Math.PI / 2, 0, a], [0.6, 0.35, 0.6]);
    }
    p.add(U('carpet'), G.box, [0, 0.08, 0.5], [0, 0, 0], [3.2, 0.06, 6]);
    p.add(U('orange'), G.box, [0, 0.1, 0.5], [0, 0, 0], [2.6, 0.06, 5.4]);
    for (let k = 0; k < 4; k++) {
      const x = k < 2 ? -5 + k * 1.2 : 3.8 + (k - 2) * 1.2;
      p.add(U('teal'), G.cyl8, [x, 0.9, -r + 2.6], [0, 0, 0], [0.8, 1.8, 0.8]);
      lanternU(p, glows, x, 2.1, -r + 2.6, 1.8);
    }
  },
};

function lanternU(p, glows, x, y, z, size = 2.4) {
  p.add(glow.lampUnder, G.box, [x, y, z], [0, 0, 0], [0.34, 0.44, 0.34]);
  p.add(U('woodDark'), G.box, [x, y + 0.27, z], [0, 0, 0], [0.44, 0.08, 0.44]);
  glows.push({ local: [x, y, z], color: '#ffbb5c', size });
}
function barrelU(p, x, z) {
  p.add(U('wood'), G.cyl8, [x, 0.55, z], [0, 0, 0], [0.8, 1.1, 0.8]);
  p.add(U('iron'), G.cyl8, [x, 0.75, z], [0, 0, 0], [0.84, 0.08, 0.84]);
}
function tableU(p, x, z) {
  p.add(U('woodLight'), G.cyl8, [x, 0.8, z], [0, 0, 0], [1.3, 0.1, 1.3]);
  p.add(U('woodDark'), G.cyl6, [x, 0.4, z], [0, 0, 0], [0.15, 0.8, 0.15]);
  [0.6, 2.7, 4.8].forEach((a) => p.add(U('wood'), G.box, [x + Math.cos(a) * 1.0, 0.45, z + Math.sin(a) * 1.0], [0, 0, 0], [0.45, 0.1, 0.45]));
}

/**
 * shaftTop: 地面井口（世界坐标，井口地面高度）
 */
export function buildUnderground(shaftTop, glowField) {
  const group = new THREE.Group();
  group.name = 'underground';
  const rng = mulberry32(4040);
  const places = [];
  const dyn = [];
  // 让井下入口正好在竖井下方偏北一点
  const e0 = underPos([0, 0]);
  const offset = new THREE.Vector3(shaftTop.x - e0.x, 0, shaftTop.z - 6 - e0.z);
  const posOf = (u) => {
    const p = underPos(u.m);
    return new THREE.Vector3(p.x + offset.x, p.y, p.z + offset.z);
  };

  try {
    group.add(buildShell(rng));

    // 洞底：岩石 + 地下水
    const floorParts = new Parts('cave-floor');
    const floorGeo = jitterCyl(54, 40, 4, 28, rng, 1.0);
    floorParts.add(U('stoneDark'), floorGeo, [0, FLOOR_Y - 3, 0]);
    floorParts.build(group, { cast: false });
    const water = new THREE.Mesh(
      new THREE.CircleGeometry(52, 40).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: '#1f6f78', emissive: '#0b3a42', emissiveIntensity: 0.9, transparent: true, opacity: 0.88 })
    );
    water.material.name = 'caveWater';
    water.name = 'cave-water';
    group.add(water);

    // 竖井：岩管 + 长梯
    const shaftH = shaftTop.y - -16;
    const shaftGeo = jitterCyl(2.8, 3.2, shaftH, 10, rng, 0.3);
    const shaftMat = new THREE.MeshLambertMaterial({ color: '#5a4c42', flatShading: true, side: THREE.DoubleSide });
    shaftMat.name = 'shaft';
    const shaft = new THREE.Mesh(shaftGeo, shaftMat);
    shaft.position.set(shaftTop.x, -16 + shaftH / 2, shaftTop.z);
    group.add(shaft);
    const ladder = new Parts('shaft-ladder');
    [-0.6, 0.6].forEach((x) => ladder.add(U('woodLight'), G.box, [shaftTop.x + x, -16 + shaftH / 2, shaftTop.z - 1.8], [0, 0, 0], [0.15, shaftH, 0.15]));
    for (let y = -16; y < shaftTop.y; y += 0.9) ladder.add(U('woodLight'), G.box, [shaftTop.x, y, shaftTop.z - 1.8], [0, 0, 0], [1.3, 0.1, 0.12]);
    ladder.build(group, { cast: false });

    // 各处：岩柱 + 地面 + 陈设
    const anchor = {};
    UNDER.forEach((u) => {
      const p = posOf(u);
      anchor[u.id] = { p, r: u.r };
      const g = new THREE.Group();
      g.name = `under:${u.id}`;
      g.position.copy(p);
      g.rotation.y = Math.PI; // 局部 +z 朝北（默认视角）
      const parts = new Parts(u.id);
      const pillarH = p.y - FLOOR_Y + 2;
      parts.add(U('stoneDark'), jitterCyl(u.r + 0.6, u.r + 3.2, pillarH, 12, rng, 0.8), [0, -pillarH / 2 - 0.4, 0]);
      parts.add(U('stone'), jitterCyl(u.r, u.r + 0.4, 0.8, 14, rng, 0.05), [0, -0.4, 0]);
      // 背后半圈岩壁
      for (let k = 0; k <= 9; k++) {
        const a = Math.PI + (k / 9) * Math.PI;
        const s = 1.6 + rng() * 1.6;
        parts.add(U('stoneDark'), G.dodec, [Math.cos(a) * (u.r + 0.3), s * 0.6 + rng() * 2.5, Math.sin(a) * (u.r + 0.3)], [rng() * 3, rng() * 3, 0], [s, s * (1.6 + rng()), s]);
      }
      // 垂下来的藤
      for (let k = 0; k < 6; k++) {
        const a = Math.PI * 1.2 + rng() * Math.PI * 0.6;
        const len = 1.5 + rng() * 3;
        parts.add(U('leafDark'), G.box, [Math.cos(a) * (u.r - 0.2), 5.5 - len / 2, Math.sin(a) * (u.r - 0.2)], [0, 0, (rng() - 0.5) * 0.15], [0.14, len, 0.14]);
      }
      const glows = [];
      try {
        PROPS[u.id](parts, glows, rng, u.r);
      } catch (e) {
        log.error('underground.props', e, { id: u.id });
      }
      parts.build(g);
      group.add(g);
      g.updateMatrixWorld(true);
      glows.forEach((gl) => {
        const v = new THREE.Vector3(gl.local[0], gl.local[1], gl.local[2]).applyMatrix4(g.matrixWorld);
        glowField.add(v, gl.color, gl.size, GLOW_GROUP.under);
      });
      const hitGeo = new THREE.CylinderGeometry(u.r, u.r, 7, 10);
      hitGeo.translate(0, 2.5, 0);
      const hit = new THREE.Mesh(hitGeo, new THREE.MeshBasicMaterial({ visible: false }));
      hit.userData.placeId = u.id;
      hit.name = `hit:${u.id}`;
      g.add(hit);
      places.push({ id: u.id, def: u, group: g, hit, labelPos: p.clone().add(new THREE.Vector3(0, 7.5, 0)), focus: p.clone().add(new THREE.Vector3(0, 1, 0)) });
    });

    // 石阶与栈道
    const stairs = new Parts('stairs');
    const stairGlows = [];
    UNDER_LINKS.forEach(([a, b]) => {
      const A = anchor[a];
      const B = anchor[b];
      if (!A || !B) {
        log.warn('underground.links', '连线两端找不到地点', { a, b });
        return;
      }
      const dir = new THREE.Vector3().subVectors(B.p, A.p);
      dir.y = 0;
      const len = dir.length();
      dir.normalize();
      const start = A.p.clone().addScaledVector(dir, A.r - 0.6);
      const end = B.p.clone().addScaledVector(dir, -(B.r - 0.6));
      const run = start.distanceTo(new THREE.Vector3(end.x, start.y, end.z));
      const n = Math.max(3, Math.round(run / 0.8));
      const ang = Math.atan2(dir.x, dir.z);
      const side = new THREE.Vector3(dir.z, 0, -dir.x);
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const x = start.x + (end.x - start.x) * t;
        const z = start.z + (end.z - start.z) * t;
        const y = start.y + (end.y - start.y) * smoothstep(0, 1, t) - 0.25;
        stairs.add(U('stone'), G.box, [x, y, z], [0, ang, 0], [2.4, 0.35, 0.95]);
        if (i % 4 === 0) {
          // 支撑柱一直伸到洞底
          const h = y - FLOOR_Y;
          stairs.add(U('stoneDark'), G.box, [x, y - h / 2 - 0.2, z], [0, ang, 0], [1.2, h, 0.9]);
          // 绳栏的柱子
          [-1, 1].forEach((sgn) => stairs.add(U('woodDark'), G.cyl6, [x + side.x * 1.2 * sgn, y + 0.6, z + side.z * 1.2 * sgn], [0, 0, 0], [0.12, 1.2, 0.12]));
        }
        if (i === Math.floor(n / 2)) {
          stairs.add(glow.lampUnder, G.box, [x + side.x * 1.25, y + 1.35, z + side.z * 1.25], [0, 0, 0], [0.3, 0.4, 0.3]);
          stairGlows.push(new THREE.Vector3(x + side.x * 1.25, y + 1.35, z + side.z * 1.25));
        }
      }
      // 绳子
      [-1, 1].forEach((sgn) => {
        const s0 = new THREE.Vector3(start.x + side.x * 1.2 * sgn, start.y + 1.1, start.z + side.z * 1.2 * sgn);
        const s1 = new THREE.Vector3(end.x + side.x * 1.2 * sgn, end.y + 1.1, end.z + side.z * 1.2 * sgn);
        const mid = s0.clone().add(s1).multiplyScalar(0.5);
        const L = s0.distanceTo(s1);
        const rope = new THREE.CylinderGeometry(0.04, 0.04, L, 4);
        rope.rotateX(Math.PI / 2);
        const look = new THREE.Matrix4().lookAt(s0, s1, THREE.Object3D.DEFAULT_UP);
        rope.applyMatrix4(look);
        rope.translate(mid.x, mid.y, mid.z);
        stairs.addRaw(U('rope'), rope);
      });
      void len;
    });
    stairs.build(group, { cast: false });
    stairGlows.forEach((v) => glowField.add(v, '#ffbb5c', 2.2, GLOW_GROUP.under));

    // 瀑布：从岩壁落进地下水
    const fallMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uOpacity: { value: 1 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform float uTime; uniform float uOpacity; varying vec2 vUv;
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9,78.2)))*43758.5); }
        void main(){
          float x = floor(vUv.x * 14.0);
          float s = fract(vUv.y * 3.0 + uTime * (0.8 + h(vec2(x,1.0)) * 0.6) + h(vec2(x,2.0)));
          float streak = smoothstep(0.0, 0.3, s) * smoothstep(1.0, 0.5, s);
          float edge = smoothstep(0.0, 0.15, vUv.x) * smoothstep(1.0, 0.85, vUv.x);
          vec3 c = mix(vec3(0.35,0.75,0.8), vec3(0.85,0.97,1.0), streak);
          gl_FragColor = vec4(c, (0.35 + streak * 0.5) * edge * uOpacity);
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    fallMat.name = 'waterfall';
    const falls = [
      { th: 2.45, top: -14, w: 4 },
      { th: 1.0, top: -20, w: 5 },
      { th: 1.3, top: -10, w: 3 },
    ];
    falls.forEach((f) => {
      const R = coastRadius(f.th) * 0.8 - 4;
      const x = Math.cos(f.th) * R;
      const z = Math.sin(f.th) * R;
      const h = f.top - FLOOR_Y;
      const geo = new THREE.PlaneGeometry(f.w, h);
      const m = new THREE.Mesh(geo, fallMat);
      m.position.set(x, FLOOR_Y + h / 2, z);
      m.lookAt(0, FLOOR_Y + h / 2, 0);
      group.add(m);
    });

    // 萤光虫：贴着岩壁的小点
    const GW = 220;
    const gwPos = new Float32Array(GW * 3);
    for (let i = 0; i < GW; i++) {
      const a = rng() * TAU;
      const y = -8 - rng() * 36;
      const f = 0.97 - ((-y) / 53) * 0.45;
      const R = coastRadius(a) * f - 3.5;
      gwPos[i * 3] = Math.cos(a) * R;
      gwPos[i * 3 + 1] = y;
      gwPos[i * 3 + 2] = Math.sin(a) * R;
    }
    const gwGeo = new THREE.BufferGeometry();
    gwGeo.setAttribute('position', new THREE.BufferAttribute(gwPos, 3));
    const gwMat = new THREE.PointsMaterial({ color: '#7ff5e0', size: 0.7, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 });
    gwMat.name = 'glowworm';
    const gw = new THREE.Points(gwGeo, gwMat);
    group.add(gw);

    // 地下的灯（只用两盏点光，数量恒定，避免切换时重编译着色器）
    const l1 = new THREE.PointLight('#ffb766', 0, 70, 1.4);
    const l2 = new THREE.PointLight('#ffb766', 0, 70, 1.4);
    const pTav = anchor['u-tavern'].p;
    const pBnt = anchor['u-bounty'].p;
    l1.position.set(pTav.x, pTav.y + 8, pTav.z);
    l2.position.set(pBnt.x, pBnt.y + 8, pBnt.z);
    group.add(l1, l2);

    // 钱庄的猫和鹦鹉
    const bank = places.find((p) => p.id === 'u-bank');
    if (bank) {
      const catM = U('black');
      const cat = new THREE.Group();
      const cp = new Parts('ucat');
      cp.add(catM, G.ico0, [0, 0.35, 0], [0, 0, 0], [0.55, 0.55, 0.8]);
      cp.add(catM, G.ico0, [0, 0.75, 0.32], [0, 0, 0], [0.42, 0.4, 0.4]);
      cp.add(catM, G.cone4, [0.12, 0.97, 0.32], [0, Math.PI / 4, 0], [0.13, 0.2, 0.13]);
      cp.add(catM, G.cone4, [-0.12, 0.97, 0.32], [0, Math.PI / 4, 0], [0.13, 0.2, 0.13]);
      cp.add(U('yellow'), G.box, [0.1, 0.8, 0.52], [0, 0, 0], [0.08, 0.05, 0.03]);
      cp.add(U('yellow'), G.box, [-0.1, 0.8, 0.52], [0, 0, 0], [0.08, 0.05, 0.03]);
      cp.build(cat);
      const tail = new THREE.Mesh(G.cyl6, catM);
      tail.scale.set(0.08, 0.8, 0.08);
      tail.position.set(0, 0.5, -0.5);
      cat.add(tail);
      cat.position.set(1.2, 0.1, 1.4);
      cat.rotation.y = 0.4;
      bank.group.add(cat);
      const parrot = new THREE.Group();
      const pp = new Parts('parrot');
      pp.add(U('blue'), G.ico0, [0, 0.3, 0], [0, 0, 0], [0.35, 0.5, 0.35]);
      pp.add(U('blue'), G.ico0, [0, 0.62, 0.05], [0, 0, 0], [0.26, 0.26, 0.26]);
      pp.add(U('yellow'), G.cone4, [0, 0.6, 0.2], [Math.PI / 2, 0, 0], [0.08, 0.16, 0.08]);
      pp.add(U('teal'), G.box, [0, 0.1, -0.2], [0.5, 0, 0], [0.12, 0.4, 0.06]);
      pp.build(parrot);
      parrot.position.set(3.6, 4.25, -2.5);
      bank.group.add(parrot);
      dyn.push((env, time) => {
        tail.rotation.z = Math.sin(time * 1.6) * 0.6;
        parrot.rotation.y = Math.sin(time * 0.5) * 0.8;
        parrot.position.y = 4.25 + Math.abs(Math.sin(time * 2.2)) * 0.04;
      });
    }

    dyn.push((env, time, dt, u) => {
      // 地下水位：跟着外面的潮汐涨落（幅度缩小）
      water.position.y = FLOOR_Y + 0.6 + env.waterLevel * 0.55;
      fallMat.uniforms.uTime.value = time;
      fallMat.uniforms.uOpacity.value = u;
      const flick = 0.92 + Math.sin(time * 5.3) * 0.05 + Math.sin(time * 11.1) * 0.03;
      l1.intensity = 900 * u * flick;
      l2.intensity = 650 * u * flick;
      gwMat.opacity = (0.55 + Math.sin(time * 1.3) * 0.25) * u;
    });
  } catch (e) {
    log.error('underground.build', e, { shaftTop: shaftTop && shaftTop.toArray() });
  }

  const center = new THREE.Vector3(offset.x, -30, offset.z + 50 - 48);
  shellUniforms.uCenter.value.set(center.x, center.z);
  function update(env, time, dt, u, camera) {
    if (camera) shellUniforms.uCam.value.set(camera.position.x, camera.position.z);
    for (let i = 0; i < dyn.length; i++) {
      try {
        dyn[i](env, time, dt, u);
      } catch (e) {
        log.errorThrottled('underground.update', e);
      }
    }
  }

  return { group, places, update, center };
}
