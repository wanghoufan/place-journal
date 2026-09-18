// Mine：登录入口 + 同步状态（成功/待传/失败/停放原文）+ 冲突入口。只读本地，登录为用户主动操作。

import { useCallback, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'

import { getAppRepository } from '@/db/app'
import { AppButton, Card, ConfirmDialog, ErrorState, LoadingState, SectionTitle, SyncBadge } from '@/components/ui'
import { getAuthService, isSupabaseConfigured, type LoginOutcome } from '@/supabase'
import { getSyncSummary, type SyncSummary } from '@/features/status'
import { localCounts } from '@/features/queries'
import { clearDemo, demoCount, seedDemo } from '@/features/demo'
import { formatDateTime } from '@/features/format'
import { colors } from '@/theme'

function describeLogin(outcome: LoginOutcome): string {
  switch (outcome.status) {
    case 'succeeded':
      return '登录成功，已开始同步。'
    case 'already_signed_in':
      return '已是登录状态。'
    case 'duplicate':
      return '该回调已处理过。'
    case 'owner_mismatch':
      return '当前账号与本地数据绑定账号不一致，同步已阻断。请重登原账号。'
    case 'terminal_reauth':
      return '登录未完成，请重新登录。'
    case 'cancelled':
      return '已取消登录。'
    case 'invalid':
      return '登录回调无效，请重试。'
    default:
      return '登录未完成，请重试。'
  }
}

export default function MineScreen() {
  const [summary, setSummary] = useState<SyncSummary | null>(null)
  const [counts, setCounts] = useState<{ places: number; entries: number; media: number; tags: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [accountMessage, setAccountMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [demoTotal, setDemoTotal] = useState(0)
  const [demoBusy, setDemoBusy] = useState(false)
  const [demoMessage, setDemoMessage] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)

  const load = useCallback(() => {
    try {
      const { db } = getAppRepository()
      setSummary(getSyncSummary(db))
      setCounts(localCounts(db))
      setDemoTotal(demoCount(db))
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

  const handleLogin = useCallback(async () => {
    if (busy) return
    setBusy(true)
    setAccountMessage('正在打开登录…')
    try {
      const outcome = await getAuthService().login()
      setAccountMessage(describeLogin(outcome))
    } catch (err) {
      setAccountMessage(`登录失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(false)
      load()
    }
  }, [busy, load])

  const handleSignOut = useCallback(async () => {
    if (busy) return
    setBusy(true)
    try {
      await getAuthService().signOut()
      setAccountMessage('已退出登录（本地数据保留）。')
    } catch (err) {
      setAccountMessage(`退出失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(false)
      load()
    }
  }, [busy, load])

  const handleSeed = useCallback(() => {
    if (demoBusy) return
    setDemoBusy(true)
    try {
      const { db, repo } = getAppRepository()
      const result = seedDemo(db, repo)
      setDemoMessage(
        result.skipped
          ? '已有演示数据，未重复播种。'
          : `已播种 ${result.places} 个地点 / ${result.entries} 条记录 / ${result.media} 张图（仅本机）。`,
      )
    } catch (err) {
      setDemoMessage(`播种失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setDemoBusy(false)
      load()
    }
  }, [demoBusy, load])

  const handleClearDemo = useCallback(() => {
    if (demoBusy) return
    setDemoBusy(true)
    try {
      const { db } = getAppRepository()
      const removed = clearDemo(db)
      setDemoMessage(`已清除 ${removed} 条演示记录（自己创建的不受影响）。`)
    } catch (err) {
      setDemoMessage(`清除失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setConfirmClear(false)
      setDemoBusy(false)
      load()
    }
  }, [demoBusy, load])

  if (loading) return <LoadingState text="正在读取本机状态…" />
  if (error) return <ErrorState message={error} onRetry={load} />
  if (!summary || !counts) return null

  const configured = isSupabaseConfigured()
  const result = summary.lastSyncResult

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      <Card style={styles.section}>
        <SectionTitle
          right={
            <SyncBadge
              status={summary.owner && summary.pendingCount + summary.claimedCount === 0 ? 'synced' : 'local'}
            />
          }
        >
          账号与同步
        </SectionTitle>
        <Line label="云端配置">{configured ? '已配置' : '未配置（填入 Supabase 环境变量后启用）'}</Line>
        <Line label="本机归属">{summary.owner ? `已绑定 ${summary.owner.slice(0, 8)}…` : '未绑定'}</Line>
        <Line label="上次同步">{result ? `${formatDateTime(result.at)} · 成功 ${result.done} / 失败 ${result.failed}` : formatDateTime(summary.lastSyncAt)}</Line>
        {result?.error ? <Text style={styles.warnText}>最近报错：{result.error}</Text> : null}
        {configured ? (
          <View style={styles.actions}>
            <AppButton label={busy ? '处理中…' : '使用 Google 登录'} onPress={handleLogin} loading={busy} style={styles.flex} />
            {summary.owner ? (
              <AppButton label="退出登录" variant="secondary" onPress={handleSignOut} disabled={busy} />
            ) : null}
          </View>
        ) : (
          <Text style={styles.hint}>本机可离线使用；配置云端后才可登录与跨设备同步。</Text>
        )}
        {accountMessage ? <Text style={styles.warnText}>{accountMessage}</Text> : null}
      </Card>

      <Card style={styles.section}>
        <SectionTitle>同步状态</SectionTitle>
        <Line label="待上传">{summary.pendingCount + summary.claimedCount} 项</Line>
        <Line label="同步失败记录">{summary.failedEntities.length} 条</Line>
        {summary.failedEntities.slice(0, 5).map((item) => (
          <Text key={`${item.table}-${item.id}`} style={styles.muted}>
            {item.table} · {item.id.slice(0, 8)}…{item.error ? ` · ${item.error}` : ''}
          </Text>
        ))}
        {summary.parked.length > 0 ? (
          <View style={styles.parkedBlock}>
            <Text style={styles.parkedTitle}>停放（多次失败已暂停）{summary.parked.length} 项</Text>
            {summary.parked.map((op) => (
              <View key={op.opId} style={styles.parkedItem}>
                <Text style={styles.muted}>
                  {op.kind} · {op.entityId ? `${op.entityId.slice(0, 8)}…` : '批量'} · 尝试 {op.attempts} 次
                </Text>
                <Text style={styles.parkedError}>{op.lastError ?? '（无错误原文）'}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.muted}>无停放项。</Text>
        )}
        <AppButton label="刷新本机状态" variant="secondary" onPress={load} />
      </Card>

      <Pressable
        accessibilityRole="button"
        style={({ pressed }) => [styles.card, pressed && styles.pressed]}
        onPress={() => router.push('/conflicts')}
      >
        <View style={styles.rowBetween}>
          <Text style={styles.cardTitle}>⚠️ 同步冲突</Text>
          <Text style={styles.cardValue}>{summary.conflictCount} 个待裁决 ›</Text>
        </View>
      </Pressable>

      <Card style={styles.section}>
        <SectionTitle>本机数据</SectionTitle>
        <Line label="地点 / 记录">{counts.places} / {counts.entries}</Line>
        <Line label="照片">{counts.media} 张</Line>
        <Line label="标签">{counts.tags} 个</Line>
      </Card>

      <Card style={styles.section}>
        <SectionTitle>演示数据</SectionTitle>
        <Line label="演示记录">{demoTotal > 0 ? `${demoTotal} 条` : '无'}</Line>
        <Text style={styles.hint}>
          演示数据仅存本机、带 demo 标记、永不上云；清除只删演示记录，自己创建的数据不受影响。
        </Text>
        {demoMessage ? <Text style={styles.warnText}>{demoMessage}</Text> : null}
        <View style={styles.actions}>
          <AppButton label={demoBusy ? '处理中…' : '播种演示数据'} onPress={handleSeed} loading={demoBusy} style={styles.flex} />
          {demoTotal > 0 ? (
            <AppButton label="清除演示数据" variant="secondary" onPress={() => setConfirmClear(true)} disabled={demoBusy} />
          ) : null}
        </View>
      </Card>

      <Pressable
        accessibilityRole="button"
        style={({ pressed }) => [styles.card, pressed && styles.pressed]}
        onPress={() => router.push('/tags')}
      >
        <View style={styles.rowBetween}>
          <Text style={styles.cardTitle}>🏷 标签与维度</Text>
          <Text style={styles.cardValue}>{counts.tags} 个 ›</Text>
        </View>
      </Pressable>

      <ConfirmDialog
        visible={confirmClear}
        title="清除全部演示数据？"
        message="只删除带 demo 标记的演示地点/记录/照片；你自己创建的记录与标签不受影响。"
        confirmLabel="确认清除"
        danger
        onCancel={() => setConfirmClear(false)}
        onConfirm={handleClearDemo}
      />
    </ScrollView>
  )
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.line}>
      <Text style={styles.lineLabel}>{label}</Text>
      <Text style={styles.lineValue}>{children}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.paper },
  container: { padding: 16, gap: 14, paddingBottom: 48 },
  section: { gap: 8 },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  lineLabel: { fontSize: 13, color: colors.inkMuted },
  lineValue: { fontSize: 13, color: colors.ink, flexShrink: 1, textAlign: 'right' },
  muted: { fontSize: 12, color: colors.inkMuted },
  warnText: { fontSize: 12, color: colors.terraDeep, lineHeight: 18 },
  hint: { fontSize: 12, color: colors.inkMuted, lineHeight: 18 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  parkedBlock: { gap: 6, marginTop: 4 },
  parkedTitle: { fontSize: 13, fontWeight: '700', color: colors.danger },
  parkedItem: { backgroundColor: colors.dangerSoft, borderRadius: 10, padding: 8, gap: 2 },
  parkedError: { fontSize: 12, color: colors.danger, lineHeight: 17 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
  },
  pressed: { opacity: 0.9 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  cardValue: { fontSize: 13, color: colors.terraDeep, fontWeight: '700' },
})
