# BUGS

| Bug ID | Priority | Stage P0 Blocking? | Repro | Status | Current Task | 备注（截图/日志一句） |
|---|---|---:|---|---|---|---|
| UX-01-1 | P1 | NO | 代码检查：记录页/AI 确认页公开理由输入框 | PASS | TASK-QA-UX-01 | `numberOfLines=3`；`TextField` 多行默认行数统一夹在 2–3 行 |
| UX-01-2 | P1 | NO | 代码检查：Gallery 顶部场景 chips 与浏览/布局控制行 | PASS | TASK-QA-UX-01 | `flexShrink: 0` + `minHeight: 46`，覆盖横向 ScrollView 被压扁导致的重叠根因 |
| UX-01-3 | P1 | NO | 代码检查/单测：Gallery 双栏与单栏切换、冷启动读取 | PASS | TASK-QA-UX-01 | `gallery_layout` 写入/读取 `meta`；默认 `grid` 双栏；切换用不同 FlatList key 重挂 |
| UX-01-4 | P1 | NO | 代码检查：Gallery/Find 列表滚动与切 Tab 回访 | PASS | TASK-QA-UX-01 | `flex: 1`、`memo`、稳定回调、窗口化参数、`removeClippedSubviews` 与图片缓存均已覆盖 |

## 真机QA会话能力预检结果（每真机session正式用例前必填，PASS才进正式QA，否则停）

- 日期/任务名：2026-09-22 / TASK-QA-UX-01
- session ID：未执行真机 session
- 模型精确ID：未执行真机 QA
- Runtime：未执行真机 QA
- 原生CUA是否实际注入：未注入；本轮仅执行仓库命令与代码只读检查
- 可用工具精确名称：未执行真机 QA
- CLI备用入口是否存在（Bash→orca computer CLI）：未核验
- Orca Runtime（`orca status --json` 实时结果，禁沿用旧报告）：未核验
- 能力（`orca computer capabilities --json` 实时结果）：未核验
- 权限（`orca computer permissions --json` 实时结果）：未核验
- 读屏结果：未执行
- 截图结果：未执行
- 点击并恢复结果：未执行
- 输入并清除结果：未执行
- 滚动及可见位移结果：未执行
- 界面恢复确认：未执行
- 最终结论：`NOT_VERIFIED`
- 原始错误摘要：本任务范围未包含/未启动真机 session；因此不宣称真机 PASS。
- 是否允许进入正式QA：NO

## 命令回归证据

- `npm --prefix mobile run typecheck`：PASS，exit 0。
- `npm --prefix mobile test`：PASS，42/42 suites、383/383 tests，exit 0。
- `git status --porcelain`：已执行；未发现本轮报告之外的意外写入。工作树中保留任务开始前已有的业务/测试改动及其他未跟踪文件。
- 核383：PASS。
- 越界零改动：PASS；本轮只写入本报告，未修改业务代码，未执行 commit/push。

## Fix Attempt Fingerprint

- Task ID: TASK-QA-UX-01
- Root Cause Hypothesis: 多行输入框原生可见行数未显式约束；横向 chips 行允许收缩；画廊布局偏好与列表渲染边界/窗口化不足。
- Approach: 只读审查本次 UX 改动，执行 typecheck、全量 Jest 与工作树检查。
- Files Changed: 仅 `docs/qa/BUGS_UX-01.md`。
- Verification: typecheck PASS；42 suites / 383 tests PASS；git status 已核对。
- Failure Reason: 真机段未执行，故标记 `NOT_VERIFIED`。
- Difference From Previous Attempt: 本次为 TASK-QA-UX-01 首次回归记录。
