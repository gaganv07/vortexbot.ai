"""Regression checks for the isolated read-only customer dashboard."""
from pathlib import Path
import ast

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


def test_customer_dashboard_uses_local_read_only_snapshot_api():
    customer = CUSTOMER_HTML.read_text(encoding="utf-8")
    assert "fetch('/api/v2/customer_snapshot'" in customer
    assert "setInterval(refresh,10000)" in customer
    assert "No cached or simulated figures are displayed" in customer


def test_customer_snapshot_suppresses_fallback_account_metrics_when_disconnected():
    source = CONTROL.read_text(encoding="utf-8")
    tree = ast.parse(source)
    functions = {node.name: node for node in ast.walk(tree) if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))}
    snapshot = ast.get_source_segment(source, functions["get_customer_snapshot"])
    assert 'mt5_status") == "CONNECTED"' in snapshot
    assert '"account": account' in snapshot
    assert '"positions": telemetry.get("open_positions", []) if connected else []' in snapshot
    assert '"account_number": connection.get("account_number") if connected else None' in snapshot


def test_customer_routes_are_get_only_and_operator_route_remains():
    source = CONTROL.read_text(encoding="utf-8")
    assert '@app.get("/customer"' in source
    assert '@app.get("/api/v2/customer_snapshot")' in source
    assert '@app.get("/", response_class=HTMLResponse)' in source
    assert '@app.websocket("/ws/live")' in source
