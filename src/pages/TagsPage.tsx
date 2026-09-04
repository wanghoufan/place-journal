// 标签与维度：父→子两层；可新增、改名、删除（方案 3.3）
// 交互：点标签或「⋯」弹底部操作菜单——全部应用内 Sheet（window.prompt/confirm 被浏览器
// 「阻止此页面创建更多对话框」后会静默失效，故禁用原生弹窗）
import { useState } from 'react'
import { PageHeader, useDBData, Sheet } from '../components/ui'
import { uuid } from '../lib/uuid'
import { repo } from '../lib/idb'
import type { Tag } from '../lib/types'

const KIND_LABEL: Record<string, string> = { region: '地区（系统）', type: '类型', scene: '场景', crowd: '人群', custom: '自定义' }

export default function TagsPage() {
  const data = useDBData()
  const [dimOpen, setDimOpen] = useState(false)
  const [newDimName, setNewDimName] = useState('')
  const [editing, setEditing] = useState<{ dimId: string; parent?: Tag } | null>(null)
  const [newTagName, setNewTagName] = useState('')
  const [menuTarget, setMenuTarget] = useState<Tag | null>(null)
  const [renameTarget, setRenameTarget] = useState<Tag | null>(null)
  const [renameName, setRenameName] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Tag | null>(null)

  if (!data) return null
  const dims = [...data.dimensions].sort((a, b) => a.sortOrder - b.sortOrder)

  const allTags = data!.tags
  // 标签被记录引用的次数（叶子标签各自计数），用于行尾展示与删除确认文案
  const useCount = new Map<string, number>()
  for (const e of data.entries) for (const id of e.tagIds ?? []) useCount.set(id, (useCount.get(id) ?? 0) + 1)

  async function addDimension() {
    if (!newDimName.trim()) return
    await repo.saveTags(
      [...dims, { id: uuid(), name: newDimName.trim(), kind: 'custom', sortOrder: dims.length }],
      allTags,
    )
    setNewDimName(''); setDimOpen(false)
  }
  async function addTag() {
    if (!editing || !newTagName.trim()) return
    const t: Tag = { id: uuid(), dimensionId: editing.dimId, parentId: editing.parent?.id ?? null, name: newTagName.trim(), sortOrder: allTags.length }
    await repo.saveTags(dims, [...allTags, t])
    setNewTagName(''); setEditing(null)
  }
  function askRename(t: Tag) { setMenuTarget(null); setRenameTarget(t); setRenameName(t.name) }
  function askAddChild(t: Tag) { setMenuTarget(null); setEditing({ dimId: t.dimensionId, parent: t }); setNewTagName('') }
  function askDelete(t: Tag) { setMenuTarget(null); setDeleteTarget(t) }
  async function confirmRename() {
    const name = renameName.trim()
    if (renameTarget && name) await repo.saveTags(dims, allTags.map((x) => (x.id === renameTarget.id ? { ...x, name } : x)))
    setRenameTarget(null)
  }
  async function confirmDelete() {
    if (!deleteTarget) return
    const children = allTags.filter((x) => x.parentId === deleteTarget.id)
    const removeIds = new Set([deleteTarget.id, ...children.map((c) => c.id)])
    // 快照父子深度，子标签排前（云端 FK 要求先删子）；本地真删除 + outbox 云端删除
    const byId = new Map(allTags.map((t) => [t.id, t]))
    const depth = (t?: Tag): number => { let n = 0, cur = t; while (cur?.parentId) { n++; cur = byId.get(cur.parentId) } return n }
    const ordered = [...removeIds].sort((a, b) => depth(byId.get(b)) - depth(byId.get(a)))
    await repo.deleteTags(ordered)
    setDeleteTarget(null)
  }

  const menuIsParent = menuTarget ? !menuTarget.parentId : false
  const menuUse = menuTarget ? (useCount.get(menuTarget.id) ?? 0) : 0

  return (
    <div className="min-h-screen safe-bottom">
      <PageHeader title="标签与维度" back right={<button className="chip" onClick={() => setDimOpen(true)}>＋ 维度</button>} />
      <p className="px-5 text-xs text-inkmuted mb-3">点标签可改名、删除；父标签还能加子标签。</p>
      <div className="px-5 space-y-4">
        {dims.map((d) => {
          const parents = data.tags.filter((t) => t.dimensionId === d.id && !t.parentId)
          return (
            <div key={d.id} className="card-paper p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="font-bold">{d.name} <span className="text-xs text-inkmuted font-normal">{KIND_LABEL[d.kind]}</span></p>
                <button className="chip" onClick={() => { setEditing({ dimId: d.id }); setNewTagName('') }}>＋ 标签</button>
              </div>
              {parents.length === 0 && <p className="text-xs text-inkmuted py-1">还没有标签</p>}
              <div className="divide-y divide-[#e9e0cb]">
                {parents.map((p) => {
                  const children = data.tags.filter((t) => t.parentId === p.id)
                  const used = (useCount.get(p.id) ?? 0) + children.reduce((n, c) => n + (useCount.get(c.id) ?? 0), 0)
                  return (
                    <div key={p.id} className="py-2.5">
                      <div className="flex items-center gap-1">
                        <button className="flex-1 min-w-0 text-left active:opacity-60 transition" onClick={() => setMenuTarget(p)}>
                          <span className="font-bold text-[15px]">{p.name}</span>
                          <span className="text-xs text-inkmuted ml-2">{used ? `· ${used} 次使用` : '· 未使用'}</span>
                        </button>
                        <button aria-label={`${p.name} 更多操作`} className="w-9 h-9 rounded-full text-inkmuted text-lg leading-none hover:bg-[#f0e8d3] active:bg-[#e9e0cb] transition shrink-0"
                          onClick={() => setMenuTarget(p)}>⋯</button>
                      </div>
                      {children.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2 pl-1">
                          {children.map((c) => (
                            <button key={c.id} className="chip !py-1 active:scale-[0.95] transition" onClick={() => setMenuTarget(c)}>
                              {c.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* 操作菜单：改名 / ＋子标签（仅父标签） / 删除 */}
      <Sheet open={!!menuTarget} onClose={() => setMenuTarget(null)} title={menuTarget?.name ?? ''}>
        <p className="text-xs text-inkmuted mb-3">{menuIsParent ? '父标签' : '子标签'} · {menuUse ? `被 ${menuUse} 条记录使用` : '未被记录使用'}</p>
        <div className="space-y-2">
          <button className="w-full py-3 rounded-2xl bg-[#f2ead6] font-bold text-[15px] active:scale-[0.98] transition"
            onClick={() => menuTarget && askRename(menuTarget)}>✎ 改名</button>
          {menuIsParent && (
            <button className="w-full py-3 rounded-2xl bg-[#f2ead6] font-bold text-[15px] text-terra active:scale-[0.98] transition"
              onClick={() => menuTarget && askAddChild(menuTarget)}>＋ 加子标签</button>
          )}
          <button className="w-full py-3 rounded-2xl bg-[#f7e7e0] font-bold text-[15px] text-[#a03c2a] active:scale-[0.98] transition"
            onClick={() => menuTarget && askDelete(menuTarget)}>删除</button>
        </div>
      </Sheet>

      <Sheet open={dimOpen} onClose={() => setDimOpen(false)} title="新增维度">
        <input className="field-input" placeholder="维度名称，如：氛围" value={newDimName} onChange={(e) => setNewDimName(e.target.value)} />
        <button className="btn-primary w-full py-3 mt-3" onClick={addDimension}>创建</button>
      </Sheet>
      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing?.parent ? `给「${editing.parent.name}」加子标签` : '新增标签'}>
        <input className="field-input" placeholder="标签名称" value={newTagName} onChange={(e) => setNewTagName(e.target.value)} autoFocus />
        <button className="btn-primary w-full py-3 mt-3" onClick={addTag}>添加</button>
      </Sheet>
      <Sheet open={!!renameTarget} onClose={() => setRenameTarget(null)} title={`改名：${renameTarget?.name ?? ''}`}>
        <input className="field-input" placeholder="新名称" value={renameName} onChange={(e) => setRenameName(e.target.value)} autoFocus
          onKeyDown={(e) => e.key === 'Enter' && confirmRename()} />
        <button className="btn-primary w-full py-3 mt-3" disabled={!renameName.trim()} onClick={confirmRename}>保存</button>
      </Sheet>
      <Sheet open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title={`删除「${deleteTarget?.name ?? ''}」？`}>
        {deleteTarget && allTags.filter((x) => x.parentId === deleteTarget.id).length > 0 && (
          <p className="text-sm text-[#a03c2a]">将连同 {allTags.filter((x) => x.parentId === deleteTarget.id).length} 个子标签一起删除。</p>
        )}
        <p className="text-xs text-inkmuted mt-1">记录上对该标签的引用会一并移除，记录本身不受影响。</p>
        <button className="w-full py-3 mt-3 rounded-full bg-[#a03c2a] text-white font-bold active:scale-[0.98] transition" onClick={confirmDelete}>确认删除</button>
      </Sheet>
    </div>
  )
}
