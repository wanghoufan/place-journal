# BUGS

- Task: TASK-DEV-16A 回归 QA（**非真机段**；真机段另派，记 NOT_VERIFIED）
- QA: qa（本窗口，只读业务代码＋亲手执行命令；只写本文件，不改业务代码，未 commit/push）
- 日期：2026-09-20
- 范围：mobile 记录链——`mobile/src/features/draft.ts`（新）、`mobile/src/components/Lightbox.tsx`（新）、`mobile/app/(tabs)/record.tsx`、`mobile/app/ai-confirm.tsx`、`mobile/app/entry/[id].tsx`（entry 编辑）、`mobile/src/features/organise.ts`（超时 12s）＋连带 `ui.tsx`／`recordActions.ts` 及其单测
- 基线：HEAD=`f0a621c`，分支 `wanghoufan/master`；改动全部未提交（工作树）
- **QA 结论：PASS** —— P0=0、blocking P1=0；306/306 tests 全绿（相对 283 基线 **纯增量 +23，零删测零跳过**）；typecheck exit 0；越界零改动（`mobile/android/`、包名/scheme、`app.config.ts`、`package.json` 均未动）；根 Web 零改动。已列 3 条非阻塞观察项（O-1～O-3），真机段另派。
- 命令铁律：门禁命令均为**单命令单动作**（`npm --prefix mobile …` / `git …`），未 `cd`、未出仓库根；探查阶段用于只读定位的复合命令（`cd &&`）不产生状态变更，不计入门禁证据。

## 一、执行证据（逐条，亲手执行）

| # | 命令 | 结果 | 证据摘要 |
|---|---|---|---|
| 1 | `npm --prefix mobile run typecheck` | PASS（exit 0） | `tsc --noEmit` 零输出、零报错（日志仅 npm banner 4 行） |
| 2 | `npm --prefix mobile test` | PASS（exit 0） | Test Suites: **36 passed / 36**；Tests: **306 passed / 306**；Snapshots 0；Time 1.495s；无失败/无跳过；仅 `migrations.test.ts` 既有 `console.debug`（`[db] expected-columns reconcile: +N`）噪音 |
| 3 | `git status --porcelain` | 见「三」 | **18 行**＝`M`×10（1 治理 doc ＋9 mobile）＋`??`×8（4 交付新文件＋1 reviewer 产出＋2 用户作业材料＋1 HANDOFF 相关）；根 `src/`／`api/`／`public/`／`index.html`／根 `package.json`／`vite.config.ts` **零条目** |
| 4 | `git diff --name-only`（tracked） | PASS | 10 行，无 `mobile/android/`、无 `app.config.ts`、无 `package.json`、无 `eas.json` |

### 测试增量核对（证明「306 = 283 + 23 纯增量」不是估的）

- 新增用例逐文件计数（`it(` 计数，jest 逐文件实跑复核）：

  | 文件 | 类型 | 本次新增 | 该文件现总数 |
  |---|---|---:|---:|
  | `src/features/__tests__/draft.test.ts` | 新文件 | +8 | 8 |
  | `src/components/__tests__/lightbox.test.tsx` | 新文件 | +5 | 5 |
  | `src/components/__tests__/ui.test.tsx` | 改 | +3 | 8 |
  | `src/features/__tests__/organise.test.ts` | 改 | +3 | 16 |
  | `src/features/__tests__/recordActions.test.ts` | 改 | +4 | 16 |
  | **合计** | | **+23** | |

- 三份被改测试文件的 `git diff` 中 `^-\s*(it|test)(` 行数 **均为 0**（`ui.test.tsx` 的 2 处删除是 import 行，非用例）；`git status` 无 `D`（无删测文件）、无跳过/待定用例 → **纯增量全绿**。
- 本轮总数 306 − 新增 23 = **283**，与 HANDOFF 记的「jest 283 基线」**逐字吻合**，既无删测也无静默跳过。

## 二、越界核对（android/包名/scheme 零改动）

