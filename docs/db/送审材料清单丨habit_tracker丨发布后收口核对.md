# 送审材料清单 丨 habit_tracker 丨 发布后收口核对（2026-09-03）

> 转送对象：数据库管理员。目的：S1 发布 + S2 Expose + 应用侧验收全部完成后的**终核收口**；并请求解冻 0002 中 Storage bucket 创建项。

## 一、可直接转发的送审正文

数据库管理员您好：habit_tracker（个人打卡小工具）数据库全链已完成，请求发布后收口核对。

1. **S1 发布记录**：Migration `20260903141849_create_habit_tracker_schema.sql`（与批准版 0001_init.sql 字节一致，md5 1ce6ae9482cb8515aedce6a4ad73b53c）经平台仓库 `supabase db push` 发布至共享项目 yacgnikzvutbpoqvokth。线上只读核对与隔离验证一致：8 表全 RLS、策略 32、触发器 11、函数 5、索引 29；authenticated 32 项 CRUD；anon 表权限 0、仅可执行 `public_share_read`。
2. **S2 Expose**：Dashboard 已勾选 habit_tracker Schema；REST 验证 anon 读表 42501 拒绝、`public_share_read` 200/null（不可枚举）。
3. **L2 云端写入验收**：`L2_PASS`（真登录 → 写入回执 → 清登录态重读 7/7；RLS 按用户隔离实证）。
4. **QA 整轮回归**：`QA_V02_PASS`（25/25，基线 19eb499）；随后开发侧对 QA 环境项的应用层修复全部经真实 Chrome CDP 实测（万绿园 place+entries 补推上云、分享快照上云、outbox 清零、脏行 0）。无 Schema 变更，均为前端 sync 引擎修复。
5. **请求项（ENV-1，属 0002 冻结范围）**：创建两个 Storage bucket——`habit-tracker-media-private`（私有，媒体原图/缩略图）与 `habit-tracker-media-share`（公开，分享封面缩略图），并按 0002 pending 文件中的 bucket 配置与策略执行；这是当前唯一阻塞项（媒体图片与分享封面上云）。Realtime 其余部分维持冻结，待平台规则明确。
6. **平台侧提醒**：平台仓库另存有 prompt_manager 项目未推送 Migration `20260901163555`（原样保留），任何 `db push` 会连带推送，需 prompt_manager 项目侧决策，与本项目无关。

## 二、材料绝对路径

### 本项目（业务与验收证据）
- /Users/zzymima0000/Developer/coding/1.Active/ing 丨0831个人打卡小工具 MACMINI GL/docs/qa/QA-REPORT丨V0.2.md（QA_V02_PASS + 开发侧后处理附录）
- /Users/zzymima0000/Developer/coding/1.Active/ing 丨0831个人打卡小工具 MACMINI GL/docs/qa/QA-BASELINE丨V0.2.md（基线与 checklist）
- /Users/zzymima0000/Developer/coding/1.Active/ing 丨0831个人打卡小工具 MACMINI GL/docs/acceptance-l2/L2-REPORT.md（L2_PASS + 标签回归 TAG_FIX_PASS）
- /Users/zzymima0000/Developer/coding/1.Active/ing 丨0831个人打卡小工具 MACMINI GL/docs/acceptance-l2/l2-sync.har（已脱敏）
- /Users/zzymima0000/Developer/coding/1.Active/ing 丨0831个人打卡小工具 MACMINI GL/docs/handoff/HANDOFF.md（§0 收工快照 = 全局状态）
- /Users/zzymima0000/Developer/coding/1.Active/ing 丨0831个人打卡小工具 MACMINI GL/docs/db/送审材料清单丨habit_tracker丨V1.1重审.md（V1.1/R2 审查历史）

### 治理仓（alw丨数据库管理专家，权威版本）
- /Users/zzymima0000/Developer/coding/1.Active/alw丨数据库管理专家/项目审查丨habit_tracker/数据写入方案丨个人打卡小工具（habit_tracker）丨V1.1.md（§13.1 各阶段记录）
- /Users/zzymima0000/Developer/coding/1.Active/alw丨数据库管理专家/项目审查丨habit_tracker/0001_init.sql（已发布版本）
- /Users/zzymima0000/Developer/coding/1.Active/alw丨数据库管理专家/项目审查丨habit_tracker/0002_storage_realtime.pending.sql（bucket 创建请求的配置来源）
- /Users/zzymima0000/Developer/coding/1.Active/alw丨数据库管理专家/项目审查丨habit_tracker/verify_result.txt（隔离验证 54/54）
- /Users/zzymima0000/Developer/coding/1.Active/alw丨数据库管理专家/平台丨共享 Supabase 数据库/docs/DATABASE_CATALOG.md（habit_tracker 台账已登记）
- /Users/zzymima0000/Developer/coding/1.Active/alw丨数据库管理专家/平台丨共享 Supabase 数据库/supabase/migrations/（发布仓库，prompt_manager 未推送迁移在此，勿连带）

## 三、状态追踪

| 事项 | 状态 |
|---|---|
| V1.1 方案 + R2 增量复审 | ✅ APPROVED_FOR_EXECUTION（2026-09-03） |
| S1 迁移发布 + 线上核对 | ✅ 完成（2026-09-03） |
| S2 Expose + REST 验证 | ✅ 完成（2026-09-03） |
| L2 写入验收 | ✅ L2_PASS（2026-09-03） |
| QA V0.2 整轮回归 + 开发侧后处理 | ✅ QA_V02_PASS（2026-09-03） |
| **发布后收口核对（本清单）** | ⏳ 待管理员终核 |
| ENV-1 bucket 创建（0002 部分） | ⏳ 待管理员批准执行 |
| Realtime 其余 / Docker 化 | ⏳ 冻结（待平台规则 / 用户授权） |
