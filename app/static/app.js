const loginView = document.getElementById('loginView');
const controlView = document.getElementById('controlView');
const loginForm = document.getElementById('loginForm');
const passwordInput = document.getElementById('password');
const keepSignedIn = document.getElementById('keepSignedIn');
const loginError = document.getElementById('loginError');
const statusText = document.getElementById('statusText');
const latencyText = document.getElementById('latency');
const textInput = document.getElementById('textInput');
const newlineBtn = document.getElementById('newlineBtn');
const desktopLeftBtn = document.getElementById('desktopLeftBtn');
const screenToggle = document.getElementById('screenToggle');
const screenToggleText = document.getElementById('screenToggleText');
const screenWindowTitle = document.getElementById('screenWindowTitle');
const desktopRightBtn = document.getElementById('desktopRightBtn');
const screenPreview = document.getElementById('screenPreview');
const screenStage = document.getElementById('screenStage');
const screenImage = document.getElementById('screenImage');
const screenCursor = document.getElementById('screenCursor');
const screenFrameModal = document.getElementById('screenFrameModal');
const screenFrameBackdrop = document.getElementById('screenFrameBackdrop');
const screenFrameClose = document.getElementById('screenFrameClose');
const screenFrameImage = document.getElementById('screenFrameImage');
const screenFrameViewport = document.getElementById('screenFrameViewport');
const screenFrameStage = document.getElementById('screenFrameStage');
const keyPad = document.getElementById('keyPad');
const touchPad = document.getElementById('touchPad');
const windowLeftBtn = document.getElementById('windowLeftBtn');
const touchToggle = document.getElementById('touchToggle');
const windowRightBtn = document.getElementById('windowRightBtn');
const touchPanel = document.getElementById('touchPanel');
const wheelButton = document.getElementById('wheelButton');
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const settingsBackdrop = document.getElementById('settingsBackdrop');
const settingsClose = document.getElementById('settingsClose');
const bubbleSetting = document.getElementById('bubbleSetting');
const vibrateSetting = document.getElementById('vibrateSetting');
const wheelSensitivity = document.getElementById('wheelSensitivity');
const touchSensitivity = document.getElementById('touchSensitivity');
const directHost = document.getElementById('directHost');
const directPort = document.getElementById('directPort');
const openDirectBtn = document.getElementById('openDirectBtn');
const saveDirectBtn = document.getElementById('saveDirectBtn');

let ws = null;
let reconnectTimer = 0;
let directFallbackTimer = 0;
let heartbeatTimer = 0;
let lastPongAt = 0;
let eventId = 0;
let pointer = null;
let lastTouchTap = 0;
let touchClickTimer = 0;
let edgeScrollFrame = 0;
let edgeScrollLast = 0;
let wheelPointer = null;
let wheelInertiaTimer = 0;
let buttonDrag = null;
let screenPreviewEnabled = false;
let screenFramePanzoom = null;
let screenFrameWheelHandler = null;
let screenFrameZoomed = false;
let screenFrameLastTapAt = 0;
let screenFrameOrientationActive = false;
let screenFrameLastTiltScrollAt = 0;
let windowStateTimer = 0;
let currentWindowTitle = '';
let cursorTimer = 0;
let cursorState = null;
let cursorRequestId = 0;
let cursorRequestInFlight = false;
let lastPredictedAt = 0;
let lastCursorMoveAt = 0;
let cursorGainX = 1;
let cursorGainY = 1;
let cursorSentSinceSync = { x: 0, y: 0 };
let cursorSyncAnchor = null;
let cursorLogSeq = 0;
let cursorPredictLogAt = 0;
let clientLogQueue = [];
let clientLogTimer = 0;
const heldKeys = new Set();

const CursorAuthority = {
  WEB_REMOTE: 'web-remote-control',
  PHYSICAL: 'physical-mouse-active',
};

const REMOTE_LOCK_MS = 350;
const REMOTE_SUPPRESS_SYNC_MS = 180;
const PHYSICAL_DETECT_PX = 10;
const REMOTE_EXPECT_WINDOW_MS = 500;
const MAX_REMOTE_LEDGER = 40;
const CURSOR_POLL_WEB_MS = 200;
const CURSOR_POLL_PHYSICAL_MS = 80;

let cursorAuthority = CursorAuthority.PHYSICAL;
let lastRemoteInputAt = 0;
let remoteControlUntil = 0;
let suppressServerSyncUntil = 0;
let remoteMoveSeq = 0;
let lastAckedRemoteMoveSeq = 0;
let remoteMoveLedger = [];
let lastServerCursorPayload = null;