- **`mobile/android/` 零改动**：该目录在本仓被 `.gitignore` 忽略（`git check-ignore mobile/android` 命中），git 无法直接判定，故以**内容＋时间**双证：`android/` 全部源文件（`app/build.gradle`、`app/src/main/AndroidManifest.xml`、`build.gradle`、`gradle.properties`、`settings.gradle`）mtime 均为 **2026-09-20 00:47**（T062 本地构建时段），而本任务改动窗口为 **2026-09-20 21:36–21:53**；窗口内无任何 android 源文件被写。（`find -newermt 2026-09-19` 命中的全为 `.cxx/`、`build/` 构建产物，非源。）
- **包名/scheme 一致未动**：`app/build.gradle:90,92` `namespace/applicationId = com.wanghoufan.placejournal`；`AndroidManifest.xml:33` `scheme="com.wanghoufan.placejournal"`；`app.config.ts:9,12` `scheme`／`package` 同值；`app.config.ts` mtime **2026-09-18 13:46**，未在窗口内。
- **`mobile/package.json`／`eas.json`／`tsconfig.json`** 在 `git status` 中零条目（`package.json` mtime 2026-09-20 12:12，早于本窗口）。
- **根 Web 零改动**：`src/`／`api/`／`public/`／`index.html`／根 `package.json`／`vite.config.ts` 在 `git diff` 中零条目。

## 三、范围核对（`git status --porcelain` 全量 18 行）

- `M`×10：`docs/handoff/HANDOFF.md`（治理 doc，非本任务判定范围）；**本任务交付 9 件**＝`mobile/app/(tabs)/record.tsx`、`mobile/app/ai-confirm.tsx`、`mobile/app/entry/[id].tsx`、`mobile/src/components/ui.tsx`、`mobile/src/features/organise.ts`、`mobile/src/features/recordActions.ts` ＋ 3 个被改单测（`ui.test.tsx`／`organise.test.ts`／`recordActions.test.ts`）。
- `??`×8：`mobile/src/features/draft.ts`、`mobile/src/components/Lightbox.tsx`（本任务新增）＋ `draft.test.ts`、`lightbox.test.tsx`（本任务新增单测）＋ `docs/review/CODE_REVIEW_DEV-16A.md`（reviewer 产出，未动）＋ 根「作业提交材料…html/md」2 件（用户自有文件，未碰）。
- 声明范围（draft.ts／Lightbox.tsx／record.tsx／ai-confirm.tsx／entry 编辑／organise 超时 12s）与实际改动**逐项对齐，无范围扩散**。

## 四、DoD 逐条核对（静态＋单测口径，真机段另派）

