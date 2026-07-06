<script setup>
defineProps({ show: Boolean, loading: Boolean, actionLabel: String, schedule: Object })
defineEmits(['update:show', 'confirm'])
const modes = [
  { label: '立即执行', value: 'now' },
  { label: '倒计时', value: 'countdown' },
  { label: '指定时间', value: 'time' },
]
</script>

<template>
  <n-modal :show="show" preset="dialog" :title="`确认${actionLabel}`" positive-text="确认" negative-text="取消" :loading="loading" @positive-click="$emit('confirm')" @negative-click="$emit('update:show', false)" @update:show="$emit('update:show', $event)">
    <div class="power-modal-body">
      <n-radio-group v-model:value="schedule.mode">
        <n-space vertical>
          <n-radio v-for="mode in modes" :key="mode.value" :value="mode.value">{{ mode.label }}</n-radio>
        </n-space>
      </n-radio-group>
      <n-input-number v-if="schedule.mode === 'countdown'" v-model:value="schedule.minutes" :min="1" :max="1440" placeholder="分钟" />
      <n-time-picker v-if="schedule.mode === 'time'" v-model:formatted-value="schedule.time" format="HH:mm" value-format="HH:mm" />
      <p class="hint">请确认手机当前连接的是正确的受控电脑。</p>
    </div>
  </n-modal>
</template>
