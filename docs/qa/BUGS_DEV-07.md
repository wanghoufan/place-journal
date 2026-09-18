# BUGS

- Task: TASK-DEV-07 Sync pull＋冲突裁决本地段（mock 远端／真拉取留后；基线 PRODUCT_PLAN_V1.5）
- QA 通道/Runtime: opencode 本窗口直驱（用户指定模型，经 opencode 通道执行；亲手执行命令）
- Node/npm: 系统默认 node `v24.19.0`／npm `11.17.0`
- 时间: 2026-09-18
- 范围: ① `npm --prefix mobile run typecheck`；② `npm --prefix mobile test`（确认 suites/tests 数）；③ `npm --prefix mobile run lint`；④ 根 `npm run build` 回归；⑤ 根 `git status --porcelain`（确认无根业务改动）；⑥ `rg` 抽查 Secret/真网调用。
- 命令口径: 每条 bash 只做一件事，禁 `cd`、禁 `&&`/`;` 串联、留在项目根，统一 `npm --prefix mobile …`。
- **Verdict: PASS — 0 blocking bug（P0=0／P1=0）＋0 P2。**

## 执行证据（独立执行，命令＋exit 码＋关键行）

| # | 命令（工作目录＝项目根） | Exit | 关键输出 |
|---|---|---:|---|
| 1 | `npm --prefix mobile run typecheck` | 0 | `tsc --noEmit`，无任何输出（0 错） |
| 2 | `npm --prefix mobile test` | 0 | `Test Suites: 21 passed, 21 total`；`Tests: 135 passed, 135 total`；`Snapshots: 0 total`；`Time: 1.691 s` |
| 3 | `npm --prefix mobile run lint` | 0 | `expo lint`，无任何告警/错误输出 |
| 4 | `npm run build`（根） | 0 | `tsc -b && vite build`；`✓ 108 modules transformed`；`✓ built in 1.02s`；`dist/assets/index-HhPKoyXx.js 514.62 kB`；PWA `precache 13 entries (544.99 KiB)`；仅有既存 chunk>500kB 与 dynamic/static import 复用警告，无新错误 |
| 5 | `git status --porcelain`（根） | 0 | 跟踪改动仅治理件 `M AGENTS.md`／`M docs/handoff/HANDOFF.md`／类型变更 `T USER_MODEL_OVERRIDE.md`；untracked 为治理迁移件＋`docs/review/CODE_REVIEW_DEV-07.md`＋整包 `mobile/`；`src/`、`api/`、`public/`、`index.html`、`vite.config.ts`、`tsconfig.json`、`server.mjs`、`compose.yaml`、`Dockerfile` 均未出现在输出=零根业务改动（根 build 产物 `dist/` 被忽略，未污染状态） |
| 6a | `rg -i "fetch\(\|axios\|XMLHttpRequest\|WebSocket\|https?://[a-z0-9.-]+\.supabase\." mobile/src/sync` | 1（无命中） | DEV-07 sync 段（`pull/conflicts/merge`＋测试）无任何网络原语调用、无真实 Supabase 端点；mock 远端经 `PullSource.fetchAll` 注入 |
| 6b | `rg -i "service_role\|SUPABASE_SERVICE\|sk-[A-Za-z0-9]\|eyJ[A-Za-z0-9_-]{10,}\|BEGIN (RSA\|PRIVATE) " mobile` | 0 | 仅禁令注释（`src/supabase/native.ts:13`、`docs/AUTH_REDIRECT.md:35`“只允许 publishable，禁 service_role”）＋DEV-07 文件头注释；无真实密钥值、无 JWT 形态凭据（`package-lock.json` 的 `sha512-…` 为依赖 integrity 哈希） |
| 7 | 读 `mobile/src/sync/pull.ts`／`conflicts.ts`／`merge.ts`＋`__tests__/pull.test.ts`／`__tests__/conflicts.test.ts` 关键路径 | — | 逐项静态复核见下节 |

## 独立复核（对 CODE_REVIEW_DEV-07 结论，亲手读码＋跑测互验）

