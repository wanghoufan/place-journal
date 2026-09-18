# BUGS｜TASK-DEV-10 工程 QA

- Task: TASK-DEV-10 网页对齐（Record 照片置顶重排＋演示数据播种＋Find 评分筛选＋Tags 维度 CRUD；基线 PRODUCT_PLAN_V1.5 / DEV_BASELINE=PRODUCT_PLAN_V1.5）
- 上游: docs/review/CODE_REVIEW_DEV-10.md（Result: 过，不打回；P0=0，P1-1/P1-2 进 backlog 由 QA 复验）
- QA: qa（本窗口直派，只读不改业务代码，只写本报告）
- 通道/Runtime: opencode 本窗口（用户指定模型，经 opencode 通道执行；亲手执行命令）
- Node/npm: `v24.19.0` / `11.17.0`
- 时间: 2026-09-18 18:26（HEAD=`61a8324`；`mobile/` 整包 untracked，对照工作树现状验证）
- 范围: ① `npm --prefix mobile run typecheck`；② `npm --prefix mobile test`（记 suites/tests 数）；③ `npm --prefix mobile run lint`；④ 根 `npm run build` 回归；⑤ 根 `git status --porcelain`；⑥ `git check-ignore mobile/.env`；⑦ `rg` 无真凭据抽查。真机由 TM 实证，不在本 QA 范围。
- 命令口径: 每条 bash 只做一件事，禁 `cd`、禁 `&&`/`;` 串联、留在项目根，统一 `npm --prefix mobile …`。
- **Verdict: PASS — 0 blocking bug（P0=0／P1=0）。7 项静态验证全 0，无真凭据落仓；reviewer 的 P1-1/P1-2 为口径差异观察项，不构成阻塞，留 TM 判定。**

## 一、执行证据（独立执行，命令＋exit 码＋关键行）

| # | 命令（工作目录＝项目根） | Exit | 关键输出 |
|---|---|---:|---|
| 1 | `npm --prefix mobile run typecheck` | 0 | `tsc --noEmit`，无任何输出（0 类型错误） |
| 2 | `npm --prefix mobile test` | 0 | `Test Suites: 29 passed, 29 total`；`Tests: 206 passed, 206 total`；`Snapshots: 0 total`；`Time: 2.984 s`；首轮全绿、无偶发失败、无需重跑（`migrations.test.ts` 仅 3 条 `[db] expected-columns reconcile: +10/+0/+0` console.debug，属预期日志） |
| 3 | `npm --prefix mobile run lint` | 0 | `expo lint`，无 lint 违规/警告输出；仅 `env: load .env` 并导出 3 个变量名（`EXPO_PUBLIC_PUBLISHABLE_KEY`／`EXPO_PUBLIC_SUPABASE_URL`／`EXPO_PUBLIC_WEB_BASE_URL`），**未打印值** |
| 4 | `npm run build`（根） | 0 | `tsc -b && vite build`；`✓ 108 modules transformed`；`✓ built in 1.03s`；`dist/assets/index-HhPKoyXx.js 514.62 kB (gzip 153.08 kB)`／`index-Dm8xP8rO.css 25.78 kB`；PWA `precache 13 entries (544.99 KiB)`；仅既存 chunk>500kB 与 dynamic/static import 复用警告，**与基线一致、非回归** |
| 5 | `git status --porcelain`（根） | 0 | 跟踪改动仅治理件 `M AGENTS.md`／`M docs/handoff/HANDOFF.md`／类型变更 `T USER_MODEL_OVERRIDE.md`；untracked 为治理迁移件＋`docs/review/CODE_REVIEW_DEV-10.md`＋`docs/qa/BUGS_DEV-10.md`（本报告）＋整包 `mobile/`；根 `src/`／`api/`／`public/`／`index.html`／`vite.config.ts`／`tsconfig.json`／`server.mjs`／`compose.yaml`／`Dockerfile` 均未出现＝零根业务改动 |
| 6 | `git check-ignore -v mobile/.env` | 0 | `mobile/.gitignore:34:.env	mobile/.env`（忽略生效） |
| 7 | `rg -n --hidden --glob '!node_modules' --glob '!package-lock.json' "eyJ…JWT 形态" mobile src api` | 1（无命中） | 0 命中（exit 1＝rg 无匹配，符合预期）。另 `git ls-files mobile/.env mobile/.env.example mobile/.env.local` 空输出＝均未入库 |

