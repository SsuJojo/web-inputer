# Panzoom Viewer and Cursor State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the manual fullscreen screen-frame zoom with a vendored Panzoom viewer and reduce remote mouse stutter with a two-state cursor authority state machine.

**Architecture:** Keep the existing vanilla HTML/CSS/JS app and modal ownership. Vendor Panzoom as a static browser file, initialize it only while the fullscreen screen-frame modal is open, and centralize cursor authority in `app/static/app.js`. Backend changes stay minimal: echo mouse sequencing metadata in WebSocket acks and optionally store input metadata on `InputEvent`.

**Tech Stack:** FastAPI, vanilla JavaScript, static CSS/HTML, vendored `@panzoom/panzoom` browser build, existing Node VM-style script tests, Python `compileall`.

---

## File Structure

- Modify `app/static/index.html`
  - Add a local vendor script before `app.js`.
  - Bump static query strings for `styles.css`, `app.js`, and the new vendor asset.
  - Keep the existing `#screenFrameClose` button.

- Create `app/static/vendor/panzoom.min.js`
  - Store the browser-ready Panzoom distribution.
  - Expose `window.Panzoom` or the global provided by the chosen distribution.

- Modify `app/static/styles.css`
  - Keep the existing fullscreen modal layout.
  - Make `#screenFrameViewport`/`#screenFrameStage` Panzoom-friendly.
  - Ensure the close `X` remains above transformed content.

- Modify `app/static/app.js`
  - Replace manual screen-frame zoom and pinch code with Panzoom lifecycle functions.
  - Add double-click and double-tap zoom toggle.
  - Add cursor authority state variables and helpers.
  - Coalesce mouse movement with `requestAnimationFrame`.
  - Send mouse `source`, `seq`, and `clientTs` metadata.
  - Handle ack `seq` metadata.
  - Replace cursor hard-sync behavior with state-aware server cursor application.

- Modify `app/static/sw.js`
  - Bump cache name.
  - Add the vendor Panzoom asset.
  - Align cached query strings with `index.html`.

- Modify `app/main.py`
  - Echo `seq`, `source`, and `serverTs` in input ack messages.
  - Pass metadata into `InputEvent`.

- Modify `app/input_controller.py`
  - Add optional metadata fields to `InputEvent`.

- Create `scripts/test-panzoom-viewer.js`
  - Validate the static HTML references the vendor asset before `app.js`.
  - Validate `app.js` contains the Panzoom lifecycle hooks and no longer uses manual pinch variables.

- Modify `scripts/test-cursor-sync.js`
  - Add assertions for cursor authority helpers and state-aware sync behavior if the existing harness can expose those functions.
  - If the harness cannot execute those helpers directly, add source-level assertions for the key helper names and constants.

---

## Task 1: Vendor Panzoom and Wire Static Assets

**Files:**
- Create: `app/static/vendor/panzoom.min.js`
- Modify: `app/static/index.html:8-168`
- Modify: `app/static/sw.js:1-2`
- Test: `scripts/test-panzoom-viewer.js`

- [ ] **Step 1: Inspect current static references**

Use the dedicated Read tool on:

- `app/static/index.html`
- `app/static/sw.js`

Confirm `index.html` currently loads only `/static/app.js?...` at the bottom and `sw.js` currently caches `styles.css`, `app.js`, and the manifest.

- [ ] **Step 2: Fetch the browser distribution for Panzoom**

Use the web or terminal only to retrieve the browser-ready distribution for `@panzoom/panzoom` from its package source. Save it as:

```text
app/static/vendor/panzoom.min.js
```

The saved file must expose a browser global usable from `app/static/app.js` as either:

```js
window.Panzoom
```

or, if the distribution exposes a different global name, add this small adapter at the end of the vendor file:

```js
window.Panzoom = window.Panzoom || window.panzoom || window.PanzoomModule;
```

Do not add `package.json`, npm build scripts, or a runtime CDN.

- [ ] **Step 3: Write the viewer asset reference test**

Create `scripts/test-panzoom-viewer.js` with this content:

