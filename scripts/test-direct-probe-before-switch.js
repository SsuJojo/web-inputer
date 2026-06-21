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

async function runProbeScenario(probeOk) {
  const elements = new Map();
  function getElement(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); }

  const fetchCalls = [];
  const timers = [];
  const locationState = { protocol: 'https:', host: 'your-domain.example.com', hostname: 'your-domain.example.com', pathname: '/', search: '?direct=off&directRetryAt=1', hash: '#pad', assigned: '' };
  Object.defineProperty(locationState, 'href', { get() { return `${this.protocol}//${this.host}${this.pathname}${this.search}${this.hash}`; }, set(value) { this.assigned = value; } });

  function WebSocket() {}
  WebSocket.OPEN = 1;

  const sandbox = {
    console, Date: { now: () => 1000 }, JSON, Math, Map, Set, URLSearchParams,
    localStorage: { value: JSON.stringify({ directHost: '100.72.54.81', directPort: '8790', directConfirmedAt: 99000 }), getItem() { return this.value; }, setItem(key, value) { this.value = value; } },
    location: locationState, WebSocket, ResizeObserver: function ResizeObserver() { this.observe = () => {}; },
    document: { getElementById: getElement, querySelectorAll: () => [], createElement: () => element() },
    navigator: { serviceWorker: { register: () => ({ catch: () => {} }) } },
    setTimeout: (fn, delay) => { timers.push({ fn, delay }); return timers.length; }, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    window: { PUBLIC_ORIGIN: 'https://your-domain.example.com', setTimeout: (fn, delay) => { timers.push({ fn, delay }); return timers.length; }, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {}, requestAnimationFrame: () => 0, cancelAnimationFrame: () => {}, addEventListener: () => {}, location: locationState },
    fetchCalls,
    fetch: async (url) => {
      fetchCalls.push(String(url));
      if (String(url).startsWith('/api/direct-probe?')) return { ok: true, json: async () => ({ ok: probeOk }) };
      if (String(url) === '/api/session') return { ok: false };
      return { ok: false, json: async () => ({ ok: false }) };
    },
  };
  sandbox.window.Date = sandbox.Date;
  sandbox.window.ResizeObserver = sandbox.ResizeObserver;
  sandbox.globalThis = sandbox;

  vm.runInNewContext(fs.readFileSync('app/static/app.js', 'utf8'), sandbox, { filename: 'app/static/app.js' });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  return { fetchCalls, locationState };
}

(async () => {
  const down = await runProbeScenario(false);
  assert.equal(down.fetchCalls[0], '/api/direct-probe?host=100.72.54.81&port=8790', 'public page should probe direct health before switching');
  assert.equal(down.locationState.assigned, '', 'public page should not switch when direct probe fails');

  const up = await runProbeScenario(true);
  assert.equal(up.fetchCalls[0], '/api/direct-probe?host=100.72.54.81&port=8790', 'public page should probe direct health before switching');
  assert.equal(up.locationState.assigned, 'http://100.72.54.81:8790/#pad', 'public page should switch only after direct probe succeeds');
})();
