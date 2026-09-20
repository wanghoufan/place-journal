
# CODE REVIEW

- Task: TASK-PWA-AI-01（api/ai-organize.ts默认deepseek-flash＋modelOverrides/providers、src/lib/aiSettings.ts＋AiSettings.tsx＋organize()带覆盖＋testAiProvider、App路由＋Mine入口、mobile organise真网Organiser＋6单测＋ai-confirm文案、两.env.example）
- Commit: 工作树未提交（`git status` 示 mobile/auth 等 DEV-14 改动混杂；精确 HEAD 以 `git log` 为准，审查基线=`git diff HEAD` 工作树，本结论仅覆盖上列 PWA-AI-01 文件集）
- Reviewer: code-reviewer（本窗口）
- Result: 过（P0=0、无 blocking P1；P2×3 backlog，不阻断进 QA）

> Dispatch / Evidence ID 系字段 2.0 已废弃，不填。

## P0 / P1 Findings

- 无 blocking P1。本轮必核四项全部通过：
  - Key 仍只读服务端，前端无 Key 泄漏：`api/ai-organize.ts:17,19,21` Key 只取 `process.env.*_API_KEY`；`providers()` 入参只有 `overrides(模型名)`＋`only(名单)`，`cleanModel()` 只收字符串模型名（`:10-12,30`），无任何 key/secret/apiKey 入参。前端两条发网路径只发模型名：`src/lib/organize.ts:35,70`（`modelOverrides` 为空时不带键）；`mobile/src/features/organise.ts:168-173` body 只有 transcript/placeName/area/tags，单测 `:127` 显式断言 `not.toHaveProperty('apiKey')`。`grep` 全仓 `src/`＋`mobile/src/` 无 `API_KEY/apiKey` 发网命中（仅注释与 Supabase publishable/AMAP 等公开键文案）。`mobile/.env.example` 新增仅 `EXPO_PUBLIC_AI_API_BASE`（服务端地址，注释明示“Key 只在服务端，这里只填地址”）。通过。
  - modelOverrides 仅模型名：类型 `ModelOverrides {openrouter?; deepseek?; opencode?}`（api `:8`、前端 `aiSettings.ts:4-8` 同形），`pruneModelOverrides` 去空＋trim＋120 截断（`:39-46`），服务端 `cleanModel` 同口径。`providers` 名单只做 order 过滤＋仍要求服务端 Key 已配（`:25-29`），不能凭名字启用未配置通道。AiSettings 页文案明示“只保存模型名在你手机上”（`AiSettings.tsx:62`）。通过。
  - 旧名退役注释：`deepseek-chat → deepseek-flash` 三处一致注释——`api/ai-organize.ts:18-19`（退役日期 2026-07-24＋V4.1-Flash）、`src/lib/aiSettings.ts:20-21`、`.env.example:28`（“不要再用”）。`OPENROUTER_MODEL=openrouter/auto` 未动，OpenCode 模型名只走占位提示不写默认值（`:28-33`）。通过。
  - 越界（android/包名/scheme）：`git diff --stat -- mobile/android app.json mobile/app.json` 为空，`--name-only` 无 android/package/scheme 命中；包名 `com.wanghoufan.placejournal`、scheme、redirect 零改动。`mobile/app/(tabs)/mine.tsx` 等 DEV-14 改动属他任务，不计入本轮扩散。通过。

## P2 / P3 Backlog Findings

