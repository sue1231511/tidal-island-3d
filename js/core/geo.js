// 几何拼装：同一个地点里同材质的零件合并成一个网格，减少手机上的绘制调用。

import * as THREE from '../../vendor/three.bundle.min.js';
import { log } from './logger.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

export function mergeGeometries(list, where) {
  try {
    const parts = list.map((g) => (g.index ? g.toNonIndexed() : g));
    const useUV = parts.every((g) => g.attributes.uv);
    let count = 0;
    parts.forEach((g) => {
      if (!g.attributes.normal) g.computeVertexNormals();
      count += g.attributes.position.count;
    });
    const pos = new Float32Array(count * 3);
    const nor = new Float32Array(count * 3);
    const uv = useUV ? new Float32Array(count * 2) : null;
    let off = 0;
    parts.forEach((g) => {
      pos.set(g.attributes.position.array, off * 3);
      nor.set(g.attributes.normal.array, off * 3);
      if (uv) uv.set(g.attributes.uv.array, off * 2);
      off += g.attributes.position.count;
    });
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    if (uv) out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    out.computeBoundingSphere();
    out.computeBoundingBox();
    parts.forEach((g, i) => {
      if (g !== list[i]) g.dispose();
    });
    list.forEach((g) => g.dispose());
    return out;
  } catch (e) {
    log.error('geo.mergeGeometries', e, { where, 零件数: list.length });
    return new THREE.BufferGeometry();
  }
}

/**
 * 零件收集器：add(材质, 几何, 位置, 旋转, 缩放)，最后 build 成每种材质一个网格。
 * 位置/旋转/缩放都是相对这个地点组的局部坐标。
 */
export class Parts {
  constructor(name) {
    this.name = name;
    this.byMat = new Map();
  }

  add(material, geometry, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
    try {
      if (!material) throw new Error('材质为空');
      _e.set(rot[0], rot[1], rot[2]);
      _q.setFromEuler(_e);
      _p.set(pos[0], pos[1], pos[2]);
      _s.set(scale[0], scale[1], scale[2]);
      _m.compose(_p, _q, _s);
      const g = geometry.clone();
      g.applyMatrix4(_m);
      if (!this.byMat.has(material)) this.byMat.set(material, []);
      this.byMat.get(material).push(g);
    } catch (e) {
      log.error('geo.Parts.add', e, { place: this.name, pos, rot });
    }
    return this;
  }

  /** 已经变换好的几何直接放进来 */
  addRaw(material, geometry) {
    if (!this.byMat.has(material)) this.byMat.set(material, []);
    this.byMat.get(material).push(geometry);
    return this;
  }

  build(group, { cast = true, receive = true } = {}) {
    this.byMat.forEach((list, material) => {
      const geo = mergeGeometries(list, `${this.name}/${material.name}`);
      const mesh = new THREE.Mesh(geo, material);
      mesh.castShadow = cast;
      mesh.receiveShadow = receive;
      mesh.name = `${this.name}:${material.name}`;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      group.add(mesh);
    });
    this.byMat.clear();
    return group;
  }
}

// 常用几何（单位尺寸，靠缩放复用）
export const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl6: new THREE.CylinderGeometry(0.5, 0.5, 1, 6),
  cyl8: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
  cyl12: new THREE.CylinderGeometry(0.5, 0.5, 1, 12),
  cone4: new THREE.ConeGeometry(0.5, 1, 4),
  cone6: new THREE.ConeGeometry(0.5, 1, 6),
  cone8: new THREE.ConeGeometry(0.5, 1, 8),
  ico0: new THREE.IcosahedronGeometry(0.5, 0),
  ico1: new THREE.IcosahedronGeometry(0.5, 1),
  dodec: new THREE.DodecahedronGeometry(0.5, 0),
  sphere: new THREE.SphereGeometry(0.5, 8, 6),
  plane: new THREE.PlaneGeometry(1, 1),
};

/** 两坡屋顶：沿 x 方向的三棱柱，宽 w（z 方向跨度）、长 l、高 h，底面在 y=0 */
export function gableGeometry(w, l, h, overhang = 0.3) {
  const hw = w / 2 + overhang;
  const hl = l / 2 + overhang;
  const shape = new THREE.Shape();
  shape.moveTo(-hw, 0);
  shape.lineTo(hw, 0);
  shape.lineTo(0, h);
  shape.lineTo(-hw, 0);
  const g = new THREE.ExtrudeGeometry(shape, { depth: hl * 2, bevelEnabled: false });
  g.translate(0, 0, -hl);
  g.rotateY(Math.PI / 2);
  return g;
}

/** 四坡屋顶：底面 w×d，高 h */
export function hipGeometry(w, d, h, overhang = 0.3) {
  const g = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1);
  g.rotateY(Math.PI / 4);
  g.translate(0, 0.5, 0);
  g.scale(w + overhang * 2, h, d + overhang * 2);
  return g;
}

/** 弧形拱：半个圆环，跨度 span，管粗 r */
export function archGeometry(span, r, seg = 10) {
  const g = new THREE.TorusGeometry(span / 2, r, 5, seg, Math.PI);
  return g;
}

/** 文字贴图（招牌、公告板） */
export function textTexture(lines, opts = {}) {
  try {
    const o = Object.assign({ w: 256, h: 128, bg: '#5e4330', fg: '#fbe9c4', font: 44, border: '#c9a24a' }, opts);
    const c = document.createElement('canvas');
    c.width = o.w;
    c.height = o.h;
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('无法取得 2D 画布');
    drawTextCanvas(ctx, lines, o);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 2;
    tex.userData.canvas = c;
    tex.userData.opts = o;
    return tex;
  } catch (e) {
    log.error('geo.textTexture', e, { lines });
    return null;
  }
}

export function drawTextCanvas(ctx, lines, o) {
  ctx.fillStyle = o.bg;
  ctx.fillRect(0, 0, o.w, o.h);
  if (o.border) {
    ctx.strokeStyle = o.border;
    ctx.lineWidth = Math.max(3, o.w / 64);
    ctx.strokeRect(ctx.lineWidth, ctx.lineWidth, o.w - ctx.lineWidth * 2, o.h - ctx.lineWidth * 2);
  }
  ctx.fillStyle = o.fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const arr = Array.isArray(lines) ? lines : [lines];
  const lh = o.h / (arr.length + 0.6);
  arr.forEach((ln, i) => {
    const size = i === 0 ? o.font : Math.round(o.font * 0.62);
    ctx.font = `600 ${size}px "PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC",sans-serif`;
    ctx.fillText(ln, o.w / 2, lh * (i + 0.8));
  });
}
