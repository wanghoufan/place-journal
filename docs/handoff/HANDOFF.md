# HANDOFF 丨 个人打卡小工具（地点手账 PWA）丨 2026-09-04 快照（ENV-1 Storage 实测通过 + 管理员复审关闭后收工）

> 用途：新智能体接续恢复开发的**唯一入口文档**。先读本文，再按「必读文档」顺序补齐上下文。
> 项目路径：`/Users/zzymima0000/Developer/coding/1.Active/ing 丨0831个人打卡小工具 MACMINI GL`
> 项目一句话：移动优先的地点手账 PWA——拍照/语音记录 → AI 整理入库 → 按地点/标签/时间回顾 → 自然语言找地点 → 分享快照。本地优先（IndexedDB）+ Supabase 云同步。

> ⚠️ **2026-09-03 路径变更**：数据库治理材料（规范 V1.2、写入方案与审查意见、Migration 草案、平台仓库）已迁至
> `/Users/zzymima0000/Developer/coding/1.Active/alw丨数据库管理专家/`。
> 本文中出现的 `docs/db/…`、`supabase/migrations/0001_init.sql` 等路径一律以 alw 文件夹内对应文件为准（`项目审查丨habit_tracker/` 与 `平台丨共享 Supabase 数据库/` 子目录）。

---

## 0. 2026-09-04 收工快照（最新状态，先读这里）

### 0.1 当前工作进展

| 事项 | 状态 | 关键信息 |
|---|---|---|
| 数据库审查 | ✅ 全部通过 | V1.1 经 R2 增量复审 `APPROVED_FOR_EXECUTION`（详见 [数据写入方案 V1.1](/Users/zzymima0000/Developer/coding/1.Active/alw丨数据库管理专家/项目审查丨habit_tracker/数据写入方案丨个人打卡小工具（habit_tracker）丨V1.1.md) §13/§13.1） |
| S1 迁移发布 | ✅ 已上线 | Migration `20260903141849`（md5 1ce6ae9482cb8515aedce6a4ad73b53c）经平台仓库 db push 至共享项目 yacgnikzvutbpoqvokth；线上只读核对与隔离验证一致（8 表 RLS、策略 32、anon 零表权限、仅可执行 public_share_read） |
| S2 Expose | ✅ 完成+验证 | 用户 Dashboard 勾选 `habit_tracker`；REST 验证：anon 读表 42501 拒绝、RPC 200/null（不可枚举）。跨 Schema 用 `Accept-Profile`（GET）/`Content-Profile`（POST）头 |
| L2 云端写入验收 | ✅ **L2_PASS** | 真登录（Google OAuth）→ POST places/entries 201 → 清 localStorage 重登 7/7 回读；证据归档本项目 `docs/acceptance-l2/`（L2-REPORT.md、脱敏 HAR、截图 10 张） |
| 标签丢失 bug | ✅ **TAG_FIX_PASS**（2026-09-03 18:00 复核通过） | 根因：演示标签从未上云 → entry_tags 外键失败 + pullRemote 硬编码 `tagIds: []` 覆盖本地。修复：`src/lib/sync.ts` 新增 `ensureTagsInCloud` + merge 保留本地 tagIds。QA 6/6 通过（T1–T6 全 PASS）；观察项 T2-B「父链补推」**已修复**（ensureTagsInCloud 沿 parent_id 递归展开整链、父先于叶推送，tsc+build 通过；注意该修复在 QA 通过之后，未做云端实测，下次联网同步观察含父链标签即可）；证据 `docs/acceptance-l2/L2-REPORT.md`「标签同步修复回归验收」section |
| 单设备定位 | ✅ 用户决定 | **不做双设备/并发/断线重连验收（L3 取消）**；乐观锁与 Mine 页冲突裁决 UI 仅作兜底 |
| 平台仓库 | ✅ 基线 commit `efddca5` | 无 remote 未推送；prompt_manager 未推送 Migration `20260901163555` 原样保留（任何 db push 会连带推送它，⚠️ 需 prompt_manager 项目决策） |
| 业务项目 git | ✅ 3 个 commit | `aaa178f` 全量基线 → `19eb499` 编辑功能 → `51b67d2` QA 基线文档；无 remote 未推送（push 需用户二次确认） |
| 编辑已有记录 | ✅ 已实现+已提交 | EntryDetail「分享/编辑/删除」：评分/日期/人均/感受/公开理由/标签可改（QA 遗留事项 3）；tsc+build 通过，**未经 QA 实测** |
| QA 基线 V0.2 | ✅ 已执行 | [docs/qa/QA-BASELINE丨V0.2.md](docs/qa/QA-BASELINE丨V0.2.md)：锚定 `19eb499`，5 组 checklist（编辑 6 项/标签 T1–T8/核心链路/滚动手势/同步状态）+ 红线；整轮回归已完成见下 |
| 第二轮 QA（V0.2 整轮回归） | ✅ **QA_V02_PASS（25/25）** | 报告 [docs/qa/QA-REPORT丨V0.2.md](docs/qa/QA-REPORT丨V0.2.md)（含开发侧后处理附录）；K1 滚动**未复现**（D1–D5 全过）、K2 T7/T8 **实证通过**；A 编辑 6/6 |
| QA 后修复（第二轮） | ✅ 已实测 | ENV-2：`ensurePlacesInCloud` + `sweepDirtyRows` 自愈（万绿园 place+2 entry 实测上云）；ENV-1 连带：封面置空推送/回填、分享快照尽力而为、revoke 幂等、media ≥5 次放弃标 failed；OBS-1：toShareItem 补 tags。**全经 CDP 实测：outbox 清零、脏行 0** |
| 遗留环境项 | ✅ **ENV-1 全链闭环（2026-09-04）** | 两桶（`habit-tracker-media-private`/`habit-tracker-media-share`）已按 [0003](/Users/zzymima0000/Developer/coding/1.Active/alw丨数据库管理专家/项目审查丨habit_tracker/0003_storage_buckets.pending.sql) 上线；真登录 UI 实测 9 项全过：私有桶上传（canvas 压缩 558KB→display 169KB+thumb 25KB，路径 `owner/place/media/`）、本人签名 URL 读 200、**匿名读 400**、分享封面（slug `a3r3ppfnenp3dx4b`）**匿名 200**、匿名 RPC 快照白名单无泄漏、6.3MB→**413**、text/plain→**415**、png 正例 200（测后已删）、匿名写 403、越权写他人目录 403。**管理员已复审通过，ENV-1 关闭**。云端保留 1 条真实记录（绿野书屋）+ 1 个活跃分享（验收数据，可复用）。实测报告已落盘（见 0.1「ENV1 实测报告」行） |
| outbox 时序修复 | ✅ 已回归（2026-09-04） | `src/pages/AiConfirm.tsx` 先 `saveEntry` 后 `saveMedia`；逐秒轮询 outbox 证据：入队序正确→entry 先推成功→media 一次通过 synced→封面回填入队→清零，全程零错误；云端复核 `revision=2` + `cover_media_id` 回填 |
| 匿名分享页 bug 修复 | ✅ 已修复+实测（2026-09-04） | `src/lib/shares.ts fetchCloudShare`：RPC items 为嵌套结构（item jsonb 列），原按扁平读致匿名访客分享页丢字段（无店名/封面，`📍 undefined`）。修复解嵌套；无痕视角实测封面（公开桶 640px）+字段完整渲染，tsc 通过 |
| ENV1 实测报告 | ✅ 已落盘 | [docs/db/ENV1-实测记录丨2026-09-04.md](docs/db/ENV1-实测记录丨2026-09-04.md)（9 项数据 + 截图 4 张于 docs/db/env1-evidence/）；收口清单 ENV-1 行已更新 ✅ |
| 滚动异常 K1 | ✅ 未复现 | QA D1–D5 全过（含 1661px 长页/相册横滑/键盘）；用户如再遇，按基线 §5-D 固化步骤报修 |

