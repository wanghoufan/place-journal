# BUGS

- Task: TASK-DEV-02（Foundational 合同矩阵，SDD T012–T013 / PRODUCT_PLAN_V1.5 RF-03 合同门禁）
- QA 通道/Runtime: opencode 本窗口直驱（用户指定模型，经 opencode 通道执行；亲手执行命令，非只读）
- Node/npm: 首次用系统默认 node `v24.19.0`／npm `11.17.0`；复跑用 AGENTS 约定 workbuddy node `v22.22.2`（`/Users/zzymima0000/.workbuddy/binaries/node/versions/22.22.2-3/bin/node`，注：约定路径为 `…/22.22.2-2`，实际目录为 `-3`），两轮结果一致
- 时间: 2026-09-18 14:05–14:20
- 范围: ① mobile 内 `npm run typecheck`、`npm test`（含 mapping.ts 单测存在性/结果）；② 根 `npm run build` 回归；③ mobile Secret 抽查、根 `git status` 业务改动核查。真机/Storage/RPC 实测不在本轮（属 T062/T077/T111）。
- **Verdict: PASS — 0 blocking bug（P0=0／P1=0）＋0 P2＋1 条非阻塞 QA 观察（mapping.ts 无独立测试文件，见下）。**

## 执行证据（独立执行，命令＋exit 码＋关键行）

| # | 命令（工作目录） | Exit | 关键输出 |
|---|---|---:|---|
| 1 | `npm run typecheck`（mobile/） | 0 | `tsc --noEmit`，无任何输出（0 错）。系统 node `v24.19.0` 与 workbuddy `v22.22.2` 两轮均 0 |
| 2 | `npm test`（mobile/） | 0 | `PASS __tests__/domainContract.test.ts`＋`PASS __tests__/appConfig.test.ts`；`Test Suites: 2 passed, 2 total`；`Tests: 14 passed, 14 total`；`Time: 0.311s`（v24）／`1.353s`（v22） |
| 3 | `npm run build`（根） | 0 | `tsc -b && vite build`；`✓ 108 modules transformed`；`✓ built in 1.25s`；PWA `precache 13 entries (544.99 KiB)`；仅有既存 chunk>500kB 与 dynamic/static import 复用警告，无新错误 |
| 4 | Secret 抽查（mobile/ 内，排除 node_modules/package-lock） | 1（无命中） | `service_role\|sb_secret\|sbp_\|sk-…\|eyJ….\|SUPABASE_SERVICE_ROLE_KEY` 等模式 0 命中；`.env*` 仅 `mobile/.env.example`，字段全 `EXPO_PUBLIC_*` 且值留空；无 `service_role/setSession/AsyncStorage/code_verifier` 业务命中 |
| 5 | `git status --short -- src/ api/ supabase/`（根） | 0（空） | 根业务目录无改动。`git status --short -- mobile` 仅 `?? mobile/`（整包 untracked）；跟踪文件被改仅治理件 `AGENTS.md`/`docs/handoff/HANDOFF.md`/软链 `USER_MODEL_OVERRIDE.md`，与 builder 无关 |

### mapping.ts 单测存在性（本轮重点项）

- 无独立 `mapping.test.ts`；`mobile/src/domain/mapping.ts` 的纯函数由 `mobile/__tests__/domainContract.test.ts`（describe `domain contract: row mapping` / `share whitelist` / `public_share_read RPC`）覆盖。
- 已覆盖且 PASS：`placeToRow`、`entryToRow`、`mediaToRow`（含无 `remotePath` 时 throw 守卫）、`shareSnapshotToRow`、`shareItemToRow`、`shareItemToPayload`（7 白名单键＋坐标隐藏）、`publicShareToSnapshot`（嵌套映射＋kind 不匹配返 null）。
- 未覆盖（观察，非阻断）：`placeFromRow`、`entryFromRow`、`dimensionToRow/FromRow`、`tagToRow/FromRow`、`mediaFromRow`、`placeCoordPrecision` 无直接断言。
- 结论：T013 对应映射测试**存在且 14/14 PASS**；文件命名/覆盖边界问题记入观察，不打回。

## Bug 表

| Bug ID | Priority | Stage P0 Blocking? | Repro | Status | Current Task | 备注（截图/日志一句） |
|---|---|---|---:|---|---|---|---|
| （无） | — | — | — | — | TASK-DEV-02 | 本轮无 P0/P1/P2 bug |

## QA 观察（非阻塞，留 builder/TM 收尾）

- O-1｜mapping.ts 测试位置与覆盖边界：无独立 `__tests__/mapping.test.ts`，映射测试寄居 `domainContract.test.ts`；反向映射（`*FromRow`）与 `placeCoordPrecision` 暂无断言。当前 14/14 PASS，不阻断；建议 T014+ 补反向映射/默认值单测，或明确命名约定。
- O-2｜Node 版本约定：AGENTS.md 记 `…/22.22.2-2/bin/node`，实际机器目录为 `22.22.2-3`。本轮两版本均 PASS，不影响结论；建议 neat-freak 收尾校正路径或改为 `current` 软链引用。
- O-3｜CODE_REVIEW_DEV-02 遗留 P2-5（`publicShareToSnapshot` 缺扁平结构兼容）属 T096+ 分享任务，本轮不在范围，维持 backlog。
- O-4｜根 `src/lib/sync.ts` L99-100 注释含 `visit_date` 与实际 8 键不符（CODE_REVIEW P3-1），非本轮范围，维持建议。

## 真机QA会话能力预检结果（本轮不适用）

> 本轮为工程静态验证（typecheck/test/根 build/Secret/git），无真机/EAS/Storage/RPC 用例；按 qa 卡“Mac 预检不代 Android/iPhone 验收”，不填预检、不宣称真机能力。

- 最终结论：`NOT_VERIFIED`（真机/Storage/RPC 留 T062/T077/T111）
- 是否允许进入正式真机QA：N/A（本轮非真机会话）

## Fix Attempt Fingerprint

- Task ID: TASK-DEV-02
- Root Cause Hypothesis: 无代码缺陷需修。typecheck/test/根 build 全 0，Secret/git 抽查干净。
- Approach: 不修（QA 不改代码）；观察项留收尾。
- Files Changed: 无业务代码改动（仅 QA 新增本报告）。
- Verification: 见执行证据表 #1–#5 及 mapping.ts 单测小节。
- Failure Reason: 无（P0/P1 全过）。
- Difference From Previous Attempt: N/A（本轮首次 DEV-02 QA）。

> Attempt ID / Dispatch ID / Model-Backend 系字段 2.0 已废弃，不填（模型轨迹记账本）。
