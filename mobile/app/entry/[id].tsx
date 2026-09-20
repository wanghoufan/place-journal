// Entry 详情：查看 / 编辑 / 删除（删除带二次确认）。全读本地库。

import { useCallback, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Image } from 'expo-image'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'

import { getAppRepository } from '@/db/app'
import {
  AppButton,
  Card,
  Chip,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  InlineTagCreator,
  LoadingState,
  SectionTitle,
  Stars,
  SyncBadge,
  TextField,
} from '@/components/ui'
import { leafTags, toggleTagId } from '@/features/form'
import { formatVisitDate, parseOptionalBudget, syncLabel } from '@/features/format'
import {
  getEntryDetail,
  listPlaceOptions,
  listTagsGrouped,
  type EntryDetail,
  type PlaceOption,
  type TagGroup,
} from '@/features/queries'
import { createTagNamed, deleteEntry, saveRecord } from '@/features/recordActions'
import { createEntryShare } from '@/features/shares'
import { colors } from '@/theme'

export default function EntryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [detail, setDetail] = useState<EntryDetail | null>(null)
  const [places, setPlaces] = useState<PlaceOption[]>([])
  const [tagGroups, setTagGroups] = useState<TagGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [editing, setEditing] = useState(false)
  const [visitDate, setVisitDate] = useState('')
  const [rating, setRating] = useState<number | undefined>(undefined)
  const [budget, setBudget] = useState('')
  const [notePrivate, setNotePrivate] = useState('')
  const [notePublic, setNotePublic] = useState('')
  const [tagIds, setTagIds] = useState<string[]>([])
  const [placeId, setPlaceId] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [creatingTag, setCreatingTag] = useState(false)
  const [message, setMessage] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const load = useCallback(() => {
    try {
      const { db } = getAppRepository()
      setDetail(getEntryDetail(db, id))
      setPlaces(listPlaceOptions(db))
      setTagGroups(listTagsGrouped(db))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [id])

  useFocusEffect(
    useCallback(() => {
      load()
    }, [load]),
  )

  const startEdit = useCallback(() => {
    if (!detail) return
    const e = detail.entry
    setVisitDate(e.visitDate)
    setRating(e.rating)
    setBudget(e.budget != null ? String(e.budget) : '')
    setNotePrivate(e.notePrivate ?? '')
    setNotePublic(e.notePublic ?? '')
    setTagIds([...e.tagIds])
    setPlaceId(e.placeId)
    setMessage('')
    setEditing(true)
  }, [detail])

  const save = useCallback(() => {
    if (!detail || saving) return
    setSaving(true)
    try {
      const { db, repo } = getAppRepository()
      saveRecord(db, repo, {
        entryId: detail.entry.id,
        placeId,
        visitDate,
        rating,
        budget: parseOptionalBudget(budget),
        notePrivate,
        notePublic,
        tagIds,
      })
      setEditing(false)
      load()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }, [budget, detail, load, notePrivate, notePublic, placeId, rating, saving, tagIds, visitDate])

  // 现场建标签（对标 Web EntryDetail）：同名复用，建完立刻勾上，不动已填的表单字段。
  const addTag = useCallback((name: string) => {
    setCreatingTag(true)
    try {
      const { db, repo } = getAppRepository()
      const created = createTagNamed(db, repo, { name })
      setTagGroups(listTagsGrouped(db))
      setTagIds((ids) => (ids.includes(created.id) ? ids : [...ids, created.id]))
      setMessage(created.created ? `已新建标签「${name}」并勾选。` : `已有标签「${name}」，已直接勾选。`)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err))
    } finally {
      setCreatingTag(false)
    }
  }, [])

  const doShare = useCallback(() => {
    if (!detail) return
    try {
      const { db, repo } = getAppRepository()
      const snapshot = createEntryShare(db, repo, { entryId: detail.entry.id })
      router.push(`/share/${snapshot.slug}`)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err))
    }
  }, [detail])

  const doDelete = useCallback(() => {
    if (!detail) return
    try {
      const { db, repo } = getAppRepository()
      deleteEntry(db, repo, detail.entry.id)
      setConfirmDelete(false)
      router.replace('/')
    } catch (err) {
      setConfirmDelete(false)
      setMessage(err instanceof Error ? err.message : String(err))
    }
  }, [detail])

  if (loading) return <LoadingState text="正在读取记录…" />
  if (error) return <ErrorState message={error} onRetry={load} />
  if (!detail) return <EmptyState icon="🗂" title="记录不存在或已被删除" hint="它可能已在本机删除。" />

  const entry = detail.entry
  const selectableTags = leafTags(tagGroups).filter((tag) => tag.dimensionId)
  const tagName = (tagId: string) => tagGroups.flatMap((g) => g.tags).find((t) => t.id === tagId)?.name ?? tagId

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      {message ? <Text style={styles.message}>{message}</Text> : null}

      {editing ? (
        <Card style={styles.section}>
          <SectionTitle>编辑记录</SectionTitle>
          <View style={styles.stack}>
            <Text style={styles.fieldHint}>地点</Text>
            <View style={styles.chipWrap}>
              {places.map((p) => (
                <Chip key={p.id} label={p.name} active={p.id === placeId} onPress={() => setPlaceId(p.id)} />
              ))}
            </View>
            <TextField label="到访日期（YYYY-MM-DD）" value={visitDate} onChangeText={setVisitDate} />
            <View style={styles.ratingRow}>
              <Text style={styles.fieldHint}>评分</Text>
              <Stars value={rating} editable size={26} onChange={setRating} />
            </View>
            <TextField label="预算（人均元）" value={budget} onChangeText={setBudget} keyboardType="number-pad" />
            <TextField label="私密感受" value={notePrivate} onChangeText={setNotePrivate} multiline minHeight={100} />
            <TextField label="公开理由" value={notePublic} onChangeText={setNotePublic} multiline minHeight={70} />
            <Text style={styles.fieldHint}>标签</Text>
            <View style={styles.chipWrap}>
              {selectableTags.map((tag) => (
                <Chip
                  key={tag.id}
                  label={tag.name}
                  active={tagIds.includes(tag.id)}
                  onPress={() => setTagIds((ids) => toggleTagId(ids, tag.id))}
                />
              ))}
            </View>
            <InlineTagCreator busy={creatingTag} onCreate={addTag} />
            <View style={styles.actions}>
              <AppButton label={saving ? '保存中…' : '保存修改'} onPress={save} loading={saving} style={styles.grow} />
              <AppButton label="取消" variant="secondary" onPress={() => setEditing(false)} />
            </View>
          </View>
        </Card>
      ) : (
        <>
          <Card style={styles.section}>
            <View style={styles.headerRow}>
              <Pressable onPress={() => router.push(`/place/${entry.placeId}`)} hitSlop={8}>
                <Text style={styles.placeLink}>{entry.placeName}</Text>
              </Pressable>
              <SyncBadge status={entry.syncStatus} />
            </View>
            {entry.placeArea ? <Text style={styles.muted}>📍 {entry.placeArea}</Text> : null}
            <View style={styles.metaRow}>
              <Text style={styles.muted}>{formatVisitDate(entry.visitDate)}</Text>
              <Text style={styles.muted}>{entry.budget != null ? `人均 ¥${entry.budget}` : '—'}</Text>
            </View>
            <Stars value={entry.rating} />
            {entry.syncStatus !== 'synced' ? (
              <Text style={styles.muted}>同步状态：{syncLabel(entry.syncStatus)}{entry.syncError ? ` · ${entry.syncError}` : ''}</Text>
            ) : null}
          </Card>

          {detail.media.length > 0 ? (
            <Card style={styles.section}>
              <SectionTitle>照片（{detail.media.length}）</SectionTitle>
              <View style={styles.photoGrid}>
                {detail.media.map((m) => (
                  <Image
                    key={m.id}
                    source={{ uri: m.localThumbPath ?? m.demoUri ?? m.localDisplayPath ?? '' }}
                    style={styles.photo}
                    contentFit="cover"
                  />
                ))}
              </View>
            </Card>
          ) : null}

          {entry.tagIds.length > 0 ? (
            <Card style={styles.section}>
              <SectionTitle>标签</SectionTitle>
              <View style={styles.chipWrap}>
                {entry.tagIds.map((tagId) => (
                  <Chip key={tagId} label={tagName(tagId)} />
                ))}
              </View>
            </Card>
          ) : null}

          {entry.notePrivate || entry.notePublic || entry.summary || entry.transcript ? (
            <Card style={styles.section}>
              {entry.summary ? <Text style={styles.summary}>{entry.summary}</Text> : null}
              {entry.transcript ? (
                <View>
                  <Text style={styles.fieldHint}>转写</Text>
                  <Text style={styles.body}>{entry.transcript}</Text>
                </View>
              ) : null}
              {entry.notePrivate ? (
                <View>
                  <Text style={styles.fieldHint}>私密感受</Text>
                  <Text style={styles.body}>{entry.notePrivate}</Text>
                </View>
              ) : null}
              {entry.notePublic ? (
                <View>
                  <Text style={styles.fieldHint}>公开理由</Text>
                  <Text style={styles.body}>{entry.notePublic}</Text>
                </View>
              ) : null}
            </Card>
          ) : null}

          <AppButton label="分享这条记录" onPress={doShare} />

          <View style={styles.actions}>
            <AppButton label="编辑" onPress={startEdit} style={styles.grow} />
            <AppButton label="删除" variant="danger" onPress={() => setConfirmDelete(true)} style={styles.grow} />
          </View>
        </>
      )}

      <ConfirmDialog
        visible={confirmDelete}
        title="删除这条记录？"
        message="将删除该记录的照片、感受与标签，删除后不可恢复。"
        confirmLabel="确认删除"
        danger
        onCancel={() => setConfirmDelete(false)}
        onConfirm={doDelete}
      />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  // screen 供 ScrollView 铺底；grow 只留给子元素撑满（按钮），不带背景，避免盖掉 variant 底色。
  screen: { flex: 1, backgroundColor: colors.paper },
  grow: { flex: 1 },
  container: { padding: 16, gap: 14, paddingBottom: 48 },
  section: { gap: 10 },
  stack: { gap: 10 },
  message: { fontSize: 13, color: colors.terraDeep, lineHeight: 20 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  placeLink: { fontSize: 18, fontWeight: '700', color: colors.terra },
  muted: { fontSize: 13, color: colors.inkMuted },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between' },
  fieldHint: { fontSize: 13, fontWeight: '700', color: colors.ink },
  ratingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photo: { width: 96, height: 96, borderRadius: 10, backgroundColor: colors.cardDeep },
  summary: { fontSize: 15, fontWeight: '700', color: colors.ink, borderLeftWidth: 3, borderLeftColor: colors.terra, paddingLeft: 10 },
  body: { fontSize: 15, color: colors.ink, lineHeight: 22, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 10 },
})
