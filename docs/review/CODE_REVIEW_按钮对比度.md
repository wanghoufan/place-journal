
# CODE REVIEW

- Task: 按钮对比度修复（mobile/src/components/ui.tsx AppButton style 顺序＋disabled 实色、mine/entry/place/record 四页 flex 拆分、新增 ui.test.tsx 5 例）
- Commit: e996cc6（工作树未提交，HEAD 以 git log 为准；本次复核对象为工作树 diff：ui.tsx＋四页＋ui.test.tsx）
- Reviewer: code-reviewer（本窗口）
- Result: 过

> Dispatch / Evidence ID 系字段 2.0 已废弃，不填。

## P0 / P1 Findings

- 无 P0/P1。以下三项核验均通过：
- 1. 背景恒由 variant 决定：`mobile/src/components/ui.tsx:56-64` 样式数组为 `[button, style(调用方), variantStyles[variant], pressed(仅 opacity), blocked ? variantDisabledStyles[variant]]`，variant 排在调用方 style 之后，调用方 `backgroundColor`（如旧 `flex:{flex:1,backgroundColor:paper}`）无法再盖掉 `terra`。`ui.test.tsx:63-71` 复刻旧写法回归断言通过（`flex:1` 保留、`backgroundColor` 恒为 `terra`）。
- 2. disabled 白字可读：刪 `buttonDisabled:{opacity:0.45}` 全局降透明（改名 `chipDisabled` 仅 Chip 用），新增 `variantDisabledStyles` 实色＋`variantDisabledTextStyles` 不透明文字（`ui.tsx:81-92`）。primary 禁用 `terraDeep(#A8491F)+white` 无 `opacity`（`ui.test.tsx:73-80` 断言 `opacity` 为 undefined），loading 同理（`:82-87`）。secondary/danger/ghost 均为实底＋不透明字，未引入新不可读组合。
- 3. 四页 flex 拆分完整：`mine.tsx:212,230,307,368-370`、`record.tsx:211,254-255,301,377-379`、`entry/[id].tsx:147,180,259-260,279-281`、`place/[id].tsx:93,102,115-116,175-177` 均拆为 `screen:{flex:1,backgroundColor:paper}`（只给 ScrollView 铺底）＋`grow:{flex:1}`（只给 AppButton/子容器，无背景）。`modalButton:{flex:1}`、`emptyAction:{marginTop:4}` 无背景，不影响按钮底色。

## P2 / P3 Backlog Findings

- 越界核查通过（本修复范围）：修复文件仅 `mobile/src/components/ui.tsx`＋四页＋`mobile/src/components/__tests__/ui.test.tsx`；`git diff HEAD --name-only` 未见 `mobile/android/`、`mobile/package.json`、`mobile/app.config.ts`（scheme/package `com.wanghoufan.placejournal` 未动）改动。工作树另有 `api/ai-organize.ts`、`src/**`、`mobile/.../auth` 等改动，属 DEV-14/PWA-01 等他任务范围，不计入本次修复越界。
- 数量核对通过：全量 `277 passed`（34 suites）＝ 排除新文件后 `272 passed`（33 suites）＋ `ui.test.tsx` 5 例（单文件运行 5 passed）。即 277=272+5 成立。
- P3 观察（不阻断）：Chip 禁用仍用 `chipDisabled:{opacity:0.45}` 整体降透明，小尺寸 Chip 可接受，与本次“主按钮不用 opacity”原则不冲突；后续若要统一 Chip 对比度可另起任务。
