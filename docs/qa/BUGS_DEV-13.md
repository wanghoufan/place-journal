# BUGS

- Task: TASK-DEV-13 P2 大扫除（口径 / 文案 / 健壮性小项）＋ DEV-12 遗留项返工
- QA: qa（本窗口，只读业务代码＋亲手执行命令，只写本文件）
- 日期：2026-09-19
- **QA 结论：PASS（有条件）** —— P0=0、blocking P1=0；6 项命令全绿（含根 build 回归）；bug 总数 3（全 P3，无 blocker）。
- 命令铁律遵守：单命令单动作、无 `cd`、无 `&&`/`;`、未出仓库根、未读写 `/tmp`。

## 一、执行证据（逐条，亲手执行）

| # | 命令 | 结果 | 证据摘要 |
|---|---|---|---|
| 1 | `npm --prefix mobile run typecheck` | PASS（exit 0） | `tsc --noEmit` 零输出零报错 |
| 2 | `npm --prefix mobile test` | PASS（exit 0） | Test Suites: **31 passed / 31**；Tests: **240 passed / 240**（DEV-12 为 233 → +7）；Snapshots 0；Time 1.591s；无失败、无跳过；仅 3 条 `migrations.test.ts` 的 `console.debug` 噪音 |
| 3 | `npm --prefix mobile run lint` | PASS（exit 0） | **0 errors / 3 warnings**，全部落在 `mobile/src/features/__tests__/shares.test.ts`（见 QA-DEV13-01，D12 起未变） |
| 4 | `npm run build`（根 Web 回归） | PASS（exit 0） | 108 modules transformed；产物 `dist/assets/index-HhPKoyXx.js` 514.62 kB（gzip 153.08）、`index-Dm8xP8rO.css` 25.78 kB；PWA precache 13 entries（544.99 KiB）；仅既有 warning（chunk>500kB ＋ dynamic/static 复用提示），无 error |
| 5 | `git status --porcelain` | 见下节 | **31 行**：`T`×1 ＋ `M`×19 ＋ `??`×11；根 `src/`、`api/`、根配置**零改动** |
| 6 | rg 无真凭据 / 无真网硬编码 | PASS | 见「三、凭据与网络扫描」 |

### 补充验证（只读，非破坏；用于确认 6 项命令之外的返工闭环）

- **根 Web 未受影响（双证）**：① `git status --porcelain` 中 `src/`／`api/`／根配置零条目；② 根 build 产物 JS 文件名哈希 `index-HhPKoyXx.js` 与 DEV-12 QA 记录**逐字相同** → 根 Web 输出字节级未变。
- **返工闭环核对**（DEV-12 遗留 → DEV-13 已改，且有单测）：
  - P2-2 budget 守卫：`mobile/src/features/shares.ts:83-85` 新增 `optFinite`，`buildShareItem:101` 走它；单测 `shares.test.ts:328-343`（NaN／±Infinity／正常值／0 五态）。
  - 公开读取侧 budget 守卫（P1-1 口径）：`mobile/src/domain/mapping.ts:279-285`，脏字符串 `'abc'`／非有限数 → `undefined`；单测 `shares.test.ts:347-378`（含 `'50'`→50、`null`→undefined）。
  - P2-5 扁平／嵌套双兼容：`mapping.ts:277` `raw.item ?? raw`；单测 `shares.test.ts:253-310`（两种结构映射出同一份快照）。
- **口径对齐核对（与根 Web 逐字比）**：
  - `mobile/src/features/format.ts:78-89` `dimensionKindLabel` 五档文案与 `src/pages/TagsPage.tsx` 的 `KIND_LABEL` **逐字一致**（含 `region: '地区（系统）'`），未知 kind 原样回显；单测 `format.test.ts`。
  - `mobile/app/tags.tsx` 父标签行与操作菜单副标题改用同一 `tagUsageWithChildren`（`queries.ts:330-333`），旧内联算法为 `parent.usage + children.sum`，**结果等价**（无回归）；单测 `queries.test.ts`。
  - `mobile/app/(tabs)/find.tsx:58-59,117-121` 新增按 place 去重的量词，对标 `src/pages/Find.tsx` 的「找到 N 个私藏地点」；`countDistinctPlaces`（`queries.ts:325-328`）为纯函数；单测 `queries.test.ts`。列表明细仍为 entry 链路 → 文案为「N 个私藏地点 · 共 M 条记录」，是 Web 口径的**超集**，非冲突。
- **空目录口径 ⑥ 实证**：`ls mobile/src/services` → `No such file or directory`；`find mobile -type d -empty -not -path '*/node_modules/*'` → **零输出**（`mobile/` 下已无空目录）；`rg 'services' mobile/src mobile/app mobile/package.json mobile/app.config.ts` → **0 命中**，与 `mobile/docs/README.md:4` 记载一致。
- **`mobile/src/domain/mapping.ts` 未越界**：改动仅在 `publicShareToSnapshot` 的条目映射分支，白名单字段集未增未减（仍是 `name/area/rating/budget/note_public/tags/cover_url/coord_precision`），私密字段仍未出现。

