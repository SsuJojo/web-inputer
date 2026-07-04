# Panzoom Screen Viewer and Cursor Authority State Machine Design

## Goal

Improve the fullscreen screen-image viewing experience and reduce mouse cursor stutter during remote control.

This change keeps the existing fullscreen modal and project-owned close `X`, replaces the current manual image zoom behavior with `@panzoom/panzoom`, and introduces a two-state cursor authority state machine.

## Scope

In scope:

- Keep the existing fullscreen screen modal structure and close button.
- Add a modern pan/zoom interaction layer for the fullscreen screen image.
- Support touch pinch zoom, dragging, mouse wheel zoom, and double-click or double-tap zoom.
- Preserve the orientation-aware close `X` behavior where practical.
- Add cursor authority states:
  - `web-remote-control`
  - `physical-mouse-active`
- Coalesce high-frequency mouse move events before sending them over WebSocket.
- Add lightweight input metadata and WebSocket ack echo for mouse event sequencing.

Out of scope for this pass:

- Replacing the whole viewer with a gallery/lightbox system.
- Supporting multiple monitors beyond the current primary-monitor behavior.
- Full cursor icon endpoint split unless needed after the state machine work.
- Full redesign of the remote-control touchpad gestures.

## Current System Summary

The app currently has a custom fullscreen screen-frame modal in `app/static/index.html` with:

- `#screenFrameModal`
- `#screenFrameBackdrop`
- `#screenFrameClose`
- `#screenFrameViewport`
- `#screenFrameStage`
- `#screenFrameImage`

`app/static/app.js` implements zoom manually with a `screenFrameZoom` number, scroll anchoring, wheel handling, and pinch handling.

The remote cursor currently mixes:

- frontend predicted cursor overlay, and
- server-polled real cursor position from `/api/screen/cursor`.

During remote movement, the server cursor can pull the predicted cursor back too aggressively, causing visible stutter or jumps.

## Viewer Design

Use `@panzoom/panzoom` for the image transform layer inside the existing modal.

### DOM Ownership

Keep the existing modal and close button. The project continues to own:

- modal open/close lifecycle,
- fullscreen request/exit,
- close `X`,
- backdrop behavior,
- screen frame refresh URL,
- orientation-based close-button placement.

Panzoom only owns pan and zoom transforms for `#screenFrameImage` or an immediate transform wrapper inside `#screenFrameStage`.

### Interactions

Required interactions:

- Touch pinch zoom.
- Drag/pan while zoomed.
- Mouse wheel zoom.
- Double-click zoom toggle.
- Double-tap zoom toggle on touch devices.
- Reset transform when opening a new viewer session unless the existing saved zoom behavior is deliberately preserved.

The default implementation should prefer predictable behavior:

- open at fit-to-screen / scale 1,
- double tap/click toggles between scale 1 and a comfortable zoom level such as 2,
- close destroys or resets the Panzoom instance,
- wheel events are scoped to the viewer so the page behind it does not scroll.

### CSS

The viewer viewport should prevent browser-native page gestures from fighting with Panzoom.

Expected CSS direction:

- keep modal fullscreen styles,
- set viewer interaction area to `touch-action: none` where Panzoom handles gestures,
- avoid page scroll bleed while modal is open,
- keep the close `X` above the Panzoom layer.

### Library Integration

Use the package `@panzoom/panzoom`.

If the project has no frontend package pipeline, use a browser-compatible distribution path that fits the current static app. The implementation agent must inspect the current project packaging before choosing between local vendoring, npm dependency, or CDN-style static asset. Prefer a local dependency/static asset over external runtime CDN.

## Cursor Authority State Machine

### States

```js
const CursorAuthority = {
  WEB_REMOTE: 'web-remote-control',
  PHYSICAL: 'physical-mouse-active',
};
```

### State Meaning

`web-remote-control`:

- The web UI is actively controlling the remote cursor.
- Frontend predicted virtual cursor is treated as the visual authority.
- Server cursor polling is used for calibration and eventual convergence, not immediate hard sync.

`physical-mouse-active`:

- The physical system mouse appears to be actively moving outside the web remote-control path.
- The frontend virtual cursor follows the server-reported real cursor.
- Any new web touchpad/mouse remote input immediately switches back to `web-remote-control`.

### Transition Rules

Enter `web-remote-control` when the web UI sends a remote mouse intent:

- touchpad movement,
- button drag movement,
- edge-scroll movement,
- explicit mouse move action.

On entry:

- record `lastRemoteInputAt`,
- set a short remote lock window,
- set a short server-sync suppression window,
- predict the virtual cursor immediately.

Enter `physical-mouse-active` when polling detects server cursor movement that cannot be explained by recent web remote input:

- server cursor delta is larger than a threshold,
- not inside the remote lock/suppression window,
- not similar enough to recent accumulated remote movement.

### Feedback Loop Prevention

The state machine must prevent this loop:

1. frontend sends remote `mouse_move`,
2. backend moves the real cursor,
3. cursor polling observes the real movement,
4. frontend mistakes it for physical mouse movement,
5. frontend hard-syncs virtual cursor backward.

Prevention mechanisms:

- remote lock window after web input,
- server-sync suppression window after web input,
- recent remote movement ledger,
- sequence metadata on mouse move messages,
- ack echo from backend.

## Mouse Move Coalescing

High-frequency pointer movement should be merged before WebSocket send.

Design:

- Accumulate relative `dx/dy`.
- Flush at most once per animation frame.
- Use the existing `moveMouse(dx, dy)` path after coalescing so prediction and state transitions stay centralized.

Apply coalescing to:

- touchpad pointer movement,
- mouse-button drag movement,
- edge-scroll generated movement if compatible.

Do not coalesce across ordered button events such as `mouse_down`, `mouse_up`, `mouse_click`, or wheel events.

## WebSocket Metadata

Frontend input messages for mouse moves should include:

```json
{
  "type": "input",
  "id": 123,
  "action": "mouse_move",
  "x": 5,
  "y": -2,
  "source": "web-remote-control",
  "seq": 88,
  "clientTs": 1780000000000
}
```

Backend acks should echo metadata:

```json
{
  "type": "ack",
  "id": 123,
  "seq": 88,
  "source": "web-remote-control",
  "serverTs": 1780000000050
}
```

This does not need to change input execution semantics. It exists so the frontend can correlate recent remote input with later cursor polling.

## Backend Responsibilities

Minimum backend changes:

- Echo `seq`, `source`, and `serverTs` in input ack messages.
- Optionally store `source`, `seq`, and `client_ts` on `InputEvent` for debugging and future coalescing.

Optional backend changes if stutter remains:

- Coalesce consecutive queued `mouse_move` events in `InputController` without crossing ordered events.
- Add a lightweight cursor-position-only endpoint to reduce `/api/screen/cursor` icon capture overhead.
- Make server-side cursor embedding in screen frames configurable to avoid double-cursor visuals.

## Files Expected to Change

Likely files:

- `app/static/app.js`
  - viewer lifecycle,
  - Panzoom integration,
  - double-click/tap zoom,
  - cursor authority state machine,
  - mouse move coalescing,
  - ack handling.

- `app/static/styles.css`
  - Panzoom-friendly viewer interaction styles,
  - close `X` layering,
  - modal touch-action updates.

- `app/static/index.html`
  - only if Panzoom needs a transform wrapper or script asset.

- `app/main.py`
  - input ack metadata echo.

- `app/input_controller.py`
  - optional metadata fields and optional move coalescing.

- dependency or vendored asset files if the selected integration path requires them.

## Testing and Verification

Automated checks:

- Run existing project tests if present.
- Run syntax checks for Python files touched.
- Run any frontend lint/build command if present.

Manual verification:

1. Open the app.
2. Open screen preview fullscreen viewer.
3. Confirm close `X` remains visible and closes the viewer.
4. Confirm pinch zoom works on touch device or emulation.
5. Confirm drag/pan works while zoomed.
6. Confirm wheel zoom works on desktop.
7. Confirm double-click or double-tap toggles zoom.
8. Confirm remote touchpad cursor movement feels smoother and does not repeatedly snap backward.
9. Move the real physical mouse and confirm the virtual cursor follows it.
10. Return to web touchpad movement and confirm authority switches back to web remote control.

## Implementation Notes for Subagents

- Keep changes focused. Do not redesign unrelated UI.
- Match existing vanilla JavaScript style.
- Avoid adding unnecessary comments or docstrings.
- Prefer local/static dependency integration over runtime CDN.
- Do not remove existing close `X` behavior.
- Treat cursor state transitions as the central behavior; avoid scattered ad hoc fixes.
