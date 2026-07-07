# MJPEG Cursor-In-Frame Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/api/screen/stream` and `/api/screen/frame` include a stable cursor inside each JPEG frame, while disabling the separate visual cursor overlay that causes flicker.

**Architecture:** Keep the current MJPEG/JPEG screenshot pipeline. Improve `ScreenPreviewer` so cursor composition is deterministic and testable, then make the browser hide the overlay cursor while still polling `/api/screen/cursor` for sync logs and prediction metrics.

**Tech Stack:** Python 3.11, FastAPI, Pillow, mss, pywin32, browser JavaScript, Node-based one-off regression tests.

---

## File Structure

- Modify `app/screen_preview.py`
  - Keep `ScreenPreviewer.capture_frame()` as the frame source.
  - Replace the fragile cursor alpha path with focused helper methods.
  - Add a small fallback cursor renderer so frames still include a visible cursor when Win32 icon extraction fails.
- Modify `app/static/app.js`
  - Disable visual overlay rendering in `positionCursor()` / `drawCursors()`.
  - Keep `updateCursor()` and related gain/logging logic unchanged.
- Create `scripts/test-screen-preview-cursor.py`
  - Verify `capture_frame()` calls cursor composition before JPEG encoding.
  - Verify fallback cursor composition changes the image at the requested cursor location.
- Modify `scripts/test-cursor-sync.js`
  - Update the test expectation so cursor sync still updates gain/state even when overlay rendering is disabled.

---

### Task 1: Add backend cursor-in-frame regression tests

**Files:**
- Create: `scripts/test-screen-preview-cursor.py`
- Modify: none
- Test: `scripts/test-screen-preview-cursor.py`

- [ ] **Step 1: Write the failing test**

Create `scripts/test-screen-preview-cursor.py` with this content:

```python
from __future__ import annotations

import io
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from PIL import Image

from app.screen_preview import ScreenPreviewer


class Settings:
    screen_preview_max_width = 0
    screen_preview_quality = 90
    screen_preview_fps = 5


class TestPreviewer(ScreenPreviewer):
    def __init__(self) -> None:
        super().__init__(Settings())
        self.draw_calls = []

    def _capture_monitor_image(self):
        return Image.new("RGB", (80, 60), "white"), {"left": 0, "top": 0, "width": 80, "height": 60}

    def draw_cursor_on_image(self, image, monitor):
        self.draw_calls.append((image.size, monitor["width"], monitor["height"]))
        image = image.copy()
        image.putpixel((10, 10), (255, 0, 0))
        return image


def test_capture_frame_composes_cursor_before_encoding():
    previewer = TestPreviewer()

    frame = previewer.capture_frame(max_width=0, quality=95)

    decoded = Image.open(io.BytesIO(frame)).convert("RGB")
    assert previewer.draw_calls == [((80, 60), 80, 60)]
    red_pixel = decoded.getpixel((10, 10))
    assert red_pixel[0] > 200
    assert red_pixel[1] < 80
    assert red_pixel[2] < 80


def test_fallback_cursor_draws_visible_arrow_shape():
    previewer = ScreenPreviewer(Settings())
    image = Image.new("RGB", (80, 60), "white")

    result = previewer.draw_fallback_cursor(image, 20, 15)

    assert result.getpixel((20, 15)) != (255, 255, 255)
    assert result.getpixel((25, 20)) != (255, 255, 255)
    assert result.getpixel((5, 5)) == (255, 255, 255)


if __name__ == "__main__":
    test_capture_frame_composes_cursor_before_encoding()
    test_fallback_cursor_draws_visible_arrow_shape()
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
.venv/Scripts/python.exe -X utf8 scripts/test-screen-preview-cursor.py
```

Expected:

```text
AttributeError: 'TestPreviewer' object has no attribute '_capture_monitor_image'
```

or:

```text
AttributeError: 'ScreenPreviewer' object has no attribute 'draw_fallback_cursor'
```

The exact first failure depends on execution order. The failure must be because the new helper methods do not exist yet, not because imports fail.

- [ ] **Step 3: Commit nothing yet**

Do not commit after the RED step.

---

### Task 2: Make backend cursor composition testable and add fallback cursor

**Files:**
- Modify: `app/screen_preview.py:13-93`
- Test: `scripts/test-screen-preview-cursor.py`

- [ ] **Step 1: Replace `capture_frame()` and add `_capture_monitor_image()`**

In `app/screen_preview.py`, replace the existing `capture_frame()` body with this implementation and add `_capture_monitor_image()` directly above it:

