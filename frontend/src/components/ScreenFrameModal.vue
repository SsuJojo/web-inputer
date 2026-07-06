<script setup>
import { ref } from 'vue'

defineProps({ modalOpen: Boolean, frameUrl: String, closeAlignRight: Boolean })
defineEmits(['close', 'dblclick', 'touchend', 'image-load'])
const modalRef = ref(null)
const viewportRef = ref(null)
const stageRef = ref(null)
defineExpose({ modalRef, viewportRef, stageRef })
</script>

<template>
  <div v-show="modalOpen" ref="modalRef" id="screenFrameModal" class="modal" role="dialog" aria-modal="true" aria-label="屏幕截图预览">
    <div class="modal-backdrop" @click="$emit('close')"></div>
    <section class="modal-card screen-frame-card">
      <button class="ghost screen-frame-close" :class="{ 'align-right': closeAlignRight }" type="button" aria-label="关闭屏幕截图" @click="$emit('close')">×</button>
      <div ref="viewportRef" class="screen-frame-viewport" @dblclick.prevent="$emit('dblclick', $event)" @touchend="$emit('touchend', $event)">
        <div ref="stageRef" class="screen-frame-stage">
          <img :src="frameUrl" alt="屏幕截图预览" @load="$emit('image-load')">
        </div>
      </div>
    </section>
  </div>
</template>
