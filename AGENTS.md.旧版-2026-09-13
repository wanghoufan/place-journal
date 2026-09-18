# AGENTS.md — 个人打卡小工具（地点手账 PWA）

> 下次会话恢复上下文的唯一规则入口（≤60 行）。详述见 `docs/handoff/HANDOFF.md` §0 与 `README.md`。

**一句话定位**：移动优先的地点手账 PWA——拍照/写感受 → AI 整理入库 → 按地点/标签/时间回顾 → 自然语言找地点 → 分享快照。本地优先（IndexedDB）+ Supabase 云同步。

**怎么跑起来**
```bash
npm install
npm run dev        # http://localhost:5173  改 .env.local 后需重启 vite
npm run build && npm run preview -- --port 4175
```
Node: `/Users/zzymima0000/.workbuddy/binaries/node/versions/22.22.2-2/bin/node`；端口约定 5173/4175/8081，勿占 3000/3100。

**技术栈**：React 18 + TS 5 + Vite 5 + Tailwind + vite-plugin-pwa；IndexedDB(via idb) + outbox 同步引擎；Supabase JS (`habit_tracker` schema, `table()` helper)；Vercel Functions (`api/`，现仅 `ai-organize`)；高德 JS API / OpenRouter|DeepSeek|OpenCode（三适配器，`OPENCODE_MODEL=glm-5.3-flash`）。录音/ASR 与封面 OCR 已按用户决定整条下线。

**目录与约定**
- `src/lib/sync.ts` 唯一同步引擎（revision 乐观锁、`ensureTags/PlacesInCloud`、`sweepDirtyRows`、`pullRemote` 保护 outbox）；`src/lib/supabase.ts` 固定 `DB_SCHEMA='habit_tracker'`；`src/lib/idb.ts` 本地库；新增 `theme.ts`（暖纸/票根/竹青）、`shareCard.ts`（canvas 长图，感受永不出卡）、`uuid.ts`（http 局域网 polyfill）；`scripts/deploy.sh` 规范部署（Docker V1.1）。
- `docs/handoff/HANDOFF.md` §0 为现役收工快照（2026-09-07 在役）；`docs/acceptance-l2/`、`docs/qa/`、`docs/db/ENV1-实测记录丨2026-09-04.md` 为证据；数据库治理权威在 `alw丨数据库管理专家/项目审查丨habit_tracker/`。
- 全部查询走 `supabase.schema('habit_tracker')`；禁止业务表进 `public`、禁止整库回写、禁止 `service_role` 进前端/Git。

**当前状态与下一步**
- 已完成（2026-09-07）：M0–M6 + 主题系统 + 分享长图/卡片图 + 标签真删 + Find 分离；S1（`20260903141849`）/S2/L2_PASS/TAG_FIX_PASS/QA_V02_PASS/QA_Vercel_PASS_WITH_BLOCKED；ENV-1 已关闭；ASR 真转写曾PASS后整条下线（改走微信语音输入）；AI（`glm-5.3-flash`，12s 降级保留）全通；Docker 8081 已上线（healthy）；Vercel 生产 `https://place-journal-xi.vercel.app` 已上线+验收；09-06/07 七批：灯箱相册＋换设备远端图根治＋同步可靠性（锁超时/毒丸停放/推拉解耦/结果可视化）＋地点改名/搬家（QA第二轮P1_PASS）＋感受与公开理由分框＋Cover自适应铺满＋AI连通性测试；封面OCR曾上线后因GLM单次8–17s整条下线（HEAD=origin/master=`d1b2e4b`，2026-09-07 验证一致）。
- 待办：高德 Key 联调（Vercel/8081 两端补变量）；历史验收标签清理待示下；QA第二轮 P2/P3-2 重跑；P0 待真机三行；L3 并发验收仍取消，但双端日常使用已成主要场景。
- 硬守则：未明确确认禁 `git commit/push`（push 二次确认）；未授权禁动 `Services/`/`DockerData/`/`DockerBackups`；`VITE_*` 改动必重建镜像；密钥只进 `.env.local` / Vercel 变量。

**恢复必读**：`docs/handoff/HANDOFF.md` §0 → `README.md` → `docs/V1_PRODUCT_AND_TECHNICAL_PLAN.md` → `.workbuddy/memory/2026-09-05.md`（09-05 全日总结；09-03/09-01 为历史）
