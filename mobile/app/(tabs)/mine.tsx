// Mine：登录入口 + 同步入口（owner 门禁 → push/pull）+ 同步状态（成功/待传/失败/停放原文）+ 冲突入口。
// 同步只在已登录时由本页自动触发；owner 未绑定/mismatch 由 `runSyncEntry` 按 account.ts 文案阻断。

import { useCallback, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'

import { getAppRepository } from '@/db/app'
import { AppButton, Card, ConfirmDialog, ErrorState, LoadingState, SectionTitle, SyncBadge } from '@/components/ui'
import { getAuthService, isSupabaseConfigured, type LoginState } from '@/supabase'
import {
  accountActions,
  describeBindOwnerConfirm,
  describeBindOwnerConfirmTitle,
  describeBindOwnerDone,
  describeLogin,
  describeOwnerMismatch,
  describeUnboundHint,
} from '@/features/account'
import { describeSyncEntry, runSyncEntry } from '@/features/syncEntry'
import { createNativeSyncEngines } from '@/sync/nativeSync'
import { getSyncSummary, type SyncSummary } from '@/features/status'
import { localCounts, shareSnapshotCount } from '@/features/queries'
import { clearDemo, demoCount, seedDemo } from '@/features/demo'
import { formatDateTime } from '@/features/format'
import { colors } from '@/theme'

export default function MineScreen() {
  const [summary, setSummary] = useState<SyncSummary | null>(null)
  const [counts, setCounts] = useState<{ places: number; entries: number; media: number; tags: number } | null>(null)
  const [shareCount, setShareCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loginState, setLoginState] = useState<LoginState | null>(null)
  const [accountMessage, setAccountMessage] = useState('')
  const [syncMessage, setSyncMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmBind, setConfirmBind] = useState(false)
  const [demoTotal, setDemoTotal] = useState(0)
  const [demoBusy, setDemoBusy] = useState(false)
  const [demoMessage, setDemoMessage] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const syncBusyRef = useRef(false)

  const refreshLoginState = useCallback(async (): Promise<LoginState | null> => {
    if (!isSupabaseConfigured()) {
      setLoginState(null)
      return null
    }
    try {
      const next = await getAuthService().getLoginState()
      setLoginState(next)
      return next
    } catch {
      // Auth 侧不可用不阻断本机页面：退回「登录态未知」，绑定/退出按钮不显示。
      setLoginState(null)
      return null
    }
  }, [])

  const refreshLocal = useCallback(() => {
    const { db } = getAppRepository()
    setSummary(getSyncSummary(db))
    setCounts(localCounts(db))
    setShareCount(shareSnapshotCount(db))
    setDemoTotal(demoCount(db))
    setError(null)
  }, [])

  /**
   * 同步入口：已登录才走 `runSyncEntry`（owner 未绑定/mismatch 在入口内按 account.ts 文案阻断，
   * 不自动迁移、不跨号切号）；未登录一律不发起，退出登录只清 auth 态。
   */
  const runSync = useCallback(async (state: LoginState | null): Promise<boolean> => {
    if (syncBusyRef.current || state?.status !== 'signed_in') return false
    syncBusyRef.current = true
    try {
      const { db } = getAppRepository()
      const result = await runSyncEntry({
        db,
        loginState: state,
        isConfigured: isSupabaseConfigured(),
        createEngines: createNativeSyncEngines,
      })
      // 阻断文案已在账号卡片就地显示同一句（account.ts），不重复贴一行。
      setSyncMessage(result.status === 'blocked' ? '' : describeSyncEntry(result))
      return result.status === 'ok'
    } catch (err) {
      setSyncMessage(`同步失败：${err instanceof Error ? err.message : String(err)}`)
      return false
    } finally {
      syncBusyRef.current = false
    }
  }, [])

  const load = useCallback(async () => {
    try {
      refreshLocal()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
    const loginStateNow = await refreshLoginState()
    if (await runSync(loginStateNow)) {
      // 同步成功后本机状态（待传/冲突/上次同步）已变，就地再读一次。
      try {
        refreshLocal()
      } catch {
        // 二次读取失败不覆盖同步结果，下次 focus 会重取。
      }
    }
  }, [refreshLocal, refreshLoginState, runSync])

  useFocusEffect(
    useCallback(() => {
      void load()
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
      await load()
    }
  }, [busy, load])

  const handleSignOut = useCallback(async () => {
    if (busy) return
    setBusy(true)
    try {
      await getAuthService().signOut()
      setSyncMessage('')
      setAccountMessage('已退出登录（本地数据保留）。')
    } catch (err) {
      setAccountMessage(`退出失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(false)
      await load()
    }
  }, [busy, load])

  const handleBindOwner = useCallback(async () => {
    if (busy || loginState?.status !== 'signed_in') return
    const userId = loginState.userId
    setBusy(true)
    try {
      await getAuthService().bindOwner(userId)
      setAccountMessage(describeBindOwnerDone(userId))
    } catch (err) {
      setAccountMessage(`绑定失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setConfirmBind(false)
      setBusy(false)
      await load()
    }
  }, [busy, loginState, load])

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
      void load()
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
      void load()
    }
  }, [demoBusy, load])

  if (loading) return <LoadingState text="正在读取本机状态…" />
  if (error) return <ErrorState message={error} onRetry={() => void load()} />
  if (!summary || !counts) return null

  const configured = isSupabaseConfigured()
  const result = summary.lastSyncResult
  const actions = accountActions(loginState)
  const signedInUserId = loginState?.status === 'signed_in' ? loginState.userId : null

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
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
          <>
            <View style={styles.actions}>
              <AppButton label={busy ? '处理中…' : '使用 Google 登录'} onPress={handleLogin} loading={busy} style={styles.grow} />
              {actions.showSignOut ? (
                <AppButton label="退出登录" variant="secondary" onPress={handleSignOut} disabled={busy} />
              ) : null}
            </View>
            {actions.blocked ? <Text style={styles.warnText}>{describeOwnerMismatch(summary.owner)}</Text> : null}
            {actions.showBindOwner && signedInUserId ? (
              <>
                <Text style={styles.hint}>{describeUnboundHint()}</Text>
                <AppButton
                  label={busy ? '处理中…' : '确认绑定本机数据'}
                  onPress={() => setConfirmBind(true)}
                  disabled={busy}
                />
              </>
            ) : null}
          </>
        ) : (
          <Text style={styles.hint}>本机可离线使用；配置云端后才可登录与跨设备同步。</Text>
        )}
        {accountMessage ? <Text style={styles.warnText}>{accountMessage}</Text> : null}
        {syncMessage ? <Text style={styles.muted}>{syncMessage}</Text> : null}
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
          <AppButton label={demoBusy ? '处理中…' : '播种演示数据'} onPress={handleSeed} loading={demoBusy} style={styles.grow} />
          {demoTotal > 0 ? (
            <AppButton label="清除演示数据" variant="secondary" onPress={() => setConfirmClear(true)} disabled={demoBusy} />
          ) : null}
        </View>
      </Card>

      <Pressable
        accessibilityRole="button"
        style={({ pressed }) => [styles.card, pressed && styles.pressed]}
        onPress={() => router.push('/shares')}
      >
        <View style={styles.rowBetween}>
          <Text style={styles.cardTitle}>🔗 分享快照</Text>
          <Text style={styles.cardValue}>{shareCount} 条 ›</Text>
        </View>
      </Pressable>

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
        visible={confirmBind}
        title={describeBindOwnerConfirmTitle()}
        message={signedInUserId ? describeBindOwnerConfirm(signedInUserId) : ''}
        confirmLabel="确认绑定"
        onCancel={() => setConfirmBind(false)}
        onConfirm={() => void handleBindOwner()}
      />

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
  // screen 供 ScrollView 铺底；grow 只留给需要等宽/撑满的子元素（按钮），不带背景，避免盖掉 variant 底色。
  screen: { flex: 1, backgroundColor: colors.paper },
  grow: { flex: 1 },
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