### 0.2 下一步任务（按优先级）

1. ~~ENV1 实测报告落盘~~ ✅ 2026-09-04 完成（含截图 4 张）；~~Chrome 环境修复~~ ✅（优雅退出 + 清 IDB 目录后恢复）；~~outbox 修复回归~~ ✅ PASS；~~清单 ENV-1 状态~~ ✅ 已更新。
2. ~~git commit~~ ✅ **已提交 `41ebe90`**（outbox 时序 + 匿名分享映射 + 重复标签合并 + ENV1 报告/截图；未 push）。**另修：Find 页重复标签 bug（2026-09-04 用户报）**——根因：清验收环境后本地重播种 demo 标签 + pullRemote 拉回云端套，同名两套并存（55 标签/8 维度）；已合并（55→30，entries 引用重映射，云端本无重复）+ Find.tsx 同名去重兜底，实测 PASS。遗留：QA 验收临时标签（验收T3/T7 等）仍在标签库，可手动删或待用户示下。
3. ~~真 Key 联调~~ ✅ **2026-09-04 全通**：① 腾讯 ASR SentenceRecognition 真实转写 PASS（「今天下午去了万绿园散步…」逐字一致）；② AI 整理 OpenCode Go（`glm-5.3-flash`）结构化 JSON PASS（score/budget/summary/tags 合同全对）。**Docker 自托管已上线**：规范副本 `Developer/coding/docker/personal-checkin/`（deploy.sh 流程），`http://localhost:8081`（Mac）/ `http://192.168.31.60:8081`（局域网）。**部署中修 4 个自托管 bug**（均在 server.mjs/api 层，已 push）：处理器 esbuild 双层 default 解包、res.status().json() shim、腾讯 TC3 头 `X-TC-Timestamp` 笔误、opencode 端点自动补 `/chat/completions`。腾讯 ASR 曾报 not authorized（用户控制台开通后自愈）。
4. ~~自验收~~ ✅ 2026-09-04 SELF_CHECK_PASS（8081 生产版：首页/三tab/详情/控制台全净；子代理浏览器无登录态属环境因素）。**已交付两份转交提示词（对话内）**：QA 回归测试（R1-R5 今日修复回归 + B1-B5 基线回归）与产品视觉验收（8 屏走查），报告落点 docs/qa/QA回归报告丨2026-09-04.md 与 docs/qa/视觉验收报告丨2026-09-04.md，均未执行。
5. **下一步（按优先级）**：① 用户把 QA 回归提示词转交执行→看 R1-R5 是否全 PASS；② 视觉验收提示词转交→P0/P1 必修、P2 攒版；③ Tailscale 穿透（用户 Mac/手机装 Tailscale 同账号登录后，配 tailscale serve HTTPS → 手机外网访问 + 解锁手机语音录音）；④ 高德 Key 联调（VITE_AMAP_* 已填，分享页地图待验）；⑤ 收尾：QA 验收临时标签清理待用户示下、Vercel 云端部署决策（当前只有自托管）。
6. **不修留档的观察项**：① 分享面板创建后不自动同步（create_share 等下次同步才上云，期间匿名访客见「链接已失效」）；② owner 打开自己的分享链接封面空白（本地快照 blob 失效，匿名访客正常）；③ OBS-2 lastSyncError 显示被 reload 重置。

### 0.3 注意事项及相关规矩

1. **审批边界**：0002 Storage/Realtime 仍冻结；共享库任何 Schema/表/字段/函数/策略变更必须先过管理员审批，唯一发布入口是平台仓库（`alw丨数据库管理专家/平台丨共享 Supabase 数据库/`）的 supabase db push。
2. **密钥红线**：前端只允许 publishable/anon key（已在 `.env.local`，勿入 git）；service_role/数据库密码绝不进前端、不进文档；HAR/截图归档前必须脱敏。
3. **路径变更**：数据库治理材料在 `alw丨数据库管理专家/`（项目审查丨habit_tracker/ 与 平台丨共享 Supabase 数据库/）；本项目 `docs/db/` 只放送审清单，`supabase/migrations/0001_init.sql` 已不是权威版本。
4. **送审格式**：凡有文件需转送其他智能体/管理员，写入项目 `.md` 清单，给用户**绝对路径纯文本**（不用 file:// 链接），一个入口文件 + 全部材料路径。
5. **单设备约束**：不为双设备/并发场景做开发或验收；同步协议里的冲突处理只作数据安全兜底。
6. **验证纪律**：云端写入验收以 REST 回执/云端直读为准，页面显示≠同步成功；RLS 验证必须用 authenticated/anon 角色（superuser 绕过 RLS）。
7. **prompt_manager 是相邻项目**：共用 Supabase 但互不归属；本项目的 bug 不要顺手改它（2026-09-03 曾发生两项目交叉混淆，用户已叫停）。
8. **Chrome 验收自动化坑（2026-09-04）**：QA Chrome 启动参数 `--user-data-dir=/tmp/chrome-cdp-profile --remote-debugging-port=9334`；TRAE 沙箱会拦 Chrome 的系统访问（Crashpad/Keychain），Chrome 相关命令需 `dangerouslyDisableSandbox`；**强杀（pkill -9）Chrome 会挂死该 profile 的 IndexedDB**（`ensureSeeded` 永不落地 → 应用白屏且零 console 报错），退出尽量走优雅路径；Google OAuth 登录不得代输凭据，必须用户亲自完成；复用同一 profile 免重复登录。

