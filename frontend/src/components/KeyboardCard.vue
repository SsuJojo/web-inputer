<script setup>
import { ref } from 'vue'

const props = defineProps({ heldKeys: { type: Object, required: true }, keyBubble: Boolean, vibrate: Boolean })
const emit = defineEmits(['tap', 'key-down', 'key-up', 'toggle-modifier'])
const bubbles = ref({})
const keyRows = [
  { className: 'digits', keys: '1234567890'.split('') },
  { className: 'qwerty', keys: 'qwertyuiop'.split('') },
  { className: 'home', keys: 'asdfghjkl'.split('') },
  { className: 'bottom', keys: 'zxcvbnm'.split('').concat('backspace') },
  { className: 'space', keys: ['space', 'enter'] },
]
const labels = { space: '空格', enter: 'Enter', backspace: '⌫', esc: 'ESC', tab: 'Tab', up: '↑', down: '↓', left: '←', right: '→' }
const modifiers = ['ctrl', 'alt', 'shift', 'win']
const common = ['esc', 'tab', 'backspace', 'enter']

function label(key) {
  return labels[key] || key.toUpperCase()
}

function feedback(key) {
  if (props.vibrate && 'vibrate' in navigator) navigator.vibrate(8)
  if (!props.keyBubble) return
  bubbles.value = { ...bubbles.value, [key]: Date.now() }
  window.setTimeout(() => {
    const next = { ...bubbles.value }
    delete next[key]
    bubbles.value = next
  }, 180)
}

function tap(key) {
  feedback(key)
  emit('tap', key)
}

function down(key) {
  feedback(key)
  emit('key-down', key)
}

function up(key) {
  emit('key-up', key)
}

function toggleModifier(key) {
  feedback(key)
  emit('toggle-modifier', key)
}
</script>

<template>
  <n-card class="panel-card keyboard">
    <div class="row four">
      <button v-for="key in modifiers" :key="key" class="toggle" :class="{ active: heldKeys.has(key) }" @click="toggleModifier(key)">{{ label(key) }}<span v-if="bubbles[key]" class="key-bubble">{{ label(key) }}</span></button>
    </div>
    <div class="row four">
      <button v-for="key in common" :key="key" @click="tap(key)">{{ label(key) }}<span v-if="bubbles[key]" class="key-bubble">{{ label(key) }}</span></button>
    </div>
    <div class="arrows">
      <span></span><button @click="tap('up')">↑<span v-if="bubbles.up" class="key-bubble">↑</span></button><span></span>
      <button @click="tap('left')">←<span v-if="bubbles.left" class="key-bubble">←</span></button>
      <button @click="tap('down')">↓<span v-if="bubbles.down" class="key-bubble">↓</span></button>
      <button @click="tap('right')">→<span v-if="bubbles.right" class="key-bubble">→</span></button>
    </div>
    <div class="key-grid">
      <div v-for="row in keyRows" :key="row.className" class="key-row" :class="row.className">
        <button v-for="key in row.keys" :key="key" :class="{ 'backspace-key': key === 'backspace' }" @pointerdown.prevent="down(key)" @pointerup="up(key)" @pointercancel="up(key)" @pointerleave="up(key)">{{ label(key) }}<span v-if="bubbles[key]" class="key-bubble">{{ label(key) }}</span></button>
      </div>
    </div>
  </n-card>
</template>