- P2-1（Mine 快捷测试不带用户自定义模型名）：`src/pages/Mine.tsx:277-281` `AiStatus.test()` 直接 POST（transcript/placeName/tags），未带 `loadModelOverrides()`，而主链 `organize()`（`:26,35`）与设置页 `testAiProvider(id,{modelOverrides:models})`（`AiSettings.tsx:45`）均带覆盖。用户在设置页改了模型后，Mine 页“一键测试”仍走服务端默认，与设置页结果可能不一致。改法：`test()` 内同样 `loadModelOverrides()` 并在非空时带上 `modelOverrides`（复用 `organize.ts` 口径）。不阻断（主链正确，仅快捷探针口径差）。
- P2-2（沿用 PWA-01 O-1：`??` 与 `||` 混用）：`Find.tsx:133`／`PlaceDetail.tsx:37` 用 `??`，`EntryDetail.tsx:58`／`shares.ts:36` 用 `||`。写入侧已堵死空串（AiConfirm 入库 `trim() || undefined`），实际不可触发；仅历史/云端空串数据才显现。建议后续统一为 `||`。
- P2-3（沿用 PWA-01 P2-1/P2-2 backlog，未闭环）：`api/ai-organize.ts:92` 截断 300 vs prompt 80 字口径差无注释；`exporter.ts:43` summary 列无“仅旧数据兼容”注释。均不在本轮改动行，不阻断。
- P3-1（mobile 注释过时）：`mobile/app/ai-confirm.tsx:1-2` 头注释仍写“全程本地（V1 移动端禁网络）”，与本轮 `createHttpOrganiser` 真网路径（`organise.ts:109-187`）矛盾；实际行为正确（`ai-confirm.tsx:70` 已按 `suggestion.mock` 区分“本地占位/ AI 整理完成”文案）。改法：头注释改为“缺省本地占位，配了 EXPO_PUBLIC_AI_API_BASE 走服务端真网，失败回退占位”。
- P3-2（设置页每次键入即写 localStorage）：`AiSettings.tsx:90-95` input `onChange` 直调 `setModel→saveModelOverrides`，逐字写盘。功能无碍，建议后续加 debounce。另 `select value={value}` 对自定义值靠“自定义”占位 option 兜底，行为正确。

## 核过项（通过，记一笔免得返工时误改）

- 范围：本轮 PWA-AI-01 文件集＝`api/ai-organize.ts`、`src/lib/aiSettings.ts`(新)、`src/pages/AiSettings.tsx`(新)、`src/lib/organize.ts`、`src/App.tsx`（+1 路由 `/ai-settings`）、`src/pages/Mine.tsx`（隐私与 AI 卡加“模型名设置 三家通道 ›”入口 `:212-215`＋原有探针保留）、`mobile/src/features/organise.ts`、`mobile/src/features/__tests__/organise.test.ts`（+111 行）、`mobile/app/ai-confirm.tsx`（1 行文案三元）、两 `.env.example`。`src/lib/sync.ts`／`idb.ts`／`supabase.ts` 零改动；`mobile/src/supabase/__tests__/auth.test.ts`（+52）属 DEV-14，不计入本轮。
- 283=277+6：`organise.test.ts` 新增 `describe('organise: 真网 Organiser')` 内恰 6 个 `it`（成功映射／501 回退／超时回退／异常体回退／缺省不发网／runOrganise 兜底仍 ok），277 基线归 DEV-14 全量，283 总数待 QA 亲跑 `mobile` jest 落数，本复核只认 diff 行数（+111 行、6 用例齐、mock 语义 `mock=false` 仅真网成功、`toSuggestion` 标签名→本地 id＋AI 不得建标签 `:131-133`）。
- 三件套/退役口径延续 PWA-01：SYSTEM prompt 三件套＋summary 退役（api `:33-44`），服务端丢弃上游 summary（`:90`），`types.ts` summary 保留＋退役注释。`Mine.tsx:318,327` summary-first 残留仍在（QA O-2 已登记，范围外，不管）。
- ai-confirm 文案：`suggestion.mock ? '本地占位整理完成（未联网）…' : 'AI 整理完成…'`（`:70`），与 `createHttpOrganiser` 回退语义（任何失败→`localHeuristics`，mock=true，绝不抛出 `:180-182`）一致；`createDefaultOrganiser` 缺省不发网（`:190-192`），旧行为子集。
- QA 前置说明：`/api/ai-organize` 真 AI 返回本地 404 符合预期（BUGS_PWA-01 已记 NOT_VERIFIED），本复核为静态＋diff 证据，不冒认真调结论；真调（配 Key 部署验）为 HANDOFF 剩 P0，按序走 QA。
