
# CODE REVIEW

- Task: TASK-DEV-补线（同步入口接线：syncEntry.ts＋syncEntry.test.ts＋mine.tsx 接线 createNativeSyncEngines）
- Commit: 未 commit（工作树在途；HEAD 以 `git log` 为准，本评审基于工作树实测）
- Reviewer: code-reviewer（本窗口）
- Result: 过（P0=0，blocking P1=0；P2×2 backlog；可转 QA 真机/回归）

> Dispatch / Evidence ID 系字段 2.0 已废弃，不填。

## P0 / P1 Findings

- P0 范围（过）：补线交付＝`mobile/src/features/syncEntry.ts`（新建，untracked）＋`mobile/src/features/__tests__/syncEntry.test.ts`（新建，untracked）＋`mobile/app/(tabs)/mine.tsx`（改，`runSyncEntry`＋`createNativeSyncEngines` 接线）。`git diff HEAD --stat -- mobile/android src/api package.json mobile/package.json` 为空——未碰 `mobile/android/`、包名/scheme、根 `src/api`、`package.json`。工作树另有 `api/ai-organize.ts`、`src/*`、`mobile/app/auth/callback.tsx`、`mobile/src/supabase/auth.ts` 改动，均属 DEV-14/PWA-01 既有交付（callback.tsx 仅把 mismatch 文案收敛到 `describeCallbackOwnerMismatch()`，与本补线口径一致），不记本补线越界。
- P0 文案口径（过）：阻断文案无第二套说法——`syncEntry.ts:56-60` `blockedResult()` 直接复用 `account.ts` 的 `describeUnboundHint()` / `describeOwnerMismatch()`；用户可见串中无「已开始同步」（仅注释行提及禁令）、无「导出」/「切号」（单测 `syncEntry.test.ts:195-198` 显式断言 `not.toContain`）。`mine.tsx:86` blocked 时不重复贴同步行，依赖账号卡就地同一句，不产生双口径。
- P0 signOut 不删业务数据（过）：`auth.ts:317-319` `signOut()` 仅 `deps.auth.signOut({ scope: 'local' })`，无业务表 DELETE；`syncEntry.ts:72-74` signed_out（含 `null` 未知态）直接 `skipped`，不建引擎（`factory.calls()==0`）、不动数据；单测 `syncEntry.test.ts:129-148` 播种 1 地点＋outbox pending，退出态后条数/outbox/boundOwner 全保留。`mine.tsx:136-149` 退出仅清 auth 态＋提示「已退出登录（本地数据保留）。」。
- P0 门禁同源（过）：UI 门禁 `syncEntry.ts:79` 用 `ownerGateForSync(boundOwner, currentUserId)`（每次现读 `getBoundOwner(db)`，不信任传入的 `binding` 旧值）；`push.ts:181` / `pull.ts:188` 用同一函数的异常形 `assertOwnerForSync`；运行期并发换号由 `catch (OwnerBindingBlockedError)` 收敛回同一 `blockedResult`（`syncEntry.ts:107-109`，单测 `:281-303` 零发送验证）。「说同步了但没同步」不可能：ok 仅在 push+pull 真跑完后返回。
- P1 并发锁（过）：`syncEntry.ts:82-84` `acquireSyncLock` 抢占失败→`in_flight` 跳过；`finally` 必 `releaseSyncLock`（错误/阻断路径单测均断言 `isSyncLocked==false`）；`mine.tsx` 另有 `syncBusyRef` 防 focus 重入，与 DB 锁双层防护。并发单测 `Promise.all` 双跑：一次 ok、一次 `in_flight`，`transport.calls==1`、`source.calls==1`。
- P1 测试可信度（过，复跑验证）：reviewer 实跑 `mobile/` 全套 jest——**33 suites / 272 tests 全绿**；其中 `syncEntry.test.ts` 12/12 全绿；`tsc --noEmit` 零报错。12 例覆盖：未配置/未登录(含 null)/退出态数据保留、unbound/mismatch 阻断（零触网、outbox pending 不动、last_sync 不落盘）、match 真跑 push→pull 顺序＋落盘、push 失败时 pull 出于 outbox 守卫跳过、并发 in_flight、门禁通过后换号、引擎构建失败记 error、describe 透传/失败停放如实列出。无快照、无网络依赖（内存 SQLite＋mock transport/source）。

## P2 / P3 Backlog Findings

- P2：`createNativeSyncEngines()` 抛 `OWNER_NOT_BOUND` 的路径在线上不可达（入口门禁先拦，factory 仅 match 后调用），属防御性代码；`SUPABASE_ENV_MISSING` 则收敛为 `error` 结果＋`last_sync_result.error`。行为正确，仅建议后续在注释标一句「OWNER_NOT_BOUND 不可达」以免后人误判。不阻拦。
- P2：`describeSyncEntry()` 的 ok 文案不带 owner 前缀、error 路径 `last_sync_result` 只记 error 不记 done/failed 明细；与现有 `getSyncSummary` 展示约定一致，不影响 DoD。记 backlog，可不改。

---
目标/剩 P0/下一步：补线复核通过（P0=0）/无剩余阻断/转 QA（回归 272＋真机：绑定→同步 ok、mismatch 阻断、退出数据保留）。