```js
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(root, 'app/static/index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(root, 'app/static/app.js'), 'utf8');
const swJs = fs.readFileSync(path.join(root, 'app/static/sw.js'), 'utf8');

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

const vendorIndex = indexHtml.indexOf('/static/vendor/panzoom.min.js');
const appIndex = indexHtml.indexOf('/static/app.js');
assert(vendorIndex !== -1, 'index.html references vendored Panzoom');
assert(appIndex !== -1, 'index.html references app.js');
assert(vendorIndex < appIndex, 'Panzoom loads before app.js');
assert(swJs.includes('/static/vendor/panzoom.min.js'), 'service worker caches vendored Panzoom');
assert(appJs.includes('initScreenFramePanzoom'), 'app.js defines Panzoom initialization');
assert(appJs.includes('destroyScreenFramePanzoom'), 'app.js defines Panzoom cleanup');
assert(appJs.includes('toggleScreenFrameZoom'), 'app.js defines double-click/tap zoom toggle');
assert(!appJs.includes('framePinchDistance'), 'manual frame pinch state was removed');

console.log('PASS: panzoom viewer static integration checks passed');
```

- [ ] **Step 4: Run the test to verify it fails before wiring**

Run:

```powershell
node .\scripts\test-panzoom-viewer.js
```

Expected: FAIL with `index.html references vendored Panzoom` or `app.js defines Panzoom initialization`.

- [ ] **Step 5: Update `index.html` static references**

Modify the bottom of `app/static/index.html` so the scripts look like this:

```html
  <script src="/static/vendor/panzoom.min.js?v=20260703-01"></script>
  <script src="/static/app.js?v=20260703-01"></script>
```

Also bump the stylesheet reference near the top to:

```html
  <link rel="stylesheet" href="/static/styles.css?v=20260703-01">
```

Keep the existing manifest line unchanged unless the implementation changes the manifest.

- [ ] **Step 6: Update `sw.js` cache entries**

Replace the first two lines of `app/static/sw.js` with:

```js
const CACHE = 'remote-input-v56';
const ASSETS = ['/', '/static/styles.css?v=20260703-01', '/static/vendor/panzoom.min.js?v=20260703-01', '/static/app.js?v=20260703-01', '/manifest.webmanifest?v=20260610-01'];
```

- [ ] **Step 7: Run the new test**

Run:

```powershell
node .\scripts\test-panzoom-viewer.js
```

Expected: still FAIL because `app.js` does not yet define the Panzoom lifecycle functions. The vendor and static reference assertions should no longer be the failing assertions.

- [ ] **Step 8: Commit the asset wiring**

Run:

```powershell
git add app/static/vendor/panzoom.min.js app/static/index.html app/static/sw.js scripts/test-panzoom-viewer.js
git commit -m "chore: vendor panzoom viewer asset"
```

---

## Task 2: Replace Manual Screen-Frame Zoom With Panzoom Lifecycle

**Files:**
- Modify: `app/static/app.js:60-63,708-833,849-909`
- Modify: `app/static/styles.css`
- Test: `scripts/test-panzoom-viewer.js`

- [ ] **Step 1: Read current viewer code**

Use the Read tool on `app/static/app.js` around these areas:

- state variables near lines 60-63,
- `saveScreenFrameState()` through `closeScreenFrame()` near lines 708-816,
- `zoomScreenFrame()` near lines 818-833,
- manual pinch event code near lines 849-909.

Use the Read tool on `app/static/styles.css` around the `screen-frame-*` selectors.

- [ ] **Step 2: Replace viewer state variables**

In `app/static/app.js`, replace:

```js
let screenFrameZoom = 1;
let screenFrameOrientationActive = false;
let screenFrameLastTiltScrollAt = 0;
```

with:

```js
let screenFramePanzoom = null;
let screenFrameZoomed = false;
let screenFrameLastTapAt = 0;
let screenFrameOrientationActive = false;
let screenFrameLastTiltScrollAt = 0;
```

Keep the orientation variables because the close `X` placement still uses them.

- [ ] **Step 3: Replace manual viewer persistence helpers**

Remove these functions from `app/static/app.js`:

```js
function saveScreenFrameState() {
  settings.screenFrameZoom = screenFrameZoom;
  settings.screenFrameScrollLeft = screenFrameViewport.scrollLeft;
  settings.screenFrameScrollTop = screenFrameViewport.scrollTop;
  saveSettings();
}

function defaultScreenFrameZoom() {
  const naturalWidth = screenFrameImage.naturalWidth || 1;
  const naturalHeight = screenFrameImage.naturalHeight || 1;
  const availableWidth = Math.max(1, screenFrameViewport.clientWidth - 20);
  const availableHeight = Math.max(1, screenFrameViewport.clientHeight - 20);
  return Math.min(4, Math.max(0.5, (availableHeight * naturalWidth) / (availableWidth * naturalHeight)));
}

function restoreScreenFrameScroll() {
  screenFrameViewport.scrollLeft = settings.screenFrameScrollLeft;
  screenFrameViewport.scrollTop = settings.screenFrameScrollTop;
}

function applyScreenFrameZoom() {
  screenFrameStage.style.width = `${screenFrameZoom * 100}%`;
  drawCursors();
}
```

Add these functions in the same location:

```js
function getPanzoomFactory() {
  return window.Panzoom || window.panzoom || null;
}

function initScreenFramePanzoom() {
  destroyScreenFramePanzoom();
  const Panzoom = getPanzoomFactory();
  if (!Panzoom) {
    console.warn('[screen-frame] Panzoom is unavailable');
    return;
  }
  screenFramePanzoom = Panzoom(screenFrameStage, {
    maxScale: 4,
    minScale: 1,
    contain: 'outside',
    canvas: true,
  });
  screenFrameZoomed = false;
  screenFrameViewport.addEventListener('wheel', screenFramePanzoom.zoomWithWheel, { passive: false });
}

function destroyScreenFramePanzoom() {
  if (screenFramePanzoom?.zoomWithWheel) {
    screenFrameViewport.removeEventListener('wheel', screenFramePanzoom.zoomWithWheel);
  }
  if (screenFramePanzoom?.destroy) screenFramePanzoom.destroy();
  screenFramePanzoom = null;
  screenFrameZoomed = false;
  screenFrameStage.style.transform = '';
}

function toggleScreenFrameZoom(event) {
  if (!screenFramePanzoom) return;
  const nextScale = screenFrameZoomed ? 1 : 2;
  screenFramePanzoom.zoom(nextScale, { animate: true, focal: event });
  screenFrameZoomed = nextScale > 1;
}
```

If the vendored Panzoom distribution uses `dispose()` instead of `destroy()`, change the cleanup line to:

```js
  if (screenFramePanzoom?.destroy) screenFramePanzoom.destroy();
  else if (screenFramePanzoom?.dispose) screenFramePanzoom.dispose();
```

- [ ] **Step 4: Update `openScreenFrame()` and `closeScreenFrame()`**

Replace the existing `openScreenFrame()` with:

```js
function openScreenFrame() {
  moveScreenFrameCloseTo('left');
  screenFrameModal.classList.remove('hidden');
  requestScreenFrameFullscreen();
  requestScreenFrameOrientation();
  window.requestAnimationFrame(() => {
    refreshScreenFrame();
    initScreenFramePanzoom();
  });
}
```

Replace the existing `closeScreenFrame()` with:

```js
function closeScreenFrame() {
  destroyScreenFramePanzoom();
  screenFrameModal.classList.add('hidden');
  stopScreenFrameOrientation();
  exitScreenFrameFullscreen();
  stopCursorPollingIfIdle();
}
```

- [ ] **Step 5: Remove manual zoom and pinch handlers**

Remove the entire `zoomScreenFrame(delta, clientX, clientY)` function.

Remove these definitions and listeners:

```js
let framePinchDistance = 0;
function frameTouchDistance(event) { ... }
function frameTouchCenter(event) { ... }
screenFrameViewport.addEventListener('wheel', ...);
screenFrameViewport.addEventListener('touchstart', ...);
screenFrameViewport.addEventListener('touchmove', ...);
screenFrameViewport.addEventListener('touchend', ...);
```

Keep `screenFrameImage.addEventListener('load', ...)`, but replace its callback with:

```js
screenFrameImage.addEventListener('load', () => {
  if (screenFramePanzoom?.reset) screenFramePanzoom.reset();
  screenFrameZoomed = false;
});
```

