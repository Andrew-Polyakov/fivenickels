"""
HTTP client for Alpaca Market Data v2 stock snapshots (/v2/stocks/snapshots).

Derived metrics match StockCrawler ``SnapshotMetrics``: during extended sessions prefer
latest trade / minute bar; otherwise daily bar. Percent change vs previous daily close.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

import requests

from home.alpaca_news_client import (
    DEFAULT_DATA_BASE_LIVE,
    DEFAULT_DATA_BASE_SANDBOX,
    load_alpaca_credentials,
)
from home.us_market_session import UsMarketSessionInfo, classify_us_market_session


@dataclass(frozen=True)
class SnapshotMetrics:
    symbol: str
    last_price: Decimal | None
    previous_close: Decimal | None
    percent_change: Decimal | None
    day_volume: int | None
    price_basis: str = "regular"
    market_session: str = "regular"
    market_session_label: str = "Regular"
    data_feed: str = "iex"


def get_alpaca_data_base_url() -> str:
    load_alpaca_credentials()
    override = (os.environ.get("ALPACA_DATA_BASE_URL") or "").strip()
    if override:
        return override.rstrip("/")
    flag = (os.environ.get("ALPACA_DATA_SANDBOX") or "").strip().lower()
    if flag in ("1", "true", "yes", "on"):
        return DEFAULT_DATA_BASE_SANDBOX.rstrip("/")
    return DEFAULT_DATA_BASE_LIVE.rstrip("/")


def _dec(x: Any) -> Decimal | None:
    if x is None:
        return None
    try:
        return Decimal(str(x))
    except (ArithmeticError, ValueError, TypeError):
        return None


def _int_or_none(x: Any) -> int | None:
    if x is None:
        return None
    try:
        return int(float(x))
    except (TypeError, ValueError):
        return None


def bars_feed_from_env() -> str:
    raw = (os.environ.get("ALPACA_BARS_FEED") or "iex").strip().lower()
    return raw if raw else "iex"


def metrics_from_snapshot_blob(
    sym: str,
    snap: dict[str, Any] | None,
    *,
    session: UsMarketSessionInfo | None = None,
    data_feed: str | None = None,
) -> SnapshotMetrics:
    """Parse one snapshot object (inner value for a symbol)."""
    sess = session or classify_us_market_session()
    feed = data_feed or bars_feed_from_env()
    empty = SnapshotMetrics(
        symbol=sym.upper(),
        last_price=None,
        previous_close=None,
        percent_change=None,
        day_volume=None,
        price_basis=sess.price_basis,
        market_session=sess.id,
        market_session_label=sess.label,
        data_feed=feed,
    )
    if not snap or not isinstance(snap, dict):
        return empty

    last: Decimal | None = None
    vol: int | None = None
    daily = snap.get("dailyBar")
    trade = snap.get("latestTrade")
    minute = snap.get("minuteBar")

    if sess.is_extended:
        if isinstance(trade, dict):
            last = _dec(trade.get("p"))
        if last is None and isinstance(minute, dict):
            last = _dec(minute.get("c"))
        if isinstance(daily, dict):
            last = last or _dec(daily.get("c"))
            vol = _int_or_none(daily.get("v"))
    else:
        if isinstance(daily, dict):
            last = _dec(daily.get("c"))
            vol = _int_or_none(daily.get("v"))
        if last is None and isinstance(trade, dict):
            last = _dec(trade.get("p"))

    if vol is None and isinstance(daily, dict):
        vol = _int_or_none(daily.get("v"))

    prev_close: Decimal | None = None
    pdb = snap.get("prevDailyBar")
    if isinstance(pdb, dict):
        prev_close = _dec(pdb.get("c"))

    pct: Decimal | None = None
    if last is not None and prev_close is not None and prev_close != 0:
        pct = (last - prev_close) / prev_close * Decimal(100)

    return SnapshotMetrics(
        symbol=sym.upper(),
        last_price=last,
        previous_close=prev_close,
        percent_change=pct,
        day_volume=vol,
        price_basis=sess.price_basis,
        market_session=sess.id,
        market_session_label=sess.label,
        data_feed=feed,
    )


def _normalize_snapshots_payload(data: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """Handle both `{snapshots: {SYM: ...}}` and flat `{SYM: ...}` shapes."""
    inner = data.get("snapshots")
    if isinstance(inner, dict):
        return {str(k).upper(): v for k, v in inner.items() if isinstance(v, dict)}
    out: dict[str, dict[str, Any]] = {}
    for k, v in data.items():
        if k in ("next_page_token", "snapshots"):
            continue
        if isinstance(v, dict) and (
            "dailyBar" in v or "latestTrade" in v or "prevDailyBar" in v
        ):
            out[str(k).upper()] = v
    return out


def fetch_snapshots(
    symbols: list[str],
    *,
    base_url: str | None = None,
    feed: str | None = None,
    market_session: UsMarketSessionInfo | None = None,
    session: requests.Session | None = None,
    key_id: str | None = None,
    secret: str | None = None,
    timeout: int = 60,
) -> dict[str, SnapshotMetrics]:
    """
    Batch-fetch snapshots for uppercase symbols. Missing symbols get empty metrics.
    """
    syms = [s.strip().upper() for s in symbols if s and s.strip()]
    if not syms:
        return {}

    kid, sec = key_id, secret
    if kid is None or sec is None:
        kid, sec = load_alpaca_credentials()
    if not kid or not sec:
        raise ValueError(
            "Missing Alpaca credentials: set APCA_API_KEY_ID and APCA_API_SECRET_KEY "
            "(or ALPACA_*) in the environment or a repo .env / .apca file."
        )

    base = (base_url or get_alpaca_data_base_url()).rstrip("/")
    http = session or requests.Session()
    headers = {
        "APCA-API-KEY-ID": kid,
        "APCA-API-SECRET-KEY": sec,
    }
    feed_id = feed or bars_feed_from_env()
    mkt = market_session or classify_us_market_session()

    # Alpaca accepts comma-separated symbols; batch to limit URL length.
    chunk_size = 40
    by_sym: dict[str, SnapshotMetrics] = {
        s: metrics_from_snapshot_blob(s, None, session=mkt, data_feed=feed_id) for s in syms
    }

    for i in range(0, len(syms), chunk_size):
        chunk = syms[i : i + chunk_size]
        params = {"symbols": ",".join(chunk), "feed": feed_id}
        url = f"{base}/v2/stocks/snapshots"
        r = http.get(url, headers=headers, params=params, timeout=timeout)
        r.raise_for_status()
        payload = r.json()
        if not isinstance(payload, dict):
            continue
        normalized = _normalize_snapshots_payload(payload)
        for sym in chunk:
            blob = normalized.get(sym)
            by_sym[sym] = metrics_from_snapshot_blob(
                sym, blob, session=mkt, data_feed=feed_id
            )

    return by_sym
