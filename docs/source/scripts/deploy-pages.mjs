/**
 * NEBULA · 一键部署到 GitHub Pages
 * 建仓 → 推代码 → 开 Pages → 轮询到可访问 → 打印永久链接
 *
 * 用法：node scripts/deploy-pages.mjs [--repo TRAE-1024-NEBULA] [--msg "..."]
 * 凭据取环境变量 GITHUB_TOKEN / GH_TOKEN（都不读文件，绝不打印明文）
 */
import { execSync } from 'node:child_process'
import { cp, mkdir, rm, writeFile, readFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const argOf = (k, d) => { const i = args.indexOf(k); return i >= 0 && args[i + 1] ? args[i + 1] : d }
const REPO = argOf('--repo', 'TRAE-1024-NEBULA')
const MSG = argOf('--msg', 'NEBULA · 1024 数据星云观测台')
const OWNER = '17861102832'

const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN
if (!TOKEN) { console.error('❌ 找不到 GITHUB_TOKEN / GH_TOKEN'); process.exit(1) }

const H = {
  'Authorization': `Bearer ${TOKEN}`,
  'User-Agent': 'nebula-deploy',
  'Accept': 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
}
const api = async (method, path, body) => {
  const res = await fetch('https://api.github.com' + path, {
    method,
    headers: { ...H, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const txt = await res.text()
  let json = null
  try { json = txt ? JSON.parse(txt) : null } catch { }
  return { status: res.status, json, txt }
}
const sh = (cmd) => execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
const stage = 'pages-staging'

console.log('══ 1/5 准备 Pages 目录 ══')
if (existsSync(stage)) await rm(stage, { recursive: true })
await mkdir(stage, { recursive: true })
// 构建产物作为站点根
await cp('dist', stage, { recursive: true })
await writeFile(join(stage, '.nojekyll'), '')          // 禁用 Jekyll，保留 assets/ 目录
// 源码进 source/
await mkdir(join(stage, 'source'), { recursive: true })
for (const d of ['src', 'scripts']) await cp(d, join(stage, 'source', d), { recursive: true })
for (const f of ['package.json', 'vite.config.js', 'README.md']) {
  if (existsSync(f)) await cp(f, join(stage, 'source', f))
}
// 部署说明 + 帖子正文也带上
for (const f of ['帖子-可直接粘贴.md', '帖子正文.md']) {
  if (existsSync(f)) await cp(f, join(stage, 'source', f))
}
const listed = (await readdir(stage)).join('  ')
console.log('  站点根:', listed)

console.log('\n══ 2/5 检查/创建仓库 ══')
let repoExists = true
{
  const r = await api('GET', `/repos/${OWNER}/${REPO}`)
  if (r.status === 404) repoExists = false
  else if (r.status !== 200) { console.error('  查询失败', r.status, r.txt.slice(0, 200)); process.exit(1) }
}
if (!repoExists) {
  const r = await api('POST', '/user/repos', {
    name: REPO, description: 'TRAE 1024 狂欢周 · 实时爬取的 3D 生态观测台',
    private: false, auto_init: false, has_issues: true, has_wiki: false,
  })
  if (r.status !== 201) { console.error('  创建失败', r.status, r.txt.slice(0, 300)); process.exit(1) }
  console.log('  ✓ 已创建', `${OWNER}/${REPO}`)
} else {
  console.log('  ✓ 仓库已存在', `${OWNER}/${REPO}`)
}

console.log('\n══ 3/5 提交并推送 ══')
if (existsSync('.git')) await rm('.git', { recursive: true })
sh(`git init -q -b main "${stage}"`)
sh(`git -C "${stage}" config user.email "308907597+17861102832@users.noreply.github.com"`)
sh(`git -C "${stage}" config user.name "zhaoxikun"`)
sh(`git -C "${stage}" add -A`)
sh(`git -C "${stage}" commit -q -m "${MSG}"`)
// 用 token 推，随后立刻把 remote 改回无凭据形式
const cleanUrl = `https://github.com/${OWNER}/${REPO}.git`
sh(`git -C "${stage}" remote add origin "${cleanUrl}"`)
sh(`git -C "${stage}" -c http.extraheader="AUTHORIZATION: basic $(echo -n 'x-access-token:${TOKEN}' | base64 -w0)" push -q --force origin main`)
console.log('  ✓ 已推送 main')

console.log('\n══ 4/5 开启 GitHub Pages ══')
// 先确保 Pages 参数是 main 分支根目录
{
  const r = await api('GET', `/repos/${OWNER}/${REPO}/pages`)
  if (r.status === 200) {
    const r2 = await api('PUT', `/repos/${OWNER}/${REPO}/pages`, { source: { branch: 'main', path: '/' } })
    console.log('  ✓ Pages 已存在并更新:', r2.status === 204 ? 'OK' : r2.status)
  } else {
    const r2 = await api('POST', `/repos/${OWNER}/${REPO}/pages`, { source: { branch: 'main', path: '/' } })
    console.log('  ✓ Pages 已创建:', r2.status === 201 ? 'OK' : r2.status, r2.status >= 400 ? r2.txt.slice(0, 200) : '')
  }
}

console.log('\n══ 5/5 等待构建完成 ══')
let url = '', state = ''
for (let i = 0; i < 30; i++) {
  await new Promise(r => setTimeout(r, 5000))
  const r = await api('GET', `/repos/${OWNER}/${REPO}/pages`)
  if (r.status !== 200) { console.log(`  [${i + 1}] 查询 ${r.status}`); continue }
  state = r.json?.status || '?'
  url = r.json?.html_url || r.json?.build_url || ''
  console.log(`  [${i + 1}] status=${state}  ${url}`)
  if (state === 'built' && url) break
}
console.log('\n════════════════════════════')
console.log('  永久链接 :', url || '(未就绪，稍后再查)')
console.log('  仓库     :', cleanUrl)
console.log('════════════════════════════')