```python
    def _capture_monitor_image(self):
        from PIL import Image
        import mss

        with mss.mss() as sct:
            monitor = sct.monitors[1]
            screenshot = sct.grab(monitor)
            image = Image.frombytes("RGB", screenshot.size, screenshot.bgra, "raw", "BGRX")
        return image, monitor

    def capture_frame(self, max_width: int | None = None, quality: int | None = None) -> bytes:
        image, monitor = self._capture_monitor_image()
        image = self.draw_cursor_on_image(image, monitor)
        max_width = self.settings.screen_preview_max_width if max_width is None else max_width
        quality = self.settings.screen_preview_quality if quality is None else quality
        if max_width > 0 and image.width > max_width:
            height = round(image.height * max_width / image.width)
            image = image.resize((max_width, height), Image.Resampling.BILINEAR)

        buffer = io.BytesIO()
        image.save(buffer, format="JPEG", quality=quality, optimize=True)
        return buffer.getvalue()
```

Keep the existing top-level imports unchanged.

- [ ] **Step 2: Add fallback cursor renderer**

In `app/screen_preview.py`, add this method inside `ScreenPreviewer`, directly before `draw_cursor_on_image()`:

```python
    def draw_fallback_cursor(self, image, x: int, y: int):
        from PIL import ImageDraw

        result = image.copy()
        draw = ImageDraw.Draw(result)
        points = [
            (x, y),
            (x, y + 18),
            (x + 5, y + 14),
            (x + 9, y + 24),
            (x + 13, y + 22),
            (x + 9, y + 12),
            (x + 16, y + 12),
        ]
        draw.polygon(points, fill=(255, 255, 255), outline=(0, 0, 0))
        return result
```

- [ ] **Step 3: Update `draw_cursor_on_image()` to fallback on icon failures**

In `draw_cursor_on_image()`, keep the successful Win32 `DrawIconEx` path. Change the early import failure return from:

```python
        except Exception:
            return image
```

to:

```python
        except Exception:
            return image
```

Leave import failure unchanged because non-Windows environments cannot know cursor position.

Then change the inner `except Exception:` at the bottom from:

```python
        except Exception:
            logger.debug("cursor draw on frame failed", exc_info=True)
        return image
```

to:

```python
        except Exception:
            logger.debug("cursor draw on frame failed", exc_info=True)
            try:
                cursor_x, cursor_y = win32api.GetCursorPos()
                image = self.draw_fallback_cursor(image, cursor_x - monitor["left"], cursor_y - monitor["top"])
            except Exception:
                logger.debug("fallback cursor draw failed", exc_info=True)
        return image
```

- [ ] **Step 4: Run backend cursor tests**

Run:

```powershell
.venv/Scripts/python.exe -X utf8 scripts/test-screen-preview-cursor.py
```

Expected:

```text
```

No output and exit code 0.

- [ ] **Step 5: Commit backend cursor test and implementation**

Run:

```powershell
git add app/screen_preview.py scripts/test-screen-preview-cursor.py
git commit -m "fix: compose cursor into screen frames"
```

If the repository is still intentionally uncommitted initial work, skip the commit and report that commit was skipped because the worktree is fully untracked.

---

### Task 3: Disable browser visual cursor overlay while preserving sync logs

**Files:**
- Modify: `app/static/app.js:270-305`
- Modify: `scripts/test-cursor-sync.js`
- Test: `scripts/test-cursor-sync.js`

- [ ] **Step 1: Update JS regression test expectation**

In `scripts/test-cursor-sync.js`, change the exported test harness appended to `source` so `state()` includes whether the overlay cursor was made visible.

Replace:

```js
    state() { return { cursorState, cursorGainX, cursorGainY }; },
```

with:

```js
    state() {
      return {
        cursorState,
        cursorGainX,
        cursorGainY,
        screenCursorVisible: screenCursor.classList.contains('visible'),
        screenFrameCursorVisible: screenFrameCursor.classList.contains('visible'),
      };
    },
```

Then add these assertions after the existing `cursorState.rx` assertion:

```js
  assert.equal(state.screenCursorVisible, false, 'screen preview overlay cursor should stay hidden');
  assert.equal(state.screenFrameCursorVisible, false, 'screen frame overlay cursor should stay hidden');
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node scripts/test-cursor-sync.js
```

Expected:

```text
AssertionError [ERR_ASSERTION]: screen preview overlay cursor should stay hidden
```

This confirms the test catches the old overlay behavior.

- [ ] **Step 3: Replace `positionCursor()` implementation**

In `app/static/app.js`, replace the entire `positionCursor(cursor, target, image)` function with:

```js
function positionCursor(cursor) {
  cursor.classList.remove('visible');
  cursor.style.opacity = '0';
  cursor.style.display = 'none';
  return false;
}
```

