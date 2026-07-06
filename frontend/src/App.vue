<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { darkTheme } from 'naive-ui'
import RemoteInputApp from './components/RemoteInputApp.vue'

const prefersDark = ref(true)
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

function syncSystemTheme(event) {
  prefersDark.value = Boolean(event.matches)
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
