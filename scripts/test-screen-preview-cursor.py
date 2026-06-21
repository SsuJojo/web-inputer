from __future__ import annotations

import io
import sys
import types
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from PIL import Image

from app.screen_preview import CapturedCursor, ScreenPreviewer


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


class FakeBitmapHandle:
    def __init__(self, handle, bits: bytes) -> None:
        self.handle = handle
        self.bits = bits

    def __eq__(self, other):
        return self.handle == other

    def GetBitmapBits(self, signed):
        return self.bits


class FakeBitmapInfo:
    bmWidth = 32
    bmHeight = 32
    bmWidthBytes = 128


class FakeMaskBitmapInfo:
    bmWidth = 32
    bmHeight = 32
    bmWidthBytes = 4


class FakeWin32Gui(types.ModuleType):
    def __init__(self) -> None:
        super().__init__("win32gui")
        self.calls = []

    def GetCursorInfo(self):
        return 1, 100, 0

    def GetIconInfo(self, cursor_handle):
        return 0, 0, 0, 5, 6

    def GetDC(self, hwnd):
        return 1

    def CreateCompatibleDC(self, hdc):
        return 2

    def CreateCompatibleBitmap(self, hdc, width, height):
        return FakeBitmapHandle(3, b"\0" * width * height * 4)

    def SelectObject(self, memdc, bitmap):
        self.calls.append(("SelectObject", memdc, bitmap))
        return 4

    def CreateSolidBrush(self, color):
        return 8

    def FillRect(self, memdc, rect, brush):
        self.calls.append(("FillRect", memdc, rect, brush))

    def DrawIconEx(self, *args):
        raise RuntimeError("draw failed")

    def GetObject(self, bitmap):
        return FakeBitmapInfo()

    def DeleteObject(self, handle):
        self.calls.append(("DeleteObject", handle))

    def DeleteDC(self, memdc):
        self.calls.append(("DeleteDC", memdc))

    def ReleaseDC(self, hwnd, hdc):
        self.calls.append(("ReleaseDC", hwnd, hdc))




class SuccessfulFakeWin32Gui(FakeWin32Gui):
    def DrawIconEx(self, *args):
        self.calls.append(("DrawIconEx", args[0], args[1], args[2], args[3]))

    def CreateCompatibleBitmap(self, hdc, width, height):
        pixels = bytearray()
        for index in range(width * height):
            if index == 0:
                pixels.extend((0, 0, 0, 0))
            else:
                pixels.extend((0, 0, 255, 0))
        return FakeBitmapHandle(3, bytes(pixels))

    def GetObject(self, bitmap):
        if bitmap == 5:
            return FakeMaskBitmapInfo()
        return FakeBitmapInfo()

    def GetBitmapBits(self, bitmap, signed):
        if bitmap == 5:
            mask = bytearray([255] * 32 * 4)
            mask[0] = 127
            return bytes(mask)
        raise AttributeError("win32gui.GetBitmapBits is unavailable")


class NoGetBitmapBitsWin32Gui(SuccessfulFakeWin32Gui):
    def __getattribute__(self, name):
        if name == "GetBitmapBits":
            raise AttributeError("win32gui.GetBitmapBits is unavailable")
        return super().__getattribute__(name)


class PartialFailureFakeWin32Gui(SuccessfulFakeWin32Gui):
    def CreateCompatibleBitmap(self, hdc, width, height):
        return FakeBitmapHandle(7, b"\0" * width * height * 4)

    def SelectObject(self, memdc, bitmap):
        raise RuntimeError("select failed")


class FakeWin32Ui(types.ModuleType):
    def __init__(self) -> None:
        super().__init__("win32ui")

    def CreateBitmapFromHandle(self, bitmap):
        if hasattr(bitmap, "GetBitmapBits"):
            return bitmap
        if bitmap == 5:
            mask = bytearray([255] * 32 * 4)
            mask[0] = 127
            return FakeBitmapHandle(5, bytes(mask))
        return bitmap


class FakeWin32Api(types.ModuleType):
    def __init__(self) -> None:
        super().__init__("win32api")

    def GetCursorPos(self):
        return 20, 15

    def GetSystemMetrics(self, metric):
        return 32


def test_capture_frame_embeds_cursor_overlay():
    previewer = TestPreviewer()

    frame = previewer.capture_frame(max_width=0, quality=95)

    decoded = Image.open(io.BytesIO(frame)).convert("RGB")
    assert previewer.draw_calls == [((80, 60), 80, 60)]
    red, green, blue = decoded.getpixel((10, 10))
    assert red > 200
    assert green < 80
    assert blue < 80


def test_fallback_cursor_draws_visible_arrow_shape():
    previewer = ScreenPreviewer(Settings())
    image = Image.new("RGB", (80, 60), "white")

    result = previewer.draw_fallback_cursor(image, 20, 15)

    assert result.getpixel((20, 15)) != (255, 255, 255)
    assert result.getpixel((25, 20)) != (255, 255, 255)
    assert result.getpixel((5, 5)) == (255, 255, 255)


def test_frame_cursor_payload_returns_current_capture_when_available():
    previewer = ScreenPreviewer(Settings())
    image = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    image.putpixel((4, 5), (255, 255, 255, 255))
    previewer._capture_cursor = lambda monitor: CapturedCursor(20, 25, 4, 5, image)

    payload = previewer.frame_cursor_position()

    assert payload["x"] == 20
    assert payload["y"] == 25
    assert payload["hotspotX"] == 4
    assert payload["hotspotY"] == 5
    assert payload["iconWidth"] == 16
    assert payload["iconHeight"] == 16
    assert payload["icon"].startswith("data:image/png;base64,")


