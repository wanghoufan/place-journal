# 送审材料清单 丨 habit_tracker 丨 V1.1 重新提审（2026-09-03）

> 用途：本轮 V1.1 修订完成，以下材料需转送给【共享 Supabase 数据库管理员】复审。
> 转送方式：直接把下面「送审正文」连同文件链接发给审查智能体即可（链接为绝对路径，审查方本机可直接打开）。
> 维护规则：**今后凡是需要交给其他智能体审查的文件，一律在本目录建清单并附绝对链接**（用户工作流约定）。
> 治理文件归属：迁移草案、方案、验证记录均在数据库管理文件夹维护，本目录只放送审清单，不建副本（避免两套版本）。

---

## 送审正文（可直接转发）

【个人打卡小工具 habit_tracker 丨 V1.1 重新提审】

V1.0 审查结论为 CHANGES_REQUIRED（2026-09-03）。现已按《数据库管理员完整审查意见丨V1.0》完成全部修改项，并在隔离环境（PostgreSQL 16.4 便携版 + Supabase 角色/auth 桩）完成验收，48/48 全部通过。请依据以下材料复审，给出明确结论（APPROVED_FOR_EXECUTION / CHANGES_REQUIRED / BLOCKED）：

1. **V1.1 数据写入方案（主文档，12 项材料）**
   /Users/zzymima0000/Developer/coding/1.Active/alw丨数据库管理专家/项目审查丨habit_tracker/数据写入方案丨个人打卡小工具（habit_tracker）丨V1.1.md

2. **修订后 Migration 草案（V1.1）**
   /Users/zzymima0000/Developer/coding/1.Active/alw丨数据库管理专家/项目审查丨habit_tracker/0001_init.sql

3. **Storage / Realtime 待授权文件（规则明确前不执行，不计入审核范围）**
   /Users/zzymima0000/Developer/coding/1.Active/alw丨数据库管理专家/项目审查丨habit_tracker/0002_storage_realtime.pending.sql

4. **隔离环境验证结果（48/48 通过）**
   /Users/zzymima0000/Developer/coding/1.Active/alw丨数据库管理专家/项目审查丨habit_tracker/verify_result.txt

5. **可复现验证脚本（含自动重置）**
   /Users/zzymima0000/Developer/coding/1.Active/alw丨数据库管理专家/项目审查丨habit_tracker/verify.sql.sh

6. **背景：V1.0 完整审查意见（本次修订的依据）**
   /Users/zzymima0000/Developer/coding/1.Active/alw丨数据库管理专家/项目审查丨habit_tracker/个人打卡小工具丨habit_tracker丨数据库管理员完整审查意见丨V1.0.md

7. **背景：V1.0 写入方案（原提审版）**
   /Users/zzymima0000/Developer/coding/1.Active/alw丨数据库管理专家/项目审查丨habit_tracker/写入方案丨数据库管理员审查丨V1.0.md

要点速览（详见 V1.1 方案 §3 差异说明）：
- §3 含子查询 CHECK → 触发器；§4 补齐 9 个同 owner 复合外键
- §5 revision 触发器强制乐观锁 + 客户端条件更新 + 用户显式裁决 UI
- §6 client_id 改 (owner_user_id, client_id)；share_items 走 (snapshot_id, client_id)
- §7 payload/item 数据库层白名单触发器，应用侧生成真实白名单 payload
- §8.1 Storage/Realtime 全部拆出待授权；§8.2 匿名分享选方案 B（仅链接可访问，SECURITY DEFINER RPC 按 slug 读取，anon 无表权限）
- §9 回滚改为「先备份 + 管理员批准 + 隔离演练」的终局操作手册；§10 幂等性逐项说明

---

## R2 增量复审材料（2026-09-03 已补齐，可转发管理员做增量复审）

【个人打卡小工具 habit_tracker 丨 R2 增量材料补交】

R2-1～R2-4 已全部完成，增量材料如下：

1. **R2-1 · Supabase 桩（此前缺失，verify.sql.sh 依赖组件，幂等可重跑）**
   /Users/zzymima0000/Developer/coding/1.Active/alw丨数据库管理专家/项目审查丨habit_tracker/setup_stub.sql

2. **R2-1 · 修正后验证脚本（v4：stub 先于 Migration 加载；仅凭本目录材料 + 全新 PostgreSQL 16 可复现）**
   /Users/zzymima0000/Developer/coding/1.Active/alw丨数据库管理专家/项目审查丨habit_tracker/verify.sql.sh

