// Gallery（对标 Web `src/pages/Gallery.tsx`）：顶部场景筛选 chips + 「按记录 / 按地点」双视图
// + 「双栏网格 / 单栏清单」双密度（偏好落本机 meta，默认双栏）。
//   - 按记录：封面卡（网格）或清单行（单栏）＋ 店名 + 区域 + 评分 + 标签行，点进记录详情（`/entry/{id}`）；
//   - 按地点：地点卡（封面 + 去过 N 次），点卡片进地点页（`/place/{id}`）；
// 数据全部读本地 SQLite；含空态/加载态/错误态。配色随主题。
//
// 性能（TASK-UX-01 第 4 项）：
//   - 列表必须有 `flex: 1` 边界：否则 Yoga 会按整份内容的假设高度参与列布局，既拖慢布局，
//     也会把上方的 chips 行挤到重叠（见 `galleryLayout.ts` 的 chipScroll 注释）；
//   - 卡片 `memo` + 回调 `useCallback` 且只传 id，避免父级任何一次 setState 都把已挂载卡片全量重渲染；
//   - FlatList 窗口化调参 + `removeClippedSubviews`，图片 `recyclingKey`/`cachePolicy` 让 Android 复用视图与磁盘缓存。
//
// 顶栏跟随滚动（TASK-UX-02）：标题/场景 chips/浏览·布局切换整块挂到 `ListHeaderComponent`，
//   - 上滑时顶栏随内容一起滚出视野，下拉回到顶，把竖向空间全留给图片；
//   - 不做吸顶（不用 `stickyHeaderIndices`），顶栏是普通列表头；
//   - 空态/错误态走 ScrollView 同款结构，保证两种状态下顶栏位置一致；
//   - 切单双栏/筛选只改数据与 `key`，顶栏节点本身不搬家，状态照旧生效（切布局会重挂列表 → 回到顶部）。

import { memo, useCallback, useMemo, useRef, useState } from 'react'
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Image } from 'expo-image'
import { router, useFocusEffect } from 'expo-router'

import { getAppRepository } from '@/db/app'
import { EmptyState, ErrorState, LoadingState, Stars, SyncBadge } from '@/components/ui'
import {
  entriesSignature,
  expandTagIds,
  filterEntriesByAnyTag,
  groupEntriesByPlace,
  listGalleryEntries,
  listTagsGrouped,
  tagGroupsSignature,
  type GalleryEntry,
  type PlaceGroup,
  type TagGroup,
} from '@/features/queries'
import {
  galleryChipScrollStyle,
  galleryListKey,
  galleryListTuning,
  GALLERY_LAYOUTS,
  GALLERY_LIST_PADDING,
  loadGalleryLayout,
  parseGalleryLayout,
  saveGalleryLayout,
  type GalleryLayout,
} from '@/features/galleryLayout'
import { relativeDayChip } from '@/features/format'
import { useTheme } from '@/themeProvider'
import type { Palette } from '@/theme'

type ViewMode = 'entry' | 'place'

/** 冷启动读回上次布局；本机库不可用时回默认（与 themeProvider 同口径，0 副作用）。 */
function initialLayout(): GalleryLayout {
  try {
    const { db } = getAppRepository()
    return loadGalleryLayout(db)
  } catch {
    return parseGalleryLayout(undefined)
  }
}

