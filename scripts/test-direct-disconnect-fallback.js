const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');

function element() {
  const listeners = new Map();
  const classes = new Set(['hidden']);
  return {
    value: '', checked: false, textContent: '', dataset: {}, style: {}, className: '', selectionStart: 0, selectionEnd: 0,
    classList: {
      contains: (className) => classes.has(className), add: (className) => classes.add(className), remove: (className) => classes.delete(className),
      toggle: (className, force) => { const enabled = force ?? !classes.has(className); if (enabled) classes.add(className); else classes.delete(className); return enabled; },
    },
    addEventListener: (type, listener) => { const eventListeners = listeners.get(type) ?? []; eventListeners.push(listener); listeners.set(type, eventListeners); },
    dispatch(type, event = {}) { for (const listener of listeners.get(type) ?? []) listener(event); },
    setAttribute: () => {}, appendChild: () => {}, removeAttribute: () => {}, setPointerCapture: () => {}, querySelector: () => null, focus: () => {},
    setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 1000, toJSON: () => ({}) }), clientWidth: 1000, clientHeight: 1000,
  };
}

const elements = new Map();
function getElement(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); }

let now = 1000;
const timers = [];
const locationState = { protocol: 'http:', host: '100.72.54.81:8790', hostname: '100.72.54.81', pathname: '/', search: '', hash: '#pad', assigned: '' };
Object.defineProperty(locationState, 'href', { get() { return `${this.protocol}//${this.host}${this.pathname}${this.search}${this.hash}`; }, set(value) { this.assigned = value; } });

const sockets = [];
function WebSocket(url) { this.url = url; this.readyState = WebSocket.CONNECTING; this.listeners = new Map(); sockets.push(this); }
WebSocket.CONNECTING = 0;
WebSocket.OPEN = 1;
WebSocket.prototype.addEventListener = function addEventListener(type, listener) { const list = this.listeners.get(type) ?? []; list.push(listener); this.listeners.set(type, list); };
WebSocket.prototype.dispatch = function dispatch(type) { for (const listener of this.listeners.get(type) ?? []) listener({ type }); };
WebSocket.prototype.send = () => {};
WebSocket.prototype.close = () => {};

const sandbox = {
  console, Date: { now: () => now }, JSON, Math, Map, Set, URLSearchParams,
  localStorage: { value: JSON.stringify({ directHost: '100.72.54.81', directPort: '8790' }), getItem() { return this.value; }, setItem(key, value) { this.value = value; } },
  location: locationState, WebSocket, ResizeObserver: function ResizeObserver() { this.observe = () => {}; },
  document: { getElementById: getElement, querySelectorAll: () => [], createElement: () => element() },
  navigator: { serviceWorker: { register: () => ({ catch: () => {} }) } },
  setTimeout: (fn, delay) => { timers.push({ fn, delay }); return timers.length; }, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
  window: { PUBLIC_ORIGIN: 'https://your-domain.example.com', setTimeout: (fn, delay) => { timers.push({ fn, delay }); return timers.length; }, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {}, requestAnimationFrame: () => 0, cancelAnimationFrame: () => {}, addEventListener: () => {}, location: locationState },
  fetch: async (url) => { if (String(url) === '/api/session') return { ok: true }; return { ok: false }; },
};
sandbox.window.Date = sandbox.Date;
sandbox.window.ResizeObserver = sandbox.ResizeObserver;
sandbox.globalThis = sandbox;

vm.runInNewContext(fs.readFileSync('app/static/app.js', 'utf8'), sandbox, { filename: 'app/static/app.js' });

setImmediate(() => {
  assert.equal(sockets.length, 1, 'direct page should connect websocket after session check');
  sockets[0].dispatch('close');
  assert.equal(locationState.assigned, '', 'direct page should not fall back before 30 seconds');
  const fallbackTimer = timers.find((timer) => timer.delay === 5000);
  assert.ok(fallbackTimer, 'direct websocket close should schedule a 5 second public fallback');
  now = 6000;
  fallbackTimer.fn();
  assert.equal(locationState.assigned, 'https://your-domain.example.com/?direct=off&directRetryAt=11000#pad', 'direct page should fall back after 5 seconds and allow direct retry 5 seconds later');
});
