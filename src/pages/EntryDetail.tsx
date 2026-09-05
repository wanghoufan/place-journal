// 记录详情：多图相册、封面切换、公开/私密笔记、标签、分享入口（方案 3.2）+ 编辑已有记录（2026-09-03）
import { useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { PageHeader, Stars, useDBData, Thumb, SyncDot, Sheet } from '../components/ui'
import { repo } from '../lib/idb'
import { uuid } from '../lib/uuid'
import { createSingleShare, shareUrl, copyText } from '../lib/shares'
import { renderShareCard, saveOrShareBlob, THEMES } from '../lib/shareCard'
import type { CardTheme } from '../lib/shareCard'
import type { MediaItem, ShareSnapshot, Tag } from '../lib/types'

export default function EntryDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const data = useDBData()
  const [shareOpen, setShareOpen] = useState(false)
  const [shareLink, setShareLink] = useState<string | null>(null)
  const [shareSnap, setShareSnap] = useState<ShareSnapshot | null>(null)
  const [cardHint, setCardHint] = useState('')
  const [cardTheme, setCardTheme] = useState<CardTheme>('warm')
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
  // 现场新建标签（2026-09-05）：编辑表单内直接建标签并选用
  const [newTagOpen, setNewTagOpen] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [newTagDimId, setNewTagDimId] = useState<string | undefined>(undefined)
  const defaultDimId = data?.dimensions.find((d) => d.kind === 'custom')?.id ?? data?.dimensions[0]?.id
  // RQA-V-01：删除走应用内确认弹窗（原生 confirm 会被部分浏览器拦截，项目既有规矩）
  const [confirmDel, setConfirmDel] = useState(false)
  const [deleting, setDeleting] = useState(false)
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
  // 现场新建标签：同名复用，否则建到所选维度（顶层标签），创建后自动勾选
  async function createNewTag() {
    const name = newTagName.trim()
    if (!name || !data) return
    const exist = data.tags.find((t) => t.name === name)
    if (exist) {
      setFTagIds((ids) => (ids.includes(exist.id) ? ids : [...ids, exist.id]))
    } else {
      const dimId = newTagDimId ?? defaultDimId
      if (!dimId) return
      const t: Tag = { id: uuid(), dimensionId: dimId, parentId: null, name, sortOrder: data.tags.length }
      await repo.saveTags(data.dimensions, [...data.tags, t])
      setFTagIds((ids) => [...ids, t.id])
    }
    setNewTagName(''); setNewTagDimId(undefined); setNewTagOpen(false)
  }

  // 分享卡片图：微信等平台拦截外链时，保存图片直接发微信（长图含全部照片+标签+公开理由）
  async function saveCard() {
    if (!shareSnap) return
    setCardHint('生成中…')
    try {
      const it = shareSnap.items[0]
      const blob = await renderShareCard(shareSnap, it, cardTheme, it.photos ?? [])
      const r = await saveOrShareBlob(blob, `打卡分享·${it.placeName ?? '地点'}.jpg`)
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
                  {/* 现场建标签：没有合适标签时不必跑去标签页（2026-09-05 用户需求） */}
                  <button type="button" onClick={() => { setNewTagName(''); setNewTagOpen(true) }}
                    className="px-2.5 py-1 rounded-full text-xs border border-dashed border-terra text-terra">＋ 新标签</button>
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
              <button className="px-4 py-3 rounded-full bg-card border border-line text-inkmuted" onClick={() => setConfirmDel(true)}>删除</button>
            </div>
          </>
        )}
      </div>

      <Sheet open={shareOpen} onClose={() => setShareOpen(false)} title="分享">
        <div className="space-y-3 text-sm">
          {shareLink && (
            <>
              <div className="flex gap-2">
                {(Object.keys(THEMES) as CardTheme[]).map((k) => (
                  <button key={k} onClick={() => setCardTheme(k)}
                    className={`flex-1 py-2 rounded-xl border-2 text-xs font-bold ${cardTheme === k ? 'border-terra text-terra' : 'border-line text-inkmuted'}`}>
                    <span className="inline-block w-3 h-3 rounded-full mr-1 align-middle" style={{ background: THEMES[k].swatch }} />
                    {THEMES[k].name}
                  </button>
                ))}
              </div>
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

      {/* RQA-V-01：删除二次确认（应用内弹窗）；RQA-V-02：级联撤销该记录分享 */}
      <Sheet open={confirmDel} onClose={() => !deleting && setConfirmDel(false)} title="删除这条记录？">
        <div className="space-y-3 text-sm">
          <p className="leading-relaxed text-inkmuted">
            将删除 <b className="text-ink">{place?.name ?? '该记录'}</b> 的照片、感受与标签，
            且该记录的分享链接会<b className="text-ink">一并撤销失效</b>。删除后不可恢复。
          </p>
          <div className="flex gap-3">
            <button className="flex-1 py-3 rounded-full border-2 border-line text-inkmuted font-bold" disabled={deleting} onClick={() => setConfirmDel(false)}>再想想</button>
            <button
              className="flex-1 py-3 rounded-full bg-[#b3421f] text-white font-bold disabled:opacity-60"
              disabled={deleting}
              onClick={async () => {
                if (!entry || deleting) return
                setDeleting(true)
                try { await repo.deleteEntry(entry.id); nav('/', { replace: true }) }
                finally { setDeleting(false) }
              }}
            >
              {deleting ? '删除中…' : '确认删除'}
            </button>
          </div>
        </div>
      </Sheet>

      {/* 现场新建标签：名称 + 归属维度；同名自动复用不重复建 */}
      <Sheet open={newTagOpen} onClose={() => setNewTagOpen(false)} title="新建标签">
        <div className="space-y-3">
          <input className="field-input" placeholder="标签名称" value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)} />
          <div>
            <p className="text-sm font-bold mb-1.5">归属维度</p>
            <div className="flex flex-wrap gap-1.5">
              {[...(data?.dimensions ?? [])].sort((a, b) => a.sortOrder - b.sortOrder).map((d) => (
                <button key={d.id} type="button"
                  onClick={() => setNewTagDimId(d.id)}
                  className={`px-2.5 py-1 rounded-full text-xs border ${(newTagDimId ?? defaultDimId) === d.id ? 'bg-terra text-white border-terra' : 'bg-card border-line text-inkmuted'}`}>
                  {d.name}
                </button>
              ))}
            </div>
          </div>
          {newTagName.trim() && data?.tags.some((t) => t.name === newTagName.trim()) && (
            <p className="text-xs text-terra">已有同名标签，确认后将直接选用它。</p>
          )}
          <button className="btn-primary w-full py-3" disabled={!newTagName.trim()} onClick={createNewTag}>
            {newTagName.trim() && data?.tags.some((t) => t.name === newTagName.trim()) ? '选用现有标签' : '创建并选用'}
          </button>
        </div>
      </Sheet>
    </div>
  )
}
