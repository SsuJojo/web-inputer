import asyncio
import unittest

from app.power_control import PowerAction, PowerController, PowerScheduleRequest


class FakeRunner:
    def __init__(self):
        self.commands = []

    def __call__(self, command):
        self.commands.append(command)


class PowerControllerTests(unittest.IsolatedAsyncioTestCase):
    def test_lock_executes_lock_workstation_immediately(self):
        runner = FakeRunner()
        controller = PowerController(command_runner=runner)

        result = controller.execute_now(PowerAction.LOCK)

        self.assertEqual(result.action, PowerAction.LOCK)
        self.assertEqual(result.status, "executed")
        self.assertEqual(runner.commands, [["rundll32.exe", "user32.dll,LockWorkStation"]])

    def test_shutdown_requires_confirm_true(self):
        controller = PowerController(command_runner=FakeRunner())

        with self.assertRaises(ValueError) as error:
            controller.validate_confirmation(PowerAction.SHUTDOWN, False)

        self.assertEqual(str(error.exception), "Power action must be confirmed")

    async def test_schedule_runs_action_after_delay(self):
        runner = FakeRunner()
        controller = PowerController(command_runner=runner)

        schedule = await controller.schedule(PowerScheduleRequest(action=PowerAction.RESTART, delay_seconds=0.01, confirm=True))
        self.assertEqual(schedule.status, "scheduled")
        self.assertEqual(schedule.action, PowerAction.RESTART)
        self.assertIsNotNone(schedule.due_at)
        await asyncio.sleep(0.04)

        self.assertEqual(runner.commands, [["shutdown.exe", "/r", "/t", "0"]])
        self.assertIsNone(controller.current_schedule())

    async def test_cancel_schedule_prevents_action(self):
        runner = FakeRunner()
        controller = PowerController(command_runner=runner)

        await controller.schedule(PowerScheduleRequest(action=PowerAction.SLEEP, delay_seconds=1, confirm=True))
        cancelled = controller.cancel_schedule()
        await asyncio.sleep(0.02)

        self.assertTrue(cancelled)
        self.assertEqual(runner.commands, [])
        self.assertIsNone(controller.current_schedule())

    async def test_new_schedule_replaces_existing_schedule(self):
        runner = FakeRunner()
        controller = PowerController(command_runner=runner)

        first = await controller.schedule(PowerScheduleRequest(action=PowerAction.SLEEP, delay_seconds=1, confirm=True))
        second = await controller.schedule(PowerScheduleRequest(action=PowerAction.HIBERNATE, delay_seconds=1, confirm=True))

        self.assertNotEqual(first.id, second.id)
        self.assertEqual(controller.current_schedule().id, second.id)
        self.assertEqual(runner.commands, [])


if __name__ == "__main__":
    unittest.main()
