"""
app/services/snapshot_publisher.py — Read-only outbound HMAC-SHA256 snapshot publisher.

Disabled by default; activates only when VORTEX_SNAPSHOT_PUBLISHER_ENABLED=true,
VORTEX_INGEST_URL (HTTPS), and VORTEX_BOT_HMAC_SECRET (>= 32 chars) are configured.
Never blocks trading execution or modifies risk/strategy state.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional
from urllib.parse import urlparse

import httpx

logger = logging.getLogger(__name__)

MAX_PAYLOAD_BYTES = 512 * 1024
_DEFAULT_TIMEOUT_S = 5.0
_DEFAULT_MAX_RETRIES = 2
_DEFAULT_BACKOFF_S = 0.5


def is_publisher_enabled() -> bool:
    return os.getenv("VORTEX_SNAPSHOT_PUBLISHER_ENABLED", "").strip().lower() == "true"


def validate_ingest_url(url: str, allow_http_localhost: bool = False) -> bool:
    if not url:
        return False
    parsed = urlparse(url.strip())
    if parsed.scheme == "https" and bool(parsed.netloc):
        return True
    if allow_http_localhost and parsed.scheme == "http" and parsed.hostname in ("127.0.0.1", "localhost"):
        return True
    return False


def build_sanitized_snapshot_payload(
    telemetry: Dict[str, Any],
    bot_id: str,
    nonce: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """
    Build a strictly sanitized snapshot matching website/api/trades.js normalize().
    Returns None if MT5 is disconnected or account_data_verified is False.
    """
    conn = telemetry.get("connection") or {}
    if conn.get("mt5_status") != "CONNECTED" or telemetry.get("account_data_verified") is not True:
        return None

    acct = telemetry.get("account") or {}
    login = int(conn.get("account_number") or 0)
    if login <= 0:
        return None

    account_id = str(login)
    mode_raw = str(conn.get("mode") or "UNKNOWN").upper()
    trade_mode = "REAL" if mode_raw == "LIVE" else (mode_raw if mode_raw in ("DEMO", "CONTEST", "REAL", "UNKNOWN") else "UNKNOWN")
    currency = str(acct.get("currency") or "USD").strip().upper() or "USD"
    captured_at = str(telemetry.get("broker_updated_at") or telemetry.get("timestamp") or datetime.now(timezone.utc).isoformat())

    raw_positions = telemetry.get("open_positions") or []
    positions: List[Dict[str, Any]] = []
    for p in raw_positions[:500]:
        side_raw = str(p.get("direction") or p.get("side") or "").lower()
        side = "buy" if side_raw in ("buy", "long") else ("sell" if side_raw in ("sell", "short") else "")
        if not side:
            continue
        positions.append({
            "ticket": str(p.get("ticket") or ""),
            "symbol": str(p.get("symbol") or ""),
            "side": side,
            "volume": float(p.get("volume") or 0.0),
            "entry_price": float(p.get("entry_price") or 0.0),
            "current_price": float(p.get("current_price") or 0.0),
            "sl": float(p.get("sl") or 0.0),
            "tp": float(p.get("tp1") or p.get("tp") or 0.0),
            "profit": float(p.get("pnl_usd") or p.get("profit") or 0.0),
            "swap": float(p.get("swap") or 0.0),
            "opened_at": p.get("entry_time") or None,
            "account_id": account_id,
            "login": login,
            "server": str(conn.get("server") or ""),
        })

    return {
        "bot_id": bot_id,
        "captured_at": captured_at,
        "request_id": nonce or uuid.uuid4().hex,
        "bot_status": "running" if telemetry.get("bot_status") == "RUNNING" else "unknown",
        "account": {
            "account_id": account_id,
            "login": login,
            "server": str(conn.get("server") or ""),
            "currency": currency,
            "balance": float(acct.get("balance")),
            "equity": float(acct.get("equity")),
            "margin": float(acct.get("margin") or 0.0),
            "free_margin": float(acct.get("free_margin") or 0.0),
            "leverage": float(acct.get("leverage") or 0.0),
            "trade_mode": trade_mode,
        },
        "accounts": [{
            "account_id": account_id,
            "login": login,
            "server": str(conn.get("server") or ""),
            "currency": currency,
            "balance": float(acct.get("balance")),
            "equity": float(acct.get("equity")),
            "margin": float(acct.get("margin") or 0.0),
            "free_margin": float(acct.get("free_margin") or 0.0),
            "leverage": float(acct.get("leverage") or 0.0),
            "trade_mode": trade_mode,
            "enabled": True,
            "trading_enabled": False,
            "positions_count": len(positions),
            "deals_count": 0,
        }],
        "positions": positions,
        "deals": [],
    }


def sign_snapshot_body(secret: str, raw_body: bytes, timestamp: Optional[int] = None) -> tuple[str, str]:
    """Produce canonical HMAC-SHA256 signature over '{timestamp}.{raw_body}'."""
    ts_str = str(int(timestamp if timestamp is not None else time.time()))
    mac = hmac.new(secret.encode("utf-8"), digestmod=hashlib.sha256)
    mac.update(ts_str.encode("ascii"))
    mac.update(b".")
    mac.update(raw_body)
    return ts_str, mac.hexdigest()


def publish_snapshot_once(
    telemetry_provider: Callable[[], Dict[str, Any]],
    *,
    ingest_url: Optional[str] = None,
    secret: Optional[str] = None,
    bot_id: Optional[str] = None,
    timeout_s: float = _DEFAULT_TIMEOUT_S,
    max_retries: int = _DEFAULT_MAX_RETRIES,
    backoff_s: float = _DEFAULT_BACKOFF_S,
    allow_http_localhost: bool = False,
    http_client: Optional[httpx.Client] = None,
) -> Dict[str, Any]:
    """
    Build, sign, and POST one snapshot to the hosted ingestion endpoint.
    Never raises on network errors; returns structured status for callers.
    """
    target_url = (ingest_url or os.getenv("VORTEX_INGEST_URL", "")).strip()
    hmac_secret = (secret or os.getenv("VORTEX_BOT_HMAC_SECRET", "")).strip()
    resolved_bot_id = (bot_id or os.getenv("VORTEX_BOT_ID", "vortex-main")).strip() or "vortex-main"

    if not validate_ingest_url(target_url, allow_http_localhost=allow_http_localhost):
        return {"published": False, "reason": "invalid_or_missing_ingest_url"}
    if len(hmac_secret) < 32:
        return {"published": False, "reason": "invalid_or_missing_hmac_secret"}

    telemetry = telemetry_provider()
    nonce = uuid.uuid4().hex
    payload = build_sanitized_snapshot_payload(telemetry, bot_id=resolved_bot_id, nonce=nonce)
    if payload is None:
        return {"published": False, "reason": "telemetry_disconnected_or_unverified"}

    raw_body = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    if len(raw_body) > MAX_PAYLOAD_BYTES:
        return {"published": False, "reason": "payload_too_large"}

    ts_str, sig_hex = sign_snapshot_body(hmac_secret, raw_body)
    headers = {
        "Content-Type": "application/json",
        "X-Vortext-Timestamp": ts_str,
        "X-Vortext-Signature": sig_hex,
        "X-Vortex-Nonce": nonce,
    }

    own_client = http_client is None
    client = http_client or httpx.Client(timeout=timeout_s)
    try:
        for attempt in range(max_retries + 1):
            try:
                resp = client.post(target_url, content=raw_body, headers=headers)
                if 200 <= resp.status_code < 300:
                    return {"published": True, "status_code": resp.status_code, "nonce": nonce}
                if resp.status_code in (400, 401, 403, 409, 413, 415):
                    return {"published": False, "status_code": resp.status_code, "reason": "rejected_by_server"}
            except httpx.HTTPError as exc:
                logger.warning("Snapshot publish network error (attempt %d): %s", attempt + 1, type(exc).__name__)
            if attempt < max_retries:
                time.sleep(backoff_s * (2 ** attempt))
        return {"published": False, "reason": "max_retries_exceeded"}
    finally:
        if own_client:
            client.close()
