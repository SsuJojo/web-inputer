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
  let framePlaceholderSrc = ''
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
  let streamAbortController = null
  let streamGeneration = 0
  let streamBlobUrl = ''

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

  function findJpegMarker(buf, marker, from) {
    const hi = (marker >> 8) & 0xff
    const lo = marker & 0xff
    for (let i = from; i < buf.length - 1; i += 1) {
      if (buf[i] === hi && buf[i + 1] === lo) return i
    }
    return -1
  }

  function pushStreamFrame(frameBytes, gen) {
    if (gen !== streamGeneration) return
    const url = URL.createObjectURL(new Blob([frameBytes], { type: 'image/jpeg' }))
    const prev = streamBlobUrl
    streamBlobUrl = url
    streamUrl.value = url
    if (prev) URL.revokeObjectURL(prev)
  }

  async function pumpMjpegStream(response, gen) {
    const reader = response.body.getReader()
    let buffer = new Uint8Array(0)
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done || gen !== streamGeneration) break
        const next = new Uint8Array(buffer.length + value.length)
        next.set(buffer)
        next.set(value, buffer.length)
        buffer = next
        while (true) {
          const soi = findJpegMarker(buffer, 0xffd8, 0)
          if (soi === -1) {
            buffer = buffer.length > 0 ? buffer.slice(buffer.length - 1) : buffer
            break
          }
          const eoi = findJpegMarker(buffer, 0xffd9, soi + 2)
          if (eoi === -1) {
            buffer = buffer.slice(soi)
            break
          }
          pushStreamFrame(buffer.subarray(soi, eoi + 2), gen)
          buffer = buffer.slice(eoi + 2)
        }
      }
    } catch (error) {
      if (error?.name !== 'AbortError') {
        queueClientLog?.('screen-stream-error', { message: String(error) })
      }
    }
  }

  function startStream() {
    stopStream()
    const gen = ++streamGeneration
    const controller = new AbortController()
    streamAbortController = controller
    fetch(`/api/screen/stream?ts=${Date.now()}`, { credentials: 'include', signal: controller.signal })
      .then((response) => {
        if (!response.ok || !response.body || gen !== streamGeneration) return
        return pumpMjpegStream(response, gen)
      })
      .catch((error) => {
        if (error?.name !== 'AbortError') {
          queueClientLog?.('screen-stream-error', { message: String(error) })
        }
      })
  }

  function stopStream() {
    streamGeneration += 1
    const controller = streamAbortController
    streamAbortController = null
    if (controller) controller.abort()
    if (streamBlobUrl) {
      URL.revokeObjectURL(streamBlobUrl)
      streamBlobUrl = ''
    }
    streamUrl.value = ''
  }

  function setScreenPreview(nextEnabled) {
    enabled.value = nextEnabled
    if (nextEnabled) {
      startStream()
      startCursorPolling()
      startWindowStatePolling()
    } else {
      if (frameModalOpen.value || screenFramePhotoSwipe || screenFrameOpenFrameRequest) closeScreenFrame()
      stopStream()
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
    stopScreenFrameOrientation()
    exitFullscreen()
    stopCursorPollingIfIdle()
    screenFramePhotoSwipe = null
    window.setTimeout(() => {
      screenFrameClosingFromPhotoSwipe = false
    }, 0)
  }

  async function openScreenFramePhotoSwipe(src, modalEl, msrc) {
    destroyScreenFramePhotoSwipe()
    if (!frameModalOpen.value) return
    const width = frameImageWidth || 1920
    const height = frameImageHeight || 1080
    try {
      const data = { src, width, height, alt: '屏幕截图预览' }
      if (msrc) data.msrc = msrc
      screenFramePhotoSwipe = new PhotoSwipe({
        dataSource: [data],
        index: 0,
        appendToEl: modalEl || document.body,
        bgOpacity: 1,
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
    framePlaceholderSrc = snapshot.src || ''
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
      openScreenFramePhotoSwipe(frameUrl.value, modalEl, framePlaceholderSrc).catch((error) => {
        console.debug('[screen-frame:photoswipe-load]', error)
        closeScreenFrame()
      })
    })
  }

  function closeScreenFrame() {
    if (!screenFrameClosingFromPhotoSwipe) destroyScreenFramePhotoSwipe()
    frameModalOpen.value = false
    stopScreenFrameOrientation()
    exitFullscreen()
    stopCursorPollingIfIdle()
  }

  return { enabled, streamUrl, frameModalOpen, frameUrl, closeAlignRight, formattedWindowTitle, setScreenPreview, toggleScreenPreview, switchDesktop, createDesktop, switchWindow, updateCursor, openScreenFrame, closeScreenFrame, refreshScreenFrame }
}
