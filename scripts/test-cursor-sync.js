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
const serverCursor = {
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
sandbox.window.Date = sandbox.Date;
sandbox.window.ResizeObserver = sandbox.ResizeObserver;
sandbox.globalThis = sandbox;

const source = fs.readFileSync('app/static/app.js', 'utf8') + `
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
    state() {
      return {
        cursorState,
        cursorGainX,
        cursorGainY,
        screenCursorVisible: screenCursor.classList.contains('visible'),
      };
    },
  };
`;
vm.runInNewContext(source, sandbox, { filename: 'app/static/app.js' });

(async () => {
  sandbox.__cursorTest.seedMovingPrediction();
  await sandbox.__cursorTest.updateCursor();
  const state = sandbox.__cursorTest.state();

  assert.equal(Math.round(state.cursorGainX * 100) / 100, 1.4);
  assert.equal(state.cursorState.rx, 0.7, 'moving cursor sync should correct prediction to measured server cursor');
  assert.equal(state.screenCursorVisible, true, 'screen preview overlay cursor should show predicted cursor');
})();
