# CODE REVIEW

- Task: TASK-DEV-10 网页对齐（Record 照片置顶、演示播种、Find 评分筛选、Tags CRUD）
- Commit: mobile/ 未纳入 git（untracked，对照工作树现状审查；HEAD=61a8324）
- Reviewer: code-reviewer（本窗口直派）
- Result: 过（不打回；P1/P2 进 backlog，由 QA 复验）

## P0 / P1 Findings

- P1-1 Find 结果量词与 Web 不一致：Web 按地点聚合（个私藏地点），mobile 按 entry（条记录）。建议 HANDOFF 注记差异或按 place 聚合——不打回。
- P1-2 Tags 菜单使用计数口径差异：Web 父标签聚合父+子，mobile 菜单仅自身（删除提示已补引用+子数）。建议菜单副标题同样聚合——不打回。
- P0：无。结构顺序一致；卡片字段齐；筛选档位全；维度父子关系对；demo 标记不上云；私密不展示。

## P2 / P3 Backlog Findings

- P2-1：demo 多 1 条二访（7 entries vs Web 6），有意增强，注记即可。
- P2-2：Find 评分 chip 追加计数为移动端增强，保留。
- P2-3：KIND_LABEL region 文案细微差，可对齐。
