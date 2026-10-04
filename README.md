# 潮汐岛 3D

用 3D 把潮汐岛立起来：一座自然生长的海岛，可以自由转着看，跟着游戏的时辰、潮汐、天气、季节一起变化，地下还有一层井下世界。

- 游戏本体：`sue1231511/allotment-relay`
- 造岛说明：[`CLAUDE.md`](CLAUDE.md)
- 参考资料：[`reference/`](reference/)

这是一个独立的静态页面，不连游戏服务器，也不需要凭证。

## 部署

纯静态，无构建步骤。仓库根目录就是站点根目录（入口 `index.html`）。

- **Zeabur**：直接导入本仓库即可，按静态站点部署。根目录**不要**放 `package.json`，否则会被识别成 Node 项目。
- **本地预览**：任意静态服务器，例如 `python3 -m http.server`，然后打开 `http://localhost:8000/`。直接双击 `index.html` 不行（ES 模块需要 http）。

## 目录

```
index.html            入口
css/style.css         界面样式
js/main.js            组装与主循环
js/core/              日志、时钟（与服务端公式一致）、状态渐变、噪声、几何拼装
js/world/             地形、海、天空、地点、植被、小生命、井下
js/ui/                天时木牌、卡片、工作台、手绘 SVG 图标
vendor/               three.js r186 + OrbitControls（压缩后的单文件，随仓库提供，不依赖 CDN）
tools/build-vendor.sh 重新生成 vendor 文件
```

## 调试

地址后加 `?debug=1`：控制台输出详细日志，并可用 `window.__island` 访问场景、镜头和世界状态。
所有错误都经 `js/core/logger.js` 输出：出错位置、堆栈、关键变量。
