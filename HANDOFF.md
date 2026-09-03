# HANDOFF 丨 个人打卡小工具（地点手账 PWA）丨 V1.0

> 更新时间：2026-09-02（V1.2 规范 + Docker 规范对齐）
> 用途：任何在此项目继续工作的智能体，**先读本文档 + `.workbuddy/memory/2026-09-01.md`，再读 SSOT 计划文档**，即可无缝恢复工作。

> ⚠️ **2026-09-03 路径变更**：数据库治理材料（规范 V1.2、写入方案与审查意见、Migration 草案、平台仓库）已迁至
> `/Users/zzymima0000/Developer/coding/1.Active/alw丨数据库管理专家/`。
> 本文中出现的 `docs/db/…`、`supabase/migrations/0001_init.sql`、`0002_storage_realtime.pending.sql` 等路径一律以 alw 文件夹内对应文件为准（`项目审查丨habit_tracker/` 与 `平台丨共享 Supabase 数据库/` 子目录）。

---

## 1. 项目一句话

「个人打卡小工具」= 移动优先的地点手账 PWA：拍照/语音记录 → AI 整理入库 → 按地点/标签/时间回顾 → 自然语言找地点 → 分享快照。本地优先（IndexedDB）+ Supabase 云同步。

## 2. 必读文档（按顺序）

| 顺序 | 文档 | 作用 |
|---|---|---|
| 1 | 本文档 `HANDOFF.md` | 当前状态、坑、待办 |
| 2 | `docs/V1_PRODUCT_AND_TECHNICAL_PLAN.md` | SSOT 产品与技术方案（M0–M6），需求以此为准 |
| 3 | `.workbuddy/memory/2026-09-01.md` | 开发全程日志（三轮 QA + 规范收口细节） |
| 4 | `~/Downloads/大模型 HANDOFF/2026-09-02 丨 共享 Supabase 项目与独立 Schema 数据库规范 丨 V1.2.md` | 数据库规范（迁移 SQL 必须符合它） |
| 5 | `~/Downloads/大模型 HANDOFF/2026-09-02 丨 Mac Mini 本地项目自托管 Docker 规范 丨 V1.0.md` | Docker Runtime 规范（Dockerfile/Compose/目录/备份必须符合它） |

## 3. 当前完成状态

**✅ 已完成（M0–M6 全量 + 规范 V1.1 收口 + 规范 V1.2 / Docker V1.0 对齐）：**

