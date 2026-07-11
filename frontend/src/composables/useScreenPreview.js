import { computed, nextTick, ref } from 'vue'
import PhotoSwipe from 'photoswipe'
import 'photoswipe/style.css'

const CURSOR_POLL_WEB_MS = 200
const CURSOR_POLL_PHYSICAL_MS = 80

export function useScreenPreview({ cursorSync, sendWindowControl, tap, keyDown, keyUp, sendCombo, queueClientLog, currentWindowTitle }) {
  const enabled = ref(false)
  const streamUrl = ref('')
  const frameModalOpen = ref(false)
  const frameUrl = ref('')
  const closeAlignRight = ref(false)
  const placeholderSrc = ref('')
  let frameImageWidth = 0
  let frameImageHeight = 0
  let cursorTimer = 0
  let cursorRequestId = 0
  let cursorRequestInFlight = false
  let screenFramePhotoSwipe = null
  let screenFrameClosingFromPhotoSwipe = false
  let screenFrameOpenFrameRequest = 0
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
      if (frameModalOpen.value || screenFramePhotoSwipe || screenFrameOpenFrameRequest) closeScreenFrame()
      streamUrl.value = ''
      stopWindowStatePolling()
      stopCursorPollingIfIdle()
    }
  }

  function toggleScreenPreview() {
    setScreenPreview(!enabled.value)
  }

  function switchDesktop(direction) {
    if (sendCombo) sendCombo(['win', 'ctrl'], direction === 'left' ? 'left' : 'right')
    else {
      keyDown('win')
      keyDown('ctrl')
      tap(direction === 'left' ? 'left' : 'right')
      keyUp('ctrl')
      keyUp('win')
    }
    window.setTimeout(() => sendWindowControl('desktop_changed', { direction }), 450)
  }

  function createDesktop() {
    if (sendCombo) sendCombo(['win', 'ctrl'], 'd')
    else {
      keyDown('win')
      keyDown('ctrl')
      tap('d')
      keyUp('ctrl')
      keyUp('win')
    }
    window.setTimeout(() => sendWindowControl('desktop_changed', { direction: 'new' }), 450)
  }

  function switchWindow(direction) {
    sendWindowControl('switch', { direction })
  }

  function cancelScreenFrameOpenRequest() {
    if (!screenFrameOpenFrameRequest) return
    window.cancelAnimationFrame(screenFrameOpenFrameRequest)
    screenFrameOpenFrameRequest = 0
  }

  function destroyScreenFramePhotoSwipe() {
    cancelScreenFrameOpenRequest()
    if (!screenFramePhotoSwipe) return
    const instance = screenFramePhotoSwipe
    if (instance.opener?.isOpening && !instance.opener?.isOpen) {
      instance.opener.isOpening = false
      instance.opener.isOpen = false
    }
    instance.destroy()
    if (screenFramePhotoSwipe === instance && instance.isDestroying) screenFramePhotoSwipe = null
  }

  function syncScreenFrameClosedFromPhotoSwipe(instance) {
    if (screenFramePhotoSwipe && screenFramePhotoSwipe !== instance) return
    screenFrameClosingFromPhotoSwipe = true
    frameModalOpen.value = false
    placeholderSrc.value = ''
    stopScreenFrameOrientation()
    exitFullscreen()
    stopCursorPollingIfIdle()
    screenFramePhotoSwipe = null
    window.setTimeout(() => {
      screenFrameClosingFromPhotoSwipe = false
    }, 0)
  }

  async function openScreenFramePhotoSwipe(src, modalEl) {
    destroyScreenFramePhotoSwipe()
    if (!frameModalOpen.value) return
    const width = frameImageWidth || 1920
    const height = frameImageHeight || 1080
    try {
      screenFramePhotoSwipe = new PhotoSwipe({
        dataSource: [{ src, width, height, alt: '屏幕截图预览' }],
        index: 0,
        appendToEl: modalEl || document.body,
        bgOpacity: placeholderSrc.value ? 0 : 1,
        showHideAnimationType: 'fade',
        wheelToZoom: true,
        zoom: false,
        close: false,
        counter: false,
        arrowKeys: false,
        paddingFn: () => ({ top: 6, bottom: 6, left: 6, right: 6 }),
      })
      const instance = screenFramePhotoSwipe
      instance.on('destroy', () => syncScreenFrameClosedFromPhotoSwipe(instance))
      instance.on('loadError', () => {
        console.debug('[screen-frame:photoswipe-load-error]')
        closeScreenFrame()
      })
      instance.init()
    } catch (error) {
      console.debug('[screen-frame:photoswipe]', error)
      frameModalOpen.value = false
      placeholderSrc.value = ''
      stopScreenFrameOrientation()
      exitFullscreen()
    }
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

  async function openScreenFrame(modalEl, snapshot = {}) {
    moveScreenFrameCloseTo('left')
    refreshScreenFrame()
    placeholderSrc.value = snapshot.src || ''
    frameImageWidth = snapshot.width || 0
    frameImageHeight = snapshot.height || 0
    frameModalOpen.value = true
    await nextTick()
    await requestFullscreen(modalEl)
    requestScreenFrameOrientation()
    cancelScreenFrameOpenRequest()
    screenFrameOpenFrameRequest = window.requestAnimationFrame(() => {
      screenFrameOpenFrameRequest = 0
      if (!frameModalOpen.value) return
      openScreenFramePhotoSwipe(frameUrl.value, modalEl).catch((error) => {
        console.debug('[screen-frame:photoswipe-load]', error)
        closeScreenFrame()
      })
    })
  }

  function closeScreenFrame() {
    if (!screenFrameClosingFromPhotoSwipe) destroyScreenFramePhotoSwipe()
    frameModalOpen.value = false
    placeholderSrc.value = ''
    stopScreenFrameOrientation()
    exitFullscreen()
    stopCursorPollingIfIdle()
  }

  return { enabled, streamUrl, frameModalOpen, frameUrl, closeAlignRight, placeholderSrc, formattedWindowTitle, setScreenPreview, toggleScreenPreview, switchDesktop, createDesktop, switchWindow, updateCursor, openScreenFrame, closeScreenFrame, refreshScreenFrame }
}
