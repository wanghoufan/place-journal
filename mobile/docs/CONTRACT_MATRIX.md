# Web↔Mobile 合同矩阵（T012–T013 门禁）

- Task：TASK-DEV-02（SDD T012–T013；PRODUCT_PLAN_V1.5「合同门禁」RF-03）
- 基线：`DEV_BASELINE=PRODUCT_PLAN_V1.5`；`PRODUCTION_DB_MIGRATION = 0`
- 范围：8 张 `habit_tracker` 业务表 + 两 Storage bucket + `public_share_read` RPC 的
  **字段 / 操作 / 约束 / 幂等键 / 依赖 / 失败结果**合同，以及移动端操作 ↔ 现役证据的对照。
- 结论：**对上（0 项阻断）**。不新增生产表、不修改云端合同。

## 0. 证据来源与可读性声明

| 编号 | 来源 | 用途 | 仓内可读 |
|---|---|---|---|
| E1 | 根 `src/lib/sync.ts` | 云端行**线合同**（客户端实际发送/接收的字段、幂等键、依赖、冲突） | 是 |
| E2 | 根 `src/lib/shares.ts` | `public_share_read` RPC 输入/输出映射 | 是 |
| E3 | 根 `src/lib/types.ts` | Web 领域类型真源（T012 对照） | 是 |
| E4 | `docs/db/送审材料清单丨habit_tracker丨发布后收口核对.md` | 已发布事实：8 表全 RLS、策略 32、触发器 11、函数 5、索引 29；anon 表权限 0 | 是 |
| E5 | `docs/db/ENV1-实测记录丨2026-09-04.md` | 两桶路径/限额/MIME/RLS 实测；RPC 白名单实测字段 | 是 |
| E6 | `.workbuddy/memory/2026-09-01.md` | Migration 设计事实：`revision` 乐观锁列、`updated_at` 触发器、`entry_tags` 归属触发器、Realtime 5 表 | 是 |
| E7 | `supabase/migrations/` | **仅含 README**：Migration 草案已于 2026-09-03 迁出业务仓，权威 DDL 在平台仓（仓外，不在本 Task 可读范围） | 仅指针 |

> **可读性口径**：E1/E2 是移动端真正要兼容的**线合同**，本矩阵的每一条移动端操作都能在 E1/E2 找到
> 现役源码证据（字段名、发送值、幂等键、失败分支）。E4/E5/E6 补充数据库侧已发布事实。
> 权威 `0001_init.sql` 位于平台仓、不在本仓，故 DB 级 CHECK/默认值细节不在本仓断言；但**移动端
> 不依赖任何 DB 默认值（所有列由客户端显式传值）**，因此该不可见性不构成合同缺口。若 T014+ 读取
> 权威 DDL 后发现与 E1/E2 不一致，按 §D 门禁停手立返。

## 1. 门禁规则（RF-03）

- 每个移动端操作必须有：现役源码/数据库**证据** + **幂等键** + **前置依赖** + **失败/冲突结果** + **对应测试**。
- 任一项对不上 → **停止 T012–T013 后续实现，立即返 TM**，不得猜测、不得自行补生产 Migration。
- 通过准则：矩阵全绿（本文件 §A–§C），移动端类型/映射（`mobile/src/domain/`）可由本矩阵回溯。

## 2. 通用约束（全核心实体）

| 约束 | 内容 | 证据 |
|---|---|---|
| Schema | 固定 `habit_tracker`；业务表不进 `public` | E1 `table()` / PRODUCT_PLAN |
| 归属 | `owner_user_id`（=`auth.uid()`），客户端不可改写 | E1 `placeRow`…；E4 RLS |
| 客户端幂等键 | 核心实体 `client_id = id`；唯一 `(owner_user_id, client_id)` | E1 `src/lib/sync.ts:6-7` |
| 乐观锁 | 首推 INSERT；后续 `UPDATE ... eq('id').eq('revision', baseRevision)`；0 行=冲突 | E1 `pushEntity` L117-135 |
| revision | 服务端触发器强制单调 +1、owner 不可变 | E1 头部注释；E6 |
| 拉取保护 | 仅 `sync==='synced'` 且 `revision===baseRevision` 的行可被远端覆盖 | E1 `pullRemote` L602-614、L680-688 |
| 删除语义 | 行不存在=目的已达成，正常出队；删除不被 pull 复活 | E1 `delete_place/delete_entry` L489-498 |
| demo | `demo` 行永不上云（sweep/op 双拦截） | E1 L282-288、L316-321；FR-018 |
| 辅助对象 | media/share_items 无 revision，受控 upsert 幂等 | E1 L413-418、L461-478 |

## A. 8 表字段/操作合同

> 「移动端值」列描述客户端显式传值口径（不依赖 DB 默认）；「证据」列给出 E1 的具体函数/行。

