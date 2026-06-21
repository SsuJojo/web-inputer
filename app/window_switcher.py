from __future__ import annotations

import ctypes
import logging
import platform
import threading
import time
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Literal, Protocol

logger = logging.getLogger("remote_input")
Direction = Literal["left", "right"]
Rect = tuple[int, int, int, int]

EXCLUDED_CLASSES = {
    "Progman",
    "WorkerW",
    "Shell_TrayWnd",
    "Shell_SecondaryTrayWnd",
    "DV2ControlHost",
    "Windows.UI.Core.CoreWindow",
}


@dataclass(frozen=True)
class WindowInfo:
    hwnd: int
    title: str
    class_name: str
    process_id: int
    rect: Rect
    is_foreground: bool = False

    def to_dict(self) -> dict[str, int | str | bool | dict[str, int]]:
        left, top, right, bottom = self.rect
        return {
            "hwnd": self.hwnd,
            "title": self.title,
            "className": self.class_name,
            "processId": self.process_id,
            "rect": {"left": left, "top": top, "right": right, "bottom": bottom},
            "isForeground": self.is_foreground,
        }


class WindowBackend(Protocol):
    def list_windows(self) -> list[WindowInfo]: ...
    def foreground_hwnd(self) -> int | None: ...
    def activate(self, hwnd: int) -> bool: ...


class UnavailableWindowBackend:
    def list_windows(self) -> list[WindowInfo]:
        return []

    def foreground_hwnd(self) -> int | None:
        return None

    def activate(self, hwnd: int) -> bool:
        return False


