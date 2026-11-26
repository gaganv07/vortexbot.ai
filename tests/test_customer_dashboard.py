"""Comprehensive security, telemetry, freshness, timezone, and regression checks for the customer dashboard."""
from datetime import datetime, timezone
from pathlib import Path
import ast
import math
import types

import httpx
from fastapi.testclient import TestClient

import dashboard.control_center as cc
from dashboard.telemetry_utils import (
    convert_mt5_broker_epoch_to_utc,
    evaluate_broker_freshness,
    validate_finite_number,
)

ROOT = Path(__file__).resolve().parents[1]
CONTROL = ROOT / "dashboard" / "control_center.py"
OPERATOR_HTML = ROOT / "dashboard" / "templates" / "control_center.html"
CUSTOMER_HTML = ROOT / "dashboard" / "templates" / "customer_dashboard.html"


def _mock_supabase_auth(monkeypatch, token_map: dict[str, dict]):
    """Mock httpx.AsyncClient.get for /auth/v1/user verification without bypassing auth logic."""
    async def fake_get(self, url, headers=None, params=None):
        req = httpx.Request("GET", url)
        if url.endswith("/auth/v1/user"):
            auth = (headers or {}).get("Authorization", "")
            tok = auth[7:].strip() if auth.startswith("Bearer ") else ""
            if tok == "expired-token":
                return httpx.Response(401, json={"error": "token_expired"}, request=req)
            if tok in token_map:
                return httpx.Response(200, json=token_map[tok], request=req)
            return httpx.Response(401, json={"error": "invalid_jwt"}, request=req)
        return httpx.Response(404, json={}, request=req)

    monkeypatch.setattr(httpx.AsyncClient, "get", fake_get)


UUID_A = "11111111-1111-4111-8111-111111111111"
UUID_B = "22222222-2222-4222-8222-222222222222"


def _configure_valid_customer_env(
    monkeypatch,
    account_map: str = f'{{"{UUID_A}": ["26458461"], "{UUID_B}": ["99999999"]}}',
):
    monkeypatch.setenv("SUPABASE_URL", "https://xtyszeuvtfcgognkrwxv.supabase.co")
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test_key_12345")
    monkeypatch.setenv("VORTEX_CUSTOMER_ACCOUNT_MAP", account_map)
    monkeypatch.delenv("SUPABASE_SECRET_KEY", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)


def _fresh_telemetry(account_number: int = 26458461):
    now_iso = datetime.now(timezone.utc).isoformat()
    return {
        "timestamp": now_iso,
        "polled_at": now_iso,
        "bot_status": "RUNNING",
        "broker_updated_at": now_iso,
        "broker_data_age_s": 1.0,
        "broker_stale": False,
        "heartbeat_age_s": 999.0,
        "account_data_verified": True,
        "connection": {
            "mt5_status": "CONNECTED",
            "internet_status": "ONLINE",
            "broker": "Vantage Markets",
            "server": "VantageMarkets-Demo",
            "account_number": account_number,
            "mode": "DEMO",
        },
        "system": {"cpu_pct": 10.0},
        "account": {"balance": 1000.0, "equity": 1012.5, "free_margin": 950.0, "floating_pnl": 12.5, "closed_pnl": 45.0, "currency": "USD"},
        "open_positions": [{
            "ticket": 123456, "symbol": "EURUSD", "direction": "BUY", "volume": 0.01,
            "entry_price": 1.05, "current_price": 1.05125, "sl": 1.045, "tp1": 1.055, "tp2": 1.06,
            "pnl_usd": 12.5, "entry_time": now_iso,
            "ai_score": 0.91, "signal_score": 0.88, "trade_reason": "Internal secret", "magic": 202601, "risk_usd": 5.0,
        }],
    }


def test_customer_dashboard_is_separate_from_operator_console():
    operator = OPERATOR_HTML.read_text(encoding="utf-8")
    customer = CUSTOMER_HTML.read_text(encoding="utf-8")
    assert 'href="/customer"' in operator
    assert "Private trading dashboard" in customer
    assert "READ-ONLY VIEW" in customer
    assert 'href="/"' in customer
    assert "/assets/vortex-ai-logo.webp" in customer
    assert "X-Vortex-Customer-Id" not in customer
    assert "SUPABASE_SERVICE_ROLE_KEY" not in customer


def test_customer_dashboard_uses_local_read_only_snapshot_api():
    customer = CUSTOMER_HTML.read_text(encoding="utf-8")
    assert "fetch('/api/v2/customer_snapshot'" in customer
    assert "setInterval(refresh,10000)" in customer
    assert "No cached or simulated figures are displayed" in customer


