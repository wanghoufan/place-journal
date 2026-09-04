// 分享卡片图：canvas 手绘（零依赖），供微信等拦截外链的场合「保存图片发微信」（方案 C）
// 注意：封面可能来自 Supabase 签名 URL（跨源），必须 fetch→blob 解码，避免 canvas 被污染后 toBlob 抛 SecurityError
import type { ShareSnapshot, ShareItem } from './types'

const W = 1080, H = 1440
const TERRA = '#b4552d', INK = '#3d3629', INKMUTED = '#8a7f6d', PAPER = '#efe7d7', CARD = '#f7f1e5', LINE = '#e0d5ba'

async function loadCover(src?: string): Promise<ImageBitmap | null> {
  if (!src) return null
  try {
    const r = await fetch(src, { mode: 'cors' })
    if (!r.ok) return null
    return await createImageBitmap(await r.blob())
  } catch { return null }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// cover 裁剪绘制（object-fit: cover）
function drawCover(ctx: CanvasRenderingContext2D, bmp: ImageBitmap, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / bmp.width, h / bmp.height)
  const sw = w / scale, sh = h / scale
  const sx = (bmp.width - sw) / 2, sy = (bmp.height - sh) / 2
  ctx.save()
  roundRect(ctx, x, y, w, h, 28)
  ctx.clip()
  ctx.drawImage(bmp, sx, sy, sw, sh, x, y, w, h)
  ctx.restore()
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const lines: string[] = []
  let cur = ''
  for (const ch of text) {
    if (ctx.measureText(cur + ch).width > maxWidth && cur) {
      lines.push(cur); cur = ch
      if (lines.length === maxLines) { lines[maxLines - 1] = lines[maxLines - 1].slice(0, -1) + '…'; return lines }
    } else cur += ch
  }
  if (cur) lines.push(cur)
  return lines.slice(0, maxLines)
}

function drawStars(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, rating: number) {
  ctx.font = `${size}px system-ui, sans-serif`
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < Math.round(rating) ? TERRA : LINE
    ctx.fillText('★', x + i * (size + 8), y)
  }
}

function footer(ctx: CanvasRenderingContext2D, owner: string, appLine: string) {
  ctx.strokeStyle = LINE; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(90, H - 150); ctx.lineTo(W - 90, H - 150); ctx.stroke()
  ctx.textAlign = 'center'
  ctx.fillStyle = INKMUTED; ctx.font = '28px system-ui, sans-serif'
  ctx.fillText(`🌿 来自 ${owner} 的私藏分享`, W / 2, H - 92)
  ctx.fillStyle = '#b3a88f'; ctx.font = '22px system-ui, sans-serif'
  ctx.fillText(appLine, W / 2, H - 48)
  ctx.textAlign = 'left'
}

function canvasToJpeg(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('卡片生成失败'))), 'image/jpeg', 0.9))
}

