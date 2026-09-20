
# BUGS

- Task: TASK-PWA-AI-01 回归 QA（**PWA／mobile 单测段，无真机**）
- QA: qa（本窗口，只读业务代码＋亲手执行命令；只写本文件，未改业务代码，未 commit/push）
- 日期：2026-09-20
- 分支／基线：分支 `wanghoufan/master`；工作树未提交（`git log` HEAD=`e996cc6`，`git rev-parse HEAD`=`e996cc62982f753f074e2ac9c8ba14c18bc388c8`）；审查基线＝工作树 `git diff HEAD`
- 范围：`api/ai-organize.ts`（合同＋Key 只读服务端）、`src/lib/aiSettings.ts`（新）＋`src/lib/organize.ts`（带 modelOverrides 覆盖＋`testAiProvider`）、`src/pages/AiSettings.tsx`（新）、`mobile/src/features/organise.ts`（真网 Organiser）＋`mobile/src/features/__tests__/organise.test.ts`（6 新单测）
- **QA 结论：PASS** —— P0=0、blocking P1=0；四项门禁命令全绿（mobile typecheck／mobile jest 283/283／根 build／git status）；`283=277+6` 纯增量已按 HEAD 基线算术实证；Key 只读服务端（前端可运行代码 `API_KEY/apiKey` **零命中**）；越界（`mobile/android`／包名／scheme）**零改动**。非阻塞观察 4 条（O-1～O-4）。
- **未验证边界（NOT_VERIFIED，不冒认）**：① **真调 AI**（`/api/ai-organize` 需服务端 Key 部署）——本地不承载 Vercel Function，未真调，只做静态合同核＋单测 mock 级验证；② **UI 运行时行为**（读屏/点击/像素级）——本轮无浏览器自动化、无真机，`AiSettings` 页与 `ai-confirm` 真网流程仅为静态源码＋构建产物级验证。
- 命令铁律：全部门禁命令单命令单动作、未出仓库根；本轮未起任何预览/开发服务，未动他人已占端口。

## 一、执行证据（逐条，亲手执行）

| # | 命令 | 结果 | 证据摘要 |
|---|---|---|---|
| 1 | `npm --prefix mobile run typecheck` | PASS（exit 0） | `tsc --noEmit`，无输出、无错误 |
| 2 | `npm --prefix mobile test` | PASS（exit 0） | Test Suites: **34 passed / 34**；Tests: **283 passed / 283**；Snapshots 0；Time 1.731s；无失败/无跳过；仅 `migrations.test.ts` 既有 `console.debug` 噪音（`[db] expected-columns reconcile: +N`） |
| 3 | `npm run build`（根，Node `v24.19.0`） | PASS（exit 0） | `tsc -b && vite build`；`✓ 110 modules transformed`；`dist/assets/index-T51-KtSI.js 519.46 kB / gzip 155.02 kB`；`PWA v0.20.5 mode generateSW precache 13 entries (550.45 KiB)`；仅既有告警（chunk>500kB、env/idb/supabase/shares/shareCard 静态+动态双导入），无新增错误 |
| 4 | `git status --porcelain` ＋ diff 交叉核 | PASS | 见「三」「四」；PWA-AI-01 范围内文件与改动行数逐条对上；`mobile/android`／`mobile/app.config.ts`／`mobile/package.json` **零命中** |

## 二、口径逐条核对（全部通过）

| # | 口径 | 位置 | 实证 |
|---|---|---|---|
| 1 | Key 只从服务端环境变量读 | `api/ai-organize.ts:17,19,21` | `key: process.env.OPENROUTER_API_KEY / DEEPSEEK_API_KEY / OPENCODE_API_KEY`；全文件无其它 key 来源 |
| 2 | 前端只能覆盖「模型名」 | `api/ai-organize.ts:7-12,30` | `cleanModel(v)` 只收 `string`＋trim＋`slice(0,120)`；`providers(overrides)` 仅用 `overrides[p.name]` 覆盖模型名，不接任何 key/secret 入参 |
| 3 | 测试名单只做 order 过滤、不能凭空启用 | `api/ai-organize.ts:23-29` | `named` 仅 `order.filter(...)`；`.filter((p) => list[p.name] && p.key && …)` → 仍要求该通道 Key 已在服务端配好 |
| 4 | 旧模型名退役 | `api/ai-organize.ts:18-19`、`src/lib/aiSettings.ts:20-21`、`.env.example:28` | 三处一致：`deepseek-chat` 于 2026-07-24 退役，默认改 `deepseek-flash`；`.env.example` 注释「不要再用」 |
| 5 | 前端发网只发模型名、不带 Key | `src/lib/organize.ts:35,70` | `...(Object.keys(modelOverrides).length ? { modelOverrides } : {})`；空覆盖时不带键；`testAiProvider` 另带 `providers:[provider]` 名单，无 key 字段 |
| 6 | 设置页只存模型名 | `src/lib/aiSettings.ts:38-46,58-65`、`src/pages/AiSettings.tsx:62` | localStorage key `ai-model-overrides`；`pruneModelOverrides` 去空＋trim＋120 截断；页面明示「API Key 只在服务端环境变量，永远不会下发到浏览器」 |
| 7 | mobile 真网 body 无密钥 | `mobile/src/features/organise.ts:168-173` | body 仅 `transcript/placeName/area/tags`；单测 `organise.test.ts:127` 显式断言 `not.toHaveProperty('apiKey')` |
| 8 | mobile 缺省不发网、失败必降级 | `mobile/src/features/organise.ts:180-182,190-192` | `catch { return localHeuristics(input) }`（不抛出）；`createDefaultOrganiser()`＝`aiApiBase() ? createHttpOrganiser() : createPlaceholderOrganiser()` |
| 9 | mobile UI 真接线 | `mobile/app/ai-confirm.tsx:60-63,70` | `runOrganise({transcript,placeName,tags},{timeoutMs:8000})` 无 `organiser` → 走 `createDefaultOrganiser`；文案按 `suggestion.mock` 二分「本地占位…」/「AI 整理完成…」 |
| 10 | 路线入口 | `src/App.tsx:31`、`src/pages/Mine.tsx:212-215` | `/ai-settings` 路由＋Mine「模型名设置 三家通道 ›」入口；`tsc -b` 通过 |