const PUBLIC_ORIGIN = String(window.PUBLIC_ORIGIN || '').replace(/\/+$/, '');
const PUBLIC_ORIGIN_CONFIGURED = /^https?:\/\//i.test(PUBLIC_ORIGIN);
const PUBLIC_HOSTNAME = (() => {
  const match = /^https?:\/\/([^/:?#]+)/i.exec(PUBLIC_ORIGIN);
  return match ? match[1] : '';
})();

const settings = loadSettings();
hydrateDirectSettingsFromLocation();

function loadSettings() {
  const stored = JSON.parse(localStorage.getItem('remoteInputSettings') || '{}');
  return {
    keyBubble: stored.keyBubble ?? true,
    vibrate: stored.vibrate ?? true,
    wheelSensitivity: stored.wheelSensitivity ?? 24,
    touchSensitivity: stored.touchSensitivity ?? 1.6,
    directHost: stored.directHost ?? '',
    directPort: stored.directPort ?? '8790',
    directConfirmedAt: stored.directConfirmedAt ?? 0,
    directSuspectUntil: stored.directSuspectUntil ?? 0,
    textInput: stored.textInput ?? '',
    textSelectionStart: stored.textSelectionStart ?? 0,
    textSelectionEnd: stored.textSelectionEnd ?? 0,
    screenFrameZoom: stored.screenFrameZoom ?? null,
    screenFrameScrollLeft: stored.screenFrameScrollLeft ?? 0,
    screenFrameScrollTop: stored.screenFrameScrollTop ?? 0,
  };
}

function saveSettings() {
  localStorage.setItem('remoteInputSettings', JSON.stringify(settings));
}

function hydrateDirectSettingsFromLocation() {
  const isPublicHost = PUBLIC_HOSTNAME && location.hostname === PUBLIC_HOSTNAME;
  const isLocalHost = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (location.protocol !== 'http:' || isPublicHost || isLocalHost) return;
  if (!settings.directHost) settings.directHost = location.hostname;
  if (!settings.directPort) settings.directPort = location.port || '8790';
  saveSettings();
}

function applySettings() {
  bubbleSetting.checked = settings.keyBubble;
  vibrateSetting.checked = settings.vibrate;
  wheelSensitivity.value = String(settings.wheelSensitivity);
  touchSensitivity.value = String(settings.touchSensitivity);
  directHost.value = settings.directHost;
  directPort.value = settings.directPort;
  textInput.value = settings.textInput;
  setTextInputExpanded(textInput.value.includes('\n'));
  const start = Math.min(settings.textSelectionStart, textInput.value.length);
  const end = Math.min(settings.textSelectionEnd, textInput.value.length);
  textInput.setSelectionRange(start, end);
}

function setStatus(text, kind = '') {
  statusText.textContent = text;
  statusText.className = `status ${kind}`;
}

function wsUrl() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws`;
}

function logSwitch(kind, data = {}) {
  queueClientLog(`switch:${kind}`, {
    href: location.href,
    host: location.host,
    savedDirect: settings.directHost ? `${settings.directHost}:${settings.directPort || '8790'}` : '',
    isDirect: isSavedDirectHost(),
    wsState: ws?.readyState ?? null,
    lastPongAge: lastPongAt ? Date.now() - lastPongAt : null,
    ...data,
  });
}

function directUrl() {
  if (!settings.directHost) return '';
  const port = settings.directPort || '8790';
  const params = new URLSearchParams(location.search);
  params.delete('direct');
  params.delete('directRetryAt');
  const query = params.toString();
  return `http://${settings.directHost}:${port}/${query ? `?${query}` : ''}${location.hash}`;
}

function publicUrl() {
  if (!PUBLIC_ORIGIN_CONFIGURED) return '';
  const params = new URLSearchParams(location.search);
  params.set('direct', 'off');
  params.set('directRetryAt', String(Date.now() + 5000));
  const query = params.toString();
  return `${PUBLIC_ORIGIN}/${query ? `?${query}` : ''}${location.hash}`;
}

function directRetryDelay() {
  const params = new URLSearchParams(location.search);
  if (params.get('direct') !== 'off') return 0;
  const retryAt = Number(params.get('directRetryAt') || 0);
  if (!Number.isFinite(retryAt)) return 0;
  return Math.max(0, retryAt - Date.now());
}

function isSavedDirectHost() {
  return Boolean(settings.directHost && location.hostname === settings.directHost);
}

function hasRecentDirectConfirmation() {
  return Boolean(settings.directConfirmedAt && Date.now() - settings.directConfirmedAt < 120000);
}

function isDirectSuspect() {
  return Boolean(settings.directSuspectUntil && Date.now() < settings.directSuspectUntil);
}

function markDirectConfirmed() {
  if (!isSavedDirectHost()) return;
  settings.directConfirmedAt = Date.now();
  settings.directSuspectUntil = 0;
  saveSettings();
  logSwitch('direct-client-confirmed');
}

function markDirectSuspect(reason) {
  if (!isSavedDirectHost()) return;
  settings.directSuspectUntil = Date.now() + 30000;
  saveSettings();
  logSwitch('direct-suspect', { reason, until: settings.directSuspectUntil });
}

async function probeSavedDirect() {
  if (!settings.directHost) return false;
  const port = settings.directPort || '8790';
  const params = new URLSearchParams({ host: settings.directHost, port });
  try {
    const res = await fetch(`/api/direct-probe?${params}`);
    if (!res.ok) return false;
    const result = await res.json();
    return result.ok === true;
  } catch {
    return false;
  }
}

async function switchToSavedDirect() {
  const delay = directRetryDelay();
  if (delay > 0) {
    logSwitch('direct-retry-wait', { delay });
    clearTimeout(directFallbackTimer);
    directFallbackTimer = window.setTimeout(() => { switchToSavedDirect(); }, delay);
    return false;
  }
  const url = directUrl();
  if (!url) return false;
  if (isSavedDirectHost()) return false;
  if (location.protocol !== 'https:') return false;
  if (!hasRecentDirectConfirmation()) {
    logSwitch('direct-skip-unconfirmed');
    return false;
  }
  if (isDirectSuspect()) {
    logSwitch('direct-skip-suspect', { until: settings.directSuspectUntil });
    directFallbackTimer = window.setTimeout(() => { switchToSavedDirect(); }, Math.max(1000, settings.directSuspectUntil - Date.now()));
    return false;
  }
  if (!await probeSavedDirect()) {
    logSwitch('direct-probe-failed', { retryIn: 5000 });
    clearTimeout(directFallbackTimer);
    directFallbackTimer = window.setTimeout(() => { switchToSavedDirect(); }, 5000);
    return false;
  }
  logSwitch('direct-probe-ok', { url });
  window.location.href = url;
  return true;
}

function switchToPublic() {
  if (!isSavedDirectHost()) return false;
  const url = publicUrl();
  if (!url) {
    logSwitch('public-fallback-missing-origin');
    return false;
  }
  logSwitch('public-fallback-navigate', { url });
  window.location.href = url;
  return true;
}

function scheduleDirectFallback(reason = 'unknown') {
  if (!isSavedDirectHost()) return;
  logSwitch('public-fallback-scheduled', { reason, delay: 5000 });
  flushClientLogs();
  clearTimeout(directFallbackTimer);
  directFallbackTimer = window.setTimeout(() => {
    logSwitch('public-fallback-fired', {
      reason,
      visibility: document.visibilityState || '',
      online: navigator.onLine ?? null,
    });
    flushClientLogs();
    switchToPublic();
  }, 5000);
}

function clearDirectFallback() {
  clearTimeout(directFallbackTimer);
  directFallbackTimer = 0;
}

async function checkSession() {
  const res = await fetch('/api/session', { credentials: 'include' });
  if (res.ok) {
    showControl();
    connect();
  } else {
    showLogin();
  }
}

function showLogin() {
  setScreenPreview(false);
  loginView.classList.remove('hidden');
  controlView.classList.add('hidden');
}

function showControl() {
  loginView.classList.add('hidden');
  controlView.classList.remove('hidden');
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginError.textContent = '';
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ password: passwordInput.value, keepSignedIn: keepSignedIn.checked }),
  });
  if (!res.ok) {
    loginError.textContent = res.status === 429 ? '尝试过多，请稍后再试' : '密码错误';
    return;
  }
  passwordInput.value = '';
  showControl();
  connect();
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST', credentials: 'include' });
  disconnect();
  showLogin();
});

