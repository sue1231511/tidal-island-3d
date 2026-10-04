// 小生命：海鸥、斑鸠（只在昼）、退潮滩上的螃蟹、跃出水面的鱼、蝴蝶、小馆的猫；
// 以及季节的粒子：春花瓣、秋落叶、冬雪、夏夜萤火。数量都克制，不吵。

import * as THREE from '../../lib/three.bundle.min.js';
import { log } from '../core/logger.js';
import { mulberry32, smoothstep, clamp } from '../core/noise.js';
import { heightAt, coastCoords, coastPoint, naturalHeight } from './terrain.js';
import { registerSurface } from './materials.js';
import { Parts, G } from '../core/geo.js';

const TAU = Math.PI * 2;

function lambert(color, name) {
  const m = new THREE.MeshLambertMaterial({ color, flatShading: true });
  m.name = name;
  registerSurface(m);
  return m;
}

function sprite(size = 64) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.75)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  return t;
}

export function buildLife(ctx) {
  const { layout, vegetation } = ctx;
  const group = new THREE.Group();
  group.name = 'life';
  const rng = mulberry32(99);
  const updaters = [];

  const add = (name, fn) => updaters.push({ name, fn });

  // ---------- 海鸥 ----------
  try {
    const white = lambert('#f7f6f2', 'gull');
    const grey = lambert('#9aa3ab', 'gullWing');
    const gulls = [];
    for (let i = 0; i < 9; i++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(G.ico0, white);
      body.scale.set(0.5, 0.45, 1.3);
      g.add(body);
      const head = new THREE.Mesh(G.ico0, white);
      head.scale.setScalar(0.42);
      head.position.set(0, 0.18, 0.7);
      g.add(head);
      const wingGeo = new THREE.BufferGeometry();
      wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.35, 0, 0, -0.35, 2.1, 0.1, -0.3], 3));
      wingGeo.computeVertexNormals();
      const wl = new THREE.Mesh(wingGeo, grey);
      const wr = new THREE.Mesh(wingGeo, grey);
      wr.scale.x = -1;
      wl.material.side = THREE.DoubleSide;
      g.add(wl, wr);
      const a0 = rng() * TAU;
      const center = coastPoint(a0, -6);
      g.userData = {
        wl,
        wr,
        cx: center.x * 0.75,
        cz: center.z * 0.75,
        r: 14 + rng() * 26,
        y: 16 + rng() * 14,
        sp: (0.18 + rng() * 0.15) * (rng() < 0.5 ? 1 : -1),
        ph: rng() * TAU,
        thr: i / 9,
      };
      g.scale.setScalar(0.9);
      group.add(g);
      gulls.push(g);
    }
    add('gulls', (env, time, dt) => {
      gulls.forEach((g) => {
        const u = g.userData;
        const vis = smoothstep(u.thr - 0.05, u.thr + 0.1, env.gulls);
        g.visible = vis > 0.02;
        if (!g.visible) return;
        const sp = u.sp * (1 + env.wind * 0.8);
        const a = time * sp + u.ph;
        const wob = Math.sin(time * 0.7 + u.ph) * 4;
        g.position.set(u.cx + Math.cos(a) * (u.r + wob), u.y + Math.sin(time * 0.5 + u.ph) * 2 + (1 - vis) * 40, u.cz + Math.sin(a) * (u.r + wob));
        g.rotation.y = Math.atan2(-Math.sin(a) * Math.sign(sp), Math.cos(a) * Math.sign(sp));
        g.rotation.z = -Math.sign(sp) * (0.25 + env.wind * 0.25) + Math.sin(time * 3 + u.ph) * env.wind * 0.3;
        // 拍几下翅膀，滑一会儿
        const cycle = (time * 0.4 + u.ph) % 3;
        const flap = cycle < 1 ? Math.sin(time * 9 + u.ph) * 0.7 : 0.08;
        u.wl.rotation.z = flap;
        u.wr.rotation.z = -flap;
      });
    });
  } catch (e) {
    log.error('life.gulls', e);
  }

  // ---------- 斑鸠：只在昼出现 ----------
  try {
    const bodyM = lambert('#b6a59a', 'dove');
    const neckM = lambert('#8f8a96', 'doveNeck');
    const doves = [];
    const anchors = [
      { x: 6, z: 6 },
      { x: -7, z: 4 },
      { x: 3, z: -8 },
      { x: layout.allotment.x + 4, z: layout.allotment.z + 12 },
      { x: layout.allotment.x - 6, z: layout.allotment.z + 13 },
      { x: layout.hut.x + 4, z: layout.hut.z + 8 },
    ];
    anchors.forEach((an, i) => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(G.ico0, bodyM);
      body.scale.set(0.42, 0.38, 0.62);
      body.position.y = 0.32;
      const head = new THREE.Mesh(G.ico0, neckM);
      head.scale.setScalar(0.26);
      head.position.set(0, 0.6, 0.3);
      const tail = new THREE.Mesh(G.box, bodyM);
      tail.scale.set(0.2, 0.05, 0.4);
      tail.position.set(0, 0.38, -0.42);
      tail.rotation.x = -0.3;
      g.add(body, head, tail);
      g.userData = { an, head, ph: rng() * TAU, x: an.x, z: an.z, tx: an.x, tz: an.z, wait: rng() * 2, idx: i };
      group.add(g);
      doves.push(g);
    });
    add('doves', (env, time, dt) => {
      doves.forEach((g) => {
        const u = g.userData;
        const p = env.doves;
        g.visible = p > 0.02;
        if (!g.visible) return;
        u.wait -= dt;
        if (u.wait <= 0) {
          u.tx = u.an.x + (rng() - 0.5) * 6;
          u.tz = u.an.z + (rng() - 0.5) * 6;
          u.wait = 1.5 + rng() * 3;
        }
        const dx = u.tx - u.x;
        const dz = u.tz - u.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.05) {
          const step = Math.min(d, dt * 1.2);
          u.x += (dx / d) * step;
          u.z += (dz / d) * step;
          g.rotation.y = Math.atan2(dx, dz);
        }
        const hop = d > 0.05 ? Math.abs(Math.sin(time * 9 + u.ph)) * 0.12 : 0;
        const fly = (1 - p) * 26;
        const ground = heightAt(u.x, u.z);
        g.position.set(u.x + (1 - p) * 10, ground + hop + fly, u.z - (1 - p) * 6);
        g.scale.setScalar(0.9 * clamp(p * 1.5, 0.01, 1));
        u.head.position.y = d > 0.05 ? 0.6 : 0.5 + Math.max(0, Math.sin(time * 4 + u.ph)) * 0.12;
      });
    });
  } catch (e) {
    log.error('life.doves', e);
  }

  // ---------- 螃蟹：退潮滩上 ----------
  try {
    const crabM = lambert('#d4553b', 'crab');
    const crabs = [];
    let tries = 0;
    while (crabs.length < 14 && tries < 6000) {
      tries++;
      const a = rng() * TAU;
      const p = coastPoint(a, -2 - rng() * 5);
      const h = naturalHeight(p.x, p.z);
      const cc = coastCoords(p.x, p.z);
      if (h > -1.3 && h < -0.25 && cc.c < 0.5) {
        const g = new THREE.Group();
        const parts = new Parts('crab');
        parts.add(crabM, G.ico0, [0, 0.18, 0], [0, 0, 0], [0.7, 0.3, 0.5]);
        parts.add(crabM, G.box, [0.45, 0.2, 0.25], [0, 0.5, 0], [0.25, 0.12, 0.18]);
        parts.add(crabM, G.box, [-0.45, 0.2, 0.25], [0, -0.5, 0], [0.25, 0.12, 0.18]);
        for (let k = 0; k < 3; k++) {
          parts.add(crabM, G.box, [0.4, 0.08, -0.15 + k * 0.15], [0, 0, -0.4], [0.35, 0.05, 0.05]);
          parts.add(crabM, G.box, [-0.4, 0.08, -0.15 + k * 0.15], [0, 0, 0.4], [0.35, 0.05, 0.05]);
        }
        parts.build(g, { cast: false });
        const tangent = a + Math.PI / 2;
        g.userData = { x0: p.x, z0: p.z, tx: Math.cos(tangent), tz: Math.sin(tangent), ph: rng() * TAU, sp: 0.3 + rng() * 0.4 };
        g.rotation.y = -tangent;
        group.add(g);
        crabs.push(g);
      }
    }
    add('crabs', (env, time) => {
      crabs.forEach((g) => {
        const u = g.userData;
        const k = smoothstep(0.35, 0.9, env.ebb);
        g.visible = k > 0.02;
        if (!g.visible) return;
        const s = Math.sin(time * u.sp + u.ph) * 2.2;
        const x = u.x0 + u.tx * s;
        const z = u.z0 + u.tz * s;
        const y = heightAt(x, z);
        // 被水淹着的就藏起来
        g.visible = y > env.waterLevel - 0.15;
        g.position.set(x, y, z);
        g.scale.setScalar(k * 0.8);
      });
    });
  } catch (e) {
    log.error('life.crabs', e);
  }

  // ---------- 鱼：偶尔跃出水面 ----------
  try {
    const fishM = lambert('#c9d6dc', 'fish');
    const fish = [];
    for (let i = 0; i < 4; i++) {
      const g = new THREE.Group();
      const b = new THREE.Mesh(G.ico0, fishM);
      b.scale.set(0.3, 0.35, 1.0);
      const t = new THREE.Mesh(G.cone4, fishM);
      t.scale.set(0.5, 0.45, 0.1);
      t.rotation.x = -Math.PI / 2;
      t.position.z = -0.6;
      g.add(b, t);
      g.visible = false;
      g.userData = { t: -rng() * 8, x: 0, z: 0, dir: 0 };
      group.add(g);
      fish.push(g);
    }
    add('fish', (env, time, dt) => {
      fish.forEach((g) => {
        const u = g.userData;
        u.t += dt;
        if (u.t > 1.1) {
          // 下一次跳跃的间隔随渔汛/天气变化
          u.t = -(3 + rng() * 10) / Math.max(0.15, env.fish);
          const a = rng() * TAU;
          const p = coastPoint(a, -(14 + rng() * 30));
          u.x = p.x;
          u.z = p.z;
          u.dir = rng() * TAU;
        }
        if (u.t < 0) {
          g.visible = false;
          return;
        }
        const k = u.t / 1.1;
        g.visible = true;
        g.position.set(u.x + Math.cos(u.dir) * k * 3, env.waterLevel + Math.sin(k * Math.PI) * 1.6 - 0.3, u.z + Math.sin(u.dir) * k * 3);
        g.rotation.set(-Math.cos(k * Math.PI) * 0.9, -u.dir + Math.PI / 2, 0);
      });
    });
  } catch (e) {
    log.error('life.fish', e);
  }

  // ---------- 蝴蝶 ----------
  try {
    const cols = ['#fff6e0', '#f6d25a', '#f0955a', '#d9c6f2'];
    const flies = [];
    const homes = [layout.lianli, layout.allotment, layout.market, layout.hut, layout.ting].map((p) => ({ x: p.x, z: p.z }));
    for (let i = 0; i < 8; i++) {
      const m = lambert(cols[i % cols.length], 'butterfly');
      m.side = THREE.DoubleSide;
      const g = new THREE.Group();
      const wgeo = new THREE.PlaneGeometry(0.45, 0.35);
      wgeo.translate(0.22, 0, 0);
      const wl = new THREE.Mesh(wgeo, m);
      const wr = new THREE.Mesh(wgeo, m);
      wr.scale.x = -1;
      wl.rotation.x = wr.rotation.x = -Math.PI / 2;
      const pivotL = new THREE.Group();
      const pivotR = new THREE.Group();
      pivotL.add(wl);
      pivotR.add(wr);
      g.add(pivotL, pivotR);
      const home = homes[i % homes.length];
      g.userData = { pivotL, pivotR, home, ph: rng() * TAU, r: 2 + rng() * 3, thr: i / 8 };
      group.add(g);
      flies.push(g);
    }
    add('butterflies', (env, time) => {
      flies.forEach((g) => {
        const u = g.userData;
        const vis = smoothstep(u.thr - 0.05, u.thr + 0.1, env.butterflies);
        g.visible = vis > 0.02;
        if (!g.visible) return;
        const a = time * 0.6 + u.ph;
        const x = u.home.x + Math.cos(a) * u.r + Math.sin(a * 2.3) * 1.2;
        const z = u.home.z + Math.sin(a * 1.3) * u.r;
        g.position.set(x, heightAt(x, z) + 1.6 + Math.sin(time * 2 + u.ph) * 0.5, z);
        g.rotation.y = a + Math.PI / 2;
        const f = Math.sin(time * 16 + u.ph) * 1.1;
        u.pivotL.rotation.z = f;
        u.pivotR.rotation.z = -f;
        g.scale.setScalar(vis);
      });
    });
  } catch (e) {
    log.error('life.butterflies', e);
  }

  // ---------- 小馆的猫 ----------
  try {
    const catM = lambert('#e3a35c', 'cat');
    const catDark = lambert('#b8743a', 'catDark');
    const g = new THREE.Group();
    const parts = new Parts('cat');
    parts.add(catM, G.ico0, [0, 0.38, 0], [0, 0, 0], [0.55, 0.6, 0.8]);
    parts.add(catM, G.ico0, [0, 0.8, 0.3], [0, 0, 0], [0.45, 0.42, 0.42]);
    parts.add(catDark, G.cone4, [0.13, 1.03, 0.3], [0, Math.PI / 4, 0], [0.14, 0.2, 0.14]);
    parts.add(catDark, G.cone4, [-0.13, 1.03, 0.3], [0, Math.PI / 4, 0], [0.14, 0.2, 0.14]);
    parts.build(g);
    const tail = new THREE.Group();
    const tailMesh = new THREE.Mesh(G.cyl6, catDark);
    tailMesh.scale.set(0.09, 0.8, 0.09);
    tailMesh.position.y = 0.4;
    tail.add(tailMesh);
    tail.position.set(0, 0.25, -0.38);
    tail.rotation.x = -1.0;
    g.add(tail);
    const E = layout.eatery;
    // 小馆露台椅子上（局部 -2.6+1.1cos, 0.85+0.45, 5.4+...）
    const local = new THREE.Vector3(-2.6 + Math.cos(0.4) * 1.1, 0.85 + 0.5, 5.4 + Math.sin(0.4) * 1.1).applyAxisAngle(THREE.Object3D.DEFAULT_UP, E.rotY);
    g.position.set(E.x + local.x, E.y + local.y, E.z + local.z);
    g.rotation.y = E.rotY + 2.6;
    g.scale.setScalar(0.85);
    group.add(g);
    add('cat', (env, time) => {
      tail.rotation.z = Math.sin(time * 1.3) * 0.5;
      tail.rotation.x = -1.0 + Math.sin(time * 0.7) * 0.2;
    });
  } catch (e) {
    log.error('life.cat', e);
  }

  // ---------- 季节粒子 ----------
  const particles = buildParticles(vegetation, layout, rng);
  group.add(particles.group);

  function update(env, time, dt, fade, camera) {
    for (let i = 0; i < updaters.length; i++) {
      try {
        updaters[i].fn(env, time, dt);
      } catch (e) {
        log.errorThrottled(`life.update.${updaters[i].name}`, e);
      }
    }
    particles.update(env, time, dt, fade, camera);
  }

  return { group, update };
}