| Bug ID | Priority | Stage P0 Blocking? | Repro | Status | Current Task | 备注（截图/日志一句） |
|---|---|---:|---|---|---|---|
| QA-DEV13-01 | P3 | No | `npm --prefix mobile run lint` → 3 warnings（`6:51`、`20:32` `import/no-duplicates`；`81:10` `count` 未使用），全部在 `mobile/src/features/__tests__/shares.test.ts` | Open（DEV-12 起 carry-over，对应 QA-DEV12-02） | TASK-DEV-13 | exit 0，不影响门禁；仅测试文件、非产品代码 |
| QA-DEV13-02 | P3 | No | `ls docs/review` 全量列举**未见 `CODE_REVIEW_DEV-13.md`**；`rg -l 'DEV-13'` 全仓仅命中 `docs/handoff/HANDOFF.md`×2 与 `mobile/docs/README.md`×1 | Open（转 TM 判定/补链） | TASK-DEV-13 | 治理/流程口径问题，非代码缺陷：本轮 QA 的 DEV-13 范围只能由工作区 diff 反推（见「四、未验证项」第 2 条） |
| QA-DEV13-03 | P3 | No | `git ls-files -s USER_MODEL_OVERRIDE.md` → `120000`（索引仍是软链）；`ls -l` → `-rw-r--r-- 2408`（工作区实文件）→ `git status` 首行 ` T` | Closed（沿用 QA-DEV12-01 结论，TM 已判非代码） | — | `docs/handoff/HANDOFF.md:59` 已补记「用户亲令转实文件、旧软链已删」；仅待 commit 授权，无新动作 |

## 二、范围与归属核对（`git status --porcelain` 全量，31 行；本 QA 文档自身入列后 32 行）

- `T`×1：`USER_MODEL_OVERRIDE.md`（见 QA-DEV13-03，已 Closed）。
- `M`×19：
  - 治理/账本 3：`docs/handoff/HANDOFF.md`、`docs/model/DISPATCH-LOG.jsonl`、`docs/model/TASK-MODEL-LOG.jsonl`。
  - **DEV-13 本轮改动 6**：`mobile/app/(tabs)/find.tsx`、`mobile/app/tags.tsx`、`mobile/src/domain/mapping.ts`、`mobile/src/features/format.ts`、`mobile/src/features/queries.ts`、`mobile/docs/README.md`（mtime 均为 09-19 07:3x–07:4x，与 DEV-13 时间窗吻合）。
  - **DEV-11/DEV-12 链延续 10**：`mobile/app/_layout.tsx`、`mobile/app/(tabs)/mine.tsx`、`mobile/app/entry/[id].tsx`、`mobile/src/features/__tests__/{format,queries}.test.ts`、`mobile/src/supabase/{auth,fingerprint,index}.ts`＋对应 2 测试（均属已 PASS 任务，本轮仅被 DEV-13 追加测试/接线）。
- `??`×11：`mobile/app/share/[slug].tsx`、`mobile/app/shares.tsx`、`mobile/src/features/shares.ts`、`mobile/src/features/__tests__/shares.test.ts`、`mobile/src/supabase/startup.ts`＋测试（DEV-11/DEV-12 新增，尚未 commit）；`docs/qa/BUGS_DEV-11.md`、`docs/qa/BUGS_DEV-12.md`、`docs/review/CODE_REVIEW_DEV-11.md`、`docs/review/CODE_REVIEW_DEV-12.md`、`docs/qa/evidence-android-ui/5-coldstart-gallery-8cards.png`（他人产出的文档/证据，未动）。
- **越界检查**：`src/`、`api/`、根 `package.json`/`vite.config.ts`/`tailwind.config.ts`、`supabase/`、`scripts/` **零条目**；`mobile/src/services/` 为**删除**且从未被 Git 跟踪，故不出现在 status 中。
- 构建产物 `dist/` 未进 status → `git check-ignore -v dist` 命中 `.gitignore:2:dist`，无仓库污染。

## 三、凭据与网络扫描（步骤 6 明细）

