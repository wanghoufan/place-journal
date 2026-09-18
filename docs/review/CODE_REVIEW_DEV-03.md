# CODE REVIEW

- Task: TASK-DEV-03 Foundational 本地库（SQLite forward-only＋事务仓库＋outbox/meta/conflicts，基线 PRODUCT_PLAN_V1.5）
- Commit:（本评审只读不执行，未核验 git；以工作区现状为准）
- Reviewer: code-reviewer（本窗口直派）
- Result: 打回＋改法（P1 两处数据正确性必改；其余 P2 可后续 Task 跟进）

> 审查范围：mobile/src/db/（database/schema/migrations/index/repository）、mobile/src/sync/outbox.ts、meta.ts、mobile/src/test/ 适配器与 4 个测试文件。对照 mobile/src/domain/types.ts、PRODUCT_PLAN_V1.0.md（R-05、forward-only、outbox/revision/dirty guard、PRODUCTION_DB_MIGRATION=0）。

## P0 / P1 Findings

- P1-1｜repository.ts `writeCoreEntity` revision 可倒退：`((row.revision ?? existing?.revision ?? 0) + 1)`——调用方若传入过期快照的 `row.revision`（如 DB 已是 5，传入 1），结果为 2，小于当前值，破坏 revision 单调性（R-02 乐观锁前提）。改法：取 `Math.max(row.revision ?? 0, existing?.revision ?? 0) + 1`；补单测（DB revision=5 时传旧 revision=1，期望 6）。
- P1-2｜同函数 `base_revision` 会被静默清空：新行/更新行若入参不带 `base_revision`，`if (!('base_revision' in next)) next.base_revision = null` 直接置 null，把已同步行（如 rev=7/base=7）的云端基线抹掉，后续 expected-revision UPDATE 无 base 可发。改法：未显式传入时沿用 DB 现有 `base_revision`（新行才为 null）；补单测（markSynced 后再 saveCoreEntity 不带 base，期望 base 保持 7）。
- P1-3｜删除无原子 helper：`remove()` 单语句删除且不入队，若业务直接调用即出现“删了本地、无 op 上云”，违背 T040「实体写入与 outbox 同事务」原子边界（删除路径同样适用）。改法：二选一——① 新增 `removeWithOutbox(table, id, op)` 同事务删除+入队并让普通 `remove` 仅限测试/种子使用（注释标明），② 或在注释中明确删除原子路径留待后续 Task 并给出任务号。本 Task 含 T040，默认按①改。

## P2 / P3 Backlog Findings

- P2-1｜双停放机制口径分叉：outbox 表 `status='parked'`（无自动过期）与 meta `parked_ops` 映射（24h TTL 自动清理）并存，键（op_id vs opKey 字符串）与过期语义不一致，毒丸 op 可能一边过期一边仍 parked。建议后续 Task 收敛为单一事实源（以 outbox 为准，meta 仅作展示缓存）或写明两者分工。
- P2-2｜outbox `claim()` 不自动释放过期 claimed，需调用方先调 `releaseStaleClaims`；建议在 dispatcher 层固定调用顺序并在注释中写明，或 claim 内先释放再认领。
- P2-3｜outbox `complete()` 无状态校验，可误删从未认领的 pending op；建议仅删除 claimed 态（或至少注释说明 misuse 风险）。
- P2-4｜outbox `insertOutboxOp` 未校验 `kind ∈ OUTBOX_KINDS`，非法 kind 靠 SQLite CHECK 报错（repository 测试即依赖此路径）；建议入队前显式校验，转为领域错误。
- P2-5｜meta `acquireSyncLock` 为 check-then-set 非原子，并发双上下文可同时拿到锁；单进程移动端风险低，建议加事务或注释说明单线程假设。
- P2-6｜migrations `currentSchemaVersion()` 名为只读实则写库（补账本/回写 user_version）；建议改名或注释标明副作用。
- P2-7｜index.ts `initializeDatabase` 中 `setMeta(db_version)` 在迁移事务之外，极端失败时版本标记与账本不一致；建议注释或包入收尾步骤。
- P2-8｜repository 无 entry_tags/share_items 写入 helper（`pkOf` 仅支持单主键表），标签关联/分享落盘路径缺失；若属后续 Task 范围，记一笔任务号即可。
- P2-9｜测试缺口对应 P1：revision 倒退、base 沿用、remove+outbox 原子三项无覆盖；remote_path（本地）vs storage_path（云端）映射、share payload 扁平化往返建议在 mapping Task 补契约测试。
- P3-1｜db/index → sync/meta 的 imports 方向（db 依赖 sync）与 outbox/repository 方向相反，type-only 无运行时环但分层略乱；收尾可注明分层约定。

通过项（记录结论）：forward-only（MIGRATION_001 纯 CREATE IF NOT EXISTS、无 DROP/删数据；降级抛 MigrationDowngradeError 且不建表；失败单版事务回滚）符合 R-05；事务原子（saveEntityWithOutbox 同事务写实体+入队，异常回滚）符合 T040；outbox 认领/重试/停放字段（seq/op_id/kind/entity_id/entity_ids/depends_on/status/attempts/last_error/claimed_at/parked_at，MAX_ATTEMPTS=5、PARK 24h、CLAIM TTL 2min）与 Web 语义对齐；dirty 口径（revision≠base 或 sync_status 非 synced）与 listDirty SQL 一致；PRAGMA（FK ON/WAL/busy_timeout，不用 synchronous=OFF）符合 R-05；列白名单拼 SQL 无注入面；全审查对象无网络/Auth 实现、无 Secret；PRODUCTION_DB_MIGRATION=0（仅本地 SQLite，无云端 migration）。

## 返工复验（R2）
- P1-1 关：repository.ts:116 已按改法落地；用例 DB=5 传旧 1 得 6 正确。
- P1-2 关：repository.ts:126 沿用 DB 值逻辑落地；用例 markSynced 7 后 base 保持正确。
- P1-3 关：`removeWithOutbox` 同事务删除+入队落地，`remove` 已限测试/种子用；用例正确。
- 总体：放行（mobile 外 tracked 改动仅三处治理交接文件，无业务文件被顺手改）。
