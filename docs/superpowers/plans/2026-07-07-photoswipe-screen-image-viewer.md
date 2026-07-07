# PhotoSwipe Screen Image Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the custom fullscreen screen-image viewer with PhotoSwipe 5 while preserving the existing sliding close button.

**Architecture:** Keep the current Vue screen preview flow and `ScreenFrameModal.vue` shell, but move image zoom/pan/fullscreen presentation into a small PhotoSwipe lifecycle inside `useScreenPreview.js`. The project continues to own modal state, fullscreen request/exit, orientation-based close-button placement, and the custom close button overlay.

**Tech Stack:** Vue 3, Vite, Naive UI, PhotoSwipe 5, Python/FastAPI static tests, existing Node static smoke scripts.

---

## File Structure

- Modify `frontend/package.json`: add `photoswipe` as a frontend dependency.
- Modify `frontend/pnpm-lock.yaml`: update via `pnpm add photoswipe` from `frontend/`.
- Modify `frontend/index.html`: remove the legacy `/static/vendor/panzoom.min.js` script because PhotoSwipe is bundled by Vite.
- Modify `frontend/src/composables/useScreenPreview.js`: replace Panzoom state and handlers with PhotoSwipe lifecycle helpers.
- Modify `frontend/src/components/ScreenFrameModal.vue`: keep the Vue shell and close button, remove the Panzoom viewport/stage image markup and obsolete event emits/refs.
- Modify `frontend/src/components/RemoteInputApp.vue`: simplify open/close calls and remove dblclick/touchend event wiring.
- Modify `frontend/src/styles.css`: keep `.screen-frame-close` and `.screen-frame-close.align-right`, remove obsolete stage/viewport transform styling, and add minimal PhotoSwipe layering overrides.
- Modify `app/static/sw.js`: stop caching the removed Panzoom vendor file and bump the cache name.
- Modify `scripts/test-panzoom-viewer.js`: convert the old Panzoom smoke test into a PhotoSwipe integration smoke test, keeping the filename to avoid changing external command habits.
- Build output under `app/static/dist/` may change after `pnpm build`; include generated changes if this repo tracks built frontend assets.

---

### Task 1: Update static smoke test for PhotoSwipe integration

**Files:**
- Modify: `scripts/test-panzoom-viewer.js:1-27`

- [ ] **Step 1: Replace the old Panzoom smoke test with a PhotoSwipe smoke test**

Replace the whole contents of `scripts/test-panzoom-viewer.js` with:

```js
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const frontendPackage = fs.readFileSync(path.join(root, 'frontend/package.json'), 'utf8');
const frontendIndex = fs.readFileSync(path.join(root, 'frontend/index.html'), 'utf8');
const screenPreview = fs.readFileSync(path.join(root, 'frontend/src/composables/useScreenPreview.js'), 'utf8');
const screenModal = fs.readFileSync(path.join(root, 'frontend/src/components/ScreenFrameModal.vue'), 'utf8');
const remoteInputApp = fs.readFileSync(path.join(root, 'frontend/src/components/RemoteInputApp.vue'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'frontend/src/styles.css'), 'utf8');
const swJs = fs.readFileSync(path.join(root, 'app/static/sw.js'), 'utf8');

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

const packageJson = JSON.parse(frontendPackage);
assert(packageJson.dependencies.photoswipe, 'frontend package declares PhotoSwipe dependency');
assert(!frontendIndex.includes('/static/vendor/panzoom.min.js'), 'frontend shell no longer loads vendored Panzoom');
assert(!swJs.includes('/static/vendor/panzoom.min.js'), 'service worker no longer caches vendored Panzoom');
assert(screenPreview.includes("from 'photoswipe'"), 'screen preview composable imports PhotoSwipe');
assert(screenPreview.includes("import 'photoswipe/style.css'"), 'screen preview composable imports PhotoSwipe styles');
assert(screenPreview.includes('openScreenFramePhotoSwipe'), 'screen preview composable defines PhotoSwipe open helper');
assert(screenPreview.includes('destroyScreenFramePhotoSwipe'), 'screen preview composable defines PhotoSwipe cleanup helper');
assert(!screenPreview.includes('initScreenFramePanzoom'), 'Panzoom initialization was removed');
assert(!screenPreview.includes('toggleScreenFrameZoom'), 'custom double-click zoom toggle was removed');
assert(!screenPreview.includes('handleFrameTouchEnd'), 'custom double-tap zoom handler was removed');
assert(screenModal.includes('screen-frame-close'), 'screen modal keeps the custom close button');
assert(!screenModal.includes('screen-frame-stage'), 'screen modal no longer renders custom Panzoom stage');
assert(!remoteInputApp.includes('toggleScreenFrameZoom'), 'app no longer wires custom double-click zoom');
assert(!remoteInputApp.includes('handleFrameTouchEnd'), 'app no longer wires custom double-tap zoom');
assert(styles.includes('.pswp'), 'styles include PhotoSwipe layering overrides');
assert(styles.includes('.screen-frame-close.align-right'), 'styles keep sliding close-button alignment');

console.log('PASS: PhotoSwipe viewer static integration checks passed');
```

