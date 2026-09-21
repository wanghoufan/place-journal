# BUGS｜TASK-QA-DEV-16B

- 日期/任务名：2026-09-22 / TASK-QA-DEV-16B 回归
- 范围：mobile 详情页 16B（`moveEntry` 单事务、分享级联撤销、记录编辑改名/搬家、灯箱）
- 执行约束：只读业务代码并亲手执行命令；QA 未修改业务代码，未 commit/push。

## BUGS

| Bug ID | Priority | Stage P0 Blocking? | Repro | Status | Current Task | 备注（截图/日志一句） |
|---|---|---:|---|---|---|---|
| — | — | — | — | 未发现 | TASK-QA-DEV-16B | 自动化回归全绿，无新增缺陷 |

## 回归命令与结果

| 检查项 | 命令 | 结果 |
|---|---|---|
| TypeScript 类型检查 | `npm --prefix mobile run typecheck` | PASS，退出码 0 |
| Jest 全量回归 | `npm --prefix mobile test` | PASS，37 suites / 325 tests 全部通过，0 failed |
| 工作树核查 | `git status --porcelain` | PASS：未出现 QA 写入以外的新增业务变更；未涉及 `mobile/android/`、包名/scheme |

## 16B 范围核对

- `moveEntry`：单事务覆盖记录换归属、媒体换归属、outbox 入队及空地点清理；回滚用例通过。
- 分享级联撤销：删除记录前撤销分享，撤销幂等用例通过。
- 编辑改名/搬家：详情页编辑分支及地点改名、搬家提示覆盖；相关查询与动作测试通过。
- 灯箱：灯箱测试通过；详情页灯箱/设封面相关代码通过类型检查。
- 增量口径：全量 Jest 当前为 325/325 PASS；评审记录中的 16B 业务增量为详情页、`recordActions`、`shares`、`queries`及其对应测试。

## 越界核对

- 未发现 `android/`、包名或 scheme 改动。
- 未发现 builder 业务代码之外的越界业务改动。
- `USER_MODEL_OVERRIDE.md` 当前有既存治理变更，评审记录已注明其属于 TM 分工表变更，不计入本次 builder 业务范围；QA 未修改。
- 未改 Web 根业务代码，未触碰用户作业提交材料。

## 真机QA会话能力预检结果（NOT_VERIFIED）

- 日期/任务名：2026-09-22 / TASK-QA-DEV-16B
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

- Task ID: TASK-QA-DEV-16B
- Root Cause Hypothesis: —（本轮为回归验证，未发现新增缺陷）
- Approach: 只读核对 16B 相关业务代码与 diff，执行 typecheck、全量 Jest、工作树核查。
- Files Changed: 仅新增本文件；未修改业务代码。
- Verification: typecheck PASS；37 suites / 325 tests PASS；越界路径核对 PASS；真机 NOT_VERIFIED。
- Failure Reason: —
- Difference From Previous Attempt: 本轮完成 325 tests 全量回归；真机段仍未执行。

## 结论

**PASS（本地自动化回归）**；**真机：NOT_VERIFIED**。未发现 P0/P1 阻断缺陷。
