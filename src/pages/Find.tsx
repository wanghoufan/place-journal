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
    return matchEntries(parsed, data.entries, data.places, data.tags, data.media)
  }, [data, parsed])

  if (!data || !parsed) return null

  // 结构化筛选 chips（点击追加到自然语言里，简单直接）
  const sceneDim = data.dimensions.find((d) => d.kind === 'scene')
  const scenes = data.tags.filter((t) => t.dimensionId === sceneDim?.id)
  const toggleScene = (name: string) => setQ((cur) => (cur.includes(name) ? cur : (cur ? cur + ' ' : '') + name))

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

        {/* 场景快捷 chips */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {scenes.map((s) => (
            <button key={s.id} className={`chip ${q.includes(s.name) ? 'chip-active' : ''}`} onClick={() => toggleScene(s.name)}>
              {s.name} {q.includes(s.name) ? '✓' : ''}
            </button>
          ))}
        </div>

        {/* 已解析条件 */}
        {(parsed.areaTagIds.length || parsed.typeTagIds.length || parsed.sceneTagIds.length || parsed.maxBudget != null || parsed.minRating != null) ? (
          <div className="flex flex-wrap gap-1.5 text-xs">
            {parsed.maxBudget != null && <span className="chip">预算 ≤ ¥{parsed.maxBudget} ✕</span>}
            {parsed.minRating != null && <span className="chip">{parsed.minRating} 星以上 ✕</span>}
            {[...parsed.areaTagIds, ...parsed.typeTagIds, ...parsed.sceneTagIds, ...parsed.crowdTagIds].map((id) => (
              <span key={id} className="chip">{data.tags.find((t) => t.id === id)?.name} ✓</span>
            ))}
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
                  <Thumb m={data.media.find((m) => m.id === h.best.coverMediaId) ?? data.media.find((m) => m.entryId === h.best.id) ?? { id: '', entryId: '', placeId: '', order: 0, sync: 'local' }} className="w-24 h-20 rounded-xl shrink-0" />
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
                <Thumb m={data.media.find((m) => m.id === h.best.coverMediaId) ?? data.media.find((m) => m.entryId === h.best.id) ?? { id: '', entryId: '', placeId: '', order: 0, sync: 'local' }} className="w-full aspect-square" />
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
