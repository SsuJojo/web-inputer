const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');

function element() {
  const classes = new Set(['hidden']);
  return {
    value: '',
    checked: false,
    textContent: '',
    dataset: {},
    style: {},
    className: '',
    selectionStart: 0,
    selectionEnd: 0,
    classList: {
      contains: (className) => classes.has(className),
      add: (className) => classes.add(className),
      remove: (className) => classes.delete(className),
      toggle: (className, force) => {
        const enabled = force ?? !classes.has(className);
        if (enabled) classes.add(className);
        else classes.delete(className);
        return enabled;
      },
    },
    addEventListener: () => {},
    setAttribute: () => {},
    appendChild: () => {},
    removeAttribute: () => {},
    setPointerCapture: () => {},
    querySelector: () => null,
    setSelectionRange(start, end) {
      this.selectionStart = start;
      this.selectionEnd = end;
    },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 1000, toJSON: () => ({}) }),
    clientWidth: 1000,
    clientHeight: 1000,
  };
}

const elements = new Map();
function getElement(id) {
  if (!elements.has(id)) elements.set(id, element());
  return elements.get(id);
}

let now = 1000;
let serverCursor = {
  x: 700,
  y: 500,
  width: 1000,
  height: 1000,
  icon: 'cursor',
  hotspotX: 0,
  hotspotY: 0,
  iconWidth: 32,
  iconHeight: 32,
};

const sandbox = {
  console,
  Date: { now: () => now },
  JSON, URLSearchParams,
  Math,
  Map,
  Set,
  localStorage: { getItem: () => '{}', setItem: () => {} },
  location: { protocol: 'http:', host: 'localhost' },
  WebSocket: function WebSocket() {},
  ResizeObserver: function ResizeObserver() { this.observe = () => {}; },
  document: {
    getElementById: getElement,
    querySelectorAll: () => [],
    createElement: () => element(),
  },
  navigator: { serviceWorker: { register: () => ({ catch: () => {} }) } },
  setTimeout: () => 0,
  clearTimeout: () => {},
  setInterval: () => 0,
  clearInterval: () => {},
  window: {
    PUBLIC_ORIGIN: '',
    setTimeout: () => 0,
    clearTimeout: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    addEventListener: () => {},
  },
  fetch: async (url) => {
    if (String(url).startsWith('/api/screen/cursor')) {
      return { ok: true, json: async () => serverCursor };
    }
    if (String(url) === '/api/session') return new Promise(() => {});
    return { ok: false };
  },
};
sandbox.WebSocket.OPEN = 1;
sandbox.window.Date = sandbox.Date;
sandbox.window.ResizeObserver = sandbox.ResizeObserver;
sandbox.globalThis = sandbox;

const appJs = fs.readFileSync('app/static/app.js', 'utf8');
const source = appJs + `
  globalThis.__cursorTest = {
    seedMovingPrediction() {
      screenPreviewEnabled = true;
      cursorState = { x: 500, y: 500, width: 1000, height: 1000, icon: 'cursor', hotspotX: 0, hotspotY: 0, iconWidth: 32, iconHeight: 32, rx: 0.5, ry: 0.5 };
      cursorSyncAnchor = { rx: 0.5, ry: 0.5 };
      cursorSentSinceSync = { x: 100, y: 0 };
      lastCursorMoveAt = Date.now();
      cursorGainX = 1;
      cursorGainY = 1;
    },
    updateCursor,
    moveMouse,
    markRemoteMoveAcked,
    enterWebRemoteControl,
    CursorAuthority,
    state() {
      return {
        cursorState,
        cursorGainX,
        cursorGainY,
        screenCursorVisible: screenCursor.classList.contains('visible'),
      };
    },
    authorityState() {
      return {
        cursorAuthority,
        lastAckedRemoteMoveSeq,
        remoteMoveSeq,
        remoteControlUntil,
        suppressServerSyncUntil,
        lastRemoteInputAt,
        ledgerLength: remoteMoveLedger.length,
        ledgerAcked: remoteMoveLedger.map((item) => ({ seq: item.seq, acked: item.acked })),
        lastServerCursorPayload,
      };
    },
    resetAuthority() {
      cursorAuthority = CursorAuthority.PHYSICAL;
      lastRemoteInputAt = 0;
      remoteControlUntil = 0;
      suppressServerSyncUntil = 0;
      remoteMoveSeq = 0;
      lastAckedRemoteMoveSeq = 0;
      remoteMoveLedger = [];
      lastServerCursorPayload = null;
    },
    setCapturingWs() {
      const captured = [];
      WebSocket.OPEN = 1;
      ws = { readyState: 1, send: (data) => captured.push(JSON.parse(data)) };
      return captured;
    },
  };
`;
vm.runInNewContext(source, sandbox, { filename: 'app/static/app.js' });

