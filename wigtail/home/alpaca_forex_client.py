"""
HTTP client for Alpaca Market Data forex rates (/v1beta1/forex/rates).

Uses the same data host and auth as `alpaca_market_client` (APCA_* / ALPACA_*).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

import requests

from home.alpaca_market_client import get_alpaca_data_base_url
from home.alpaca_news_client import load_alpaca_credentials
from home.market_format import format_percent_change, percent_change_css_class

logger = logging.getLogger(__name__)

# Free ECB-backed FX when Alpaca forex is unavailable (403 / no entitlement).
# Frankfurter v2: https://www.frankfurter.app/docs/
FRANKFURTER_V2_RATES = "https://api.frankfurter.dev/v2/rates"
FRANKFURTER_QUOTES = "EUR,GBP,JPY,CHF,AUD,CAD,NZD"


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
    q = mid.quantize(Decimal("0.001"))
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


def _rates_dict_from_frankfurter_v2_rows(payload: Any) -> tuple[dict[str, Decimal], str | None]:
    """
    v2 returns a JSON array of {date, base, quote, rate} (rate = quote per 1 base).
    """
    if not isinstance(payload, list):
        return {}, None
    out: dict[str, Decimal] = {}
    date_str: str | None = None
    for row in payload:
        if not isinstance(row, dict):
            continue
        q = row.get("quote")
        rt = row.get("rate")
        if q is not None and rt is not None:
            d = _dec(rt)
            if d is not None:
                out[str(q).upper()] = d
        ds = row.get("date")
        if ds is not None:
            date_str = str(ds)
    return out, date_str


def _mid_from_usd_crosses(sym: str, r: dict[str, Decimal]) -> Decimal | None:
    """
    Frankfurter: rates[C] = units of C per 1 USD.
    Convert configured pair symbols to conventional quote mids.
    """
    s = sym.strip().upper()
    try:
        if s == "EURUSD":
            eur = r.get("EUR")
            return (Decimal(1) / eur) if eur and eur != 0 else None
        if s == "GBPUSD":
            gbp = r.get("GBP")
            return (Decimal(1) / gbp) if gbp and gbp != 0 else None
        if s == "USDJPY":
            return r.get("JPY")
        if s == "USDCHF":
            return r.get("CHF")
        if s == "AUDUSD":
            aud = r.get("AUD")
            return (Decimal(1) / aud) if aud and aud != 0 else None
        if s == "USDCAD":
            return r.get("CAD")
        if s == "NZDUSD":
            nzd = r.get("NZD")
            return (Decimal(1) / nzd) if nzd and nzd != 0 else None
        if s == "EURGBP":
            eur = r.get("EUR")
            gbp = r.get("GBP")
            if eur and gbp and eur != 0:
                return gbp / eur
            return None
    except (ArithmeticError, ZeroDivisionError):
        return None
    return None


def _pct_day_over_day(curr: Decimal | None, prev: Decimal | None) -> Decimal | None:
    if curr is None or prev is None or prev == 0:
        return None
    return (curr - prev) / prev * Decimal(100)


def fetch_frankfurter_forex_quotes(
    pairs: list[str],
    *,
    session: requests.Session | None = None,
    timeout: int = 20,
) -> list[ForexQuote]:
    """Latest ECB/Frankfurter crosses; day-over-day % vs most recent prior trading day returned."""
    syms = [s.strip().upper() for s in pairs if s and s.strip()]
    if not syms:
        return []
    sess = session or requests.Session()
    try:
        r = sess.get(
            FRANKFURTER_V2_RATES,
            params={"base": "USD", "quotes": FRANKFURTER_QUOTES},
            timeout=timeout,
        )
        r.raise_for_status()
        js = r.json()
    except (requests.RequestException, ValueError) as e:
        logger.warning("Frankfurter forex latest failed: %s", e)
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

    rates_now, date_hint = _rates_dict_from_frankfurter_v2_rows(js)
    if not rates_now:
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

    as_of = date_hint
    base_date: date | None = None
    if isinstance(date_hint, str) and len(date_hint) >= 10:
        try:
            base_date = date.fromisoformat(date_hint[:10])
        except ValueError:
            base_date = None

    rates_prev: dict[str, Decimal] | None = None
    if base_date is not None:
        for back in range(1, 10):
            d = base_date - timedelta(days=back)
            try:
                rp = sess.get(
                    FRANKFURTER_V2_RATES,
                    params={
                        "base": "USD",
                        "quotes": FRANKFURTER_QUOTES,
                        "date": d.isoformat(),
                    },
                    timeout=timeout,
                )
                if rp.status_code != 200:
                    continue
                pjson = rp.json()
                prev_dict, _ = _rates_dict_from_frankfurter_v2_rows(pjson)
                if prev_dict:
                    rates_prev = prev_dict
                    break
            except (requests.RequestException, ValueError):
                continue

    out: list[ForexQuote] = []
    for sym in syms:
        mid = _mid_from_usd_crosses(sym, rates_now)
        mid_prev = _mid_from_usd_crosses(sym, rates_prev) if rates_prev else None
        pct = _pct_day_over_day(mid, mid_prev)
        out.append(
            ForexQuote(
                symbol=sym,
                label=pair_label(sym),
                mid=mid,
                bid=None,
                ask=None,
                as_of=as_of,
                pct_change=pct,
            )
        )
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


def _fetch_alpaca_forex_quotes(
    syms: list[str],
    *,
    base_url: str | None,
    session: requests.Session,
    timeout: int,
) -> list[ForexQuote]:
    """Alpaca /v1beta1/forex/rates only; returns empty mids when unavailable."""
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
        r = session.get(url, headers=headers, params=params, timeout=timeout)
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


def fetch_forex_quotes(
    pairs: list[str],
    *,
    base_url: str | None = None,
    session: requests.Session | None = None,
    timeout: int = 30,
) -> list[ForexQuote]:
    """
    Prefer Alpaca forex; fill gaps or full fallback with Frankfurter (ECB) when Alpaca
    returns no mids (e.g. 403 / missing entitlement).
    """
    syms = [s.strip().upper() for s in pairs if s and s.strip()]
    if not syms:
        return []

    sess = session or requests.Session()
    alpaca = _fetch_alpaca_forex_quotes(syms, base_url=base_url, session=sess, timeout=timeout)

    if all(q.mid is None for q in alpaca):
        logger.info("Alpaca forex empty; using Frankfurter fallback for %s", ",".join(syms))
        return fetch_frankfurter_forex_quotes(syms, session=sess, timeout=timeout)

    if any(q.mid is None for q in alpaca):
        frank = fetch_frankfurter_forex_quotes(syms, session=sess, timeout=timeout)
        merged: list[ForexQuote] = []
        for a, f in zip(alpaca, frank):
            merged.append(a if a.mid is not None else f)
        return merged

    return alpaca


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
    key = "forex_quote_rows:v3:" + ",".join(pairs)
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
