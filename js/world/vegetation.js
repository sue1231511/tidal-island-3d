// 植被与石头：全部实例化。阔叶树冠跟季节变色、冬天变稀；针叶树常绿；
// 近岸的礁石半淹在水里，退潮时露出来。

import * as THREE from '../../vendor/three.bundle.min.js';
import { log } from '../core/logger.js';
import { mulberry32, createNoise2D, smoothstep } from '../core/noise.js';
import { heightAt, slopeAt, coastCoords, pathWeightAt } from './terrain.js';
import { seasonal, mat } from './materials.js';

const noise = createNoise2D(6060);

function excluded(x, z, excl) {
  for (const e of excl) {
    const dx = x - e.x;
    const dz = z - e.z;
    if (dx * dx + dz * dz < e.r * e.r) return true;
  }
  return false;
}

export function buildVegetation(excl) {
  const group = new THREE.Group();
  group.name = 'vegetation';
  const rng = mulberry32(777);
  const broad = [];
  const conifer = [];
  const bush = [];
  const flowers = [];
  const rocks = [];
  const reefs = [];

  try {
    for (let i = 0; i < 9000; i++) {
      const x = (rng() - 0.5) * 230;
      const z = (rng() - 0.5) * 230;
      const h = heightAt(x, z);
      if (h < -3.5) continue;
      const cc = coastCoords(x, z);
      // 近岸礁石：s 在 [-0.14, -0.01]，半淹
      if (h < 0.4) {
        if (cc.s < -0.01 && cc.s > -0.14 && h > -3.2 && rng() < 0.05 + cc.c * 0.12) {
          reefs.push({ x, z, y: h, s: 0.8 + rng() * 2.2 + cc.c * 1.5, r: rng() * 6 });
        }
        continue;
      }
      if (excluded(x, z, excl)) continue;
      if (pathWeightAt(x, z) > 0.12) continue;
      const slope = slopeAt(x, z);
      const forest = 0.5 + 0.5 * noise(x * 0.022, z * 0.022);
      if (slope > 1.1) {
        if (rng() < 0.06) rocks.push({ x, z, y: h, s: 1 + rng() * 2.2, r: rng() * 6 });
        continue;
      }
      if (h < 1.7) {
        // 沙滩：偶尔几块石头
        if (rng() < 0.012) rocks.push({ x, z, y: h, s: 0.6 + rng() * 1.2, r: rng() * 6 });
        continue;
      }
      const roll = rng();
      if (roll < forest * forest * 0.11) {
        const high = smoothstep(9, 16, h) + cc.c * 0.4;
        if (rng() < 0.25 + high * 0.5) conifer.push({ x, z, y: h, s: 0.8 + rng() * 0.7, r: rng() * 6 });
        else broad.push({ x, z, y: h, s: 0.75 + rng() * 0.65, r: rng() * 6, alt: rng() < 0.3 });
      } else if (roll < 0.11 + forest * 0.05) {
        bush.push({ x, z, y: h, s: 0.6 + rng() * 0.7, r: rng() * 6 });
      } else if (roll < 0.17 && forest < 0.55) {
        // 花：成簇
        for (let k = 0; k < 5; k++) {
          const fx = x + (rng() - 0.5) * 3;
          const fz = z + (rng() - 0.5) * 3;
          if (excluded(fx, fz, excl)) continue;
          flowers.push({ x: fx, z: fz, y: heightAt(fx, fz), s: 0.3 + rng() * 0.25, r: rng() * 6 });
        }
      } else if (roll < 0.19) {
        rocks.push({ x, z, y: h, s: 0.5 + rng() * 1.0, r: rng() * 6 });
      }
    }
  } catch (e) {
    log.error('vegetation.scatter', e);
  }

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const e = new THREE.Euler();

  function inst(geo, material, list, fn, name) {
    const mesh = new THREE.InstancedMesh(geo, material, Math.max(1, list.length));
    mesh.count = list.length;
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    list.forEach((it, i) => {
      fn(it, i);
      mesh.setMatrixAt(i, m4);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
    return mesh;
  }

  const shade = (mesh, list, rngSeed) => {
    const r = mulberry32(rngSeed);
    const c = new THREE.Color();
    list.forEach((it, i) => {
      const k = 0.82 + r() * 0.3;
      c.setRGB(k, k * (0.96 + r() * 0.08), k * (0.9 + r() * 0.1));
      mesh.setColorAt(i, c);
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  };

  // 阔叶树：树干 + 两团树冠
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.35, 2.6, 5);
  trunkGeo.translate(0, 1.2, 0);
  const crownGeo = new THREE.IcosahedronGeometry(1.6, 0);
  crownGeo.translate(0, 3.6, 0);
  const crown2Geo = new THREE.IcosahedronGeometry(1.1, 0);
  crown2Geo.translate(0.7, 4.6, 0.3);
  const conTrunk = new THREE.CylinderGeometry(0.18, 0.28, 1.6, 5);
  conTrunk.translate(0, 0.7, 0);
  const conGeo = (() => {
    const a = new THREE.ConeGeometry(1.7, 2.8, 6);
    a.translate(0, 2.6, 0);
    const b = new THREE.ConeGeometry(1.3, 2.4, 6);
    b.translate(0, 3.9, 0);
    const c = new THREE.ConeGeometry(0.85, 2.0, 6);
    c.translate(0, 5.0, 0);
    const pos = [];
    [a, b, c].forEach((g) => {
      const n = g.toNonIndexed();
      pos.push(...n.attributes.position.array);
    });
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.computeVertexNormals();
    return out;
  })();
  const bushGeo = new THREE.DodecahedronGeometry(0.9, 0);
  bushGeo.translate(0, 0.5, 0);
  const flowerGeo = new THREE.IcosahedronGeometry(0.5, 0);
  flowerGeo.translate(0, 0.4, 0);
  const rockGeo = new THREE.DodecahedronGeometry(0.8, 0);

  const place = (it, sy = 1, sink = 0.1) => {
    e.set(0, it.r, 0);
    q.setFromEuler(e);
    v.set(it.x, it.y - sink, it.z);
    sc.set(it.s, it.s * sy, it.s);
    m4.compose(v, q, sc);
  };

  inst(trunkGeo, seasonal.trunk, broad, (it) => place(it), 'tree-trunk');
  const crowns = inst(crownGeo, seasonal.leaf, broad, (it) => place(it), 'tree-crown');
  const crowns2 = inst(crown2Geo, seasonal.leaf2, broad, (it) => place(it), 'tree-crown2');
  shade(crowns, broad, 1);
  shade(crowns2, broad, 2);
  inst(conTrunk, seasonal.trunk, conifer, (it) => place(it), 'conifer-trunk');
  const cons = inst(conGeo, seasonal.conifer, conifer, (it) => place(it, 1.1), 'conifer');
  shade(cons, conifer, 3);
  const bushes = inst(bushGeo, seasonal.leaf, bush, (it) => place(it, 0.8, 0.2), 'bush');
  shade(bushes, bush, 4);
  const flowerMesh = inst(flowerGeo, seasonal.flower, flowers, (it) => place(it, 0.8, 0.05), 'flowers');
  flowerMesh.castShadow = false;
  const rockMat = mat('stoneDark');
  const rockMesh = inst(rockGeo, rockMat, rocks.concat(reefs), (it) => {
    e.set(it.r * 0.3, it.r, it.r * 0.2);
    q.setFromEuler(e);
    v.set(it.x, it.y - it.s * 0.15, it.z);
    sc.set(it.s * 1.2, it.s * 0.75, it.s);
    m4.compose(v, q, sc);
  }, 'rocks');
  shade(rockMesh, rocks.concat(reefs), 5);

  // 季节：树冠大小和花的多少随权重变化，只在变化时重算矩阵
  let lastLeaf = -1;
  let lastFlower = -1;
  function rescale(mesh, list, k, yScale = 1, sink = 0.1) {
    list.forEach((it, i) => {
      e.set(0, it.r, 0);
      q.setFromEuler(e);
      // 缩放以树冠底部为中心，避免树冠沉进地里
      const s = it.s * k;
      v.set(it.x, it.y - sink, it.z);
      sc.set(Math.max(0.001, s), Math.max(0.001, s * yScale), Math.max(0.001, s));
      m4.compose(v, q, sc);
      mesh.setMatrixAt(i, m4);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }

  function update(env) {
    try {
      const leaf = 0.55 + env.leafAmount * 0.45;
      if (Math.abs(leaf - lastLeaf) > 0.004) {
        lastLeaf = leaf;
        // 树冠围绕树干顶部缩放：通过树冠几何本身在 y=3.6 处，整体缩放会下沉，补偿用 sy 保持高度
        rescaleCrown(crowns, broad, leaf, 3.6);
        rescaleCrown(crowns2, broad, leaf * 0.95, 4.6);
        rescale(bushes, bush, 0.6 + env.leafAmount * 0.4, 0.8, 0.2);
      }
      const fl = env.flowerAmount;
      if (Math.abs(fl - lastFlower) > 0.004) {
        lastFlower = fl;
        rescale(flowerMesh, flowers, fl, 0.8, 0.05);
        flowerMesh.visible = fl > 0.05;
      }
    } catch (err) {
      log.errorThrottled('vegetation.update', err);
    }
  }

  // 树冠缩放：保持树冠中心高度不变（几何中心在 y=cy）
  function rescaleCrown(mesh, list, k, cy) {
    list.forEach((it, i) => {
      e.set(0, it.r, 0);
      q.setFromEuler(e);
      const s = it.s * k;
      v.set(it.x, it.y - 0.1 + cy * it.s * (1 - k), it.z);
      sc.set(s, s, s);
      m4.compose(v, q, sc);
      mesh.setMatrixAt(i, m4);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }

  log.info('vegetation.build', '植被完成', {
    阔叶: broad.length,
    针叶: conifer.length,
    灌木: bush.length,
    花: flowers.length,
    石: rocks.length,
    礁: reefs.length,
  });

  return {
    group,
    update,
    trees: broad.concat(conifer),
    broad,
    flowers,
    bush,
  };
}