---

## 1. 必读文档（按顺序）

| 顺序 | 文档 | 作用 |
|---|---|---|
| 1 | 本文档 §0 | 现役收工快照（唯一权威） |
| 2 | 项目根 `HANDOFF.md` | 入口指针（已瘦身，详见本文 §0） |
| 3 | `docs/V1_PRODUCT_AND_TECHNICAL_PLAN.md` | SSOT 产品与技术方案（M0–M6），需求以此为准 |
| 4 | `.workbuddy/memory/2026-09-03.md`、`2026-09-02.md`、`2026-09-01.md` | 开发全程日志（09-03 含 L2/QA 实测细节） |
| 5 | `alw丨数据库管理专家/2026-09-03 丨 共享 Supabase 项目与独立 Schema 数据库规范 丨 V1.4.md` | 数据库规范（当前生效 V1.4；迁移 SQL 必须符合它） |
| 6 | `alw丨数据库管理专家/平台丨共享 Supabase 数据库/` | 正式 Migration 仓库与 DATABASE_CATALOG |

> 以下 §1–§4 为 2026-09-02 前的历史记录，已被 §0 收工快照取代，仅保留作追溯；现役状态一律以 §0 为准。

## 2. 当前工作进展（历史，2026-09-02 快照，已被 §0 取代）

### 2.1 已完成（三轮阶段）

1. **M0–M6 全量功能**（V1.0）：画廊/记录/AI 确认/详情/找地点/两层标签/我的/分享快照/地图总览全部页面；腾讯 ASR、大模型（OpenRouter/DeepSeek/OpenCode 可切换）、高德地图适配层全部支持「未配置降级不阻塞」。
2. **数据库规范 V1.1 收口**：8 表在独立 Schema `habit_tracker`（不进 public）、`owner_user_id`、四道门（Expose/GRANT/RLS/Policy）、Realtime publication、2 个 Storage bucket、entry_tags 归属一致性触发器。迁移草案见 `supabase/migrations/0001_init.sql`（头部含设计问答，待提交【平台丨共享 Supabase 数据库】仓库发布）。
3. **数据库规范 V1.2 + Docker 规范 V1.0 对齐（2026-09-02 本轮，最新）**：
   - `src/lib/sync.ts`：`pullRemote` 合并时 **outbox 未确认本机变更（sync ≠ synced）不被远端覆盖**（V1.2 §9.2.4），并修复远端较新时 push 产生重复行的缺陷；新增 `startRealtime/stopRealtime`（V1.2 §9.1：Realtime 仅通知、初始/断线重连主动补读、outbox 非空不拉取、登出断开），接线在 `src/main.tsx`。
   - Docker 产物齐备（project_slug = `personal-checkin`）：`Dockerfile`（多阶段：vite build + esbuild 打包 `api/*.ts`）、`server.mjs`（node:http 静态 dist + 与 Vercel Functions 同一实现的 `/api` + `/healthz`）、`compose.yaml`、`.dockerignore`、`docker/env.template`。无本地数据库/服务端文件 → 暂无 Named Volume 与 DockerData bind mount（compose 内有注释边界）。
   - 全仓规范引用 V1.1 → V1.2（env.ts、.env.example、迁移 SQL 头部、README、根 HANDOFF.md）。

### 2.2 验证状态（规范 V1.2 §11 分层，2026-09-02 历史）

- ✅ **L0**：`tsc -b && vite build` 通过；`server.mjs` 冒烟通过（/healthz、静态、SPA fallback、/api 501 降级）。
- ✅ **L1（本地持久化，2026-09-02 CDP 无头 Chrome 实测 PASS）**：完整保存流程（选地点 → 填感受 → AI 确认 → 入库）走通；IndexedDB 升 v2；刷新/重开详情页数据完好；应用级 console error = 0。
- ✅ **L2**：历史快照中为“待做”；**现役结论见 §0：L2_PASS、TAG_FIX_PASS、QA_V02_PASS 均已通过（2026-09-03）**。
- ⏳ **L3–L5（历史标注“全部未做”）→ 现役：单设备定位，L3 已取消（用户决定，见 §0.1）；Storage/Realtime 冻结待平台规则**。
- **Git/Docker（历史）**：当时“业务项目 git 未 commit”；**现役：业务项目 `aaa178f`→`86f01ac` 共 6 commit，平台仓库 `efddca5` 基线，无 remote 未推送，push 需用户二次确认；Docker 仍待授权未创建（见 §0）**。

### 2.3 本轮修复（2026-09-02 L1 验收时）

1. `/record`、`/confirm` 流程页隐藏底部导航与悬浮「记录」按钮（原先 FAB 会实际拦截表单控件点击，见 `src/App.tsx` 的 `isFlow`）。
2. IndexedDB `outbox` store 补开 `autoIncrement`（v1 缺陷：`enqueue` 的 `add` 无 seq 必 DataError，是潜在 L2 阻断点），DB_VERSION 1→2 自动重建队列（临时数据，安全）。见 `src/lib/idb.ts`。
3. **已建好 `.env.local`**（被 .gitignore 忽略；普通 `.env` 未被忽略，真实 Key 绝不放 `.env`）：全部占位符就位，每段注释写明获取地址。**只差用户填 `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` 两行**（Dashboard → Project Settings → API → Project URL / Project API Keys → Publishable key；禁 service_role）。填好后需重启 vite。

## 3. 下一步任务（历史，2026-09-02 建议顺序，已被 §0 取代）