| 条目 | 结论（非真机段可达口径） | 证据 |
|---|---|---|
| 草稿接力 Record → AiConfirm（内存，不落库） | **成立** | `draft.ts:26-56` 模块级 `current/saved`；`record.tsx:189-215` `setDraft(...)` 后 `router.push('/ai-confirm')`；`ai-confirm.tsx:36` `useState<RecordDraft \| null>(takeDraft)` 惰性读一次、`useEffect(:148-170)` 进页自动整理一次；`takeDraft` 只读不清空（`:35-37`） |
| 保存信号复位（tab 常驻防重复保存） | **成立** | `ai-confirm.tsx:229-233` 保存成功后 `clearDraft()`＋`markDraftSaved()`；`record.tsx:154-163` `useFocusEffect`＋`consumeDraftSaved()` 读后即清、`resetForm()` 只跑一次；单测 `draft.test.ts`（8 例）覆盖置位/读后清/重复消费 |
| 感受与公开理由两框分流（用户自填优先） | **成立** | `ai-confirm.tsx:333-349` 两个独立 `TextField`；`applySuggestion:89-93` `cleanedTranscript` 进「整理后感受」、`publicReason` 仅当用户未填才兜底；`organise.ts:26-30,95-97,149-150` 两字段分流回填 |
| 超时 12s 对齐服务端预算 | **成立** | `organise.ts:118-121` `AI_API_TIMEOUT_MS = 12000`（原 8000），注释写明服务端单通道 9s／全局 13s；`ai-confirm.tsx:124` 显式传 `{ timeoutMs: AI_API_TIMEOUT_MS }`；单测 `organise.test.ts`「默认客户端超时与服务端预算对齐（12s）」 |
| 未命中建标签（AI 不自动建，点一下才建） | **成立** | `recordActions.ts:216-253` `createTagNamed`（同名复用 `created:false`；维度缺失补建）；`ai-confirm.tsx:173-186` `addUnmatchedTag` 由「加入场景」按钮触发；4 例单测覆盖补建维度/复用/空名抛错 |
| 两处现场建标签（Record ＋ Entry 编辑） | **成立** | `ui.tsx:196-231` `InlineTagCreator`（空名禁用、提交去空白、输入自清空、busy 禁用）；挂载点 `record.tsx:440` 与 `entry/[id].tsx:197`；3 例单测 |
| 灯箱（点图放大／翻页／计数圆点／设为封面） | **成立** | `Lightbox.tsx:21-130` 复用 `Modal`＋横向 `ScrollView` `pagingEnabled`，`onMomentumScrollEnd` 回报 index，`onSetCover` 显式设封面；5 例单测；接入 `record.tsx:332-341` |
| 不阻断降级（无网/超时/异常均回退本地推测并标注） | **成立** | `ai-confirm.tsx:126-142` ok 走 review，timeout/fail 走 `skipped`＋文案；`aiLocal` 在 review 态给显式「本地推测」提示：`ai-confirm.tsx:251-257` |
| 约束：不改包名/scheme、不碰 android、既有测试不回归、新增逻辑有单测 | **全部成立** | 见「一」「二」「三」 |

## 五、非阻塞观察项（O-1～O-3，均不阻断进 supervisor）

- **O-1（P3，文档口径）**：reviewer 报告 `CODE_REVIEW_DEV-16A.md:4` 记「306=302+4」，与实测不符——本次新增用例 **+23**（见「一」增量表），306 = **283**（HANDOFF 基线）+ 23；结论「纯增量、无回归删除」正确，仅出处数字有误，建议随收尾修正。
- **O-2（P3，代码可读性，承接 reviewer P2）**：`draft.ts:34-37` `takeDraft` 实为 peek（只读不清空，清空靠 `clearDraft`），命名易误读；行为正确，单测已锁语义。
- **O-3（P3，边界，承接 reviewer P2）**：`recordActions.ts:238-239` `createTagNamed` 同名查询 `SELECT id FROM tags WHERE name=?` **不区分 `demo`**，若历史存在同名演示标签会被复用（建出真实标签时不勾 demo 场）。当前演示数据未含与用户新标签重名项，未实测触发；建议后续确认是否需要 `AND demo=0` 过滤。

## BUGS

| Bug ID | Priority | Stage P0 Blocking? | Repro | Status | Current Task | 备注（截图/日志一句） |
|---|---|---:|---|---|---|---|
| —（无） | — | No | — | — | TASK-DEV-16A | 本次非真机段回归 QA **未发现阻塞缺陷**；三条非阻塞观察项见「五」 |
| QA-DEV16A-01 | P3 | No | `CODE_REVIEW_DEV-16A.md` 内「306=302+4」与实测增量 +23 不符 | Open（文档口径） | TASK-DEV-16A | 结论不变，仅出处数字待修正 |
| QA-DEV16A-02 | P3 | No | `createTagNamed` 同名查询未过滤 `demo=0` | Open（边界待确认） | TASK-DEV-16A | 未实测触发；见 O-3 |
| QA-DEV16A-03 | P3 | No | `takeDraft` 命名 misleading（实为 peek） | Open（承接 reviewer P2） | TASK-DEV-16A | 语义已被单测锁定 |

## 真机QA会话能力预检结果（每真机session正式用例前必填，PASS才进正式QA，否则停）

> 本任务未派真机段，**预检未执行**，全部如实记 `NOT_VERIFIED`；待另派真机 session 时按模板重跑并就地替换本段。

