// 演示数据（明确标识 demo，可在“我的”一键清除）+ V1 预置默认标签（方案 3.3）
import { getMeta, setMeta, repo } from './idb'
import type { Dimension, Tag, Place, Entry, MediaItem } from './types'
import { uuid } from './uuid'

const now = () => new Date().toISOString()
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10) }

// ---- 预置默认标签 ----
export function defaultTags(): { dimensions: Dimension[]; tags: Tag[] } {
  const dimensions: Dimension[] = []
  const tags: Tag[] = []
  const mkDim = (name: string, kind: Dimension['kind']) => { const d: Dimension = { id: uuid(), name, kind, sortOrder: dimensions.length, demo: true }; dimensions.push(d); return d }
  const mkTag = (dim: Dimension, name: string, parentId?: string) => {
    const t: Tag = { id: uuid(), dimensionId: dim.id, parentId: parentId ?? null, name, sortOrder: tags.length, demo: true }
    tags.push(t); return t
  }
  const region = mkDim('地区', 'region')
  const hainan = mkTag(region, '海南省')
  mkTag(region, '海口市', hainan.id); mkTag(region, '儋州市', hainan.id)
  const type = mkDim('类型', 'type')
  const food = mkTag(type, '美食')
  for (const n of ['海南菜', '火锅', '海鲜', '小吃']) mkTag(type, n, food.id)
  const cof = mkTag(type, '咖啡茶饮')
  mkTag(type, '咖啡', cof.id); mkTag(type, '茶饮', cof.id)
  for (const n of ['酒吧夜生活', '自然风景', '运动体验', '文化展览', '住宿']) mkTag(type, n)
  const scene = mkDim('场景', 'scene')
  for (const n of ['约会', '拍照打卡', '女生拍照', '一个人放空', '朋友小聚', '适合聚餐']) mkTag(scene, n)
  const crowd = mkDim('人群', 'crowd')
  for (const n of ['一个人', '情侣', '朋友', '家庭']) mkTag(crowd, n)
  return { dimensions, tags }
}

// ---- 演示图片：picsum.photos 免费通用图（按 seed 固定，无需 Key）----
const demoPhoto = (seed: string) => `https://picsum.photos/seed/pj-${seed}/960/720`

const imgSunset = () => demoPhoto('sunset-coffee')
const imgBar = () => demoPhoto('seaside-bar')
const imgBook = () => demoPhoto('green-bookstore')
const imgTea = () => demoPhoto('laocha-tea')
const imgPark = () => demoPhoto('wanlvyuan-park')
const imgStreet = () => demoPhoto('qilou-street')

interface DemoSpec { name: string; area: string; lat: number; lng: number; visits: { date: string; rating: number; budget: number; summary: string; notePublic: string; transcript: string; tags: string[]; img: () => string }[] }

const DEMO_SPECS: DemoSpec[] = [
  { name: '西海岸日落咖啡', area: '海口 · 西海岸', lat: 20.0458, lng: 110.2216, visits: [
    { date: daysAgo(1), rating: 4, budget: 50, summary: '夜晚舒服、适合拍照的平价咖啡厅', notePublic: '晚上舒服，适合聊天和女生拍照。', transcript: '人均五十，晚上舒服，适合带女生拍照，给四星。', tags: ['约会', '拍照打卡', '咖啡'], img: imgSunset },
  ]},
  { name: '海边小酒馆', area: '海口 · 西海岸', lat: 20.052, lng: 110.216, visits: [
    { date: daysAgo(3), rating: 4, budget: 90, summary: '有音乐，适合慢慢聊的小酒馆', notePublic: '有音乐，适合慢慢聊。', transcript: '人均九十，有驻唱，适合朋友慢慢聊，四星。', tags: ['朋友小聚', '酒吧夜生活'], img: imgBar },
  ]},
  { name: '绿野书屋', area: '海口 · 老城区', lat: 20.044, lng: 110.34, visits: [
    { date: daysAgo(2), rating: 5, budget: 35, summary: '一个人放空、看书的安静书屋', notePublic: '白天拍照很好看，也很安静。', transcript: '人均三十五，特别安静，一个人待一下午，五星。', tags: ['一个人放空', '咖啡'], img: imgBook },
  ]},
  { name: '老爸茶·海口味道', area: '海口 · 骑楼老街', lat: 20.0408, lng: 110.3492, visits: [
    { date: daysAgo(6), rating: 3, budget: 20, summary: '便宜、热闹、很本地的老爸茶', notePublic: '便宜、热闹、很本地。', transcript: '人均二十，很热闹很本地，给三星。', tags: ['适合聚餐', '海南菜'], img: imgTea },
  ]},
  { name: '万绿园', area: '海口 · 滨海大道', lat: 20.0269, lng: 110.3168, visits: [
    { date: daysAgo(9), rating: 4, budget: 0, summary: '免费的大草坪，适合傍晚散步', notePublic: '傍晚的海风和大草坪，免费又舒服。', transcript: '不要钱，草坪很大，傍晚散步很舒服，四星。', tags: ['朋友小聚', '自然风景'], img: imgPark },
  ]},
  { name: '海口骑楼老街', area: '海口 · 中山路', lat: 20.0412, lng: 110.3455, visits: [
    { date: daysAgo(12), rating: 4, budget: 0, summary: '南洋风格老街，女生拍照出片', notePublic: '老建筑很出片，逛吃都行。', transcript: '不要门票，建筑很好看，适合拍照，四星。', tags: ['女生拍照', '拍照打卡', '文化展览'], img: imgStreet },
  ]},
]

export async function ensureSeeded() {
  const seeded = await getMeta<boolean>('demo_seeded')
  const dims = await repo.dimensions()
  if (!dims.length) {
    const { dimensions, tags } = defaultTags()
    const { bulkPut } = await import('./idb')
    await bulkPut('dimensions', dimensions)
    await bulkPut('tags', tags)
  }
  if (!seeded) {
    await seedDemo()
    await setMeta('demo_seeded', true) // 清除演示数据后不再自动恢复
  }
}

async function seedDemo() {
  const tags = await repo.tags()
  const byName = (n: string) => tags.find((t) => t.name === n)?.id
  const { bulkPut } = await import('./idb')
  const places: Place[] = [], entries: Entry[] = [], media: MediaItem[] = []
  for (const spec of DEMO_SPECS) {
    const placeId = uuid()
    places.push({ id: placeId, name: spec.name, area: spec.area, lat: spec.lat, lng: spec.lng, coordPrecision: 'exact', demo: true, sync: 'local', createdAt: now(), updatedAt: now() })
    for (const v of spec.visits) {
      const entryId = uuid()
      entries.push({
        id: entryId, placeId, visitDate: v.date, rating: v.rating, budget: v.budget,
        transcript: v.transcript, notePublic: v.notePublic, summary: v.summary,
        tagIds: [...v.tags, '海口市'].map(byName).filter(Boolean) as string[], demo: true, sync: 'local', createdAt: now(), updatedAt: now(),
      })
      for (let i = 0; i < 2; i++) {
        const img = i === 0 ? v.img() : demoPhoto(`${spec.name}-extra-${i}`)
        const m: MediaItem = { id: uuid(), entryId, placeId, demoUri: img, order: i, sync: 'local' }
        media.push(m)
        if (i === 0) entries[entries.length - 1].coverMediaId = m.id
      }
    }
  }
  await bulkPut('places', places)
  await bulkPut('entries', entries)
  await bulkPut('media', media)
  await setMeta('demo_seeded', true)
}