export default function GalleryScreen() {
  const { palette } = useTheme()
  const styles = useMemo(() => makeStyles(palette), [palette])

  const [entries, setEntries] = useState<GalleryEntry[]>([])
  const [tagGroups, setTagGroups] = useState<TagGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<ViewMode>('entry')
  const [layout, setLayout] = useState<GalleryLayout>(initialLayout)
  const [sceneId, setSceneId] = useState<string | null>(null)

  // focus 每次都会重查 SQLite，重查必然造出全新数组、卡片 memo 全部失效。
  // 先比内容指纹：没变就保留旧引用（不进 setState），memo 才真正省下切 Tab 回来的整列重渲染。
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

  // 回调只带 id：卡片 `memo` 才真正生效（内联箭头每次渲染都是新函数）。
  const openEntry = useCallback((id: string) => router.push(`/entry/${id}`), [])
  const openPlace = useCallback((placeId: string) => router.push(`/place/${placeId}`), [])
  const toggleScene = useCallback((id: string) => setSceneId((cur) => (cur === id ? null : id)), [])

  // 布局偏好：先改本地态（立即生效），再落 meta；落库失败只影响下次冷启动。
  const changeLayout = useCallback((next: GalleryLayout) => {
    const parsed = parseGalleryLayout(next)
    setLayout(parsed)
    try {
      const { db } = getAppRepository()
      saveGalleryLayout(db, parsed)
    } catch {
      // 忽略：本次切换已生效。
    }
  }, [])

  const renderEntry = useCallback(
    ({ item }: { item: GalleryEntry }) =>
      layout === 'grid' ? (
        <EntryCard entry={item} tagNameOf={tagNameOf} onPress={openEntry} />
      ) : (
        <EntryRow entry={item} tagNameOf={tagNameOf} onPress={openEntry} />
      ),
    [layout, tagNameOf, openEntry],
  )

  const renderPlace = useCallback(
    ({ item }: { item: PlaceGroup }) =>
      layout === 'grid' ? (
        <PlaceCard group={item} onPress={openPlace} />
      ) : (
        <PlaceRow group={item} onPress={openPlace} />
      ),
    [layout, openPlace],
  )

  // 顶栏整块（标题 + 场景 chips + 浏览/布局）＝列表的 Header：随列表一起滚走，不吸顶。
  // 元素按依赖重算即可（无内部状态，重算只重建轻量 JSX，卡片 memo 不受影响）。
  const listHeader = useMemo(
    () => (
      <View style={styles.headerBlock}>
        <View style={styles.topBar}>
          <Text style={styles.topText}>
            {sceneId || filtered.length !== entries.length
              ? `共 ${filtered.length} / ${entries.length} 条记录`
              : `共 ${entries.length} 条记录`}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/tags')}
            style={styles.tagsButton}
            hitSlop={8}
          >
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
                  onPress={() => toggleScene(tag.id)}
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

        {/* 浏览 / 布局两组合并成一行，放不下就整组换行 —— 不叠不挤。 */}
        <View style={styles.viewRow}>
          <View style={styles.viewGroup}>
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
          <View style={styles.viewGroup}>
            <Text style={styles.viewLabel}>布局：</Text>
            {GALLERY_LAYOUTS.map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel={item.id === 'grid' ? '双栏网格' : '单栏清单'}
                accessibilityState={{ selected: layout === item.id }}
                onPress={() => changeLayout(item.id)}
                style={[styles.chip, layout === item.id && styles.chipActive]}
              >
                <Text style={[styles.chipText, layout === item.id && styles.chipTextActive]}>
                  {item.icon} {item.name}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    ),
    [sceneTags, sceneId, toggleScene, mode, layout, changeLayout, entries.length, filtered.length, styles],
  )

  if (loading) return <LoadingState text="正在读取本机记录…" />

  const tuning = galleryListTuning(layout)

  // 空态/错误态没有可滚的列表数据，但顶栏同样挂在滚动容器里，位置与列表态一致。
  if (error || filtered.length === 0) {
    return (
      <ScrollView style={styles.flex} contentContainerStyle={[styles.list, styles.stateContent]}>
        {listHeader}
        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : (
          <EmptyState
            icon="📍"
            title="还没有记录"
            hint="点底部「记录」拍下第一个地方吧。"
            actionLabel="去记录"
            onAction={() => router.push('/record')}
          />
        )}
      </ScrollView>
    )
  }

  return (
    <View style={styles.flex}>
      {mode === 'entry' ? (
        <FlatList
          // numColumns 不支持热切换：换布局必须换 key 强制重挂（RN 硬性要求）。
          key={galleryListKey('entry', layout)}
          data={filtered}
          keyExtractor={entryKeyOf}
          renderItem={renderEntry}
          ListHeaderComponent={listHeader}
          numColumns={tuning.numColumns}
          columnWrapperStyle={layout === 'grid' ? styles.row : undefined}
          initialNumToRender={tuning.initialNumToRender}
          maxToRenderPerBatch={tuning.maxToRenderPerBatch}
          windowSize={tuning.windowSize}
          removeClippedSubviews={tuning.removeClippedSubviews}
          updateCellsBatchingPeriod={tuning.updateCellsBatchingPeriod}
          contentContainerStyle={styles.list}
          style={styles.listFlex}
        />
      ) : (
        <FlatList
          key={galleryListKey('place', layout)}
          data={placeGroups}
          keyExtractor={placeKeyOf}
          renderItem={renderPlace}
          ListHeaderComponent={listHeader}
          numColumns={tuning.numColumns}
          columnWrapperStyle={layout === 'grid' ? styles.row : undefined}
          initialNumToRender={tuning.initialNumToRender}
          maxToRenderPerBatch={tuning.maxToRenderPerBatch}
          windowSize={tuning.windowSize}
          removeClippedSubviews={tuning.removeClippedSubviews}
          updateCellsBatchingPeriod={tuning.updateCellsBatchingPeriod}
          contentContainerStyle={styles.list}
          style={styles.listFlex}
        />
      )}
    </View>
  )
}

