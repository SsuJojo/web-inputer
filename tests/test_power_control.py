import asyncio
import subprocess

from fastapi.testclient import TestClient

import app.main as main
from app.power_control import PowerController, PowerScheduleRequest


def allow_session(_request, _settings):
    return None


def test_windows_power_command_mapping_uses_explicit_sleep_and_hibernate_commands():
    controller = PowerController()

    assert controller.command_for("hibernate") == ["shutdown.exe", "/h"]
    assert controller.command_for("sleep") == ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Application]::SetSuspendState([System.Windows.Forms.PowerState]::Suspend, $false, $false) | Out-Null"]


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
