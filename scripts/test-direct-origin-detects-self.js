const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');

function element() {
  const listeners = new Map();
  const classes = new Set(['hidden']);
  return {
    value: '', checked: false, textContent: '', dataset: {}, style: {}, className: '', selectionStart: 0, selectionEnd: 0,
    classList: { contains: (c) => classes.has(c), add: (c) => classes.add(c), remove: (c) => classes.delete(c), toggle: (c, force) => { const enabled = force ?? !classes.has(c); if (enabled) classes.add(c); else classes.delete(c); return enabled; } },
    addEventListener: (type, listener) => { const list = listeners.get(type) ?? []; list.push(listener); listeners.set(type, list); },
    dispatch(type, event = {}) { for (const listener of listeners.get(type) ?? []) listener(event); },
    setAttribute: () => {}, appendChild: () => {}, removeAttribute: () => {}, setPointerCapture: () => {}, querySelector: () => null, focus: () => {},
    setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 1000, toJSON: () => ({}) }), clientWidth: 1000, clientHeight: 1000,
  };
}

const elements = new Map();
function getElement(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); }

const timers = [];
const fetchCalls = [];
const locationState = { protocol: 'http:', host: '100.72.54.81:8790', hostname: '100.72.54.81', port: '8790', pathname: '/', search: '', hash: '', assigned: '' };
Object.defineProperty(locationState, 'href', { get() { return `${this.protocol}//${this.host}${this.pathname}${this.search}${this.hash}`; }, set(value) { this.assigned = value; } });

const sockets = [];
function WebSocket(url) { this.url = url; this.readyState = WebSocket.CONNECTING; this.listeners = new Map(); sockets.push(this); }
WebSocket.CONNECTING = 0;
WebSocket.OPEN = 1;
WebSocket.prototype.addEventListener = function addEventListener(type, listener) { const list = this.listeners.get(type) ?? []; list.push(listener); this.listeners.set(type, list); };
WebSocket.prototype.dispatch = function dispatch(type, event = { type }) { for (const listener of this.listeners.get(type) ?? []) listener(event); };
WebSocket.prototype.send = () => {};
WebSocket.prototype.close = () => {};

const sandbox = {
  console, Date: { now: () => 1000 }, JSON, Math, Map, Set, URLSearchParams,
  localStorage: { value: '{}', getItem() { return this.value; }, setItem(key, value) { this.value = value; } },
  location: locationState, WebSocket, ResizeObserver: function ResizeObserver() { this.observe = () => {}; },
  document: { getElementById: getElement, querySelectorAll: () => [], createElement: () => element() },
  navigator: { serviceWorker: { register: () => ({ catch: () => {} }) } },
  setTimeout: (fn, delay) => { timers.push({ fn, delay }); return timers.length; }, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
  window: { PUBLIC_ORIGIN: 'https://your-domain.example.com', setTimeout: (fn, delay) => { timers.push({ fn, delay }); return timers.length; }, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {}, requestAnimationFrame: () => 0, cancelAnimationFrame: () => {}, addEventListener: () => {}, location: locationState },
  fetchCalls,
  fetch: async (url, options = {}) => {
    fetchCalls.push({ url: String(url), body: options.body || '' });
    if (String(url) === '/api/session') return { ok: true };
    return { ok: false, json: async () => ({ ok: false }) };
  },
};
sandbox.window.Date = sandbox.Date;
sandbox.window.ResizeObserver = sandbox.ResizeObserver;
sandbox.globalThis = sandbox;

vm.runInNewContext(fs.readFileSync('app/static/app.js', 'utf8'), sandbox, { filename: 'app/static/app.js' });

setImmediate(() => {
  assert.equal(sockets.length, 1, 'direct origin should connect websocket');
  sockets[0].readyState = WebSocket.CLOSED;
  sockets[0].dispatch('close');
  assert.ok(timers.some((timer) => timer.delay === 5000), 'direct origin without saved directHost should still schedule fallback');
  assert.ok(sandbox.localStorage.value.includes('100.72.54.81'), 'direct origin should persist its own directHost for future fallback checks');
  assert.ok(fetchCalls.some((call) => String(call.body).includes('public-fallback-scheduled')), 'fallback scheduling should be logged');
});
