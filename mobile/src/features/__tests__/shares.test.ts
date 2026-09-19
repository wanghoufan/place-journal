// TASK-DEV-12 分享本地段单测：创建白名单越界、撤销幂等、扁平/嵌套双兼容。
// 全部走真实 SQLite（node:sqlite），不触网、无凭据。

import { applyConnectionPragmas, type SqlDatabase } from '../../db/database'
import { runMigrations } from '../../db/migrations'
import { createRepository, type Repository } from '../../db/repository'
import { shareItemToPayload, publicShareToSnapshot } from '../../domain/mapping'
import type { PublicShareReadResult } from '../../domain/types'
import { createNodeSqliteDatabase } from '../../test/nodeSqliteAdapter'
import {
  buildShareItem,
  createEntryShare,
  createListShare,
  newSlug,
  revokeShare,
  shareItemFromRow,
  ShareValidationError,
} from '../shares'
import { getShareSnapshotBySlug, listShareSnapshots, shareSnapshotCount } from '../queries'
import type { EntityRow } from '../../db/repository'

const NOW = '2026-09-18T10:00:00.000Z'
const SLUG = 'abcdefghijklmnopqrstuv'

function setup(): { db: SqlDatabase; repo: Repository } {
  const db = createNodeSqliteDatabase()
  applyConnectionPragmas(db)
  runMigrations(db)
  return { db, repo: createRepository(db) }
}

function seedEntry(db: SqlDatabase, repo: Repository, entryId = 'e1', coordPrecision = 'exact'): void {
  if (!repo.get('places', 'p1')) {
    repo.saveCoreEntity('places', {
      id: 'p1',
      name: '西海岸日落咖啡',
      area: '海口 · 西海岸',
      lat: 20.0458,
      lng: 110.2216,
      coord_precision: coordPrecision,
      is_private: 0,
      demo: 0,
    })
  }
  repo.saveCoreEntity('entries', {
    id: entryId,
    place_id: 'p1',
    visit_date: '2026-09-18',
    rating: 4,
    budget: 50,
    transcript: '私密转写',
    note_private: '私密感受',
    note_public: '公开理由',
    summary: '一句话摘要',
    cover_media_id: `m-${entryId}`,
    is_private: 0,
    demo: 0,
  })
  repo.upsert('media', {
    id: `m-${entryId}`,
    entry_id: entryId,
    place_id: 'p1',
    local_display_path: `file:///documents/${entryId}-display.jpg`,
    local_thumb_path: `file:///documents/${entryId}-thumb.jpg`,
    sort_order: 0,
    sync_status: 'local',
  })
  if (!repo.get('tags', 't1')) {
    repo.saveCoreEntity('tag_dimensions', { id: 'd1', name: '场景', kind: 'scene', sort_order: 0 })
    repo.saveCoreEntity('tags', { id: 't1', dimension_id: 'd1', name: '约会', sort_order: 0 })
  }
  db.runSync('INSERT OR IGNORE INTO entry_tags (entry_id, tag_id) VALUES (?, ?)', entryId, 't1')
}

function outboxRows(db: SqlDatabase): { kind: string; entity_id: string | null; entity_ids: string | null }[] {
  return db.getAllSync<{ kind: string; entity_id: string | null; entity_ids: string | null }>(
    'SELECT kind, entity_id, entity_ids FROM outbox ORDER BY seq ASC',
  )
}