- [ ] **Step 6: Add double-click and double-tap handlers**

Add these listeners near the existing screen frame listeners:

```js
screenFrameViewport.addEventListener('dblclick', (event) => {
  event.preventDefault();
  toggleScreenFrameZoom(event);
});

screenFrameViewport.addEventListener('touchend', (event) => {
  if (event.changedTouches.length !== 1) return;
  const now = Date.now();
  if (now - screenFrameLastTapAt < 320) {
    event.preventDefault();
    toggleScreenFrameZoom(event.changedTouches[0]);
    screenFrameLastTapAt = 0;
    return;
  }
  screenFrameLastTapAt = now;
}, { passive: false });
```

- [ ] **Step 7: Update CSS for Panzoom**

In `app/static/styles.css`, update the screen-frame selectors so the viewer interaction area does not fight Panzoom. The final rules must include these properties:

```css
.screen-frame-close {
  z-index: 3;
}

.screen-frame-viewport {
  overflow: hidden;
  touch-action: none;
  overscroll-behavior: contain;
}

.screen-frame-stage {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  transform-origin: 0 0;
  cursor: grab;
}

.screen-frame-stage:active {
  cursor: grabbing;
}

.screen-frame-stage img {
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  object-fit: contain;
  user-select: none;
  -webkit-user-drag: none;
  pointer-events: none;
}
```

Keep existing visual styling such as background, border radius, and fullscreen modal sizing unless it conflicts with these interaction properties.

- [ ] **Step 8: Run the Panzoom viewer test**

Run:

```powershell
node .\scripts\test-panzoom-viewer.js
```

Expected: PASS.

- [ ] **Step 9: Commit the viewer lifecycle change**

Run:

```powershell
git add app/static/app.js app/static/styles.css scripts/test-panzoom-viewer.js
git commit -m "feat: use panzoom for screen viewer"
```

---

## Task 3: Add Cursor Authority State Machine

**Files:**
- Modify: `app/static/app.js:66-78,354-374,425-535,617-675`
- Test: `scripts/test-cursor-sync.js`

- [ ] **Step 1: Read existing cursor sync code**

Use the Read tool on `app/static/app.js` around:

- cursor state variables near lines 66-78,
- WebSocket message handler near lines 354-374,
- `sendInput()` near lines 425-426,
- `predictCursorMove()` and `moveMouse()` near lines 509-535,
- `updateCursor()` and `startCursorPolling()` near lines 617-675.

- [ ] **Step 2: Add cursor authority constants and variables**

After the existing cursor variables, add:

```js
const CursorAuthority = {
  WEB_REMOTE: 'web-remote-control',
  PHYSICAL: 'physical-mouse-active',
};

const REMOTE_LOCK_MS = 350;
const REMOTE_SUPPRESS_SYNC_MS = 180;
const PHYSICAL_DETECT_PX = 10;
const REMOTE_EXPECT_WINDOW_MS = 500;
const MAX_REMOTE_LEDGER = 40;
const CURSOR_POLL_WEB_MS = 200;
const CURSOR_POLL_PHYSICAL_MS = 80;

let cursorAuthority = CursorAuthority.PHYSICAL;
let lastRemoteInputAt = 0;
let remoteControlUntil = 0;
let suppressServerSyncUntil = 0;
let remoteMoveSeq = 0;
let lastAckedRemoteMoveSeq = 0;
let remoteMoveLedger = [];
let lastServerCursorPayload = null;
```

- [ ] **Step 3: Add authority helper functions**

Add these functions after `queueClientLog()`:

