// 地图总览：高德 JS API + 编号名牌点位（图一视觉基准）；
// 高德未配置时降级为示意纸感底图，点位坐标仍为真实经纬度归一化定位。
import { useEffect, useRef, useState } from 'react'
import { loadAmap } from '../lib/amap'
import { amapConfigured } from '../lib/env'
import type { ShareItem } from '../lib/types'

interface Props {
  items: ShareItem[]
  activeIndex: number
  onSelect: (i: number) => void
}

export default function MapOverview({ items, activeIndex, onSelect }: Props) {
  const [amapReady, setAmapReady] = useState<boolean | null>(null) // null=检测中
  const mapDiv = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])

  useEffect(() => {
    if (!amapConfigured()) { setAmapReady(false); return }
    loadAmap().then((AMap) => {
      setAmapReady(true)
      if (!mapDiv.current || mapRef.current) return
      const map = new AMap.Map(mapDiv.current, { mapStyle: 'amap://styles/whitesmoke', zoom: 12, viewMode: '2D' })
      mapRef.current = map
    }).catch(() => setAmapReady(false))
  }, [])

  // 点位渲染（AMap 就绪后）
  useEffect(() => {
    const AMap = (window as any).AMap
    if (!amapReady || !AMap || !mapRef.current) return
    markersRef.current.forEach((m) => m.remove?.() || m.setMap?.(null))
    markersRef.current = []
    const pts = items.filter((it) => it.lat != null && it.lng != null)
    if (!pts.length) return
    for (const it of pts) {
      const i = items.indexOf(it)
      const marker = new AMap.Marker({
        position: [it.lng, it.lat],
        content: badgeHtml(i + 1, it.placeName, i === activeIndex),
        anchor: 'bottom-center',
        zIndex: i === activeIndex ? 200 : 100,
      })
      marker.on('click', () => onSelect(i))
      marker.setMap(mapRef.current)
      markersRef.current.push(marker)
    }
    mapRef.current.setFitView(markersRef.current, false, [60, 60, 60, 60])
  }, [amapReady, items, activeIndex])

  if (amapReady === null) return <div className="h-full bg-carddeep animate-pulse" />
  if (!amapReady) return <PaperMap items={items} activeIndex={activeIndex} onSelect={onSelect} />
  return <div ref={mapDiv} className="h-full w-full" />
}

function badgeHtml(num: number, label: string, active: boolean) {
  return `<div style="display:flex;flex-direction:column;align-items:center;gap:2px;cursor:pointer;transform:translateY(6px)">
    <div style="width:30px;height:36px;clip-path:polygon(50% 100%,0 22%,10% 0,90% 0,100% 22%);background:${active ? '#a94e18' : '#c65d21'};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;border-radius:6px 6px 10px 10px;">${num}</div>
    <div style="background:#fdf8ee;border:1px solid #e7dcc6;border-radius:8px;padding:1px 7px;font-size:12px;color:#3d4a3e;white-space:nowrap;box-shadow:0 1px 4px rgba(120,90,50,.15);font-family:'Kaiti SC',serif;">${label}</div>
  </div>`
}

// ---- 降级：示意纸感底图（明确标注，非真实瓦片）----
function PaperMap({ items, activeIndex, onSelect }: Props) {
  const pts = items.map((it, i) => ({ ...it, i })).filter((p) => p.lat != null && p.lng != null)
  if (!pts.length) return <div className="h-full flex items-center justify-center text-sm text-inkmuted bg-carddeep">这些地点没有可公开的坐标</div>
  const lats = pts.map((p) => p.lat!), lngs = pts.map((p) => p.lng!)
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
  const padLat = Math.max((maxLat - minLat) * 0.25, 0.01), padLng = Math.max((maxLng - minLng) * 0.25, 0.01)
  const pos = (p: (typeof pts)[number]) => ({
    left: `${((p.lng! - minLng + padLng) / (maxLng - minLng + 2 * padLng)) * 100}%`,
    top: `${(1 - (p.lat! - minLat + padLat) / (maxLat - minLat + 2 * padLat)) * 100}%`,
  })
  return (
    <div className="relative h-full w-full overflow-hidden bg-[#f3ecdc]">
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 600" preserveAspectRatio="none" aria-hidden>
        <rect width="400" height="600" fill="#f3ecdc" />
        <path d="M0 480 Q 120 450 220 470 T 400 460 V600 H0 Z" fill="#cfe0e8" opacity="0.8" />
        <path d="M0 500 Q 130 470 240 490 T 400 480 V600 H0 Z" fill="#bcd4df" opacity="0.8" />
        {[70, 150, 230, 310, 390, 470].map((y) => <path key={y} d={`M0 ${y} Q 100 ${y - 14} 200 ${y} T 400 ${y + 8}`} stroke="#e0d3b8" strokeWidth="5" fill="none" />)}
        {[60, 140, 220, 300].map((x) => <path key={x} d={`M${x} 0 Q ${x + 10} 200 ${x - 6} 400 T ${x + 4} 600`} stroke="#e0d3b8" strokeWidth="4" fill="none" />)}
        {[[80, 120], [300, 180], [150, 380], [330, 420]].map(([x, y], i) => (
          <g key={i}><circle cx={x} cy={y} r="16" fill="#cfd8bd" /><rect x={x - 3} y={y - 12} width="6" height="14" rx="2" fill="#a8b58f" /></g>
        ))}
        <text x="30" y="90" font-size="20" fill="#d9c9a8">☀</text>
      </svg>
      {pts.map((p) => (
        <button key={p.i} onClick={() => onSelect(p.i)} className="absolute -translate-x-1/2 -translate-y-full flex flex-col items-center gap-0.5 z-10" style={pos(p)}>
          <span className={`w-7 h-8 flex items-center justify-center text-white text-sm font-bold shadow-card ${activeIndex === p.i ? 'bg-terradeep' : 'bg-terra'}`}
            style={{ clipPath: 'polygon(50% 100%, 0 22%, 10% 0, 90% 0, 100% 22%)', borderRadius: '6px 6px 10px 10px' }}>
            {p.i + 1}
          </span>
          <span className="bg-card border border-line rounded-lg px-2 py-0.5 text-xs text-ink whitespace-nowrap shadow-card">{p.placeName}</span>
        </button>
      ))}
      <span className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-paper/90 border border-line rounded-full px-3 py-1 text-[11px] text-inkmuted">
        高德 Key 未配置 · 示意底图（坐标为真实经纬度相对位置）
      </span>
    </div>
  )
}
