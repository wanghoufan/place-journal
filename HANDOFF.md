# HANDOFF 丨 个人打卡小工具（地点手账 PWA）

> **本文件为入口指针，权威收工快照在 `docs/handoff/HANDOFF.md` §0。** 2026-09-03 快照后，根目录本文件不再维护详细状态，避免两处真相。

- **一句话**：移动优先的地点手账 PWA——拍照/语音记录 → AI 整理入库 → 按地点/标签/时间回顾 → 自然语言找地点 → 分享快照。本地优先（IndexedDB）+ Supabase 云同步。
- **当前状态（2026-09-03）**：M0–M6 全量完成；Migration `20260903141849` 已发布至 `yacgnikzvutbpoqvokth`；Expose 已验证；L2 真实写入 **L2_PASS**、标签修复 **TAG_FIX_PASS**、QA V0.2 **QA_V02_PASS**（25/25）；Storage buckets 待管理员创建（0003 pending）。详见 `docs/handoff/HANDOFF.md` §0。
- **下一步最优先**：管理员 `发布后收口核对`（清单 `docs/db/送审材料清单丨habit_tracker丨发布后收口核对.md`）。
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
- 必读顺序：`docs/handoff/HANDOFF.md` §0 → `README.md` → `docs/V1_PRODUCT_AND_TECHNICAL_PLAN.md` → `.workbuddy/memory/2026-09-03.md` → `alw丨数据库管理专家/项目审查丨habit_tracker/`。

## 关键文件地图（精简）

```
src/lib/supabase.ts   DB_SCHEMA='habit_tracker' + table() helper，查询必走它
src/lib/sync.ts       同步引擎：revision 乐观锁、owner_user_id、ensureTags/PlacesInCloud、sweepDirtyRows、pullRemote 保护 outbox
src/lib/idb.ts        IndexedDB（idb）+ outbox，savePlace/saveEntry 时 revision+1
docs/handoff/HANDOFF.md  唯一收工快照（§0 为现役，§1-§5 为历史）
docs/acceptance-l2/   L2_PASS + TAG_FIX_PASS 证据（HAR 已脱敏，截图 10+ 张）
docs/qa/              QA 基线 V0.2 + 报告 QA_V02_PASS（25/25，含 D1-D5 滚动未复现）
api/                  transcribe.ts / ai-organize.ts（Vercel Functions，Docker 由 server.mjs 复用）
Dockerfile / compose.yaml / server.mjs / docker/env.template  project_slug=personal-checkin
```

## 踩坑（勿重蹈）

1. sessionStorage 存 Blob → 空对象白屏；已改 `draft.ts` 内存模块。
2. PG CHECK 禁子查询 → entry_tags 归属用触发器。
3. dev 下 /api 404 返回 HTML → 按 content-type 判未配置。
4. 中文数字「人均五十」「给四星」→ cnToNumber。
5. 4173 占用 → preview 用 4175。
6. 演示图禁 SVG 文字 → picsum.photos seed 图。
7. 改 `.env.local` 后必须重启 vite；自动化浏览器需真实 Chrome + CDP 独立 profile，否则吞 OAuth 回调。