function connect() {
  clearTimeout(reconnectTimer);
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  setStatus('连接中...');
  ws = new WebSocket(wsUrl());
  ws.addEventListener('open', () => {
    lastPongAt = Date.now();
    logSwitch('ws-open');
    markDirectConfirmed();
    clearDirectFallback();
    setStatus('已连接', 'connected');
    send({ type: 'claim' });
    requestWindowState();
    startHeartbeat();
  });
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.type === 'ack' && Number.isFinite(Number(message.seq))) {
      markRemoteMoveAcked(Number(message.seq));
    }
    if (message.type === 'pong' && message.ts) {
      lastPongAt = Date.now();
      markDirectConfirmed();
      latencyText.textContent = `${Date.now() - message.ts} ms`;
    }
    if (message.type === 'control' && !message.ok) {
      setStatus(`被占用：${message.reason}`, 'error');
    }
    if (message.type === 'error') {
      setStatus(message.message, 'error');
    }
    if (message.type === 'window_state') {
      applyWindowState(message);
    }
    if (message.type === 'window_error') {
      applyWindowState(message);
      if (message.message || message.error) setStatus(message.message || message.error, 'error');
    }
  });
  ws.addEventListener('close', () => {
    logSwitch('ws-close');
    markDirectSuspect('ws-close');
    setStatus('已断开，重连中...', 'error');
    stopHeartbeat();
    scheduleDirectFallback('ws-close');
    reconnectTimer = window.setTimeout(connect, 1200);
  });
  ws.addEventListener('error', () => {
    logSwitch('ws-error');
    markDirectSuspect('ws-error');
    setStatus('连接错误', 'error');
    scheduleDirectFallback('ws-error');
  });
}

function disconnect() {
  clearTimeout(reconnectTimer);
  stopHeartbeat();
  stopWindowStatePolling();
  setScreenPreview(false);
  if (ws) ws.close();
  ws = null;
}

function startHeartbeat() {
  stopHeartbeat();
  lastPongAt = Date.now();
  heartbeatTimer = window.setInterval(() => {
    const now = Date.now();
    const pongAge = now - lastPongAt;
    send({ type: 'ping', ts: now });
    if (pongAge > 5000) {
      logSwitch('heartbeat-timeout', { pongAge });
      markDirectSuspect('heartbeat-timeout');
      scheduleDirectFallback('heartbeat-timeout');
    }
  }, 3000);
}

function stopHeartbeat() {
  clearInterval(heartbeatTimer);
}

function send(payload) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  ws.send(JSON.stringify(payload));
  return true;
}

function sendInput(payload) {
  const enriched = {
    type: 'input',
    id: ++eventId,
    clientTs: Date.now(),
    ...payload,
  };
  if (payload.action?.startsWith('mouse_') && !enriched.source) {
    enriched.source = cursorAuthority;
  }
  return send(enriched);
}

function sendWindowControl(action, payload = {}) {
  return send({ type: 'window', id: ++eventId, action, ...payload });
}

function setTouchToggleText(collapsed) {
  touchToggle.textContent = collapsed ? '展开触控板\n（按住滚轮）' : '收起触控板\n（按住滚轮）';
}

function formatWindowTitle(title) {
  const clean = String(title || '').trim();
  if (!clean) return '[无窗口]';
  const display = clean.length > 27 ? `${clean.slice(0, 27)}…` : clean;
  return `[${display}]`;
}

function updateTitleScroll() {
  const wrap = screenWindowTitle.parentElement;
  const overflow = Math.max(0, screenWindowTitle.scrollWidth - (wrap?.clientWidth || 0));
  screenWindowTitle.style.setProperty('--title-scroll-x', `${-overflow}px`);
  screenWindowTitle.classList.toggle('scrolling', overflow > 0);
}

function updateScreenToggleText() {
  screenToggleText.textContent = screenPreviewEnabled ? '关闭预览' : '开启预览';
  screenWindowTitle.textContent = formatWindowTitle(currentWindowTitle);
  window.requestAnimationFrame(updateTitleScroll);
}

function applyWindowState(message) {
  if ('current' in message) currentWindowTitle = message.current?.title || '';
  updateScreenToggleText();
}

function requestWindowState() {
  sendWindowControl('state');
}

function startWindowStatePolling() {
  clearInterval(windowStateTimer);
  requestWindowState();
  windowStateTimer = window.setInterval(requestWindowState, 2000);
}

function stopWindowStatePolling() {
  clearInterval(windowStateTimer);
  windowStateTimer = 0;
}

function tap(key) {
  sendInput({ action: 'tap', key });
}

function flushClientLogs() {
  if (!clientLogQueue.length) return;
  const entries = clientLogQueue.splice(0, 50);
  fetch('/api/client-log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ entries }),
  }).catch(() => {
    clientLogQueue.unshift(...entries.slice(-20));
  });
}

function queueClientLog(kind, data) {
  clientLogQueue.push({ kind, ts: Date.now(), ...data });
  if (clientLogQueue.length > 100) clientLogQueue = clientLogQueue.slice(-100);
  clearTimeout(clientLogTimer);
  clientLogTimer = window.setTimeout(flushClientLogs, 500);
}

function markRemoteMoveAcked(seq) {
  lastAckedRemoteMoveSeq = Math.max(lastAckedRemoteMoveSeq, seq);
  for (const item of remoteMoveLedger) {
    if (item.seq === seq) item.acked = true;
  }
}

function enterWebRemoteControl(reason) {
  const now = Date.now();
  if (cursorAuthority !== CursorAuthority.WEB_REMOTE) {
    queueClientLog('cursor-authority', { state: CursorAuthority.WEB_REMOTE, reason });
  }
  cursorAuthority = CursorAuthority.WEB_REMOTE;
  lastRemoteInputAt = now;
  remoteControlUntil = now + REMOTE_LOCK_MS;
  suppressServerSyncUntil = now + REMOTE_SUPPRESS_SYNC_MS;
}

function rememberRemoteMove(dx, dy) {
  const move = {
    seq: ++remoteMoveSeq,
    dx,
    dy,
    sentAt: Date.now(),
    acked: false,
  };
  remoteMoveLedger.push(move);
  if (remoteMoveLedger.length > MAX_REMOTE_LEDGER) remoteMoveLedger = remoteMoveLedger.slice(-MAX_REMOTE_LEDGER);
  return move.seq;
}

function pruneRemoteMoveLedger(now) {
  remoteMoveLedger = remoteMoveLedger.filter((item) => now - item.sentAt < REMOTE_EXPECT_WINDOW_MS);
}

function recentRemoteMagnitude(now) {
  pruneRemoteMoveLedger(now);
  let dx = 0;
  let dy = 0;
  for (const item of remoteMoveLedger) {
    dx += item.dx;
    dy += item.dy;
  }
  return Math.hypot(dx, dy);
}

function serverCursorDistance(a, b) {
  if (!a || !b) return 0;
  return Math.hypot((a.x || 0) - (b.x || 0), (a.y || 0) - (b.y || 0));
}

function serverMoveMatchesRemote(serverDelta, now) {
  if (now - lastRemoteInputAt > REMOTE_EXPECT_WINDOW_MS) return false;
  const expected = recentRemoteMagnitude(now);
  if (expected < 1) return false;
  const ratio = serverDelta / expected;
  return ratio >= 0.15 && ratio <= 6;
}

