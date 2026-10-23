# NEBULA · 1024 数据星云观测台

> 把 TRAE 社区 1024 狂欢周的**全部作品 + 全部盖楼回复**爬下来，渲染成一张可以飞进去的 3D 知识星云。
> 数据真爬 · 爬虫可见 · 指标可筛

[![Pages](https://github.com/17861102832/TRAE-1024-NEBULA/actions/workflows/pages.yml/badge.svg)](https://github.com/17861102832/TRAE-1024-NEBULA/actions/workflows/pages.yml)
![License](https://img.shields.io/badge/License-MIT-blue)
![Data](https://img.shields.io/badge/data-2026-10-23-informational)

**在线观测台 → https://17861102832.github.io/TRAE-1024-NEBULA/**

> 主要是为了我的未来。

---

## 它是什么

一张能飞进去的 3D 知识星云，把论坛的真实内容变成可漫游的生态图景。

| 区域 | 内容 |
|---|---|
| **主视图** | 5200 粒子的 ARGON 风格星云 + 3D 力导向图 + 悬浮卡片。WASD 飞行 / QE 升降 / 拖拽转向 / 滚轮推拉，相机会自动向前航行。点星点 → 抽屉展开完整正文 + 外链 + 论坛原帖 |
| **左栏** | `CHIEF` 主控概要 · `CRAWLER` 爬虫实时请求流水 · `HEATMAP` 24 小时发帖热度 |
| **右栏** | `SIZE` 作品类型分布 · `FILL` 产出密度 · `RISK` 质量体检（**可点击 → 联动 3D**）· `SOCIAL` 协作热区 |

### RISK → 3D 联动（核心交互）

点右侧 RISK 任意一行：

- 命中的**作品**节点 → 红色描边 + 放大 1.5× + 辉光转红 + 置顶渲染
- 其余节点 → 降暗到 7%（人物节点 9%）
- 再点同一行 → 200ms 缓动恢复；点另一行 → 直接切换

口径（与面板计数一致）：

| 筛选项 | 判定 |
|---|---|
| 无 Demo 链接 | `links.length === 0` |
| 无配图 | `images.length === 0` |
| 正文过短 | `bodyLength < 200` |
| 零回复作品 | `replyCount === 0` |

---

## 本次数据快照

| 指标 | 值 |
|---|---|
| 爬取时间 | `2026-10-23T11:02:27Z` |
| 数据源 | `https://forum.trae.cn`（Discourse 公开 JSON API，只读免鉴权）|
| 作品 | 30 |
| 楼层 | 593 |
| 参与者 | 368 |
| 回复 | 123 |
| 请求数 / 耗时 | 43 次 / 3.5s（2.78 MB）|

完整快照见 [`docs/data/meta.json`](docs/data/meta.json)，原始数据在 `docs/data/`。

---

## 跑起来

源码在 `docs/source/`，完整说明见 **[docs/source/README.md](docs/source/README.md)**。

```bash
cd docs/source
npm install
npm run crawl     # 爬论坛 → data/*.json（含爬虫日志）
npm run graph     # 构建图谱 → data/graph.json
npm run sync      # data → public/data
npm run build     # 产出 dist/
node scripts/serve.mjs dist 4173     # 零依赖静态服务器
```

> `vite preview` 会做 Host 头白名单校验（Vite 6+ `allowedHosts`），隧道域名直接 403；
> `scripts/serve.mjs` 不做 Host 校验，只发文件。

### 目录

```
docs/
├── index.html          # 站点首屏
├── assets/             # 构建产物
├── data/               # 爬取产物（works / floors / participants / crawl-log / graph）
└── source/             # 源码
    ├── scripts/        # crawl / build-graph / sync-data / serve / verify / test-risk
    ├── src/            # main.js（渲染 + HUD + RISK 联动）· style.css
    └── data/           # 爬虫与图谱构建的中间产物
```

---

## 技术栈与许可

| 依赖 | 许可 | 用途 |
|---|---|---|
| `three` 0.186 | MIT | 3D 渲染 + 自写 GLSL 粒子 shader |
| `3d-force-graph` 1.80 | MIT | 3D 力导向图 + FlyControls |
| Node 24 原生 `fetch` | — | 爬虫（零爬虫框架依赖）|

数据源、构建产物、爬虫源码、图谱构建器全部开放。

---

## 已知限制

- Demo 链接指向 GitHub Pages 静态站；若走本地隧道，本机关机 / 隧道断开则链接失效。
- `topic.views` 口径偏小（forum 只统计首屏），故 FILL 面板改用「总楼层」。
- 无头浏览器下 `requestAnimationFrame` 只有 1fps（headless Chrome 无合成器），**必须用有头浏览器测帧率**。

---

## 许可证

MIT —— 数据源、构建产物、爬虫源码、图谱构建器全部开放。
