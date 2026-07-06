import { computed, reactive, ref } from 'vue'
import { wsUrl, safeJsonParse } from '@/api/socket'
import { postJson } from '@/api/http'

export function useRemoteSocket(options = {}) {
  const callbacks = options
  const statusText = ref('未连接')
  const statusKind = ref('')
  const latencyMs = ref(null)
  const currentWindowTitle = ref('')
  const connected = ref(false)
  const heldKeys = reactive(new Set())
  let ws = null
  let reconnectTimer = 0
  let heartbeatTimer = 0
  let windowStateTimer = 0
  let lastPongAt = 0
  let eventId = 0
  let clientLogQueue = []
  let clientLogTimer = 0
  let intentionalDisconnect = false
  const intentionallyClosedSockets = new WeakSet()

  const latencyText = computed(() => latencyMs.value === null ? '-- ms' : `${latencyMs.value} ms`)

  function setCallbacks(nextCallbacks) {
    Object.assign(callbacks, nextCallbacks)
  }

  function setStatus(text, kind = '') {
    statusText.value = text
    statusKind.value = kind
  }

  function flushClientLogs() {
    if (!clientLogQueue.length) return
    const entries = clientLogQueue.splice(0, 50)
    postJson('/api/client-log', { entries }).catch(() => {
      clientLogQueue.unshift(...entries.slice(-20))
    })
  }

  function queueClientLog(kind, data = {}) {
    clientLogQueue.push({ kind, ts: Date.now(), ...data })
    if (clientLogQueue.length > 100) clientLogQueue = clientLogQueue.slice(-100)
    clearTimeout(clientLogTimer)
    clientLogTimer = window.setTimeout(flushClientLogs, 500)
  }

  function logSwitch(kind, data = {}) {
    queueClientLog(`switch:${kind}`, { href: location.href, host: location.host, wsState: ws?.readyState ?? null, lastPongAge: lastPongAt ? Date.now() - lastPongAt : null, ...data })
  }

  function send(payload) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return false
    ws.send(JSON.stringify(payload))
    return true
  }

  function sendInput(payload) {
    return send({ type: 'input', id: ++eventId, clientTs: Date.now(), ...payload })
  }

  function sendWindowControl(action, payload = {}) {
    return send({ type: 'window', id: ++eventId, action, ...payload })
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

  function startHeartbeat() {
    stopHeartbeat()
    lastPongAt = Date.now()
    heartbeatTimer = window.setInterval(() => {
      const now = Date.now()
      const pongAge = now - lastPongAt
      send({ type: 'ping', ts: now })
      if (pongAge > 5000) {
        logSwitch('heartbeat-timeout', { pongAge })
        callbacks.markDirectSuspect?.('heartbeat-timeout')
        callbacks.scheduleDirectFallback?.('heartbeat-timeout')
      }
    }, 3000)
  }

  function stopHeartbeat() {
    clearInterval(heartbeatTimer)
  }

  function applyWindowState(message) {
    if ('current' in message) currentWindowTitle.value = message.current?.title || ''
  }

  function connect() {
    intentionalDisconnect = false
    clearTimeout(reconnectTimer)
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return
    setStatus('连接中...')
    ws = new WebSocket(wsUrl())
    const activeWs = ws
    ws.addEventListener('open', () => {
      connected.value = true
      lastPongAt = Date.now()
      logSwitch('ws-open')
      callbacks.markDirectConfirmed?.()
      callbacks.clearDirectFallback?.()
      setStatus('已连接', 'connected')
      send({ type: 'claim' })
      requestWindowState()
      startHeartbeat()
    })
    ws.addEventListener('message', (event) => {
      const message = safeJsonParse(event.data)
      if (!message) return
      if (message.type === 'ack' && Number.isFinite(Number(message.seq))) callbacks.markRemoteMoveAcked?.(Number(message.seq))
      if (message.type === 'pong' && message.ts) {
        lastPongAt = Date.now()
        callbacks.markDirectConfirmed?.()
        latencyMs.value = Date.now() - message.ts
      }
      if (message.type === 'control' && !message.ok) setStatus(`被占用：${message.reason}`, 'error')
      if (message.type === 'error') setStatus(message.message, 'error')
      if (message.type === 'window_state') applyWindowState(message)
      if (message.type === 'window_error') {
        applyWindowState(message)
        if (message.message || message.error) setStatus(message.message || message.error, 'error')
      }
    })
    ws.addEventListener('close', () => {
      connected.value = false
      stopHeartbeat()
      stopWindowStatePolling()
      if (intentionalDisconnect || intentionallyClosedSockets.has(activeWs) || ws !== activeWs) {
        logSwitch('ws-close-intentional')
        setStatus('未连接')
        return
      }
      logSwitch('ws-close')
      callbacks.markDirectSuspect?.('ws-close')
      setStatus('已断开，重连中...', 'error')
      callbacks.scheduleDirectFallback?.('ws-close')
      reconnectTimer = window.setTimeout(connect, 1200)
    })
    ws.addEventListener('error', () => {
      connected.value = false
      logSwitch('ws-error')
      if (intentionalDisconnect || intentionallyClosedSockets.has(activeWs) || ws !== activeWs) return
      callbacks.markDirectSuspect?.('ws-error')
      setStatus('连接错误', 'error')
      callbacks.scheduleDirectFallback?.('ws-error')
    })
  }

  function disconnect() {
    intentionalDisconnect = true
    clearTimeout(reconnectTimer)
    reconnectTimer = 0
    stopHeartbeat()
    stopWindowStatePolling()
    if (ws) {
      intentionallyClosedSockets.add(ws)
      ws.close()
    }
    ws = null
    connected.value = false
    setStatus('未连接')
  }

  function tap(key) {
    return sendInput({ action: 'tap', key })
  }

  function keyDown(key) {
    if (heldKeys.has(key)) return true
    if (!sendInput({ action: 'down', key })) return false
    heldKeys.add(key)
    return true
  }

  function keyUp(key) {
    if (!heldKeys.has(key)) return true
    if (!sendInput({ action: 'up', key })) return false
    heldKeys.delete(key)
    return true
  }

  function sendCombo(modifiers, key) {
    const pressedByCombo = []
    for (const modifier of modifiers) {
      if (!heldKeys.has(modifier)) {
        if (!keyDown(modifier)) {
          for (const pressed of pressedByCombo.reverse()) keyUp(pressed)
          return false
        }
        pressedByCombo.push(modifier)
      }
    }
    const sent = tap(key)
    for (const modifier of pressedByCombo.reverse()) keyUp(modifier)
    return sent
  }

  function releaseHeldKeys() {
    for (const key of Array.from(heldKeys)) keyUp(key)
    flushClientLogs()
  }

  return { connected, statusText, statusKind, latencyText, currentWindowTitle, heldKeys, setCallbacks, connect, disconnect, send, sendInput, sendWindowControl, startWindowStatePolling, stopWindowStatePolling, tap, keyDown, keyUp, sendCombo, releaseHeldKeys, queueClientLog, logSwitch }
}