3. **R2-1 · 新验证结果（全新初始化集群 54/54 通过，含 R2-2/R2-3 新用例）**
   /Users/zzymima0000/Developer/coding/1.Active/alw丨数据库管理专家/项目审查丨habit_tracker/verify_result.txt

4. **R2-2 · 修订后 0001_init.sql（选「RPC 增加 expires_at 校验」路线；V1.1 方案 §9 已同步声明过期语义，非预留字段即刻生效）**
   /Users/zzymima0000/Developer/coding/1.Active/alw丨数据库管理专家/项目审查丨habit_tracker/0001_init.sql

5. **R2-2/R2-3 · verify 补充用例**：已含在第 2 项脚本内——「创建已过期分享快照成功」「过期分享 RPC 返回 NULL（链接已失效）」（R2-2）；「B 创建自己的 media（真实行）」「B 的 entry 引用 A 真实存在的 media 作封面失败」「A 的 media 未被 B 污染」（R2-3）。

6. **R2-4 · 备份恢复演练记录（15/15 通过；关键发现：恢复到空库第 0 步须先具备 auth 桩/平台 auth Schema，已固化进 §10.3 恢复流程）**
   /Users/zzymima0000/Developer/coding/1.Active/alw丨数据库管理专家/项目审查丨habit_tracker/备份恢复演练记录丨habit_tracker.md
   /Users/zzymima0000/Developer/coding/1.Active/alw丨数据库管理专家/项目审查丨habit_tracker/backup_drill_result.txt

7. **V1.1 方案（§9 / §10.3 / §11 / §12 已同步更新至 R2 后状态）**
   /Users/zzymima0000/Developer/coding/1.Active/alw丨数据库管理专家/项目审查丨habit_tracker/数据写入方案丨个人打卡小工具（habit_tracker）丨V1.1.md

---

## 送审状态追踪

| 项 | 状态 |
|---|---|
| V1.1 材料编制 | ✅ 2026-09-03 完成 |
| 隔离验证（首轮 48/48 → R2 后全新集群 54/54） | ✅ 2026-09-03（verify_result.txt） |
| R2 增量材料补齐 | ✅ 2026-09-03（R2-1 stub+脚本 v4 / R2-2 expires_at 校验 / R2-3 跨用户封面用例 / R2-4 演练 15/15，见上方清单） |
| 转送管理员（增量复审） | ✅ 2026-09-03 已复审（管理员独立复跑 54/54） |
| 复审结论 | **APPROVED_FOR_EXECUTION**（2026-09-03 14:03，R2 增量复审通过）。R2-1～R2-4 全部确认修复：R2-1 管理员以全新 PostgreSQL 16 独立复跑提交脚本（原样未改）54/54 ALL_PASSED；R2-2 expires_at 校验实测生效；R2-3 跨用户封面用例通过；R2-4 备份恢复演练 15/15 归档。<br>**批准范围**：S1——0001_init.sql（V1.1）经【平台丨共享 Supabase 数据库】仓库唯一发布人发布至 yacgnikzvutbpoqvokth / Schema habit_tracker；S2——发布后核对 Exposed schemas 仅勾选 habit_tracker。<br>**仍冻结**：0002_storage_realtime.pending.sql、Storage、Realtime、任何范围扩大。审核通过 ≠ 生产发布完成；发布后管理员核对线上状态再收口。完整意见见 V1.1 方案 §13.1（alw丨数据库管理专家/项目审查丨habit_tracker/）。 |
| S1 迁移发布 | ✅ **已发布**（2026-09-03）：`20260903141849_create_habit_tracker_schema.sql`（与送审版字节一致，md5 1ce6ae94…）经平台仓库 CLI db push 发布至 yacgnikzvutbpoqvokth。线上核对与隔离验证一致：8 表全启用 RLS、策略 32、触发器 11、函数 5、索引 29、authenticated 32 项 CRUD grant、anon 表 grant 0、anon 仅可执行 public_share_read。发布过程 prompt_manager 未推送 Migration 已临时移出/原样移回（md5 校验一致，Remote 仍未推送）。详见 V1.1 方案 §13.1 S1 确认行。**待管理员核对收口** |
| S2 Expose 勾选 | ✅ 已完成（2026-09-03，用户 Dashboard 操作，仅新增勾选 habit_tracker）。Expose 后验证随 L2 验收首步执行 |
