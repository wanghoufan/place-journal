# 我的地点 · 私人打卡手账（PWA）

以手机为主的私人地点手账：拍多张照片并说出感受 → AI 整理为可筛选的地点记录 → 自然语言找地点 → 生成可撤销的公开分享（单地点卡 / 多地点清单 / 地图总览）。

规格来源：`docs/V1_PRODUCT_AND_TECHNICAL_PLAN.md`（SSOT，V1.0）。视觉基准：`docs/visuals/01–07`。

## 当前状态（2026-09-05 快照，开发暂停；权威状态见 `docs/handoff/HANDOFF.md` §0）

✅ **全部页面与流程已实现**：画廊（按记录/按地点）、记录（多图+按住说话+手动）、AI 确认、记录详情（含编辑）、地点时间线归档、找地点（自然语言+结构化筛选）、标签与维度（父→子两层，含父链补推）、我的（导出/同步/隐私/冲突裁决）、单地点分享页、多地点清单分享、地图总览（编号名牌）、本地 IndexedDB + Supabase 同步引擎（含 `ensureTagsInCloud`/`ensurePlacesInCloud`/`sweepDirtyRows` 自愈）、图片压缩上传、PWA 安装。`tsc && vite build` 通过（PWA precache 7 entries / 504KB）。

✅ **Supabase 云端已打通**（`yacgnikzvutbpoqvokth` / `habit_tracker`）：Migration `20260903141849` 已发布并线上核对（8 表 RLS、策略 32、anon 零表权限）、Expose 已勾选；L2 真实写入验收 **L2_PASS**（Google OAuth → POST 201 → 重登 7/7 回读）、标签同步回归 **TAG_FIX_PASS**（6/6）、QA V0.2 整轮回归 **QA_V02_PASS**（25/25）。证据见 `docs/acceptance-l2/` 与 `docs/qa/`。单设备定位，不做双设备/并发验收。

⚠️ **仍待 Key 即启用（均带「未配置」降级，不阻塞使用）**：

| 能力 | 环境变量 | 状态 |
|---|---|---|
| Supabase 云端 | `VITE_SUPABASE_URL` `VITE_SUPABASE_PUBLISHABLE_KEY` | 已填 `.env.local` 并验证 Expose/RLS；Publishable key 可进前端 |
| Google 登录 | Supabase Dashboard 配置（见方案 7.4） | 已验证真登录；Redirect 白名单含 `http://localhost:5173` |
| 腾讯 ASR | `TENCENT_ASR_SECRET_ID` `TENCENT_ASR_SECRET_KEY` | ✅ 2026-09-04 真转写 PASS；未配置时降级手动填写 |
| AI 整理 | `OPENROUTER_API_KEY` / `DEEPSEEK_API_KEY` / `OPENCODE_*` | ✅ 2026-09-04 全通，当前 `OPENCODE_MODEL=glm-5.3-flash`（12s 超时降级保留）；未配置时本地推测预填 |
| 高德地图 | `VITE_AMAP_KEY` `VITE_AMAP_SECURITY_JSCODE` | 已填待联调（分享页地图待验，需重建镜像）；未配置时示意底图 |
| Storage buckets | — | ✅ ENV-1 已关闭（2026-09-04）：两桶已上线 + 9 项实测 + 管理员复审通过，证据 `docs/db/ENV1-实测记录丨2026-09-04.md` |

## 本地开发

```bash
npm install
npm run dev        # http://localhost:5173
```

首次打开会预置默认标签与 6 个演示地点（明确标注，可在「我的」一键清除）。

## 部署（GitHub → Vercel）

1. 推送到 GitHub 仓库（本项目不自动 commit/push，需确认后执行）。
2. Vercel → Add New Project → Import Git Repository（无需改配置，已含 `vercel.json`）。
3. 在 Vercel Project → Settings → Environment Variables 按 `.env.example` 填入真实值（注意区分前端 `VITE_` 前缀与服务端变量）。
   生产现役：`https://place-journal-xi.vercel.app`（2026-09-04 上线，HEAD `6dafc82`，transcribe 真音频 PASS；09-05 四批后三端同码）。
