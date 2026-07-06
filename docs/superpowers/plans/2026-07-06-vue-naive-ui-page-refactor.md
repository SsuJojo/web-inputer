# Vue Naive UI Page Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current static remote-input page with a Vue 3 + Vite + pnpm frontend using Naive UI, while preserving the existing FastAPI API/WebSocket behavior and deployment shape.

**Architecture:** Add a focused `frontend/` Vue app that builds into `app/static/dist`. FastAPI serves the built Vite HTML at `/`, injects `window.PUBLIC_ORIGIN`, and keeps existing static files, manifest, service worker, `/api/*`, `/ws`, and screen/power endpoints unchanged. Vue composables own session, WebSocket, settings, cursor, screen, power, and input behavior; Vue components own the touch-first UI.

**Tech Stack:** Python FastAPI, Vue 3, Vite, pnpm, Naive UI, plain JavaScript SFCs, existing `panzoom.min.js` vendor asset.

---

## File Structure

- Create `frontend/package.json`: pnpm/Vite/Vue/Naive UI scripts and dependencies.
- Create `frontend/index.html`: Vite HTML entry with `#app` and PWA metadata.
- Create `frontend/vite.config.mjs`: Vue plugin, aliases, build output to `../app/static/dist`, dev proxy to FastAPI.
- Create `frontend/src/main.js`: Vue bootstrap with Naive UI.
- Create `frontend/src/App.vue`: root shell and component composition.
- Create `frontend/src/styles.css`: global mobile-first dark design and custom remote-control surfaces.
- Create `frontend/src/api/http.js`: REST helpers.
- Create `frontend/src/api/socket.js`: WebSocket URL and message helpers.
- Create `frontend/src/composables/useSettings.js`: localStorage settings.
- Create `frontend/src/composables/useSession.js`: login/session/logout/direct fallback.
- Create `frontend/src/composables/useRemoteSocket.js`: WebSocket lifecycle, heartbeat, input/window messages.
- Create `frontend/src/composables/useCursorSync.js`: current cursor authority/prediction logic.
- Create `frontend/src/composables/useScreenPreview.js`: preview stream, frame modal, panzoom, orientation handling.
- Create `frontend/src/composables/usePowerControl.js`: power state/actions/modal scheduling.
- Create `frontend/src/composables/useTouchpad.js`: touchpad/wheel/mouse gesture behavior.
- Create `frontend/src/components/LoginCard.vue`: login form.
- Create `frontend/src/components/StatusHeader.vue`: title, status, latency, settings/logout.
- Create `frontend/src/components/ScreenPreviewCard.vue`: sticky preview controls and MJPEG image/cursor layer.
- Create `frontend/src/components/TextInputCard.vue`: text, newline, send, clipboard.
- Create `frontend/src/components/TouchpadCard.vue`: window switch, touchpad, mouse buttons, wheel.
- Create `frontend/src/components/KeyboardCard.vue`: modifiers, common keys, arrows, QWERTY grid.
- Create `frontend/src/components/SettingsModal.vue`: direct host, toggles, sliders.
- Create `frontend/src/components/PowerControlCard.vue`: collapsible power actions and status.
- Create `frontend/src/components/PowerActionModal.vue`: now/countdown/time picker.
- Create `frontend/src/components/ScreenFrameModal.vue`: fullscreen screenshot modal.
- Modify `app/main.py`: serve Vite build when present and inject config before module script.
- Modify `app/static/sw.js`: cache and navigate to the Vite build shell safely.
- Modify `README.md`: document frontend build commands.
- Keep `app/static/vendor/panzoom.min.js`, `manifest.webmanifest`, existing backend APIs, and existing tests.

## Task 1: Create the Vue build scaffold

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/index.html`
- Create: `frontend/vite.config.mjs`
- Create: `frontend/src/main.js`
- Create: `frontend/src/App.vue`
- Create: `frontend/src/styles.css`

- [ ] **Step 1: Add the package manifest**

Create `frontend/package.json`:

```json
{
  "name": "web-inputer-frontend",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@10.33.0",
  "scripts": {
    "dev": "vite --host 0.0.0.0 --port 5175",
    "build": "vite build",
    "preview": "vite preview --host 0.0.0.0 --port 4175"
  },
  "dependencies": {
    "@vitejs/plugin-vue": "^6.0.1",
    "vite": "^5.3.0",
    "vue": "^3.5.0",
    "naive-ui": "^2.43.1"
  },
  "devDependencies": {}
}
```

- [ ] **Step 2: Add the Vite HTML entry**

Create `frontend/index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no" />
    <meta name="theme-color" content="#0f172a" />
    <link rel="manifest" href="/manifest.webmanifest?v=20260706-01" />
    <title>Remote Input</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>
