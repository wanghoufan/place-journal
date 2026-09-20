
# BUGS

- Task: TASK-QA-改名回退（**只读代码段，无真机**）
- QA: qa（本窗口，只读业务代码＋亲手执行命令；只写本文件，未改业务代码，未 commit/push）
- 日期：2026-09-20
- 分支／基线：分支 `wanghoufan/master`；工作树未提交（`git log` HEAD=`14d72e9`）；审查基线＝`git diff` 工作树（含 `docs/review/CODE_REVIEW_改名回退.md` 的「复验」口径）
- 范围：`src/lib/sync.ts`（`writeBackIfUnchanged` ＋ 10 处回写点）、`src/lib/idb.ts`（`contentKey`／`bumpChangedRows`／`saveTags`）
- **QA 结论：PASS** —— P0=0、blocking P1=0；`tsc --noEmit` EXIT=0；`npm run build` PASS（EXIT=0）；10 处回写点全切、无遗漏旧快照直写（仅 `resolveConflict`／`upload_media` 两处按任务列为除外，已知 P2）；`saveTags` 同内容重存不 bump（实证）；越界零改动（无 `mobile/`／`android/`／包名改动）。非阻塞观察 4 条（O-1～O-4）。
- **未验证边界（NOT_VERIFIED，不冒认）**：① 端到端并发复现（「保存窗口内再改名 → 刷新 → 同步」真实网络时序）——CLI 无法注入真实推送窗口，本轮仅静态＋构建＋逻辑等价复现，端到端交 DV 公社手动清单（见「六」）；② `registerConflict` 并发编辑延迟一轮（P2）未运行时验证；③ `upload_media`／`resolveConflict` 未切保护（P2／P3）未运行时验证；④ 未跑真实 IndexedDB 集成测试（`saveTags` 幂等为内联逻辑等价复现，非 import 真源码）。
- 命令铁律：全部门禁命令单命令单动作、未出仓库根；未启服务、未占端口。

## 一、执行证据（逐条，亲手执行）

| # | 命令 | 结果 | 证据摘要 |
|---|---|---|---|
| 1 | `npx tsc --noEmit` | PASS | `TSC_EXIT=0`，无类型错误输出 |
| 2 | `npm run build`（根） | PASS | `tsc -b && vite build`；`✓ built in 758ms`；`dist/assets/index-D-9n9-9w.js 520.14 kB / gzip 155.21 kB`；`PWA v0.20.5 mode generateSW precache 13 entries (551.11 KiB)`；`BUILD_EXIT=0`；仅既有告警（chunk>500kB、supabase/shares/shareCard 静态+动态双导入），无新增错误 |
| 3 | `git status --porcelain` | PASS | 见「五」：改动仅 `src/lib/idb.ts`／`src/lib/sync.ts`／`docs/model/DISPATCH-LOG.jsonl`（账本一行）＋未跟踪 `docs/review/CODE_REVIEW_改名回退.md` |
| 4 | `git diff --stat` | PASS | `docs/model/DISPATCH-LOG.jsonl \| 1 +`、`src/lib/idb.ts \| 23 +++++--`、`src/lib/sync.ts \| 40 ++++++++--`；3 files changed, 54 insertions(+), 10 deletions(-) |
| 5 | 10 处回写点 `grep` 逐条 | PASS | 见「二」，全部命中 `writeBackIfUnchanged` |
| 6 | 遗留直写点穷举 `grep bulkPut` 逐条定性 | PASS | 见「三」，除任务列明的 P2 外均由「现行行/删除保护/respectFreshEdits」覆盖 |
| 7 | `saveTags` 幂等内联 node 复现 | PASS | 见「四」，同内容重存 revision 不变 |

## 二、10 处回写点逐条核对（全部切换，无遗漏）

口径：`writeBackIfUnchanged` 函数内含 **2 个落盘分支**（`sync.ts:161` 已变分支只对齐 `baseRevision`；`sync.ts:164` 未变分支整行落盘），加 **8 个调用点**，合计 **10 处**，与 code-review「places/entries 主链 6＋ensure 3＋registerConflict 1＝10」口径一致。

