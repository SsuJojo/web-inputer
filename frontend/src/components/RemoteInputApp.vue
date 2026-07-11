<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useMessage } from 'naive-ui'
import LoginCard from './LoginCard.vue'
import StatusHeader from './StatusHeader.vue'
import ScreenPreviewCard from './ScreenPreviewCard.vue'
import TextInputCard from './TextInputCard.vue'
import TouchpadCard from './TouchpadCard.vue'
import KeyboardCard from './KeyboardCard.vue'
import SettingsModal from './SettingsModal.vue'
import PowerControlCard from './PowerControlCard.vue'
import PowerActionModal from './PowerActionModal.vue'
import ScreenFrameModal from './ScreenFrameModal.vue'
import { loadSettings, saveSettings } from '../composables/useSettings'
import { useSession } from '../composables/useSession'
import { useRemoteSocket } from '../composables/useRemoteSocket'
import { useCursorSync } from '../composables/useCursorSync'
import { useScreenPreview } from '../composables/useScreenPreview'
import { useTouchpad } from '../composables/useTouchpad'
import { usePowerControl } from '../composables/usePowerControl'

const message = useMessage()
const settings = loadSettings()
const settingsOpen = ref(false)
const loginLoading = ref(false)
const screenPreviewRef = ref(null)
const frameModalRef = ref(null)
const cursorStyle = ref(null)

const socket = useRemoteSocket({})
const session = useSession(settings, socket.logSwitch)
const cursorSync = useCursorSync({ sendInput: socket.sendInput, queueClientLog: socket.queueClientLog })
socket.setCallbacks({
  markRemoteMoveAcked: cursorSync.markRemoteMoveAcked,
  markDirectConfirmed: session.markDirectConfirmed,
  markDirectSuspect: session.markDirectSuspect,
  scheduleDirectFallback: session.scheduleDirectFallback,
  clearDirectFallback: session.clearDirectFallback,
})
const screenPreview = useScreenPreview({ cursorSync, sendWindowControl: socket.sendWindowControl, tap: socket.tap, keyDown: socket.keyDown, keyUp: socket.keyUp, sendCombo: socket.sendCombo, queueClientLog: socket.queueClientLog, currentWindowTitle: socket.currentWindowTitle })

function vibrate() {
  if (settings.vibrate && 'vibrate' in navigator) navigator.vibrate(8)
}

const touchpad = useTouchpad({ sendInput: socket.sendInput, queueMouseMove: cursorSync.queueMouseMove, settings, vibrate })
const power = usePowerControl(message)
const { checking, loginError } = session
const { statusText, statusKind, latencyText } = socket
const { enabled: previewEnabled, streamUrl, formattedWindowTitle, frameModalOpen, closeAlignRight, placeholderSrc } = screenPreview
const { collapsed: touchpadCollapsed } = touchpad
const { expanded: powerExpanded, loading: powerLoading, status: powerStatus, modalOpen: powerModalOpen, actionLabel: powerActionLabel } = power
const controlReady = computed(() => session.authenticated.value)

function updateCursorStyle() {
  const stage = screenPreviewRef.value?.stageRef
  const image = screenPreviewRef.value?.imageRef
  cursorStyle.value = cursorSync.positionCursor(stage, image)
}

function handleLogin(payload) {
  loginLoading.value = true
  session.login(payload.password, payload.keepSignedIn).then((ok) => {
    if (ok) socket.connect()
  }).finally(() => {
    loginLoading.value = false
  })
}

async function handleLogout() {
  screenPreview.setScreenPreview(false)
  socket.disconnect()
  await session.logout()
}

function sendText({ pressEnterAfterText = false } = {}) {
  const text = settings.textInput || ''
  const hasText = text.length > 0
  let ok = true
  if (hasText) {
    ok = socket.sendInput({ action: 'text', text })
    if (ok && pressEnterAfterText) ok = socket.tap('enter')
  } else {
    ok = socket.tap('enter')
  }
  if (!ok) {
    message.error('未连接电脑，发送失败')
    return
  }
  if (hasText) {
    message.success(pressEnterAfterText ? '文本已发送，并已发送 Enter' : '文本已发送')
    settings.textInput = ''
    saveSettings(settings)
  } else {
    message.success('已发送 Enter')
  }
}

function syncClipboard() {
  const ok = socket.sendInput({ action: 'clipboard_set', text: settings.textInput || '' })
  if (ok) message.success('剪贴板同步指令已发送')
  else message.error('未连接电脑，剪贴板同步失败')
}

function toggleModifier(key) {
  if (socket.heldKeys.has(key)) socket.keyUp(key)
  else socket.keyDown(key)
}

function saveDirect() {
  settings.directHost = String(settings.directHost || '').trim()
  settings.directPort = String(settings.directPort || '').trim() || '8790'
  saveSettings(settings)
  message.success('直连设置已保存')
}

