<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps({ enabled: Boolean, streamUrl: String, title: String, cursorStyle: Object })
const emit = defineEmits(['toggle', 'desktop', 'create-desktop', 'open-frame', 'image-load'])
const stageRef = ref(null)
const imageRef = ref(null)
const titleRef = ref(null)
const stageAspect = ref('16 / 10')
const ariaPressed = computed(() => String(props.enabled))
let desktopPressTimer = 0
let desktopLongPressed = false
let titleResizeObserver = null

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

function handleImageLoad(event) {
  const img = event.target
  const width = img.naturalWidth
  const height = img.naturalHeight
  if (width > 0 && height > 0) {
    stageAspect.value = height >= width ? '16 / 10' : `${width} / ${height}`
  }
  emit('image-load')
}

function clickRightDesktop() {
  if (desktopLongPressed) {
    desktopLongPressed = false
    return
  }
  emit('desktop', 'right')
}

function updateTitleScroll() {
  const el = titleRef.value
  if (!el) return
  const wrap = el.parentElement
  const overflow = Math.max(0, el.scrollWidth - (wrap?.clientWidth || 0))
  el.style.setProperty('--title-scroll-x', `${-overflow}px`)
  el.classList.toggle('scrolling', overflow > 0)
}

watch(() => props.title, async () => {
  await nextTick()
  updateTitleScroll()
})

onMounted(() => {
  updateTitleScroll()
  if (titleRef.value?.parentElement && 'ResizeObserver' in window) {
    titleResizeObserver = new ResizeObserver(() => updateTitleScroll())
    titleResizeObserver.observe(titleRef.value.parentElement)
  }
})

onBeforeUnmount(() => {
  window.clearTimeout(desktopPressTimer)
  titleResizeObserver?.disconnect()
  titleResizeObserver = null
})
</script>

<template>
  <n-card class="panel-card screen-card">
    <div class="screen-controls">
      <n-button secondary @click="$emit('desktop', 'left')">← 桌面</n-button>
      <button class="screen-toggle" type="button" :aria-label="enabled ? '关闭屏幕预览' : '开启屏幕预览'" :aria-pressed="ariaPressed" @click="$emit('toggle')">
        <span class="screen-toggle-main">{{ enabled ? '关闭预览' : '开启预览' }}</span>
        <span class="screen-toggle-title-wrap"><span ref="titleRef" class="screen-toggle-title">{{ title }}</span></span>
      </button>
      <n-button secondary aria-label="短按切换到右侧桌面，长按新建桌面" @pointerdown="startDesktopPress" @pointerup="endDesktopPress" @pointercancel="endDesktopPress" @pointerleave="endDesktopPress" @click="clickRightDesktop">桌面 →</n-button>
    </div>
    <div class="screen-preview" :class="enabled ? 'on' : 'off'" role="button" aria-label="预览当前屏幕截图" @click="$emit('open-frame')">
      <div ref="stageRef" class="screen-stage" :style="{ aspectRatio: stageAspect }">
        <img v-if="streamUrl" ref="imageRef" class="screen-image" :src="streamUrl" alt="电脑屏幕预览" @load="handleImageLoad">
        <div class="cursor-layer">
          <div class="screen-cursor" :class="{ visible: cursorStyle }" :style="cursorStyle || {}"></div>
        </div>
      </div>
      <span v-if="!enabled">屏幕预览已关闭，请点上方按钮开启</span>
    </div>
  </n-card>
</template>
