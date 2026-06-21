from __future__ import annotations

import asyncio
import contextlib
import ipaddress
import json
import logging
import time
import urllib.request
from collections import deque
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, AsyncIterator

from fastapi import Depends, FastAPI, HTTPException, Request, Response, WebSocket, WebSocketDisconnect, status
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from app.auth import (
    LoginLimiter,
    create_session_token,
    get_request_ip,
    require_session,
    require_websocket_session,
    validate_origin,
    verify_password,
)
from app.config import Settings, get_settings
from app.input_controller import InputController, InputEvent
from app.screen_preview import ScreenPreviewer
from app.window_switcher import WindowSwitcher

logger = logging.getLogger("remote_input")
settings = get_settings()
login_limiter = LoginLimiter(settings.login_rate_limit_count, settings.login_rate_limit_window_seconds)
input_controller = InputController(settings)
screen_previewer = ScreenPreviewer(settings)
window_switcher = WindowSwitcher()
active_controller_id: str | None = None
active_controller_seen = 0.0
active_controller_lock = None
WINDOW_STATE_PUSH_INTERVAL = 0.25


class LoginRequest(BaseModel):
    password: str = Field(min_length=1, max_length=256)
    keepSignedIn: bool = False


class LoginResponse(BaseModel):
    ok: bool
    ttlSeconds: int


class HealthResponse(BaseModel):
    ok: bool
    activeController: bool


class DirectProbeResponse(BaseModel):
    ok: bool


class ClientLogRequest(BaseModel):
    entries: list[dict[str, Any]] = Field(default_factory=list, max_length=50)


def setup_logging() -> None:
    settings.resolved_log_file.parent.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        level=getattr(logging, settings.log_level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
        handlers=[logging.StreamHandler(), logging.FileHandler(settings.resolved_log_file, encoding="utf-8")],
    )


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    global active_controller_lock
    setup_logging()
    active_controller_lock = __import__("asyncio").Lock()
    await input_controller.start()
    logger.info("remote input service started")
    try:
        yield
    finally:
        await input_controller.stop()
        logger.info("remote input service stopped")


app = FastAPI(title=settings.app_name, lifespan=lifespan)
static_dir = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=static_dir), name="static")


@app.middleware("http")
async def security_headers(request: Request, call_next: Any) -> Response:
    response = await call_next(request)
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "same-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


@app.get("/", include_in_schema=False)
async def index() -> HTMLResponse:
    content = (static_dir / "index.html").read_text(encoding="utf-8")
    public_origin = json.dumps(settings.public_origin.rstrip("/"))
    config_script = f"<script>window.PUBLIC_ORIGIN = {public_origin};</script>"
    content = content.replace("  <script src=\"/static/app.js", f"  {config_script}\n  <script src=\"/static/app.js", 1)
    return HTMLResponse(content)


@app.get("/manifest.webmanifest", include_in_schema=False)
async def manifest() -> FileResponse:
    return FileResponse(static_dir / "manifest.webmanifest")


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(ok=True, activeController=active_controller_id is not None)


def is_direct_probe_host_allowed(host: str) -> bool:
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return host in {"localhost", "127.0.0.1"}
    tailscale_range = ipaddress.ip_network("100.64.0.0/10")
    return ip.is_private or ip.is_loopback or ip in tailscale_range


def check_direct_health(host: str, port: int) -> bool:
    url = f"http://{host}:{port}/health"
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(url, timeout=1.5) as response:
            return response.status == 200
    except Exception:
        return False


@app.get("/api/direct-probe", response_model=DirectProbeResponse)
async def direct_probe(host: str, port: int) -> dict[str, bool]:
    if port < 1 or port > 65535 or not is_direct_probe_host_allowed(host):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid direct target")
    ok = await asyncio.to_thread(check_direct_health, host, port)
    return {"ok": ok}


@app.get("/api/session")
async def session(request: Request) -> dict[str, bool]:
    require_session(request, settings)
    return {"authenticated": True}


@app.post("/api/client-log")
async def client_log(payload: ClientLogRequest, request: Request) -> dict[str, bool]:
    require_session(request, settings)
    client_ip = get_request_ip(request)
    for entry in payload.entries[:50]:
        logger.info("client-log ip=%s entry=%s", client_ip, entry)
    return {"ok": True}


