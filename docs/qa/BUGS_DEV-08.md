# BUGS

- Task: TASK-DEV-08 真网接线（gateway/supabaseGateway/supabaseTransport/supabasePull/base64/nativeSync/fakeSyncGateway＋测试；基线 PRODUCT_PLAN_V1.5）
- QA 通道/Runtime: opencode 本窗口直驱（用户指定模型，经 opencode 通道执行；亲手执行命令）
- Node/npm: 系统默认 node `v24.19.0`／npm `11.17.0`
- 时间: 2026-09-18
- 范围: ① `npm --prefix mobile run typecheck`；② `npm --prefix mobile test`（确认 suites/tests 数，记录偶发失败重跑）；③ `npm --prefix mobile run lint`；④ 根 `npm run build` 回归；⑤ 根 `git status --porcelain`（确认无根业务改动）；⑥ `rg` 抽查真凭据/真网调用（测试 fake 除外）；另核「无 key 不触网」断言与 CODE_REVIEW_DEV-08 结论。
- 命令口径: 每条 bash 只做一件事，禁 `cd`、禁 `&&`/`;` 串联、留在项目根，统一 `npm --prefix mobile …`。
- **Verdict: PASS — 0 blocking bug（P0=0／P1=0）＋0 P2。**

## 执行证据（独立执行，命令＋exit 码＋关键行）

| # | 命令（工作目录＝项目根） | Exit | 关键输出 |
|---|---|---:|---|
| 1 | `npm --prefix mobile run typecheck` | 0 | `tsc --noEmit`，无任何输出（0 错） |
| 2 | `npm --prefix mobile test` | 0 | `Test Suites: 24 passed, 24 total`；`Tests: 154 passed, 154 total`；`Snapshots: 0 total`；`Time: 1.306 s`；首轮全绿，无偶发失败、无需重跑 |
| 3 | `npm --prefix mobile run lint` | 0 | `expo lint`，无任何告警/错误输出 |
| 4 | `npm run build`（根） | 0 | `tsc -b && vite build`；`✓ 108 modules transformed`；`✓ built in 948ms`；`dist/assets/index-HhPKoyXx.js 514.62 kB`；PWA `precache 13 entries (544.99 KiB)`；仅既存 chunk>500kB 与 dynamic/static import 复用警告，无新错误 |
| 5 | `git status --porcelain`（根） | 0 | 跟踪改动仅治理件 `M AGENTS.md`／`M docs/handoff/HANDOFF.md`／类型变更 `T USER_MODEL_OVERRIDE.md`；untracked 为治理迁移件＋`docs/review/CODE_REVIEW_DEV-08.md`＋整包 `mobile/`；`src/`、`api/`、`public/`、`index.html`、`vite.config.ts`、`tsconfig.json`、`server.mjs`、`compose.yaml`、`Dockerfile` 均未出现=零根业务改动（根 build 产物 `dist/` 被忽略，未污染状态） |
| 6a | `rg -n "eyJ[A-Za-z0-9_-]{20,}\|sk-[A-Za-z0-9]{20,}\|service_role\|supabase\.co" mobile`（排除 node_modules/.expo/package-lock） | 0 | 仅 2 条禁令注释：`mobile/src/supabase/native.ts:13`、`mobile/docs/AUTH_REDIRECT.md:35`（“只允许 publishable，禁 service_role”）；无真实密钥值、无 JWT 形态凭据、无真实 `.supabase.co` 端点 |
| 6b | `rg -n "fetch\(\|XMLHttpRequest\|https?://" mobile/src --glob '!**/__tests__/**' --glob '!**/*.test.*'` | 0 | 非测试源码零网络原语、零真实端点；唯一命中 `mobile/src/test/fakeSyncGateway.ts:169` 的 `https://fake.local`（测试 fake，属豁免） |
| 7 | `ls -a mobile`＋`git status --porcelain --ignored mobile/.env mobile/.env.local` | — / 0 | 无 `.env`／`.env.local` 实体文件（仅 `.env.example`），故运行时 `EXPO_PUBLIC_*` 为空 |
| 8 | 读 `mobile/src/supabase/native.ts`／`sync/nativeSync.ts`／`sync/supabaseGateway.ts`／`sync/supabasePull.ts`／`sync/supabaseTransport.ts`／`sync/base64.ts`／`domain/mapping.ts` 关键路径 | — | 逐项静态复核见下节 |

## 真云联调断言（无 key，独立复核）

- 凭据源：`mobile/src/supabase/native.ts:37-43` 的 `SUPABASE_URL`/`SUPABASE_KEY` 只取 `process.env.EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`，缺省为空串；`isSupabaseConfigured()` 两者非空才 true。
- 无 key 不触网：`sync/nativeSync.ts:31-34` 在创建客户端前先 `if (!isSupabaseConfigured()) throw new Error('SUPABASE_ENV_MISSING')`；`supabase/native.ts:50` 的 `getSupabaseAuthClient` 同样先抛错再 `createClient`，故无 key 路径不构造 client、不发起任何请求。
- 实证无 `.env` 文件（#7），环境无 key → 本机无法真云联调；`npm --prefix mobile test` 全绿且 1.3s 内完成，测试只用 `src/test/fakeSyncGateway.ts`（录制型 fake，无凭据无网络），未发生真网调用。
- 结论：无 key 断言成立；真云联调按设计待用户填 key，本轮不作云端已通的宣称。

## 独立复核（对 CODE_REVIEW_DEV-08 结论，亲手读码＋跑测互验）

