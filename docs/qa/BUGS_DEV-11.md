# BUGS｜TASK-DEV-11 工程 QA

- Task: TASK-DEV-11 冷启动接线（`startAuthLifecycle`：sweep→recover→attach+subscribe→initialUrl 接入 `mobile/app/_layout.tsx`；含 P1-2 `OAUTH_EXCHANGE_UNCERTAIN_MS` 真实使用；基线 PRODUCT_PLAN_V1.5 / DEV_BASELINE=PRODUCT_PLAN_V1.5）
- 上游: docs/review/CODE_REVIEW_DEV-11.md（Result: 过，不打回；P0=0，P1=0；P2-1 callback 失败静默吞错进 backlog）
- QA: qa（本窗口直派，只读不改业务代码，只写本报告）
- 通道/Runtime: opencode 本窗口（用户指定模型，经 opencode 通道执行；亲手执行命令）
- Node/npm: `v24.19.0` / `11.17.0`
- 时间: 2026-09-18 22:5x（HEAD=`9414c7a`，`mobile/` 自 DEV-01→DEV-10 起已入库，本轮改动为工作树未提交）
- 范围: ① `npm --prefix mobile run typecheck`；② `npm --prefix mobile test`（记 suites/tests 数）；③ `npm --prefix mobile run lint`；④ 根 `npm run build` 回归；⑤ 根 `git status --porcelain`；⑥ `rg` 无真凭据抽查（＋`git check-ignore mobile/.env` 辅助）。真机由 TM 实证，不在本 QA 范围。
- 命令口径: 每条 bash 只做一件事，禁 `cd`、禁 `&&`/`;` 串联、留在项目根，统一 `npm --prefix mobile …`。
- **Verdict: PASS — 0 blocking bug（P0=0／P1=0）。6 项静态验证全 0，无真凭据落仓；冷启动序列与 P1-2 收敛经单测锁定且独立复核一致。**

## 一、执行证据（独立执行，命令＋exit 码＋关键行）

| # | 命令（工作目录＝项目根） | Exit | 关键输出 |
|---|---|---:|---|
| 1 | `npm --prefix mobile run typecheck` | 0 | `tsc --noEmit`，无任何输出（0 类型错误） |
| 2 | `npm --prefix mobile test` | 0 | `Test Suites: 30 passed, 30 total`；`Tests: 220 passed, 220 total`；`Snapshots: 0 total`；`Time: 2.481 s`；首轮全绿、无偶发失败、无需重跑。较 DEV-10（29 suites/206 tests）净增 1 suite/14 tests：`startup.test.ts`（7 例）＋ auth 不确定分支（3 例）＋ fingerprint `isExchangeUncertain`/sweep 幂等（4 例）。`migrations.test.ts` 仅 3 条 `[db] expected-columns reconcile: +10/+0/+0` console.debug，属预期日志 |
| 3 | `npm --prefix mobile run lint` | 0 | `expo lint`，无 lint 违规/警告输出；仅 `env: load .env` 并导出 3 个变量名（`EXPO_PUBLIC_PUBLISHABLE_KEY`／`EXPO_PUBLIC_SUPABASE_URL`／`EXPO_PUBLIC_WEB_BASE_URL`），**未打印值** |
| 4 | `npm run build`（根） | 0 | `tsc -b && vite build`；`✓ 108 modules transformed`；`✓ built in 1.94s`；`dist/assets/index-HhPKoyXx.js 514.62 kB (gzip 153.08 kB)`／`index-Dm8xP8rO.css 25.78 kB`；PWA `precache 13 entries (544.99 KiB)`／`dist/sw.js` 生成；仅既存 chunk>500kB 与 dynamic/static import 复用警告，**与 DEV-10 基线逐字一致、非回归** |
| 5 | `git status --porcelain`（根） | 0 | 见 §二；跟踪改动仅治理件 `M docs/handoff/HANDOFF.md`＋DEV-11 源码/单测 5 文件；untracked 为 `?? docs/review/CODE_REVIEW_DEV-11.md`、`?? mobile/src/supabase/startup.ts`、`?? mobile/src/supabase/__tests__/startup.test.ts`。**根 `src/`／`api/`／`public/`／`index.html`／`vite.config.ts`／根 `tsconfig.json` 均未出现＝零根业务改动** |
| 6 | `rg -n --hidden -g '!node_modules' -g '!dist' -g '!.git' -e 'eyJ[A-Za-z0-9_-]{20,}' -e 'BEGIN [A-Z ]*PRIVATE KEY' -e 'sb_secret_…' -e 'sk-…' .` | 1（无命中） | 0 命中（exit 1＝rg 无匹配，符合预期）：无 JWT 形态三段式、无私钥、无 `sb_secret_`、无 `sk-` 真值 |
| 6b | `git check-ignore -v mobile/.env` | 0 | `mobile/.gitignore:34:.env	mobile/.env`（忽略生效）；`git ls-files mobile/.env mobile/.env.local` 空输出＝均未入库 |
| 6c | `rg -n --hidden -g '!node_modules' -g '!dist' -g '!.git' -e 'service_role' -e 'sb_secret' .` | 0（仅文字命中） | 全部为**禁令注释/文档文字**（`AGENTS.md`/`README.md`/`docs/sop`/`docs/review`/`docs/qa` 旧报告/`mobile/docs/AUTH_REDIRECT.md:35`/`mobile/src/supabase/native.ts:13`），无真实密钥值 |

## 二、git status 核验（无越界、无密钥入库）

