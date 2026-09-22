// Find（对标 Web `src/pages/Find.tsx`）：自然语言搜索 + 结构化筛选；结果可切「画廊 / 清单」；
// 清单视图可勾选多个地点 → 建分享清单。
//   - 自然语言（预算 / N 星以上 / 标签名）走 `parseQuery`，与结构化 chips 叠加；
//   - 命中按地点聚合（量词＝私藏地点数），点结果进地点页；全部本地过滤。
// 配色随主题。
//
// 性能（TASK-UX-01 第 4 项）：列表补 flex 边界 + 窗口化调参；行/卡 `memo` 且回调只传 id，
// 图片带 `recyclingKey`/`cachePolicy`，避免切 Tab 回来整列表重渲染 + 重新解码。

import { memo, useCallback, useMemo, useRef, useState } from 'react'
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Image } from 'expo-image'
import { router, useFocusEffect } from 'expo-router'

import { getAppRepository } from '@/db/app'
import { AppButton, Chip, EmptyState, ErrorState, LoadingState, Sheet, Stars, TextField } from '@/components/ui'
import {
  entriesSignature,
  listGalleryEntries,
  listTagsGrouped,
  ratingTierCounts,
  tagGroupsSignature,
  type GalleryEntry,
  type TagGroup,
} from '@/features/queries'
import { flattenTags, matchEntries, parseQuery, type Hit } from '@/features/search'
import { createListShare } from '@/features/shares'
import { useTheme } from '@/themeProvider'
import type { Palette } from '@/theme'

type ViewMode = 'list' | 'gallery'

/** 结果列表窗口化调参（默认 windowSize 21 = 21 屏，配合图片解码明显吃内存/掉帧）。 */
const RESULT_LIST_TUNING = {
  initialNumToRender: 8,
  maxToRenderPerBatch: 8,
  windowSize: 5,
  removeClippedSubviews: true,
  updateCellsBatchingPeriod: 50,
} as const

