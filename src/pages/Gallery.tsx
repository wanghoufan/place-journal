// 画廊首页：照片第一；按记录 / 按地点 双视图；顶部常用场景筛选（方案 3.2 / 8.1 图1）
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader, useDBData, CloudBanner, Stars, SyncDot, Cover, EmptyState, useCloudState } from '../components/ui'
import { expandTagIds } from '../lib/search'
import type { Entry, Place } from '../lib/types'

type ViewMode = 'entry' | 'place'

export default function Gallery() {
  const data = useDBData()
  const nav = useNavigate()
  const cloud = useCloudState()
  const [mode, setMode] = useState<ViewMode>('entry')
  const [sceneId, setSceneId] = useState<string | null>(null)

  const sceneDim = data?.dimensions.find((d) => d.kind === 'scene')
  const scenes = data?.tags.filter((t) => t.dimensionId === sceneDim?.id) ?? []
  const sceneAll = useMemo(() => (sceneId ? expandTagIds([sceneId], data?.tags ?? []) : []), [sceneId, data])

  if (!data) return null
  const entriesSorted = [...data.entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const filtered = sceneAll.length
    ? entriesSorted.filter((e) => e.tagIds.some((id) => sceneAll.includes(id)))
    : entriesSorted

  // 按地点聚合
  const placeGroups = data.places
    .map((p) => {
      const pes = filtered.filter((e) => e.placeId === p.id).sort((a, b) => b.visitDate.localeCompare(a.visitDate))
      return { place: p, entries: pes }
    })
    .filter((g) => g.entries.length)
    .sort((a, b) => b.entries[0].visitDate.localeCompare(a.entries[0].visitDate))

  return (
    <div className="min-h-screen safe-bottom">
      <PageHeader
        title="我的地点"
        right={
          <button aria-label="手账本" onClick={() => nav('/mine')} className="w-10 h-10 rounded-full bg-card shadow-card flex items-center justify-center text-lg">📒</button>
        }
      />
      <CloudBanner state={cloud} />

      {/* 场景筛选 chips */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar px-5 mt-3 pb-1">
        {scenes.map((s) => (
          <button key={s.id} onClick={() => setSceneId(sceneId === s.id ? null : s.id)}
            className={`chip ${sceneId === s.id ? 'chip-active' : ''}`}>
            <span>{sceneEmoji(s.name)}</span>{s.name}
          </button>
        ))}
      </div>

      {/* 视图切换 */}
      <div className="px-5 mt-3 flex items-center gap-2 text-sm">
        <span className="text-inkmuted">浏览：</span>
        {(['entry', 'place'] as ViewMode[]).map((m) => (
          <button key={m} onClick={() => setMode(m)} className={`px-3 py-1 rounded-full border ${mode === m ? 'bg-terra text-[#fff7ee] border-terra font-bold' : 'bg-card border-line text-inkmuted'}`}>
            {m === 'entry' ? '按记录' : '按地点'}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="还没有记录" hint="点底部橙色的「记录」按钮，拍下第一个地方吧。" />
      ) : mode === 'entry' ? (
        <div className="px-5 mt-4 grid grid-cols-2 gap-3">
          {filtered.map((e) => <EntryCard key={e.id} entry={e} data={data} onClick={() => nav(`/entry/${e.id}`)} />)}
        </div>
      ) : (
        <div className="px-5 mt-4 grid grid-cols-2 gap-3">
          {placeGroups.map((g) => (
            <button key={g.place.id} onClick={() => nav(`/place/${g.place.id}`)} className="text-left card-paper overflow-hidden active:scale-[0.98] transition">
              <div className="relative">
                <CoverOf entry={g.entries[0]} data={data} className="w-full aspect-square" />
                <span className="absolute top-2 left-2 bg-paper/90 text-ink text-xs px-2 py-0.5 rounded-full border border-line">去过 {g.entries.length} 次</span>
              </div>
              <div className="p-2.5">
                <p className="font-bold text-[15px] truncate">{g.place.name}</p>
                <p className="text-xs text-inkmuted mt-0.5 truncate">📍 {g.place.area ?? '未填区域'}</p>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <Stars value={g.entries[0].rating} size={12} />
                  <SyncDot status={g.entries[0].sync} />
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function sceneEmoji(name: string) {
  return ({ '拍照打卡': '📷', '约会': '💐', '一个人放空': '🍵', '朋友小聚': '🍻', '女生拍照': '🌸', '适合聚餐': '🍲' } as Record<string, string>)[name] ?? '🌿'
}

export function CoverOf({ entry, data, className }: { entry: Entry; data: NonNullable<ReturnType<typeof useDBData>>; className?: string }) {
  const m = data.media.find((x) => x.id === entry.coverMediaId) ?? data.media.find((x) => x.entryId === entry.id)
  if (!m) return <div className={`bg-carddeep ${className ?? ''}`} />
  return <Cover m={m} className={className} />
}

function EntryCard({ entry, data, onClick }: { entry: Entry; data: NonNullable<ReturnType<typeof useDBData>>; onClick: () => void }) {
  const place = data.places.find((p) => p.id === entry.placeId)
  const media = data.media.filter((m) => m.entryId === entry.id)
  const extra = media.length - 1
  const tagNames = entry.tagIds.map((id) => data.tags.find((t) => t.id === id)?.name).filter(Boolean)
  const chip = timeChip(entry.visitDate)
  return (
    <button onClick={onClick} className="text-left card-paper overflow-hidden active:scale-[0.98] transition">
      <div className="relative">
        <CoverOf entry={entry} data={data} className="w-full aspect-[4/5]" />
        <span className="absolute top-2 left-2 bg-paper/90 text-ink text-xs px-2 py-0.5 rounded-full border border-line">{chip}</span>
        {extra > 0 && <span className="absolute bottom-2 right-2 bg-black/45 text-white text-xs px-2 py-0.5 rounded-full">+{extra}</span>}
      </div>
      <div className="p-2.5">
        <p className="font-bold text-[15px] truncate">{place?.name ?? '未知地点'}</p>
        <p className="text-xs text-inkmuted mt-0.5 truncate">📍 {place?.area ?? '未填区域'}</p>
        <div className="mt-1.5 flex items-center justify-between">
          <Stars value={entry.rating} size={12} />
          <SyncDot status={entry.sync} />
        </div>
        {tagNames.length > 0 && (
          <div className="mt-1.5 flex gap-1 overflow-hidden">
            <span className="tag-chip truncate">{tagNames[0]}</span>
            {tagNames.length > 1 && <span className="tag-chip truncate">{tagNames[1]}</span>}
          </div>
        )}
      </div>
    </button>
  )
}

function timeChip(date: string) {
  const diff = Math.floor((Date.now() - new Date(date + 'T00:00:00').getTime()) / 86400000)
  if (diff <= 0) return '今天'
  if (diff === 1) return '昨天'
  if (diff < 7) return `${diff} 天前`
  if (diff < 30) return `${Math.floor(diff / 7)} 周前`
  return date.slice(5).replace('-', ' 月 ') + ' 日'
}
