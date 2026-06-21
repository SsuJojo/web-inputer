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
    style: { setProperty() {} },
    className: '',
    selectionStart: 0,
    selectionEnd: 0,
    naturalWidth: 1000,
    naturalHeight: 1000,
    scrollLeft: 0,
    scrollTop: 0,
    scrollWidth: 1000,
    clientWidth: 1000,
    clientHeight: 1000,
    parentElement: null,
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
    focus: () => {},
    setSelectionRange(start, end) {
      this.selectionStart = start;
      this.selectionEnd = end;
    },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 1000, toJSON: () => ({}) }),
  };
}

const elements = new Map();
function getElement(id) {
  if (!elements.has(id)) elements.set(id, element());
  return elements.get(id);
}
getElement('screenWindowTitle').parentElement = element();

let now = 1000;
const pendingCursorResponses = [];
const sandbox = {
  console,
  Date: { now: () => now },
  JSON, URLSearchParams,
  Math,
  Map,
  Set,
  performance: { now: () => now },
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
    requestAnimationFrame: (callback) => callback(),
    cancelAnimationFrame: () => {},
    addEventListener: () => {},
  },
  fetch: (url) => {
    if (String(url).startsWith('/api/screen/cursor')) {
      return new Promise((resolve) => pendingCursorResponses.push(resolve));
    }
    if (String(url) === '/api/session') return new Promise(() => {});
    return Promise.resolve({ ok: false });
  },
};
sandbox.window.Date = sandbox.Date;
sandbox.window.ResizeObserver = sandbox.ResizeObserver;
sandbox.globalThis = sandbox;

const source = fs.readFileSync('app/static/app.js', 'utf8') + `
  globalThis.__cursorOverlapTest = {
    enablePreview() {
      screenPreviewEnabled = true;
      screenFrameModal.classList.add('hidden');
    },
    updateCursor,
    state() {
      return {
        cursorState,
        screenCursorVisible: screenCursor.classList.contains('visible'),
      };
    },
  };
`;
vm.runInNewContext(source, sandbox, { filename: 'app/static/app.js' });

(async () => {
  sandbox.__cursorOverlapTest.enablePreview();
  const first = sandbox.__cursorOverlapTest.updateCursor();
  const second = sandbox.__cursorOverlapTest.updateCursor();

  assert.equal(pendingCursorResponses.length, 1, 'cursor polling should not start overlapping requests');

  pendingCursorResponses[0]({
    ok: true,
    json: async () => ({
      x: 700,
      y: 500,
      width: 1000,
      height: 1000,
      icon: 'cursor',
      hotspotX: 0,
      hotspotY: 0,
      iconWidth: 32,
      iconHeight: 32,
    }),
  });
  await first;
  await second;

  const state = sandbox.__cursorOverlapTest.state();
  assert.equal(state.cursorState.icon, 'cursor');
  assert.equal(state.screenCursorVisible, true, 'first slow cursor response should still show overlay cursor');
})();
