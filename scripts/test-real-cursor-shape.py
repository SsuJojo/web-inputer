from __future__ import annotations

import base64
import io
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from PIL import Image

from app.screen_preview import CapturedCursor, ScreenPreviewer


class FakeSettings:
    screen_preview_fps = 10
    screen_preview_max_width = 800
    screen_preview_quality = 80


def make_previewer() -> ScreenPreviewer:
    return ScreenPreviewer(FakeSettings())


def decode_data_url(data_url: str) -> Image.Image:
    assert data_url.startswith("data:image/png;base64,")
    payload = data_url.removeprefix("data:image/png;base64,")
    return Image.open(io.BytesIO(base64.b64decode(payload))).convert("RGBA")


def test_cursor_payload_uses_real_dimensions_and_png() -> None:
    previewer = make_previewer()
    cursor_image = Image.new("RGBA", (17, 23), (0, 0, 0, 0))
    cursor_image.putpixel((4, 5), (10, 20, 30, 255))
    captured = CapturedCursor(
        x=30,
        y=40,
        hotspot_x=4,
        hotspot_y=5,
        image=cursor_image,
    )

    payload = previewer._cursor_payload(captured, screen_width=800, screen_height=600)

    assert payload["x"] == 30
    assert payload["y"] == 40
    assert payload["width"] == 800
    assert payload["height"] == 600
    assert payload["hotspotX"] == 4
    assert payload["hotspotY"] == 5
    assert payload["iconWidth"] == 17
    assert payload["iconHeight"] == 23
    decoded = decode_data_url(str(payload["icon"]))
    assert decoded.size == (17, 23)
    assert decoded.getpixel((4, 5)) == (10, 20, 30, 255)


def test_cursor_payload_hides_missing_cursor() -> None:
    previewer = make_previewer()

    payload = previewer._cursor_payload(None, screen_width=800, screen_height=600, x=11, y=12)

    assert payload == {
        "x": 11,
        "y": 12,
        "width": 800,
        "height": 600,
        "icon": "",
        "hotspotX": 0,
        "hotspotY": 0,
        "iconWidth": 0,
        "iconHeight": 0,
    }


def test_reuses_last_cursor_image_at_current_position_when_capture_missing() -> None:
    previewer = make_previewer()
    cursor_image = Image.new("RGBA", (7, 9), (0, 0, 0, 0))
    cursor_image.putpixel((1, 2), (255, 255, 255, 255))
    captured = CapturedCursor(x=30, y=40, hotspot_x=1, hotspot_y=2, image=cursor_image)

    assert previewer._cursor_for_payload(captured, 30, 40) is captured
    reused = previewer._cursor_for_payload(None, 50, 60)

    assert reused is not None
    assert reused.x == 50
    assert reused.y == 60
    assert reused.hotspot_x == 1
    assert reused.hotspot_y == 2
    assert reused.image is cursor_image


def test_wake_cursor_uses_tiny_real_relative_move() -> None:
    previewer = make_previewer()
    calls = []

    class FakeWin32Api:
        def mouse_event(self, *args):
            calls.append(args)

    class FakeWin32Con:
        MOUSEEVENTF_MOVE = 1

    previewer._wake_cursor(FakeWin32Api(), FakeWin32Con())

    assert calls == [(1, 1, 0, 0, 0), (1, -1, 0, 0, 0)]


def test_composite_cursor_uses_hotspot() -> None:
    previewer = make_previewer()
    base = Image.new("RGB", (20, 20), (0, 0, 0))
    cursor_image = Image.new("RGBA", (5, 5), (0, 0, 0, 0))
    cursor_image.putpixel((2, 3), (255, 0, 0, 255))
    captured = CapturedCursor(
        x=10,
        y=11,
        hotspot_x=2,
        hotspot_y=3,
        image=cursor_image,
    )

    result = previewer._composite_cursor(base, captured)

    assert result.getpixel((10, 11)) == (255, 0, 0)
    assert result.getpixel((9, 11)) == (0, 0, 0)


def test_cursor_rgba_from_drawn_images_reconstructs_alpha() -> None:
    previewer = make_previewer()
    source = Image.new("RGBA", (3, 1), (0, 0, 0, 0))
    source.putpixel((0, 0), (0, 0, 0, 0))
    source.putpixel((1, 0), (200, 40, 10, 255))
    source.putpixel((2, 0), (20, 220, 80, 128))
    black = Image.new("RGBA", source.size, (0, 0, 0, 255))
    white = Image.new("RGBA", source.size, (255, 255, 255, 255))
    black.alpha_composite(source)
    white.alpha_composite(source)

    result = previewer._cursor_rgba_from_drawn_images(black.convert("RGB"), white.convert("RGB"))

    assert result.getpixel((0, 0)) == (0, 0, 0, 0)
    assert result.getpixel((1, 0)) == (200, 40, 10, 255)
    semi_red, semi_green, semi_blue, semi_alpha = result.getpixel((2, 0))
    assert abs(semi_alpha - 128) <= 1
    assert abs(semi_red - 20) <= 1
    assert abs(semi_green - 220) <= 1
    assert abs(semi_blue - 80) <= 1


if __name__ == "__main__":
    test_cursor_payload_uses_real_dimensions_and_png()
    test_cursor_payload_hides_missing_cursor()
    test_reuses_last_cursor_image_at_current_position_when_capture_missing()
    test_wake_cursor_uses_tiny_real_relative_move()
    test_composite_cursor_uses_hotspot()
    test_cursor_rgba_from_drawn_images_reconstructs_alpha()
