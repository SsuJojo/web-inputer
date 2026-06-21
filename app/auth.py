from __future__ import annotations

import hmac
import ipaddress
import time
from urllib.parse import urlparse
from collections import defaultdict, deque
from dataclasses import dataclass
from typing import Deque

import jwt
from fastapi import HTTPException, Request, WebSocket, status
from passlib.context import CryptContext

from app.config import Settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


@dataclass
class RateLimitBucket:
    attempts: Deque[float]


class LoginLimiter:
    def __init__(self, limit: int, window_seconds: int) -> None:
        self.limit = limit
        self.window_seconds = window_seconds
        self.buckets: defaultdict[str, RateLimitBucket] = defaultdict(lambda: RateLimitBucket(deque()))

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        bucket = self.buckets[key].attempts
        while bucket and now - bucket[0] > self.window_seconds:
            bucket.popleft()
        if len(bucket) >= self.limit:
            return False
        bucket.append(now)
        return True


def verify_password(password: str, configured_password: str) -> bool:
    if configured_password.startswith("$2"):
        return pwd_context.verify(password, configured_password)
    return hmac.compare_digest(password, configured_password)


def create_session_token(settings: Settings, ttl_seconds: int, trusted_device: bool = False) -> str:
    now = int(time.time())
    payload = {"sub": "admin", "iat": now, "exp": now + ttl_seconds, "trustedDevice": trusted_device}
    return jwt.encode(payload, settings.secret_key, algorithm="HS256")


def decode_session_token(token: str, settings: Settings) -> dict[str, object]:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired") from exc
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session") from exc
    return payload


def get_request_ip(request: Request) -> str:
    forwarded = request.headers.get("cf-connecting-ip") or request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",", 1)[0].strip()
    return request.client.host if request.client else "unknown"


def require_session(request: Request, settings: Settings) -> dict[str, object]:
    token = request.cookies.get("remote_input_session")
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing session")
    return decode_session_token(token, settings)


def get_websocket_token(websocket: WebSocket) -> str | None:
    cookie_token = websocket.cookies.get("remote_input_session")
    query_token = websocket.query_params.get("token")
    return cookie_token or query_token


def require_websocket_session(websocket: WebSocket, settings: Settings) -> dict[str, object]:
    token = get_websocket_token(websocket)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing session")
    return decode_session_token(token, settings)


def validate_origin(origin: str | None, settings: Settings) -> bool:
    if not origin:
        return False
    if origin in settings.effective_origins:
        return True
    parsed = urlparse(origin)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        return False
    try:
        ip = ipaddress.ip_address(parsed.hostname)
    except ValueError:
        return parsed.hostname in {"localhost", "127.0.0.1"}
    tailscale_range = ipaddress.ip_network("100.64.0.0/10")
    return ip.is_private or ip.is_loopback or ip in tailscale_range
