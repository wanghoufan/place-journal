// 本地 SQLite V1 schema（T014）。
//
// 真源对照：
//   - 领域实体字段：`mobile/src/domain/types.ts`（列名 snake_case，与云端线合同同名）
//   - 状态语义：`docs/pm/PRODUCT_PLAN_V1.0.md` §6 Data Model / SDD-PLAN §6.1–6.5
//   - 云端 8 表：`CLOUD_TABLES`（places/entries/media/tag_dimensions/tags/entry_tags/
//     share_snapshots/share_items），本地另加 meta/outbox/conflicts 与迁移账本。
//
// 约定：
//   - 本地列一律 snake_case；camelCase 领域字段 ↔ 列的转换由 mapping/repository 负责。
//   - 核心实体（places/entries/tag_dimensions/tags）带 `revision`/`base_revision`/
//     `sync_status`，dirty guard 判定为 `revision !== (base_revision ?? revision)`。
//   - 逻辑布尔用 INTEGER 0/1；时间用 ISO8601 TEXT；JSON 集合用 TEXT。
//   - R-05：只建表、只向前迁移，任何 up 脚本禁止 DROP 业务表或清空真实数据。
//
// 本文件只提供 DDL 与列白名单元数据，不执行迁移；执行见 `migrations.ts`。

import type { SqlDatabase } from './database'

/** 迁移账本（版本号表）：记录已应用的版本，配合 `PRAGMA user_version` 双确认。 */
export const SCHEMA_MIGRATIONS_TABLE = 'schema_migrations'

export const MIGRATIONS_DDL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version    INTEGER PRIMARY KEY NOT NULL,
  applied_at TEXT NOT NULL
);`

/** 同步状态枚举，与领域 `SyncStatus` 逐字一致。 */
export const SYNC_STATUS_VALUES = ['local', 'syncing', 'synced', 'failed', 'conflict'] as const

/** outbox 操作种类，与 Web `src/lib/idb.ts` OutboxOp 兼容（T019）。 */
export const OUTBOX_KINDS = [
  'upsert_place',
  'upsert_entry',
  'upload_media',
  'upsert_tags',
  'delete_tags',
  'delete_place',
  'delete_entry',
  'create_share',
  'revoke_share',
] as const

/** outbox 状态机：pending → claimed →（完成删除 / 失败回 pending / 超限 parked）。 */
export const OUTBOX_STATUS_VALUES = ['pending', 'claimed', 'parked'] as const

/** 冲突裁决状态（conflicts 表，T014/T020）。 */
export const CONFLICT_STATUS_VALUES = ['open', 'keep_local', 'take_remote'] as const

const OUTBOX_KIND_SQL = OUTBOX_KINDS.map((k) => `'${k}'`).join(', ')
const SYNC_STATUS_SQL = SYNC_STATUS_VALUES.map((k) => `'${k}'`).join(', ')
const OUTBOX_STATUS_SQL = OUTBOX_STATUS_VALUES.map((k) => `'${k}'`).join(', ')
const CONFLICT_STATUS_SQL = CONFLICT_STATUS_VALUES.map((k) => `'${k}'`).join(', ')

/** V1 业务表 DDL（11 张；不含迁移账本）。 */
export const V1_TABLES_DDL = `
-- 地点：核心实体，乐观锁 + dirty guard
CREATE TABLE IF NOT EXISTS places (
  id              TEXT PRIMARY KEY NOT NULL,
  name            TEXT NOT NULL,
  area            TEXT,
  lat             REAL,
  lng             REAL,
  coord_precision TEXT NOT NULL DEFAULT 'exact',
  is_private      INTEGER NOT NULL DEFAULT 0,
  revision        INTEGER NOT NULL DEFAULT 0,
  base_revision   INTEGER,
  demo            INTEGER NOT NULL DEFAULT 0,
  sync_status     TEXT NOT NULL DEFAULT 'local' CHECK (sync_status IN (${SYNC_STATUS_SQL})),
  sync_error      TEXT,
  created_at      TEXT,
  updated_at      TEXT
);

