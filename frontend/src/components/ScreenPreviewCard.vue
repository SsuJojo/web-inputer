<script setup>
import { computed, nextTick, ref, watch } from 'vue'

const props = defineProps({ enabled: Boolean, streamUrl: String, title: String, cursorStyle: Object })
defineEmits(['toggle', 'desktop', 'open-frame', 'image-load'])
const titleRef = ref(null)
const titleWrapRef = ref(null)
const stageRef = ref(null)
const imageRef = ref(null)
const isScrolling = ref(false)
const titleStyle = ref({})
const ariaPressed = computed(() => String(props.enabled))

defineExpose({ stageRef, imageRef })

function updateTitleScroll() {
  nextTick(() => {
    const title = titleRef.value
    const wrap = titleWrapRef.value
    const overflow = Math.max(0, (title?.scrollWidth || 0) - (wrap?.clientWidth || 0))
    titleStyle.value = { '--title-scroll-x': `${-overflow}px` }
    isScrolling.value = overflow > 0
  })
}

watch(() => props.title, updateTitleScroll)
</script>

<template>
  <n-card class="panel-card screen-card">
    <div class="screen-controls">
      <n-button secondary @click="$emit('desktop', 'left')">← 桌面</n-button>
      <button class="screen-toggle" type="button" :aria-pressed="ariaPressed" @click="$emit('toggle')">
        <span class="screen-toggle-main">{{ enabled ? '关闭预览' : '开启预览' }}</span>
        <span ref="titleWrapRef" class="screen-toggle-title-wrap"><span ref="titleRef" class="screen-toggle-title" :class="{ scrolling: isScrolling }" :style="titleStyle">{{ title }}</span></span>
      </button>
      <n-button secondary @click="$emit('desktop', 'right')">桌面 →</n-button>
    </div>
    <div class="screen-preview" :class="enabled ? 'on' : 'off'" role="button" aria-label="预览当前屏幕截图" @click="$emit('open-frame')" @transitionend="updateTitleScroll">
      <div ref="stageRef" class="screen-stage">
        <img v-if="streamUrl" ref="imageRef" class="screen-image" :src="streamUrl" alt="电脑屏幕预览" @load="() => { updateTitleScroll(); $emit('image-load') }">
        <div class="cursor-layer">
          <div class="screen-cursor" :class="{ visible: cursorStyle }" :style="cursorStyle || {}"></div>
        </div>
      </div>
      <span v-if="!enabled">屏幕预览已关闭，请点上方按钮开启</span>
    </div>
  </n-card>
</template>
