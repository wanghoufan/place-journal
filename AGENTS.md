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
- `src/lib/sync.ts` 唯一同步引擎（revision 乐观锁、`ensureTags/PlacesInCloud`、`sweepDirtyRows`、`pullRemote` 保护 outbox）；`src/lib/supabase.ts` 固定 `DB_SCHEMA='habit_tracker'`；`src/lib/idb.ts` 本地库；新增 `theme.ts`（暖纸/票根/竹青）、`shareCard.ts`（canvas 长图，感受永不出卡）、`uuid.ts`（http 局域网 polyfill）；`scripts/deploy.sh` 规范部署（Docker V1.1）。
- `docs/handoff/HANDOFF.md` §0 为现役收工快照（2026-09-04，ENV-1 关闭后）；`docs/acceptance-l2/`、`docs/qa/`、`docs/db/ENV1-实测记录丨2026-09-04.md` 为证据；数据库治理权威在 `alw丨数据库管理专家/项目审查丨habit_tracker/`。
- 全部查询走 `supabase.schema('habit_tracker')`；禁止业务表进 `public`、禁止整库回写、禁止 `service_role` 进前端/Git。

**当前状态与下一步**
- 已完成（2026-09-04）：M0–M6 + 主题系统 + 分享长图/卡片图 + 标签真删 + Find 分离；S1（`20260903141849`）/S2/L2_PASS/TAG_FIX_PASS/QA_V02_PASS；ENV-1 已关闭（0003 上线 + 9 项实测 + 管理员复审通过）；ASR 真转写 + AI（`deepseek-v4-flash`，12s 降级保留）全通；Docker 8081 已上线（healthy）；QA_FAIL/VA_FAIL 经甄别真问题 2 个已修（Find 取消选中 `b819931`、8081 OAuth 白名单）。
- 待办：Tailscale 穿透；高德 Key 联调（需重建镜像）；Vercel 云端决策；QA 验收临时标签清理待示下；单设备定位（L3 取消）。
- 硬守则：未明确确认禁 `git commit/push`（push 二次确认）；未授权禁动 `Services/`/`DockerData/`/`DockerBackups`；`VITE_*` 改动必重建镜像；密钥只进 `.env.local` / Vercel 变量。

**恢复必读**：`docs/handoff/HANDOFF.md` §0 → `README.md` → `docs/V1_PRODUCT_AND_TECHNICAL_PLAN.md` → `.workbuddy/memory/2026-09-03.md`