def test_win32_success_keeps_black_cursor_pixels_and_transparent_background():
    previewer = ScreenPreviewer(Settings())
    image = Image.new("RGB", (80, 60), "white")
    win32gui = SuccessfulFakeWin32Gui()
    modules = {
        "win32api": FakeWin32Api(),
        "win32con": types.SimpleNamespace(CURSOR_SHOWING=1, IDC_ARROW=32512, DI_NORMAL=3, SM_CXCURSOR=13, SM_CYCURSOR=14),
        "win32gui": win32gui,
        "win32ui": FakeWin32Ui(),
    }
    previous = {name: sys.modules.get(name) for name in modules}
    try:
        sys.modules.update(modules)
        result = previewer.draw_cursor_on_image(image, {"left": 0, "top": 0})
    finally:
        for name, module in previous.items():
            if module is None:
                del sys.modules[name]
            else:
                sys.modules[name] = module

    assert result.getpixel((20, 15)) == (0, 0, 0)
    assert result.getpixel((21, 15)) == (255, 255, 255)
    assert ("DeleteObject", 5) in win32gui.calls
    assert ("DeleteObject", 6) in win32gui.calls


def test_win32_draw_failure_uses_fallback_and_cleans_resources():
    previewer = ScreenPreviewer(Settings())
    image = Image.new("RGB", (80, 60), "white")
    win32gui = FakeWin32Gui()
    modules = {
        "win32api": FakeWin32Api(),
        "win32con": types.SimpleNamespace(CURSOR_SHOWING=1, IDC_ARROW=32512, DI_NORMAL=3, SM_CXCURSOR=13, SM_CYCURSOR=14),
        "win32gui": win32gui,
        "win32ui": FakeWin32Ui(),
    }
    previous = {name: sys.modules.get(name) for name in modules}
    try:
        sys.modules.update(modules)
        result = previewer.draw_cursor_on_image(image, {"left": 0, "top": 0})
    finally:
        for name, module in previous.items():
            if module is None:
                del sys.modules[name]
            else:
                sys.modules[name] = module

    assert result.getpixel((20, 15)) != (255, 255, 255)
    selected_bitmap = next(call[2] for call in win32gui.calls if call[:2] == ("SelectObject", 2))
    assert isinstance(selected_bitmap, FakeBitmapHandle)
    assert selected_bitmap.handle == 3
    assert ("SelectObject", 2, 4) in win32gui.calls
    assert ("DeleteObject", selected_bitmap) in win32gui.calls
    assert ("DeleteDC", 2) in win32gui.calls
    assert ("ReleaseDC", 0, 1) in win32gui.calls
    assert ("DeleteObject", 5) in win32gui.calls
    assert ("DeleteObject", 6) in win32gui.calls


def test_capture_cursor_reads_bits_through_win32ui_when_win32gui_lacks_get_bitmap_bits():
    previewer = ScreenPreviewer(Settings())
    win32gui = NoGetBitmapBitsWin32Gui()
    modules = {
        "win32api": FakeWin32Api(),
        "win32con": types.SimpleNamespace(CURSOR_SHOWING=1, IDC_ARROW=32512, DI_NORMAL=3, SM_CXCURSOR=13, SM_CYCURSOR=14),
        "win32gui": win32gui,
        "win32ui": FakeWin32Ui(),
    }
    previous = {name: sys.modules.get(name) for name in modules}
    try:
        sys.modules.update(modules)
        captured = previewer._capture_cursor({"left": 0, "top": 0})
    finally:
        for name, module in previous.items():
            if module is None:
                del sys.modules[name]
            else:
                sys.modules[name] = module

    assert captured is not None
    assert captured.image.size == (32, 32)
    assert captured.image.getpixel((0, 0)) == (0, 0, 0, 255)
    assert captured.image.getpixel((1, 0))[3] == 0


def test_capture_cursor_partial_render_failure_cleans_resources():
    previewer = ScreenPreviewer(Settings())
    win32gui = PartialFailureFakeWin32Gui()
    modules = {
        "win32api": FakeWin32Api(),
        "win32con": types.SimpleNamespace(CURSOR_SHOWING=1, DI_NORMAL=3, SM_CXCURSOR=13, SM_CYCURSOR=14),
        "win32gui": win32gui,
    }
    previous = {name: sys.modules.get(name) for name in modules}
    try:
        sys.modules.update(modules)
        try:
            previewer._capture_cursor({"left": 0, "top": 0})
        except RuntimeError as error:
            assert str(error) == "select failed"
        else:
            raise AssertionError("expected render failure")
    finally:
        for name, module in previous.items():
            if module is None:
                del sys.modules[name]
            else:
                sys.modules[name] = module

    assert ("DeleteObject", 7) in win32gui.calls
    assert ("DeleteDC", 2) in win32gui.calls
    assert ("ReleaseDC", 0, 1) in win32gui.calls
    assert ("DeleteObject", 5) in win32gui.calls
    assert ("DeleteObject", 6) in win32gui.calls


if __name__ == "__main__":
    test_capture_frame_embeds_cursor_overlay()
    test_frame_cursor_payload_returns_current_capture_when_available()
    test_fallback_cursor_draws_visible_arrow_shape()
    test_win32_success_keeps_black_cursor_pixels_and_transparent_background()
    test_win32_draw_failure_uses_fallback_and_cleans_resources()
    test_capture_cursor_reads_bits_through_win32ui_when_win32gui_lacks_get_bitmap_bits()
    test_capture_cursor_partial_render_failure_cleans_resources()
