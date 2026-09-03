// 标签与维度：父→子两层；可新增、改名、删除（方案 3.3）
import { useState } from 'react'
import { PageHeader, useDBData, Sheet } from '../components/ui'
import { repo } from '../lib/idb'
import type { Tag } from '../lib/types'

const KIND_LABEL: Record<string, string> = { region: '地区（系统）', type: '类型', scene: '场景', crowd: '人群', custom: '自定义' }

export default function TagsPage() {
  const data = useDBData()
  const [dimOpen, setDimOpen] = useState(false)
  const [newDimName, setNewDimName] = useState('')
  const [editing, setEditing] = useState<{ dimId: string; parent?: Tag } | null>(null)
  const [newTagName, setNewTagName] = useState('')

  if (!data) return null
  const dims = [...data.dimensions].sort((a, b) => a.sortOrder - b.sortOrder)

  const allTags = data!.tags
  async function addDimension() {
    if (!newDimName.trim()) return
    await repo.saveTags(
      [...dims, { id: crypto.randomUUID(), name: newDimName.trim(), kind: 'custom', sortOrder: dims.length }],
      allTags,
    )
    setNewDimName(''); setDimOpen(false)
  }
  async function addTag() {
    if (!editing || !newTagName.trim()) return
    const t: Tag = { id: crypto.randomUUID(), dimensionId: editing.dimId, parentId: editing.parent?.id ?? null, name: newTagName.trim(), sortOrder: allTags.length }
    await repo.saveTags(dims, [...allTags, t])
    setNewTagName(''); setEditing(null)
  }
  async function renameTag(t: Tag) {
    const name = window.prompt('改名', t.name)
    if (name && name.trim()) await repo.saveTags(dims, allTags.map((x) => (x.id === t.id ? { ...x, name: name.trim() } : x)))
  }
  async function deleteTag(t: Tag) {
    const children = allTags.filter((x) => x.parentId === t.id)
    if (!window.confirm(children.length ? `删除「${t.name}」及其 ${children.length} 个子标签？` : `删除「${t.name}」？`)) return
    const removeIds = new Set([t.id, ...children.map((c) => c.id)])
    await repo.saveTags(dims, allTags.filter((x) => !removeIds.has(x.id)))
  }

  return (
    <div className="min-h-screen safe-bottom">
      <PageHeader title="标签与维度" back right={<button className="chip" onClick={() => setDimOpen(true)}>＋ 维度</button>} />
      <p className="px-5 text-xs text-inkmuted mb-3">常规维度只有 父 → 子 两层；叶子标签才会存入记录。全部可改名、可删除。</p>
      <div className="px-5 space-y-4">
        {dims.map((d) => {
          const parents = data.tags.filter((t) => t.dimensionId === d.id && !t.parentId)
          return (
            <div key={d.id} className="card-paper p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="font-bold">{d.name} <span className="text-xs text-inkmuted font-normal">{KIND_LABEL[d.kind]}</span></p>
                <button className="chip" onClick={() => { setEditing({ dimId: d.id }); setNewTagName('') }}>＋ 标签</button>
              </div>
              <div className="space-y-2">
                {parents.length === 0 && <p className="text-xs text-inkmuted">还没有标签</p>}
                {parents.map((p) => {
                  const children = data.tags.filter((t) => t.parentId === p.id)
                  return (
                    <div key={p.id}>
                      <div className="flex items-center gap-2">
                        <span className="tag-chip">{p.name}</span>
                        <button className="text-xs text-inkmuted underline" onClick={() => renameTag(p)}>改名</button>
                        <button className="text-xs text-[#a03c2a] underline" onClick={() => deleteTag(p)}>删除</button>
                        <button className="text-xs text-terra underline" onClick={() => { setEditing({ dimId: d.id, parent: p }); setNewTagName('') }}>＋子标签</button>
                      </div>
                      {children.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-1.5 pl-4">
                          {children.map((c) => (
                            <span key={c.id} className="inline-flex items-center gap-1 chip !py-1">
                              {c.name}
                              <button className="text-inkmuted" onClick={() => renameTag(c)}>✎</button>
                              <button className="text-[#a03c2a]" onClick={() => deleteTag(c)}>✕</button>
                            </span>
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

      <Sheet open={dimOpen} onClose={() => setDimOpen(false)} title="新增维度">
        <input className="field-input" placeholder="维度名称，如：氛围" value={newDimName} onChange={(e) => setNewDimName(e.target.value)} />
        <button className="btn-primary w-full py-3 mt-3" onClick={addDimension}>创建</button>
      </Sheet>
      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing?.parent ? `给「${editing.parent.name}」加子标签` : '新增标签'}>
        <input className="field-input" placeholder="标签名称" value={newTagName} onChange={(e) => setNewTagName(e.target.value)} autoFocus />
        <button className="btn-primary w-full py-3 mt-3" onClick={addTag}>添加</button>
      </Sheet>
    </div>
  )
}