def test_customer_dashboard_responsive_styles_and_touch_targets():
    customer = CUSTOMER_HTML.read_text(encoding="utf-8")
    assert "@media (max-width: 980px)" in customer
    assert "@media (max-width: 640px)" in customer
    assert "overflow-x: hidden" in customer
    assert "overflow-x: auto" in customer
    assert "min-height: 42px" in customer


def test_customer_snapshot_suppresses_fallback_account_metrics_when_disconnected():
    source = CONTROL.read_text(encoding="utf-8")
    tree = ast.parse(source)
    functions = {node.name: node for node in ast.walk(tree) if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))}
    snapshot = ast.get_source_segment(source, functions["get_customer_snapshot"])
    assert 'mt5_status") == "CONNECTED"' in snapshot
    assert 'account_data_verified") is True' in snapshot
    assert '"account": account' in snapshot
    assert '"positions": sanitized_positions' in snapshot
    assert '"account_number": connection.get("account_number") if connected else None' in snapshot


def test_customer_routes_are_get_only_and_operator_route_remains():
    source = CONTROL.read_text(encoding="utf-8")
    assert '@app.get("/customer"' in source
    assert '@app.get("/api/v2/customer_snapshot")' in source
    assert '@app.get("/api/v2/customer_auth_config")' in source
    assert '@app.get("/", response_class=HTMLResponse)' in source
    assert '@app.websocket("/ws/live")' in source


def test_runtime_customer_and_operator_html_and_assets():
    client = TestClient(cc.app)

    r_cust = client.get("/customer")
    assert r_cust.status_code == 200
    assert r_cust.headers.get("cache-control") == "no-store, max-age=0"
    assert "Your trading activity" in r_cust.text

    r_ops = client.get("/")
    assert r_ops.status_code == 200
    assert 'href="/customer"' in r_ops.text

    r_logo = client.get("/assets/vortex-ai-logo.webp")
    assert r_logo.status_code == 200
    assert len(r_logo.content) > 0

    r_icon = client.get("/assets/favicon.svg")
    assert r_icon.status_code == 200


