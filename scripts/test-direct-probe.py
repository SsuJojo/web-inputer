from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import app.main as main


def request() -> SimpleNamespace:
    return SimpleNamespace(headers={}, client=SimpleNamespace(host="direct-probe-test"))


async def test_direct_probe_allows_tailscale_health() -> None:
    calls: list[tuple[str, int]] = []
    original = main.check_direct_health

    def fake_check(host: str, port: int) -> bool:
        calls.append((host, port))
        return True

    main.check_direct_health = fake_check
    try:
        result = await main.direct_probe("100.72.54.81", 8790, request())
    finally:
        main.check_direct_health = original

    assert result == {"ok": True}
    assert calls == [("100.72.54.81", 8790)]


async def test_direct_probe_reports_failed_health() -> None:
    calls: list[tuple[str, int]] = []
    original = main.check_direct_health

    def fake_check(host: str, port: int) -> bool:
        calls.append((host, port))
        return False

    main.check_direct_health = fake_check
    try:
        result = await main.direct_probe("100.72.54.81", 8790, request())
    finally:
        main.check_direct_health = original

    assert result == {"ok": False}
    assert calls == [("100.72.54.81", 8790)]


async def assert_rejected(host: str, port: int = 8790) -> None:
    try:
        await main.direct_probe(host, port, request())
    except Exception as exc:
        assert getattr(exc, "status_code", None) == 400
    else:
        raise AssertionError(f"direct target should be rejected: {host}:{port}")


async def test_direct_probe_rejects_unsafe_targets() -> None:
    await assert_rejected("localhost")
    await assert_rejected("127.0.0.1")
    await assert_rejected("192.168.1.2")
    await assert_rejected("169.254.169.254")
    await assert_rejected("8.8.8.8")
    await assert_rejected("100.72.54.81", 8080)


async def main_test() -> None:
    await test_direct_probe_allows_tailscale_health()
    await test_direct_probe_reports_failed_health()
    await test_direct_probe_rejects_unsafe_targets()


if __name__ == "__main__":
    asyncio.run(main_test())
