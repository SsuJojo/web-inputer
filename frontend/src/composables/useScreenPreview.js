import { computed, nextTick, ref } from 'vue'

const CURSOR_POLL_WEB_MS = 200
const CURSOR_POLL_PHYSICAL_MS = 80

export function useScreenPreview({ cursorSync, sendWindowControl, tap, keyDown, keyUp, queueClientLog, currentWindowTitle }) {
  const enabled = ref(false)
  const streamUrl = ref('')
  const frameModalOpen = ref(false)
  const frameUrl = ref('')
  const closeAlignRight = ref(false)
  let cursorTimer = 0
  let cursorRequestId = 0
  let cursorRequestInFlight = false
  let screenFramePanzoom = null
  let screenFrameWheelHandler = null
  let screenFrameZoomed = false
  let screenFrameLastTapAt = 0
  let orientationActive = false
  let lastTiltScrollAt = 0
  let windowStateTimer = 0

  const formattedWindowTitle = computed(() => {
    const clean = String(currentWindowTitle?.value || '').trim()
    if (!clean) return '[无窗口]'
    return `[${clean.length > 27 ? `${clean.slice(0, 27)}…` : clean}]`
  })

  async function updateCursor() {
    if (!enabled.value || cursorRequestInFlight) return
    cursorRequestInFlight = true
    const requestId = ++cursorRequestId
    const requestedAt = Date.now()
    try {
      const res = await fetch(`/api/screen/cursor?ts=${requestedAt}`, { credentials: 'include' })
      if (res.ok && requestId === cursorRequestId) {
        const serverCursor = await res.json()
        const gainInfo = cursorSync.updateCursorGain(serverCursor)
        const authorityResult = cursorSync.applyServerCursorWithAuthority(serverCursor)
        queueClientLog?.('cursor-sync', { hard: authorityResult.hard, sent: { x: gainInfo.sentX, y: gainInfo.sentY }, authority: cursorSync.cursorAuthority.value })
      }
    } catch (error) {
      queueClientLog?.('cursor-sync-error', { message: String(error) })
    } finally {
      cursorRequestInFlight = false
    }
  }

  function scheduleNextCursorPoll() {
    clearTimeout(cursorTimer)
    if (!enabled.value) return
    const delay = cursorSync.cursorAuthority.value === 'physical-mouse-active' ? CURSOR_POLL_PHYSICAL_MS : CURSOR_POLL_WEB_MS
    cursorTimer = window.setTimeout(async () => {
      await updateCursor()
      scheduleNextCursorPoll()
    }, delay)
  }

  async function startCursorPolling() {
    clearTimeout(cursorTimer)
    await updateCursor()
    scheduleNextCursorPoll()
  }

  function stopCursorPollingIfIdle() {
    if (enabled.value) return
    clearTimeout(cursorTimer)
    cursorTimer = 0
    cursorRequestId += 1
    cursorRequestInFlight = false
  }

  function requestWindowState() {
    sendWindowControl('state')
  }

  function startWindowStatePolling() {
    clearInterval(windowStateTimer)
    requestWindowState()
    windowStateTimer = window.setInterval(requestWindowState, 2000)
  }

  function stopWindowStatePolling() {
    clearInterval(windowStateTimer)
    windowStateTimer = 0
  }

  function setScreenPreview(nextEnabled) {
    enabled.value = nextEnabled
    if (nextEnabled) {
      streamUrl.value = `/api/screen/stream?ts=${Date.now()}`
      startCursorPolling()
      startWindowStatePolling()
    } else {
      streamUrl.value = ''
      stopWindowStatePolling()
      stopCursorPollingIfIdle()
    }
  }

  function toggleScreenPreview() {
    setScreenPreview(!enabled.value)
  }

  function switchDesktop(direction) {
    keyDown('win')
    keyDown('ctrl')
    tap(direction === 'left' ? 'left' : 'right')
    keyUp('ctrl')
    keyUp('win')
    window.setTimeout(() => sendWindowControl('desktop_changed', { direction }), 450)
  }

  function switchWindow(direction) {
    sendWindowControl('switch', { direction })
  }

  function getPanzoomFactory() {
    return typeof window.Panzoom === 'function' ? window.Panzoom : null
  }

  function destroyScreenFramePanzoom(viewportEl, stageEl) {
    if (screenFrameWheelHandler && viewportEl) viewportEl.removeEventListener('wheel', screenFrameWheelHandler)
    screenFrameWheelHandler = null
    if (screenFramePanzoom?.destroy) screenFramePanzoom.destroy()
    else if (screenFramePanzoom?.dispose) screenFramePanzoom.dispose()
    screenFramePanzoom = null
    screenFrameZoomed = false
    if (stageEl) stageEl.style.transform = ''
  }

  function initScreenFramePanzoom(viewportEl, stageEl) {
    destroyScreenFramePanzoom(viewportEl, stageEl)
    const Panzoom = getPanzoomFactory()
    if (!Panzoom || !stageEl || !viewportEl) return
    screenFramePanzoom = Panzoom(stageEl, { maxScale: 4, minScale: 1, contain: 'outside', canvas: true })
    screenFrameWheelHandler = (event) => screenFramePanzoom?.zoomWithWheel(event)
    viewportEl.addEventListener('wheel', screenFrameWheelHandler, { passive: false })
  }

  function zoomScreenFrameToPoint(event, nextScale) {
    if (screenFramePanzoom?.zoomToPoint) screenFramePanzoom.zoomToPoint(nextScale, event, { animate: true })
    else screenFramePanzoom?.zoom(nextScale, { animate: true })
  }

  function toggleScreenFrameZoom(event) {
    if (!screenFramePanzoom) return
    const nextScale = screenFrameZoomed ? 1 : 2
    zoomScreenFrameToPoint(event, nextScale)
    screenFrameZoomed = nextScale > 1
  }

  function refreshScreenFrame() {
    frameUrl.value = `/api/screen/frame?ts=${Date.now()}`
  }

  function moveScreenFrameCloseTo(side) {
    closeAlignRight.value = side === 'right'
  }

  function handleOrientation(event) {
    if (!frameModalOpen.value) return
    const gamma = Number(event.gamma)
    if (!Number.isFinite(gamma) || Math.abs(gamma) < 18) return
    const now = Date.now()
    if (now - lastTiltScrollAt < 900) return
    lastTiltScrollAt = now
    moveScreenFrameCloseTo(gamma < 0 ? 'left' : 'right')
  }

  function startScreenFrameOrientation() {
    if (orientationActive || !('DeviceOrientationEvent' in window)) return
    orientationActive = true
    window.addEventListener('deviceorientation', handleOrientation)
  }

  async function requestScreenFrameOrientation() {
    const orientationEvent = window.DeviceOrientationEvent
    if (!orientationEvent) return
    try {
      if (typeof orientationEvent.requestPermission === 'function') {
        const permission = await orientationEvent.requestPermission()
        if (permission !== 'granted') return
      }
      startScreenFrameOrientation()
    } catch (error) {
      console.debug('[screen-frame:orientation]', error)
    }
  }

  function stopScreenFrameOrientation() {
    if (!orientationActive) return
    orientationActive = false
    window.removeEventListener('deviceorientation', handleOrientation)
  }

  async function requestFullscreen(modalEl) {
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) return
      const request = modalEl?.requestFullscreen || modalEl?.webkitRequestFullscreen
      if (request) await request.call(modalEl)
    } catch (error) {
      console.debug('[screen-frame:fullscreen]', error)
    }
  }

  async function exitFullscreen() {
    try {
      if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen()
      else if (document.webkitFullscreenElement && document.webkitExitFullscreen) await document.webkitExitFullscreen()
    } catch (error) {
      console.debug('[screen-frame:fullscreen-exit]', error)
    }
  }

  async function openScreenFrame(modalEl, viewportEl, stageEl) {
    moveScreenFrameCloseTo('left')
    frameModalOpen.value = true
    await nextTick()
    requestFullscreen(modalEl)
    requestScreenFrameOrientation()
    window.requestAnimationFrame(() => {
      refreshScreenFrame()
      initScreenFramePanzoom(viewportEl, stageEl)
    })
  }

  function closeScreenFrame(viewportEl, stageEl) {
    destroyScreenFramePanzoom(viewportEl, stageEl)
    frameModalOpen.value = false
    stopScreenFrameOrientation()
    exitFullscreen()
    stopCursorPollingIfIdle()
  }

  function handleFrameTouchEnd(event) {
    if (event.changedTouches.length !== 1) return
    const now = Date.now()
    if (now - screenFrameLastTapAt < 320) {
      event.preventDefault()
      toggleScreenFrameZoom(event.changedTouches[0])
      screenFrameLastTapAt = 0
      return
    }
    screenFrameLastTapAt = now
  }

  return { enabled, streamUrl, frameModalOpen, frameUrl, closeAlignRight, formattedWindowTitle, setScreenPreview, toggleScreenPreview, switchDesktop, switchWindow, updateCursor, openScreenFrame, closeScreenFrame, toggleScreenFrameZoom, handleFrameTouchEnd, refreshScreenFrame }
}
