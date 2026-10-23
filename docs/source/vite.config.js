import { defineConfig } from 'vite'
export default defineConfig({
  // ★ 用相对路径：GitHub Pages 是子路径部署（/repo/），绝对路径 /assets 会 404
  base: './',
  server: { host: '127.0.0.1', port: 5183, strictPort: true },
  build: { outDir: 'dist', assetsInlineLimit: 0, chunkSizeWarningLimit: 2000 },
})
