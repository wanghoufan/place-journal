
# CODE REVIEW

- Task: TASK-DEV-16C（mobile 画廊筛选＋按地点/卡片标签行、Find 自然语言＋双视图＋清单分享、Mine 导出 json/csv＋三主题＋AI 探针＋版本号）
- Commit: 工作树未提交（HEAD=000de25；本轮改动含已跟踪 11 文件＋新文件 9 个，均未 commit，符合禁 commit 口径，HANDOFF/TM 定夺）
- Reviewer: code-reviewer（opencode/muse-spark-1.3-contributor-free，本窗口）
- Result: 过（P0=0；P1=0；P2×3＋P3×1 记 backlog，不阻 QA；需 QA 真机/模拟器覆盖 Find 双视图、导出分享、主题持久化、AI 探针四项）

> Dispatch / Evidence ID 系字段 2.0 已废弃，不填。

## 核查方法

- 只读复核，未改任何业务代码；新文件 `search/export/exportFile/aiProbe/themeProvider`＋单测 4 文件已读全；`theme.ts` 扩主题、`queries.ts`（expandTagIds/filterEntriesByAnyTag/groupEntriesByPlace）、`format.ts`（appVersionLabel）、`meta.ts`（+`app_theme`）的 diff 已核。
- 口径对标：Web `src/lib/search.ts`（parseQueryWithKinds/matchEntries/expandTagIds）、`src/lib/organize.ts`（cnToNumber）、`src/lib/exporter.ts`（列序/BOM/转义，抽查列头与 `csvEscape` 实现）、Web 主题/Mine AiStatus。
- 实测：`mobile/` 内 `npm test`＝41 suites / 369 tests 全绿；`npm run typecheck` 干净（`tsc --noEmit` 零输出）。

## P0 / P1 Findings

- 无。P0（越界/回归/数据破坏）与 P1（阻塞发布的功能错）均未发现：
  - 搜索口径与 PWA 一致：预算/星级正则、TOKEN_SPLIT、tagMatched 双向包含、结构化优先＋无结构回退全文、标签桶 kind 映射（region/type/scene/crowd）、父标签展开，均与 Web 逐条对齐；`cnToNumber` 自包含实现与 Web 同语义（十/百组合、全角数字）。
  - 导出列序/BOM/转义：列头 `日期,地点,区域,评分,人均,摘要,公开理由,标签,同步状态` 与 Web 一致；`csvEscape` 双引号转义＋BOM 头；JSON 字段名与 Web 同名。
  - 主题持久化：`THEME_META_KEY='app_theme'` 经 `meta` 表（`MetaKey` 已扩展），`parseTheme` 回退 warm，`initialTheme` 惰性读＋try/catch 零副作用；`colors` 旧导出值逐字保留，既有 import 不受影响。
  - 越界检查：改动全在 `mobile/` 内；无 `mobile/android/`、无包名/scheme/redirect 改动；无根 Web `src/` 改动；无 `USER_MODEL_OVERRIDE.md` 改动；无 secrets；用户自有「作业提交材料」2 文件未纳入评审、不碰。
  - 纯增量：已跟踪文件均为加法（新函数/新分支/主题扩展/MetaKey 扩展）；未删既有逻辑；单测 369=325+44 口径可信（本轮新增 search/export/theme/aiProbe＋format/queries 追加）。

## P2 / P3 Backlog Findings

- P2-1（文本兜底口径差异，建议对齐或落文档）：mobile `matchEntries` 全文 haystack 含 `notePrivate`，Web 版仅 `summary/notePublic/transcript/地点/标签`。本地自用虽无外泄，但与「感受永不出卡」口径方向相悖，建议要么剔除 `notePrivate`，要么在注释写明「本机自查可含私密，分享/导出路径已排除」。
- P2-2（导出分享大正文风险）：`exportFile.ts` 把 `file.content` 全量塞进 `Share.share({message})` 兜底，大库 JSON 可能超长/卡分享面板；建议 QA 测 500+ 条库的表现，必要时 message 只放摘要＋uri。
- P2-3（AI 探针标签与 Web 不完全同字）：`missing-base`/`not-deployed` 为移动端新增状态，文案合理，但与 Web AiStatus 三态（已配置/未配置/未部署）不逐字一致；建议 Mine 文案旁注基地址来源（`EXPO_PUBLIC_AI_API_BASE`），免用户误判。
- P3-1（`expandTagIds` 无环保护仅靠 `out.has` 短路，链深极端时递归；当前标签树浅，无需改，记一笔即可）。

## 回归影响

- `queries.ts` 新增三函数均为纯加法；`format.ts` 仅加 `appVersionLabel`；`theme.ts` `colors` 值未动；`meta.ts` 仅 union 加键。既有 325 例零回归（41 suites 全绿为证）。

## 可回滚性

- 可整体回滚：已跟踪改动 `git checkout -- mobile/`＋删除 9 个新文件即回 DEV-16B；`meta` 表多出的 `app_theme` 键为惰性数据，老版本忽略，无迁移负担。
