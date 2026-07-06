import unittest
from unittest.mock import AsyncMock, Mock

from fastapi.testclient import TestClient

import app.main as main
from app.auth import create_session_token
from app.power_control import PowerAction, PowerController, PowerStatus


class PowerApiTests(unittest.TestCase):
    def setUp(self):
        self.original_power_controller = main.power_controller
        self.client = TestClient(main.app)
        token = create_session_token(main.settings, 60)
        self.client.cookies.set("remote_input_session", token)

    def tearDown(self):
        main.power_controller = self.original_power_controller

    def test_power_status_requires_session(self):
        client = TestClient(main.app)

        response = client.get("/api/power/status")

        self.assertEqual(response.status_code, 401)

    def test_power_execute_runs_confirmed_action(self):
        controller = Mock(spec=PowerController)
        controller.validate_confirmation.return_value = None
        controller.execute_now.return_value = PowerStatus(action=PowerAction.LOCK, status="executed")
        main.power_controller = controller

        response = self.client.post("/api/power/execute", json={"action": "lock", "confirm": True})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "executed")
        controller.validate_confirmation.assert_called_once_with(PowerAction.LOCK, True)
        controller.execute_now.assert_called_once_with(PowerAction.LOCK)

    def test_power_schedule_returns_schedule_status(self):
        controller = Mock(spec=PowerController)
        controller.schedule = AsyncMock(return_value=PowerStatus(id="abc", action=PowerAction.SHUTDOWN, status="scheduled", remaining_seconds=60))
        main.power_controller = controller

        response = self.client.post("/api/power/schedule", json={"action": "shutdown", "delay_seconds": 60, "confirm": True})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["id"], "abc")
        self.assertEqual(response.json()["action"], "shutdown")

    def test_power_cancel_reports_cancelled(self):
        controller = Mock(spec=PowerController)
        controller.cancel_schedule.return_value = True
        main.power_controller = controller

        response = self.client.post("/api/power/cancel")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"ok": True, "cancelled": True})


if __name__ == "__main__":
    unittest.main()
