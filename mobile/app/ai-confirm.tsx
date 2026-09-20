// AI Confirm：调用 organise 占位整理，超时/失败则跳过并继续手工保存。
// 全程本地（V1 移动端禁网络）；建议字段全部可改，确认后才落库。

import { useCallback, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'

import { getAppRepository } from '@/db/app'
import { AppButton, Card, Chip, ErrorState, SectionTitle, Stars, TextField } from '@/components/ui'
import { leafTags, toggleTagId } from '@/features/form'
import { listPlaceOptions, listTagsGrouped, type PlaceOption, type TagGroup } from '@/features/queries'
import { parseOptionalBudget, todayIso } from '@/features/format'
import { runOrganise } from '@/features/organise'
import { saveRecord } from '@/features/recordActions'
import { colors } from '@/theme'

type Phase = 'input' | 'organising' | 'review' | 'skipped'

export default function AiConfirmScreen() {
  const [places, setPlaces] = useState<PlaceOption[]>([])
  const [tagGroups, setTagGroups] = useState<TagGroup[]>([])

  const [phase, setPhase] = useState<Phase>('input')
  const [statusMessage, setStatusMessage] = useState('填写私密感受后点「AI 整理」；超时会自动跳过，不阻断保存。')

  const [placeId, setPlaceId] = useState<string | null>(null)
  const [newPlaceName, setNewPlaceName] = useState('')
  const [newPlaceArea, setNewPlaceArea] = useState('')
  const [visitDate, setVisitDate] = useState(todayIso())
  const [transcript, setTranscript] = useState('')
  const [rating, setRating] = useState<number | undefined>(undefined)
  const [budget, setBudget] = useState('')
  const [summary, setSummary] = useState('')
  const [tagIds, setTagIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
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

  const organiser = useCallback(async () => {
    setPhase('organising')
    setStatusMessage('AI 思考中，一般几秒；超时会先跳过。')
    const options = tagGroups.flatMap((group) => group.tags).map((tag) => ({ id: tag.id, name: tag.name }))
    const result = await runOrganise(
      { transcript, placeName: newPlaceName, tags: options },
      { timeoutMs: 8000 },
    )
    if (result.status === 'ok') {
      const suggestion = result.suggestion
      if (suggestion.rating != null) setRating(suggestion.rating)
      if (suggestion.budget != null) setBudget(String(suggestion.budget))
      if (suggestion.summary) setSummary(suggestion.summary)
      if (suggestion.matchedTags.length > 0) setTagIds((ids) => [...new Set([...ids, ...suggestion.matchedTags])])
      setStatusMessage(suggestion.mock ? '本地占位整理完成（未联网），请逐项确认修改后保存。' : 'AI 整理完成，请逐项确认修改后保存。')
      setPhase('review')
      return
    }
    setStatusMessage(result.status === 'timeout' ? 'AI 整理超时，已跳过；继续手工保存。' : '暂无文字或整理失败，已跳过；继续手工保存。')
    setPhase('skipped')
  }, [newPlaceName, tagGroups, transcript])

  const save = useCallback(() => {
    if (saving) return
    setSaving(true)
    try {
      const { db, repo } = getAppRepository()
      const result = saveRecord(db, repo, {
        placeId: placeId ?? undefined,
        newPlace: placeId ? undefined : { name: newPlaceName, area: newPlaceArea },
        visitDate,
        rating,
        budget: parseOptionalBudget(budget),
        notePrivate: transcript,
        summary,
        tagIds,
      })
      router.replace(`/entry/${result.entryId}`)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }, [budget, newPlaceArea, newPlaceName, placeId, rating, saving, summary, tagIds, transcript, visitDate])

  const selectableTags = leafTags(tagGroups)
  const busy = phase === 'organising'

  if (loadError) return <ErrorState message={loadError} onRetry={load} />

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      {message ? <Text style={styles.error}>{message}</Text> : null}
      <Text style={styles.status}>{statusMessage}</Text>

      <Card style={styles.section}>
        <SectionTitle>地点</SectionTitle>
        <View style={styles.chipWrap}>
          {places.map((p) => (
            <Chip key={p.id} label={p.name} active={placeId === p.id} onPress={() => setPlaceId(p.id)} />
          ))}
        </View>
        {!placeId ? (
          <>
            <TextField label="或新建地点" value={newPlaceName} onChangeText={setNewPlaceName} placeholder="地点名称" />
            <TextField label="区域（可空）" value={newPlaceArea} onChangeText={setNewPlaceArea} placeholder="如：海口 · 西海岸" />
          </>
        ) : null}
        <TextField label="到访日期（YYYY-MM-DD）" value={visitDate} onChangeText={setVisitDate} />
      </Card>

      <Card style={styles.section}>
        <SectionTitle>私密感受</SectionTitle>
        <TextField
          value={transcript}
          onChangeText={setTranscript}
          placeholder="用微信语音输入法直接说…"
          multiline
          minHeight={140}
        />
        <AppButton
          label={phase === 'organising' ? '整理中…' : phase === 'input' ? 'AI 整理' : '重新整理'}
          onPress={organiser}
          disabled={busy || !transcript.trim()}
        />
      </Card>

      {phase !== 'input' ? (
        <Card style={styles.section}>
          <SectionTitle right={<Text style={styles.muted}>可逐项修改</Text>}>整理结果</SectionTitle>
          <View style={styles.ratingRow}>
            <Text style={styles.fieldHint}>评分</Text>
            <Stars value={rating} editable size={26} onChange={setRating} />
          </View>
          <TextField label="预算（人均元）" value={budget} onChangeText={setBudget} keyboardType="number-pad" placeholder="—" />
          <TextField label="一句摘要" value={summary} onChangeText={setSummary} placeholder="如：夜晚舒服、适合拍照的平价咖啡厅" />
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
        </Card>
      ) : null}

      <AppButton label={saving ? '保存中…' : '确认保存'} onPress={save} loading={saving} disabled={busy} />
      <AppButton label="返回" variant="ghost" onPress={() => router.back()} />
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
  fieldHint: { fontSize: 13, fontWeight: '700', color: colors.ink },
  ratingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
})
