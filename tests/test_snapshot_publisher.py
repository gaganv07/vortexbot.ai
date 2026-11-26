"""Tests for the outbound HMAC snapshot publisher and replay/validation boundaries."""
from datetime import datetime, timezone
import json

import httpx

from app.services.snapshot_publisher import (
    MAX_PAYLOAD_BYTES,
    build_sanitized_snapshot_payload,
    is_publisher_enabled,
    publish_snapshot_once,
    sign_snapshot_body,
    validate_ingest_url,
)


def _sample_telemetry(connected: bool = True, verified: bool = True):
    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "broker_updated_at": datetime.now(timezone.utc).isoformat(),
        "bot_status": "RUNNING",
        "account_data_verified": verified,
        "connection": {
            "mt5_status": "CONNECTED" if connected else "DISCONNECTED",
            "server": "VantageMarkets-Demo",
            "account_number": 26458461,
            "mode": "DEMO",
        },
        "account": {"balance": 1000.0, "equity": 1010.0, "margin": 20.0, "free_margin": 990.0, "currency": "USD"},
        "open_positions": [{
            "ticket": 101,
            "symbol": "EURUSD",
            "direction": "BUY",
            "volume": 0.01,
            "entry_price": 1.05,
            "current_price": 1.051,
            "sl": 1.045,
            "tp1": 1.055,
            "pnl_usd": 1.0,
            "ai_score": 0.99,
            "trade_reason": "SECRET_ALPHA",
            "magic": 202601,
        }],
    }


def test_publisher_disabled_by_default_and_url_validation(monkeypatch):
    monkeypatch.delenv("VORTEX_SNAPSHOT_PUBLISHER_ENABLED", raising=False)
    assert is_publisher_enabled() is False
    assert validate_ingest_url("https://vortexbot.ai/api/trades") is True
    assert validate_ingest_url("http://vortexbot.ai/api/trades") is False
    assert validate_ingest_url("http://127.0.0.1:3000/api/trades", allow_http_localhost=True) is True


def test_sanitized_payload_excludes_strategy_internals_and_suppresses_unverified():
    assert build_sanitized_snapshot_payload(_sample_telemetry(connected=False), "vortex-main") is None
    assert build_sanitized_snapshot_payload(_sample_telemetry(verified=False), "vortex-main") is None

    payload = build_sanitized_snapshot_payload(_sample_telemetry(), "vortex-main", nonce="nonce-12345678")
    assert payload is not None
    assert payload["request_id"] == "nonce-12345678"
    pos = payload["positions"][0]
    for hidden in ("ai_score", "trade_reason", "magic"):
        assert hidden not in pos


def test_canonical_hmac_signing_and_tamper_detection():
    secret = "a" * 32
    raw = b'{"bot_id":"vortex-main"}'
    ts, sig = sign_snapshot_body(secret, raw, timestamp=1700000000)
    assert ts == "1700000000"
    assert len(sig) == 64
    _, sig2 = sign_snapshot_body(secret, b'{"bot_id":"tampered"}', timestamp=1700000000)
    assert sig != sig2


def test_publish_retries_on_timeout_and_stops_on_4xx():
    secret = "s" * 32
    attempts = {"count": 0}

    def timeout_then_ok(request: httpx.Request) -> httpx.Response:
        attempts["count"] += 1
        assert request.headers["X-Vortext-Timestamp"]
        assert request.headers["X-Vortext-Signature"]
        assert request.headers["X-Vortex-Nonce"]
        if attempts["count"] == 1:
            raise httpx.ReadTimeout("timeout", request=request)
        return httpx.Response(200, json={"ok": True}, request=request)

    client = httpx.Client(transport=httpx.MockTransport(timeout_then_ok))
    res = publish_snapshot_once(
        _sample_telemetry,
        ingest_url="https://example.com/api/trades",
        secret=secret,
        backoff_s=0.0,
        http_client=client,
    )
    assert res["published"] is True
    assert attempts["count"] == 2

    # 409 / 401 must not retry
    attempts["count"] = 0

    def reject_409(request: httpx.Request) -> httpx.Response:
        attempts["count"] += 1
        return httpx.Response(409, json={"ok": False}, request=request)

    client2 = httpx.Client(transport=httpx.MockTransport(reject_409))
    res2 = publish_snapshot_once(
        _sample_telemetry,
        ingest_url="https://example.com/api/trades",
        secret=secret,
        backoff_s=0.0,
        http_client=client2,
    )
    assert res2["published"] is False
    assert res2["status_code"] == 409
    assert attempts["count"] == 1


def test_oversized_payload_rejected_before_network():
    big_tel = _sample_telemetry()
    big_tel["open_positions"] = [
        {"ticket": i, "symbol": "EURUSD" + "X" * 1200, "direction": "BUY", "volume": 0.01}
        for i in range(500)
    ]
    res = publish_snapshot_once(
        lambda: big_tel,
        ingest_url="https://example.com/api/trades",
        secret="s" * 32,
    )
    assert res["published"] is False
    assert res["reason"] == "payload_too_large"
