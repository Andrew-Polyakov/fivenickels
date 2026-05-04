"""
HTTP client for Alpaca Market Data v2 stock snapshots (/v2/stocks/snapshots).

Derived metrics match `NewsCommand.buildTickerBlock` in StockCrawler: last price from
daily bar or latest trade, previous close from previous daily bar, percent change, volume.
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


@dataclass(frozen=True)
class SnapshotMetrics:
    symbol: str
    last_price: Decimal | None
    previous_close: Decimal | None
    percent_change: Decimal | None
    day_volume: int | None


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


def metrics_from_snapshot_blob(sym: str, snap: dict[str, Any] | None) -> SnapshotMetrics:
    """Parse one snapshot object (inner value for a symbol)."""
    if not snap or not isinstance(snap, dict):
        return SnapshotMetrics(
            symbol=sym.upper(),
            last_price=None,
            previous_close=None,
            percent_change=None,
            day_volume=None,
        )

    last: Decimal | None = None
    vol: int | None = None
    daily = snap.get("dailyBar")
    if isinstance(daily, dict):
        last = _dec(daily.get("c"))
        vol = _int_or_none(daily.get("v"))

    trade = snap.get("latestTrade")
    if last is None and isinstance(trade, dict):
        last = _dec(trade.get("p"))

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
    sess = session or requests.Session()
    headers = {
        "APCA-API-KEY-ID": kid,
        "APCA-API-SECRET-KEY": sec,
    }

    # Alpaca accepts comma-separated symbols; batch to limit URL length.
    chunk_size = 40
    by_sym: dict[str, SnapshotMetrics] = {s: metrics_from_snapshot_blob(s, None) for s in syms}

    for i in range(0, len(syms), chunk_size):
        chunk = syms[i : i + chunk_size]
        params = {"symbols": ",".join(chunk)}
        url = f"{base}/v2/stocks/snapshots"
        r = sess.get(url, headers=headers, params=params, timeout=timeout)
        r.raise_for_status()
        payload = r.json()
        if not isinstance(payload, dict):
            continue
        normalized = _normalize_snapshots_payload(payload)
        for sym in chunk:
            blob = normalized.get(sym)
            by_sym[sym] = metrics_from_snapshot_blob(sym, blob)

    return by_sym