function count(db: SqlDatabase, table: string): number {
  return db.getFirstSync<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`)?.n ?? 0
}

describe('shares: 创建本地快照', () => {
  it('entry → 快照 + 分享项落库，并入队 create_share（同事务）', () => {
    const { db, repo } = setup()
    seedEntry(db, repo)

    const snapshot = createEntryShare(db, repo, { entryId: 'e1', slug: SLUG, now: NOW })

    expect(snapshot.kind).toBe('single')
    expect(snapshot.slug).toBe(SLUG)
    expect(snapshot.title).toBe('西海岸日落咖啡')
    expect(snapshot.status).toBe('active')
    expect(snapshot.items).toHaveLength(1)

    expect(repo.get<EntityRow>('share_snapshots', snapshot.id)).toMatchObject({
      slug: SLUG,
      kind: 'single',
      title: '西海岸日落咖啡',
      status: 'active',
      created_at: NOW,
    })
    const row = db.getFirstSync<EntityRow>('SELECT * FROM share_items WHERE snapshot_id = ?', snapshot.id)!
    expect(row).toMatchObject({
      client_id: snapshot.items[0].clientId,
      sort_order: 0,
      place_name: '西海岸日落咖啡',
      area: '海口 · 西海岸',
      rating: 4,
      budget: 50,
      reason: '公开理由',
      entry_id: 'e1',
      coord_hidden: 0,
    })
    expect(JSON.parse(String(row.tags_json))).toEqual(['约会'])

    const ops = outboxRows(db)
    expect(ops.map((o) => o.kind)).toEqual(['create_share'])
    expect(ops[0].entity_id).toBe(snapshot.id)
  })

  it('白名单越界断言：lat/lng/transcript/私密/照片/来源 id 不落公开 payload', () => {
    const { db, repo } = setup()
    seedEntry(db, repo)

    const snapshot = createEntryShare(db, repo, { entryId: 'e1', slug: SLUG, now: NOW })
    const item = snapshot.items[0]
    // 本地 ShareItem 确实带着这些字段（证明确实是 mapper 剔除，而非从未产生）。
    expect(item.entryId).toBe('e1')
    expect(item.lat).toBe(20.05)
    expect(item.lng).toBe(110.22)
    expect(item.photos).toHaveLength(1)

    const row = db.getFirstSync<EntityRow>('SELECT * FROM share_items WHERE snapshot_id = ?', snapshot.id)!
    const payload = shareItemToPayload(shareItemFromRow(row))

    expect(Object.keys(payload).sort()).toEqual(
      ['area', 'budget', 'coord_precision', 'name', 'note_public', 'rating', 'tags'].sort(),
    )
    expect(payload).not.toHaveProperty('lat')
    expect(payload).not.toHaveProperty('lng')
    expect(payload).not.toHaveProperty('transcript')
    expect(payload).not.toHaveProperty('note_private')
    expect(payload).not.toHaveProperty('entryId')
    expect(payload).not.toHaveProperty('photos')
    expect(payload).not.toHaveProperty('coverMediaId')
    // 私密原文与精确坐标数值都不得出现在序列化后的公开内容里。
    const serialized = JSON.stringify(payload)
    expect(serialized).not.toContain('私密')
    expect(serialized).not.toContain('20.0458')
    expect(serialized).not.toContain('110.2216')
    expect(payload.coord_precision).toBe('approx')
  })

  it('坐标精度 hidden 时本地项与 payload 都不外泄坐标', () => {
    const { db, repo } = setup()
    seedEntry(db, repo, 'e1', 'hidden')

    const snapshot = createEntryShare(db, repo, { entryId: 'e1', slug: SLUG, now: NOW })
    const payload = shareItemToPayload(snapshot.items[0])
    expect(snapshot.items[0].lat).toBeUndefined()
    expect(snapshot.items[0].lng).toBeUndefined()
    expect(payload.coord_precision).toBe('hidden')
  })

  it('待分享记录不存在时报 ShareValidationError', () => {
    const { db, repo } = setup()
    expect(() => createEntryShare(db, repo, { entryId: 'missing' })).toThrow(ShareValidationError)
    expect(() => createEntryShare(db, repo, { entryId: 'missing' })).toThrow(/不存在/)
  })

  it('公开理由缺省回退 summary', () => {
    const { db, repo } = setup()
    seedEntry(db, repo)
    db.runSync('UPDATE entries SET note_public = NULL WHERE id = ?', 'e1')

    const snapshot = createEntryShare(db, repo, { entryId: 'e1', slug: SLUG, now: NOW })
    expect(shareItemToPayload(snapshot.items[0]).note_public).toBe('一句话摘要')
  })
})

describe('shares: 合集分享', () => {
  it('多条去重保序，入队一个 create_share', () => {
    const { db, repo } = setup()
    seedEntry(db, repo, 'e1')
    seedEntry(db, repo, 'e2')

    const snapshot = createListShare(db, repo, { entryIds: ['e2', 'e1', 'e2', ''], slug: SLUG, now: NOW })

    expect(snapshot.kind).toBe('list')
    expect(snapshot.title).toBe('已选 2 个地点')
    expect(snapshot.items).toHaveLength(2)
    expect(outboxRows(db).filter((o) => o.kind === 'create_share')).toHaveLength(1)
    const itemRows = db.getAllSync<EntityRow>('SELECT * FROM share_items ORDER BY sort_order ASC')
    expect(itemRows.map((r) => r.entry_id)).toEqual(['e2', 'e1'])
  })

  it('空选择报错', () => {
    const { db, repo } = setup()
    expect(() => createListShare(db, repo, { entryIds: [] })).toThrow(ShareValidationError)
  })
})

describe('shares: 撤销幂等', () => {
  it('首次撤销改本地状态并入队；重复撤销无副作用；未知 slug 不入队', () => {
    const { db, repo } = setup()
    seedEntry(db, repo)
    createEntryShare(db, repo, { entryId: 'e1', slug: SLUG, now: NOW })

    const first = revokeShare(db, repo, { slug: SLUG, now: NOW })
    expect(first.changed).toBe(true)
    expect(first.reason).toBe('revoked')
    expect(first.opId).not.toBeNull()
    const snapshotRow = db.getFirstSync<EntityRow>('SELECT * FROM share_snapshots WHERE slug = ?', SLUG)!
    expect(snapshotRow.status).toBe('revoked')
    const revokeOps = outboxRows(db).filter((o) => o.kind === 'revoke_share')
    expect(revokeOps).toHaveLength(1)
    expect(revokeOps[0].entity_id).toBe(SLUG)

    const again = revokeShare(db, repo, { slug: SLUG, now: NOW })
    expect(again.changed).toBe(false)
    expect(again.reason).toBe('already_revoked')
    expect(outboxRows(db).filter((o) => o.kind === 'revoke_share')).toHaveLength(1)

    const unknown = revokeShare(db, repo, { slug: 'no-such-slug' })
    expect(unknown.changed).toBe(false)
    expect(unknown.reason).toBe('not_found')
    expect(unknown.opId).toBeNull()
    expect(outboxRows(db).filter((o) => o.kind === 'revoke_share')).toHaveLength(1)
  })
})

describe('shares: 只读查询', () => {
  it('listShareSnapshots / getShareSnapshotBySlug / shareSnapshotCount', () => {
    const { db, repo } = setup()
    seedEntry(db, repo)
    const snapshot = createEntryShare(db, repo, { entryId: 'e1', slug: SLUG, now: NOW })
    revokeShare(db, repo, { slug: SLUG, now: NOW })

    expect(shareSnapshotCount(db)).toBe(1)
    const [summary] = listShareSnapshots(db)
    expect(summary).toMatchObject({ slug: SLUG, title: '西海岸日落咖啡', status: 'revoked', itemCount: 1 })

    const detail = getShareSnapshotBySlug(db, SLUG)
    expect(detail?.snapshot.id).toBe(snapshot.id)
    expect(detail?.items[0]).toMatchObject({ placeName: '西海岸日落咖啡', reason: '公开理由' })
    expect(getShareSnapshotBySlug(db, 'missing')).toBeNull()
  })
})

describe('shares: public_share_read 扁平 / 嵌套双兼容', () => {
  const nested: PublicShareReadResult = {
    snapshot: {
      id: 's1',
      slug: SLUG,
      kind: 'single',
      title: '西海岸日落咖啡',
      owner_display_name: 'owner-name',
      created_at: NOW,
    },
    items: [
      {
        id: 'i1',
        sort_order: 0,
        item: {
          name: '西海岸日落咖啡',
          area: '海口 · 西海岸',
          rating: 4,
          budget: 50,
          note_public: '公开理由',
          tags: ['约会'],
          coord_precision: 'hidden',
          cover_url: 'https://example.com/cover.jpg',
        },
      },
    ],
  }

  // 历史/扁平结构：条目本身就是白名单 payload（Web `fetchCloudShare` 的 `raw?.item ?? raw` 分支）。
  const flat = {
    snapshot: nested.snapshot,
    items: [
      {
        id: 'i1',
        sort_order: 0,
        ...nested.items[0].item,
      },
    ],
  } as unknown as PublicShareReadResult

  it('嵌套与扁平结构映射出同一份本地快照', () => {
    const a = publicShareToSnapshot(nested, 'single')
    const b = publicShareToSnapshot(flat, 'single')
    expect(a).not.toBeNull()
    expect(b).not.toBeNull()
    expect(b?.items[0]).toEqual(a?.items[0])
    expect(b?.items[0]).toMatchObject({
      placeName: '西海岸日落咖啡',
      budget: 50,
      reason: '公开理由',
      coordHidden: true,
      coverUri: 'https://example.com/cover.jpg',
    })
  })

  it('kind 不匹配返回 null', () => {
    expect(publicShareToSnapshot(nested, 'list')).toBeNull()
    expect(publicShareToSnapshot(flat, 'list')).toBeNull()
  })

  it('空 snapshot 返回 null', () => {
    expect(publicShareToSnapshot({ snapshot: null, items: [] } as PublicShareReadResult)).toBeNull()
  })
})

describe('shares: slug', () => {
  it('22 位 base36；注入字节可复现', () => {
    const slug = newSlug()
    expect(slug).toHaveLength(22)
    expect(slug).toMatch(/^[a-z0-9]{22}$/)
    expect(newSlug(Uint8Array.from({ length: 22 }, () => 0))).toBe('0'.repeat(22))
    expect(newSlug(Uint8Array.from({ length: 22 }, () => 35))).toBe('z'.repeat(22))
  })
})

describe('shares: budget 有限数守卫（P2-2）', () => {
  const base = { entryId: 'e1', placeName: '西海岸日落咖啡' }

  it('NaN / ±Infinity 回退 undefined，payload 落 null', () => {
    expect(buildShareItem({ ...base, budget: Number.NaN }).budget).toBeUndefined()
    expect(buildShareItem({ ...base, budget: Number.POSITIVE_INFINITY }).budget).toBeUndefined()
    expect(buildShareItem({ ...base, budget: Number.NEGATIVE_INFINITY }).budget).toBeUndefined()
    expect(shareItemToPayload(buildShareItem({ ...base, budget: Number.NaN })).budget).toBeNull()
    // 序列化后不得出现 NaN（JSON.stringify(NaN) → null 前先被守卫挡掉）。
    expect(JSON.stringify(shareItemToPayload(buildShareItem({ ...base, budget: Number.NaN })))).not.toContain('NaN')
  })

  it('正常值与 0 保留（0 是合法预算）', () => {
    expect(buildShareItem({ ...base, budget: 88 }).budget).toBe(88)
    expect(buildShareItem({ ...base, budget: 0 }).budget).toBe(0)
    expect(shareItemToPayload(buildShareItem({ ...base, budget: 0 })).budget).toBe(0)
  })
})

describe('shares: 公开读取 budget 有限数守卫（P1-1 返工）', () => {
  function remoteWithBudget(budget: unknown): PublicShareReadResult {
    return {
      snapshot: {
        id: 's1',
        slug: SLUG,
        kind: 'single',
        title: '西海岸日落咖啡',
        owner_display_name: 'owner-name',
        created_at: NOW,
      },
      items: [
        {
          id: 'i1',
          sort_order: 0,
          item: { name: '西海岸日落咖啡', budget } as unknown as PublicShareReadResult['items'][number]['item'],
        },
      ],
    }
  }

  it('脏字符串 / NaN / ±Infinity 回退 undefined', () => {
    expect(publicShareToSnapshot(remoteWithBudget('abc'), 'single')?.items[0].budget).toBeUndefined()
    expect(publicShareToSnapshot(remoteWithBudget(Number.NaN), 'single')?.items[0].budget).toBeUndefined()
    expect(publicShareToSnapshot(remoteWithBudget(Number.POSITIVE_INFINITY), 'single')?.items[0].budget).toBeUndefined()
    expect(publicShareToSnapshot(remoteWithBudget(Number.NEGATIVE_INFINITY), 'single')?.items[0].budget).toBeUndefined()
  })

  it('缺省与合法数值保持原口径（null → undefined，数字字符串 → number，0 保留）', () => {
    expect(publicShareToSnapshot(remoteWithBudget(null), 'single')?.items[0].budget).toBeUndefined()
    expect(publicShareToSnapshot(remoteWithBudget('50'), 'single')?.items[0].budget).toBe(50)
    expect(publicShareToSnapshot(remoteWithBudget(0), 'single')?.items[0].budget).toBe(0)
  })
})
