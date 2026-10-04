// 光晕：所有灯笼、窗光、灯塔灯的柔光点合在一个 Points 里画，一次绘制调用。
// 每个光点属于一个分组，分组亮度每帧由时辰/地上地下状态决定。

import * as THREE from '../../lib/three.bundle.min.js';
import { log } from '../core/logger.js';

export const GLOW_GROUP = {
  lamps: 0, // 地上路灯、灯笼：暮夜亮
  windows: 1, // 窗光
  under: 2, // 井下灯笼：常亮
  lighthouse: 3, // 灯塔：暮夜 + 海雾
  star: 4, // 剧场门头的星
  entrance: 5, // 井下入口灯笼：常亮
};
const GROUPS = 6;

export class GlowField {
  constructor(name) {
    this.name = name;
    this.items = [];
    this.points = null;
    this.uniforms = {
      uIntensity: { value: new Float32Array(GROUPS).fill(1) },
      uScale: { value: 600 },
      uTime: { value: 0 },
    };
  }

  add(pos, color, size, group) {
    this.items.push({ p: pos.clone ? pos.clone() : new THREE.Vector3(pos[0], pos[1], pos[2]), c: new THREE.Color(color), s: size, g: group });
  }

  build() {
    try {
      const n = this.items.length;
      const P = new Float32Array(n * 3);
      const Cc = new Float32Array(n * 3);
      const S = new Float32Array(n);
      const Gr = new Float32Array(n);
      this.items.forEach((it, i) => {
        P.set([it.p.x, it.p.y, it.p.z], i * 3);
        Cc.set([it.c.r, it.c.g, it.c.b], i * 3);
        S[i] = it.s;
        Gr[i] = it.g;
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
      geo.setAttribute('aColor', new THREE.BufferAttribute(Cc, 3));
      geo.setAttribute('aSize', new THREE.BufferAttribute(S, 1));
      geo.setAttribute('aGroup', new THREE.BufferAttribute(Gr, 1));
      const mat = new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: `
          attribute vec3 aColor;
          attribute float aSize;
          attribute float aGroup;
          uniform float uIntensity[${GROUPS}];
          uniform float uScale;
          uniform float uTime;
          varying vec3 vColor;
          varying float vI;
          void main() {
            int g = int(aGroup + 0.5);
            float I = 0.0;
            for (int k = 0; k < ${GROUPS}; k++) { if (k == g) I = uIntensity[k]; }
            float flick = 0.9 + 0.1 * sin(uTime * 6.0 + position.x * 3.1 + position.z * 1.7);
            vI = I * flick;
            vColor = aColor;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = I > 0.001 ? clamp(aSize * uScale / -mv.z, 0.0, 180.0) : 0.0;
          }`,
        fragmentShader: `
          varying vec3 vColor;
          varying float vI;
          void main() {
            vec2 d = gl_PointCoord - 0.5;
            float r = length(d) * 2.0;
            float a = smoothstep(1.0, 0.0, r);
            a = a * a * 0.85 + smoothstep(0.25, 0.0, r) * 0.6;
            gl_FragColor = vec4(vColor * vI * a, 1.0);
          }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      this.points = new THREE.Points(geo, mat);
      this.points.name = `glow:${this.name}`;
      this.points.frustumCulled = false;
      this.points.renderOrder = 5;
      return this.points;
    } catch (e) {
      log.error('glow.build', e, { name: this.name, count: this.items.length });
      return new THREE.Object3D();
    }
  }

  setGroup(g, v) {
    this.uniforms.uIntensity.value[g] = v;
  }

  setScale(viewportHeight) {
    this.uniforms.uScale.value = viewportHeight * 0.9;
  }
}
