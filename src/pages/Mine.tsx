// 我的：标签入口、数据导出、隐私与 AI 状态、同步状态、登录、演示数据管理（方案 3.2）
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, useDBData, useCloudState, Sheet } from '../components/ui'
import { getMeta, repo } from '../lib/idb'
import { signInGoogle, signOut } from '../lib/supabase'
import { autoSync, listConflicts, resolveConflict, type ConflictRecord } from '../lib/sync'
import { exportJson, exportCsv, storageUsage } from '../lib/exporter'
import { copyText, shareUrl } from '../lib/shares'
import { amapConfigured, cloudConfigured } from '../lib/env'
import { applyTheme, APP_THEMES, type AppTheme } from '../lib/theme'

export default function Mine() {
  const data = useDBData()
  const cloud = useCloudState()
  const [exportOpen, setExportOpen] = useState(false)
  const [loginMsg, setLoginMsg] = useState('')
  const [lastSync, setLastSync] = useState<string>()
  const [usage, setUsage] = useState('—')
  const [copiedId, setCopiedId] = useState('')
  const [conflicts, setConflicts] = useState<ConflictRecord[]>([])
  const [theme, setThemeState] = useState<AppTheme>(() => ((localStorage.getItem('app-theme') as AppTheme) || 'warm'))
  const [sharesOpen, setSharesOpen] = useState(false)

  useEffect(() => {
    getMeta<string>('last_sync').then((v) => v && setLastSync(new Date(v).toLocaleString('zh-CN')))
    storageUsage().then(setUsage)
    listConflicts().then(setConflicts)
  }, [cloud])

  if (!data) return null
  const demoCount = data.entries.filter((e) => e.demo).length
  const activeShares = [...data.shares]
    .filter((s) => s.status === 'active')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const cloudLine: Record<string, string> = {
    unconfigured: '未配置（填入 Supabase 环境变量后启用登录与跨设备同步）',
    offline: '已配置 · 当前离线，联网后自动同步',
    'signed-out': '已配置 · 未登录',
    syncing: '同步中…', idle: '已连接', error: '同步出错，可稍后重试',
  }

  async function doLogin() {
    setLoginMsg('')
    const r = await signInGoogle()
    if (!r.ok) setLoginMsg(r.error ?? '登录失败')
  }

  return (
    <div className="min-h-screen safe-bottom">
      <PageHeader title="我的" />
      <div className="px-5 space-y-3">
        {/* 账号与同步 */}
        <div className="card-paper p-4 space-y-2.5 text-sm">
          <p className="font-bold text-base">🌿 账号与同步</p>
          <Line label="云端">{cloudLine[cloud === 'loading' ? 'unconfigured' : cloud]}</Line>
          <Line label="上次同步">{lastSync ?? '—'}</Line>
          {cloud === 'signed-out' && (
            <button className="btn-primary w-full py-2.5 mt-1" onClick={doLogin}>使用 Google 登录</button>
          )}
          {cloud === 'idle' && (
            <div className="flex gap-2">
              <button className="btn-primary flex-1 py-2.5" onClick={() => autoSync().then(() => window.location.reload())}>立即同步</button>
              <button className="px-4 py-2.5 rounded-full bg-carddeep text-inkmuted" onClick={() => signOut().then(() => window.location.reload())}>退出登录</button>
            </div>
          )}
          {loginMsg && <p className="text-xs text-terradeep leading-relaxed">{loginMsg}</p>}
        </div>

        {/* 同步冲突裁决（数据库管理员审查意见 §5.2：云端 / 本地 / 手动合并三选一） */}
        {conflicts.length > 0 && (
          <div className="card-paper p-4 space-y-3 text-sm">
            <p className="font-bold text-base">⚠️ 同步冲突（{conflicts.length}）</p>
            <p className="text-xs text-inkmuted leading-relaxed">
              两台设备修改了同一条记录，请选择保留哪个版本；也可以先到详情页手动合并内容，再回来选「保留本地」。
            </p>
            {conflicts.map((c) => (
              <div key={c.id} className="border-b border-dashed border-line pb-3 last:border-0 last:pb-0 space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-bold truncate">{conflictTitle(data, c)}</span>
                  <span className="text-xs text-inkmuted shrink-0">{new Date(c.at).toLocaleString('zh-CN')}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-carddeep p-2">
                    <p className="text-inkmuted mb-1">本机版本</p>
                    <p className="leading-relaxed">{conflictSummary(data, c, 'local')}</p>
                  </div>
                  <div className="rounded-lg bg-carddeep p-2">
                    <p className="text-inkmuted mb-1">云端版本</p>
                    <p className="leading-relaxed">{c.remote ? conflictSummary(data, c, 'remote') : '已删除'}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    className="chip flex-1 justify-center"
                    onClick={async () => {
                      const r = await resolveConflict(c.id, 'remote')
                      if (!r.ok) window.alert(r.error ?? '操作失败')
                      window.location.reload()
                    }}
                  >采用云端</button>
                  <button
                    className="chip flex-1 justify-center"
                    onClick={async () => {
                      const r = await resolveConflict(c.id, 'local')
                      if (!r.ok) window.alert(r.error ?? '操作失败')
                      window.location.reload()
                    }}
                  >保留本地</button>
                  {(c.kind === 'place' || c.kind === 'entry') && (
                    <Link className="chip justify-center !text-terradeep" to={`/${c.kind === 'place' ? 'place' : 'entry'}/${c.id}`}>手动合并 ›</Link>
                  )}
                  {c.kind === 'tag' && <Link className="chip justify-center !text-terradeep" to="/tags">手动合并 ›</Link>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 数据 */}
        <div className="card-paper p-4 space-y-2.5 text-sm">
          <p className="font-bold text-base">📦 数据</p>
          <Line label="地点 / 记录">{data.places.length} / {data.entries.length}</Line>
          <Line label="照片">{data.media.length} 张</Line>
          <Line label="本机占用">{usage}</Line>
          <Line label="演示数据">{demoCount > 0 ? `${demoCount} 条演示记录` : '无'}</Line>
          <div className="flex gap-2 pt-1">
            <button className="chip flex-1 justify-center" onClick={() => setExportOpen(true)}>导出数据</button>
            {demoCount > 0 && (
              <button className="chip flex-1 justify-center" onClick={async () => { if (window.confirm('清除全部演示数据？你自己创建的记录不受影响。')) { await (await import('../lib/idb')).repo.clearDemo(); window.location.reload() } }}>清除演示数据</button>
            )}
          </div>
        </div>

        {/* 外观主题 */}
        <div className="card-paper p-4 space-y-2.5 text-sm">
          <p className="font-bold text-base">🎨 外观主题</p>
          <div className="flex gap-2">
            {APP_THEMES.map((t) => (
              <button key={t.id}
                onClick={() => { setThemeState(t.id); applyTheme(t.id) }}
                className={`flex-1 py-2.5 rounded-xl border-2 text-xs font-bold transition ${theme === t.id ? 'border-terra text-terra' : 'border-line text-inkmuted'}`}>
                <span className="block w-6 h-6 rounded-full mx-auto mb-1 border border-line" style={{ background: t.swatch }} />
                {t.name}
              </button>
            ))}
          </div>
          <p className="text-xs text-inkmuted">切换立即生效，全站配色与分享图同步换装。</p>
        </div>

        {/* 我的分享（默认折叠，点开管理） */}
        {activeShares.length > 0 && (
          <div className="card-paper p-4 space-y-3 text-sm">
            <button className="w-full flex items-center justify-between" onClick={() => setSharesOpen((v) => !v)}>
              <span className="font-bold text-base">🔗 我的分享（{activeShares.length}）</span>
              <span className="text-xs text-inkmuted">{sharesOpen ? '收起 ▲' : '查看 ›'}</span>
            </button>
            {!sharesOpen ? (
              <p className="text-xs text-inkmuted">
                最近：{activeShares[0]?.kind === 'single' ? '📍' : '📋'} {activeShares[0]?.title}（{new Date(activeShares[0]?.createdAt).toLocaleDateString('zh-CN')}）
              </p>
            ) : (
              <>
                {activeShares.map((s) => (
                  <div key={s.id} className="border-b border-dashed border-line pb-3 last:border-0 last:pb-0 space-y-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-bold truncate">{s.kind === 'single' ? '📍' : '📋'} {s.title}</span>
                      <span className="text-xs text-inkmuted shrink-0">{new Date(s.createdAt).toLocaleDateString('zh-CN')}</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        className="chip flex-1 justify-center"
                        onClick={async () => { await copyText(shareUrl(s)); setCopiedId(s.id); setTimeout(() => setCopiedId(''), 2000) }}
                      >
                        {copiedId === s.id ? '已复制 ✓' : '复制链接'}
                      </button>
                      <button
                        className="chip px-3 text-xs !text-inkmuted"
                        onClick={async () => {
                          if (!window.confirm(`撤销「${s.title}」的分享？撤销后原链接立即失效，不可恢复。`)) return
                          await repo.revokeShare(s.id)
                        }}
                      >
                        撤销
                      </button>
                    </div>
                  </div>
                ))}
                <p className="text-xs text-inkmuted leading-relaxed">撤销后访问者会看到「链接已失效或被撤销」。撤销操作会在云端配置后自动同步。</p>
              </>
            )}
          </div>
        )}

        {/* 标签 */}
        <Link to="/tags" className="card-paper p-4 flex items-center justify-between text-sm active:scale-[0.99] transition">
          <span className="font-bold text-base">🏷 标签与维度</span>
          <span className="text-inkmuted">{data.tags.length} 个 ›</span>
        </Link>

        {/* 隐私与 AI */}
        <div className="card-paper p-4 space-y-2.5 text-sm">
          <p className="font-bold text-base">🔒 隐私与 AI</p>
          <Line label="AI 整理（大模型）">{aiLine()}</Line>
          <Line label="地图（高德）">{amapConfigured() ? '已配置' : '未配置 · 分享地图用示意底图'}</Line>
          <p className="text-xs text-inkmuted leading-relaxed pt-1">
            所有密钥只保存在服务端环境变量；分享页只展示字段白名单快照，绝不包含私密笔记、原始语音与精确坐标。
          </p>
        </div>

        <p className="text-center text-xs text-inkmuted pb-2">
          {cloudConfigured() ? '' : '本地模式：数据仅保存在本机浏览器，可随时导出备份。'}
        </p>
      </div>

      <Sheet open={exportOpen} onClose={() => setExportOpen(false)} title="导出数据">
        <div className="space-y-3">
          <button className="btn-primary w-full py-3" onClick={() => exportJson(data)}>导出 JSON（含媒体清单）</button>
          <button className="btn-primary w-full py-3" onClick={() => exportCsv(data)}>导出 CSV（表格）</button>
          <p className="text-xs text-inkmuted leading-relaxed">导出属于你自己的数据自主权：结构化记录、标签、分享快照与媒体清单。照片本体在配置云端后位于 Storage，可按清单路径获取。</p>
        </div>
      </Sheet>
    </div>
  )
}

function useEffect2(fn: () => void) { useEffect(fn, []) }

function aiLine() {
  return <AiStatus />
}
function AiStatus() {
  const [s, setS] = useState('检测中…')
  useEffect2(() => {
    fetch('/api/ai-organize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then((r) => {
      setS(r.status === 501 ? '未配置' : r.status === 400 ? '已配置' : `未部署(${r.status})`)
    }).catch(() => setS('未部署（本地开发模式）'))
  })
  return <>{s}</>
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex justify-between gap-3"><span className="text-inkmuted shrink-0">{label}</span><span className="text-right">{children}</span></div>
}

// ---- 冲突裁决辅助显示 ----
type DbData = NonNullable<ReturnType<typeof useDBData>>
const snippet = (s: string | null | undefined, n = 40) => (s ? (s.length > n ? s.slice(0, n) + '…' : s) : '（无文字内容）')

function conflictTitle(data: DbData, c: ConflictRecord): string {
  if (c.kind === 'place') return `📍 ${data.places.find((x) => x.id === c.id)?.name ?? '地点'}`
  if (c.kind === 'entry') {
    const e = data.entries.find((x) => x.id === c.id)
    const place = e && data.places.find((p) => p.id === e.placeId)
    return `📝 ${place ? place.name + ' · ' : ''}${e?.visitDate ?? '记录'}`
  }
  if (c.kind === 'tag') return `🏷 ${data.tags.find((x) => x.id === c.id)?.name ?? '标签'}`
  return `🗂 ${data.dimensions.find((x) => x.id === c.id)?.name ?? '维度'}`
}

function conflictSummary(data: DbData, c: ConflictRecord, side: 'local' | 'remote'): string {
  if (side === 'remote') {
    const r: any = c.remote
    if (c.kind === 'place') return [r.name, r.area].filter(Boolean).join(' · ')
    if (c.kind === 'entry') return `${r.visit_date ?? ''} ${snippet(r.summary ?? r.note_public)}`
    return r.name
  }
  if (c.kind === 'place') {
    const p = data.places.find((x) => x.id === c.id)
    return p ? [p.name, p.area].filter(Boolean).join(' · ') : '（本机已无此记录）'
  }
  if (c.kind === 'entry') {
    const e = data.entries.find((x) => x.id === c.id)
    return e ? `${e.visitDate} ${snippet(e.summary ?? e.notePublic)}` : '（本机已无此记录）'
  }
  if (c.kind === 'tag') return data.tags.find((x) => x.id === c.id)?.name ?? '（本机已无此记录）'
  return data.dimensions.find((x) => x.id === c.id)?.name ?? '（本机已无此记录）'
}
