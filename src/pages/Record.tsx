// 记录页：先照片和地点，再按住说感受；也可手动填写（方案 8.1 图2）
import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader, useDBData } from '../components/ui'
import { compressImage, humanSize } from '../lib/image'
import { VoiceRecorder, type Recording } from '../lib/audio'
import { transcribe } from '../lib/organize'
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
  const [recording, setRecording] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [asrNote, setAsrNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const recorder = useRef<VoiceRecorder | null>(null)

  const matchedPlaces = useMemo(() => {
    if (!data || !placeQuery.trim()) return data?.places.slice(0, 5) ?? []
    const q = placeQuery.trim()
    return data.places.filter((p) => (p.name + (p.area ?? '')).includes(q)).slice(0, 6)
  }, [data, placeQuery])

  const selectedPlace = data?.places.find((p) => p.id === placeId)
  const canNext = (selectedPlace || (newMode && newName.trim())) && (transcript.trim() || photos.length)

  async function pickFiles(files: FileList | null) {
    if (!files?.length) return
    setBusy(true)
    let est = estBytes
    const added: DraftPhoto[] = []
    for (const f of Array.from(files).slice(0, 9 - photos.length)) {
      try {
        const c = await compressImage(f)
        est += c.bytes
        added.push({ localId: crypto.randomUUID(), display: c.display, thumb: c.thumb, width: c.width, height: c.height })
      } catch { /* 单张失败跳过 */ }
    }
    setEstBytes(est)
    setPhotos((p) => [...p, ...added])
    setBusy(false)
  }

  async function startRec() {
    if (!(await VoiceRecorder.supported())) { setAsrNote('当前浏览器不支持录音，请手动填写感受。'); return }
    try {
      recorder.current = new VoiceRecorder()
      await recorder.current.start()
      setAsrNote(null)
      setRecording(true)
    } catch { setAsrNote('无法访问麦克风，请检查权限或手动填写。') }
  }

  async function stopRec() {
    setRecording(false)
    const rec: Recording | null = recorder.current ? await recorder.current.stop().catch(() => null) : null
    if (!rec) return
    // 超短按：MediaRecorder 没来得及产出数据，直接提示重试，避免无意义的解码报错
    if (rec.blob.size < 2048 || rec.seconds < 0.4) { setAsrNote('好像没录到声音，请按住按钮说完整一句话再松开。'); return }
    setAsrNote('正在转写…')
    const r = await transcribe(rec.blob)
    if (r.ok) { if (r.text.trim()) { setTranscript((t) => (t ? t + ' ' : '') + r.text); setAsrNote(null) } else setAsrNote('没听清内容，请靠近一点大声说，或直接手动填写。') }
    else if (r.reason === 'not_configured') setAsrNote('语音转写未配置（需在部署环境填入腾讯 ASR 密钥）。可直接手动填写感受。')
    else setAsrNote(`转写失败：${r.message}。可直接手动填写感受。`)
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
            {photos.map((p, i) => <DraftThumb key={p.localId} photo={p} onRemove={() => { setPhotos((ps) => ps.filter((x) => x.localId !== p.localId)) }} first={i === 0} />)}
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
              <span className="ml-1">第一张为封面</span>
            </p>
          )}
        </div>

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

        {/* 感受 */}
        <div className="card-paper p-5 text-center">
          <p className="font-bold text-lg">按住说说你的感受</p>
          <p className="text-xs text-inkmuted mt-1">预算、氛围、适合谁，都可以直接说</p>
          <button
            onPointerDown={startRec} onPointerUp={stopRec} onPointerLeave={recording ? stopRec : undefined}
            className={`mt-5 w-20 h-20 rounded-full bg-terra text-white flex items-center justify-center shadow-pop mx-auto ${recording ? 'rec-pulse' : ''}`}
            aria-label="按住录音"
          >
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
          </button>
          <p className="text-xs text-inkmuted mt-2">{recording ? '正在录音…松开结束' : '按住橙色按钮说话'}</p>
          <div className="mt-4 text-left">
            <textarea className="field-input min-h-[72px]" placeholder="也可以手动填写感受…" value={transcript} onChange={(e) => setTranscript(e.target.value)} />
          </div>
          {asrNote && <p className="text-xs text-terradeep mt-2 text-left leading-relaxed">{asrNote}</p>}
        </div>

        <button className="btn-primary w-full py-3.5 text-lg" disabled={!canNext || busy} onClick={next}>
          {busy ? '处理照片中…' : '交给 AI 整理 →'}
        </button>
      </div>
    </div>
  )
}

function DraftThumb({ photo, onRemove, first }: { photo: DraftPhoto; onRemove: () => void; first: boolean }) {
  const url = useMemo(() => (photo.display ? URL.createObjectURL(photo.display) : photo.demoUri), [photo.display])
  return (
    <div className="relative aspect-[3/4] rounded-xl overflow-hidden">
      {url && <img src={url} className="w-full h-full object-cover" alt="" />}
      {first && <span className="absolute top-1 left-1 bg-terra text-white text-[10px] px-1.5 py-0.5 rounded-full">封面</span>}
      <button onClick={onRemove} aria-label="移除" className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/50 text-white text-[11px] leading-none">✕</button>
    </div>
  )
}
