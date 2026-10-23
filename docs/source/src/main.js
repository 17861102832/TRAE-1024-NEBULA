/**
 * NEBULA · 1024 数据星云观测台
 * 主渲染：ARGON 风格粒子星云 + 3D 力导向图 + ARGON 悬浮 md 卡片
 * 侧栏：Quant 风格量化终端（8 模块）
 */
import './style.css'
import * as THREE from 'three'
// 3d-force-graph 只提供 default 导出：export { _3dForceGraph as default }
import ForceGraph3D from '3d-force-graph'

const $ = (s) => document.querySelector(s)

// ══════════════════════════════════════════════════════
// 0. 启动遮罩
// ══════════════════════════════════════════════════════
const boot = document.createElement('div')
boot.id = 'boot'
boot.innerHTML = `<div class="bl"><div class="bt">NEBULA</div><div class="bs" id="bootMsg">LOADING STAR FIELD…</div></div>`
document.body.appendChild(boot)
const bootMsg = () => document.getElementById('bootMsg')

// ══════════════════════════════════════════════════════
// 1. 数据装载
// ══════════════════════════════════════════════════════
bootMsg().textContent = 'LOADING DATA…'
// ★ 数据路径按「页面地址」解析，不能写死 /data ——
//   GitHub Pages 是子路径部署（/repo/），绝对路径会指到域名根 → 404
const dataUrl = (f) => new URL('data/' + f, document.baseURI).href
const [graph, crawlLog] = await Promise.all([
  fetch(dataUrl('graph.json')).then(r => r.json()),
  fetch(dataUrl('crawl-log.json')).then(r => r.json()).catch(() => []),
])
const S = graph.stats

// ══════════════════════════════════════════════════════
// 2. ForceGraph3D 场景（它自带 scene / camera / renderer）
//    ★ 关键：星云粒子必须加进 fg.scene()，否则两个渲染器抢同一个 canvas
// ══════════════════════════════════════════════════════
const stage = $('#stage')

// ══════════════════════════════════════════════════════
// 3. ARGON 粒子星云背景（先建，稍后挂进 fg.scene()）
// ══════════════════════════════════════════════════════
bootMsg().textContent = 'SEEDING STAR FIELD…'

const STAR_COUNT = 5200
const starGeo = new THREE.BufferGeometry()
const sPos = new Float32Array(STAR_COUNT * 3)
const sCol = new Float32Array(STAR_COUNT * 3)
const sSize = new Float32Array(STAR_COUNT)
const sPhase = new Float32Array(STAR_COUNT)

const RED = new THREE.Color(0xff3b3b)
const WHITE = new THREE.Color(0xf4f6ff)
const DIM = new THREE.Color(0x2a3550)

for (let i = 0; i < STAR_COUNT; i++) {
  // 球形分布 + 中心密集
  const r = 260 + Math.pow(Math.random(), 0.55) * 1500
  const theta = Math.random() * Math.PI * 2
  const phi = Math.acos(2 * Math.random() - 1)
  sPos[i * 3] = r * Math.sin(phi) * Math.cos(theta)
  sPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.55
  sPos[i * 3 + 2] = r * Math.cos(phi)

  const t = Math.random()
  const c = t < 0.42 ? RED : t < 0.72 ? WHITE : DIM
  const b = 0.35 + Math.random() * 0.65
  sCol[i * 3] = c.r * b
  sCol[i * 3 + 1] = c.g * b
  sCol[i * 3 + 2] = c.b * b
  sSize[i] = (Math.random() < 0.06 ? 5.5 + Math.random() * 6 : 1.1 + Math.random() * 2.6)
  sPhase[i] = Math.random() * Math.PI * 2
}
starGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3))
starGeo.setAttribute('aColor', new THREE.BufferAttribute(sCol, 3))
starGeo.setAttribute('aSize', new THREE.BufferAttribute(sSize, 1))
starGeo.setAttribute('aPhase', new THREE.BufferAttribute(sPhase, 1))

