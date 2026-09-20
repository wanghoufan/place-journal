
# BUGS

- Task: TASK-QA-按钮对比度回归（AppButton `style` 顺序修正＋禁用态改实色、mine/record/entry/place 四页 `flex→screen/grow` 拆分、新增 `ui.test.tsx` 5 例）
- QA: qa（本窗口，只读业务代码＋亲手执行命令；只写本文件，未改业务代码，未 commit/push）
- 日期：2026-09-20
- 分支／基线：分支 `wanghoufan/master`；工作树未提交（`git log` HEAD=`e996cc6`）；审查基线＝工作树 diff
- 范围：`mobile/src/components/ui.tsx`、`mobile/app/(tabs)/mine.tsx`、`mobile/app/(tabs)/record.tsx`、`mobile/app/entry/[id].tsx`、`mobile/app/place/[id].tsx`、`mobile/src/components/__tests__/ui.test.tsx`（新建）
- **QA 结论：PASS** —— P0=0、blocking P1=0；4 项门禁命令全绿；**277 = 272（既有基线）+ 5（本次新增）逐字吻合**，无删测无跳过；`primary` 渲染底色＝`terra`、文字＝`white` 断言在案（`ui.test.tsx:56-61`）；本修复文件清单未越界到 `mobile/android/`、根 `src/`、`api/`、包名、`package.json`。非阻塞观察 2 条（O-1～O-2）。
- **未验证边界（NOT_VERIFIED，不冒认）**：真机／模拟器上的**像素级对比度与点击流**本轮未跑（无 CUA／无截图证据）；本轮结论为**静态读码＋jest 渲染断言＋门禁命令**三重证据，覆盖「生效样式数组 `backgroundColor`＝terra、文字 `color`＝white」这一确定性判定，不等价于真机肉眼观感。
- **范围边界（诚实口径）**：工作树内根 `src/`、`api/` 有改动，但**归属 PWA-01／DEV-14**（mtime 15:03，早于本修复 16:15；本修复清单不含这些路径），非本修复越界，详见「四」。
- 命令铁律：全部门禁命令单命令单动作、未出仓库根；全程 Read／Grep／Bash 只读，未改任何业务文件与测试文件；未启动服务、未占端口。

## 一、执行证据（逐条，亲手执行）

| # | 命令 | 结果 | 证据摘要 |
|---|---|---|---|
| 1 | `npm --prefix mobile run typecheck` | PASS（exit 0） | `tsc --noEmit` 零输出、零报错 |
| 2 | `npm --prefix mobile test` | PASS（exit 0） | Test Suites: **34 passed / 34**；Tests: **277 passed / 277**；Snapshots 0；Time 1.565s；无失败、无跳过；仅 `migrations.test.ts` 既有 `console.debug` 噪音（`[db] expected-columns reconcile: +N`） |
| 3 | `npm --prefix mobile run lint` | PASS（exit 0） | `expo lint`：**0 errors，3 warnings**；3 warnings 全部落在既有 `src/features/__tests__/shares.test.ts`（`import/no-duplicates` ×2、`no-unused-vars` ×1），**非本修复范围**；`ui.tsx`／四页／`ui.test.tsx` 零告警 |
| 4 | `git status --porcelain` | PASS | 见「四」；本修复路径＝`M mobile/src/components/ui.tsx`、`M mobile/app/(tabs)/mine.tsx`、`M mobile/app/(tabs)/record.tsx`、`M mobile/app/entry/[id].tsx`、`M mobile/app/place/[id].tsx`、`?? mobile/src/components/__tests__/` |

### 增量算术（纯增量证据，亲手单跑）

| # | 命令 | 结果 | 证据摘要 |
|---|---|---|---|
| 5 | `npm --prefix mobile test -- --testPathIgnorePatterns "src/components/__tests__/ui.test.tsx"` | PASS | Test Suites: **33 passed / 33**；Tests: **272 passed / 272** ⇒ 排除本次新文件后回到既有基线，无删测 |
| 6 | `npm --prefix mobile test -- src/components/__tests__/ui.test.tsx` | PASS | Test Suites: **1 passed / 1**；Tests: **5 passed / 5**（逐例见「二」）⇒ 33+1=34 suites、272+5=277 tests，**277=272+5 逐字成立** |
| 7 | `grep -n "\.only\|\.skip\|\.todo\|xit(\|xdescribe("` on `ui.test.tsx` | PASS | 无命中（0 条）⇒ 5 例是真跑，非跳过占位 |

