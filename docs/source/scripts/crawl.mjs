/**
 * NEBULA · 爬虫
 * 抓 TRAE 社区 1024Builder 作品秀 + 盖楼主帖，产出星云图谱数据。
 *
 * 数据源：Discourse 官方 JSON API（forum.trae.cn），公开只读，无需鉴权。
 * 用法：node scripts/crawl.mjs [--out data] [--base https://forum.trae.cn]
 */

import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const args = process.argv.slice(2)
const argOf = (k, d) => {
  const i = args.indexOf(k)
  return i >= 0 && args[i + 1] ? args[i + 1] : d
}
const BASE = argOf('--base', 'https://forum.trae.cn')
const OUT = argOf('--out', 'data')
const TAG = argOf('--tag', '109')      // 1024Builder作品秀
const MAIN_TOPIC = argOf('--main', '325833') // 盖楼主帖
const CONCURRENCY = Number(argOf('--concurrency', '4'))

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

/** 爬虫活动日志 —— 前端的 CRAWLER 面板直接吃这个 */
const crawlLog = []
const t0 = Date.now()
let reqCount = 0
let bytesTotal = 0
function log(evt, detail = {}) {
  const e = { t: Date.now() - t0, evt, ...detail }
  crawlLog.push(e)
  const tag = evt.toUpperCase().padEnd(12)
  console.log(`[${String(e.t).padStart(6)}ms] ${tag} ${detail.msg ?? ''}`)
  return e
}

async function getJSON(path, { timeout = 25000, retries = 2 } = {}) {
  const url = path.startsWith('http') ? path : BASE + path
  for (let attempt = 0; attempt <= retries; attempt++) {
    const started = Date.now()
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), timeout)
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
        signal: ctrl.signal,
      })
      clearTimeout(timer)
      const text = await res.text()
      reqCount++
      bytesTotal += text.length
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      log('fetch', {
        url: url.replace(BASE, ''),
        status: res.status,
        ms: Date.now() - started,
        bytes: text.length,
        msg: `${res.status} ${url.replace(BASE, '')} (${Date.now() - started}ms)`,
      })
      return JSON.parse(text)
    } catch (err) {
      if (attempt === retries) {
        log('error', { url: url.replace(BASE, ''), msg: `失败: ${err.message}` })
        return null
      }
      await new Promise(r => setTimeout(r, 600 * (attempt + 1)))
    }
  }
  return null
}

/** HTML → 纯文本（Discourse 的 cooked 字段） */
function htmlToText(html = '') {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** 抽取正文里的链接 */
function extractLinks(html = '') {
  const out = []
  const re = /href="([^"]+)"/g
  let m
  while ((m = re.exec(html))) {
    const u = m[1]
    if (u && !u.startsWith('/u/') && !u.startsWith('/users/')) out.push(u)
  }
  return [...new Set(out)]
}

/** 抽图片 */
function extractImages(html = '') {
  const out = []
  const re = /<img[^>]+src="([^"]+)"/g
  let m
  while ((m = re.exec(html))) out.push(m[1])
  return [...new Set(out)]
}

/** 作品标题：去掉 【...】 前缀 */
function cleanTitle(t = '') {
  return t.replace(/^【[^】]*】\s*/, '').trim()
}

async function pool(items, worker, size = CONCURRENCY) {
  const results = []
  let idx = 0
  const runners = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (idx < items.length) {
      const i = idx++
      results[i] = await worker(items[i], i)
    }
  })
  await Promise.all(runners)
  return results
}

