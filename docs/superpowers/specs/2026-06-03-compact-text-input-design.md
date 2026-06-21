# Compact Text Input Design

## Goal

Make the text input area take less vertical space by default while keeping multi-line input available on demand.

## Current State

The control page has a text input card with `textarea#textInput` set to 4 rows and a CSS minimum height of 96px. Pressing Enter in the textarea currently sends the text immediately, so there is no normal in-field newline behavior.

## Design

The text input card will default to a compact single-line layout:

- Keep the existing `textarea#textInput`, but render it visually as a single-line field by default.
- Add a newline button on the right side of the input row.
- Pressing Enter while the input is in single-line mode sends the text, matching the current quick-send behavior.
- Clicking the newline button inserts `\n` at the current cursor position.
- After the newline button is clicked, the textarea enters an expanded multi-line state and smoothly grows in height.
- While expanded, pressing Enter inserts another newline instead of sending text.
- Sending text clears the textarea and returns it to the compact single-line state.

## Layout

The label stays above the text input area. The textarea and newline button sit in one horizontal row. The newline button is narrow and visually secondary so the main input remains dominant.

The existing send and clipboard buttons remain below the input row. The “发送文本后自动按 Enter” checkbox keeps its current behavior and is independent of the new newline button.

## State and Behavior

A small frontend-only state tracks whether the text input is expanded. The expanded state is represented in DOM/CSS by a class on the textarea or its wrapper.

Rules:

1. Initial state: compact single-line.
2. Single-line Enter: prevent default and send text.
3. Newline button click: insert newline at selection/cursor, switch to expanded, focus textarea.
4. Expanded Enter: allow browser default newline insertion.
5. Send text: send existing text logic, clear textarea, collapse to single-line.

## Styling

The compact textarea height should align with the existing button height, reducing the card height. The expanded height should be enough for multi-line text without restoring the old overly tall default. The transition should animate height/max-height smoothly.

## Testing

Manual checks:

- Default page shows a shorter text input card.
- Typing text and pressing Enter in compact mode sends and clears text.
- Clicking newline inserts a line break and expands the input smoothly.
- In expanded mode, pressing Enter adds line breaks and does not send.
- Clicking “发送文本” sends the multi-line content, clears the field, and collapses it.
- “发送文本后自动按 Enter” still sends an Enter key after text send when checked.