```js
function markRemoteMoveAcked(seq) {
  lastAckedRemoteMoveSeq = Math.max(lastAckedRemoteMoveSeq, seq);
  for (const item of remoteMoveLedger) {
    if (item.seq === seq) item.acked = true;
  }
}

function enterWebRemoteControl(reason) {
  const now = Date.now();
  if (cursorAuthority !== CursorAuthority.WEB_REMOTE) {
    queueClientLog('cursor-authority', { state: CursorAuthority.WEB_REMOTE, reason });
  }
  cursorAuthority = CursorAuthority.WEB_REMOTE;
  lastRemoteInputAt = now;
  remoteControlUntil = now + REMOTE_LOCK_MS;
  suppressServerSyncUntil = now + REMOTE_SUPPRESS_SYNC_MS;
}

function rememberRemoteMove(dx, dy) {
  const move = {
    seq: ++remoteMoveSeq,
    dx,
    dy,
    sentAt: Date.now(),
    acked: false,
  };
  remoteMoveLedger.push(move);
  if (remoteMoveLedger.length > MAX_REMOTE_LEDGER) remoteMoveLedger = remoteMoveLedger.slice(-MAX_REMOTE_LEDGER);
  return move.seq;
}

function pruneRemoteMoveLedger(now) {
  remoteMoveLedger = remoteMoveLedger.filter((item) => now - item.sentAt < REMOTE_EXPECT_WINDOW_MS);
}

function recentRemoteMagnitude(now) {
  pruneRemoteMoveLedger(now);
  let dx = 0;
  let dy = 0;
  for (const item of remoteMoveLedger) {
    dx += item.dx;
    dy += item.dy;
  }
  return Math.hypot(dx, dy);
}

function serverCursorDistance(a, b) {
  if (!a || !b) return 0;
  return Math.hypot((a.x || 0) - (b.x || 0), (a.y || 0) - (b.y || 0));
}

function serverMoveMatchesRemote(serverDelta, now) {
  if (now - lastRemoteInputAt > REMOTE_EXPECT_WINDOW_MS) return false;
  const expected = recentRemoteMagnitude(now);
  if (expected < 1) return false;
  const ratio = serverDelta / expected;
  return ratio >= 0.15 && ratio <= 6;
}

function sendRemoteMouseMove(dx, dy) {
  const seq = rememberRemoteMove(dx, dy);
  return sendInput({
    action: 'mouse_move',
    x: dx,
    y: dy,
    source: CursorAuthority.WEB_REMOTE,
    seq,
  });
}
```

- [ ] **Step 4: Enrich `sendInput()`**

Replace:

```js
function sendInput(payload) {
  return send({ type: 'input', id: ++eventId, ...payload });
}
```

with:

```js
function sendInput(payload) {
  const enriched = {
    type: 'input',
    id: ++eventId,
    clientTs: Date.now(),
    ...payload,
  };
  if (payload.action?.startsWith('mouse_') && !enriched.source) {
    enriched.source = cursorAuthority;
  }
  return send(enriched);
}
```

- [ ] **Step 5: Handle ack metadata in WebSocket messages**

Inside the WebSocket `message` listener after `const message = JSON.parse(event.data);`, add:

```js
    if (message.type === 'ack' && Number.isFinite(Number(message.seq))) {
      markRemoteMoveAcked(Number(message.seq));
    }
```

Do not change existing `pong`, `control`, `error`, or `window_state` behavior.

- [ ] **Step 6: Update `moveMouse()` to enter web authority**

Replace:

```js
function moveMouse(dx, dy) {
  if (cursorState && !cursorSyncAnchor) cursorSyncAnchor = { rx: cursorState.rx, ry: cursorState.ry };
  predictCursorMove(dx, dy);
  sendInput({ action: 'mouse_move', x: dx, y: dy });
}
```

with:

```js
function moveMouse(dx, dy) {
  enterWebRemoteControl('mouse-move');
  if (cursorState && !cursorSyncAnchor) cursorSyncAnchor = { rx: cursorState.rx, ry: cursorState.ry };
  predictCursorMove(dx, dy);
  sendRemoteMouseMove(dx, dy);
}
```

- [ ] **Step 7: Add state-aware server cursor application**

Add this function after `updateCursorGain(serverCursor)`:

