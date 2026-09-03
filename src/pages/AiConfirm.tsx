// AI 确认页：展示 AI 整理结果，所有字段可改，确认才入库（方案 8.1 图3 / 5.2）
// 未配置 AI 时：本地推测 + 明确标注，字段全部手动可编辑
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader, Stars, useDBData } from '../components/ui'
import { organize, localHeuristics } from '../lib/organize'
import { repo } from '../lib/idb'
import { takeDraft, clearDraft } from '../lib/draft'
import type { RecordDraft, Entry, Place, MediaItem } from '../lib/types'
import { syncOnce } from '../lib/sync'

export default function AiConfirm() {
  const nav = useNavigate()
  const data = useDBData()
  const [draft, setDraft] = useState<RecordDraft | null>(null)
  const [loading, setLoading] = useState(true)
  const [aiNote, setAiNote] = useState<string>('')
  const [aiMock, setAiMock] = useState(false)
  const [saving, setSaving] = useState(false)

  const [rating, setRating] = useState<number | undefined>()
  const [budget, setBudget] = useState<number | undefined>()
  const [summary, setSummary] = useState('')
  const [notePublic, setNotePublic] = useState('')
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [unmatched, setUnmatched] = useState<string[]>([])

  useEffect(() => {
    const d = takeDraft()
    if (!d) { nav('/record', { replace: true }); return }
    setDraft(d)
    ;(async () => {
      const tags = await repo.tags()
      const dims = await repo.dimensions()
      const tagList = tags.map((t) => ({ id: t.id, name: t.name, dimension: dims.find((x) => x.id === t.dimensionId)?.name ?? '' }))
      if (d.transcript) {
        const r = await organize({ transcript: d.transcript, placeName: d.newPlaceName, area: d.newPlaceArea, tags: tagList })
        if (r.ok) {
          setAiMock(r.mock)
          const res = r.result
          setRating(res.score)
          setBudget(res.budget)
          setSummary(res.summary ?? '')
          setNotePublic(d.transcript)
          setSelectedTagIds(res.matched_tags.map((n) => tagList.find((t) => t.name === n)?.id).filter(Boolean) as string[])
          setUnmatched(res.unmatched_suggestions ?? [])
        } else {
          const h = localHeuristics({ transcript: d.transcript, tags: tagList })
          setAiMock(true)
          setAiNote(r.reason === 'not_configured' ? 'AI 未配置（需在部署环境填入大模型 Key）。已按本地推测预填，请逐项确认修改。' : `AI 调用失败：${r.message}。已按本地推测预填。`)
          setRating(h.score); setBudget(h.budget); setSummary(h.summary ?? ''); setNotePublic(d.transcript)
          setSelectedTagIds(h.matched_tags.map((n) => tagList.find((t) => t.name === n)?.id).filter(Boolean) as string[])
          setUnmatched(h.unmatched_suggestions ?? [])
        }
      } else {
        setAiNote('未填写感受，请手动补全。')
      }
      setLoading(false)
    })()
  }, [nav])

  const sceneAndTypeTags = useMemo(() => {
    if (!data) return []
    const dimOf = (id: string) => data.dimensions.find((d) => d.id === id)
    return data.tags.filter((t) => ['scene', 'type', 'crowd', 'region'].includes(dimOf(t.dimensionId)?.kind ?? ''))
  }, [data])

  if (!draft || !data) return null
  const placeName = draft.placeId ? data.places.find((p) => p.id === draft.placeId)?.name : draft.newPlaceName
  const area = draft.placeId ? data.places.find((p) => p.id === draft.placeId)?.area : draft.newPlaceArea

  async function addUnmatchedTag(name: string) {
    // AI 不得自动创建标签：用户点击后才加入「场景」维度（方案 3.3）
    const dims = await repo.dimensions()
    let sceneDim = dims.find((d) => d.kind === 'scene')
    const tags = await repo.tags()
    const newTag = { id: crypto.randomUUID(), dimensionId: sceneDim!.id, parentId: null as string | null, name, sortOrder: tags.length, demo: false }
    await repo.saveTags(dims, [...tags, newTag])
    setSelectedTagIds((s) => [...s, newTag.id])
    setUnmatched((u) => u.filter((x) => x !== name))
  }

  async function confirm() {
    setSaving(true)
    try {
      const now = new Date().toISOString()
      let placeId = draft!.placeId
      if (!placeId) {
        placeId = crypto.randomUUID()
        const p: Place = { id: placeId, name: draft!.newPlaceName!, area: draft!.newPlaceArea, sync: 'local', createdAt: now, updatedAt: now }
        await repo.savePlace(p)
      }
      const entryId = crypto.randomUUID()
      const entry: Entry = {
        id: entryId, placeId, visitDate: new Date().toISOString().slice(0, 10),
        rating, budget, transcript: draft!.transcript, notePublic, summary,
        tagIds: selectedTagIds, sync: 'local', createdAt: now, updatedAt: now,
      }
      const pid: string = placeId
      const media: MediaItem[] = draft!.photos.map((p, i) => ({
        id: p.localId, entryId, placeId: pid, display: p.display, thumb: p.thumb,
        width: p.width, height: p.height, order: i, sync: 'local',
        takenAt: now,
      }))
      entry.coverMediaId = media[0]?.id
      for (const m of media) await repo.saveMedia(m)
      await repo.saveEntry(entry)
      clearDraft()
      await syncOnce().catch(() => {}) // 立即尝试同步；失败保留 local 状态可重试
      nav(`/entry/${entryId}`, { replace: true })
    } finally { setSaving(false) }
  }

  return (
    <div className="min-h-screen safe-bottom">
      <PageHeader title="帮你整理好了" back />
      <div className="px-5 space-y-4">
        {/* 地点头部 */}
        <div className="flex items-center gap-3">
          <DraftCover draft={draft} />
          <div>
            <p className="font-bold text-lg">{placeName}</p>
            <p className="text-sm text-inkmuted">{area ?? '未填区域'}</p>
          </div>
        </div>

        {/* 转写引用 */}
        {draft.transcript && (
          <div className="card-paper px-4 py-3 relative">
            <span className="text-terra text-2xl leading-none">“</span>
            <p className="text-[15px] leading-relaxed px-2">{draft.transcript}</p>
            <span className="text-terra text-2xl leading-none float-right -mt-1">”</span>
          </div>
        )}

        {aiNote && <div className="rounded-xl bg-terrasoft text-terradeep text-xs px-3 py-2 leading-relaxed">{aiNote}</div>}
        {aiMock && !aiNote && <div className="rounded-xl bg-terrasoft text-terradeep text-xs px-3 py-2">本地推测结果，请确认修改后保存。</div>}

        {/* 可编辑字段 */}
        <div className="card-paper px-4 py-1">
          <div className="flex items-center justify-between py-3 border-b border-line/50">
            <span className="font-bold">⭐ 评分</span>
            <Stars value={rating} editable size={22} onChange={setRating} />
          </div>
          <div className="flex items-center justify-between py-3 border-b border-line/50">
            <span className="font-bold">💳 预算（人均）</span>
            <input type="number" inputMode="numeric" placeholder="—" value={budget ?? ''} onChange={(e) => setBudget(e.target.value ? Number(e.target.value) : undefined)} className="w-24 text-right bg-transparent outline-none" />
            <span className="text-inkmuted text-sm -ml-4">元</span>
          </div>
          <div className="py-3 border-b border-line/50">
            <div className="flex items-center justify-between">
              <span className="font-bold">🏷 标签</span>
              <span className="text-xs text-inkmuted">{selectedTagIds.length} 个</span>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {sceneAndTypeTags.map((t) => {
                const on = selectedTagIds.includes(t.id)
                return (
                  <button key={t.id} className={`tag-chip ${on ? '!bg-terra !text-white' : ''}`}
                    onClick={() => setSelectedTagIds((s) => (on ? s.filter((x) => x !== t.id) : [...s, t.id]))}>
                    {t.name}
                  </button>
                )
              })}
            </div>
          </div>
          {unmatched.length > 0 && (
            <div className="py-3 border-b border-line/50">
              <p className="text-sm font-bold mb-2">未找到匹配标签</p>
              {unmatched.map((n) => (
                <div key={n} className="flex items-center justify-between text-sm py-1">
                  <span className="text-inkmuted">「{n}」</span>
                  <span className="flex gap-2">
                    <button className="tag-chip" onClick={() => addUnmatchedTag(n)}>加入场景</button>
                    <button className="text-xs text-inkmuted underline" onClick={() => setUnmatched((u) => u.filter((x) => x !== n))}>暂不添加</button>
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="py-3">
            <p className="font-bold mb-1.5">📝 一句摘要</p>
            <input className="field-input" value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="如：夜晚舒服、适合拍照的平价咖啡厅" />
            <p className="font-bold mb-1.5 mt-3">💬 公开推荐理由（分享时展示）</p>
            <textarea className="field-input min-h-[60px]" value={notePublic} onChange={(e) => setNotePublic(e.target.value)} placeholder="写给朋友看的一句话" />
          </div>
        </div>

        <button className="btn-primary w-full py-3.5 text-lg" disabled={saving || loading} onClick={confirm}>
          {loading ? '整理中…' : saving ? '保存中…' : '确认保存'}
        </button>
        <button className="block mx-auto text-sm text-inkmuted underline pb-2" onClick={() => nav(-1)}>返回修改</button>
      </div>
    </div>
  )
}

function DraftCover({ draft }: { draft: RecordDraft }) {
  const p = draft.photos[0]
  const url = useMemo(() => (p?.display ? URL.createObjectURL(p.display) : p?.demoUri), [p?.display])
  return url
    ? <img src={url} className="w-20 h-20 rounded-xl object-cover shadow-card" alt="" />
    : <div className="w-20 h-20 rounded-xl bg-carddeep flex items-center justify-center text-2xl">📍</div>
}
