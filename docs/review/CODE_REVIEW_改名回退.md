
# CODE REVIEW

- Task: 地点改名回退修复（src/lib/sync.ts：新增 writeBackIfUnchanged，并发编辑保护）
- Commit: HEAD `14d72e9` ＋ 未提交工作树改动（`git diff -- src/lib/sync.ts`，30+/8-，仅此一业务文件）
- Reviewer: code-reviewer（本窗口）
- Result: 打回＋改法（P1×2，见下；修完可过，无需改方案）

> Dispatch / Evidence ID 系字段 2.0 已废弃，不填。

## P0 / P1 Findings

- P1-1｜changed 判定对 dimensions/tags 失效，标签改名仍会被旧快照覆盖。`writeBackIfUnchanged` 靠 `updatedAt/revision` 比对（sync.ts:157），但 `Dimension`/`Tag` 类型根本没有 `updatedAt` 字段（types.ts:62-63），且 `saveTags` 不 bump revision（idb.ts:167-171 直接 bulkPut），调用方改名也不 bump（TagsPage:50 `{ ...x, name }` 原样回写）。因此标签/维度在推送窗口内被改名时 `cur.revision === snapshot.revision` 恒成立，判定走“没变”分支，旧快照照样盖掉新名——本次要根治的同类 bug 在标签链路上原样保留。改法（二选一）：① `saveTags` 内对与库内不一致的行 `revision+1`（与 savePlace/saveEntry 同口径，推荐）；② 或把 changed 判定改为全字段比对（`JSON.stringify(cur) !== JSON.stringify(snapshot)`），revision/updatedAt 只作快路。places/entries 不受影响（savePlace/saveEntry 已 bump revision，EntryDetail:103 改名链已验证）。
- P1-2｜本地删除发生在推送窗口内会被回写复活。`cur == null`（窗口内用户删了该行：deletePlace/deleteEntry 已删库内行并入队 delete op）时函数落到末尾 `bulkPut([{...snapshot, ...patch}])`（sync.ts:161），把已删除行以 synced 复活；随后 delete op 只删云端，不管本地，本地僵尸行永久残留（pullRemote 只增量合并从不删本地）。改法：一行，在函数头加 `if (!cur) return`（删除意图优先于推送确认；delete op 仍会收敛云端）。

## P2 / P3 Backlog Findings

- P2｜registerConflict 经切换后存在冲突可见性延迟一轮。若推送撞上真冲突且窗口内本地又被编辑，`registerConflict` 的 writeBack 调用无 confirmedRevision（sync.ts:170），changed 时直接 return，本地行保持 local 而不标 conflict（冲突记录本身仍进 meta，listConflicts 可见）。下轮新内容重推会再次撞冲突并标上，自愈但延迟一轮。可接受，建议 QA 覆盖“冲突撞并发编辑”时以 meta 为准不断言行 badge。
- P3｜`upload_media` 回写（sync.ts:448）与 `resolveConflict` 保留本地回写（sync.ts:578）仍是旧快照直写，未切保护。前者 MediaItem 无 revision/版本字段且创建后内容不可变，风险低；后者窗口小（裁决推送期间再编辑才撞）。建议：media 比对 `remotePath/remoteThumbPath/sync` 有变化则跳过；resolveConflict 处复用 writeBackIfUnchanged（confirmedRevision=r.revision）。不阻塞本次。
- P3｜毒丸停放分支（sync.ts:532/535/538）与 pullRemote bulkPut（685-689）未动，正确：前三处读的是失败时刻现行非推送前快照；pullRemote 已有 respectFreshEdits/dirty 双保护，不在本次“推送回写点”范围内，无遗漏。

## 核验结论（逐项）

