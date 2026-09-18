# CODE REVIEW

- Task: TASK-DEV-06 Sync push 本地段（DAG 依赖/outbox 认领/重试停放/超时，mock transport）
- Commit: 工作树未提交（`mobile/` 为 untracked 新增；HEAD=`61a8324`，业务根 `src/` 无改动）
- Reviewer: code-reviewer（本窗口直派）
- Result: 过（不打回，可进 QA；附 P2/P3 非阻塞 backlog）

> Dispatch / Evidence ID 系字段 2.0 已废弃，不填。

## P0 / P1 Findings

- P0/P1：无。本轮对照 PRODUCT_PLAN_V1.5（Sync push：DAG 依赖/P0-01、认领释放、重试5次停放24h、分段超时、推拉解耦、owner 阻断）逐项通过：
  - DAG：父成功才放子；父失败/partial 时子 `release` 回 pending 且 `attempts` 不计；缺父/成环抛 `PushDagError` 且发送前校验、零发送，测试覆盖缺父归还、成环归还、历史父续跑。
  - 认领顺序：固定 `releaseStaleClaims`→`claim`，测试显式断言调用顺序；陈旧锁恢复后本轮认领处理。
  - attempts/停放：失败走 `outbox.fail`，5 次转 `parked`；测试跑满 `MAX_ATTEMPTS` 后停放且不再认领/发送；阻塞路径用 `release` 不计失败。
  - 超时可配：`DEFAULT_PUSH_CONFIG` 单 op 30s＋整轮 90s，`Partial<PushConfig>` 覆盖；单 op 超时转失败可重试，整轮超时归还未处理 claimed。
  - mock/真接线边界：`transport.ts` 明确声明 mock 本地段、真 Supabase 接线留后续 Task；dispatcher 只依赖 `PushTransport.send`，无真网调用；mock 覆盖 ok/retry/timeout/partial 四结局。
  - owner 阻断：`assertOwnerForSync` 置于认领/发送之前，mismatch/unbound 抛错，零发送、行不动。
  - 红线：无 Secret/token 入库入日志；`last_error` 仅存结局＋步骤摘要；未碰根业务 `src/`、治理 docs。

## P2 / P3 Backlog Findings

- P2-1（鲁棒性，非阻塞）：`payloadFromRow` 内 `JSON.parse(row.entity_ids)` 无 try-catch，与 `parseDependsOn` 的容错风格不一致。建议后续与真接线 Task 一并加 corrupt 行停放/报错语义。
- P2-2（取消语义，非阻塞）：`withTimeout` 为 `Promise.race` 计时，不取消底层 transport 请求。mock 阶段无害；真实现接入后靠幂等键校准，建议在真接线 Task 补 AbortSignal。
- P3-1（时钟口径，非阻塞）：整轮超时用可注入 `now`，而 `releaseStaleClaims()` 用墙钟 `nowIso()`。单机语义一致，建议后续统一注入或注释记一句。
