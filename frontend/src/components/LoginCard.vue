<script setup>
import { ref } from 'vue'

defineProps({ loading: Boolean, error: String })
const emit = defineEmits(['submit'])
const password = ref('')
const keepSignedIn = ref(false)

function submit() {
  emit('submit', { password: password.value, keepSignedIn: keepSignedIn.value })
}
</script>

<template>
  <n-card class="panel-card login-card">
    <h1>Remote Input</h1>
    <p class="muted">登录后即可用手机远程输入 Windows 键盘事件。</p>
    <n-form class="login-form" @submit.prevent="submit">
      <n-input v-model:value="password" type="password" autocomplete="current-password" placeholder="访问密码" size="large" />
      <n-checkbox v-model:checked="keepSignedIn">记住登录状态（不保存密码）</n-checkbox>
      <p class="hint">仅使用 HttpOnly 会话 Cookie，不在前端保存明文密码。</p>
      <n-button type="primary" size="large" block :loading="loading" @click="submit">登录</n-button>
    </n-form>
    <p class="error">{{ error }}</p>
  </n-card>
</template>
