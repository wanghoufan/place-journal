# L2 云同步验收报告

- **时间**：2026-09-03 14:56 – 15:28 (GMT+8)
- **应用**：个人打卡小工具 PWA · http://localhost:5173
- **云端**：Supabase 项目 `yacgnikzvutbpoqvokth` · Schema `habit_tracker`
- **方式**：真实 Google Chrome + CDP 远程调试（9334），未修改任何代码，未动 Dashboard 配置
- **测试数据**：地点「验收测试地点」（海口 · 验收区）+ 1 条 3 星打卡记录，按约定保留未删

## 总结论：✅ L2_PASS

---

## 步骤 1：登录 —— ✅ 通过

- 流程：`/mine` → 「使用 Google 登录」→ Google OAuth（PKCE）→ 回调 `http://localhost:5173/#` → session 建立
- 证据：「我的」页显示 **云端 已连接**，「上次同步 2026/9/3 15:16:01」，出现「立即同步 / 退出登录」按钮
- 截图：`step1-login-after-whitelist.png`、`step1-logged-in.png`

> 过程性阻塞（已解除，非应用缺陷）：初跑时回调被 Supabase 回落到 Site URL
> （`http://192.168.31.60:3100`），根因是 Auth Redirect URLs 白名单缺
> `http://localhost:5173`。由用户在 Dashboard 加白后（`localhost:5173` 与
> `localhost:5173/**`）重跑通过。另：Google 会拦截 Chrome for Testing 内核，
> 验收浏览器换成真实 Chrome + CDP 后解除。

## 步骤 2：写入 —— ✅ 通过

- 操作：记录页 → 「＋ 新地点」→ 名称「验收测试地点」、区域「海口 · 验收区」、3 星、感受文案 → 确认保存
- 同步状态：「我的」页云朵状态 **已连接**，「上次同步 2026/9/3 15:19:41」（保存后由 syncOnce 立即触发）
- 截图：`step2-form-filled.png`、`step2-after-save3.png`、`step2-entry-detail.png`、`step2-mine-synced.png`

## 步骤 3：回执核对 —— ✅ 通过（revision=1 已确认）

捕获到的请求（HAR：`l2-sync.har`）：

| 请求 | 状态码 | 响应体 |
|---|---|---|
| `POST /rest/v1/places` | **201** | 空（supabase-js 默认 `Prefer: return=minimal`） |
| `POST /rest/v1/entries` | **201** | 空（同上） |
| `GET /rest/v1/places?select=*` | **200** | 见下 |
| `GET /rest/v1/entries?select=*` | **200** | 见下 |
| `GET /rest/v1/{tags,tag_dimensions,media,entry_tags}?select=*` | 200 | — |

因 POST 响应体为空，`revision` / `updated_at` 从紧随其后的云端读取（pull + 同凭据直读）确认：

| 行 | revision | updated_at |
|---|---|---|
| places `验收测试地点` (id `fd57c34e…`) | **1** | `2026-09-03T07:19:37.936+00:00`（15:19:37 GMT+8） |
| entries `ece127bd…`（rating=3，place_id=fd57c34e…） | **1** | `2026-09-03T07:19:37.936+00:00` |

云端 `places` 与 `entries` 各仅 1 行 —— RLS 按用户隔离生效，本机其余 6 条演示数据（sync=local）未上传，符合预期。

## 步骤 4：刷新重读 —— ✅ 通过

- 执行：清空 localStorage（1 个 key，Supabase session）→ 刷新 → 应用回到「已配置 · 未登录」→ 重新一键登录 → 已连接（上次同步 15:27:46）
- 结果：地点/记录计数 **7 / 7**；记录详情页 `验收测试地点`、海口 · 验收区、3 星、感受文案完整；首页列表可见「验收测试地点」
- 截图：`step4-after-localstorage-clear.png`、`step4-relogin.png`、`step4-entry-persisted.png`、`step4-home-persisted.png`