function sendRemoteMouseMove(dx, dy) {
  const seq = rememberRemoteMove(dx, dy);
  return sendInput({
    action: 'mouse_move',
    x: dx,
    y: dy,
    source: CursorAuthority.WEB_REMOTE,
    seq,
  });
}

function cursorFromServer(serverCursor) {
  return {
    ...serverCursor,
    rx: serverCursor.width ? serverCursor.x / serverCursor.width : 0,
    ry: serverCursor.height ? serverCursor.y / serverCursor.height : 0,
  };
}

function predictCursorMove(dx, dy) {
  if (!cursorState) return;
  cursorState.rx = Math.min(1, Math.max(0, cursorState.rx + (dx * cursorGainX) / cursorState.width));
  cursorState.ry = Math.min(1, Math.max(0, cursorState.ry + (dy * cursorGainY) / cursorState.height));
  cursorSentSinceSync.x += dx;
  cursorSentSinceSync.y += dy;
  lastPredictedAt = Date.now();
  lastCursorMoveAt = lastPredictedAt;
  if (lastPredictedAt - cursorPredictLogAt > 180) {
    cursorPredictLogAt = lastPredictedAt;
    queueClientLog('cursor-predict', {
      dx,
      dy,
      rx: Number(cursorState.rx.toFixed(4)),
      ry: Number(cursorState.ry.toFixed(4)),
      sent: { ...cursorSentSinceSync },
      gain: { x: Number(cursorGainX.toFixed(3)), y: Number(cursorGainY.toFixed(3)) },
    });
  }
  drawCursors();
}

function moveMouse(dx, dy) {
  enterWebRemoteControl('mouse-move');
  if (cursorState && !cursorSyncAnchor) cursorSyncAnchor = { rx: cursorState.rx, ry: cursorState.ry };
  predictCursorMove(dx, dy);
  sendRemoteMouseMove(dx, dy);
}

let queuedMouseDx = 0;
let queuedMouseDy = 0;
let mouseMoveFlushFrame = 0;

function queueMouseMove(dx, dy) {
  queuedMouseDx += dx;
  queuedMouseDy += dy;
  if (mouseMoveFlushFrame) return;
  mouseMoveFlushFrame = window.requestAnimationFrame(() => {
    mouseMoveFlushFrame = 0;
    const flushDx = queuedMouseDx;
    const flushDy = queuedMouseDy;
    queuedMouseDx = 0;
    queuedMouseDy = 0;
    if (flushDx || flushDy) moveMouse(flushDx, flushDy);
  });
}

function positionCursor(cursor, target, image) {
  if (!cursorState || !cursorState.icon) {
    cursor.classList.remove('visible');
    cursor.style.opacity = '0';
    cursor.style.display = 'none';
    return false;
  }
  cursor.style.backgroundImage = `url("${cursorState.icon}")`;
  const targetRect = target.getBoundingClientRect();
  const imageRect = image.getBoundingClientRect();
  const naturalRatio = cursorState.width && cursorState.height ? cursorState.height / cursorState.width : 0;
  const width = imageRect.width || image.clientWidth || targetRect.width;
  const height = imageRect.height || image.clientHeight || (naturalRatio ? width * naturalRatio : targetRect.height);
  if (!width || !height) {
    cursor.classList.remove('visible');
    cursor.style.opacity = '0';
    cursor.style.display = 'none';
    return false;
  }
  const left = imageRect.width ? imageRect.left - targetRect.left : 0;
  const top = imageRect.height ? imageRect.top - targetRect.top : 0;
  const imageScale = cursorState.width ? width / cursorState.width : 1;
  const cursorScale = Math.max(0.6, imageScale) * 1.2;
  const x = left + cursorState.rx * width - cursorState.hotspotX * cursorScale;
  const y = top + cursorState.ry * height - cursorState.hotspotY * cursorScale;
  cursor.style.left = `${x}px`;
  cursor.style.top = `${y}px`;
  cursor.style.width = `${cursorState.iconWidth * cursorScale}px`;
  cursor.style.height = `${cursorState.iconHeight * cursorScale}px`;
  cursor.style.display = 'block';
  cursor.style.opacity = '1';
  cursor.classList.add('visible');
  return true;
}

function drawCursors() {
  return positionCursor(screenCursor, screenStage, screenImage);
}

function scheduleCursorDraws() {
  const delays = [0, 16, 33, 80, 160, 320, 640, 1000, 1500, 2200];
  for (const delay of delays) window.setTimeout(drawCursors, delay);
  window.requestAnimationFrame(() => {
    drawCursors();
    window.requestAnimationFrame(drawCursors);
  });
}

async function primeCursorDraws() {
  await updateCursor();
  scheduleCursorDraws();
}

function updateCursorGain(serverCursor) {
  const serverRx = serverCursor.width ? serverCursor.x / serverCursor.width : 0;
  const serverRy = serverCursor.height ? serverCursor.y / serverCursor.height : 0;
  if (!cursorSyncAnchor) {
    cursorSyncAnchor = { rx: serverRx, ry: serverRy };
    cursorSentSinceSync = { x: 0, y: 0 };
    return { actualDx: 0, actualDy: 0, measuredX: null, measuredY: null };
  }
  const minSent = 6;
  const actualDx = (serverRx - cursorSyncAnchor.rx) * serverCursor.width;
  const actualDy = (serverRy - cursorSyncAnchor.ry) * serverCursor.height;
  let measuredX = null;
  let measuredY = null;
  if (Math.abs(cursorSentSinceSync.x) >= minSent && Math.sign(actualDx) === Math.sign(cursorSentSinceSync.x)) {
    measuredX = Math.min(6, Math.max(0.1, actualDx / cursorSentSinceSync.x));
    cursorGainX = cursorGainX * 0.6 + measuredX * 0.4;
  }
  if (Math.abs(cursorSentSinceSync.y) >= minSent && Math.sign(actualDy) === Math.sign(cursorSentSinceSync.y)) {
    measuredY = Math.min(6, Math.max(0.1, actualDy / cursorSentSinceSync.y));
    cursorGainY = cursorGainY * 0.6 + measuredY * 0.4;
  }
  cursorSyncAnchor = { rx: serverRx, ry: serverRy };
  const result = { actualDx, actualDy, measuredX, measuredY, sentX: cursorSentSinceSync.x, sentY: cursorSentSinceSync.y };
  cursorSentSinceSync = { x: 0, y: 0 };
  return result;
}

