<script setup>
defineProps({ expanded: Boolean, loading: Boolean, status: Object, formatRemaining: Function })
defineEmits(['toggle', 'refresh', 'action', 'cancel'])
const actions = [
  { key: 'shutdown', label: '关机' },
  { key: 'restart', label: '重启' },
  { key: 'sleep', label: '睡眠' },
  { key: 'hibernate', label: '休眠' },
  { key: 'lock', label: '锁屏' },
]
</script>

<template>
  <n-card class="panel-card power-card">
    <div class="power-header">
      <div>
        <h2>电源控制</h2>
        <p class="muted" v-if="status?.message">{{ status.message }}</p>
        <p class="muted" v-else-if="status?.scheduled">计划 {{ status.scheduled.action }}：{{ formatRemaining(status.scheduled.remainingSeconds) }}</p>
        <p class="muted" v-else>执行关机、重启、睡眠等操作前会再次确认。</p>
      </div>
      <div class="metrics-actions">
        <n-button tertiary size="small" :loading="loading" @click="$emit('refresh')">刷新</n-button>
        <n-button tertiary size="small" @click="$emit('toggle')">{{ expanded ? '收起' : '展开' }}</n-button>
      </div>
    </div>
    <div v-if="expanded" class="power-actions">
      <n-button v-for="action in actions" :key="action.key" secondary :disabled="loading" @click="$emit('action', action.key)">{{ action.label }}</n-button>
      <n-button secondary type="warning" :disabled="loading" @click="$emit('cancel')">取消计划</n-button>
    </div>
  </n-card>
</template>
