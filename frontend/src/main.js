import { createApp } from 'vue'
import naive from 'naive-ui'
import App from './App.vue'
import './styles.css'

createApp(App).use(naive).mount('#app')

if ('serviceWorker' in navigator) {
  // Versioned script URL so the browser re-registers this service worker with a
  // fresh network fetch, bypassing any cached copy of the old sw.js (Cloudflare
  // had been serving a stale one, which kept clients on the old frontend build).
  navigator.serviceWorker.register('/static/sw.js?v=20260821-wake-02').catch(() => {})
}
