# Vue + Naive UI page refactor design

Date: 2026-07-06

## Goal

Refactor the current static mobile remote-input page into a Vue 3 application built with pnpm and Vite, using the same UI library style as the `AI-Interview` frontend: Naive UI. The backend remains FastAPI and keeps the current HTTP and WebSocket contract.

## Current context

`web-inputer` currently serves `app/static/index.html`, `app/static/app.js`, and `app/static/styles.css` directly from FastAPI. The page includes login, WebSocket status, screen preview with cursor overlay, text/clipboard input, touchpad, keyboard controls, settings, and power controls.

`AI-Interview/frontend/package.json` uses pnpm, Vue 3, Vite, and `naive-ui`, so this refactor should follow that stack.

## Recommended approach

Use a dedicated frontend source directory and keep FastAPI as the deployment boundary:

- Add `frontend/` with Vue 3 + Vite + pnpm.
- Use JavaScript Vue SFCs rather than TypeScript to avoid introducing a TypeScript migration and to respect the current no-build JS style.
- Use Naive UI providers, buttons, inputs, modals, switches, sliders, cards, and status components where they help.
- Preserve custom CSS for the remote-control surfaces where generic UI components would hurt touch behavior.
- Build the app into `app/static/dist` and make FastAPI serve the built entry while retaining `/static/vendor/panzoom.min.js`, manifest, and service worker support.

This is better than rewriting everything into plain Vue without a build boundary because it gives maintainable components while keeping the server and deployment shape stable. It is also better than moving to a separate frontend server in production because the app is used through Cloudflare/local direct access and should remain a single FastAPI service.

## Architecture

### Backend serving

FastAPI continues to expose all existing APIs:

- `POST /api/login`
- `POST /api/logout`
- `GET /api/session`
- `GET /api/direct-probe`
- `GET /api/screen/*`
- `POST /api/power/*`
- `WS /ws`

The `/` route should serve the Vite-built HTML when present. It still injects `window.PUBLIC_ORIGIN` before the app script. Static assets remain under `/static`.

### Frontend source layout

Proposed layout:

```text
frontend/
  index.html
  package.json
  pnpm-lock.yaml
  vite.config.mjs
  src/
    main.js
    App.vue
    styles.css
    api/
      http.js
      websocket.js
    composables/
      useSettings.js
      useSession.js
      useRemoteSocket.js
      useScreenPreview.js
      useCursorSync.js
      usePowerControl.js
      useTouchpad.js
    components/
      LoginCard.vue
      StatusHeader.vue
      ScreenPreviewCard.vue
      TextInputCard.vue
      TouchpadCard.vue
      KeyboardCard.vue
      SettingsModal.vue
      PowerControlCard.vue
      PowerActionModal.vue
      ScreenFrameModal.vue
```

The exact split can be adjusted during implementation, but the important boundary is that network/session/socket logic lives in composables and touch/UI sections live in components.

## Data flow

1. App startup loads local settings, probes saved direct mode, then checks `/api/session`.
2. If authenticated, the app opens `/ws` and sends the existing `claim`, `ping`, `input`, and `window` messages.
3. Components call composables instead of directly touching global DOM elements.
4. Cursor state remains client-side and keeps the current authority model: web remote input vs physical mouse movement.
5. Power actions continue to call the same REST endpoints and use the same confirmation semantics already enforced by the backend.

## UI design

The page remains mobile-first and dark by default. Naive UI should provide the base interaction pieces, while custom CSS preserves the distinctive remote-control feel:

- Top status area: compact connected/disconnected state, latency, settings/logout actions.
- Screen preview: sticky card, desktop switch buttons, preview toggle, window title marquee, and full-screen frame modal.
- Text input: compact one-line input that expands for multiline text, plus send and clipboard actions.
- Touchpad: collapsible touch area with left/middle/right controls and wheel gesture surface.
- Keyboard: custom key grid remains custom because Naive UI buttons alone would not capture the keyboard layout well.
- Power: bottom card with collapsible actions and modal picker for immediate/countdown/target-time execution.

## Error handling

- Login errors preserve the current messages for rate-limit vs wrong password.
- WebSocket close/error keeps reconnect and public/direct fallback behavior.
- API failures surface through Naive UI messages where appropriate and inline text where persistent status matters.
- Screen preview and cursor polling failures are logged to the existing `/api/client-log` flow without blocking the rest of the controls.

## Testing and verification

Minimum verification:

- `pnpm install` in `frontend/`.
- `pnpm build` in `frontend/`.
- Python compile check with `python -X utf-8 -m compileall app`.
- FastAPI health check after launch.
- Browser/manual flow: login view renders, control view renders after session, WebSocket connects, screen preview toggles, text input sends, touchpad buttons emit messages, settings modal opens, power modal opens.

## Scope boundaries

This refactor does not change backend input semantics, authentication, power behavior, cursor algorithms, or Cloudflare/direct fallback policy. Any backend bug found during migration should be fixed only if it blocks the Vue page from preserving existing behavior.
