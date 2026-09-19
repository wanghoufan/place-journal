# CODE REVIEW

- Task: TASK-DEV-11 冷启动接线（_layout 启动序列＋auth 相关改动）
- Reviewer: code-reviewer（本窗口直派）
- Result: 过（不打回）

## P0 / P1 Findings

- 无 P0/P1：启动顺序 sweep→recover→监听→冷启动补收一致；无 session 不重用旧 code；P1-2 落定用常量；无真登录；存储口径合规；未碰根业务/治理。

## P2 / P3 Backlog Findings

- P2-1：callback 失败静默吞错，建议后续加 onCallbackError 透出；冷启动不阻断 UI 意图成立，不改。
