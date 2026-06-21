from functools import lru_cache
from pathlib import Path
from secrets import token_hex, token_urlsafe

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

ENV_PATH = Path(".env")


class Settings(BaseSettings):
    app_name: str = "Phone Remote Input"
    host: str = "127.0.0.1"
    port: int = 8787
    public_origin: str = "https://your-domain.example.com"
    secret_key: str = Field(min_length=32)
    admin_password: str = Field(min_length=8)
    session_ttl_seconds: int = 60 * 60 * 8
    trusted_device_session_ttl_seconds: int = 60 * 60 * 24 * 30
    login_rate_limit_count: int = 5
    login_rate_limit_window_seconds: int = 60
    websocket_rate_limit_per_second: int = 80
    control_idle_timeout_seconds: int = 20
    log_level: str = "INFO"
    log_file: str = "logs/remote-input.log"
    enable_clipboard: bool = True
    enable_mouse: bool = True
    enable_screen_preview: bool = True
    screen_preview_fps: int = 5
    screen_preview_quality: int = 45
    screen_preview_max_width: int = 960
    allowed_origins: str = ""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def effective_origins(self) -> set[str]:
        configured = {item.strip() for item in self.allowed_origins.split(",") if item.strip()}
        return {self.public_origin, *configured}

    @property
    def resolved_log_file(self) -> Path:
        return Path(self.log_file)


def ensure_env_file() -> str | None:
    """Generate a .env with fresh secrets when none exists. Returns the generated admin password, else None."""
    if ENV_PATH.exists():
        return None
    secret_key = token_hex(32)
    admin_password = token_urlsafe(12)
    template = f"""# Auto-generated on first run. Review and edit before exposing publicly.
HOST=0.0.0.0
PORT=8790
PUBLIC_ORIGIN=https://your-domain.example.com
ALLOWED_ORIGINS=https://your-domain.example.com
SECRET_KEY={secret_key}
ADMIN_PASSWORD={admin_password}
SESSION_TTL_SECONDS=28800
TRUSTED_DEVICE_SESSION_TTL_SECONDS=2592000
LOGIN_RATE_LIMIT_COUNT=5
LOGIN_RATE_LIMIT_WINDOW_SECONDS=60
WEBSOCKET_RATE_LIMIT_PER_SECOND=80
CONTROL_IDLE_TIMEOUT_SECONDS=20
LOG_LEVEL=INFO
LOG_FILE=logs/remote-input.log
ENABLE_CLIPBOARD=true
ENABLE_MOUSE=true
ENABLE_SCREEN_PREVIEW=true
SCREEN_PREVIEW_FPS=5
SCREEN_PREVIEW_QUALITY=45
SCREEN_PREVIEW_MAX_WIDTH=960
"""
    ENV_PATH.write_text(template, encoding="utf-8")
    return admin_password


@lru_cache
def get_settings() -> Settings:
    generated_password = ensure_env_file()
    settings = Settings()  # type: ignore[call-arg]
    if generated_password is not None:
        print("=" * 60, flush=True)
        print(f"Generated {ENV_PATH.resolve()}", flush=True)
        print(f"ADMIN_PASSWORD: {generated_password}", flush=True)
        print("Change it and PUBLIC_ORIGIN before public use.", flush=True)
        print("=" * 60, flush=True)
    return settings
