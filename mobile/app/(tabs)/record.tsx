// Record：完整记录表单（地点 + 日期 + 评分 + 预算 + 私密感受 + 公开理由 + 标签多选 + 媒体链）。
// 全程本地：媒体先复制进持久目录，再与记录、outbox 一起落 SQLite；不接网络。

import { useCallback, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Image } from 'expo-image'
import { router, useFocusEffect } from 'expo-router'

import { getAppRepository } from '@/db/app'
import { newUuid } from '@/domain/ids'
import {
  createExpoMediaPicker,
  MediaPickerError,
  type MediaPicker,
  type PickedAsset,
} from '@/media/picker'
import { createExpoMediaFileSystem } from '@/media/localFiles'
import { createExpoImageProcessor } from '@/media/processImage'
import { persistPickedMedia } from '@/media/mediaService'
import { AppButton, Card, Chip, ErrorState, SectionTitle, Stars, TextField } from '@/components/ui'
import { leafTags, toggleTagId, validateRecordForm } from '@/features/form'
import { listPlaceOptions, listTagsGrouped, type PlaceOption, type TagGroup } from '@/features/queries'
import { todayIso, parseOptionalBudget } from '@/features/format'
import { saveRecord } from '@/features/recordActions'
import { colors } from '@/theme'

const MAX_PHOTOS = 9