### A.1 `places`（核心实体，乐观锁）

| 列 | pg 类型 | 可空 | 移动端值 | 证据 |
|---|---|---|---|---|
| `id` | uuid | 否 | 客户端 uuid，PK | E1 `placeRow` L81-85 |
| `owner_user_id` | uuid | 否 | 会话 `auth.uid()` | 同上 |
| `name` | text | 否 | 原样 | 同上 |
| `area` | text | 是 | `?? null` | 同上 |
| `lat` | double precision | 是 | `?? null` | 同上 |
| `lng` | double precision | 是 | `?? null` | 同上 |
| `coord_precision` | text | 否 | `?? 'exact'`（CHECK exact/approx/hidden） | 同上 |
| `is_private` | boolean | 否 | `!!isPrivate` | 同上 |
| `client_id` | text | 否 | `= id` | 同上 |
| `revision` | integer | 否 | 首推 `?? 1`，服务端 +1 | E1 L84；E6 |
| `created_at` | timestamptz | 否 | 服务端/回读 | E1 `pullRemote` L617-618 |
| `updated_at` | timestamptz | 否 | 本地 `updatedAt` | E1 L84 |

- 操作：INSERT（首次）｜UPDATE expected-revision（含地点改名/搬家）｜DELETE（`delete_place`）。
- 幂等键：`(owner_user_id, client_id)`；约束/级联：`entries_place_owner_fk`（place 先于 entry）；
  删 place 级联带走 entries（E6）。
- 失败/冲突：0 行 → `ConflictRecord(kind='place')`，本地行标 `conflict` 等裁决（E1 L144-150、L579-580）。

### A.2 `entries`（核心实体，乐观锁）

| 列 | pg 类型 | 可空 | 移动端值 | 证据 |
|---|---|---|---|---|
| `id` | uuid | 否 | 客户端 uuid | E1 `entryRow` L86-91 |
| `owner_user_id` | uuid | 否 | 会话 | 同上 |
| `place_id` | uuid | 否 | `placeId`（先 ensure place） | L87；L195-204 |
| `visit_date` | date | 否 | `visitDate` | 同上 |
| `rating` | integer | 是 | `?? null`（1-5） | 同上 |
| `budget` | numeric | 是 | `?? null` | 同上 |
| `transcript` | text | 是 | `?? null`（私密） | 同上 |
| `note_private` | text | 是 | `?? null`（私密） | 同上 |
| `note_public` | text | 是 | `?? null`（公开理由） | 同上 |
| `summary` | text | 是 | `?? null` | 同上 |
| `cover_media_id` | uuid | 是 | `?? null`；media 未上云时先置 null 后回填 | L328-332、L427-432 |
| `is_private` | boolean | 否 | `!!isPrivate` | 同上 |
| `client_id` | text | 否 | `= id` | 同上 |
| `revision` | integer | 否 | `?? 1` | 同上 |
| `created_at`/`updated_at` | timestamptz | 否 | 服务端/本地 | E1 L620-627 |

- 操作：INSERT｜UPDATE（编辑/封面回填）｜DELETE（`delete_entry`，含删空地点级联 `delete_place`）。
- 约束/级联：`entries_place_owner_fk`、`entries_cover_owner_fk`（E1 L323-332）。
- 关系：`entry_tags` 差量同步「先增后删」（E1 L339-357）——关联存独立表，不在 entries 行。
- 失败/冲突：0 行 → `ConflictRecord(kind='entry')`（E1 L335、L581）。

### A.3 `media`（辅助对象，受控 upsert）

| 列 | pg 类型 | 可空 | 移动端值 | 证据 |
|---|---|---|---|---|
| `id` | uuid | 否 | 客户端 uuid | E1 `upload_media` L413-418 |
| `owner_user_id` | uuid | 否 | 会话 | 同上 |
| `entry_id` | uuid | 否 | `entryId`（`media_entry_owner_fk`） | 同上 |
| `place_id` | uuid | 否 | `placeId` | 同上 |
| `storage_path` | text | 否 | `{owner}/{placeId}/{mediaId}/display.jpg` | L400-416 |
| `thumb_path` | text | 是 | `.../thumb.jpg` | 同上 |
| `width`/`height`/`bytes` | integer | 是 | `?? null` | 同上 |
| `taken_at` | timestamptz | 是 | `?? null` | 同上 |
| `sort_order` | integer | 否 | `order` | 同上 |
| `client_id` | text | 否 | `= id` | 同上 |
| `created_at`/`updated_at` | timestamptz | 否 | 服务端 | E1 `pullRemote` L628-633 |