- 日期/任务名：NOT_VERIFIED（未派真机 session）
- session ID：NOT_VERIFIED
- 模型精确ID：NOT_VERIFIED
- Runtime：NOT_VERIFIED
- 原生CUA是否实际注入：NOT_VERIFIED（未注入检测未执行）
- 可用工具精确名称：NOT_VERIFIED
- CLI备用入口是否存在（Bash→orca computer CLI）：NOT_VERIFIED
- Orca Runtime（`orca status --json` 实时结果）：NOT_VERIFIED（未执行）
- 能力（`orca computer capabilities --json`）：NOT_VERIFIED
- 权限（`orca computer permissions --json`）：NOT_VERIFIED
- 读屏结果：NOT_VERIFIED
- 截图结果：NOT_VERIFIED
- 点击并恢复结果：NOT_VERIFIED
- 输入并清除结果：NOT_VERIFIED
- 滚动及可见位移结果：NOT_VERIFIED
- 界面恢复确认：NOT_VERIFIED
- 最终结论：**NOT_VERIFIED**（本任务范围仅非真机段；真机段另派）
- 原始错误摘要：NOT_VERIFIED
- 是否允许进入正式QA：**NO**（真机段未做，不可判定）

### 真机段待验清单（另派时按此执行）

1. 记录页选照片 → 点图开灯箱 → 左右翻页／圆点定位／「设为封面」。
2. 写感受 →「交给 AI 整理 →」→ 自动整理 → 两框（整理后感受／公开理由）分流与可改。
3. 断网／不配 AI 时进整理页 → 降级本地推测＋明确标注 → 仍可「不整理，直接保存记录」。
4. 未命中建议词点「加入场景」建标签；Record 与 Entry 编辑两处现场建标签。
5. 整理页保存后回 Record tab → 表单已复位、不重复建第二条。

## Fix Attempt Fingerprint

- Task ID: TASK-DEV-16A
- Root Cause Hypothesis: 非缺陷修复任务（记录链照抄 PWA 的功能实现＋超时口径对齐）；本段为增量回归 QA，无 bug 修复。
- Approach: 只读业务代码＋亲手执行门禁命令（typecheck／test／git status），核对 306 纯增量与越界零改动。
- Files Changed: 无（QA 只写本文件，未改业务代码，未 commit/push）。
- Verification: `npm --prefix mobile run typecheck` exit 0；`npm --prefix mobile test` exit 0（36 suites／306 tests 全绿）；`git status --porcelain` 18 行、`git diff --name-only` 10 行，android／包名／根 Web 零改动。
- Failure Reason: 无（P0=0／blocking P1=0）。
- Difference From Previous Attempt: 承接 code-reviewer「过（P0=0／P1=0，P2×2）」结论，本段补足可复现命令证据与越界双证（android 因 gitignore 改走 mtime 内容证），并修正 reviewer 增量数字口径（O-1）。

> Attempt ID / Dispatch ID / Model-Backend 系字段 2.0 已废弃，不填（模型轨迹记账本）。

---

# 附录 A｜复验节（TASK-QA-DEV-16A **补跑**，2026-09-21）

> 触发：上一轮 QA（306 口径）之后发生返工，本节点重跑门禁并复核增量/越界。
> **本节为最新口径，覆盖上方 306 旧数**；上方正文保留为第一轮原始证据，不回改。
> 本节仍只写本文件，未改业务代码，未 commit/push。

## A-1 门禁执行证据（逐条，亲手执行；单命令单动作）

| # | 命令 | 结果 | 证据摘要 |
|---|---|---|---|
| 1 | `npm --prefix mobile run typecheck` | **PASS（exit 0）** | `tsc --noEmit` 零输出、零报错 |
| 2 | `npm --prefix mobile test` | **PASS（exit 0）** | Test Suites: **37 passed / 37**；Tests: **313 passed / 313**；Snapshots 0；Time 1.633s；无失败、无跳过；仅 `migrations.test.ts` 既有 `console.debug`（`[db] expected-columns reconcile: +N`）噪音 |
| 3 | `git status --porcelain` | 见 A-3 | **20 行**＝`M`×11（1 治理 doc ＋10 mobile）＋`??`×9（4 交付新文件＋1 reviewer 产出＋1 QA 本文件＋2 用户作业材料）；根 `src/`／`api/`／`public/`／`index.html`／根 `package.json`／`vite.config.ts` **零条目** |
| 4 | `git diff --stat` | 见 A-3 | 11 files changed, **748 insertions(+), 98 deletions(-)**；`git diff --name-only` 11 行，无 `mobile/android/`、无 `app.config.ts`、无 `package.json`、无 `eas.json` |