// 单地点卡：大封面 + 店名/评分/人均 + 推荐语 + 标签
export async function renderShareCard(snap: ShareSnapshot, it: ShareItem): Promise<Blob> {
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const ctx = c.getContext('2d')!
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H)

  const cover = await loadCover(it.coverUri)
  if (cover) drawCover(ctx, cover, 60, 60, W - 120, 780)
  else {
    ctx.fillStyle = CARD; roundRect(ctx, 60, 60, W - 120, 780, 28); ctx.fill()
    ctx.textAlign = 'center'; ctx.font = '120px system-ui'; ctx.fillText('📍', W / 2, 520); ctx.textAlign = 'left'
  }

  let y = 950
  ctx.fillStyle = INK; ctx.font = 'bold 58px system-ui, sans-serif'
  const name = it.placeName.length > 14 ? it.placeName.slice(0, 13) + '…' : it.placeName
  ctx.fillText(name, 90, y)
  ctx.fillStyle = TERRA; ctx.font = '30px system-ui'; ctx.fillText('✦', 100 + ctx.measureText(name).width, y - 38)

  y += 64
  if (it.rating != null) { drawStars(ctx, 90, y, 40, it.rating) }
  if (it.budget != null) {
    ctx.textAlign = 'right'; ctx.fillStyle = INK; ctx.font = '30px system-ui'
    ctx.fillText('人均 ', W - 90 - 92, y); ctx.fillStyle = TERRA; ctx.font = 'bold 40px system-ui'
    ctx.fillText(`¥${it.budget}`, W - 90, y); ctx.textAlign = 'left'
  }

  y += 64
  ctx.fillStyle = INKMUTED; ctx.font = '32px system-ui, sans-serif'
  const reasonLines = wrapLines(ctx, it.reason || '朋友觉得很棒', W - 180, 2)
  for (const l of reasonLines) { ctx.fillText(l, 90, y); y += 46 }

  if (it.tags?.length) {
    y += 18
    ctx.font = '28px system-ui, sans-serif'
    let x = 90
    for (const t of it.tags.slice(0, 4)) {
      const w = ctx.measureText(t).width + 40
      if (x + w > W - 90) break
      ctx.fillStyle = CARD; roundRect(ctx, x, y - 32, w, 46, 23); ctx.fill()
      ctx.fillStyle = INK; ctx.fillText(t, x + 20, y)
      x += w + 14
    }
  }

  footer(ctx, snap.ownerName || '朋友', '个人打卡小工具 · 快照内容不含私密信息')
  return canvasToJpeg(c)
}

// 清单卡：标题 + N 行地点名/评分（最多 7 行）+ 底部
export async function renderShareListCard(snap: ShareSnapshot): Promise<Blob> {
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const ctx = c.getContext('2d')!
  const grad = ctx.createLinearGradient(0, 0, 0, H)
  grad.addColorStop(0, '#f7f1e5'); grad.addColorStop(1, '#f3ead8')
  ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H)

  let y = 170
  ctx.fillStyle = INK; ctx.font = 'bold 64px system-ui, sans-serif'
  const title = snap.title.length > 12 ? snap.title.slice(0, 11) + '…' : snap.title
  ctx.fillText(title, 90, y)
  ctx.fillStyle = TERRA; ctx.font = '32px system-ui'; ctx.fillText('✦', 100 + ctx.measureText(title).width, y - 44)

  y += 66
  ctx.fillStyle = INKMUTED; ctx.font = '30px system-ui'
  ctx.fillText(`${snap.ownerName ? `${snap.ownerName} 亲自去过的 ` : ''}${snap.items.length} 个地方`, 90, y)

  y += 50
  const rows = snap.items.slice(0, 7)
  for (const it of rows) {
    ctx.fillStyle = CARD; roundRect(ctx, 60, y, W - 120, 96, 24); ctx.fill()
    ctx.fillStyle = INK; ctx.font = 'bold 34px system-ui'
    const nm = it.placeName.length > 12 ? it.placeName.slice(0, 11) + '…' : it.placeName
    ctx.fillText(nm, 100, y + 60)
    if (it.rating != null) drawStars(ctx, W - 90 - 5 * 40 - 32, y + 60, 32, it.rating)
    y += 116
  }
  if (snap.items.length > 7) {
    ctx.fillStyle = INKMUTED; ctx.font = '28px system-ui'
    ctx.fillText(`… 以及另外 ${snap.items.length - 7} 个`, 100, y + 10)
  }

  footer(ctx, snap.ownerName || '朋友', '个人打卡小工具 · 快照内容不含私密信息')
  return canvasToJpeg(c)
}

// 优先系统分享面板（可存相册/发微信），否则浏览器下载
export async function saveOrShareBlob(blob: Blob, filename: string): Promise<'shared' | 'downloaded'> {
  const file = new File([blob], filename, { type: 'image/jpeg' })
  const n = navigator as any
  if (n.canShare?.({ files: [file] })) {
    try { await n.share({ files: [file] }); return 'shared' } catch { /* 用户取消则继续走下载 */ }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
  return 'downloaded'
}