def require_screen_preview(request: Request) -> None:
    require_session(request, settings)
    if not settings.enable_screen_preview:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Screen preview disabled")


@app.get("/api/screen/cursor")
async def screen_cursor(request: Request) -> dict[str, int | str]:
    require_screen_preview(request)
    return await __import__("asyncio").to_thread(screen_previewer.cursor_position)


@app.get("/api/screen/frame")
async def screen_frame(request: Request) -> Response:
    require_screen_preview(request)
    frame = await __import__("asyncio").to_thread(screen_previewer.capture_frame, 1920, 82)
    return Response(frame, media_type="image/jpeg", headers={"Cache-Control": "no-store"})


@app.get("/api/screen/frame-cursor")
async def screen_frame_cursor(request: Request) -> dict[str, int | str]:
    require_screen_preview(request)
    return await __import__("asyncio").to_thread(screen_previewer.frame_cursor_position)


@app.get("/api/screen/stream")
async def screen_stream(request: Request) -> StreamingResponse:
    require_screen_preview(request)
    return StreamingResponse(
        screen_previewer.frames(),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )


@app.post("/api/login", response_model=LoginResponse)
async def login(payload: LoginRequest, request: Request) -> JSONResponse:
    client_ip = get_request_ip(request)
    if not login_limiter.allow(client_ip):
        logger.warning("login rate limited ip=%s", client_ip)
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many attempts")
    if not verify_password(payload.password, settings.admin_password):
        logger.warning("login failed ip=%s", client_ip)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid password")
    trusted_device = payload.keepSignedIn
    ttl_seconds = settings.trusted_device_session_ttl_seconds if trusted_device else settings.session_ttl_seconds
    token = create_session_token(settings, ttl_seconds, trusted_device=trusted_device)
    response = JSONResponse(LoginResponse(ok=True, ttlSeconds=ttl_seconds).model_dump())
    secure_cookie = request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https"
    response.set_cookie(
        "remote_input_session",
        token,
        max_age=ttl_seconds,
        httponly=True,
        secure=secure_cookie,
        samesite="strict",
        path="/",
    )
    logger.info("login success ip=%s trusted_device=%s ttl=%s", client_ip, trusted_device, ttl_seconds)
    return response


@app.post("/api/logout")
async def logout() -> dict[str, bool]:
    response = JSONResponse({"ok": True})
    response.delete_cookie("remote_input_session", path="/")
    return response


class EventLimiter:
    def __init__(self, limit_per_second: int) -> None:
        self.limit_per_second = limit_per_second
        self.events: deque[float] = deque()

    def allow(self) -> bool:
        now = time.monotonic()
        while self.events and now - self.events[0] > 1:
            self.events.popleft()
        if len(self.events) >= self.limit_per_second:
            return False
        self.events.append(now)
        return True


async def acquire_control(client_id: str, force: bool = False) -> bool:
    global active_controller_id, active_controller_seen
    assert active_controller_lock is not None
    async with active_controller_lock:
        now = time.monotonic()
        if not force and active_controller_id and active_controller_id != client_id:
            if now - active_controller_seen <= settings.control_idle_timeout_seconds:
                return False
        active_controller_id = client_id
        active_controller_seen = now
        return True


async def release_control(client_id: str) -> None:
    global active_controller_id, active_controller_seen
    assert active_controller_lock is not None
    async with active_controller_lock:
        if active_controller_id == client_id:
            active_controller_id = None
            active_controller_seen = 0.0


async def send_json(websocket: WebSocket, send_lock: asyncio.Lock, payload: dict[str, Any]) -> None:
    async with send_lock:
        await websocket.send_json(payload)


