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
const ACTION_LABELS = Object.fromEntries(actions.map((action) => [action.key, action.label]))
const actionIcon = {
  shutdown: '⏻',
  restart: '↻',
  sleep: '☾',
  hibernate: '⏾',
  lock: '🔒',
}
const refreshIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
const chevronIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
</script>

<template>
  <n-card class="panel-card power-card">
    <div class="power-header">
      <div>
        <h2>电源控制</h2>
        <p class="muted power-subtitle" v-if="status?.message">{{ status.message }}</p>
        <p class="muted power-subtitle" v-else-if="status?.scheduled">计划 {{ ACTION_LABELS[status.scheduled.action] || status.scheduled.action }}：{{ formatRemaining(status.scheduled.remainingSeconds) }}</p>
        <p class="muted power-subtitle" v-else>执行关机、重启、睡眠等操作前会再次确认。</p>
      </div>
      <div class="metrics-actions">
        <button class="icon-button" type="button" aria-label="刷新电源状态" :disabled="loading" @click="$emit('refresh')"><span v-html="refreshIcon"></span></button>
        <button class="icon-button" type="button" :aria-label="expanded ? '收起电源控制' : '展开电源控制'" @click="$emit('toggle')"><span class="chevron" :class="{ open: expanded }" v-html="chevronIcon"></span></button>
      </div>
    </div>
    <div class="power-actions" :class="{ collapsed: !expanded }" :aria-hidden="!expanded">
      <n-button v-for="action in actions" :key="action.key" secondary :disabled="loading" @click="$emit('action', action.key)"><span class="action-icon" aria-hidden="true">{{ actionIcon[action.key] }}</span>{{ action.label }}</n-button>
      <n-button secondary type="warning" :disabled="loading" @click="$emit('cancel')"><span class="action-icon" aria-hidden="true">✕</span>取消计划</n-button>
    </div>
  </n-card>
</template>
