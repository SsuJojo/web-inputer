from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import app.main as main


async def test_direct_probe_allows_tailscale_health() -> None:
    calls: list[tuple[str, int]] = []
    original = main.check_direct_health

    def fake_check(host: str, port: int) -> bool:
        calls.append((host, port))
        return True

    main.check_direct_health = fake_check
    try:
        result = await main.direct_probe("100.72.54.81", 8790)
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
        result = await main.direct_probe("192.168.1.2", 8790)
    finally:
        main.check_direct_health = original

    assert result == {"ok": False}
    assert calls == [("192.168.1.2", 8790)]


async def test_direct_probe_rejects_public_ip() -> None:
    try:
        await main.direct_probe("8.8.8.8", 8790)
    except Exception as exc:
        assert getattr(exc, "status_code", None) == 400
    else:
        raise AssertionError("public IP should be rejected")


async def main_test() -> None:
    await test_direct_probe_allows_tailscale_health()
    await test_direct_probe_reports_failed_health()
    await test_direct_probe_rejects_public_ip()


if __name__ == "__main__":
    asyncio.run(main_test())