export default function RecordScreen() {
  const [places, setPlaces] = useState<PlaceOption[]>([])
  const [tagGroups, setTagGroups] = useState<TagGroup[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)

  const [placeId, setPlaceId] = useState<string | null>(null)
  const [placeQuery, setPlaceQuery] = useState('')
  const [newMode, setNewMode] = useState(false)
  const [newName, setNewName] = useState('')
  const [newArea, setNewArea] = useState('')

  const [visitDate, setVisitDate] = useState(todayIso())
  const [rating, setRating] = useState<number | undefined>(undefined)
  const [budget, setBudget] = useState('')
  const [notePrivate, setNotePrivate] = useState('')
  const [notePublic, setNotePublic] = useState('')
  const [tagIds, setTagIds] = useState<string[]>([])

  const [assets, setAssets] = useState<PickedAsset[]>([])
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedEntryId, setSavedEntryId] = useState<string | null>(null)

  const pickerRef = useRef<MediaPicker | null>(null)
  const getPicker = useCallback(() => {
    if (!pickerRef.current) pickerRef.current = createExpoMediaPicker()
    return pickerRef.current
  }, [])

  const load = useCallback(() => {
    try {
      const { db } = getAppRepository()
      setPlaces(listPlaceOptions(db))
      setTagGroups(listTagsGrouped(db))
      setLoadError(null)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      load()
    }, [load]),
  )

  // T045：Activity 被回收后恢复丢失的 picker 结果（只补媒体，不影响表单字段）。
  // 每次会话只尝试一次，避免每次回到本页重复恢复同一批 pending 结果。
  const recoveredRef = useRef(false)
  useFocusEffect(
    useCallback(() => {
      if (recoveredRef.current) return
      recoveredRef.current = true
      let cancelled = false
      void (async () => {
        try {
          const recovered = await getPicker().recoverPending()
          if (!cancelled && recovered.length > 0) {
            setAssets((prev) => [...prev, ...recovered].slice(0, MAX_PHOTOS))
            setMessage(`已恢复 ${recovered.length} 张待保存照片。`)
          }
        } catch {
          // 恢复失败不打扰用户，可手动重选。
        }
      })()
      return () => {
        cancelled = true
      }
    }, [getPicker]),
  )

  const pick = useCallback(
    async (source: 'library' | 'camera') => {
      if (saving) return
      try {
        const picker = getPicker()
        setMessage(source === 'camera' ? '正在打开相机…' : '正在打开相册…')
        const picked = source === 'camera' ? await picker.pickFromCamera() : await picker.pickFromLibrary()
        if (picked.length === 0) {
          setMessage('已取消，未选择图片。')
          return
        }
        setAssets((prev) => [...prev, ...picked].slice(0, MAX_PHOTOS))
        setMessage(`已加入 ${picked.length} 张，保存时写入本机。`)
      } catch (error) {
        const detail = error instanceof MediaPickerError ? `${error.code}: ${error.message}` : String(error)
        setMessage(`图片选择失败：${detail}。可继续用文字记录。`)
      }
    },
    [getPicker, saving],
  )

  const resetForm = useCallback(() => {
    setPlaceId(null)
    setPlaceQuery('')
    setNewMode(false)
    setNewName('')
    setNewArea('')
    setVisitDate(todayIso())
    setRating(undefined)
    setBudget('')
    setNotePrivate('')
    setNotePublic('')
    setTagIds([])
    setAssets([])
    setSavedEntryId(null)
  }, [])

  // 设为封面：把点中的照片移到第一位（首图即封面，与 Web 一致）。
  const setCover = useCallback((index: number) => {
    setAssets((prev) => {
      if (index <= 0 || index >= prev.length) return prev
      const next = [...prev]
      const [picked] = next.splice(index, 1)
      next.unshift(picked)
      return next
    })
  }, [])

  const handleSave = useCallback(async () => {
    if (saving) return
    const validation = validateRecordForm({
      placeId: placeId ?? undefined,
      newPlaceName: newMode ? newName : undefined,
      visitDate,
      tagIds,
    })
    if (validation) {
      setMessage(validation)
      return
    }
    setSaving(true)
    setMessage('正在保存…')
    const { db, repo } = getAppRepository()
    try {
      const result = saveRecord(db, repo, {
        placeId: placeId ?? undefined,
        newPlace: newMode ? { name: newName, area: newArea } : undefined,
        visitDate,
        rating,
        budget: parseOptionalBudget(budget),
        notePrivate,
        notePublic,
        tagIds,
      })

      let mediaWarning = ''
      if (assets.length > 0) {
        try {
          await persistPickedMedia(
            { fs: createExpoMediaFileSystem(), images: createExpoImageProcessor(), newId: newUuid },
            repo,
            { assets, entryId: result.entryId, placeId: result.placeId, dependsOn: [result.entryOpId] },
          )
        } catch (error) {
          mediaWarning = `文字已保存，但图片处理失败：${error instanceof Error ? error.message : String(error)}。`
        }
      }

      resetForm()
      if (mediaWarning) {
        setSavedEntryId(result.entryId)
        setMessage(`${mediaWarning} 可在记录详情查看已保存内容。`)
      } else {
        router.replace(`/entry/${result.entryId}`)
      }
    } catch (error) {
      setMessage(`保存失败：${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setSaving(false)
    }
  }, [assets, budget, newArea, newMode, newName, notePrivate, notePublic, placeId, rating, resetForm, saving, tagIds, visitDate])

  if (loadError) return <ErrorState message={loadError} onRetry={load} />

  const candidates = placeQuery.trim()
    ? places.filter((p) => `${p.name}${p.area ?? ''}`.includes(placeQuery.trim())).slice(0, 6)
    : places.slice(0, 6)
  const selectedPlace = places.find((p) => p.id === placeId)
  const selectableTags = leafTags(tagGroups)

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      {message ? <Text style={styles.message}>{message}</Text> : null}

      {/* 照片置顶（对标 Web Record）：拍照/多选 → 缩略图 → 点非首图设为封面 */}
      <Card style={styles.section}>
        <SectionTitle right={<Text style={styles.muted}>{assets.length}/{MAX_PHOTOS}</Text>}>照片（第一张为封面）</SectionTitle>
        <View style={styles.photoGrid}>
          {assets.map((asset, index) => (
            <View key={`${asset.uri}-${index}`} style={styles.photoWrap}>
              <Pressable
                accessibilityRole={index === 0 ? 'image' : 'button'}
                accessibilityLabel={index === 0 ? '封面照片' : '设为封面'}
                disabled={index === 0}
                onPress={() => setCover(index)}
              >
                <Image source={{ uri: asset.uri }} style={styles.photo} contentFit="cover" />
              </Pressable>
              {index === 0 ? (
                <Text style={styles.coverTag}>封面</Text>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="设为封面"
                  onPress={() => setCover(index)}
                  style={styles.setCoverButton}
                  hitSlop={6}
                >
                  <Text style={styles.setCoverText}>设为封面</Text>
                </Pressable>
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="移除照片"
                onPress={() => setAssets((prev) => prev.filter((_, i) => i !== index))}
                style={styles.removeButton}
                hitSlop={8}
              >
                <Text style={styles.removeText}>✕</Text>
              </Pressable>
            </View>
          ))}
        </View>
        <View style={styles.photoActions}>
          <AppButton label="选择照片" variant="secondary" onPress={() => pick('library')} style={styles.grow} />
          <AppButton label="拍照" variant="secondary" onPress={() => pick('camera')} style={styles.grow} />
          {saving ? <ActivityIndicator color={colors.terra} /> : null}
        </View>
      </Card>

      <Card style={styles.section}>
        <SectionTitle>地点</SectionTitle>
        {newMode ? (
          <View style={styles.stack}>
            <TextField label="地点名称" value={newName} onChangeText={setNewName} placeholder="如：西海岸日落咖啡" />
            <TextField label="区域" value={newArea} onChangeText={setNewArea} placeholder="如：海口 · 西海岸" />
            <Pressable onPress={() => setNewMode(false)} hitSlop={8}>
              <Text style={styles.link}>← 从已有地点选择</Text>
            </Pressable>
          </View>
        ) : selectedPlace ? (
          <View style={styles.stack}>
            <Text style={styles.selectedPlace}>
              📍 {selectedPlace.name}
              {selectedPlace.area ? ` · ${selectedPlace.area}` : ''}
            </Text>
            <Pressable onPress={() => setPlaceId(null)} hitSlop={8}>
              <Text style={styles.link}>重新选择</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.stack}>
            <TextField
              value={placeQuery}
              onChangeText={setPlaceQuery}
              placeholder="搜索或选择地点"
            />
            <View style={styles.chipWrap}>
              {candidates.map((p) => (
                <Chip key={p.id} label={p.name} onPress={() => setPlaceId(p.id)} />
              ))}
              <Chip label="＋ 新地点" onPress={() => setNewMode(true)} />
            </View>
          </View>
        )}
      </Card>

      <Card style={styles.section}>
        <SectionTitle>日期与评分</SectionTitle>
        <View style={styles.stack}>
          <View style={styles.inlineRow}>
            <View style={styles.grow}>
              <TextField label="到访日期（YYYY-MM-DD）" value={visitDate} onChangeText={setVisitDate} placeholder="2026-09-18" />
            </View>
            <Chip label="今天" onPress={() => setVisitDate(todayIso())} />
          </View>
          <View style={styles.ratingRow}>
            <Text style={styles.ratingLabel}>评分</Text>
            <Stars value={rating} editable size={28} onChange={setRating} />
          </View>
          <TextField
            label="预算（人均元，可空）"
            value={budget}
            onChangeText={setBudget}
            keyboardType="number-pad"
            placeholder="如：45"
          />
        </View>
      </Card>

      <Card style={styles.section}>
        <SectionTitle>感受与公开理由</SectionTitle>
        <View style={styles.stack}>
          <TextField
            label="私密感受（仅自己可见）"
            value={notePrivate}
            onChangeText={setNotePrivate}
            placeholder="用微信语音输入法直接说…"
            multiline
            minHeight={120}
          />
          <TextField
            label="公开分享理由（分享时展示，可空）"
            value={notePublic}
            onChangeText={setNotePublic}
            placeholder="如：夜景超美，适合拍照，人均也不贵…"
            multiline
            minHeight={80}
          />
        </View>
      </Card>

      <Card style={styles.section}>
        <SectionTitle right={<Text style={styles.muted}>已选 {tagIds.length}</Text>}>标签</SectionTitle>
        {selectableTags.length === 0 ? (
          <Text style={styles.muted}>还没有标签，可到「标签」页新建。</Text>
        ) : (
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
        )}
      </Card>

      <Card style={styles.section}>
        <SectionTitle>AI 整理</SectionTitle>
        <Text style={styles.muted}>
          V1 移动端暂不接真模型（需 AI Key ＋ 后续 Task），organise 保持本地占位；可先进去体验占位整理。
        </Text>
        <AppButton label="进入 AI 整理（占位）" variant="secondary" onPress={() => router.push('/ai-confirm')} />
      </Card>

      <AppButton label={saving ? '保存中…' : '保存记录'} onPress={handleSave} loading={saving} />
      {savedEntryId ? (
        <AppButton label="查看已保存记录" variant="ghost" onPress={() => router.push(`/entry/${savedEntryId}`)} />
      ) : null}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  // screen 供 ScrollView 铺底；grow 只留给子元素撑满（按钮），不带背景，避免盖掉 variant 底色。
  screen: { flex: 1, backgroundColor: colors.paper },
  grow: { flex: 1 },
  container: { padding: 16, gap: 14, paddingBottom: 48 },
  section: { gap: 12 },
  stack: { gap: 10 },
  message: { fontSize: 13, color: colors.terraDeep, lineHeight: 20 },
  link: { fontSize: 13, color: colors.terraDeep },
  selectedPlace: { fontSize: 15, fontWeight: '700', color: colors.ink },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  inlineRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ratingLabel: { fontSize: 13, fontWeight: '700', color: colors.ink },
  muted: { fontSize: 12, color: colors.inkMuted },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoWrap: { position: 'relative' },
  photo: { width: 88, height: 110, borderRadius: 10, backgroundColor: colors.cardDeep },
  coverTag: {
    position: 'absolute',
    top: 4,
    left: 4,
    backgroundColor: colors.terra,
    color: colors.white,
    fontSize: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  setCoverButton: {
    position: 'absolute',
    top: 4,
    left: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  setCoverText: { color: colors.white, fontSize: 10 },
  removeButton: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: { color: colors.white, fontSize: 12, lineHeight: 14 },
  photoActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
})
