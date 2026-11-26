"""
dashboard/telemetry_utils.py — Defensive numeric validation, genuine broker
timestamp conversion, and freshness evaluation.
"""

from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any, Optional, Tuple
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

DEFAULT_BROKER_TIMEZONE = "Europe/Athens"
MAX_FUTURE_SKEW_S = 60.0
DEFAULT_STALE_THRESHOLD_S = 30.0


def validate_finite_number(value: Any) -> Optional[float]:
    """
    Validate that value is a real, finite number.
    Rejects None, bool, NaN, +/-inf, malformed strings, and unsupported types.
    """
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        num = float(value)
    elif isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return None
        try:
            num = float(stripped)
        except ValueError:
            return None
    else:
        return None

    if not math.isfinite(num):
        return None
    return num


def convert_mt5_broker_epoch_to_utc(
    epoch_sec: Any,
    broker_tz_name: str = DEFAULT_BROKER_TIMEZONE,
    fold: int = 0,
) -> Tuple[Optional[datetime], Optional[str]]:
    """
    Convert an MT5 broker-server wall-clock pseudo-epoch to true UTC datetime.

    MT5 terminal/tick/position epochs encode broker server wall-clock time
    (Europe/Athens EET/EEST for BlackBull/Vantage) as a naive Unix integer.
    Returns (utc_datetime, error_reason).
    """
    num = validate_finite_number(epoch_sec)
    if num is None or num <= 0:
        return None, "invalid_or_missing_epoch"
    if fold not in (0, 1):
        return None, "invalid_dst_fold"

    try:
        tz = ZoneInfo(broker_tz_name)
    except (ZoneInfoNotFoundError, ValueError, KeyError):
        return None, "invalid_timezone"

    try:
        naive_broker = datetime.fromtimestamp(int(num), tz=timezone.utc).replace(tzinfo=None)
        aware_broker = naive_broker.replace(tzinfo=tz, fold=fold)
        # Detect nonexistent DST spring-forward wall-clock gap:
        roundtrip = aware_broker.astimezone(timezone.utc).astimezone(tz)
        if roundtrip.replace(tzinfo=None) != naive_broker:
            return None, "nonexistent_dst_time"
        return aware_broker.astimezone(timezone.utc), None
    except (OverflowError, OSError, ValueError):
        return None, "epoch_out_of_range"


def evaluate_broker_freshness(
    broker_updated_at: Optional[datetime],
    now_utc: Optional[datetime] = None,
    stale_threshold_s: float = DEFAULT_STALE_THRESHOLD_S,
    max_future_skew_s: float = MAX_FUTURE_SKEW_S,
) -> Tuple[bool, Optional[float], str]:
    """
    Evaluate freshness strictly from a verified broker timestamp.
    Returns (is_stale, age_seconds, reason).
    Missing or future-dated timestamps always fail closed as stale.
    """
    if broker_updated_at is None:
        return True, None, "missing_broker_timestamp"

    now = now_utc or datetime.now(timezone.utc)
    if broker_updated_at.tzinfo is None:
        return True, None, "naive_broker_timestamp"

    age_s = (now - broker_updated_at).total_seconds()
    if age_s < -max_future_skew_s:
        return True, round(age_s, 2), "future_broker_timestamp"

    clamped_age = max(0.0, age_s)
    if clamped_age > stale_threshold_s:
        return True, round(clamped_age, 2), "stale_broker_timestamp"

    return False, round(clamped_age, 2), "fresh"
