/**
 * NEBULA · 发布到已存在仓库的 GitHub Pages
 * 策略：不动仓库可见性、不动根目录 README —— Pages 内容放 docs/，从 main:/docs 发布
 *
 * 用法：node scripts/publish.mjs --repo TRAE-1024-NEBULA [--path docs]
 */
import { execSync } from 'node:child_process'
import { cp, mkdir, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const argOf = (k, d) => { const i = args.indexOf(k); return i >= 0 && args[i + 1] ? args[i + 1] : d }
const REPO = argOf('--repo', '-')
const OWNER = argOf('--owner', '17861102832')
const PATH = argOf('--path', 'docs')
const MSG = argOf('--msg', 'NEBULA · 1024 数据星云观测台')
const MAKE_PUBLIC = args.includes('--public')

const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN
if (!TOKEN) { console.error('❌ 没有 token'); process.exit(1) }

const H = {
  'Authorization': `Bearer ${TOKEN}`,
  'User-Agent': 'nebula-deploy',
  'Accept': 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
}
const api = async (m, p, body) => {
  const r = await fetch('https://api.github.com' + p, {
    method: m, headers: { ...H, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const t = await r.text()
  let j = null; try { j = t ? JSON.parse(t) : null } catch { }
  return { status: r.status, json: j, txt: t }
}
const sh = c => execSync(c, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

console.log('══ 1/5 组装站点 ══')
const stage = 'pages-staging'
if (existsSync(stage)) await rm(stage, { recursive: true })
await mkdir(stage, { recursive: true })
const site = join(stage, PATH)
await mkdir(site, { recursive: true })
await cp('dist', site, { recursive: true })
await writeFile(join(site, '.nojekyll'), '')
// 源码 + 文档放进 site/source（随站点一起发布）
await mkdir(join(site, 'source'), { recursive: true })
for (const d of ['src', 'scripts']) await cp(d, join(site, 'source', d), { recursive: true })
for (const f of ['package.json', 'vite.config.js', 'README.md', '帖子-可直接粘贴.md']) {
  if (existsSync(f)) await cp(f, join(site, 'source', f))
}
console.log(`  站点 → ${stage}/${PATH}/`)

console.log('\n══ 2/5 仓库准备 ══')
{
  const r = await api('GET', `/repos/${OWNER}/${REPO}`)
  if (r.status !== 200) { console.error('  仓库不存在:', r.status); process.exit(1) }
  console.log(`  ${r.json.full_name}  private=${r.json.private}  pages=${r.json.has_pages}`)
  if (MAKE_PUBLIC && r.json.private) {
    const p = await api('PATCH', `/repos/${OWNER}/${REPO}`, { private: false })
    console.log('  ✓ 设为公开:', p.status === 200 ? 'OK' : p.status, p.status >= 400 ? p.txt.slice(0, 160) : '')
  }
}

console.log('\n══ 3/5 提交并推送 ══')
const wt = 'pages-wt'
if (existsSync(wt)) await rm(wt, { recursive: true })
await cp(stage, wt, { recursive: true })
if (existsSync(join(wt, '.git'))) await rm(join(wt, '.git'), { recursive: true })
sh(`git init -q -b main "${wt}"`)
sh(`git -C "${wt}" config user.email "308907597+17861102832@users.noreply.github.com"`)
sh(`git -C "${wt}" config user.name "zhaoxikun"`)
sh(`git -C "${wt}" add -A`)
sh(`git -C "${wt}" commit -q -m "${MSG}"`)
// 保留原仓库的根目录 README（如果站点不在根目录）
{
  const r = await api('GET', `/repos/${OWNER}/${REPO}/contents/README.md`)
  if (r.status === 200 && PATH !== '' && PATH !== '/') {
    const orig = Buffer.from(r.json.content, 'base64')
    const { writeFile: wf } = await import('node:fs/promises')
    await wf(join(wt, 'README.md'), orig)
    sh(`git -C "${wt}" add -A`)
    sh(`git -C "${wt}" commit -q -m "保留原 README"`)
    console.log('  ✓ 已保留原 README.md')
  }
}
const cleanUrl = `https://github.com/${OWNER}/${REPO}.git`
sh(`git -C "${wt}" remote add origin "${cleanUrl}"`)
const auth = Buffer.from(`x-access-token:${TOKEN}`).toString('base64')
sh(`git -C "${wt}" -c http.extraheader="AUTHORIZATION: basic ${auth}" push -q --force origin main`)
console.log('  ✓ 已推送 main')

console.log('\n══ 4/5 开启 Pages ══')
{
  const cur = await api('GET', `/repos/${OWNER}/${REPO}/pages`)
  const body = { source: { branch: 'main', path: PATH } }
  let r
  if (cur.status === 200) { r = await api('PUT', `/repos/${OWNER}/${REPO}/pages`, body); console.log('  更新 Pages →', r.status) }
  else { r = await api('POST', `/repos/${OWNER}/${REPO}/pages`, body); console.log('  创建 Pages →', r.status, r.status >= 400 ? r.txt.slice(0, 220) : '') }
}

console.log('\n══ 5/5 等待构建 ══')
let url = ''
for (let i = 0; i < 24; i++) {
  await new Promise(r => setTimeout(r, 5000))
  const r = await api('GET', `/repos/${OWNER}/${REPO}/pages`)
  if (r.status !== 200) { console.log(`  [${i + 1}] ${r.status} ${r.txt.slice(0, 120)}`); continue }
  console.log(`  [${i + 1}] status=${r.json.status} url=${r.json.html_url || ''}`)
  if (r.json.status === 'built') { url = r.json.html_url; break }
}
console.log('\n════════════════════════════════')
console.log('  Pages URL :', url || '(未就绪)')
console.log('  仓库      :', cleanUrl)
console.log('════════════════════════════════')
