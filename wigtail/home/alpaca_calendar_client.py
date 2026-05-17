"""
HTTP client for Alpaca Trading API market calendar (GET /v3/calendar/{market}).
"""

from __future__ import annotations

import os
from datetime import date, datetime
from typing import Any

import requests

from home.alpaca_news_client import load_alpaca_credentials

DEFAULT_TRADING_API_BASE = "https://api.alpaca.markets"

# Editor-facing market keys → Alpaca API path segment
CALENDAR_MARKET_API: dict[str, str] = {
    "NASDAQ": "NASDAQ",
    "NYSE": "XNYS",
    "XNYS": "XNYS",
}


def get_alpaca_trading_base_url() -> str:
    override = (os.environ.get("ALPACA_TRADING_BASE_URL") or "").strip()
    if override:
        return override.rstrip("/")
    return DEFAULT_TRADING_API_BASE.rstrip("/")


def calendar_api_market(market: str) -> str:
    key = (market or "NASDAQ").strip().upper()
    return CALENDAR_MARKET_API.get(key, key)


def _parse_date(value: Any) -> date | None:
    if not value:
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    text = str(value).strip()
    if not text:
        return None
    try:
        return date.fromisoformat(text[:10])
    except ValueError:
        return None


def _parse_datetime(value: Any) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    text = str(value).strip()
    if not text:
        return None
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        return datetime.fromisoformat(text)
    except ValueError:
        return None


def _window_bounds(entry: dict[str, Any], prefix: str) -> tuple[datetime | None, datetime | None]:
    start = entry.get(f"{prefix}_start")
    end = entry.get(f"{prefix}_end")
    if start is None and end is None:
        nested = entry.get(prefix)
        if isinstance(nested, dict):
            start = nested.get("start")
            end = nested.get("end")
        elif prefix == "core" and isinstance(entry.get("regular"), dict):
            reg = entry["regular"]
            start = reg.get("start")
            end = reg.get("end")
        elif prefix == "pre" and isinstance(entry.get("pre_market"), dict):
            pre = entry["pre_market"]
            start = pre.get("start")
            end = pre.get("end")
        elif prefix == "post" and isinstance(entry.get("after_hours"), dict):
            post = entry["after_hours"]
            start = post.get("start")
            end = post.get("end")
    return _parse_datetime(start), _parse_datetime(end)


def _normalize_calendar_day(entry: dict[str, Any], *, market: str) -> dict[str, Any] | None:
    session_date = _parse_date(entry.get("date") or entry.get("session_date"))
    if session_date is None:
        return None
    pre_start, pre_end = _window_bounds(entry, "pre")
    core_start, core_end = _window_bounds(entry, "core")
    post_start, post_end = _window_bounds(entry, "post")
    settlement = _parse_date(entry.get("settlement_date"))
    return {
        "market": market,
        "session_date": session_date,
        "pre_start": pre_start,
        "pre_end": pre_end,
        "core_start": core_start,
        "core_end": core_end,
        "post_start": post_start,
        "post_end": post_end,
        "settlement_date": settlement,
    }


def fetch_market_calendar(
    market: str,
    start_date: date,
    end_date: date,
    *,
    base_url: str | None = None,
    session: requests.Session | None = None,
    key_id: str | None = None,
    secret: str | None = None,
    timeout: int = 60,
) -> list[dict[str, Any]]:
    """Fetch normalized calendar day rows for the given market and date range."""
    api_market = calendar_api_market(market)
    kid, sec = key_id, secret
    if kid is None or sec is None:
        kid, sec = load_alpaca_credentials()
    if not kid or not sec:
        raise ValueError(
            "Missing Alpaca credentials: set APCA_API_KEY_ID and APCA_API_SECRET_KEY "
            "(or ALPACA_*) in the environment or a repo .env / .apca file."
        )

    base = (base_url or get_alpaca_trading_base_url()).rstrip("/")
    sess = session or requests.Session()
    headers = {
        "APCA-API-KEY-ID": kid,
        "APCA-API-SECRET-KEY": sec,
    }
    params = {
        "start": start_date.isoformat(),
        "end": end_date.isoformat(),
    }
    url = f"{base}/v3/calendar/{api_market}"
    r = sess.get(url, headers=headers, params=params, timeout=timeout)
    r.raise_for_status()
    payload = r.json()
    raw_days: list[Any] = []
    if isinstance(payload, dict):
        cal = payload.get("calendar")
        if isinstance(cal, list):
            raw_days = cal
        elif isinstance(payload.get("days"), list):
            raw_days = payload["days"]
    elif isinstance(payload, list):
        raw_days = payload

    out: list[dict[str, Any]] = []
    for item in raw_days:
        if not isinstance(item, dict):
            continue
        row = _normalize_calendar_day(item, market=api_market)
        if row:
            out.append(row)
    return out
