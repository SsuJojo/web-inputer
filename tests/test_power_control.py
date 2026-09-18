import asyncio
import subprocess

from fastapi.testclient import TestClient

import app.main as main
from app.power_control import PowerController, PowerScheduleRequest


def allow_session(_request, _settings):
    return None


def test_windows_power_command_mapping_uses_explicit_sleep_and_hibernate_commands():
    controller = PowerController()

    hibernate_command = controller.command_for("hibernate")
    assert hibernate_command[:4] == ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass"]
    assert "SetSuspendState" in hibernate_command[-1]
    assert "PowrProf.dll" in hibernate_command[-1]
    sleep_command = controller.command_for("sleep")
    assert sleep_command[:4] == ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass"]
    assert "SendInput" in sleep_command[-1]
    assert "0x5B" in sleep_command[-1]
    assert "0x16" in sleep_command[-1]
    assert "0x1F" in sleep_command[-1]
    assert "0x2A" in sleep_command[-1]
    assert "shutdown.exe" not in sleep_command[-1]


def test_power_action_requires_explicit_confirm(monkeypatch):
    commands = []
    controller = PowerController(command_runner=commands.append)
    monkeypatch.setattr(main, "require_session", allow_session)
    monkeypatch.setattr(main, "power_controller", controller)

    response = TestClient(main.app).post("/api/power/lock", json={"action": "lock"})

    assert response.status_code == 400
    assert response.json()["detail"] == "Power action must be confirmed"
    assert commands == []


def test_power_schedule_confirm_and_cancel():
    async def run_case():
        commands = []
        controller = PowerController(command_runner=commands.append)
        await controller.schedule(PowerScheduleRequest(action="lock", delaySeconds=60, confirm=True))

        assert controller.current_schedule() is not None
        assert controller.cancel_schedule() is True
        assert controller.current_schedule() is None
        assert commands == []

    asyncio.run(run_case())
def test_power_command_failure_returns_controlled_api_error(monkeypatch):
    def fail_command(_command):
        raise subprocess.CalledProcessError(1, ["shutdown.exe"])

    controller = PowerController(command_runner=fail_command)
    monkeypatch.setattr(main, "require_session", allow_session)
    monkeypatch.setattr(main, "power_controller", controller)

    response = TestClient(main.app).post("/api/power/lock", json={"action": "lock", "confirm": True})

    assert response.status_code == 500
    assert response.json()["detail"] == "Power command failed"


def test_failed_scheduled_power_command_clears_schedule():
    def fail_command(_command):
        raise subprocess.CalledProcessError(1, ["shutdown.exe"])

    async def run_case():
        controller = PowerController(command_runner=fail_command)
        await controller.schedule(PowerScheduleRequest(action="lock", delaySeconds=0.01, confirm=True))
        await asyncio.sleep(0.05)
        assert controller.current_schedule() is None

    asyncio.run(run_case())
