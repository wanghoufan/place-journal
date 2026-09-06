// 灯箱相册：点图放大 → 左右滑动翻页 → 设为封面走显式按钮（方案：手机相册式交互）
import { useCallback, useEffect, useRef, useState } from 'react'

export default function Lightbox({ images, index, onIndex, onClose, coverIndex, onSetCover }: {
  images: (string | undefined)[]
  index: number
  onIndex: (i: number) => void
  onClose: () => void
  coverIndex?: number
  onSetCover?: (i: number) => void
}) {
  const n = images.length
  const [touchX, setTouchX] = useState<number | null>(null)
  const touchY = useRef<number | null>(null)
  const go = useCallback((d: number) => {
    if (!n) return
    onIndex((index + d + n) % n)
  }, [index, n, onIndex])

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') go(1)
      if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', h)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', h); document.body.style.overflow = '' }
  }, [go, onClose])

  // 预加载邻图
  useEffect(() => {
    for (const i of [(index + 1) % n, (index - 1 + n) % n]) {
      const src = images[i]
      if (src) { const im = new Image(); im.src = src }
    }
  }, [index, n, images])

  if (!n) return null
  const src = images[index]
  const isCover = coverIndex != null && coverIndex === index

  return (
    <div className="fixed inset-0 z-[60] bg-black/90 flex flex-col" role="dialog" aria-modal aria-label="照片预览">
      {/* 顶栏 */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 text-white">
        <span className="text-sm text-white/80">{index + 1} / {n}</span>
        <div className="flex items-center gap-2">
          {onSetCover && !isCover && (
            <button onClick={() => onSetCover(index)} className="text-xs px-3 py-1.5 rounded-full bg-white/15 active:bg-white/25">
              设为封面
            </button>
          )}
          {isCover && <span className="text-xs px-3 py-1.5 rounded-full bg-terra text-white">封面</span>}
          <button onClick={onClose} aria-label="关闭" className="w-9 h-9 rounded-full bg-white/15 text-lg leading-none">✕</button>
        </div>
      </div>
      {/* 主图区：触摸滑动 + 点击左右箭头 */}
      <div
        className="flex-1 relative flex items-center justify-center overflow-hidden touch-pan-y"
        onTouchStart={(e) => { setTouchX(e.touches[0].clientX); touchY.current = e.touches[0].clientY }}
        onTouchEnd={(e) => {
          if (touchX == null) return
          const dx = e.changedTouches[0].clientX - touchX
          const dy = touchY.current != null ? e.changedTouches[0].clientY - touchY.current : 0
          // 横滑主导才翻页，竖滑忽略（避免和页面滚动冲突）
          if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1)
          setTouchX(null); touchY.current = null
        }}
      >
        {src
          ? <img key={src} src={src} alt="" className="max-w-full max-h-full object-contain select-none" draggable={false} />
          : <div className="text-white/60 text-sm">加载中…</div>}
        {n > 1 && (
          <>
            <button aria-label="上一张" onClick={() => go(-1)} className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/15 text-white text-xl">‹</button>
            <button aria-label="下一张" onClick={() => go(1)} className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/15 text-white text-xl">›</button>
          </>
        )}
      </div>
      {/* 底部圆点 */}
      {n > 1 && (
        <div className="flex items-center justify-center gap-1.5 pb-6 pt-2">
          {images.map((_, i) => (
            <button key={i} aria-label={`第 ${i + 1} 张`} onClick={() => onIndex(i)}
              className={`h-1.5 rounded-full transition-all ${i === index ? 'w-5 bg-white' : 'w-1.5 bg-white/40'}`} />
          ))}
        </div>
      )}
    </div>
  )
}
