// ShareSingle：单条分享快照详情（本地段）。只读本机快照，渲染白名单字段；
// 匿名公开页与真云发布留 T062，本页不发任何网络请求。

import { useCallback, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { Image } from 'expo-image'
import { useFocusEffect, useLocalSearchParams } from 'expo-router'

import { getAppRepository } from '@/db/app'
import { AppButton, Card, Chip, ConfirmDialog, EmptyState, ErrorState, LoadingState, SectionTitle, Stars } from '@/components/ui'
import { formatDateTime, truncate } from '@/features/format'
import { getShareSnapshotBySlug, type ShareSnapshotDetail } from '@/features/queries'
import { revokeShare } from '@/features/shares'
import { colors } from '@/theme'

export default function ShareSingleScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  const [detail, setDetail] = useState<ShareSnapshotDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [confirmRevoke, setConfirmRevoke] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    try {
      const { db } = getAppRepository()
      setDetail(getShareSnapshotBySlug(db, slug))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [slug])

  useFocusEffect(
    useCallback(() => {
      load()
    }, [load]),
  )

  const doRevoke = useCallback(() => {
    if (busy) return
    setBusy(true)
    try {
      const { db, repo } = getAppRepository()
      const result = revokeShare(db, repo, { slug })
      setMessage(result.changed ? '已撤销；公开链接将在下次同步成功后失效。' : '该分享已经是撤销状态。')
    } catch (err) {
      setMessage(`撤销失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setConfirmRevoke(false)
      setBusy(false)
      load()
    }
  }, [busy, load, slug])

  if (loading) return <LoadingState text="正在读取本地快照…" />
  if (error) return <ErrorState message={error} onRetry={load} />
  if (!detail) return <EmptyState icon="🔗" title="分享不存在" hint="它可能已在本机删除。" />

  const { snapshot, items } = detail
  const revoked = snapshot.status === 'revoked'

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      <Card style={styles.section}>
        <View style={styles.rowBetween}>
          <Text style={styles.title}>{snapshot.title}</Text>
          <View style={[styles.badge, revoked ? styles.badgeRevoked : styles.badgeActive]}>
            <Text style={[styles.badgeText, revoked ? styles.badgeTextRevoked : styles.badgeTextActive]}>
              {revoked ? '已撤销' : '有效'}
            </Text>
          </View>
        </View>
        <Text style={styles.muted}>
          {snapshot.kind === 'single' ? '单条分享' : '合集分享'} · {snapshot.itemCount} 项 ·{' '}
          {formatDateTime(snapshot.createdAt)}
        </Text>
        {snapshot.ownerName ? <Text style={styles.muted}>分享人：{snapshot.ownerName}</Text> : null}
        <Text style={styles.slug}>slug：{snapshot.slug}</Text>
        <Text style={styles.hint}>
          本页只读本机快照，展示匿名访客可见的白名单字段（地点名/区域/星级/预算/公开理由/标签/封面）。
          公开页面与真云发布将在登录同步后生效。
        </Text>
        {message ? <Text style={styles.message}>{message}</Text> : null}
        {!revoked ? (
          <AppButton label="撤销分享" variant="danger" onPress={() => setConfirmRevoke(true)} disabled={busy} />
        ) : null}
      </Card>

      {items.map((item) => (
        <Card key={item.clientId} style={styles.section}>
          <View style={styles.itemRow}>
            {item.coverUri ? (
              <Image source={{ uri: item.coverUri }} style={styles.cover} contentFit="cover" />
            ) : (
              <View style={[styles.cover, styles.coverEmpty]}>
                <Text>📍</Text>
              </View>
            )}
            <View style={styles.itemBody}>
              <Text style={styles.placeName} numberOfLines={1}>
                {item.placeName}
              </Text>
              {item.area ? <Text style={styles.muted}>📍 {item.area}</Text> : null}
              <Stars value={item.rating} size={14} />
              <Text style={styles.muted}>{item.budget != null ? `人均 ¥${item.budget}` : '未填预算'}</Text>
            </View>
          </View>

          <SectionTitle>公开理由</SectionTitle>
          <Text style={styles.body}>{item.reason ? truncate(item.reason, 200) : '（未填写公开理由）'}</Text>

          {item.tags && item.tags.length > 0 ? (
            <View style={styles.chipWrap}>
              {item.tags.map((tag) => (
                <Chip key={tag} label={tag} />
              ))}
            </View>
          ) : null}

          <Text style={styles.localNote}>
            坐标公开精度：{item.coordHidden ? '隐藏' : '约 1km'}（精确坐标与私密感受永不出现在分享内容里）
          </Text>
        </Card>
      ))}

      <ConfirmDialog
        visible={confirmRevoke}
        title="撤销这条分享？"
        message="撤销后公开链接将失效；本地记录与照片不受影响。"
        confirmLabel="确认撤销"
        danger
        onCancel={() => setConfirmRevoke(false)}
        onConfirm={doRevoke}
      />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.paper },
  container: { padding: 16, gap: 14, paddingBottom: 48 },
  section: { gap: 8 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { fontSize: 18, fontWeight: '700', color: colors.ink, flexShrink: 1 },
  muted: { fontSize: 12, color: colors.inkMuted },
  slug: { fontSize: 11, color: colors.inkMuted },
  hint: { fontSize: 12, color: colors.inkMuted, lineHeight: 18 },
  message: { fontSize: 12, color: colors.terraDeep, lineHeight: 18 },
  itemRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  itemBody: { flex: 1, gap: 3 },
  placeName: { fontSize: 16, fontWeight: '700', color: colors.ink },
  cover: { width: 84, height: 84, borderRadius: 12, backgroundColor: colors.cardDeep },
  coverEmpty: { alignItems: 'center', justifyContent: 'center' },
  body: { fontSize: 15, color: colors.ink, lineHeight: 22 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  localNote: { fontSize: 11, color: colors.inkMuted, lineHeight: 17 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  badgeActive: { backgroundColor: colors.mossSoft },
  badgeRevoked: { backgroundColor: colors.cardDeep },
  badgeText: { fontSize: 11, fontWeight: '700' },
  badgeTextActive: { color: colors.moss },
  badgeTextRevoked: { color: colors.inkMuted },
})
