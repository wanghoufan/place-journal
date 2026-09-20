
# BUGS

- Task: TASK-PWA-01 回归 QA（**PWA 段，无真机**）
- QA: qa（本窗口，只读业务代码＋亲手执行命令；只写本文件，未改业务代码，未 commit/push）
- 日期：2026-09-20
- 分支／基线：分支 `wanghoufan/master`；工作树未提交（`git log` HEAD=`e996cc6`）；审查基线＝`git diff` 工作树
- 范围：`api/ai-organize.ts`（合同）、`src/lib/organize.ts`（降级）、`src/pages/Record.tsx`／`AiConfirm.tsx`／`EntryDetail.tsx`／`Find.tsx`／`PlaceDetail.tsx`、`src/lib/shares.ts`、`src/lib/types.ts`
- **QA 结论：PASS** —— P0=0、blocking P1=0；build PASS；4 路由 200；8 处口径逐条实证通过；code-reviewer P1-1 已实证收敛；`mobile/` 对 PWA-01 **零改动**。非阻塞观察 5 条（O-1～O-5）。
- **未验证边界（NOT_VERIFIED，不冒认）**：① AI 真调（`/api/ai-organize` 需服务端 Key，本地 `vite preview` 不承载 Vercel Function，实测 404）；② UI 运行时行为（读屏/点击/像素级）——本轮无浏览器自动化与真机，仅静态源码＋构建产物级验证。
- 命令铁律：全部门禁命令单命令单动作、未出仓库根；预览服务（4175）由本轮起、本轮停，未动他人已占端口（5173 属既有进程，未碰）。

## 一、执行证据（逐条，亲手执行）

| # | 命令 | 结果 | 证据摘要 |
|---|---|---|---|
| 1 | `npm run build`（Node `22.22.2-3`） | PASS | `tsc -b && vite build`；`✓ built in 1.02s`；`dist/assets/index-4FeSov1j.js 514.71 kB / gzip 153.23 kB`；`PWA v0.20.5 mode generateSW precache 13 entries (545.22 KiB)`；仅既有告警（chunk>500kB、shares/shareCard 静态+动态双导入），无新增错误 |
| 2 | `curl -s -o /dev/null -w '%{http_code}'` ×4 路由 | PASS | `/`→200、`/find`→200、`/record`→200、`/mine`→200 |
| 3 | 补充 curl（PWA 资产与深链回退） | PASS | `/sw.js`→200、`/manifest.webmanifest`→200、`/s/p/<22位slug>`→200、`/s/l/<22位slug>`→200、`/entry/<不存在id>`→200、`/place/<不存在id>`→200；`/` 返回含 `id="root"` 与 `assets/index-4FeSov1j.js` 的 SPA 壳 |
| 4 | `curl -X POST /api/ai-organize` | NOT_VERIFIED（符合预期） | `status=404`、空 content-type；`vite preview` 不承载 Vercel Function。落地结论：`organize.ts:24` 的 404→`not_configured`→本地推测降级链**在本地可触发**；501 分支（服务端无 Key）与真 AI 返回合同**未运行验证** |
| 5 | `git status --porcelain` ＋ 8 文件清单交叉核 | PASS | PWA-01 八文件全在根 `api/`＋`src/`；清单内 `mobile/` 命中数 **0**（见「四」） |
| 6 | `grep` 8 处口径逐条（见「二」） | PASS | 逐条命中，行号见下 |

## 二、8 处口径逐条核对（全部通过）

| # | 口径 | 位置 | 实证 |
|---|---|---|---|
| 1 | 竖杠那句 notePublic 优先、三级回退 | `src/pages/EntryDetail.tsx:58` | `const headline = entry.notePublic \|\| entry.summary \|\| entry.transcript`；`:292` 渲染 `{headline && <p className="border-l-4 …">{headline}</p>}` |
| 2 | 底部重复块已删 | `src/pages/EntryDetail.tsx:290-299` | `git diff` 显示旧 `{entry.notePublic && (…公开推荐理由…)}` 独立块**已整块删除**，注释改为「公开理由不再在底部重复一块」；编辑表单标签同步改名「公开分享理由（分享时展示，即详情页顶部那句）」 |
| 3 | Find 副标题回退链 | `src/pages/Find.tsx:133` | `h.best.notePublic ?? h.best.summary ?? h.best.transcript ?? '—'`（旧版仅 `summary ?? transcript`） |
| 4 | PlaceDetail 副标题回退链 | `src/pages/PlaceDetail.tsx:37` | `e.notePublic ?? e.summary ?? e.transcript ?? '—'`（旧版仅 `summary ?? transcript`） |
| 5 | shares 三级回退（review P1-1） | `src/lib/shares.ts:36` | `reason: entry.notePublic \|\| entry.summary \|\| entry.transcript`＋`:35` 注释标明与详情/Find/地点页对齐；**P1-1 已收敛**（原为只到 `summary`） |
| 6 | 确认页三件套（cleaned→整理后感受、public_reason→公开分享理由、matched_tags→标签） | `src/pages/AiConfirm.tsx:45,47,48,136-142,160-174,189-194` | `setTranscript(res.cleaned_transcript \|\| d.transcript \|\| '')`；`setNotePublic(d.notePublic?.trim() ? d.notePublic : (res.public_reason ?? ''))`；`setSelectedTagIds(res.matched_tags…)`；页面三段标题＝「📝 整理后感受·仅自己可见」「🏷 标签」「💬 公开分享理由」；**全文件无 summary 展示** |
| 7 | Record 选填文案 | `src/pages/Record.tsx:151-152,156` | 「公开分享理由 · 选填 · 分享时展示」＋「留空也没事，AI 会按你的感受总结一句，整理后你还能改」＋placeholder「（选填）…不填就交给 AI 总结」，与 AiConfirm 兜底口径一致 |
| 8 | 降级 cleaned＝原文 | `src/lib/organize.ts:65-67` | `// 无 AI 时不做清洗：cleaned_transcript 原样回填原文` → `result.cleaned_transcript = t`；`result.public_reason = ''`（由用户手填兜底） |

