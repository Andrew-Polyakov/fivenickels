"""
Alpaca Market Data v2 stock bars (`GET /v2/stocks/bars`) for compact charts.

Uses the same base URL and credentials as ``alpaca_market_client``.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import requests

from django.core.cache import cache

from home.alpaca_market_client import (
    get_alpaca_data_base_url,
    load_alpaca_credentials,
)


BAR_CACHE_VERSION = "v1"
BAR_CACHE_TTL_SECONDS = 90


def _iso_timestamp_to_unix(ts: Any) -> float:
    if ts is None:
        return 0.0
    if isinstance(ts, (int, float)):
        return float(ts)
    s = str(ts).strip()
    if not s:
        return 0.0
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    dt = datetime.fromisoformat(s)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.timestamp()


def _float_or_none(x: Any) -> float | None:
    if x is None:
        return None
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def _normalize_bar(raw: dict[str, Any]) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    t_unix = _iso_timestamp_to_unix(raw.get("t"))
    o = _float_or_none(raw.get("o"))
    h = _float_or_none(raw.get("h"))
    l = _float_or_none(raw.get("l"))
    c = _float_or_none(raw.get("c"))
    v = raw.get("v")
    vol: int | None = None
    if v is not None:
        try:
            vol = int(float(v))
        except (TypeError, ValueError):
            vol = None
    if o is None or h is None or l is None or c is None:
        return None
    return {"t": t_unix, "o": o, "h": h, "l": l, "c": c, "v": vol}


def fetch_recent_stock_bars(
    symbol: str,
    *,
    timeframe: str = "1Day",
    limit: int = 30,
    base_url: str | None = None,
    session: requests.Session | None = None,
    key_id: str | None = None,
    secret: str | None = None,
    timeout: int = 60,
) -> tuple[list[dict[str, Any]], str | None]:
    """
    Return up to ``limit`` bars oldest-first for charting, and an optional error message.

    Bars are cached briefly per symbol/timeframe/limit.
    """
    sym = (symbol or "").strip().upper()
    if not sym:
        return [], None

    cache_key = f"alpaca:bars:{BAR_CACHE_VERSION}:{sym}:{timeframe}:{limit}"
    hit = cache.get(cache_key)
    if isinstance(hit, dict) and "bars" in hit:
        raw_list = hit.get("bars")
        err = hit.get("error")
        if isinstance(raw_list, list):
            return raw_list, str(err) if err else None

    kid, sec = key_id, secret
    if kid is None or sec is None:
        try:
            kid, sec = load_alpaca_credentials()
        except Exception:
            kid, sec = "", ""

    if not kid or not sec:
        msg = (
            "Missing Alpaca credentials: set APCA_API_KEY_ID and APCA_API_SECRET_KEY "
            "(or ALPACA_*) in the environment."
        )
        cache.set(cache_key, {"bars": [], "error": msg}, BAR_CACHE_TTL_SECONDS)
        return [], msg

    base = (base_url or get_alpaca_data_base_url()).rstrip("/")
    url = f"{base}/v2/stocks/bars"
    sess = session or requests.Session()
    headers = {
        "APCA-API-KEY-ID": kid,
        "APCA-API-SECRET-KEY": sec,
    }
    params = {
        "symbols": sym,
        "timeframe": timeframe,
        "limit": limit,
        "sort": "asc",
    }

    try:
        r = sess.get(url, headers=headers, params=params, timeout=timeout)
        if not r.ok:
            msg = f"Alpaca bars HTTP {r.status_code}: {(r.text or '')[:200]}"
            cache.set(cache_key, {"bars": [], "error": msg}, BAR_CACHE_TTL_SECONDS)
            return [], msg
        payload = r.json()
    except requests.RequestException as ex:
        msg = f"Alpaca bars request failed: {ex}"
        cache.set(cache_key, {"bars": [], "error": msg}, BAR_CACHE_TTL_SECONDS)
        return [], msg
    except ValueError as ex:
        msg = f"Alpaca bars invalid JSON: {ex}"
        cache.set(cache_key, {"bars": [], "error": msg}, BAR_CACHE_TTL_SECONDS)
        return [], msg

    bars_root = payload.get("bars") if isinstance(payload, dict) else None
    series: list[Any] | None = None
    if isinstance(bars_root, dict):
        series = bars_root.get(sym)
        if series is None:
            for k, v in bars_root.items():
                if str(k).upper() == sym:
                    series = v
                    break
    if not isinstance(series, list):
        msg = "Alpaca bars: unexpected response shape"
        cache.set(cache_key, {"bars": [], "error": msg}, BAR_CACHE_TTL_SECONDS)
        return [], msg

    normalized: list[dict[str, Any]] = []
    for raw in series:
        b = _normalize_bar(raw) if isinstance(raw, dict) else None
        if b is not None:
            normalized.append(b)

    cache.set(cache_key, {"bars": normalized, "error": None}, BAR_CACHE_TTL_SECONDS)
    return normalized, None
