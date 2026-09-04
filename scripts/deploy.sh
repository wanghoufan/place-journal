#!/usr/bin/env bash
# 个人打卡小工具（personal-checkin）· 一键部署（Docker 规范 V1.1）
#
# 用法：在部署副本内运行（部署副本 = Developer/coding/docker/personal-checkin/ 的 git 克隆）：
#   bash scripts/deploy.sh
#
# 前提：
#   1. 待部署改动已 commit 并 push 到 GitHub master（本脚本只快进拉取，绝不 merge）；
#   2. 部署副本根存在 docker/.env.local（私密配置，600，不进 Git）；
#      构建期 VITE_* 与运行期私密变量均由该文件提供（compose.yaml 约定）。
#
# 流程：记录回滚点 → git pull --ff-only → compose build → compose up -d → 健康检查
set -euo pipefail

cd "$(dirname "$0")/.."

echo "== 回滚点 =="
OLD_HEAD=$(git rev-parse --short HEAD)
OLD_IMAGE=$(docker images --format '{{.ID}}' personal-checkin:latest | head -1)
echo "git HEAD: $OLD_HEAD"
echo "image: personal-checkin:latest (${OLD_IMAGE:-none})"

echo "== git pull --ff-only =="
git pull --ff-only origin master
NEW_HEAD=$(git rev-parse --short HEAD)
echo "deploy target HEAD: $NEW_HEAD"

echo "== docker compose build =="
docker compose --env-file docker/.env.local build

echo "== docker compose up -d =="
docker compose --env-file docker/.env.local up -d

echo "== 健康检查 =="
sleep 5
docker compose --env-file docker/.env.local ps
PORT="${APP_PORT:-8081}"
CODE=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:${PORT}/healthz" || true)
NEW_IMAGE=$(docker images --format '{{.ID}}' personal-checkin:latest | head -1)
echo "HTTP status: $CODE (GET /healthz)"
echo "new image: $NEW_IMAGE"
if [ "$CODE" = "200" ]; then
  echo "DEPLOY OK: git $OLD_HEAD -> $NEW_HEAD, image ${OLD_IMAGE:-none} -> $NEW_IMAGE"
else
  echo "WARNING: /healthz 非 200（$CODE）。排查: docker compose --env-file docker/.env.local logs --tail 50"
  exit 1
fi
