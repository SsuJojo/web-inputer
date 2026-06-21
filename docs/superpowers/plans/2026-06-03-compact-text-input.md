# Compact Text Input Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the text input area compact by default, with an explicit newline button that expands the textarea into multi-line mode.

**Architecture:** This is a frontend-only change in the static control UI. Keep the existing `textarea#textInput` and send flow, add a newline button beside it, and track expanded/collapsed state in `app/static/app.js` with a CSS class driving height transitions.

**Tech Stack:** HTML, CSS, vanilla JavaScript, Node.js `assert`/`vm` test harness.

---

## File Structure

- Modify `app/static/index.html`: wrap the textarea in a compact input row and add `button#newlineBtn`.
- Modify `app/static/styles.css`: reduce default textarea height, add input-row/newline-button styles, and define expanded textarea transition.
- Modify `app/static/app.js`: add `newlineBtn`, expanded-state helpers, newline insertion, and Enter behavior split by compact vs expanded mode.
- Create `scripts/test-compact-text-input.js`: small VM-based frontend behavior test covering compact Enter send, newline expansion, expanded Enter behavior, and send collapse.

---

### Task 1: Add behavior test for compact text input

**Files:**
- Create: `scripts/test-compact-text-input.js`

- [ ] **Step 1: Write the failing test**

Create `scripts/test-compact-text-input.js` with this exact content:

```js
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
      listeners.set(type, listener);
    },
    dispatch(type, event = {}) {
      const listener = listeners.get(type);
      if (listener) listener(event);
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
const sandbox = {
  console,
  Date: { now: () => 1000 },
  JSON,
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
    enterAfterText,
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
assert.equal(api.sentMessages.at(-1).action, 'text', 'compact Enter should send text');
assert.equal(api.sentMessages.at(-1).text, 'hello', 'compact Enter should send current value');
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

let expandedPrevented = false;
api.textInput.dispatch('keydown', {
  key: 'Enter',
  repeat: false,
  preventDefault: () => { expandedPrevented = true; },
});
assert.equal(expandedPrevented, false, 'expanded Enter should allow browser newline');

api.sendTextFromInput();
assert.equal(api.sentMessages.at(-1).action, 'text', 'send button path should send multi-line text');
assert.equal(api.sentMessages.at(-1).text, 'first\nsecond', 'send button path should preserve multi-line text');
assert.equal(api.textInput.value, '', 'send should clear text');
assert.equal(api.isTextInputExpanded(), false, 'send should collapse textarea');
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node .\scripts\test-compact-text-input.js
```

Expected: FAIL with an error like `ReferenceError: newlineBtn is not defined` or an assertion that compact/newline behavior is missing.

- [ ] **Step 3: Commit the failing test**

```powershell
git add .\scripts\test-compact-text-input.js
git commit -m "test: cover compact text input behavior"
```

---

### Task 2: Add compact input markup

**Files:**
- Modify: `app/static/index.html:56-66`

- [ ] **Step 1: Update the text input card markup**

Replace the current text input card body:

```html
        <label class="label" for="textInput">文本输入</label>
        <textarea id="textInput" rows="4" placeholder="输入文字后点发送；也可直接在下方按键区操作"></textarea>
        <label class="checkline">
          <input id="enterAfterText" type="checkbox">
          <span>发送文本后自动按 Enter</span>
        </label>
        <div class="row">
          <button id="sendTextBtn">发送文本</button>
          <button id="clipBtn" class="secondary">同步剪贴板</button>
        </div>
```

with:

```html
        <label class="label" for="textInput">文本输入</label>
        <div class="text-input-row">
          <textarea id="textInput" rows="1" placeholder="输入文字后按 Enter 发送"></textarea>
          <button id="newlineBtn" class="secondary newline-button" type="button" aria-label="插入换行">↵</button>
        </div>
        <label class="checkline">
          <input id="enterAfterText" type="checkbox">
          <span>发送文本后自动按 Enter</span>
        </label>
        <div class="row">
          <button id="sendTextBtn">发送文本</button>
          <button id="clipBtn" class="secondary">同步剪贴板</button>
        </div>
```

