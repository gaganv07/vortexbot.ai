"""Regression and runtime checks for the isolated read-only customer dashboard."""
from pathlib import Path
import ast
from fastapi.testclient import TestClient

import dashboard.control_center as cc

ROOT = Path(__file__).resolve().parents[1]
CONTROL = ROOT / "dashboard" / "control_center.py"
OPERATOR_HTML = ROOT / "dashboard" / "templates" / "control_center.html"
CUSTOMER_HTML = ROOT / "dashboard" / "templates" / "customer_dashboard.html"


def test_customer_dashboard_is_separate_from_operator_console():
    operator = OPERATOR_HTML.read_text(encoding="utf-8")
    customer = CUSTOMER_HTML.read_text(encoding="utf-8")
    assert 'href="/customer"' in operator
    assert "Private trading dashboard" in customer
    assert "READ-ONLY VIEW" in customer
    assert 'href="/"' in customer
    assert "/assets/vortex-ai-logo.webp" in customer


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


def test_runtime_customer_snapshot_connected_stale_disconnected_and_isolation(monkeypatch):
    client = TestClient(cc.app)
    cc._last_verified_broker_update = None

    # 1. Connected & fresh
    monkeypatch.setattr(cc, "_get_live_telemetry", lambda: {
        "timestamp": "2026-11-25T18:00:00+00:00",
        "heartbeat_age_s": 2.5,
        "account_data_verified": True,
        "connection": {
            "mt5_status": "CONNECTED",
            "broker": "Vantage International",
            "server": "VantageMarkets-Demo",
            "account_number": 26458461,
            "mode": "DEMO",
        },
        "account": {
            "balance": 1000.0,
            "equity": 1012.5,
            "free_margin": 950.0,
            "floating_pnl": 12.5,
            "closed_pnl": 45.0,
            "currency": "USD",
        },
        "open_positions": [{
            "ticket": 123456,
            "symbol": "EURUSD",
            "direction": "BUY",
            "volume": 0.01,
            "entry_price": 1.05000,
            "current_price": 1.05125,
            "sl": 1.04500,
            "tp1": 1.05500,
            "tp2": 1.06000,
            "pnl_usd": 12.5,
            "entry_time": "2026-11-25T17:50:00+00:00",
            "ai_score": 0.91,
            "signal_score": 0.88,
            "trade_reason": "Internal secret",
            "magic": 202601,
            "risk_usd": 5.0,
        }],
    })
    monkeypatch.setattr(cc, "_read_trade_journal", lambda limit=20: [{
        "trade_id": "TR_1",
        "symbol": "EURUSD",
        "direction": "BUY",
        "volume": 0.01,
        "pnl": 45.0,
        "status": "Closed",
        "close_time": "2026-11-25T17:00:00+00:00",
    }])

    res = client.get("/api/v2/customer_snapshot")
    assert res.status_code == 200
    assert res.headers.get("cache-control") == "no-store, max-age=0"
    data = res.json()
    assert data["connected"] is True
    assert data["stale"] is False
    assert data["fresh"] is True
    assert data["account_number"] == 26458461
    assert data["account"]["balance"] == 1000.0
    assert len(data["positions"]) == 1
    pos = data["positions"][0]
    assert pos["ticket"] == 123456
    assert "ai_score" not in pos
    assert "signal_score" not in pos
    assert "trade_reason" not in pos
    assert "magic" not in pos
    assert "risk_usd" not in pos
    assert len(data["history"]) == 1

    # Account isolation checks
    assert client.get("/api/v2/customer_snapshot?account_id=26458461").status_code == 200
    assert client.get("/api/v2/customer_snapshot?account_id=99999999").status_code == 403
    assert client.get("/api/v2/customer_snapshot?account_id=../bad").status_code == 400

    # 2. Connected & stale (>30s)
    monkeypatch.setattr(cc, "_get_live_telemetry", lambda: {
        "timestamp": "2026-11-25T18:01:00+00:00",
        "heartbeat_age_s": 45.0,
        "account_data_verified": True,
        "connection": {
            "mt5_status": "CONNECTED",
            "broker": "Vantage International",
            "server": "VantageMarkets-Demo",
            "account_number": 26458461,
            "mode": "DEMO",
        },
        "account": {"balance": 1000.0, "equity": 1012.5, "currency": "USD"},
        "open_positions": [],
    })
    stale_res = client.get("/api/v2/customer_snapshot").json()
    assert stale_res["connected"] is True
    assert stale_res["stale"] is True
    assert stale_res["fresh"] is False

    # 3. Disconnected: suppress financial figures, keep last_verified_at
    monkeypatch.setattr(cc, "_get_live_telemetry", lambda: {
        "timestamp": "2026-11-25T18:02:00+00:00",
        "heartbeat_age_s": 90.0,
        "account_data_verified": False,
        "connection": {"mt5_status": "DISCONNECTED"},
        "account": {"balance": 500.0},
        "open_positions": [{"ticket": 1}],
    })
    disc_res = client.get("/api/v2/customer_snapshot").json()
    assert disc_res["connected"] is False
    assert disc_res["account"] == {}
    assert disc_res["positions"] == []
    assert disc_res["history"] == []
    assert disc_res["account_number"] is None
    assert disc_res["updated_at"] is None
    assert disc_res["last_verified_at"] == "2026-11-25T18:01:00+00:00"
    assert client.get("/api/v2/customer_snapshot?account_id=26458461").status_code == 403


def test_runtime_customer_snapshot_optional_bearer_auth(monkeypatch):
    client = TestClient(cc.app)
    monkeypatch.setenv("VORTEX_REQUIRE_AUTH", "true")
    monkeypatch.setenv("VORTEX_CONTROL_SECRET", "super-secret-control-token-123456")

    assert client.get("/api/v2/customer_snapshot").status_code == 401
    assert client.get("/api/v2/customer_snapshot", headers={"Authorization": "Bearer wrong"}).status_code == 401
    ok = client.get("/api/v2/customer_snapshot", headers={"Authorization": "Bearer super-secret-control-token-123456"})
    assert ok.status_code == 200
