"""
Alpaca Market Data v2 stock bars (`GET /v2/stocks/bars`) for compact charts.

Uses the same base URL and credentials as ``alpaca_market_client``.
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Any

import requests

from django.core.cache import cache

from home.alpaca_market_client import (
    get_alpaca_data_base_url,
    load_alpaca_credentials,
)


# Bump when request shape or error strings change (clears stale cached failures).
BAR_CACHE_VERSION = "v3"
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


def _bars_feed_from_env() -> str:
    raw = (os.environ.get("ALPACA_BARS_FEED") or "iex").strip().lower()
    return raw if raw else "iex"


def _bars_adjustment_from_env() -> str | None:
    """
    Alpaca ``adjustment`` for historical bars (split/dividend etc.).

    Default ``split`` aligns better with typical broker/TV daily charts than raw prints.
    Set ``ALPACA_BARS_ADJUSTMENT=raw`` for unadjusted. Omit sending the param when
    ``ALPACA_BARS_ADJUSTMENT`` is ``-`` or ``none`` (case-insensitive).
    """
    raw = os.environ.get("ALPACA_BARS_ADJUSTMENT")
    if raw is None:
        return "split"
    s = raw.strip()
    if not s:
        return "split"
    if s.lower() in ("-", "none", "omit"):
        return None
    return s


def _iso_utc_z(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    return dt.isoformat().replace("+00:00", "Z")


def _default_query_start_utc(timeframe: str, limit: int) -> datetime:
    """Look-back wide enough to collect ``limit`` bars (weekends / holidays)."""
    tf = (timeframe or "1Day").strip()
    if tf in ("1Day", "1D") or tf.endswith("Day"):
        days = max(limit * 5, 30)
    elif "Week" in tf or tf == "1W":
        days = max(limit * 14, 56)
    elif "Month" in tf or tf in ("1Mo", "1M"):
        days = max(limit * 35, 400)
    elif "Hour" in tf or "Min" in tf:
        days = max(limit // 24 + 7, 14)
    else:
        days = max(limit * 5, 30)
    return datetime.now(timezone.utc) - timedelta(days=days)


def _alpaca_api_message(payload: Any) -> str | None:
    if not isinstance(payload, dict):
        return None
    for key in ("message", "msg", "detail"):
        v = payload.get(key)
        if isinstance(v, str) and v.strip():
            return v.strip()
    return None


def _unexpected_shape_message(
    sym: str,
    payload: Any,
    bars_root: Any,
    series: Any,
    response_text: str,
) -> str:
    parts = [f"Alpaca bars: unexpected response shape (symbol={sym})"]
    if isinstance(payload, dict):
        parts.append(f"keys={sorted(payload.keys())!s}")
    else:
        parts.append(f"payload_type={type(payload).__name__}")
    parts.append(f"bars_type={type(bars_root).__name__}")
    if bars_root is None:
        parts.append("bars=None")
    elif isinstance(bars_root, dict):
        keys_sample = list(bars_root.keys())[:8]
        parts.append(f"bars_keys_sample={keys_sample!s}")
    msg_hint = _alpaca_api_message(payload)
    if msg_hint:
        parts.append(f"api_message={msg_hint[:180]!r}")
    if series is not None and not isinstance(series, list):
        parts.append(f"series_type={type(series).__name__}")
    snippet = (response_text or "")[:220].replace("\n", " ")
    if snippet:
        parts.append(f"body_snippet={snippet!r}")
    return "; ".join(parts)


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

    Requests the **most recent** ``limit`` bars in ``[start, end]`` via ``sort=desc``,
    then reverses to chronological order. Uses explicit ``end`` = UTC now.

    Bars are cached briefly per symbol/timeframe/limit/feed/adjustment.
    """
    sym = (symbol or "").strip().upper()
    if not sym:
        return [], None

    feed = _bars_feed_from_env()
    adjustment = _bars_adjustment_from_env()
    adj_key = adjustment if adjustment else "-"
    cache_key = f"alpaca:bars:{BAR_CACHE_VERSION}:{sym}:{timeframe}:{limit}:{feed}:{adj_key}"
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

    response_text = ""
    try:
        end_dt = datetime.now(timezone.utc)
        start_dt = _default_query_start_utc(timeframe, limit)
        params: dict[str, str | int] = {
            "symbols": sym,
            "timeframe": timeframe,
            "limit": limit,
            "sort": "desc",
            "start": _iso_utc_z(start_dt),
            "end": _iso_utc_z(end_dt),
            "feed": feed,
        }
        if adjustment is not None:
            params["adjustment"] = adjustment
        r = sess.get(url, headers=headers, params=params, timeout=timeout)
        response_text = r.text or ""
        if not r.ok:
            msg = f"Alpaca bars HTTP {r.status_code}: {(response_text or '')[:200]}"
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

    bars_root_raw = payload.get("bars") if isinstance(payload, dict) else None
    series: list[Any] | None = None
    bars_root = bars_root_raw
    if isinstance(bars_root_raw, list):
        series = bars_root_raw
    elif isinstance(bars_root_raw, dict):
        series = bars_root_raw.get(sym)
        if series is None:
            for k, v in bars_root_raw.items():
                if str(k).upper() == sym:
                    series = v
                    break
    if not isinstance(series, list):
        if isinstance(bars_root_raw, dict) and len(bars_root_raw) == 0:
            cache.set(cache_key, {"bars": [], "error": None}, BAR_CACHE_TTL_SECONDS)
            return [], None
        msg = _unexpected_shape_message(sym, payload, bars_root_raw, series, response_text)
        cache.set(cache_key, {"bars": [], "error": msg}, BAR_CACHE_TTL_SECONDS)
        return [], msg

    normalized: list[dict[str, Any]] = []
    for raw in series:
        b = _normalize_bar(raw) if isinstance(raw, dict) else None
        if b is not None:
            normalized.append(b)
    normalized.reverse()

    cache.set(cache_key, {"bars": normalized, "error": None}, BAR_CACHE_TTL_SECONDS)
    return normalized, None
