// AI Confirm：整理结果的确认页（对标 Web `src/pages/AiConfirm.tsx`）。
//
// 两条入口：
//   1) 记录页「交给 AI 整理 →」带来的内存草稿（`features/draft.ts`）：进页即自动整理；
//      取不到草稿（进程被杀 / 直接进页）自动回退独立输入表单，不阻断；
//   2) 独立输入：手填感受后点「AI 整理」。
// 整理器由 `runOrganise` → `createDefaultOrganiser` 决定：配了 `EXPO_PUBLIC_AI_API_BASE`
// 就是真网 `/api/ai-organize`（Key 只在服务端），否则/超时/失败一律回退本地推测并明确标注。
//
// 三件套分流（TASK-PWA-01）：整理后感受（清洗版，仅自己可见）与公开分享理由（分享时展示）
// 分两框，用户自填优先、AI 版兜底，两块互不混淆；未命中建议词只在用户点击时才建标签。

import { useCallback, useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Image } from 'expo-image'
import { router, useFocusEffect } from 'expo-router'

import { getAppRepository } from '@/db/app'
import { newUuid } from '@/domain/ids'
import { createExpoMediaFileSystem } from '@/media/localFiles'
import { createExpoImageProcessor } from '@/media/processImage'
import { persistPickedMedia } from '@/media/mediaService'
import { AppButton, Card, Chip, ErrorState, SectionTitle, Stars, TextField } from '@/components/ui'
import { clearDraft, markDraftSaved, takeDraft, type RecordDraft } from '@/features/draft'
import { leafTags, toggleTagId, validateRecordForm } from '@/features/form'
import { listPlaceOptions, listTagsGrouped, type PlaceOption, type TagGroup } from '@/features/queries'
import { parseOptionalBudget, todayIso } from '@/features/format'
import { AI_API_TIMEOUT_MS, runOrganise, type OrganiseSuggestion } from '@/features/organise'
import { createTagNamed, saveRecord } from '@/features/recordActions'
import { colors } from '@/theme'

type Phase = 'input' | 'organising' | 'review' | 'skipped'