## 二、DoD 逐条实证

| # | DoD | 结论 | 实证 |
|---|---|---|---|
| 1 | **`primary` 渲染底色恒为 `terra`、文字恒为 `white`** | PASS | `ui.tsx:56-64` 样式数组顺序＝`[button, style(调用方), variantStyles[variant], pressed, blocked?disabled]`，`variant` 排在调用方 `style` **之后**，调用方 `backgroundColor` 无法再覆盖；`theme.ts:11 terra='#C4602F'`、`:18 white='#FFFFFF'`。`ui.test.tsx:58` 断言 `backgroundColor===colors.terra`、`:59` 断言文字 `color===colors.white`。 |
| 2 | **回归断言在案（复刻旧 `flex` 带底色写法也盖不掉）** | PASS | `ui.test.tsx:63-71` 复刻旧 mine 写法 `style:{flex:1, backgroundColor:colors.paper}`，断言 `backgroundColor===terra`（`:67`）且 `flex===1` 仍在（`:68`）、文字 `white`（`:69`）。 |
| 3 | **禁用态不靠整体降透明（可读性）** | PASS | `ui.tsx:80-92` 新增 `variantDisabledStyles`（实色，`primary=terraDeep`）＋`variantDisabledTextStyles`（不透明字）；`ui.tsx:334` 原 `buttonDisabled:{opacity:0.45}` 改名 `chipDisabled`（仅 `Chip` 用）。`ui.test.tsx:73-80` 断言禁用态 `backgroundColor===terraDeep`、`opacity===undefined`、文字 `white`；`:82-87` loading 态同断言。 |
| 4 | **四页 `flex` 拆分完整（`screen` 只铺底、`grow` 只给子元素）** | PASS | `mine.tsx:367-369`、`record.tsx:376-378`、`entry/[id].tsx:278-280`、`place/[id].tsx:174-176` 均拆为 `screen:{flex:1,backgroundColor:paper}`＋`grow:{flex:1}`；`ScrollView` 用 `styles.screen`，`AppButton`／需撑满的 `View` 用 `styles.grow`（无背景）。`git diff` 核：调用点与定义逐一对上，无残留把带底色 `style` 传给 `AppButton`。 |
| 5 | **其余 variant 未被波及** | PASS | `ui.test.tsx:89-104` 断言 `secondary`（card/ink）、`danger`（danger/white）、`ghost`（transparent/terraDeep）渲染值不变；`ui.tsx:74-98` 与 HEAD 值一致。 |

## 三、Bug 清单

| Bug ID | Priority | Stage P0 Blocking? | Repro | Status | Current Task | 备注（截图/日志一句） |
|---|---|---|---|---|---|---|

（本轮 **0 条 bug**；P0=0、blocking P1=0。）

### 非阻塞观察项（O-1～O-2，均不阻断本轮）

- **O-1（P3，范围外既有告警）`mobile/src/features/__tests__/shares.test.ts` 3 条 lint warning**：`import/no-duplicates` ×2、`no-unused-vars` ×1（`lint` exit 0、0 error）。属既有测试文件、非本修复引入，建议后续小改清理，不阻断。
- **O-2（P3，口径提示）工作树根 `src/`、`api/` 有改动但在本修复范围外**：见「四」，为免误读，本修复的越界结论按「本修复清单」判定，不等价于「全工作树零改动」。此为记账口径提示，非缺陷。

## 四、范围/越界确认

