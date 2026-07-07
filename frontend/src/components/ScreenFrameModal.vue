<script setup>
import { ref } from 'vue'

defineProps({ modalOpen: Boolean, frameUrl: String, closeAlignRight: Boolean })
defineEmits(['close'])
const modalRef = ref(null)
defineExpose({ modalRef })
</script>

<template>
  <div v-show="modalOpen" ref="modalRef" id="screenFrameModal" class="modal screen-frame-modal" role="dialog" aria-modal="true" aria-label="屏幕截图预览">
    <section class="screen-frame-card">
      <button class="ghost screen-frame-close" :class="{ 'align-right': closeAlignRight }" type="button" aria-label="关闭屏幕截图" @click="$emit('close')">×</button>
    </section>
  </div>
</template>