const entryKeyOf = (item: GalleryEntry) => item.id
const placeKeyOf = (item: PlaceGroup) => item.placeId

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

/** 卡片 ↔ 清单行共用：取前 N 个标签名（回调稳定，故用 id 现场换名）。 */
function tagNamesOf(tagIds: string[], tagNameOf: (id: string) => string, max: number): string[] {
  return tagIds.map(tagNameOf).filter(Boolean).slice(0, max)
}

// 不随主题变化的占位图样式（`Thumb` 在卡片外，取不到主题样式）。
const stylesStatic = StyleSheet.create({
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
})

function Thumb({
  uri,
  recyclingKey,
  style,
}: {
  uri: string
  recyclingKey: string
  style: object
}) {
  if (!uri) {
    return (
      <View style={[style, stylesStatic.thumbPlaceholder]}>
        <Text>📍</Text>
      </View>
    )
  }
  return (
    <Image
      source={{ uri }}
      style={style}
      contentFit="cover"
      // 列表滚动复用 + 磁盘缓存：换 Tab 回来不再重新下载/解码。
      recyclingKey={recyclingKey}
      cachePolicy="memory-disk"
    />
  )
}

/** 记录卡（双栏网格）：封面 + 时间 chip + 多图角标 + 地点/区域 + 评分 + 标签行。 */
export const EntryCard = memo(function EntryCard({
  entry,
  tagNameOf,
  onPress,
}: {
  entry: GalleryEntry
  tagNameOf: (id: string) => string
  onPress: (id: string) => void
}) {
  const { palette } = useTheme()
  const styles = useMemo(() => makeStyles(palette), [palette])
  const visibleTags = tagNamesOf(entry.tagIds, tagNameOf, 2)
  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={() => onPress(entry.id)}
    >
      <View style={styles.coverWrap}>
        <Thumb uri={entry.coverThumbPath ?? ''} recyclingKey={entry.id} style={styles.cover} />
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
})

/** 记录行（单栏清单，样式对齐 Find 的清单行）：缩略图 + 地点 + 区域/时间 + 评分 + 标签。 */
export const EntryRow = memo(function EntryRow({
  entry,
  tagNameOf,
  onPress,
}: {
  entry: GalleryEntry
  tagNameOf: (id: string) => string
  onPress: (id: string) => void
}) {
  const { palette } = useTheme()
  const styles = useMemo(() => makeStyles(palette), [palette])
  const visibleTags = tagNamesOf(entry.tagIds, tagNameOf, 3)
  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [styles.rowCard, pressed && styles.cardPressed]}
      onPress={() => onPress(entry.id)}
    >
      <Thumb uri={entry.coverThumbPath ?? ''} recyclingKey={`row-${entry.id}`} style={styles.rowThumb} />
      <View style={styles.rowBody}>
        <Text style={styles.placeName} numberOfLines={1}>
          {entry.placeName}
        </Text>
        <Text style={styles.placeArea} numberOfLines={1}>
          📍 {entry.placeArea ?? '未填区域'} · {relativeDayChip(entry.visitDate)}
          {entry.mediaCount > 1 ? ` · ${entry.mediaCount} 张` : ''}
        </Text>
        <View style={styles.cardFooter}>
          <Stars value={entry.rating} size={12} />
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
})

