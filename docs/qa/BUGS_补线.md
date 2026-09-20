
# BUGS

- Task: TASK-QA-补线回归（同步入口接线：`syncEntry.ts`＋`syncEntry.test.ts`＋`mine.tsx` 接线 `createNativeSyncEngines`）
- QA: qa（本窗口，只读业务代码＋亲手执行命令；只写本文件，未改业务代码，未 commit/push）
- 日期：2026-09-20
- 分支／基线：分支 `wanghoufan/master`；工作树未提交（`git log` HEAD=`e996cc6`）；审查基线＝工作树（补线三段为 untracked/工作树改动）
- 范围：`mobile/src/features/syncEntry.ts`（新建）、`mobile/src/features/__tests__/syncEntry.test.ts`（新建）、`mobile/app/(tabs)/mine.tsx`（接线）
- **QA 结论：PASS** —— P0=0、blocking P1=0；4 项门禁命令全绿；**272 = 260（DEV-14 基线）+ 12（本补线新增）逐字吻合**，无删测无跳过；DoD 四项逐条实证；`syncEntry.ts` 阻断路径经静态＋单测双证「零触网」。非阻塞观察 3 条（O-1～O-3）。
- **未验证边界（NOT_VERIFIED，不冒认）**：真机端到端（绑定后同步 ok、第二账号 mismatch 阻断、退出后数据保留的**真机点击流**）本轮未跑真机，仅静态＋单测级验证；「零触网」是**同步路径**结论（push/pull 不发起），不含登录态读取时 supabase-js 内部可能的 token 刷新行为。
- 命令铁律：全部门禁命令单命令单动作、未出仓库根；本轮只读业务代码，未改动任何业务文件与测试文件；未启动任何服务、未占端口。

## 一、执行证据（逐条，亲手执行）

| # | 命令 | 结果 | 证据摘要 |
|---|---|---|---|
| 1 | `npm --prefix mobile run typecheck` | PASS（exit 0） | `tsc --noEmit` 零输出、零报错 |
| 2 | `npm --prefix mobile test` | PASS（exit 0） | Test Suites: **33 passed / 33**；Tests: **272 passed / 272**；Snapshots 0；Time 1.752s；无失败/无跳过；仅 `migrations.test.ts` 既有 `console.debug` 噪音（`[db] expected-columns reconcile: +N`） |
| 3 | `npm --prefix mobile run lint` | PASS（exit 0） | `expo lint`：**0 errors，3 warnings**；3 warnings **全部落在 `src/features/__tests__/shares.test.ts`**（`import/no-duplicates` ×2、`no-unused-vars` ×1），属既有文件、**非本补线范围**；`syncEntry.ts`／`syncEntry.test.ts`／`mine.tsx` 零告警 |
| 4 | `git status --porcelain` | PASS | 补线三段：`?? mobile/src/features/syncEntry.ts`、`?? mobile/src/features/__tests__/syncEntry.test.ts`、`M mobile/app/(tabs)/mine.tsx`；其余改动归属 DEV-14／PWA-01（见「四」） |

补充单跑（用例级证据）：

| # | 命令 | 结果 | 证据摘要 |
|---|---|---|---|
| 5 | `jest … src/features/__tests__/syncEntry.test.ts --verbose` | PASS | **12/12 全绿**，逐例：前置跳过 3（未配置／未登录含 null／退出态数据保留）＋门禁 2（unbound／mismatch）＋match 真跑 3（push→pull 顺序＋落盘／push 失败 pull 守卫跳过／并发 in_flight）＋运行期异常 2（门禁后换号阻断零发送／引擎构建失败记 error）＋describe 文案 2（透传／失败停放如实列出） |
| 6 | `grep -n "\.only\|\.skip\|\.todo\|xtest\|xdescribe"` 两新测试文件 | PASS | 仅命中 `syncEntry.test.ts:252` 的 `result.pull.skipped`（业务字段名，非测试跳过标记）；**无 `.only`／`.skip`／`.todo`**，与「272 全绿即真全跑」互证 |

## 二、DoD 逐条实证（全部通过）

