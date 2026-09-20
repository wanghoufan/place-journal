// AI 模型设置页（TASK-PWA-AI-01）：三家 provider 各选/自填模型名，存本机 localStorage。
// Key 绝不进前端：本页只发送模型名（modelOverrides），服务端用环境变量里的 Key 去调用。
import { useEffect, useState } from 'react'
import { PageHeader } from '../components/ui'
import {
  AI_MODEL_PLACEHOLDER,
  AI_MODEL_PRESETS,
  AI_PROVIDERS,
  AI_PROVIDER_LABELS,
  loadModelOverrides,
  saveModelOverrides,
  type AiModelOverrides,
  type AiProviderId,
} from '../lib/aiSettings'
import { AI_PROBE_TEXT, testAiProvider, type AiProviderTest } from '../lib/organize'

export default function AiSettings() {
  const [models, setModels] = useState<AiModelOverrides>(() => loadModelOverrides())
  const [tests, setTests] = useState<Partial<Record<AiProviderId, AiProviderTest>>>({})
  const [testing, setTesting] = useState<AiProviderId | 'all' | ''>('')
  const [saved, setSaved] = useState('')

  useEffect(() => {
    if (!saved) return
    const t = setTimeout(() => setSaved(''), 2200)
    return () => clearTimeout(t)
  }, [saved])

  function commit(next: AiModelOverrides) {
    setModels(saveModelOverrides(next))
    setSaved('已保存到本机 ✓')
  }

  function setModel(id: AiProviderId, value: string) {
    const next: AiModelOverrides = { ...models }
    if (value.trim()) next[id] = value
    else delete next[id]
    commit(next)
  }

  async function runTest(ids: AiProviderId[]) {
    if (testing) return
    setTesting(ids.length === 1 ? ids[0] : 'all')
    for (const id of ids) {
      const r = await testAiProvider(id, { modelOverrides: models })
      setTests((prev) => ({ ...prev, [id]: r }))
    }
    setTesting('')
  }

  return (
    <div className="min-h-screen safe-bottom">
      <PageHeader title="AI 模型设置" back />
      <div className="px-5 space-y-3 pb-4">
        <div className="card-paper p-4 space-y-2 text-sm">
          <p className="font-bold text-base">🧠 模型名怎么填</p>
          <p className="text-xs text-inkmuted leading-relaxed">
            下拉里是现行可用的模型名，选一个即可；以后厂商改名，直接在下面文本框手填新名字。
            留空＝用服务端环境变量里的默认值。
          </p>
          <p className="text-xs text-inkmuted leading-relaxed">
            🔒 这里只保存「模型名」在你手机上；API Key 只在服务端环境变量，永远不会下发到浏览器。
          </p>
          {saved && <p className="text-xs text-moss">{saved}</p>}
        </div>

        {AI_PROVIDERS.map((id) => {
          const value = models[id] ?? ''
          const isPreset = AI_MODEL_PRESETS[id].includes(value)
          return (
            <div key={id} className="card-paper p-4 space-y-2.5 text-sm">
              <div className="flex items-center justify-between gap-2">
                <p className="font-bold text-base">{AI_PROVIDER_LABELS[id]}</p>
                <TestButton
                  running={testing === id || testing === 'all'}
                  onClick={() => runTest([id])}
                />
              </div>
              <select
                className="w-full rounded-xl border border-line bg-carddeep px-3 py-2.5 text-sm"
                value={value}
                onChange={(e) => setModel(id, e.target.value)}
              >
                <option value="">默认（跟服务端环境变量）</option>
                {AI_MODEL_PRESETS[id].map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
                {value && !isPreset && <option value={value}>自定义</option>}
              </select>
              <input
                className="w-full rounded-xl border border-line bg-carddeep px-3 py-2.5 text-sm"
                value={value}
                placeholder={AI_MODEL_PLACEHOLDER[id]}
                onChange={(e) => setModel(id, e.target.value)}
              />
              <TestResult test={tests[id]} />
            </div>
          )
        })}

        <button
          className="btn-primary w-full py-3"
          disabled={!!testing}
          onClick={() => runTest(AI_PROVIDERS)}
        >
          {testing === 'all' ? '逐个测试中…' : '测试全部通道'}
        </button>
        <p className="text-xs text-inkmuted leading-relaxed">
          测试会用固定的一小段文本真调一次各家模型（{AI_PROBE_TEXT.slice(0, 12)}…），只显示结果与耗时，不写入你的任何数据；
          未配 Key 的通道会显示「未配置」。
        </p>
      </div>
    </div>
  )
}

function TestButton({ running, onClick }: { running: boolean; onClick: () => void }) {
  return (
    <button className="chip !py-1 shrink-0" disabled={running} onClick={onClick}>
      {running ? '测试中…' : '测试连通性'}
    </button>
  )
}

function TestResult({ test }: { test?: AiProviderTest }) {
  if (!test) return null
  const secs = (test.ms / 1000).toFixed(1)
  return test.ok ? (
    <p className="text-xs text-moss leading-relaxed">
      可用 · {test.model || '服务端默认模型'} · {secs}s
    </p>
  ) : (
    <p className="text-xs text-terradeep leading-relaxed">不可用：{test.message || '失败'}（{secs}s）</p>
  )
}
