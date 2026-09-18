# BUGS

- Task: TASK-DEV-05 Auth 本地段（PKCE/回调去重/SecureStore/owner 绑定，mock 会话，真登留 T062；基线 PRODUCT_PLAN_V1.5）
- QA 通道/Runtime: opencode 本窗口直驱（用户指定模型，经 opencode 通道执行；上派被权限系统中断未落盘，本轮只换命令写法、任务不变）
- Node/npm: 系统默认 node `v24.19.0`／npm `11.17.0`
- 时间: 2026-09-18 14:35
- 范围: ① `npm --prefix mobile run typecheck`；② `npm --prefix mobile test`（确认 suites/tests 数）；③ `npm --prefix mobile run lint`；④ 根 `npm run build` 回归；⑤ 根 `git status --porcelain`（确认无根业务改动）；⑥ `rg` 抽查 code 明文落盘／AsyncStorage 存 token／真凭据。
- 命令口径: 每条 bash 只做一件事，禁 `cd`、禁 `&&`/`;` 串联、留在项目根，统一 `npm --prefix mobile …`。
- **Verdict: PASS — 0 blocking bug（P0=0／P1=0）＋0 P2。**

## 执行证据（独立执行，命令＋exit 码＋关键行）

| # | 命令（工作目录＝项目根） | Exit | 关键输出 |
|---|---|---:|---|
| 1 | `npm --prefix mobile run typecheck` | 0 | `tsc --noEmit`，无任何输出（0 错） |
| 2 | `npm --prefix mobile test` | 0 | `Test Suites: 17 passed, 17 total`；`Tests: 104 passed, 104 total`；`Snapshots: 0 total`；`Time: 1.672 s` |
| 3 | `npm --prefix mobile run lint` | 0 | `expo lint`，无任何告警/错误输出 |
| 4 | `npm run build`（根） | 0 | `tsc -b && vite build`；`✓ 108 modules transformed`；`✓ built in 1.04s`；`dist/assets/index-HhPKoyXx.js 514.62 kB`；PWA `precache 13 entries (544.99 KiB)`；仅有既存 chunk>500kB 与 dynamic/static import 复用警告，无新错误 |
| 5 | `git status --porcelain`（根） | 0 | 跟踪改动仅治理件 `AGENTS.md`／`docs/handoff/HANDOFF.md`／软链类型变更 `USER_MODEL_OVERRIDE.md`；其余 untracked 为治理迁移件与整包 `mobile/`；`src/`、`api/`、`public/`、`index.html`、`vite.config.ts`、`tsconfig.json`、`server.mjs`、`compose.yaml`、`Dockerfile` 均未出现在输出=零根业务改动 |
| 6 | `rg -n --hidden -g '!node_modules' -g '!*.lock' -i "AsyncStorage" mobile` | 1（无真实命中） | 唯一命中 `mobile/src/supabase/secureStore.ts:7` 为注释禁令（“token/verifier 禁止进入 SQLite、AsyncStorage、日志…”），非调用 |
| 7 | `rg -n --hidden -g '!node_modules' -g '!*.lock' -i "localStorage\|setSession" mobile/src mobile/app` | 1（无命中） | 无 localStorage／setSession 调用 |
| 8 | `rg … "service_role\|SERVICE_ROLE\|SUPABASE_SERVICE\|JWT_SECRET\|jwt_secret" mobile` | 0 | 仅 2 条禁令注释/文档：`mobile/src/supabase/native.ts:13`、`mobile/docs/AUTH_REDIRECT.md:35`（“只允许 publishable，禁 service_role”），无真实密钥值 |
| 9 | `rg … "eyJ[A-Za-z0-9_-]{10,}" mobile` | 1（无命中） | 全 mobile 无任何 JWT 形态真凭据（含测试假值） |
| 10 | `rg … "setItem\|setItemAsync\|SecureStore\." mobile/src mobile/app` | 0 | 持久化写入口仅 `mobile/src/supabase/secureStore.ts`（adapter 单一路径）；测试内假值 `{access_token:'a',refresh_token:'r'}`／`'code-verifier':'v1'` 为内存 adapter 形状演示，非真凭据 |
| 11 | `rg … "console\.(log\|warn\|error\|debug)" mobile/src/supabase mobile/app` | 1（无 console 命中） | 无任何 console 日志语句（唯一 `print(` 子串来自 `computeCallbackFingerprint` 函数名，非打印） |
| 12 | `rg … "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY\s*=\s*\S" mobile` + 读 `mobile/.env.example` | 1（无命中） | `.env.example` 三键均留空（URL/KEY/WEB_BASE_URL），无真实值 |

