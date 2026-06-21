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
  JSON,
  Math,
  Map,
  Set,
  URLSearchParams,
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
  setTimeout: () => 0,
  clearTimeout: () => {},
  setInterval: () => 0,
  clearInterval: () => {},
  window: {
    setTimeout: () => 0,
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
  globalThis.__compactTextInputTest = {
    sentMessages,
    textInput,
    newlineBtn,
    sendTextFromInput,
    isTextInputExpanded: () => textInput.classList.contains('expanded'),
  };
`;
vm.runInNewContext(source, sandbox, { filename: 'app/static/app.js' });

const api = sandbox.__compactTextInputTest;

api.textInput.value = 'hello';
api.textInput.selectionStart = 5;
api.textInput.selectionEnd = 5;
let compactPrevented = false;
api.textInput.dispatch('keydown', {
  key: 'Enter',
  repeat: false,
  preventDefault: () => { compactPrevented = true; },
});
assert.equal(compactPrevented, true, 'compact Enter should prevent default');
assert.equal(api.textInput.value, '', 'compact Enter should send and clear text');
assert.equal(api.sentMessages.at(-2).action, 'text', 'compact Enter should send text');
assert.equal(api.sentMessages.at(-2).text, 'hello', 'compact Enter should send current value');
assert.equal(api.sentMessages.at(-1).action, 'tap', 'compact Enter should tap Enter after text');
assert.equal(api.sentMessages.at(-1).key, 'enter', 'compact Enter should tap Enter after text');
assert.equal(api.isTextInputExpanded(), false, 'input should stay compact after compact send');

api.textInput.value = 'firstsecond';
api.textInput.selectionStart = 5;
api.textInput.selectionEnd = 5;
api.newlineBtn.dispatch('click');
assert.equal(api.textInput.value, 'first\nsecond', 'newline button should insert newline at cursor');
assert.equal(api.textInput.selectionStart, 6, 'cursor should move after inserted newline');
assert.equal(api.textInput.selectionEnd, 6, 'selection should collapse after inserted newline');
assert.equal(api.textInput.focused, true, 'newline button should refocus textarea');
assert.equal(api.isTextInputExpanded(), true, 'newline button should expand textarea');

const messageCountBeforeExpandedEnter = api.sentMessages.length;
const expandedValueBeforeEnter = api.textInput.value;
let expandedPrevented = false;
api.textInput.dispatch('keydown', {
  key: 'Enter',
  repeat: false,
  preventDefault: () => { expandedPrevented = true; },
});
assert.equal(expandedPrevented, true, 'expanded Enter should prevent default');
assert.equal(api.sentMessages.length, messageCountBeforeExpandedEnter + 2, 'expanded Enter should send text then tap Enter');
assert.equal(api.sentMessages.at(-2).text, expandedValueBeforeEnter, 'expanded Enter should send multi-line text');
assert.equal(api.sentMessages.at(-1).action, 'tap', 'expanded Enter should tap Enter after text');
assert.equal(api.sentMessages.at(-1).key, 'enter', 'expanded Enter should tap Enter after text');
assert.equal(api.textInput.value, '', 'expanded Enter should clear text');
assert.equal(api.isTextInputExpanded(), false, 'expanded Enter should collapse textarea');

api.textInput.value = 'first\nsecond';
api.textInput.selectionStart = api.textInput.value.length;
api.textInput.selectionEnd = api.textInput.value.length;
api.sendTextFromInput();
assert.equal(api.sentMessages.at(-1).action, 'text', 'send button path should send multi-line text');
assert.equal(api.sentMessages.at(-1).text, 'first\nsecond', 'send button path should preserve multi-line text');
assert.equal(api.textInput.value, '', 'send should clear text');
assert.equal(api.isTextInputExpanded(), false, 'send should collapse textarea');

api.textInput.value = 'hello  ';
api.textInput.selectionStart = api.textInput.value.length;
api.textInput.selectionEnd = api.textInput.value.length;
const countBeforeTrailingSpaceButtonSend = api.sentMessages.length;
api.sendTextFromInput();
assert.equal(api.sentMessages.length, countBeforeTrailingSpaceButtonSend + 1, 'send button should not tap Enter after trailing spaces');
assert.equal(api.sentMessages.at(-1).action, 'text', 'send button should send trailing-space text');
assert.equal(api.sentMessages.at(-1).text, 'hello  ', 'send button should preserve trailing spaces');

const countBeforeEmptySend = api.sentMessages.length;
api.sendTextFromInput();
assert.equal(api.sentMessages.length, countBeforeEmptySend + 1, 'empty send should emit one message');
assert.equal(api.sentMessages.at(-1).action, 'tap', 'empty send should tap Enter');
assert.equal(api.sentMessages.at(-1).key, 'enter', 'empty send should tap Enter key');
