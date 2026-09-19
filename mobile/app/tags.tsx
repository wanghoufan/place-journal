// Tags：维度分组展示 + 标签增删改（父/子两层）。对标 Web `src/pages/TagsPage.tsx`：
// 父标签行尾「⋯」弹出操作菜单（改名 / ＋子标签 / 删除），子标签以 chips 展示；
// 使用计数按「父 + 子」聚合，删除前给出被引用提示。全读本地库，写入走 outbox。

import { useCallback, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useFocusEffect } from 'expo-router'

import { getAppRepository } from '@/db/app'
import {
  AppButton,
  Card,
  Chip,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  LoadingState,
  SectionTitle,
  Sheet,
  TextField,
} from '@/components/ui'
import { listTagsGrouped, tagUsageWithChildren, type TagGroup, type TagWithUsage } from '@/features/queries'
import { createDimension, createTag, deleteTag, renameTag } from '@/features/recordActions'
import { dimensionKindLabel } from '@/features/format'
import { colors } from '@/theme'

interface AddTarget {
  dimensionId: string
  parentId: string | null
  parentName?: string
}

export default function TagsScreen() {
  const [groups, setGroups] = useState<TagGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [message, setMessage] = useState('')
  const [dimensionOpen, setDimensionOpen] = useState(false)
  const [newDimensionName, setNewDimensionName] = useState('')
  const [addTarget, setAddTarget] = useState<AddTarget | null>(null)
  const [newTagName, setNewTagName] = useState('')
  const [menuTarget, setMenuTarget] = useState<TagWithUsage | null>(null)
  const [renameTarget, setRenameTarget] = useState<TagWithUsage | null>(null)
  const [renameName, setRenameName] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<TagWithUsage | null>(null)

  const load = useCallback(() => {
    try {
      const { db } = getAppRepository()
      setGroups(listTagsGrouped(db))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      load()
    }, [load]),
  )

  const addDimension = useCallback(() => {
    try {
      const { db, repo } = getAppRepository()
      createDimension(db, repo, { name: newDimensionName })
      setNewDimensionName('')
      setDimensionOpen(false)
      setMessage('已新建维度（待同步）。')
      load()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err))
    }
  }, [load, newDimensionName])

  const submitAddTag = useCallback(() => {
    if (!addTarget) return
    try {
      const { db, repo } = getAppRepository()
      createTag(db, repo, { dimensionId: addTarget.dimensionId, name: newTagName, parentId: addTarget.parentId })
      setNewTagName('')
      setAddTarget(null)
      setMessage('已新建标签（待同步）。')
      load()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err))
    }
  }, [addTarget, load, newTagName])

  const submitRename = useCallback(() => {
    if (!renameTarget) return
    try {
      const { db, repo } = getAppRepository()
      renameTag(db, repo, { id: renameTarget.id, name: renameName })
      setRenameTarget(null)
      setMessage('已改名（待同步）。')
      load()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err))
    }
  }, [load, renameName, renameTarget])

  const confirmDelete = useCallback(() => {
    if (!deleteTarget) return
    try {
      const { db, repo } = getAppRepository()
      deleteTag(db, repo, deleteTarget.id)
      setDeleteTarget(null)
      setMessage('已删除标签（同步将在联网后执行）。')
      load()
    } catch (err) {
      setDeleteTarget(null)
      setMessage(err instanceof Error ? err.message : String(err))
    }
  }, [deleteTarget, load])

  if (loading) return <LoadingState text="正在读取标签…" />
  if (error) return <ErrorState message={error} onRetry={load} />

  const menuIsParent = menuTarget ? !menuTarget.parentId : false
  // 菜单副标题与父标签行同口径（P1-2）：父标签聚合父+子，子标签只算自身。
  const menuUsed = menuTarget ? tagUsageWithChildren(groups.flatMap((group) => group.tags), menuTarget) : 0

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      {message ? <Text style={styles.message}>{message}</Text> : null}

      <View style={styles.topRow}>
        <Text style={styles.hint}>点标签可改名、删除；父标签还能加子标签。</Text>
        <AppButton label="＋ 维度" variant="secondary" onPress={() => setDimensionOpen(true)} />
      </View>

      {groups.length === 0 ? (
        <EmptyState icon="🏷" title="还没有标签维度" hint="新建一个维度，再往里面加标签。" />
      ) : (
        groups.map((group) => {
          const parents = group.tags.filter((tag) => !tag.parentId)
          return (
            <Card key={group.dimension.id} style={styles.section}>
              <SectionTitle
                right={
                  <Text style={styles.kind}>
                    {dimensionKindLabel(group.dimension.kind)} · {group.tags.length}
                  </Text>
                }
              >
                {group.dimension.name}
              </SectionTitle>
              {parents.length === 0 ? <Text style={styles.hint}>还没有标签</Text> : null}
              <View>
                {parents.map((parent) => {
                  const children = group.tags.filter((tag) => tag.parentId === parent.id)
                  const used = tagUsageWithChildren(group.tags, parent)
                  return (
                    <View key={parent.id} style={styles.parentBlock}>
                      <View style={styles.parentRow}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`${parent.name} 更多操作`}
                          style={styles.parentMain}
                          onPress={() => setMenuTarget(parent)}
                        >
                          <Text style={styles.parentName}>{parent.name}</Text>
                          <Text style={styles.muted}>{used > 0 ? `· ${used} 次使用` : '· 未使用'}</Text>
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`${parent.name} 更多操作`}
                          onPress={() => setMenuTarget(parent)}
                          style={styles.menuButton}
                          hitSlop={8}
                        >
                          <Text style={styles.menuDots}>⋯</Text>
                        </Pressable>
                      </View>
                      {children.length > 0 ? (
                        <View style={styles.chipWrap}>
                          {children.map((child) => (
                            <Chip
                              key={child.id}
                              label={`${child.name}${child.usage > 0 ? ` · ${child.usage}` : ''}`}
                              onPress={() => setMenuTarget(child)}
                            />
                          ))}
                        </View>
                      ) : null}
                    </View>
                  )
                })}
              </View>
              <AppButton
                label="＋ 标签"
                variant="ghost"
                onPress={() => {
                  setNewTagName('')
                  setAddTarget({ dimensionId: group.dimension.id, parentId: null })
                }}
              />
            </Card>
          )
        })
      )}

      {/* 维度新增 */}
      <Sheet open={dimensionOpen} onClose={() => setDimensionOpen(false)} title="新增维度">
        <TextField label="维度名称" value={newDimensionName} onChangeText={setNewDimensionName} placeholder="如：氛围" autoFocus />
        <AppButton label="创建" onPress={addDimension} />
      </Sheet>

      {/* 标签新增（顶层或给父标签加子） */}
      <Sheet
        open={!!addTarget}
        onClose={() => setAddTarget(null)}
        title={addTarget?.parentName ? `给「${addTarget.parentName}」加子标签` : '新增标签'}
      >
        <TextField label="标签名称" value={newTagName} onChangeText={setNewTagName} placeholder="如：适合拍照" autoFocus />
        <AppButton label="添加" onPress={submitAddTag} />
      </Sheet>

      {/* 操作菜单：改名 / ＋子标签（仅父标签） / 删除 */}
      <Sheet open={!!menuTarget} onClose={() => setMenuTarget(null)} title={menuTarget?.name ?? ''}>
        <Text style={styles.muted}>
          {menuIsParent ? '父标签' : '子标签'} · {menuUsed > 0 ? `被 ${menuUsed} 条记录使用` : '未被记录使用'}
        </Text>
        <AppButton
          label="✎ 改名"
          variant="secondary"
          onPress={() => {
            if (!menuTarget) return
            setRenameTarget(menuTarget)
            setRenameName(menuTarget.name)
            setMenuTarget(null)
          }}
        />
        {menuIsParent ? (
          <AppButton
            label="＋ 加子标签"
            variant="secondary"
            onPress={() => {
              if (!menuTarget) return
              setNewTagName('')
              setAddTarget({ dimensionId: menuTarget.dimensionId, parentId: menuTarget.id, parentName: menuTarget.name })
              setMenuTarget(null)
            }}
          />
        ) : null}
        <AppButton
          label="删除"
          variant="danger"
          onPress={() => {
            if (!menuTarget) return
            setDeleteTarget(menuTarget)
            setMenuTarget(null)
          }}
        />
      </Sheet>

      {/* 改名 */}
      <Sheet open={!!renameTarget} onClose={() => setRenameTarget(null)} title={`改名：${renameTarget?.name ?? ''}`}>
        <TextField label="新名称" value={renameName} onChangeText={setRenameName} autoFocus />
        <AppButton label="保存" onPress={submitRename} disabled={!renameName.trim()} />
      </Sheet>

      {/* 删除保护：提示引用与子标签数量，确认后才删 */}
      <ConfirmDialog
        visible={!!deleteTarget}
        title={`删除「${deleteTarget?.name ?? ''}」？`}
        message={deleteMessage(deleteTarget, groups)}
        confirmLabel="确认删除"
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </ScrollView>
  )
}