- 并发窗口推理：成立。快照在 op 开始时读（syncOnce:326/336、ensure*:199/217），回写在 pushEntity（含 fetchRemoteRow＋条件更新＋冲突复查，最多 3 往返；entry 还带 entry_tags 差量读写）之后，窗口真实存在；弱网/超时后台重跑放大。注释与现象（改名变回旧名＋outbox 清空永久丢失）自洽。
- baseRevision 只对齐不盖内容后下轮 expected：正确。changed 时库内新行 `revision = snapshot.rev+1`、`baseRevision = confirmedRevision = 云端刚落盘 revision`，下轮 `eq('revision', confirmedRevision)` 精确命中，不盖名、不造假冲突；多次并发保存同样成立。
- 全部推送回写点切换：places/entries 主链 6 处＋ensure 3 处＋registerConflict 1 处，共 10 处已切，无遗漏（剩余直写点见 P3，均有理由不切）。
- 越界：无。仅 sync.ts 一个文件；无 schema/RLS/触发器改动；无 public 表；无 service_role；无其他角色 docs 改动。`tsc --noEmit` 全绿（EXIT=0）。
- 回归影响：未变分支行为与旧 bulkPut 逐字节一致；已变分支只动 baseRevision。风险集中在 P1-1（tags/dims 保护名存实亡）和 P1-2（删除复活），修完即与设计一致。

目标/剩 P0/下一步：目标=改名回退修复复核；剩 P0=无（P1×2 修完转 QA 并发场景验证）；下一步=builder 修 P1-1＋P1-2 后续 QA 一轮（标签改名撞同步、窗口内删除）。

## 复验（2026-09-20，返工后）

- 范围：`src/lib/sync.ts:159` 加 `if (!cur) return`；`src/lib/idb.ts:107-117` 新增 `contentKey`/`bumpChangedRows`，`saveTags` 对变化行 `revision+1`。`git status` 确认业务改动仅此二文件（另 `docs/model/DISPATCH-LOG.jsonl` 账本一行，无其他业务文件改动）。
- P1-2｜收敛。`writeBackIfUnchanged` 头部 `if (!cur) return` 生效，窗口内删除（deletePlace/deleteEntry/deleteTags 均已删库内行）不再落到末尾 `bulkPut` 复活；delete op 仍独立收敛云端。`registerConflict` 经 `writeBackIfUnchanged` 同样受保护（删后冲突登记不再复活）。通过。
- P1-1｜收敛（选的改法①）。`contentKey` 排除 `revision/baseRevision` 后比对其余全字段——Dimension/Tag 无 `updatedAt` 的缺口被补上。调用方核过：`TagsPage:50` 改名 `{ ...x, name }` 保留旧 revision，内容键变化→`revision+1`，推送回写端 `cur.revision !== snapshot.revision` 能认出窗口内改名，不再走“没变”分支盖旧名；`TagsPage:33/42` 新行无 revision→`0→1`，首推走 INSERT 口径不变；未变化行原样回写不 bump，不通胀 revision。`upsert_tags`（sync.ts:383-407）读 DB 现行行逐行推、逐行 `writeBackIfUnchanged`，与新 revision 口径对齐。通过。
- 越界：无。仅上述二文件；无 schema/RLS/触发器、无 public 表、无 service_role、无其他角色 docs 改动。`tsc --noEmit` 全绿（EXIT=0）。
- 观察项（不阻塞，记一笔）：① 陈旧快照二次 `saveTags`（push 已确认 baseRevision 后、调用方 state 未刷新前又存同内容）会以调用方旧 baseRevision 原样写回，属调用方刷新节奏问题，窗口小；② 窗口内删除若发生在 `upsert_tags` 已读全量（sync.ts:384）之后，该行仍会被 push 到云端一次，随后 `delete_tags` op 删除收敛，多一次 churn、无永久分歧。建议 QA 覆盖“标签改名撞同步、窗口内删除”即闭环。

## 复验结论

- Result: **通过**，转 QA（一轮并发场景：标签改名撞同步、窗口内删除）。
- 分级：P0=0；P1-1/P1-2 均收敛归零；P2（registerConflict 延迟一轮）维持原判；P3 维持原判；新增观察项②记 P3，不阻塞。
