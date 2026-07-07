# Key Reorder Design

Date: 2026-07-07

## Goal

Reorder the virtual keyboard's control keys so the visible order is:

`Esc`, `Tab`, `退格`, `Enter`, `Shift`, `Ctrl`, `Win`, `Alt`.

The change should preserve existing keyboard behavior: one-shot function keys still send tap events, modifier keys still toggle their locked state, and the backend input payloads remain unchanged.

## Current Behavior

`frontend/src/components/KeyboardCard.vue` currently renders two separate four-key rows:

- Modifier row: `Ctrl`, `Win`, `Alt`, `Shift`
- Function row: `Esc`, `Tab`, `退格`, `Enter`

The bottom space row also contains `Fn`, `空格`, and `Enter`. This design does not change the bottom row unless implementation reveals it is coupled to the top-row layout.

## Recommended Approach

Use one ordered key list for the requested sequence and render each key according to its type:

- `esc`, `tab`, `backspace`, `enter` use the existing tap behavior.
- `shift`, `ctrl`, `win`, `alt` use the existing modifier toggle behavior and active/locked styling.

This keeps the UI order explicit while avoiding changes to backend input handling.

## Alternatives Considered

1. **Only swap the existing two arrays**: put function keys above modifiers and reorder modifiers. This is minimal, but it still leaves two separate rows and does not express the requested sequence as one continuous ordering.
2. **Use a single mixed row/list**: render keys from the requested order and branch by modifier status. This is clearer and reduces duplicated layout assumptions. This is the recommended approach.
3. **Change backend key definitions too**: unnecessary because the current payload keys already support all requested keys.

## Components and Data Flow

- Component: `frontend/src/components/KeyboardCard.vue`
- Data: a new or updated ordered array defines the requested key order.
- UI: buttons are rendered in that order.
- Events:
  - Tap keys emit `tap` with the same key names as before.
  - Modifier keys emit `toggle-modifier` with the same key names as before.

## Error Handling

No new runtime error paths are expected. The implementation should preserve existing safeguards such as key bubble rendering and vibration feedback.

## Testing and Verification

Run the existing frontend build command:

```powershell
pnpm --dir frontend build
```

Then inspect the changed component or built app to confirm the order is exactly:

`Esc`, `Tab`, `退格`, `Enter`, `Shift`, `Ctrl`, `Win`, `Alt`.

## Scope

In scope:

- Reorder the visible control keys in the keyboard card.
- Preserve modifier locked-state styling.
- Preserve key labels and emitted key names.

Out of scope:

- Backend input injection changes.
- New keyboard keys.
- Broad visual redesign.
- Removing the existing bottom-row Enter key unless separately requested.