-- 记录：核心实体，乐观锁 + dirty guard；place 删除时级联
CREATE TABLE IF NOT EXISTS entries (
  id             TEXT PRIMARY KEY NOT NULL,
  place_id       TEXT NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  visit_date     TEXT NOT NULL,
  rating         INTEGER,
  budget         REAL,
  transcript     TEXT,
  note_private   TEXT,
  note_public    TEXT,
  summary        TEXT,
  cover_media_id TEXT,
  is_private     INTEGER NOT NULL DEFAULT 0,
  revision       INTEGER NOT NULL DEFAULT 0,
  base_revision  INTEGER,
  demo           INTEGER NOT NULL DEFAULT 0,
  sync_status    TEXT NOT NULL DEFAULT 'local' CHECK (sync_status IN (${SYNC_STATUS_SQL})),
  sync_error     TEXT,
  created_at     TEXT,
  updated_at     TEXT
);

-- 媒体：辅助对象，无 revision；本地存文件路径（R-01 D1/D2）
CREATE TABLE IF NOT EXISTS media (
  id                 TEXT PRIMARY KEY NOT NULL,
  entry_id           TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  place_id           TEXT NOT NULL REFERENCES places(id),
  local_display_path TEXT,
  local_thumb_path   TEXT,
  demo_uri           TEXT,
  width              INTEGER,
  height             INTEGER,
  bytes              INTEGER,
  taken_at           TEXT,
  sort_order         INTEGER NOT NULL DEFAULT 0,
  remote_path        TEXT,
  remote_thumb_path  TEXT,
  sync_status        TEXT NOT NULL DEFAULT 'local' CHECK (sync_status IN (${SYNC_STATUS_SQL})),
  demo               INTEGER NOT NULL DEFAULT 0,
  created_at         TEXT,
  updated_at         TEXT
);

-- 标签维度：核心实体
CREATE TABLE IF NOT EXISTS tag_dimensions (
  id            TEXT PRIMARY KEY NOT NULL,
  name          TEXT NOT NULL,
  kind          TEXT NOT NULL,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  revision      INTEGER NOT NULL DEFAULT 0,
  base_revision INTEGER,
  demo          INTEGER NOT NULL DEFAULT 0,
  sync_status   TEXT NOT NULL DEFAULT 'local' CHECK (sync_status IN (${SYNC_STATUS_SQL})),
  created_at    TEXT,
  updated_at    TEXT
);

-- 标签：核心实体；父删子级联
CREATE TABLE IF NOT EXISTS tags (
  id            TEXT PRIMARY KEY NOT NULL,
  dimension_id  TEXT NOT NULL REFERENCES tag_dimensions(id) ON DELETE CASCADE,
  parent_id     TEXT REFERENCES tags(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  alias         TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  revision      INTEGER NOT NULL DEFAULT 0,
  base_revision INTEGER,
  demo          INTEGER NOT NULL DEFAULT 0,
  sync_status   TEXT NOT NULL DEFAULT 'local' CHECK (sync_status IN (${SYNC_STATUS_SQL})),
  created_at    TEXT,
  updated_at    TEXT
);

-- 记录↔标签关联（仅叶子标签）；复合主键幂等
CREATE TABLE IF NOT EXISTS entry_tags (
  entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  tag_id   TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (entry_id, tag_id)
);

-- 分享快照
CREATE TABLE IF NOT EXISTS share_snapshots (
  id         TEXT PRIMARY KEY NOT NULL,
  slug       TEXT NOT NULL UNIQUE,
  kind       TEXT NOT NULL,
  title      TEXT NOT NULL,
  owner_name TEXT,
  status     TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT
);

-- 分享项：白名单 payload 已由 mapping 剔除私密字段，本地额外存长图用 photos
CREATE TABLE IF NOT EXISTS share_items (
  snapshot_id    TEXT NOT NULL REFERENCES share_snapshots(id) ON DELETE CASCADE,
  client_id      TEXT NOT NULL,
  entry_id       TEXT,
  cover_media_id TEXT,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  place_name     TEXT NOT NULL,
  area           TEXT,
  rating         INTEGER,
  budget         REAL,
  reason         TEXT,
  tags_json      TEXT,
  cover_uri      TEXT,
  photos_json    TEXT,
  lat            REAL,
  lng            REAL,
  coord_hidden   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (snapshot_id, client_id)
);

-- 键值元数据（JSON 编码 value）
CREATE TABLE IF NOT EXISTS meta (
  key        TEXT PRIMARY KEY NOT NULL,
  value      TEXT,
  updated_at TEXT
);

-- 持久 outbox：顺序、认领、重试、停放（T019）
CREATE TABLE IF NOT EXISTS outbox (
  seq        INTEGER PRIMARY KEY AUTOINCREMENT,
  op_id      TEXT NOT NULL UNIQUE,
  kind       TEXT NOT NULL CHECK (kind IN (${OUTBOX_KIND_SQL})),
  entity_id  TEXT,
  entity_ids TEXT,
  depends_on TEXT NOT NULL DEFAULT '[]',
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (${OUTBOX_STATUS_SQL})),
  attempts   INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL,
  claimed_at TEXT,
  parked_at  TEXT
);