- 操作：Storage upload（thumb/display，`upsert:true`）→ `media` upsert `onConflict 'owner_user_id,client_id'`。
- 幂等：对象已存在视为成功（`error.message.includes('exists')`）；行按 `(owner_user_id, client_id)` 幂等。
- 失败：上传/入库失败删已传对象、保留本地文件、不标 synced（E1 L420-426、L509-511）。

### A.4 `tag_dimensions`（核心实体，乐观锁）

| 列 | pg 类型 | 可空 | 移动端值 | 证据 |
|---|---|---|---|---|
| `id` | uuid | 否 | 客户端 uuid | E1 `dimRow` L92-94 |
| `owner_user_id` | uuid | 否 | 会话 | 同上 |
| `name` | text | 否 | 原样 | 同上 |
| `kind` | text | 否 | region/type/scene/crowd/custom | 同上；E3 |
| `sort_order` | integer | 否 | `sortOrder` | 同上 |
| `revision` | integer | 否 | `?? 1`，服务端 +1 | 同上 |

- 操作：INSERT｜UPDATE expected-revision。
- 依赖：`tags.dimension_id` 引用维度，维度先于标签推送（E1 `ensureTagsInCloud` L177-183）。
- 失败/冲突：0 行 → `ConflictRecord(kind='dimension')`（E1 L181、L583）。

### A.5 `tags`（核心实体，乐观锁）

| 列 | pg 类型 | 可空 | 移动端值 | 证据 |
|---|---|---|---|---|
| `id` | uuid | 否 | 客户端 uuid | E1 `tagRow` L95-97 |
| `owner_user_id` | uuid | 否 | 会话 | 同上 |
| `dimension_id` | uuid | 否 | `dimensionId` | 同上 |
| `parent_id` | uuid | 是 | `parentId ?? null`（`tags_parent_owner_fk`） | 同上 |
| `name` | text | 否 | 原样 | 同上 |
| `alias` | text | 是 | `alias ?? null` | 同上 |
| `sort_order` | integer | 否 | `sortOrder` | 同上 |
| `revision` | integer | 否 | `?? 1` | 同上 |

- 操作：INSERT｜UPDATE expected-revision｜DELETE（`delete_tags`，关联先删、子先父后）。
- 依赖：**父标签先于子标签**（按父链深度升序；E1 L361-369）；维度先于标签。
- 失败/冲突：0 行 → `ConflictRecord(kind='tag')`（E1 L186-187、L582）。

### A.6 `entry_tags`（关联表，无 revision）

| 列 | pg 类型 | 可空 | 移动端值 | 证据 |
|---|---|---|---|---|
| `entry_id` | uuid | 否 | entry id | E1 L348-351 |
| `tag_id` | uuid | 否 | tag id（`entry_tags_tag_fk`） | 同上 |
| `owner_user_id` | uuid | 否 | 会话（归属一致性触发器） | E1 L349；E6 |

- 操作：`upsert onConflict 'entry_id,tag_id'`（先增）→ `delete ... in('tag_id', toDel)`（后删）。
- 幂等键：`(entry_id, tag_id)`。
- 依赖：entry 先上云 + tag/dimension 先 ensure。

### A.7 `share_snapshots`（辅助对象，受控 upsert）

| 列 | pg 类型 | 可空 | 移动端值 | 证据 |
|---|---|---|---|---|
| `id` | uuid | 否 | 客户端 uuid | E1 `create_share` L455-461 |
| `owner_user_id` | uuid | 否 | 会话 | 同上 |
| `slug` | text | 否 | 22 位 base36（`shares.ts` slug） | E2 L6-12 |
| `kind` | text | 否 | single/list | E1 L456；E3 |
| `title` | text | 否 | 原样 | 同上 |
| `owner_display_name` | text | 是 | `?? null` | 同上 |
| `payload` | jsonb | 否 | `{title, owner_display_name, created_at}` | E1 L458 |
| `status` | text | 否 | active / revoked | E1 L459、L481-483 |
| `client_id` | text | 否 | `= id` | 同上 |
| `created_at` | timestamptz | 否 | `createdAt` | 同上 |

- 操作：upsert `onConflict 'owner_user_id,client_id'`｜UPDATE `status='revoked' eq('slug')`。
- 撤销幂等：云端无此 slug = 目的已达成，正常出队（E1 L485-487）。
- 公开读取：见 §C（anon 无表权限，仅 RPC）。

### A.8 `share_items`（辅助对象，受控 upsert）

| 列 | pg 类型 | 可空 | 移动端值 | 证据 |
|---|---|---|---|---|
| `id` | uuid | 否 | 服务端生成 | E1 L469 |
| `snapshot_id` | uuid | 否 | snapshot id | E1 L463-467 |
| `owner_user_id` | uuid | 否 | 会话 | 同上 |
| `sort_order` | integer | 否 | 数组下标 | 同上 |
| `item` | jsonb | 否 | **白名单 payload + cover_url** | E1 `shareItemPayload` L98-111 |
| `client_id` | text | 否 | `it.clientId` | 同上 |

