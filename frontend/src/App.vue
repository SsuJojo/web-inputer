<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { darkTheme } from 'naive-ui'
import RemoteInputApp from './components/RemoteInputApp.vue'

const prefersDark = ref(true)
const themeColors = { light: '#f7f8fb', dark: '#0f172a' }
let mediaQuery = null

const theme = computed(() => prefersDark.value ? darkTheme : null)
const themeOverrides = computed(() => ({
  common: prefersDark.value ? {
    primaryColor: '#38bdf8',
    primaryColorHover: '#7dd3fc',
    primaryColorPressed: '#0284c7',
    borderRadius: '16px',
    bodyColor: '#020617',
    cardColor: 'rgba(15, 23, 42, 0.86)',
    modalColor: 'rgba(15, 23, 42, 0.98)',
  } : {
    primaryColor: '#2563eb',
    primaryColorHover: '#3b82f6',
    primaryColorPressed: '#1d4ed8',
    borderRadius: '16px',
    bodyColor: '#f7f8fb',
    cardColor: 'rgba(255, 255, 255, 0.88)',
    modalColor: 'rgba(255, 255, 255, 0.98)',
  },
}))

function applyBrowserTheme() {
  const mode = prefersDark.value ? 'dark' : 'light'
  document.documentElement.dataset.theme = mode
  document.documentElement.style.colorScheme = mode
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    meta.setAttribute('content', themeColors[mode])
  })
  document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.setAttribute('content', prefersDark.value ? 'black-translucent' : 'default')
}

function syncSystemTheme(event) {
  prefersDark.value = Boolean(event.matches)
  applyBrowserTheme()
}

onMounted(() => {
  mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  syncSystemTheme(mediaQuery)
  mediaQuery.addEventListener('change', syncSystemTheme)
})

onBeforeUnmount(() => {
  mediaQuery?.removeEventListener('change', syncSystemTheme)
})
</script>

<template>
  <n-config-provider :theme="theme" :theme-overrides="themeOverrides">
    <n-message-provider>
      <RemoteInputApp />
    </n-message-provider>
  </n-config-provider>
</template>
