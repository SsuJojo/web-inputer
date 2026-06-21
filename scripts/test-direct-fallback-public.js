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
    focus: () => {},
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

const fetchCalls = [];
const locationState = {
  protocol: 'http:',
  host: '100.72.54.81:8790',
  hostname: '100.72.54.81',
  pathname: '/',
  search: '',
  hash: '#pad',
  assigned: '',
};
Object.defineProperty(locationState, 'href', {
  get() {
    return `${this.protocol}//${this.host}${this.pathname}${this.search}${this.hash}`;
  },
  set(value) {
    this.assigned = value;
  },
});

function WebSocket() {}
WebSocket.OPEN = 1;

const sandbox = {
  console,
  Date: { now: () => 1000 },
  JSON,
  Math,
  Map,
  Set,
  URL,
  URLSearchParams,
  AbortController,
  localStorage: {
    value: JSON.stringify({ directHost: '100.72.54.81', directPort: '8790' }),
    getItem: function getItem() { return this.value; },
    setItem: function setItem(key, value) { this.value = value; },
  },
  location: locationState,
  WebSocket,
  ResizeObserver: function ResizeObserver() { this.observe = () => {}; },
  document: {
    getElementById: getElement,
    querySelectorAll: () => [],
    createElement: () => element(),
  },
  navigator: { serviceWorker: { register: () => ({ catch: () => {} }) } },
  setTimeout: (fn) => { fn(); return 1; },
  clearTimeout: () => {},
  setInterval: () => 0,
  clearInterval: () => {},
  window: {
    PUBLIC_ORIGIN: 'https://your-domain.example.com',
    setTimeout: (fn) => { fn(); return 1; },
    clearTimeout: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    addEventListener: () => {},
    location: locationState,
  },
  fetchCalls,
  locationState,
  fetch: async (url) => {
    fetchCalls.push(String(url));
    if (String(url) === '/api/session') throw new Error('direct unavailable');
    return { ok: false };
  },
};
sandbox.window.Date = sandbox.Date;
sandbox.window.ResizeObserver = sandbox.ResizeObserver;
sandbox.globalThis = sandbox;

const source = fs.readFileSync('app/static/app.js', 'utf8') + `
  globalThis.__directFallbackPublicTest = { fetchCalls, locationState };
`;
vm.runInNewContext(source, sandbox, { filename: 'app/static/app.js' });

setImmediate(() => {
  assert.equal(fetchCalls[0], '/api/session', 'direct page should check session first');
  assert.equal(locationState.assigned, 'https://your-domain.example.com/?direct=off&directRetryAt=6000#pad', 'direct page should fall back to public URL with a 5 second direct retry buffer and preserve hash');
});
