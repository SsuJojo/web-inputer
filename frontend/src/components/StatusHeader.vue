<script setup>
defineProps({ statusText: String, statusKind: String, latencyText: String })
defineEmits(['settings', 'logout'])
</script>

<template>
  <header class="topbar">
    <div>
      <h1>Remote Input</h1>
      <p class="status" :class="statusKind">{{ statusText }}</p>
    </div>
    <div class="metrics">
      <span>{{ latencyText }}</span>
      <div class="metrics-actions">
        <n-button tertiary size="small" @click="$emit('settings')">设置</n-button>
        <n-button tertiary size="small" @click="$emit('logout')">退出</n-button>
      </div>
    </div>
  </header>
</template>
