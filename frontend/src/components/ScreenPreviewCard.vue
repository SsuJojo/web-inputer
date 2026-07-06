<script setup>
import { computed, ref } from 'vue'

const props = defineProps({ enabled: Boolean, streamUrl: String, title: String, cursorStyle: Object })
defineEmits(['toggle', 'desktop', 'open-frame', 'image-load'])
const stageRef = ref(null)
const imageRef = ref(null)
const ariaPressed = computed(() => String(props.enabled))

defineExpose({ stageRef, imageRef })
</script>

<template>
  <n-card class="panel-card screen-card">
    <div class="screen-controls">
      <n-button secondary @click="$emit('desktop', 'left')">← 桌面</n-button>
      <button class="screen-toggle" type="button" :aria-label="enabled ? '关闭屏幕预览' : '开启屏幕预览'" :aria-pressed="ariaPressed" @click="$emit('toggle')">
        <span class="screen-toggle-main">{{ enabled ? '关闭预览' : '开启预览' }}</span>
      </button>
      <n-button secondary @click="$emit('desktop', 'right')">桌面 →</n-button>
    </div>
    <div class="screen-preview" :class="enabled ? 'on' : 'off'" role="button" aria-label="预览当前屏幕截图" @click="$emit('open-frame')">
      <div ref="stageRef" class="screen-stage">
        <img v-if="streamUrl" ref="imageRef" class="screen-image" :src="streamUrl" alt="电脑屏幕预览" @load="$emit('image-load')">
        <div class="cursor-layer">
          <div class="screen-cursor" :class="{ visible: cursorStyle }" :style="cursorStyle || {}"></div>
        </div>
      </div>
      <span v-if="!enabled">屏幕预览已关闭，请点上方按钮开启</span>
    </div>
  </n-card>
</template>
