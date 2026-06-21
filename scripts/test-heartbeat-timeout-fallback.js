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

let now = 1000;
const timers = [];
const intervals = [];
const sent = [];
const fetchCalls = [];
const locationState = { protocol: 'http:', host: '100.72.54.81:8790', hostname: '100.72.54.81', pathname: '/', search: '', hash: '', assigned: '' };
Object.defineProperty(locationState, 'href', { get() { return `${this.protocol}//${this.host}${this.pathname}${this.search}${this.hash}`; }, set(value) { this.assigned = value; } });

const sockets = [];
function WebSocket(url) { this.url = url; this.readyState = WebSocket.CONNECTING; this.listeners = new Map(); sockets.push(this); }
WebSocket.CONNECTING = 0;
WebSocket.OPEN = 1;
WebSocket.prototype.addEventListener = function addEventListener(type, listener) { const list = this.listeners.get(type) ?? []; list.push(listener); this.listeners.set(type, list); };
WebSocket.prototype.dispatch = function dispatch(type, event = { type }) { for (const listener of this.listeners.get(type) ?? []) listener(event); };
WebSocket.prototype.send = function send(message) { sent.push(JSON.parse(message)); };
WebSocket.prototype.close = () => {};

const sandbox = {
  console, Date: { now: () => now }, JSON, Math, Map, Set, URLSearchParams,
  localStorage: { value: JSON.stringify({ directHost: '100.72.54.81', directPort: '8790' }), getItem() { return this.value; }, setItem(key, value) { this.value = value; } },
  location: locationState, WebSocket, ResizeObserver: function ResizeObserver() { this.observe = () => {}; },
  document: { getElementById: getElement, querySelectorAll: () => [], createElement: () => element() },
  navigator: { serviceWorker: { register: () => ({ catch: () => {} }) } },
  setTimeout: (fn, delay) => { timers.push({ fn, delay }); return timers.length; }, clearTimeout: () => {}, setInterval: (fn, delay) => { intervals.push({ fn, delay }); return intervals.length; }, clearInterval: () => {},
  window: { setTimeout: (fn, delay) => { timers.push({ fn, delay }); return timers.length; }, clearTimeout: () => {}, setInterval: (fn, delay) => { intervals.push({ fn, delay }); return intervals.length; }, clearInterval: () => {}, requestAnimationFrame: () => 0, cancelAnimationFrame: () => {}, addEventListener: () => {}, location: locationState },
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
  assert.equal(sockets.length, 1, 'direct page should create websocket');
  sockets[0].readyState = WebSocket.OPEN;
  sockets[0].dispatch('open');
  assert.ok(intervals.some((timer) => timer.delay === 3000), 'heartbeat should run every 3 seconds');
  now = 7000;
  intervals.find((timer) => timer.delay === 3000).fn();
  assert.ok(sent.some((message) => message.type === 'ping'), 'heartbeat should send ping');
  assert.ok(timers.some((timer) => timer.delay === 5000), 'heartbeat timeout should schedule 5 second direct fallback');
  assert.ok(fetchCalls.some((call) => call.url === '/api/client-log' && String(call.body).includes('heartbeat-timeout')), 'heartbeat timeout should be logged to client telemetry');
});