- [ ] **Step 2: Run behavior test and observe expected failure**

Run:

```powershell
node .\scripts\test-compact-text-input.js
```

Expected: still FAIL, because JavaScript and CSS behavior are not implemented yet.

- [ ] **Step 3: Commit markup change**

```powershell
git add .\app\static\index.html
git commit -m "feat: add newline button markup"
```

---

### Task 3: Add compact and expanded styling

**Files:**
- Modify: `app/static/styles.css:37-40`
- Modify: `app/static/styles.css:55-56`
- Modify: `app/static/styles.css:115-125`

- [ ] **Step 1: Replace textarea base sizing**

Replace:

```css
input, textarea { width: 100%; color: var(--text); background: #020617; border: 1px solid var(--border); border-radius: 16px; padding: 14px; outline: none; }

textarea { resize: vertical; min-height: 96px; }
```

with:

```css
input, textarea { width: 100%; color: var(--text); background: #020617; border: 1px solid var(--border); border-radius: 16px; padding: 14px; outline: none; }

textarea { resize: none; min-height: 48px; }
```

- [ ] **Step 2: Add input row styles after `.label`**

After:

```css
.label { display: block; margin-bottom: 10px; color: var(--muted); }
```

insert:

```css
.text-input-row { display: grid; grid-template-columns: 1fr 54px; gap: 10px; align-items: start; }
.text-input-row textarea { height: 48px; max-height: 48px; line-height: 20px; overflow: hidden; transition: height 180ms ease, max-height 180ms ease; }
.text-input-row textarea.expanded { height: 116px; max-height: 116px; overflow: auto; }
.newline-button { min-height: 48px; padding: 0; font-size: 20px; }
```

- [ ] **Step 3: Add small-screen sizing**

Inside the existing `@media (max-width: 420px)` block, after:

```css
  button { min-height: 46px; border-radius: 14px; }
```

insert:

```css
  .text-input-row { grid-template-columns: 1fr 50px; gap: 8px; }
  .text-input-row textarea { height: 46px; max-height: 46px; }
  .text-input-row textarea.expanded { height: 108px; max-height: 108px; }
  .newline-button { min-height: 46px; }
```

- [ ] **Step 4: Run behavior test and observe expected failure**

Run:

```powershell
node .\scripts\test-compact-text-input.js
```

Expected: still FAIL, because JavaScript behavior is not implemented yet.

- [ ] **Step 5: Commit styling change**

```powershell
git add .\app\static\styles.css
git commit -m "feat: style compact text input"
```

---

### Task 4: Implement newline and Enter behavior

**Files:**
- Modify: `app/static/app.js:7-41`
- Modify: `app/static/app.js:611-628`

- [ ] **Step 1: Add newline button lookup**

After:

```js
const textInput = document.getElementById('textInput');
```

insert:

```js
const newlineBtn = document.getElementById('newlineBtn');
```

- [ ] **Step 2: Add compact input helpers before `sendTextFromInput`**

Before:

```js
function sendTextFromInput() {
```

insert:

```js
function setTextInputExpanded(expanded) {
  textInput.classList.toggle('expanded', expanded);
}

function isTextInputExpanded() {
  return textInput.classList.contains('expanded');
}

function insertTextInputNewline() {
  const start = textInput.selectionStart ?? textInput.value.length;
  const end = textInput.selectionEnd ?? start;
  textInput.value = `${textInput.value.slice(0, start)}\n${textInput.value.slice(end)}`;
  const cursor = start + 1;
  textInput.setSelectionRange(cursor, cursor);
  setTextInputExpanded(true);
  textInput.focus();
}
```

- [ ] **Step 3: Collapse after send**

Replace:

```js
  textInput.value = '';
```

inside `sendTextFromInput` with:

```js
  textInput.value = '';
  setTextInputExpanded(false);
```

The full function should become:

