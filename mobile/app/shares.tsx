// ShareList：本地分享快照列表（创建入口在记录详情）。只读本地库，撤销只改本地 + 入队。

import { useCallback, useState } from 'react'
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'

import { getAppRepository } from '@/db/app'
import { AppButton, ConfirmDialog, EmptyState, ErrorState, LoadingState } from '@/components/ui'
import { formatDateTime } from '@/features/format'
import { listShareSnapshots, type ShareSnapshotSummary } from '@/features/queries'
import { revokeShare } from '@/features/shares'
import { colors } from '@/theme'

const KIND_LABEL: Record<ShareSnapshotSummary['kind'], string> = {
  single: '单条',
  list: '合集',
}

export default function SharesScreen() {
  const [rows, setRows] = useState<ShareSnapshotSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [pendingRevoke, setPendingRevoke] = useState<ShareSnapshotSummary | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    try {
      const { db } = getAppRepository()
      setRows(listShareSnapshots(db))
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

  const doRevoke = useCallback(() => {
    if (!pendingRevoke || busy) return
    setBusy(true)
    try {
      const { db, repo } = getAppRepository()
      const result = revokeShare(db, repo, { slug: pendingRevoke.slug })
      setMessage(result.changed ? '已撤销；公开链接将在下次同步成功后失效。' : '该分享已经是撤销状态。')
    } catch (err) {
      setMessage(`撤销失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setPendingRevoke(null)
      setBusy(false)
      load()
    }
  }, [busy, load, pendingRevoke])

  if (loading) return <LoadingState text="正在读取本地分享…" />
  if (error) return <ErrorState message={error} onRetry={load} />

  return (
    <>
      <FlatList
        style={styles.flex}
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.container}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.headerTitle}>本地分享快照</Text>
            <Text style={styles.hint}>
              分享在记录详情页生成，先存本机并入同步队列；登录同步后公开链接才生效。
            </Text>
            {message ? <Text style={styles.message}>{message}</Text> : null}
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="🔗"
            title="还没有分享"
            hint="打开一条记录，点「分享这条记录」生成快照。"
            actionLabel="去画廊"
            onAction={() => router.push('/')}
          />
        }
        renderItem={({ item }) => {
          const revoked = item.status === 'revoked'
          return (
            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}
              onPress={() => router.push(`/share/${item.slug}`)}
            >
              <View style={styles.rowBetween}>
                <Text style={styles.title} numberOfLines={1}>
                  {item.title}
                </Text>
                <View style={[styles.badge, revoked ? styles.badgeRevoked : styles.badgeActive]}>
                  <Text style={[styles.badgeText, revoked ? styles.badgeTextRevoked : styles.badgeTextActive]}>
                    {revoked ? '已撤销' : '有效'}
                  </Text>
                </View>
              </View>
              <Text style={styles.muted}>
                {KIND_LABEL[item.kind]} · {item.itemCount} 项 · {formatDateTime(item.createdAt)}
              </Text>
              <Text style={styles.slug} numberOfLines={1}>
                {item.slug}
              </Text>
              {!revoked ? (
                <AppButton
                  label="撤销分享"
                  variant="secondary"
                  onPress={() => setPendingRevoke(item)}
                  disabled={busy}
                />
              ) : null}
            </Pressable>
          )
        }}
      />

      <ConfirmDialog
        visible={pendingRevoke !== null}
        title="撤销这条分享？"
        message="撤销后公开链接将失效；本地记录与照片不受影响。"
        confirmLabel="确认撤销"
        danger
        onCancel={() => setPendingRevoke(null)}
        onConfirm={doRevoke}
      />
    </>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.paper },
  container: { padding: 16, gap: 12, paddingBottom: 48 },
  header: { gap: 6, marginBottom: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.ink },
  hint: { fontSize: 12, color: colors.inkMuted, lineHeight: 18 },
  message: { fontSize: 12, color: colors.terraDeep, lineHeight: 18 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    gap: 8,
  },
  pressed: { opacity: 0.9 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { fontSize: 16, fontWeight: '700', color: colors.ink, flexShrink: 1 },
  muted: { fontSize: 12, color: colors.inkMuted },
  slug: { fontSize: 11, color: colors.inkMuted },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  badgeActive: { backgroundColor: colors.mossSoft },
  badgeRevoked: { backgroundColor: colors.cardDeep },
  badgeText: { fontSize: 11, fontWeight: '700' },
  badgeTextActive: { color: colors.moss },
  badgeTextRevoked: { color: colors.inkMuted },
})
