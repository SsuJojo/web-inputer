from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.window_switcher import WindowInfo, WindowSwitcher


class FakeBackend:
    def __init__(self) -> None:
        self.windows: list[WindowInfo] = []
        self.foreground: int | None = None
        self.activated: list[int] = []

    def list_windows(self) -> list[WindowInfo]:
        return [
            WindowInfo(
                hwnd=window.hwnd,
                title=window.title,
                class_name=window.class_name,
                process_id=window.process_id,
                rect=window.rect,
                is_foreground=window.hwnd == self.foreground,
            )
            for window in self.windows
        ]

    def foreground_hwnd(self) -> int | None:
        return self.foreground

    def activate(self, hwnd: int) -> bool:
        self.activated.append(hwnd)
        if any(window.hwnd == hwnd for window in self.windows):
            self.foreground = hwnd
            return True
        return False


def window(hwnd: int, title: str, left: int, top: int) -> WindowInfo:
    return WindowInfo(hwnd=hwnd, title=title, class_name="App", process_id=hwnd * 10, rect=(left, top, left + 200, top + 120))


clock_value = 0.0


def clock() -> float:
    return clock_value


def queue_titles(state: dict[str, object]) -> list[str]:
    return [item["title"] for item in state["windows"]]


backend = FakeBackend()
backend.windows = [window(2, "Bravo", 500, 0), window(1, "Alpha", 0, 0), window(3, "Charlie", 0, 300)]
backend.foreground = 2
switcher = WindowSwitcher(backend=backend, foreground_promote_seconds=20, clock=clock)
state = switcher.notify_desktop_changed()
assert queue_titles(state) == ["Bravo", "Alpha", "Charlie"], "foreground should sort first, then position"

state = switcher.switch("right")
assert backend.activated[-1] == 1, "right should cycle to next window"
assert state["current"]["title"] == "Alpha", "current should update after switch"

state = switcher.switch("left")
assert backend.activated[-1] == 2, "left should cycle to previous window"
assert state["current"]["title"] == "Bravo", "left switch should restore previous"

backend.foreground = 3
state = switcher.snapshot()
assert queue_titles(state) == ["Bravo", "Alpha", "Charlie"], "short foreground use should not reorder"
clock_value = 19.9
state = switcher.snapshot()
assert queue_titles(state) == ["Bravo", "Alpha", "Charlie"], "foreground under threshold should not promote"
clock_value = 20.0
state = switcher.snapshot()
assert queue_titles(state) == ["Charlie", "Bravo", "Alpha"], "foreground at threshold should promote to front"

backend.windows = [window(4, "Delta", 100, 100), window(5, "Echo", 0, 0)]
backend.foreground = 5
state = switcher.notify_desktop_changed()
assert queue_titles(state) == ["Echo", "Delta"], "desktop change should reset order from current desktop"

backend.windows.append(window(6, "Foxtrot", 900, 0))
state = switcher.snapshot()
assert queue_titles(state) == ["Echo", "Delta", "Foxtrot"], "new windows should append during normal refresh"

print("window switcher tests passed")
