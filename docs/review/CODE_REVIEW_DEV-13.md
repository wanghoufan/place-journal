# CODE REVIEW

- Task: TASK-DEV-13 P2 大扫除（Find 量词聚合、Tags 计数、KIND 文案、budget 守卫、slug 注释、空目录删除）
- Reviewer: code-reviewer（本窗口直派，只读不改）
- Result: 初审打回（diff 范围证据对不上＋budget 守卫漏做）→ 返工后 R2 放行（四项逐项复核全过）

## P0 / P1 Findings

- 初审 P1-1（范围证据）：已闭环——slug 注释/shares.ts:46 在位、services 目录已删、KIND 与 Web 一字一致，TM+reviewer 双验。
- 初审 P1-2（budget 守卫漏做）：已闭环——mapping.ts:285 Number.isFinite 守卫＋shares.test.ts:368 断言。
- P0：无。

## P2 / P3 Backlog Findings

- P2-1：tagUsageWithChildren 只聚合直接子，多级嵌套后续加三级用例。
- P2-2：countDistinctPlaces 空 placeId 行为未定义，建议补单测。
- P2-3：扁平兼容分支补嵌套/扁平双单测。
