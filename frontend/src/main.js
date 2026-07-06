import { createApp } from 'vue'
import naive from 'naive-ui'
import App from './App.vue'
import './styles.css'

createApp(App).use(naive).mount('#app')

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/static/sw.js').catch(() => {})
}