function applyServerCursorWithAuthority(serverCursor) {
  const now = Date.now();
  const serverState = cursorFromServer(serverCursor);
  const serverDelta = serverCursorDistance(serverCursor, lastServerCursorPayload);
  const inRemoteProtection = now < remoteControlUntil || now < suppressServerSyncUntil;
  const explainedByRemote = serverMoveMatchesRemote(serverDelta, now);

  if (serverDelta > PHYSICAL_DETECT_PX && !inRemoteProtection && !explainedByRemote) {
    if (cursorAuthority !== CursorAuthority.PHYSICAL) {
      queueClientLog('cursor-authority', {
        state: CursorAuthority.PHYSICAL,
        reason: 'server-cursor-unexplained',
        serverDelta: Math.round(serverDelta),
      });
    }
    cursorAuthority = CursorAuthority.PHYSICAL;
  }

  if (cursorAuthority === CursorAuthority.PHYSICAL || !cursorState) {
    cursorState = serverState;
    lastServerCursorPayload = serverCursor;
    return { serverState, errorX: 0, errorY: 0, hard: true };
  }

  const errorX = (serverState.rx - cursorState.rx) * serverCursor.width;
  const errorY = (serverState.ry - cursorState.ry) * serverCursor.height;
  const errorPx = Math.hypot(errorX, errorY);

  if (now < suppressServerSyncUntil) {
    cursorState = { ...serverState, rx: cursorState.rx, ry: cursorState.ry };
    lastServerCursorPayload = serverCursor;
    return { serverState, errorX, errorY, hard: false };
  }

  const remoteActive = now - lastRemoteInputAt < REMOTE_LOCK_MS;
  if (remoteActive) {
    const alpha = errorPx < 20 ? 0.12 : 0.03;
    cursorState = {
      ...serverState,
      rx: cursorState.rx + (serverState.rx - cursorState.rx) * alpha,
      ry: cursorState.ry + (serverState.ry - cursorState.ry) * alpha,
    };
    lastServerCursorPayload = serverCursor;
    return { serverState, errorX, errorY, hard: false };
  }

  cursorState = serverState;
  lastServerCursorPayload = serverCursor;
  return { serverState, errorX, errorY, hard: true };
}

async function updateCursor() {
  if (!screenPreviewEnabled) return;
  if (cursorRequestInFlight) return;
  cursorRequestInFlight = true;
  const requestId = ++cursorRequestId;
  const requestedAt = Date.now();
  try {
    const res = await fetch(`/api/screen/cursor?ts=${requestedAt}`, { credentials: 'include' });
    if (res.ok && requestId === cursorRequestId) {
      const serverCursor = await res.json();
      const before = cursorState ? { rx: cursorState.rx, ry: cursorState.ry } : null;
      const gainInfo = updateCursorGain(serverCursor);
      const authorityResult = applyServerCursorWithAuthority(serverCursor);
      const serverState = authorityResult.serverState;
      const errorX = authorityResult.errorX;
      const errorY = authorityResult.errorY;
      const movingNow = cursorAuthority === CursorAuthority.WEB_REMOTE;
      const logEntry = {
        seq: ++cursorLogSeq,
        hard: authorityResult.hard,
        movingNow,
        requestedAge: Date.now() - requestedAt,
        predicted: before,
        server: { rx: Number(serverState.rx.toFixed(4)), ry: Number(serverState.ry.toFixed(4)), x: serverCursor.x, y: serverCursor.y },
        error: { x: Math.round(errorX), y: Math.round(errorY) },
        sent: { x: gainInfo.sentX, y: gainInfo.sentY },
        actual: { x: gainInfo.actualDx, y: gainInfo.actualDy },
        measured: { x: gainInfo.measuredX, y: gainInfo.measuredY },
        gain: { x: Number(cursorGainX.toFixed(3)), y: Number(cursorGainY.toFixed(3)) },
        authority: cursorAuthority,
        lastAckedRemoteMoveSeq,
      };
      console.debug('[cursor-sync]', logEntry);
      queueClientLog('cursor-sync', {
        ...logEntry,
        visible: {
          preview: screenCursor.classList.contains('visible'),
          previewRect: screenStage.getBoundingClientRect().toJSON?.() || {},
          imageRect: screenImage.getBoundingClientRect().toJSON?.() || {},
        },
      });
      drawCursors();
    }
  } catch (error) {
    console.debug('[cursor-sync:error]', error);
    queueClientLog('cursor-sync-error', { message: String(error) });
  } finally {
    cursorRequestInFlight = false;
  }
}

function scheduleNextCursorPoll() {
  clearTimeout(cursorTimer);
  if (!screenPreviewEnabled) return;
  const delay = cursorAuthority === CursorAuthority.PHYSICAL ? CURSOR_POLL_PHYSICAL_MS : CURSOR_POLL_WEB_MS;
  cursorTimer = window.setTimeout(async () => {
    await updateCursor();
    scheduleNextCursorPoll();
  }, delay);
}

function startCursorPolling() {
  clearTimeout(cursorTimer);
  primeCursorDraws();
  scheduleNextCursorPoll();
}

function stopCursorPollingIfIdle() {
  if (screenPreviewEnabled) return;
  clearTimeout(cursorTimer);
  cursorTimer = 0;
  cursorRequestId += 1;
  cursorRequestInFlight = false;
  screenCursor.classList.remove('visible');
}

function setScreenPreview(enabled) {
  screenPreviewEnabled = enabled;
  screenToggle.setAttribute('aria-pressed', String(enabled));
  updateScreenToggleText();
  screenPreview.classList.toggle('on', enabled);
  screenPreview.classList.toggle('off', !enabled);
  if (enabled) {
    screenImage.src = `/api/screen/stream?ts=${Date.now()}`;
    startCursorPolling();
    startWindowStatePolling();
    scheduleCursorDraws();
  } else {
    screenImage.removeAttribute('src');
    stopWindowStatePolling();
    stopCursorPollingIfIdle();
  }
}

function toggleScreenPreview() {
  setScreenPreview(!screenPreviewEnabled);
}

function getPanzoomFactory() {
  return typeof window.Panzoom === 'function' ? window.Panzoom : null;
}

function initScreenFramePanzoom() {
  destroyScreenFramePanzoom();
  const Panzoom = getPanzoomFactory();
  if (!Panzoom) {
    console.warn('[screen-frame] Panzoom is unavailable');
    return;
  }
  screenFramePanzoom = Panzoom(screenFrameStage, {
    maxScale: 4,
    minScale: 1,
    contain: 'outside',
    canvas: true,
  });
  screenFrameZoomed = false;
  screenFrameWheelHandler = (event) => screenFramePanzoom?.zoomWithWheel(event);
  screenFrameViewport.addEventListener('wheel', screenFrameWheelHandler, { passive: false });
}

function destroyScreenFramePanzoom() {
  if (screenFrameWheelHandler) {
    screenFrameViewport.removeEventListener('wheel', screenFrameWheelHandler);
    screenFrameWheelHandler = null;
  }
  if (screenFramePanzoom?.destroy) screenFramePanzoom.destroy();
  else if (screenFramePanzoom?.dispose) screenFramePanzoom.dispose();
  screenFramePanzoom = null;
  screenFrameZoomed = false;
  screenFrameStage.style.transform = '';
}