const starMat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  uniforms: { uTime: { value: 0 }, uPR: { value: Math.min(devicePixelRatio, 2) } },
  vertexShader: `
    attribute vec3 aColor; attribute float aSize; attribute float aPhase;
    uniform float uTime; uniform float uPR;
    varying vec3 vColor; varying float vTw;
    void main(){
      vColor = aColor;
      vTw = 0.55 + 0.45 * sin(uTime * 1.4 + aPhase);
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = aSize * uPR * (300.0 / -mv.z) * (0.7 + vTw * 0.6);
    }`,
  fragmentShader: `
    varying vec3 vColor; varying float vTw;
    void main(){
      float d = length(gl_PointCoord - 0.5);
      if(d > 0.5) discard;
      float a = smoothstep(0.5, 0.02, d);
      float core = smoothstep(0.22, 0.0, d);
      gl_FragColor = vec4(vColor + core * 0.55, a * (0.42 + vTw * 0.55));
    }`,
})
const stars = new THREE.Points(starGeo, starMat)

// 中心红色星云辉光
const nebulaTex = (() => {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128)
  grd.addColorStop(0, 'rgba(255,60,60,0.95)')
  grd.addColorStop(0.22, 'rgba(190,30,45,0.42)')
  grd.addColorStop(0.55, 'rgba(90,20,40,0.13)')
  grd.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, 256, 256)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
})()
const glow = new THREE.Sprite(new THREE.SpriteMaterial({
  map: nebulaTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.72,
}))
glow.scale.set(1500, 1500, 1)

// ══════════════════════════════════════════════════════
// 4. ARGON 悬浮 md 卡片（Canvas 贴图）
// ══════════════════════════════════════════════════════
const cardCache = new Map()
function makeCardTexture(node) {
  const W = 512, H = 256
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const g = c.getContext('2d')

  // 底：半透明深色
  g.fillStyle = 'rgba(8,9,16,0.90)'
  g.fillRect(0, 0, W, H)
  // 边框
  g.strokeStyle = 'rgba(255,59,59,0.5)'
  g.lineWidth = 2
  g.strokeRect(1, 1, W - 2, H - 2)
  // 标题条
  g.fillStyle = 'rgba(255,59,59,0.14)'
  g.fillRect(0, 0, W, 42)
  g.strokeStyle = 'rgba(255,59,59,0.28)'
  g.lineWidth = 1
  g.beginPath(); g.moveTo(0, 42); g.lineTo(W, 42); g.stroke()

  // 标题（文件名）
  g.fillStyle = '#f4f6ff'
  g.font = '600 26px ui-monospace, Consolas, monospace'
  const fname = node.type === 'work'
    ? (node.label || 'work').slice(0, 26) + '.md'
    : (node.label || 'node').slice(0, 26) + '.md'
  g.fillText(fname, 18, 30)

  // 副标题行
  g.fillStyle = 'rgba(168,85,247,0.85)'
  g.font = '15px ui-monospace, Consolas, monospace'
  const sub = node.type === 'work'
    ? `${node.user} · ${node.views} views · ${node.likes} likes`
    : `${node.works} works · ${node.floors} floors · ${node.likes} likes`
  g.fillText(sub.slice(0, 40), 18, 66)

  // 正文行（伪代码行）
  g.fillStyle = 'rgba(215,217,230,0.62)'
  g.font = '14px ui-monospace, Consolas, monospace'
  const lines = node.type === 'work'
    ? (node.body || '').split('\n').filter(Boolean).slice(0, 5)
    : [node.title || '—', `activity ${node.activity}`, `first ${node.firstAt ? new Date(node.firstAt).toISOString().slice(0, 10) : '—'}`]
  lines.forEach((ln, i) => {
    g.globalAlpha = 0.75 - i * 0.11
    g.fillText(ln.slice(0, 46), 18, 96 + i * 24)
  })
  g.globalAlpha = 1

  // 角标
  g.fillStyle = 'rgba(34,211,238,0.9)'
  g.font = '13px ui-monospace, Consolas, monospace'
  g.fillText(`LINKS ${node.links?.length ?? node.replyCount ?? 0}`, 18, H - 14)
  g.fillStyle = 'rgba(251,191,36,0.9)'
  g.fillText(`R ${String(node.floors ?? node.replyCount ?? 0).padStart(3, '0')}`, W - 74, H - 14)

  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}
function getCard(node) {
  if (!cardCache.has(node.id)) cardCache.set(node.id, makeCardTexture(node))
  return cardCache.get(node.id)
}

// ══════════════════════════════════════════════════════
// 5. 力导向图
// ══════════════════════════════════════════════════════
bootMsg().textContent = 'WEAVING NEBULA…'

