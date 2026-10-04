// 布局：把地点数据落到地形上——定坐标、压平台、铺小路、定朝向。

import * as THREE from '../../vendor/three.bundle.min.js';
import { log } from '../core/logger.js';
import { SURFACE, surfacePaths } from './places-data.js';
import { coastPoint, naturalHeight, setPadsAndPaths, heightAt, getFeature, setupFeatures } from './terrain.js';

export function computeLayout() {
  const feature = setupFeatures();
  const pos = {};
  const extraPads = [];
  SURFACE.forEach((p) => {
    try {
      if (p.at) {
        pos[p.id] = { x: p.at.x, z: p.at.z };
      } else if (p.coast !== undefined) {
        const v = coastPoint(p.coast, p.inset || 0);
        pos[p.id] = { x: v.x, z: v.z, theta: p.coast };
      } else if (p.lighthouse) {
        pos[p.id] = { x: feature.islet.x, z: feature.islet.y };
      }
    } catch (e) {
      log.error('layout.position', e, { id: p.id });
    }
  });

  // 盐田：岸工坊和海之间
  const saltCenter = coastPoint(-0.12, 6.5);
  extraPads.push({ x: saltCenter.x, z: saltCenter.z, r: 7.5, soft: 4, h: 1.55 });

  const pads = [];
  SURFACE.forEach((p) => {
    const q = pos[p.id];
    if (!q || !p.pad) return;
    let h = naturalHeight(q.x, q.z);
    if (p.id === 'plaza') h = Math.max(h, 6.5);
    if (p.id === 'entrance') h = Math.max(h, 4);
    pads.push({ x: q.x, z: q.z, r: p.pad, soft: p.id === 'plaza' ? 9 : 6, h });
  });
  const paths = surfacePaths(pos);
  setPadsAndPaths(pads.concat(extraPads), paths);

  const layout = {};
  SURFACE.forEach((p) => {
    const q = pos[p.id];
    if (!q) return;
    let rotY = Math.atan2(-q.x, -q.z); // 默认正面朝广场
    let y = heightAt(q.x, q.z);
    if (p.id === 'plaza') rotY = 0;
    if (p.id === 'beach') {
      rotY = Math.atan2(Math.cos(p.coast), Math.sin(p.coast)); // 码头朝外海
      y = 0;
    }
    if (p.id === 'cliff') rotY = Math.atan2(Math.cos(p.coast), Math.sin(p.coast));
    if (p.id === 'lighthouse') {
      rotY = Math.atan2(-q.x, -q.z);
      y = heightAt(q.x, q.z);
    }
    layout[p.id] = { x: q.x, y, z: q.z, rotY };
  });
  layout.saltPans = { x: saltCenter.x, y: heightAt(saltCenter.x, saltCenter.z), z: saltCenter.z, rotY: Math.atan2(Math.cos(-0.12), Math.sin(-0.12)) };

  // 植被避让区
  const excl = pads.concat(extraPads).map((p) => ({ x: p.x, z: p.z, r: p.r + 3 }));
  if (layout.beach) {
    // 码头根部和沙滩
    const b = layout.beach;
    excl.push({ x: b.x, z: b.z, r: 12 });
  }
  if (layout.cliff) excl.push({ x: layout.cliff.x, z: layout.cliff.z, r: 9 });

  // 阵风后的漂流物：东岸盐田湾附近的沙滩上
  const salvagePts = [];
  for (let i = 0; i < 40 && salvagePts.length < 7; i++) {
    const th = -0.45 + i * 0.022;
    const p = coastPoint(th, 1.2 + (i % 3) * 0.9);
    const h = heightAt(p.x, p.z);
    if (h > 0.25 && h < 2.4) salvagePts.push(new THREE.Vector3(p.x, h, p.z));
  }

  log.info('layout.compute', '布局完成', Object.fromEntries(Object.entries(layout).map(([k, v]) => [k, [Math.round(v.x), Math.round(v.y * 10) / 10, Math.round(v.z)]])));
  return { layout, excl, salvagePts, feature: getFeature() };
}
