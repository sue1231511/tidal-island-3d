// 潮汐岛 3D：入口。
// 组装地形、海、天、地点、植被、小生命、井下和界面；每帧按世界状态更新。

import * as THREE from '../lib/three.bundle.min.js';
import { OrbitControls } from '../lib/three.bundle.min.js';
import { log } from './core/logger.js';
import { selfTest } from './core/clock.js';
import { createWorldState } from './core/state.js';
import { smoothstep, clamp } from './core/noise.js';
import { buildTerrain, buildHeightTexture, updateTerrain, heightAt } from './world/terrain.js';
import { computeLayout } from './world/layout.js';
import { buildWater } from './world/water.js';
import { buildSky } from './world/sky.js';
import { GlowField, GLOW_GROUP } from './world/glow.js';
import { initGlowMaterials, initSeasonalMaterials, updateMaterials, updateSeasonalMaterials, setSurfaceFade } from './world/materials.js';
import { buildSurfacePlaces, buildOreVeins, buildSaltPans, buildSalvage } from './world/buildings.js';
import { buildVegetation } from './world/vegetation.js';
import { buildLife } from './world/life.js';
import { buildUnderground } from './world/underground.js';
import { SURFACE } from './world/places-data.js';
import { createUI, showFatal } from './ui/ui.js';

const QUALITY_KEY = 'tidal-island-3d.quality';

function readQuality() {
  try {
    const v = window.localStorage.getItem(QUALITY_KEY);
    if (v === 'high' || v === 'low') return v;
  } catch (e) {
    log.warn('main.readQuality', '读取本地画质设置失败，用默认值', { message: e && e.message });
  }
  let coarse = false;
  try {
    coarse = window.matchMedia('(pointer: coarse)').matches;
  } catch (e) {
    log.warn('main.readQuality', 'matchMedia 不可用', { message: e && e.message });
  }
  return coarse ? 'low' : 'high';
}

function saveQuality(q) {
  try {
    window.localStorage.setItem(QUALITY_KEY, q);
  } catch (e) {
    log.warn('main.saveQuality', '保存画质设置失败（不影响使用）', { message: e && e.message });
  }
}

function hideLoader() {
  const loader = document.getElementById('loader');
  if (!loader) return;
  loader.classList.add('fade');
  setTimeout(() => loader.classList.add('hidden'), 900);
}

function setLoaderText(t) {
  const n = document.querySelector('#loader .loader-text');
  if (n) n.textContent = t;
}

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

