// 腾讯云 TC3-HMAC-SHA256 签名（服务端专用；密钥只存在于环境变量）
import crypto from 'node:crypto'

export interface Tc3Options {
  secretId: string
  secretKey: string
  service: string
  host: string
  action: string
  version: string
  payload: string // JSON string
  timestamp?: number
}

export function tc3SignatureHeaders(o: Tc3Options): Record<string, string> {
  const ts = o.timestamp ?? Math.floor(Date.now() / 1000)
  const date = new Date(ts * 1000).toISOString().slice(0, 10)
  const hashedPayload = crypto.createHash('sha256').update(o.payload).digest('hex')
  const canonicalRequest = [
    'POST', '/', '', `content-type:application/json; charset=utf-8\nhost:${o.host}\nx-tc-action:${o.action.toLowerCase()}`, '', `content-type;host;x-tc-action`, hashedPayload,
  ].join('\n')
  const stringToSign = ['TC3-HMAC-SHA256', ts, `${date}/${o.service}/tc3_request`, crypto.createHash('sha256').update(canonicalRequest).digest('hex')].join('\n')
  const kDate = crypto.createHmac('sha256', `TC3${o.secretKey}`).update(date).digest()
  const kService = crypto.createHmac('sha256', kDate).update(o.service).digest()
  const kSigning = crypto.createHmac('sha256', kService).update('tc3_request').digest()
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex')
  const auth = `TC3-HMAC-SHA256 Credential=${o.secretId}/${date}/${o.service}/tc3_request, SignedHeaders=content-type;host;x-tc-action, Signature=${signature}`
  return {
    'Content-Type': 'application/json; charset=utf-8',
    Host: o.host,
    'X-TC-Action': o.action,
    'X-TC-Version': o.version,
    'X-Timestamp': String(ts),
    Authorization: auth,
  }
}

export async function tencentCall(o: Omit<Tc3Options, 'timestamp'>): Promise<any> {
  const headers = tc3SignatureHeaders({ ...o, timestamp: Math.floor(Date.now() / 1000) })
  const r = await fetch(`https://${o.host}`, { method: 'POST', headers, body: o.payload })
  return r.json()
}
