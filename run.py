import uvicorn

from app.config import get_settings
from app.main import app

settings = get_settings()

if __name__ == "__main__":
    uvicorn.run(app, host=settings.host, port=settings.port, proxy_headers=True, forwarded_allow_ips="*")