(async () => {
  assert.ok(appJs.includes("WEB_REMOTE: 'web-remote-control'"), 'web remote authority constant exists');
  assert.ok(appJs.includes("PHYSICAL: 'physical-mouse-active'"), 'physical authority constant exists');
  assert.ok(appJs.includes('applyServerCursorWithAuthority'), 'state-aware server cursor application exists');
  assert.ok(appJs.includes('REMOTE_SUPPRESS_SYNC_MS'), 'remote sync suppression window exists');
  assert.ok(appJs.includes('lastAckedRemoteMoveSeq'), 'ack sequence tracking exists');
  assert.ok(appJs.includes('function queueMouseMove(dx, dy)'), 'mouse move coalescing helper exists');
  assert.ok(appJs.includes('window.requestAnimationFrame(() => {'), 'mouse move coalescing flushes by animation frame');

  const t = sandbox.__cursorTest;

  t.seedMovingPrediction();
  await t.updateCursor();
  const state = t.state();

  assert.equal(Math.round(state.cursorGainX * 100) / 100, 1.4);
  assert.equal(state.cursorState.rx, 0.7, 'moving cursor sync should correct prediction to measured server cursor');
  assert.equal(state.screenCursorVisible, true, 'screen preview overlay cursor should show predicted cursor');

  assert.equal(t.authorityState().cursorAuthority, t.CursorAuthority.PHYSICAL, 'cursor starts in physical authority when server explains state');

  t.resetAuthority();
  t.seedMovingPrediction();
  const captured = t.setCapturingWs();
  t.moveMouse(10, 5);

  assert.equal(captured.length, 1, 'moveMouse sends exactly one input message');
  assert.equal(captured[0].type, 'input', 'moveMouse sends an input message');
  assert.equal(captured[0].action, 'mouse_move', 'moveMouse sends a mouse_move action');
  assert.equal(captured[0].source, 'web-remote-control', 'moveMouse tags input with web remote source');
  assert.equal(Number.isFinite(captured[0].seq), true, 'moveMouse attaches a sequence number');
  assert.equal(captured[0].seq, 1, 'first remote move uses sequence 1');
  assert.equal(Number.isFinite(captured[0].clientTs), true, 'moveMouse attaches a client timestamp');
  assert.equal(captured[0].x, 10, 'moveMouse preserves dx payload');
  assert.equal(captured[0].y, 5, 'moveMouse preserves dy payload');

  const afterMove = t.authorityState();
  assert.equal(afterMove.cursorAuthority, 'web-remote-control', 'moveMouse enters web remote authority');
  assert.equal(afterMove.remoteMoveSeq, 1, 'remote move ledger sequence advances');
  assert.ok(afterMove.remoteControlUntil > now, 'remote control lock window is armed');
  assert.ok(afterMove.suppressServerSyncUntil > now, 'remote sync suppress window is armed');

  t.markRemoteMoveAcked(1);
  const afterAck = t.authorityState();
  assert.equal(afterAck.lastAckedRemoteMoveSeq, 1, 'ack updates last acked remote move sequence');
  assert.equal(afterAck.ledgerAcked[0]?.acked, true, 'ack marks the ledger entry as acked');

  t.resetAuthority();
  t.seedMovingPrediction();
  t.setCapturingWs();
  const farServerCursor = {
    x: 800,
    y: 500,
    width: 1000,
    height: 1000,
    icon: 'cursor',
    hotspotX: 0,
    hotspotY: 0,
    iconWidth: 32,
    iconHeight: 32,
  };
  serverCursor = farServerCursor;
  t.moveMouse(5, 0);
  const rxAfterPredict = t.state().cursorState.rx;
  await t.updateCursor();
  const protectedState = t.state();
  const protectedAuthority = t.authorityState();

  assert.notEqual(protectedState.cursorState.rx, 0.8, 'remote protection prevents immediate hard sync to server cursor');
  assert.ok(protectedState.cursorState.rx < 0.6, 'remote protection keeps predicted cursor position near prediction');
  assert.ok(Math.abs(protectedState.cursorState.rx - rxAfterPredict) < 1e-6, 'suppression window freezes predicted rx instead of blending');
  assert.equal(protectedAuthority.cursorAuthority, 'web-remote-control', 'explained remote move does not flip authority to physical');
  assert.equal(protectedState.screenCursorVisible, true, 'overlay cursor remains visible during remote protection');

  serverCursor = {
    x: 700,
    y: 500,
    width: 1000,
    height: 1000,
    icon: 'cursor',
    hotspotX: 0,
    hotspotY: 0,
    iconWidth: 32,
    iconHeight: 32,
  };

  console.log('PASS: cursor authority state machine checks passed');
})();