async function main() {
  selfTest();
  const container = document.getElementById('stage');
  const uiRoot = document.getElementById('ui');
  let quality = readQuality();

  // ---------- 渲染器 ----------
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  } catch (e) {
    log.error('main.renderer', e, { ua: navigator.userAgent });
    showFatal('这台设备的浏览器没能打开 3D（WebGL）。换一个浏览器，或者在系统设置里打开硬件加速再试试。');
    return;
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.enabled = quality === 'high';
  const applyPixelRatio = () => renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === 'high' ? 2 : 1.5));
  applyPixelRatio();
  container.appendChild(renderer.domElement);
  renderer.domElement.addEventListener('webglcontextlost', (ev) => {
    ev.preventDefault();
    log.error('main.webglcontextlost', new Error('WebGL 上下文丢失'), { quality });
    showFatal('显卡上下文丢失了（可能是手机内存紧张）。刷新一下页面就好；如果反复出现，在工作台里把画质调成省电。');
  });

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 4000);

  const world = createWorldState();
  const env = world.env;

  setLoaderText('正在把岛从海里捞起来');
  await nextFrame();

  initGlowMaterials();
  initSeasonalMaterials();

  // ---------- 地形与布局 ----------
  let layoutData;
  let terrain;
  let heightTex;
  try {
    layoutData = computeLayout();
    terrain = buildTerrain();
    scene.add(terrain);
    heightTex = buildHeightTexture(256);
  } catch (e) {
    log.error('main.terrain', e);
    showFatal('地形生成失败了。打开浏览器控制台能看到详细原因。');
    return;
  }
  const { layout } = layoutData;

  setLoaderText('海水正在涨上来');
  await nextFrame();
  const water = buildWater(heightTex);
  scene.add(water.mesh);
  const sky = buildSky(scene);
  sky.sun.castShadow = quality === 'high';

  setLoaderText('盖房子，种树');
  await nextFrame();
  const glowField = new GlowField('all');
  const surface = buildSurfacePlaces(SURFACE, layout, glowField);
  scene.add(surface.group);
  const ores = buildOreVeins(SURFACE.find((p) => p.id === 'cliff').coast);
  scene.add(ores.group);
  const salt = buildSaltPans(layout.saltPans, layout.saltPans.rotY, layout.saltPans.y);
  scene.add(salt.group);
  const salvage = buildSalvage(layoutData.salvagePts);
  scene.add(salvage.group);
  const vegetation = buildVegetation(layoutData.excl);
  scene.add(vegetation.group);

  setLoaderText('放出海鸥和螃蟹');
  await nextFrame();
  const life = buildLife({ layout, vegetation });
  scene.add(life.group);

  setLoaderText('往井下挖');
  await nextFrame();
  const entrance = layout.entrance;
  // 竖井在洞口里面（局部 -z 方向几米）
  const shaftLocal = new THREE.Vector3(0, 0, -3).applyAxisAngle(THREE.Object3D.DEFAULT_UP, entrance.rotY);
  const shaftTop = new THREE.Vector3(entrance.x + shaftLocal.x, entrance.y, entrance.z + shaftLocal.z);
  const under = buildUnderground(shaftTop, glowField);
  under.group.visible = false;
  scene.add(under.group);
  scene.add(glowField.build());

  // ---------- 地点索引 ----------
  const placesById = {};
  surface.places.forEach((p) => {
    placesById[p.id] = Object.assign(p, { under: false });
  });
  under.places.forEach((p) => {
    placesById[p.id] = Object.assign(p, { under: true });
  });
  const surfaceHits = surface.places.map((p) => p.hit);
  const underHits = under.places.map((p) => p.hit);

  // ---------- 镜头 ----------
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.6;
  controls.zoomSpeed = 0.9;
  controls.panSpeed = 0.7;
  controls.screenSpacePanning = false;

  const SURFACE_VIEW = { target: new THREE.Vector3(10, 3, 12), offset: new THREE.Vector3(8, 138, 196) };
  const UNDER_VIEW = { target: under.center.clone(), offset: new THREE.Vector3(0, 78, -96) };
  const LIMITS = {
    surface: { minD: 32, maxD: 470, minP: 0.12, maxP: 1.33, r: 100, yMin: 0, yMax: 22 },
    under: { minD: 22, maxD: 250, minP: 0.12, maxP: 1.28, r: 70, yMin: -46, yMax: -12 },
  };
  let layer = 'surface';
  const applyLimits = (which) => {
    const L = LIMITS[which];
    controls.minDistance = L.minD;
    controls.maxDistance = L.maxD;
    controls.minPolarAngle = L.minP;
    controls.maxPolarAngle = L.maxP;
  };
  applyLimits('surface');
  // 竖屏时把默认镜头拉远一些，整座岛都能放进画面
  const viewScale = () => {
    const a = (container.clientWidth || window.innerWidth) / (container.clientHeight || window.innerHeight);
    return a < 1 ? clamp(0.86 / a, 1, 2.0) : 1;
  };
  const surfaceHome = () => SURFACE_VIEW.target.clone().add(SURFACE_VIEW.offset.clone().multiplyScalar(viewScale()));
  const underHome = () => UNDER_VIEW.target.clone().add(UNDER_VIEW.offset.clone().multiplyScalar(viewScale()));
  camera.position.copy(surfaceHome());
  controls.target.copy(SURFACE_VIEW.target);
  controls.update();

  const clampTarget = () => {
    const L = LIMITS[layer];
    const t = controls.target;
    const c = layer === 'surface' ? new THREE.Vector3(0, 0, 0) : UNDER_VIEW.target;
    const dx = t.x - c.x;
    const dz = t.z - c.z;
    const d = Math.hypot(dx, dz);
    if (d > L.r) {
      t.x = c.x + (dx / d) * L.r;
      t.z = c.z + (dz / d) * L.r;
    }
    t.y = clamp(t.y, L.yMin, L.yMax);
  };

  // 镜头动画
  let anim = null;
  const lastSurfaceView = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
  function animateCamera(keys, duration, onDone) {
    // keys: [{ pos, target, at }]，at ∈ [0,1]
    anim = { keys, duration, t: 0, onDone };
    controls.enabled = false;
    controls.autoRotate = false;
  }
  function stepAnim(dt) {
    if (!anim) return;
    anim.t += dt / anim.duration;
    const t = Math.min(1, anim.t);
    const k = anim.keys;
    let i = 0;
    while (i < k.length - 2 && t > k[i + 1].at) i++;
    const a = k[i];
    const b = k[i + 1];
    const lt = smoothstep(0, 1, (t - a.at) / Math.max(0.0001, b.at - a.at));
    camera.position.lerpVectors(a.pos, b.pos, lt);
    controls.target.lerpVectors(a.target, b.target, lt);
    camera.lookAt(controls.target);
    if (anim.u) anim.u(t);
    if (t >= 1) {
      const done = anim.onDone;
      anim = null;
      controls.enabled = true;
      if (done) done();
    }
  }

  // 井下程度：0 地上，1 井下
  let underAmount = 0;
  let underTarget = 0;

  const entranceFocus = new THREE.Vector3(entrance.x, entrance.y + 2, entrance.z);
  const entranceFront = new THREE.Vector3(0, 0, 1).applyAxisAngle(THREE.Object3D.DEFAULT_UP, entrance.rotY);

  function descend() {
    if (layer === 'under' || anim) return;
    try {
      ui.closeCard();
      lastSurfaceView.pos.copy(camera.position);
      lastSurfaceView.target.copy(controls.target);
      const nearPos = entranceFocus.clone().addScaledVector(entranceFront, 26).add(new THREE.Vector3(0, 16, 0));
      const sinkPos = shaftTop.clone().addScaledVector(entranceFront, 10).add(new THREE.Vector3(0, -8, 0));
      const finalPos = underHome();
      animateCamera(
        [
          { pos: camera.position.clone(), target: controls.target.clone(), at: 0 },
          { pos: nearPos, target: entranceFocus.clone(), at: 0.35 },
          { pos: sinkPos, target: shaftTop.clone().add(new THREE.Vector3(0, -22, 0)), at: 0.62 },
          { pos: finalPos, target: UNDER_VIEW.target.clone(), at: 1 },
        ],
        3.6,
        () => {
          layer = 'under';
          applyLimits('under');
        }
      );
      underTarget = 1;
      ui.setLayer('under');
    } catch (e) {
      log.error('main.descend', e);
    }
  }

  function ascend() {
    if (layer === 'surface' || anim) return;
    try {
      ui.closeCard();
      layer = 'surface';
      const backPos = lastSurfaceView.pos.lengthSq() > 0 ? lastSurfaceView.pos.clone() : surfaceHome();
      const backTarget = lastSurfaceView.pos.lengthSq() > 0 ? lastSurfaceView.target.clone() : SURFACE_VIEW.target.clone();
      const risePos = shaftTop.clone().addScaledVector(entranceFront, 14).add(new THREE.Vector3(0, -4, 0));
      animateCamera(
        [
          { pos: camera.position.clone(), target: controls.target.clone(), at: 0 },
          { pos: risePos, target: shaftTop.clone().add(new THREE.Vector3(0, -12, 0)), at: 0.35 },
          { pos: entranceFocus.clone().addScaledVector(entranceFront, 30).add(new THREE.Vector3(0, 18, 0)), target: entranceFocus.clone(), at: 0.65 },
          { pos: backPos, target: backTarget, at: 1 },
        ],
        3.4,
        () => applyLimits('surface')
      );
      underTarget = 0;
      ui.setLayer('surface');
    } catch (e) {
      log.error('main.ascend', e);
    }
  }

  function resetView() {
    if (anim) return;
    const v = layer === 'surface' ? SURFACE_VIEW : UNDER_VIEW;
    animateCamera(
      [
        { pos: camera.position.clone(), target: controls.target.clone(), at: 0 },
        { pos: layer === 'surface' ? surfaceHome() : underHome(), target: v.target.clone(), at: 1 },
      ],
      1.6
    );
  }

  function focusPlace(id) {
    const p = placesById[id];
    if (!p || anim) return;
    if (p.under !== (layer === 'under')) {
      log.warn('main.focusPlace', '这个地点不在当前这一层', { id, layer });
      return;
    }
    const dir = camera.position.clone().sub(controls.target);
    dir.y = 0;
    if (dir.lengthSq() < 0.01) dir.set(0, 0, 1);
    dir.normalize();
    const dist = p.under ? 34 : 46;
    const pos = p.focus.clone().addScaledVector(dir, dist * 0.75).add(new THREE.Vector3(0, dist * 0.62, 0));
    animateCamera(
      [
        { pos: camera.position.clone(), target: controls.target.clone(), at: 0 },
        { pos, target: p.focus.clone(), at: 1 },
      ],
      1.5
    );
  }

  function toggleQuality() {
    quality = quality === 'high' ? 'low' : 'high';
    saveQuality(quality);
    applyPixelRatio();
    renderer.shadowMap.enabled = quality === 'high';
    sky.sun.castShadow = quality === 'high';
    scene.traverse((o) => {
      if (o.material) {
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
          m.needsUpdate = true;
        });
      }
    });
    resize();
    log.info('main.quality', `画质切换为 ${quality}`);
  }

  // ---------- 界面 ----------
  const ui = createUI({
    world,
    root: uiRoot,
    placesById,
    onDescend: descend,
    onAscend: ascend,
    onReset: resetView,
    onFocus: focusPlace,
    onQuality: toggleQuality,
    getQuality: () => quality,
  });
  surface.refreshSigns(world.info);
  world.onChange(() => surface.refreshSigns(world.info));

  // ---------- 点选 ----------
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let down = null;
  let lastInteract = performance.now();
  renderer.domElement.addEventListener('pointerdown', (ev) => {
    down = { x: ev.clientX, y: ev.clientY, t: performance.now() };
    lastInteract = performance.now();
    controls.autoRotate = false;
  });
  renderer.domElement.addEventListener('pointerup', (ev) => {
    try {
      lastInteract = performance.now();
      if (!down) return;
      const moved = Math.hypot(ev.clientX - down.x, ev.clientY - down.y);
      const quick = performance.now() - down.t < 500;
      down = null;
      if (moved > 7 || !quick || anim) return;
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(layer === 'surface' ? surfaceHits : underHits, false);
      if (hits.length) ui.openCard(hits[0].object.userData.placeId);
      else ui.closeCard();
    } catch (e) {
      log.error('main.pick', e, { layer });
    }
  });
  renderer.domElement.addEventListener('wheel', () => {
    lastInteract = performance.now();
    controls.autoRotate = false;
  }, { passive: true });

  // ---------- 尺寸 ----------
  function resize() {
    try {
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.fov = w < h ? 58 : 45;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      const bufH = renderer.getDrawingBufferSize(new THREE.Vector2()).y;
      glowField.uniforms.uScale.value = bufH / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    } catch (e) {
      log.error('main.resize', e);
    }
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------- 初始状态 ----------
  world.update(0, Date.now());
  if (salt.update.prime) salt.update.prime(env);

  // ---------- 主循环 ----------
  const timer = new THREE.Timer();
  timer.connect(document);
  let time = 0;
  const vProj = new THREE.Vector3();
  const project = (v) => {
    vProj.copy(v).project(camera);
    const w = renderer.domElement.clientWidth;
    const h = renderer.domElement.clientHeight;
    return { x: (vProj.x * 0.5 + 0.5) * w, y: (-vProj.y * 0.5 + 0.5) * h, z: vProj.z, dist: camera.position.distanceTo(v) };
  };
  const underHemiSky = new THREE.Color('#ffd7a3');
  const underHemiGround = new THREE.Color('#2b2230');
  const underFog = new THREE.Color('#17151d');
  const tmpC = new THREE.Color();
  let lastNight = null;
  let surfaceHidden = false;

  function frame(ts) {
    requestAnimationFrame(frame);
    timer.update(ts);
    const dt = Math.min(timer.getDelta(), 0.1);
    time += dt;
    try {
      world.update(dt, Date.now());

      // 井下程度
      underAmount += (underTarget - underAmount) * Math.min(1, dt * 1.2);
      if (Math.abs(underTarget - underAmount) < 0.002) underAmount = underTarget;
      const u = smoothstep(0, 1, underAmount);
      const fade = 1 - u;
      setSurfaceFade(1 - 0.86 * u);
      under.group.visible = u > 0.002;
      const hideSurface = u > 0.92;
      if (hideSurface !== surfaceHidden) {
        surfaceHidden = hideSurface;
        surface.group.visible = !hideSurface;
        vegetation.group.visible = !hideSurface;
        life.group.visible = !hideSurface;
        ores.group.visible = !hideSurface;
        salt.group.visible = !hideSurface;
        sky.clouds.visible = !hideSurface;
      }
      if (hideSurface) salvage.group.visible = false;

      updateMaterials(env, time);
      updateSeasonalMaterials(env);
      updateTerrain(env);
      water.update(env, time);
      sky.update(env, time, dt, camera, renderer, fade);
      if (u > 0) {
        sky.hemi.color.lerp(underHemiSky, u);
        sky.hemi.groundColor.lerp(underHemiGround, u);
        sky.hemi.intensity = sky.hemi.intensity * (1 - u) + 1.15 * u;
        sky.sun.intensity *= 1 - u * 0.8;
        scene.fog.color.lerp(underFog, u);
        scene.fog.density = scene.fog.density * (1 - u) + 0.0042 * u;
        const su = sky.dome.material.uniforms;
        tmpC.copy(underFog);
        su.uTop.value.lerp(tmpC, u * 0.9);
        su.uHorizon.value.lerp(tmpC, u * 0.9);
        su.uBottom.value.lerp(tmpC, u * 0.9);
        su.uStars.value *= 1 - u;
        renderer.toneMappingExposure = env.exposure * (1 - u) + 1.05 * u;
      }
      if (!surfaceHidden) {
        surface.update(env, time, dt, fade);
        ores.update(env, time);
        salt.update(env, time, dt, fade);
        salvage.update(env);
        vegetation.update(env);
        life.update(env, time, dt, fade, camera);
      }
      if (u > 0.002) under.update(env, time, dt, u, camera);

      glowField.uniforms.uTime.value = time;
      glowField.setGroup(GLOW_GROUP.lamps, env.lamps * fade);
      glowField.setGroup(GLOW_GROUP.windows, env.windows * fade);
      glowField.setGroup(GLOW_GROUP.under, u);
      glowField.setGroup(GLOW_GROUP.lighthouse, clamp(Math.max(env.lamps * 0.95, env.misty * 0.8), 0, 1) * fade);
      glowField.setGroup(GLOW_GROUP.star, (0.15 + env.lamps * 0.85) * fade);
      glowField.setGroup(GLOW_GROUP.entrance, (0.55 + env.lamps * 0.45) * Math.max(fade, 0.0));

      // 镜头
      if (anim) {
        stepAnim(dt);
      } else {
        const idle = performance.now() - lastInteract > 45000;
        controls.autoRotate = idle && layer === 'surface' && !ui.isCardOpen();
        controls.autoRotateSpeed = 0.25;
        controls.update(dt);
        clampTarget();
        // 不钻进地里，不沉进海里
        if (layer === 'surface') {
          const ground = Math.max(heightAt(camera.position.x, camera.position.z), env.waterLevel + 0.5);
          if (camera.position.y < ground + 3) camera.position.y = ground + 3;
        }
      }

      const isNight = env.night + env.dusk * 0.5 > 0.55 || u > 0.5;
      if (isNight !== lastNight) {
        lastNight = isNight;
        ui.setNight(isNight);
      }
      ui.tick(performance.now());
      ui.updateLabels(project, renderer.domElement.clientWidth, renderer.domElement.clientHeight, u);
      renderer.render(scene, camera);
    } catch (e) {
      log.errorThrottled('main.frame', e, { layer, underAmount, mode: world.mode });
    }
  }

  log.info('main.ready', '岛已就绪', { quality, 地点: Object.keys(placesById).length });
  hideLoader();
  requestAnimationFrame(frame);

  // 调试用：控制台里可以拿到这些对象
  if (log.debug) window.__island = { scene, camera, controls, world, renderer, placesById, descend, ascend, ui, focusPlace };
}

main().catch((e) => {
  log.error('main', e);
  showFatal('岛没能立起来。打开浏览器控制台能看到详细原因。');
});
