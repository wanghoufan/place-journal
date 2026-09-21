
# CODE REVIEW

- Task: TASK-DEV-16B（mobile详情页：recordActions moveEntry/setEntryCover/级联撤销分享、shares revokeSharesForEntry、queries countEntriesForPlace/mediaUri、entry/[id]灯箱＋设封面＋改名/搬家编辑＋删除文案；+11单测，324=313+11）
- Commit: 工作树未提交（HEAD=37423bb，`git status`见8文件M：entry/[id].tsx＋queries/recordActions/shares＋3单测＋USER_MODEL_OVERRIDE.md）
- Reviewer: code-reviewer
- Result: 打回（P1×1：USER_MODEL_OVERRIDE.md越界改动必须剥离；余P1×1建议修后再转QA）

## P0 / P1 Findings

- P1（越界，必修）：`USER_MODEL_OVERRIDE.md` 被改（builder行备注"已验pong"＋qa行从codebuddy改回codex/Luna＋版本注释T3）。任务目标纯 mobile 详情页，治理分工表不在范围；且按AGENTS.md"换模型的事用户决策"，builder无权改表。改法：本次提交剥离该文件（`git checkout HEAD -- USER_MODEL_OVERRIDE.md`），qa通道争议另走TM/用户拍板单独立项。
- P1（原子性，建议修）：`moveEntry`（recordActions.ts）分两次落盘——entry经`repo.saveEntityWithOutbox`一次事务，media批量经`db.withTransactionSync`另一次事务。两事务之间崩溃/报错会导致"entry已搬家、media仍旧place_id"的半搬家态（outbox dependsOn也只保序不保原子）。改法：把entry更新与media更新并入同一`withTransactionSync`（参考saveRecord的原子边界注释），或失败补偿说明交QA覆盖断电用例。若坚持现状，至少在注释写明非原子＋QA加一条"第二事务失败"回归。
- 核对通过（不计问题）：搬家语义＝记录+照片一起换归属＋带本地文件重传（`reuploaded`计数＋`upload_media dependsOn entryOp`）＋无本地文件仅改归属标local（单测m2已显式断言）＋搬空老地点`delete_place`＋同地点`moved:false`零副作用；分享撤销幂等（复用`revokeShare`，单测"二次调用返回[]且outbox仍1条"）；`deleteEntry`先撤销后删除（封面反查依赖记录行，顺序对）；`setEntryCover`校验`media.entry_id`归属；`countEntriesForPlace/mediaUri`纯查询无副作用；未碰`mobile/android/`、包名`scheme`、Web根`src/`，越界仅上述override表一项。

## P2 / P3 Backlog Findings

- P2：无本地文件的media搬家后`sync_status='local'`但永不入队`upload_media`，上传器遇到"标local却无本地路径"的行行为未定义（重试打转/报错/跳过？）。建议`sync.ts`上传侧加防线或单测锁定。
- P2：详情页保存走"saveRecord（不带place）＋moveEntry"两次`upsert_entry`（revision+2）。功能对，但云端会收到两条同entry op；确认`sync.ts`去重/折叠能处理，否则合成为一次写。
- P3：`moveCandidates`用字符串`includes`大小写敏感＋截断8条；地点多时搜不到。后续Find统一再优化。
- P3：灯箱`coverIndex`当无封面时`findIndex=-1→Math.max(0,…)=0`，会把第0张下标传给`coverIndex`（若Lightbox据此打"封面"标则误标）。建议无封面传-1/undefined，UI确认一次。

目标/剩P0/下一步：目标16B复核完成；剩P0＝剥离override表越界＋moveEntry原子性定案；下一步转builder返工后进QA（324全绿为返工前基线，返工后重跑）。

## 返工复验（2026-09-21，P1-2＋P1-1）

- 结论：**通过，可转QA**。P1-2已闭环；P1-1确认非builder越界（TM按用户命令改的T3分工表，builder未碰），本次不计builder问题。
- P1-2原子性：`moveEntry`已合一为单个`db.withTransactionSync`（recordActions.ts:199-234）——entry换归属＋outbox、media批量换归属＋upload_media入队、搬空老地点删＋delete_place，同一事务全成/全败；嵌套事务规避理由成立（`saveEntityWithOutbox`自开事务，expo-sqlite不支持嵌套，见repository.ts:177-184），改用内联SQL＋注释说明，合理。
- 内联SQL与仓库语义一致：entry侧`revision+1／sync_status='local'／sync_error=NULL／updated_at`，对照`writeCoreEntity`（repository.ts:119-140）一致；`created_at/base_revision/cover_media_id`未列即保持原值＝语义"沿用DB现值"，一致；fresh-read后`revision+1`即`max+1`，无过期快照风险。media表无revision/sync_error/base_revision列（schema.ts:275-279），不 bump revision 正确；无本地文件行仅改归属标local不入队，沿用初版语义（P2观察项仍有效，不 blocking）。
- 回滚单测：`recordActions.test.ts:309-346`（P1-2单测）mock media UPDATE抛错，断言entry未搬家＋media原样＋outbox零残留＋老地点保留；本文件23/23通过，全仓37套件325/325通过（325=324+1，基线一致）。
- 越界：业务diff仍8文件（entry/[id].tsx＋queries/recordActions/shares＋3单测＋override表）；override表diff系TM的T3治理改动（builder行pong备注＋qa切回codex/Luna＋版本注释），与builder业务无关，提交时TM侧处理即可，builder不背。
- 遗留P2/P3（不 blocking，转QA/后续）：P2无本地文件行标local永不入队上传器行为未定义；详情页保存saveRecord＋moveEntry两次upsert_entry（revision+2）依赖sync去重；P3 moveCandidates大小写/截断8条；灯箱无封面coverIndex=0误标风险。

目标/剩P0/下一步：目标16B返工复验完成；剩P0=0；下一步转QA（325全绿）。
