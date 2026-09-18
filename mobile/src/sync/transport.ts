// push transport 抽象 + 测试 mock（T067 本地段；真 Supabase 接线留后续 Task）。
//
// dispatcher（`push.ts`）只管 DAG 解锁、认领、重试/停放/超时与 owner 前置；
// 「怎么把 op 发到云端」全部收口在本接口后面。真实现（PostgREST/Storage）后续 Task
// 按 8 表合同把 `PushOpPayload` 映射成云端行后接入，dispatcher 不改。
//
// mock 覆盖四种结局：ok / retry（失败）/ timeout / partial（半成品，如 display 已传、
// thumb 未传）。dispatcher 只认 `ok` 为父节点达成，其余都算「未成功」，子节点不解锁。

import type { OutboxOpKind } from './outbox'

/** 传输结局；仅 `ok` 代表父节点达成。 */
export type TransportOutcome = 'ok' | 'retry' | 'timeout' | 'partial'

/** 交给 transport 的逻辑 op（幂等键 = opId，与 outbox.op_id 同源）。 */
export interface PushOpPayload {
  opId: string
  kind: OutboxOpKind
  entityId?: string
  entityIds?: string[]
  dependsOn: string[]
}

export interface TransportResult {
  outcome: TransportOutcome
  error?: string
  /** partial 时已完成的子步骤（诊断/幂等校准用）。 */
  completedSteps?: string[]
  /** 真实现回读/落盘结果（如 remote path）；mock 可透传。 */
  data?: Record<string, unknown>
}

export interface PushTransport {
  send(op: PushOpPayload): Promise<TransportResult>
}

export interface MockTransportStep {
  outcome?: TransportOutcome
  error?: string
  /** 模拟慢请求；配 dispatcher 的小超时即可触发单 op 超时。 */
  delayMs?: number
  completedSteps?: string[]
  data?: Record<string, unknown>
}

export type MockTransportHandler = (op: PushOpPayload, callIndex: number) => MockTransportStep

export interface MockTransport extends PushTransport {
  /** 按调用顺序记录的 op（断言 DAG 顺序/子节点未发送用）。 */
  readonly calls: PushOpPayload[]
  reset(): void
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 可编排 mock：`handler` 按 op 与调用序号返回结局；缺省全成功。
 * 不触网、无凭据，用于单测成功/失败/超时/半成品四种路径。
 */
export function createMockTransport(handler: MockTransportHandler = () => ({ outcome: 'ok' })): MockTransport {
  const calls: PushOpPayload[] = []
  return {
    calls,
    reset() {
      calls.length = 0
    },
    async send(op) {
      const step = handler(op, calls.length)
      calls.push(op)
      if (step.delayMs && step.delayMs > 0) await delay(step.delayMs)
      return {
        outcome: step.outcome ?? 'ok',
        error: step.error,
        completedSteps: step.completedSteps,
        data: step.data,
      }
    },
  }
}