function buildParticles(vegetation, layout, rng) {
  const group = new THREE.Group();
  group.name = 'particles';
  const tex = sprite(64);

  // 雪
  const SNOW = 2600;
  const snowPos = new Float32Array(SNOW * 3);
  const snowVel = new Float32Array(SNOW);
  for (let i = 0; i < SNOW; i++) {
    snowPos[i * 3] = (rng() - 0.5) * 240;
    snowPos[i * 3 + 1] = rng() * 70;
    snowPos[i * 3 + 2] = (rng() - 0.5) * 240;
    snowVel[i] = 2 + rng() * 2.5;
  }
  const snowGeo = new THREE.BufferGeometry();
  snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
  const snowMat = new THREE.PointsMaterial({ color: '#ffffff', size: 0.7, map: tex, transparent: true, depthWrite: false, opacity: 0, fog: true });
  snowMat.name = 'snow';
  const snow = new THREE.Points(snowGeo, snowMat);
  snow.frustumCulled = false;
  group.add(snow);

  // 落叶 / 花瓣：从阔叶树冠和连理所落下
  const LEAF = 260;
  const leafPos = new Float32Array(LEAF * 3);
  const leafData = [];
  const sources = (vegetation && vegetation.broad.length ? vegetation.broad : [{ x: 0, y: 5, z: 0, s: 1 }]).slice();
  const lianli = layout.lianli;
  const spawnLeaf = (i, randomY) => {
    const fromArch = i % 4 === 0;
    const src = fromArch ? { x: lianli.x, y: lianli.y, z: lianli.z, s: 1 } : sources[Math.floor(rng() * sources.length)];
    const top = src.y + 3.6 * src.s + 1;
    const ground = src.y;
    leafData[i] = { ground: ground - 0.2, ph: rng() * TAU, sp: 0.6 + rng() * 0.6 };
    leafPos[i * 3] = src.x + (rng() - 0.5) * 3;
    leafPos[i * 3 + 1] = randomY ? ground + rng() * (top - ground) : top;
    leafPos[i * 3 + 2] = src.z + (rng() - 0.5) * 3;
  };
  for (let i = 0; i < LEAF; i++) spawnLeaf(i, true);
  const leafGeo = new THREE.BufferGeometry();
  leafGeo.setAttribute('position', new THREE.BufferAttribute(leafPos, 3));
  const leafMat = new THREE.PointsMaterial({ color: '#e08a3c', size: 0.55, map: tex, transparent: true, depthWrite: false, opacity: 0, fog: true });
  leafMat.name = 'leaves';
  const leaves = new THREE.Points(leafGeo, leafMat);
  leaves.frustumCulled = false;
  group.add(leaves);

  // 萤火：花丛和灌木附近
  const FF = 140;
  const ffPos = new Float32Array(FF * 3);
  const ffData = [];
  const ffSrc = (vegetation && vegetation.bush.length ? vegetation.bush.concat(vegetation.flowers) : [{ x: 0, y: 2, z: 0 }]);
  for (let i = 0; i < FF; i++) {
    const s = ffSrc[Math.floor(rng() * ffSrc.length)];
    ffData.push({ x: s.x, y: s.y + 0.8, z: s.z, ph: rng() * TAU, r: 0.8 + rng() * 2 });
  }
  const ffGeo = new THREE.BufferGeometry();
  ffGeo.setAttribute('position', new THREE.BufferAttribute(ffPos, 3));
  const ffMat = new THREE.PointsMaterial({ color: '#d8ff7a', size: 0.9, map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, fog: false });
  ffMat.name = 'fireflies';
  const ff = new THREE.Points(ffGeo, ffMat);
  ff.frustumCulled = false;
  group.add(ff);

  const petal = new THREE.Color('#f7b9cf');
  const leafC = new THREE.Color();

  function update(env, time, dt, fade) {
    try {
      // 雪
      const sAmt = env.snowfall;
      snowMat.opacity = sAmt * 0.9 * fade;
      snow.visible = snowMat.opacity > 0.01;
      if (snow.visible) {
        const wx = 1 + env.wind * 8;
        for (let i = 0; i < SNOW; i++) {
          snowPos[i * 3 + 1] -= snowVel[i] * dt;
          snowPos[i * 3] += (wx + Math.sin(time + i) * 0.6) * dt;
          snowPos[i * 3 + 2] -= wx * 0.6 * dt;
          if (snowPos[i * 3 + 1] < -1) {
            snowPos[i * 3 + 1] = 60 + rng() * 10;
          }
          if (snowPos[i * 3] > 120) snowPos[i * 3] -= 240;
          if (snowPos[i * 3 + 2] < -120) snowPos[i * 3 + 2] += 240;
        }
        snowGeo.attributes.position.needsUpdate = true;
      }
      // 落叶 / 花瓣
      const lAmt = Math.max(env.leaves, env.petals);
      leafMat.opacity = clamp(lAmt, 0, 1) * 0.95 * fade;
      leaves.visible = leafMat.opacity > 0.01;
      if (leaves.visible) {
        leafC.copy(env.leaf).lerp(petal, env.petals / Math.max(0.001, env.petals + env.leaves));
        leafMat.color.copy(leafC);
        const wind = 0.4 + env.wind * 4;
        for (let i = 0; i < LEAF; i++) {
          const d = leafData[i];
          leafPos[i * 3 + 1] -= d.sp * dt;
          leafPos[i * 3] += (Math.sin(time * 1.7 + d.ph) * 0.9 + wind) * dt;
          leafPos[i * 3 + 2] += (Math.cos(time * 1.3 + d.ph) * 0.9 - wind * 0.6) * dt;
          if (leafPos[i * 3 + 1] < d.ground) spawnLeaf(i, false);
        }
        leafGeo.attributes.position.needsUpdate = true;
      }
      // 萤火
      ffMat.opacity = env.fireflies * fade;
      ff.visible = ffMat.opacity > 0.01;
      if (ff.visible) {
        for (let i = 0; i < FF; i++) {
          const d = ffData[i];
          const a = time * 0.4 + d.ph;
          ffPos[i * 3] = d.x + Math.cos(a) * d.r;
          ffPos[i * 3 + 1] = d.y + Math.sin(a * 1.7) * 0.6 + (Math.sin(time * 2.3 + d.ph * 3) > 0.2 ? 0 : -1000);
          ffPos[i * 3 + 2] = d.z + Math.sin(a * 1.2) * d.r;
        }
        ffGeo.attributes.position.needsUpdate = true;
      }
    } catch (e) {
      log.errorThrottled('life.particles.update', e);
    }
  }

  return { group, update };
}