```

- [ ] **Step 3: Add the Vite config**

Create `frontend/vite.config.mjs`:

```js
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  base: '/static/dist/',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    outDir: '../app/static/dist',
    emptyOutDir: true,
  },
  server: {
    host: '0.0.0.0',
    port: 5175,
    strictPort: true,
    proxy: {
      '^/(api|ws|manifest.webmanifest|static/vendor)': {
        target: 'http://127.0.0.1:8790',
        ws: true,
        changeOrigin: true,
      },
    },
  },
})
```

- [ ] **Step 4: Add Vue bootstrap**

Create `frontend/src/main.js`:

```js
import { createApp } from 'vue'
import naive from 'naive-ui'
import App from './App.vue'
import './styles.css'

createApp(App).use(naive).mount('#app')
```

- [ ] **Step 5: Add a temporary root component**

Create `frontend/src/App.vue`:

```vue
<script setup>
</script>

<template>
  <n-config-provider>
    <n-message-provider>
      <main class="app-shell">
        <n-card class="panel-card">
          <h1>Remote Input</h1>
          <p class="muted">Vue frontend scaffold ready.</p>
        </n-card>
      </main>
    </n-message-provider>
  </n-config-provider>
</template>
```

- [ ] **Step 6: Add initial global CSS**

Create `frontend/src/styles.css`:

```css
:root {
  color-scheme: dark;
  --bg: #020617;
  --card: rgba(15, 23, 42, 0.86);
  --card-solid: #0f172a;
  --card-2: #111827;
  --text: #e5e7eb;
  --muted: #94a3b8;
  --accent: #38bdf8;
  --danger: #f87171;
  --ok: #34d399;
  --border: rgba(148, 163, 184, 0.22);
}

* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
html, body, #app { margin: 0; min-height: 100%; }
body {
  background: radial-gradient(circle at top, #172554, var(--bg));
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}
button, textarea, input { font: inherit; }
textarea, input { user-select: text; -webkit-user-select: text; -webkit-touch-callout: default; }
.app-shell { width: min(1180px, 100%); margin: 0 auto; padding: max(18px, env(safe-area-inset-top)) 14px max(24px, env(safe-area-inset-bottom)); }
.panel-card { margin: 14px 0; border-radius: 22px; background: var(--card); border: 1px solid var(--border); box-shadow: 0 18px 40px rgba(0, 0, 0, 0.25); backdrop-filter: blur(14px); }
.muted { color: var(--muted); margin: 0; }
.hidden { display: none !important; }
```

- [ ] **Step 7: Install dependencies and build**

Run:

```powershell
pnpm --dir frontend install
pnpm --dir frontend build
```

Expected: `app/static/dist/index.html` and hashed assets are created.

- [ ] **Step 8: Commit scaffold**

```powershell
git add frontend app/static/dist
git commit -m "feat: scaffold vue naive ui frontend"
```

## Task 2: Make FastAPI serve the built Vue shell

**Files:**
- Modify: `app/main.py:110-116`
- Modify: `app/static/sw.js`
- Test: `tests/test_static_frontend.py`

- [ ] **Step 1: Add failing tests for build-shell serving**

Create `tests/test_static_frontend.py`:

```python
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app, static_dir


def test_index_injects_public_origin_into_available_shell(monkeypatch):
    dist_index = static_dir / "dist" / "index.html"
    original = dist_index.read_text(encoding="utf-8") if dist_index.exists() else None
    dist_index.parent.mkdir(parents=True, exist_ok=True)
    dist_index.write_text(
        '<html><body><div id="app"></div><script type="module" src="/static/dist/assets/app.js"></script></body></html>',
        encoding="utf-8",
    )
    monkeypatch.setattr("app.main.settings.public_origin", "https://example.test")
    try:
        response = TestClient(app).get("/")
    finally:
        if original is None:
            dist_index.unlink(missing_ok=True)
        else:
            dist_index.write_text(original, encoding="utf-8")

    assert response.status_code == 200
    assert 'window.PUBLIC_ORIGIN = "https://example.test"' in response.text
    assert 'type="module"' in response.text


def test_index_falls_back_to_legacy_shell_when_build_missing(monkeypatch):
    monkeypatch.setattr("app.main.settings.public_origin", "https://fallback.test")
    monkeypatch.setattr("app.main.frontend_index_path", lambda: Path("missing-index.html"))

    response = TestClient(app).get("/")

    assert response.status_code == 200
    assert "Remote Input" in response.text
    assert 'window.PUBLIC_ORIGIN = "https://fallback.test"' in response.text
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```powershell
.\.venv\Scripts\python.exe -X utf-8 -m pytest tests/test_static_frontend.py -v
```

Expected: failure because `frontend_index_path` is not defined and current route only serves legacy HTML.

- [ ] **Step 3: Implement build-shell serving**

In `app/main.py`, add this helper above `index()`:

```python
def frontend_index_path() -> Path:
    built_index = static_dir / "dist" / "index.html"
    if built_index.exists():
        return built_index
    return static_dir / "index.html"


def inject_public_origin(content: str) -> str:
    public_origin = json.dumps(settings.public_origin.rstrip("/"))
    config_script = f"<script>window.PUBLIC_ORIGIN = {public_origin};</script>"
    if "window.PUBLIC_ORIGIN" in content:
        return content
    if "<script type=\"module\"" in content:
        return content.replace("<script type=\"module\"", f"{config_script}\n    <script type=\"module\"", 1)
    return content.replace("  <script src=\"/static/app.js", f"  {config_script}\n  <script src=\"/static/app.js", 1)
```

Replace `index()` with:

```python
@app.get("/", include_in_schema=False)
async def index() -> HTMLResponse:
    content = frontend_index_path().read_text(encoding="utf-8")
    return HTMLResponse(inject_public_origin(content))
```

- [ ] **Step 4: Update service worker navigation cache**

In `app/static/sw.js`, ensure navigation requests fetch `/` from network first and only fall back to cache. Keep static asset caching minimal. If the existing file is simpler, replace it with:

```js
const CACHE_NAME = 'remote-input-vue-20260706-01';
const STATIC_ASSETS = [
  '/manifest.webmanifest',
  '/static/vendor/panzoom.min.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/')));
    return;
  }
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
});
```

- [ ] **Step 5: Run tests**

```powershell
.\.venv\Scripts\python.exe -X utf-8 -m pytest tests/test_static_frontend.py -v
```

Expected: both tests pass.

- [ ] **Step 6: Commit backend serving changes**

```powershell
git add app/main.py app/static/sw.js tests/test_static_frontend.py
git commit -m "feat: serve built vue frontend"
```

## Task 3: Port session, settings, and WebSocket behavior into composables

**Files:**
- Create: `frontend/src/api/http.js`
- Create: `frontend/src/api/socket.js`
- Create: `frontend/src/composables/useSettings.js`
- Create: `frontend/src/composables/useSession.js`
- Create: `frontend/src/composables/useRemoteSocket.js`

- [ ] **Step 1: Add REST helpers**

Create `frontend/src/api/http.js`:

```js
export async function getJson(path) {
  const response = await fetch(path, { credentials: 'include' })
  if (!response.ok) throw new Error(await errorMessage(response))
  return response.json()
}

export async function postJson(path, body = null) {
  const options = { method: 'POST', credentials: 'include' }
  if (body !== null) {
    options.headers = { 'Content-Type': 'application/json' }
    options.body = JSON.stringify(body)
  }
  const response = await fetch(path, options)
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.detail || '请求失败')
  return data
}

async function errorMessage(response) {
  const data = await response.json().catch(() => ({}))
  return data.detail || `请求失败：${response.status}`
}
```

- [ ] **Step 2: Add WebSocket helper**

Create `frontend/src/api/socket.js`:

```js
export function wsUrl() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${location.host}/ws`
}

