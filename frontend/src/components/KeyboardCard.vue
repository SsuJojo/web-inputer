<script setup>
import { computed, ref } from 'vue'

const props = defineProps({ heldKeys: { type: Object, required: true }, keyBubble: Boolean, vibrate: Boolean })
const emit = defineEmits(['tap', 'key-down', 'key-up', 'toggle-modifier'])
const bubbles = ref({})
const fnActive = ref(false)
const digitKeys = '1234567890'.split('')
const fnDigits = [
  { key: 'f10', label: '10' },
  { key: 'f11', label: '11' },
  { key: 'f12', label: '12' },
  { key: 'f1', label: '1' },
  { key: 'f2', label: '2' },
  { key: 'f3', label: '3' },
  { key: 'f4', label: '4' },
  { key: 'f5', label: '5' },
  { key: 'f6', label: '6' },
]
const displayDigits = computed(() => fnActive.value ? fnDigits : digitKeys.map((key) => ({ key, label: key })))
const keyRows = [
  { className: 'qwerty', keys: 'qwertyuiop'.split('') },
  { className: 'home', keys: 'asdfghjkl'.split('') },
  { className: 'bottom', keys: 'zxcvbnm'.split('') },
]
const labels = { space: '空格', enter: 'Enter', backspace: '⌫', esc: 'Esc', tab: 'Tab', fn: 'Fn', ctrl: 'Ctrl', alt: 'Alt', shift: 'Shift', win: 'Win', up: '↑', down: '↓', left: '←', right: '→' }
const modifiers = ['ctrl', 'win', 'alt', 'shift']
const functionKeys = ['esc', 'tab', 'backspace', 'enter']

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

function tapDigit(item) {
  feedback(item.key)
  emit('tap', item.key)
}

function fnDown() {
  fnActive.value = true
  feedback('fn')
}

function fnUp() {
  fnActive.value = false
}

function toggleModifier(key) {
  feedback(key)
  emit('toggle-modifier', key)
}
</script>

<template>
  <n-card class="panel-card keyboard">
    <div class="row four">
      <button v-for="key in modifiers" :key="key" class="toggle" :class="{ active: heldKeys.has(key) }" :aria-pressed="heldKeys.has(key)" :aria-label="`${label(key)} ${heldKeys.has(key) ? '已锁定' : '未锁定'}`" @click="toggleModifier(key)"><span class="lock-icon" aria-hidden="true">{{ heldKeys.has(key) ? '🔒' : '🔓' }}</span>{{ label(key) }}<span v-if="bubbles[key]" class="key-bubble">{{ label(key) }}</span></button>
    </div>
    <div class="row four">
      <button v-for="key in functionKeys" :key="key" @click="tap(key)">{{ label(key) }}<span v-if="bubbles[key]" class="key-bubble">{{ label(key) }}</span></button>
    </div>
    <div class="arrows">
      <span></span><button @click="tap('up')">↑<span v-if="bubbles.up" class="key-bubble">↑</span></button><span></span>
      <button @click="tap('left')">←<span v-if="bubbles.left" class="key-bubble">←</span></button>
      <button @click="tap('down')">↓<span v-if="bubbles.down" class="key-bubble">↓</span></button>
      <button @click="tap('right')">→<span v-if="bubbles.right" class="key-bubble">→</span></button>
    </div>
    <div class="key-grid" :class="{ 'fn-active': fnActive }">
      <div class="key-row digits" :class="{ 'fn-digits': fnActive }">
        <button v-for="item in displayDigits" :key="item.key" @click="tapDigit(item)">{{ item.label }}<span v-if="bubbles[item.key]" class="key-bubble">{{ item.label }}</span></button>
      </div>
      <div v-for="row in keyRows" :key="row.className" class="key-row" :class="row.className">
        <button v-for="key in row.keys" :key="key" @pointerdown.prevent="down(key)" @pointerup="up(key)" @pointercancel="up(key)" @pointerleave="up(key)">{{ label(key) }}<span v-if="bubbles[key]" class="key-bubble">{{ label(key) }}</span></button>
      </div>
      <div class="key-row space">
        <button class="fn-key" :class="{ active: fnActive }" aria-label="Fn 本地按住" :aria-pressed="fnActive" @pointerdown.prevent="fnDown" @pointerup="fnUp" @pointercancel="fnUp" @pointerleave="fnUp" @blur="fnUp">Fn<span v-if="bubbles.fn" class="key-bubble">Fn</span></button>
        <button @click="tap('space')">{{ label('space') }}<span v-if="bubbles.space" class="key-bubble">{{ label('space') }}</span></button>
        <button @click="tap('enter')">{{ label('enter') }}<span v-if="bubbles.enter" class="key-bubble">{{ label('enter') }}</span></button>
      </div>
    </div>
  </n-card>
</template>
