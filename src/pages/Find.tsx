// 找地点：自然语言 + 结构化筛选；结果可切换画廊/清单；可勾选创建分享清单（方案 3.2 / 8.1 图4）
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader, Stars, useDBData, Thumb, EmptyState } from '../components/ui'
import { parseQueryWithKinds, matchEntries, type Filters } from '../lib/search'
import { Sheet } from '../components/ui'
import { createListShare, shareUrl, copyText, searchLine } from '../lib/shares'

export default function Find() {
  const data = useDBData()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [pickedTags, setPickedTags] = useState<Set<string>>(new Set())
  const [minRating, setMinRating] = useState<number | null>(null)
  const [view, setView] = useState<'gallery' | 'list'>('list')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [listOpen, setListOpen] = useState(false)
  const [listTitle, setListTitle] = useState('')
  const [shareLink, setShareLink] = useState<string | null>(null)

  const parsed = useMemo<Filters | null>(() => {
    if (!data) return null
    const kindOf = (t: typeof data.tags[number]) => data.dimensions.find((d) => d.id === t.dimensionId)?.kind ?? 'custom'
    return parseQueryWithKinds(q, data.tags, kindOf)
  }, [q, data])

  const hits = useMemo(() => {
    if (!data || !parsed) return []
    const base = matchEntries(parsed, data.entries, data.places, data.tags, data.media)
    // 标签 chips = 独立交集过滤：地点须同时带有全部选中标签（与自然语言搜索叠加）
    let out = base
    if (pickedTags.size) out = out.filter((h) => [...pickedTags].every((id) => h.best.tagIds?.includes(id)))
    // 评分筛选（2026-09-05）：地点按其最高分记录（best）过滤，N 星以上语义；未评分记录不入选
    if (minRating != null) out = out.filter((h) => (h.best.rating ?? 0) >= minRating)
    return out
  }, [data, parsed, pickedTags, minRating])

  if (!data || !parsed) return null

  // 标签筛选 chips（独立交集过滤，见 toggleTag）
  // 筛选 chips：展示全部「已录入、非空」的标签（至少被一条记录引用），按使用次数降序
  const useCount = new Map<string, number>()
  for (const e of data.entries) for (const id of e.tagIds ?? []) useCount.set(id, (useCount.get(id) ?? 0) + 1)
  const filterTags = data.tags
    .filter((t) => (useCount.get(t.id) ?? 0) > 0)
    .sort((a, b) => (useCount.get(b.id) ?? 0) - (useCount.get(a.id) ?? 0))
  // 勾选走独立集合（不进搜索框），再点取消；选中态按 id 判断，子串标签名不会互相误亮
  const toggleTag = (id: string) =>
    setPickedTags((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  async function makeList() {
    const db = data!
    const pairs = [...picked].map((placeId) => {
      const e = hits.find((h) => h.place.id === placeId)!.best
      const p = db.places.find((x) => x.id === placeId)!
      return { entry: e, place: p }
    })
    const s = await createListShare(listTitle || '我的地点清单', pairs, '我')
    setShareLink(shareUrl(s))
  }

  return (
    <div className="min-h-screen safe-bottom">
      <PageHeader title="今天想去哪?" />
      <div className="px-5 space-y-3">
        {/* 自然语言搜索 */}
        <div className="flex items-center gap-2 bg-card rounded-full px-4 py-3 border border-line shadow-card">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8a7f6d" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <input className="flex-1 bg-transparent outline-none text-[15px]" placeholder="如：海口，晚上适合聊天的地方"
            value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
          <span className="text-terra">✦</span>
        </div>

        {/* 评分筛选（单选可取消）：按地点最高分记录过滤，N 星以上语义 */}
        <div>
          <div className="text-[11px] text-inkmuted mb-1.5 ml-0.5">评分</div>
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} className={`chip ${minRating === n ? 'chip-active' : ''}`} onClick={() => setMinRating((v) => (v === n ? null : n))}>
                {n === 5 ? '5 星' : `${n} 星以上`} {minRating === n ? '✓' : ''}
              </button>
            ))}
          </div>
        </div>

        {/* 标签筛选：按维度分组（同类一组内换行、不同类另起一行），组内按使用频次排序；多选取交集，再点取消 */}
        <div className="space-y-2.5">
          {(() => {
            const groups = [...data.dimensions]
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((d) => ({ key: d.id, label: d.name, tags: filterTags.filter((t) => t.dimensionId === d.id) }))
              .filter((g) => g.tags.length > 0)
            const orphans = filterTags.filter((t) => !data.dimensions.some((d) => d.id === t.dimensionId))
            if (orphans.length) groups.push({ key: '_other', label: '其他', tags: orphans })
            return groups.map((g) => (
              <div key={g.key}>
                <div className="text-[11px] text-inkmuted mb-1.5 ml-0.5">{g.label}</div>
                <div className="flex flex-wrap gap-2">
                  {g.tags.map((t) => (
                    <button key={t.id} className={`chip ${pickedTags.has(t.id) ? 'chip-active' : ''}`} onClick={() => toggleTag(t.id)}>
                      {t.name} {pickedTags.has(t.id) ? '✓' : ''}
                    </button>
                  ))}
                </div>
              </div>
            ))
          })()}
        </div>

        {/* 已解析条件（同名标签去重展示：防止同名不同 id 的标签重复成对出现） */}
        {(parsed.areaTagIds.length || parsed.typeTagIds.length || parsed.sceneTagIds.length || parsed.maxBudget != null || parsed.minRating != null) ? (
          <div className="flex flex-wrap gap-1.5 text-xs">
            {parsed.maxBudget != null && <span className="chip">预算 ≤ ¥{parsed.maxBudget} ✕</span>}
            {parsed.minRating != null && <span className="chip">{parsed.minRating} 星以上 ✕</span>}
            {[...new Set([...parsed.areaTagIds, ...parsed.typeTagIds, ...parsed.sceneTagIds, ...parsed.crowdTagIds]
              .map((id) => data.tags.find((t) => t.id === id)?.name).filter(Boolean))]
              .map((name) => <span key={name} className="chip">{name} ✓</span>)}
          </div>
        ) : null}

        <p className="text-sm text-inkmuted">🌿 找到 {hits.length} 个私藏地点</p>

        {hits.length === 0 ? (
          <EmptyState icon="🔍" title="没有符合条件的地点" hint="换个说法，或清空筛选试试。" />
        ) : view === 'list' ? (
          <div className="space-y-3">
            {hits.map((h) => (
              <div key={h.place.id} className={`card-paper p-3 flex gap-3 items-center ${picked.has(h.place.id) ? 'ring-2 ring-terra' : ''}`}>
                <button className="flex gap-3 items-center flex-1 min-w-0" onClick={() => nav(`/place/${h.place.id}`)}>
                  <Thumb m={data.media.find((m) => m.id === h.best.coverMediaId) ?? data.media.find((m) => m.entryId === h.best.id) ?? { id: '', entryId: '', placeId: '', order: 0, sync: 'local' }} preferThumb className="w-24 h-20 rounded-xl shrink-0" />
                  <div className="min-w-0 text-left">
                    <p className="font-bold text-[16px] truncate">{h.place.name} <span className="text-terra text-xs">✦</span></p>
                    <p className="text-xs text-inkmuted mt-1">{h.best.budget != null ? <>人均 ¥{h.best.budget} · </> : ''}{h.best.summary ?? h.best.transcript ?? '—'}</p>
                  </div>
                </button>
                <button aria-label="选择" className={`w-6 h-6 rounded-full border-2 shrink-0 ${picked.has(h.place.id) ? 'bg-terra border-terra text-white text-xs' : 'border-line'}`}
                  onClick={() => setPicked((s) => { const n = new Set(s); n.has(h.place.id) ? n.delete(h.place.id) : n.add(h.place.id); return n })}>
                  {picked.has(h.place.id) ? '✓' : ''}
                </button>
              </div>
            ))}
            {picked.size > 1 && (
              <button className="btn-primary w-full py-3" onClick={() => { setListOpen(true) }}>🌿 用选中的 {picked.size} 个地点建清单</button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {hits.map((h) => (
              <button key={h.place.id} onClick={() => nav(`/place/${h.place.id}`)} className="card-paper overflow-hidden text-left active:scale-[0.98] transition">
                <Thumb m={data.media.find((m) => m.id === h.best.coverMediaId) ?? data.media.find((m) => m.entryId === h.best.id) ?? { id: '', entryId: '', placeId: '', order: 0, sync: 'local' }} preferThumb className="w-full aspect-square" />
                <div className="p-2.5">
                  <p className="font-bold text-sm truncate">{h.place.name}</p>
                  <Stars value={h.best.rating} size={11} />
                </div>
              </button>
            ))}
          </div>
        )}

        {/* 视图切换 */}
        {hits.length > 0 && (
          <div className="flex justify-center gap-2 pb-2">
            {(['list', 'gallery'] as const).map((v) => (
              <button key={v} className={`px-4 py-1.5 rounded-full border text-sm ${view === v ? 'bg-terra text-white border-terra' : 'bg-card border-line text-inkmuted'}`} onClick={() => setView(v)}>
                {v === 'list' ? '清单' : '画廊'}
              </button>
            ))}
          </div>
        )}
      </div>

      <Sheet open={listOpen} onClose={() => setListOpen(false)} title="保存为常用场景 / 分享清单">
        {shareLink ? (
          <div className="space-y-3">
            <div className="bg-carddeep rounded-xl px-3 py-2.5 break-all text-xs">{shareLink}</div>
            <button className="btn-primary w-full py-3" onClick={() => copyText(shareLink)}>复制链接</button>
          </div>
        ) : (
          <div className="space-y-3">
            <input className="field-input" placeholder="清单名称，如：海口拍照打卡清单" value={listTitle} onChange={(e) => setListTitle(e.target.value)} />
            <button className="btn-primary w-full py-3" onClick={makeList}>生成分享链接</button>
          </div>
        )}
      </Sheet>
    </div>
  )
}