export default function AiConfirmScreen() {
  // 进页那一刻读一次记录页草稿（惰性初始化，只跑一次）；读不到 = 独立输入模式。
  const [draft] = useState<RecordDraft | null>(takeDraft)

  const [places, setPlaces] = useState<PlaceOption[]>([])
  const [tagGroups, setTagGroups] = useState<TagGroup[]>([])

  const [phase, setPhase] = useState<Phase>(() => (draft ? 'organising' : 'input'))
  const [statusMessage, setStatusMessage] = useState(() =>
    draft
      ? '正在按记录页带来的草稿整理，通常几秒；超时或未联网会退回本地推测，不阻断保存。'
      : '可从记录页「交给 AI 整理」带草稿进来，也可以在这里直接填感受后点「AI 整理」。',
  )
  /** 当前结果是否本地推测（未联网/未配置/超时降级）——UI 必须明确标注。 */
  const [aiLocal, setAiLocal] = useState(false)

  const [placeId, setPlaceId] = useState<string | null>(draft?.placeId ?? null)
  const [newPlaceName, setNewPlaceName] = useState(draft?.newPlace?.name ?? '')
  const [newPlaceArea, setNewPlaceArea] = useState(draft?.newPlace?.area ?? '')
  const [visitDate, setVisitDate] = useState(draft?.visitDate || todayIso())
  const [notePrivate, setNotePrivate] = useState(draft?.notePrivate ?? '')
  const [notePublic, setNotePublic] = useState(draft?.notePublic ?? '')
  const [rating, setRating] = useState<number | undefined>(draft?.rating)
  const [budget, setBudget] = useState(draft?.budget != null ? String(draft.budget) : '')
  const [summary, setSummary] = useState('')
  const [tagIds, setTagIds] = useState<string[]>(draft?.tagIds ?? [])
  const [unmatched, setUnmatched] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [creatingTag, setCreatingTag] = useState(false)
  const [message, setMessage] = useState('')
  const [loadError, setLoadError] = useState<string | null>(null)

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

  /** 把一次整理结果铺到可编辑字段上（感受与公开理由分两路，用户自填优先）。 */
  const applySuggestion = useCallback((suggestion: OrganiseSuggestion, fallbackText: string) => {
    setAiLocal(suggestion.mock)
    if (suggestion.rating != null) setRating(suggestion.rating)
    if (suggestion.budget != null) setBudget(String(suggestion.budget))
    if (suggestion.summary) setSummary(suggestion.summary)
    // 整理后感受：以清洗版为初始值，无清洗版就回退原文，用户可改
    setNotePrivate((prev) => suggestion.cleanedTranscript || prev || fallbackText)
    // 公开理由：用户自己填过就保留，没填才用 AI 版兜底（记录页没填时 summary 也由 AI 兜底）
    const aiReason = suggestion.publicReason
    setNotePublic((prev) => (prev.trim() ? prev : aiReason))
    if (suggestion.matchedTags.length > 0) setTagIds((ids) => [...new Set([...ids, ...suggestion.matchedTags])])
    setUnmatched(suggestion.unmatched)
    setStatusMessage(
      suggestion.mock
        ? '本地推测整理完成（本机未联网或未配置 AI），请逐项确认修改后保存。'
        : 'AI 整理完成（已联网），请逐项确认修改后保存。',
    )
    setPhase('review')
  }, [])

  const organise = useCallback(
    async (transcript: string, place: { placeName?: string; area?: string }) => {
      const text = transcript.trim()
      if (!text) {
        setAiLocal(true)
        setPhase('skipped')
        setStatusMessage('没有感受文字，跳过 AI 整理；继续手工补全后保存即可。')
        return
      }
      setPhase('organising')
      setStatusMessage('AI 思考中，一般几秒；超时或未联网会退回本地推测，不阻断保存。')
      try {
        const { db } = getAppRepository()
        const groups = listTagsGrouped(db)
        setTagGroups(groups)
        const options = groups.flatMap((group) =>
          group.tags.map((tag) => ({ id: tag.id, name: tag.name, dimension: group.dimension.name })),
        )
        const result = await runOrganise(
          { transcript: text, placeName: place.placeName, area: place.area, tags: options },
          { timeoutMs: AI_API_TIMEOUT_MS },
        )
        if (result.status === 'ok') {
          applySuggestion(result.suggestion, text)
          return
        }
        setAiLocal(true)
        setPhase('skipped')
        setStatusMessage(
          result.status === 'timeout'
            ? 'AI 整理超时，已跳过；感受原样保留，继续手工保存即可。'
            : 'AI 整理失败，已跳过；感受原样保留，继续手工保存即可。',
        )
      } catch (err) {
        // 整理链路任何异常都不阻断：保留原文进手工保存。
        setAiLocal(true)
        setPhase('skipped')
        setStatusMessage(`AI 整理异常（${err instanceof Error ? err.message : String(err)}），已跳过；继续手工保存即可。`)
      }
    },
    [applySuggestion],
  )

  // 草稿模式：进页自动整理一次（地点名优先用库里的既有地点名做上下文）。
  useEffect(() => {
    if (!draft) return
    void (async () => {
      let placeName = draft.newPlace?.name
      let area = draft.newPlace?.area
      if (draft.placeId) {
        try {
          const { db } = getAppRepository()
          const row = db.getFirstSync<{ name: string; area: string | null }>(
            'SELECT name, area FROM places WHERE id = ?',
            draft.placeId,
          )
          if (row) {
            placeName = row.name
            area = row.area ?? undefined
          }
        } catch {
          // 取名失败不影响整理（只是少了地点上下文）
        }
      }
      await organise(draft.notePrivate ?? '', { placeName, area })
    })()
  }, [draft, organise])

  /** 当前地点上下文：选中既有地点时取其 name/area，否则用新地点输入；作为 AI 整理的地点上下文透传。 */
  const placeContext = useCallback(
    (): { placeName?: string; area?: string } => {
      if (placeId) {
        const selected = places.find((p) => p.id === placeId)
        if (selected) return { placeName: selected.name, area: selected.area }
      }
      return { placeName: newPlaceName || undefined, area: newPlaceArea || undefined }
    },
    [placeId, places, newPlaceName, newPlaceArea],
  )

  // AI 不得自动建标签：用户点「加入场景」才建（对标 Web addUnmatchedTag）。
  const addUnmatchedTag = useCallback((name: string) => {
    setCreatingTag(true)
    try {
      const { db, repo } = getAppRepository()
      const created = createTagNamed(db, repo, { name })
      setTagGroups(listTagsGrouped(db))
      setTagIds((ids) => (ids.includes(created.id) ? ids : [...ids, created.id]))
      setUnmatched((list) => list.filter((item) => item !== name))
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err))
    } finally {
      setCreatingTag(false)
    }
  }, [])

  const save = useCallback(async () => {
    if (saving) return
    const validation = validateRecordForm({
      placeId: placeId ?? undefined,
      newPlaceName: placeId ? undefined : newPlaceName,
      visitDate,
      tagIds,
    })
    if (validation) {
      setMessage(validation)
      return
    }
    setSaving(true)
    setMessage('')
    try {
      const { db, repo } = getAppRepository()
      const result = saveRecord(db, repo, {
        placeId: placeId ?? undefined,
        newPlace: placeId ? undefined : { name: newPlaceName, area: newPlaceArea },
        visitDate,
        rating,
        budget: parseOptionalBudget(budget),
        notePrivate,
        notePublic,
        summary,
        tagIds,
      })

      let mediaWarning = ''
      if (draft && draft.assets.length > 0) {
        try {
          await persistPickedMedia(
            { fs: createExpoMediaFileSystem(), images: createExpoImageProcessor(), newId: newUuid },
            repo,
            { assets: draft.assets, entryId: result.entryId, placeId: result.placeId, dependsOn: [result.entryOpId] },
          )
        } catch (error) {
          mediaWarning = `文字已保存，但图片处理失败：${error instanceof Error ? error.message : String(error)}。`
        }
      }

      clearDraft()
      // 记录页在 tab 栈里常驻：置位保存信号，让它回到前台时复位表单，防止重复保存。
      markDraftSaved()
      if (mediaWarning) setMessage(`${mediaWarning} 可在记录详情查看已保存内容。`)
      router.replace(`/entry/${result.entryId}`)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }, [budget, draft, newPlaceArea, newPlaceName, notePrivate, notePublic, placeId, rating, saving, summary, tagIds, visitDate])

  const selectableTags = leafTags(tagGroups)
  const busy = phase === 'organising'
  const showResult = phase === 'review' || phase === 'skipped'

  if (loadError) return <ErrorState message={loadError} onRetry={load} />

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      {message ? <Text style={styles.error}>{message}</Text> : null}
      <Text style={styles.status}>{statusMessage}</Text>
      {aiLocal && phase === 'review' ? (
        <View style={styles.localNotice}>
          <Text style={styles.localNoticeText}>
            本地推测结果（本机未联网、未配置 AI，或服务端整理失败），不是模型输出；请逐项确认修改后再保存。
          </Text>
        </View>
      ) : null}

      <Card style={styles.section}>
        <SectionTitle
          right={draft ? <Text style={styles.muted}>{draft.assets.length} 张照片随保存一起入库</Text> : undefined}
        >
          地点与日期
        </SectionTitle>
        {draft && draft.assets.length > 0 ? (
          <View style={styles.draftRow}>
            <Image source={{ uri: draft.assets[0].uri }} style={styles.cover} contentFit="cover" />
            <Text style={styles.muted}>第一张为封面；照片在「确认保存」时才写入本机。</Text>
          </View>
        ) : null}
        <View style={styles.chipWrap}>
          {places.map((p) => (
            <Chip
              key={p.id}
              label={p.name}
              active={placeId === p.id}
              onPress={() => {
                setPlaceId(p.id)
                setNewPlaceName('')
                setNewPlaceArea('')
              }}
            />
          ))}
          <Chip
            label="＋ 新地点"
            active={placeId === null}
            onPress={() => {
              setPlaceId(null)
            }}
          />
        </View>
        {!placeId ? (
          <>
            <TextField label="新地点名称" value={newPlaceName} onChangeText={setNewPlaceName} placeholder="地点名称" />
            <TextField
              label="区域（可空）"
              value={newPlaceArea}
              onChangeText={setNewPlaceArea}
              placeholder="如：海口 · 西海岸"
            />
          </>
        ) : null}
        <TextField label="到访日期（YYYY-MM-DD）" value={visitDate} onChangeText={setVisitDate} />
      </Card>

      {phase === 'input' ? (
        <Card style={styles.section}>
          <SectionTitle right={<Text style={styles.muted}>仅自己可见</Text>}>私密感受</SectionTitle>
          <TextField
            value={notePrivate}
            onChangeText={setNotePrivate}
            placeholder="用微信语音输入法直接说…"
            multiline
            minHeight={140}
          />
          <AppButton
            label="AI 整理"
            onPress={() => void organise(notePrivate, placeContext())}
            disabled={!notePrivate.trim()}
          />
        </Card>
      ) : null}

      {busy ? (
        <Card style={styles.section}>
          <Text style={styles.muted}>整理中…通常几秒；超时会退回本地推测，不阻断保存。</Text>
        </Card>
      ) : null}

      {showResult ? (
        <>
          <Card style={styles.section}>
            <SectionTitle right={<Text style={styles.muted}>仅自己可见</Text>}>📝 整理后感受</SectionTitle>
            <TextField
              value={notePrivate}
              onChangeText={setNotePrivate}
              placeholder="AI 会去掉口水词、补上标点，原意不动；不满意就直接改"
              multiline
              minHeight={130}
            />
            <SectionTitle right={<Text style={styles.muted}>分享时展示</Text>}>💬 公开分享理由</SectionTitle>
            <TextField
              value={notePublic}
              onChangeText={setNotePublic}
              placeholder="写给朋友看的 2-3 句，可随意改；留空则分享时不展示"
              multiline
              minHeight={80}
            />
            <Text style={styles.muted}>记录页没填的话，这里预填的是 AI 按你的感受总结的版本；两块互不混淆。</Text>
          </Card>

          <Card style={styles.section}>
            <SectionTitle right={<Text style={styles.muted}>可逐项修改</Text>}>其他字段</SectionTitle>
            <View style={styles.ratingRow}>
              <Text style={styles.fieldHint}>评分</Text>
              <Stars value={rating} editable size={26} onChange={setRating} />
            </View>
            <TextField
              label="预算（人均元）"
              value={budget}
              onChangeText={setBudget}
              keyboardType="number-pad"
              placeholder="—"
            />
            <TextField
              label="一句摘要（列表展示）"
              value={summary}
              onChangeText={setSummary}
              placeholder="如：夜晚舒服、适合拍照的平价咖啡厅"
            />
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
            {unmatched.length > 0 ? (
              <View style={styles.unmatchedBlock}>
                <Text style={styles.fieldHint}>没找到匹配标签（点一下才建，AI 不会自动建）</Text>
                {unmatched.map((name) => (
                  <View key={name} style={styles.unmatchedRow}>
                    <Text style={styles.muted}>「{name}」</Text>
                    <View style={styles.unmatchedActions}>
                      <Chip label="加入场景" onPress={() => addUnmatchedTag(name)} disabled={creatingTag} />
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`暂不添加 ${name}`}
                        onPress={() => setUnmatched((list) => list.filter((item) => item !== name))}
                        hitSlop={6}
                      >
                        <Text style={styles.link}>暂不添加</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
          </Card>
        </>
      ) : null}

      <AppButton label={saving ? '保存中…' : '确认保存'} onPress={() => void save()} loading={saving} disabled={busy} />
      {phase === 'skipped' ? (
        <AppButton
          label="重新整理"
          variant="ghost"
          onPress={() => void organise(notePrivate, placeContext())}
          disabled={!notePrivate.trim()}
        />
      ) : null}
      <AppButton label="返回修改" variant="ghost" onPress={() => router.back()} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.paper },
  container: { padding: 16, gap: 14, paddingBottom: 48 },
  section: { gap: 12 },
  status: { fontSize: 13, color: colors.terraDeep, lineHeight: 20 },
  error: { fontSize: 13, color: colors.danger },
  muted: { fontSize: 12, color: colors.inkMuted },
  link: { fontSize: 13, color: colors.terraDeep },
  fieldHint: { fontSize: 13, fontWeight: '700', color: colors.ink },
  ratingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  localNotice: { backgroundColor: colors.terraSoft, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  localNoticeText: { fontSize: 12, color: colors.terraDeep, lineHeight: 18 },
  draftRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cover: { width: 64, height: 64, borderRadius: 12, backgroundColor: colors.cardDeep },
  unmatchedBlock: { gap: 8, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10 },
  unmatchedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  unmatchedActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
})