- expected-revision 条件＋0 行判冲突：`supabaseTransport.ts:196-244` 首推 `gateway.insert`，`23505` 唯一冲突时 `fetchRemoteRow` 取远端 revision 作 expected 重放；否则 `updateIfRevision(id, expected)`，`rows.length===0` → `addConflictRecord`＋`markLocalConflict` 且本 op 返回 ok（不重试）。网关条件为 `eq('id').eq('revision')`（`supabaseGateway.ts:61-67`），无普通 upsert 覆盖核心实体。与 review 一致。
- onConflict 键与 Web 一致：`entry_tags` → `'entry_id,tag_id'`（`supabaseTransport.ts:266`）；`media` → `'owner_user_id,client_id'`（:367）；`share_snapshots` → `'owner_user_id,client_id'`（:463）；`share_items` → `'snapshot_id,client_id'`（:480）。PASS。
- ArrayBuffer 上传＋失败语义：`base64.ts:22-48` 纯函数解码（`globalThis.atob` 优先＋手写回退，无原生依赖 Hermes 可用）；`supabaseTransport.ts:333-339` 经 `MediaFileReader` 读 base64 → `base64ToArrayBuffer` 传 body；`uploadMedia`（:342-388）display/thumb 双路径，失败删本轮已传对象（`removeObjects`，:371-376）、保留本地文件、不标 synced，成功才 upsert media 行并回填 remote_path/thumb_path。PASS。
- 白名单无泄漏：`shareItemCloudRow`（`supabaseTransport.ts:405-429`）经 `shareItemToPayload` 仅出 7 字段（`mapping.ts:221-232`：name/area/rating/budget/note_public/tags/coord_precision），lat/lng/transcript/私密感受不进 payload；coord_precision 非 hidden 一律 approx。PASS。
- 删除 id+owner：`deleteTags`（:319-331）与 `deleteOwnedRow`（:489-493）均带 `owner_user_id`；行不存在=目的达成（网关 0 行不报错）。PASS。
- 分页：`supabasePull.ts:22-41` 按 `id` 升序 `range(offset, offset+limit-1)`，不足一页即停；`DEFAULT_PULL_PAGE_SIZE=1000`；错误 `throw`。PASS。
- 未碰根业务/治理：改动仅 `mobile/` 新增（#5），根业务文件零改动。PASS。
- P1-1/P1-2 与 P2-1 复核确认存在（非阻塞，见 QA 观察 O-1）。

## 用例分布核对（与 #2 运行结果互验）

- 24 suites 全 PASS；较 DEV-07（21 suites／135 tests）增 3 suites／19 tests：`src/sync/__tests__/supabaseTransport.test.ts`、`src/sync/__tests__/supabasePull.test.ts`、`src/sync/__tests__/base64.test.ts`，与 DEV-08 交付面（真网 gateway/transport/pull/base64）一致。
- 合计 154 tests 全过，与 `Tests: 154 passed, 154 total` 一致；首轮无偶发失败，未见 flaky，无需重跑。

## Bug 表

| Bug ID | Priority | Stage P0 Blocking? | Repro | Status | Current Task | 备注（截图/日志一句） |
|---|---|---:|---|---|---|---|
| （无） | — | — | — | — | TASK-DEV-08 | 本轮无 P0/P1/P2 bug |

## QA 观察（非阻塞，留 builder/TM 收尾）

- O-1｜CODE_REVIEW_DEV-08 的非阻塞项维持 backlog、未扩大，QA 独立读码确认存在：P1-1（条件 UPDATE `supabaseGateway.ts:61-67` 未附 `owner_user_id` 过滤，依赖 RLS 做归属隔离，跨 owner id 碰撞会 0 行→误判冲突而非直接拒绝，建议后续加 owner eq 并先对齐 Web 口径）、P1-2（`supabaseTransport.ts:338` 仅按 `/exists/i` 文案匹配兼容，网关 `supabaseGateway.ts:98-107` 丢弃 Storage 错误 code/status，建议按码判定）、P2-1（`base64.ts:21` 注释“非法字符视为 0”与实现 `continue` 跳过不一致，改注释即可）。
- O-2｜本轮为工程静态验证（typecheck/test/lint/根 build/git/Secret/无 key 断言），无真机/EAS 用例；真云联调待用户填 key 后另行验收，QA 不宣称云端已通。
- O-3｜根 build 与 DEV-06/07 基线一致：`108 modules`／chunk `514.62 kB`／precache `13 entries`，无回归。

## 真机QA会话能力预检结果（本轮不适用）

> 本轮为工程静态验证，无真机/EAS 用例；按 qa 卡「Mac 预检不代 Android/iPhone 验收」，不填预检、不宣称真机能力。

- 最终结论：`NOT_VERIFIED`（真机验证留后续 Task）
- 是否允许进入正式真机QA：N/A（本轮非真机会话）

## Fix Attempt Fingerprint

- Task ID: TASK-DEV-08
- Root Cause Hypothesis: 无代码缺陷需修。typecheck/test/lint/根 build 全 0，git/Secret/真网/无 key 断言抽查干净。
- Approach: 不修（QA 不改代码）；CODE_REVIEW_DEV-08 的 P1/P2 backlog 留后续 Task 收尾。
- Files Changed: 无业务代码改动（仅 QA 新增本报告 `docs/qa/BUGS_DEV-08.md`）。
- Verification: 见执行证据表 #1–#8、真云联调断言、独立复核、用例分布核对小节。
- Failure Reason: 无（P0/P1 全过）。
- Difference From Previous Attempt: 首次 QA（无前次打回）。

> Attempt ID / Dispatch ID / Model-Backend 系字段 2.0 已废弃，不填（模型轨迹记账本）。