| # | 谁 | 任务 | 现役状态 |
|---|---|---|---|
| 1 | 用户/管理员 | **先交审查**：把写入方案交管理员审批并发布迁移、Expose | ✅ 已完成（V1.1 R2 APPROVED_FOR_EXECUTION → S1 已发布 `20260903141849`，S2 已勾选） |
| 2 | 用户 | 填 `.env.local` 的 `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` | ✅ 已完成（L2 已用真 Key 验证通过） |
| 3 | 用户确认后 | 智能体执行 **git commit/push** | ✅ 业务项目已 6 commit，待 push 需二次确认；平台仓库 `efddca5` |
| 4 | 智能体 | 逐项打通：登录 → 同步 → ASR → 大模型 → 高德 | ✅ 登录/同步已 L2_PASS；ASR/大模型/高德保持降级可用，待 Key |
| 5 | 用户确认后 | Docker 部署 | ⏳ 待授权（产物齐备，未创建 `Services/personal-checkin/`） |
| 6 | 用户确认后 | Vercel 部署 | ⏳ 待确认（`vercel.json` 已备好） |
| 7 | 智能体 | 观察项：FAB 视觉重叠 | 已修复挡表单；列表/FAB 重叠为设计固有，待用户定夺 |

## 4. 注意事项及相关规矩（必须遵守）

### 4.1 硬性守则（用户全局规则）

- **未经用户明确确认，禁止 git commit / push；推送需二次确认。**
- **未经用户明确授权，不创建/删除/迁移/覆盖** `Services/`、`DockerData/`、`DockerBackups/`、Docker Named Volume；不启动新生产容器、不公开新端口。
- 所有 HTML/页面强制**响应式**，禁止固定像素宽度；统一**浅色主题**。
- API Key 只进 `.env` / 部署 `.env.local`；浏览器只放 `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY`（规范 V1.2 §7.1），`service_role`/数据库密码/MCP 令牌/服务端 Key 绝不进前端包、Git、日志、截图。
- 每次代码修改后必须实测并附 preview 链接；一次只做一个特性，验证后再下一个。
- 演示数据可一键清除且不复活（`demo_seeded` meta），必须标识为演示。
- 接入智能体不是数据库审核人：不得自行发布 Migration、执行 `supabase db push`、改 Dashboard。

### 4.2 规范要点（V1.2 + Docker V1.0 摘要）

- 业务表只在 Schema `habit_tracker`，统一走 `src/lib/supabase.ts` 的 `table()`；禁止业务表进 `public`、禁止整库 JSON 覆盖式回写。
- 「已保存到云端」唯一标准：登录态 + 写入成功回执 + 刷新重读仍在（多端还需另一设备互见）；页面即时显示 / HTTP 200 / 收到 Realtime 事件都不算。
- Realtime 只通知，不做保存确认或冲突合并；outbox 有未确认变更时不得被回读覆盖（已实现，改动 sync.ts 前先理解这个约束）。
- 记录级写入；标签关系、分享条目「先增后删」；核心实体 revision 每次本地保存 +1。
- Docker：`VITE_*` 是构建期变量，改动必须**重建镜像**不能只重启；容器 Up/HTTP 200 只代表 Runtime 层，不代表数据库/RLS/多端验收；备份只放 `DockerBackups/personal-checkin/`，不进 Git。

### 4.3 踩坑记录（详见根 HANDOFF.md §6，勿重蹈）

1. sessionStorage 存 Blob 会序列化成空对象 → 已改内存模块 `draft.ts`。
2. PG CHECK 不允许子查询 → entry_tags 归属校验用触发器。
3. dev 下 `/api` 404 返回 HTML → 适配层按 content-type 判定「未配置」。
4. 中文数字筛选（「人均五十」「给四星」）需 cnToNumber 转换。
5. **端口约定：5173 = dev，4175 = preview（4173 被其他进程占用，勿动）**；避免占用其他项目端口 3000/3001/3100；Docker 宿主机端口用 8081。
6. 演示图禁止 SVG 占位文字，用 picsum.photos seed 图。
7. **自动化测试浏览器（browser_use 等）会复用档案并命中 PWA SW 缓存的旧 bundle**，导致"修复未生效"假象；本项目 `sw.js` 是 `no-cache`，真实浏览器自动更新。验收时用无头 Chrome 独立 profile（`--user-data-dir=/tmp/xxx`）+ CDP 驱动（Node 22 内置 WebSocket 即可，参考 /tmp/cdp-test.mjs 思路），或先 unregister SW + 清 caches。另：测试智能体自己 evaluate 探测 IndexedDB 会在 console 留下 NotFoundError/DataError 假报错，勿当产品缺陷。

### 4.4 环境备注

- Node 用 managed 路径：`/Users/zzymima0000/.workbuddy/binaries/node/versions/22.22.2-2/bin/node`。
- 恢复开发：`npm install` → Key 填 `.env.local`（已建好占位符；普通 `.env` 未被 gitignore，禁用）→ `npm run dev`（5173）或 `npm run build && npm run preview -- --port 4175`；改 `.env.local` 后需重启 vite。

---

## 5. 开发暂停后的最新交接（2026-09-03 历史，**已被 §0 收工快照取代**）

> 本节为 2026-09-03 开发暂停时的阶段性交接（当时 S2 待勾选、L2 刚通过）。**2026-09-03 晚收工后，权威状态已迁移至 §0**；本节仅保留作追溯，行内“当前”指当时当刻。

### 5.1 当前工作进展

| 事项 | 状态 | 已确认事实 / 边界 |
|---|---|---|
| 产品功能 | ✅ 已完成主体 | M0–M6 页面与主要业务流程已完成：地点、记录、AI 确认、标签、搜索、分享、地图等。 |
| 本地数据层 | ✅ L1 已验证 | IndexedDB + outbox 本地流程已通过；完整保存、刷新、重新打开详情页可读。 |
| Supabase 目标 Schema | ✅ 已发布 | 共享项目 `yacgnikzvutbpoqvokth` Schema `habit_tracker` 经管理员 R2 复审 `APPROVED_FOR_EXECUTION` 后发布（Migration `20260903141849`，与送审版字节一致）；Expose 已由用户勾选并验证。 |
| 数据库写入方案 | ✅ 已通过 | V1.1 经 R2 增量复审 `APPROVED_FOR_EXECUTION`（§13.1）；0002 Storage/Realtime 仍冻结待平台规则。 |
| Migration | ✅ 已发布 | 平台仓库 `supabase/migrations/20260903141849_create_habit_tracker_schema.sql` 已 db push 至共享项目并完成线上只读核对（8 表 RLS、策略 32、anon 零表权限）。 |
| Supabase 真实写入 | ✅ L2_PASS | 真登录、云端写入回执（201+revision）、清 localStorage 重登重读、RLS 按用户隔离全部通过（2026-09-03，证据 `docs/acceptance-l2/`）。 |
| 双设备 / 冲突 / 重连 / 恢复 | ⏳ 单设备定位 | **L3 已取消**（用户决定，见 §0）；乐观锁与冲突 UI 仅作兜底 |
| Docker | 📝 产物已准备 | Dockerfile、Compose、server.mjs 等已具备；尚未创建 `Services/personal-checkin/`（待授权） |
| Key 与环境 | ✅ 已配置 | `.env.local` 已填 `VITE_SUPABASE_URL` + publishable key（L2 已验证，仅 anon 凭据） |
| Git | ⚠️ 部分已提交 | 业务项目 `aaa178f`→`86f01ac` 共 6 commit（1 个未提交 `.workbuddy/memory`）；push 需二次确认 |

