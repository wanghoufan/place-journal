// 分享卡片图：canvas 手绘（零依赖），供微信等拦截外链的场合「保存图片发微信」
// 长图内容流：头部（店名/区域/评分/人均）→ 全部照片自上而下 → 标签 → 公开推荐理由 → 署名
// 隐私红线：「我的感受」（note_private/transcript）永不入卡；photos 仅本地生成用，云端 payload 白名单不含
// 注意：封面可能来自跨源 URL，必须 fetch→bitmap 解码，避免 canvas 污染后 toBlob 抛 SecurityError
import type { ShareSnapshot, ShareItem } from './types'

export type CardTheme = 'warm' | 'ticket' | 'sage'

interface Palette { bg: string; panel: string; ink: string; inkMuted: string; accent: string; line: string; chipBg: string; chipInk: string }

export const THEMES: Record<CardTheme, { name: string; swatch: string; p: Palette }> = {
  warm:   { name: '暖纸手账', swatch: '#efe7d7', p: { bg: '#efe7d7', panel: '#f7f1e5', ink: '#3d3629', inkMuted: '#8a7f6d', accent: '#b4552d', line: '#e0d5ba', chipBg: '#f7f1e5', chipInk: '#3d3629' } },
  ticket: { name: '票根台账', swatch: '#e6d5b8', p: { bg: '#e6d5b8', panel: '#faf6ec', ink: '#4a3b28', inkMuted: '#8c7a5c', accent: '#c2452d', line: '#c9b48d', chipBg: '#faf6ec', chipInk: '#4a3b28' } },
  sage:   { name: '竹青园林', swatch: '#f4f6f0', p: { bg: '#f4f6f0', panel: '#fbfcf8', ink: '#2f3b33', inkMuted: '#7d8a7f', accent: '#4a7c59', line: '#d8e2d8', chipBg: '#e7efe7', chipInk: '#2f3b33' } },
}

const W = 1080, PAD = 90, GAP = 28

async function loadImg(src?: string): Promise<ImageBitmap | null> {
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

function drawCoverFit(ctx: CanvasRenderingContext2D, bmp: ImageBitmap, x: number, y: number, w: number, h: number, r = 28) {
  const scale = Math.max(w / bmp.width, h / bmp.height)
  const sw = w / scale, sh = h / scale
  const sx = (bmp.width - sw) / 2, sy = (bmp.height - sh) / 2
  ctx.save()
  roundRect(ctx, x, y, w, h, r)
  ctx.clip()
  ctx.drawImage(bmp, sx, sy, sw, sh, x, y, w, h)
  ctx.restore()
}

// 等比全宽展示（长图照片段）：宽度固定 w，高度按原图比例，封顶 maxH（超出则 cover 裁剪）
function photoHeight(bmp: ImageBitmap, w: number, maxH: number): number {
  return Math.min(Math.round(w * bmp.height / bmp.width), maxH)
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

function drawStars(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, rating: number, p: Palette) {
  ctx.font = `${size}px system-ui, sans-serif`
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < Math.round(rating) ? p.accent : p.line
    ctx.fillText('★', x + i * (size + 8), y)
  }
}

// ── 主题签名元素 ────────────────────────────────────────────────
// ticket：圆形「已打卡」邮戳（旋转双圈章）
function drawStamp(ctx: CanvasRenderingContext2D, cx: number, cy: number, p: Palette) {
  ctx.save()
  ctx.translate(cx, cy); ctx.rotate(-0.21)
  ctx.strokeStyle = p.accent; ctx.fillStyle = p.accent; ctx.globalAlpha = 0.85
  ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(0, 0, 86, 0, Math.PI * 2); ctx.stroke()
  ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(0, 0, 70, 0, Math.PI * 2); ctx.stroke()
  ctx.textAlign = 'center'
  ctx.font = 'bold 40px system-ui, sans-serif'; ctx.fillText('已打卡', 0, -6)
  ctx.font = '20px system-ui, sans-serif'; ctx.fillText('CHECKED IN', 0, 30)
  ctx.restore()
}

// ticket：底部条码纹（固定伪随机，同卡同纹）
function drawBarcode(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, p: Palette) {
  let seed = 42
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
  ctx.fillStyle = p.ink
  let cx = x
  while (cx < x + w - 4) {
    const bw = 2 + Math.floor(rnd() * 6)
    ctx.fillRect(cx, y, bw, h)
    cx += bw + 2 + Math.floor(rnd() * 6)
  }
}

// ticket：打孔分隔虚线（模拟票根撕边）
function drawPerforation(ctx: CanvasRenderingContext2D, y: number, p: Palette) {
  ctx.save()
  ctx.strokeStyle = p.inkMuted; ctx.lineWidth = 3; ctx.setLineDash([2, 16]); ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(W - PAD, y); ctx.stroke()
  ctx.setLineDash([])
  ctx.fillStyle = p.bg
  ctx.beginPath(); ctx.arc(PAD - 14, y, 14, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(W - PAD + 14, y, 14, 0, Math.PI * 2); ctx.fill()
  ctx.restore()
}

// sage：竹青方章（店名前「园」字印）
function drawSeal(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, p: Palette) {
  ctx.fillStyle = p.accent
  roundRect(ctx, x, y - s + 6, s, s, 8); ctx.fill()
  ctx.fillStyle = '#fbfcf8'; ctx.textAlign = 'center'
  ctx.font = `bold ${Math.round(s * 0.62)}px system-ui, sans-serif`
  ctx.fillText('园', x + s / 2, y - s + 6 + s * 0.72)
  ctx.textAlign = 'left'
}

function footer(ctx: CanvasRenderingContext2D, y: number, owner: string, theme: CardTheme, p: Palette) {
  ctx.strokeStyle = p.line; ctx.lineWidth = 2
  if (theme === 'sage') {
    // sage：波浪线签名
    ctx.beginPath()
    for (let x = PAD; x <= W - PAD; x += 8) ctx.lineTo(x, y + (((x / 8) | 0) % 2 ? 3 : -3))
    ctx.stroke()
  } else {
    ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(W - PAD, y); ctx.stroke()
  }
  if (theme === 'ticket') drawBarcode(ctx, PAD, y + 34, 260, 44, p)
  ctx.textAlign = theme === 'ticket' ? 'right' : 'center'
  ctx.fillStyle = p.inkMuted; ctx.font = '28px system-ui, sans-serif'
  const line = theme === 'ticket' ? `NO.0001 · 来自 ${owner} 的私藏` : `🌿 来自 ${owner} 的私藏分享`
  ctx.fillText(line, theme === 'ticket' ? W - PAD : W / 2, y + 68)
  ctx.fillStyle = theme === 'sage' ? p.accent : '#b3a88f'; ctx.font = '22px system-ui, sans-serif'
  ctx.fillText('个人打卡小工具 · 快照不含私密信息', theme === 'ticket' ? W - PAD : W / 2, y + 108)
  ctx.textAlign = 'left'
}

function canvasToJpeg(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('卡片生成失败'))), 'image/jpeg', 0.9))
}

