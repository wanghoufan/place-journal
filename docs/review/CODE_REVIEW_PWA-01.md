
# CODE REVIEW

- Task: TASK-PWA-01（根PWA AI三件套：api/ai-organize.ts合同、organize.ts降级、Record/AiConfirm/EntryDetail/Find/PlaceDetail、types.ts）
- Commit: 工作树未提交（`git status` 示 8 个根文件 M；精确 HEAD 以 `git log` 为准，审查基线=`git diff` 工作树）
- Reviewer: code-reviewer（本窗口）
- Result: 打回 + 改法（P1×1；余 P2×2 backlog）

> Dispatch / Evidence ID 系字段 2.0 已废弃，不填。

## P0 / P1 Findings

- P1-1（shares reason 回退链缺一环，与“无空白”口径不符）：
  - 位置：`src/lib/shares.ts:35` `reason: entry.notePublic || entry.summary,`
  - 问题：详情/Find/地点页三处回退链均为 `notePublic → summary → transcript`（`src/pages/EntryDetail.tsx:57`、`src/pages/Find.tsx:133`、`src/pages/PlaceDetail.tsx:37`），唯独分享快照只到 `summary` 就停。若一条旧记录 `notePublic` 与 `summary` 均为空（新链路不再写 summary，`src/pages/AiConfirm.tsx:102` 只写 transcript+notePublic；用户也可能把 notePublic 清空），`reason` 为 `undefined` → 分享卡理由空白，违背“老数据回退链无空白”与 shares 口径一致性。
  - 改法（二选一，推荐 A）：A）`reason: entry.notePublic || entry.summary || entry.transcript,`（与三处展示口径对齐；白名单只含公开理由+感受转写，不引入 transcript 以外的新字段，无隐私扩散——transcript 本就可经 notePublic 为空时的展示链被看到，分享 reason 取它是既定口径）；B）若产品要求“留空则不展示”，则在分享卡渲染侧显式处理 `undefined`（占位符/隐藏行），并把该口径写进注释。本条不涉及 DB/同步协议变更，只改本地 `toShareItem` 一行。

## P2 / P3 Backlog Findings

- P2-1（public_reason 长度双重口径，建议收敛注释）：`api/ai-organize.ts:28` prompt 要求“2-3 句、不超过 80 字”，而 `:79` 服务端截断为 `.slice(0, 300)`。功能无碍（prompt 生效时远小于 300），但 300 字安全网与 80 字产品口径不一致。建议要么改截断为 160（80 字×2 保险）并注释说明，要么在注释写明“300 为防注入超长的安全网，产品口径以 prompt 80 字为准”。不阻断本轮。
- P2-2（`exporter.ts:43` 仍导出 summary 列）：`src/lib/exporter.ts:43` CSV 仍含 `e.summary ?? ''`。summary 退役后保留该列属兼容正确（旧数据可导出），但建议补一行注释说明“summary 列仅为旧数据兼容，新记录恒空”，免得后人误以为新链路还写 summary。不阻断本轮。

## 核过项（通过，记一笔免得返工时误改）

- 范围：PWA-01 diff 仅 8 文件（`api/ai-organize.ts`、`src/lib/organize.ts`、`src/lib/types.ts`、`src/pages/AiConfirm.tsx`、`src/pages/EntryDetail.tsx`、`src/pages/Find.tsx`、`src/pages/PlaceDetail.tsx`、`src/pages/Record.tsx`）；`src/lib/sync.ts`、`src/lib/idb.ts`、`src/lib/supabase.ts` 零改动（DB 字段/同步协议未动）；`mobile/` 工作树改动属 TASK-DEV-14（绑定 UI），不计入本次 PWA 扩散。无越界。
- AI 合同：`api/ai-organize.ts:24-32` prompt 明确 cleaned 只清洗不创作（去口水词/补标点/不增删事实/不改第一人称）、public_reason 2-3 句＋不编造＋不写私密＋范文口径、matched_tags 只取感受真提到、summary 明示退役；`:77-79` 服务端丢弃上游 summary 并产出 cleaned（2000）/public_reason（300）。通过。
- 降级：`src/lib/organize.ts:65-67` 无 AI 时 cleaned 原样回填、public_reason 留空由用户手填；`AiConfirm.tsx:54-56` 降级链同样走 `d.notePublic?.trim() ? … : (h.public_reason ?? '')`。通过。
- notePublic 优先不覆盖：`AiConfirm.tsx:47,56` 均用 `d.notePublic?.trim() ? d.notePublic : …`（空白字符串不算“填过”，会正确回退 AI 版）；入库 `AiConfirm.tsx:102` `notePublic: notePublic.trim() || undefined`。通过。
- 库兼容：`types.ts:30` `Entry.summary?` 与 `types.ts:98` `AiOrganizeResult.summary?` 均保留为可选＋退役注释；`sync.ts:89,581,622-623` summary 映射未动，旧记录读写不断。通过。
- 展示回退：EntryDetail/Find/PlaceDetail 三处三级回退（见 P1-1 引行），保证无空白；EntryDetail `:290-297` 顶部只留 headline 一句、底部不再重复 notePublic 块，感受与公开理由不混淆。通过。
- Record 页：`Record.tsx:151-156` 公开理由标选填＋“留空 AI 总结、整理后还能改”，与 AiConfirm 兜底口径一致。通过。
- 回归：根 `npm run build` PASS（tsc+vite，900ms；仅 chunk>500kB 既有警告）。
