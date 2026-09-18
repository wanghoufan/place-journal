// 共享 UI 基元（TASK-DEV-09）：暖纸配色、移动端触控尺寸、空/加载/错误态。
// 仅使用 react-native 基础组件，不含业务与网络。

import type { ReactNode } from 'react'
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
} from 'react-native'

import { colors, TOUCH_HEIGHT } from '../theme'
import { syncLabel, syncTone, type SyncStatusLike } from '../features/format'

export function Card({ children, style }: { children: ReactNode; style?: object }) {
  return <View style={[styles.card, style]}>{children}</View>
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View style={styles.sectionTitle}>
      <Text style={styles.sectionTitleText}>{children}</Text>
      {right}
    </View>
  )
}

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'

export function AppButton({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
}: {
  label: string
  onPress: () => void
  variant?: ButtonVariant
  disabled?: boolean
  loading?: boolean
  style?: object
}) {
  const blocked = disabled || loading
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: blocked }}
      onPress={onPress}
      disabled={blocked}
      style={({ pressed }) => [
        styles.button,
        variantStyles[variant],
        pressed && !blocked ? styles.buttonPressed : null,
        blocked ? styles.buttonDisabled : null,
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={variant === 'primary' || variant === 'danger' ? colors.white : colors.ink} /> : null}
      <Text style={[styles.buttonText, variantTextStyles[variant]]}>{label}</Text>
    </Pressable>
  )
}

const variantStyles: Record<ButtonVariant, object> = {
  primary: { backgroundColor: colors.terra },
  secondary: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  danger: { backgroundColor: colors.danger },
  ghost: { backgroundColor: 'transparent' },
}
const variantTextStyles: Record<ButtonVariant, object> = {
  primary: { color: colors.white },
  secondary: { color: colors.ink },
  danger: { color: colors.white },
  ghost: { color: colors.terraDeep },
}

export function Chip({
  label,
  active = false,
  onPress,
  disabled = false,
  dangerTone = false,
}: {
  label: string
  active?: boolean
  onPress?: () => void
  disabled?: boolean
  dangerTone?: boolean
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled }}
      onPress={onPress}
      disabled={disabled}
      style={[styles.chip, active && styles.chipActive, dangerTone && styles.chipDanger, disabled && styles.buttonDisabled]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive, dangerTone && styles.chipTextDanger]}>{label}</Text>
    </Pressable>
  )
}

export function Stars({
  value,
  editable = false,
  onChange,
  size = 20,
}: {
  value?: number
  editable?: boolean
  onChange?: (value: number | undefined) => void
  size?: number
}) {
  const current = value ?? 0
  return (
    <View style={styles.starsRow} accessibilityLabel={`评分 ${current || '未评分'}`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable
          key={n}
          disabled={!editable}
          accessibilityRole="button"
          accessibilityLabel={`${n} 星`}
          hitSlop={6}
          onPress={() => onChange?.(current === n ? undefined : n)}
        >
          <Text style={[styles.star, { fontSize: size }, n <= current ? styles.starOn : styles.starOff]}>★</Text>
        </Pressable>
      ))}
    </View>
  )
}

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline = false,
  autoFocus = false,
  maxLength,
  minHeight,
}: {
  label?: string
  value: string
  onChangeText: (text: string) => void
  placeholder?: string
  keyboardType?: KeyboardTypeOptions
  multiline?: boolean
  autoFocus?: boolean
  maxLength?: number
  minHeight?: number
}) {
  return (
    <View style={styles.fieldGroup}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.inkMuted}
        keyboardType={keyboardType}
        multiline={multiline}
        autoFocus={autoFocus}
        maxLength={maxLength}
        style={[styles.input, multiline && { minHeight: minHeight ?? 96, textAlignVertical: 'top', paddingTop: 12 }]}
      />
    </View>
  )
}

export function SyncBadge({ status }: { status: SyncStatusLike | null | undefined }) {
  const tone = syncTone(status)
  const toneStyle = tone === 'ok' ? styles.badgeOk : tone === 'warn' ? styles.badgeWarn : styles.badgeMuted
  const toneText = tone === 'ok' ? styles.badgeTextOk : tone === 'warn' ? styles.badgeTextWarn : styles.badgeTextMuted
  return (
    <View style={[styles.badge, toneStyle]}>
      <Text style={[styles.badgeText, toneText]}>{syncLabel(status)}</Text>
    </View>
  )
}

