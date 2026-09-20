import {
  accountActions,
  describeBindOwnerConfirm,
  describeBindOwnerConfirmTitle,
  describeBindOwnerDone,
  describeCallbackOwnerMismatch,
  describeLogin,
  describeOwnerMismatch,
  describeUnboundHint,
  OWNER_MISMATCH_HINT,
} from '../account'
import type { LoginOutcome, LoginState } from '../../supabase/auth'

// TASK-DEV-14：首次绑定确认 UI 的动作判定与文案口径（纯函数，不触原生/网络）。

const OWNER = '11111111-2222-3333-4444-555555555555'

function state(binding: 'unbound' | 'match' | 'mismatch'): LoginState {
  return { status: 'signed_in', userId: OWNER, binding }
}

describe('account: 动作可见性（绑定/退出/阻断）', () => {
  it('未登录或登录态未知：三个动作都不出现', () => {
    expect(accountActions(null)).toEqual({ showBindOwner: false, showSignOut: false, blocked: false })
    expect(accountActions({ status: 'signed_out' })).toEqual({
      showBindOwner: false,
      showSignOut: false,
      blocked: false,
    })
  })

  it('已登录且未绑定：只给「确认绑定」，不显示退出', () => {
    expect(accountActions(state('unbound'))).toEqual({
      showBindOwner: true,
      showSignOut: false,
      blocked: false,
    })
  })

  it('绑定匹配：出现退出登录，不再要求绑定', () => {
    expect(accountActions(state('match'))).toEqual({
      showBindOwner: false,
      showSignOut: true,
      blocked: false,
    })
  })

  it('绑定到别的账号：阻断且不显示绑定按钮（不提供切号绑定路径）', () => {
    expect(accountActions(state('mismatch'))).toEqual({
      showBindOwner: false,
      showSignOut: true,
      blocked: true,
    })
  })
})

describe('account: 登录结果文案（owner 未绑定不得声称已同步）', () => {
  it('首次登录未绑定：提示去绑定，且不出现「已开始同步」', () => {
    const outcome: LoginOutcome = { status: 'succeeded', userId: OWNER, binding: 'unbound' }
    const text = describeLogin(outcome)
    expect(text).toContain('确认绑定本机数据')
    expect(text).not.toContain('已开始同步')
  })

  it('绑定时登录成功：文案不宣称同步已开始', () => {
    const outcome: LoginOutcome = { status: 'succeeded', userId: OWNER, binding: 'match' }
    const text = describeLogin(outcome)
    expect(text).toBe('登录成功。本机已绑定该账号，同步接线后自动进行。')
    expect(text).not.toContain('已开始同步')
  })

  it('已登录未绑定：提示补绑定，且不出现「已开始同步」', () => {
    const outcome: LoginOutcome = { status: 'already_signed_in', userId: OWNER, binding: 'unbound' }
    const text = describeLogin(outcome)
    expect(text).toContain('确认绑定本机数据')
    expect(text).not.toContain('已开始同步')
  })

  it('已登录且已绑定：维持原文案', () => {
    const outcome: LoginOutcome = { status: 'already_signed_in', userId: OWNER, binding: 'match' }
    expect(describeLogin(outcome)).toBe('已是登录状态。')
  })

  it('其余分支文案稳定', () => {
    expect(describeLogin({ status: 'duplicate', flowStatus: 'succeeded' })).toBe('该回调已处理过。')
    expect(describeLogin({ status: 'terminal_reauth', errorClass: 'interrupted_no_session' })).toBe(
      '登录未完成，请重新登录。',
    )
    expect(describeLogin({ status: 'cancelled' })).toBe('已取消登录。')
    expect(describeLogin({ status: 'invalid', reason: 'redirect_mismatch' })).toBe('登录回调无效，请重试。')
    expect(describeLogin({ status: 'error', errorClass: 'provider_error' })).toBe('登录未完成，请重试。')
  })
})

describe('account: mismatch 只给阻断原因＋重登原账号路径', () => {
  it('Mine 文案含阻断原因与重登指引，且不出现「导出」', () => {
    const text = describeOwnerMismatch('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
    expect(text).toContain('同步已阻断')
    expect(text).toContain('aaaaaaaa…')
    expect(text).toContain(OWNER_MISMATCH_HINT)
    expect(text).not.toContain('导出')
    expect(text).not.toContain('切号')
  })

  it('callback 文案同口径：无导出后切号', () => {
    const text = describeCallbackOwnerMismatch()
    expect(text).toContain('同步已阻断')
    expect(text).toContain(OWNER_MISMATCH_HINT)
    expect(text).not.toContain('导出')
  })

  it('登录结果里的 mismatch 走同一条恢复路径', () => {
    const outcome: LoginOutcome = { status: 'owner_mismatch', userId: OWNER, boundOwner: 'bbbbbbbb-1' }
    const text = describeLogin(outcome)
    expect(text).toContain('同步已阻断')
    expect(text).not.toContain('导出')
  })
})

describe('account: 绑定确认与结果文案', () => {
  it('确认弹窗说明只与该账号同步、不删数据', () => {
    expect(describeBindOwnerConfirmTitle()).toBe('把本机数据绑定到这个账号？')
    const text = describeBindOwnerConfirm(OWNER)
    expect(text).toContain('11111111…')
    expect(text).toContain('本机数据不会被删除')
  })

  it('绑定成功文案带账号前缀，且不宣称同步已开始', () => {
    const text = describeBindOwnerDone(OWNER)
    expect(text).toContain('11111111…')
    expect(text).not.toContain('已开始同步')
  })

  it('未绑定提示说明绑定才同步、不绑定仅本机', () => {
    const text = describeUnboundHint()
    expect(text).toContain('绑定后才会与该账号同步')
    expect(text).toContain('仅本机使用')
  })
})