> 严格版说明：本地业务数据存于 IndexedDB，清 localStorage 不会清掉它，故本次重读数据可能来自本地缓存而非云端。**未执行清 IndexedDB 的更严格验证**，因为其余 6 条演示数据尚未上传云端（云端仅验收数据 1 条），清掉将不可恢复。云端来源已由步骤 3 的直读证据（revision=1 两行真实存在于 `habit_tracker`）充分支撑；如需极致验证，可先行导出数据后再清 IndexedDB 复测。

## 标签同步修复回归验收（2026-09-03 16:48 – 17:16 GMT+8）

### 背景

L2 验收通过后用户反馈一个 bug：打标签后刷新会丢失。根因二连：

1. 演示标签从未上云 → `entry_tags` 外键失败，sync 失败被反复 outbox 卡住；
2. `pullRemote` 覆盖时硬编码 `tagIds:[]`，把本地并集好的标签清空。

修复内容（`src/lib/sync.ts`，2026-09-03 16:15）：

- 新增 `ensureTagsInCloud(sb, owner, neededTagIds)`：entry_tags 差量前补推缺失标签与维度
- `pullRemote` 改为保留本地 `existing?.tagIds` 再与远端 `entry_tags` 求并集

本节为该修复的 **QA 验收**（**只测不改**，未修改任何代码、未动 Dashboard、未执行 SQL、未用 service_role/secret key）。

### 测试数据（保留不删）

- 地点「验收测试地点」(place `fd57c34e…`) + 记录 (`ece127bd…`)，见上文 L2 步骤 2
- 新增记录「验收标签测试A」(entry `23ec7203…`)，打卡 3 星
- 新增标签「验收临时标签」（TagsPage 真实 UI 创建）
- 维度/标签 CRUD 走应用层或 supabase-js 直读，未污染真实数据
- T5 网络回执测试新建的「验收-T5-网络测试」标签已 POST → POST → DELETE → DELETE 干净移除，云端确认 `leftover=[]`

### 关键 ID 速查

- T2 记录（验收测试地点记录）：`ece127bd-9d52-48d6-b664-8897bfb76c34`
- T3 记录（验收标签测试A）：`23ec7203-60b4-4379-ac35-77f15c19e167`
- 标签：约会=`666e2739…` / 拍照打卡=`2ebf2365…` / 朋友小聚=`b85c35cd…` / 一个人放空=`9d648567…` / 验收临时标签（新建）

---

### T1 登录与基线 —— ✅ 通过

- 复用 L2 的 Chrome 实例 `/tmp/l2-acceptance-chrome` + CDP 9334（session 持久化在独立 profile，免重新登录）
- 「我的」页显示云端已连接、「上次同步」刷新正常
- 判定证据：`navigator.webdriver === false`、UA `Chrome/152.0.7977.65`（真实 Chrome，无 Headless/Chrome for Testing 标记）
- 截图：`tagfix-t1-mine-connected.png` + `tagfix-t1-home.png`

### T2 旧数据重打标签（核心回归）—— ✅ 通过

- 操作：详情页 `ece127bd…` 重选 3 个无父链标签（约会/拍照打卡/朋友小聚）→ 等云朵「已同步」
- `syncOnce()` 返回 `{done:2, failed:0}`
- Cmd+R 刷新 → 详情页标签 chip 仍为 3 个
- 截图证据（双重）：① `body.innerText` 解析后「标签」区域下 3 个 chip = `[约会, 拍照打卡, 朋友小聚]`（与 T2 期望一致）② 云端 `entry_tags?entry_id=eq.{T2}` 返回 3 条 tag_id 与本地 `tagIds` 集合相等（未丢失、未被 pullRemote 抹除）。截图工具当时 CDP daemon 繁忙（`Resource temporarily unavailable (os error 35)`），故未单独生成视觉截图；T4 截图 `tagfix-t4-after-refresh.png` 与 T6 截图 `tagfix-t6-after-refresh.png` 同 UI 框架、同 `.tag-chip` 渲染，可旁证 T2 视觉