### 5.2 数据库管理员已经指出的必须修复项（V1.0 阶段历史，已在 V1.1 中全部修复并获 APPROVED）

> 以下 11 项为 V1.0 审查意见当时指出的阻断项；V1.1 已逐项修复并通过 R2 增量复审。保留清单作追溯，新智能体以 `alw丨数据库管理专家/项目审查丨habit_tracker/` 权威材料为准：

1. 删除 `tags_two_levels` 中包含子查询的 CHECK，改用触发器；当前写法会导致 PostgreSQL Migration 执行失败。
2. 为 `tags`、`entries`、`media`、`entry_tags` 等关联关系增加 `(id, owner_user_id)` 复合唯一键和复合外键，确保不同用户的数据不能互相串联。
3. 将 `revision` 从“字段声明”改成真正的乐观锁：旧 revision 条件更新，返回 0 行必须明确冲突；不得用 `updated_at` 新者覆盖作为最终冲突规则。
4. 修改应用同步代码中的直接 `upsert`，尤其是 `src/lib/sync.ts` 的 places、entries、media 更新路径，使其带 expected revision 并检查返回行数。
5. 明确 `id`、`client_id` 的职责；为 `share_items` 增加稳定幂等 ID 或 `(snapshot_id, client_id)` 唯一约束，确保离线重试不会重复插入。
6. 对公开分享 payload 增加数据库或受控服务端白名单保护，不能只靠前端保证 `note_private` 不进入分享；同时修复当前 `shareRows()` 写入 `payload: {}` 的实现不一致问题。
7. 明确 Storage bucket、`storage.objects` policy 和 `supabase_realtime` publication 是否属于 V1.2 允许的受控注册动作；在规则未明确前不得执行这些 SQL。
8. 明确匿名分享是否允许枚举全部 active 分享；如果要求“仅知道链接才能访问”，不能直接给 anon 全表 SELECT。
9. 将 `drop schema ... cascade` 标记为破坏性回滚，并补充备份、隔离恢复、管理员批准和其他 Schema 不受影响的验证流程。
10. 不得把包含 `create policy`、`create trigger`、`alter publication`、`add constraint` 的整份 Migration 宣称为完全幂等。
11. “places 可复用已有”只能指复用 `habit_tracker` 自己 Schema 内的数据，不能读取或复用 `prompt_manager`、`public` 或其他工具的数据。

完整解释、修改方向和验收标准以以下文件为准，不要只根据本节摘要修改：

`/Users/zzymima0000/Developer/coding/1.Active/alw丨数据库管理专家/项目审查丨habit_tracker/个人打卡小工具丨habit_tracker丨数据库管理员完整审查意见丨V1.0.md`

### 5.3 恢复开发后的严格任务顺序

开发暂停期间不执行以下任务。只有用户明确要求恢复开发后，才按顺序执行：

1. **只读盘点**：先阅读本节、完整数据库审查意见、V1.2 数据库规范、产品技术方案和现有代码；检查 Git 状态，不覆盖已有改动。
2. **修订方案**：生成 V1.1 写入方案，逐项回应完整审查意见；同时修订 Migration 草案和相关应用写入代码。
3. **隔离验证 SQL**：在隔离环境完整执行 Migration，验证标签、复合外键、RLS、GRANT、函数、触发器、Storage、Realtime 和回滚方案；不得连接生产项目做试错。
4. **重新提交数据库审核**：提交 V1.1 方案、Migration 差异、权限矩阵、并发方案、幂等方案、公开分享方案、备份恢复记录和未解决问题。
5. **等待明确审核结论**：只有共享 Supabase 数据库管理员明确批准后，才能进入发布准备。`CHANGES_REQUIRED` 或“口头看起来没问题”都不等于批准。
6. **正式发布前准备**：正式 Migration 只能进入【平台丨共享 Supabase 数据库】仓库；核对目标项目、Schema、Migration 顺序、备份和发布人。接入智能体不得自行生产 `supabase db push`。
7. **配置 Expose 和开始 L2**：仅在 Migration 获得批准并由唯一发布流程完成后，再由管理员配置 `habit_tracker` Exposed schema，随后由接入智能体进行真登录、写入成功回执、刷新重读和 RLS 越权验收。
8. **继续 L3–L5**：L2 通过后，依次验收双设备 CRUD、冲突、断网重连、Storage、分享、备份恢复；每项都记录实际设备、时间、操作和结果。
9. **最终材料**：所有内容按“已验证 / 待验证 / 存在问题”更新到既有文档，原样提交给数据库管理员复核；不能由接入智能体自行宣布数据库收口。

### 5.4 暂停期间和恢复时的硬性规则

1. **数据库禁区**：未经正式审核批准，不得建表、改 RLS、改 GRANT、改 Expose、改 Storage、改 Realtime、发布 Migration 或执行生产 `supabase db push`。
2. **Migration 归属**：业务项目内的 `supabase/migrations/0001_init.sql` 只是草案；正式结构只能由共享平台仓库管理，不能形成第二套 Migration 历史。
3. **Schema 隔离**：所有业务查询必须走 `supabase.schema('habit_tracker')`；禁止访问其他工具 Schema，禁止把业务表放进 `public`。
4. **密钥安全**：浏览器只允许使用 Supabase URL 和 publishable key；`service_role`、数据库密码、Auth token、API Key、MCP/分享秘密不得进入前端、Git、日志或截图。
5. **本地与云端边界**：IndexedDB、outbox 和本地草稿不是 Supabase 云端主库；页面即时显示、HTTP 200 或收到 Realtime 事件都不等于云端保存成功。
6. **冲突规则**：不得用整库 JSON 覆盖；不得用单纯 `updated_at` 新者保留掩盖冲突；旧 revision 写入失败必须可见、可恢复、不可静默丢失。
7. **Storage / 分享安全**：公开桶中的内容必须确实允许公开；私密原图、私密笔记、转写原文和任何密钥不得进入公开 payload 或公开桶。
8. **运行端口**：开发端口为 5173，预览端口为 4175，Docker 约定宿主机端口为 8081；不要占用用户其他项目的端口。
9. **Docker 边界**：未经用户明确授权，不创建或覆盖 `Services/personal-checkin/`，不动 `DockerData`、`DockerBackups` 或 Named Volume；修改 `VITE_*` 后必须重新构建镜像。
10. **Git 边界**：先检查 `git status`；不得 reset、checkout、覆盖或删除用户改动；commit 需要用户明确确认，push 需要再次明确确认。
11. **验证记录**：没有真实环境和操作证据就写“待验证”；静态检查不能替代真实 Supabase、RLS、双设备、断网、恢复验收。
12. **文档归属**：数据库方案继续维护原方案文件；完整审查意见只维护本目录下的数据库审查意见文件；本 HANDOFF 只维护阶段入口、状态和恢复规则，不新建重复报告。

