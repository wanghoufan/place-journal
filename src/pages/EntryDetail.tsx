// 记录详情：多图相册、封面切换、公开/私密笔记、标签、分享入口（方案 3.2）+ 编辑已有记录（2026-09-03）
import { useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { PageHeader, Stars, useDBData, Thumb, SyncDot, Sheet } from '../components/ui'
import { repo } from '../lib/idb'
import { createSingleShare, shareUrl, copyText } from '../lib/shares'
import type { MediaItem, ShareSnapshot } from '../lib/types'

export default function EntryDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const data = useDBData()
  const [shareOpen, setShareOpen] = useState(false)
  const [shareLink, setShareLink] = useState<string | null>(null)
  const [shareSnap, setShareSnap] = useState<ShareSnapshot | null>(null)
  const [cardHint, setCardHint] = useState('')
  const [copied, setCopied] = useState('')
  // 编辑态：仅覆盖可编辑字段（地点归属/照片/摘要不在此改）
  const [editing, setEditing] = useState(false)
  const [fRating, setFRating] = useState<number | undefined>()
  const [fDate, setFDate] = useState('')
  const [fBudget, setFBudget] = useState<number | undefined>()
  const [fTranscript, setFTranscript] = useState('')
  const [fNotePublic, setFNotePublic] = useState('')
  const [fTagIds, setFTagIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  if (!data) return null
  const entry = data.entries.find((e) => e.id === id)
  if (!entry) return <div className="p-8 text-center text-inkmuted">记录不存在或已被删除。<Link to="/" className="underline text-terra">回画廊</Link></div>
  const place = data.places.find((p) => p.id === entry.placeId)
  const media = data.media.filter((m) => m.entryId === entry.id).sort((a, b) => a.order - b.order)
  const tagNames = entry.tagIds.map((tid) => data.tags.find((t) => t.id === tid)).filter(Boolean)
  // 仅叶子标签可选（父标签是分组容器，与 AiConfirm 口径一致）
  const selectableTags = data.tags.filter((t) => !data.tags.some((x) => x.parentId === t.id))

  function startEdit() {
    if (!entry) return
    setFRating(entry.rating)
    setFDate(entry.visitDate)
    setFBudget(entry.budget)
    setFTranscript(entry.transcript ?? '')
    setFNotePublic(entry.notePublic ?? '')
    setFTagIds([...entry.tagIds])
    setEditing(true)
  }
  async function saveEdit() {
    if (!entry || saving) return
    setSaving(true)
    try {
      await repo.saveEntry({
        ...entry, rating: fRating, visitDate: fDate || entry.visitDate, budget: fBudget,
        transcript: fTranscript || undefined, notePublic: fNotePublic || undefined, tagIds: fTagIds,
        updatedAt: new Date().toISOString(),
      })
      setEditing(false)
    } finally { setSaving(false) }
  }
  async function setCover(m: MediaItem) {
    await repo.saveEntry({ ...entry!, coverMediaId: m.id, updatedAt: new Date().toISOString() })
  }
  async function doShare() {
    const s = await createSingleShare(entry!, place!, '我')
    setShareSnap(s)
    setShareLink(shareUrl(s))
    setShareOpen(true)
  }

  // 分享卡片图：微信等平台拦截外链时，保存图片直接发微信
  async function saveCard() {
    if (!shareSnap) return
    setCardHint('生成中…')
    try {
      const { renderShareCard, saveOrShareBlob } = await import('../lib/shareCard')
      const blob = await renderShareCard(shareSnap, shareSnap.items[0])
      const r = await saveOrShareBlob(blob, `打卡分享·${shareSnap.items[0]?.placeName ?? '地点'}.jpg`)
      setCardHint(r === 'shared' ? '已唤起分享面板，选微信发送即可' : '已保存/下载，可直接发微信')
    } catch { setCardHint('生成失败，请重试') }
    setTimeout(() => setCardHint(''), 3500)
  }

  return (
    <div className="min-h-screen safe-bottom">
      <PageHeader title="记录详情" back />
      <div className="px-5 space-y-4">
        {/* 相册 */}
        <div className="grid grid-cols-3 gap-2">
          {media.map((m) => (
            <button key={m.id} onClick={() => setCover(m)} className="relative rounded-xl overflow-hidden" title="点击设为封面">
              <Thumb m={m} className="w-full aspect-square" />
              {entry.coverMediaId === m.id && <span className="absolute top-1 left-1 bg-terra text-white text-[10px] px-1.5 py-0.5 rounded-full">封面</span>}
            </button>
          ))}
        </div>
        <p className="text-xs text-inkmuted">点击任意照片可设为封面（共 {media.length} 张）</p>

        {editing ? (
          <>
            {/* 编辑表单：评分/日期/人均/感受/公开理由/标签 */}
            <div className="card-paper p-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold">评分</span>
                <Stars value={fRating} size={26} editable onChange={setFRating} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-bold shrink-0">到访日期</span>
                <input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)} className="field-input" />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-bold shrink-0">人均 ¥</span>
                <input type="number" inputMode="numeric" value={fBudget ?? ''} onChange={(e) => setFBudget(e.target.value ? Number(e.target.value) : undefined)} className="field-input w-28 text-right" placeholder="—" />
              </div>
              <div>
                <p className="text-sm font-bold mb-1.5">我的感受（私密）</p>
                <textarea className="field-input min-h-[70px]" value={fTranscript} onChange={(e) => setFTranscript(e.target.value)} />
              </div>
              <div>
                <p className="text-sm font-bold mb-1.5">公开推荐理由（分享时展示）</p>
                <textarea className="field-input min-h-[60px]" value={fNotePublic} onChange={(e) => setFNotePublic(e.target.value)} />
              </div>
              <div>
                <p className="text-sm font-bold mb-2">标签</p>
                <div className="flex flex-wrap gap-1.5">
                  {selectableTags.map((t) => (
                    <button key={t.id} type="button"
                      onClick={() => setFTagIds((ids) => ids.includes(t.id) ? ids.filter((x) => x !== t.id) : [...ids, t.id])}
                      className={`px-2.5 py-1 rounded-full text-xs border ${fTagIds.includes(t.id) ? 'bg-terra text-white border-terra' : 'bg-card border-line text-inkmuted'}`}>
                      {t.parentId ? '└ ' : ''}{t.name}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button className="btn-primary flex-1 py-3" disabled={saving} onClick={saveEdit}>{saving ? '保存中…' : '保存修改'}</button>
                <button className="px-4 py-3 rounded-full bg-card border border-line text-inkmuted" disabled={saving} onClick={() => setEditing(false)}>取消</button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="card-paper p-4 space-y-1">
              <div className="flex items-center justify-between">
                <button className="font-bold text-lg text-terra" onClick={() => place && nav(`/place/${place.id}`)}>{place?.name}</button>
                <span className="text-sm text-inkmuted flex items-center gap-1.5">{entry.visitDate.replace(/-/g, ' . ')} <SyncDot status={entry.sync} /></span>
              </div>
              {place?.area && <p className="text-sm text-inkmuted">📍 {place.area}</p>}
              <div className="flex items-center justify-between pt-1">
                <Stars value={entry.rating} />
                <span className="text-sm">{entry.budget != null ? <>人均 <b className="text-terra">¥{entry.budget}</b></> : '—'}</span>
              </div>
            </div>

            {/* 标签 */}
            {tagNames.length > 0 && (
              <div className="card-paper p-4">
                <p className="text-sm font-bold mb-2">标签</p>
                <div className="flex flex-wrap gap-1.5">
                  {tagNames.map((t) => <span key={t!.id} className="tag-chip">{t!.name}</span>)}
                </div>
              </div>
            )}

            {/* 摘要与笔记 */}
            <div className="card-paper p-4 space-y-3">
              {entry.summary && <p className="border-l-4 border-terra/70 pl-3 font-bold">{entry.summary}</p>}
              {entry.transcript && (
                <div>
                  <p className="text-xs text-inkmuted mb-1">我的感受</p>
                  <p className="text-[15px] leading-relaxed">{entry.transcript}</p>
                </div>
              )}
              {entry.notePublic && (
                <div>
                  <p className="text-xs text-inkmuted mb-1">公开推荐理由（分享时展示）</p>
                  <p className="text-[15px] leading-relaxed">{entry.notePublic}</p>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button className="btn-primary flex-1 py-3" onClick={doShare}>分享这个地点</button>
              <button className="px-4 py-3 rounded-full bg-card border border-line text-inkmuted" onClick={startEdit}>编辑</button>
              <button className="px-4 py-3 rounded-full bg-card border border-line text-inkmuted" onClick={async () => { await repo.deleteEntry(entry.id); nav('/', { replace: true }) }}>删除</button>
            </div>
          </>
        )}
      </div>

      <Sheet open={shareOpen} onClose={() => setShareOpen(false)} title="分享">
        <div className="space-y-3 text-sm">
          {shareLink && (
            <>
              <button className="btn-primary w-full py-3.5 text-base" onClick={saveCard}>📸 保存分享图（发微信用）</button>
              {cardHint && <p className="text-moss text-xs">{cardHint}</p>}
              <div className="bg-carddeep rounded-xl px-3 py-2.5 break-all text-xs">{shareLink}</div>
              <button className="w-full py-3 rounded-full border-2 border-terra/40 text-terra font-bold active:scale-[0.98] transition" onClick={async () => { await copyText(shareLink); setCopied('已复制链接') }}>复制链接</button>
              <p className="text-xs text-inkmuted leading-relaxed">
                分享的是字段白名单快照（封面、名称、区域、星级、预算、公开理由），不含私密笔记与原始语音。
                {!navigator.onLine || true ? '当前为本地快照：部署并配置 Supabase 后，链接可发给任何人打开。' : ''}
              </p>
            </>
          )}
          {copied && <p className="text-moss text-xs">{copied}</p>}
        </div>
      </Sheet>
    </div>
  )
}
