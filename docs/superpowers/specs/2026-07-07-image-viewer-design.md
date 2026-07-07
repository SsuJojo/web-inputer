# PhotoSwipe Screen Image Viewer Design

## Goal

Replace the current hand-written fullscreen screen image viewer with PhotoSwipe 5 while keeping the existing sliding close button behavior.

The change should make fullscreen screen-image viewing feel more polished on mobile and desktop by delegating image zoom, pan, drag, wheel, and touch gestures to a mature viewer library. The project still owns the close button, fullscreen lifecycle, and orientation-based close-button placement.

## Scope

In scope:

- Use PhotoSwipe 5 for the fullscreen screen image presentation.
- Keep the existing preview card and its click-to-open behavior.
- Keep the existing project-owned sliding close button:
  - `.screen-frame-close`
  - `.screen-frame-close.align-right`
  - `closeAlignRight`
  - orientation-based left/right placement.
- Preserve the existing `/api/screen/frame?ts=...` single-frame refresh path.
- Remove the custom Panzoom-driven fullscreen viewer logic that is replaced by PhotoSwipe.
- Keep implementation local to the frontend; no backend API change is required.

Out of scope:

- Replacing the live inline screen preview stream.
- Supporting galleries or multiple screen images.
- Redesigning the whole remote-control layout.
- Changing cursor polling or touchpad behavior.
- Adding external runtime CDN dependencies.

## Current System Summary

The Vue frontend currently renders fullscreen screen capture through:

- `frontend/src/components/ScreenFrameModal.vue`
- `frontend/src/composables/useScreenPreview.js`
- fullscreen styles in `frontend/src/styles.css`

The viewer owns its own modal, backdrop, viewport, stage, image, double-click/double-tap zoom, wheel handling, and Panzoom lifecycle. The close button is separate from the image stage and can slide between the left and right side based on device orientation.

## Library Choice

Use `photoswipe` version 5 from npm through the existing Vite frontend pipeline.

Reasoning:

- PhotoSwipe is focused on image viewing rather than generic transforms.
- It handles mobile gestures, wheel/pinch zoom, drag, and fit-to-screen behavior better than a small custom viewer.
- It supports programmatic opening for a single dynamic image.
- Its UI can be customized enough for the project to keep its own close button.

Do not use a runtime CDN. The package should be installed as a frontend dependency and bundled by Vite.

## Component Design

### `ScreenFrameModal.vue`

Keep `ScreenFrameModal.vue` as the project-owned overlay shell.

It should still expose `modalRef` if needed by fullscreen handling, and it should still receive:

- `modalOpen`
- `frameUrl`
- `closeAlignRight`

It should no longer render the custom Panzoom viewport/stage as the source of zoom behavior. Instead, it should provide a stable container/overlay for:

- the PhotoSwipe root/UI layer managed by JavaScript, and
- the existing close button above PhotoSwipe.

The close button remains a normal Vue-rendered button so its styling and sliding behavior stay under project control.

### `useScreenPreview.js`

`useScreenPreview.js` continues to own the screen-frame lifecycle:

1. Open viewer.
2. Refresh `frameUrl` with a timestamp.
3. Request fullscreen where supported.
4. Start orientation monitoring.
5. Initialize and open PhotoSwipe with the current `frameUrl`.
6. Clean up PhotoSwipe, fullscreen, and orientation listeners on close.

Remove the replaced hand-written viewer state:

- `screenFramePanzoom`
- `screenFrameWheelHandler`
- `screenFrameZoomed`
- `screenFrameLastTapAt`
- `initScreenFramePanzoom`
- `destroyScreenFramePanzoom`
- `toggleScreenFrameZoom`
- `handleFrameTouchEnd`
- custom wheel/touch zoom paths.

Add PhotoSwipe lifecycle state instead, for example a single `screenFramePhotoSwipe` instance reference.

PhotoSwipe close events must synchronize back to Vue state so closing by PhotoSwipe gestures or escape key does not leave `frameModalOpen` stuck as `true`.

## Data Flow

Opening flow:

1. User taps the inline `.screen-preview` area.
2. `RemoteInputApp.vue` calls `openFrame()`.
3. `openFrame()` calls `screenPreview.openScreenFrame(...)`.
4. `openScreenFrame()` sets `frameModalOpen = true`, moves close button left, refreshes `frameUrl`, requests fullscreen, starts orientation handling, and opens PhotoSwipe.
5. PhotoSwipe renders the current `/api/screen/frame?ts=...` image and handles image gestures.

Closing flow:

1. User taps the preserved close button, presses Escape, or triggers a PhotoSwipe close path.
2. The app destroys/closes the active PhotoSwipe instance.
3. `frameModalOpen = false`.
4. Orientation handling stops.
5. Fullscreen exits.
6. Cursor polling cleanup remains unchanged.

## Styling Design

Keep these styles and behavior:

- `.screen-frame-close`
- `.screen-frame-close::before`
- `.screen-frame-close::after`
- `.screen-frame-close.align-right`

The close button should stay above the PhotoSwipe layer with a higher `z-index` than PhotoSwipe controls.

Adapt or remove styles that only existed for the custom viewer:

- `.screen-frame-viewport`
- `.screen-frame-stage`
- `.screen-frame-stage img`

PhotoSwipe CSS should be imported through the frontend entry or component logic in the way recommended for Vite. Project overrides should be minimal and limited to layering, background, and hiding PhotoSwipe UI elements that conflict with the custom close button.

## Error Handling

If PhotoSwipe fails to initialize or the image cannot be opened:

- Do not crash the app.
- Keep the inline screen preview usable.
- Close the frame modal state if the full viewer cannot open.
- Log a concise debug message consistent with the existing `console.debug('[screen-frame:...]', error)` pattern.

If fullscreen request fails, keep existing behavior: log debug output and continue with PhotoSwipe in the browser viewport.

If orientation permission is unavailable or denied, keep the close button on the left and continue normally.

## Testing and Verification

Implementation should be verified with:

- `pnpm build` from `frontend/`.
- Existing Python/static tests if relevant to the changed frontend surface.
- A runtime check of the affected flow where practical:
  - enable screen preview,
  - tap the inline preview,
  - confirm PhotoSwipe opens the screenshot fullscreen,
  - confirm pinch/wheel/drag or equivalent zoom behavior works,
  - confirm the custom close button remains visible,
  - confirm the close button can still move left/right through the existing orientation path where device support allows,
  - confirm close returns to the main UI cleanly.

## Acceptance Criteria

- Fullscreen image display is powered by PhotoSwipe 5, not the project’s custom Panzoom screen-frame implementation.
- The existing sliding close button remains visually and functionally present.
- Opening and closing the viewer does not leave stale fullscreen, PhotoSwipe, or orientation listeners.
- The inline screen preview remains unchanged.
- Build/tests pass or any verification limitation is explicitly reported.