- [ ] **Step 2: Run the smoke test and verify it fails before implementation**

Run:

```bash
node scripts/test-panzoom-viewer.js
```

Expected: FAIL with `frontend package declares PhotoSwipe dependency` or another PhotoSwipe-related missing integration message.

- [ ] **Step 3: Commit the failing test**

Run:

```bash
git add scripts/test-panzoom-viewer.js
git commit -m "test: expect PhotoSwipe screen viewer integration"
```

Expected: commit succeeds.

---

### Task 2: Add PhotoSwipe dependency and remove legacy Panzoom shell loading

**Files:**
- Modify: `frontend/package.json:12-17`
- Modify: `frontend/pnpm-lock.yaml`
- Modify: `frontend/index.html:18-22`
- Modify: `app/static/sw.js:1-5`

- [ ] **Step 1: Add PhotoSwipe with pnpm**

Run from the repository root:

```bash
cd frontend && pnpm add photoswipe
```

Expected: `frontend/package.json` includes a `photoswipe` dependency and `frontend/pnpm-lock.yaml` is updated.

- [ ] **Step 2: Remove the Panzoom script from the frontend shell**

In `frontend/index.html`, replace:

```html
    <script src="/static/vendor/panzoom.min.js?v=20260703-01"></script>
    <script type="module" src="/src/main.js"></script>
```

with:

```html
    <script type="module" src="/src/main.js"></script>
```

- [ ] **Step 3: Remove Panzoom from the service worker cache and bump cache name**

In `app/static/sw.js`, replace:

```js
const CACHE_NAME = 'remote-input-vue-20260706-01';
const STATIC_ASSETS = [
  '/manifest.webmanifest',
  '/static/vendor/panzoom.min.js',
];
```

with:

```js
const CACHE_NAME = 'remote-input-vue-20260707-photoswipe-01';
const STATIC_ASSETS = [
  '/manifest.webmanifest',
];
```

- [ ] **Step 4: Run the smoke test again**

Run:

```bash
node scripts/test-panzoom-viewer.js
```

Expected: still FAIL because `useScreenPreview.js` does not import or initialize PhotoSwipe yet.

- [ ] **Step 5: Commit dependency and shell changes**

Run:

```bash
git add frontend/package.json frontend/pnpm-lock.yaml frontend/index.html app/static/sw.js
git commit -m "chore: add PhotoSwipe dependency"
```

Expected: commit succeeds.

---

### Task 3: Replace Panzoom lifecycle with PhotoSwipe lifecycle

**Files:**
- Modify: `frontend/src/composables/useScreenPreview.js:1-264`

- [ ] **Step 1: Import PhotoSwipe and its CSS**

At the top of `frontend/src/composables/useScreenPreview.js`, replace:

```js
import { computed, nextTick, ref } from 'vue'
```

with:

```js
import { computed, nextTick, ref } from 'vue'
import PhotoSwipe from 'photoswipe'
import 'photoswipe/style.css'
```

- [ ] **Step 2: Replace Panzoom state with PhotoSwipe state**

Inside `useScreenPreview`, replace:

```js
  let screenFramePanzoom = null
  let screenFrameWheelHandler = null
  let screenFrameZoomed = false
  let screenFrameLastTapAt = 0
```

with:

```js
  let screenFramePhotoSwipe = null
  let screenFrameClosingFromPhotoSwipe = false
```

- [ ] **Step 3: Replace Panzoom helper functions with PhotoSwipe helpers**

Delete these functions completely:

```js
  function getPanzoomFactory() {
    return typeof window.Panzoom === 'function' ? window.Panzoom : null
  }

  function destroyScreenFramePanzoom(viewportEl, stageEl) {
    if (screenFrameWheelHandler && viewportEl) viewportEl.removeEventListener('wheel', screenFrameWheelHandler)
    screenFrameWheelHandler = null
    if (screenFramePanzoom?.destroy) screenFramePanzoom.destroy()
    else if (screenFramePanzoom?.dispose) screenFramePanzoom.dispose()
    screenFramePanzoom = null
    screenFrameZoomed = false
    if (stageEl) stageEl.style.transform = ''
  }

  function initScreenFramePanzoom(viewportEl, stageEl) {
    destroyScreenFramePanzoom(viewportEl, stageEl)
    const Panzoom = getPanzoomFactory()
    if (!Panzoom || !stageEl || !viewportEl) return
    screenFramePanzoom = Panzoom(stageEl, { maxScale: 4, minScale: 1, contain: 'outside', canvas: true })
    screenFrameWheelHandler = (event) => screenFramePanzoom?.zoomWithWheel(event)
    viewportEl.addEventListener('wheel', screenFrameWheelHandler, { passive: false })
  }

  function zoomScreenFrameToPoint(event, nextScale) {
    if (screenFramePanzoom?.zoomToPoint) screenFramePanzoom.zoomToPoint(nextScale, event, { animate: true })
    else screenFramePanzoom?.zoom(nextScale, { animate: true })
  }

  function toggleScreenFrameZoom(event) {
    if (!screenFramePanzoom) return
    const nextScale = screenFrameZoomed ? 1 : 2
    zoomScreenFrameToPoint(event, nextScale)
    screenFrameZoomed = nextScale > 1
  }
```

Insert this code in the same location:

```js
  function destroyScreenFramePhotoSwipe() {
    if (!screenFramePhotoSwipe) return
    const instance = screenFramePhotoSwipe
    screenFramePhotoSwipe = null
    if (!instance.isDestroying) instance.destroy()
  }

  function syncScreenFrameClosedFromPhotoSwipe() {
    screenFrameClosingFromPhotoSwipe = true
    frameModalOpen.value = false
    stopScreenFrameOrientation()
    exitFullscreen()
    stopCursorPollingIfIdle()
    screenFramePhotoSwipe = null
    window.setTimeout(() => {
      screenFrameClosingFromPhotoSwipe = false
    }, 0)
  }

  function openScreenFramePhotoSwipe(src) {
    destroyScreenFramePhotoSwipe()
    try {
      screenFramePhotoSwipe = new PhotoSwipe({
        dataSource: [{ src, width: 1920, height: 1080, alt: '屏幕截图预览' }],
        index: 0,
        bgOpacity: 1,
        showHideAnimationType: 'fade',
        wheelToZoom: true,
        zoom: false,
        close: false,
        counter: false,
        arrowKeys: false,
        clickToCloseNonZoomable: false,
        paddingFn: () => ({ top: 6, bottom: 6, left: 6, right: 6 }),
      })
      screenFramePhotoSwipe.on('destroy', syncScreenFrameClosedFromPhotoSwipe)
      screenFramePhotoSwipe.init()
    } catch (error) {
      console.debug('[screen-frame:photoswipe]', error)
      frameModalOpen.value = false
      stopScreenFrameOrientation()
      exitFullscreen()
    }
  }
```

- [ ] **Step 4: Update `openScreenFrame`**

Replace:

```js
  async function openScreenFrame(modalEl, viewportEl, stageEl) {
    moveScreenFrameCloseTo('left')
    frameModalOpen.value = true
    await nextTick()
    requestFullscreen(modalEl)
    requestScreenFrameOrientation()
    window.requestAnimationFrame(() => {
      refreshScreenFrame()
      initScreenFramePanzoom(viewportEl, stageEl)
    })
  }
```

with:

```js
  async function openScreenFrame(modalEl) {
    moveScreenFrameCloseTo('left')
    refreshScreenFrame()
    frameModalOpen.value = true
    await nextTick()
    requestFullscreen(modalEl)
    requestScreenFrameOrientation()
    window.requestAnimationFrame(() => openScreenFramePhotoSwipe(frameUrl.value))
  }
```

- [ ] **Step 5: Update `closeScreenFrame` and remove custom tap handler**

Replace:

```js
  function closeScreenFrame(viewportEl, stageEl) {
    destroyScreenFramePanzoom(viewportEl, stageEl)
    frameModalOpen.value = false
    stopScreenFrameOrientation()
    exitFullscreen()
    stopCursorPollingIfIdle()
  }

  function handleFrameTouchEnd(event) {
    if (event.changedTouches.length !== 1) return
    const now = Date.now()
    if (now - screenFrameLastTapAt < 320) {
      event.preventDefault()
      toggleScreenFrameZoom(event.changedTouches[0])
      screenFrameLastTapAt = 0
      return
    }
    screenFrameLastTapAt = now
  }
```

with:

```js
  function closeScreenFrame() {
    if (!screenFrameClosingFromPhotoSwipe) destroyScreenFramePhotoSwipe()
    frameModalOpen.value = false
    stopScreenFrameOrientation()
    exitFullscreen()
    stopCursorPollingIfIdle()
  }
```

- [ ] **Step 6: Update the returned API**

Replace the return line:

```js
  return { enabled, streamUrl, frameModalOpen, frameUrl, closeAlignRight, formattedWindowTitle, setScreenPreview, toggleScreenPreview, switchDesktop, createDesktop, switchWindow, updateCursor, openScreenFrame, closeScreenFrame, toggleScreenFrameZoom, handleFrameTouchEnd, refreshScreenFrame }
```

with:

```js
  return { enabled, streamUrl, frameModalOpen, frameUrl, closeAlignRight, formattedWindowTitle, setScreenPreview, toggleScreenPreview, switchDesktop, createDesktop, switchWindow, updateCursor, openScreenFrame, closeScreenFrame, refreshScreenFrame }
```

- [ ] **Step 7: Run the smoke test**

Run:

```bash
node scripts/test-panzoom-viewer.js
```

Expected: still FAIL because `ScreenFrameModal.vue`, `RemoteInputApp.vue`, and CSS still contain custom stage/event wiring.

- [ ] **Step 8: Commit composable changes**

Run:

```bash
git add frontend/src/composables/useScreenPreview.js
git commit -m "feat: open screen frames with PhotoSwipe"
```

Expected: commit succeeds.

---

### Task 4: Simplify modal component and app wiring

**Files:**
- Modify: `frontend/src/components/ScreenFrameModal.vue:1-24`
- Modify: `frontend/src/components/RemoteInputApp.vue:123-204`

- [ ] **Step 1: Simplify `ScreenFrameModal.vue` script**

Replace:

```vue
<script setup>
import { ref } from 'vue'

defineProps({ modalOpen: Boolean, frameUrl: String, closeAlignRight: Boolean })
defineEmits(['close', 'dblclick', 'touchend', 'image-load'])
const modalRef = ref(null)
const viewportRef = ref(null)
const stageRef = ref(null)
defineExpose({ modalRef, viewportRef, stageRef })
</script>
```

with:

```vue
<script setup>
import { ref } from 'vue'

defineProps({ modalOpen: Boolean, frameUrl: String, closeAlignRight: Boolean })
defineEmits(['close'])
const modalRef = ref(null)
defineExpose({ modalRef })
</script>
```

- [ ] **Step 2: Simplify `ScreenFrameModal.vue` template**

Replace:

```vue
<template>
  <div v-show="modalOpen" ref="modalRef" id="screenFrameModal" class="modal" role="dialog" aria-modal="true" aria-label="屏幕截图预览">
    <div class="modal-backdrop" @click="$emit('close')"></div>
    <section class="modal-card screen-frame-card">
      <button class="ghost screen-frame-close" :class="{ 'align-right': closeAlignRight }" type="button" aria-label="关闭屏幕截图" @click="$emit('close')">×</button>
      <div ref="viewportRef" class="screen-frame-viewport" @dblclick.prevent="$emit('dblclick', $event)" @touchend="$emit('touchend', $event)">
        <div ref="stageRef" class="screen-frame-stage">
          <img :src="frameUrl" alt="屏幕截图预览" @load="$emit('image-load')">
        </div>
      </div>
    </section>
  </div>
</template>
```