- owner 前置门禁：`pull.ts:189` 在 fetch 前调 `assertOwnerForSync`；mismatch 抛 `OwnerBindingBlockedError`、`source.calls=0`、不落盘（`pull.test.ts:63-73`）。
- outbox 非空守卫：`pull.ts:192` 以 `outbox.pendingCount()>0` 跳过；parked 不计 pending（`outbox.ts`），故不永久阻塞 pull；`pull.test.ts:75-86` 验 pending 跳过、`pull.test.ts:183-195` 验 parked 仍可 pull。
- revision 合并：本地缺失采纳远端、clean 且远端更新推进 base、clean 未前进不动、dirty 未越 base 受保护、dirty 越 base 落冲突，五分支均在 `pull.ts:215-259`，与 `pull.test.ts:104-179` 一一对应。
- 分叉去重：`pull.ts:237` `findOpenConflict` 命中则不重复登记，`pull.test.ts:175-178` 二轮 pull 冲突数 0、表内仍 1 行。
- 删除防复活：`hasDeleteMarker`（`pull.ts:160-179`）覆盖 `delete_place`/`delete_entry`/`delete_tags`（含 parked），命中即 `noRevival` 不落盘；pull 从不删本地行（`pull.test.ts:182-228`）。
- 超时不落盘：整轮 `withTimeout`（`pull.ts:128-151`）抛 `PullTimeoutError` 转 skip，事务前返回；`pull.test.ts:88-100` 以小超时验 `timedOut=true`、表 0 行。
- 单事务合并：`pull.ts:207` `withTransactionSync` 全成或全败，无半拉状态。
- 冲突裁决：`resolveConflict`（`conflicts.ts:115-166`）单事务内改本地＋冲突状态，不触网；`take_remote` 远端快照覆盖并置 synced（`conflicts.test.ts:58-75`）、`keep_local` 本地保留＋base 对齐远端＋revision 前进标 local（`conflicts.test.ts:77-93`）、重复裁决拒绝（:95-110）、快照缺失拒绝（:112-128）；取 `take_remote` 且本地行被删除时按 `keep_local` 语义交由 push，符合 review 口径。
- 白名单列：`remoteRowToLocalRow`（`merge.ts:58-73`）只取 `TABLE_COLUMNS[table]` 允许列并补 `revision/base_revision/sync_status`；`upsertLocalRow`（:76-86）经 `assertKnownColumns` 防列名注入。
- mock/真接线边界：`pull.ts:269-302` `createMockPullSource` 不触网无凭据；真 PostgREST `select *` 接线留后续 Task，红线（无 Secret 入码、未碰根业务 `src/`）经 #5–#6 复核成立。

## 用例分布核对（与 #2 运行结果互验）

- 21 suites 全 PASS；DEV-07 新增 2 套：`src/sync/__tests__/pull.test.ts`（9 用例）、`src/sync/__tests__/conflicts.test.ts`（5 用例）；其余为 db/*5、media/*4、supabase/*6、sync/*4、根 `__tests__/*2`。
- 较 DEV-06（19 suites／118 tests）增 2 suites／17 tests，与 DEV-07 交付面（pull 引擎＋冲突裁决＋共享 merge 助手）一致。
- 合计 135 tests 全过，与 `Tests: 135 passed, 135 total` 一致。

## Bug 表

| Bug ID | Priority | Stage P0 Blocking? | Repro | Status | Current Task | 备注（截图/日志一句） |
|---|---|---:|---|---|---|---|
| （无） | — | — | — | — | TASK-DEV-07 | 本轮无 P0/P1/P2 bug |

## QA 观察（非阻塞，留 builder/TM 收尾）

- O-1｜CODE_REVIEW_DEV-07 的非阻塞项维持 backlog、未扩大，QA 独立读码确认存在：P2-1（open 冲突去重命中后新远端快照不刷新，`pull.ts:237-248`）、P2-2（`DELETE_OP_BY_KIND` 无 `dimension` 映射，维度删除无兜底，`pull.ts:153-157`）、P2-3（`ConflictEntityKind` 含 `media/share` 但 `tableForConflictKind` 不支持，`merge.ts:27-30`）、P2-5（keep_local 缺失分支、白名单列过滤、多表同快照等测试缺口）、P3-3（`withTimeout` 定时器未 unref，`pull.ts:131`）。建议随真接线 Task 一并处理。
- O-2｜本轮为工程静态验证（typecheck/test/lint/根 build/git/Secret），无真机/EAS 用例；mock 远端的真 PostgREST 接线与真机合并/裁决验收归后续 Task，QA 不宣称云端已通。
- O-3｜根 build 与 DEV-06 基线一致：`108 modules`／chunk 514.62 kB／precache 13 entries，无回归。

## 真机QA会话能力预检结果（本轮不适用）

> 本轮为工程静态验证，无真机/EAS 用例；按 qa 卡「Mac 预检不代 Android/iPhone 验收」，不填预检、不宣称真机能力。

- 最终结论：`NOT_VERIFIED`（真机验证留后续 Task）
- 是否允许进入正式真机QA：N/A（本轮非真机会话）

## Fix Attempt Fingerprint

- Task ID: TASK-DEV-07
- Root Cause Hypothesis: 无代码缺陷需修。typecheck/test/lint/根 build 全 0，git/Secret/真网抽查干净。
- Approach: 不修（QA 不改代码）；CODE_REVIEW_DEV-07 的 P2/P3 backlog 留后续 Task 收尾。
- Files Changed: 无业务代码改动（仅 QA 新增本报告 `docs/qa/BUGS_DEV-07.md`）。
- Verification: 见执行证据表 #1–#7 及独立复核、用例分布核对小节。
- Failure Reason: 无（P0/P1 全过）。
- Difference From Previous Attempt: 首次 QA（无前次打回）。

> Attempt ID / Dispatch ID / Model-Backend 系字段 2.0 已废弃，不填（模型轨迹记账本）。
