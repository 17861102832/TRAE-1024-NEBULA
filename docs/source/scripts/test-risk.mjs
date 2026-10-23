/**
 * NEBULA · RISK 联动实测
 * 点 RISK 行 → 星云高亮 → SELECT 栏显示计数 → 再点恢复
 */
import { chromium } from 'playwright-core'
import { existsSync } from 'node:fs'

const args = process.argv.slice(2)
const argOf = (k, d) => { const i = args.indexOf(k); return i >= 0 && args[i + 1] ? args[i + 1] : d }
const URL = argOf('--url', 'http://127.0.0.1:4173/')
const SHOT = argOf('--shot', 'screenshots/risk.png')

const CANDIDATES = [
  'C:\\Users\\赵锡坤\\AppData\\Local\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe',
  'C:\\Users\\赵锡坤\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
]
const exe = CANDIDATES.find(p => existsSync(p))

const browser = await chromium.launch({ executablePath: exe, headless: false, args: ['--window-size=1600,990'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const errs = []
page.on('pageerror', e => errs.push(e.message.slice(0, 200)))
page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)) })

await page.goto(URL, { waitUntil: 'networkidle', timeout: 45000 })
await page.waitForTimeout(9000)

// 采集初始材质状态
const snap = () => page.evaluate(() => {
  const fg = window.__fg
  const objs = window.__nebulaObjs
  let bright = 0, dim = 0, outlineOn = 0, red = 0
  if (objs) {
    for (const [, st] of objs) {
      if (!st.isWork) continue
      if (st.cardO > 0.5) bright++
      else dim++
      if (st.outlineO > 0.05) outlineOn++
      if (st.halo && st.halo.material.color.getHex() === 0xff2e88) red++
    }
  }
  return {
    bright, dim, outlineOn, red,
    sel: document.querySelector('#iSel')?.textContent,
    activeRows: document.querySelectorAll('.risk-row.active').length,
    fills: [...document.querySelectorAll('.fill-cell')].map(e => e.querySelector('.l')?.textContent),
    tbTitleDisplay: getComputedStyle(document.querySelector('#tbTitle')).display,
  }
})

console.log('[RISK] 初始:', JSON.stringify(await snap()))

// 点第 1 行（无 Demo 链接）
await page.click('.risk-row:nth-child(1)')
await page.waitForTimeout(500)
const after = await snap()
console.log('[RISK] 点击"无 Demo"后:', JSON.stringify(after))
await page.screenshot({ path: SHOT })
console.log('[RISK] 截图 →', SHOT)

// 点第 3 行（正文过短）→ 切换
await page.click('.risk-row:nth-child(3)')
await page.waitForTimeout(500)
console.log('[RISK] 切换到"正文过短":', JSON.stringify(await snap()))

// 再点同一行 → 恢复
await page.click('.risk-row:nth-child(3)')
await page.waitForTimeout(500)
const restored = await snap()
console.log('[RISK] 再点恢复:', JSON.stringify(restored))

// 断言
const checks = [
  ['点击后有高亮节点', after.bright > 0],
  ['点击后有描边', after.outlineOn > 0],
  ['未命中节点被降暗', after.dim > 0],
  ['SELECT 显示已筛选', String(after.sel || '').includes('已筛选')],
  ['有 active 行', after.activeRows === 1],
  ['恢复后无高亮', restored.bright === 0 && restored.outlineOn === 0],
  ['恢复后 SELECT 复位', String(restored.sel || '').includes('点击星点检视')],
  ['FILL 已换总楼层', restored.fills.includes('总楼层')],
  ['FILL 已无总浏览', !restored.fills.includes('总浏览')],
]
console.log('\n=== 验收 ===')
let pass = 0
for (const [name, ok] of checks) { console.log((ok ? '  ✓ ' : '  ✗ ') + name); if (ok) pass++ }
console.log(`\n${pass}/${checks.length} 通过`)
console.log('页面错误:', errs.length ? errs.slice(0, 5) : '无')

await browser.close()
process.exit(pass === checks.length ? 0 : 1)
