import { createMockTransport, type MockTransportStep, type TransportOutcome } from '../transport'

describe('push transport mock', () => {
  it('缺省全成功，并按调用顺序记录 op（幂等键 opId）', async () => {
    const transport = createMockTransport()
    const first = await transport.send({ opId: 'A', kind: 'upsert_place', dependsOn: [] })
    expect(first).toEqual({ outcome: 'ok', error: undefined, completedSteps: undefined, data: undefined })
    expect(transport.calls.map((c) => c.opId)).toEqual(['A'])
  })

  it('支持成功/失败/超时/半成品四种结局', async () => {
    const script: Record<string, MockTransportStep> = {
      ok: { outcome: 'ok' },
      fail: { outcome: 'retry', error: 'boom' },
      slow: { outcome: 'timeout', error: 'timeout' },
      half: { outcome: 'partial', completedSteps: ['display'] },
    }
    const transport = createMockTransport((op) => script[op.opId] ?? { outcome: 'ok' })
    const outcomes: TransportOutcome[] = []
    for (const opId of ['ok', 'fail', 'slow', 'half']) {
      const result = await transport.send({ opId, kind: 'upload_media', dependsOn: [] })
      outcomes.push(result.outcome)
      expect(transport.calls[transport.calls.length - 1]?.opId).toBe(opId)
    }
    expect(outcomes).toEqual(['ok', 'retry', 'timeout', 'partial'])
  })
})
