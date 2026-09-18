// Conflicts：未裁决冲突列表 + 双向裁决（采用云端 / 保留本地）。裁决调已实现的 resolveConflict。

import { useCallback, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'

import { getAppRepository } from '@/db/app'
import { AppButton, Card, EmptyState, ErrorState, LoadingState, SectionTitle } from '@/components/ui'
import { resolveConflict, type ConflictRow } from '@/sync/conflicts'
import { describeConflict, listOpenConflictRows } from '@/features/status'
import { formatDateTime, truncate } from '@/features/format'
import { colors } from '@/theme'

export default function ConflictsScreen() {
  const [rows, setRows] = useState<ConflictRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [message, setMessage] = useState('')

  const load = useCallback(() => {
    try {
      const { db } = getAppRepository()
      setRows(listOpenConflictRows(db))
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

  const resolve = useCallback(
    (row: ConflictRow, choice: 'take_remote' | 'keep_local') => {
      if (busyId != null) return
      setBusyId(row.id)
      setMessage('')
      try {
        const { db } = getAppRepository()
        const result = resolveConflict(db, row.id, choice)
        if (!result.ok) {
          setMessage(result.error ?? '裁决失败')
        } else {
          setMessage(choice === 'take_remote' ? '已采用云端版本。' : '已保留本地版本，联网后重新同步。')
        }
        load()
      } catch (err) {
        setMessage(err instanceof Error ? err.message : String(err))
      } finally {
        setBusyId(null)
      }
    },
    [busyId, load],
  )

  if (loading) return <LoadingState text="正在读取冲突…" />
  if (error) return <ErrorState message={error} onRetry={load} />

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {rows.length === 0 ? (
        <EmptyState icon="✅" title="没有待裁决的冲突" hint="本机与云端不一致时会自动出现在这里。" />
      ) : (
        rows.map((row) => {
          const { title, kindLabel } = describeConflict(row)
          const canMerge = row.entity_kind === 'entry' || row.entity_kind === 'place'
          return (
            <Card key={row.id} style={styles.section}>
              <SectionTitle right={<Text style={styles.meta}>{formatDateTime(row.created_at)}</Text>}>{title}</SectionTitle>
              <Text style={styles.meta}>
                {kindLabel} · 期望 revision {row.expected_revision ?? '—'}
              </Text>
              <View style={styles.sides}>
                <View style={styles.side}>
                  <Text style={styles.sideLabel}>本机版本</Text>
                  <Text style={styles.sideText}>{summarize(row.local_snapshot, '（本机已无此记录）')}</Text>
                </View>
                <View style={styles.side}>
                  <Text style={styles.sideLabel}>云端版本</Text>
                  <Text style={styles.sideText}>{summarize(row.remote_snapshot, '（云端已删除）')}</Text>
                </View>
              </View>
              <View style={styles.actions}>
                <AppButton
                  label={busyId === row.id ? '处理中…' : '采用云端'}
                  variant="secondary"
                  disabled={busyId != null}
                  onPress={() => resolve(row, 'take_remote')}
                  style={styles.flex}
                />
                <AppButton
                  label="保留本地"
                  disabled={busyId != null}
                  onPress={() => resolve(row, 'keep_local')}
                  style={styles.flex}
                />
              </View>
              {canMerge ? (
                <Pressable
                  onPress={() => router.push(`/${row.entity_kind === 'place' ? 'place' : 'entry'}/${row.entity_id}`)}
                  hitSlop={8}
                >
                  <Text style={styles.mergeLink}>先手动合并 ›</Text>
                </Pressable>
              ) : null}
            </Card>
          )
        })
      )}
    </ScrollView>
  )
}

function summarize(snapshot: string | null, fallback: string): string {
  if (!snapshot) return fallback
  try {
    const parsed = JSON.parse(snapshot) as Record<string, unknown>
    const parts: string[] = []
    if (typeof parsed.name === 'string') parts.push(parsed.name)
    if (typeof parsed.visit_date === 'string') parts.push(String(parsed.visit_date))
    if (typeof parsed.note_public === 'string') parts.push(truncate(String(parsed.note_public), 40))
    if (typeof parsed.summary === 'string') parts.push(truncate(String(parsed.summary), 40))
    if (typeof parsed.note_private === 'string' && parsed.note_private.trim()) parts.push('🔒 私密感受')
    if (typeof parsed.rating === 'number') parts.push(`${parsed.rating} 星`)
    return parts.length > 0 ? parts.join(' · ') : '（无可展示字段）'
  } catch {
    return fallback
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  container: { padding: 16, gap: 14, paddingBottom: 48 },
  section: { gap: 10 },
  message: { fontSize: 13, color: colors.terraDeep },
  meta: { fontSize: 12, color: colors.inkMuted },
  sides: { flexDirection: 'row', gap: 10 },
  side: { flex: 1, backgroundColor: colors.cardDeep, borderRadius: 10, padding: 10, gap: 4 },
  sideLabel: { fontSize: 12, color: colors.inkMuted },
  sideText: { fontSize: 13, color: colors.ink, lineHeight: 18 },
  actions: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
  mergeLink: { fontSize: 13, color: colors.terraDeep, textAlign: 'center' },
})