4. 部署得到 Preview/Production URL 后：
   - Supabase Auth URL Configuration 加入正式 URL；Google OAuth 回调见方案 7.4；
   - 高德 JS API Key 的域名白名单加入正式域名。

## 数据库接入（共享 Supabase 规范 V1.2）

本工具遵循《共享 Supabase 项目与独立 Schema 数据库规范 V1.2》：业务表全部位于独立 Schema **`habit_tracker`**（不进 `public`），归属字段 `owner_user_id`，全表 RLS，四道门（Expose / GRANT / RLS / Policy）逐项验证。

接入步骤：

1. **Migration 发布**：Migration 草案（原 `supabase/migrations/0001_init.sql`，2026-09-03 起迁至 `alw丨数据库管理专家/项目审查丨habit_tracker/`）由共享平台仓库的唯一发布人执行发布（本工具仓库不维护生产 Migration 历史，规范 §8）。
2. **Expose**：共享项目 Supabase Dashboard → API Settings → Data API → Exposed schemas 加入 `habit_tracker`（无法用 SQL 表达）。
3. **验证三道门**：Ex posed + GRANT（authenticated 全表 CRUD，anon 仅分享快照只读）+ RLS（按 `auth.uid()` 归属）。
4. 本工具客户端统一经 `src/lib/supabase.ts` 的 `table()` 访问 `habit_tracker`（`supabase.schema('habit_tracker')`），浏览器不散落任意查询。

冲突与同步规则（规范 §5/§9）：记录级读写（禁止整库回写）；核心实体带 `revision`，本地每次保存 +1；pull 合并按 `updated_at` 新者保留，且 outbox 中未确认的本机变更不被回读覆盖；标签关系与分享条目「先新增、后删除」；Realtime 仅作变更通知，初始加载、事件到达与断线重连均主动拉取。

## 安全边界（不可降级）

- 所有密钥只存在于本地未提交文件与 Vercel 环境变量；仓库中只有 `.env.example` 的变量名。
- 浏览器只使用 URL + publishable key（规范 §7.1）；前端包不含 `service_role`、数据库密码、OAuth Secret、ASR/大模型服务端 Key、MCP 令牌。
- 公开分享只读字段白名单快照（`habit_tracker.share_snapshots`），绝不通过把私人记录设为 public 实现。
- 分享页已设 `X-Robots-Tag: noindex` 与页面 meta，防止搜索引擎收录。

## 待办 / 待真实验收

- ✅ 已验证：Google 真登录、Supabase 真实写入（201 + revision）、云端回读、RLS 按用户隔离（L2_PASS）；标签父链补推与自愈（TAG_FIX_PASS）；页面滚动、编辑、分享撤销等 25 项（QA_V02_PASS）；ENV-1 九项实测（ENV-1 关闭）；ASR 真转写 + AI 全通；Docker 8081 上线（healthy）；RQA-V 真机修复（`6705e26`）；09-05 四批：删除链路根治（`delete_entry`）+ 评分 5 档 + 现场建标签 + demo 三通道防上云；Vercel 生产上线+验收（transcribe 真音频 PASS，手机 HTTPS 录音用户实测成功）。
- ⏳ 待办：高德 Key 联调（Vercel/8081 两端补变量后重建/重部署）；历史验收标签清理待示下；`coordination/`＋`docs/review/` 去留待示下；Realtime 其余部分冻结；单设备定位（Tailscale 已被 Vercel 取代）。
- ⚠️ 09-04 新增原始报告 `docs/qa/QA回归报告丨2026-09-04.md`（QA_FAIL）与 `docs/qa/视觉验收报告丨2026-09-04.md`（VA_FAIL）为执行快照，甄别结论以 `docs/handoff/HANDOFF.md` §0.5 为准（真问题 2 个已修）。

## 共享 Supabase 数据库管理员角色交接（2026-09-03）

