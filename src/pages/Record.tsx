// 记录页：先照片和地点，再写感受（微信语音输入法直接输入）；交给 AI 整理（方案 8.1 图2）
import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { uuid } from '../lib/uuid'
import { PageHeader, useAutoGrow, useDBData } from '../components/ui'
import { compressImage, humanSize } from '../lib/image'
import Lightbox from '../components/Lightbox'
import { repo } from '../lib/idb'
import { setDraft } from '../lib/draft'
import type { DraftPhoto, RecordDraft } from '../lib/types'

export default function Record() {
  const data = useDBData()
  const nav = useNavigate()
  const [photos, setPhotos] = useState<DraftPhoto[]>([])
  const [estBytes, setEstBytes] = useState(0)
  const [placeQuery, setPlaceQuery] = useState('')
  const [placeId, setPlaceId] = useState<string | null>(null)
  const [newMode, setNewMode] = useState(false)
  const [newName, setNewName] = useState('')
  const [newArea, setNewArea] = useState('')
  const [transcript, setTranscript] = useState('')
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  // 正文框随内容自动撑高：语音输入写多少排多少，页面跟着往下走
  const taRef = useAutoGrow<HTMLTextAreaElement>(transcript)

  const matchedPlaces = useMemo(() => {
    if (!data || !placeQuery.trim()) return data?.places.slice(0, 5) ?? []
    const q = placeQuery.trim()
    return data.places.filter((p) => (p.name + (p.area ?? '')).includes(q)).slice(0, 6)
  }, [data, placeQuery])

  const selectedPlace = data?.places.find((p) => p.id === placeId)
  const previewUrls = useMemo(() => photos.map((p) => (p.display ? URL.createObjectURL(p.display) : p.demoUri)), [photos])
  const hasPlace = !!(selectedPlace || (newMode && newName.trim()))
  const hasContent = !!(transcript.trim() || photos.length)
  const canNext = hasPlace && hasContent

  // 设为封面：把选中的照片移到第一位（第一张即封面）
  function setCover(localId: string) {
    setPhotos((ps) => {
      const i = ps.findIndex((x) => x.localId === localId)
      if (i <= 0) return ps
      const p = ps[i]
      return [p, ...ps.slice(0, i), ...ps.slice(i + 1)]
    })
  }

  async function pickFiles(files: FileList | null) {
    if (!files?.length) return
    setBusy(true)
    let est = estBytes
    const added: DraftPhoto[] = []
    for (const f of Array.from(files).slice(0, 9 - photos.length)) {
      try {
        const c = await compressImage(f)
        est += c.bytes
        added.push({ localId: uuid(), display: c.display, thumb: c.thumb, width: c.width, height: c.height })
      } catch { /* 单张失败跳过 */ }
    }
    setEstBytes(est)
    setPhotos((p) => [...p, ...added])
    setBusy(false)
  }

  function next() {
    if (!canNext) return
    const draft: RecordDraft = {
      photos,
      placeId: selectedPlace?.id,
      newPlaceName: newMode ? newName.trim() : undefined,
      newPlaceArea: newMode ? newArea.trim() : undefined,
      transcript: transcript.trim() || undefined,
    }
    setDraft(draft)
    nav('/confirm')
  }

  return (
    <div className="min-h-screen safe-bottom">
      <PageHeader title="记录这个地方" onClose />
      <div className="px-5 space-y-4">
        {/* 照片 */}
        <div className="card-paper p-3">
          <div className="grid grid-cols-3 gap-2">
            {photos.map((p, i) => <DraftThumb key={p.localId} photo={p} onRemove={() => { setPhotos((ps) => ps.filter((x) => x.localId !== p.localId)) }} onSetCover={() => setCover(p.localId)} onPreview={() => setPreview(i)} first={i === 0} />)}
            {photos.length < 9 && (
              <button onClick={() => fileRef.current?.click()} className="aspect-[3/4] rounded-xl border-2 border-dashed border-line flex flex-col items-center justify-center text-inkmuted text-xs gap-1 active:bg-carddeep">
                <span className="text-2xl">＋</span>添加照片
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { pickFiles(e.target.files); e.currentTarget.value = '' }} />
          {photos.length > 0 && (
            <p className="text-xs text-inkmuted mt-2">
              {photos.length} 张 · 压缩后约 {humanSize(estBytes)}
              {estBytes > 80 * 1024 * 1024 && <span className="text-terradeep font-bold">（较大，注意云端存储容量）</span>}
              <span className="ml-1">第一张为封面 · 点击照片可放大滑动查看</span>
            </p>
          )}
        </div>
        {preview != null && photos.length > 0 && (
          <Lightbox
            images={previewUrls} index={Math.min(preview, photos.length - 1)} onIndex={setPreview} onClose={() => setPreview(null)}
            coverIndex={0} onSetCover={(i) => { const p = photos[i]; if (p) setCover(p.localId) }}
          />
        )}

        {/* 地点 */}
        <div className="card-paper p-3">
          {newMode ? (
            <div className="space-y-2">
              <input className="field-input" placeholder="新地点名称，如：西海岸日落咖啡" value={newName} onChange={(e) => setNewName(e.target.value)} />
              <input className="field-input" placeholder="区域，如：海口 · 西海岸" value={newArea} onChange={(e) => setNewArea(e.target.value)} />
              <button className="text-xs text-terradeep underline" onClick={() => { setNewMode(false); setNewName(''); setNewArea('') }}>← 从已有地点选择</button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2 bg-paper rounded-xl px-3 py-2 border border-line">
                <span>📍</span>
                <input className="flex-1 bg-transparent outline-none text-[15px]" placeholder="搜索或选择地点" value={selectedPlace ? `${selectedPlace.name}${selectedPlace.area ? ' · ' + selectedPlace.area : ''}` : placeQuery}
                  onChange={(e) => { setPlaceId(null); setPlaceQuery(e.target.value) }} />
              </div>
              {!selectedPlace && (
                <div className="flex flex-wrap gap-1.5">
                  {matchedPlaces.map((p) => (
                    <button key={p.id} className="chip" onClick={() => setPlaceId(p.id)}>{p.name}</button>
                  ))}
                  <button className="chip" onClick={() => setNewMode(true)}>＋ 新地点</button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 感受：微信语音输入法直接输入，大文本框随写随长 */}
        <div className="card-paper p-5">
          <p className="font-bold text-lg text-left">说说你的感受</p>
          <p className="text-xs text-inkmuted mt-1 text-left">用微信语音输入法直接说，预算、氛围、适合谁都可以说，写多少装多少</p>
          <textarea
            ref={taRef}
            className="field-input min-h-[300px] mt-3 text-[16px] leading-relaxed overflow-hidden"
            placeholder="点这里，用微信语音输入法开始说…"
            value={transcript} onChange={(e) => setTranscript(e.target.value)}
          />
        </div>

        <button className="btn-primary w-full py-3.5 text-lg" disabled={!canNext || busy} onClick={next}>
          {busy ? '处理照片中…' : !hasPlace ? '先选择地点，再交给 AI 整理 →' : !hasContent ? '添加照片或写写感受' : '交给 AI 整理 →'}
        </button>
      </div>
    </div>
  )
}

function DraftThumb({ photo, onRemove, onSetCover, onPreview, first }: { photo: DraftPhoto; onRemove: () => void; onSetCover: () => void; onPreview: () => void; first: boolean }) {
  const url = useMemo(() => (photo.display ? URL.createObjectURL(photo.display) : photo.demoUri), [photo.display])
  return (
    <div className="relative aspect-[3/4] rounded-xl overflow-hidden">
      <button onClick={onPreview} className="block w-full h-full" title="点击放大查看">
        {url && <img src={url} className="w-full h-full object-cover" alt="" />}
      </button>
      {first
        ? <span className="absolute top-1 left-1 bg-terra text-white text-[10px] px-1.5 py-0.5 rounded-full">封面</span>
        : <button onClick={(e) => { e.stopPropagation(); onSetCover() }} aria-label="设为封面" className="absolute top-1 left-1 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded-full">设为封面</button>}
      <button onClick={(e) => { e.stopPropagation(); onRemove() }} aria-label="移除" className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/50 text-white text-[11px] leading-none">✕</button>
    </div>
  )
}
