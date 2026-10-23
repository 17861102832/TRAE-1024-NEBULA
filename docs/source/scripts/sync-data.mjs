// 把 data/ 同步到 public/data/（vite 静态目录）
import { cp, mkdir } from 'node:fs/promises'
await mkdir('public/data', { recursive: true })
await cp('data', 'public/data', { recursive: true })
console.log('data -> public/data 同步完成')
