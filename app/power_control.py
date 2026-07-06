from __future__ import annotations

import asyncio
import subprocess
import time
from dataclasses import dataclass
from enum import StrEnum
from typing import Callable
from uuid import uuid4

from pydantic import BaseModel, Field


class PowerAction(StrEnum):
    SLEEP = "sleep"
    HIBERNATE = "hibernate"
    SHUTDOWN = "shutdown"
    RESTART = "restart"
    LOCK = "lock"


class PowerScheduleRequest(BaseModel):
    action: PowerAction
    delay_seconds: float = Field(ge=0, le=86400)
    confirm: bool


class PowerActionRequest(BaseModel):
    action: PowerAction
    confirm: bool


class PowerStatus(BaseModel):
    id: str | None = None
    action: PowerAction | None = None
    status: str
    delay_seconds: float | None = None
    due_at: float | None = None
    remaining_seconds: float | None = None


@dataclass(frozen=True)
class ScheduledPowerAction:
    id: str
    action: PowerAction
    due_at: float
    task: asyncio.Task[None]


CommandRunner = Callable[[list[str]], None]


class PowerController:
    def __init__(self, command_runner: CommandRunner | None = None) -> None:
        self.command_runner = command_runner or self._run_command
        self._scheduled: ScheduledPowerAction | None = None

    def validate_confirmation(self, action: PowerAction, confirm: bool) -> None:
        if not confirm:
            raise ValueError("Power action must be confirmed")

    def execute_now(self, action: PowerAction) -> PowerStatus:
        self.command_runner(self.command_for(action))
        return PowerStatus(action=action, status="executed")

    async def schedule(self, request: PowerScheduleRequest) -> PowerStatus:
        self.validate_confirmation(request.action, request.confirm)
        self.cancel_schedule()
        due_at = time.time() + request.delay_seconds
        schedule_id = uuid4().hex
        task = asyncio.create_task(self._run_scheduled(schedule_id, request.action, request.delay_seconds))
        self._scheduled = ScheduledPowerAction(schedule_id, request.action, due_at, task)
        return self._status_for(self._scheduled)

    def cancel_schedule(self) -> bool:
        if not self._scheduled:
            return False
        self._scheduled.task.cancel()
        self._scheduled = None
        return True

    def current_schedule(self) -> PowerStatus | None:
        if not self._scheduled:
            return None
        return self._status_for(self._scheduled)

    async def _run_scheduled(self, schedule_id: str, action: PowerAction, delay_seconds: float) -> None:
        try:
            await asyncio.sleep(delay_seconds)
            if self._scheduled and self._scheduled.id == schedule_id:
                self.execute_now(action)
                self._scheduled = None
        except asyncio.CancelledError:
            raise

    def _status_for(self, schedule: ScheduledPowerAction) -> PowerStatus:
        remaining = max(0.0, schedule.due_at - time.time())
        return PowerStatus(
            id=schedule.id,
            action=schedule.action,
            status="scheduled",
            delay_seconds=remaining,
            due_at=schedule.due_at,
            remaining_seconds=remaining,
        )

    def command_for(self, action: PowerAction) -> list[str]:
        commands: dict[PowerAction, list[str]] = {
            PowerAction.SLEEP: ["rundll32.exe", "powrprof.dll,SetSuspendState", "0,1,0"],
            PowerAction.HIBERNATE: ["rundll32.exe", "powrprof.dll,SetSuspendState", "1,1,0"],
            PowerAction.SHUTDOWN: ["shutdown.exe", "/s", "/t", "0"],
            PowerAction.RESTART: ["shutdown.exe", "/r", "/t", "0"],
            PowerAction.LOCK: ["rundll32.exe", "user32.dll,LockWorkStation"],
        }
        return commands[action]

    def _run_command(self, command: list[str]) -> None:
        subprocess.run(command, check=True)