```js
function applyServerCursorWithAuthority(serverCursor) {
  const now = Date.now();
  const serverState = cursorFromServer(serverCursor);
  const serverDelta = serverCursorDistance(serverCursor, lastServerCursorPayload);
  const inRemoteProtection = now < remoteControlUntil || now < suppressServerSyncUntil;
  const explainedByRemote = serverMoveMatchesRemote(serverDelta, now);

  if (serverDelta > PHYSICAL_DETECT_PX && !inRemoteProtection && !explainedByRemote) {
    if (cursorAuthority !== CursorAuthority.PHYSICAL) {
      queueClientLog('cursor-authority', {
        state: CursorAuthority.PHYSICAL,
        reason: 'server-cursor-unexplained',
        serverDelta: Math.round(serverDelta),
      });
    }
    cursorAuthority = CursorAuthority.PHYSICAL;
  }

  if (cursorAuthority === CursorAuthority.PHYSICAL || !cursorState) {
    cursorState = serverState;
    lastServerCursorPayload = serverCursor;
    return { serverState, errorX: 0, errorY: 0, hard: true };
  }

  const errorX = (serverState.rx - cursorState.rx) * serverCursor.width;
  const errorY = (serverState.ry - cursorState.ry) * serverCursor.height;
  const errorPx = Math.hypot(errorX, errorY);

  if (now < suppressServerSyncUntil) {
    cursorState = { ...serverState, rx: cursorState.rx, ry: cursorState.ry };
    lastServerCursorPayload = serverCursor;
    return { serverState, errorX, errorY, hard: false };
  }

  const remoteActive = now - lastRemoteInputAt < REMOTE_LOCK_MS;
  if (remoteActive) {
    const alpha = errorPx < 20 ? 0.12 : 0.03;
    cursorState = {
      ...serverState,
      rx: cursorState.rx + (serverState.rx - cursorState.rx) * alpha,
      ry: cursorState.ry + (serverState.ry - cursorState.ry) * alpha,
    };
    lastServerCursorPayload = serverCursor;
    return { serverState, errorX, errorY, hard: false };
  }

  cursorState = serverState;
  lastServerCursorPayload = serverCursor;
  return { serverState, errorX, errorY, hard: true };
}
```

- [ ] **Step 8: Replace hard-sync logic in `updateCursor()`**

In `updateCursor()`, replace the block that creates `before`, `serverState`, `errorX`, `errorY`, `movingNow`, `shouldHardSync`, and assigns `cursorState` with:

```js
      const before = cursorState ? { rx: cursorState.rx, ry: cursorState.ry } : null;
      const gainInfo = updateCursorGain(serverCursor);
      const authorityResult = applyServerCursorWithAuthority(serverCursor);
      const serverState = authorityResult.serverState;
      const errorX = authorityResult.errorX;
      const errorY = authorityResult.errorY;
      const movingNow = cursorAuthority === CursorAuthority.WEB_REMOTE;
```

Then update the log entry field:

```js
        hard: authorityResult.hard,
```

and add:

```js
        authority: cursorAuthority,
        lastAckedRemoteMoveSeq,
```

The existing `drawCursors();` call stays after logging.

- [ ] **Step 9: Replace interval cursor polling with dynamic timeout polling**

Replace `startCursorPolling()` with:

```js
function scheduleNextCursorPoll() {
  clearTimeout(cursorTimer);
  if (!screenPreviewEnabled) return;
  const delay = cursorAuthority === CursorAuthority.PHYSICAL ? CURSOR_POLL_PHYSICAL_MS : CURSOR_POLL_WEB_MS;
  cursorTimer = window.setTimeout(async () => {
    await updateCursor();
    scheduleNextCursorPoll();
  }, delay);
}

function startCursorPolling() {
  clearTimeout(cursorTimer);
  primeCursorDraws();
  scheduleNextCursorPoll();
}
```

Update `stopCursorPollingIfIdle()` so it uses `clearTimeout(cursorTimer);` instead of `clearInterval(cursorTimer);`.

- [ ] **Step 10: Extend or add cursor sync tests**

If `scripts/test-cursor-sync.js` already evaluates `app.js` in a VM and can assert behavior, add checks that:

- `CursorAuthority.WEB_REMOTE` exists,
- `moveMouse()` sends `source: 'web-remote-control'`,
- ack with `seq` updates `lastAckedRemoteMoveSeq`,
- remote protection prevents immediate hard sync.

If the existing harness cannot access these internals, add source assertions like:

```js
assert(appJs.includes("WEB_REMOTE: 'web-remote-control'"), 'web remote authority constant exists');
assert(appJs.includes("PHYSICAL: 'physical-mouse-active'"), 'physical authority constant exists');
assert(appJs.includes('applyServerCursorWithAuthority'), 'state-aware server cursor application exists');
assert(appJs.includes('REMOTE_SUPPRESS_SYNC_MS'), 'remote sync suppression window exists');
assert(appJs.includes('lastAckedRemoteMoveSeq'), 'ack sequence tracking exists');
```