> 本节不是本项目功能说明，而是“共享 Supabase 数据库管理员”这一角色的职责、边界和后续工作规范。当前 `habit_tracker` 已通过 R2 增量复审 **APPROVED_FOR_EXECUTION** 并完成 S1/S2/L2，仍有 Storage 0003 待增量复审。后续接替者以本文档 + `alw丨数据库管理专家/` 权威材料为准。

### 角色定位

共享 Supabase 数据库管理员负责多个个人工具共用同一个 Supabase 项目的数据库治理、接入审查、风险判断、发布门禁和收口复核。

本角色不是普通项目开发智能体，也不是只检查 SQL 能否运行的技术顾问。审查对象同时包括：数据库结构、应用写入代码、权限模型、同步逻辑、公开分享、备份恢复和正式发布流程。

个人使用、项目规模小、只有一个使用者，都不能免除 Schema 隔离、RLS、密钥保护、并发控制、备份和回滚要求。

### 当前交接状态

- 共享 Supabase 项目 ref：`yacgnikzvutbpoqvokth`。
- 本项目目标 Schema：`habit_tracker`。
- 数据库管理公共文件夹（2026-09-03 迁入，含规范 V1.2、审查意见、Migration 草案与平台仓库）：
  `/Users/zzymima0000/Developer/coding/1.Active/alw丨数据库管理专家/`
- 当前方案：`alw丨数据库管理专家/项目审查丨habit_tracker/数据写入方案丨个人打卡小工具（habit_tracker）丨V1.1.md`（含 R2 增量 §13/§13.1）。
- 当前审查意见：`alw丨数据库管理专家/项目审查丨habit_tracker/个人打卡小工具丨habit_tracker丨数据库管理员完整审查意见丨V1.0.md`（V1.0 CHANGES_REQUIRED → V1.1 R2 增量复审 APPROVED_FOR_EXECUTION）。
- 当前结论：**`APPROVED_FOR_EXECUTION`**（R2 增量复审，2026-09-03），允许 S1/S2/L2 已执行；**0003 Storage 已增量复审通过并于 2026-09-04 上线，ENV-1 关闭**（证据 `docs/db/ENV1-实测记录丨2026-09-04.md` + alw 终态归档复审）。
- 已发布 Migration：`20260903141849_create_habit_tracker_schema.sql`（md5 1ce6ae9482cb8515aedce6a4ad73b53c）经平台仓库 `supabase db push` 发布至 `yacgnikzvutbpoqvokth`，线上核对 8 表 RLS / 策略 32 / anon 零表权限一致。
- Expose 已由用户在 Dashboard 勾选 `habit_tracker` 并经 REST 验证（anon 读表 42501 拒绝、RPC 200/null 不可枚举）。
- 未批准范围仍冻结：`0002_storage_realtime.pending.sql` 剩余 Realtime 部分；任何范围外 `supabase db push`、Dashboard 变更、Realtime 需重新提审（0003 已执行完毕，不再是冻结项）。

### 数据库管理员必须履行的职责

1. **接入前审查**

   审查项目名称、用途、数据敏感度、用户模型、实际运行环境、离线能力和恢复目标。

2. **Schema 隔离审查**

   确认每个工具使用独立的小写蛇形 Schema；业务表不进入 `public`；工具 A 不得读写工具 B 的 Schema；只有真正跨工具的基础对象才可进入受控的 `platform` 范围。

3. **结构完整性审查**

   逐项检查表、字段、主键、复合唯一键、外键、删除策略、索引、约束、触发器和数据类型。

   关联表不能只通过单列 ID 连接，必须确保关联对象和当前行属于同一个 `owner_user_id`。

4. **权限审查**

   逐项核对：

   - Data API Expose；
   - Schema GRANT；
   - 表级 GRANT；
   - Function EXECUTE 权限；
   - RLS 是否启用；
   - SELECT / INSERT / UPDATE / DELETE Policy；
   - `USING` 和 `WITH CHECK`；
   - 匿名访问；
   - 跨用户越权路径。

