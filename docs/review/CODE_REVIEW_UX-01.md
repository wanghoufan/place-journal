# CODE REVIEW — TASK-UX-01

- Task: TASK-UX-01（用户四项：1)公开理由框2-3行高 2)画廊顶部chips与浏览行重叠 3)单栏/双栏切换＋偏好持久化 4)卡顿根因与优化）
- Commit: 工作树未提交（HEAD=4a8e155；落盘：mobile画廊index/find/record/ai-confirm/ui/queries/meta改动＋新galleryLayout.ts及单测）
- Reviewer: code-reviewer（本窗口）
- Result: 打回（P1×2，改完可过；P2×2 backlog）

## P0 / P1 Findings

- P1-1（第4项半截活，死代码）：`mobile/src/features/queries.ts` 新增 `entriesSignature` / `tagGroupsSignature`（注释称"拿指纹先比一次…setState直接跳过"），但全仓无任何调用方（grep仅定义处；index/find均未引用）。注释描述的行为（focus重查去重）实际未接线 = 性能收益不存在＋误导后人。改法二选一：a) 真接线（load回调里比指纹、未变跳过setState，附单测）；b) 删掉两函数（若memo+窗口化已够用）。留注释写"已优化"不算做到。
- P1-2（第1项只做一半）：record.tsx/ai-confirm.tsx仅加 `numberOfLines={3}`，但 `TextField` 的通用兜底是 `multilineLinesFor(minHeight)`（minHeight=80 → round(80/21)=4 行）。即：本次两个调用点显式传3行OK，但其他未传的multiline框（默认minHeight=96 → 5行）仍按旧口径偏高，且"2-3行"无统一上限约束。改法：确认是否只要求这两处（是则本条降P2，注释写清范围）；若要求通用，`multilineLinesFor` 应 clamp 到3行上 / 或调用点统一传 `numberOfLines={3}`。

## P2 / P3 Backlog Findings

- P2-1（第4项证据缺）：memo/useCallback/窗口化/recyclingKey+memory-disk/listFlex均已真实落盘（index/find）；但无性能前后对比证据（帧率/内存/复现步骤），QA需在真机/模拟器补"切Tab回来是否重渲染"验证，否则第4项只能算"改了"，不算"优化到位"。
- P2-2（单测口径）：`galleryLayout.test.ts` 断言 `GALLERY_CHIP_ROW_HEIGHT === 34+6*2` 把样式魔数焊死，chip样式一改测试即误报。建议断言行为（flexShrink=0/minHeight>0/parse回退默认）即可。

## 逐项核对（结论）

1) 公开理由框2-3行：部分做到（两调用点显式3行；通用兜底偏高，见P1-2）。
2) chips与浏览行重叠：做到。`galleryChipScrollStyle`（flexGrow:0/flexShrink:0/minHeight:46）已在index `chipScroll` spread使用；浏览/布局行改为双viewGroup换行。根因定位（ScrollView flexShrink被压）合理。
3) 单栏/双栏切换＋偏好持久化：做到。`galleryLayout.ts`（parse/load/save/toggle/key/tuning）＋index布局chips＋`meta.gallery_layout`键＋numColumns换key重挂（RN硬性要求，处理正确）。默认双栏，非法值回退默认。
4) 卡顿根因与优化：改了一半。memo+id回调+窗口化+图片缓存+flex边界均真实；但指纹去重未接线（P1-1），优化证据缺（P2-1）。

## 越界检查

- 无越界：改动限mobile应用层＋meta键新增；未碰 `mobile/android/`、包名/scheme（com.wanghoufan.placejournal未动）、override分工表、根Web/api。用户作业提交材料2文件未动（未跟踪，不在本diff）。

## 单测

- 新增 `galleryLayout.test.ts`；"383=369+14"待QA实跑确认（本轮只读未执行）。

## QA转交

- 必验：布局切换→杀进程冷启动→偏好保留；单/双栏×按记录/按地点4组合无重叠无白屏；切Tab回来的滚动/图片复用观感；公开理由框两处行高真机目检。

## 返工复验（2026-09-22，P1×2 闭环）

- 范围：指纹接线 index/find 两页、TextField 行数 2–3 上限、ui 单测扩写；383 不变。
- Result: 通过（P1×2 已闭环；P2×2 仍 backlog；无新增 P0/P1）。
- P1-1 闭环：`entriesSignature`/`tagGroupsSignature` 已在 `index.tsx`/`find.tsx` load 回调中真实接线（signatureRef 比对，未变跳过 setState）＋注释/单测口径一致。性能收益仍缺真机证据，降为 P2-1 续跟。
- P1-2 闭环：`ui.tsx` 新增 `MULTILINE_LINE_HEIGHT/MIN/MAX_LINES`＋`multilineLinesFor`（2–3 行夹取，上限 3 行），TextField 默认 `minHeight=63`（3×21），通用兜底旧 96→5 行已收敛；record/ai-confirm 两处显式 `numberOfLines={3}` 保留。无其他调用点回归（单行不传 numberOfLines 有单测锁定）。
- 单测：`ui.test.tsx` 新增 4 用例（公开理由口径/单行不传/换算夹取/默认推算），本轮实跑 22/22 过；全量 mobile jest 42 套 383/383 全绿（383=369+14 口径不变）。
- 越界：无。改动限上述 8 文件（＋galleryLayout 2 新文件沿用）；未碰 `mobile/android/`、包名/scheme、override 表、根 Web/api；作业提交材料 2 文件未动（未跟踪）。
- QA 转交（不变）：偏好冷启动保留、4 组合无重叠、切 Tab 复用观感、两处行高目检；另加指纹未变跳过 setState 的行为可由单测覆盖，真机只验观感。
