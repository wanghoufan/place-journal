# CODE REVIEW

- Task: TASK-DEV-07 Sync pull＋冲突裁决本地段（mock 远端）
- Commit:（未给；以工作区 `mobile/src/sync/merge.ts`、`conflicts.ts`、`pull.ts`＋`__tests__/pull.test.ts`、`__tests__/conflicts.test.ts` 现状为准）
- Reviewer: code-reviewer（本窗口直派）
- Result: 过，不打回（P0=0，P1=0；P2/P3 进 backlog，留 QA/后续 Task）

> 基线：`DEV_BASELINE=PRODUCT_PLAN_V1.5`。

## P0 / P1 Findings

- 无。P0=0，blocking P1=0。
- outbox 非空守卫口径一致：`pull.ts` 以 pending/claimed 跳过，不含 parked——与 TM 已认口径“parked 不永久阻塞 pull”一致；删除语义按实体 delete 标记兜底，parked delete 防复活已覆盖。
- dirty 不覆盖：与 Web `respectFreshEdits` 同口径；dirty 一律不覆盖。
- revision/base 更新：clean 且远端更新才覆盖推进，相等不动。
- 删除不复活：本地 delete 标记行远端同名不落盘；远端缺失不删本地行。
- 冲突落库＋双向裁决：分叉登记 open 冲突、本地保留；`take_remote`/`keep_local` 单事务落盘，不触网。
- 超时：整轮计时默认 30s 可配，超时不落盘；owner 门禁先行。
- 无真网、无 Secret；未碰根业务/治理。

## P2 / P3 Backlog Findings

- P2-1｜open 冲突远端快照不变旧：去重命中后新远端快照不刷新。建议后续更新快照或落文档定义。
- P2-2｜`DELETE_OP_BY_KIND` 无 `dimension` 映射：维度删除无兜底，需补 kind 或文档明确“维度不删”。
- P2-3｜`ConflictEntityKind` 含 `media/share` 但裁决不支持：建议收窄类型或补支持＋单测。
- P2-4｜合并性能 N+1：V1 可接受，后续可预取优化。
- P2-5｜测试缺口：keep_local 缺失分支、白名单列过滤、多表同快照等建议后续补。
- P3-1｜移动端只用 revision 不用 updated_at：有意的正确偏离，建议注释留一句。
- P3-2｜`demo=0` 补值行为正确，建议注释说明意图。
- P3-3｜`withTimeout` 定时器未 unref：无实质影响，仅记录。

是否打回：否。可进 QA。