async def handle_window_message(
    websocket: WebSocket,
    send_lock: asyncio.Lock,
    client_id: str,
    message: dict[str, Any],
    limiter: EventLimiter,
) -> None:
    global active_controller_seen
    if not limiter.allow():
        await send_json(websocket, send_lock, {"type": "window_error", "id": message.get("id"), "message": "Rate limited"})
        return
    if not await acquire_control(client_id):
        await send_json(websocket, send_lock, {"type": "window_error", "id": message.get("id"), "message": "Control locked by another client"})
        return
    active_controller_seen = time.monotonic()
    action = message.get("action")
    logger.info("window action client=%s action=%s direction=%s", client_id, action, message.get("direction"))
    try:
        if action == "state":
            state = await __import__("asyncio").to_thread(window_switcher.snapshot)
        elif action == "switch":
            direction = "left" if message.get("direction") == "left" else "right"
            state = await __import__("asyncio").to_thread(window_switcher.switch, direction)
        elif action == "desktop_changed":
            await __import__("asyncio").sleep(0.45)
            state = await __import__("asyncio").to_thread(window_switcher.notify_desktop_changed)
        else:
            await send_json(websocket, send_lock, {"type": "window_error", "id": message.get("id"), "message": "Unknown window action"})
            return
    except Exception:
        logger.exception("window action failed action=%s", action)
        await send_json(websocket, send_lock, {"type": "window_error", "id": message.get("id"), "message": "Window action failed"})
        return
    response = {"type": "window_state", "id": message.get("id"), **state}
    if state.get("error"):
        response["type"] = "window_error"
    await send_json(websocket, send_lock, response)


async def push_window_state_updates(websocket: WebSocket, send_lock: asyncio.Lock) -> None:
    last_key: tuple[int | None, str] | None = None
    while True:
        await asyncio.sleep(WINDOW_STATE_PUSH_INTERVAL)
        state = await asyncio.to_thread(window_switcher.snapshot)
        current = state.get("current")
        if isinstance(current, dict):
            key = (current.get("hwnd") if isinstance(current.get("hwnd"), int) else None, str(current.get("title") or ""))
        else:
            key = (None, "")
        if key == last_key:
            continue
        last_key = key
        await send_json(websocket, send_lock, {"type": "window_state", "push": True, **state})


async def handle_message(websocket: WebSocket, send_lock: asyncio.Lock, client_id: str, message: dict[str, Any], limiter: EventLimiter) -> None:
    global active_controller_seen
    message_type = message.get("type")
    if message_type == "ping":
        await send_json(websocket, send_lock, {"type": "pong", "ts": message.get("ts"), "serverTs": int(time.time() * 1000)})
        return
    if message_type == "claim":
        await acquire_control(client_id, force=True)
        await send_json(websocket, send_lock, {"type": "control", "ok": True})
        return
    if message_type == "window":
        await handle_window_message(websocket, send_lock, client_id, message, limiter)
        return
    if message_type != "input":
        return
    if not limiter.allow():
        await send_json(websocket, send_lock, {"type": "error", "message": "Rate limited"})
        return
    if not await acquire_control(client_id):
        await send_json(websocket, send_lock, {"type": "error", "message": "Control locked by another client"})
        return
    active_controller_seen = time.monotonic()
    event = InputEvent(
        action=message.get("action"),
        key=message.get("key"),
        text=message.get("text"),
        x=message.get("x"),
        y=message.get("y"),
        button=message.get("button"),
        delta=message.get("delta"),
        dx=message.get("dx"),
        dy=message.get("dy"),
    )
    await input_controller.submit(event)
    await send_json(websocket, send_lock, {"type": "ack", "id": message.get("id")})


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    origin = websocket.headers.get("origin")
    client_host = websocket.client.host if websocket.client else "unknown"
    if not validate_origin(origin, settings):
        logger.warning("websocket rejected origin=%s ip=%s", origin, client_host)
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    try:
        require_websocket_session(websocket, settings)
    except HTTPException:
        logger.warning("websocket unauthorized ip=%s", client_host)
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    await websocket.accept()
    client_id = f"{client_host}:{id(websocket)}"
    limiter = EventLimiter(settings.websocket_rate_limit_per_second)
    logger.info("websocket connected client=%s origin=%s", client_id, origin)
    send_lock = asyncio.Lock()
    window_state_task = asyncio.create_task(push_window_state_updates(websocket, send_lock))
    try:
        await send_json(websocket, send_lock, {"type": "hello", "clientId": client_id})
        while True:
            message = await websocket.receive_json()
            await handle_message(websocket, send_lock, client_id, message, limiter)
    except WebSocketDisconnect:
        logger.info("websocket disconnected client=%s", client_id)
    except Exception:
        logger.exception("websocket error client=%s", client_id)
        await websocket.close(code=status.WS_1011_INTERNAL_ERROR)
    finally:
        window_state_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await window_state_task
        await release_control(client_id)
