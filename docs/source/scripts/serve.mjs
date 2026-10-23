/**
 * NEBULA · 零依赖静态服务器
 * 为什么不用 vite preview：Vite 6+ 的 allowedHosts 会校验 Host 头，
 * 隧道域名（xxx.trycloudflare.com）不在白名单 → 直接 403。
 * 这个服务器不做任何 Host 校验，只管发文件。
 */
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { join, extname, normalize } from 'node:path'

const ROOT = process.argv[2] || 'dist'
const PORT = Number(process.argv[3] || 4173)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.webm': 'video/webm', '.woff2': 'font/woff2', '.map': 'application/json',
}

createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    if (p === '/' || p === '') p = '/index.html'
    // 防目录穿越
    const safe = normalize(p).replace(/^(\.\.[/\\])+/, '')
    let file = join(ROOT, safe)
    const st = await stat(file).catch(() => null)
    if (st && st.isDirectory()) file = join(file, 'index.html')
    const buf = await readFile(file)
    res.writeHead(200, {
      'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
    })
    res.end(buf)
  } catch (e) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('404 Not Found: ' + req.url)
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`[SERVE] ${ROOT} → http://127.0.0.1:${PORT}/`)
})
