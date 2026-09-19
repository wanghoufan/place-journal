// Find：文字搜索 + 标签筛选 + 评分档，全部本地过滤。含空态/加载态/错误态。

import { useCallback, useMemo, useState } from 'react'
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Image } from 'expo-image'
import { router, useFocusEffect } from 'expo-router'

import { getAppRepository } from '@/db/app'
import { Chip, EmptyState, ErrorState, LoadingState, Stars, TextField } from '@/components/ui'
import {
  countDistinctPlaces,
  filterGalleryEntries,
  listGalleryEntries,
  listTagsGrouped,
  ratingTierCounts,
  type GalleryEntry,
  type TagGroup,
} from '@/features/queries'
import { formatVisitDate } from '@/features/format'
import { colors } from '@/theme'

export default function FindScreen() {
  const [entries, setEntries] = useState<GalleryEntry[]>([])
  const [tagGroups, setTagGroups] = useState<TagGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [pickedTags, setPickedTags] = useState<string[]>([])
  const [minRating, setMinRating] = useState<number | null>(null)

  const load = useCallback(() => {
    try {
      const { db } = getAppRepository()
      setEntries(listGalleryEntries(db))
      setTagGroups(listTagsGrouped(db))
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

  const hits = useMemo(
    () => filterGalleryEntries(entries, { text: query, tagIds: pickedTags, minRating }),
    [entries, minRating, pickedTags, query],
  )

  const tierCounts = useMemo(() => ratingTierCounts(entries), [entries])

  // 量词按 place 聚合（对标 Web Find「找到 N 个私藏地点」）；下方列表仍是 entry 明细链路。
  const placeCount = useMemo(() => countDistinctPlaces(hits), [hits])

  const filterTags = useMemo(() => {
    const usage = new Map<string, number>()
    for (const entry of entries) for (const tagId of entry.tagIds) usage.set(tagId, (usage.get(tagId) ?? 0) + 1)
    return tagGroups
      .map((group) => ({
        dimension: group.dimension,
        // 只展示被记录引用过的标签；组内按使用频次降序（对标 Web Find）。
        tags: group.tags
          .filter((tag) => (usage.get(tag.id) ?? 0) > 0)
          .sort((a, b) => (usage.get(b.id) ?? 0) - (usage.get(a.id) ?? 0) || a.sortOrder - b.sortOrder),
      }))
      .filter((group) => group.tags.length > 0)
  }, [entries, tagGroups])

  const toggleTag = (id: string) =>
    setPickedTags((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))

  if (loading) return <LoadingState text="正在准备搜索…" />
  if (error) return <ErrorState message={error} onRetry={load} />

  return (
    <FlatList
      style={styles.flex}
      data={hits}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.container}
      ListHeaderComponent={
        <View style={styles.filters}>
          <TextField
            value={query}
            onChangeText={setQuery}
            placeholder="如：海口，晚上适合聊天的地方"
          />
          <Text style={styles.filterLabel}>评分</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Chip
                key={n}
                label={`${n === 5 ? '5 星' : `${n} 星以上`} · ${tierCounts[n]}`}
                active={minRating === n}
                onPress={() => setMinRating((v) => (v === n ? null : n))}
              />
            ))}
          </ScrollView>
          {filterTags.map((group) => (
            <View key={group.dimension.id} style={styles.tagGroup}>
              <Text style={styles.filterLabel}>{group.dimension.name}</Text>
              <View style={styles.chipWrap}>
                {group.tags.map((tag) => (
                  <Chip
                    key={tag.id}
                    label={tag.name}
                    active={pickedTags.includes(tag.id)}
                    onPress={() => toggleTag(tag.id)}
                  />
                ))}
              </View>
            </View>
          ))}
          <Text style={styles.resultCount}>
            🌿 找到 {placeCount} 个私藏地点 · 共 {hits.length} 条记录
          </Text>
        </View>
      }
      ListEmptyComponent={
        <EmptyState icon="🔍" title="没有符合条件的记录" hint="换个说法，或清空筛选试试。" />
      }
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [styles.resultCard, pressed && styles.pressed]}
          onPress={() => router.push(`/entry/${item.id}`)}
        >
          {item.coverThumbPath ? (
            <Image source={{ uri: item.coverThumbPath }} style={styles.thumb} contentFit="cover" />
          ) : (
            <View style={[styles.thumb, styles.thumbEmpty]}>
              <Text>📍</Text>
            </View>
          )}
          <View style={styles.resultBody}>
            <Text style={styles.placeName} numberOfLines={1}>
              {item.placeName}
            </Text>
            <Text style={styles.muted} numberOfLines={1}>
              {formatVisitDate(item.visitDate)} · {item.placeArea ?? '未填区域'}
            </Text>
            <Stars value={item.rating} size={12} />
            <Text style={styles.muted} numberOfLines={1}>
              {item.summary ?? '—'}
            </Text>
          </View>
        </Pressable>
      )}
    />
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.paper },
  container: { padding: 16, gap: 12, paddingBottom: 48 },
  filters: { gap: 10 },
  filterLabel: { fontSize: 12, color: colors.inkMuted },
  chipRow: { gap: 8, paddingVertical: 2 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tagGroup: { gap: 6 },
  resultCount: { fontSize: 13, color: colors.inkMuted, marginTop: 4 },
  resultCard: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  pressed: { opacity: 0.9 },
  thumb: { width: 72, height: 72, borderRadius: 10, backgroundColor: colors.cardDeep },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  resultBody: { flex: 1, gap: 3 },
  placeName: { fontSize: 15, fontWeight: '700', color: colors.ink },
  muted: { fontSize: 12, color: colors.inkMuted },
})
