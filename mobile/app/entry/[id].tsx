// Entry 详情：查看 / 编辑（地点改名＋搬家）/ 删除（带二次确认）/ 灯箱＋显式设封面。
// 对标 Web `src/pages/EntryDetail.tsx`：改名改的是地点本身（该地点下全记录生效）；
// 搬家把记录与照片一起换归属并重传，搬空的老地点级联清理；删记录连同其分享一并撤销。

import { useCallback, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Image } from 'expo-image'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'

import { getAppRepository } from '@/db/app'
import { Lightbox } from '@/components/Lightbox'
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
  countEntriesForPlace,
  getEntryDetail,
  listPlaceOptions,
  listTagsGrouped,
  mediaUri,
  type EntryDetail,
  type PlaceOption,
  type TagGroup,
} from '@/features/queries'
import {
  createTagNamed,
  deleteEntry,
  moveEntry,
  saveRecord,
  setEntryCover,
  updatePlace,
} from '@/features/recordActions'
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
  // 地点改名（改地点本身）与搬家（换归属）分开：选了新地点即搬家，否则改名/改区域。
  const [placeName, setPlaceName] = useState('')
  const [placeArea, setPlaceArea] = useState('')
  const [pickingPlace, setPickingPlace] = useState(false)
  const [placeQuery, setPlaceQuery] = useState('')
  const [placeEntryCount, setPlaceEntryCount] = useState(0)
  const [saving, setSaving] = useState(false)
  const [creatingTag, setCreatingTag] = useState(false)
  const [message, setMessage] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  // 灯箱：点图放大、左右滑动翻页；设封面只走显式按钮（网格上的按钮或灯箱里的按钮）。
  const [lightIndex, setLightIndex] = useState<number | null>(null)

  const load = useCallback(() => {
    try {
      const { db } = getAppRepository()
      const next = getEntryDetail(db, id)
      setDetail(next)
      setPlaceEntryCount(next ? countEntriesForPlace(db, next.entry.placeId) : 0)
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
    setPlaceName(e.placeName)
    setPlaceArea(e.placeArea ?? '')
    setPickingPlace(false)
    setPlaceQuery('')
    setMessage('')
    setEditing(true)
  }, [detail])

  const save = useCallback(() => {
    if (!detail || saving) return
    setSaving(true)
    try {
      const { db, repo } = getAppRepository()
      const entryId = detail.entry.id
      const currentPlaceId = detail.entry.placeId
      const moving = placeId !== '' && placeId !== currentPlaceId
      // 表单字段先落：saveRecord 编辑既有记录时保留 place_id/封面/创建时间，地点变更走搬家分支。
      saveRecord(db, repo, {
        entryId,
        visitDate,
        rating,
        budget: parseOptionalBudget(budget),
        notePrivate,
        notePublic,
        tagIds,
      })
      if (moving) {
        const moved = moveEntry(db, repo, { entryId, toPlaceId: placeId })
        setMessage(
          moved.removedOldPlace
            ? '已搬家：记录与照片一起换到新地点，原地点已搬空并清理。'
            : '已搬家：记录与照片一起换到新地点，照片会重传一份。',
        )
      } else {
        const name = placeName.trim()
        const area = placeArea.trim()
        const renamed = name.length > 0 && name !== detail.entry.placeName
        const rearea = area !== (detail.entry.placeArea ?? '')
        if (renamed || rearea) {
          updatePlace(db, repo, { id: currentPlaceId, name: name || detail.entry.placeName, area })
          setMessage(renamed ? '已改地点名：该地点下所有记录一起生效。' : '已更新区域：该地点下所有记录一起生效。')
        } else {
          setMessage('已保存修改。')
        }
      }
      setEditing(false)
      load()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }, [budget, detail, load, notePrivate, notePublic, placeArea, placeId, placeName, rating, saving, tagIds, visitDate])

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

  // 显式设封面（对标 Web EntryDetail 的 setCover）：只认本记录的照片。
  const setCover = useCallback(
    (mediaId: string) => {
      if (!detail) return
      try {
        const { db, repo } = getAppRepository()
        setEntryCover(db, repo, { entryId: detail.entry.id, mediaId })
        setMessage('已设为封面。')
        load()
      } catch (err) {
        setMessage(err instanceof Error ? err.message : String(err))
      }
    },
    [detail, load],
  )

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
  const moveTarget = placeId !== '' && placeId !== entry.placeId ? places.find((p) => p.id === placeId) : undefined
  const query = placeQuery.trim()
  const moveCandidates = places
    .filter((p) => p.id !== entry.placeId && (!query || `${p.name}${p.area ?? ''}`.includes(query)))
    .slice(0, 8)
  const coverIndex = Math.max(
    0,
    detail.media.findIndex((m) => m.id === entry.coverMediaId),
  )

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      {message ? <Text style={styles.message}>{message}</Text> : null}

      {editing ? (
        <Card style={styles.section}>
          <SectionTitle>编辑记录</SectionTitle>
          <View style={styles.stack}>
            <Text style={styles.fieldHint}>地点</Text>
            {moveTarget ? (
              <View style={styles.placeRow}>
                <Text style={styles.placeRowText}>📍 将搬到：{moveTarget.name}</Text>
                <AppButton label="改回" variant="secondary" onPress={() => setPlaceId(entry.placeId)} />
              </View>
            ) : (
              <>
                <View style={styles.placeRow}>
                  <Text style={styles.placeRowText}>📍 {entry.placeName}</Text>
                  <AppButton
                    label={pickingPlace ? '收起' : '更换地点'}
                    variant="secondary"
                    onPress={() => setPickingPlace((v) => !v)}
                  />
                </View>
                {pickingPlace ? (
                  <View style={styles.stack}>
                    <TextField label="搜索地点" value={placeQuery} onChangeText={setPlaceQuery} placeholder="地点名称" />
                    <View style={styles.chipWrap}>
                      {moveCandidates.map((p) => (
                        <Chip
                          key={p.id}
                          label={p.name}
                          onPress={() => {
                            setPlaceId(p.id)
                            setPickingPlace(false)
                          }}
                        />
                      ))}
                    </View>
                    {moveCandidates.length === 0 ? (
                      <Text style={styles.muted}>没有匹配的其他地点（新地点请先在「记录」页建）。</Text>
                    ) : null}
                    <Text style={styles.muted}>搬家会把这条记录和它的照片一起换归属，原地点搬空后自动清理。</Text>
                  </View>
                ) : null}
                <TextField
                  label="地点名称（改的是地点本身）"
                  value={placeName}
                  onChangeText={setPlaceName}
                  placeholder="如：西海岸日落咖啡"
                />
                <TextField label="区域" value={placeArea} onChangeText={setPlaceArea} placeholder="如：海口 · 西海岸" />
                {placeEntryCount > 1 ? (
                  <Text style={styles.muted}>该地点下共 {placeEntryCount} 条记录，改名会一起生效。</Text>
                ) : null}
              </>
            )}
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
                {detail.media.map((m, index) => (
                  <View key={m.id} style={styles.photoCell}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`放大第 ${index + 1} 张照片`}
                      onPress={() => setLightIndex(index)}
                    >
                      <Image source={{ uri: mediaUri(m, 'thumb') }} style={styles.photo} contentFit="cover" />
                    </Pressable>
                    {entry.coverMediaId === m.id ? (
                      <Text style={styles.coverBadge}>封面</Text>
                    ) : (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="设为封面"
                        onPress={() => setCover(m.id)}
                        style={styles.coverButton}
                        hitSlop={6}
                      >
                        <Text style={styles.coverButtonText}>设为封面</Text>
                      </Pressable>
                    )}
                  </View>
                ))}
              </View>
              <Text style={styles.muted}>点照片放大、左右滑动查看（共 {detail.media.length} 张）；设封面只走显式按钮。</Text>
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

      <Lightbox
        visible={lightIndex != null}
        images={detail.media.map((m) => mediaUri(m, 'display'))}
        index={lightIndex ?? 0}
        onIndex={setLightIndex}
        onClose={() => setLightIndex(null)}
        coverIndex={coverIndex}
        onSetCover={(index) => {
          const m = detail.media[index]
          if (m) setCover(m.id)
        }}
      />

      <ConfirmDialog
        visible={confirmDelete}
        title="删除这条记录？"
        message="将删除该记录的照片、感受与标签，该记录的分享链接会一并撤销失效，删除后不可恢复。"
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
  muted: { fontSize: 13, color: colors.inkMuted, lineHeight: 19 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between' },
  fieldHint: { fontSize: 13, fontWeight: '700', color: colors.ink },
  ratingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  placeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  placeRowText: { flex: 1, fontSize: 15, color: colors.ink },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoCell: {
    width: 96,
    height: 96,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: colors.cardDeep,
  },
  photo: { width: 96, height: 96 },
  coverBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: colors.terra,
    color: colors.white,
    fontSize: 11,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: 'hidden',
  },
  coverButton: {
    position: 'absolute',
    left: 6,
    right: 6,
    bottom: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 8,
    paddingVertical: 4,
    alignItems: 'center',
  },
  coverButtonText: { color: colors.white, fontSize: 11 },
  summary: { fontSize: 15, fontWeight: '700', color: colors.ink, borderLeftWidth: 3, borderLeftColor: colors.terra, paddingLeft: 10 },
  body: { fontSize: 15, color: colors.ink, lineHeight: 22, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 10 },
})
