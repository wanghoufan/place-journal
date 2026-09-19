# BUGS

- Task: TASK-DEV-12 分享页本地段（ShareList/ShareSingle/快照创建撤销＋白名单 mapper＋P2-5 扁平兼容）
- QA: qa（本窗口，只读业务代码＋亲手执行命令，只写本文件）
- 日期：2026-09-18
- **QA 结论：PASS（有条件）** —— P0=0、blocking P1=0；6 项命令全绿（含根 build 回归）；bug 总数 3（P1×1 环境/治理归属非 DEV-12 代码、P3×2）。
- 命令铁律遵守：单命令单动作、无 `cd`、无 `&&`/`;`、未出仓库根、未读写 `/tmp`。

## 一、执行证据（逐条，亲手执行）

| # | 命令 | 结果 | 证据摘要 |
|---|---|---|---|
| 1 | `npm --prefix mobile run typecheck` | PASS（exit 0） | `tsc --noEmit` 零输出零报错 |
| 2 | `npm --prefix mobile test` | PASS（exit 0） | Test Suites: 31 passed / 31；Tests: **233 passed / 233**；Time 1.873s；无失败、无跳过 |
| 3 | `npm --prefix mobile run lint` | PASS（exit 0） | 0 errors / 3 warnings，全部落在 `mobile/src/features/__tests__/shares.test.ts`（见 QA-DEV12-02） |
| 4 | `npm run build`（根 Web 回归） | PASS（exit 0） | 108 modules transformed；`dist/assets/index-HhPKoyXx.js` 514.62 kB（gzip 153.08）；PWA precache 13 entries；仅既有 warning（chunk>500kB ＋ dynamic/static 复用提示），无 error |
| 5 | `git status --porcelain` | 见下节 | 24 行：`T`×1 ＋ `M`×13 ＋ `??`×10；根 `src/` 零改动 |
| 6 | rg 无真凭据 / 无真网调用 | PASS | 见「三、凭据与网络扫描」 |

### 补充验证（只读，非破坏）

- `mobile/src/features/__tests__/shares.test.ts:1-2` 自述「全部走真实 SQLite（node:sqlite），不触网、无凭据」，且 `setup()` 走 `createNodeSqliteDatabase + runMigrations` 真建库 → DEV-12 单测证据为真库实测，非 mock。
- 白名单独立性核对：`mobile/src/domain/mapping.ts:221-232` `shareItemToPayload` 仅输出 `name/area/rating/budget/note_public/tags/coord_precision` 7 字段；`note_private`、`transcript`、`lat/lng`、`photos`、来源 id 均不在其中（`shareItemRowValues` 落库的公开列同样取自该 payload 唯一真源）→ 与 CODE_REVIEW_DEV-12 的 P0=0 结论一致。
- 路由接线核对：`mobile/app/(tabs)/mine.tsx:234` → `/shares`；`mobile/app/shares.tsx:95` → `/share/[slug]`；`mobile/app/entry/[id].tsx:118-119` 创建后跳 `/share/${slug}`。三处闭环，无死链。

| Bug ID | Priority | Stage P0 Blocking? | Repro | Status | Current Task | 备注（截图/日志一句） |
|---|---|---:|---|---|---|---|
| QA-DEV12-01 | P1 | No | 1) `git status --porcelain` 首行 ` T USER_MODEL_OVERRIDE.md`；2) `git ls-files -s USER_MODEL_OVERRIDE.md` → `120000`（索引仍是软链）；3) `ls -l USER_MODEL_OVERRIDE.md` → `-rw-r--r--  2408` 普通文件；4) `git diff` → `deleted file mode 120000` + `new file mode 100644` | Open（转 TM） | 非 DEV-12 产物（治理/环境） | 软链被materialize成实文件，HANDOFF:59 仍写「现为软链」，且未按 AGENTS「跨机器断链时拷实文件并记 HANDOFF」补记一笔 |
| QA-DEV12-02 | P3 | No | `npm --prefix mobile run lint` → 3 warnings：`6:51`、`19:32` `import/no-duplicates`（`db/repository` 值导入＋类型导入重复）、`80:10` `count` defined but never used | Open | TASK-DEV-12 | 仅测试文件、exit 0 不影响门禁；`count` 为无用本地 helper |
| QA-DEV12-03 | P3 | No | 只读核对 `mobile/src/features/shares.ts:78-96`：`budget: src.budget` 直传，无 `Number.isFinite` 守卫；CODE_REVIEW P2-2 保留 | Open | TASK-DEV-12 | 实际风险低：SQLite REAL 列不存 NaN（读出为 NULL→`optNumber` 返 undefined），仅外部调用方直接调 `buildShareItem` 时才可能传入；建议下轮顺手加守卫 |

## 二、范围与归属核对（`git status --porcelain` 全量）

