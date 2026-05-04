"""
HTTP client for Alpaca Market Data forex rates (/v1beta1/forex/rates).

Uses the same data host and auth as `alpaca_market_client` (APCA_* / ALPACA_*).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

import requests

from home.alpaca_market_client import get_alpaca_data_base_url
from home.alpaca_news_client import load_alpaca_credentials
from home.market_format import format_percent_change, percent_change_css_class

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ForexQuote:
    symbol: str
    label: str
    mid: Decimal | None
    bid: Decimal | None
    ask: Decimal | None
    as_of: str | None
    pct_change: Decimal | None


def _dec(x: Any) -> Decimal | None:
    if x is None:
        return None
    try:
        return Decimal(str(x))
    except (ArithmeticError, ValueError, TypeError):
        return None


def pair_label(symbol: str) -> str:
    s = (symbol or "").strip().upper()
    if len(s) == 6 and s.isalpha():
        return f"{s[:3]}/{s[3:]}"
    return s or "—"


def _format_mid(symbol: str, mid: Decimal | None) -> str:
    if mid is None:
        return "—"
    s = symbol.upper()
    # JPY quotes: fewer fractional digits
    if s.endswith("JPY"):
        q = mid.quantize(Decimal("0.001"))
        return format(q, "f")
    q = mid.quantize(Decimal("0.00001"))
    return format(q, "f")


def quote_row_dict(q: ForexQuote) -> dict[str, Any]:
    pct = q.pct_change
    return {
        "symbol": q.symbol,
        "label": q.label,
        "mid": q.mid,
        "mid_display": _format_mid(q.symbol, q.mid),
        "bid": q.bid,
        "ask": q.ask,
        "as_of": q.as_of,
        "pct_change": pct,
        "pct_formatted": format_percent_change(pct),
        "pct_class": percent_change_css_class(pct),
    }


def _rates_series_for_pair(rates_blob: dict[str, Any], pair: str) -> list[dict[str, Any]]:
    key = pair.strip().upper()
    arr = rates_blob.get(key)
    if not isinstance(arr, list) or not arr:
        for k, v in rates_blob.items():
            if str(k).upper() == key and isinstance(v, list) and v:
                arr = v
                break
        else:
            return []
    out: list[dict[str, Any]] = []
    for pt in arr:
        if isinstance(pt, dict):
            out.append(pt)
    return out


def _pct_change_from_series(series: list[dict[str, Any]]) -> Decimal | None:
    """Minute-over-minute change from last two Alpaca samples (same as carousel semantics)."""
    if len(series) < 2:
        return None
    curr = _dec(series[-1].get("mp"))
    prev = _dec(series[-2].get("mp"))
    if curr is None or prev is None or prev == 0:
        return None
    return (curr - prev) / prev * Decimal(100)


def fetch_forex_quotes(
    pairs: list[str],
    *,
    base_url: str | None = None,
    session: requests.Session | None = None,
    timeout: int = 30,
) -> list[ForexQuote]:
    """
    Fetch recent mid/bid/ask for each pair. Missing/failed pairs still appear with None prices.
    """
    syms = [s.strip().upper() for s in pairs if s and s.strip()]
    if not syms:
        return []

    kid, sec = load_alpaca_credentials()
    if not kid or not sec:
        return [
            ForexQuote(
                symbol=s,
                label=pair_label(s),
                mid=None,
                bid=None,
                ask=None,
                as_of=None,
                pct_change=None,
            )
            for s in syms
        ]

    base = (base_url or get_alpaca_data_base_url()).rstrip("/")
    sess = session or requests.Session()
    headers = {
        "APCA-API-KEY-ID": kid,
        "APCA-API-SECRET-KEY": sec,
    }
    end = datetime.now(timezone.utc)
    start = end - timedelta(hours=24)
    params = {
        "currency_pairs": ",".join(syms),
        "timeframe": "1Min",
        "start": start.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "end": end.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "sort": "asc",
        "limit": 10000,
    }
    url = f"{base}/v1beta1/forex/rates"
    try:
        r = sess.get(url, headers=headers, params=params, timeout=timeout)
        r.raise_for_status()
        payload = r.json()
    except (requests.RequestException, ValueError) as e:
        logger.warning("Alpaca forex rates request failed: %s", e)
        return [
            ForexQuote(
                symbol=s,
                label=pair_label(s),
                mid=None,
                bid=None,
                ask=None,
                as_of=None,
                pct_change=None,
            )
            for s in syms
        ]

    if not isinstance(payload, dict):
        return [
            ForexQuote(
                symbol=s,
                label=pair_label(s),
                mid=None,
                bid=None,
                ask=None,
                as_of=None,
                pct_change=None,
            )
            for s in syms
        ]

    rates_root = payload.get("rates")
    rates_blob: dict[str, Any] = rates_root if isinstance(rates_root, dict) else {}

    out: list[ForexQuote] = []
    for sym in syms:
        series = _rates_series_for_pair(rates_blob, sym)
        if not series:
            out.append(
                ForexQuote(
                    symbol=sym,
                    label=pair_label(sym),
                    mid=None,
                    bid=None,
                    ask=None,
                    as_of=None,
                    pct_change=None,
                )
            )
            continue
        pt = series[-1]
        mid = _dec(pt.get("mp"))
        bid = _dec(pt.get("bp"))
        ask = _dec(pt.get("ap"))
        ts = pt.get("t")
        as_of = str(ts) if ts is not None else None
        pct_ch = _pct_change_from_series(series)
        out.append(
            ForexQuote(
                symbol=sym,
                label=pair_label(sym),
                mid=mid,
                bid=bid,
                ask=ask,
                as_of=as_of,
                pct_change=pct_ch,
            )
        )
    return out


def placeholder_forex_rows(pairs: list[str]) -> list[dict[str, Any]]:
    return [
        quote_row_dict(
            ForexQuote(
                symbol=s,
                label=pair_label(s),
                mid=None,
                bid=None,
                ask=None,
                as_of=None,
                pct_change=None,
            )
        )
        for s in pairs
    ]


def get_cached_forex_quote_rows() -> list[dict[str, Any]]:
    """Return template-ready rows; cached by configured pairs and TTL."""
    from django.conf import settings
    from django.core.cache import cache

    pairs: list[str] = list(getattr(settings, "FOREX_PAIRS", []) or [])
    if not pairs:
        return []
    ttl = int(getattr(settings, "FOREX_CACHE_TTL_SECONDS", 45))
    key = "forex_quote_rows:v2:" + ",".join(pairs)
    try:
        hit = cache.get(key)
        if hit is not None:
            return hit
        rows = [quote_row_dict(q) for q in fetch_forex_quotes(pairs)]
        cache.set(key, rows, ttl)
        return rows
    except Exception as e:
        logger.warning("Forex cache or fetch failed, using placeholders: %s", e)
        return placeholder_forex_rows(pairs)