补充核过项：
- `api/ai-organize.ts` 合同：`:24-32` prompt 明确 cleaned 只清洗不创作、public_reason 2-3 句/≤80 字/不编造/不写私密/范文口径、matched_tags 只取真提到、`:31` 明示 summary 退役；`:74-83` 服务端丢弃上游 summary、产出 `cleaned_transcript(2000)`／`public_reason(300)`；`:35-40` 405/501/400 三态；`:52-53,57-59` 9s 单 provider／13s 全局 deadline failover。
- 库兼容：`src/lib/types.ts:30` `Entry.summary?`、`:98` `AiOrganizeResult.summary?` 保留＋退役注释，新增 `:99 cleaned_transcript?`／`:100 public_reason?`；`src/lib/sync.ts:89,623` summary 映射未动 → 旧记录读写不断。
- happy path 不写 summary：`src/pages/AiConfirm.tsx:101-102` entry 构造显式注释「summary 退役，不再写入」，payload 无 summary 键。
- 分享白名单未扩散：`src/lib/shares.ts:14-43` 只加回退取值，字段集合未变（无新增字段进快照）。

## 三、Bug 清单

| Bug ID | Priority | Stage P0 Blocking? | Repro | Status | Current Task | 备注（截图/日志一句） |
|---|---|---:|---|---|---|---|

（本轮 **0 条 bug**；review P1-1 已实证收敛，其余为下方非阻塞观察项。）

### 非阻塞观察项（O-1～O-5，均不阻断本轮）

- **O-1（P3，口径微差）`??` 与 `\|\|` 混用，空字符串不回落**：`Find.tsx:133`／`PlaceDetail.tsx:37` 用 `??`，而 `EntryDetail.tsx:58`／`shares.ts:36` 用 `\|\|`。`??` 只对 `null/undefined` 回落，若 `notePublic === ''` 则副标题渲染空白、`'—'` 兜底不可达。**当前写入侧已堵死空串**（`AiConfirm.tsx:102` `notePublic.trim() \|\| undefined`、`EntryDetail.tsx:86` `fNotePublic \|\| undefined`），实际不可触发；仅云端/历史数据存在空串时才会显现。建议后续统一为 `\|\|`。
- **O-2（P3，范围外残留）`src/pages/Mine.tsx:318,327` 仍 summary-first**：`r.summary ?? r.note_public`／`e.summary ?? e.notePublic`。summary 退役后虽能靠 `??` 回到 notePublic，但顺序与「notePublic 优先」口径相反，旧数据两者并存时显示旧摘要。该文件本轮**零改动**、不在 PWA-01 范围，建议后续任务归口统一。
- **O-3（P3，示范数据）`src/lib/demo.ts:44-94` 仍写退役字段 `summary`**：示范数据不影响真实数据（AGENTS 允许可清除示范用例），但与新结构不一致，建议随下次 demo 维护收敛。
- **O-4（P3，降级文案边界）**：`Record.tsx:152,156` 承诺「AI 会按你的感受总结一句」；AI 未配置降级时 `organize.ts:67` 恒 `public_reason=''`，承诺落空。缓解：`AiConfirm.tsx:53` 有「AI 未配置…已按本地推测预填，请逐项确认修改」明确提示，属可接受降级，非缺陷。
- **O-5（P3，backlog 未闭环）**：review 的 P2-1（`api/ai-organize.ts:79` 截断 300 vs prompt 80 字，未补说明注释）、P2-2（`src/lib/exporter.ts:43` summary 列未补「仅旧数据兼容」注释）本轮**仍为 backlog**，与本轮 review 结论一致，不阻断。

## 四、`mobile/` 零改动确认

