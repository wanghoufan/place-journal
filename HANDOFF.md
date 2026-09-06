# HANDOFF 丨 个人打卡小工具（地点手账 PWA）

> **本文件为入口指针，权威收工快照在 `docs/handoff/HANDOFF.md` §0。** 2026-09-05 收工后，根目录本文件不再维护详细状态，避免两处真相。

- **一句话**：移动优先的地点手账 PWA——拍照/写感受 → AI 整理入库 → 按地点/标签/时间回顾 → 自然语言找地点 → 分享快照。本地优先（IndexedDB）+ Supabase 云同步。
- **当前状态（2026-09-07 在役）**：M0–M6 + 主题/分享长图/标签真删/Find 分离 + 删除链路根治 + 评分 5 档 + 现场建标签 + demo 三通道防上云；09-06/07 七批：灯箱相册、换设备远端图根治、同步可靠性（锁超时/毒丸停放/推拉解耦/结果可视化）、地点改名/搬家、感受与公开理由分框、Cover 自适应铺满、AI 连通性测试；录音/ASR 整条下线（改走微信语音输入）、封面 OCR 上线后又整条下线；S1/S2/L2_PASS/TAG_FIX_PASS/QA_V02_PASS/QA_Vercel_PASS_WITH_BLOCKED/QA第二轮P1_PASS；ENV-1 关闭；Docker 8081 与 Vercel 生产均上线（HEAD=origin/master=`d1b2e4b`）。详见 `docs/handoff/HANDOFF.md` §0。
- **下一步**：高德 Key 联调（两端补变量）；历史验收标签清理待示下；QA 第二轮 P2/P3-2 重跑；P0 待真机三行。
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
- 必读顺序：`docs/handoff/HANDOFF.md` §0（2026-09-07 现役）→ `README.md` → `docs/V1_PRODUCT_AND_TECHNICAL_PLAN.md` → `.workbuddy/memory/2026-09-05.md` → `alw丨数据库管理专家/项目审查丨habit_tracker/`。

## 关键文件地图（精简）

```
src/lib/supabase.ts   DB_SCHEMA='habit_tracker' + table() helper，查询必走它
src/lib/sync.ts       同步引擎：revision 乐观锁、owner_user_id、ensureTags/PlacesInCloud、sweepDirtyRows、pullRemote 保护 outbox
src/lib/idb.ts        IndexedDB（idb）+ outbox，savePlace/saveEntry 时 revision+1
src/lib/theme.ts / shareCard.ts / uuid.ts  主题 / 分享长图（感受永不出卡）/ http 局域网 uuid polyfill；新增 Lightbox.tsx（灯箱相册）/ ui.tsx Cover（自适应铺满）/ useAutoGrow（随写随长）
scripts/deploy.sh     规范部署（Docker V1.1，先 commit+push 后快进拉取）
docs/handoff/HANDOFF.md  唯一收工快照（§0 为现役 09-05，§1-§5 为历史）
docs/acceptance-l2/ + docs/db/ENV1-实测记录丨2026-09-04.md  L2_PASS + TAG_FIX_PASS + ENV-1 九项实测证据
docs/qa/              QA 基线 V0.2 + QA_V02_PASS（25/25）；09-04 新增 QA回归（QA_FAIL）与视觉验收（VA_FAIL）两份原始报告，经 docs/handoff/HANDOFF.md §0.2-5 甄别后真问题 2 个已修
api/                  ai-organize.ts（Vercel Functions，Docker 由 server.mjs 复用；含上游超时 failover）；transcribe.ts / ocr.ts 已按用户决定整条下线（见 §0）
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
