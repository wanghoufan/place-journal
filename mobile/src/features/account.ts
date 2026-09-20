// 账号与本机绑定：UI 文案与动作判定纯函数（TASK-DEV-14）。
//
// 口径（基线 PRODUCT_PLAN_V1.5 / RF-04）：
//   - 未绑定 owner 时**不得**声称「已开始同步」——同步由 owner gate 整体阻断；
//   - 绑定只由用户二次确认触发（`bindOwner(当前 userId)`），不自动迁移、不跨账号切号；
//   - mismatch 只给「阻断原因＋重登原账号」这一条恢复路（导出后清空切号已降级延后，不实现）；
//   - 退出登录只清本地 auth 态，不删本地业务数据。
// 无副作用、无 Expo 依赖，供 Mine / auth callback 页与单测复用。

import type { LoginOutcome, LoginState } from '../supabase/auth'

/** 账号区按钮可见性（由登录态＋绑定结论推出）。 */
export interface AccountActions {
  /** 已登录且本机未绑定：显示「确认绑定本机数据」。 */
  showBindOwner: boolean
  /**
   * 仅 match / mismatch 显示「退出登录」（只清本地 auth 态，不删本地业务数据）：
   * match 对应②「绑定后出现退出登录」；mismatch 对应④「重登原账号」需先退出。
   * unbound 不显示——未绑定态不给退出按钮（登错账号的退路不在本任务范围内）。
   */
  showSignOut: boolean
  /** 已登录但本机绑定的是别的账号：同步被阻断，只给重登原账号路径。 */
  blocked: boolean
}

/** 未登录/未配置时三个动作都不显示（`null` = 登录态未知，按未登录处理）。 */
export function accountActions(state: LoginState | null): AccountActions {
  if (state?.status !== 'signed_in') {
    return { showBindOwner: false, showSignOut: false, blocked: false }
  }
  return {
    showBindOwner: state.binding === 'unbound',
    showSignOut: state.binding !== 'unbound',
    blocked: state.binding === 'mismatch',
  }
}

/** mismatch 的唯一恢复路径（两处共用一句，禁止出现「导出后切号」）。 */
export const OWNER_MISMATCH_HINT = '请退出登录后用原账号重新登录。'

/** Mine 页 mismatch 文案：阻断原因＋重登原账号（附原账号前缀便于辨认）。 */
export function describeOwnerMismatch(boundOwner: string | null): string {
  const shown = boundOwner ? `（原账号 ${boundOwner.slice(0, 8)}…）` : ''
  return `本机数据已绑定到另一个账号${shown}，同步已阻断。${OWNER_MISMATCH_HINT}`
}

/** Auth callback 页 mismatch 文案：与 Mine 同口径，只去掉账号前缀。 */
export function describeCallbackOwnerMismatch(): string {
  return `当前账号与本地数据绑定账号不一致，同步已阻断。${OWNER_MISMATCH_HINT}`
}

/** Mine 页登录结果文案（owner 未绑定时不得说「已开始同步」）。 */
export function describeLogin(outcome: LoginOutcome): string {
  switch (outcome.status) {
    case 'succeeded':
      return outcome.binding === 'unbound'
        ? '登录成功。请点「确认绑定本机数据」完成绑定，绑定后才同步。'
        : '登录成功。本机已绑定该账号，同步接线后自动进行。'
    case 'already_signed_in':
      return outcome.binding === 'unbound'
        ? '已是登录状态；本机尚未绑定，请点「确认绑定本机数据」。'
        : '已是登录状态。'
    case 'duplicate':
      return '该回调已处理过。'
    case 'owner_mismatch':
      return describeOwnerMismatch(outcome.boundOwner)
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

/** Mine 页未绑定提示：说明绑定才同步、不绑定保持本机可用。 */
export function describeUnboundHint(): string {
  return '本机数据尚未绑定账号：绑定后才会与该账号同步；不绑定则保持仅本机使用。'
}

/** 绑定二次确认弹窗标题。 */
export function describeBindOwnerConfirmTitle(): string {
  return '把本机数据绑定到这个账号？'
}

/** 绑定二次确认弹窗正文（明确不迁移、不删数据）。 */
export function describeBindOwnerConfirm(userId: string): string {
  return `绑定后本机数据归属账号 ${userId.slice(0, 8)}…，只与该账号同步；换用其他账号会被阻断，需重登本账号。本机数据不会被删除。`
}

/** 绑定成功文案（不宣称同步已开始：同步引擎接线属后续任务）。 */
export function describeBindOwnerDone(userId: string): string {
  return `已绑定账号 ${userId.slice(0, 8)}…（本机数据归属该账号）。`
}
