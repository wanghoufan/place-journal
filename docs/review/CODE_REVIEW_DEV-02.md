# CODE REVIEW

- Task: TASK-DEV-02 Foundational 合同矩阵（SDD T012–T013；PRODUCT_PLAN_V1.5 RF-03 合同门禁；R-01、合同 matrix 门禁、P2-1）
- Commit: N/A（`mobile/` 全为 untracked 新建，未 commit；`git status --short -- mobile` 仅 `?? mobile/`，`git status --short -- src/ api/ supabase/` 为空，无已跟踪根业务文件被 builder 改动；`git diff --stat` 仅治理迁移文件 AGENTS.md/HANDOFF.md/USER_MODEL_OVERRIDE.md，与 builder 无关）
- Reviewer: code-reviewer（本窗口直派，只读复核，未改任何文件、未起 dev、未 commit）
- Result: 过 — 不打回 builder，放行 qa（附 0 P0 / 0 P1 / 4 P2 + 1 P3；门禁结论“0 项阻断”可信）

> Dispatch / Evidence ID 系字段 2.0 已废弃，不填。

## P0 / P1 Findings

- 无。本轮六查均通过：
  1. R-01 逐字段有据：`mobile/src/domain/types.ts` 领域实体与根 `src/lib/types.ts` 逐字段一致——`SyncStatus` 联合类型一字相同；`Place` 13 字段全对；`Entry` 17 字段全对（含 `syncError`）；`Dimension`/`Tag` 全对；`ShareItem` 15 字段全对；`ShareSnapshot` 8 字段全对。两处有意差异均已在文件头 D1/D2 显式声明理由（Blob→`localDisplayPath/localThumbPath` 文件路径；`photos` blob: URL→file:// 且永不进云端 payload），符合计划“不照搬 Blob、路径字段名不变”口径。
  2. 云端行合同逐字段对得上现役线合同：`PlaceRow`/`EntryRow`/`TagDimensionRow`/`TagRow` 与 `src/lib/sync.ts` 的 `placeRow`（L81-85）/`entryRow`（L86-91）/`dimRow`（L92-94）/`tagRow`（L95-97）字段名、`?? null`/`= id`/`?? 1` 口径一致；`MediaRow` 与 `upload_media` 分支（L413-418，`onConflict 'owner_user_id,client_id'`）一致；`ShareSnapshotRow`/`ShareItemRow` 与 `create_share` 分支（L455-467，`onConflict 'owner_user_id,client_id'` / `'snapshot_id,client_id'`，`cover_url` 可为 null）一致；`PublicShareRead*` 与 `src/lib/shares.ts` `fetchCloudShare`（L86-104，`p_slug` 输入、嵌套 `{id,item,sort_order}`、kind 不匹配返 null）一致；Storage 四 helper 路径（`{owner}/{placeId}/{mediaId}/display.jpg|thumb.jpg`、`{owner}/{snapshotId}/{shareItemClientId}.jpg`）与 L400/L447 实证一字一致。
  3. 门禁结论“0 项阻断”可信：矩阵 §D 七检查项每项都指向了 E1/E2 具体函数/行号，抽查的行号引用（placeRow/entryRow/pushEntity L117-135/ensureTagsInCloud/白名单 mapper）与实测文件相符；builder 标注的非阻断项 E7（`supabase/migrations/` 仅指针 README，vault 内仅此一文件，已实测确认）处理诚实——未冒充 DB 级 CHECK/默认值断言，且明示“移动端全部显式传值、不依赖 DB 默认”+“T014+ 若权威 DDL 与 E1/E2 冲突则停手返 TM”（§D 门禁④），符合 `PRODUCTION_DB_MIGRATION=0` 与 RF-03“不猜测实现”要求。
  4. 未碰根业务/治理：`src/`、`api/`、`supabase/` 零改动；`mobile/` 独立新增；矩阵与 types.ts 内无 `service_role/setSession/AsyncStorage/code_verifier` 命中（rg 干净）；token/code 不落盘口径未被触碰（本 Task 无 Auth 代码）。
  5. P2-1 已关闭：`mobile/package.json version=0.1.0` 与 `mobile/app.config.ts version='0.1.0'`（`versionCode: 1`）现已一致，DEV-01 遗留的 P2-1（1.0.0 vs 0.1.0）由本轮 builder 顺手修复，建议 HANDOFF 未闭环清单中将 P2-1 销项。
  6. Scope 无 creep：本轮新增 `mobile/src/domain/mapping.ts`（T013 行映射骨架，纯函数、无网络/SQLite 访问）虽不在派工字面三件套内，但矩阵 §C 明确将其列为“白名单 mapper 真源”，属 T012–T013 门禁包内物，且其 `placeToRow/entryToRow/shareItemToPayload/publicShareToSnapshot` 与 E1/E2 同口径（含 `mediaToRow` 无 remotePath 时 throw 守卫），不算越界。

## P2 / P3 Backlog Findings

- P2-5｜`publicShareToSnapshot` 缺 Web 端的扁平结构兼容：根 `fetchCloudShare`（L96）做 `raw?.item ?? raw` 双兼容（ENV1 实测曾发现映射错位），移动端只读嵌套 `raw.item`。当前不阻断（现役 RPC 即返回嵌套结构），建议 T096+ 分享任务补齐兼容分支并加单测。
- P2-2（DEV-01 遗留，仍有效）：空目录 git 不跟踪问题已自然缓解（`domain/`/`docs/` 现有实质文件），其余 `db/media/services/supabase/sync/test` 空目录待 T014+ 填充；无需 `.gitkeep`，忽略即可。
- P2-4（DEV-01 遗留，仍有效）：`@expo/ui`、`expo-glass-effect` 模板冗余依赖仍在，本轮未动（`mobile/package.json` 39 依赖与 DEV-01 一致，版本号 0.1.0 已对齐）。建议 Foundational 结束前评估移除；不打回。
- P2-6｜矩阵行号引用存在自然漂移风险：§A/§2 引用的 E1 行号（如 `pullRemote` L602-614/L680-688）为快照值，`src/lib/sync.ts` 后续改动会使其过期。建议后续矩阵维护改引函数名+语义锚点为主、行号为辅；本轮抽查核心引用均命中，不影响结论。
- P3-1｜根 `sync.ts` L99-100 白名单注释称含 `visit_date`，但 `shareItemPayload` 实际代码（L102-110）并不输出该键；移动端矩阵/类型与实际代码一致（8 键：name/area/rating/budget/note_public/tags/coord_precision/cover_url），是对的。建议收尾顺手修正根注释一字，或记 neat-freak 账；不进 QA。
- 交 QA 的验证缺口（非评审问题）：本复核为只读静态对照，未执行 `tsc/jest/expo-doctor`；请 QA 按 V1.5 DoD 实际运行 mobile 内 `npm run typecheck / npm test` 并落证据；`mapping.ts` 纯函数建议加首批单测（T013 对应测试），真机/Storage/RPC 实测属 T062/T077/T111 范围，不在本轮断言。
