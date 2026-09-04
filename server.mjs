// 自托管 Runtime（Docker 规范 V1.0）：静态 dist + /api（与 Vercel Functions 同一实现）。
// 私密 Key（腾讯 ASR / 大模型）只经环境变量进入容器，绝不进镜像层与 Git。
// Dockerfile 构建阶段用 esbuild 把 api/*.ts 打包为 dist-api/*.cjs；缺失时 /api 返回 501 降级。
import http from 'node:http'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.join(__dirname, 'dist')
const PORT = Number(process.env.PORT || 3000)

async function loadHandler(name) {
  try {
    // esbuild CJS interop 会把 export default 包成 { default: { default: fn } }，逐层解到函数为止
    let h = await import(`./dist-api/${name}.cjs`)
    for (let i = 0; i < 3 && h && typeof h !== 'function'; i++) h = h.default
    return typeof h === 'function' ? h : null
  } catch {
    return null
  }
}

const handlers = {
  '/api/transcribe': await loadHandler('transcribe'),
  '/api/ai-organize': await loadHandler('ai-organize'),
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json',
  '.webmanifest': 'application/manifest+json',
}

// ai-organize 依赖 Vercel 预解析的 req.body；自托管时在此读 JSON 挂上
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      try { req.body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') } catch { req.body = {} }
      resolve()
    })
    req.on('error', reject)
  })
}

function sendJson(res, status, obj) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(obj))
}

const server = http.createServer(async (req, res) => {
  const url = (req.url || '/').split('?')[0]

  // 健康端点（部署验证 §5.1：容器 Up/HTTP 200 仅代表 Runtime 层）
  if (url === '/healthz') return sendJson(res, 200, { ok: true, uptime: process.uptime() })

  // /api：与 Vercel Functions 完全同一实现（transcribe 自行解析流式 multipart；
  // ai-organize 需要预挂 req.body）
  if (url.startsWith('/api/')) {
    const h = handlers[url]
    if (!h) return sendJson(res, 501, { ok: false, reason: 'not_configured' })
    try {
      if (url === '/api/ai-organize') await readJsonBody(req)
      await h(req, res)
    } catch (e) {
      if (!res.headersSent) sendJson(res, 500, { ok: false, error: e?.message || 'internal error' })
    }
    return
  }

  // 静态文件 + SPA fallback
  const rel = url === '/' ? 'index.html' : url.slice(1)
  const file = path.normalize(path.join(DIST, rel))
  if (!file.startsWith(DIST)) { res.writeHead(403); return res.end() }
  try {
    const data = await fs.readFile(file)
    res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' })
    res.end(data)
  } catch {
    try {
      const data = await fs.readFile(path.join(DIST, 'index.html'))
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(data)
    } catch {
      sendJson(res, 404, { ok: false, error: 'dist not built' })
    }
  }
})

server.listen(PORT, () => {
  console.log(`[personal-checkin] listening on :${PORT} (PUBLIC_APP_URL=${process.env.PUBLIC_APP_URL || 'unset'})`)
})