This intentionally keeps `drawCursors()` callable while ensuring the browser overlay never becomes visible.

- [ ] **Step 4: Keep `drawCursors()` unchanged**

Verify `drawCursors()` remains:

```js
function drawCursors() {
  const previewVisible = positionCursor(screenCursor, screenStage, screenImage);
  const frameVisible = positionCursor(screenFrameCursor, screenFrameStage, screenFrameImage);
  return previewVisible || frameVisible;
}
```

The extra arguments are harmless in JavaScript. Keeping the call shape minimizes unrelated changes.

- [ ] **Step 5: Run JS cursor sync test**

Run:

```powershell
node scripts/test-cursor-sync.js
```

Expected:

```text
[cursor-sync] { ... }
```

Exit code must be 0.

- [ ] **Step 6: Commit frontend overlay change**

Run:

```powershell
git add app/static/app.js scripts/test-cursor-sync.js
git commit -m "fix: hide browser cursor overlay"
```

If the repository is still intentionally uncommitted initial work, skip the commit and report that commit was skipped because the worktree is fully untracked.

---

### Task 4: Run full verification and restart local service

**Files:**
- No code changes.
- Test: `scripts/test-screen-preview-cursor.py`, `scripts/test-cursor-sync.js`, `scripts/test-win32-mouse-move.py`

- [ ] **Step 1: Run all regression tests**

Run:

```powershell
.venv/Scripts/python.exe -X utf8 scripts/test-screen-preview-cursor.py
.venv/Scripts/python.exe -X utf8 scripts/test-win32-mouse-move.py
node scripts/test-cursor-sync.js
```

Expected:

```text
[cursor-sync] { ... }
```

Only `scripts/test-cursor-sync.js` prints the debug object. All commands must exit 0.

- [ ] **Step 2: Confirm the service listener**

Run:

```powershell
Get-NetTCPConnection -LocalPort 8790 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Get-CimInstance Win32_Process -Filter "ProcessId=$($_.OwningProcess)" | Select-Object ProcessId, ExecutablePath, CommandLine, CreationDate } | Format-List
```

Expected: one process running `python.exe run.py` from the `web-inputer` working directory.

- [ ] **Step 3: Restart the service process**

Run:

```powershell
$listener = Get-NetTCPConnection -LocalPort 8790 -State Listen -ErrorAction Stop | Select-Object -First 1
Stop-Process -Id $listener.OwningProcess -Force
Start-Process -FilePath ".\.venv\Scripts\python.exe" -ArgumentList "run.py" -WorkingDirectory "." -WindowStyle Hidden
```

- [ ] **Step 4: Verify health after restart**

Run:

```powershell
Invoke-WebRequest -Uri "https://your-domain.example.com/health" -UseBasicParsing | Select-Object StatusCode, Content
```

Expected:

```text
StatusCode Content
---------- -------
       200 {"ok":true,"activeController":false}
```

`activeController` may be `true` if the user is connected. The required part is HTTP 200 and `"ok":true`.

- [ ] **Step 5: Manual browser verification**

Open `https://your-domain.example.com`, enable screen preview, and move the mouse.

Expected:

- The JPEG/MJPEG frame itself shows the cursor.
- There is only one visible cursor.
- The cursor no longer flickers from overlay mismatch.
- Cursor sync logs continue to appear in `logs/remote-input.log` when screen preview is enabled.

- [ ] **Step 6: Final status report**

Report:

```text
Implemented MJPEG cursor-in-frame preview.
Verified: backend cursor tests, Win32 mouse movement test, JS cursor sync test, production health endpoint.
Manual verification: [state what was observed].
```

Do not claim manual verification succeeded unless Step 5 was actually performed.

---

## Self-Review

**Spec coverage:**
- Backend cursor-in-frame: Task 1 and Task 2.
- Disable visual overlay: Task 3.
- Preserve cursor sync logs/prediction: Task 3 keeps `updateCursor()` unchanged and only hides overlay rendering.
- Keep MJPEG and Sunshine as backup: No streaming architecture changes are included.
- Restart and verify production route: Task 4.

**Placeholder scan:**
- No TBD/TODO placeholders.
- Commands and expected outputs are explicit.
- Commit steps include skip condition for the current untracked repository state.

**Type consistency:**
- `draw_fallback_cursor(image, x, y)` is introduced in Task 2 and used by tests in Task 1.
- `_capture_monitor_image()` is introduced in Task 2 and overridden by the test subclass in Task 1.
- `positionCursor(cursor)` accepts fewer parameters, and JavaScript call sites can pass extra arguments safely.