function zoomScreenFrameToPoint(event, nextScale) {
  if (screenFramePanzoom?.zoomToPoint) {
    screenFramePanzoom.zoomToPoint(nextScale, event, { animate: true });
  } else {
    screenFramePanzoom?.zoom(nextScale, { animate: true });
  }
}

function toggleScreenFrameZoom(event) {
  if (!screenFramePanzoom) return;
  const nextScale = screenFrameZoomed ? 1 : 2;
  zoomScreenFrameToPoint(event, nextScale);
  screenFrameZoomed = nextScale > 1;
}

function refreshScreenFrame() {
  screenFrameImage.src = `/api/screen/frame?ts=${Date.now()}`;
}

async function requestScreenFrameFullscreen() {
  try {
    if (document.fullscreenElement || document.webkitFullscreenElement) return;
    const request = screenFrameModal.requestFullscreen || screenFrameModal.webkitRequestFullscreen;
    if (request) await request.call(screenFrameModal);
  } catch (error) {
    console.debug('[screen-frame:fullscreen]', error);
  }
}

async function exitScreenFrameFullscreen() {
  try {
    if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen();
    else if (document.webkitFullscreenElement && document.webkitExitFullscreen) await document.webkitExitFullscreen();
  } catch (error) {
    console.debug('[screen-frame:fullscreen-exit]', error);
  }
}

function moveScreenFrameCloseTo(side) {
  screenFrameClose.classList.toggle('align-right', side === 'right');
}

function handleScreenFrameOrientation(event) {
  if (screenFrameModal.classList.contains('hidden')) return;
  const gamma = Number(event.gamma);
  if (!Number.isFinite(gamma) || Math.abs(gamma) < 18) return;
  const now = Date.now();
  if (now - screenFrameLastTiltScrollAt < 900) return;
  screenFrameLastTiltScrollAt = now;
  moveScreenFrameCloseTo(gamma < 0 ? 'left' : 'right');
}

function startScreenFrameOrientation() {
  if (screenFrameOrientationActive || !('DeviceOrientationEvent' in window)) return;
  screenFrameOrientationActive = true;
  window.addEventListener('deviceorientation', handleScreenFrameOrientation);
}

async function requestScreenFrameOrientation() {
  const orientationEvent = window.DeviceOrientationEvent;
  if (!orientationEvent) return;
  try {
    if (typeof orientationEvent.requestPermission === 'function') {
      const permission = await orientationEvent.requestPermission();
      if (permission !== 'granted') return;
    }
    startScreenFrameOrientation();
  } catch (error) {
    console.debug('[screen-frame:orientation]', error);
  }
}

function stopScreenFrameOrientation() {
  if (!screenFrameOrientationActive) return;
  screenFrameOrientationActive = false;
  window.removeEventListener('deviceorientation', handleScreenFrameOrientation);
}

function openScreenFrame() {
  moveScreenFrameCloseTo('left');
  screenFrameModal.classList.remove('hidden');
  requestScreenFrameFullscreen();
  requestScreenFrameOrientation();
  window.requestAnimationFrame(() => {
    refreshScreenFrame();
    initScreenFramePanzoom();
  });
}

function closeScreenFrame() {
  destroyScreenFramePanzoom();
  screenFrameModal.classList.add('hidden');
  stopScreenFrameOrientation();
  exitScreenFrameFullscreen();
  stopCursorPollingIfIdle();
}

function switchDesktop(direction) {
  keyDown('win');
  keyDown('ctrl');
  tap(direction === 'left' ? 'left' : 'right');
  keyUp('ctrl');
  keyUp('win');
  window.setTimeout(() => sendWindowControl('desktop_changed', { direction }), 450);
}

function switchWindow(direction) {
  sendWindowControl('switch', { direction });
}

screenToggle.addEventListener('click', toggleScreenPreview);
desktopLeftBtn.addEventListener('click', () => switchDesktop('left'));
desktopRightBtn.addEventListener('click', () => switchDesktop('right'));
windowLeftBtn.addEventListener('click', () => switchWindow('left'));
windowRightBtn.addEventListener('click', () => switchWindow('right'));
screenPreview.addEventListener('click', openScreenFrame);
screenFrameClose.addEventListener('click', closeScreenFrame);
screenFrameBackdrop.addEventListener('click', closeScreenFrame);
screenImage.addEventListener('load', scheduleCursorDraws);
screenFrameImage.addEventListener('load', () => {
  if (screenFramePanzoom?.reset) screenFramePanzoom.reset();
  screenFrameZoomed = false;
});
screenPreview.addEventListener('transitionend', scheduleCursorDraws);
window.addEventListener('resize', scheduleCursorDraws);
window.addEventListener('orientationchange', scheduleCursorDraws);
if ('ResizeObserver' in window) {
  const cursorResizeObserver = new ResizeObserver(scheduleCursorDraws);
  cursorResizeObserver.observe(screenStage);
  cursorResizeObserver.observe(screenImage);
  cursorResizeObserver.observe(screenFrameStage);
  cursorResizeObserver.observe(screenFrameImage);
}

screenFrameViewport.addEventListener('dblclick', (event) => {
  event.preventDefault();
  toggleScreenFrameZoom(event);
});
screenFrameViewport.addEventListener('touchend', (event) => {
  if (event.changedTouches.length !== 1) return;
  const now = Date.now();
  if (now - screenFrameLastTapAt < 320) {
    event.preventDefault();
    toggleScreenFrameZoom(event.changedTouches[0]);
    screenFrameLastTapAt = 0;
    return;
  }
  screenFrameLastTapAt = now;
}, { passive: false });

function vibrate() {
  if (settings.vibrate && 'vibrate' in navigator) navigator.vibrate(8);
}

function showKeyBubble(button, label) {
  if (!settings.keyBubble) return;
  button.querySelector('.key-bubble')?.remove();
  const bubble = document.createElement('span');
  bubble.className = 'key-bubble';
  bubble.textContent = label;
  button.appendChild(bubble);
  window.setTimeout(() => bubble.remove(), 180);
}

function pressFeedback(button, label) {
  vibrate();
  showKeyBubble(button, label);
}

function keyDown(key) {
  if (heldKeys.has(key)) return;
  heldKeys.add(key);
  sendInput({ action: 'down', key });
}

function keyUp(key) {
  if (!heldKeys.has(key)) return;
  heldKeys.delete(key);
  sendInput({ action: 'up', key });
}

document.querySelectorAll('[data-tap]').forEach((button) => {
  button.addEventListener('click', () => {
    pressFeedback(button, button.textContent.trim());
    tap(button.dataset.tap);
  });
});

