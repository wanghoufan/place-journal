// 单地点分享页：照片推荐卡 + 极简详情 + 复制店名去外部地图/美团搜索（方案 4.1 / 8.1 图5）
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Stars, useDBData } from '../components/ui'
import { copyText, searchLine } from '../lib/shares'
import { renderShareCard, saveOrShareBlob, THEMES } from '../lib/shareCard'
import type { CardTheme } from '../lib/shareCard'
import type { ShareSnapshot, ShareItem } from '../lib/types'

export default function ShareSingle() {
  const { slug } = useParams()
  const data = useDBData()
  const [snap, setSnap] = useState<ShareSnapshot | null | 'notfound'>(null)
  const [copied, setCopied] = useState('')
  const [moreOpen, setMoreOpen] = useState(false)
  const [cardHint, setCardHint] = useState('')
  const [cardTheme, setCardTheme] = useState<CardTheme>('warm')

  useEffect(() => {
    if (!data) return
    const s = data.shares.find((x) => x.slug === slug && x.kind === 'single')
    if (s) { setSnap(s.status === 'active' ? s : 'notfound'); return }
    // 云端快照：匿名经 RPC 按 slug 读取（不可枚举，见 shares.ts fetchCloudShare）
    import('../lib/shares').then(({ fetchCloudShare }) =>
      fetchCloudShare(slug!, 'single').then((remote) => setSnap(remote ?? 'notfound')))
  }, [slug, data])

  if (!snap) return <div className="p-10 text-center text-inkmuted">加载中…</div>
  if (snap === 'notfound') return <div className="p-10 text-center text-inkmuted">链接已失效或被撤销。</div>
  const it: ShareItem | undefined = snap.items[0]
  if (!it) return <div className="p-10 text-center text-inkmuted">快照内容为空。</div>

  const go = (host: string) => window.open(`https://${host}/search?q=${encodeURIComponent(searchLine(it))}`, '_blank', 'noopener')

  // 分享卡片图：微信等平台拦截外链时，保存图片直接发微信
  async function saveCard() {
    if (!snap || snap === 'notfound' || !it) return
    setCardHint('生成中…')
    try {
      const blob = await renderShareCard(snap, it, cardTheme, it.photos ?? [])
      const r = await saveOrShareBlob(blob, `打卡分享·${it.placeName}.jpg`)
      setCardHint(r === 'shared' ? '已唤起分享面板' : '已保存/下载，可直接发微信')
    } catch { setCardHint('生成失败，请重试') }
    setTimeout(() => setCardHint(''), 3000)
  }

  return (
    <div className="min-h-screen" style={{ background: '#efe7d7' }}>
      {/* 大图 */}
      <div className="w-full aspect-[4/5]">
        {it.coverUri ? <img src={it.coverUri} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full bg-carddeep" />}
      </div>
      <div className="relative -mt-8 bg-paper rounded-t-3xl px-5 pt-6 pb-8 min-h-[46vh]">
        <h1 className="journal-title !text-[30px]">{it.placeName}<span className="text-terra align-super text-sm ml-0.5">✦</span></h1>
        <div className="flex items-center justify-between mt-5">
          {/* 无评分/无人均时隐藏占位，避免全空星和孤零零的「—」 */}
          {it.rating != null ? <Stars value={it.rating} size={22} /> : <span />}
          {it.budget != null && <span className="text-sm">人均 <b className="text-terra text-lg">¥{it.budget}</b></span>}
        </div>
        <p className="mt-3 text-[16px] leading-relaxed border-b border-dashed border-line pb-4">{it.reason ?? '朋友觉得很棒'}</p>
        <div className="flex flex-wrap gap-2 mt-4">
          {(it.tags ?? []).map((t) => <span key={t} className="tag-chip">{t}</span>)}
        </div>

        <div className="card-paper p-4 mt-5">
          <p className="text-[15px] font-bold flex items-center gap-1.5">📍 {searchLine(it)}</p>
          <button className="btn-primary w-full py-3.5 mt-4 text-lg" onClick={async () => { await copyText(searchLine(it)); setCopied('已复制，去任意 App 粘贴搜索即可'); setTimeout(() => setCopied(''), 2500) }}>
            复制店名去搜索
          </button>
          <div className="flex gap-2 mt-4">
            {(Object.keys(THEMES) as CardTheme[]).map((k) => (
              <button key={k} onClick={() => setCardTheme(k)}
                className={`flex-1 py-2 rounded-xl border-2 text-xs font-bold ${cardTheme === k ? 'border-terra text-terra' : 'border-line text-inkmuted'}`}>
                <span className="inline-block w-3 h-3 rounded-full mr-1 align-middle" style={{ background: THEMES[k].swatch }} />
                {THEMES[k].name}
              </button>
            ))}
          </div>
          <button className="w-full py-3 mt-3 rounded-full border-2 border-terra/40 text-terra font-bold active:scale-[0.98] transition" onClick={saveCard}>
            📸 保存分享图（发微信用）
          </button>
          {cardHint && <p className="text-center text-xs text-moss mt-2">{cardHint}</p>}
          <div className="flex justify-center gap-4 mt-3 text-sm">
            <button className="text-terra underline" onClick={() => go('amap.com')}>高德</button>
            <button className="text-terra underline" onClick={() => go('map.baidu.com')}>百度地图</button>
            <button className="text-terra underline" onClick={() => go('meishichina.com')}>菜谱</button>
          </div>
          {copied && <p className="text-center text-xs text-moss mt-2">{copied}</p>}
        </div>

        <p className="text-center text-xs text-inkmuted mt-5">🌿 来自 {snap.ownerName || '朋友'} 的私藏地点</p>
        <p className="text-center text-[11px] text-inkmuted/70 mt-3">noindex · 快照内容，不含私密信息</p>
      </div>
      {moreOpen && <div className="fixed inset-0 bg-black/50" onClick={() => setMoreOpen(false)} />}
    </div>
  )
}