function openDirect() {
  saveDirect()
  if (!settings.directHost) return
  window.location.href = `http://${settings.directHost}:${settings.directPort || '8790'}/`
}

function capturePreviewSnapshot() {
  const img = screenPreviewRef.value?.imageRef
  if (!img || !img.naturalWidth) return { src: '', width: 0, height: 0 }
  let src = ''
  try {
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.drawImage(img, 0, 0)
      src = canvas.toDataURL('image/jpeg', 0.7)
    }
  } catch (error) {
    src = ''
  }
  return { src, width: img.naturalWidth, height: img.naturalHeight }
}

function openFrame() {
  if (!previewEnabled.value) return
  screenPreview.openScreenFrame(frameModalRef.value?.modalRef, capturePreviewSnapshot())
}

function togglePowerExpanded() {
  powerExpanded.value = !powerExpanded.value
}

function closeFrame() {
  screenPreview.closeScreenFrame()
}

watch(settings, () => saveSettings(settings), { deep: true })
watch(() => cursorSync.cursorState.value, () => nextTick(updateCursorStyle), { deep: true })

onMounted(async () => {
  const switched = await session.switchToSavedDirect()
  if (switched) return
  const ok = await session.checkSession()
  if (ok) {
    socket.connect()
    power.refreshPowerStatus()
  } else if (!session.switchToPublic()) {
    screenPreview.setScreenPreview(false)
  }
  window.addEventListener('resize', updateCursorStyle)
  window.addEventListener('orientationchange', updateCursorStyle)
  window.addEventListener('beforeunload', socket.releaseHeldKeys)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateCursorStyle)
  window.removeEventListener('orientationchange', updateCursorStyle)
  window.removeEventListener('beforeunload', socket.releaseHeldKeys)
  screenPreview.setScreenPreview(false)
  socket.releaseHeldKeys()
  socket.disconnect()
})
</script>

<template>
  <main class="app-shell">
    <LoginCard v-if="!controlReady" :loading="loginLoading || checking" :error="loginError" @submit="handleLogin" />
    <section v-else>
      <StatusHeader :status-text="statusText" :status-kind="statusKind" :latency-text="latencyText" @settings="settingsOpen = true" @logout="handleLogout" />
      <ScreenPreviewCard
        ref="screenPreviewRef"
        :enabled="previewEnabled"
        :stream-url="streamUrl"
        :title="formattedWindowTitle"
        :cursor-style="cursorStyle"
        @toggle="screenPreview.toggleScreenPreview"
        @desktop="screenPreview.switchDesktop"
        @create-desktop="screenPreview.createDesktop"
        @open-frame="openFrame"
        @image-load="updateCursorStyle"
      />
      <TextInputCard v-model="settings.textInput" @send="sendText" @clipboard="syncClipboard" />
      <TouchpadCard
        :collapsed="touchpadCollapsed"
        @window="screenPreview.switchWindow"
        @toggle-wheel-down="touchpad.wheelPointerDown"
        @toggle-wheel-move="touchpad.wheelPointerMove"
        @toggle-wheel-end="(event) => touchpad.wheelPointerEnd(event, touchpad.toggleTouchPanel)"
        @touch-down="touchpad.touchPointerDown"
        @touch-move="touchpad.touchPointerMove"
        @touch-end="touchpad.touchPointerEnd"
        @mouse-down="touchpad.mouseButtonDown"
        @mouse-move="touchpad.mouseButtonMove"
        @mouse-end="touchpad.mouseButtonEnd"
        @middle-wheel-down="touchpad.wheelPointerDown"
        @middle-wheel-move="touchpad.wheelPointerMove"
        @middle-wheel-end="(event) => touchpad.wheelPointerEnd(event, () => socket.sendInput({ action: 'mouse_click', button: 'middle' }))"
      />
      <KeyboardCard :held-keys="socket.heldKeys" :key-bubble="settings.keyBubble" :vibrate="settings.vibrate" @tap="socket.tap" @key-down="socket.keyDown" @key-up="socket.keyUp" @toggle-modifier="toggleModifier" />
      <PowerControlCard :expanded="powerExpanded" :loading="powerLoading" :status="powerStatus" :format-remaining="power.formatPowerRemaining" @toggle="togglePowerExpanded" @refresh="power.refreshPowerStatus" @action="power.openPowerModal" @cancel="power.cancelPowerSchedule" />
    </section>

    <SettingsModal v-model:show="settingsOpen" :settings="settings" @save-direct="saveDirect" @open-direct="openDirect" />
    <PowerActionModal v-model:show="powerModalOpen" :loading="powerLoading" :action-label="powerActionLabel" :schedule="power.schedule" @confirm="power.confirmPowerAction" />
    <ScreenFrameModal ref="frameModalRef" :modal-open="frameModalOpen" :close-align-right="closeAlignRight" :placeholder-src="placeholderSrc" @close="closeFrame" />
  </main>
</template>




