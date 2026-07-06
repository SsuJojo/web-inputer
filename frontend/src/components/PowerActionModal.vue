<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({ show: Boolean, loading: Boolean, actionLabel: String, schedule: Object })
const emit = defineEmits(['update:show', 'confirm'])
const modes = [
  { label: '立即执行', value: 'now' },
  { label: '倒计时', value: 'countdown' },
  { label: '指定时间', value: 'time' },
]
const sliderValue = ref(0)
const isConfirmed = computed(() => sliderValue.value >= 92)

function resetSlider() {
  sliderValue.value = 0
}

function close() {
  if (props.loading) return
  emit('update:show', false)
}

function confirm() {
  if (props.loading || !isConfirmed.value) return false
  emit('confirm')
  return false
}

watch(() => props.show, resetSlider)
</script>

<template>
  <n-modal :show="show" preset="dialog" :title="`确认${actionLabel}`" positive-text="确认执行" negative-text="取消" :positive-button-props="{ disabled: !isConfirmed || loading }" :loading="loading" @positive-click="confirm" @negative-click="close" @update:show="$emit('update:show', $event)">
    <div class="power-modal-body">
      <div class="power-modal-title"><span class="action-icon" aria-hidden="true">⏻</span><span>{{ actionLabel }}</span></div>
      <n-radio-group v-model:value="schedule.mode">
        <n-space vertical>
          <n-radio v-for="mode in modes" :key="mode.value" :value="mode.value">{{ mode.label }}</n-radio>
        </n-space>
      </n-radio-group>
      <n-input-number v-if="schedule.mode === 'countdown'" v-model:value="schedule.minutes" :min="1" :max="1440" placeholder="分钟" />
      <n-time-picker v-if="schedule.mode === 'time'" v-model:formatted-value="schedule.time" format="HH:mm" value-format="HH:mm" />
      <div class="slide-confirm" :class="{ confirmed: isConfirmed }">
        <span>{{ isConfirmed ? '已滑动确认' : '滑动到右侧确认执行' }}</span>
        <n-slider v-model:value="sliderValue" :min="0" :max="100" :step="1" :disabled="loading" aria-label="滑动确认电源操作" />
      </div>
      <p class="hint">请确认手机当前连接的是正确的受控电脑。未滑到阈值不会执行。</p>
    </div>
  </n-modal>
</template>