with:

```vue
<template>
  <div v-show="modalOpen" ref="modalRef" id="screenFrameModal" class="modal screen-frame-modal" role="dialog" aria-modal="true" aria-label="屏幕截图预览">
    <section class="screen-frame-card">
      <button class="ghost screen-frame-close" :class="{ 'align-right': closeAlignRight }" type="button" aria-label="关闭屏幕截图" @click="$emit('close')">×</button>
    </section>
  </div>
</template>
```

- [ ] **Step 3: Simplify `RemoteInputApp.vue` open/close functions**

Replace:

```js
function openFrame() {
  if (!previewEnabled.value) return
  screenPreview.openScreenFrame(frameModalRef.value?.modalRef, frameModalRef.value?.viewportRef, frameModalRef.value?.stageRef)
}
```

with:

```js
function openFrame() {
  if (!previewEnabled.value) return
  screenPreview.openScreenFrame(frameModalRef.value?.modalRef)
}
```

Replace:

```js
function closeFrame() {
  screenPreview.closeScreenFrame(frameModalRef.value?.viewportRef, frameModalRef.value?.stageRef)
}
```

with:

```js
function closeFrame() {
  screenPreview.closeScreenFrame()
}
```

- [ ] **Step 4: Simplify `ScreenFrameModal` usage in `RemoteInputApp.vue`**

Replace:

```vue
    <ScreenFrameModal ref="frameModalRef" :modal-open="frameModalOpen" :frame-url="frameUrl" :close-align-right="closeAlignRight" @close="closeFrame" @dblclick="screenPreview.toggleScreenFrameZoom" @touchend="screenPreview.handleFrameTouchEnd" />
```

with:

```vue
    <ScreenFrameModal ref="frameModalRef" :modal-open="frameModalOpen" :frame-url="frameUrl" :close-align-right="closeAlignRight" @close="closeFrame" />
```

- [ ] **Step 5: Run the smoke test**

Run:

```bash
node scripts/test-panzoom-viewer.js
```

Expected: still FAIL only if CSS still lacks PhotoSwipe overrides or still includes obsolete stage styles.

- [ ] **Step 6: Commit modal and app wiring changes**

Run:

```bash
git add frontend/src/components/ScreenFrameModal.vue frontend/src/components/RemoteInputApp.vue
git commit -m "refactor: simplify screen frame modal shell"
```

Expected: commit succeeds.

---

### Task 5: Update viewer styles for PhotoSwipe and keep sliding close button

**Files:**
- Modify: `frontend/src/styles.css:166-178`

- [ ] **Step 1: Replace the custom viewer style block**

In `frontend/src/styles.css`, replace:

```css
.modal { position: fixed; inset: 0; z-index: 100; display: grid; place-items: stretch; padding: 0; background: var(--surface-dark); }
.modal-backdrop { position: absolute; inset: 0; background: color-mix(in srgb, var(--surface-dark) 72%, transparent); backdrop-filter: blur(10px); }
.modal-card { position: relative; width: min(680px, 100%); max-height: min(86vh, 720px); overflow: auto; background: var(--card); border: 1px solid var(--border); border-radius: 24px; padding: 16px; box-shadow: 0 22px 70px var(--shadow); }
.screen-frame-card { width: 100vw; height: 100dvh; max-height: none; overflow: hidden; display: grid; padding: max(6px, env(safe-area-inset-top)) max(6px, env(safe-area-inset-right)) max(6px, env(safe-area-inset-bottom)) max(6px, env(safe-area-inset-left)); border-radius: 0; }
.screen-frame-close { position: absolute; top: max(8px, env(safe-area-inset-top)); left: max(8px, env(safe-area-inset-left)); z-index: 40; display: flex; align-items: center; justify-content: center; width: 36px; min-width: 36px; height: 36px; min-height: 36px; padding: 0; border: 1px solid rgba(148, 163, 184, 0.35); border-radius: 999px; font-size: 0; color: #e2e8f0; background: rgba(15, 23, 42, 0.78); backdrop-filter: blur(8px); box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35); transition: left 280ms cubic-bezier(0.22, 0.61, 0.36, 1), background 160ms ease, transform 160ms ease; }
.screen-frame-close::before, .screen-frame-close::after { content: ""; position: absolute; top: 50%; left: 50%; width: 14px; height: 1.8px; border-radius: 2px; background: currentColor; }
.screen-frame-close::before { transform: translate(-50%, -50%) rotate(45deg); }
.screen-frame-close::after { transform: translate(-50%, -50%) rotate(-45deg); }
.screen-frame-close.align-right { left: calc(100% - 36px - max(8px, env(safe-area-inset-right))); }
.screen-frame-viewport { min-height: 0; overflow: hidden; border: 1px solid var(--border); border-radius: 12px; background: #020617; touch-action: none; overscroll-behavior: contain; }
.screen-frame-stage { position: relative; width: 100%; height: 100%; margin: 0 auto; display: flex; align-items: center; justify-content: center; transform-origin: 0 0; cursor: grab; }
.screen-frame-stage:active { cursor: grabbing; }
.screen-frame-stage img { max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain; display: block; user-select: none; -webkit-user-select: none; -webkit-user-drag: none; -webkit-touch-callout: none; pointer-events: none; }
```