const COLORS = {
  person: 0xff3b3b,
  work: 0xa855f7,
}

const fg = ForceGraph3D({ controlType: 'fly' })(stage)
  .graphData({ nodes: graph.nodes, links: graph.links })
  .backgroundColor('#04050a')
  .nodeRelSize(6.5)
  .nodeVal(n => (n.type === 'work' ? 1.1 : 1) + Math.min(3.4, (n.activity || 0) * 0.11))
  .nodeColor(n => COLORS[n.type] || 0x888888)
  .linkColor(l => (l.kind === 'author' ? 'rgba(255,59,59,0.55)'
    : l.kind === 'reply' ? 'rgba(168,85,247,0.34)'
    : l.kind === 'queue' ? 'rgba(120,130,170,0.14)'
    : 'rgba(34,211,238,0.18)'))
  .linkWidth(l => (l.kind === 'author' ? 0.9 : l.kind === 'reply' ? 0.55 : 0.28))
  .linkDirectionalParticles(l => (l.kind === 'author' ? 2 : 0))
  .linkDirectionalParticleWidth(1.4)
  .linkDirectionalParticleColor(() => 0xff6b6b)
  .d3VelocityDecay(0.32)
  .d3AlphaDecay(0.022)
  // ★ 3d-force-graph 默认"布局稳定就停渲染"（cooldownTime 默认 15s），
  //   源码 L64001 的停机条件：new Date()-startTickTime > cooldownTime
  //   → 引擎一停，renderObjs.tick() 就不再画，画面只剩 1fps。
  //   d3AlphaMin 默认 0（保持 0，alpha 条件永不触发）。
  .cooldownTime(3600000)
  .warmupTicks(220)
  .onNodeClick(node => openDrawer(node))

// 定时重新加热模拟 → 星云始终有轻微呼吸感（不是死图）
setInterval(() => { try { fg.d3ReheatSimulation() } catch (e) {} }, 4000)

// 运行时自省：列出真实可用方法（避免再猜 API）
// ★ 不能用 typeof fg[k] —— Proxy 的 get 陷阱会碰 .caller 触发严格模式异常
window.__fg = fg
window.__nebulaApi = (() => {
  const names = new Set()
  try {
    for (const k of Object.keys(fg)) names.add(k)
  } catch (e) { console.warn('自省失败', e) }
  const all = [...names].sort()
  console.log('[NEBULA] 可用方法(' + all.length + '):', all.join(' '))
  return all
})()

// 相机初始位置：站远一点看全貌
fg.cameraPosition({ x: 0, y: 0, z: 620 }, 0)

// 飞行控制：FlyControls（WASD 平移 / QE 升降 / 拖拽转向）
try {
  fg.enableNavigationControls(true)
  const c = fg.controls()
  if (c) {
    c.autoForward = true        // 自动向前航行 —— ARGON 那种"穿行星云"的观感
    c.movementSpeed = 26
    c.rollSpeed = 0.6
    c.dragToLook = true
  }
} catch (e) { console.warn('导航控制配置跳过', e) }

// ★ 把 ARGON 星云挂进 ForceGraph3D 自己的 scene（否则看不见）
const fgScene = fg.scene()
// 雾密度必须极低：FogExp2 因子 = 1-exp(-(d*dist)^2)
// d=0.0105 时相机距 620 → 因子≈1.0（全雾，内置材质的节点/卡片/辉光会被完全吃掉）
fgScene.fog = new THREE.FogExp2(0x04050a, 0.00032)
fgScene.add(stars)
fgScene.add(glow)

// 按图谱实际包围盒取景（zoomToFit 会怼到单个节点上，不可用）
function frameGraph() {
  try {
    const bb = fg.getGraphBbox()
    if (!bb) return
    const span = Math.max(bb.x[1] - bb.x[0], bb.y[1] - bb.y[0], bb.z[1] - bb.z[0])
    const cx = (bb.x[0] + bb.x[1]) / 2, cy = (bb.y[0] + bb.y[1]) / 2, cz = (bb.z[0] + bb.z[1]) / 2
    const dist = Math.max(span * 0.82, 260)
    fg.cameraPosition({ x: cx, y: cy, z: cz + dist }, 900)
    console.log('[NEBULA] 取景 span=' + Math.round(span) + ' dist=' + Math.round(dist))
  } catch (e) { console.warn('取景失败', e) }
}
setTimeout(frameGraph, 1800)
setTimeout(frameGraph, 4200)

