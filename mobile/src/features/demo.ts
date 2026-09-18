// 演示数据播种（TASK-DEV-10）：照 Web `src/lib/demo.ts` 建等效数据。
//
// 目标：移动端也能一键得到与网页端一致的演示体验——6 个地点（每地点 1–2 条记录）、
// 评分 3/4/5 分布、维度＋父子标签全套、picsum 首图为封面。
//
// 关键口径（对齐 Web 与 CONTRACT_MATRIX §2「demo 行永不上云」）：
//   - 所有播种行标 `demo = 1`，`sync_status = 'synced'` 且 `revision = base_revision`，
//     既不入 outbox、也不被判 dirty（不会被 push/pull 动到）；
//   - 只写本地 SQLite，不接网络；媒体用 `demo_uri`（picsum 远端 URL），不复制本地文件；
//   - `demo_seeded` meta 标记：播种/清除都会置 true，用于「清除后不复活」；
//   - 清除只删 demo 的地点/记录/媒体（与 Web `repo.clearDemo` 同口径），默认标签保留。

import type { SqlDatabase } from '../db/database'
import type { EntityRow, Repository } from '../db/repository'
import { newUuid } from '../domain/ids'
import { setMeta } from '../sync/meta'

const DEMO_PHOTO = (seed: string) => `https://picsum.photos/seed/pj-${seed}/960/720`

