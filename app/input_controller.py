from __future__ import annotations

import asyncio
import logging
import platform
from dataclasses import dataclass
from typing import Literal

from app.config import Settings

logger = logging.getLogger("remote_input")

Action = Literal["down", "up", "tap", "text", "mouse_move", "mouse_click", "mouse_down", "mouse_up", "mouse_wheel", "clipboard_set"]

KEY_ALIASES: dict[str, str] = {
    "control": "ctrl",
    "ctrl": "ctrl",
    "alt": "alt",
    "shift": "shift",
    "meta": "win",
    "win": "win",
    "enter": "enter",
    "return": "enter",
    "escape": "esc",
    "esc": "esc",
    "backspace": "backspace",
    "delete": "delete",
    "tab": "tab",
    "arrowup": "up",
    "arrowdown": "down",
    "arrowleft": "left",
    "arrowright": "right",
    "space": "space",
}

PYNPUT_SPECIAL_KEYS: dict[str, str] = {
    "ctrl": "ctrl",
    "alt": "alt",
    "shift": "shift",
    "win": "cmd",
    "enter": "enter",
    "esc": "esc",
    "backspace": "backspace",
    "delete": "delete",
    "tab": "tab",
    "up": "up",
    "down": "down",
    "left": "left",
    "right": "right",
    "space": "space",
}

WIN32_VK: dict[str, int] = {
    "ctrl": 0x11,
    "alt": 0x12,
    "shift": 0x10,
    "win": 0x5B,
    "enter": 0x0D,
    "esc": 0x1B,
    "backspace": 0x08,
    "delete": 0x2E,
    "tab": 0x09,
    "up": 0x26,
    "down": 0x28,
    "left": 0x25,
    "right": 0x27,
    "space": 0x20,
}


@dataclass(frozen=True)
class InputEvent:
    action: Action
    key: str | None = None
    text: str | None = None
    x: int | None = None
    y: int | None = None
    button: str | None = None
    delta: int | None = None
    dx: int | None = None
    dy: int | None = None


def normalize_key(key: str) -> str:
    lowered = key.strip().lower()
    return KEY_ALIASES.get(lowered, lowered)


class KeyboardBackend:
    def key_down(self, key: str) -> None:
        raise NotImplementedError

    def key_up(self, key: str) -> None:
        raise NotImplementedError

    def tap(self, key: str) -> None:
        self.key_down(key)
        self.key_up(key)

    def type_text(self, text: str) -> None:
        raise NotImplementedError

    def mouse_move(self, x: int, y: int) -> None:
        raise NotImplementedError

    def mouse_click(self, button: str) -> None:
        self.mouse_down(button)
        self.mouse_up(button)

    def mouse_down(self, button: str) -> None:
        raise NotImplementedError

    def mouse_up(self, button: str) -> None:
        raise NotImplementedError

    def mouse_wheel(self, dx: int, dy: int) -> None:
        raise NotImplementedError

    def set_clipboard(self, text: str) -> None:
        raise NotImplementedError


class PyWin32Backend(KeyboardBackend):
    def __init__(self) -> None:
        import pyperclip
        import win32api
        import win32con
        import win32gui

        self.pyperclip = pyperclip
        self.win32api = win32api
        self.win32con = win32con
        self.win32gui = win32gui

    def _vk_for_key(self, key: str) -> int:
        normalized = normalize_key(key)
        if normalized in WIN32_VK:
            return WIN32_VK[normalized]
        if len(normalized) == 1:
            vk = self.win32api.VkKeyScan(normalized)
            if vk == -1:
                raise ValueError(f"Unsupported key: {key}")
            return vk & 0xFF
        if normalized.startswith("f") and normalized[1:].isdigit():
            number = int(normalized[1:])
            if 1 <= number <= 24:
                return 0x6F + number
        raise ValueError(f"Unsupported key: {key}")

    def key_down(self, key: str) -> None:
        self.win32api.keybd_event(self._vk_for_key(key), 0, 0, 0)

    def key_up(self, key: str) -> None:
        self.win32api.keybd_event(self._vk_for_key(key), 0, self.win32con.KEYEVENTF_KEYUP, 0)

    def type_text(self, text: str) -> None:
        if not text:
            return
        self.pyperclip.copy(text)
        self.key_down("ctrl")
        self.tap("v")
        self.key_up("ctrl")

    def mouse_move(self, x: int, y: int) -> None:
        self.win32api.mouse_event(self.win32con.MOUSEEVENTF_MOVE, x, y, 0, 0)

    def _mouse_flags(self, button: str) -> tuple[int, int]:
        mapping = {
            "left": (self.win32con.MOUSEEVENTF_LEFTDOWN, self.win32con.MOUSEEVENTF_LEFTUP),
            "right": (self.win32con.MOUSEEVENTF_RIGHTDOWN, self.win32con.MOUSEEVENTF_RIGHTUP),
            "middle": (self.win32con.MOUSEEVENTF_MIDDLEDOWN, self.win32con.MOUSEEVENTF_MIDDLEUP),
        }
        return mapping.get(button, mapping["left"])

    def mouse_down(self, button: str) -> None:
        down, _ = self._mouse_flags(button)
        self.win32api.mouse_event(down, 0, 0, 0, 0)

    def mouse_up(self, button: str) -> None:
        _, up = self._mouse_flags(button)
        self.win32api.mouse_event(up, 0, 0, 0, 0)

    def mouse_wheel(self, dx: int, dy: int) -> None:
        if dy:
            self.win32api.mouse_event(self.win32con.MOUSEEVENTF_WHEEL, 0, 0, dy * 120, 0)
        if dx:
            self.win32api.mouse_event(self.win32con.MOUSEEVENTF_HWHEEL, 0, 0, dx * 120, 0)

    def set_clipboard(self, text: str) -> None:
        self.pyperclip.copy(text)


