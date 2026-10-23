/**
 * NEBULA · 图谱构建器
 * 把 works.json / floors.json / participants.json → 星云图谱 (nodes + links)
 *
 * 设计：
 *   - 参与者 = 主星（恒星），有作品的人是亮星
 *   - 作品 = 卫星，挂在作者星旁边
 *   - 盖楼 = 星与星之间的连线（同一楼层的人互相连接）
 *   - 回复 = 作品卫星到评论者的连线
 */

import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const OUT = process.argv[2] || 'data'

const read = async (f) => JSON.parse(await readFile(join(OUT, f), 'utf8'))
const works = await read('works.json')
const floors = await read('floors.json')
const participants = await read('participants.json')
const meta = await read('meta.json')
const crawlLog = await read('crawl-log.json')

const nodes = []
const links = []

/** 节点 id 命名空间：p=参与者 w=作品 */
const pid = (u) => `p:${u}`
const wid = (id) => `w:${id}`

// ── 1. 主星：参与者 ───────────────────────────────
const partMap = new Map(participants.map(p => [p.user, p]))
// 盖楼者也算参与者（participants.json 已合并，但再兜一次）
const floorByUser = new Map()
for (const f of floors) {
  if (!floorByUser.has(f.user)) floorByUser.set(f.user, [])
  floorByUser.get(f.user).push(f)
}

const allUsers = new Set([...partMap.keys(), ...floorByUser.keys()])
for (const u of allUsers) {
  const p = partMap.get(u) ?? { user: u, name: u, works: 0, floors: 0, replies: 0, likes: 0, views: 0, avatar: '' }
  const workList = works.filter(w => w.user === u)
  const fl = floorByUser.get(u) ?? []
  const totalActivity = p.works * 3 + p.floors + p.replies * 0.5 + p.likes
  nodes.push({
    id: pid(u),
    type: 'person',
    label: p.name && p.name !== u ? p.name : u,
    user: u,
    avatar: p.avatar || fl[0]?.avatar || '',
    works: p.works,
    floors: p.floors,
    replies: p.replies,
    likes: p.likes,
    views: p.views,
    activity: totalActivity,
    hasWork: workList.length > 0,
    firstAt: Math.min(...[...fl.map(x => x.epoch), ...workList.map(x => x.createdAtEpoch)].filter(Boolean), Infinity) || 0,
    title: workList[0]?.cleanTitle ?? '',
  })
}

// ── 2. 卫星：作品 ───────────────────────────────
for (const w of works) {
  nodes.push({
    id: wid(w.id),
    type: 'work',
    label: w.cleanTitle,
    title: w.cleanTitle,
    user: w.user,
    author: w.displayName || w.user,
    avatar: w.avatar,
    topicId: w.id,
    body: w.body,
    bodyLength: w.bodyLength,
    links: w.links,
    images: w.images,
    views: w.views,
    likes: w.likes,
    posts: w.posts,
    replyCount: w.replyCount,
    createdAt: w.createdAt,
    epoch: w.createdAtEpoch,
    tags: w.tags,
    url: `https://forum.trae.cn/t/topic/${w.id}`,
  })
  if (nodes.some(n => n.id === pid(w.user))) {
    links.push({ source: pid(w.user), target: wid(w.id), kind: 'author', weight: 1 })
  }
}

// ── 3. 连线：盖楼（同一楼层的人连起来）────────────────
const floorLinks = []
for (const f of floors) {
  if (f.n <= 2) continue
  // 连到主帖作者（TRAE-小阳），形成"盖楼射线"
  if (nodes.some(n => n.id === pid('TRAE-小阳'))) {
    floorLinks.push({ source: pid('TRAE-小阳'), target: pid(f.user), kind: 'floor', weight: 0.6, floor: f.n })
  }
}
links.push(...floorLinks)