export default function FindScreen() {
  const { palette } = useTheme()
  const styles = useMemo(() => makeStyles(palette), [palette])

  const [tagGroups, setTagGroups] = useState<TagGroup[]>([])
  const [entries, setEntries] = useState<GalleryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [pickedTags, setPickedTags] = useState<string[]>([])
  const [minRating, setMinRating] = useState<number | null>(null)
  const [view, setView] = useState<ViewMode>('list')
  const [picked, setPicked] = useState<string[]>([])
  const [listOpen, setListOpen] = useState(false)
  const [listTitle, setListTitle] = useState('')
  const [message, setMessage] = useState('')

  // 同画廊：focus 重查内容未变就保留旧引用，行/卡 memo 才真正生效。
  const signatureRef = useRef({ entries: '', tagGroups: '' })

  const load = useCallback(() => {
    try {
      const { db } = getAppRepository()
      const nextEntries = listGalleryEntries(db)
      const entriesSig = entriesSignature(nextEntries)
      if (entriesSig !== signatureRef.current.entries) {
        signatureRef.current.entries = entriesSig
        setEntries(nextEntries)
      }
      const nextTagGroups = listTagsGrouped(db)
      const tagGroupsSig = tagGroupsSignature(nextTagGroups)
      if (tagGroupsSig !== signatureRef.current.tagGroups) {
        signatureRef.current.tagGroups = tagGroupsSig
        setTagGroups(nextTagGroups)
      }
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

  const { tags, kindOf } = useMemo(() => flattenTags(tagGroups), [tagGroups])
  const tagNameOf = useMemo(() => {
    const map = new Map(tags.map((t) => [t.id, t.name]))
    return (id: string) => map.get(id) ?? id
  }, [tags])

  const parsed = useMemo(() => parseQuery(query, tags, kindOf), [query, tags, kindOf])

  const hits = useMemo(() => {
    const base = matchEntries(parsed, entries, tags)
    let out = base
    // 标签 chips = 独立交集过滤（与自然语言结果叠加，对标 Web Find）。
    if (pickedTags.length) out = out.filter((h) => pickedTags.every((id) => h.best.tagIds.includes(id)))
    if (minRating != null) out = out.filter((h) => (h.best.rating ?? 0) >= minRating)
    return out
  }, [parsed, entries, tags, pickedTags, minRating])

  const tierCounts = useMemo(() => ratingTierCounts(entries), [entries])
  const recordCount = useMemo(() => hits.reduce((sum, h) => sum + h.entries.length, 0), [hits])

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

  const parsedTags = useMemo(
    () =>
      [
        ...new Set(
          [...parsed.areaTagIds, ...parsed.typeTagIds, ...parsed.sceneTagIds, ...parsed.crowdTagIds]
            .map(tagNameOf)
            .filter(Boolean),
        ),
      ],
    [parsed, tagNameOf],
  )

  const toggleTag = useCallback(
    (id: string) => setPickedTags((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id])),
    [],
  )

  const togglePicked = useCallback(
    (placeId: string) => setPicked((ids) => (ids.includes(placeId) ? ids.filter((x) => x !== placeId) : [...ids, placeId])),
    [],
  )

  // 回调只带 id 且用 useCallback 固化：行/卡 `memo` 才有意义。
  const openPlace = useCallback((placeId: string) => router.push(`/place/${placeId}`), [])
  const renderHitRow = useCallback(
    ({ item }: { item: Hit }) => (
      <HitRow
        hit={item}
        styles={styles}
        picked={picked.includes(item.placeId)}
        onOpen={openPlace}
        onToggle={togglePicked}
      />
    ),
    [styles, picked, openPlace],
  )
  const renderHitCard = useCallback(
    ({ item }: { item: Hit }) => <HitCard hit={item} styles={styles} onPress={openPlace} />,
    [styles, openPlace],
  )

  const makeList = useCallback(() => {
    try {
      const { db, repo } = getAppRepository()
      const entryIds = picked
        .map((placeId) => hits.find((h) => h.placeId === placeId)?.best.id)
        .filter((id): id is string => !!id)
      const snapshot = createListShare(db, repo, { entryIds, title: listTitle.trim() || '我的地点清单' })
      setListOpen(false)
      setPicked([])
      setListTitle('')
      setMessage('')
      router.push(`/share/${snapshot.slug}`)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err))
    }
  }, [hits, listTitle, picked])

  if (loading) return <LoadingState text="正在准备搜索…" />
  if (error) return <ErrorState message={error} onRetry={load} />

  const header = (
    <View style={styles.filters}>
      <TextField value={query} onChangeText={setQuery} placeholder="如：海口，晚上适合聊天的地方" />

      {(parsed.maxBudget != null || parsed.minRating != null || parsedTags.length > 0) && (
        <View style={styles.chipWrap}>
          {parsed.maxBudget != null ? (
            <Chip label={`预算 ≤ ¥${parsed.maxBudget}`} active />
          ) : null}
          {parsed.minRating != null ? <Chip label={`${parsed.minRating} 星以上`} active /> : null}
          {parsedTags.map((name) => (
            <Chip key={name} label={name} active />
          ))}
        </View>
      )}

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
        🌿 找到 {hits.length} 个私藏地点 · 共 {recordCount} 条记录
      </Text>
    </View>
  )

  return (
    <View style={styles.flex}>
      {view === 'list' ? (
        <FlatList
          data={hits}
          keyExtractor={(item) => item.placeId}
          contentContainerStyle={styles.container}
          style={styles.listFlex}
          ListHeaderComponent={header}
          ListEmptyComponent={<EmptyState icon="🔍" title="没有符合条件的地点" hint="换个说法，或清空筛选试试。" />}
          ListFooterComponent={
            picked.length > 1 ? (
              <AppButton label={`🌿 用选中的 ${picked.length} 个地点建清单`} onPress={() => setListOpen(true)} />
            ) : null
          }
          renderItem={renderHitRow}
          {...RESULT_LIST_TUNING}
        />
      ) : (
        <FlatList
          data={hits}
          keyExtractor={(item) => item.placeId}
          numColumns={2}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={styles.container}
          style={styles.listFlex}
          ListHeaderComponent={header}
          ListEmptyComponent={<EmptyState icon="🔍" title="没有符合条件的地点" hint="换个说法，或清空筛选试试。" />}
          renderItem={renderHitCard}
          {...RESULT_LIST_TUNING}
        />
      )}

      {hits.length > 0 ? (
        <View style={styles.viewSwitch}>
          {(['list', 'gallery'] as ViewMode[]).map((v) => (
            <Pressable
              key={v}
              accessibilityRole="button"
              accessibilityState={{ selected: view === v }}
              onPress={() => setView(v)}
              style={[styles.switchButton, view === v && styles.switchButtonActive]}
            >
              <Text style={[styles.switchText, view === v && styles.switchTextActive]}>
                {v === 'list' ? '清单' : '画廊'}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {message ? <Text style={styles.message}>{message}</Text> : null}

      <Sheet open={listOpen} onClose={() => setListOpen(false)} title="保存为常用场景 / 分享清单">
        <TextField label="清单名称" value={listTitle} onChangeText={setListTitle} placeholder="如：海口拍照打卡清单" />
        <AppButton label={`生成分享清单（${picked.length} 个地点）`} onPress={makeList} />
      </Sheet>
    </View>
  )
}

const HitRow = memo(function HitRow({
  hit,
  styles,
  picked,
  onOpen,
  onToggle,
}: {
  hit: Hit
  styles: ReturnType<typeof makeStyles>
  picked: boolean
  onOpen: (placeId: string) => void
  onToggle: (placeId: string) => void
}) {
  return (
    <View style={[styles.resultCard, picked && styles.resultCardPicked]}>
      <Pressable accessibilityRole="button" onPress={() => onOpen(hit.placeId)} style={styles.resultMain}>
        <Thumb hit={hit} styles={styles} size="row" />
        <View style={styles.resultBody}>
          <Text style={styles.placeName} numberOfLines={1}>
            {hit.placeName}
          </Text>
          <Text style={styles.muted} numberOfLines={1}>
            {hit.best.budget != null ? `人均 ¥${hit.best.budget} · ` : ''}
            {hit.best.summary ?? hit.best.notePublic ?? '—'}
          </Text>
          <Stars value={hit.best.rating} size={12} />
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="选择"
        accessibilityState={{ selected: picked }}
        onPress={() => onToggle(hit.placeId)}
        hitSlop={6}
        style={[styles.check, picked && styles.checkOn]}
      >
        <Text style={styles.checkText}>{picked ? '✓' : ''}</Text>
      </Pressable>
    </View>
  )
})

const HitCard = memo(function HitCard({
  hit,
  styles,
  onPress,
}: {
  hit: Hit
  styles: ReturnType<typeof makeStyles>
  onPress: (placeId: string) => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [styles.gridCard, pressed && styles.pressed]}
      onPress={() => onPress(hit.placeId)}
    >
      <Thumb hit={hit} styles={styles} size="grid" />
      <View style={styles.gridBody}>
        <Text style={styles.placeName} numberOfLines={1}>
          {hit.placeName}
        </Text>
        <Stars value={hit.best.rating} size={12} />
      </View>
    </Pressable>
  )
})

function Thumb({
  hit,
  styles,
  size,
}: {
  hit: Hit
  styles: ReturnType<typeof makeStyles>
  size: 'row' | 'grid'
}) {
  const style = size === 'row' ? styles.thumb : styles.gridThumb
  if (hit.best.coverThumbPath) {
    return (
      <Image
        source={{ uri: hit.best.coverThumbPath }}
        style={style}
        contentFit="cover"
        recyclingKey={hit.placeId}
        cachePolicy="memory-disk"
      />
    )
  }
  return (
    <View style={[style, styles.thumbEmpty]}>
      <Text>📍</Text>
    </View>
  )
}

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
    // 列表要有边界，否则 Yoga 按整份结果高度参与列布局（慢且会挤压上方筛选区）。
    listFlex: { flex: 1 },
    container: { padding: 16, gap: 12, paddingBottom: 96 },
    gridRow: { gap: 12 },
    filters: { gap: 10 },
    filterLabel: { fontSize: 12, color: c.inkMuted },
    chipRow: { gap: 8, paddingVertical: 2 },
    chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    tagGroup: { gap: 6 },
    resultCount: { fontSize: 13, color: c.inkMuted, marginTop: 4 },
    resultCard: {
      flexDirection: 'row',
      gap: 12,
      backgroundColor: c.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.line,
      padding: 12,
      alignItems: 'center',
      marginBottom: 12,
    },
    resultCardPicked: { borderColor: c.terra, borderWidth: 2 },
    resultMain: { flexDirection: 'row', gap: 12, alignItems: 'center', flex: 1 },
    pressed: { opacity: 0.9 },
    thumb: { width: 72, height: 72, borderRadius: 10, backgroundColor: c.cardDeep },
    thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
    resultBody: { flex: 1, gap: 3 },
    placeName: { fontSize: 15, fontWeight: '700', color: c.ink },
    muted: { fontSize: 12, color: c.inkMuted },
    check: {
      width: 26,
      height: 26,
      borderRadius: 13,
      borderWidth: 2,
      borderColor: c.line,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkOn: { backgroundColor: c.terra, borderColor: c.terra },
    checkText: { color: c.white, fontSize: 13, fontWeight: '700' },
    gridCard: {
      flex: 1,
      backgroundColor: c.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.line,
      overflow: 'hidden',
    },
    gridThumb: { width: '100%', aspectRatio: 1, backgroundColor: c.cardDeep },
    gridBody: { padding: 10, gap: 4 },
    viewSwitch: { flexDirection: 'row', justifyContent: 'center', gap: 10, paddingVertical: 10 },
    switchButton: {
      paddingHorizontal: 18,
      paddingVertical: 8,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: c.line,
      backgroundColor: c.card,
    },
    switchButtonActive: { backgroundColor: c.terra, borderColor: c.terra },
    switchText: { fontSize: 13, color: c.inkMuted },
    switchTextActive: { color: c.white, fontWeight: '700' },
    message: { position: 'absolute', left: 16, right: 16, bottom: 60, fontSize: 13, color: c.terraDeep },
  })
}