// ── 单地点长图 ─────────────────────────────────────────────────
export async function renderShareCard(
  snap: ShareSnapshot, it: ShareItem, theme: CardTheme = 'warm',
  photos: string[] = [],
): Promise<Blob> {
  const p = THEMES[theme].p
  const pics = (photos.length ? photos : [it.coverUri]).slice(0, 6)
  const bmps = (await Promise.all(pics.map((u) => loadImg(u)))).filter((b): b is ImageBitmap => !!b)
  const iw = W - PAD * 2

  // ── 预算高度（先 measure 再建 canvas）──
  const measure = document.createElement('canvas').getContext('2d')!
  const reason = (it.reason || '').trim()
  measure.font = '32px system-ui, sans-serif'
  const reasonLines = reason ? wrapLines(measure, reason, W - PAD * 2 - 40, 4) : []
  let h = 210                                    // 头部
  h += bmps.reduce((s, b) => s + photoHeight(b, iw, 1160) + GAP, 0)
  if (bmps.length && theme === 'ticket') h += 30 // 打孔线
  if (it.tags?.length) h += 96
  if (reasonLines.length) h += 64 + reasonLines.length * 46 + 24
  h += 190                                       // footer
  h = Math.max(h, 900)

  const c = document.createElement('canvas'); c.width = W; c.height = h
  const ctx = c.getContext('2d')!
  ctx.fillStyle = p.bg; ctx.fillRect(0, 0, W, h)

  // ── 头部：店名 + ✦ + 区域；星 + 人均（宽松行距，避免与照片贴挤）──
  let y = 152
  ctx.fillStyle = p.ink; ctx.font = 'bold 64px system-ui, sans-serif'
  const name = it.placeName.length > 13 ? it.placeName.slice(0, 12) + '…' : it.placeName
  const nameX = theme === 'sage' ? PAD + 76 : PAD
  if (theme === 'sage') drawSeal(ctx, PAD, y + 8, 64, p)
  ctx.fillText(name, nameX, y)
  ctx.fillStyle = p.accent; ctx.font = '32px system-ui'
  ctx.fillText('✦', nameX + ctx.measureText(name).width + 14, y - 40)

  y += 64
  ctx.font = '33px system-ui, sans-serif'; ctx.fillStyle = p.inkMuted
  const metaBits = [it.area, it.budget != null ? `人均 ¥${it.budget}` : ''].filter(Boolean)
  if (metaBits.length) ctx.fillText(metaBits.join(' · '), nameX, y)
  if (it.rating != null) drawStars(ctx, W - PAD - 5 * 48, y, 40, it.rating, p)

  y += 72
  if (theme === 'ticket') { drawPerforation(ctx, y, p); y += 34 }

  // ── 照片流：全部照片自上而下，等比全宽 ──
  for (const b of bmps) {
    const ph = photoHeight(b, iw, 1160)
    drawCoverFit(ctx, b, PAD, y, iw, ph, 28)
    y += ph + GAP
  }
  if (bmps.length) y += 14

  // ── 标签 ──
  if (it.tags?.length) {
    y += 10
    ctx.font = '28px system-ui, sans-serif'
    let x = PAD
    for (const t of it.tags.slice(0, 5)) {
      const tw = ctx.measureText(t).width + 40
      if (x + tw > W - PAD) break
      ctx.fillStyle = p.chipBg
      if (theme === 'sage') { // 叶形：左圆右尖
        ctx.beginPath()
        ctx.moveTo(x + tw, y - 23)
        ctx.arcTo(x + tw, y + 23, x, y + 23, 23); ctx.arcTo(x, y + 23, x, y - 23, 23)
        ctx.arcTo(x, y - 23, x + tw, y - 23, 23); ctx.arcTo(x + tw, y - 23, x + tw, y + 23, 12)
        ctx.closePath(); ctx.fill()
      } else { roundRect(ctx, x, y - 32, tw, 46, 23); ctx.fill() }
      ctx.fillStyle = p.chipInk; ctx.fillText(t, x + 20, y)
      x += tw + 14
    }
    y += 108
  }

  // ── 公开推荐理由（「我的感受」永不入卡）──
  if (reasonLines.length) {
    y += 14
    ctx.fillStyle = p.accent
    roundRect(ctx, PAD, y - 6, 6, reasonLines.length * 46 + 18, 3); ctx.fill()
    ctx.fillStyle = p.ink; ctx.font = '32px system-ui, sans-serif'
    let ly = y + 34
    for (const l of reasonLines) { ctx.fillText(l, PAD + 40, ly); ly += 46 }
    y = ly + 8
  }

  footer(ctx, h - 175, snap.ownerName || '朋友', theme, p)
  return canvasToJpeg(c)
}