## A-2 增量核对（证明「313 = 306 + 7」是纯增量，不是估的）

- **差值**：本轮 313 − 上轮 306 = **+7**；套件 37 − 36 = **+1**。
- **+7 的唯一来源**（新文件，整文件即增量）：

  | 文件 | 类型 | 用例数 | 备注 |
  |---|---:|---:|---|
  | `mobile/src/features/__tests__/form.test.ts` | 新文件 | **7** | 覆盖 `aiNextGate` 三态门槛（可进/缺内容/缺地点/新地点名/空白 trim／只填公开理由） |

- **零删测三证**：① `git diff -U0` 中 `^-\s*(it|test)(` 命中 **0 行**；② 被改的 3 个追踪测试文件仍只**加** 10 例（`ui.test.tsx` +3／`organise.test.ts` +3／`recordActions.test.ts` +4，与上轮逐字一致），删除行仅 `ui.test.tsx` 的 2 行 `import`；③ `git status` 无 `D` 条目（无删测文件）；④ 全仓 `.skip/.todo/.only/xit/xdescribe` 命中 **0**（无静默跳过）。
- **写入窗口旁证**：上轮 QA 窗口结束（2026-09-20 21:49）之后，`mobile/app`＋`mobile/src` 下**仅 3 个文件**被写且同为 **2026-09-21 05:08**——`mobile/app/(tabs)/record.tsx`（M）、`mobile/src/features/form.ts`（M）、`mobile/src/features/__tests__/form.test.ts`（??）。即测试树的 delta 唯一等于 `form.test.ts`，与 +7/+1 完全对齐。

## A-3 范围与越界核对

- **`git status --porcelain` 全量 20 行**：
  - `M`×11：`docs/handoff/HANDOFF.md`（治理 doc，非本任务判定范围）＋ **本任务交付 10 件**＝`mobile/app/(tabs)/record.tsx`、`mobile/app/ai-confirm.tsx`、`mobile/app/entry/[id].tsx`、`mobile/src/components/ui.tsx`、`mobile/src/features/form.ts`、`mobile/src/features/organise.ts`、`mobile/src/features/recordActions.ts` ＋ 3 个被改单测（`ui.test.tsx`／`organise.test.ts`／`recordActions.test.ts`）。
  - `??`×9：`mobile/src/features/draft.ts`、`mobile/src/features/form.test.ts`（新单测）、`mobile/src/components/Lightbox.tsx`、`mobile/src/components/__tests__/lightbox.test.tsx`、`mobile/src/features/__tests__/draft.test.ts` ＋ `docs/qa/BUGS_DEV-16A.md`（本文件）＋ `docs/review/CODE_REVIEW_DEV-16A.md`（reviewer 产出，未动）＋ 根「作业提交材料…html/md」2 件（用户自有文件，未碰）。
- **返工内容与本任务声明对齐**：`form.ts` 新增 `aiNextGate`（交给 AI 整理按钮三态门槛，对标 Web `hasPlace/hasContent/canNext`，口径含「只填公开理由也算有内容」），`record.tsx` 改用它统一按钮禁用与文案；**无范围扩散**。
- **`mobile/android/` 零改动**：该目录被 `.gitignore` 忽略（`git check-ignore` 命中 `mobile/.gitignore:45:/android`），改用**内容＋时间**双证：`app/build.gradle`、`build.gradle`、`gradle.properties`、`settings.gradle`、`app/src/main/AndroidManifest.xml` mtime 全为 **2026-09-20 00:47**，早于返工窗口 2026-09-21 05:08。
- **包名/scheme 一致未动**：`app/build.gradle:90,92` `namespace/applicationId = com.wanghoufan.placejournal`；`AndroidManifest.xml:33` `scheme="com.wanghoufan.placejournal"`；`app.config.ts:9` `scheme` 同值；`app.config.ts` mtime **2026-09-18 13:46**。
- **`mobile/package.json`／`eas.json`／`tsconfig.json`** 在 `git status` 中零条目（`package.json` mtime 2026-09-20 12:12，均早于窗口）。
- **根 Web 零改动**：`src/`／`api/`／`public/`／`index.html`／根 `package.json`／`vite.config.ts` 在 `git status` 中零条目。

