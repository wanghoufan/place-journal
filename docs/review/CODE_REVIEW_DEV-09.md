# CODE REVIEW

- Task: TASK-DEV-09 界面批（mobile/app 全路由＋features＋theme/ui，只读本地库）
- Commit: 工作区现状（未提交，不评 commit hash）
- Reviewer: code-reviewer（本窗口直派）
- Result: 过（无 P0、无 blocking P1；下述 P1 为建议不打回，P2 进 backlog；TM 判定 P2-2/P2-3 涉隐私口径，与 P1-1/P1-2 一并返工，不进 backlog）

## P0 / P1 Findings

- P1-1（建议）：`mobile/app/ai-confirm.tsx:37-41` `load()` 无 try/catch，无 Loading/Error 早返；DB 未初始化时白屏。改法：补 try/catch＋ErrorState。
- P1-2（建议）：`mobile/app/ai-confirm.tsx:78` 新地点仅传 `{name}` 无 area 字段，与 Record 页 newPlace `{name, area}` 不一致。改法：统一传 area。
- repository 小修确认：`sync_error` 清列条件化正确，属 A 类小修，未越界。

## P2 / P3 Backlog Findings

- P2-1：`ScreenPlaceholder.tsx` 零引用，建议删除或注明保留原因。
- P2-2（返工）：`conflicts.tsx` 把 `note_private` 截断展示在裁决页——涉隐私红线，改仅展示 note_public/summary 或加"私密"角标。
- P2-3（返工）：`find.tsx:132` 回退展示 `item.notePrivate`——列表页泄私密感受，改仅 summary/空。
