// 图片压缩：展示图最长边 2560 / 缩略图 640；canvas 重编码天然清除 EXIF/GPS
export interface Compressed { display: Blob; thumb: Blob; width: number; height: number; bytes: number }

async function loadBitmap(file: File | Blob): Promise<{ bmp: ImageBitmap | HTMLImageElement; w: number; h: number }> {
  if ('createImageBitmap' in window) {
    const bmp = await createImageBitmap(file)
    return { bmp, w: bmp.width, h: bmp.height }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('图片读取失败')); img.src = url })
    return { bmp: img, w: img.naturalWidth, h: img.naturalHeight }
  } finally { URL.revokeObjectURL(url) }
}

function drawTo(bmp: ImageBitmap | HTMLImageElement, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  c.getContext('2d')!.drawImage(bmp as any, 0, 0, w, h)
  return c
}

function toBlob(c: HTMLCanvasElement, q: number): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('压缩失败'))), 'image/jpeg', q))
}

export async function compressImage(file: File | Blob, estimatedBytesCb?: (bytes: number) => void): Promise<Compressed> {
  const { bmp, w, h } = await loadBitmap(file)
  const scaleDisp = Math.min(1, 2560 / Math.max(w, h))
  const scaleThumb = Math.min(1, 640 / Math.max(w, h))
  const dispCanvas = drawTo(bmp, Math.round(w * scaleDisp), Math.round(h * scaleDisp))
  const thumbCanvas = drawTo(bmp, Math.round(w * scaleThumb), Math.round(h * scaleThumb))
  const display = await toBlob(dispCanvas, 0.85)
  const thumb = await toBlob(thumbCanvas, 0.7)
  const out: Compressed = { display, thumb, width: dispCanvas.width, height: dispCanvas.height, bytes: display.size + thumb.size }
  estimatedBytesCb?.(out.bytes)
  return out
}

export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function mediaSrc(m: { display?: Blob; thumb?: Blob; demoUri?: string; thumbUrl?: string; remoteThumbPath?: string }, preferThumb = false): string | undefined {
  if (preferThumb && m.thumb) return URL.createObjectURL(m.thumb)
  if (m.display) return URL.createObjectURL(m.display)
  return m.demoUri || m.thumbUrl
}
