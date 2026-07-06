<script setup>
defineProps({ collapsed: Boolean })
defineEmits(['window', 'toggle-wheel-down', 'toggle-wheel-move', 'toggle-wheel-end', 'touch-down', 'touch-move', 'touch-end', 'mouse-down', 'mouse-move', 'mouse-end', 'middle-wheel-down', 'middle-wheel-move', 'middle-wheel-end'])
</script>

<template>
  <n-card class="panel-card touch-section">
    <div class="screen-controls touch-controls">
      <n-button secondary @click="$emit('window', 'left')">← 窗口</n-button>
      <button class="section-toggle wheel-surface" type="button" :aria-expanded="String(!collapsed)" @pointerdown="$emit('toggle-wheel-down', $event)" @pointermove="$emit('toggle-wheel-move', $event)" @pointerup="$emit('toggle-wheel-end', $event)" @pointercancel="$emit('toggle-wheel-end', $event)">{{ collapsed ? '展开触控板\n（按住滚轮）' : '收起触控板\n（按住滚轮）' }}</button>
      <n-button secondary @click="$emit('window', 'right')">窗口 →</n-button>
    </div>
    <div class="touch-panel" :class="{ collapsed }">
      <div class="touch-pad" @pointerdown="$emit('touch-down', $event)" @pointermove="$emit('touch-move', $event)" @pointerup="$emit('touch-end', $event)" @pointercancel="$emit('touch-end', $event)" @pointerleave="$emit('touch-end', $event)">
        <span>触控板：单指移动，轻点左键</span>
      </div>
      <div class="row three">
        <button @pointerdown="$emit('mouse-down', $event, 'left')" @pointermove="$emit('mouse-move', $event)" @pointerup="$emit('mouse-end')" @pointercancel="$emit('mouse-end')" @pointerleave="$emit('mouse-end')">左键</button>
        <button class="wheel-surface" type="button" @pointerdown="$emit('middle-wheel-down', $event)" @pointermove="$emit('middle-wheel-move', $event)" @pointerup="$emit('middle-wheel-end', $event)" @pointercancel="$emit('middle-wheel-end', $event)">滚轮</button>
        <button @pointerdown="$emit('mouse-down', $event, 'right')" @pointermove="$emit('mouse-move', $event)" @pointerup="$emit('mouse-end')" @pointercancel="$emit('mouse-end')" @pointerleave="$emit('mouse-end')">右键</button>
      </div>
    </div>
  </n-card>
</template>