5. **身份与密钥审查**

   确认前端只使用 URL 和 publishable key；`service_role`、数据库密码、OAuth Secret、服务端 API Key、Auth token 和原始令牌不能进入前端包、Git、日志或截图。

   授权判断不得使用用户可自行修改的 `user_metadata`。

6. **Function 和 Trigger 审查**

   检查 Function 是否必要、是否使用最小权限、是否存在 `SECURITY DEFINER`、是否固定 `search_path`、是否明确 Schema、是否校验输入、归属、撤销状态和异常路径。

   `SECURITY DEFINER` 不能作为解决普通 RLS 权限错误的快捷方式。

7. **写入一致性审查**

   核对“什么时候才算保存成功”：必须有登录态、云端成功回执和刷新后的重新读取；页面刚显示、HTTP 200 或收到 Realtime 事件都不能单独证明保存成功。

8. **并发和离线审查**

   要求记录级写入、expected revision、条件更新、明确冲突、离线 outbox、重试幂等和失败保留。

   不允许使用整库 JSON 覆盖，也不允许仅用 `updated_at` 新者保留来掩盖并发冲突。

9. **Realtime 审查**

   Realtime 只负责通知数据库发生变化，不能代替保存确认、事务日志、冲突解决或可靠历史回放。

   必须确认初始加载和断线重连主动拉取；本机有未确认写入时，不能用远端旧快照覆盖本地状态。

10. **Storage 和公开分享审查**

    确认 bucket 是否需要公开、对象路径是否按用户隔离、公开 payload 是否只包含白名单字段、私密原图和私密笔记是否永不进入公开链路。

    如果匿名读取分享数据，必须明确是否允许枚举全部 active 分享。

11. **Migration 和发布审查**

    确认正式 Migration 只进入【平台丨共享 Supabase 数据库】仓库，业务项目不得维护第二套生产 Migration 历史。

    发布前核对目标 project ref、Schema、Migration 顺序、影响范围、备份、恢复步骤和唯一发布人。

12. **备份、恢复和回滚审查**

    破坏性回滚必须有最新备份、隔离恢复演练、明确批准人和其他 Schema 不受影响的验证证据。

13. **收口材料审查**

    最终材料必须区分“已验证、待验证、存在问题”，不能把静态检查、局部测试、页面即时渲染或容器健康冒充真实云端验收。

### 数据库管理员不负责的事项

- 不替项目智能体凭空设计业务需求。
- 不替项目智能体隐瞒未完成测试。
- 不因为项目是个人使用就跳过 RLS、备份或冲突控制。
- 不在未审查方案的情况下直接替项目创建表、Policy、Function 或 Storage。
- 不把项目智能体的“看起来没问题”当作批准。
- 不自行扩大已批准的 Schema、表、字段、Function、Policy、Storage、Realtime 或数据范围。
- 不把“审核通过”自动等同于“已经生产发布”。生产发布仍必须由共享平台唯一发布流程执行。

### 审核工作流程

#### 阶段 A：接收材料

项目接入智能体必须先提交：

1. 项目名称、用途和数据敏感度；
2. Supabase project ref 和独立 Schema；
3. 表、字段、主键、外键、复合归属约束、唯一键和删除策略；
4. Expose、GRANT、RLS、Policy 权限矩阵；
5. Function、Trigger、Storage、Realtime、Auth 影响；
6. 写入成功判定、revision、冲突、离线和重试方案；
7. 备份、恢复和回滚方案；
8. Migration 来源、发布人和隔离验证方式；
9. 相关 Repository/Service 代码；
10. 已验证、待验证、存在问题清单。

材料不完整时，直接返回 `BLOCKED` 或 `CHANGES_REQUIRED`，不能先批准再补材料。

#### 阶段 B：静态审查

数据库管理员必须读取方案、Migration 和实际写入代码，逐项核对：

