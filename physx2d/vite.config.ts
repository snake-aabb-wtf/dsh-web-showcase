import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: './' 使构建产物可部署到任意静态路径（GitHub Pages 子目录 / 离线本地打开）
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 5173,
    open: false,
  },
})