export function safeJsonParse(value) {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}
```

- [ ] **Step 3: Add settings composable**

Create `frontend/src/composables/useSettings.js` with the current `remoteInputSettings` shape from legacy `app.js`. Export `loadSettings()`, `saveSettings(settings)`, and `createDefaultSettings(stored)`.

The default object must include:

```js
{
  keyBubble: true,
  vibrate: true,
  wheelSensitivity: 24,
  touchSensitivity: 1.6,
  directHost: '',
  directPort: '8790',
  directConfirmedAt: 0,
  directSuspectUntil: 0,
  textInput: '',
  textSelectionStart: 0,
  textSelectionEnd: 0,
  screenFrameZoom: null,
  screenFrameScrollLeft: 0,
  screenFrameScrollTop: 0,
}
```

- [ ] **Step 4: Add session/direct composable**

Create `frontend/src/composables/useSession.js`. Port these functions from legacy `app.js` using Vue refs:

- `checkSession()` calls `/api/session`.
- `login(password, keepSignedIn)` calls `/api/login`.
- `logout()` calls `/api/logout`.
- `directUrl()`, `publicUrl()`, `probeSavedDirect()`, `switchToSavedDirect()`, `switchToPublic()` preserve current direct fallback semantics.

Return `authenticated`, `loginError`, `checkSession`, `login`, `logout`, `switchToSavedDirect`, `switchToPublic`.

- [ ] **Step 5: Add remote socket composable**

Create `frontend/src/composables/useRemoteSocket.js`. Port current WebSocket lifecycle:

- `connect()` opens `wsUrl()`.
- On open: mark connected, send `{ type: 'claim' }`, request window state, start heartbeat.
- On message: handle `ack`, `pong`, `control`, `error`, `window_state`, `window_error`.
- On close/error: set disconnected status and schedule reconnect.
- Expose `send(payload)`, `sendInput(payload)`, `sendWindowControl(action, payload)`, `connect()`, `disconnect()`, `statusText`, `statusKind`, `latencyText`, `currentWindowTitle`.

Keep `eventId`, `heldKeys`, and client logging inside this composable or pass callbacks in later tasks.

- [ ] **Step 6: Build**

```powershell
pnpm --dir frontend build
```

Expected: build succeeds.

- [ ] **Step 7: Commit composables**

```powershell
git add frontend/src/api frontend/src/composables app/static/dist
git commit -m "feat: port session and socket logic to vue"
```

## Task 4: Build the main UI components

**Files:**
- Create/modify all component files listed in File Structure.
- Modify: `frontend/src/App.vue`
- Modify: `frontend/src/styles.css`

- [ ] **Step 1: Implement `LoginCard.vue`**

Use `n-card`, `n-form`, `n-input`, `n-checkbox`, and `n-button`. Props: `loading`, `error`. Emits: `submit` with `{ password, keepSignedIn }`.

- [ ] **Step 2: Implement `StatusHeader.vue`**

Props: `statusText`, `statusKind`, `latencyText`. Emits: `settings`, `logout`. Use Naive UI buttons for actions.

- [ ] **Step 3: Implement `TextInputCard.vue`**

Props: `modelValue`. Emits: `update:modelValue`, `send`, `clipboard`. It must preserve Enter-to-send and newline button behavior:

```js
function handleKeydown(event) {
  if (event.key !== 'Enter' || event.repeat) return
  event.preventDefault()
  emit('send', { pressEnterAfterText: true })
}
```

- [ ] **Step 4: Implement `KeyboardCard.vue`**

Render modifier row, common key row, arrow grid, and dynamic rows:

```js
const keyRows = [
  { className: 'digits', keys: '1234567890'.split('') },
  { className: 'qwerty', keys: 'qwertyuiop'.split('') },
  { className: 'home', keys: 'asdfghjkl'.split('') },
  { className: 'bottom', keys: 'zxcvbnm'.split('').concat('backspace') },
  { className: 'space', keys: ['space', 'enter'] },
]
```

Emit `tap`, `key-down`, `key-up`, and `toggle-modifier`.

- [ ] **Step 5: Implement settings and power components**

`SettingsModal.vue` uses `n-modal`, `n-input`, `n-switch`, `n-slider`, and action buttons. `PowerControlCard.vue` renders power actions. `PowerActionModal.vue` renders now/countdown/time mode selectors and emits confirm/cancel.

- [ ] **Step 6: Wire root app**

Replace temporary `App.vue` with the actual composition:

- If not authenticated: show `LoginCard`.
- If authenticated: show `StatusHeader`, `ScreenPreviewCard`, `TextInputCard`, `TouchpadCard`, `KeyboardCard`, `PowerControlCard`, modals.
- On mounted: call `switchToSavedDirect()`, then `checkSession()`, then `connect()`.
- On unmount: disconnect socket and release held keys.

- [ ] **Step 7: Port CSS selectors**

Move relevant legacy `styles.css` sections into `frontend/src/styles.css`. Keep class names where components depend on them: `.screen-card`, `.screen-preview`, `.screen-stage`, `.screen-cursor`, `.touch-panel`, `.touch-pad`, `.key-grid`, `.key-row`, `.key-bubble`, `.modal` equivalents only when Naive UI does not own styling.

- [ ] **Step 8: Build**

```powershell
pnpm --dir frontend build
```

Expected: build succeeds and generated `app/static/dist` changes.

- [ ] **Step 9: Commit UI components**

```powershell
git add frontend/src app/static/dist
git commit -m "feat: rebuild remote input ui with vue"
```

## Task 5: Port screen preview, cursor, touchpad, and power behavior

**Files:**
- Create/modify: `frontend/src/composables/useCursorSync.js`
- Create/modify: `frontend/src/composables/useScreenPreview.js`
- Create/modify: `frontend/src/composables/usePowerControl.js`
- Create/modify: `frontend/src/composables/useTouchpad.js`
- Modify: `frontend/src/components/ScreenPreviewCard.vue`
- Modify: `frontend/src/components/ScreenFrameModal.vue`
- Modify: `frontend/src/components/TouchpadCard.vue`
- Modify: `frontend/src/components/PowerControlCard.vue`
- Modify: `frontend/src/components/PowerActionModal.vue`

- [ ] **Step 1: Port cursor authority logic**

Move legacy constants and functions into `useCursorSync.js`:

- `CursorAuthority`
- `REMOTE_LOCK_MS`
- `REMOTE_SUPPRESS_SYNC_MS`
- `PHYSICAL_DETECT_PX`
- `REMOTE_EXPECT_WINDOW_MS`
- `CURSOR_POLL_WEB_MS`
- `CURSOR_POLL_PHYSICAL_MS`
- `enterWebRemoteControl()`
- `rememberRemoteMove()`
- `markRemoteMoveAcked()`
- `predictCursorMove()`
- `applyServerCursorWithAuthority()`
- `updateCursor()`
- `positionCursor()`
- `drawCursors()`

Expose refs and methods needed by screen/touchpad components.

- [ ] **Step 2: Port screen preview behavior**

Move preview toggling and frame modal behavior into `useScreenPreview.js`:

- `setScreenPreview(enabled)` sets stream URL to `/api/screen/stream?ts=${Date.now()}`.
- Fullscreen modal loads `/api/screen/frame?ts=${Date.now()}`.
- Panzoom uses `window.Panzoom` from `/static/vendor/panzoom.min.js`.
- Orientation event moves the close button left/right exactly like legacy behavior.

- [ ] **Step 3: Port touchpad and wheel behavior**

Move legacy touchpad functions into `useTouchpad.js`: pointer movement, tap-to-left-click, double-tap drag, edge scroll, wheel surface, inertia. The composable accepts `sendInput`, `queueMouseMove`, `settings`, and `vibrate`.

- [ ] **Step 4: Port power behavior**

Move REST calls and formatting into `usePowerControl.js`:

- `refreshPowerStatus()` calls `/api/power/status`.
- `postPower(path, body)` calls existing REST endpoints.
- `openPowerModal(action)`, `confirmPowerAction()`, `cancelPowerSchedule()` implement current immediate/countdown/time flow.
- `formatPowerRemaining(seconds)` keeps Chinese labels.

- [ ] **Step 5: Build**

```powershell
pnpm --dir frontend build
```

Expected: build succeeds.

- [ ] **Step 6: Commit behavior port**

```powershell
git add frontend/src app/static/dist
git commit -m "feat: port remote control interactions to vue"
```

## Task 6: Remove legacy page entry and document build flow

**Files:**
- Modify: `app/static/index.html`
- Modify: `app/static/app.js`
- Modify: `app/static/styles.css`
- Modify: `README.md`

- [ ] **Step 1: Replace legacy static files with fallback notices**

Keep the files present for fallback/debugging, but shrink them so stale legacy code cannot execute accidentally:

`app/static/index.html` should contain a minimal fallback shell with `<div id="app">前端资源未构建，请运行 pnpm --dir frontend build。</div>` and script/style references removed.

`app/static/app.js` should contain:

```js
console.warn('Legacy static app.js is no longer used. Run pnpm --dir frontend build.');
```

`app/static/styles.css` should contain only minimal fallback styles.

- [ ] **Step 2: Update README**

Add a frontend section:

```markdown
## 前端开发