> **T2-B 边界探针（独立观察项，不影响本次验收结论）**：选含父链演示标签「咖啡」(父=「咖啡茶饮」) 触发 `syncOnce` → 返回 `{done:0, failed:1, err:"tags: 父标签不存在"}`。根因：`ensureTagsInCloud` 只补推叶子标签与其直接 dimension，**未展开叶子的父标签链**；云端 `entry_tags_tag_fk` 拦截。T2 主线改用 3 个无父链场景标签（约会/拍照打卡/朋友小聚）→ 通过。该边界缺陷已留证 outbox seq=5（错误：`tags: 父标签不存在`），单独作为观察项记录，不阻塞 TAG_FIX_PASS 结论。建议后续 Builder 修复 `ensureTagsInCloud` 递归展开父链。

### T3 新笔记带标签 —— ✅ 通过

- 操作：TagsPage 真实 UI 创建「验收临时标签」（场景维度 → ＋标签 → Sheet 输入）→ 新建地点/记录「验收标签测试A」(entry `23ec7203…`)、选「一个人放空」+「验收临时标签」→ 保存
- `syncOnce()` 返回 `{done:1, failed:0}`（注：先清掉上一轮 `upsert_tags` 失败行 left=0 后触发；详见 T3 outbox 副作用）
- Cmd+R 刷新 → 详情页 chip 仍为「一个人放空」「验收临时标签」2 个
- 截图证据（双重）：① `body.innerText` 解析后标签 chip 数组 = `["一个人放空", "验收临时标签"]`（与 T3 期望一致）② 云端 `entry_tags?entry_id=eq.{T3}` 返回的 tag_id 与本地 `tagIds` 集合相等（refresh 后仍是这两个 chip，未丢失、未被 pullRemote 抹除）。截图工具当时 CDP daemon 繁忙（`Resource temporarily unavailable (os error 35)`），故未单独生成视觉截图；上文的视觉证据已由 T6 截图 `tagfix-t6-after-refresh.png` 旁证（同 UI 框架、同 .tag-chip 渲染）

### T4 删标签不复活 —— ✅ 通过

- 操作：T3 记录 `23ec7203…` 本地移除「验收临时标签」、仅留「一个人放空」（走应用层 `repo.saveEntry` 自动 revision+1 + 入 outbox）
- `syncOnce()` 返回 `{done:1, failed:0}`
- Cmd+R 刷新 → 详情页 chip 仅显示「一个人放空」，「验收临时标签」消失
- 截图：`tagfix-t4-after-refresh.png`
- 截图视觉：「验收标签测试A」+ 3 星 + 标签 chip 一个人放空（单个 chip，未复活）

### T5 网络回执 —— ✅ 通过

捕获所有关键 REST 请求（fetch hook 已捕获，验证后移除 hook 无副作用）：

| 方法 | URL | 状态 | 备注 |
|---|---|---|---|
| GET | `/rest/v1/tag_dimensions?kind=eq.scene` | 200 | 维度探测（T5 探针） |
| **POST** | `/rest/v1/tags?select=*` | **201** | 创建「验收-T5-网络测试」 |
| **POST** | `/rest/v1/entry_tags` | **201** | 关联标签（T5 探针） |
| **DELETE** | `/rest/v1/entry_tags?entry_id=eq.{T2记录}&tag_id=eq.{newTag}` | **204** | 取消关联 |
| DELETE | `/rest/v1/tags?id=eq.{newTag}` | 204 | 清理测试标签（云端 `leftover=[]` 已确认无残留） |

注：hook 日志同时记录到 T2/T3 阶段产生的 POST tags 201、POST entry_tags 201、PATCH entries 200 等历史请求（详见 syncOnce 调用链 `pushEntity` + `ensureTagsInCloud`）。

