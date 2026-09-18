# BUGS

- Task: TASK-DEV-06 Sync push 本地段（DAG 依赖/outbox 认领/重试停放/超时，mock transport，真网留后；基线 PRODUCT_PLAN_V1.5）
- QA 通道/Runtime: opencode 本窗口直驱（用户指定模型，经 opencode 通道执行；亲手执行命令）
- Node/npm: 系统默认 node `v24.19.0`／npm `11.17.0`
- 时间: 2026-09-18 15:05
- 范围: ① `npm --prefix mobile run typecheck`；② `npm --prefix mobile test`（确认 suites/tests 数）；③ `npm --prefix mobile run lint`；④ 根 `npm run build` 回归；⑤ 根 `git status --porcelain`（确认无根业务改动）；⑥ `rg` 抽查 Secret/真网调用。
- 命令口径: 每条 bash 只做一件事，禁 `cd`、禁 `&&`/`;` 串联、留在项目根，统一 `npm --prefix mobile …`。
- **Verdict: PASS — 0 blocking bug（P0=0／P1=0）＋0 P2。**

## 执行证据（独立执行，命令＋exit 码＋关键行）

| # | 命令（工作目录＝项目根） | Exit | 关键输出 |
|---|---|---:|---|
| 1 | `npm --prefix mobile run typecheck` | 0 | `tsc --noEmit`，无任何输出（0 错） |
| 2 | `npm --prefix mobile test` | 0 | `Test Suites: 19 passed, 19 total`；`Tests: 118 passed, 118 total`；`Snapshots: 0 total`；`Time: 1.877 s` |
| 3 | `npm --prefix mobile run lint` | 0 | `expo lint`，无任何告警/错误输出 |
| 4 | `npm run build`（根） | 0 | `tsc -b && vite build`；`✓ 108 modules transformed`；`✓ built in 1.45s`；`dist/assets/index-HhPKoyXx.js 514.62 kB`；PWA `precache 13 entries (544.99 KiB)`；仅有既存 chunk>500kB 与 dynamic/static import 复用警告，无新错误 |
| 5 | `git status --porcelain`（根） | 0 | 跟踪改动仅治理件 `M AGENTS.md`／`M docs/handoff/HANDOFF.md`／类型变更 `T USER_MODEL_OVERRIDE.md`；untracked 为治理迁移件与整包 `mobile/`；`src/`、`api/`、`public/`、`index.html`、`vite.config.ts`、`tsconfig.json`、`server.mjs`、`compose.yaml`、`Dockerfile` 均未出现在输出=零根业务改动（根 build 产物 `dist/` 被忽略，未污染状态） |
| 6 | `rg -n --hidden -g '!node_modules' -g '!*.lock' -i "fetch\(|axios|XMLHttpRequest|WebSocket|https?://[a-z0-9.-]+\.supabase\." mobile` | 1（无命中） | 全 mobile（含 src/app/测试）无任何网络原语调用、无真实 Supabase 端点；DEV-06 dispatcher 只依赖 `PushTransport.send`，`transport.ts` 仅 mock |
| 7 | `rg … "service_role\|SUPABASE_SERVICE\|sk-[A-Za-z0-9]\|eyJ[A-Za-z0-9_-]{10,}\|BEGIN (RSA\|PRIVATE) " mobile` | 0 | 仅 2 条禁令注释：`mobile/src/supabase/native.ts:13`、`mobile/docs/AUTH_REDIRECT.md:35`（“只允许 publishable，禁 service_role”），无真实密钥值、无 JWT 形态凭据 |
| 8 | `rg … "createClient\|rest/v1\|storage/v1\|\.rpc\(" mobile/src` | 0 | 仅 `mobile/src/supabase/native.ts:17,51` 的 auth 客户端（DEV-05 既有），sync 段（`push/outbox/meta`）零命中 |
| 9 | `rg … "EXPO_PUBLIC_[A-Z_]+\s*=\s*\S+" mobile` ＋读 `mobile/.env.example` | 0 | URL/KEY 两键留空；唯一有值项 `EXPO_PUBLIC_WEB_BASE_URL=https://place-journal-xi.vercel.app` 为公开部署地址（非 Secret） |
| 10 | 读 `mobile/src/sync/push.ts`／`transport.ts`／`__tests__/push.test.ts` 关键路径 | — | 逐项静态复核见下节 |

## 独立复核（对 CODE_REVIEW_DEV-06 结论，亲手读码＋跑测互验）