- `rg 'eyJ[A-Za-z0-9_-]{10,}'`（全仓）→ **0 命中**；`rg 'eyJ[A-Za-z0-9_-]{10,}' mobile` → **0 命中**。
- `rg 'eyJ|sb_secret|sbp_|sk-[A-Za-z0-9]{20,}|BEGIN [A-Z ]*PRIVATE KEY' mobile src api --glob '!**/package-lock.json'` → **0 命中**。
- `rg 'service_role|SERVICE_ROLE|SUPABASE_SERVICE'`（全仓）→ 命中**全部为禁令注释/文档文字**（`AGENTS.md`、`README.md`、`docs/sop/supabase.md`、`docs/pm/PRODUCT_PLAN_V1.0.md`、`mobile/src/supabase/native.ts:13`、`mobile/docs/AUTH_REDIRECT.md` 及历史 QA/旧交接原文），**无真实密钥值**。
- `rg 'https?://[a-zA-Z0-9.-]+\.supabase\.co' mobile src api` → **0 命中**（本项目源码内无硬编码真项目地址）；全仓命中仅历史归档 `docs/V1_PRODUCT_AND_TECHNICAL_PLAN.md` 与 `docs/acceptance-l2/l2-sync.har`（2026-09-03 既有证据，凭据字段已 `REDACTED`），**非本轮产物、未改动**。
- `git check-ignore -v mobile/.env` → `mobile/.gitignore:34:.env`（真 key 未入 Git）；`git ls-files mobile | rg -i env` → 仅 `mobile/.env.example`（占位）。
- `npm --prefix mobile run lint` 日志仅回显变量**名**（`EXPO_PUBLIC_PUBLISHABLE_KEY`／`EXPO_PUBLIC_SUPABASE_URL`／`EXPO_PUBLIC_WEB_BASE_URL`），**未回显值**；QA 全程未读取 `mobile/.env` 内容。

## 四、未验证项（不在本次命令 QA 范围，明示不冒认）

1. **真机 / UI 渲染未验**：`find.tsx` 新量词文案、`tags.tsx` 维度文案与菜单副标题的实际渲染，本 session 无 RN 运行环境、无真机，**未实测**。逻辑层已由纯函数单测覆盖（`countDistinctPlaces`／`tagUsageWithChildren`／`dimensionKindLabel`），建议随 T062 真机段顺带目检一次。
2. **DEV-13 任务卡条目清单未取得**：工作区无 DEV-13 任务卡/计划条目（`rg -l 'DEV-13'` 仅 3 处：HANDOFF 在途描述、README ⑥）。故本文「①–⑥」范围系由工作区 diff 反推，**仅第 ⑥ 条有文档出处**（`mobile/docs/README.md:4`），其余条目编号与完整性**未经验证**；请 TM 按 DoD 口径确认是否漏项（与 QA-DEV13-02 同源）。
3. **`CODE_REVIEW_DEV-13.md` 缺失**：本轮 QA 无法引用 code-reviewer 的 P0/P1 判定做交叉核对，DEV-13 的 P0=0 结论由 QA **独立**得出（见「一」「二」），非引用他人结论。
4. **`docs/qa/evidence-android-ui/5-coldstart-gallery-8cards.png` 归属**：该文件仍为 `??`（未跟踪），非本任务产物，**未追查、未动、未删**（未知归属文件按铁律不动）。
5. **账本 / DISPATCH 内容正确性**未逐行审计（属 supervisor 抽查口径，非 QA 本轮命令集）。

## 真机QA会话能力预检结果（每真机session正式用例前必填，PASS才进正式QA，否则停）

> 本轮为**本地命令回归 QA**，非真机 session，按模板口径**不适用**，不填不冒认；禁止跨 session/跨模型拼 PASS。

- 日期/任务名：2026-09-19 / TASK-DEV-13（本地命令 QA）
- session ID：（不适用）
- 模型精确ID：（不适用）
- Runtime：（不适用）
- 原生CUA是否实际注入：**不适用**（本轮未使用 CUA，未伪称已注入）
- 可用工具精确名称：（不适用）
- CLI备用入口是否存在（Bash→orca computer CLI）：未检测（不适用）
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

- Task ID: TASK-DEV-13（含 DEV-12 遗留项返工）
- Root Cause Hypothesis: DEV-12 遗留的健壮性缺口（budget 非有限数未守卫）与口径分散（维度文案/标签计数/结果量词在页面内各写一份）→ DEV-13 收敛为共享纯函数并补守卫。
- Approach: 只读核对＋亲手执行 6 项命令＋根 Web 双证不回归；核对返工项均有对应单测且测试增量 +7 全绿。
- Files Changed: 无（仅新增本 QA 文档 `docs/qa/BUGS_DEV-13.md`）
- Verification: 见「一、执行证据」与「二、范围与归属核对」
- Failure Reason: 无 blocker（3 条 P3 均非阻塞）
- Difference From Previous Attempt: DEV-12 QA 遗留的 QA-DEV12-03（budget 守卫建议）已在本轮**实证闭环**；QA-DEV12-02（lint 3 warnings）**仍未闭环**，顺延为本轮 QA-DEV13-01

> Attempt ID / Dispatch ID / Model-Backend 系字段 2.0 已废弃，不填（模型轨迹记账本）。