// 悬浮 md 卡片
// ★ 只有「作品」节点画卡片（31 张纹理 ≈ 16MB），人物只发光点
//   —— 246 张 512x256 纹理要 129MB 显存，这台机器扛不住，且视觉更乱
// ★ 登记每个节点的 three 对象与材质，供右侧 RISK 面板做 3D 高亮联动
const nodeObjs = new Map()   // id → { node, isWork, card, halo, outline, glow, ...动画状态 }

fg.nodeThreeObject((node) => {
  const isWork = node.type === 'work'
  const g = new THREE.Group()
  const st = { node, isWork, card: null, halo: null, outline: null, glow: null }

  if (isWork) {
    const w = 46, h = w * 0.5
    // 红色描边：同一张卡片贴图、加色混合、稍微放大 → 边缘透出一圈红
    const outline = new THREE.Sprite(new THREE.SpriteMaterial({
      map: getCard(node), transparent: true, depthWrite: false, depthTest: false,
      blending: THREE.AdditiveBlending, color: new THREE.Color(0xff2e88), opacity: 0,
    }))
    outline.scale.set(w * 1.1, h * 1.1, 1)
    outline.position.set(0, 11, 0)
    outline.renderOrder = 1
    g.add(outline)
    st.outline = outline

    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: getCard(node), transparent: true, depthWrite: false, depthTest: false,
    }))
    sp.scale.set(w, h, 1)
    sp.position.set(0, 11, 0)
    sp.renderOrder = 2
    g.add(sp)
    st.card = sp

    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: nebulaTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
      color: new THREE.Color(0xa855f7), opacity: 0.5,
    }))
    halo.scale.set(w * 1.25, w * 1.25, 1)
    halo.position.set(0, 11, 0)
    g.add(halo)
    st.halo = halo
  } else {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: nebulaTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
      color: new THREE.Color(0xff3b3b), opacity: 0.85,
    }))
    const sc = 5 + Math.min(9, (node.activity || 0) * 0.5)
    s.scale.set(sc, sc, 1)
    g.add(s)
    st.glow = s
  }

  // 动画状态（当前值 → 目标值）
  st.cardO = isWork ? 1 : 0
  st.haloO = isWork ? 0.5 : 0
  st.outlineO = 0
  st.glowO = isWork ? 0 : 0.85
  st.scaleK = 1
  st.haloK = 1.25
  st.outlineK = 1.1
  st.target = { cardO: st.cardO, haloO: st.haloO, outlineO: st.outlineO, glowO: st.glowO, scaleK: 1, haloK: 1.25, outlineK: 1.1 }

  nodeObjs.set(node.id, st)
  return g
})
// 调试/测试钩子：暴露节点材质状态，便于自动化验收 RISK 联动
window.__nebulaObjs = nodeObjs

// 节点位置更新时同步卡片闪烁在 onEngineTick 里统一处理

// ══════════════════════════════════════════════════════
// 6. HUD 填充
// ══════════════════════════════════════════════════════
$('#mWorks').textContent = S.works
$('#mFloors').textContent = S.floors
$('#mBuilders').textContent = S.participants
$('#mEdges').textContent = graph.meta.linkCount
$('#srcLabel').textContent = graph.meta.source.replace('https://', '').toUpperCase()

$('#chiefLine').innerHTML =
  `观测到 <b style="color:var(--neon-pink)">${S.works}</b> 个 Builder 作品、` +
  `<b style="color:var(--neon-cyan)">${S.floors}</b> 层盖楼回复，` +
  `构成 ${S.participants} 颗星的活跃生态。`
$('#chiefSub').textContent =
  `${S.avgWords} 字/篇 · ${S.avgLikes} 赞/篇 · ${S.withDemo} 篇带 Demo · ${S.withImage} 篇带图`

// 24H 热度
const maxH = Math.max(...S.hours.map(h => h.views), 1)
const kline = $('#kline')
S.hours.forEach((h, i) => {
  const b = document.createElement('div')
  b.className = 'bar'
  b.style.height = `${Math.max(3, (h.views / maxH) * 100)}%`
  b.dataset.h = `${String(i).padStart(2, '0')}:00 · ${h.views}v ${h.likes}❤ ${h.h}帖`
  b.title = b.dataset.h
  kline.appendChild(b)
})