document.querySelectorAll('[data-key]').forEach((button) => {
  button.addEventListener('click', () => {
    const key = button.dataset.key;
    pressFeedback(button, button.textContent.trim());
    if (heldKeys.has(key)) {
      keyUp(key);
      button.classList.remove('active');
    } else {
      keyDown(key);
      button.classList.add('active');
    }
  });
});

document.querySelectorAll('[data-click]').forEach((button) => {
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    buttonDrag = { button: button.dataset.click, x: event.clientX, y: event.clientY, moved: false };
    sendInput({ action: 'mouse_down', button: button.dataset.click });
    button.setPointerCapture(event.pointerId);
  });
  button.addEventListener('pointermove', (event) => {
    if (!buttonDrag) return;
    const dx = Math.round((event.clientX - buttonDrag.x) * 2);
    const dy = Math.round((event.clientY - buttonDrag.y) * 2);
    if (Math.abs(dx) + Math.abs(dy) < 2) return;
    buttonDrag.moved = true;
    buttonDrag.x = event.clientX;
    buttonDrag.y = event.clientY;
    queueMouseMove(dx, dy);
  });
  function endButtonDrag() {
    if (!buttonDrag) return;
    sendInput({ action: 'mouse_up', button: buttonDrag.button });
    buttonDrag = null;
  }
  button.addEventListener('pointerup', endButtonDrag);
  button.addEventListener('pointercancel', endButtonDrag);
  button.addEventListener('pointerleave', endButtonDrag);
});

function openSettings() {
  settingsModal.classList.remove('hidden');
}

function closeSettings() {
  settingsModal.classList.add('hidden');
}

settingsBtn.addEventListener('click', openSettings);
settingsClose.addEventListener('click', closeSettings);
settingsBackdrop.addEventListener('click', closeSettings);

bubbleSetting.addEventListener('change', () => {
  settings.keyBubble = bubbleSetting.checked;
  saveSettings();
});

vibrateSetting.addEventListener('change', () => {
  settings.vibrate = vibrateSetting.checked;
  saveSettings();
});

wheelSensitivity.addEventListener('input', () => {
  settings.wheelSensitivity = Number(wheelSensitivity.value);
  saveSettings();
});

touchSensitivity.addEventListener('input', () => {
  settings.touchSensitivity = Number(touchSensitivity.value);
  saveSettings();
});

function saveDirectSettings() {
  settings.directHost = directHost.value.trim();
  settings.directPort = directPort.value.trim() || '8790';
  saveSettings();
}

saveDirectBtn.addEventListener('click', saveDirectSettings);
openDirectBtn.addEventListener('click', () => {
  saveDirectSettings();
  if (!settings.directHost) return;
  window.location.href = `http://${settings.directHost}:${settings.directPort}/`;
});

function toggleTouchPanel() {
  const collapsed = touchPanel.classList.toggle('collapsed');
  setTouchToggleText(collapsed);
  touchToggle.setAttribute('aria-expanded', String(!collapsed));
}

function setTextInputExpanded(expanded) {
  textInput.classList.toggle('expanded', expanded);
}

function isTextInputExpanded() {
  return textInput.classList.contains('expanded');
}

function saveTextInputState() {
  settings.textInput = textInput.value;
  settings.textSelectionStart = textInput.selectionStart ?? textInput.value.length;
  settings.textSelectionEnd = textInput.selectionEnd ?? settings.textSelectionStart;
  saveSettings();
}

function setTextInputValue(value, selectionStart = value.length, selectionEnd = selectionStart) {
  textInput.value = value;
  textInput.setSelectionRange(selectionStart, selectionEnd);
  setTextInputExpanded(value.includes('\n'));
  saveTextInputState();
}

function insertTextInputNewline() {
  const start = textInput.selectionStart ?? textInput.value.length;
  const end = textInput.selectionEnd ?? start;
  const value = `${textInput.value.slice(0, start)}\n${textInput.value.slice(end)}`;
  const cursor = start + 1;
  setTextInputValue(value, cursor, cursor);
  setTextInputExpanded(true);
  textInput.focus();
}

function sendTextFromInput({ pressEnterAfterText = false } = {}) {
  const text = textInput.value;
  if (text) {
    sendInput({ action: 'text', text });
    if (pressEnterAfterText) tap('enter');
  } else {
    tap('enter');
  }
  setTextInputValue('');
}

document.getElementById('sendTextBtn').addEventListener('click', sendTextFromInput);
newlineBtn.addEventListener('click', insertTextInputNewline);

textInput.addEventListener('input', saveTextInputState);
textInput.addEventListener('select', saveTextInputState);
textInput.addEventListener('keyup', saveTextInputState);
textInput.addEventListener('mouseup', saveTextInputState);

textInput.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  if (event.repeat) return;
  event.preventDefault();
  sendTextFromInput({ pressEnterAfterText: true });
});

document.getElementById('clipBtn').addEventListener('click', () => {
  const text = textInput.value;
  sendInput({ action: 'clipboard_set', text });
});

const keyRows = [
  { className: 'digits', keys: '1234567890'.split('') },
  { className: 'qwerty', keys: 'qwertyuiop'.split('') },
  { className: 'home', keys: 'asdfghjkl'.split('') },
  { className: 'bottom', keys: 'zxcvbnm'.split('').concat('backspace') },
  { className: 'space', keys: ['space', 'enter'] },
];

for (const row of keyRows) {
  const rowEl = document.createElement('div');
  rowEl.className = `key-row ${row.className}`;
  for (const key of row.keys) {
    const button = document.createElement('button');
    const keyLabels = { space: '空格', enter: 'Enter', backspace: '⌫' };
    button.textContent = keyLabels[key] || key.toUpperCase();
    if (key === 'backspace') button.classList.add('backspace-key');
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      pressFeedback(button, button.textContent.trim());
      keyDown(key);
    });
    button.addEventListener('pointerup', () => keyUp(key));
    button.addEventListener('pointercancel', () => keyUp(key));
    button.addEventListener('pointerleave', () => keyUp(key));
    rowEl.appendChild(button);
  }
  keyPad.appendChild(rowEl);
}

window.addEventListener('beforeunload', () => {
  flushClientLogs();
  for (const key of heldKeys) keyUp(key);
});

function stopWheelInertia() {
  clearTimeout(wheelInertiaTimer);
  wheelInertiaTimer = 0;
}

function runWheelInertia(dx, dy, speed) {
  stopWheelInertia();
  const interval = Math.max(32, Math.round(115 - speed * 18));
  const repeat = Math.max(1, Math.min(4, Math.round(speed)));
  function tick() {
    if (!wheelPointer) return;
    for (let i = 0; i < repeat; i += 1) sendInput({ action: 'mouse_wheel', dx, dy });
    wheelInertiaTimer = window.setTimeout(tick, interval);
  }
  wheelInertiaTimer = window.setTimeout(tick, 180);
}