| # | 回写点 | 位置 | 实证 |
|---|---|---|---|
| 1 | `writeBackIfUnchanged` 已变分支（只对齐 baseRevision，不盖内容） | `src/lib/sync.ts:161` | `if (confirmedRevision != null && cur.baseRevision !== confirmedRevision) await bulkPut(store, [{ ...cur, baseRevision: confirmedRevision }])` |
| 2 | `writeBackIfUnchanged` 未变分支（整行 `{...snapshot, ...patch}`） | `src/lib/sync.ts:164` | 仅当 `cur` 存在且 `updatedAt`／`revision` 均等才落盘 |
| 3 | `registerConflict` 冲突标记 | `src/lib/sync.ts:173` | `if (localRow) await writeBackIfUnchanged(storeName, localRow, { sync: 'conflict' as SyncStatus })`（旧版为 `localRow.sync = 'conflict'; await bulkPut(...)` 原地改＋直写，已切） |
| 4 | `ensureTagsInCloud` 维度补推 | `src/lib/sync.ts:204` | `if (r.ok) await writeBackIfUnchanged('dimensions', d, { revision: r.revision, baseRevision: r.revision }, r.revision)`（旧 `bulkPut('dimensions',[…])` 已切） |
| 5 | `ensureTagsInCloud` 标签补推 | `src/lib/sync.ts:210` | `if (r.ok) await writeBackIfUnchanged('tags', t, {...}, r.revision)`（旧 `bulkPut('tags',[…])` 已切） |
| 6 | `ensurePlacesInCloud` 地点补推 | `src/lib/sync.ts:225` | `if (r.ok) await writeBackIfUnchanged('places', p, {...sync:'synced'…}, r.revision)`（旧 `bulkPut('places',[…])` 已切） |
| 7 | `syncOnce` `upsert_place` 主链 | `src/lib/sync.ts:336` | `await writeBackIfUnchanged('places', p, { revision, baseRevision, sync:'synced', syncError:undefined }, r.revision)` |
| 8 | `syncOnce` `upsert_entry` 主链 | `src/lib/sync.ts:362` | `await writeBackIfUnchanged('entries', e, {...}, r.revision)` |
| 9 | `syncOnce` `upsert_tags` 维度 | `src/lib/sync.ts:398` | `if (r.ok) await writeBackIfUnchanged('dimensions', d, {...}, r.revision)` |
| 10 | `syncOnce` `upsert_tags` 标签 | `src/lib/sync.ts:404` | `if (r.ok) await writeBackIfUnchanged('tags', t, {...}, r.revision)` |

关键护栏（本次 P1 收敛点，逐条核过）：
- **删除优先（P1-2）**：`sync.ts:159` `if (!cur) return`——窗口内 `deletePlace`／`deleteEntry`／`deleteTags` 已删库内行时，回写直接返回，不再落到末尾 `bulkPut` 把已删行以 `synced` 复活；`delete_place`／`delete_entry` op 仍独立收敛云端。
- **已变判定（P1-1 依赖）**：`sync.ts:160` `if (cur.updatedAt !== snapshot.updatedAt || cur.revision !== snapshot.revision)`——对无 `updatedAt` 的 Dimension／Tag，靠 `revision` 变化判定；配合「四」`saveTags` 对内容变化行 bump revision，标签改名窗口内被改可被认出，不再走「没变」分支盖旧名。

## 三、遗留直写点穷举（除列明 P2 外均已覆盖，无遗漏旧快照直写）