### 5.5 暂停阶段完成标准（历史，2026-09-03 当时）

> 以下为暂停当时的判定（CHANGES_REQUIRED / 未执行生产变更 / 未开始 L2）。**现役判定见 §0**：已获 `APPROVED_FOR_EXECUTION`，S1/S2/L2/QA 均已完成，仅 0003 Storage 待审：

- 当时最新审查结论为 `CHANGES_REQUIRED`（后已修复为 `APPROVED_FOR_EXECUTION`）；
- 当时没有执行生产数据库变更（后 S1 已发布）；
- 当时没有开始 L2–L5 云端验收（后 L2_PASS / TAG_FIX_PASS / QA_V02_PASS 均已完成）；
- 当时没有创建生产 Docker 目录或容器（仍待授权）；
- 所有待修复项、恢复顺序和权限边界已有明确记录；
- 下一个智能体可以直接使用下方提示词恢复工作（提示词本身仍有效，但“当前真实状态”段落以 §0 为准）。

### 5.6 下一个智能体接续恢复提示词

```text
【接续恢复：个人打卡小工具 habit_tracker 数据库接入】

你是“个人打卡小工具项目接入/恢复实施智能体”，不是“共享 Supabase 数据库审核人”。本提示词中的“你”只指你这个接续智能体；“用户”指项目所有者；“共享 Supabase 数据库审核人”是独立审核角色。你不得自行审核、批准、发布或宣布数据库收口。

项目目录：
/Users/zzymima0000/Developer/coding/1.Active/ing 丨0831个人打卡小工具 MACMINI GL

用户目前要求开发暂停。除非用户明确说“恢复开发”或“继续数据库接入”，你只做只读检查，不改源码、不改数据库、不改 Dashboard、不改 Docker、不启动服务。

开始前按顺序阅读：
1. HANDOFF.md，重点阅读最新 §5
2. docs/db/个人打卡小工具丨habit_tracker丨数据库管理员完整审查意见丨V1.0.md
3. docs/db/写入方案丨数据库管理员审查丨V1.0.md
4. docs/V1_PRODUCT_AND_TECHNICAL_PLAN.md
5. 共享 Supabase 数据库规范 V1.2
6. Mac Mini 本地项目自托管 Docker 规范 V1.0
7. src/lib/supabase.ts、src/lib/sync.ts、src/lib/idb.ts、src/lib/types.ts

当前真实状态：
- 产品主体和本地 IndexedDB/L1 流程已完成；Supabase 真登录、真实写入、RLS、双设备、并发、断线和恢复尚未完成。
- 目标 Supabase 项目 ref 为 yacgnikzvutbpoqvokth，目标独立 Schema 为 habit_tracker。
- 业务代码已经通过 supabase.schema('habit_tracker') 访问该 Schema，这个方向保留。
- supabase/migrations/0001_init.sql 仍是业务项目草案，尚未获得发布批准，不得执行生产 supabase db push。
- 数据库管理员已给出 CHANGES_REQUIRED。完整修改要求以 docs/db/个人打卡小工具丨habit_tracker丨数据库管理员完整审查意见丨V1.0.md 为准。
- 当前阻断问题包括：CHECK 子查询会导致 Migration 失败；多处外键没有同 owner 约束；revision 没有真正实现条件更新；share_items 幂等不完整；公开 payload 没有数据库/服务端白名单；Storage/Realtime 规则边界未确认；匿名分享可能枚举；回滚方案破坏性过强。
- 当前不能进入 S1 发布、S2 Expose 或 L2 写入验收。
- .env.local 只允许填写 VITE_SUPABASE_URL 和 VITE_SUPABASE_PUBLISHABLE_KEY；禁止 service_role、数据库密码和服务端 Key 进入前端。
- 代码和文档存在未提交/未跟踪改动；先 git status，绝不 reset、checkout、覆盖或删除。

用户明确恢复后，严格按以下顺序：
1. 只读盘点 Git、文件、现有方案和代码，不覆盖用户改动。
2. 根据完整数据库审查意见修订 V1.1 方案、Migration 草案和应用写入代码。
3. 修复 CHECK 子查询、跨用户复合外键、标签触发器、revision 条件更新、client_id/share_items 幂等、payload 白名单和匿名分享访问模型。
4. 明确 Storage bucket、storage.objects policy、supabase_realtime publication 是否是 V1.2 允许的受控注册动作；未明确前不得执行。
5. 在隔离环境执行完整 Migration、RLS 越权、幂等重试、旧 revision 冲突、公开分享和回滚恢复验证。
6. 生成 V1.1 方案、差异说明、权限矩阵、验证记录和遗留问题，原样提交给共享 Supabase 数据库审核人。
7. 只有收到明确批准后，才可进入共享平台仓库正式 Migration、唯一发布、Expose 和 L2 验收；你不得自行执行生产 supabase db push。
8. L2 通过后再按序进行双设备 CRUD、并发冲突、断网重连、分享/Storage 和备份恢复验收。

硬性禁区：
- 不得自行宣布数据库收口或批准发布。
- 不得执行生产 supabase db push，不得改 Supabase Dashboard 或 SQL Editor。
- 不得把业务表放入 public，不得访问其他工具 Schema。
- 不得删除或用整库 JSON 覆盖云端数据。
- 不得把 updated_at 新者保留当作并发冲突解决。
- 不得泄露 API Key、数据库密码、Auth token、分享秘密或真实私密内容。
- 未经用户明确授权，不得 commit、push、创建/覆盖 Services、DockerData、DockerBackups 或 Named Volume。
- 端口按既有约定执行：5173 开发、4175 预览、8081 Docker；不要启动未经授权的生产服务。

输出要求：每项明确标记“已验证 / 待验证 / 存在问题”，记录文件路径、命令结果和真实环境证据。遇到项目 link、权限、目标 Schema、线上状态或规则边界不确定时先停下并报告，不要自行扩大权限或执行生产变更。
```

