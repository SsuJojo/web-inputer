from pathlib import Path
import json

from fastapi.testclient import TestClient

from app.main import app, static_dir


def test_index_injects_public_origin_into_available_shell(monkeypatch):
    dist_index = static_dir / "dist" / "index.html"
    original = dist_index.read_text(encoding="utf-8") if dist_index.exists() else None
    dist_index.parent.mkdir(parents=True, exist_ok=True)
    dist_index.write_text(
        '<html><body><div id="app"></div><script type="module" src="/static/dist/assets/app.js"></script></body></html>',
        encoding="utf-8",
    )
    monkeypatch.setattr("app.main.settings.public_origin", "https://example.test")
    try:
        response = TestClient(app).get("/")
    finally:
        if original is None:
            dist_index.unlink(missing_ok=True)
        else:
            dist_index.write_text(original, encoding="utf-8")

    assert response.status_code == 200
    assert 'window.PUBLIC_ORIGIN = "https://example.test"' in response.text
    assert 'type="module"' in response.text


def test_index_falls_back_to_legacy_shell_when_build_missing(monkeypatch):
    monkeypatch.setattr("app.main.settings.public_origin", "https://fallback.test")
    monkeypatch.setattr("app.main.frontend_index_path", lambda: static_dir / "index.html")

    response = TestClient(app).get("/")

    assert response.status_code == 200
    assert "Remote Input" in response.text
    assert 'window.PUBLIC_ORIGIN = "https://fallback.test"' in response.text


def test_pwa_shell_declares_ios_app_assets():
    index_html = (static_dir / "dist" / "index.html").read_text(encoding="utf-8")
    manifest = json.loads((static_dir / "manifest.webmanifest").read_text(encoding="utf-8"))
    icon_path = static_dir / "icons" / "app-icon.svg"
    splash_path = static_dir / "icons" / "app-splash.svg"

    assert '<meta name="mobile-web-app-capable" content="yes"' in index_html
    assert '<link rel="apple-touch-icon" href="/static/icons/app-icon.svg"' in index_html
    assert '<link rel="apple-touch-startup-image" href="/static/icons/app-splash.svg"' in index_html
    assert {"src": "/static/icons/app-icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any maskable"} in manifest["icons"]
    assert icon_path.exists()
    assert splash_path.exists()
    assert "<svg" in icon_path.read_text(encoding="utf-8")
