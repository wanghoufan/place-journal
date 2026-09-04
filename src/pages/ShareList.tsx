// 多地点分享页：清单视图 ↔ 地图总览（方案 4.2 / 4.3 / 8.1 图6+图7）
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Stars, useDBData } from '../components/ui'
import MapOverview from '../components/MapOverview'
import { copyText, searchLine } from '../lib/shares'
import type { ShareSnapshot, ShareItem } from '../lib/types'

export default function ShareList() {
  const { slug } = useParams()
  const data = useDBData()
  const [view, setView] = useState<'list' | 'map'>('list')
  const [active, setActive] = useState(0)
  const [copied, setCopied] = useState('')
  const [cardHint, setCardHint] = useState('')

  // 本地快照（未配置云端时）或云端快照
  const [snap, setSnap] = useState<ShareSnapshot | null | 'notfound'>(null)
  useEffect(() => {
    if (!data) return
    const s = data.shares.find((x) => x.slug === slug)
    if (s) { setSnap(s.status === 'active' ? s : 'notfound'); return }
    // 云端快照：匿名经 RPC 按 slug 读取（不可枚举，见 shares.ts fetchCloudShare）
    import('../lib/shares').then(({ fetchCloudShare }) =>
      fetchCloudShare(slug!, 'list').then((remote) => setSnap(remote ?? 'notfound')))
  }, [slug, data])

  if (!snap) return <div className="p-10 text-center text-inkmuted">加载中…</div>
  if (snap === 'notfound') return <div className="p-10 text-center text-inkmuted">链接已失效或被撤销。</div>

  const items = snap.items
  const copyAll = () => copyText(items.map(searchLine).join('\n'))

  // 分享卡片图：微信等平台拦截外链时，保存图片直接发微信
  async function saveCard() {
    if (!snap || snap === 'notfound') return
    setCardHint('生成中…')
    try {
      const { renderShareListCard, saveOrShareBlob } = await import('../lib/shareCard')
      const blob = await renderShareListCard(snap)
      const r = await saveOrShareBlob(blob, `打卡清单·${snap.title}.jpg`)
      setCardHint(r === 'shared' ? '已唤起分享面板' : '已保存/下载，可直接发微信')
    } catch { setCardHint('生成失败，请重试') }
    setTimeout(() => setCardHint(''), 3000)
  }

  return (
    <div className="min-h-screen pb-8" style={{ background: 'linear-gradient(#f7f1e5, #f3ead8)' }}>
      <div className="px-5 pt-6 text-center">
        <h1 className="journal-title !text-[30px]">{snap.title}<span className="text-terra align-super text-sm ml-0.5">✦</span></h1>
        <p className="text-sm text-inkmuted mt-4">{snap.ownerName ? `${snap.ownerName} 亲自去过的 ` : ''}<b className="text-terra">{items.length}</b> 个地方</p>
      </div>

      {/* 清单/地图切换（图7） */}
      <div className="mx-5 mt-4 bg-carddeep rounded-full p-1 flex text-sm">
        {(['list', 'map'] as const).map((v) => (
          <button key={v} className={`flex-1 py-2 rounded-full font-bold ${view === v ? 'bg-card shadow-card text-terra' : 'text-inkmuted'}`} onClick={() => setView(v)}>
            {v === 'list' ? '清单' : '地图总览'}
          </button>
        ))}
      </div>

      {view === 'list' ? (
        <>
          {/* 顶部照片拼贴（图6） */}
          <div className="mx-5 mt-4 grid grid-cols-3 gap-2">
            {items.slice(0, 3).map((it, i) => (
              <div key={i} className={`rounded-xl overflow-hidden ${i === 0 ? 'row-span-2 h-full' : ''}`}>
                {it.coverUri ? <img src={it.coverUri} className="w-full h-full object-cover aspect-square" alt="" /> : <div className="w-full aspect-square bg-carddeep" />}
              </div>
            ))}
          </div>
          <div className="px-5 mt-4 space-y-3">
            {items.map((it, i) => (
              <div key={i} className="card-paper p-3 flex items-center gap-3">
                {it.coverUri && <img src={it.coverUri} className="w-16 h-16 rounded-xl object-cover shrink-0" alt="" />}
                <div className="min-w-0 flex-1">
                  <p className="font-bold"><span className="text-terra mr-1.5">{String(i + 1).padStart(2, '0')}</span>{it.placeName}</p>
                  <p className="text-xs text-inkmuted mt-1 truncate">{it.budget != null ? <>人均 ¥{it.budget} · </> : ''}{it.reason ?? '—'}</p>
                </div>
                <button aria-label={`复制 ${it.placeName}`} onClick={async () => { await copyText(searchLine(it)); setCopied(`已复制：${searchLine(it)}`); setTimeout(() => setCopied(''), 2000) }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8a7f6d" strokeWidth="1.8"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg>
                </button>
              </div>
            ))}
            <button className="btn-primary w-full py-3.5 text-lg" onClick={copyAll}>📋 复制全部店名</button>
            <button className="w-full py-3 rounded-full border-2 border-terra/40 text-terra font-bold active:scale-[0.98] transition" onClick={saveCard}>
              📸 保存清单图（发微信用）
            </button>
            {cardHint && <p className="text-center text-xs text-moss">{cardHint}</p>}
            {copied && <p className="text-center text-xs text-moss">{copied}</p>}
            <p className="text-center text-xs text-inkmuted">🌿 来自 {snap.ownerName || '朋友'} 的私藏地点</p>
          </div>
        </>
      ) : (
        <>
          <div className="mx-5 mt-4 rounded-2xl overflow-hidden border border-line shadow-card" style={{ height: 420 }}>
            <MapOverview items={items} activeIndex={active} onSelect={setActive} />
          </div>
          {/* 底部详情卡（图7） */}
          {items[active] && <BottomCard item={items[active]} index={active} />}
          <div className="mt-3 flex justify-center">
            <button className="text-sm text-terra underline" onClick={() => setView('list')}>查看全部地点 ›</button>
          </div>
        </>
      )}
      <p className="text-center text-[11px] text-inkmuted/70 mt-6">noindex · 快照内容，与私有记录隔离</p>
    </div>
  )
}

function BottomCard({ item, index }: { item: ShareItem; index: number }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="mx-5 mt-3 card-paper p-3 flex gap-3">
      {item.coverUri && <img src={item.coverUri} className="w-24 h-24 rounded-xl object-cover" alt="" />}
      <div className="min-w-0 flex-1">
        <p className="font-bold truncate">{index + 1}. {item.placeName}</p>
        {item.rating != null && <Stars value={item.rating} size={12} />}
        <p className="text-xs text-inkmuted mt-0.5 truncate">{item.reason ?? '—'}</p>
        <button className="tag-chip mt-1.5" onClick={async () => { await copyText(searchLine(item)); setCopied(true); setTimeout(() => setCopied(false), 1500) }}>
          {copied ? '已复制 ✓' : `📋 复制店名`}
        </button>
      </div>
    </div>
  )
}