-- 冲突记录：保留本地原内容，等人工裁决（T020/FR-015）
CREATE TABLE IF NOT EXISTS conflicts (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_id         TEXT NOT NULL,
  entity_kind       TEXT NOT NULL,
  expected_revision INTEGER,
  local_snapshot    TEXT,
  remote_snapshot   TEXT,
  status            TEXT NOT NULL DEFAULT 'open' CHECK (status IN (${CONFLICT_STATUS_SQL})),
  created_at        TEXT NOT NULL,
  resolved_at       TEXT,
  resolution        TEXT
);

CREATE INDEX IF NOT EXISTS idx_entries_place        ON entries(place_id);
CREATE INDEX IF NOT EXISTS idx_entries_sync_status  ON entries(sync_status);
CREATE INDEX IF NOT EXISTS idx_places_sync_status   ON places(sync_status);
CREATE INDEX IF NOT EXISTS idx_media_entry          ON media(entry_id);
CREATE INDEX IF NOT EXISTS idx_media_place          ON media(place_id);
CREATE INDEX IF NOT EXISTS idx_media_sync_status    ON media(sync_status);
CREATE INDEX IF NOT EXISTS idx_tags_dimension       ON tags(dimension_id);
CREATE INDEX IF NOT EXISTS idx_tags_parent          ON tags(parent_id);
CREATE INDEX IF NOT EXISTS idx_entry_tags_tag       ON entry_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_share_items_snapshot ON share_items(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_outbox_status_seq    ON outbox(status, seq);
CREATE INDEX IF NOT EXISTS idx_outbox_entity        ON outbox(entity_id);
CREATE INDEX IF NOT EXISTS idx_conflicts_entity     ON conflicts(entity_kind, entity_id, status);`

/** V1 业务表名（供测试与仓库白名单校验）。 */
export const V1_TABLES = [
  'places',
  'entries',
  'media',
  'tag_dimensions',
  'tags',
  'entry_tags',
  'share_snapshots',
  'share_items',
  'meta',
  'outbox',
  'conflicts',
] as const

export type TableName = (typeof V1_TABLES)[number]

/** 核心实体（带 revision/base_revision/dirty guard）。 */
export const CORE_ENTITY_TABLES = ['places', 'entries', 'tag_dimensions', 'tags'] as const
export type CoreEntityTable = (typeof CORE_ENTITY_TABLES)[number]

/**
 * 每表允许写入的列白名单。repository 只据此拼 SQL，杜绝列名注入与拼写漂移。
 * 刻意不含 `seq`（outbox 自增主键，由 SQLite 生成）。
 */
export const TABLE_COLUMNS: Record<TableName, readonly string[]> = {
  places: [
    'id', 'name', 'area', 'lat', 'lng', 'coord_precision', 'is_private',
    'revision', 'base_revision', 'demo', 'sync_status', 'sync_error', 'created_at', 'updated_at',
  ],
  entries: [
    'id', 'place_id', 'visit_date', 'rating', 'budget', 'transcript', 'note_private',
    'note_public', 'summary', 'cover_media_id', 'is_private', 'revision', 'base_revision',
    'demo', 'sync_status', 'sync_error', 'created_at', 'updated_at',
  ],
  media: [
    'id', 'entry_id', 'place_id', 'local_display_path', 'local_thumb_path', 'demo_uri',
    'width', 'height', 'bytes', 'taken_at', 'sort_order', 'remote_path', 'remote_thumb_path',
    'sync_status', 'demo', 'created_at', 'updated_at',
  ],
  tag_dimensions: [
    'id', 'name', 'kind', 'sort_order', 'revision', 'base_revision', 'demo', 'sync_status',
    'created_at', 'updated_at',
  ],
  tags: [
    'id', 'dimension_id', 'parent_id', 'name', 'alias', 'sort_order', 'revision',
    'base_revision', 'demo', 'sync_status', 'created_at', 'updated_at',
  ],
  entry_tags: ['entry_id', 'tag_id'],
  share_snapshots: ['id', 'slug', 'kind', 'title', 'owner_name', 'status', 'created_at', 'updated_at'],
  share_items: [
    'snapshot_id', 'client_id', 'entry_id', 'cover_media_id', 'sort_order', 'place_name',
    'area', 'rating', 'budget', 'reason', 'tags_json', 'cover_uri', 'photos_json', 'lat', 'lng',
    'coord_hidden',
  ],
  meta: ['key', 'value', 'updated_at'],
  outbox: [
    'op_id', 'kind', 'entity_id', 'entity_ids', 'depends_on', 'status', 'attempts',
    'last_error', 'created_at', 'claimed_at', 'parked_at',
  ],
  conflicts: [
    'entity_id', 'entity_kind', 'expected_revision', 'local_snapshot', 'remote_snapshot',
    'status', 'created_at', 'resolved_at', 'resolution',
  ],
}

/**
 * 每表应有列（名称＋可用于 `ALTER TABLE ADD COLUMN` 的定义），以当前 latest DDL 为准。
 * 迁移 v3 据此批量补齐老库缺列；与 `V1_TABLES_DDL` 必须逐列一致（测试 `migrations.test.ts`
 * 用 `PRAGMA table_info` 对新库做全等校验，防止此后 DDL 原地增列再漏补）。
 * 主键/UNIQUE 列在 SQLite 里不可 ADD，仅作清单完整性用途（老库基线必有，判存在后 no-op）。
 */
export interface ExpectedColumn {
  name: string
  definition: string
}

export const EXPECTED_COLUMNS: Record<TableName, readonly ExpectedColumn[]> = {
  places: [
    { name: 'id', definition: 'TEXT PRIMARY KEY NOT NULL' },
    { name: 'name', definition: 'TEXT NOT NULL' },
    { name: 'area', definition: 'TEXT' },
    { name: 'lat', definition: 'REAL' },
    { name: 'lng', definition: 'REAL' },
    { name: 'coord_precision', definition: `TEXT NOT NULL DEFAULT 'exact'` },
    { name: 'is_private', definition: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'revision', definition: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'base_revision', definition: 'INTEGER' },
    { name: 'demo', definition: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'sync_status', definition: `TEXT NOT NULL DEFAULT 'local' CHECK (sync_status IN (${SYNC_STATUS_SQL}))` },
    { name: 'sync_error', definition: 'TEXT' },
    { name: 'created_at', definition: 'TEXT' },
    { name: 'updated_at', definition: 'TEXT' },
  ],
  entries: [
    { name: 'id', definition: 'TEXT PRIMARY KEY NOT NULL' },
    { name: 'place_id', definition: 'TEXT NOT NULL REFERENCES places(id) ON DELETE CASCADE' },
    { name: 'visit_date', definition: 'TEXT NOT NULL' },
    { name: 'rating', definition: 'INTEGER' },
    { name: 'budget', definition: 'REAL' },
    { name: 'transcript', definition: 'TEXT' },
    { name: 'note_private', definition: 'TEXT' },
    { name: 'note_public', definition: 'TEXT' },
    { name: 'summary', definition: 'TEXT' },
    { name: 'cover_media_id', definition: 'TEXT' },
    { name: 'is_private', definition: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'revision', definition: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'base_revision', definition: 'INTEGER' },
    { name: 'demo', definition: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'sync_status', definition: `TEXT NOT NULL DEFAULT 'local' CHECK (sync_status IN (${SYNC_STATUS_SQL}))` },
    { name: 'sync_error', definition: 'TEXT' },
    { name: 'created_at', definition: 'TEXT' },
    { name: 'updated_at', definition: 'TEXT' },
  ],
  media: [
    { name: 'id', definition: 'TEXT PRIMARY KEY NOT NULL' },
    { name: 'entry_id', definition: 'TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE' },
    { name: 'place_id', definition: 'TEXT NOT NULL REFERENCES places(id)' },
    { name: 'local_display_path', definition: 'TEXT' },
    { name: 'local_thumb_path', definition: 'TEXT' },
    { name: 'demo_uri', definition: 'TEXT' },
    { name: 'width', definition: 'INTEGER' },
    { name: 'height', definition: 'INTEGER' },
    { name: 'bytes', definition: 'INTEGER' },
    { name: 'taken_at', definition: 'TEXT' },
    { name: 'sort_order', definition: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'remote_path', definition: 'TEXT' },
    { name: 'remote_thumb_path', definition: 'TEXT' },
    { name: 'sync_status', definition: `TEXT NOT NULL DEFAULT 'local' CHECK (sync_status IN (${SYNC_STATUS_SQL}))` },
    { name: 'demo', definition: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'created_at', definition: 'TEXT' },
    { name: 'updated_at', definition: 'TEXT' },
  ],
  tag_dimensions: [
    { name: 'id', definition: 'TEXT PRIMARY KEY NOT NULL' },
    { name: 'name', definition: 'TEXT NOT NULL' },
    { name: 'kind', definition: 'TEXT NOT NULL' },
    { name: 'sort_order', definition: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'revision', definition: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'base_revision', definition: 'INTEGER' },
    { name: 'demo', definition: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'sync_status', definition: `TEXT NOT NULL DEFAULT 'local' CHECK (sync_status IN (${SYNC_STATUS_SQL}))` },
    { name: 'created_at', definition: 'TEXT' },
    { name: 'updated_at', definition: 'TEXT' },
  ],
  tags: [
    { name: 'id', definition: 'TEXT PRIMARY KEY NOT NULL' },
    { name: 'dimension_id', definition: 'TEXT NOT NULL REFERENCES tag_dimensions(id) ON DELETE CASCADE' },
    { name: 'parent_id', definition: 'TEXT REFERENCES tags(id) ON DELETE CASCADE' },
    { name: 'name', definition: 'TEXT NOT NULL' },
    { name: 'alias', definition: 'TEXT' },
    { name: 'sort_order', definition: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'revision', definition: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'base_revision', definition: 'INTEGER' },
    { name: 'demo', definition: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'sync_status', definition: `TEXT NOT NULL DEFAULT 'local' CHECK (sync_status IN (${SYNC_STATUS_SQL}))` },
    { name: 'created_at', definition: 'TEXT' },
    { name: 'updated_at', definition: 'TEXT' },
  ],
  entry_tags: [
    { name: 'entry_id', definition: 'TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE' },
    { name: 'tag_id', definition: 'TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE' },
  ],
  share_snapshots: [
    { name: 'id', definition: 'TEXT PRIMARY KEY NOT NULL' },
    { name: 'slug', definition: 'TEXT NOT NULL UNIQUE' },
    { name: 'kind', definition: 'TEXT NOT NULL' },
    { name: 'title', definition: 'TEXT NOT NULL' },
    { name: 'owner_name', definition: 'TEXT' },
    { name: 'status', definition: `TEXT NOT NULL DEFAULT 'active'` },
    { name: 'created_at', definition: 'TEXT NOT NULL' },
    { name: 'updated_at', definition: 'TEXT' },
  ],
  share_items: [
    { name: 'snapshot_id', definition: 'TEXT NOT NULL REFERENCES share_snapshots(id) ON DELETE CASCADE' },
    { name: 'client_id', definition: 'TEXT NOT NULL' },
    { name: 'entry_id', definition: 'TEXT' },
    { name: 'cover_media_id', definition: 'TEXT' },
    { name: 'sort_order', definition: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'place_name', definition: 'TEXT NOT NULL' },
    { name: 'area', definition: 'TEXT' },
    { name: 'rating', definition: 'INTEGER' },
    { name: 'budget', definition: 'REAL' },
    { name: 'reason', definition: 'TEXT' },
    { name: 'tags_json', definition: 'TEXT' },
    { name: 'cover_uri', definition: 'TEXT' },
    { name: 'photos_json', definition: 'TEXT' },
    { name: 'lat', definition: 'REAL' },
    { name: 'lng', definition: 'REAL' },
    { name: 'coord_hidden', definition: 'INTEGER NOT NULL DEFAULT 0' },
  ],
  meta: [
    { name: 'key', definition: 'TEXT PRIMARY KEY NOT NULL' },
    { name: 'value', definition: 'TEXT' },
    { name: 'updated_at', definition: 'TEXT' },
  ],
  outbox: [
    { name: 'seq', definition: 'INTEGER PRIMARY KEY AUTOINCREMENT' },
    { name: 'op_id', definition: 'TEXT NOT NULL UNIQUE' },
    { name: 'kind', definition: `TEXT NOT NULL CHECK (kind IN (${OUTBOX_KIND_SQL}))` },
    { name: 'entity_id', definition: 'TEXT' },
    { name: 'entity_ids', definition: 'TEXT' },
    { name: 'depends_on', definition: `TEXT NOT NULL DEFAULT '[]'` },
    { name: 'status', definition: `TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (${OUTBOX_STATUS_SQL}))` },
    { name: 'attempts', definition: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'last_error', definition: 'TEXT' },
    { name: 'created_at', definition: 'TEXT NOT NULL' },
    { name: 'claimed_at', definition: 'TEXT' },
    { name: 'parked_at', definition: 'TEXT' },
  ],
  conflicts: [
    { name: 'id', definition: 'INTEGER PRIMARY KEY AUTOINCREMENT' },
    { name: 'entity_id', definition: 'TEXT NOT NULL' },
    { name: 'entity_kind', definition: 'TEXT NOT NULL' },
    { name: 'expected_revision', definition: 'INTEGER' },
    { name: 'local_snapshot', definition: 'TEXT' },
    { name: 'remote_snapshot', definition: 'TEXT' },
    { name: 'status', definition: `TEXT NOT NULL DEFAULT 'open' CHECK (status IN (${CONFLICT_STATUS_SQL}))` },
    { name: 'created_at', definition: 'TEXT NOT NULL' },
    { name: 'resolved_at', definition: 'TEXT' },
    { name: 'resolution', definition: 'TEXT' },
  ],
}

/** 非空但无默认值的列：upsert 时缺列会由 SQLite 报错（让事务回滚）。 */
export function assertKnownColumns(table: TableName, columns: string[]): void {
  const allowed = new Set(TABLE_COLUMNS[table])
  for (const c of columns) {
    if (!allowed.has(c)) throw new Error(`未知列 ${table}.${c}`)
  }
}

/** 供测试/诊断：列出当前库中除 sqlite 内部表外的业务表名。 */
export function listUserTables(db: SqlDatabase): string[] {
  return db
    .getAllSync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .map((r) => r.name)
}