### 5.7 共享 Supabase 数据库管理员角色：要求与职责

> 本节定义“数据库管理员/数据库审核人”这一独立角色。项目接入智能体不能代替该角色，也不能因为自己完成了代码修改就视为审核通过。

#### 角色定位

共享 Supabase 数据库管理员负责共享项目的数据库治理、接入审查、风险判断和发布门禁，不负责替项目智能体自行补齐未经审查的设计，也不因项目方声称“只供个人使用”而降低安全和数据一致性要求。

#### 必须履行的职责

1. **接入前审查**：任何新工具写入共享 Supabase 前，先审查其 Schema、表、字段、主外键、唯一约束、删除策略、归属字段和数据敏感度。
2. **隔离审查**：确认新工具只使用自己的独立 Schema，不读写 `public` 业务表，不访问其他工具 Schema，不覆盖或复用其他工具的数据对象。
3. **权限审查**：逐项核对 Data API Expose、Schema/table/function GRANT、RLS、Policy、Auth 角色、匿名访问和跨用户越权路径。
4. **关系完整性审查**：确认跨表关联具备同一 `owner_user_id` 约束，不能只依赖前端传值或普通单列外键。
5. **函数与触发器审查**：检查 Function、Trigger、`SECURITY DEFINER`、`search_path`、输入校验、默认权限和副作用；发现高权限函数时要求最小授权、撤销和审计方案。
6. **写入一致性审查**：检查保存成功判定、条件更新、revision/乐观锁、离线 outbox、重试幂等、删除、关系差量同步和 Realtime 旧快照覆盖风险。
7. **Storage / Realtime 审查**：核对 bucket 是否确实需要公开、对象路径是否按 owner 隔离、公开内容是否含私密数据，以及 Realtime publication 是否只增加目标工具对象。
8. **Migration 审查**：确认正式 Migration 只进入【平台丨共享 Supabase 数据库】仓库，项目业务仓库不得维护第二套生产 Migration 历史；核对目标项目、顺序、影响范围和可重复执行边界。
9. **备份与恢复审查**：发布前确认有最新备份、隔离恢复演练、回滚步骤和其他 Schema 不受影响的验证方法；破坏性回滚必须单独标注并经明确批准。
10. **验收审查**：区分静态 SQL、隔离执行、单设备持久化、RLS 越权、双设备、并发、断网重连、Storage、恢复演练等证据，不把构建成功、HTTP 200 或页面显示当作数据库验收。
11. **收口审查**：检查最终材料是否逐项标记“已验证 / 待验证 / 存在问题”，是否遗漏安全告警、遗留风险和未完成测试。

#### 审核输出标准

每次审核必须输出可执行、可追溯的意见，至少包含：

- 被审查项目、目标 Supabase project ref 和目标 Schema；
- 被审查方案、Migration、相关代码和版本；
- 每个问题的严重级别、文件路径、行号或对象名；
- 问题原因；
- 明确修改方式；
- 修改后的验收标准；
- 已验证、待验证、存在问题三类清单；
- 是否允许进入下一阶段；
- 是否允许发布或执行生产变更；
- 需要由谁补充的材料。

禁止只输出“总体可行”“看起来没问题”“注意安全”等无法执行的结论。

#### 审核结论枚举

数据库管理员只能使用以下明确结论：

1. `APPROVED_FOR_EXECUTION`
   - 方案和必要证据已满足当前阶段门槛；
   - 可以进入审核意见明确允许的下一阶段；
   - 不代表可以扩大到未审查的 Schema、表、Function、Storage 或数据范围；
   - 生产发布仍须使用共享平台的唯一发布流程。

2. `CHANGES_REQUIRED`
   - 方向可以继续，但存在可修复问题；
   - 必须按问题清单修改并重新提交；
   - 不得执行生产数据库变更。

3. `BLOCKED`
   - 目标项目、权限、Migration 来源、备份、隔离验证或关键安全事实无法确认；
   - 或存在高风险且没有可接受控制措施；
   - 必须先解除阻塞，不得通过猜测或临时放宽权限继续。

#### 数据库管理员的权限边界

- 数据库管理员可以审查方案、要求修改、拒绝发布、要求补充证据和决定是否进入下一阶段。
- 数据库管理员不得把未审查内容默认为已批准。
- 项目接入智能体不得自称数据库管理员，不得替数据库管理员填写批准结论。
- 未出现明确的 `APPROVED_FOR_EXECUTION` 前，不得执行生产 Migration、`supabase db push`、Dashboard 变更或 Expose 配置。
- 即使出现 `APPROVED_FOR_EXECUTION`，也只能执行批准范围内的动作；新增表、字段、Function、Policy、Storage、Realtime 或数据迁移必须重新提交。
- 正式生产发布必须由共享平台仓库的唯一发布人或唯一 CI 流程执行；审核人与发布人应保持职责可追溯。
- 审核过程中不记录或回显 API Key、数据库密码、Auth token、MCP 原始令牌、真实私密内容或生产敏感数据。

#### 新项目标准提交包

以后任何项目申请写入共享数据库，项目接入智能体必须先提交：

1. 项目名称、用途、数据敏感度和实际运行环境；
2. 目标 Supabase project ref 和独立 Schema 名称；
3. 表、字段、主键、外键、复合归属约束、唯一键和删除策略；
4. Expose、GRANT、RLS、Policy 权限矩阵；
5. Function、Trigger、Storage、Realtime、Auth 影响；
6. 写入成功判定、revision、冲突处理和离线重试幂等方案；
7. 备份、恢复、回滚和故障后的数据保护方案；
8. 正式 Migration 来源、发布人和隔离验证方式；
9. 现有代码如何访问 Schema，以及是否存在本地兼容层；
10. 已验证、待验证、存在问题和明确请求审核的事项。

材料不完整时，数据库管理员应返回 `BLOCKED` 或 `CHANGES_REQUIRED`，不能先批准再补材料。