## 三、`283=277+6` 纯增量实证（HEAD 基线算术）

| 核项 | 结果 | 证据 |
|---|---|---|
| 当前总数 | 283（34 suites） | `npm --prefix mobile test` 输出 |
| 本任务新增 describe | 恰 6 个 `it` | `organise.test.ts` 现 13 个 `it`；`describe('organise: 真网 Organiser（TASK-PWA-AI-01）')` 块内 `grep -c` ＝ **6** |
| HEAD 版同文件基线 | 7 个 `it` | `git show HEAD:mobile/src/features/__tests__/organise.test.ts \| grep -c "  it("` ＝ **7** |
| 差异是否纯增 | **+111 / −0** | `git diff --numstat -- mobile/src/features/__tests__/organise.test.ts`＝`111 0`；`-U0` 行级仅新增 `+describe`＋6 个 `+it`，**无任何既有 `it`/断言被删改** |
| 算术 | 283 − 6 ＝ 277 | 与 review 记录「277 基线」吻合；6 新用例语义齐（成功映射／501 回退／超时回退／异常体回退／缺省不发网／runOrganise 兜底仍 ok），`mock=false` 仅真网成功路径 |

## 四、Key 只读服务端 ＋ 越界零改动确认

| 核项 | 结果 | 证据 |
|---|---|---|
| `src/` key 命中 | **0** | `grep -rn -E "API_KEY\|apiKey\|api_key\|secret" src/` → 无输出 |
| `mobile/src`＋`mobile/app` key 命中 | **仅 1 处、非运行代码** | 唯一命中 `organise.test.ts:127` `expect(body).not.toHaveProperty('apiKey')`（负向断言，不构成 key 使用） |
| key-like 字面量（`sk-…`／`Bearer <值>`） | **0** | `grep -rn -E "sk-[A-Za-z0-9]\|Bearer [A-Za-z0-9]" src/ mobile/src/ mobile/app/` → 无输出 |
| `.env.example`／`mobile/.env.example` | PASS | 仅新增注释＋默认模型名（`deepseek-flash`）／新增 `EXPO_PUBLIC_AI_API_BASE=`（空值，注释明示「Key 只在服务端，这里只填地址」） |
| `mobile/android` 改动 | **零改动** | `git status --porcelain -- mobile/android mobile/app.config.ts` 空；`mobile/android` 被 `mobile/.gitignore:45:/android` 忽略，无跟踪改动 |
| 包名／scheme | **零改动** | `mobile/app.config.ts` 未进 `git status`（未修改）；现值 `scheme`／`android.package` 均 `com.wanghoufan.placejournal` |
| 包名清单过滤 | **零命中** | `git status --porcelain \| grep -Ei "android\|app\.json\|scheme\|package\.json"` → 零命中 |

## 五、Bug 清单

| Bug ID | Priority | Stage P0 Blocking? | Repro | Status | Current Task | 备注（截图/日志一句） |
|---|---|---:|---|---|---|---|

（本轮 **0 条 bug**；非阻塞观察项见下，均不影响本轮放行。）

### 非阻塞观察项（O-1～O-4，均不阻断本轮）

