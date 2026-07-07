# Key Reorder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorder the keyboard card control keys to display `Esc`, `Tab`, `退格`, `Enter`, `Shift`, `Ctrl`, `Win`, `Alt` while preserving existing tap and modifier behavior.

**Architecture:** Keep the change isolated to `frontend/src/components/KeyboardCard.vue`. Replace the two hard-coded top control rows with a single ordered row descriptor that knows whether each key is a tap key or modifier key, then render the correct button behavior for each item.

**Tech Stack:** Vue 3 single-file component, Vite frontend, pnpm build verification.

---

## File Structure

- Modify: `frontend/src/components/KeyboardCard.vue`
  - Owns keyboard layout arrays, labels, button rendering, and emitted key events for the virtual keyboard card.
  - The change stays here because backend key names and event payloads already support all requested keys.
- No test file will be added because this project currently has no frontend unit test setup. Verification uses `pnpm --dir frontend build` plus source inspection of the rendered order in the component.

## Task 1: Reorder control key rendering

**Files:**
- Modify: `frontend/src/components/KeyboardCard.vue:18-21`
- Modify: `frontend/src/components/KeyboardCard.vue:68-74`

- [ ] **Step 1: Confirm current component state**

Read `frontend/src/components/KeyboardCard.vue` and verify these current lines exist:

```vue
const modifiers = ['ctrl', 'win', 'alt', 'shift']
const functionKeys = ['esc', 'tab', 'backspace', 'enter']
```

Expected: The component has two top rows: one rendering `modifiers`, one rendering `functionKeys`.

- [ ] **Step 2: Replace the separate key arrays with one ordered descriptor**

In `frontend/src/components/KeyboardCard.vue`, replace:

```js
const modifiers = ['ctrl', 'win', 'alt', 'shift']
const functionKeys = ['esc', 'tab', 'backspace', 'enter']
```

with:

```js
const modifierKeys = new Set(['shift', 'ctrl', 'win', 'alt'])
const controlKeys = ['esc', 'tab', 'backspace', 'enter', 'shift', 'ctrl', 'win', 'alt']
```

Expected: The requested visible order is represented in one array, and modifier membership is explicit.

- [ ] **Step 3: Replace the two top rows with one mixed control row**

In `frontend/src/components/KeyboardCard.vue`, replace this template block:

```vue
    <div class="row four">
      <button v-for="key in modifiers" :key="key" class="toggle" :class="{ active: heldKeys.has(key) }" :aria-pressed="heldKeys.has(key)" :aria-label="`${label(key)} ${heldKeys.has(key) ? '已锁定' : '未锁定'}`" @click="toggleModifier(key)"><span class="lock-icon" aria-hidden="true">{{ heldKeys.has(key) ? '🔒' : '🔓' }}</span>{{ label(key) }}<span v-if="bubbles[key]" class="key-bubble">{{ label(key) }}</span></button>
    </div>
    <div class="row four">
      <button v-for="key in functionKeys" :key="key" @click="tap(key)">{{ label(key) }}<span v-if="bubbles[key]" class="key-bubble">{{ label(key) }}</span></button>
    </div>
```

with:

```vue
    <div class="row control-row">
      <button v-for="key in controlKeys" :key="key" :class="{ toggle: modifierKeys.has(key), active: modifierKeys.has(key) && heldKeys.has(key) }" :aria-pressed="modifierKeys.has(key) ? heldKeys.has(key) : undefined" :aria-label="modifierKeys.has(key) ? `${label(key)} ${heldKeys.has(key) ? '已锁定' : '未锁定'}` : label(key)" @click="modifierKeys.has(key) ? toggleModifier(key) : tap(key)"><span v-if="modifierKeys.has(key)" class="lock-icon" aria-hidden="true">{{ heldKeys.has(key) ? '🔒' : '🔓' }}</span>{{ label(key) }}<span v-if="bubbles[key]" class="key-bubble">{{ label(key) }}</span></button>
    </div>
```

Expected: The rendered control row order is `Esc`, `Tab`, `⌫`, `Enter`, `Shift`, `Ctrl`, `Win`, `Alt`. Tap keys call `tap(key)`. Modifier keys call `toggleModifier(key)` and preserve locked styling.

- [ ] **Step 4: Verify no stale array references remain**

Run:

```powershell
rg "modifiers|functionKeys" frontend/src/components/KeyboardCard.vue
```

Expected: no output.

- [ ] **Step 5: Build the frontend**

Run:

```powershell
pnpm --dir frontend build
```

Expected: Vite build completes successfully and exits with code 0.

- [ ] **Step 6: Inspect the diff**

Run:

```powershell
git diff -- frontend/src/components/KeyboardCard.vue
```

Expected: The diff only changes the top control key arrays and top row rendering. It does not change backend code, letter rows, number/Fn rows, arrows, or the bottom `Fn / 空格 / Enter` row.

- [ ] **Step 7: Commit the implementation**

Run:

```powershell
git add frontend/src/components/KeyboardCard.vue
git commit -m "Reorder keyboard control keys"
```

Expected: One commit is created with the component change.

---

## Self-Review Notes

- Spec coverage: This plan implements the requested order, preserves existing tap/modifier key names, keeps backend input injection untouched, and leaves the bottom-row Enter in place.
- Placeholder scan: No placeholders remain.
- Type consistency: `modifierKeys` and `controlKeys` are defined before template usage; event function names match existing component functions.