## code 明文落盘核查（专项，对 CODE_REVIEW_DEV-05 R4-01）

- `code` 仅以函数参数在内存调用链传递：`redirect.ts:107-110` → `auth.ts:190-202` → `exchangeCodeForSession`；`mobile/src/supabase/fingerprint.ts:4,27-29` 明确“绝不落 code/token/完整 callback URL”，落盘字段为 `SHA-256` 指纹。
- 单测互验：`fingerprint.test.ts:28-43` 断言 `JSON.stringify(record)` 不含 code 原文、键集合精确六字段；`auth.test.ts:94-99` 断言持久化内容不含 `one-time-code`。
- 结论：抽查未见任何 code 明文落盘路径，符合 R4-01。

## 用例分布核对（与 #2 运行结果互验）

- 17 suites 全 PASS，与 `Test Suites: 17 passed, 17 total` 一致；Auth 段新增/涉及 suites：`auth`、`redirect`、`owner`、`fingerprint`、`secureStore`、`sha256`，另含 `db/*3`、`media/*4`、`sync/*2`、根 `__tests__/*2`。
- 合计 104 tests 全过，与 `Tests: 104 passed, 104 total` 一致。

## Bug 表

| Bug ID | Priority | Stage P0 Blocking? | Repro | Status | Current Task | 备注（截图/日志一句） |
|---|---|---:|---|---|---|---|
| （无） | — | — | — | — | TASK-DEV-05 | 本轮无 P0/P1/P2 bug |

## QA 观察（非阻塞，留 builder/TM 收尾）

- O-1｜CODE_REVIEW_DEV-05 的 P1-1（冷启动 sweep/recoverSession/scheme 监听未接入 `_layout.tsx`）、P1-2（`OAUTH_EXCHANGE_UNCERTAIN_MS` 悬空）为 reviewer 明示的非阻塞前置，转 T057+/T062 集成必做；本轮静态验证不代替冷启动路径实证，QA 不宣称已闭环。
- O-2｜P2-1～P2-3（callback 明文 ref／fragment 兼容／错误分类启发式）与 P3-1（测试键名 `code-verifier`）维持 backlog，非本轮范围；本轮未触发新问题。
- O-3｜根 build 与基线（HANDOFF §基线 2026-09-18 及 BUGS_DEV-04 O-3）一致：`108 modules`／chunk 514.62 kB／precache 13 entries，无回归。
- O-4｜本轮为工程静态验证（typecheck/test/lint/根 build/git/Secret），无真机/EAS 用例；真登与冷启动真机验收归 T062。

## 真机QA会话能力预检结果（本轮不适用）

> 本轮为工程静态验证，无真机/EAS 用例；按 qa 卡「Mac 预检不代 Android/iPhone 验收」，不填预检、不宣称真机能力。

- 最终结论：`NOT_VERIFIED`（真机验证留后续 Task）
- 是否允许进入正式真机QA：N/A（本轮非真机会话）

## Fix Attempt Fingerprint

- Task ID: TASK-DEV-05
- Root Cause Hypothesis: 无代码缺陷需修。typecheck/test/lint/根 build 全 0，git/Secret/code 明文抽查干净。
- Approach: 不修（QA 不改代码）；CODE_REVIEW_DEV-05 的 P1-1/P1-2 与 P2 backlog 留后续 Task 收尾。
- Files Changed: 无业务代码改动（仅 QA 新增本报告 `docs/qa/BUGS_DEV-05.md`）。
- Verification: 见执行证据表 #1–#12 及 code 明文落盘核查、用例分布核对小节。
- Failure Reason: 无（P0/P1 全过）。
- Difference From Previous Attempt: 上派被权限系统中断未落盘；本轮同任务同判据，仅把命令改为 `npm --prefix mobile …`（根目录单条执行）后完成并落盘，结论不变。

> Attempt ID / Dispatch ID / Model-Backend 系字段 2.0 已废弃，不填（模型轨迹记账本）。