def test_fail_closed_auth_and_account_ownership(monkeypatch):
    client = TestClient(cc.app)
    monkeypatch.setattr(cc, "_get_live_telemetry", lambda: _fresh_telemetry(26458461))
    monkeypatch.setattr(cc, "_read_trade_journal", lambda limit=20: [])

    # 1. Missing auth config fails closed by default (503) — even without env flags
    for k in ("SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY", "VORTEX_CUSTOMER_ACCOUNT_MAP", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"):
        monkeypatch.delenv(k, raising=False)
    assert client.get("/api/v2/customer_snapshot").status_code == 503
    assert client.get("/api/v2/health").status_code == 200

    # 2. Missing account mapping fails closed (503)
    monkeypatch.setenv("SUPABASE_URL", "https://xtyszeuvtfcgognkrwxv.supabase.co")
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test_key_12345")
    assert client.get("/api/v2/customer_snapshot", headers={"Authorization": "Bearer tok-a"}).status_code == 503

    # 3. Malformed or non-UUID account mapping fails closed (503)
    monkeypatch.setenv("VORTEX_CUSTOMER_ACCOUNT_MAP", "{not-json")
    assert client.get("/api/v2/customer_snapshot", headers={"Authorization": "Bearer tok-a"}).status_code == 503
    monkeypatch.setenv("VORTEX_CUSTOMER_ACCOUNT_MAP", '{"a@example.com": ["26458461"]}')
    assert client.get("/api/v2/customer_snapshot", headers={"Authorization": "Bearer tok-a"}).status_code == 503

    # 4. Valid config + mocked Supabase /auth/v1/user (UUID + email_confirmed_at)
    _configure_valid_customer_env(monkeypatch)
    _mock_supabase_auth(monkeypatch, {
        "tok-a": {"id": UUID_A, "email": "a@example.com", "email_confirmed_at": "2026-11-26T00:00:00Z"},
        "tok-b": {"id": UUID_B, "email": "b@example.com", "email_confirmed_at": "2026-11-26T00:00:00Z"},
        "tok-unverified": {"id": UUID_A, "email": "a@example.com", "email_confirmed_at": None},
        "tok-b-changed-email": {"id": UUID_B, "email": "a@example.com", "email_confirmed_at": "2026-11-26T00:00:00Z"},
    })

    # Missing, invalid, expired token -> 401; unverified email -> 403
    assert client.get("/api/v2/customer_snapshot").status_code == 401
    assert client.get("/api/v2/customer_snapshot", headers={"Authorization": "Bearer bad-tok"}).status_code == 401
    assert client.get("/api/v2/customer_snapshot", headers={"Authorization": "Bearer expired-token"}).status_code == 401
    assert client.get("/api/v2/customer_snapshot", headers={"Authorization": "Bearer tok-unverified"}).status_code == 403

    # Email change by User B to User A's email cannot transfer User A's account ownership (403)
    assert client.get(
        "/api/v2/customer_snapshot?account_id=26458461",
        headers={"Authorization": "Bearer tok-b-changed-email"},
    ).status_code == 403

    # Forged X-Vortex-Customer-Id header cannot elevate tok-b to user-a's account (403)
    assert client.get(
        "/api/v2/customer_snapshot?account_id=26458461",
        headers={"Authorization": "Bearer tok-b", "X-Vortex-Customer-Id": UUID_A},
    ).status_code == 403

    # Customer A requesting Customer B's account -> 403; invalid account format -> 400
    assert client.get("/api/v2/customer_snapshot?account_id=99999999", headers={"Authorization": "Bearer tok-a"}).status_code == 403
    assert client.get("/api/v2/customer_snapshot?account_id=../bad", headers={"Authorization": "Bearer tok-a"}).status_code == 400

    # Valid Customer A accessing own account -> 200 with no-store & stripped internal fields
    res = client.get("/api/v2/customer_snapshot?account_id=26458461", headers={"Authorization": "Bearer tok-a"})
    assert res.status_code == 200
    assert res.headers.get("cache-control") == "no-store, max-age=0"
    data = res.json()
    assert data["connected"] is True
    assert data["fresh"] is True
    for hidden in ("ai_score", "signal_score", "trade_reason", "magic", "risk_usd"):
        assert hidden not in data["positions"][0]


def test_runtime_telemetry_numeric_freshness_and_suppression(monkeypatch):
    client = TestClient(cc.app)
    _configure_valid_customer_env(monkeypatch)
    _mock_supabase_auth(monkeypatch, {"tok-a": {"id": UUID_A, "email": "a@example.com", "email_confirmed_at": "2026-11-26T00:00:00Z"}})
    monkeypatch.setattr(cc, "_read_trade_journal", lambda limit=20: [])
    hdr = {"Authorization": "Bearer tok-a"}

    # 1. Stale broker telemetry (>30s)
    stale_t = _fresh_telemetry(26458461)
    stale_t["broker_data_age_s"] = 45.0
    stale_t["broker_stale"] = True
    monkeypatch.setattr(cc, "_get_live_telemetry", lambda: stale_t)
    stale_res = client.get("/api/v2/customer_snapshot", headers=hdr).json()
    assert stale_res["connected"] is True
    assert stale_res["stale"] is True
    assert stale_res["fresh"] is False

    # 2. Unverified telemetry suppresses financials
    unv_t = _fresh_telemetry(26458461)
    unv_t["account_data_verified"] = False
    monkeypatch.setattr(cc, "_get_live_telemetry", lambda: unv_t)
    unv_res = client.get("/api/v2/customer_snapshot", headers=hdr).json()
    assert unv_res["connected"] is False
    assert unv_res["account"] == {}
    assert unv_res["positions"] == []
    assert unv_res["account_number"] is None

    # 3. Disconnected suppresses financials
    disc_t = _fresh_telemetry(26458461)
    disc_t["connection"]["mt5_status"] = "DISCONNECTED"
    disc_t["account_data_verified"] = False
    monkeypatch.setattr(cc, "_get_live_telemetry", lambda: disc_t)
    disc_res = client.get("/api/v2/customer_snapshot", headers=hdr).json()
    assert disc_res["connected"] is False
    assert disc_res["account"] == {}
    assert disc_res["history"] == []


def test_defensive_numeric_validation_and_live_telemetry_no_crash(monkeypatch):
    # Direct unit checks for validate_finite_number
    for bad in (None, True, False, float("nan"), float("inf"), float("-inf"), "NaN", "abc", "", [], {}):
        assert validate_finite_number(bad) is None
    assert validate_finite_number(257.5) == 257.5
    assert validate_finite_number("100.25") == 100.25

    # _get_live_telemetry() must NOT crash on None / bool / NaN / string balance/equity
    orig_orch = cc._orchestrator
    try:
        for bad_acct in (
            None,
            {},
            {"login": 26458461, "balance": None, "equity": 100.0},
            {"login": 26458461, "balance": True, "equity": 100.0},
            {"login": 26458461, "balance": float("nan"), "equity": 100.0},
            {"login": 26458461, "balance": "bad", "equity": float("inf")},
        ):
            cc._orchestrator = types.SimpleNamespace(
                _running=True,
                client=types.SimpleNamespace(connected=True, get_account=lambda a=bad_acct: a),
            )
            tel = cc._get_live_telemetry()
            assert tel["account_data_verified"] is False
    finally:
        cc._orchestrator = orig_orch


def test_mt5_timezone_conversion_and_freshness_boundaries():
    # Winter (EET = UTC+2): 2026-01-15 12:00:00 broker -> 10:00:00 UTC
    winter_epoch = int(datetime(2026, 1, 15, 12, 0, 0, tzinfo=timezone.utc).timestamp())
    dt_w, err_w = convert_mt5_broker_epoch_to_utc(winter_epoch, "Europe/Athens")
    assert err_w is None and dt_w == datetime(2026, 1, 15, 10, 0, 0, tzinfo=timezone.utc)

    # Summer (EEST = UTC+3): 2026-07-15 12:00:00 broker -> 09:00:00 UTC
    summer_epoch = int(datetime(2026, 7, 15, 12, 0, 0, tzinfo=timezone.utc).timestamp())
    dt_s, err_s = convert_mt5_broker_epoch_to_utc(summer_epoch, "Europe/Athens")
    assert err_s is None and dt_s == datetime(2026, 7, 15, 9, 0, 0, tzinfo=timezone.utc)

    # DST fall-back ambiguous hour (2026-10-25 03:30:00 Europe/Athens): fold=0 (+3) vs fold=1 (+2)
    ambig_epoch = int(datetime(2026, 10, 25, 3, 30, 0, tzinfo=timezone.utc).timestamp())
    dt_f0, _ = convert_mt5_broker_epoch_to_utc(ambig_epoch, "Europe/Athens", fold=0)
    dt_f1, _ = convert_mt5_broker_epoch_to_utc(ambig_epoch, "Europe/Athens", fold=1)
    assert dt_f0 == datetime(2026, 10, 25, 0, 30, 0, tzinfo=timezone.utc)
    assert dt_f1 == datetime(2026, 10, 25, 1, 30, 0, tzinfo=timezone.utc)

    # DST spring-forward nonexistent time (2026-03-29 03:30:00 Europe/Athens)
    gap_epoch = int(datetime(2026, 3, 29, 3, 30, 0, tzinfo=timezone.utc).timestamp())
    dt_gap, err_gap = convert_mt5_broker_epoch_to_utc(gap_epoch, "Europe/Athens")
    assert dt_gap is None and err_gap == "nonexistent_dst_time"

    # Invalid timezone
    dt_tz, err_tz = convert_mt5_broker_epoch_to_utc(winter_epoch, "Invalid/Zone")
    assert dt_tz is None and err_tz == "invalid_timezone"

    # Freshness boundaries: missing, future (>60s), stale (>30s), fresh
    now = datetime(2026, 11, 26, 12, 0, 0, tzinfo=timezone.utc)
    assert evaluate_broker_freshness(None, now)[0] is True
    assert evaluate_broker_freshness(datetime(2026, 11, 26, 12, 5, 0, tzinfo=timezone.utc), now)[2] == "future_broker_timestamp"
    assert evaluate_broker_freshness(datetime(2026, 11, 26, 11, 59, 0, tzinfo=timezone.utc), now)[2] == "stale_broker_timestamp"
    assert evaluate_broker_freshness(datetime(2026, 11, 26, 11, 59, 50, tzinfo=timezone.utc), now) == (False, 10.0, "fresh")


def test_cors_and_websocket_origin_auth(monkeypatch):
    client = TestClient(cc.app)
    # Untrusted CORS origin must not receive Access-Control-Allow-Origin
    r = client.get("/api/v2/health", headers={"Origin": "https://evil.example.com"})
    assert r.headers.get("access-control-allow-origin") is None

    # WebSocket rejects untrusted Origin and missing auth when VORTEX_REQUIRE_AUTH=true
    monkeypatch.setenv("VORTEX_REQUIRE_AUTH", "true")
    monkeypatch.setenv("VORTEX_CONTROL_SECRET", "ops-secret-123456")
    try:
        with client.websocket_connect("/ws/live", headers={"Origin": "https://evil.example.com"}):
            assert False, "Untrusted origin should be rejected"
    except Exception:
        pass

    try:
        with client.websocket_connect("/ws/live"):
            assert False, "Unauthenticated WebSocket should be rejected"
    except Exception:
        pass
