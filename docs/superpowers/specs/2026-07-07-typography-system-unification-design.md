# Typography System Unification Design

Date: 2026-07-07

## Goal

Unify typography across the web-inputer interface so app-owned CSS and Naive UI components share one readable, modern system font stack and consistent size, weight, and line-height tokens.

## Scope

- Update app typography tokens in `frontend/src/styles.css`.
- Replace scattered app CSS typography values with named variables.
- Sync Naive UI typography through `themeOverrides.common` in `frontend/src/App.vue`.
- Update the legacy static fallback stylesheet `app/static/styles.css` to use the same font family.
- Do not hand-edit generated build assets under `app/static/dist`.
- Do not add external web fonts or network-loaded font resources.

## Typography direction

Use a system UI font stack that works well on Windows, macOS, iOS, and Android:

```css
-apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei UI", "Microsoft YaHei", sans-serif
```

This keeps the app fast and offline-friendly while improving Chinese text rendering on Windows through Microsoft YaHei fallbacks.

## Design tokens

Add typography variables in `frontend/src/styles.css` under `:root`:

- `--font-family-base`: shared app font stack.
- `--font-size-title`: primary page title.
- `--font-size-title-mobile`: small-screen title override.
- `--font-size-section`: section headings.
- `--font-size-base`: normal body/control text.
- `--font-size-control`: emphasized control text.
- `--font-size-small`: hints, subtitles, and compact labels.
- `--font-size-key-pop`: keyboard popover feedback.
- `--font-weight-medium`: standard strong control text.
- `--font-weight-strong`: high-emphasis labels and titles.
- `--line-height-base`: normal readable text.
- `--line-height-tight`: dense controls.
- `--line-height-control`: fixed-height input/control alignment.

## CSS changes

In `frontend/src/styles.css`:

- Set `body` to `font-family: var(--font-family-base)` and `font-size: var(--font-size-base)`.
- Keep `button, textarea, input { font: inherit; }` so native elements inherit the app typography.
- Convert existing hard-coded typography in headings, hints, text input, sync button, screen toggles, section toggles, keyboard/touch buttons, key bubble, power card, subtitle, modal title, and slide confirmation to variables.
- Preserve intentional layout-specific values such as fixed heights, spacing, and close-button `font-size: 0`.
- Preserve the mobile title adjustment by using `var(--font-size-title-mobile)` inside the existing media query.

## Naive UI integration

In `frontend/src/App.vue`, extend both light and dark `themeOverrides.common` with matching typography values:

- `fontFamily`
- `fontSize`
- `fontSizeMedium`
- `fontSizeLarge`
- `fontSizeHuge`
- `lineHeight`
- `fontWeightStrong`

The values should mirror the CSS token scale so Naive UI buttons, inputs, cards, modals, and messages feel consistent with app-owned controls.

## Static fallback

In `app/static/styles.css`, update the fallback `html, body` font stack to match `--font-family-base`. This keeps the non-built static page aligned without changing generated build output.

## Error handling and risk

This is a presentation-layer change only. The main risks are visual regressions from altered text metrics, especially on small screens and dense keyboard controls. Mitigate by keeping the current numeric scale close to existing values and verifying the built app.

## Verification

Run the existing frontend build command from `frontend` using `pnpm`. Then, if practical, launch the app and inspect these areas:

- Page title and top metrics.
- Text input and newline button.
- Sync and action buttons.
- Screen/touch section toggles.
- Keyboard rows and key popover.
- Power card and confirmation modal.

Success means the build passes and typography appears consistent without clipping or obvious layout shifts.