// 分类条
const catColors = ['#ff2e88', '#a855f7', '#22d3ee', '#fbbf24', '#34d399', '#f472b6']
const catArr = Object.entries(S.categories).sort((a, b) => b[1] - a[1])
const catMax = catArr[0]?.[1] || 1
catArr.forEach(([k, v], i) => {
  const row = document.createElement('div')
  row.className = 'bar-row'
  row.innerHTML =
    `<span class="lb">${k}</span><span class="tr"><span class="fl" style="width:0%;background:${catColors[i % catColors.length]}"></span></span><span class="vl">${v}</span>`
  $('#catBars').appendChild(row)
  requestAnimationFrame(() => { row.querySelector('.fl').style.width = `${(v / catMax) * 100}%` })
})

// FILL 网格
const fills = [
  { v: S.totalWords.toLocaleString(), l: '总字数' },
  { v: S.totalLinksInWorks, l: '外链数' },
  { v: S.totalLikes, l: '总点赞' },
  { v: S.floors, l: '总楼层' },
  { v: S.authors, l: '作者数' },
  { v: S.works - S.authors, l: '独立投稿' },
]
const fillGrid = $('#fillGrid')
fills.forEach(f => {
  const c = document.createElement('div')
  c.className = 'fill-cell'
  c.innerHTML = `<div class="v">${f.v}</div><div class="l">${f.l}</div>`
  fillGrid.appendChild(c)
})

// RISK 体检 —— 可点击，点击后星云中命中的作品节点红色描边 + 置顶发光，其余降暗
const RISK_FILTERS = {
  'no-demo':  n => n.type === 'work' && (n.links?.length ?? 0) === 0,
  'no-image': n => n.type === 'work' && (n.images?.length ?? 0) === 0,
  'short':    n => n.type === 'work' && (n.bodyLength ?? 0) < 200,
  'no-reply': n => n.type === 'work' && (n.replyCount ?? 0) === 0,
}
const risks = [
  { key: 'no-demo',  l: '无 Demo 链接', v: S.works - S.withDemo, c: '#ff2e88' },
  { key: 'no-image', l: '无配图', v: S.works - S.withImage, c: '#a855f7' },
  { key: 'short',    l: '正文过短 (<200字)', v: S.works - graph.nodes.filter(n => n.type === 'work' && n.bodyLength >= 200).length, c: '#fbbf24' },
  { key: 'no-reply', l: '零回复作品', v: S.works - graph.nodes.filter(n => n.type === 'work' && n.replyCount > 0).length, c: '#22d3ee' },
]
const riskList = $('#riskList')
const riskRows = new Map()
risks.forEach(r => {
  const row = document.createElement('div')
  row.className = 'risk-row clickable'
  row.innerHTML = `<span class="dot" style="background:${r.c};box-shadow:0 0 8px ${r.c}"></span><span class="lb">${r.l}</span><span class="vl">${r.v}</span>`
  row.addEventListener('click', () => toggleRisk(r.key))
  riskList.appendChild(row)
  riskRows.set(r.key, row)
})

// ── RISK → 3D 高亮联动 ────────────────────────────
let activeRisk = null
let riskAnimToken = 0

function setNodeTargets(matched) {
  for (const [id, st] of nodeObjs) {
    const t = st.target
    if (st.isWork) {
      const hit = matched.has(id)
      t.cardO = hit ? 1 : 0.07
      t.haloO = hit ? 0.95 : 0.05
      t.outlineO = hit ? 0.9 : 0
      t.scaleK = hit ? 1.5 : 1
      t.haloK = hit ? 2.6 : 1.25
      t.outlineK = hit ? 1.16 : 1.1
    } else {
      t.glowO = matched.size ? 0.09 : 0.85
    }
  }
}