本项目的页面源码在 `frontend/`，使用 Vue 3 + Vite + pnpm + Naive UI。生产仍由 FastAPI 服务 `app/static/dist` 的构建产物。

```powershell
pnpm --dir frontend install
pnpm --dir frontend build
```

开发时先启动后端，再启动 Vite：

```powershell
.\.venv\Scripts\python.exe -X utf-8 -m uvicorn app.main:app --host 127.0.0.1 --port 8790 --reload --proxy-headers --forwarded-allow-ips='*'
pnpm --dir frontend dev
```
```

- [ ] **Step 3: Build and compile**

```powershell
pnpm --dir frontend build
.\.venv\Scripts\python.exe -X utf-8 -m compileall app
```

Expected: both commands pass.

- [ ] **Step 4: Commit cleanup and docs**

```powershell
git add app/static/index.html app/static/app.js app/static/styles.css README.md app/static/dist
git commit -m "docs: document vue frontend build flow"
```

## Task 7: Final verification and service restart

**Files:**
- No planned source changes unless verification finds a defect.

- [ ] **Step 1: Run backend tests**

```powershell
.\.venv\Scripts\python.exe -X utf-8 -m pytest -q
```

Expected: all tests pass.

- [ ] **Step 2: Run frontend build**

```powershell
pnpm --dir frontend build
```

Expected: Vite build passes.

- [ ] **Step 3: Run Python compile check**

```powershell
.\.venv\Scripts\python.exe -X utf-8 -m compileall app
```

Expected: compile succeeds.

- [ ] **Step 4: Launch app for smoke verification**

```powershell
.\.venv\Scripts\python.exe -X utf-8 -m uvicorn app.main:app --host 127.0.0.1 --port 8790 --proxy-headers --forwarded-allow-ips='*'
```

Expected: server starts on `http://127.0.0.1:8790`.

