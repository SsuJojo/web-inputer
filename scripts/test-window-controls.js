const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');

function element() {
  const listeners = new Map();
  const classes = new Set(['hidden']);
  return {
    value: '',
    checked: false,
    textContent: '',
    innerHTML: '',
    dataset: {},
    style: {},
    className: '',
    selectionStart: 0,
    selectionEnd: 0,
    focused: false,
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
    addEventListener: (type, listener) => {
      const eventListeners = listeners.get(type) ?? [];
      eventListeners.push(listener);
      listeners.set(type, eventListeners);
    },
    dispatch(type, event = {}) {
      const eventListeners = listeners.get(type) ?? [];
      for (const listener of eventListeners) listener(event);
    },
    setAttribute: () => {},
    appendChild: () => {},
    removeAttribute: () => {},
    setPointerCapture: () => {},
    querySelector: () => null,
    focus() {
      this.focused = true;
    },
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

const sentMessages = [];
function WebSocket() {}
WebSocket.OPEN = 1;

const sandbox = {
  console,
  sentMessages,
  Date: { now: () => 1000 },
  JSON, URLSearchParams,
  Math,
  Map,
  Set,
  localStorage: {
    value: '{}',
    getItem: function getItem() { return this.value; },
    setItem: function setItem(key, value) { this.value = value; },
  },
  location: { protocol: 'http:', host: 'localhost' },
  WebSocket,
  ResizeObserver: function ResizeObserver() { this.observe = () => {}; },
  document: {
    getElementById: getElement,
    querySelectorAll: () => [],
    createElement: () => element(),
  },
  navigator: { serviceWorker: { register: () => ({ catch: () => {} }) } },
  setTimeout: (fn) => { fn(); return 0; },
  clearTimeout: () => {},
  setInterval: () => 0,
  clearInterval: () => {},
  window: {
    PUBLIC_ORIGIN: '',
    setTimeout: (fn) => { fn(); return 0; },
    clearTimeout: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    addEventListener: () => {},
  },
  fetch: async (url) => {
    if (String(url) === '/api/session') return { ok: false };
    return { ok: false };
  },
};
sandbox.window.Date = sandbox.Date;
sandbox.window.ResizeObserver = sandbox.ResizeObserver;
sandbox.globalThis = sandbox;

const source = fs.readFileSync('app/static/app.js', 'utf8') + `
  ws = { readyState: WebSocket.OPEN, send: (message) => sentMessages.push(JSON.parse(message)) };
  globalThis.__windowControlsTest = {
    sentMessages,
    windowLeftBtn,
    windowRightBtn,
    desktopRightBtn,
    screenToggleText,
    screenWindowTitle,
    applyWindowState,
    setScreenPreview,
    touchPanel,
    touchToggle,
    toggleTouchPanel,
  };
`;
vm.runInNewContext(source, sandbox, { filename: 'app/static/app.js' });

const api = sandbox.__windowControlsTest;

api.windowRightBtn.dispatch('click');
assert.deepEqual(api.sentMessages.at(-1), { type: 'window', id: 1, action: 'switch', direction: 'right' });

api.windowLeftBtn.dispatch('click');
assert.deepEqual(api.sentMessages.at(-1), { type: 'window', id: 2, action: 'switch', direction: 'left' });

api.applyWindowState({ current: { title: 'Visual Studio Code - web-inputer' } });
assert.equal(api.screenWindowTitle.textContent, '[Visual Studio Code - web-in…]', 'window title should render in brackets and truncate');
assert.equal(api.screenToggleText.textContent, '开启预览', 'closed preview should use short label');

api.setScreenPreview(true);
assert.equal(api.screenToggleText.textContent, '关闭预览', 'opened preview should use short close label');
assert.equal(api.screenWindowTitle.textContent, '[Visual Studio Code - web-in…]', 'preview toggle should preserve window title');

api.touchPanel.classList.remove('collapsed');
api.toggleTouchPanel();
assert.equal(api.touchToggle.textContent, '展开触控板\n（按住滚轮）', 'closed touch toggle should keep two-line text with parentheses');
api.toggleTouchPanel();
assert.equal(api.touchToggle.textContent, '收起触控板\n（按住滚轮）', 'opened touch toggle should keep two-line text with parentheses');

api.desktopRightBtn.dispatch('click');
assert.equal(api.sentMessages.at(-1).type, 'window', 'desktop switch should notify window backend');
assert.equal(api.sentMessages.at(-1).action, 'desktop_changed', 'desktop switch should refresh backend window queue');
assert.equal(api.sentMessages.at(-1).direction, 'right', 'desktop switch direction should be forwarded');

console.log('window controls tests passed');