class PynputBackend(KeyboardBackend):
    def __init__(self) -> None:
        import pyperclip
        from pynput.keyboard import Controller as KeyboardController, Key
        from pynput.mouse import Button, Controller as MouseController

        self.pyperclip = pyperclip
        self.keyboard = KeyboardController()
        self.mouse = MouseController()
        self.Key = Key
        self.Button = Button

    def _key_for_name(self, key: str) -> object:
        normalized = normalize_key(key)
        special_name = PYNPUT_SPECIAL_KEYS.get(normalized)
        if special_name:
            return getattr(self.Key, special_name)
        if len(normalized) == 1:
            return normalized
        if normalized.startswith("f") and normalized[1:].isdigit():
            return getattr(self.Key, normalized)
        raise ValueError(f"Unsupported key: {key}")

    def key_down(self, key: str) -> None:
        self.keyboard.press(self._key_for_name(key))

    def key_up(self, key: str) -> None:
        self.keyboard.release(self._key_for_name(key))

    def type_text(self, text: str) -> None:
        if not text:
            return
        self.pyperclip.copy(text)
        with self.keyboard.pressed(self.Key.ctrl):
            self.keyboard.press("v")
            self.keyboard.release("v")

    def mouse_move(self, x: int, y: int) -> None:
        self.mouse.move(x, y)

    def _mouse_button(self, button: str) -> object:
        return getattr(self.Button, button if button in {"left", "right", "middle"} else "left")

    def mouse_down(self, button: str) -> None:
        self.mouse.press(self._mouse_button(button))

    def mouse_up(self, button: str) -> None:
        self.mouse.release(self._mouse_button(button))

    def mouse_wheel(self, dx: int, dy: int) -> None:
        self.mouse.scroll(dx, dy)

    def set_clipboard(self, text: str) -> None:
        self.pyperclip.copy(text)


class InputController:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.backend = self._create_backend()
        self.queue: asyncio.Queue[InputEvent] = asyncio.Queue(maxsize=500)
        self.worker_task: asyncio.Task[None] | None = None

    def _create_backend(self) -> KeyboardBackend:
        if platform.system().lower() == "windows":
            try:
                return PyWin32Backend()
            except ImportError:
                return PynputBackend()
        return PynputBackend()

    async def start(self) -> None:
        if not self.worker_task:
            self.worker_task = asyncio.create_task(self._worker())

    async def stop(self) -> None:
        if self.worker_task:
            self.worker_task.cancel()
            try:
                await self.worker_task
            except asyncio.CancelledError:
                pass
            self.worker_task = None

    async def submit(self, event: InputEvent) -> None:
        if not self.worker_task or self.worker_task.done():
            logger.error("input worker was not running; restarting")
            self.worker_task = asyncio.create_task(self._worker())
        try:
            self.queue.put_nowait(event)
        except asyncio.QueueFull:
            logger.warning("input queue full; dropping action=%s key=%s button=%s", event.action, event.key, event.button)

    async def _worker(self) -> None:
        while True:
            event = await self.queue.get()
            try:
                await asyncio.to_thread(self._dispatch, event)
            except Exception:
                logger.exception("input dispatch failed action=%s key=%s button=%s", event.action, event.key, event.button)
            finally:
                self.queue.task_done()

    def _dispatch(self, event: InputEvent) -> None:
        if event.action in {"down", "up", "tap"}:
            if not event.key:
                raise ValueError("Missing key")
            normalized = normalize_key(event.key)
            if event.action == "down":
                self.backend.key_down(normalized)
            elif event.action == "up":
                self.backend.key_up(normalized)
            else:
                self.backend.tap(normalized)
        elif event.action == "text":
            self.backend.type_text(event.text or "")
        elif event.action == "mouse_move" and self.settings.enable_mouse:
            self.backend.mouse_move(event.x or 0, event.y or 0)
        elif event.action == "mouse_click" and self.settings.enable_mouse:
            self.backend.mouse_click(event.button or "left")
        elif event.action == "mouse_down" and self.settings.enable_mouse:
            self.backend.mouse_down(event.button or "left")
        elif event.action == "mouse_up" and self.settings.enable_mouse:
            self.backend.mouse_up(event.button or "left")
        elif event.action == "mouse_wheel" and self.settings.enable_mouse:
            self.backend.mouse_wheel(event.dx or 0, event.dy if event.dy is not None else event.delta or 0)
        elif event.action == "clipboard_set" and self.settings.enable_clipboard:
            self.backend.set_clipboard(event.text or "")
