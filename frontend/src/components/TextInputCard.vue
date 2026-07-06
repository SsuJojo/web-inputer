<script setup>
import { computed, nextTick, ref, watch } from 'vue'

const props = defineProps({ modelValue: String })
const emit = defineEmits(['update:modelValue', 'send', 'clipboard'])
const inputRef = ref(null)
const expanded = computed(() => String(props.modelValue || '').includes('\n'))

function update(value) {
  emit('update:modelValue', value)
}

function handleKeydown(event) {
  if (event.key !== 'Enter' || event.repeat) return
  event.preventDefault()
  emit('send', { pressEnterAfterText: true })
}

function insertNewline() {
  const el = inputRef.value?.textareaElRef || inputRef.value?.inputElRef
  const value = props.modelValue || ''
  const start = el?.selectionStart ?? value.length
  const end = el?.selectionEnd ?? start
  const next = `${value.slice(0, start)}\n${value.slice(end)}`
  update(next)
  nextTick(() => {
    const target = inputRef.value?.textareaElRef || inputRef.value?.inputElRef
    target?.focus()
    target?.setSelectionRange(start + 1, start + 1)
  })
}

watch(() => props.modelValue, () => {})
</script>

<template>
  <n-card class="panel-card">
    <label class="label">文本输入</label>
    <div class="text-input-row">
      <n-input ref="inputRef" :value="modelValue" type="textarea" :autosize="false" placeholder="输入文字后按 Enter 发送" :class="{ expanded }" @update:value="update" @keydown="handleKeydown" />
      <n-button secondary class="newline-button" aria-label="插入换行" @click="insertNewline">↵</n-button>
    </div>
    <div class="row two">
      <n-button type="primary" @click="$emit('send', { pressEnterAfterText: false })">发送文本</n-button>
      <n-button secondary @click="$emit('clipboard')">同步剪贴板</n-button>
    </div>
  </n-card>
</template>
