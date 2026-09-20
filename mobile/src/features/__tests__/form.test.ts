// 「交给 AI 整理」按钮三态回归（对标 Web Record 的 hasPlace/hasContent/canNext）。
// 真机教训：门槛若只写进页面顶部那行提示，按钮在长页底部根本看不到，表现为「点了没反应」，
// 所以门槛必须落在按钮文案上；内容口径漏了「公开理由」就会把只填公开理由的用户静默拦下。

import { aiNextGate } from '../form'

type GateValues = Parameters<typeof aiNextGate>[0]

function gate(overrides: Partial<GateValues> = {}) {
  return aiNextGate({ placeId: 'p1', notePrivate: '', notePublic: '', photoCount: 0, ...overrides })
}

describe('aiNextGate: 交给 AI 整理 的三态与文案', () => {
  it('地点 + 私密感受 → 可进，文案为「交给 AI 整理 →」', () => {
    const result = gate({ notePrivate: '很安静' })
    expect(result.hasPlace).toBe(true)
    expect(result.hasContent).toBe(true)
    expect(result.canNext).toBe(true)
    expect(result.label).toBe('交给 AI 整理 →')
  })

  it('只填了公开分享理由（无私密感受、无照片）→ 仍可进（Web hasContent 口径）', () => {
    expect(gate({ notePublic: '夜景超美，人均不贵' }).canNext).toBe(true)
  })

  it('只有照片、没有文字 → 可进', () => {
    expect(gate({ photoCount: 1 }).canNext).toBe(true)
  })

  it('有地点但没有任何内容 → 不可进，文案为「添加照片或写写感受」', () => {
    const result = gate()
    expect(result.hasPlace).toBe(true)
    expect(result.hasContent).toBe(false)
    expect(result.canNext).toBe(false)
    expect(result.label).toBe('添加照片或写写感受')
  })

  it('没有地点 → 不可进，文案为「先选择地点，再交给 AI 整理 →」（缺内容也让位给缺地点）', () => {
    const result = gate({ placeId: undefined, notePrivate: '很安静' })
    expect(result.hasPlace).toBe(false)
    expect(result.canNext).toBe(false)
    expect(result.label).toBe('先选择地点，再交给 AI 整理 →')
  })

  it('新地点名（现场建地点）同样算有地点', () => {
    expect(gate({ placeId: undefined, newPlaceName: '西海岸日落咖啡', notePrivate: '好' }).hasPlace).toBe(true)
  })

  it('空白字符不算数（地点名 / 两个理由框都按 trim 判空）', () => {
    const result = gate({ placeId: undefined, newPlaceName: '   ', notePrivate: '  ', notePublic: '\n' })
    expect(result.hasPlace).toBe(false)
    expect(result.hasContent).toBe(false)
    expect(result.canNext).toBe(false)
  })
})
