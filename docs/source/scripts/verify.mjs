/**
 * NEBULA · 有头浏览器验证 + 截图/录屏
 * headless Chrome 没有合成器 → rAF 只有 1fps，必须 headed 才能测真实帧率。
 *
 * 用法：node scripts/verify.mjs [--url http://127.0.0.1:5183/] [--shot out.png] [--video out.webm]
 */
import { chromium } from 'playwright-core'
import { existsSync } from 'node:fs'

const args = process.argv.slice(2)
const argOf = (k, d) => { const i = args.indexOf(k); return i >= 0 && args[i + 1] ? args[i + 1] : d }
const URL = argOf('--url', 'http://127.0.0.1:5183/')
const SHOT = argOf('--shot', 'screenshots/nebula.png')
const VIDEO = argOf('--video', '')
const WAIT = Number(argOf('--wait', '14'))
const W = Number(argOf('--w', '1600'))
const H = Number(argOf('--h', '900'))

// 优先用完整 chromium（headed 需要），退回系统 Chrome
const CANDIDATES = [
  'C:\\Users\\赵锡坤\\AppData\\Local\\ms-playwright\\chromium-1234\\chrome-win64\\chrome.exe',
  'C:\\Users\\赵锡坤\\AppData\\Local\\ms-playwright\\chromium-1200\\chrome-win64\\chrome.exe',
  'C:\\Users\\赵锡坤\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
]
const exe = CANDIDATES.find(p => existsSync(p))
if (!exe) { console.error('找不到浏览器'); process.exit(1) }
console.log('[VERIFY] 浏览器:', exe)

const browser = await chromium.launch({
  executablePath: exe,
  headless: false,
  args: ['--window-size=' + W + ',' + (H + 90), '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--autoplay-policy=no-user-gesture-required'],
})
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, recordVideo: VIDEO ? { dir: 'screenshots/video', size: { width: W, height: H } } : undefined })
const page = await ctx.newPage()

const errors = []
page.on('console', m => { if (m.type() === 'error' || m.type() === 'exception') errors.push(m.text().slice(0, 220)) })
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message.slice(0, 220)))

console.log('[VERIFY] 打开', URL)
// ★ 不用 networkidle —— 页面持续动画/轮询时它可能永远不 idle
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('#mWorks:not(:empty)', { timeout: 30000 })
await page.waitForTimeout(WAIT * 1000)

// 测真实帧率（rAF 频率）
const perf = await page.evaluate(async () => {
  const t0 = performance.now()
  let raf = 0
  const step = () => { raf++; if (performance.now() - t0 < 2000) requestAnimationFrame(step) }
  requestAnimationFrame(step)
  const fg = window.__fg
  let rend = 0
  if (fg) { const r = fg.renderer(); const o = r.render.bind(r); r.render = (s, c) => { rend++; o(s, c) } }
  await new Promise(r => setTimeout(r, 2100))
  const bb = fg && fg.getGraphBbox ? fg.getGraphBbox() : null
  return {
    rafFps: +(raf / 2).toFixed(1),
    renderFps: +(rend / 2).toFixed(1),
    coord: document.querySelector('#iCoord')?.textContent,
    uiFps: document.querySelector('#iFps')?.textContent,
    crawlerRows: document.querySelector('#crawlerStream')?.children.length,
    works: document.querySelector('#mWorks')?.textContent,
    floors: document.querySelector('#mFloors')?.textContent,
    builders: document.querySelector('#mBuilders')?.textContent,
    edges: document.querySelector('#mEdges')?.textContent,
    bboxSpan: bb ? Math.round(Math.max(bb.x[1] - bb.x[0], bb.y[1] - bb.y[0], bb.z[1] - bb.z[0])) : null,
    bootGone: !document.querySelector('#boot'),
  }
})
console.log('[VERIFY] 运行时指标:', JSON.stringify(perf, null, 1))
console.log('[VERIFY] 控制台错误:', errors.length ? errors.slice(0, 6) : '无')

await page.screenshot({ path: SHOT })
console.log('[VERIFY] 截图 →', SHOT)

if (VIDEO) {
  // ★ 顺序：page.close() → context.close()（视频在此刻才真正落盘）→ video.saveAs()
  const video = page.video()
  await page.close()
  await ctx.close()
  await video.saveAs(VIDEO)
  console.log('[VERIFY] 录屏 →', VIDEO)
}

await browser.close()
console.log('[VERIFY] 完成')