- DAG：`push.ts:204-212` 发送前整批校验缺父（`missing_parent`）与成环（`topoSort`→`cycle`），两者均抛 `PushDagError` 且 `transport.calls` 为 0；`push.test.ts:96-120` 两用例互验。父成功（`ok`）才 `completed.add`，子 `depIds.some(!completed)` 时 `release` 归队、`attempts` 不动（`push.ts:226-231`、`push.test.ts:63-78`）。
- 认领顺序：`push.ts:186-187` 固定 `releaseStaleClaims`→`claim`；`push.test.ts:37-61` 以包装 outbox 显式断言 `['release','claim']`，并验陈旧锁恢复后本轮认领（`push.test.ts:193-204`）。
- attempts/停放：失败走 `outbox.fail`，`push.ts:245-247` 判 `status==='parked'`；`push.test.ts:138-154` 跑满 `MAX_ATTEMPTS`（5）后停放且后续不再认领/发送。阻塞路径用 `release` 不计失败（`push.ts:228`）。
- 超时：`DEFAULT_PUSH_CONFIG` 单 op 30s＋整轮 90s（`push.ts:20-27`），`config: Partial<PushConfig>` 可覆盖；单 op 超时经 `withTimeout` 转 `retry` 回 pending（`push.ts:233-238`、`push.test.ts:156-171`）；整轮超时归还未处理 claimed 并置 `timedOut`（`push.ts:217-224`、`push.test.ts:173-191`）。
- owner 阻断：`assertOwnerForSync` 置于认领/发送之前（`push.ts:181`），mismatch 抛错、`transport.calls=0`、行仍 `pending/attempts=0`（`push.test.ts:21-34`）。
- 幂等：`PushOpPayload.opId=outbox.op_id`，成功后 `complete` 删除，重复运行不重发（`push.ts:11,240-243`、`push.test.ts:207-221`）。
- mock/真接线边界：`transport.ts:1-8,58-62` 明确 mock 本地段、不触网无凭据，真 Supabase 接线留后续 Task；红线（无 Secret 入码/日志、未碰根业务 `src/`）经 #5–#9 复核成立。

## 用例分布核对（与 #2 运行结果互验）

- 19 suites 全 PASS；DEV-06 新增 2 套：`src/sync/__tests__/push.test.ts`（11 用例）、`src/sync/__tests__/transport.test.ts`；其余为 db/*4、media/*4、supabase/*6、sync/*2、根 `__tests__/*2`。较 DEV-05（17 suites／104 tests）增 2 suites／14 tests，与 DEV-06 交付面一致。
- 合计 118 tests 全过，与 `Tests: 118 passed, 118 total` 一致。

## Bug 表

| Bug ID | Priority | Stage P0 Blocking? | Repro | Status | Current Task | 备注（截图/日志一句） |
|---|---|---:|---|---|---|---|
| （无） | — | — | — | — | TASK-DEV-06 | 本轮无 P0/P1/P2 bug |

## QA 观察（非阻塞，留 builder/TM 收尾）

- O-1｜CODE_REVIEW_DEV-06 的非阻塞项维持 backlog、未扩大：P2-1（`payloadFromRow` 内 `JSON.parse(row.entity_ids)` 无 try-catch，`push.ts:108`）、P2-2（`withTimeout` 为 `Promise.race` 不取消底层请求，`push.ts:120-132`）、P3-1（整轮超时用注入 `now` 而 `releaseStaleClaims()` 用墙钟，`push.ts:176,186`）。建议随真接线 Task 一并处理。
- O-2｜本轮为工程静态验证（typecheck/test/lint/根 build/git/Secret），无真机/EAS 用例；mock transport 的真网接线与真机验收归后续 Task，QA 不宣称云端已通。
- O-3｜根 build 与基线（HANDOFF §基线 2026-09-18 及 BUGS_DEV-05 #4/#O-3）一致：`108 modules`／chunk 514.62 kB／precache 13 entries，无回归。

## 真机QA会话能力预检结果（本轮不适用）

> 本轮为工程静态验证，无真机/EAS 用例；按 qa 卡「Mac 预检不代 Android/iPhone 验收」，不填预检、不宣称真机能力。

- 最终结论：`NOT_VERIFIED`（真机验证留后续 Task）
- 是否允许进入正式真机QA：N/A（本轮非真机会话）

## Fix Attempt Fingerprint

- Task ID: TASK-DEV-06
- Root Cause Hypothesis: 无代码缺陷需修。typecheck/test/lint/根 build 全 0，git/Secret/真网抽查干净。
- Approach: 不修（QA 不改代码）；CODE_REVIEW_DEV-06 的 P2/P3 backlog 留后续 Task 收尾。
- Files Changed: 无业务代码改动（仅 QA 新增本报告 `docs/qa/BUGS_DEV-06.md`）。
- Verification: 见执行证据表 #1–#10 及独立复核、用例分布核对小节。
- Failure Reason: 无（P0/P1 全过）。
- Difference From Previous Attempt: 首次 QA（无前次打回）。

> Attempt ID / Dispatch ID / Model-Backend 系字段 2.0 已废弃，不填（模型轨迹记账本）。