/** 地点卡（双栏网格）：封面取最近一条记录，标「去过 N 次」。 */
export const PlaceCard = memo(function PlaceCard({
  group,
  onPress,
}: {
  group: PlaceGroup
  onPress: (placeId: string) => void
}) {
  const { palette } = useTheme()
  const styles = useMemo(() => makeStyles(palette), [palette])
  const cover = group.entries[0]
  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={() => onPress(group.placeId)}
    >
      <View style={styles.coverWrap}>
        <Thumb uri={cover.coverThumbPath ?? ''} recyclingKey={group.placeId} style={styles.placeCover} />
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
})

/** 地点行（单栏清单）：缩略图 + 地点 + 区域 + 去过 N 次 + 评分 + 最近到访。 */
export const PlaceRow = memo(function PlaceRow({
  group,
  onPress,
}: {
  group: PlaceGroup
  onPress: (placeId: string) => void
}) {
  const { palette } = useTheme()
  const styles = useMemo(() => makeStyles(palette), [palette])
  const cover = group.entries[0]
  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [styles.rowCard, pressed && styles.cardPressed]}
      onPress={() => onPress(group.placeId)}
    >
      <Thumb uri={cover.coverThumbPath ?? ''} recyclingKey={`row-${group.placeId}`} style={styles.rowThumb} />
      <View style={styles.rowBody}>
        <Text style={styles.placeName} numberOfLines={1}>
          {group.placeName}
        </Text>
        <Text style={styles.placeArea} numberOfLines={1}>
          📍 {group.placeArea ?? '未填区域'}
        </Text>
        <View style={styles.cardFooter}>
          <Stars value={group.bestRating} size={12} />
          <Text style={styles.rowMeta}>
            去过 {group.visitCount} 次 · {relativeDayChip(group.lastVisitDate)}
          </Text>
        </View>
      </View>
    </Pressable>
  )
})

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
    // 顶栏挂在列表 Header 里（TASK-UX-02）：用负 margin 抵掉列表左右内衬 12，
    // 顶栏各行仍按自己的 paddingHorizontal 16 对齐屏幕边缘（几何与改造前一致，
    // chips 横向也能滚到屏幕最边）。
    headerBlock: { marginHorizontal: -GALLERY_LIST_PADDING },
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
    // flexShrink: 0 + 高度下限：横向 ScrollView 自带 flexShrink: 1，不锁死会被挤到
    // 内容高度以下，chips 直接盖住下方浏览行（本次重叠的根因，见 galleryLayout.ts）。
    // 顶栏进列表 Header 后这层保险留着无副作用（Header 单元格是自动高度）。
    chipScroll: { ...galleryChipScrollStyle },
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
    // 放不下就整组换行（flexWrap + rowGap），不叠不挤。
    viewRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      rowGap: 8,
      paddingHorizontal: 16,
      paddingTop: 4,
      paddingBottom: 6,
    },
    viewGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    viewLabel: { fontSize: 13, color: c.inkMuted },
    // 列表要有边界：无 flex 时 Yoga 按整份内容高度参与列布局，既慢又会挤压上方行。
    listFlex: { flex: 1 },
    // paddingTop 归零：顶栏是列表第一个孩子，顶部留白交给 topBar 自己的 paddingTop 12
    // （保留 12 会在顶栏上方多出一段空白，且与改造前的观感不一致）。
    list: { padding: GALLERY_LIST_PADDING, paddingTop: 0, gap: 12 },
    // 空态/错误态的滚动容器：撑满余下高度，滚动观感与列表态统一。
    stateContent: { flexGrow: 1 },
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
    // 单栏清单行（对齐 Find 的清单行：72 缩略图 + 正文）。
    rowCard: {
      flexDirection: 'row',
      gap: 12,
      alignItems: 'center',
      backgroundColor: c.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.line,
      padding: 12,
    },
    rowThumb: { width: 72, height: 72, borderRadius: 10, backgroundColor: c.cardDeep },
    rowBody: { flex: 1, gap: 3 },
    rowMeta: { fontSize: 12, color: c.inkMuted, flexShrink: 1 },
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