| 核项 | 结果 | 证据 |
|---|---|---|
| PWA-01 八文件是否含 `mobile/` 路径 | PASS（0 命中） | 八文件全部位于根 `api/`、`src/lib/`、`src/pages/`；清单过滤 `mobile` 命中数＝0 |
| 根 web 构建是否涉 `mobile/` | PASS | `vite.config.ts` 无 `mobile` 引用；`npm run build` 产物仅 `dist/` |
| 工作树 `mobile/` 改动归属 | 属 **TASK-DEV-14**（非本轮） | `git status` 中 mobile 条目＝`mobile/app/(tabs)/mine.tsx`、`mobile/app/auth/callback.tsx`、`mobile/src/supabase/auth.ts`、其 `__tests__`，加新增 `mobile/src/features/account.ts(+test)`；diff 内容为 owner 绑定/退出 UI、`getLoginState`、mismatch 文案，与 PWA-01 无关；该段已由 `docs/qa/BUGS_DEV-14.md`（PASS）独立覆盖 |

## 五、七查对照

| 查项 | 结果 | 说明 |
|---|---|---|
| unit | N/A | 根仓库无单测运行器（无 `vitest/jest` 配置、`package.json` 仅 dev/build/preview）；`mobile` 单测归 DEV-14（260/260，见 BUGS_DEV-14） |
| build | PASS | 见「一」#1 |
| lint | N/A | 根 `package.json` 无 lint 脚本（项目既有状态，非本轮引入） |
| API | NOT_VERIFIED（边界） | `/api/ai-organize` 需服务端 Key；本地 404 为预期。合同文本＋服务端产出/丢弃分支为静态核过（见「二」补充） |
| logs | PASS | build/预览日志无错误；仅既有 chunk 体积与双导入告警；无敏感值回显 |
| regression | PASS | 库兼容字段未删（types/sync 未动写读协议）；分享字段白名单未扩；`EntryDetail/Find/PlaceDetail` 回退链均**加一级**（旧行为是其子集，非破坏性）；既有路由与深链全部 200 |
| DoD | PASS | 8 处口径逐条落实；review P1-1 收敛；build＋路由门禁全绿；未越界改业务代码 |

## 真机QA会话能力预检结果

本轮为 **PWA 无真机段**，不适用真机预检（模板要求「每真机 session 正式用例前必填」）。**本节不填占位、不伪造**：无 session ID、无模型注入记录、无读屏/截图/点击证据，故 UI 运行时结论统一记 `NOT_VERIFIED`（见开头「未验证边界」）。

> 判据：`ok=true/exit 0/工具调用成功`但无状态或像素变化一律记 `FAIL_UNVERIFIED_ACTION`；禁跨模型/跨Runtime/跨session拼PASS。

- 日期/任务名：2026-09-20 / TASK-PWA-01（PWA 段，无真机）→ **N/A（无真机段）**
- session ID：N/A
- 模型精确ID：deepseek-v4.1-flash（本窗口，仅用于静态核与命令执行，不构成真机能力证据）
- Runtime：本窗口 subagent（bash 直驱）
- 原生CUA是否实际注入：未注入（本轮未使用，不做真机结论）
- 可用工具精确名称：Read／Grep／Bash（本窗口既有工具）
- CLI备用入口是否存在（Bash→orca computer CLI）：未使用
- Orca Runtime（`orca status --json` 实时结果，禁沿用旧报告）：未查询
- 能力（`orca computer capabilities --json` 实时结果）：未查询
- 权限（`orca computer permissions --json` 实时结果）：未查询
- 读屏结果：N/A
- 截图结果：N/A
- 点击并恢复结果：N/A
- 输入并清除结果：N/A
- 滚动及可见位移结果：N/A
- 界面恢复确认：N/A
- 最终结论（枚举只许 `PASS / BLOCKED_TOOL_NOT_INJECTED / BLOCKED_ORCA_APPROVAL / BLOCKED_RUNTIME / BLOCKED_OS_PERMISSION / FAIL_UNVERIFIED_ACTION / NOT_VERIFIED`，禁 `FAIL_MODEL_ACTION`）：`NOT_VERIFIED`（无真机段，不适用）
- 原始错误摘要：无
- 是否允许进入正式QA（全PASS才YES，否则NO即停）：NO（本轮为无真机静态＋构建＋路由段；真机段另派）

## Fix Attempt Fingerprint

- Task ID: TASK-PWA-01（QA 复核）
- Root Cause Hypothesis: review P1-1——`src/lib/shares.ts` 分享快照 `reason` 回退链只到 `summary`，与详情/Find/地点页三处「notePublic→summary→transcript」不一致；旧记录 notePublic/summary 双空时分享卡理由空白
- Approach: 验收 builder 已落地的 A 方案（回退链补 `transcript`），不改代码
- Files Changed: 无（QA 只读；期望改动点为 `src/lib/shares.ts:35-36`）
- Verification: `grep` 实证 `src/lib/shares.ts:36` 现为 `entry.notePublic || entry.summary || entry.transcript`，与另三处口径对齐；`npm run build` PASS；分享快照字段白名单未新增键
- Failure Reason: N/A（已收敛）
- Difference From Previous Attempt: N/A

> Attempt ID / Dispatch ID / Model-Backend 系字段 2.0 已废弃，不填（模型轨迹记账本）。
