// owner binding（R-03 / RF-04 / T057–T060 本地接口段）。
//
// 语义：本地 SQLite 持久化 `bound_owner_user_id`；当前登录账号与绑定不一致时，
// 整体阻断 push/pull（Sync 后续接本 gate）；V1 不自动跨账号迁移，也不因 cancel/重启
// 改 owner 或删数据。恢复路径（重登原账号 / 导出后清空切号）由 Mine UI（T057+）实现。

export type OwnerBindingState = 'unbound' | 'match' | 'mismatch'

/** 判定当前账号与本地绑定关系。 */
export function evaluateOwnerBinding(
  boundOwnerUserId: string | null | undefined,
  currentUserId: string | null | undefined,
): OwnerBindingState {
  if (!boundOwnerUserId) return 'unbound'
  if (!currentUserId) return 'mismatch'
  return boundOwnerUserId === currentUserId ? 'match' : 'mismatch'
}

export interface OwnerGateResult {
  allowed: boolean
  state: OwnerBindingState
  /** 阻断原因（allowed 时为 null）。 */
  reason: 'owner_unbound' | 'owner_mismatch' | null
}

/** push/pull 前的 owner 门禁：仅 `match` 放行；unbound 需先确认绑定。 */
export function ownerGateForSync(
  boundOwnerUserId: string | null | undefined,
  currentUserId: string | null | undefined,
): OwnerGateResult {
  const state = evaluateOwnerBinding(boundOwnerUserId, currentUserId)
  if (state === 'match') return { allowed: true, state, reason: null }
  return { allowed: false, state, reason: state === 'unbound' ? 'owner_unbound' : 'owner_mismatch' }
}

/** 账号不匹配/未绑定导致同步被阻断（含状态，供 UI 选择恢复路）。 */
export class OwnerBindingBlockedError extends Error {
  readonly state: OwnerBindingState

  constructor(state: OwnerBindingState) {
    super(state === 'unbound' ? 'owner_unbound' : 'owner_mismatch')
    this.name = 'OwnerBindingBlockedError'
    this.state = state
  }
}

/** 需要时以异常形式阻断：非 match 抛 `OwnerBindingBlockedError`。 */
export function assertOwnerForSync(
  boundOwnerUserId: string | null | undefined,
  currentUserId: string | null | undefined,
): void {
  const gate = ownerGateForSync(boundOwnerUserId, currentUserId)
  if (!gate.allowed) throw new OwnerBindingBlockedError(gate.state)
}
