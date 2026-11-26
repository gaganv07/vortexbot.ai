"""
dashboard/customer_auth.py — Fail-closed Supabase Auth & server-side account ownership.

Never trusts unsigned request headers (such as X-Vortex-Customer-Id) or query
parameters as proof of customer identity.
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Set
from urllib.parse import urlparse

import httpx
from fastapi import HTTPException, Request

ACCOUNT_ID_RE = re.compile(r"^[A-Za-z0-9._-]{1,40}$")
_UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.IGNORECASE)
_SUPABASE_URL_RE = re.compile(r"^https://[a-z0-9-]+\.supabase\.co$", re.IGNORECASE)


@dataclass(frozen=True)
class VerifiedCustomer:
    user_id: str
    email: str
    allowed_accounts: Set[str]


def get_supabase_public_config() -> Dict[str, Any]:
    """Return non-secret Supabase Auth config for browser login (never secret keys)."""
    url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
    pub_key = (
        os.getenv("SUPABASE_PUBLISHABLE_KEY", "").strip()
        or os.getenv("SUPABASE_ANON_KEY", "").strip()
    )
    configured = bool(url and pub_key and _is_valid_supabase_url(url))
    return {
        "configured": configured,
        "supabase_url": url if configured else None,
        "publishable_key": pub_key if configured else None,
    }


def _is_valid_supabase_url(url: str) -> bool:
    if not url:
        return False
    if _SUPABASE_URL_RE.match(url):
        return True
    parsed = urlparse(url)
    return parsed.scheme in ("http", "https") and parsed.hostname in ("127.0.0.1", "localhost")


def _parse_account_map(raw_map: str) -> Dict[str, List[str]]:
    try:
        parsed = json.loads(raw_map)
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Customer account authorization map invalid") from exc
    if not isinstance(parsed, dict):
        raise HTTPException(status_code=503, detail="Customer account authorization map invalid")
    normalized: Dict[str, List[str]] = {}
    for key, accounts in parsed.items():
        if not isinstance(key, str) or not isinstance(accounts, list):
            raise HTTPException(status_code=503, detail="Customer account authorization map invalid")
        clean_key = key.strip().lower()
        if not _UUID_RE.match(clean_key):
            raise HTTPException(status_code=503, detail="Customer account authorization map must use immutable user UUIDs")
        valid_accts = [str(a).strip() for a in accounts if ACCOUNT_ID_RE.match(str(a).strip())]
        normalized[clean_key] = valid_accts
    return normalized


async def _verify_supabase_token(supabase_url: str, pub_key: str, token: str) -> Dict[str, Any]:
    """Verify a Supabase Auth access token server-side via /auth/v1/user."""
    headers = {
        "apikey": pub_key,
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{supabase_url}/auth/v1/user", headers=headers)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail="Authentication service unavailable") from exc

    if resp.status_code in (401, 403):
        raise HTTPException(status_code=401, detail="Invalid or expired customer token")
    if resp.status_code >= 500 or not resp.is_success:
        raise HTTPException(status_code=503, detail="Authentication service unavailable")

    try:
        user = resp.json()
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Authentication service unavailable") from exc

    user_id = str(user.get("id") or "").strip().lower()
    email = str(user.get("email") or "").strip().lower()
    if not user_id or not _UUID_RE.match(user_id) or not email:
        raise HTTPException(status_code=401, detail="Invalid or expired customer token")
    if not (user.get("email_confirmed_at") or user.get("confirmed_at")):
        raise HTTPException(status_code=403, detail="Customer email address is not verified")
    return {"id": user_id, "email": email}


async def _fetch_supabase_operator_accounts(
    supabase_url: str, secret_key: str, user_id: str, email: str
) -> Set[str]:
    """Resolve permitted account IDs from Supabase vortext_authorized_operators."""
    headers = {"apikey": secret_key, "Accept": "application/json"}
    if secret_key.startswith("eyJ"):
        headers["Authorization"] = f"Bearer {secret_key}"
    params = {
        "select": "user_id,email,allowed_accounts,is_active",
        "user_id": f"eq.{user_id}",
        "limit": "1",
    }
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                f"{supabase_url}/rest/v1/vortext_authorized_operators",
                headers=headers,
                params=params,
            )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail="Account authorization service unavailable") from exc

    if not resp.is_success:
        raise HTTPException(status_code=503, detail="Account authorization service unavailable")

    rows = resp.json()
    if not isinstance(rows, list) or not rows:
        return set()
    record = rows[0]
    if (
        record.get("is_active") is not True
        or str(record.get("user_id") or "").strip().lower() != user_id.lower()
        or str(record.get("email") or "").strip().lower() != email.lower()
    ):
        raise HTTPException(status_code=403, detail="Customer account access is disabled")

    raw_allowed = record.get("allowed_accounts") or []
    if not isinstance(raw_allowed, list):
        return set()
    return {
        str(item).strip()
        for item in raw_allowed
        if isinstance(item, str) and ACCOUNT_ID_RE.match(item.strip())
    }


async def authenticate_customer_request(request: Request) -> VerifiedCustomer:
    """
    Authenticate customer request using Supabase Auth (fail-closed by default)
    and resolve permitted MT5 accounts from server-side ownership mapping.
    """
    supabase_url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
    pub_key = (
        os.getenv("SUPABASE_PUBLISHABLE_KEY", "").strip()
        or os.getenv("SUPABASE_ANON_KEY", "").strip()
    )
    if not supabase_url or not pub_key or not _is_valid_supabase_url(supabase_url):
        raise HTTPException(status_code=503, detail="Customer authentication not configured")

    raw_map = os.getenv("VORTEX_CUSTOMER_ACCOUNT_MAP", "").strip()
    secret_key = (
        os.getenv("SUPABASE_SECRET_KEY", "").strip()
        or os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    )
    if not raw_map and not secret_key:
        raise HTTPException(status_code=503, detail="Customer account authorization not configured")

    acct_map = _parse_account_map(raw_map) if raw_map else None

    auth_header = request.headers.get("authorization", "")
    if not auth_header.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Valid Bearer token required")
    token = auth_header[7:].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Valid Bearer token required")

    user = await _verify_supabase_token(supabase_url, pub_key, token)
    user_id = user["id"]
    email = user["email"]

    allowed: Set[str] = set()
    if acct_map is not None:
        allowed.update(acct_map.get(user_id.lower(), []))
    if secret_key:
        allowed.update(await _fetch_supabase_operator_accounts(supabase_url, secret_key, user_id, email))

    if not allowed:
        raise HTTPException(status_code=403, detail="No authorized trading accounts for customer")

    return VerifiedCustomer(user_id=user_id, email=email, allowed_accounts=allowed)


def authorize_customer_account(
    customer: VerifiedCustomer,
    active_account_number: Any,
    requested_account_id: Optional[str],
) -> None:
    """Ensure the verified customer owns the target MT5 account."""
    if requested_account_id is not None:
        if not ACCOUNT_ID_RE.match(requested_account_id):
            raise HTTPException(status_code=400, detail="Invalid account_id format")
        if requested_account_id not in customer.allowed_accounts:
            raise HTTPException(status_code=403, detail="Account ownership not verified")
        if active_account_number is None or str(active_account_number) != requested_account_id:
            raise HTTPException(status_code=403, detail="Requested account is not active")
        return

    if active_account_number is None or str(active_account_number) not in customer.allowed_accounts:
        raise HTTPException(status_code=403, detail="Account ownership not verified")