- **V1.2 对齐**：`pullRemote` 合并时 outbox 有未确认本机变更（sync ≠ synced）的行不被远端覆盖（§9.2.4，顺带修复远端较新时 push 造成重复行的缺陷）；新增 Realtime 订阅 `startRealtime/stopRealtime`（§9.1：仅通知、初始/重连主动补读、outbox 非空不拉取），登录后订阅、登出断开。
- **Docker V1.0 对齐**：新增 `Dockerfile`（多阶段：vite build + esbuild 打包 api/*.ts）、`server.mjs`（node:http 静态 dist + 同一实现的 /api + /healthz）、`compose.yaml`、`.dockerignore`、`docker/env.template`；`project_slug = personal-checkin`；无本地数据库/服务端文件 → 暂无 Named Volume 与 DockerData bind mount（compose 内已注释边界）。部署到 `Services/personal-checkin/` 需用户明确授权后执行。

- 全部页面：画廊（按记录/按地点+场景筛选）、记录（多图压缩 + 按住说话）、AI 确认页、记录/地点详情、找地点（自然语言→筛选条件）、标签两层结构、我的（导出+我的分享管理）、分享清单/单地点快照、地图总览（高德未配置时降级示意底图）。
- 数据层：IndexedDB（idb）+ outbox 幂等同步引擎 → Supabase；`revision` 乐观锁；记录级「先增后删」差量同步（entry_tags/share_items）。
- 迁移 SQL `supabase/migrations/0001_init.sql`：8 表在独立 Schema **`habit_tracker`**（非 public+前缀）、`owner_user_id`、三道门（Expose/GRANT/RLS）、Realtime publication、2 bucket（`habit-tracker-media-private/share`）、entry_tags 归属一致性用**触发器**（PG CHECK 不允许子查询）。
- 外部能力适配层：腾讯 ASR（TC3 签名）、大模型 OpenRouter/DeepSeek/OpenCode 可切换（固定 JSON 合同 + 本地推测降级，中文数字可解析）、高德 JS API、Google OAuth。全部支持「未配置」降级不阻塞。
- 三轮 agent-browser QA 全链路通过；tsc + vite build 通过（PWA precache 7 entries / 488KB）。
- 演示数据 6 地点（海口市，含地区标签），图片用 picsum.photos seed 图（无需 Key）。

**❌ 未做（全部卡在 Key/账号，代码侧已就绪）：**

| 项 | 前置条件 |
|---|---|
| 真实 Supabase 连通（登录/同步） | 迁移发布到共享平台仓库 + Dashboard Expose + 填 Key |
| 真登录 Google OAuth | 填 Client ID |
| ASR/大模型真实调用 | 填腾讯 ASR / OpenRouter/DeepSeek Key |
| 高德真实地图 | 填高德 Key |
| Vercel 部署 + /api 函数真实生效 | GitHub 推送 + Vercel 导入 |
| 真实照片压缩验收 | 有真实图片后 |
| **git commit/push** | **代码全部未提交，等用户明确确认后才能操作** |

## 4. 恢复工作步骤（智能体照做）

```bash
cd "/Users/zzymima0000/Developer/coding/1.Active/ing 丨0831个人打卡小工具 MACMINI GL"
# 1. 装依赖（若 node_modules 不在）
npm install
# 2. 复制 .env.example 为 .env，按用户提供的 Key 填写
# 3. 起开发服务
npm run dev        # 开发预览 http://localhost:5173
npm run build && npm run preview -- --port 4175   # 生产预览用 4175（4173 被其他进程占用，不要动它）
# 4. QA 用 agent-browser：设置视口语法是 `agent-browser set viewport 390 844`（不是裸 viewport）
```

- 端口约定：**5173 = dev，4175 = preview**，与用户其他项目（3000/3001/3100）隔离。
- Node 用 managed 路径：`/Users/zzymima0000/.workbuddy/binaries/node/versions/22.22.2-2/bin/node`。

## 5. 关键文件地图

```
src/lib/supabase.ts   # DB_SCHEMA='habit_tracker' + table() helper，所有查询必须走它
src/lib/env.ts        # VITE_SUPABASE_PUBLISHABLE_KEY（兼容旧 ANON_KEY）
src/lib/sync.ts       # 同步引擎：schema、owner_user_id、revision、先增后删差量、pending 保护、Realtime 仅通知
src/lib/idb.ts        # IndexedDB 仓库层，savePlace/saveEntry 时 revision+1
src/lib/draft.ts      # 记录草稿内存模块（勿用 sessionStorage 存 Blob，会崩）
src/lib/{types,image,audio,organize,search,amap,shares,exporter,demo}.ts
src/pages/            # Gallery/Record/AiConfirm/EntryDetail/PlaceDetail/Find/TagsPage/Mine/ShareList/ShareSingle
api/                  # Vercel Functions：transcribe.ts、ai-organize.ts、_lib/tencent.ts（Docker 内由 server.mjs 复用同一实现）
supabase/migrations/0001_init.sql   # 迁移草案（头部含设计问答，标注「提交共享平台仓库」）
Dockerfile / compose.yaml / server.mjs / .dockerignore / docker/env.template   # 自托管产物（project_slug=personal-checkin）
.env.example / vercel.json / README.md（含共享平台接入步骤）
```

## 6. 踩坑记录（重要，勿重蹈）

1. **sessionStorage 存 Blob 会序列化成空对象** → 带照片进确认页白屏。已改内存模块 `draft.ts`，刷新丢草稿回记录页（可接受）。
2. **PG CHECK 不允许子查询** → entry_tags 归属一致性校验必须用触发器实现。
3. **dev 下 /api 404 返回 HTML** → 适配层按 content-type 判定「未配置」，不能只看状态码。
4. **中文数字**：自然语言筛选要支持「人均五十」「给四星」（cnToNumber 全角/中文转换）。
5. **4173 端口被占用**（其他进程），preview 一律用 4175。
6. 演示图禁止 SVG 占位文字（会被卡片裁切），用 picsum.photos seed 图。

## 7. 硬性守则（来自用户全局规则，必须遵守）

- **未经用户明确确认，禁止 git commit / push**；推送需二次确认。
- 所有 HTML/页面强制**响应式**，禁止固定像素宽度；统一**浅色主题**。
- API Key 只进 `.env`，页面层不暴露任何配置。
- 每次代码修改后必须实测并附 preview 链接；一次只做一个特性，验证后再下一个。
- 演示数据可一键清除且不复活（demo_seeded meta），必须标识为演示。
- 迁移 SQL 修改必须继续符合数据库规范 V1.2（Schema habit_tracker / owner_user_id / revision / 四道门 / publishable key 禁 service_role）。
- Docker/部署修改必须符合《Mac Mini 自托管 Docker 规范 V1.0》：源码只在开发目录改；未经授权不创建/覆盖 Services、DockerData、DockerBackups；`NEXT_PUBLIC/VITE_*` 改动须重建镜像；不把密钥、数据、备份提交 Git；容器 200 ≠ 数据库验收。

## 8. 待办队列（建议顺序）

1. 【用户】把 `0001_init.sql` 提交到【平台丨共享 Supabase 数据库】仓库发布；Dashboard → Exposed schemas 勾选 `habit_tracker`。
2. 【用户】提供各 Key → 填入 `.env`（对照 `.env.example`）。
3. 【智能体】逐项打通：登录 → 同步 → ASR → 大模型 → 高德，每项单独验证。
4. 【用户确认后】GitHub 推送 + Vercel 部署，验收 /api 真实函数与 PWA。
5. 小观察项：找地点页悬浮「记录」按钮与列表选择圆圈视觉重叠（可滚动避开，待用户定夺是否改）。
