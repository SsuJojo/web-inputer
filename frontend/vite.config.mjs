import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  base: '/static/dist/',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    outDir: '../app/static/dist',
    emptyOutDir: true,
  },
  server: {
    host: '0.0.0.0',
    port: 5175,
    strictPort: true,
    proxy: {
      '^/(api|ws|manifest.webmanifest|static/vendor)': {
        target: 'http://127.0.0.1:8790',
        ws: true,
        changeOrigin: true,
      },
    },
  },
})