function bindWheelSurface(element, tapAction) {
  element.addEventListener('pointerdown', (event) => {
    stopWheelInertia();
    wheelPointer = { x: event.clientX, y: event.clientY, moved: false, lastDx: 0, lastDy: 0, lastMoveAt: 0, travel: 0, speed: 1 };
    element.classList.add('wheeling');
    element.setPointerCapture(event.pointerId);
  });

  element.addEventListener('pointermove', (event) => {
    if (!wheelPointer) return;
    const dx = event.clientX - wheelPointer.x;
    const dy = event.clientY - wheelPointer.y;
    const threshold = settings.wheelSensitivity;
    if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return;
    const horizontal = Math.abs(dx) > Math.abs(dy);
    const wheelDx = horizontal ? (dx > 0 ? 1 : -1) : 0;
    const wheelDy = horizontal ? 0 : (dy > 0 ? -1 : 1);
    sendInput({ action: 'mouse_wheel', dx: wheelDx, dy: wheelDy });
    vibrate();
    const now = Date.now();
    const travel = wheelPointer.travel + Math.abs(dx) + Math.abs(dy);
    const elapsed = wheelPointer.lastMoveAt ? Math.max(16, now - wheelPointer.lastMoveAt) : 80;
    const instantSpeed = Math.min(4, Math.max(1, (Math.abs(dx) + Math.abs(dy)) / elapsed / 0.22));
    const speed = wheelPointer.speed * 0.45 + instantSpeed * 0.55;
    wheelPointer = {
      x: event.clientX,
      y: event.clientY,
      moved: true,
      lastDx: wheelDx,
      lastDy: wheelDy,
      lastMoveAt: now,
      travel,
      speed,
    };
    if (travel >= settings.wheelSensitivity * 3) runWheelInertia(wheelDx, wheelDy, speed);
  });

  function endWheel() {
    const wasTap = wheelPointer && !wheelPointer.moved;
    stopWheelInertia();
    wheelPointer = null;
    element.classList.remove('wheeling');
    if (wasTap) tapAction();
  }

  element.addEventListener('pointerup', endWheel);
  element.addEventListener('pointercancel', endWheel);
}

bindWheelSurface(touchToggle, toggleTouchPanel);
bindWheelSurface(wheelButton, () => sendInput({ action: 'mouse_click', button: 'middle' }));

function edgeVelocity(distance, axis = 'x') {
  if (!distance) return 0;
  const sign = Math.sign(distance);
  const limit = axis === 'y' ? 260 : 180;
  const speed = axis === 'y' ? 8 : 18;
  const eased = Math.sqrt(Math.min(Math.abs(distance), limit) / limit);
  return sign * Math.round(eased * speed * settings.touchSensitivity);
}

function updateEdgeScroll(x, y) {
  if (!pointer) return;
  const rect = touchPad.getBoundingClientRect();
  const rawEdgeX = x < rect.left ? x - rect.left : x > rect.right ? x - rect.right : 0;
  const rawEdgeY = y < rect.top ? y - rect.top : y > rect.bottom ? y - rect.bottom : 0;
  pointer.edgeX = Math.abs(rawEdgeX) > 18 ? rawEdgeX : 0;
  pointer.edgeY = Math.abs(rawEdgeY) > 28 ? rawEdgeY : 0;
  if (pointer.edgeX || pointer.edgeY) {
    pointer.edgeSince ||= performance.now();
    startEdgeScroll();
  } else {
    pointer.edgeSince = 0;
  }
}

function startEdgeScroll() {
  if (edgeScrollFrame) return;
  edgeScrollLast = 0;
  edgeScrollFrame = window.requestAnimationFrame(runEdgeScroll);
}

function stopEdgeScroll() {
  if (edgeScrollFrame) window.cancelAnimationFrame(edgeScrollFrame);
  edgeScrollFrame = 0;
  edgeScrollLast = 0;
}

function runEdgeScroll(time) {
  if (!pointer || (!pointer.edgeX && !pointer.edgeY)) {
    stopEdgeScroll();
    return;
  }
  const armed = pointer.edgeSince && time - pointer.edgeSince > 180;
  const elapsed = edgeScrollLast ? time - edgeScrollLast : 16;
  edgeScrollLast = time;
  if (!armed) {
    edgeScrollFrame = window.requestAnimationFrame(runEdgeScroll);
    return;
  }
  const dx = Math.round(edgeVelocity(pointer.edgeX, 'x') * elapsed / 16);
  const dy = Math.round(edgeVelocity(pointer.edgeY, 'y') * elapsed / 16);
  if (dx || dy) {
    pointer.moved = true;
    queueMouseMove(dx, dy);
  }
  edgeScrollFrame = window.requestAnimationFrame(runEdgeScroll);
}

touchPad.addEventListener('pointerdown', (event) => {
  const dragMode = Date.now() - lastTouchTap < 450;
  stopEdgeScroll();
  pointer = { x: event.clientX, y: event.clientY, moved: false, dragging: dragMode, edgeX: 0, edgeY: 0, edgeSince: 0 };
  if (dragMode) {
    clearTimeout(touchClickTimer);
    lastTouchTap = 0;
    vibrate();
    sendInput({ action: 'mouse_down', button: 'left' });
  }
  touchPad.setPointerCapture(event.pointerId);
});

touchPad.addEventListener('pointermove', (event) => {
  if (!pointer) return;
  const dx = Math.round((event.clientX - pointer.x) * settings.touchSensitivity);
  const dy = Math.round((event.clientY - pointer.y) * settings.touchSensitivity);
  if (Math.abs(dx) + Math.abs(dy) < 2) return;
  pointer.moved = true;
  pointer.x = event.clientX;
  pointer.y = event.clientY;
  updateEdgeScroll(event.clientX, event.clientY);
  queueMouseMove(dx, dy);
});

function endTouchPad(event) {
  stopEdgeScroll();
  if (!pointer) return;
  if (pointer.dragging) {
    sendInput({ action: 'mouse_up', button: 'left' });
  } else if (!pointer.moved) {
    lastTouchTap = Date.now();
    clearTimeout(touchClickTimer);
    touchClickTimer = window.setTimeout(() => {
      if (Date.now() - lastTouchTap >= 220) {
        lastTouchTap = 0;
        sendInput({ action: 'mouse_click', button: 'left' });
      }
    }, 220);
  }
  pointer = null;
  if (event?.type !== 'pointerup') {
    clearTimeout(touchClickTimer);
    lastTouchTap = 0;
  }
}

touchPad.addEventListener('pointerup', endTouchPad);
touchPad.addEventListener('pointercancel', endTouchPad);
touchPad.addEventListener('pointerleave', endTouchPad);

applySettings();
updateScreenToggleText();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/static/sw.js').catch(() => {});
}

switchToSavedDirect().then((switched) => {
  if (switched) return;
  checkSession().catch(() => {
    if (!switchToPublic()) showLogin();
  });
});