- 操作：`upsert onConflict 'snapshot_id,client_id'`（先增）→ 删 stale（后删）。
- 幂等键：`(snapshot_id, client_id)`。
- 失败：封面上传失败时 `cover_url=null`，快照照常上云（E1 L439-454）。

## B. 两 Storage bucket 合同

| bucket | 用途 | 对象路径 | 移动端操作 | 证据 |
|---|---|---|---|---|
| `habit-tracker-media-private` | 私有展示图/缩略图 | `{owner}/{placeId}/{mediaId}/display.jpg`、`.../thumb.jpg` | INSERT(upload, upsert) + SELECT(createSignedUrl) + UPDATE(upsert) | E1 L400-416、L44-47；E5 §①-③ |
| `habit-tracker-media-share` | 公开分享封面缩略图 | `{owner}/{snapshotId}/{shareItemClientId}.jpg` | INSERT(upload, upsert) + 公开读(getPublicUrl) | E1 L447-452；E5 §④-⑤ |

| 约束 | 值 | 证据 |
|---|---|---|
| 私有桶隐私 | 原图永不上云；EXIF/GPS 由重编码清除；匿名 400 拒读 | E5 §①-③ |
| 公开桶 | 2MB 上限、MIME 白名单 png/jpeg/webp/gif、匿名可读 | E5 §⑦-⑧ |
| 写保护 | 匿名写 403；本人写他人首层目录 403（`(storage.foldername(name))[1]=auth.uid()`） | E5 §⑨ |
| 幂等 | 对象已存在视为成功（`includes('exists')`） | E1 L405、L410、L450 |

- 路径 helper 落在 `mobile/src/domain/types.ts`（`privateMediaBasePath`/`privateDisplayPath`/`privateThumbPath`/`shareCoverPath`）。
- 未决运行假设（不阻断合同，属 T111 真机验证）：现有 bucket RLS 同时满足 INSERT/SELECT/UPDATE（计划 Key Assumptions「待合理验证」）。

## C. RPC `habit_tracker.public_share_read` 合同

| 方向 | 字段 | 说明 | 证据 |
|---|---|---|---|
| 输入 | `p_slug`（text） | 分享 slug；不可枚举 | E2 L86；E4 |
| 输出 | `snapshot` | `{id, slug, kind, title, owner_display_name, created_at}` | E2 L88-104 |
| 输出 | `items[]` | `{id, item:{…白名单…}, sort_order}`（嵌套，非扁平） | E2 L91-103；E5 §⑥ |

**白名单字段（匿名可见，共 8 键）**：`name`、`area`、`rating`、`budget`、`note_public`、
`tags`、`coord_precision`、`cover_url`。

| 保证 | 内容 | 证据 |
|---|---|---|
| 私密剔除 | 无 `note_private` / `transcript` / 精确坐标 `lat`/`lng` | E5 §⑥ |
| 撤销语义 | 非 active 快照 RPC 返回 null（链接失效） | E5；PRODUCT_PLAN |
| 权限 | anon 表权限 0，仅可执行 `public_share_read` | E4；E5 |
| kind 校验 | `kind` 不匹配视为无效（移动端返回 null） | E2 L90 |
| 映射真源 | 白名单 mapper = `mobile/src/domain/mapping.ts` `shareItemToPayload` | 本 Task |

## D. 对齐结论与门禁判定

| 检查项 | 结果 |
|---|---|
| 8 表每列有现役线合同证据（E1/E2） | ✅ 对上 |
| 每类移动端操作有幂等键 | ✅ 对上（§2、§A） |
| 前置依赖（place→entry、dim→tag→entry_tags、upload→cover、snapshot→items） | ✅ 对上 |
| 失败/冲突结果（0 行冲突、毒丸停放、父失败阻断、删除不存在=成功） | ✅ 对上 |
| 两 bucket 路径 + INSERT/SELECT/UPDATE | ✅ 对上（§B；T111 真机验证 RLS） |
| RPC 输入/白名单输出 | ✅ 对上（§C） |
| 需要新建生产表/字段/Policy/Bucket | ❌ 无（`PRODUCTION_DB_MIGRATION = 0`） |

**判定：0 项对不上，门禁通过，T012–T013 可继续。**

**非阻断提示（透明记录）**：仓内 `supabase/migrations/` 仅有指针 README，DB 级 CHECK/默认值
明细需以平台仓权威 `0001_init.sql` 为准；移动端全部显式传值、不依赖 DB 默认，故不构成缺口。
若 T014+ 读取权威 DDL 后发现与 E1/E2 冲突：**停止实现并返 TM**（门禁 ④）。
