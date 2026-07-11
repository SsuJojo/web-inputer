from __future__ import annotations

import asyncio
import base64
import io
import logging
from collections.abc import AsyncIterator
from dataclasses import dataclass

from app.config import Settings

logger = logging.getLogger("remote_input")


@dataclass(frozen=True)
class CapturedCursor:
    x: int
    y: int
    hotspot_x: int
    hotspot_y: int
    image: object


class ScreenPreviewer:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._last_cursor: CapturedCursor | None = None

    async def frames(self) -> AsyncIterator[bytes]:
        delay = 1 / max(1, self.settings.screen_preview_fps)
        while True:
            try:
                frame = await asyncio.to_thread(self.capture_frame, self.settings.screen_preview_max_width, self.settings.screen_preview_quality)
                yield b"--frame\r\nContent-Type: image/jpeg\r\nCache-Control: no-store\r\n\r\n" + frame + b"\r\n"
            except Exception:
                logger.exception("screen preview capture failed")
                await asyncio.sleep(1)
            await asyncio.sleep(delay)

    def _capture_monitor_image(self):
        from PIL import Image
        import mss

        with mss.mss() as sct:
            monitor = sct.monitors[1]
            screenshot = sct.grab(monitor)
            image = Image.frombytes("RGB", screenshot.size, screenshot.bgra, "raw", "BGRX")
        return image, monitor

    def capture_frame(self, max_width: int | None = None, quality: int | None = None, progressive: bool = True) -> bytes:
        from PIL import Image

        image, monitor = self._capture_monitor_image()
        image = self.draw_cursor_on_image(image, monitor)
        max_width = self.settings.screen_preview_max_width if max_width is None else max_width
        quality = self.settings.screen_preview_quality if quality is None else quality
        if max_width > 0 and image.width > max_width:
            height = round(image.height * max_width / image.width)
            image = image.resize((max_width, height), Image.Resampling.BILINEAR)

        buffer = io.BytesIO()
        image.save(buffer, format="JPEG", quality=quality, optimize=True, progressive=progressive, subsampling=0)
        return buffer.getvalue()

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
        draw.line([(x, y), (x + 5, y + 5)], fill=(0, 0, 0))
        return result

    def _cursor_payload(
        self,
        cursor: CapturedCursor | None,
        screen_width: int,
        screen_height: int,
        x: int = 0,
        y: int = 0,
    ) -> dict[str, int | str]:
        if cursor is None:
            return {
                "x": x,
                "y": y,
                "width": screen_width,
                "height": screen_height,
                "icon": "",
                "hotspotX": 0,
                "hotspotY": 0,
                "iconWidth": 0,
                "iconHeight": 0,
            }

        buffer = io.BytesIO()
        cursor.image.save(buffer, format="PNG")
        icon_data = "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")
        return {
            "x": cursor.x,
            "y": cursor.y,
            "width": screen_width,
            "height": screen_height,
            "icon": icon_data,
            "hotspotX": cursor.hotspot_x,
            "hotspotY": cursor.hotspot_y,
            "iconWidth": cursor.image.width,
            "iconHeight": cursor.image.height,
        }

    def _cursor_for_payload(self, cursor: CapturedCursor | None, x: int, y: int) -> CapturedCursor | None:
        if cursor is not None:
            self._last_cursor = cursor
            return cursor
        if self._last_cursor is None:
            return None
        return CapturedCursor(
            x=x,
            y=y,
            hotspot_x=self._last_cursor.hotspot_x,
            hotspot_y=self._last_cursor.hotspot_y,
            image=self._last_cursor.image,
        )

    def _wake_cursor(self, win32api, win32con) -> None:
        win32api.mouse_event(win32con.MOUSEEVENTF_MOVE, 1, 0, 0, 0)
        win32api.mouse_event(win32con.MOUSEEVENTF_MOVE, -1, 0, 0, 0)

    def _composite_cursor(self, image, cursor: CapturedCursor | None):
        if cursor is None:
            return image
        composed = image.convert("RGBA")
        composed.alpha_composite(cursor.image, (cursor.x - cursor.hotspot_x, cursor.y - cursor.hotspot_y))
        return composed.convert("RGB")

    def _bitmap_size(self, bitmap_info) -> tuple[int, int]:
        width = getattr(bitmap_info, "bmWidth", None)
        height = getattr(bitmap_info, "bmHeight", None)
        if width is None and isinstance(bitmap_info, dict):
            width = bitmap_info.get("bmWidth")
            height = bitmap_info.get("bmHeight")
        return int(width or 0), int(height or 0)

    def _bitmap_bits(self, bitmap) -> bytes:
        try:
            import win32gui

            return win32gui.GetBitmapBits(bitmap, True)
        except AttributeError:
            import win32ui

            return win32ui.CreateBitmapFromHandle(bitmap).GetBitmapBits(True)

    def _cursor_alpha_from_mask(self, mask_info, mask_bits: bytes, width: int, height: int):
        from PIL import Image

        mask_width = int(getattr(mask_info, "bmWidth", width))
        mask_height = int(getattr(mask_info, "bmHeight", height))
        width_bytes = int(getattr(mask_info, "bmWidthBytes", ((mask_width + 31) // 32) * 4))
        alpha = Image.new("L", (width, height), 255)
        pixels = alpha.load()
        source_height = height if mask_height < height * 2 else height
        for y in range(min(height, source_height)):
            row_offset = y * width_bytes
            for x in range(width):
                byte_index = row_offset + (x // 8)
                if byte_index >= len(mask_bits):
                    continue
                bit = (mask_bits[byte_index] >> (7 - (x % 8))) & 1
                if bit:
                    pixels[x, y] = 0
        return alpha

    def _cursor_rgba_from_drawn_images(self, black_image, white_image, mask_alpha=None):
        from PIL import Image

        black_rgb = black_image.convert("RGB")
        white_rgb = white_image.convert("RGB")
        result = Image.new("RGBA", black_rgb.size)
        black_pixels = black_rgb.load()
        white_pixels = white_rgb.load()
        result_pixels = result.load()
        for y in range(black_rgb.height):
            for x in range(black_rgb.width):
                black_red, black_green, black_blue = black_pixels[x, y]
                white_red, white_green, white_blue = white_pixels[x, y]
                max_delta = max(
                    white_red - black_red,
                    white_green - black_green,
                    white_blue - black_blue,
                )
                alpha = max(0, min(255, 255 - max_delta))
                if alpha == 0:
                    result_pixels[x, y] = (0, 0, 0, 0)
                else:
                    result_pixels[x, y] = (
                        max(0, min(255, round(black_red * 255 / alpha))),
                        max(0, min(255, round(black_green * 255 / alpha))),
                        max(0, min(255, round(black_blue * 255 / alpha))),
                        alpha,
                    )
        if mask_alpha is not None and result.getchannel("A").getextrema() == (255, 255):
            result.putalpha(mask_alpha)
        return result

    def _capture_cursor(self, monitor) -> CapturedCursor | None:
        import win32api
        import win32con
        import win32gui
        from PIL import Image

        hdc = None
        render_items = []
        icon_info = None
        try:
            cursor_x, cursor_y = win32api.GetCursorPos()
            flags, cursor_handle, _ = win32gui.GetCursorInfo()
            if flags != win32con.CURSOR_SHOWING or not cursor_handle:
                return None

            icon_info = win32gui.GetIconInfo(cursor_handle)
            hotspot_x = int(icon_info[1])
            hotspot_y = int(icon_info[2])
            color_bitmap = icon_info[4]
            mask_bitmap = icon_info[3]

            icon_width = int(win32api.GetSystemMetrics(win32con.SM_CXCURSOR))
            icon_height = int(win32api.GetSystemMetrics(win32con.SM_CYCURSOR))
            if color_bitmap:
                color_width, color_height = self._bitmap_size(win32gui.GetObject(color_bitmap))
                if color_width and color_height:
                    icon_width = color_width
                    icon_height = color_height
            elif mask_bitmap:
                mask_width, mask_height = self._bitmap_size(win32gui.GetObject(mask_bitmap))
                if mask_width and mask_height:
                    icon_width = mask_width
                    icon_height = mask_height // 2 if mask_height >= 2 else mask_height

            if icon_width <= 0 or icon_height <= 0:
                return None

            hdc = win32gui.GetDC(0)

            def render_cursor(background_color: int):
                memdc = None
                bitmap = None
                old_bitmap = None
                tracked = False
                try:
                    memdc = win32gui.CreateCompatibleDC(hdc)
                    bitmap = win32gui.CreateCompatibleBitmap(hdc, icon_width, icon_height)
                    old_bitmap = win32gui.SelectObject(memdc, bitmap)
                    render_items.append((memdc, bitmap, old_bitmap))
                    tracked = True
                    brush = win32gui.CreateSolidBrush(background_color)
                    try:
                        win32gui.FillRect(memdc, (0, 0, icon_width, icon_height), brush)
                    finally:
                        win32gui.DeleteObject(brush)
                    win32gui.DrawIconEx(memdc, 0, 0, cursor_handle, icon_width, icon_height, 0, None, win32con.DI_NORMAL)
                    bmpinfo = win32gui.GetObject(bitmap)
                    bmp_width, bmp_height = self._bitmap_size(bmpinfo)
                    bmpstr = self._bitmap_bits(bitmap)
                    return Image.frombuffer("RGB", (bmp_width, bmp_height), bmpstr, "raw", "BGRX", 0, 1)
                except Exception:
                    if not tracked:
                        if old_bitmap and memdc:
                            try:
                                win32gui.SelectObject(memdc, old_bitmap)
                            except Exception:
                                logger.debug("cursor memdc restore failed", exc_info=True)
                        if bitmap:
                            try:
                                win32gui.DeleteObject(bitmap)
                            except Exception:
                                logger.debug("cursor bitmap cleanup failed", exc_info=True)
                        if memdc:
                            try:
                                win32gui.DeleteDC(memdc)
                            except Exception:
                                logger.debug("cursor memdc cleanup failed", exc_info=True)
                    raise

            black_image = render_cursor(0x000000)
            white_image = render_cursor(0xFFFFFF)
            mask_alpha = None
            if mask_bitmap:
                mask_info = win32gui.GetObject(mask_bitmap)
                mask_bits = self._bitmap_bits(mask_bitmap)
                mask_alpha = self._cursor_alpha_from_mask(mask_info, mask_bits, black_image.width, black_image.height)
            cursor_image = self._cursor_rgba_from_drawn_images(black_image, white_image, mask_alpha)

            return CapturedCursor(
                x=int(cursor_x - monitor["left"]),
                y=int(cursor_y - monitor["top"]),
                hotspot_x=hotspot_x,
                hotspot_y=hotspot_y,
                image=cursor_image,
            )
        finally:
            for memdc, bitmap, old_bitmap in reversed(render_items):
                if old_bitmap and memdc:
                    try:
                        win32gui.SelectObject(memdc, old_bitmap)
                    except Exception:
                        logger.debug("cursor memdc restore failed", exc_info=True)
                if bitmap:
                    try:
                        win32gui.DeleteObject(bitmap)
                    except Exception:
                        logger.debug("cursor bitmap cleanup failed", exc_info=True)
                if memdc:
                    try:
                        win32gui.DeleteDC(memdc)
                    except Exception:
                        logger.debug("cursor memdc cleanup failed", exc_info=True)
            if hdc:
                try:
                    win32gui.ReleaseDC(0, hdc)
                except Exception:
                    logger.debug("cursor hdc cleanup failed", exc_info=True)
            if icon_info:
                for handle in (icon_info[3], icon_info[4]):
                    if handle:
                        try:
                            win32gui.DeleteObject(handle)
                        except Exception:
                            logger.debug("cursor icon cleanup failed", exc_info=True)

    def draw_cursor_on_image(self, image, monitor):
        try:
            cursor = self._capture_cursor(monitor)
            return self._composite_cursor(image, cursor)
        except Exception:
            logger.debug("cursor draw on frame failed", exc_info=True)
            try:
                import win32api

                cursor_x, cursor_y = win32api.GetCursorPos()
                return self.draw_fallback_cursor(image, cursor_x - monitor["left"], cursor_y - monitor["top"])
            except Exception:
                logger.debug("fallback cursor draw on frame failed", exc_info=True)
                return image

    def cursor_position(self) -> dict[str, int | str]:
        return self.frame_cursor_position()

    def frame_cursor_position(self) -> dict[str, int | str]:
        import mss
        import win32api
        import win32con

        with mss.mss() as sct:
            monitor = sct.monitors[1]
        cursor_x, cursor_y = win32api.GetCursorPos()
        relative_x = int(cursor_x - monitor["left"])
        relative_y = int(cursor_y - monitor["top"])
        try:
            cursor = self._capture_cursor(monitor)
            if cursor is None:
                self._wake_cursor(win32api, win32con)
                cursor = self._capture_cursor(monitor)
        except Exception:
            logger.debug("cursor payload capture failed", exc_info=True)
            cursor = None
        cursor = self._cursor_for_payload(cursor, relative_x, relative_y)
        return self._cursor_payload(cursor, monitor["width"], monitor["height"], relative_x, relative_y)