// ── 清单卡（标题 + 地点行，主题化）─────────────────────────────
export async function renderShareListCard(snap: ShareSnapshot, theme: CardTheme = 'warm'): Promise<Blob> {
  const p = THEMES[theme].p
  const rows = snap.items.slice(0, 7)
  const h = Math.max(300 + rows.length * 116 + (snap.items.length > 7 ? 60 : 0) + 200, 900)
  const c = document.createElement('canvas'); c.width = W; c.height = h
  const ctx = c.getContext('2d')!
  ctx.fillStyle = p.bg; ctx.fillRect(0, 0, W, h)

  let y = 170
  ctx.fillStyle = p.ink; ctx.font = 'bold 64px system-ui, sans-serif'
  const title = snap.title.length > 12 ? snap.title.slice(0, 11) + '…' : snap.title
  const titleX = theme === 'sage' ? PAD + 76 : PAD
  if (theme === 'sage') drawSeal(ctx, PAD, y + 8, 64, p)
  ctx.fillText(title, titleX, y)
  ctx.fillStyle = p.accent; ctx.font = '32px system-ui'; ctx.fillText('✦', titleX + ctx.measureText(title).width + 14, y - 44)

  y += 66
  ctx.fillStyle = p.inkMuted; ctx.font = '30px system-ui'
  ctx.fillText(`${snap.ownerName ? `${snap.ownerName} 亲自去过的 ` : ''}${snap.items.length} 个地方`, PAD, y)
  y += 50

  for (const it of rows) {
    ctx.fillStyle = p.panel; roundRect(ctx, PAD - 30, y, W - PAD * 2 + 60, 96, 24); ctx.fill()
    ctx.fillStyle = p.ink; ctx.font = 'bold 34px system-ui'
    const nm = it.placeName.length > 12 ? it.placeName.slice(0, 11) + '…' : it.placeName
    ctx.fillText(nm, PAD, y + 60)
    if (it.rating != null) drawStars(ctx, W - PAD - 5 * 40 - 32, y + 60, 32, it.rating, p)
    y += 116
  }
  if (snap.items.length > 7) {
    ctx.fillStyle = p.inkMuted; ctx.font = '28px system-ui'
    ctx.fillText(`… 以及另外 ${snap.items.length - 7} 个`, PAD, y + 10)
  }

  footer(ctx, h - 175, snap.ownerName || '朋友', theme, p)
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
