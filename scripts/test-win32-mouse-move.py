import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.input_controller import PyWin32Backend


class FakeWin32Api:
    def __init__(self):
        self.mouse_events = []

    def mouse_event(self, *args):
        self.mouse_events.append(args)


class FakeWin32Con:
    MOUSEEVENTF_MOVE = 1


def test_win32_mouse_move_uses_relative_mouse_event_delta():
    backend = PyWin32Backend.__new__(PyWin32Backend)
    backend.win32api = FakeWin32Api()
    backend.win32con = FakeWin32Con()

    backend.mouse_move(12, -4)

    assert backend.win32api.mouse_events == [(FakeWin32Con.MOUSEEVENTF_MOVE, 12, -4, 0, 0)]


if __name__ == "__main__":
    test_win32_mouse_move_uses_relative_mouse_event_delta()
