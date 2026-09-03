# AGENTS.md — 个人打卡小工具（地点手账 PWA）

> 下次会话恢复上下文的唯一规则入口（≤60 行）。详述见 `docs/handoff/HANDOFF.md` §0 与 `README.md`。

**一句话定位**：移动优先的地点手账 PWA——拍照/语音记录 → AI 整理入库 → 按地点/标签/时间回顾 → 自然语言找地点 → 分享快照。本地优先（IndexedDB）+ Supabase 云同步。

**怎么跑起来**
```bash
npm install
npm run dev        # http://localhost:5173  改 .env.local 后需重启 vite
npm run build && npm run preview -- --port 4175
```
Node: `/Users/zzymima0000/.workbuddy/binaries/node/versions/22.22.2-2/bin/node`；端口约定 5173/4175/8081，勿占 3000/3100。

**技术栈**：React 18 + TS 5 + Vite 5 + Tailwind + vite-plugin-pwa；IndexedDB(via idb) + outbox 同步引擎；Supabase JS (`habit_tracker` schema, `table()` helper)；Vercel Functions (`api/`)；高德 JS API / 腾讯 ASR / OpenRouter|DeepSeek|OpenCode（三适配器）。

**目录与约定**
- `src/lib/sync.ts` 唯一同步引擎（revision 乐观锁、`ensureTags/PlacesInCloud`、`sweepDirtyRows`、`pullRemote` 保护 outbox）；`src/lib/supabase.ts` 固定 `DB_SCHEMA='habit_tracker'`；`src/lib/idb.ts` 本地库。
- `docs/handoff/HANDOFF.md` §0 为现役收工快照；`docs/acceptance-l2/` 与 `docs/qa/` 为验收证据；数据库治理权威在 `alw丨数据库管理专家/项目审查丨habit_tracker/`。
- 全部查询走 `supabase.schema('habit_tracker')`；禁止业务表进 `public`、禁止整库回写、禁止 `service_role` 进前端/Git。

**当前状态与下一步**
- 已完成：M0–M6 全量、L2_PASS、TAG_FIX_PASS、QA_V02_PASS (25/25)、S1 已发布 (`20260903141849`)、S2 已验证；单设备定位。
- 待办：管理员 `发布后收口核对` + 0003 Storage bucket 增量复审；ASR/大模型/高德 真 Key 联调；Docker/Vercel 部署待授权。
- 硬守则：未明确确认禁 `git commit/push`（push 二次确认）；未授权禁动 `Services/`/`DockerData/`/`DockerBackups`；`VITE_*` 改动必重建镜像；密钥只进 `.env.local` / Vercel 变量。

**恢复必读**：`docs/handoff/HANDOFF.md` §0 → `README.md` → `docs/V1_PRODUCT_AND_TECHNICAL_PLAN.md` → `.workbuddy/memory/2026-09-03.md`