// 同楼层的连续楼之间连一条弱边（体现"排队盖楼"的队伍）
const sortedFloors = floors.filter(f => f.n > 2).sort((a, b) => a.n - b.n)
for (let i = 1; i < sortedFloors.length; i++) {
  const a = sortedFloors[i - 1], b = sortedFloors[i]
  if (b.n - a.n <= 3) {
    links.push({ source: pid(a.user), target: pid(b.user), kind: 'queue', weight: 0.25 })
  }
}

// ── 4. 连线：作品回复者 ─────────────────────────
for (const w of works) {
  for (const r of w.replies) {
    if (!nodes.some(n => n.id === pid(r.user))) {
      nodes.push({
        id: pid(r.user), type: 'person', label: r.name || r.user, user: r.user,
        avatar: '', works: 0, floors: 0, replies: 0, likes: 0, views: 0,
        activity: 0.5, hasWork: false, firstAt: 0, title: '',
      })
    }
    links.push({ source: wid(w.id), target: pid(r.user), kind: 'reply', weight: 0.8 })
  }
}

// ── 5. 统计面板数据（HUD 用）────────────────────
const totalLikes = works.reduce((s, w) => s + w.likes, 0)
const totalViews = works.reduce((s, w) => s + w.views, 0)
const totalWords = works.reduce((s, w) => s + w.bodyLength, 0)
const totalLinksInWorks = works.reduce((s, w) => s + w.links.length, 0)

// 24 小时发帖热度（K 线）
const hours = Array.from({ length: 24 }, () => ({ h: 0, views: 0, likes: 0 }))
for (const w of works) {
  if (!w.createdAtEpoch) continue
  const d = new Date(w.createdAtEpoch)
  const h = d.getHours()
  hours[h].h++
  hours[h].views += w.views
  hours[h].likes += w.likes
}

// 作品类型关键词（用标题/正文做粗分类，用于 HUD 的 SIZE 模块）
const KW = [
  { k: '游戏/互动', re: /游戏|塔防|贪吃蛇|连连看|消消|挑战|摸鱼|打牌|宠物|彩蛋|小程序/i },
  { k: '工具/效率', re: /工具|效率|记账|课表|监控|分析|平台|系统|助手|检测/i },
  { k: '视觉/设计', re: /图|画|设计|3D|渲染|名片|宣传图|彩铅|全息|特效/i },
  { k: 'AI/LLM', re: /AI|LLM|大模型|Agent|智能/i },
  { k: '量化/数据', re: /量化|风控|数据|驾驶舱|看板|仪表/i },
  { k: '硬件/IoT', re: /硬件|空调|设备|IoT|传感器|物理/i },
]
const categories = {}
for (const w of works) {
  let cat = '其他'
  for (const { k, re } of KW) if (re.test(w.title + ' ' + w.body.slice(0, 300))) { cat = k; break }
  categories[cat] = (categories[cat] || 0) + 1
}

const graph = {
  meta: {
    ...meta,
    builtAt: new Date().toISOString(),
    nodeCount: nodes.length,
    linkCount: links.length,
  },
  stats: {
    works: works.length,
    floors: floors.length,
    participants: allUsers.size,
    authors: works.length ? new Set(works.map(w => w.user)).size : 0,
    totalLikes, totalViews, totalWords, totalLinksInWorks,
    avgWords: works.length ? Math.round(totalWords / works.length) : 0,
    avgLikes: works.length ? (totalLikes / works.length).toFixed(1) : 0,
    withDemo: works.filter(w => w.links.length > 0).length,
    withImage: works.filter(w => w.images.length > 0).length,
    categories,
    hours,
  },
  nodes,
  links,
}

await writeFile(join(OUT, 'graph.json'), JSON.stringify(graph), 'utf8')

console.log('=== 图谱构建完成 ===')
console.log('节点', graph.meta.nodeCount, '连边', graph.meta.linkCount)
console.log('统计', JSON.stringify(graph.stats, (k, v) => (k === 'hours' || k === 'categories' ? undefined : v)))
console.log('分类', JSON.stringify(categories))
console.log('体积', Math.round((await readFile(join(OUT, 'graph.json'))).length / 1024), 'KB')