class Win32WindowBackend:
    def __init__(self) -> None:
        import win32api
        import win32con
        import win32gui
        import win32process

        self.win32api = win32api
        self.win32con = win32con
        self.win32gui = win32gui
        self.win32process = win32process
        self.dwmapi = ctypes.WinDLL("dwmapi", use_last_error=True)
        self.user32 = ctypes.WinDLL("user32", use_last_error=True)
        self.GWL_EXSTYLE = -20
        self.GA_ROOTOWNER = 3
        self.WS_EX_TOOLWINDOW = 0x00000080
        self.WS_EX_APPWINDOW = 0x00040000

    def foreground_hwnd(self) -> int | None:
        hwnd = int(self.win32gui.GetForegroundWindow() or 0)
        return hwnd or None

    def list_windows(self) -> list[WindowInfo]:
        foreground = self.foreground_hwnd()
        windows: list[WindowInfo] = []

        def collect(hwnd: int, _: object) -> bool:
            info = self._window_info(hwnd, foreground)
            if info:
                windows.append(info)
            return True

        self.win32gui.EnumWindows(collect, None)
        return windows

    def activate(self, hwnd: int) -> bool:
        try:
            if self.win32gui.IsIconic(hwnd):
                self.win32gui.ShowWindow(hwnd, self.win32con.SW_RESTORE)
            self.win32gui.BringWindowToTop(hwnd)
            self.win32gui.SetForegroundWindow(hwnd)
        except Exception:
            logger.debug("basic foreground activation failed hwnd=%s", hwnd, exc_info=True)
            if not self._activate_with_thread_input(hwnd):
                return False
        if self._wait_for_foreground(hwnd):
            return True
        return self._activate_with_thread_input(hwnd)

    def _wait_for_foreground(self, hwnd: int, timeout: float = 0.6) -> bool:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if self.foreground_hwnd() == hwnd:
                return True
            time.sleep(0.03)
        return self.foreground_hwnd() == hwnd

    def _window_info(self, hwnd: int, foreground: int | None) -> WindowInfo | None:
        try:
            if not self.win32gui.IsWindow(hwnd) or not self.win32gui.IsWindowVisible(hwnd):
                return None
            if self._is_cloaked(hwnd):
                return None
            title = self.win32gui.GetWindowText(hwnd).strip()
            if not title:
                return None
            class_name = self.win32gui.GetClassName(hwnd)
            if class_name in EXCLUDED_CLASSES or not self._is_alt_tab_window(hwnd):
                return None
            rect = tuple(int(value) for value in self.win32gui.GetWindowRect(hwnd))
            if not self._valid_rect(rect):
                return None
            _, process_id = self.win32process.GetWindowThreadProcessId(hwnd)
        except Exception:
            logger.debug("failed to inspect window hwnd=%s", hwnd, exc_info=True)
            return None
        return WindowInfo(
            hwnd=int(hwnd),
            title=title,
            class_name=class_name,
            process_id=int(process_id or 0),
            rect=rect,
            is_foreground=hwnd == foreground,
        )

    def _is_cloaked(self, hwnd: int) -> bool:
        cloaked = ctypes.c_int(0)
        result = self.dwmapi.DwmGetWindowAttribute(hwnd, 14, ctypes.byref(cloaked), ctypes.sizeof(cloaked))
        return result == 0 and cloaked.value != 0

    def _is_alt_tab_window(self, hwnd: int) -> bool:
        ex_style = self.win32gui.GetWindowLong(hwnd, self.GWL_EXSTYLE)
        if ex_style & self.WS_EX_TOOLWINDOW:
            return False
        owner = self.win32gui.GetWindow(hwnd, self.win32con.GW_OWNER)
        if owner and not (ex_style & self.WS_EX_APPWINDOW):
            return False
        root_owner = self.win32gui.GetAncestor(hwnd, self.GA_ROOTOWNER)
        last_active_popup = self.user32.GetLastActivePopup(root_owner)
        if last_active_popup and last_active_popup != hwnd:
            if self.win32gui.IsWindowVisible(last_active_popup) and not self._is_cloaked(last_active_popup):
                return False
        return True

    def _valid_rect(self, rect: Rect) -> bool:
        left, top, right, bottom = rect
        return right - left >= 80 and bottom - top >= 40

    def _activate_with_thread_input(self, hwnd: int) -> bool:
        foreground = self.foreground_hwnd()
        attached_threads: list[tuple[int, int]] = []
        try:
            current_thread = self.win32api.GetCurrentThreadId()
            foreground_thread = self.win32process.GetWindowThreadProcessId(foreground or 0)[0] if foreground else 0
            target_thread = self.win32process.GetWindowThreadProcessId(hwnd)[0]
            for other_thread in {foreground_thread, target_thread}:
                if other_thread and other_thread != current_thread:
                    if self.user32.AttachThreadInput(current_thread, other_thread, True):
                        attached_threads.append((current_thread, other_thread))
            try:
                if self.win32gui.IsIconic(hwnd):
                    self.win32gui.ShowWindow(hwnd, self.win32con.SW_RESTORE)
                self.win32gui.ShowWindow(hwnd, self.win32con.SW_SHOW)
                self.win32gui.BringWindowToTop(hwnd)
                self.win32gui.SetForegroundWindow(hwnd)
            finally:
                for source_thread, target_thread in reversed(attached_threads):
                    self.user32.AttachThreadInput(source_thread, target_thread, False)
        except Exception:
            logger.debug("thread input foreground activation failed hwnd=%s", hwnd, exc_info=True)
            return False
        return self._wait_for_foreground(hwnd)


