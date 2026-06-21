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

async function run(settings) {
  const elements = new Map();
  function getElement(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); }
  const fetchCalls = [];
  const timers = [];
  const locationState = { protocol: 'https:', host: 'your-domain.example.com', hostname: 'your-domain.example.com', pathname: '/', search: '', hash: '', assigned: '' };
  Object.defineProperty(locationState, 'href', { get() { return `${this.protocol}//${this.host}${this.pathname}${this.search}${this.hash}`; }, set(value) { this.assigned = value; } });
  function WebSocket() {}
  WebSocket.OPEN = 1;
  const sandbox = {
    console, Date: { now: () => 100000 }, JSON, Math, Map, Set, URLSearchParams,
    localStorage: { value: JSON.stringify(settings), getItem() { return this.value; }, setItem(key, value) { this.value = value; } },
    location: locationState, WebSocket, ResizeObserver: function ResizeObserver() { this.observe = () => {}; },
    document: { getElementById: getElement, querySelectorAll: () => [], createElement: () => element() },
    navigator: { serviceWorker: { register: () => ({ catch: () => {} }) } },
    setTimeout: (fn, delay) => { timers.push({ fn, delay }); return timers.length; }, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    window: { PUBLIC_ORIGIN: 'https://your-domain.example.com', setTimeout: (fn, delay) => { timers.push({ fn, delay }); return timers.length; }, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {}, requestAnimationFrame: () => 0, cancelAnimationFrame: () => {}, addEventListener: () => {}, location: locationState },
    fetchCalls,
    fetch: async (url) => {
      fetchCalls.push(String(url));
      if (String(url).startsWith('/api/direct-probe?')) return { ok: true, json: async () => ({ ok: true }) };
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
  const unconfirmed = await run({ directHost: '100.72.54.81', directPort: '8790' });
  assert.equal(unconfirmed.locationState.assigned, '', 'public page must not jump to direct without recent client confirmation');
  assert.ok(!unconfirmed.fetchCalls.some((url) => url.startsWith('/api/direct-probe?')), 'unconfirmed direct host should not even probe');

  const suspect = await run({ directHost: '100.72.54.81', directPort: '8790', directConfirmedAt: 99000, directSuspectUntil: 130000 });
  assert.equal(suspect.locationState.assigned, '', 'public page must not jump during suspect cooldown even if previously confirmed');

  const confirmed = await run({ directHost: '100.72.54.81', directPort: '8790', directConfirmedAt: 99000 });
  assert.equal(confirmed.fetchCalls[0], '/api/direct-probe?host=100.72.54.81&port=8790', 'recently confirmed direct host should be probed');
  assert.equal(confirmed.locationState.assigned, 'http://100.72.54.81:8790/', 'recently confirmed and probed direct host may be used');
})();