async function main() {
  await mkdir(OUT, { recursive: true })
  log('start', { msg: `爬取目标 ${BASE} · tag=${TAG} · 并发=${CONCURRENCY}` })

  // ── 1. 作品秀帖列表 ───────────────────────────────
  const tagJson = await getJSON(`/tag/${TAG}-tag/${TAG}.json`)
  if (!tagJson) throw new Error('拿不到 tag 列表')
  const topics = tagJson?.topic_list?.topics ?? []
  log('topics', { msg: `发现 ${topics.length} 个作品秀帖子` })

  // 补充：案例与作品板块也可能有漏网的
  const catJson = await getJSON('/c/10-category/10.json')
  const catTopics = (catJson?.topic_list?.topics ?? []).filter(t => /1024/i.test(t.title))
  const seen = new Set(topics.map(t => t.id))
  for (const t of catTopics) if (!seen.has(t.id)) { topics.push(t); seen.add(t.id) }
  log('topics', { msg: `合并板块后共 ${topics.length} 个` })

  // ── 2. 主活动帖（盖楼） ────────────────────────────
  // Discourse 的 post_stream.posts 只返回首批 20 条；
  // 完整楼层 id 在 post_stream.stream 里，用 /t/{id}/posts.json?post_ids[]= 批量取全文。
  const mainJson = await getJSON(`/t/topic/${MAIN_TOPIC}.json`)
  const streamIds = mainJson?.post_stream?.stream ?? []
  log('main', {
    msg: `主帖《${mainJson?.title ?? ''}》 总楼层=${mainJson?.posts_count ?? 0} stream=${streamIds.length} 浏览=${mainJson?.views ?? 0} 赞=${mainJson?.like_count ?? 0}`,
  })

  // 批量拉全部楼层正文
  const BATCH = 60
  let mainPosts = []
  for (let i = 0; i < streamIds.length; i += BATCH) {
    const chunk = streamIds.slice(i, i + BATCH)
    const qs = chunk.map(id => `post_ids[]=${id}`).join('&')
    const j = await getJSON(`/t/${MAIN_TOPIC}/posts.json?${qs}`)
    if (j?.post_stream?.posts?.length) {
      mainPosts = mainPosts.concat(j.post_stream.posts)
      log('floors', { msg: `楼层正文 ${mainPosts.length}/${streamIds.length}` })
    } else {
      log('error', { msg: `楼层批次 ${i} 拉取失败` })
    }
  }
  // 补上第一帖（post #1 官方主帖，通常不在 post_ids 里）
  const firstPost = mainJson?.post_stream?.posts?.[0]
  if (firstPost && !mainPosts.some(p => p.post_number === firstPost.post_number)) {
    mainPosts.unshift(firstPost)
  }
  log('main', { msg: `盖楼名单就绪：${mainPosts.length} 层（含官方主帖）` })

  // ── 3. 逐帖抓正文 ───────────────────────────────
  const works = await pool(topics, async (t) => {
    const j = await getJSON(`/t/topic/${t.id}.json`)
    if (!j) return null
    const posts = j?.post_stream?.posts ?? []
    const first = posts[0]
    const body = htmlToText(first?.cooked ?? '')
    const links = extractLinks(first?.cooked ?? '')
    const images = extractImages(first?.cooked ?? '')
    const replies = posts.slice(1).map(p => ({
      n: p.post_number,
      user: p.username,
      name: p.name || p.username,
      at: p.created_at,
      text: htmlToText(p.cooked ?? '').slice(0, 400),
      likes: p.actions_summary?.find(a => a.id === 2)?.count ?? 0,
    }))
    log('work', {
      id: t.id,
      msg: `《${cleanTitle(t.title).slice(0, 28)}》 正文${body.length}字 链接${links.length} 图${images.length} 回复${replies.length}`,
    })
    return {
      id: t.id,
      title: t.title,
      cleanTitle: cleanTitle(t.title),
      user: first?.username ?? '',
      displayName: first?.name || first?.username || '',
      avatar: (first?.avatar_template || '').replace('{size}', '96'),
      createdAt: t.created_at,
      createdAtEpoch: t.created_at ? Date.parse(t.created_at) : 0,
      posts: j.posts_count ?? 0,
      views: t.views ?? 0,
      likes: t.like_count ?? 0,
      category: t.category_id,
      tags: t.tags ?? [],
      body,
      bodyLength: body.length,
      links,
      images,
      replies,
      replyCount: replies.length,
    }
  })
  const validWorks = works.filter(Boolean)
  log('works', { msg: `成功解析 ${validWorks.length}/${topics.length} 个作品` })

  // ── 4. 盖楼名单 ─────────────────────────────────
  const floors = mainPosts
    .filter(p => p.post_number > 1)
    .map(p => ({
      n: p.post_number,
      user: p.username,
      name: p.name || p.username,
      avatar: (p.avatar_template || '').replace('{size}', '96'),
      at: p.created_at,
      epoch: p.created_at ? Date.parse(p.created_at) : 0,
      text: htmlToText(p.cooked ?? '').slice(0, 300),
      likes: p.actions_summary?.find(a => a.id === 2)?.count ?? 0,
    }))

  // ── 5. 参与者聚合 ───────────────────────────────
  const participants = new Map()
  const bump = (k, patch) => {
    if (!k) return
    if (!participants.has(k)) {
      participants.set(k, { user: k, name: k, works: 0, floors: 0, replies: 0, likes: 0, views: 0, avatar: '', firstAt: 0 })
    }
    const p = participants.get(k)
    Object.assign(p, patch)
  }
  for (const w of validWorks) {
    bump(w.user, { works: 1, likes: w.likes, views: w.views, avatar: w.avatar, name: w.displayName || w.user, firstAt: w.createdAtEpoch })
  }
  for (const f of floors) {
    bump(f.user, { floors: 1, likes: Math.max(0, f.likes), avatar: f.avatar, name: f.name })
  }
  for (const w of validWorks) {
    for (const r of w.replies) bump(r.user, { replies: 1 })
  }

  // ── 6. 写文件 ──────────────────────────────────
  const meta = {
    source: BASE,
    tag: TAG,
    crawledAt: new Date().toISOString(),
    elapsedMs: Date.now() - t0,
    requests: reqCount,
    bytes: bytesTotal,
    counts: {
      works: validWorks.length,
      floors: floors.length,
      participants: participants.size,
      replies: validWorks.reduce((s, w) => s + w.replyCount, 0),
    },
  }
  await writeFile(join(OUT, 'works.json'), JSON.stringify(validWorks, null, 1), 'utf8')
  await writeFile(join(OUT, 'floors.json'), JSON.stringify(floors, null, 1), 'utf8')
  await writeFile(join(OUT, 'participants.json'), JSON.stringify([...participants.values()], null, 1), 'utf8')
  await writeFile(join(OUT, 'crawl-log.json'), JSON.stringify(crawlLog, null, 1), 'utf8')
  await writeFile(join(OUT, 'meta.json'), JSON.stringify(meta, null, 1), 'utf8')

  log('done', { msg: `完成：作品${meta.counts.works} 楼层${meta.counts.floors} 参与者${meta.counts.participants} 用时${meta.elapsedMs}ms 请求${reqCount}` })
  console.log('\n=== 统计 ===')
  console.log(JSON.stringify(meta.counts, null, 1))
  console.log('top works:', validWorks.slice().sort((a, b) => b.likes - a.likes).slice(0, 5).map(w => `${w.likes}赞 ${w.cleanTitle.slice(0, 20)}`).join(' | '))
}

main().catch(err => {
  console.error('爬虫失败:', err)
  process.exit(1)
})