- 工作树变更均为本阶段预期（DEV-11 冷启动接线）＋治理件；**根业务文件零改动**，无 builder 越界改根 `src/`/`api/`/`supabase/`。
- DEV-11 改动面精确对应任务范围：`mobile/app/_layout.tsx`（接线注入）＋`mobile/src/supabase/{startup.ts(新),auth.ts,fingerprint.ts,index.ts}`＋对应 3 个单测；`startup.ts` 全程依赖注入、不 import Expo 原生模块，`_layout.tsx` 负责注入 native 实现，与设计一致。
- `mobile/` 已入库（HEAD `9414c7a`），故本轮以 `M`/`??` 呈现（与 DEV-10 报告时 `?? mobile/` 整包 untracked 不同，属仓库演进，非异常）。
- 密钥红线：`mobile/.env` 由 `mobile/.gitignore:34` 忽略，`.env`/`.env.local` 均未入库；tracked `*env*` 仅模板 `.env.example`／`docker/env.template`／`src/lib/env.ts`／`docs/db` 截图，无真值。

## 三、DEV-11 行为独立复核（源码＋单测交叉）

- 冷启动固定序列（`mobile/src/supabase/startup.ts:44-60`）：`sweepFingerprints → recoverSession → attachAuthAutoRefresh + subscribeAuthCallbacks → getInitialAuthUrl`；`startup.test.ts:91-100` 以 `events` 数组逐字锁定顺序，独立复核一致。
- 顺序关键点成立：订阅早于 `getInitialUrl`（不丢存活期回调），`getInitialUrl` 早于其 `handleCallback`（不丢冷启动 code）；session-first 的 `recoverSession` 排在补收之前，迟到旧 code 只命中 `duplicate/terminal`，不二次换码。
- `dispose()`（`startup.ts:64-67`）同时解除 url 监听与自动刷新；`_layout.tsx:33,40-43` 处理 effect 卸载竞态（`disposed` 标记，晚到的 handle 立即 dispose），StrictMode 双挂载下 sweep/recover 幂等（`startup.test.ts:102-113`）。
- 未配置 Supabase 时 `isConfigured()===false` 整段跳过（`startup.ts:45`），`_layout.tsx:22-28` 惰性取单例避免误抛 `SUPABASE_ENV_MISSING`；`startup.test.ts:156-169` 覆盖。
- P1-2 真实使用常量：`OAUTH_EXCHANGE_UNCERTAIN_MS = 2*60*1000`（`constants.ts:32`）；`isExchangeUncertain`（`fingerprint.ts`）在 `exchanging` 超窗或 `processInterrupted` 时判不确定，非 `exchanging` 恒 false；`handleCallback`（`auth.ts:193-208`）对超窗 `exchanging` 走 session-first 收敛（有 session→`succeeded`，无→`terminal_reauth('interrupted_no_session')`），**不重换码**；`recoverSession`（`auth.ts:291-308`）冷启动把 `received/exchanging` 一律按不确定收敛。单测 `auth.test.ts` 新 3 例＋`fingerprint.test.ts` 新 3 例覆盖，独立复核语义一致。

## 四、Bug 表

| Bug ID | Priority | Stage P0 Blocking? | Repro | Status | Current Task | 备注（截图/日志一句） |
|---|---|---|---|---|---|---|
| （无 blocking） | — | — | — | — | TASK-DEV-11 | 6 项静态验证全 0；本 QA 未发现新 P0/P1 |

## 五、QA 观察（非阻塞，留 TM/builder 收尾）

- O-1｜reviewer P2-1 复验：`startup.ts:54,59` 对 scheme 回调与冷启动补收的 `handleCallback` 失败仅 `.catch(noop)` 静默，`_layout.tsx:35-37` 亦 `catch {}` 不阻断 UI。此为有意设计（冷启动失败不阻断，Mine 可手动登录），本轮不判 blocking；建议后续加 `onCallbackError`/`onRecovery` 透出诊断（`_layout` 当前未注入 `onRecovery`）。
- O-2｜测试数由 DEV-10 的 206 增至 220（+14），与 DEV-11 新增用例数吻合；HANDOFF §1 记录的「206 tests」为 DEV-10 时点快照，本轮后应为 220，建议 TM 更新文档口径。
- O-3｜本轮为工程静态验证（typecheck/test/lint/根 build/git/rg），**无真机/EAS 用例**；冷启动真机行为（scheme 唤起→回调补收）由 TM 实证，QA 不代宣称真机结论。

## 六、真机QA会话能力预检结果（本轮不适用）

> 本轮为工程静态验证，无真机/EAS 用例；按 qa 卡「Mac 预检不代 Android/iPhone 验收」，不填预检、不宣称真机能力。

- 最终结论：`NOT_VERIFIED`（真机验证由 TM 另做）
- 是否允许进入正式真机QA：N/A（本轮非真机会话）

## 七、Fix Attempt Fingerprint

- Task ID: TASK-DEV-11
- Root Cause Hypothesis: 无 blocking 代码缺陷。typecheck/test/lint/根 build 全 exit 0；冷启动序列与 P1-2 收敛经单测锁定、独立复核一致；无越界改动；无真凭据落仓。
- Approach: 不修（QA 不改业务代码）；O-1～O-3 留 TM/builder 收尾。
- Files Changed: 无业务代码改动（仅 QA 新增本报告 `docs/qa/BUGS_DEV-11.md`）。
- Verification: 见 §一执行证据表 #1–#6c、§二 git 核验、§三 行为独立复核。
- Failure Reason: 无（P0/P1 全过）。
- Difference From Previous Attempt: 首次 QA（对应 CODE_REVIEW_DEV-11，P0=0；DEV-10 后新增冷启动接线与 P1-2 分支）。

> Attempt ID / Dispatch ID / Model-Backend 系字段 2.0 已废弃，不填（模型轨迹记账本）。
