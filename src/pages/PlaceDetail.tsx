// 地点详情：同一地点全部到访的时间线（方案 3.2），不是独立底部 Tab
import { Link, useParams } from 'react-router-dom'
import { PageHeader, Stars, useDBData, Cover } from '../components/ui'

export default function PlaceDetail() {
  const { id } = useParams()
  const data = useDBData()
  if (!data) return null
  const place = data.places.find((p) => p.id === id)
  if (!place) return <div className="p-8 text-center text-inkmuted">地点不存在。<Link to="/" className="underline text-terra">回画廊</Link></div>
  const entries = data.entries.filter((e) => e.placeId === place.id).sort((a, b) => b.visitDate.localeCompare(a.visitDate))
  const best = [...entries].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))[0]

  return (
    <div className="min-h-screen safe-bottom">
      <PageHeader title={place.name} back />
      <div className="px-5">
        <div className="card-paper p-4">
          <p className="text-sm text-inkmuted">📍 {place.area ?? '未填区域'}</p>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-terra font-bold text-lg">去过 {entries.length} 次</span>
            <Stars value={best?.rating} size={14} />
          </div>
        </div>

        <p className="text-sm font-bold mt-5 mb-2">到访时间线</p>
        <div className="relative pl-5 space-y-4 pb-4">
          <div className="absolute left-[7px] top-2 bottom-2 w-px bg-line" />
          {entries.map((e) => (
            <Link key={e.id} to={`/entry/${e.id}`} className="block relative card-paper p-3 active:scale-[0.99] transition">
              <span className="absolute -left-[18px] top-5 w-3 h-3 rounded-full bg-terra border-2 border-paper" />
              <div className="flex gap-3">
                <Cover m={data.media.find((m) => m.id === e.coverMediaId) ?? data.media.find((m) => m.entryId === e.id) ?? { id: '', entryId: '', placeId: '', order: 0, sync: 'local' }} className="w-16 h-16 rounded-lg shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm text-inkmuted">{e.visitDate.replace(/-/g, ' . ')}</p>
                  <Stars value={e.rating} size={12} />
                  <p className="text-sm mt-0.5 truncate">{e.summary ?? e.transcript ?? '—'}</p>
                  <p className="text-xs text-inkmuted">{e.budget != null ? `人均 ¥${e.budget}` : '—'}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