- [ ] **Step 5: Health check**

```powershell
Invoke-WebRequest http://127.0.0.1:8790/health
```

Expected: JSON contains `"ok":true`.

- [ ] **Step 6: Manual browser smoke**

Open `http://127.0.0.1:8790/`. Verify:

- Login card renders.
- After valid login, control page renders.
- Settings modal opens and closes.
- WebSocket status reaches connected.
- Text input can send text and clear.
- Screen preview toggle starts/stops image stream.
- Touchpad and keyboard buttons do not throw console errors.
- Power control modal opens.

- [ ] **Step 7: Restart running service**

Because this project memory requires restart after service/frontend changes, restart the running web-inputer service using the existing local startup/service method. If no service is running, state that explicitly.

- [ ] **Step 8: Final commit if verification fixes were needed**

If verification required changes:

```powershell
git add <changed-files>
git commit -m "fix: stabilize vue frontend refactor"
```

If no changes were required, do not create an empty commit.

## Self-Review

- Spec coverage: the plan covers Vue/Vite/pnpm/Naive UI scaffold, FastAPI serving, existing API/WebSocket preservation, mobile UI migration, cursor/screen/touch/power behavior, testing, docs, and service restart.
- Placeholder scan: no task uses TBD/TODO/implement later language. Some behavior-port tasks reference legacy functions by exact names because the source code already defines those functions and the implementation task is a mechanical port.
- Type/property consistency: all frontend code is plain JavaScript Vue SFC code; backend tests use existing `app.main.static_dir` and new `frontend_index_path()` helper consistently.
