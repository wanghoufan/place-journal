# BUGS

- Task: TASK-DEV-09 界面批＋隐私返工（mobile/app 全路由＋features＋theme/ui；含 conflicts/find 私密展示返工；基线 PRODUCT_PLAN_V1.5）
- QA 通道/Runtime: opencode 本窗口直驱（用户指定模型，经 opencode 通道执行；亲手执行命令）
- Node/npm: 系统默认 node `v24.19.0`／npm `11.17.0`
- 时间: 2026-09-18 16:26
- 范围: ① `npm --prefix mobile run typecheck`；② `npm --prefix mobile test`（记 suites/tests 数）；③ `npm --prefix mobile run lint`；④ 根 `npm run build` 回归；⑤ 根 `git status --porcelain`；⑥ `rg` 核 `note_private/notePrivate` 仅在白名单位置、conflicts/find 不再展示私密；⑦ 无真凭据抽查。真机截图由 TM 另做。
- 命令口径: 每条 bash 只做一件事，禁 `cd`、禁 `&&`/`;` 串联、留在项目根，统一 `npm --prefix mobile …`。
- **Verdict: PASS — 0 blocking bug（P0=0／P1=0）。隐私返工目标项（conflicts/find）已闭环；另发现 1 条同族 P2 观察（`place/[id]`，不在本轮回工声明范围，留 TM 判定）。**

## 执行证据（独立执行，命令＋exit 码＋关键行）

| # | 命令（工作目录＝项目根） | Exit | 关键输出 |
|---|---|---:|---|
| 1 | `npm --prefix mobile run typecheck` | 0 | `tsc --noEmit`，无任何输出（0 错） |
| 2 | `npm --prefix mobile test` | 0 | `Test Suites: 28 passed, 28 total`；`Tests: 186 passed, 186 total`；`Snapshots: 0 total`；`Time: 1.626 s`；首轮全绿，无偶发失败、无需重跑 |
| 3 | `npm --prefix mobile run lint` | 0 | `expo lint`，无任何告警/错误输出（仅 env 载入提示 `.env` 并 export 三键） |
| 4 | `npm run build`（根） | 0 | `tsc -b && vite build`；`✓ 108 modules transformed`；`✓ built in 992ms`；`dist/assets/index-HhPKoyXx.js 514.62 kB`；PWA `precache 13 entries (544.99 KiB)`；仅既存 chunk>500kB 与 dynamic/static import 复用警告，无新错误 |
| 5 | `git status --porcelain`（根） | 0 | 跟踪改动仅治理件 `M AGENTS.md`／`M docs/handoff/HANDOFF.md`／类型变更 `T USER_MODEL_OVERRIDE.md`；untracked 为治理迁移件＋`docs/review/CODE_REVIEW_DEV-09.md`＋整包 `mobile/`；`src/`、`api/`、`public/`、`index.html`、`vite.config.ts`、`tsconfig.json`、`server.mjs`、`compose.yaml`、`Dockerfile` 均未出现=零根业务改动 |
| 6a | `rg -n "note_private\|notePrivate" mobile/src mobile/app` | 0 | 全量 38 命中，逐条归类见下节「隐私白名单核验」；`conflicts.tsx`／`find.tsx` 无原始私密文本展示 |
| 6b | `rg -n "notePrivate\|note_private\|summary\|notePublic" "mobile/app/(tabs)/find.tsx"` | 0 | 仅 `find.tsx:132 {item.summary ?? '—'}`；无 `notePrivate` 命中=P2-3 已修 |
| 7 | `git check-ignore -v mobile/.env` | 0 | `mobile/.gitignore:34:.env	mobile/.env`（忽略生效） |
| 8 | `git status --porcelain --ignored mobile` | 0 | `!! mobile/.env`／`!! mobile/.expo/`／`!! mobile/node_modules/` 均 ignored；`?? mobile/`（整包未提交）；无 `.env.local` 实体 |
| 9 | `rg -n "service_role\|SERVICE_ROLE\|sb_secret\|SECRET_KEY" .`（排除 node_modules/dist） | 0 | 仅禁令注释与规划文档文字（`AGENTS.md`/`README.md`/`docs/sop`/旧交接等），无真实密钥值 |

## 隐私白名单核验（#6a 逐条归类）