| 位置 | 写法 | 定性 | 依据 |
|---|---|---|---|
| `sync.ts:451` | `bulkPut('media', [{ ...m, remotePath, remoteThumbPath, sync:'synced' }])` | **例外（任务列明 P2）** | `upload_media` 回写；`MediaItem` 无 revision/版本、创建后内容不可变，风险低 |
| `sync.ts:569` `sync.ts:581` | `bulkPut(store, [mapped])` / `bulkPut(src.store, [{...src.entity, revision, baseRevision, sync:'synced'}])` | **例外（任务列明 P2）** | `resolveConflict` 用户显式裁决路径；窗口小（裁决推送期间再编辑才撞）；review P3 已记 |
| `sync.ts:535` `sync.ts:538` `sync.ts:541` | 毒丸停放：`bulkPut('media'/'entries'/'places', [{ ...x, sync:'failed' }])` | **正确，不在推送回写点范围** | 读的是失败时刻**现行库内行**（`repo.media()/entries()/places()` 现读），非推送前旧快照；且已被 `cur` 现读值构造 |
| `sync.ts:688-692` | `pullRemote` 落盘 `bulkPut('places'/'entries'/'media'/'dimensions'/'tags', …)` | **正确，不在本次范围** | 已有 `respectFreshEdits`（`sync.ts:704-712`，库内仍脏的行以库内为准）＋ `dirty`（`revision !== baseRevision`）／`sync !== 'synced'` 双保护；非「推送结果回写」 |
| `sync.ts:161` `sync.ts:164` | `writeBackIfUnchanged` 内部 | **已切（见「二」#1/#2）** | 10 处之一 |

结论：**除任务列明 `resolveConflict`／`upload_media` 两处（已知 P2）外，无遗漏的「推送前旧快照直写」**。

## 四、`saveTags` 幂等实证（同内容重存不 bump）

- 真源码位置：`src/lib/idb.ts:107-110`（`contentKey` 排除 `revision`／`baseRevision`）＋ `:111-117`（`bumpChangedRows`）＋ `:183-190`（`saveTags` 先读 prev 再 `bulkPut(bumpChangedRows(prev, next))`）。
- 说明：`saveTags` 依赖 IndexedDB（`idb`），CLI 侧无法直接 import 真源码；以下为**内联 node 逻辑等价复现**（逐字复制 `contentKey`／`bumpChangedRows`），不等同集成测试（已记未验证边界④）。

| 用例 | 输入（相对库内 `revision:3` 的 `t1`） | 输出 | 判定 |
|---|---|---|---|
| A 同内容重存 | `t1` 全字段不变、`revision:3` | `{...name:'咖啡', revision:3}`（**不变**） | **幂等 PASS** |
| B 仅 `name` 改名 | `name:'咖啡'→'奶茶'` | `revision:3→4` | 变化 bump PASS |
| C 改名＋带旧 `baseRevision:3` | 同上＋`baseRevision:3` | `revision:4, baseRevision:3`（保留原 baseRevision） | 变化 bump PASS |
| D 新行无 `revision` | 新 `t2` 无 revision | `revision:0→1` | 新行口径 PASS |
| E 仅 `revision` 不同、内容同 | `revision:3→9`，字段同 | `revision:9`（**不 bump**） | 排除版本号 PASS |

结论：**同内容重存不 bump（用例 A/E）**；仅内容变化行 `revision+1`（B/C）；新行 `0→1`（D）。与 `savePlace`／`saveEntry` 口径一致，满足 `writeBackIfUnchanged` 已变判定对 Dimension／Tag 的需求。

## 五、越界零改动确认（mobile／android／包名）

| 核项 | 结果 | 证据 |
|---|---|---|
| 问题范围内改动文件 | PASS（仅 2 业务文件） | `git status --porcelain`：`M src/lib/idb.ts`、`M src/lib/sync.ts`；另 `M docs/model/DISPATCH-LOG.jsonl`（账本一行）、`?? docs/review/CODE_REVIEW_改名回退.md`（reviewer 文档），均非业务代码 |
| `mobile/`／`android/` 目录是否存在 | PASS（不存在） | `ls -d mobile android androidApp ios *.apk` → 「无 mobile/android/ios 目录」 |
| 改动是否命中 android/ios/包名文件 | PASS（0 命中） | `git diff --name-only \| grep -Ei 'android\|ios\|package\.json\|app\.json'` → 无命中 |
| schema／RLS／触发器／`public` 表／`service_role` | PASS（无） | `git diff -- src/lib/sync.ts src/lib/idb.ts` 全为本地逻辑（回写保护＋内容比对），无 SQL／后端改动 |
| `docs/sop/` 基础设施规范位 | PASS（未动） | 改动清单无 `docs/sop/` |

