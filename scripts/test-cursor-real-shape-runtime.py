from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.config import Settings
from app.screen_preview import ScreenPreviewer


def test_runtime_cursor_capture_has_visible_real_icon() -> None:
    import mss
    import win32api
    import win32con
    import win32gui

    previewer = ScreenPreviewer(Settings())
    with mss.mss() as sct:
        monitor = sct.monitors[1]

    flags, cursor_handle, _ = win32gui.GetCursorInfo()
    assert flags == win32con.CURSOR_SHOWING
    assert cursor_handle

    captured = previewer._capture_cursor(monitor)
    assert captured is not None
    assert captured.image.width > 0
    assert captured.image.height > 0
    assert captured.image.getchannel("A").getbbox() is not None

    payload = previewer.frame_cursor_position()
    assert str(payload["icon"]).startswith("data:image/png;base64,")
    assert payload["iconWidth"] == captured.image.width
    assert payload["iconHeight"] == captured.image.height
    assert payload["hotspotX"] == captured.hotspot_x
    assert payload["hotspotY"] == captured.hotspot_y
    assert abs(int(payload["x"]) - win32api.GetCursorPos()[0] + monitor["left"]) <= 4
    assert abs(int(payload["y"]) - win32api.GetCursorPos()[1] + monitor["top"]) <= 4


def test_runtime_cursor_capture_changes_for_text_and_hand_shapes() -> None:
    import time
    import tkinter as tk

    import mss
    import win32api

    previewer = ScreenPreviewer(Settings())
    root = tk.Tk()
    root.title("cursor shape probe")
    root.geometry("420x220+120+120")
    root.attributes("-topmost", True)
    label = tk.Label(root, text="normal arrow area", width=32, height=3, bg="white")
    label.pack(pady=10)
    entry = tk.Entry(root, width=36)
    entry.insert(0, "text cursor probe")
    entry.pack(pady=10)
    hand = tk.Label(root, text="hand cursor probe", cursor="hand2", width=32, height=3, bg="#c7f9cc")
    hand.pack(pady=10)
    root.update()
    with mss.mss() as sct:
        monitor = sct.monitors[1]

    captures = {}
    try:
        for name, widget in (("arrow", label), ("text", entry), ("hand", hand)):
            x = widget.winfo_rootx() + widget.winfo_width() // 2
            y = widget.winfo_rooty() + widget.winfo_height() // 2
            win32api.SetCursorPos((x, y))
            root.update()
            time.sleep(0.25)
            root.update()
            cursor = previewer._capture_cursor(monitor)
            assert cursor is not None
            captures[name] = hashlib.sha256(cursor.image.tobytes()).hexdigest()
    finally:
        root.destroy()

    assert captures["arrow"] != captures["text"]
    assert captures["arrow"] != captures["hand"]


def summarize_runtime_cursor() -> None:
    import mss
    import win32con
    import win32gui

    previewer = ScreenPreviewer(Settings())
    with mss.mss() as sct:
        monitor = sct.monitors[1]
    flags, cursor_handle, _ = win32gui.GetCursorInfo()
    captured = previewer._capture_cursor(monitor)
    payload = previewer.frame_cursor_position()
    digest = ""
    if captured is not None:
        digest = hashlib.sha256(captured.image.tobytes()).hexdigest()[:16]
    print(json.dumps({
        "flags": flags,
        "showing": flags == win32con.CURSOR_SHOWING,
        "handle": int(cursor_handle or 0),
        "captured": captured is not None,
        "hash": digest,
        "payloadIconLength": len(str(payload.get("icon", ""))),
        "hotspot": [payload.get("hotspotX"), payload.get("hotspotY")],
        "size": [payload.get("iconWidth"), payload.get("iconHeight")],
    }, ensure_ascii=False))


if __name__ == "__main__":
    test_runtime_cursor_capture_has_visible_real_icon()
    test_runtime_cursor_capture_changes_for_text_and_hand_shapes()
    summarize_runtime_cursor()