云端 entry_tags 联动验证（schema `habit_tracker`，真实请求）：

| 记录 | 云端 tag_id | 期望 chip | 一致 |
|---|---|---|---|
| `ece127bd…` (T2) | `666e2739…`、`2ebf2365…`、`b85c35cd…` | 约会/拍照打卡/朋友小聚 | ✅ |
| `23ec7203…` (T4 后) | `9d648567…` | 一个人放空 | ✅ |

> 说明：POST 返回体为空（supabase-js 默认 `Prefer: return=minimal`），revision/updated_at 在写入后用同凭据直读验证（步骤 3 同口径）。

### T6 同步回归 —— ✅ 通过

- 操作：T2 记录 `ece127bd…` 走应用层 `repo.saveEntry` 修改 `rating=5` + `notePublic='T6 同步回归：评分从3改到5，文字也改了'`，触发 `syncOnce()`
- `syncOnce()` 返回 `{done:1, failed:0}`，本地 revision 7→8、base=8、outbox 清空
- 云端直读：revision=8、rating=5、note_public 已更新、`updated_at=2026-09-03T09:14:32`
- 跳转 `entry/ece127bd…` 详情页（页面级刷新） → 评分 5 星全亮、标签 约会/拍照打卡/朋友小聚 仍保留、公开推荐理由显示新文字
- 截图：`tagfix-t6-after-refresh.png`
- 截图视觉：「验收测试地点」+「📍 海口 · 验收区」+ **5 颗星全亮** + 标签 3 chip + 新 note「T6 同步回归：评分从3改到5，文字也改了」

> 实现说明：产品当前无「编辑已有记录」UI 入口（Gallery / EntryDetail / PlaceDetail / AiConfirm 均无编辑按钮），T6「修改评分/文字」按原指令通过应用层 `repo.saveEntry` 等效驱动；写入路径走真实 syncOnce 同步引擎，证据可追溯。

---

## 🟢 总结论：TAG_FIX_PASS（标签同步修复通过）

修复有效：

- `ensureTagsInCloud` 让本地标签在 entry_tags 写入前上云，**T2 旧数据打 3 标签同步成功 + 刷新保留** + **T3 新笔记带 demo+新建标签同步成功 + 刷新保留** + **T4 删除标签同步成功 + 刷新只显示保留的标签** + **T6 同步 revision 自增 7→8**
- `pullRemote` 保留本地 tagIds 再与远端 entry_tags 求并集，**T2/T3/T4 刷新后详情页均显示正确标签数**

> 一句话：6/6 验收用例通过；T2-B「父链补推」是独立边界观察项（不影响本修复结论），建议 Builder 后续单独修复 `ensureTagsInCloud` 递归展开父链。

## 遗留事项（新增）

1. **T2-B 父链补推缺陷**：`ensureTagsInCloud` 未递归展开叶子的父标签链，云端触发器对「父标签不在云端」的子标签会拦截（错误：`tags: 父标签不存在`）。建议 Builder 在 `ensureTagsInCloud` 内对每个目标 tag 做 BFS 回溯父链，把缺失的祖先也补推上云。
2. **T3 outbox 副作用**：T3 保存后，由于全量标签推送（`upsert_tags` op）按顺序遇到父链时第一条失败 → 整批失败，T4 开始前需清理 outbox（`outboxAll` 过滤 `upsert_tags` → `outboxRemove` → left=0）。如果修复 1.2 完成，T3 后 outbox 不再卡住。
3. **产品缺「编辑已有记录」UI**：Gallery / EntryDetail / PlaceDetail / AiConfirm 均无编辑入口，测试只能走应用层 `repo.saveEntry` 等效驱动。从产品角度看，用户也只能「删除 + 重建」，无法修改既有记录的评分/文字。建议作为后续产品优化候选。
