// Gallery（对标 Web `src/pages/Gallery.tsx`）：顶部场景筛选 chips + 「按记录 / 按地点」双视图。
//   - 按记录：封面卡 + 店名 + 区域 + 评分 + 标签行，点卡片进记录详情（`/entry/{id}`）；
//   - 按地点：地点卡（封面 + 去过 N 次），点卡片进地点页（`/place/{id}`）；
// 数据全部读本地 SQLite；含空态/加载态/错误态。配色随主题。

import { useCallback, useMemo, useState } from 'react'
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Image } from 'expo-image'
import { router, useFocusEffect } from 'expo-router'

import { getAppRepository } from '@/db/app'
import { EmptyState, ErrorState, LoadingState, Stars, SyncBadge } from '@/components/ui'
import {
  expandTagIds,
  filterEntriesByAnyTag,
  groupEntriesByPlace,
  listGalleryEntries,
  listTagsGrouped,
  type GalleryEntry,
  type PlaceGroup,
  type TagGroup,
} from '@/features/queries'
import { relativeDayChip } from '@/features/format'
import { useTheme } from '@/themeProvider'
import type { Palette } from '@/theme'

type ViewMode = 'entry' | 'place'

export default function GalleryScreen() {
  const { palette } = useTheme()
  const styles = useMemo(() => makeStyles(palette), [palette])

  const [entries, setEntries] = useState<GalleryEntry[]>([])
  const [tagGroups, setTagGroups] = useState<TagGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<ViewMode>('entry')
  const [sceneId, setSceneId] = useState<string | null>(null)

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

  const allTags = useMemo(() => tagGroups.flatMap((g) => g.tags), [tagGroups])
  const tagNameOf = useMemo(() => {
    const map = new Map(allTags.map((t) => [t.id, t.name]))
    return (id: string) => map.get(id) ?? id
  }, [allTags])
  // 场景筛选 chips（标 scene 维度的标签；与 Web Gallery 同源）。
  const sceneTags = useMemo(
    () => tagGroups.find((g) => g.dimension.kind === 'scene')?.tags ?? [],
    [tagGroups],
  )

  const sceneAll = useMemo(
    () => (sceneId ? expandTagIds([sceneId], allTags) : []),
    [sceneId, allTags],
  )
  const filtered = useMemo(
    () => filterEntriesByAnyTag(entries, sceneAll),
    [entries, sceneAll],
  )
  const placeGroups = useMemo(() => groupEntriesByPlace(filtered), [filtered])

  if (loading) return <LoadingState text="正在读取本机记录…" />

  return (
    <View style={styles.flex}>
      <View style={styles.topBar}>
        <Text style={styles.topText}>
          {sceneId || filtered.length !== entries.length
            ? `共 ${filtered.length} / ${entries.length} 条记录`
            : `共 ${entries.length} 条记录`}
        </Text>
        <Pressable accessibilityRole="button" onPress={() => router.push('/tags')} style={styles.tagsButton} hitSlop={8}>
          <Text style={styles.tagsButtonText}>🏷 标签</Text>
        </Pressable>
      </View>

      {sceneTags.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
          style={styles.chipScroll}
        >
          {sceneTags.map((tag) => {
            const active = sceneId === tag.id
            return (
              <Pressable
                key={tag.id}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setSceneId(active ? null : tag.id)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {sceneEmoji(tag.name)} {tag.name}
                </Text>
              </Pressable>
            )
          })}
        </ScrollView>
      ) : null}

      <View style={styles.viewRow}>
        <Text style={styles.viewLabel}>浏览：</Text>
        {(['entry', 'place'] as ViewMode[]).map((m) => (
          <Pressable
            key={m}
            accessibilityRole="button"
            accessibilityState={{ selected: mode === m }}
            onPress={() => setMode(m)}
            style={[styles.chip, mode === m && styles.chipActive]}
          >
            <Text style={[styles.chipText, mode === m && styles.chipTextActive]}>
              {m === 'entry' ? '按记录' : '按地点'}
            </Text>
          </Pressable>
        ))}
      </View>

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="📍"
          title="还没有记录"
          hint="点底部「记录」拍下第一个地方吧。"
          actionLabel="去记录"
          onAction={() => router.push('/record')}
        />
      ) : mode === 'entry' ? (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <EntryCard
              entry={item}
              tagNames={item.tagIds.map(tagNameOf)}
              onPress={() => router.push(`/entry/${item.id}`)}
            />
          )}
        />
      ) : (
        <FlatList
          data={placeGroups}
          keyExtractor={(item) => item.placeId}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <PlaceCard group={item} onPress={() => router.push(`/place/${item.placeId}`)} />
          )}
        />
      )}
    </View>
  )
}

function sceneEmoji(name: string): string {
  return (
    {
      拍照打卡: '📷',
      约会: '💐',
      一个人放空: '🍵',
      朋友小聚: '🍻',
      女生拍照: '🌸',
      适合聚餐: '🍲',
    } as Record<string, string>
  )[name] ?? '🌿'
}