| # | DoD | 结论 | 实证 |
|---|---|---|---|
| 1 | **unbound/mismatch 阻断零触网** | PASS | `syncEntry.ts:79` `if (!gate.allowed) return blockedResult(...)` 位于引擎工厂 `:88 createEngines()` 之前，阻断路径**不创建引擎**；单测 `:168-172`（unbound）断言 `factory.calls()==0`＋`transport.calls` 空＋`source.calls==0`＋outbox 仍 `pending`＋`getLastSyncResult(db)` 为 `undefined`；`:199-202`（mismatch）同断言，另加 `getBoundOwner` 未被改动（仍 `OTHER`，不自动迁移）。引擎工厂是 transport/source 的唯一创建口，`calls==0` ⇒ 无网络对象生成。 |
| 2 | **match 真跑 push→pull** | PASS | `syncEntry.ts:89` push 先跑、`:92` pull 后跑（固定顺序）；单测 `:207-233` 断言 `transport.calls.map(opId)==['A']`、`push.done==['A']`、`source.calls==1`、`pull.applied==1`、`places` 落 1 条、`last_sync_result` `{done:1,failed:0,parked:0}`、锁已释放；`mine.tsx:83` 接线 `createEngines: createNativeSyncEngines`，`nativeSync.ts:30-42` 为真网组装（supabase transport/source），**非 stub**。 |
| 3 | **signOut 不删业务数据** | PASS | `auth.ts:317-318` `signOut()` 仅 `deps.auth.signOut({ scope: 'local' })`，全文件无业务表 DELETE；`syncEntry.ts:72-74` `signed_out`（含 `null` 未知态）直接 `skipped`，不动数据；单测 `:129-148` 退出态下 `places` 仍 1 条、outbox `A` 仍 `pending`、`getBoundOwner==OWNER`；`mine.tsx:140-142` 退出仅清 auth 态＋提示「已退出登录（本地数据保留）。」 |
| 4 | **文案无「已开始同步」/「导出」/「切号」** | PASS | `mine.tsx` 的 diff **删除了旧本地 `describeLogin` 里的 `'登录成功，已开始同步。'`**，统一改走 `account.ts`；工作树用户可见串中：`account.ts:44` mismatch 文案＝「同步已阻断。请退出登录后用原账号重新登录。」（无「导出」/「切号」）；`syncEntry.ts:56-60` 阻断文案**直接复用** `account.ts` 的 `describeUnboundHint()`／`describeOwnerMismatch()`，无第二套说法。全仓 grep：`已开始同步`／`导出`／`切号` 命中项**均为注释或测试断言**（`account.ts:4/5/6/38/52`、`owner.ts:5`、`auth.ts:104`、各 `*.test.ts` 断言），**无用户可见串**。 |

### 门禁同源（DoD 支撑项）

- UI 门禁 `syncEntry.ts:79`＝`ownerGateForSync(getBoundOwner(db), currentUserId)`（**每次现读**绑定，不信任传入 `binding` 旧值）；push/pull 内部 `push.ts:181`／`pull.ts:189`＝`assertOwnerForSync(...)`，二者同源于 `owner.ts:27` `ownerGateForSync`。⇒「说同步了但没同步」不可能（`ok` 仅在 push+pull 真跑完后返回）。
- 运行期并发换号：`syncEntry.ts:107-109` `catch (OwnerBindingBlockedError)` 收敛回同一 `blockedResult`；单测 `:281-303` 断言 `transport.calls` 空、`source.calls==0`、outbox 仍 `pending`、锁已释放。

## 三、Bug 清单

| Bug ID | Priority | Stage P0 Blocking? | Repro | Status | Current Task | 备注（截图/日志一句） |
|---|---|---:|---|---|---|---|

（本轮 **0 条 bug**；P0=0、blocking P1=0。）

### 非阻塞观察项（O-1～O-3，均不阻断本轮）

- **O-1（P2，文案时效）`account.ts:58` 仍写「同步接线后自动进行」**：原串为 `'登录成功。本机已绑定该账号，同步接线后自动进行。'`。补线已把真网引擎接上（`mine.tsx` 接线 `createNativeSyncEngines`），「接线后」读起来像「尚未接线」，措辞已过时。**未违反 DoD 字面**（不含「已开始同步」/「导出」/「切号」），且属 DEV-14 既有文件、非本补线引入；建议后续小改把该句收敛为「已绑定，进入本页即自动同步」。归口后续，不阻断。
- **O-2（P3，review backlog 未闭环）`syncEntry.ts` ok 文案不带 owner 前缀、error 路径 `last_sync_result` 只记 `error` 不记 done/failed 明细**：与 `CODE_REVIEW_补线.md` P2 两条一致，与现有 `getSyncSummary` 展示约定相符，不影响 DoD；本轮维持 backlog。
- **O-3（P3，防御性不可达）`nativeSync.ts:34` `OWNER_NOT_BOUND`**：入口门禁先拦，factory 仅 match 后调用，该分支线上不可达；`SUPABASE_ENV_MISSING`（`:31`）则收敛为 `error` 结果＋`last_sync_result.error`（单测 `:305-322` 覆盖）。行为正确，建议后续补一句「不可达」注释，不阻断。