export function EmptyState({
  icon = '🌿',
  title,
  hint,
  actionLabel,
  onAction,
}: {
  icon?: string
  title: string
  hint?: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <View style={styles.centered}>
      <Text style={styles.emptyIcon}>{icon}</Text>
      <Text style={styles.emptyTitle}>{title}</Text>
      {hint ? <Text style={styles.emptyHint}>{hint}</Text> : null}
      {actionLabel && onAction ? (
        <AppButton label={actionLabel} onPress={onAction} variant="secondary" style={styles.emptyAction} />
      ) : null}
    </View>
  )
}

export function LoadingState({ text = '加载中…' }: { text?: string }) {
  return (
    <View style={styles.centered}>
      <ActivityIndicator color={colors.terra} />
      <Text style={styles.emptyHint}>{text}</Text>
    </View>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.centered}>
      <Text style={styles.errorTitle}>出错了</Text>
      <Text style={styles.emptyHint}>{message}</Text>
      {onRetry ? <AppButton label="重试" onPress={onRetry} variant="secondary" style={styles.emptyAction} /> : null}
    </View>
  )
}

/** 底部弹层（对标 Web Sheet）：标题 + 任意内容，点遮罩关闭。 */
export function Sheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean
  title?: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetBackdrop}>
        <Pressable style={styles.sheetBackdropTap} onPress={onClose} accessibilityLabel="关闭" />
        <View style={styles.sheetCard}>
          {title ? <Text style={styles.modalTitle}>{title}</Text> : null}
          {children}
        </View>
      </View>
    </Modal>
  )
}

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = '确认',
  cancelLabel = '取消',
  danger = false,
  onCancel,
  onConfirm,
}: {
  visible: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{title}</Text>
          <Text style={styles.modalMessage}>{message}</Text>
          <View style={styles.modalActions}>
            <AppButton label={cancelLabel} onPress={onCancel} variant="secondary" style={styles.modalButton} />
            <AppButton label={confirmLabel} onPress={onConfirm} variant={danger ? 'danger' : 'primary'} style={styles.modalButton} />
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
  },
  sectionTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  sectionTitleText: { fontSize: 16, fontWeight: '700', color: colors.ink },
  button: {
    minHeight: TOUCH_HEIGHT,
    borderRadius: 24,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonPressed: { opacity: 0.85 },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { fontSize: 15, fontWeight: '700' },
  chip: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: colors.terra, borderColor: colors.terra },
  chipDanger: { borderColor: colors.dangerSoft, backgroundColor: colors.dangerSoft },
  chipText: { fontSize: 13, color: colors.inkMuted },
  chipTextActive: { color: colors.white, fontWeight: '700' },
  chipTextDanger: { color: colors.danger },
  starsRow: { flexDirection: 'row', gap: 2 },
  star: { lineHeight: undefined },
  starOn: { color: colors.terra },
  starOff: { color: colors.line },
  fieldGroup: { gap: 6 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: colors.ink },
  input: {
    minHeight: TOUCH_HEIGHT,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: colors.paper,
    color: colors.ink,
    fontSize: 15,
  },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, alignSelf: 'flex-start' },
  badgeOk: { backgroundColor: colors.mossSoft },
  badgeWarn: { backgroundColor: colors.dangerSoft },
  badgeMuted: { backgroundColor: colors.cardDeep },
  badgeText: { fontSize: 11, fontWeight: '700' },
  badgeTextOk: { color: colors.moss },
  badgeTextWarn: { color: colors.danger },
  badgeTextMuted: { color: colors.inkMuted },
  centered: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48, gap: 10 },
  emptyIcon: { fontSize: 40 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  emptyHint: { fontSize: 13, color: colors.inkMuted, textAlign: 'center', paddingHorizontal: 24, lineHeight: 20 },
  emptyAction: { marginTop: 4 },
  errorTitle: { fontSize: 16, fontWeight: '700', color: colors.danger },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheetBackdropTap: { flex: 1 },
  sheetCard: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 28,
    gap: 12,
  },
  modalCard: { width: '100%', backgroundColor: colors.card, borderRadius: 18, padding: 20, gap: 12 },
  modalTitle: { fontSize: 17, fontWeight: '700', color: colors.ink },
  modalMessage: { fontSize: 14, color: colors.inkMuted, lineHeight: 21 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  modalButton: { flex: 1 },
})