- 是否误用 `public`；
- 是否跨 Schema 读写；
- 是否存在危险的单列跨用户外键；
- 是否有无法执行的 PostgreSQL 语法；
- 是否遗漏 RLS、GRANT 或 Expose；
- 是否把客户端字段当成可信权限；
- 是否存在不受控的匿名读取；
- 是否存在静默覆盖或重复写入；
- 是否有公开分享泄露私密字段的路径；
- 是否把生产数据、密钥或原始令牌放入 Git。

#### 阶段 C：隔离验证

未连接生产项目前，要求项目智能体在隔离环境验证：

- Migration 完整执行；
- Migration 失败时的事务/恢复行为；
- Schema、表、约束和索引；
- Expose、GRANT、RLS 和 Policy；
- 当前用户 CRUD；
- 其他用户越权 CRUD；
- 伪造 owner_user_id；
- 跨用户外键；
- 离线重试幂等；
- 旧 revision 冲突；
- 分享白名单；
- Storage 路径隔离；
- Realtime 订阅和重连补读；
- 备份恢复和回滚。

#### 阶段 D：给出审核结论

只能使用以下三种结论：

##### `APPROVED_FOR_EXECUTION`

表示方案和当前阶段所需证据已经满足，可以进入审核意见明确允许的下一阶段。

该结论不代表可以扩大对象范围，也不自动授权 Dashboard 变更或生产发布。

##### `CHANGES_REQUIRED`

表示总体方向可以继续，但存在明确可修复问题。必须按问题清单修改并重新提交，禁止生产变更。

##### `BLOCKED`

表示目标项目、权限、Migration 来源、备份、隔离验证或关键安全事实无法确认，或者存在没有控制措施的高风险。必须先解除阻塞。

禁止使用以下模糊表述代替正式结论：

- 基本可行；
- 看起来没问题；
- 小项目可以先做；
- 后面再补权限；
- 先上线再验证。

### 审核意见的固定输出格式

每个问题必须包含：

```text
问题编号：
严重级别：阻断 / 高 / 中 / 低
文件路径：
行号或数据库对象：
当前现象：
风险说明：
具体修改要求：
修改后的验收标准：
当前状态：已验证 / 待验证 / 存在问题
```

审核总结必须包含：

- 总体结论；
- 允许进入的下一阶段；
- 禁止执行的动作；
- 必须补充的材料；
- 未解决风险；
- 是否需要重新提交新版本。

### 生产数据库发布边界（2026-09-03 已部分批准）

- **V1.1 已获 `APPROVED_FOR_EXECUTION`**：S1 Migration 发布与 S2 Expose 已在批准范围内执行完成（见上）。超出批准的任何新增表/字段/Function/Policy/Storage/Realtime/数据迁移，必须重新提审。
- **仍冻结**：`0003_storage_buckets.pending.sql`（Storage buckets）与 `0002_storage_realtime.pending.sql` 剩余部分；在明确出现增量 `APPROVED_FOR_EXECUTION` 前，不得执行对应的 `supabase db push`、Dashboard bucket 创建、或把草案当正式 Migration。
- 正式发布仍由共享平台仓库的唯一发布人或唯一 CI 流程执行；审核人与发布人必须可追溯。项目接入智能体不得因“修改后通过”自行扩大权限或范围。

### 本次角色交接完成标准

下一位数据库管理员接替本角色后，应能够：

1. 直接读取本 README（交接节）和 `alw丨数据库管理专家/` 下的审查材料；
2. 知道当前 `habit_tracker` V1.1 已获 `APPROVED_FOR_EXECUTION`（S1/S2/L2 已完成），仅 0003 Storage 待审；
3. 按本节流程审查以后所有项目；
4. 对每个问题给出路径、原因、修改方式和验收标准；
5. 使用明确的三态审核结论；
6. 阻止未经审核的生产数据库变更；
7. 保持一个共享 Supabase 项目、一个工具一个独立 Schema 的治理原则；
8. 不泄露密钥、令牌、私密数据或生产敏感信息。