function deleteMessage(target: TagWithUsage | null, groups: TagGroup[]): string {
  if (!target) return ''
  const children = groups.flatMap((g) => g.tags).filter((tag) => tag.parentId === target.id)
  const parts: string[] = []
  if (target.usage > 0) parts.push(`该标签被 ${target.usage} 条记录使用。`)
  if (children.length > 0) parts.push(`将连同 ${children.length} 个子标签一起删除。`)
  parts.push('记录上对该标签的引用会一并移除，记录本身不受影响。')
  return parts.join('')
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.paper },
  container: { padding: 16, gap: 14, paddingBottom: 48 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  hint: { fontSize: 12, color: colors.inkMuted, flex: 1 },
  kind: { fontSize: 12, color: colors.inkMuted },
  message: { fontSize: 13, color: colors.terraDeep },
  section: { gap: 10 },
  parentBlock: { borderBottomWidth: 1, borderBottomColor: colors.line, paddingVertical: 10, gap: 8 },
  parentRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  parentMain: { flex: 1, flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  parentName: { fontSize: 15, fontWeight: '700', color: colors.ink },
  menuButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  menuDots: { fontSize: 20, color: colors.inkMuted, lineHeight: 22 },
  muted: { fontSize: 12, color: colors.inkMuted },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingLeft: 4 },
})