function isoDaysAgo(days: number, now: Date): string {
  const d = new Date(now)
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

/** 默认标签维度/标签（地区/类型/场景/人群，父→子两层），与 Web `defaultTags` 逐项对应。 */
export function defaultTagRows(nowIso: string): { dimensions: EntityRow[]; tags: EntityRow[]; byName: Map<string, string> } {
  const dimensions: EntityRow[] = []
  const tags: EntityRow[] = []
  const byName = new Map<string, string>()

  const mkDim = (name: string, kind: string): string => {
    const id = newUuid()
    dimensions.push({
      id,
      name,
      kind,
      sort_order: dimensions.length,
      revision: 0,
      base_revision: 0,
      demo: 1,
      sync_status: 'synced',
      created_at: nowIso,
      updated_at: nowIso,
    })
    return id
  }
  const mkTag = (dimensionId: string, name: string, parentId: string | null = null): string => {
    const id = newUuid()
    tags.push({
      id,
      dimension_id: dimensionId,
      parent_id: parentId,
      name,
      alias: null,
      sort_order: tags.length,
      revision: 0,
      base_revision: 0,
      demo: 1,
      sync_status: 'synced',
      created_at: nowIso,
      updated_at: nowIso,
    })
    byName.set(name, id)
    return id
  }

  const region = mkDim('地区', 'region')
  const hainan = mkTag(region, '海南省')
  mkTag(region, '海口市', hainan)
  mkTag(region, '儋州市', hainan)

  const type = mkDim('类型', 'type')
  const food = mkTag(type, '美食')
  for (const n of ['海南菜', '火锅', '海鲜', '小吃']) mkTag(type, n, food)
  const coffee = mkTag(type, '咖啡茶饮')
  mkTag(type, '咖啡', coffee)
  mkTag(type, '茶饮', coffee)
  for (const n of ['酒吧夜生活', '自然风景', '运动体验', '文化展览', '住宿']) mkTag(type, n)

  const scene = mkDim('场景', 'scene')
  for (const n of ['约会', '拍照打卡', '女生拍照', '一个人放空', '朋友小聚', '适合聚餐']) mkTag(scene, n)

  const crowd = mkDim('人群', 'crowd')
  for (const n of ['一个人', '情侣', '朋友', '家庭']) mkTag(crowd, n)

  return { dimensions, tags, byName }
}

interface DemoVisit {
  days: number
  rating: number
  budget: number
  summary: string
  notePublic: string
  transcript: string
  tags: string[]
  img: string
}

interface DemoPlaceSpec {
  name: string
  area: string
  lat: number
  lng: number
  visits: DemoVisit[]
}

/** 6 地点；西海岸日落咖啡多一条二访，凑「每地点 1–2 条记录」。评分覆盖 3/4/5。 */
const DEMO_SPECS: DemoPlaceSpec[] = [
  {
    name: '西海岸日落咖啡',
    area: '海口 · 西海岸',
    lat: 20.0458,
    lng: 110.2216,
    visits: [
      { days: 1, rating: 4, budget: 50, summary: '夜晚舒服、适合拍照的平价咖啡厅', notePublic: '晚上舒服，适合聊天和女生拍照。', transcript: '人均五十，晚上舒服，适合带女生拍照，给四星。', tags: ['约会', '拍照打卡', '咖啡'], img: DEMO_PHOTO('sunset-coffee') },
      { days: 8, rating: 5, budget: 60, summary: '二刷落日，海景位很稳', notePublic: '落日时分海景位一流，还会再来。', transcript: '第二次来，落日海景位很稳，人均六十，五星。', tags: ['约会', '咖啡'], img: DEMO_PHOTO('sunset-coffee-2') },
    ],
  },
  {
    name: '海边小酒馆',
    area: '海口 · 西海岸',
    lat: 20.052,
    lng: 110.216,
    visits: [
      { days: 3, rating: 4, budget: 90, summary: '有音乐，适合慢慢聊的小酒馆', notePublic: '有音乐，适合慢慢聊。', transcript: '人均九十，有驻唱，适合朋友慢慢聊，四星。', tags: ['朋友小聚', '酒吧夜生活'], img: DEMO_PHOTO('seaside-bar') },
    ],
  },
  {
    name: '绿野书屋',
    area: '海口 · 老城区',
    lat: 20.044,
    lng: 110.34,
    visits: [
      { days: 2, rating: 5, budget: 35, summary: '一个人放空、看书的安静书屋', notePublic: '白天拍照很好看，也很安静。', transcript: '人均三十五，特别安静，一个人待一下午，五星。', tags: ['一个人放空', '咖啡'], img: DEMO_PHOTO('green-bookstore') },
    ],
  },
  {
    name: '老爸茶·海口味道',
    area: '海口 · 骑楼老街',
    lat: 20.0408,
    lng: 110.3492,
    visits: [
      { days: 6, rating: 3, budget: 20, summary: '便宜、热闹、很本地的老爸茶', notePublic: '便宜、热闹、很本地。', transcript: '人均二十，很热闹很本地，给三星。', tags: ['适合聚餐', '海南菜'], img: DEMO_PHOTO('laocha-tea') },
    ],
  },
  {
    name: '万绿园',
    area: '海口 · 滨海大道',
    lat: 20.0269,
    lng: 110.3168,
    visits: [
      { days: 9, rating: 4, budget: 0, summary: '免费的大草坪，适合傍晚散步', notePublic: '傍晚的海风和大草坪，免费又舒服。', transcript: '不要钱，草坪很大，傍晚散步很舒服，四星。', tags: ['朋友小聚', '自然风景'], img: DEMO_PHOTO('wanlvyuan-park') },
    ],
  },
  {
    name: '海口骑楼老街',
    area: '海口 · 中山路',
    lat: 20.0412,
    lng: 110.3455,
    visits: [
      { days: 12, rating: 4, budget: 0, summary: '南洋风格老街，女生拍照出片', notePublic: '老建筑很出片，逛吃都行。', transcript: '不要门票，建筑很好看，适合拍照，四星。', tags: ['女生拍照', '拍照打卡', '文化展览'], img: DEMO_PHOTO('qilou-street') },
    ],
  },
]

export interface SeedDemoResult {
  places: number
  entries: number
  media: number
  /** 已有演示数据时跳过，不重复播种。 */
  skipped: boolean
}

/** 演示记录条数（`entries.demo = 1`）。 */
export function demoCount(db: SqlDatabase): number {
  return db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM entries WHERE demo = 1')?.n ?? 0
}

/** 标签名 → id（播种记录关联标签用，缺失的名字直接忽略）。 */
function tagIdByName(db: SqlDatabase): Map<string, string> {
  return new Map(
    db.getAllSync<{ id: string; name: string }>('SELECT id, name FROM tags').map((t) => [t.name, t.id]),
  )
}

/** 维度为空时补默认标签（幂等；已有维度则不覆盖用户数据）。 */
function ensureDefaultTags(db: SqlDatabase, repo: Repository, nowIso: string): void {
  const count = db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM tag_dimensions')?.n ?? 0
  if (count > 0) return
  const { dimensions, tags } = defaultTagRows(nowIso)
  for (const dim of dimensions) repo.upsert('tag_dimensions', dim)
  for (const tag of tags) repo.upsert('tags', tag)
}

/**
 * 一键播种演示数据（本地，不入 outbox、不上云）。
 * 已有演示记录时跳过，避免重复插入。
 */
export function seedDemo(db: SqlDatabase, repo: Repository, now: Date = new Date()): SeedDemoResult {
  const nowIso = now.toISOString()
  ensureDefaultTags(db, repo, nowIso)
  const byName = tagIdByName(db)

  if (demoCount(db) > 0) {
    setMeta(db, 'demo_seeded', true)
    return { places: 0, entries: 0, media: 0, skipped: true }
  }

  const placeRows: EntityRow[] = []
  const entryRows: EntityRow[] = []
  const mediaRows: EntityRow[] = []
  const entryTagPairs: { entryId: string; tagId: string }[] = []

  // 核心实体（places/entries）带 revision/base_revision；media 无 revision，列白名单不同，分开构建。
  const coreBase = {
    revision: 0,
    base_revision: 0,
    demo: 1,
    sync_status: 'synced',
    created_at: nowIso,
    updated_at: nowIso,
  }

  for (const spec of DEMO_SPECS) {
    const placeId = newUuid()
    placeRows.push({
      id: placeId,
      name: spec.name,
      area: spec.area,
      lat: spec.lat,
      lng: spec.lng,
      coord_precision: 'exact',
      is_private: 0,
      ...coreBase,
    })
    for (const visit of spec.visits) {
      const entryId = newUuid()
      // 媒体先占位生成，首图回填为封面。
      const firstMediaId = newUuid()
      entryRows.push({
        id: entryId,
        place_id: placeId,
        visit_date: isoDaysAgo(visit.days, now),
        rating: visit.rating,
        budget: visit.budget,
        transcript: null,
        note_private: visit.transcript,
        note_public: visit.notePublic,
        summary: visit.summary,
        cover_media_id: firstMediaId,
        is_private: 0,
        ...coreBase,
      })
      for (let i = 0; i < 2; i++) {
        mediaRows.push({
          id: i === 0 ? firstMediaId : newUuid(),
          entry_id: entryId,
          place_id: placeId,
          demo_uri: i === 0 ? visit.img : DEMO_PHOTO(`${spec.name}-extra-${i}`),
          sort_order: i,
          demo: 1,
          sync_status: 'synced',
          created_at: nowIso,
          updated_at: nowIso,
        })
      }
      for (const name of [...visit.tags, '海口市']) {
        const tagId = byName.get(name)
        if (tagId) entryTagPairs.push({ entryId, tagId })
      }
    }
  }

  for (const row of placeRows) repo.upsert('places', row)
  for (const row of entryRows) repo.upsert('entries', row)
  for (const row of mediaRows) repo.upsert('media', row)
  db.withTransactionSync(() => {
    for (const pair of entryTagPairs) {
      db.runSync('INSERT OR IGNORE INTO entry_tags (entry_id, tag_id) VALUES (?, ?)', pair.entryId, pair.tagId)
    }
  })
  setMeta(db, 'demo_seeded', true)
  return { places: placeRows.length, entries: entryRows.length, media: mediaRows.length, skipped: false }
}

/**
 * 一键清除演示数据：只删 `demo = 1` 的地点/记录/媒体（媒体与关联随 FK 级联）。
 * 用户自己创建的记录不受影响；默认标签保留（同 Web `clearDemo`）。
 * @returns 删除的演示记录条数
 */
export function clearDemo(db: SqlDatabase): number {
  const entryIds = db.getAllSync<{ id: string }>('SELECT id FROM entries WHERE demo = 1').map((r) => r.id)
  const placeIds = db.getAllSync<{ id: string }>('SELECT id FROM places WHERE demo = 1').map((r) => r.id)
  db.withTransactionSync(() => {
    for (const id of entryIds) db.runSync('DELETE FROM entries WHERE id = ?', id)
    for (const id of placeIds) db.runSync('DELETE FROM places WHERE id = ?', id)
  })
  setMeta(db, 'demo_seeded', true) // 已清除，不再自动恢复
  return entryIds.length
}