with:

```css
.modal { position: fixed; inset: 0; z-index: 100; display: grid; place-items: stretch; padding: 0; background: var(--surface-dark); }
.modal-backdrop { position: absolute; inset: 0; background: color-mix(in srgb, var(--surface-dark) 72%, transparent); backdrop-filter: blur(10px); }
.modal-card { position: relative; width: min(680px, 100%); max-height: min(86vh, 720px); overflow: auto; background: var(--card); border: 1px solid var(--border); border-radius: 24px; padding: 16px; box-shadow: 0 22px 70px var(--shadow); }
.screen-frame-modal { background: transparent; pointer-events: none; }
.screen-frame-card { position: fixed; inset: 0; z-index: 2000; width: 100vw; height: 100dvh; pointer-events: none; }
.screen-frame-close { position: absolute; top: max(8px, env(safe-area-inset-top)); left: max(8px, env(safe-area-inset-left)); z-index: 2100; display: flex; align-items: center; justify-content: center; width: 36px; min-width: 36px; height: 36px; min-height: 36px; padding: 0; border: 1px solid rgba(148, 163, 184, 0.35); border-radius: 999px; font-size: 0; color: #e2e8f0; background: rgba(15, 23, 42, 0.78); backdrop-filter: blur(8px); box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35); pointer-events: auto; transition: left 280ms cubic-bezier(0.22, 0.61, 0.36, 1), background 160ms ease, transform 160ms ease; }
.screen-frame-close::before, .screen-frame-close::after { content: ""; position: absolute; top: 50%; left: 50%; width: 14px; height: 1.8px; border-radius: 2px; background: currentColor; }
.screen-frame-close::before { transform: translate(-50%, -50%) rotate(45deg); }
.screen-frame-close::after { transform: translate(-50%, -50%) rotate(-45deg); }
.screen-frame-close.align-right { left: calc(100% - 36px - max(8px, env(safe-area-inset-right))); }
.pswp { --pswp-bg: #020617; z-index: 1500; }
.pswp__button--close, .pswp__counter { display: none; }
```

- [ ] **Step 2: Run the smoke test**

Run:

```bash
node scripts/test-panzoom-viewer.js
```

Expected: PASS with `PASS: PhotoSwipe viewer static integration checks passed`.

- [ ] **Step 3: Search for removed custom viewer symbols**

Run:

```bash
rg "initScreenFramePanzoom|destroyScreenFramePanzoom|toggleScreenFrameZoom|handleFrameTouchEnd|screenFramePanzoom|screen-frame-stage|screen-frame-viewport" frontend/src scripts/test-panzoom-viewer.js
```

Expected: no output.

- [ ] **Step 4: Commit style changes**

Run:

```bash
git add frontend/src/styles.css
git commit -m "style: layer custom close button over PhotoSwipe"
```

Expected: commit succeeds.

---

### Task 6: Build, update tracked dist assets, and run verification

