// 语音转写：腾讯云 ASR SentenceRecognition（≤60s，wav/pcm 16k）
// 未配置密钥时返回 501 {ok:false}，客户端降级为手动输入。
// 注意：签名逻辑内联于此（Vercel ESM 打包对 _lib 子目录相对导入不稳定，见 ERR_MODULE_NOT_FOUND 事故）
import crypto from 'node:crypto'
import type { VercelRequest, VercelResponse } from '@vercel/node'

export const config = { api: { bodyParser: { sizeLimit: '10mb' } } }

function tc3Headers(secretId: string, secretKey: string, payload: string): Record<string, string> {
  const host = 'asr.tencentcloudapi.com'
  const action = 'SentenceRecognition'
  const service = 'asr'
  const ts = Math.floor(Date.now() / 1000)
  const date = new Date(ts * 1000).toISOString().slice(0, 10)
  const hashedPayload = crypto.createHash('sha256').update(payload).digest('hex')
  const canonicalRequest = [
    'POST', '/', '', `content-type:application/json; charset=utf-8\nhost:${host}\nx-tc-action:${action.toLowerCase()}`, '', 'content-type;host;x-tc-action', hashedPayload,
  ].join('\n')
  const stringToSign = ['TC3-HMAC-SHA256', ts, `${date}/${service}/tc3_request`, crypto.createHash('sha256').update(canonicalRequest).digest('hex')].join('\n')
  const kDate = crypto.createHmac('sha256', `TC3${secretKey}`).update(date).digest()
  const kService = crypto.createHmac('sha256', kDate).update(service).digest()
  const kSigning = crypto.createHmac('sha256', kService).update('tc3_request').digest()
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex')
  return {
    'Content-Type': 'application/json; charset=utf-8',
    Host: host,
    'X-TC-Action': action,
    'X-TC-Version': '2019-06-14',
    'X-TC-Timestamp': String(ts),
    Authorization: `TC3-HMAC-SHA256 Credential=${secretId}/${date}/${service}/tc3_request, SignedHeaders=content-type;host;x-tc-action, Signature=${signature}`,
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method not allowed' })
  const id = process.env.TENCENT_ASR_SECRET_ID
  const key = process.env.TENCENT_ASR_SECRET_KEY
  if (!id || !key) return res.status(501).json({ ok: false, reason: 'not_configured' })

  // Vercel Node functions: body 已按 multipart 解析需借助 form 解析；此处用简单 boundary 解析
  const contentType = req.headers['content-type'] || ''
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType)
  if (!m) return res.status(400).json({ ok: false, error: 'missing multipart boundary' })
  const boundary = m[1] || m[2]
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  const body = Buffer.concat(chunks)
  const marker = Buffer.from(`--${boundary}`)
  let audio: Buffer | null = null
  let idx = 0
  while (true) {
    const start = body.indexOf(marker, idx)
    if (start < 0) break
    const headEnd = body.indexOf('\r\n\r\n', start)
    if (headEnd < 0) break
    const next = body.indexOf(marker, headEnd)
    const part = body.subarray(headEnd + 4, next - 2 >= 0 ? next - 2 : next)
    if (body.subarray(start, headEnd).toString().includes('name="audio"')) audio = part
    idx = next
    if (next < 0) break
  }
  if (!audio || !audio.length) return res.status(400).json({ ok: false, error: 'audio part missing' })

  const b64 = audio.toString('base64')
  const payload = JSON.stringify({
    ProjectId: 0,
    SubServiceType: 2,
    EngSerViceType: '16k',
    SourceType: 1,
    VoiceFormat: 'wav',
    UsrAudioKey: 'place-journal',
    Data: b64,
    DataLen: audio.length,
  })
  const j = await (await fetch('https://asr.tencentcloudapi.com', {
    method: 'POST',
    headers: tc3Headers(id, key, payload),
    body: payload,
  })).json() as any
  if (j?.Response?.Error) return res.status(502).json({ ok: false, error: j.Response.Error.Message || 'ASR error' })
  return res.status(200).json({ ok: true, text: j?.Response?.Result ?? '' })
}
