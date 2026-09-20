// Place 详情：地点信息 + 到访时间线 + 编辑（名称/区域）+ 删除（带确认）。全读本地库。

import { useCallback, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Image } from 'expo-image'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'

import { getAppRepository } from '@/db/app'
import {
  AppButton,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  LoadingState,
  Stars,
  SyncBadge,
  TextField,
} from '@/components/ui'
import { formatVisitDate, relativeDayChip } from '@/features/format'
import { getPlaceDetail, type PlaceDetail } from '@/features/queries'
import { deletePlace, updatePlace } from '@/features/recordActions'
import { colors } from '@/theme'

export default function PlaceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [detail, setDetail] = useState<PlaceDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [area, setArea] = useState('')
  const [message, setMessage] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const load = useCallback(() => {
    try {
      const { db } = getAppRepository()
      setDetail(getPlaceDetail(db, id))
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
    setName(detail.name)
    setArea(detail.area ?? '')
    setMessage('')
    setEditing(true)
  }, [detail])

  const save = useCallback(() => {
    if (!detail) return
    try {
      const { db, repo } = getAppRepository()
      updatePlace(db, repo, { id: detail.id, name, area })
      setEditing(false)
      load()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err))
    }
  }, [area, detail, load, name])

  const doDelete = useCallback(() => {
    if (!detail) return
    try {
      const { db, repo } = getAppRepository()
      deletePlace(db, repo, detail.id)
      setConfirmDelete(false)
      router.replace('/')
    } catch (err) {
      setConfirmDelete(false)
      setMessage(err instanceof Error ? err.message : String(err))
    }
  }, [detail])

  if (loading) return <LoadingState text="正在读取地点…" />
  if (error) return <ErrorState message={error} onRetry={load} />
  if (!detail) return <EmptyState icon="🗺" title="地点不存在或已被删除" />

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      {message ? <Text style={styles.message}>{message}</Text> : null}

      <Card style={styles.section}>
        {editing ? (
          <View style={styles.stack}>
            <TextField label="地点名称" value={name} onChangeText={setName} />
            <TextField label="区域" value={area} onChangeText={setArea} placeholder="如：海口 · 西海岸" />
            <View style={styles.actions}>
              <AppButton label="保存" onPress={save} style={styles.grow} />
              <AppButton label="取消" variant="secondary" onPress={() => setEditing(false)} />
            </View>
          </View>
        ) : (
          <>
            <Text style={styles.placeName}>{detail.name}</Text>
            <Text style={styles.muted}>📍 {detail.area ?? '未填区域'}</Text>
            <View style={styles.metaRow}>
              <Text style={styles.visitCount}>去过 {detail.visitCount} 次</Text>
              <Stars value={detail.bestRating} size={14} />
            </View>
            <View style={styles.actions}>
              <AppButton label="编辑地点" variant="secondary" onPress={startEdit} style={styles.grow} />
              <AppButton label="删除地点" variant="danger" onPress={() => setConfirmDelete(true)} style={styles.grow} />
            </View>
          </>
        )}
      </Card>

      <Text style={styles.timelineTitle}>到访时间线</Text>
      {detail.entries.length === 0 ? (
        <EmptyState icon="🕘" title="还没有到访记录" hint="到 Record 页添加第一条记录。" />
      ) : (
        <View style={styles.timeline}>
          <View style={styles.timelineLine} />
          {detail.entries.map((entry) => (
            <Pressable
              key={entry.id}
              accessibilityRole="button"
              style={({ pressed }) => [styles.timelineItem, pressed && styles.pressed]}
              onPress={() => router.push(`/entry/${entry.id}`)}
            >
              <View style={styles.dot} />
              {entry.coverThumbPath ? (
                <Image source={{ uri: entry.coverThumbPath }} style={styles.thumb} contentFit="cover" />
              ) : (
                <View style={[styles.thumb, styles.thumbEmpty]}>
                  <Text>📍</Text>
                </View>
              )}
              <View style={styles.timelineBody}>
                <Text style={styles.muted}>
                  {formatVisitDate(entry.visitDate)} · {relativeDayChip(entry.visitDate)}
                </Text>
                <Stars value={entry.rating} size={12} />
                <Text style={styles.timelineNote} numberOfLines={1}>
                  {entry.summary ?? '—'}
                </Text>
                <View style={styles.timelineFooter}>
                  <Text style={styles.muted}>{entry.budget != null ? `人均 ¥${entry.budget}` : '—'}</Text>
                  <SyncBadge status={entry.syncStatus} />
                </View>
              </View>
            </Pressable>
          ))}
        </View>
      )}

      <ConfirmDialog
        visible={confirmDelete}
        title="删除这个地点？"
        message={`将删除该地点及其 ${detail.visitCount} 条记录与照片，删除后不可恢复。`}
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
  section: { gap: 8 },
  stack: { gap: 10 },
  message: { fontSize: 13, color: colors.terraDeep },
  placeName: { fontSize: 20, fontWeight: '700', color: colors.ink },
  muted: { fontSize: 13, color: colors.inkMuted },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  visitCount: { fontSize: 15, fontWeight: '700', color: colors.terra },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  timelineTitle: { fontSize: 16, fontWeight: '700', color: colors.ink, marginTop: 4 },
  timeline: { position: 'relative', gap: 12 },
  timelineLine: { position: 'absolute', left: 5, top: 8, bottom: 8, width: 1, backgroundColor: colors.line },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
  },
  pressed: { opacity: 0.9 },
  dot: { width: 11, height: 11, borderRadius: 6, backgroundColor: colors.terra, marginLeft: -18 },
  thumb: { width: 60, height: 60, borderRadius: 10, backgroundColor: colors.cardDeep },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  timelineBody: { flex: 1, gap: 3 },
  timelineNote: { fontSize: 13, color: colors.ink },
  timelineFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
})