## A-4 复验结论

- **结论：PASS** —— typecheck exit 0；**37 套 313 例全绿**（零失败零跳过）；**313 = 306 + 7 纯增量**（唯一来源 `form.test.ts`，零删测、无删文件、无 skip）；**越界零改动**（android／包名／scheme／package.json／eas.json／根 Web 全零条目）。P0=0、blocking P1=0。
- 上轮三条非阻塞观察项（O-1 文档口径数字／O-2 `takeDraft` 命名／O-3 `createTagNamed` 未过滤 `demo=0`）**状态不变，仍全部 Open（P3，不阻断）**；O-1 所指 reviewer 报告数字本次未复改（reviewer 产出不属 QA 可写范围）。

## BUGS（复验节增量）

| Bug ID | Priority | Stage P0 Blocking? | Repro | Status | Current Task | 备注（截图/日志一句） |
|---|---|---:|---|---|---|---|
| —（新增） | — | No | — | — | TASK-DEV-16A（补跑） | 本轮门禁**未发现新增阻塞缺陷**；`313/313` 全绿、`typecheck` exit 0 |
| QA-DEV16A-01 | P3 | No | `CODE_REVIEW_DEV-16A.md` 内「306=302+4」与实测增量 +23 不符 | Open（文档口径） | TASK-DEV-16A | 沿用上轮，未变 |
| QA-DEV16A-02 | P3 | No | `createTagNamed` 同名查询未过滤 `demo=0` | Open（边界待确认） | TASK-DEV-16A | 沿用上轮，未变 |
| QA-DEV16A-03 | P3 | No | `takeDraft` 命名 misleading（实为 peek） | Open（承接 reviewer P2） | TASK-DEV-16A | 沿用上轮，未变 |

## 真机QA会话能力预检结果（复验节）

- 与上方正文一致：本任务未派真机段，**预检未执行**，全部如实记 `NOT_VERIFIED`；最终结论 **NOT_VERIFIED**、是否允许进入正式QA：**NO**（真机段另派）。真机段待验清单沿用上方 5 条，不重复。

## Fix Attempt Fingerprint（复验节）

- Task ID: TASK-DEV-16A（补跑／返工后重跑）
- Root Cause Hypothesis: 非缺陷修复任务；返工新增 `aiNextGate` 门槛（把「不可进」原因写进按钮文案，修掉「点了没反应」），本节点只做回归复验，无 bug 修复。
- Approach: 只读业务代码＋亲手执行门禁命令（typecheck／test／git status／git diff），核对 313 纯增量与越界零改动。
- Files Changed: 无（QA 只写本文件，未改业务代码，未 commit/push）。
- Verification: `npm --prefix mobile run typecheck` exit 0；`npm --prefix mobile test` exit 0（**37 suites／313 tests 全绿**）；`git status --porcelain` 20 行、`git diff --stat` 11 files／748+/98-，android／包名/scheme／根 Web 零改动。
- Failure Reason: 无（P0=0／blocking P1=0）。
- Difference From Previous Attempt: 上轮 306 口径（36 套）→ 本轮 313 口径（37 套）；新增 7 例全部来自 `form.test.ts`，属纯增量，上轮证据与结论保持成立，旧数字不回改、由本节覆盖。

> Attempt ID / Dispatch ID / Model-Backend 系字段 2.0 已废弃，不填（模型轨迹记账本）。
