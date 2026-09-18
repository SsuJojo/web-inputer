from types import SimpleNamespace

from app.auth import get_websocket_token


def test_websocket_session_token_is_not_read_from_query_string():
    websocket = SimpleNamespace(
        cookies={},
        query_params={"token": "token-that-must-not-be-accepted"},
    )

    assert get_websocket_token(websocket) is None


def test_websocket_session_token_is_read_from_cookie():
    websocket = SimpleNamespace(
        cookies={"remote_input_session": "cookie-token"},
        query_params={"token": "query-token"},
    )

    assert get_websocket_token(websocket) == "cookie-token"