## 四、范围/越界确认

| 核项 | 结果 | 证据 |
|---|---|---|
| 补线三段是否越界改业务代码 | PASS（无越界） | `git status` 中补线仅 `syncEntry.ts`(新建)、`syncEntry.test.ts`(新建)、`mine.tsx`(改)；`mobile/android/`、`mobile/package.json`、根 `src/api` 无改动（`git status` 无这些路径条目） |
| `mine.tsx` 改动是否仅接线 | PASS | `git diff` 显示删除旧本地 `describeLogin`（含「已开始同步」）→ 统一走 `account.ts`；新增 `runSyncEntry`＋`createNativeSyncEngines` 接线＋`syncBusyRef` 防重入＋阻断时不重复贴行（`mine.tsx:86`）；账号卡/绑定 UI 属 DEV-14 |
| 工作树其余改动归属 | 非本轮 | `api/ai-organize.ts`、`src/*`、`mobile/app/auth/callback.tsx`、`mobile/src/supabase/auth.ts(+test)`、`mobile/src/features/account.ts(+test)` 属 DEV-14／PWA-01 既有交付，已由 `BUGS_DEV-14.md`（PASS）／`BUGS_PWA-01.md`（PASS）独立覆盖 |
| 本轮是否改动文件 | PASS（只写本文件） | 全程 Read／Grep／Bash 只读；本文件为唯一写入 |

## 五、七查对照

| 查项 | 结果 | 说明 |
|---|---|---|
| unit | PASS | 272/272 全绿（33 suites）；本补线 12/12；无 skip/only |
| typecheck | PASS | `tsc --noEmit` exit 0 零报错 |
| lint | PASS | 0 errors；3 warnings 全在既有 `shares.test.ts`，范围外 |
| regression | PASS | **272 − 12 = 260** 与 DEV-14 基线（`BUGS_DEV-14.md`：260/260）逐字吻合 ⇒ 无删测、无静默跳过，纯增量全绿；补线未动 `push.ts`／`pull.ts`／`owner.ts` 既有门禁实现 |
| DoD | PASS | 四项逐条见「二」；门禁同源见「二」支撑项 |
| 网络边界 | PASS（同步路径） | 阻断/跳过路径在 `createEngines()` 前返回，单测 `factory.calls==0` 实证；边界见开头「未验证边界」 |
| 越界 | PASS | 未改业务代码、未 commit/push；见「四」 |

## 真机QA会话能力预检结果

本轮为 **纯静态＋命令回归段（无真机）**，不适用真机预检（模板要求「每真机 session 正式用例前必填」）。**本节不填占位、不伪造**：无 session ID、无模型注入记录、无读屏/截图/点击证据，故真机端到端结论统一记 `NOT_VERIFIED`（见开头「未验证边界」）。

> 判据：`ok=true/exit 0/工具调用成功`但无状态或像素变化一律记 `FAIL_UNVERIFIED_ACTION`；禁跨模型/跨Runtime/跨session拼PASS。

- 日期/任务名：2026-09-20 / TASK-QA-补线回归 → **N/A（无真机段）**
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
- 是否允许进入正式QA（全PASS才YES，否则NO即停）：NO（本轮为无真机静态＋命令回归段；真机端到端另派：绑定→同步 ok、mismatch 阻断、退出数据保留）

## Fix Attempt Fingerprint

- Task ID: TASK-QA-补线回归（QA 复核）
- Root Cause Hypothesis: DEV-14 遗留边界——`createNativeSyncEngines()` 全仓零调用，push/pull 真机不可达，owner 阻断端到端不可见；本补线以 `syncEntry.ts` 纯逻辑门禁＋`mine.tsx` 接线闭合该边界
- Approach: 只读核对源码＋亲手执行 4 项门禁命令＋单跑用例级验证；对 DoD 四条逐条定位到行号与对应用例断言，用测试增量算术（272−12=260）证明基线不回归
- Files Changed: 无（QA 只读；验证目标点＝`syncEntry.ts`、`syncEntry.test.ts`、`mine.tsx`）
- Verification: `typecheck` exit 0；`test` 33 suites / 272 tests 全绿（补线 12/12）；`lint` 0 errors（3 warnings 范围外）；`git status` 三段归属确认；DoD 四条逐条命中（见「二」）
- Failure Reason: N/A（未发现 P0/P1）
- Difference From Previous Attempt: N/A

> Attempt ID / Dispatch ID / Model-Backend 系字段 2.0 已废弃，不填（模型轨迹记账本）。