## 二、git status 核验（无越界、无密钥入库）

- 工作树变更均为本阶段预期的治理迁移＋`mobile/` 新增；**根业务文件零改动**，无 builder 越界改根 `src/`/`api/`。
- `mobile/` 整包 untracked（`git ls-files mobile` 空输出）；`git status --porcelain --ignored mobile` 输出 `?? mobile/`＋`!! mobile/.env`／`!! mobile/.expo/`／`!! mobile/expo-env.d.ts`／`!! mobile/node_modules/`，忽略规则全部生效。
- `.env`／`.env.*` 未进入未跟踪清单：`mobile/.env` 由 `mobile/.gitignore:34` 忽略（#6 实证）；`mobile/.env`／`.env.example`／`.env.local` 三者 `git ls-files` 均未入库。

## 三、无真凭据抽查（rg，多模式，排除 node_modules/package-lock）

- JWT 形态 `eyJ…`（三段式）在 `mobile/ src/ api/`：**0 命中**。
- `service_role`／`SERVICE_ROLE`／`sk-…`／`sb_secret_…`／`pk.…` 全仓（排除 node_modules/lock）：仅 2 条**禁令注释**——`mobile/docs/AUTH_REDIRECT.md:35`、`mobile/src/supabase/native.ts:13`（均「只允许 publishable，禁 service_role」），无真实值。
- `mobile/.env`（gitignored、不入库）经 lint 载入仅导出 3 个 `EXPO_PUBLIC_*` 键（客户端公开：URL／publishable key／web base url），**无 service_role／secret key／JWT 形态凭据**；QA 未读取其值。
- `package-lock.json` 内 `sha512-…` integrity 为唯一形似命中（base64 偶然含 `eyJ` 子串），属依赖校验和，非凭据。
- 结论：无真凭据落仓，符合红线。

## 四、Bug 表

| Bug ID | Priority | Stage P0 Blocking? | Repro | Status | Current Task | 备注（截图/日志一句） |
|---|---|---|---|---|---|---|
| （无 blocking） | — | — | — | — | TASK-DEV-10 | 7 项静态验证全 0；本 QA 未发现新 P0/P1 |

## 五、QA 观察（非阻塞，留 TM/builder 收尾）

- O-1｜reviewer P1-1 `Find` 结果量词口径：Web 按地点聚合、mobile 按 entry 计数；P1-2 `Tags` 菜单计数仅自身（Web 父标签含子）。两者为口径差异、非功能缺陷，reviewer 已判「不打回」，本轮 QA 复验不判 blocking；建议 TM 明确是否统一口径或 HANDOFF 注记。
- O-2｜reviewer P2 池（demo 多 1 条二访、Find 评分 chip 计数为移动端增强、KIND_LABEL region 文案差）：均为有意增强/细微差，归 backlog。
- O-3｜本轮为工程静态验证（typecheck/test/lint/根 build/git/rg/Secret），**无真机/EAS 用例**；真机由 TM 实证，QA 不代宣称真机结论。

## 六、真机QA会话能力预检结果（本轮不适用）

> 本轮为工程静态验证，无真机/EAS 用例；按 qa 卡「Mac 预检不代 Android/iPhone 验收」，不填预检、不宣称真机能力。

- 最终结论：`NOT_VERIFIED`（真机验证由 TM 另做）
- 是否允许进入正式真机QA：N/A（本轮非真机会话）

## 七、Fix Attempt Fingerprint

- Task ID: TASK-DEV-10
- Root Cause Hypothesis: 无 blocking 代码缺陷。typecheck/test/lint/根 build 全 exit 0；无越界改动；无真凭据落仓。
- Approach: 不修（QA 不改业务代码）；O-1～O-3 留 TM/builder 收尾。
- Files Changed: 无业务代码改动（仅 QA 新增本报告 `docs/qa/BUGS_DEV-10.md`）。
- Verification: 见 §一执行证据表 #1–#7、§二 git、§三 真凭据抽查。
- Failure Reason: 无（P0/P1 全过）。
- Difference From Previous Attempt: 首次 QA（对应 CODE_REVIEW_DEV-10，P0=0）。

> Attempt ID / Dispatch ID / Model-Backend 系字段 2.0 已废弃，不填（模型轨迹记账本）。