## 六、DV 公社手动测试清单（改名 → 刷新 → 跑同步 → 再看，共 5 步）

> 前置：已登录云端账号、网络可用；本链是最易复现路径——**趁同步仍在后台跑时刷新**。逐步记录「实际结果」，任一步不符合预期即为 FAIL 并留截图／时间戳。

| 步 | 操作 | 预期结果（逐条） |
|---|---|---|
| 1 | 打开 App → 地点列表进入某地点 → **改名**（如「万绿园」→「万绿园QA」）→ 保存 | ① 详情页与列表**立即显示新名**；② 不出现「保存完马上闪回旧名」；③ 无报错气泡／红点 |
| 2 | **立刻刷新**（下拉刷新 或 关闭重开页面 或 浏览器 F5），趁同步仍在后台跑 | ① 刷新后仍为**新名**；② 列表与详情两处一致；③ 不出现旧名回退 |
| 3 | 进入「我的」页 → 点**手动同步** → 看结果条 | ① 同步成功（`done>0`／`failed=0`，或明确成功提示）；② **新名不回退**；③ 无 `revision-conflict` 误报 |
| 4 | **再刷新一次**，并核对云端（Supabase `places` 表 或 另一台设备拉取后查看） | ① 本地仍为**新名**；② **云端同名**（本地＝云端）；③ outbox 已清空（不再有滞留 op） |
| 5 | 再改一次名（新名→另一新名），**重复步骤 1-4**；并另跑一次弱网（开飞行模式约 2 秒再关 或 限速） | ① 每次都不回退（非一次性）；② 弱网下仍不回退；③ 弱网恢复后本地与云端最终一致 |

**附加（标签链，对应 review P1-1 根因）**：标签管理页改某标签名 → 刷新 → 跑同步 → 再看，预期同名不回退、`revision` 有推进、云端标签名一致。

## 七、Bug 清单

| Bug ID | Priority | Stage P0 Blocking? | Repro | Status | Current Task | 备注（截图/日志一句） |
|---|---|---:|---|---|---|---|

（本轮 **0 条新 bug**；下列为已知非阻塞项，均不阻断本轮。）

### 非阻塞观察项（O-1～O-4）

- **O-1（P2，任务已列明）`upload_media` 回写仍为旧快照直写**：`sync.ts:451`。`MediaItem` 无 revision／版本字段且创建后内容不可变，风险低；本轮未改。建议后续对 `remotePath/remoteThumbPath/sync` 有变化则跳过。
- **O-2（P2，任务已列明）`resolveConflict` 保留本地回写仍直写**：`sync.ts:569`／`sync.ts:581`。窗口小（裁决推送期间再编辑才撞）；建议后续复用 `writeBackIfUnchanged`（`confirmedRevision=r.revision`）。
- **O-3（P2，review 既有）`registerConflict` 冲突可见性延迟一轮**：`sync.ts:173` 的 `writeBackIfUnchanged` 未传 `confirmedRevision`，窗口内并发编辑时走已变分支只 `return`，本地行保持 `local` 而未标 `conflict`（meta 冲突记录已登记，`listConflicts` 可见）。下轮重推自愈、延迟一轮，建议 QA 以 meta 为准不断言 badge。本轮无运行时验证（未验证边界②）。
- **O-4（P3，review 既有）陈旧快照二次 `saveTags`**：推送已确认 `baseRevision` 后、调用方 state 未刷新前又存同内容，会以调用方旧 `baseRevision` 原样写回（`bumpChangedRows` 不 bump）。属调用方刷新节奏问题，窗口小；本轮无运行时验证（未验证边界④）。

