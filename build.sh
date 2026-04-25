#!/usr/bin/env bash
# build.sh — release/ 폴더에 배포용 자산을 생성.
# 결과물: release/index.html, release/dist.js, release/data/maps.json
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

echo "[build] esbuild 번들링"
npx esbuild src/main.ts \
  --bundle \
  --outfile=dist/dist.js \
  --target=es2020 \
  --format=iife \
  --minify

echo "[build] release/ 초기화"
rm -rf release
mkdir -p release/data

echo "[build] 자산 복사"
# index.html의 스크립트 경로를 'dist/dist.js' → 'dist.js' 로 치환 (release 평탄화).
sed 's|dist/dist\.js|dist.js|g' index.html > release/index.html
cp dist/dist.js release/dist.js
cp data/maps.json release/data/maps.json

echo "[build] 완료 (release/ 에 index.html + dist.js + data/maps.json 이 있습니다)"
