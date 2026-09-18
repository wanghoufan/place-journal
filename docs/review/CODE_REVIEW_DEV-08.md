# CODE REVIEW

- Task: TASK-DEV-08 真网接线（gateway/supabaseGateway/supabaseTransport/supabasePull/base64/nativeSync/fakeSyncGateway＋测试）
- Commit: 工作区现状（未提交改动不评审；根业务/治理未动）
- Reviewer: code-reviewer（本窗口直派）
- Result: 过（P0=0；P1 意见 2 条建议改，不阻断收工；P2 记 backlog）

> Dispatch / Evidence ID 系字段 2.0 已废弃，不填。

## P0 / P1 Findings

- P0（无）：
  - expected-revision 条件＋0 行判冲突：首推 INSERT→23505 重放校准→条件 UPDATE→0 行落冲突且本地标 conflict、当 op 完成，对齐 Web 口径；网关条件为 id＋revision，无普通 upsert 覆盖核心实体。PASS。
  - onConflict 键与 Web 一致：`entry_id,tag_id`、media/share_snapshots 的 `owner_user_id,client_id`、`snapshot_id,client_id`，测试已断言。PASS。
  - ArrayBuffer 上传＋失败语义：纯函数解码（atob 优先＋手写回退，Hermes 可用）；网关传 ArrayBuffer body；双路径上传、任一步失败删本轮已传对象、保留本地文件、不标 synced。PASS。
  - 白名单无泄漏：分享 payload 仅 7 白名单字段，lat/lng/transcript/私密感受不进 payload；places/entries 云行私密字段属 RLS＋owner 行，非公开 payload，不违规。PASS。
  - 删除 id+owner：删除路径均带 `owner_user_id`；行不存在视为目的达成。PASS。
  - 分页：按 id 升序 range，不足一页即停；fake 同语义；三页＋错误抛错＋merge 复用已覆盖。PASS。
  - 无真凭据/无真网调用：凭据只来自 `EXPO_PUBLIC_*`，未配置抛错不触网；fake 无凭据不触网；`.env.example` 仅占位。PASS。
  - 未碰根业务/治理：改动仅 mobile 新增；`PRODUCTION_DB_MIGRATION=0`。PASS。
- P1-1（建议，不阻断）：条件 UPDATE 未附 `owner_user_id` 过滤，当前依赖 RLS 做归属隔离。跨 owner id 碰撞时 0 行→误判冲突而非直接拒绝。建议后续在调用侧或网关加 owner eq（需先确认 Web 口径）。
- P1-2（建议，不阻断）：`uploadFile` 对 `exists` 消息做兼容分支，但网关丢弃 Storage 错误码/状态。真桶冲突时行为依赖文案匹配。建议回传 code/status 按码判定。

## P2 / P3 Backlog Findings

- P2-1：`base64.ts` 注释“非法字符视为 0”与实现跳过不一致，改一句注释即可。
- P2-2：拉取按表串行，数据量大时可考虑并发＋单表失败重试归属，当前语义正确。
- P2-3：`data ?? null` 空数组保留，0 行判定正确；删除 0 行=目的达成口径一致，无改动。
