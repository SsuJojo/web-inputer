from __future__ import annotations

import asyncio
import logging
import subprocess
import time
from dataclasses import dataclass
from enum import StrEnum
from typing import Callable
from uuid import uuid4

from pydantic import BaseModel, Field, model_validator


logger = logging.getLogger(__name__)


class PowerCommandError(RuntimeError):
    pass


class PowerAction(StrEnum):
    SLEEP = "sleep"
    HIBERNATE = "hibernate"
    SHUTDOWN = "shutdown"
    RESTART = "restart"
    LOCK = "lock"


def normalize_delay_seconds(data: object) -> object:
    if isinstance(data, dict) and "delay_seconds" in data and "delaySeconds" not in data:
        return {**data, "delaySeconds": data["delay_seconds"]}
    return data


class PowerCommandRequest(BaseModel):
    action: PowerAction | None = None
    delaySeconds: float = Field(default=0, ge=0, le=86400)
    confirm: bool = False

    @model_validator(mode="before")
    @classmethod
    def accept_snake_case_delay(cls, data: object) -> object:
        return normalize_delay_seconds(data)


class PowerScheduleRequest(BaseModel):
    action: PowerAction
    delaySeconds: float = Field(ge=0, le=86400)
    confirm: bool = False

    @model_validator(mode="before")
    @classmethod
    def accept_snake_case_delay(cls, data: object) -> object:
        return normalize_delay_seconds(data)


class PowerActionRequest(BaseModel):
    action: PowerAction
    confirm: bool = False


class ScheduledPowerStatus(BaseModel):
    id: str
    action: PowerAction
    status: str = "scheduled"
    delaySeconds: float
    dueAt: float
    remainingSeconds: float


class PowerStatus(BaseModel):
    available: bool = True
    status: str
    message: str | None = None
    scheduled: ScheduledPowerStatus | None = None
    id: str | None = None
    action: PowerAction | None = None


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
        try:
            self.command_runner(self.command_for(action))
        except PowerCommandError:
            raise
        except (OSError, subprocess.CalledProcessError) as exc:
            raise PowerCommandError("Power command failed") from exc
        return PowerStatus(action=action, status="executed")

    async def schedule(self, request: PowerScheduleRequest) -> PowerStatus:
        self.validate_confirmation(request.action, request.confirm)
        self.cancel_schedule()
        due_at = time.time() + request.delaySeconds
        schedule_id = uuid4().hex
        task = asyncio.create_task(self._run_scheduled(schedule_id, request.action, request.delaySeconds))
        self._scheduled = ScheduledPowerAction(schedule_id, request.action, due_at, task)
        return self._status_response_for(self._scheduled)

    def cancel_schedule(self) -> bool:
        if not self._scheduled:
            return False
        self._scheduled.task.cancel()
        self._scheduled = None
        return True

    def current_schedule(self) -> ScheduledPowerStatus | None:
        if not self._scheduled:
            return None
        return self._scheduled_status_for(self._scheduled)

    async def _run_scheduled(self, schedule_id: str, action: PowerAction, delay_seconds: float) -> None:
        try:
            await asyncio.sleep(delay_seconds)
            if self._scheduled and self._scheduled.id == schedule_id:
                self.execute_now(action)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("scheduled power command failed action=%s", action)
        finally:
            if self._scheduled and self._scheduled.id == schedule_id:
                self._scheduled = None

    def _scheduled_status_for(self, schedule: ScheduledPowerAction) -> ScheduledPowerStatus:
        remaining = max(0.0, schedule.due_at - time.time())
        return ScheduledPowerStatus(
            id=schedule.id,
            action=schedule.action,
            delaySeconds=remaining,
            dueAt=schedule.due_at,
            remainingSeconds=remaining,
        )

    def _status_response_for(self, schedule: ScheduledPowerAction) -> PowerStatus:
        scheduled = self._scheduled_status_for(schedule)
        return PowerStatus(
            status="scheduled",
            scheduled=scheduled,
            id=scheduled.id,
            action=scheduled.action,
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
        try:
            subprocess.run(command, check=True)
        except (OSError, subprocess.CalledProcessError) as exc:
            raise PowerCommandError("Power command failed") from exc