**Files:**
- Modify if generated by build: `app/static/dist/**`
- Read-only verification: `tests/test_static_frontend.py`

- [ ] **Step 1: Build the frontend**

Run:

```bash
cd frontend && pnpm build
```

Expected: Vite build succeeds and writes updated assets under `app/static/dist/` or the configured build output.

- [ ] **Step 2: Run the PhotoSwipe smoke test**

Run:

```bash
node scripts/test-panzoom-viewer.js
```

Expected: PASS with `PASS: PhotoSwipe viewer static integration checks passed`.

- [ ] **Step 3: Run static frontend tests**

Run:

```bash
python -X utf8 -m pytest tests/test_static_frontend.py -q
```

Expected: all tests pass.

- [ ] **Step 4: Search for stale Panzoom references in source and tests**

Run:

```bash
rg "Panzoom|panzoom|initScreenFramePanzoom|destroyScreenFramePanzoom|toggleScreenFrameZoom|handleFrameTouchEnd|screen-frame-stage|screen-frame-viewport" frontend/src frontend/index.html app/static/sw.js scripts tests
```

Expected: no output except acceptable references inside this plan or historical docs are outside the searched paths and should not appear.

- [ ] **Step 5: Inspect working tree**

Run:

```bash
git status --short
```

Expected: only intended files are changed, including generated dist assets if `pnpm build` updates them.

- [ ] **Step 6: Commit verification/build changes**

Run:

```bash
git add frontend app/static scripts tests
git commit -m "feat: replace screen frame viewer with PhotoSwipe"
```

Expected: commit succeeds. If `tests/` has no changes, `git add tests` is harmless.

---

### Task 7: Runtime verification and service restart

**Files:**
- No source changes expected.

- [ ] **Step 1: Start or restart the app using the project’s existing command**

If the service is already running, restart it so frontend and service-worker changes take effect. Use the project’s established local startup path, or run the existing BAT script if that is how this checkout is being served.

Expected: the app is reachable in the browser at its normal local URL.

- [ ] **Step 2: Verify the viewer flow manually**

In the browser:

1. Log in if required.
2. Enable screen preview.
3. Tap/click the inline screen preview.
4. Confirm the screenshot opens in a PhotoSwipe fullscreen viewer.
5. Confirm wheel zoom or pinch zoom works.
6. Confirm drag/pan works while zoomed.
7. Confirm the custom circular close button is visible above the image.
8. Confirm tapping the custom close button closes the viewer and returns to the main UI.

Expected: all checks pass.

- [ ] **Step 3: Verify close button movement where supported**

On a device/browser that grants device orientation:

1. Open the PhotoSwipe viewer.
2. Tilt left and right enough to trigger the existing `gamma` threshold.
3. Confirm the custom close button slides between left and right.

Expected: close button movement still works. If the desktop browser cannot provide device orientation, record this as not locally verifiable rather than as a failure.

- [ ] **Step 4: Final status check**

Run:

```bash
git status --short
```

Expected: clean working tree after commits, or only intentional uncommitted runtime/local files that should be reported.

---

## Self-Review

Spec coverage:

- PhotoSwipe 5 dependency and bundling: Tasks 2 and 3.
- Preserve preview card click-to-open: Tasks 3 and 4 keep `openFrame()` and the existing preview card event.
- Preserve sliding close button: Tasks 4, 5, and 7.
- Preserve `/api/screen/frame?ts=...`: Task 3 keeps `refreshScreenFrame()` and passes `frameUrl.value` to PhotoSwipe.
- Remove Panzoom custom viewer logic: Tasks 3, 4, 5, and 6 stale-symbol search.
- No backend API changes: no backend source files are modified.
- Error handling: Task 3 `try/catch` logs `[screen-frame:photoswipe]`, resets modal state, stops orientation, and exits fullscreen.
- Verification: Tasks 6 and 7.

Placeholder scan: no `TBD`, `TODO`, or incomplete implementation placeholders are intentionally left in this plan.

Type/name consistency: the plan consistently uses `screenFramePhotoSwipe`, `openScreenFramePhotoSwipe`, `destroyScreenFramePhotoSwipe`, `syncScreenFrameClosedFromPhotoSwipe`, `frameModalOpen`, `frameUrl`, and `closeAlignRight`.
