<script setup>
defineProps({ show: Boolean, settings: Object })
defineEmits(['update:show', 'save-direct', 'open-direct'])
</script>

<template>
  <n-modal :show="show" preset="card" class="settings-modal" title="设置" @update:show="$emit('update:show', $event)">
    <div class="settings-grid">
      <label class="fieldline">
        <span>主机 IP</span>
        <n-input v-model:value="settings.directHost" placeholder="例如 192.168.1.23" />
      </label>
      <label class="fieldline">
        <span>端口</span>
        <n-input v-model:value="settings.directPort" placeholder="8790" />
      </label>
      <div class="row two">
        <n-button type="primary" @click="$emit('open-direct')">直连打开</n-button>
        <n-button secondary @click="$emit('save-direct')">保存</n-button>
      </div>
      <p class="hint">直连会打开 http://主机IP:端口，不走 Cloudflare。手机需和电脑在同一局域网。</p>
      <div class="switchline"><span>按键气泡</span><n-switch v-model:value="settings.keyBubble" /></div>
      <div class="switchline"><span>按键震动</span><n-switch v-model:value="settings.vibrate" /></div>
      <label class="range-line"><span>滚轮灵敏度：{{ settings.wheelSensitivity }}</span><n-slider v-model:value="settings.wheelSensitivity" :min="12" :max="48" :step="3" /></label>
      <label class="range-line"><span>触控板灵敏度：{{ settings.touchSensitivity }}</span><n-slider v-model:value="settings.touchSensitivity" :min="0.8" :max="3" :step="0.1" /></label>
    </div>
  </n-modal>
</template>