- **O-1（P3，注释过时；沿用 review P3-1）** `mobile/app/ai-confirm.tsx:1-2` 头注释仍写「AI Confirm：调用 organise 占位整理…全程本地（V1 移动端禁网络）」，与本轮 `createHttpOrganiser` 真网路径矛盾。**实际行为正确**（`:70` 已按 `suggestion.mock` 二分文案）。改法：注释改为「缺省本地占位，配了 `EXPO_PUBLIC_AI_API_BASE` 走服务端真网，失败回退占位」。
- **O-2（P3，字段未透传）** `mobile/app/ai-confirm.tsx:60-63` 只传 `transcript/placeName/tags`，未传 `area`；`createHttpOrganiser` 虽声明 `area`（`organise.ts:171`）但移动端调用侧恒为 `undefined`，服务端 `user` prompt 的「地点（area）」段在移动端为空。功能无碍（地点名仍在），但与 Web 口径不齐，建议后续任务归口。
- **O-3（P3，沿用 review P2-1）** `src/pages/Mine.tsx:277-281` 快捷「一键测试」未带 `loadModelOverrides()`，主链 `organize()`（`organize.ts:26,35`）与设置页 `testAiProvider`（`AiSettings.tsx:45`）均带覆盖 → 用户在设置页改模型后，Mine 页探针仍走服务端默认，两处结果可能不一致。不阻断。
- **O-4（P3，范围外残留）** `src/pages/Mine.tsx:318,327` summary-first 取值（PWA-01 O-2）仍在；该文件本轮仅 +4 行（新增设置入口），summary-first 行**非本轮改动**，`??` 可回退到 `notePublic`，建议后续任务统一。review 的 P2-2（`??` vs `\|\|`）、P2-3（`api:92` 300 字截断注释／`exporter.ts:43` summary 列注释）本轮仍为 backlog，与本轮结论一致。

## 六、七查对照

| 查项 | 结果 | 说明 |
|---|---|---|
| typecheck | PASS | mobile `tsc --noEmit` exit 0 |
| unit | PASS | mobile jest 34 suites / 283 tests 全绿；本任务 +6 纯增（见「三」） |
| build | PASS | 根 `tsc -b && vite build`；产物 `dist/`；仅既有告警 |
| lint | N/A | 根 `package.json` 无 lint 脚本；`mobile` 有 `expo lint` 但非本轮指定门禁（项目既有状态，非本轮引入） |
| API（真调） | NOT_VERIFIED（边界） | `/api/ai-organize` 需服务端 Key 部署；本轮未真调。合同、`modelOverrides`／`providers` 入参、丢弃上游 summary、产出 `cleaned_transcript(2000)`／`public_reason(300)` 等分支为静态核过；mobile 侧 HTTP 语义由 6 单测 mock 覆盖 |
| logs | PASS | typecheck/test/build 输出无 error；仅既有 `console.debug` 与体积/双导入告警；无敏感值回显 |
| regression | PASS | 旧行为为子集：`createDefaultOrganiser` 未配环境变量时＝本地占位（与旧一致）；`createPlaceholderOrganiser`／`localHeuristics`／`runOrganise` 端口与超时语义未变；Web `organize()` 未传覆盖时 body 与旧一致；`283−6=277` 证明无删测/无静默跳过 |
| DoD | PASS | Key 只读服务端（前端零可运行命中）；越界零改动；283=277+6；四项命令全绿 |

## 真机QA会话能力预检结果

本轮为 **PWA／移动端单测段（无真机）**，不适用真机预检（模板要求「每真机 session 正式用例前必填」）。**本节不填占位、不伪造**：无 session ID、无模型注入记录、无读屏/截图/点击证据，故 UI 运行时结论统一记 `NOT_VERIFIED`（见开头「未验证边界」）。

> 判据：`ok=true/exit 0/工具调用成功`但无状态或像素变化一律记 `FAIL_UNVERIFIED_ACTION`；禁跨模型/跨Runtime/跨session拼PASS。

- 日期/任务名：2026-09-20 / TASK-PWA-AI-01（无真机段）→ **N/A（无真机段）**
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
- 是否允许进入正式QA（全PASS才YES，否则NO即停）：NO（本轮为无真机静态＋命令＋单测段；真调/真机段另派）

## Fix Attempt Fingerprint

- Task ID: TASK-PWA-AI-01（QA 回归复核）
- Root Cause Hypothesis: N/A（非缺陷修复轮；本轮为回归验收轮，无待修根因）
- Approach: 只读核对＋亲手执行 4 项门禁命令；对 Key 服务端隔离、越界、测试纯增量逐条定位到行号/命令并交叉验证；真调与 UI 运行时明确记 NOT_VERIFIED 不冒认
- Files Changed: 无（QA 只读；本轮仅新增本报告 `docs/qa/BUGS_PWA-AI-01.md`）
- Verification: mobile typecheck exit 0；mobile jest 283/283（34 suites）；根 build exit 0；`git diff --numstat` organise.test.ts＝`111 0` 且 HEAD 基线 7 `it` → 现 13 `it`（+6）；前端 `API_KEY/apiKey` 零可运行命中；`mobile/android`＋包名＋scheme 零改动
- Failure Reason: N/A
- Difference From Previous Attempt: N/A

> Attempt ID / Dispatch ID / Model-Backend 系字段 2.0 已废弃，不填（模型轨迹记账本）。
