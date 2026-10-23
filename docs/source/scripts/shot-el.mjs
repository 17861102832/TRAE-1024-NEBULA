/** 截取指定元素的原分辨率截图（不被缩放干扰） */
import { chromium } from 'playwright-core'
import { existsSync } from 'node:fs'

const args = process.argv.slice(2)
const argOf = (k, d) => { const i = args.indexOf(k); return i >= 0 && args[i + 1] ? args[i + 1] : d }
const URL = argOf('--url', 'http://127.0.0.1:4173/')
const SEL = argOf('--sel', '#mod-crawler')
const OUT = argOf('--out', 'screenshots/el.png')
const WAIT = Number(argOf('--wait', '12'))

const exe = [
  'C:\\Users\\赵锡坤\\AppData\\Local\\ms-playwright\\chromium-1234\\chrome-win64\\chrome.exe',
  'C:\\Users\\赵锡坤\\AppData\\Local\\ms-playwright\\chromium-1200\\chrome-win64\\chrome.exe',
  'C:\\Users\\赵锡坤\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
].find(p => existsSync(p))

const browser = await chromium.launch({ executablePath: exe, headless: false, args: ['--window-size=1600,990'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 })
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('#mWorks:not(:empty)', { timeout: 30000 })
await page.waitForTimeout(WAIT * 1000)

const el = await page.$(SEL)
if (!el) { console.error('未找到元素', SEL); process.exit(1) }
await el.screenshot({ path: OUT })
console.log('[SHOT] 元素截图 →', OUT)

const info = await page.evaluate((sel) => {
  const s = document.querySelector(sel)
  const kids = [...s.querySelectorAll('.cl')]
  return { rows: kids.length, texts: kids.slice(0, 6).map(k => k.textContent.trim().slice(0, 50)) }
}, SEL)
console.log('[SHOT] 面板内行数:', info.rows)
info.texts.forEach(t => console.log('   ', t))

await browser.close()