```js
function sendTextFromInput() {
  let text = textInput.value;
  if (!text) return;
  const forceEnter = text.endsWith('  ');
  if (forceEnter) text = text.slice(0, -2);
  if (text) sendInput({ action: 'text', text });
  if (enterAfterText.checked || forceEnter) tap('enter');
  textInput.value = '';
  setTextInputExpanded(false);
}
```

- [ ] **Step 4: Add newline button click handler**

After:

```js
document.getElementById('sendTextBtn').addEventListener('click', sendTextFromInput);
```

insert:

```js
newlineBtn.addEventListener('click', insertTextInputNewline);
```

- [ ] **Step 5: Split Enter behavior by expanded state**

Replace:

```js
textInput.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  if (event.repeat) return;
  event.preventDefault();
  sendTextFromInput();
});
```

with:

```js
textInput.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  if (event.repeat) return;
  if (isTextInputExpanded()) return;
  event.preventDefault();
  sendTextFromInput();
});
```

- [ ] **Step 6: Run behavior test to verify it passes**

Run:

```powershell
node .\scripts\test-compact-text-input.js
```

Expected: PASS with no output and exit code 0.

- [ ] **Step 7: Run existing cursor sync test**

Run:

```powershell
node .\scripts\test-cursor-sync.js
```

Expected: PASS with no output and exit code 0.

- [ ] **Step 8: Commit JavaScript behavior**

```powershell
git add .\app\static\app.js
git commit -m "feat: toggle multiline text input"
```

---

### Task 5: Manual verification and final commit if needed

**Files:**
- Verify: `app/static/index.html`
- Verify: `app/static/styles.css`
- Verify: `app/static/app.js`

- [ ] **Step 1: Start the local app**

Run:

```powershell
.\scripts\start-dev.ps1
```

Expected: FastAPI app starts and serves the static UI locally. If the command blocks, leave it running while manually checking in a browser.

- [ ] **Step 2: Manually check compact default**

Open the local app URL printed by the server, log in if needed, and confirm:

- The text input card is shorter than before.
- The textarea appears as one line by default.
- A narrow `↵` newline button appears on the right side of the textarea.

- [ ] **Step 3: Manually check compact Enter sends**

In compact mode:

1. Type `hello`.
2. Press Enter on the keyboard.
3. Confirm the field clears.
4. Confirm the field remains compact.

- [ ] **Step 4: Manually check newline expansion**

In compact mode:

1. Type `firstsecond`.
2. Put the cursor between `first` and `second`.
3. Click `↵`.
4. Confirm the value becomes two lines: `first` then `second`.
5. Confirm the textarea smoothly expands.
6. Press Enter in the expanded textarea.
7. Confirm a new line is inserted and the text is not sent.

- [ ] **Step 5: Manually check send collapse and checkbox behavior**

In expanded mode:

1. Type a multi-line value.
2. Turn on `发送文本后自动按 Enter`.
3. Click `发送文本`.
4. Confirm the field clears and collapses.
5. Confirm the existing automatic Enter behavior still occurs after sending text.

- [ ] **Step 6: Stop the local app**

If `start-dev.ps1` is still running in the terminal, stop it with Ctrl+C.

- [ ] **Step 7: Check git status**

Run:

```powershell
git status --short
```

Expected: no uncommitted changes unless manual verification required a small fix. If there is a small fix, commit it with:

```powershell
git add .\app\static\index.html .\app\static\styles.css .\app\static\app.js .\scripts\test-compact-text-input.js
git commit -m "fix: polish compact text input"
```

---

## Self-Review

- Spec coverage: Task 2 adds the newline button and compact row; Task 3 compresses height and adds smooth expansion; Task 4 implements single-line Enter send, newline insertion, expanded Enter newline behavior, and collapse after send; Task 5 covers manual behavior checks including the automatic Enter checkbox.
- Placeholder scan: no TBD/TODO/fill-in placeholders remain.
- Type/name consistency: the plan consistently uses `newlineBtn`, `setTextInputExpanded`, `isTextInputExpanded`, `insertTextInputNewline`, and `textInput.classList.contains('expanded')`.