### 5.8 2026-09-03 修订轮完成情况（已进入发布阶段；现役状态以 §0 为准）

> 进度：V1.1 正式复审 CHANGES_REQUIRED（R2-1～R2-4）→ 增量材料补齐（54/54 + 备份演练 15/15）→ **R2 增量复审 APPROVED_FOR_EXECUTION（§13.1，管理员独立复跑确认）→ S1 已发布 → S2 已完成并验证 → L2_PASS → TAG_FIX_PASS → QA_V02_PASS**。

**R2 增量材料补齐（全部完成并经管理员独立复跑确认）**

1. **R2-1**：`setup_stub.sql` 补交入库（幂等）；`verify.sql.sh` v4 改为 stub 先于 Migration 加载；全新初始化 PG16 集群重跑 **54/54**（含 stub 加载、R2-2/R2-3 新用例）。管理员以 Docker postgres:16 原样复跑确认。
2. **R2-2**：`public_share_read` 增加 `(expires_at is null or expires_at > now())` 校验（0001_init.sql）；V1.1 方案 §9 声明 expires_at 即刻生效。
3. **R2-3**：真实跨用户 media 封面用例（B 引用 A 真实存在的 media 行 → 被拒 + 未污染）。
4. **R2-4**：备份恢复演练 **15/15**（`备份恢复演练记录` + `backup_drill_result.txt`）。关键发现固化为 §10.3 第 0 步：**恢复到空库须先具备 auth 桩/平台 auth Schema**；RLS 验证必须以 authenticated 角色执行（superuser 绕过）。

**S1 已发布（2026-09-03，批准范围内）**

- Migration `20260903141849_create_habit_tracker_schema.sql`（与送审版**字节一致**，md5 `1ce6ae9482cb8515aedce6a4ad73b53c`）进入平台仓库 `supabase/migrations/`，经 CLI `supabase db push` 发布至共享项目 yacgnikzvutbpoqvokth。
- **发布后线上核对（只读）**：8 表全启用 RLS、策略 32、触发器 11、函数 5、索引 29、authenticated 32 项 CRUD grant、anon 表 grant 0、anon 可执行 `public_share_read` + schema usage——与隔离验证完全一致。平台仓库 DATABASE_CATALOG.md / README 已登记。
- **发布过程注意**：库内另一项目（prompt_manager）存在未推送 Migration `20260901163555`，不在批准范围——发布时临时移出 migrations 目录、push 后立即原样移回（md5 校验一致，其 Remote 状态仍为未推送，未受影响）。**后续任何人对该仓库执行 `db push` 也会连带推送它，需 prompt_manager 项目自行决策。**
- 批准范围外仍冻结：`0002_storage_realtime.pending.sql`、Storage、Realtime、任何范围扩大。

**S2 / Expose / L2 完成记录（2026-09-03）**

- **S2 Expose**：用户在 Dashboard → Settings → Data API → Exposed schemas 勾选 `habit_tracker`（仅新增）。
- **Expose 后验证（publishable key + REST）**：`GET /rest/v1/places`（Accept-Profile: habit_tracker）→ 42501 permission denied（已暴露且 anon 零表权限 ✅）；`POST /rest/v1/rpc/public_share_read`（Content-Profile: habit_tracker）→ 200 + null（不可枚举 ✅）。注意：跨 Schema 访问要用 `Accept-Profile`（GET）/ `Content-Profile`（POST）请求头；OpenAPI 根路径不认 publishable key 属预期。附记：prompt_manager Schema 在平台上也处于暴露状态（既有配置，非本次引入）。
- **L2 写入验收：L2_PASS**（独立浏览器实例 + 真实 Chrome CDP，Google OAuth 白名单后全程干净）：登录 ✅ → 写入「验收测试地点」（POST places/entries 均 201）→ 云朵已同步 ✅ → 清 localStorage 重登 7/7 数据完整回读 ✅；云端 places/entries 各 1 行、revision=1、RLS 按用户隔离生效。证据归档 `docs/acceptance-l2/`（L2-REPORT.md + 脱敏 l2-sync.har + 截图 10 张）。
- **L2 后缺陷修复（2026-09-03，纯应用层，无 Schema 变更）**：用户报告「新建笔记打标签刷新后丢失」。根因二连：① 演示标签（seed）从未上云 → entry_tags 推送被外键 `entry_tags_tag_fk` 拦死 → 远端 rescue 永远为空；② pullRemote 映射远端行时硬编码 `tagIds: []`，服务器 updated_at 总比本地晚 → 覆盖后本地标签被抹。修复：sync.ts 新增 `ensureTagsInCloud`（entry_tags 差量前补推缺失标签/维度）+ merge 保留本地 tagIds 再与远端 entry_tags 求并集。tsc 通过。注：已被抹掉的标签本地/云端均无副本，需用户重新打一次（修复后可持久）。
- **平台仓库基线 commit**：`efddca5`（prompt_manager 3 条 + habit_tracker 1 条迁移、DATABASE_CATALOG.md、config.toml exposed schemas 对齐；无 remote 未推送）。prompt_manager 未推送 Migration `20260901163555` 仍原样保留。

**下一步**

1. **管理员发布后收口核对**：把 S1 线上核对、S2 Expose、L2_PASS 证据（`docs/acceptance-l2/`）转交管理员，做发布后权限/功能状态终核并收口（V1.1 §13.1 已回填待管理员确认）。
2. **L3 取消（2026-09-03 用户决定）**：产品定位**单设备使用**（一部手机写入存储），不做双设备 CRUD / 并发冲突 / 断线重连验收。sync.ts 的乐观锁与 Mine 页冲突裁决 UI 保留作兜底，不作为验收项。后续仅剩：分享链路实测（可选）、备份恢复（数据库层已在 R2-4 演练 15/15）；Storage/Realtime 仍冻结待平台规则。
3. **业务项目 git commit**：本轮 sync.ts/Mine.tsx/ui.tsx/HANDOFF.md 等改动未提交，等用户确认。
4. **可选卫生动作**：验收 Chrome 实例（/tmp/l2-acceptance-chrome，端口 9334）确认不用后关闭；如介意 3100 页面 URL 残留 token，Dashboard → Auth → Users → 该用户 → Sign out all sessions 作废。
5. 数据库治理文件统一在 `/Users/zzymima0000/Developer/coding/1.Active/alw丨数据库管理专家/项目审查丨habit_tracker/` 维护；业务项目 `docs/db/` 只放送审清单。