- [ ] **Step 11: Run cursor tests**

Run:

```powershell
node .\scripts\test-cursor-sync.js
node .\scripts\test-cursor-poll-overlap.js
```

Expected: both PASS.

- [ ] **Step 12: Commit the cursor state machine**

Run:

```powershell
git add app/static/app.js scripts/test-cursor-sync.js
git commit -m "feat: add cursor authority state machine"
```

---

## Task 4: Coalesce Frontend Mouse Movement

**Files:**
- Modify: `app/static/app.js:531-535,963-987,1208-1314`
- Test: `scripts/test-cursor-sync.js`

- [ ] **Step 1: Read current mouse movement call sites**

Use the Read tool on `app/static/app.js` around:

- `moveMouse()` near lines 531-535,
- button drag pointer handlers near lines 963-987,
- edge scroll and touchpad handlers near lines 1208-1314.

- [ ] **Step 2: Add coalescing state and helper**

After `moveMouse(dx, dy)`, add:

```js
let queuedMouseDx = 0;
let queuedMouseDy = 0;
let mouseMoveFlushFrame = 0;

function queueMouseMove(dx, dy) {
  queuedMouseDx += dx;
  queuedMouseDy += dy;
  if (mouseMoveFlushFrame) return;
  mouseMoveFlushFrame = window.requestAnimationFrame(() => {
    mouseMoveFlushFrame = 0;
    const flushDx = queuedMouseDx;
    const flushDy = queuedMouseDy;
    queuedMouseDx = 0;
    queuedMouseDy = 0;
    if (flushDx || flushDy) moveMouse(flushDx, flushDy);
  });
}
```

- [ ] **Step 3: Replace high-frequency direct movement calls**

Replace direct movement calls in pointer-move style handlers:

```js
moveMouse(dx, dy);
```

with:

```js
queueMouseMove(dx, dy);
```

Apply this only to continuous movement paths:

- button drag `pointermove`,
- touchpad `pointermove`,
- edge-scroll generated movement.

Keep explicit button actions (`mouse_down`, `mouse_up`, `mouse_click`) using `sendInput()` directly.

- [ ] **Step 4: Add test assertion for coalescing helper**

In `scripts/test-cursor-sync.js`, add a source-level assertion if no behavioral harness is available:

```js
assert(appJs.includes('function queueMouseMove(dx, dy)'), 'mouse move coalescing helper exists');
assert(appJs.includes('window.requestAnimationFrame(() => {'), 'mouse move coalescing flushes by animation frame');
```

- [ ] **Step 5: Run cursor tests**

Run:

```powershell
node .\scripts\test-cursor-sync.js
node .\scripts\test-cursor-poll-overlap.js
```

Expected: both PASS.

- [ ] **Step 6: Commit movement coalescing**

Run:

```powershell
git add app/static/app.js scripts/test-cursor-sync.js
git commit -m "perf: coalesce remote mouse movement"
```

---

## Task 5: Echo Mouse Metadata From Backend

**Files:**
- Modify: `app/main.py:336-370`
- Modify: `app/input_controller.py:71-80`
- Test: Python compile check

- [ ] **Step 1: Read backend input handling**

Use the Read tool on:

- `app/main.py` around `handle_message()` and the input ack send,
- `app/input_controller.py` around the `InputEvent` dataclass.

- [ ] **Step 2: Add optional metadata fields to `InputEvent`**

In `app/input_controller.py`, update `InputEvent` to include:

```python
source: str | None = None
seq: int | None = None
client_ts: int | None = None
```

Keep existing fields unchanged.

- [ ] **Step 3: Pass metadata when constructing `InputEvent`**

In `app/main.py`, when creating `InputEvent`, add:

```python
source=message.get("source"),
seq=message.get("seq") if isinstance(message.get("seq"), int) else None,
client_ts=message.get("clientTs") if isinstance(message.get("clientTs"), int) else None,
```

Do not change input dispatch semantics.