class WindowSwitcher:
    def __init__(
        self,
        backend: WindowBackend | None = None,
        foreground_promote_seconds: float = 20.0,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.backend = backend or create_window_backend()
        self.foreground_promote_seconds = foreground_promote_seconds
        self.clock = clock
        self._lock = threading.RLock()
        self._queue: list[WindowInfo] = []
        self._foreground_hwnd: int | None = None
        self._foreground_since = 0.0
        self._promoted_foreground_hwnd: int | None = None

    def snapshot(self) -> dict[str, object]:
        with self._lock:
            self._refresh_locked(reset_order=False)
            self._update_foreground_usage_locked()
            return self._state_locked()

    def notify_desktop_changed(self) -> dict[str, object]:
        with self._lock:
            self._refresh_locked(reset_order=True)
            self._reset_foreground_tracking_locked()
            self._update_foreground_usage_locked()
            return self._state_locked()

    def switch(self, direction: Direction) -> dict[str, object]:
        with self._lock:
            self._refresh_locked(reset_order=False)
            if not self._queue:
                return self._state_locked("No switchable windows")
            target = self._target_for_direction_locked(direction)
            if not self.backend.activate(target.hwnd):
                logger.warning("failed to activate window hwnd=%s title=%s", target.hwnd, target.title)
                return self._state_locked(f"Failed to activate window: {target.title}")
            self._refresh_locked(reset_order=False)
            self._reset_foreground_tracking_locked()
            self._update_foreground_usage_locked()
            return self._state_locked()

    def _refresh_locked(self, reset_order: bool) -> None:
        windows = self.backend.list_windows()
        sorted_windows = self._initial_sort(windows)
        if reset_order or not self._queue:
            self._queue = sorted_windows
            return
        by_hwnd = {window.hwnd: window for window in sorted_windows}
        old_hwnds = {window.hwnd for window in self._queue}
        kept = [by_hwnd[window.hwnd] for window in self._queue if window.hwnd in by_hwnd]
        added = [window for window in sorted_windows if window.hwnd not in old_hwnds]
        self._queue = kept + added

    def _initial_sort(self, windows: Sequence[WindowInfo]) -> list[WindowInfo]:
        foreground = self.backend.foreground_hwnd()
        return sorted(
            windows,
            key=lambda window: (
                0 if window.hwnd == foreground else 1,
                window.rect[1],
                window.rect[0],
                window.title.casefold(),
                window.hwnd,
            ),
        )

    def _target_for_direction_locked(self, direction: Direction) -> WindowInfo:
        foreground = self.backend.foreground_hwnd()
        hwnds = [window.hwnd for window in self._queue]
        if foreground in hwnds:
            index = hwnds.index(foreground)
        else:
            index = -1 if direction == "right" else 0
        next_index = (index + 1) % len(self._queue) if direction == "right" else (index - 1) % len(self._queue)
        return self._queue[next_index]

    def _update_foreground_usage_locked(self) -> None:
        foreground = self.backend.foreground_hwnd()
        now = self.clock()
        if foreground != self._foreground_hwnd:
            self._foreground_hwnd = foreground
            self._foreground_since = now
            self._promoted_foreground_hwnd = None
            return
        if not foreground or self._promoted_foreground_hwnd == foreground:
            return
        if now - self._foreground_since < self.foreground_promote_seconds:
            return
        self._move_to_front_locked(foreground)
        self._promoted_foreground_hwnd = foreground

    def _reset_foreground_tracking_locked(self) -> None:
        self._foreground_hwnd = None
        self._foreground_since = 0.0
        self._promoted_foreground_hwnd = None

    def _move_to_front_locked(self, hwnd: int) -> None:
        for index, window in enumerate(self._queue):
            if window.hwnd == hwnd:
                self._queue.insert(0, self._queue.pop(index))
                return

    def _current_locked(self) -> WindowInfo | None:
        foreground = self.backend.foreground_hwnd()
        for window in self._queue:
            if window.hwnd == foreground:
                return window
        return self._queue[0] if self._queue else None

    def _state_locked(self, error: str | None = None) -> dict[str, object]:
        current = self._current_locked()
        result: dict[str, object] = {
            "current": current.to_dict() if current else None,
            "windows": [window.to_dict() for window in self._queue],
        }
        if error:
            result["error"] = error
        return result


def create_window_backend() -> WindowBackend:
    if platform.system().lower() != "windows":
        return UnavailableWindowBackend()
    try:
        return Win32WindowBackend()
    except ImportError:
        logger.warning("pywin32 is unavailable; window switching disabled")
    except Exception:
        logger.exception("failed to initialize win32 window backend")
    return UnavailableWindowBackend()
