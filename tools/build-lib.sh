#!/usr/bin/env bash
# 重新生成 lib/three.bundle.min.js（three.js + OrbitControls，压缩成一个 ES 模块）。
# 目录不能叫 vendor：Zeabur 静态托管会把 vendor、node_modules 等路径当敏感目录直接返回 404。
# 在临时目录里装依赖，仓库根目录不留 package.json——
# Zeabur 看到根目录有 package.json 会把项目当成 Node 应用，而不是静态站。
set -euo pipefail

THREE_VERSION="${THREE_VERSION:-0.186.1}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

cd "$WORK"
npm init -y >/dev/null
npm install --silent "three@${THREE_VERSION}" esbuild@0.25
cat > entry.js <<'EOF'
export * from 'three';
export { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
EOF
npx esbuild entry.js --bundle --format=esm --minify --legal-comments=eof --outfile="$ROOT/lib/three.bundle.min.js"
cp node_modules/three/LICENSE "$ROOT/lib/three.LICENSE"
echo "lib/three.bundle.min.js <- three@${THREE_VERSION}"
