# NEBULA · 1024 数据星云观测台

> 把 TRAE 社区 1024 狂欢周的**全部作品 + 全部盖楼回复**爬下来，渲染成一张可以飞进去的 3D 知识星云。
> 数据真爬 · 爬虫可见 · 指标可筛

**线上 Demo**：`https://router-food-pix-oral.trycloudflare.com`

---

## 它是什么

| 视图 | 内容 |
|---|---|
| **主视图** | 5200 粒子的 ARGON 风格星云 + 3D 力导向图 + 31 张 md 悬浮卡片。WASD 飞行 / QE 升降 / 拖拽转向 / 滚轮推拉，相机会自动向前航行。点星点 → 右侧抽屉展开完整正文 + 外链 + 论坛原帖 |
| **左栏** | `CHIEF` 主控概要 · `CRAWLER` 爬虫实时请求流水 · `HEATMAP` 24 小时发帖热度 |
| **右栏** | `SIZE` 作品类型分布 · `FILL` 产出密度 · `RISK` 质量体检（**可点击 → 联动 3D**）· `SOCIAL` 协作热区 |

### RISK → 3D 联动（核心交互）

点右侧 RISK 任意一行：

- 命中的**作品**节点 → 红色描边 + 放大 1.5× + 辉光转红 + 置顶渲染
- 其余节点 → 降暗到 7%（人物节点 9%）
- 左下 `SELECT` 栏 → 「已筛选：无 Demo 链接 3 个」
- 再点同一行 → 200ms 缓动恢复；点另一行 → 直接切换

口径（与面板计数一致）：

| 筛选项 | 判定 |
|---|---|
| 无 Demo 链接 | `links.length === 0` |
| 无配图 | `images.length === 0` |
| 正文过短 | `bodyLength < 200` |
| 零回复作品 | `replyCount === 0` |

---

## 跑起来

```bash
npm install
npm run crawl     # 爬论坛 → data/*.json（含爬虫日志）
npm run graph     # 构建图谱 → data/graph.json
npm run sync      # data → public/data
npm run build     # 产出 dist/
node scripts/serve.mjs dist 4173     # 零依赖静态服务器（见下方说明）
```

### 为什么要自己写静态服务器

`vite preview` 会做 **Host 头白名单校验**（Vite 6+ 的 `allowedHosts`），
隧道域名 `xxx.trycloudflare.com` 不在白名单 → **直接 403**。
`scripts/serve.mjs` 不做任何 Host 校验，只发文件。

### 公网隧道（零授权）

```powershell
# 一次性下载 cloudflared
Invoke-WebRequest https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe `
  -OutFile "$env:LOCALAPPDATA\cloudflared\cloudflared.exe"
# 开隧道
& "$env:LOCALAPPDATA\cloudflared\cloudflared.exe" tunnel --url http://127.0.0.1:4173 --no-autoupdate
```

---

## 目录

```
nebula-1024/
├── scripts/
│   ├── crawl.mjs        # 爬虫：Discourse JSON API → data/
│   ├── build-graph.mjs  # 图谱构建器：data/ → graph.json（nodes + links + stats）
│   ├── sync-data.mjs    # data → public/data
│   ├── serve.mjs        # 零依赖静态服务器（绕开 Vite 的 Host 校验）
│   ├── verify.mjs       # 有头浏览器验收 + 截图 + 录屏
│   └── test-risk.mjs    # RISK 联动自动化验收（9 项）
├── src/
│   ├── main.js          # 渲染 + HUD + RISK 联动
│   └── style.css        # 全部样式（含窄屏规则）
├── index.html
├── data/                # 爬取产物（works / floors / participants / crawl-log / graph）
├── public/data/         # vite 静态目录里的副本
├── dist/                # 构建产物
└── screenshots/         # 截图与录屏
```

---

## 数据源

Discourse 官方 JSON API（公开只读，无需鉴权）：

| 用途 | 端点 |
|---|---|
| 作品秀列表 | `/tag/109-tag/109.json` + `/c/10-category/10.json` |
| 单帖正文 | `/t/topic/{id}.json` |
| **盖楼全量正文** | `/t/{id}/posts.json?post_ids[]=...` ← **注意没有 `topic/`** |

> ⚠️ 关键坑：`post_stream.posts` **只返回首批 20 条**，完整楼层 id 在 `post_stream.stream` 里。
> 不走 `/posts.json` 批量端点的话，只能拿到 19 层（我第一版就是这样），修正后才是 588 层。

---

## 技术栈与许可

| 依赖 | 许可 | 用途 |
|---|---|---|
| `three` 0.186 | MIT | 3D 渲染 + 自写 GLSL 粒子 shader |
| `3d-force-graph` 1.80 | MIT (Vasco Asturiano) | 3D 力导向图 + FlyControls |
| Node 24 原生 `fetch` | — | 爬虫（零爬虫框架依赖） |

数据源、构建产物、爬虫源码、图谱构建器全部开放。

---

## 已知限制

- Demo 链接指向**本机**的静态服务（隧道转发）。本机关机 / 隧道断开则链接失效。
- `topic.views` 口径偏小（forum 只统计首屏），故 FILL 面板改用「总楼层」。
- 无头浏览器下 `requestAnimationFrame` 只有 1fps（headless Chrome 无合成器），
  **必须用有头浏览器测帧率**（`scripts/verify.mjs` 默认 headed）。