| 命中位置 | 类型 | 判定 |
|---|---|---|
| `mobile/src/db/schema.ts:84,271` | 本地库 schema／列名 | 白名单（repository/DB 层） |
| `mobile/src/domain/types.ts:68,192,277` | 类型定义＋「永不进公开 payload」注释 | 白名单 |
| `mobile/src/domain/mapping.ts:80,100` | 行↔域映射 | 白名单（mapping） |
| `mobile/src/features/queries.ts:17,97,128,170,300` | 查询选列/组装；:300 仅进本地搜索 haystack（内存过滤，不渲染） | 白名单（数据层） |
| `mobile/src/features/recordActions.ts:27,123` | 写库 | 白名单（写路径） |
| `mobile/src/features/form.ts:9` | 表单类型 | 白名单 |
| `mobile/src/sync/supabaseTransport.ts:106` | 同步行组装（不出 payload，见 mapping 白名单） | 白名单 |
| `mobile/src/**/__tests__/*`、`mobile/src/features/__tests__/*` | 测试 | 白名单（测试） |
| `mobile/app/entry/[id].tsx:47,81,100,111,154,220,229,232` | 记录详情编辑页读写 | 白名单（详情编辑） |
| `mobile/app/(tabs)/record.tsx:43,159,189,268` | Record 表单输入/写库 | 白名单（写路径） |
| `mobile/app/ai-confirm.tsx:89` | `notePrivate: transcript` 写库（非展示） | 白名单（写路径） |
| `mobile/app/conflicts.tsx:130` | 仅 `parts.push('🔒 私密感受')` 占位符，**不输出原文** | 合规（P2-2 已修） |
| `mobile/app/(tabs)/find.tsx` | 零命中 | 合规（P2-3 已修） |
| `mobile/app/place/[id].tsx:149` | `entry.summary ?? entry.notePrivate ?? '—'` 地点时间线回退展示原文 | **P2 观察 O-1（本轮回工声明 scope 外，留 TM 判定）** |

## 无真凭据抽查

- `mobile/.env` 仅 3 键：`EXPO_PUBLIC_SUPABASE_URL`、`EXPO_PUBLIC_PUBLISHABLE_KEY`（publishable 客户端公开键）、`EXPO_PUBLIC_WEB_BASE_URL`；**无 service_role／secret key／JWT 形态凭据**。
- `mobile/.env` 已被 `mobile/.gitignore:34` 忽略、未入库（#7/#8）；无 `mobile/.env.local` 实体。
- 全仓 `rg service_role/sb_secret/SECRET_KEY` 仅命中禁令注释与文档文字，无真实值。
- 结论：无真凭据落仓，符合红线。

## Bug 表

| Bug ID | Priority | Stage P0 Blocking? | Repro | Status | Current Task | 备注（截图/日志一句） |
|---|---|---:|---|---|---|---|
| （无 blocking） | — | — | — | — | TASK-DEV-09 | 本轮无 P0/P1 bug；P2-2/P2-3 返工已实证闭环 |

## QA 观察（非阻塞，留 builder/TM 收尾）

- O-1｜`mobile/app/place/[id].tsx:149` 地点时间线在 `summary` 为空时回退显示 `entry.notePrivate` 原文。与 CODE_REVIEW_DEV-09 的 P2-3（find 列表页泄私密感受）同族，但属地点详情页、且不在本轮回工声明的 conflicts/find scope 内，故不判 blocking、不擅自扩围；建议 TM 明确口径：地点时间线是否属「详情编辑」白名单，否则改 `entry.summary ?? '—'`。
- O-2｜CODE_REVIEW_DEV-09 的 P1-1（`ai-confirm.tsx` load 无 try/catch＋无 Loading/Error）、P1-2（新地点缺 area）为建议项、非 blocking，本轮未改；留后续 Task。
- O-3｜`ScreenPlaceholder.tsx` 零引用（P2-1），本轮未处理，归 backlog。
- O-4｜本轮为工程静态验证（typecheck/test/lint/根 build/git/rg/Secret），无真机/EAS 用例；真机截图由 TM 另做，QA 不代宣称真机结论。

## 真机QA会话能力预检结果（本轮不适用）

> 本轮为工程静态验证，无真机/EAS 用例；按 qa 卡「Mac 预检不代 Android/iPhone 验收」，不填预检、不宣称真机能力。

- 最终结论：`NOT_VERIFIED`（真机验证由 TM 另做）
- 是否允许进入正式真机QA：N/A（本轮非真机会话）

## Fix Attempt Fingerprint

- Task ID: TASK-DEV-09
- Root Cause Hypothesis: 无 blocking 代码缺陷。typecheck/test/lint/根 build 全 0；conflicts/find 私密展示返工实证闭环；git/Secret 抽查干净。
- Approach: 不修（QA 不改代码）；O-1～O-3 留 builder/TM 收尾。
- Files Changed: 无业务代码改动（仅 QA 新增本报告 `docs/qa/BUGS_DEV-09.md`）。
- Verification: 见执行证据表 #1–#9、隐私白名单核验、无真凭据抽查小节。
- Failure Reason: 无（P0/P1 全过）。
- Difference From Previous Attempt: 含隐私返工轮（P2-2/P2-3），首次返工后 QA。

> Attempt ID / Dispatch ID / Model-Backend 系字段 2.0 已废弃，不填（模型轨迹记账本）。
