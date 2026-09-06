# 个人打卡小工具 · personal-checkin（Docker 规范 V1.0 §4.1）
# 多阶段构建：build（静态前端 + /api 打包）→ runtime（仅产物，无源码无依赖树）
#
# ── 构建期公开变量（VITE_* 会进入浏览器 bundle；规范 V1.2 §7.1 ──
# 只放 URL + publishable key。NEXT_PUBLIC/VITE 类变量是构建期变量：
# 改动后必须重建镜像，不能只重启容器（规范 V1.0 §4.2/§5.2）。
FROM node:22-alpine AS build
WORKDIR /app
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_AMAP_KEY
ARG VITE_AMAP_SECURITY_JSCODE
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY \
    VITE_AMAP_KEY=$VITE_AMAP_KEY \
    VITE_AMAP_SECURITY_JSCODE=$VITE_AMAP_SECURITY_JSCODE

COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# 前端静态产物 + Vercel Functions 同实现的 /api 打包（esbuild 随 vite 依赖就位）
RUN npm run build \
 && ./node_modules/.bin/esbuild api/ai-organize.ts --bundle --platform=node --format=cjs --outfile=dist-api/ai-organize.cjs \
 && ./node_modules/.bin/esbuild api/ocr.ts --bundle --platform=node --format=cjs --outfile=dist-api/ocr.cjs

# ── runtime ──
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-api ./dist-api
COPY server.mjs ./server.mjs
EXPOSE 3000
# 容器健康检查对应 server.mjs 的 /healthz（仅 Runtime 层验证，
# 不代表登录/云端写入/RLS/多端同步通过 —— 数据库规范 V1.2 §10）
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1
CMD ["node", "server.mjs"]
