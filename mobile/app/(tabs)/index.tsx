// Gallery：按时间倒序的地点记录流（封面图 + 店名 + 评分 + 时间），点进 Place 时间线。
// 数据全部读本地 SQLite；含空态/加载态/错误态。

import { useCallback, useState } from 'react'
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { Image } from 'expo-image'
import { router, useFocusEffect } from 'expo-router'

import { getAppRepository } from '@/db/app'
import { EmptyState, ErrorState, LoadingState, Stars, SyncBadge } from '@/components/ui'
import { listGalleryEntries, type GalleryEntry } from '@/features/queries'
import { relativeDayChip } from '@/features/format'
import { colors } from '@/theme'

export default function GalleryScreen() {
  const [entries, setEntries] = useState<GalleryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    try {
      setError(null)
      const { db } = getAppRepository()
      setEntries(listGalleryEntries(db))
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

  if (loading) return <LoadingState text="正在读取本机记录…" />
  if (error) return <ErrorState message={error} onRetry={load} />
  if (entries.length === 0) {
    return (
      <View style={styles.flex}>
        <TopBar count={0} onTags={() => router.push('/tags')} />
        <EmptyState
          icon="📍"
          title="还没有记录"
          hint="点底部「Record」拍下第一个地方吧。"
          actionLabel="去记录"
          onAction={() => router.push('/record')}
        />
      </View>
    )
  }

  return (
    <View style={styles.flex}>
      <TopBar count={entries.length} onTags={() => router.push('/tags')} />
      <FlatList
        data={entries}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => <EntryCard entry={item} />}
      />
    </View>
  )
}

function TopBar({ count, onTags }: { count: number; onTags: () => void }) {
  return (
    <View style={styles.topBar}>
      <Text style={styles.topText}>共 {count} 条记录</Text>
      <Pressable accessibilityRole="button" onPress={onTags} style={styles.tagsButton} hitSlop={8}>
        <Text style={styles.tagsButtonText}>🏷 标签</Text>
      </Pressable>
    </View>
  )
}

export function EntryCard({ entry }: { entry: GalleryEntry }) {
  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={() => router.push(`/place/${entry.placeId}`)}
    >
      <View style={styles.coverWrap}>
        {entry.coverThumbPath ? (
          <Image source={{ uri: entry.coverThumbPath }} style={styles.cover} contentFit="cover" />
        ) : (
          <View style={[styles.cover, styles.coverEmpty]}>
            <Text style={styles.coverEmptyText}>📍</Text>
          </View>
        )}
        <View style={styles.timeChip}>
          <Text style={styles.timeChipText}>{relativeDayChip(entry.visitDate)}</Text>
        </View>
        {entry.mediaCount > 1 ? (
          <View style={styles.countChip}>
            <Text style={styles.countChipText}>+{entry.mediaCount - 1}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.placeName} numberOfLines={1}>
          {entry.placeName}
        </Text>
        <Text style={styles.placeArea} numberOfLines={1}>
          📍 {entry.placeArea ?? '未填区域'}
        </Text>
        <View style={styles.cardFooter}>
          <Stars value={entry.rating} size={13} />
          <SyncBadge status={entry.syncStatus} />
        </View>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.paper },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  topText: { fontSize: 13, color: colors.inkMuted },
  tagsButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, backgroundColor: colors.cardDeep },
  tagsButtonText: { fontSize: 13, fontWeight: '700', color: colors.ink },
  list: { padding: 12, gap: 12 },
  row: { gap: 12 },
  card: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  cardPressed: { opacity: 0.9 },
  coverWrap: { position: 'relative' },
  cover: { width: '100%', aspectRatio: 4 / 5, backgroundColor: colors.cardDeep },
  coverEmpty: { alignItems: 'center', justifyContent: 'center' },
  coverEmptyText: { fontSize: 34 },
  timeChip: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(255,253,247,0.92)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  timeChipText: { fontSize: 11, color: colors.ink },
  countChip: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  countChipText: { fontSize: 11, color: colors.white },
  cardBody: { padding: 10, gap: 3 },
  placeName: { fontSize: 15, fontWeight: '700', color: colors.ink },
  placeArea: { fontSize: 12, color: colors.inkMuted },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, gap: 6 },
})