function animateRiskTargets(dur = 200) {
  const token = ++riskAnimToken
  const t0 = performance.now()
  const from = new Map()
  for (const [id, st] of nodeObjs) {
    from.set(id, { cardO: st.cardO, haloO: st.haloO, outlineO: st.outlineO, glowO: st.glowO, scaleK: st.scaleK, haloK: st.haloK, outlineK: st.outlineK })
  }
  function step(now) {
    if (token !== riskAnimToken) return
    const k = Math.min(1, (now - t0) / dur)
    const e = 1 - Math.pow(1 - k, 3)   // ease-out cubic
    for (const [id, st] of nodeObjs) {
      const f = from.get(id), t = st.target
      st.cardO = f.cardO + (t.cardO - f.cardO) * e
      st.haloO = f.haloO + (t.haloO - f.haloO) * e
      st.outlineO = f.outlineO + (t.outlineO - f.outlineO) * e
      st.glowO = f.glowO + (t.glowO - f.glowO) * e
      st.scaleK = f.scaleK + (t.scaleK - f.scaleK) * e
      st.haloK = f.haloK + (t.haloK - f.haloK) * e
      st.outlineK = f.outlineK + (t.outlineK - f.outlineK) * e

      if (st.card) {
        st.card.material.opacity = st.cardO
        st.card.scale.set(46 * st.scaleK, 46 * 0.5 * st.scaleK, 1)
        st.card.renderOrder = st.cardO > 0.5 ? 20 : 2
      }
      if (st.outline) {
        st.outline.material.opacity = st.outlineO
        st.outline.scale.set(46 * st.outlineK * st.scaleK, 46 * 0.5 * st.outlineK * st.scaleK, 1)
        st.outline.renderOrder = st.outlineO > 0.05 ? 19 : 1
      }
      if (st.halo) {
        st.halo.material.opacity = st.haloO
        st.halo.scale.set(46 * st.haloK * st.scaleK, 46 * st.haloK * st.scaleK, 1)
        // 命中时辉光转红（描边色），未命中保持紫色
        st.halo.material.color.set(st.haloO > 0.5 ? 0xff2e88 : 0xa855f7)
      }
      if (st.glow) st.glow.material.opacity = st.glowO
    }
    if (k < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

function toggleRisk(key) {
  const r = risks.find(x => x.key === key)
  if (activeRisk === key) {
    // 再点一次 → 恢复
    activeRisk = null
    setNodeTargets(new Set())
    animateRiskTargets(200)
    riskRows.forEach(row => row.classList.remove('active'))
    $('#iSel').textContent = '点击星点检视'
    return
  }
  activeRisk = key
  const matched = new Set()
  for (const n of graph.nodes) if (RISK_FILTERS[key](n)) matched.add(n.id)
  setNodeTargets(matched)
  animateRiskTargets(200)
  riskRows.forEach((row, k) => row.classList.toggle('active', k === key))
  $('#iSel').textContent = `已筛选：${r.l} ${matched.size} 个`
}

// SOCIAL 热区（参与最多的 Builder）
const social = graph.nodes.filter(n => n.type === 'person')
  .sort((a, b) => (b.works * 3 + b.floors + b.replies) - (a.works * 3 + a.floors + a.replies))
  .slice(0, 7)
const socialList = $('#socialList')
social.forEach(p => {
  const row = document.createElement('div')
  row.className = 'soc-row'
  const sc = p.works * 3 + p.floors + p.replies
  const ini = (p.label || p.user).slice(0, 1).toUpperCase()
  row.innerHTML = `<span class="av">${ini}</span><span class="nm">${p.label || p.user}</span><span class="sc">${sc}</span>`
  socialList.appendChild(row)
})

// ══════════════════════════════════════════════════════
// 7. CRAWLER 活面板 —— 回放真实爬虫日志
// ══════════════════════════════════════════════════════
const stream = $('#crawlerStream')
const KR = { fetch: 'FETCH', work: 'WORK', topics: 'SCAN', main: 'MAIN', floors: 'FLOOR', start: 'INIT', done: 'DONE', error: 'ERR' }
let logIdx = 0
function pushLog() {
  if (logIdx >= crawlLog.length) {
    // 跑完后循环重放（保持"活"的观感）
    if (logIdx === crawlLog.length) {
      logIdx = 0
      stream.innerHTML = ''
    }
  }
  const e = crawlLog[logIdx++]
  if (!e) return
  const div = document.createElement('div')
  div.className = 'cl ' + e.evt
  div.innerHTML = `<span class="t">${String(e.t).padStart(5)}ms</span><span class="k">${KR[e.evt] || e.evt.toUpperCase()}</span><span class="m">${(e.msg || '').replace(/</g, '&lt;')}</span>`
  // ★ 最新插到最上面（不能用 column-reverse：Chrome 里溢出行会跑到容器上方，不可见）
  stream.insertBefore(div, stream.firstChild)
  while (stream.children.length > 60) stream.removeChild(stream.lastChild)
  stream.scrollTop = 0
  $('#mCrawl').textContent = `${e.t}ms`
}
if (crawlLog.length) {
  const iv = setInterval(() => {
    pushLog()
    if (logIdx > crawlLog.length + 1) clearInterval(iv)
  }, 190)
}

// ══════════════════════════════════════════════════════
// 8. 详情抽屉
// ══════════════════════════════════════════════════════
const drawer = $('#drawer')
const drawerBody = $('#drawerBody')
$('#drawerClose').onclick = () => drawer.classList.add('closed')

function openDrawer(node) {
  const isWork = node.type === 'work'
  const ini = (node.label || node.user || '?').slice(0, 1).toUpperCase()
  const stats = isWork
    ? [
      { v: node.views, l: 'VIEWS' }, { v: node.likes, l: 'LIKES' },
      { v: node.replyCount, l: 'REPLIES' }, { v: node.bodyLength, l: 'CHARS' },
    ]
    : [
      { v: node.works, l: 'WORKS' }, { v: node.floors, l: 'FLOORS' },
      { v: node.replies, l: 'REPLIES' }, { v: node.likes, l: 'LIKES' },
    ]
  drawerBody.innerHTML = `
    <div class="dw-h">${isWork ? 'WORK NODE' : 'PERSON NODE'} · ${node.id}</div>
    <div class="dw-title">${node.title || node.label || ''}</div>
    <div class="dw-user"><span class="av">${ini}</span><span>${node.user || node.author || ''}</span></div>
    <div class="dw-stats">
      ${stats.map(s => `<div class="dw-stat"><div class="v">${s.v}</div><div class="l">${s.l}</div></div>`).join('')}
    </div>
    ${isWork ? `<div class="dw-body">${(node.body || '').slice(0, 1600).replace(/</g, '&lt;')}</div>` : ''}
    ${isWork && node.links?.length ? `<div class="dw-links">${node.links.slice(0, 8).map(l => `<a class="dw-link" href="${l}" target="_blank" rel="noopener">↗ ${l}</a>`).join('')}</div>` : ''}
    ${isWork ? `<div class="dw-links" style="margin-top:12px"><a class="dw-link" href="${node.url}" target="_blank" rel="noopener">↗ 论坛原帖 ${node.url}</a></div>` : ''}
  `
  drawer.classList.remove('closed')
  $('#iSel').textContent = (node.title || node.label || '').slice(0, 40)
}

// ══════════════════════════════════════════════════════
// 9. 渲染循环（独立 rAF）
//    ★ onEngineTick 只在"模拟 tick"时触发，模拟冷却后就不响了 → FPS 会假死。
//      真实帧数要靠包一层 renderer.render 来数。
// ══════════════════════════════════════════════════════
const fgCamera = fg.camera()
const fgRenderer = fg.renderer()

let renderCount = 0
const origRender = fgRenderer.render.bind(fgRenderer)
fgRenderer.render = (s, c) => { renderCount++; origRender(s, c) }

let lastFpsT = performance.now(), lastFrames = 0
function nebulaLoop() {
  requestAnimationFrame(nebulaLoop)
  const now = performance.now()
  const t = now * 0.001
  starMat.uniforms.uTime.value = t
  stars.rotation.y = t * 0.012
  glow.material.opacity = 0.62 + Math.sin(t * 0.7) * 0.12

  if (now - lastFpsT >= 1000) {
    $('#iFps').textContent = renderCount - lastFrames
    lastFrames = renderCount
    lastFpsT = now
  }
  const cp = fgCamera.position
  $('#iCoord').textContent = `${cp.x.toFixed(0)} / ${cp.y.toFixed(0)} / ${cp.z.toFixed(0)}`
}
nebulaLoop()

addEventListener('resize', () => {
  fg.width(innerWidth).height(innerHeight)
  fgRenderer.setPixelRatio(Math.min(devicePixelRatio, 2))
})

// ══════════════════════════════════════════════════════
// 10. 交互提示 + 启动完成
// ══════════════════════════════════════════════════════
$('#iView').textContent = 'NEBULA / STARS ' + graph.meta.nodeCount
$('#iFps').textContent = '—'

setTimeout(() => {
  boot.classList.add('gone')
  setTimeout(() => boot.remove(), 700)
}, 900)

console.log('[NEBULA] 就绪', graph.meta)