- `T`×1：`USER_MODEL_OVERRIDE.md`（见 QA-DEV12-01）。
- `M`×13：`docs/handoff/HANDOFF.md`、`docs/model/DISPATCH-LOG.jsonl`、`docs/model/TASK-MODEL-LOG.jsonl`（治理/账本）；`mobile/app/(tabs)/mine.tsx`、`mobile/app/_layout.tsx`、`mobile/app/entry/[id].tsx`、`mobile/src/domain/mapping.ts`、`mobile/src/features/queries.ts`、`mobile/src/supabase/{auth,fingerprint,index}.ts`＋两项对应测试（DEV-11/DEV-12 链延续）。
- `??`×10：`mobile/app/share/`、`mobile/app/shares.tsx`、`mobile/src/features/shares.ts`、`mobile/src/features/__tests__/shares.test.ts`（DEV-12 新增）；`mobile/src/supabase/startup.ts`＋测试（冷启动接线）；`docs/qa/BUGS_DEV-11.md`、`docs/review/CODE_REVIEW_DEV-11.md`、`docs/review/CODE_REVIEW_DEV-12.md`、`docs/qa/evidence-android-ui/5-coldstart-gallery-8cards.png`（他人产出的文档/证据）。
- **根 Web 零改动已独立证实**：`git status` 中 `src/`、`api/`、根配置零条目；根 `npm run build` 输出中出现的 `src/lib/shares.ts` 为既有文件（未被本任务改动）。
- 构建产物 `dist/` 未进 `git status` → 已被忽略，无仓库污染。

## 三、凭据与网络扫描（步骤 6 明细）

- `rg 'eyJ[A-Za-z0-9_-]{10,}'`（真实 JWT）→ **0 命中**。
- `rg 'service_role|SERVICE_ROLE|SUPABASE_SERVICE'` → 仅 2 处**注释/文档**（`mobile/src/supabase/native.ts:13`、`mobile/docs/AUTH_REDIRECT.md:35`），均表述「只允许 publishable，禁 service_role」，无真值。
- `rg 'https?://[a-zA-Z0-9.-]+\.supabase\.co'` → **0 命中**（无硬编码真项目地址）。
- `rg 'fetch\(|XMLHttpRequest|axios|WebSocket\('`（`mobile/src/features/shares.ts` 与 `mobile/app/`）→ **0 命中**（DEV-12 本地段确实零网络）。
- `rg "'https?://"`（`mobile/**/*.ts`）→ 命中全部位于 `__tests__` / `src/test/fakeSyncGateway.ts` / `demo.test.ts`，域名为 `example.com`、`evil.example`、`fake.local`、`picsum.photos`（演示数据）→ 无真网调用。
- `git check-ignore -v mobile/.env` → `mobile/.gitignore:34:.env` 命中，真 key 未入 Git；`npm run lint` 仅打印变量名 `EXPO_PUBLIC_PUBLISHABLE_KEY`，未回显值。

## 四、未验证项（不在本次命令 QA 范围，明示不冒认）

1. **真机/UI 行为未验**：分享页卡片内嵌 `AppButton`（`mobile/app/shares.tsx:114-119`）与外层 `Pressable`（:92-96）为 RN 嵌套 Pressable，理论上内层抢占 responder、外层不触发导航，但本 session 无真机/无 RN 运行环境，**未实测**，建议随 T062 真机段一并确认「点撤销不误跳详情」。
2. **合集分享无 UI 入口**：`createListShare` 仅有单测覆盖，`mobile/app/` 内无调用点（`rg` 证实）。若本卡 DoD 仅要求本地段合同与能力（CODE_REVIEW_DEV-12 表述为「ShareList/ShareSingle/快照创建撤销」），则不算缺失；UI 入口按 `T096–T101` 归属后续，**请 TM/supervisor 按 DoD 口径确认**。
3. **P1-1（revoke 出队键含义）未闭环**：CODE_REVIEW 留的条件项依赖 T062 推送消费者，本轮无 push 消费者代码，无法验证，维持「真云前确认」。
4. **账本/DISPATCH 内容正确性**未逐行审计（属 supervisor 抽查口径，非 QA 本轮命令集）。

## 真机QA会话能力预检结果（每真机session正式用例前必填，PASS才进正式QA，否则停）

> 本轮为**本地命令回归 QA**，非真机 session，按模板口径**不适用**，不填不冒认；禁止跨 session/跨模型拼 PASS。

- 日期/任务名：2026-09-18 / TASK-DEV-12（本地命令 QA）
- session ID：（不适用）
- 模型精确ID：（不适用）
- Runtime：（不适用）
- 原生CUA是否实际注入：**不适用**（本轮未使用 CUA，未伪称已注入）
- 可用工具精确名称：（不适用）
- CLI备用入口是否存在（Bash→orca computer CLI）：未检测
- Orca Runtime（`orca status --json` 实时结果，禁沿用旧报告）：未检测（不适用）
- 能力（`orca computer capabilities --json` 实时结果）：未检测（不适用）
- 权限（`orca computer permissions --json` 实时结果）：未检测（不适用）
- 读屏结果：N/A
- 截图结果：N/A
- 点击并恢复结果：N/A
- 输入并清除结果：N/A
- 滚动及可见位移结果：N/A
- 界面恢复确认（无残留）：N/A（本轮无 UI 操作）
- 最终结论（枚举）：`NOT_VERIFIED`（本轮非真机会话）
- 原始错误摘要：无
- 是否允许进入正式QA（全PASS才YES，否则NO即停）：**N/A（本轮非真机链）**；若后续派真机 QA，须重跑本预检并全 PASS 才进正式用例

## Fix Attempt Fingerprint

- Task ID: TASK-DEV-12（QA 轮，无返工）
- Root Cause Hypothesis: 不适用（未发现需返工的功能缺陷；P0=0）
- Approach: 只读核对＋亲手执行 6 项命令，不外改业务代码
- Files Changed: 无（仅新增本 QA 文档）
- Verification: 见「一、执行证据」
- Failure Reason: 无
- Difference From Previous Attempt: 首次 QA（rework 0/2）

> Attempt ID / Dispatch ID / Model-Backend 系字段 2.0 已废弃，不填（模型轨迹记账本）。
