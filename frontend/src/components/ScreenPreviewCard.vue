<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'

const props = defineProps({ enabled: Boolean, streamUrl: String, title: String, cursorStyle: Object })
const emit = defineEmits(['toggle', 'desktop', 'create-desktop', 'open-frame', 'image-load'])
const stageRef = ref(null)
const imageRef = ref(null)
const ariaPressed = computed(() => String(props.enabled))
let desktopPressTimer = 0
let desktopLongPressed = false

defineExpose({ stageRef, imageRef })

function startDesktopPress() {
  desktopLongPressed = false
  window.clearTimeout(desktopPressTimer)
  desktopPressTimer = window.setTimeout(() => {
    desktopLongPressed = true
    emit('create-desktop')
  }, 520)
}

function endDesktopPress() {
  window.clearTimeout(desktopPressTimer)
}

function clickRightDesktop() {
  if (desktopLongPressed) {
    desktopLongPressed = false
    return
  }
  emit('desktop', 'right')
}

onBeforeUnmount(() => window.clearTimeout(desktopPressTimer))
</script>

<template>
  <n-card class="panel-card screen-card">
    <div class="screen-controls">
      <n-button secondary @click="$emit('desktop', 'left')">← 桌面</n-button>
      <button class="screen-toggle" type="button" :aria-label="enabled ? '关闭屏幕预览' : '开启屏幕预览'" :aria-pressed="ariaPressed" @click="$emit('toggle')">
        <span class="screen-toggle-main">{{ enabled ? '关闭预览' : '开启预览' }}</span>
        <span class="screen-toggle-title">{{ title }}</span>
      </button>
      <n-button secondary aria-label="短按切换到右侧桌面，长按新建桌面" @pointerdown="startDesktopPress" @pointerup="endDesktopPress" @pointercancel="endDesktopPress" @pointerleave="endDesktopPress" @click="clickRightDesktop">桌面 →</n-button>
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
