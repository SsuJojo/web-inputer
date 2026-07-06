<script setup>
import { darkTheme } from 'naive-ui'
import RemoteInputApp from './components/RemoteInputApp.vue'

const themeOverrides = {
  common: {
    primaryColor: '#38bdf8',
    primaryColorHover: '#7dd3fc',
    primaryColorPressed: '#0284c7',
    borderRadius: '16px',
    bodyColor: '#020617',
    cardColor: 'rgba(15, 23, 42, 0.86)',
    modalColor: 'rgba(15, 23, 42, 0.98)',
  },
}
</script>

<template>
  <n-config-provider :theme="darkTheme" :theme-overrides="themeOverrides">
    <n-message-provider>
      <RemoteInputApp />
    </n-message-provider>
  </n-config-provider>
</template>