- [ ] **Step 4: Echo metadata in ack**

Replace the existing input ack:

```python
await send_json(websocket, send_lock, {"type": "ack", "id": message.get("id")})
```

with:

```python
await send_json(websocket, send_lock, {
    "type": "ack",
    "id": message.get("id"),
    "seq": message.get("seq"),
    "source": message.get("source"),
    "serverTs": int(time.time() * 1000),
})
```

`app/main.py` already imports `time`; if it does not in the current file version, add:

```python
import time
```

near the other imports.

- [ ] **Step 5: Compile Python files**

Run:

```powershell
.\.venv\Scripts\python.exe -m compileall app
```

Expected: compile completes without syntax errors.

- [ ] **Step 6: Commit backend ack metadata**

Run:

```powershell
git add app/main.py app/input_controller.py
git commit -m "feat: echo input sequencing metadata"
```

---

## Task 6: Run Integration Checks and Manual Verification

**Files:**
- No planned source changes unless verification finds a bug.
- May modify files touched in previous tasks only to fix verified issues.

- [ ] **Step 1: Run frontend script tests**

Run:

```powershell
node .\scripts\test-panzoom-viewer.js
node .\scripts\test-cursor-sync.js
node .\scripts\test-cursor-poll-overlap.js
node .\scripts\test-window-controls.js
```

Expected: all PASS.

- [ ] **Step 2: Run Python compile check**

Run:

```powershell
.\.venv\Scripts\python.exe -m compileall app
```

Expected: compile completes without syntax errors.

- [ ] **Step 3: Start the app**

Run:

```powershell
.\.venv\Scripts\python.exe run.py
```

If the app is already running from a previous session, restart it after the changes so new backend and static files take effect.

- [ ] **Step 4: Health check**

In another terminal, run:

```powershell
Invoke-WebRequest http://127.0.0.1:8790/health
```

Expected: HTTP 200 response.

- [ ] **Step 5: Manual viewer verification**

Open the app in a browser and verify:

1. Screen preview opens.
2. Clicking preview opens the fullscreen viewer.
3. The close `X` is visible above the image.
4. Clicking `X` closes the viewer.
5. Wheel zoom changes image scale.
6. Dragging pans the image when zoomed.
7. Double-click toggles zoom between normal and zoomed.
8. On touch device or emulator, pinch zoom works.
9. On touch device or emulator, double-tap toggles zoom.

- [ ] **Step 6: Manual cursor verification**

With screen preview enabled, verify:

1. Web touchpad movement updates the virtual cursor immediately.
2. During web touchpad movement, cursor no longer repeatedly snaps backward.
3. Moving the real physical mouse makes the virtual cursor follow real cursor position.
4. Returning to the web touchpad switches authority back to web remote control.
5. Button drag and edge-scroll still move the remote cursor.
6. Left/right/middle click and wheel still work.

- [ ] **Step 7: Fix only verified issues**

If a verification step fails, change only the file responsible for that failure and rerun the relevant checks. Do not add unrelated refactors.

- [ ] **Step 8: Final commit**

If verification fixes were needed, commit them:

```powershell
git add app/static/app.js app/static/styles.css app/static/index.html app/static/sw.js app/main.py app/input_controller.py scripts/test-panzoom-viewer.js scripts/test-cursor-sync.js
git commit -m "fix: stabilize panzoom cursor integration"
```

If no verification fixes were needed, skip this commit.

---

## Self-Review Notes

- Spec coverage:
  - Panzoom viewer with existing modal and close `X`: Tasks 1-2.
  - Touch pinch, drag, wheel, double-click/tap zoom: Task 2 and manual verification.
  - Cursor authority states: Task 3.
  - Mouse movement coalescing: Task 4.
  - Backend ack metadata: Task 5.
  - Tests and manual verification: Task 6.

- Placeholder scan:
  - No `TBD`, `TODO`, or deferred requirements remain.
  - Optional backend optimizations from the spec are intentionally out of the first pass except metadata echo.

- Type and property consistency:
  - Frontend uses `source`, `seq`, and `clientTs`.
  - Backend echoes `source`, `seq`, and `serverTs`.
  - `InputEvent` stores `source`, `seq`, and `client_ts`.