/** 记录卡（导出供复用）：封面 + 时间 chip + 多图角标 + 地点/区域 + 评分 + 标签行。 */
export function EntryCard({
  entry,
  tagNames,
  onPress,
}: {
  entry: GalleryEntry
  tagNames: string[]
  onPress: () => void
}) {
  const { palette } = useTheme()
  const styles = useMemo(() => makeStyles(palette), [palette])
  const visibleTags = tagNames.filter(Boolean).slice(0, 2)
  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
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
        {visibleTags.length > 0 ? (
          <View style={styles.tagRow}>
            {visibleTags.map((name) => (
              <View key={name} style={styles.tagChip}>
                <Text style={styles.tagChipText} numberOfLines={1}>
                  {name}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </Pressable>
  )
}

/** 地点卡：封面取最近一条记录，标「去过 N 次」。 */
export function PlaceCard({ group, onPress }: { group: PlaceGroup; onPress: () => void }) {
  const { palette } = useTheme()
  const styles = useMemo(() => makeStyles(palette), [palette])
  const cover = group.entries[0]
  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
    >
      <View style={styles.coverWrap}>
        {cover.coverThumbPath ? (
          <Image source={{ uri: cover.coverThumbPath }} style={styles.placeCover} contentFit="cover" />
        ) : (
          <View style={[styles.placeCover, styles.coverEmpty]}>
            <Text style={styles.coverEmptyText}>📍</Text>
          </View>
        )}
        <View style={styles.timeChip}>
          <Text style={styles.timeChipText}>去过 {group.visitCount} 次</Text>
        </View>
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.placeName} numberOfLines={1}>
          {group.placeName}
        </Text>
        <Text style={styles.placeArea} numberOfLines={1}>
          📍 {group.placeArea ?? '未填区域'}
        </Text>
        <View style={styles.cardFooter}>
          <Stars value={group.bestRating} size={13} />
          <SyncBadge status={cover.syncStatus} />
        </View>
      </View>
    </Pressable>
  )
}

// 调色板对象按主题稳定（`PALETTES` 常量），故按 palette 缓存 StyleSheet，
// 卡片每次渲染不再重建样式表。
const styleCache = new Map<Palette, ReturnType<typeof buildStyles>>()

function makeStyles(c: Palette) {
  let cached = styleCache.get(c)
  if (!cached) {
    cached = buildStyles(c)
    styleCache.set(c, cached)
  }
  return cached
}

function buildStyles(c: Palette) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: c.paper },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 4,
    },
    topText: { fontSize: 13, color: c.inkMuted },
    tagsButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, backgroundColor: c.cardDeep },
    tagsButtonText: { fontSize: 13, fontWeight: '700', color: c.ink },
    chipScroll: { flexGrow: 0 },
    chipRow: { gap: 8, paddingHorizontal: 16, paddingVertical: 6 },
    chip: {
      minHeight: 34,
      paddingHorizontal: 14,
      borderRadius: 17,
      borderWidth: 1,
      borderColor: c.line,
      backgroundColor: c.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chipActive: { backgroundColor: c.terra, borderColor: c.terra },
    chipText: { fontSize: 13, color: c.inkMuted },
    chipTextActive: { color: c.white, fontWeight: '700' },
    viewRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingBottom: 4 },
    viewLabel: { fontSize: 13, color: c.inkMuted },
    list: { padding: 12, gap: 12 },
    row: { gap: 12 },
    card: {
      flex: 1,
      backgroundColor: c.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.line,
      overflow: 'hidden',
    },
    cardPressed: { opacity: 0.9 },
    coverWrap: { position: 'relative' },
    cover: { width: '100%', aspectRatio: 4 / 5, backgroundColor: c.cardDeep },
    placeCover: { width: '100%', aspectRatio: 1, backgroundColor: c.cardDeep },
    coverEmpty: { alignItems: 'center', justifyContent: 'center' },
    coverEmptyText: { fontSize: 34 },
    timeChip: {
      position: 'absolute',
      top: 8,
      left: 8,
      backgroundColor: c.card,
      borderRadius: 10,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    timeChipText: { fontSize: 11, color: c.ink },
    countChip: {
      position: 'absolute',
      bottom: 8,
      right: 8,
      backgroundColor: 'rgba(0,0,0,0.45)',
      borderRadius: 10,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    countChipText: { fontSize: 11, color: c.white },
    cardBody: { padding: 10, gap: 3 },
    placeName: { fontSize: 15, fontWeight: '700', color: c.ink },
    placeArea: { fontSize: 12, color: c.inkMuted },
    cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, gap: 6 },
    tagRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
    tagChip: {
      flexShrink: 1,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 10,
      backgroundColor: c.cardDeep,
    },
    tagChipText: { fontSize: 11, color: c.inkMuted },
  })
}
