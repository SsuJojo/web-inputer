import { ref } from 'vue'

export const CursorAuthority = {
  WEB_REMOTE: 'web-remote-control',
  PHYSICAL: 'physical-mouse-active',
}

const REMOTE_LOCK_MS = 350
const REMOTE_SUPPRESS_SYNC_MS = 180
const PHYSICAL_DETECT_PX = 10
const REMOTE_EXPECT_WINDOW_MS = 500
const MAX_REMOTE_LEDGER = 40

export function useCursorSync({ sendInput, queueClientLog }) {
  const cursorState = ref(null)
  const cursorAuthority = ref(CursorAuthority.PHYSICAL)
  let lastRemoteInputAt = 0
  let remoteControlUntil = 0
  let suppressServerSyncUntil = 0
  let remoteMoveSeq = 0
  let lastAckedRemoteMoveSeq = 0
  let remoteMoveLedger = []
  let lastServerCursorPayload = null
  let cursorGainX = 1
  let cursorGainY = 1
  let cursorSentSinceSync = { x: 0, y: 0 }
  let cursorSyncAnchor = null
  let cursorPredictLogAt = 0
  let queuedMouseDx = 0
  let queuedMouseDy = 0
  let mouseMoveFlushFrame = 0

  function markRemoteMoveAcked(seq) {
    lastAckedRemoteMoveSeq = Math.max(lastAckedRemoteMoveSeq, seq)
    for (const item of remoteMoveLedger) if (item.seq === seq) item.acked = true
  }

  function enterWebRemoteControl(reason) {
    const now = Date.now()
    if (cursorAuthority.value !== CursorAuthority.WEB_REMOTE) queueClientLog?.('cursor-authority', { state: CursorAuthority.WEB_REMOTE, reason })
    cursorAuthority.value = CursorAuthority.WEB_REMOTE
    lastRemoteInputAt = now
    remoteControlUntil = now + REMOTE_LOCK_MS
    suppressServerSyncUntil = now + REMOTE_SUPPRESS_SYNC_MS
  }

  function rememberRemoteMove(dx, dy) {
    const move = { seq: ++remoteMoveSeq, dx, dy, sentAt: Date.now(), acked: false }
    remoteMoveLedger.push(move)
    if (remoteMoveLedger.length > MAX_REMOTE_LEDGER) remoteMoveLedger = remoteMoveLedger.slice(-MAX_REMOTE_LEDGER)
    return move.seq
  }

  function pruneRemoteMoveLedger(now) {
    remoteMoveLedger = remoteMoveLedger.filter((item) => now - item.sentAt < REMOTE_EXPECT_WINDOW_MS)
  }

  function recentRemoteMagnitude(now) {
    pruneRemoteMoveLedger(now)
    let dx = 0
    let dy = 0
    for (const item of remoteMoveLedger) {
      dx += item.dx
      dy += item.dy
    }
    return Math.hypot(dx, dy)
  }

  function serverCursorDistance(a, b) {
    if (!a || !b) return 0
    return Math.hypot((a.x || 0) - (b.x || 0), (a.y || 0) - (b.y || 0))
  }

  function serverMoveMatchesRemote(serverDelta, now) {
    if (now - lastRemoteInputAt > REMOTE_EXPECT_WINDOW_MS) return false
    const expected = recentRemoteMagnitude(now)
    if (expected < 1) return false
    const ratio = serverDelta / expected
    return ratio >= 0.15 && ratio <= 6
  }

  function cursorFromServer(serverCursor) {
    return { ...serverCursor, rx: serverCursor.width ? serverCursor.x / serverCursor.width : 0, ry: serverCursor.height ? serverCursor.y / serverCursor.height : 0 }
  }

  function predictCursorMove(dx, dy) {
    if (!cursorState.value) return
    cursorState.value.rx = Math.min(1, Math.max(0, cursorState.value.rx + (dx * cursorGainX) / cursorState.value.width))
    cursorState.value.ry = Math.min(1, Math.max(0, cursorState.value.ry + (dy * cursorGainY) / cursorState.value.height))
    cursorSentSinceSync.x += dx
    cursorSentSinceSync.y += dy
    const now = Date.now()
    if (now - cursorPredictLogAt > 180) {
      cursorPredictLogAt = now
      queueClientLog?.('cursor-predict', { dx, dy, rx: Number(cursorState.value.rx.toFixed(4)), ry: Number(cursorState.value.ry.toFixed(4)), sent: { ...cursorSentSinceSync }, gain: { x: Number(cursorGainX.toFixed(3)), y: Number(cursorGainY.toFixed(3)) } })
    }
  }

  function updateCursorGain(serverCursor) {
    const serverRx = serverCursor.width ? serverCursor.x / serverCursor.width : 0
    const serverRy = serverCursor.height ? serverCursor.y / serverCursor.height : 0
    if (!cursorSyncAnchor) {
      cursorSyncAnchor = { rx: serverRx, ry: serverRy }
      cursorSentSinceSync = { x: 0, y: 0 }
      return { actualDx: 0, actualDy: 0, measuredX: null, measuredY: null }
    }
    const minSent = 6
    const actualDx = (serverRx - cursorSyncAnchor.rx) * serverCursor.width
    const actualDy = (serverRy - cursorSyncAnchor.ry) * serverCursor.height
    let measuredX = null
    let measuredY = null
    if (Math.abs(cursorSentSinceSync.x) >= minSent && Math.sign(actualDx) === Math.sign(cursorSentSinceSync.x)) {
      measuredX = Math.min(6, Math.max(0.1, actualDx / cursorSentSinceSync.x))
      cursorGainX = cursorGainX * 0.6 + measuredX * 0.4
    }
    if (Math.abs(cursorSentSinceSync.y) >= minSent && Math.sign(actualDy) === Math.sign(cursorSentSinceSync.y)) {
      measuredY = Math.min(6, Math.max(0.1, actualDy / cursorSentSinceSync.y))
      cursorGainY = cursorGainY * 0.6 + measuredY * 0.4
    }
    cursorSyncAnchor = { rx: serverRx, ry: serverRy }
    const result = { actualDx, actualDy, measuredX, measuredY, sentX: cursorSentSinceSync.x, sentY: cursorSentSinceSync.y }
    cursorSentSinceSync = { x: 0, y: 0 }
    return result
  }

  function applyServerCursorWithAuthority(serverCursor) {
    const now = Date.now()
    const serverState = cursorFromServer(serverCursor)
    const serverDelta = serverCursorDistance(serverCursor, lastServerCursorPayload)
    const inRemoteProtection = now < remoteControlUntil || now < suppressServerSyncUntil
    const explainedByRemote = serverMoveMatchesRemote(serverDelta, now)
    if (serverDelta > PHYSICAL_DETECT_PX && !inRemoteProtection && !explainedByRemote) {
      if (cursorAuthority.value !== CursorAuthority.PHYSICAL) queueClientLog?.('cursor-authority', { state: CursorAuthority.PHYSICAL, reason: 'server-cursor-unexplained', serverDelta: Math.round(serverDelta) })
      cursorAuthority.value = CursorAuthority.PHYSICAL
    }
    if (cursorAuthority.value === CursorAuthority.PHYSICAL || !cursorState.value) {
      cursorState.value = serverState
      lastServerCursorPayload = serverCursor
      return { serverState, errorX: 0, errorY: 0, hard: true }
    }
    const errorX = (serverState.rx - cursorState.value.rx) * serverCursor.width
    const errorY = (serverState.ry - cursorState.value.ry) * serverCursor.height
    const errorPx = Math.hypot(errorX, errorY)
    if (now < suppressServerSyncUntil) {
      cursorState.value = { ...serverState, rx: cursorState.value.rx, ry: cursorState.value.ry }
      lastServerCursorPayload = serverCursor
      return { serverState, errorX, errorY, hard: false }
    }
    const remoteActive = now - lastRemoteInputAt < REMOTE_LOCK_MS
    if (remoteActive) {
      const alpha = errorPx < 20 ? 0.12 : 0.03
      cursorState.value = { ...serverState, rx: cursorState.value.rx + (serverState.rx - cursorState.value.rx) * alpha, ry: cursorState.value.ry + (serverState.ry - cursorState.value.ry) * alpha }
      lastServerCursorPayload = serverCursor
      return { serverState, errorX, errorY, hard: false }
    }
    cursorState.value = serverState
    lastServerCursorPayload = serverCursor
    return { serverState, errorX, errorY, hard: true }
  }

  function positionCursor(target, image) {
    if (!target || !image || !cursorState.value || !cursorState.value.icon) return null
    const state = cursorState.value
    const targetRect = target.getBoundingClientRect()
    const imageRect = image.getBoundingClientRect()
    const naturalRatio = state.width && state.height ? state.height / state.width : 0
    const width = imageRect.width || image.clientWidth || targetRect.width
    const height = imageRect.height || image.clientHeight || (naturalRatio ? width * naturalRatio : targetRect.height)
    if (!width || !height) return null
    const left = imageRect.width ? imageRect.left - targetRect.left : 0
    const top = imageRect.height ? imageRect.top - targetRect.top : 0
    const imageScale = state.width ? width / state.width : 1
    const cursorScale = Math.max(0.6, imageScale) * 1.2
    return {
      backgroundImage: `url("${state.icon}")`,
      left: `${left + state.rx * width - state.hotspotX * cursorScale}px`,
      top: `${top + state.ry * height - state.hotspotY * cursorScale}px`,
      width: `${state.iconWidth * cursorScale}px`,
      height: `${state.iconHeight * cursorScale}px`,
    }
  }

  function sendRemoteMouseMove(dx, dy) {
    const seq = rememberRemoteMove(dx, dy)
    return sendInput({ action: 'mouse_move', x: dx, y: dy, source: CursorAuthority.WEB_REMOTE, seq })
  }

  function moveMouse(dx, dy) {
    enterWebRemoteControl('mouse-move')
    if (cursorState.value && !cursorSyncAnchor) cursorSyncAnchor = { rx: cursorState.value.rx, ry: cursorState.value.ry }
    predictCursorMove(dx, dy)
    sendRemoteMouseMove(dx, dy)
  }

  function queueMouseMove(dx, dy) {
    queuedMouseDx += dx
    queuedMouseDy += dy
    if (mouseMoveFlushFrame) return
    mouseMoveFlushFrame = window.requestAnimationFrame(() => {
      mouseMoveFlushFrame = 0
      const flushDx = queuedMouseDx
      const flushDy = queuedMouseDy
      queuedMouseDx = 0
      queuedMouseDy = 0
      if (flushDx || flushDy) moveMouse(flushDx, flushDy)
    })
  }

  return { cursorState, cursorAuthority, markRemoteMoveAcked, enterWebRemoteControl, rememberRemoteMove, predictCursorMove, updateCursorGain, applyServerCursorWithAuthority, positionCursor, queueMouseMove }
}

