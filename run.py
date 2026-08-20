import os
import sys

import uvicorn

from app.config import get_settings
from app.main import app


def _ensure_stdio() -> None:
    # Under pythonw.exe (windowless) sys.stdout/stderr are None. uvicorn's
    # default colored log formatter calls sys.stdout.isatty() while setting
    # up logging, which crashes with AttributeError. Point them at devnull.
    if sys.stdout is None:
        sys.stdout = open(os.devnull, "w")  # noqa: A001 (deliberate shim)
    if sys.stderr is None:
        sys.stderr = open(os.devnull, "w")


_ensure_stdio()

settings = get_settings()

if __name__ == "__main__":
    uvicorn.run(app, host=settings.host, port=settings.port, proxy_headers=True, forwarded_allow_ips="*")
