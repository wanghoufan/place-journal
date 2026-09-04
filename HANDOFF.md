# HANDOFF 丨 个人打卡小工具（地点手账 PWA）

> **本文件为入口指针，权威收工快照在 `docs/handoff/HANDOFF.md` §0。** 2026-09-04 快照后，根目录本文件不再维护详细状态，避免两处真相。

- **一句话**：移动优先的地点手账 PWA——拍照/语音记录 → AI 整理入库 → 按地点/标签/时间回顾 → 自然语言找地点 → 分享快照。本地优先（IndexedDB）+ Supabase 云同步。
- **当前状态（2026-09-04 深夜）**：M0–M6 + 主题/分享长图/标签真删/Find 分离完成；S1（`20260903141849`）/S2/L2_PASS/TAG_FIX_PASS/QA_V02_PASS；ENV-1 已关闭（0003 上线 + 9 项实测 + 管理员复审通过）；ASR 真转写 + AI（`deepseek-v4-flash`）全通；Docker 8081 已上线；Record 三项修复 + OBS-1 已修并推送（HEAD=origin/master=`ab1086e`）；Vercel 生产 `https://place-journal-xi.vercel.app` 已上线+验收。详见 `docs/handoff/HANDOFF.md` §0。
- **下一步**：用户亲手 Google 登录 + 手机 HTTPS 验录音（已成功一次）；高德 Key 联调（两端补变量）；历史验收标签清理待示下。
- **路径变更**：数据库治理材料已迁至 `/Users/zzymima0000/Developer/coding/1.Active/alw丨数据库管理专家/`（`项目审查丨habit_tracker/` 与 `平台丨共享 Supabase 数据库/`），本文与 `docs/db/…`、`supabase/migrations/…` 旧路径一律以 alw 为准。

## 恢复工作步骤（智能体照做）

```bash
cd "/Users/zzymima0000/Developer/coding/1.Active/ing 丨0831个人打卡小工具 MACMINI GL"
npm install              # 若 node_modules 不在
npm run dev              # http://localhost:5173  (改 .env.local 后需重启 vite)
npm run build && npm run preview -- --port 4175   # 生产预览用 4175（4173 被占用）
```

- 端口：5173=dev，4175=preview，8081=Docker 宿主机；勿占 3000/3001/3100。
- Node：`/Users/zzymima0000/.workbuddy/binaries/node/versions/22.22.2-2/bin/node`。
- 必读顺序：`docs/handoff/HANDOFF.md` §0（2026-09-04 现役）→ `README.md` → `docs/V1_PRODUCT_AND_TECHNICAL_PLAN.md` → `.workbuddy/memory/2026-09-03.md`（09-04 无新增记忆文件，只读）→ `alw丨数据库管理专家/项目审查丨habit_tracker/`。

## 关键文件地图（精简）

```
src/lib/supabase.ts   DB_SCHEMA='habit_tracker' + table() helper，查询必走它
src/lib/sync.ts       同步引擎：revision 乐观锁、owner_user_id、ensureTags/PlacesInCloud、sweepDirtyRows、pullRemote 保护 outbox
src/lib/idb.ts        IndexedDB（idb）+ outbox，savePlace/saveEntry 时 revision+1
src/lib/theme.ts / shareCard.ts / uuid.ts  主题 / 分享长图（感受永不出卡）/ http 局域网 uuid polyfill
scripts/deploy.sh     规范部署（Docker V1.1，先 commit+push 后快进拉取）
docs/handoff/HANDOFF.md  唯一收工快照（§0 为现役 09-04，§1-§5 为历史）
docs/acceptance-l2/ + docs/db/ENV1-实测记录丨2026-09-04.md  L2_PASS + TAG_FIX_PASS + ENV-1 九项实测证据
docs/qa/              QA 基线 V0.2 + QA_V02_PASS（25/25）；09-04 新增 QA回归（QA_FAIL）与视觉验收（VA_FAIL）两份原始报告，经 §0.5 甄别后真问题 2 个已修
api/                  transcribe.ts / ai-organize.ts（Vercel Functions，Docker 由 server.mjs 复用；含 TC3 头与 /chat/completions 补齐修复）
Dockerfile / compose.yaml / server.mjs / docker/env.template  project_slug=personal-checkin；部署副本 Developer/coding/docker/personal-checkin/
```

## 踩坑（勿重蹈）

1. sessionStorage 存 Blob → 空对象白屏；已改 `draft.ts` 内存模块。
2. PG CHECK 禁子查询 → entry_tags 归属用触发器。
3. dev 下 /api 404 返回 HTML → 按 content-type 判未配置。
4. 中文数字「人均五十」「给四星」→ cnToNumber。
5. 4173 占用 → preview 用 4175。
6. 演示图禁 SVG 文字 → picsum.photos seed 图。
7. 改 `.env.local` 后必须重启 vite；自动化浏览器需真实 Chrome + CDP 独立 profile，否则吞 OAuth 回调。