| 核项 | 结果 | 证据 |
|---|---|---|
| 本修复清单是否越界到 `mobile/android/` | PASS（本修复无越界） | `git status --porcelain` 无任何 `mobile/android/` 条目；`mobile/android/` 为构建产物（`mobile/.gitignore:45 /android`，`git ls-files` 计数 0，即未跟踪）；本修复文件清单不含 android 路径。 |
| 本修复清单是否越界到根 `src/`、`api/` | PASS（本修复无越界） | 本修复仅 `mobile/` 下 `ui.tsx`＋四页＋`ui.test.tsx`，**不含**根 `src/`／`api/` 路径。工作树确有根 `src/*`、`api/ai-organize.ts` 改动，但**归属 PWA-01／DEV-14**（mtime 15:03，早于本修复 16:15），已由 `BUGS_PWA-01.md`／`BUGS_DEV-14.md` 独立覆盖。 |
| 包名／`package.json` 是否零改动 | PASS | `git diff HEAD --name-only -- mobile/package.json mobile/app.config.ts mobile/app.json package.json` = **空**；`mobile/app.config.ts:9,12` `scheme`／`android.package` 仍＝`com.wanghoufan.placejournal`（与 HEAD 一致）。 |
| `mine.tsx` 本修复相关 hunk 是否仅拆样式 | PASS | `mine.tsx` 的 diff 含 DEV-14 账号/同步改动（他任务）＋本修复的 `flex→screen/grow` 改名与 `style={styles.grow}` 替换；按钮对比度相关 hunk 仅为样式键名替换，未引入带底色 `style`。 |
| 本轮是否改动文件 | PASS（只写本文件） | 全程 Read／Grep／Bash 只读；`docs/qa/BUGS_按钮对比度.md` 为唯一写入；未 commit／push。 |

## 五、七查对照

| 查项 | 结果 | 说明 |
|---|---|---|
| unit | PASS | 277/277 全绿（34 suites）；本次新增 5/5；无 `only`/`skip`/`todo` |
| typecheck | PASS | `tsc --noEmit` exit 0 零报错 |
| lint | PASS | 0 errors；3 warnings 全在既有 `shares.test.ts`，范围外（O-1） |
| regression | PASS | **272（排除新文件）＝既有基线 272** 逐字吻合 ⇒ 无删测、无静默跳过；277−5=272 纯增量成立 |
| DoD | PASS | 五项逐条见「二」 |
| 对比度断言 | PASS | `primary` `backgroundColor===terra`＋文字 `white` 在案（`ui.test.tsx:58-59`），另有「调用方带底色盖不掉」回归断言（`:63-71`） |
| 越界 | PASS | 本修复未越界；见「四」；工作树其他改动归属他任务（O-2） |

## 真机QA会话能力预检结果

本轮为 **纯静态＋命令回归段（无真机）**，不适用真机预检（模板要求「每真机 session 正式用例前必填」）。**本节不填占位、不伪造**：无 session ID、无模型注入记录、无读屏/截图/点击证据，故真机像素与点击流结论统一记 `NOT_VERIFIED`（见开头「未验证边界」）。

> 判据：`ok=true/exit 0/工具调用成功`但无状态或像素变化一律记 `FAIL_UNVERIFIED_ACTION`；禁跨模型/跨Runtime/跨session拼PASS。

- 日期/任务名：2026-09-20 / TASK-QA-按钮对比度回归 → **N/A（无真机段）**
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
- 是否允许进入正式QA（全PASS才YES，否则NO即停）：NO（本轮为无真机静态＋命令回归段；真机像素/点击流另派）

## Fix Attempt Fingerprint

- Task ID: TASK-QA-按钮对比度回归（QA 复核）
- Root Cause Hypothesis: `AppButton` 样式数组里调用方 `style` 排在 `variantStyles[variant]` **之后**，页面把带 `backgroundColor: paper` 的整页样式顺手传给按钮 → 纸色底盖掉 `terra`，白字不可见；禁用态用 `buttonDisabled:{opacity:0.45}` 整体降透明 → 白字与底色一起变淡。
- Approach: 只读核对源码＋亲手执行 4 项门禁命令＋单跑用例级验证；用渲染断言（`react-test-renderer` 的 `toJSON`＋`StyleSheet.flatten`）固化「生效样式 backgroundColor/文字 color」；用测试增量算术（277−5=272）证明基线不回归。
- Files Changed: 无（QA 只读；验证目标点＝`ui.tsx`、四页、`ui.test.tsx`）
- Verification: `typecheck` exit 0；`test` 34 suites / 277 tests 全绿（新增 5/5；排除后 272/272）；`lint` 0 errors（3 warnings 范围外）；`git status` 归属确认；DoD 五项逐条命中（见「二」）
- Failure Reason: N/A（未发现 P0/P1）
- Difference From Previous Attempt: N/A

> Attempt ID / Dispatch ID / Model-Backend 系字段 2.0 已废弃，不填（模型轨迹记账本）。