## 真机QA会话能力预检结果

本轮为 **无真机、只读代码段**，不适用真机预检（模板要求「每真机 session 正式用例前必填」）。**本节不填占位、不伪造**：无 session ID、无 CUA 注入记录、无读屏/截图/点击证据，故 UI 运行时结论统一记 `NOT_VERIFIED`（见开头「未验证边界」）。

> 判据：`ok=true/exit 0/工具调用成功`但无状态或像素变化一律记 `FAIL_UNVERIFIED_ACTION`；禁跨模型/跨Runtime/跨session拼PASS。

- 日期/任务名：2026-09-20 / TASK-QA-改名回退（只读代码段，无真机）→ **N/A（无真机段）**
- session ID：N/A
- 模型精确ID：deepseek-v4.1-flash（本窗口，仅用于静态核与命令执行，不构成真机能力证据）
- Runtime：本窗口 subagent（bash 直驱）
- 原生CUA是否实际注入：未注入（本轮未使用，不做真机结论；未确认存在 `mcp__cua_repl.js`）
- 可用工具精确名称：Read／Grep／Bash（本窗口既有工具）
- CLI备用入口是否存在（Bash→orca computer CLI）：未使用
- Orca Runtime（`orca status --json` 实时结果，禁沿用旧报告）：未查询
- 能力（`orca computer capabilities --json` 实时结果）：未查询
- 权限（`orca computer permissions --json` 实时结果）：未查询
- 读屏结果：N/A
- 截图结果：N/A
- 点击并恢复结果：N/A
- 输入并清除结果：N/A
- 滚动及可见位移结果：N/A
- 界面恢复确认：N/A
- 最终结论（枚举只许 `PASS / BLOCKED_TOOL_NOT_INJECTED / BLOCKED_ORCA_APPROVAL / BLOCKED_RUNTIME / BLOCKED_OS_PERMISSION / FAIL_UNVERIFIED_ACTION / NOT_VERIFIED`，禁 `FAIL_MODEL_ACTION`）：`NOT_VERIFIED`（无真机段，不适用）
- 原始错误摘要：无
- 是否允许进入正式QA（全PASS才YES，否则NO即停）：NO（本轮为无真机静态＋构建＋逻辑复现阶段；端到端真机／浏览器段按「六」另派 DV 公社手动执行）

## Fix Attempt Fingerprint

- Task ID: TASK-QA-改名回退（QA 复核）
- Root Cause Hypothesis: 推送「读快照 → 网络往返 → 回写」窗口内用户改名，旧快照回写把新名盖回（现象＝保存后立刻变回旧名），且 outbox 被清空＝永久丢失；标签链因 Dimension／Tag 无 `updatedAt` 且 `saveTags` 不 bump revision，保护名存实亡（review P1-1）；窗口内删除被回写复活（review P1-2）。
- Approach: 验收 builder 已落地的修复（新增 `writeBackIfUnchanged`，10 处回写点全切＋`if(!cur)return` 删除保护＋`saveTags` 内容变化行 bump），不改代码。
- Files Changed: 无（QA 只读；被验改动点为 `src/lib/sync.ts:144-165` 及 8 调用点、`src/lib/idb.ts:107-117,183-190`）
- Verification: `npx tsc --noEmit` EXIT=0；`npm run build` EXIT=0；10 处回写点 `grep` 全切；遗留直写点穷举除列明 P2 外均覆盖；`saveTags` 幂等内联复现（同内容重存 revision 不变）；`git status` 越界零改动（无 `mobile/`／`android/`／包名）。
- Failure Reason: N/A（P0=0、blocking P1=0）
- Difference From Previous Attempt: N/A

> Attempt ID / Dispatch ID / Model-Backend 系字段 2.0 已废弃，不填（模型轨迹记账本）。
