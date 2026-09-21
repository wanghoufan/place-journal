
# BUGS｜TASK-QA-DEV-16C

- 日期/任务名：2026-09-22 / TASK-QA-DEV-16C 回归
- 范围：mobile 16C（画廊筛选/按地点、Find 自然语言、导出、主题、AI 探针）
- 执行约束：只读业务代码并亲手执行命令；QA 仅写入本报告，未修改业务代码，未 commit/push。

## BUGS

| Bug ID | Priority | Stage P0 Blocking? | Repro | Status | Current Task | 备注（截图/日志一句） |
|---|---|---:|---|---|---|---|
| — | — | — | — | 未发现 | TASK-QA-DEV-16C | 自动化回归全绿，无新增缺陷 |

## 回归命令与结果

| 检查项 | 命令 | 结果 |
|---|---|---|
| TypeScript 类型检查 | `npm --prefix mobile run typecheck` | PASS，退出码 0 |
| Jest 全量回归 | `npm --prefix mobile test` | PASS，41 suites / 369 tests 全部通过，0 failed |
| 工作树核查 | `git status --porcelain` | PASS，退出码 0；未出现本 QA 报告之外的 QA 写入 |

## 16C 范围核对

- 画廊筛选/按地点：`queries` 增量测试通过，覆盖父标签展开、任一标签筛选、按地点分组排序及统计。
- Find 自然语言：`search` 增量测试通过，覆盖预算、星级、标签维度、中文数字、结构化过滤、文本兜底及双视图数据。
- 导出：`export` 增量测试通过，覆盖 JSON 全量字段、空库、文件名、CSV 列序/BOM、RFC4180 转义和日期排序。
- 主题：`theme` 增量测试通过，覆盖三主题、调色板字段、合法值回退、持久化键。
- AI 探针：`aiProbe` 增量测试通过，覆盖未配置、已配置、未部署、网络异常、超时、空包探针及成功状态。
- 版本号/查询补充：`format.test.ts` 与 `queries.test.ts` 各新增 3 个用例并全部通过。
- 增量口径：新增 4 个测试文件 38 个用例，既有两个测试文件新增 6 个用例；合计 44 个纯增量，369 = 325 + 44。

## 越界核对

- 业务改动均位于 `mobile/` 范围内。
- 未发现 `mobile/android/`、包名、scheme、redirect 或根 Web `src/` 改动。
- 未发现 secrets、Token 或 `service_role` 写入。
- 工作树中另有既存 `docs/review/CODE_REVIEW_DEV-16C.md` 与用户作业提交材料 2 文件；本轮未修改、未纳入业务回归范围。
- 未执行 commit/push。

## 真机QA会话能力预检结果（NOT_VERIFIED）

- 日期/任务名：2026-09-22 / TASK-QA-DEV-16C
- session ID：—
- 模型精确ID：—
- Runtime：—
- 原生CUA是否实际注入：未执行真机 CUA 预检
- 可用工具精确名称：—
- CLI备用入口是否存在：未执行
- Orca Runtime（`orca status --json` 实时结果）：未执行
- 能力（`orca computer capabilities --json` 实时结果）：未执行
- 权限（`orca computer permissions --json` 实时结果）：未执行
- 读屏结果：NOT_VERIFIED
- 截图结果：NOT_VERIFIED
- 点击并恢复结果：NOT_VERIFIED
- 输入并清除结果：NOT_VERIFIED
- 滚动及可见位移结果：NOT_VERIFIED
- 界面恢复确认：NOT_VERIFIED
- 最终结论：NOT_VERIFIED
- 原始错误摘要：本次任务仅执行本地静态检查与自动化回归，未启动真机 QA session。
- 是否允许进入正式QA：NO

## Fix Attempt Fingerprint

- Task ID: TASK-QA-DEV-16C
- Root Cause Hypothesis: —（本轮为回归验证，未发现新增缺陷）
- Approach: 只读核对 16C 相关范围，执行 typecheck、全量 Jest、工作树核查，并核验 369 = 325 + 44 增量口径。
- Files Changed: 仅新增本文件；未修改业务代码。
- Verification: typecheck PASS；41 suites / 369 tests PASS；44 个测试纯增量核对通过；越界路径核对通过；真机 NOT_VERIFIED。
- Failure Reason: —
- Difference From Previous Attempt: 本轮完成 16C 画廊/Find/导出/主题/AI 探针回归；真机段仍未执行。

## 结论

**PASS（本地自动化回归）**；**真机：NOT_VERIFIED**。未发现 P0/P1 阻断缺陷。
