// 天空：渐变穹顶 + 日月 + 星 + 低多边形云；光照与雾。

import * as THREE from '../../vendor/three.bundle.min.js';
import { log } from '../core/logger.js';
import { mulberry32 } from '../core/noise.js';
import { registerSurface } from './materials.js';

const skyVert = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vDir = normalize(wp.xyz - cameraPosition);
    gl_Position = projectionMatrix * viewMatrix * wp;
    gl_Position.z = gl_Position.w; // 永远在最远处
  }
`;

const skyFrag = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uBottom;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  uniform float uSunDisc;
  uniform float uMoonDisc;
  uniform float uStars;
  uniform float uTime;
  uniform float uMist;
  varying vec3 vDir;

  float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }

  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 col;
    if (h >= 0.0) {
      col = mix(uHorizon, uTop, pow(smoothstep(0.0, 1.0, h), 0.55));
    } else {
      col = mix(uHorizon, uBottom, pow(smoothstep(0.0, 1.0, -h), 0.35));
    }
    // 地平线上的一条雾带
    col = mix(col, uHorizon, (1.0 - smoothstep(0.0, 0.08 + uMist * 0.25, abs(h))) * 0.6);

    vec3 L = normalize(uSunDir);
    float sd = max(dot(d, L), 0.0);
    // 太阳
    float sun = smoothstep(0.9988, 0.9993, sd);
    float halo = pow(sd, 10.0) * 0.28 + pow(sd, 120.0) * 0.5;
    col += uSunColor * (sun * 1.6 + halo) * uSunDisc * (1.0 - uMist * 0.7);
    // 月亮（夜里光源方向就是月亮）
    float moon = smoothstep(0.9990, 0.9994, sd);
    float moonShade = smoothstep(0.9990, 0.9997, max(dot(d, normalize(L + vec3(0.012, 0.006, 0.0))), 0.0));
    col += vec3(0.95, 0.93, 0.85) * (moon - moonShade * 0.55) * uMoonDisc * (1.0 - uMist * 0.6);
    col += vec3(0.5, 0.6, 0.85) * pow(sd, 40.0) * 0.25 * uMoonDisc;

    // 星
    if (uStars > 0.001 && h > 0.0) {
      vec3 cell = floor(d * 260.0);
      float r = hash(cell);
      float star = step(0.9965, r) * smoothstep(0.02, 0.25, h);
      float tw = 0.6 + 0.4 * sin(uTime * (1.0 + r * 5.0) + r * 40.0);
      col += vec3(0.85, 0.9, 1.0) * star * tw * uStars * (1.0 - uMist * 0.85);
    }
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function buildSky(scene) {
  const uniforms = {
    uTop: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uBottom: { value: new THREE.Color() },
    uSunColor: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunDisc: { value: 1 },
    uMoonDisc: { value: 0 },
    uStars: { value: 0 },
    uTime: { value: 0 },
    uMist: { value: 0 },
  };
  const skyMat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: skyVert,
    fragmentShader: skyFrag,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  skyMat.name = 'sky';
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), skyMat);
  dome.name = 'sky';
  dome.frustumCulled = false;
  dome.renderOrder = -10;
  scene.add(dome);

  // 光
  const hemi = new THREE.HemisphereLight('#ffffff', '#556644', 1.2);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffffff', 2.5);
  sun.castShadow = false;
  sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera;
  sc.left = -120;
  sc.right = 120;
  sc.top = 120;
  sc.bottom = -120;
  sc.near = 20;
  sc.far = 520;
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.6;
  scene.add(sun);
  scene.add(sun.target);

  scene.fog = new THREE.FogExp2('#cfe3ea', 0.002);

  // 云：几团低多边形棉花，随风漂
  const cloudMat = new THREE.MeshLambertMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, flatShading: true, depthWrite: false });
  cloudMat.name = 'cloud';
  cloudMat.userData.baseTransparent = true;
  registerSurface(cloudMat);
  const clouds = new THREE.Group();
  clouds.name = 'clouds';
  const rng = mulberry32(42);
  const cloudList = [];
  const puff = new THREE.IcosahedronGeometry(1, 0);
  for (let i = 0; i < 16; i++) {
    const c = new THREE.Group();
    const n = 3 + Math.floor(rng() * 4);
    for (let k = 0; k < n; k++) {
      const m = new THREE.Mesh(puff, cloudMat);
      const s = 5 + rng() * 6;
      m.scale.set(s * 1.4, s * 0.8, s);
      m.position.set((k - n / 2) * 6 + rng() * 3, rng() * 3, (rng() - 0.5) * 6);
      c.add(m);
    }
    c.position.set((rng() - 0.5) * 520, 62 + rng() * 30, (rng() - 0.5) * 520);
    c.userData.threshold = i / 16;
    c.userData.speed = 0.6 + rng() * 0.6;
    clouds.add(c);
    cloudList.push(c);
  }
  scene.add(clouds);

  const tmp = new THREE.Color();
  const white = new THREE.Color('#ffffff');
  const grey = new THREE.Color('#7d8790');

  function update(env, time, dt, camera, renderer, fade) {
    try {
      uniforms.uTop.value.copy(env.skyTop);
      uniforms.uHorizon.value.copy(env.skyHorizon);
      uniforms.uBottom.value.copy(env.skyBottom);
      uniforms.uSunColor.value.copy(env.sunColor);
      uniforms.uSunDir.value.copy(env.sunDir);
      uniforms.uSunDisc.value = env.sunDisc;
      uniforms.uMoonDisc.value = env.moonDisc;
      uniforms.uStars.value = env.stars;
      uniforms.uTime.value = time;
      uniforms.uMist.value = env.misty;
      dome.position.copy(camera.position);

      hemi.color.copy(env.hemiSky);
      hemi.groundColor.copy(env.hemiGround);
      hemi.intensity = env.hemiIntensity;
      sun.color.copy(env.sunColor);
      sun.intensity = env.sunIntensity;
      sun.position.copy(env.sunDir).multiplyScalar(260);
      sun.target.position.set(0, 0, 0);

      scene.fog.color.copy(env.fogColor);
      scene.fog.density = env.fogDensity;
      renderer.toneMappingExposure = env.exposure;

      // 云：风向从西南往东北
      const speed = (1.5 + env.wind * 14) * dt;
      tmp.copy(white).lerp(grey, env.cloudDark);
      tmp.multiply(env.hemiSky).lerp(env.skyHorizon, 0.35);
      cloudMat.color.copy(tmp);
      cloudMat.opacity = (0.55 + env.cloud * 0.35) * fade;
      cloudList.forEach((c) => {
        c.position.x += speed * c.userData.speed * 0.8;
        c.position.z -= speed * c.userData.speed * 0.6;
        if (c.position.x > 280) c.position.x -= 560;
        if (c.position.z < -280) c.position.z += 560;
        const v = THREE.MathUtils.smoothstep(env.cloud, c.userData.threshold - 0.08, c.userData.threshold + 0.08);
        c.visible = v > 0.01;
        c.scale.setScalar(Math.max(0.01, v));
      });
    } catch (e) {
      log.errorThrottled('sky.update', e);
    }
  }

  return { dome, sun, hemi, clouds, update };
}
