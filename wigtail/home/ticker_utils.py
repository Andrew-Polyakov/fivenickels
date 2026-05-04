"""Helpers for public ticker pages (TradingView symbol, URLs)."""

from __future__ import annotations

import re

from django.core.cache import cache
from django.urls import reverse
from django.utils.html import escape

from home.alpaca_asset_client import fetch_asset_meta
from home.market_format import format_percent_change, percent_change_css_class
from home.models import MarketTickerRow

# Common NYSE listings — used when Alpaca asset meta is unavailable.
_NYSE_SYMBOLS = frozenset(
    {
        "JPM",
        "BAC",
        "WFC",
        "V",
        "MA",
        "DIS",
        "JNJ",
        "PFE",
        "XOM",
        "CVX",
        "KO",
        "MCD",
        "IBM",
        "GE",
        "CAT",
        "BA",
    }
)

_TV_SYM_CACHE_PREFIX = "ticker:tv_symbol:v2:"
_TV_SYM_TTL = 86400

# Alpaca GET /v2/assets/{symbol} "exchange" → TradingView chart prefix
_ALPACA_EXCHANGE_TO_TV_PREFIX: dict[str, str] = {
    "NYSE": "NYSE",
    "NASDAQ": "NASDAQ",
    "AMEX": "AMEX",
    "ARCA": "AMEX",
    "NYSEARCA": "AMEX",
    "BATS": "BATS",
    "OTC": "OTC",
    "OTCM": "OTC",
    "PINK": "OTC",
    "NYSEAMERICAN": "AMEX",
}


def _tradingview_prefix_from_alpaca_exchange(exchange: str) -> str | None:
    x = (exchange or "").strip().upper()
    if not x:
        return None
    if x in _ALPACA_EXCHANGE_TO_TV_PREFIX:
        return _ALPACA_EXCHANGE_TO_TV_PREFIX[x]
    if x.startswith("NYSE") and "NASDAQ" not in x:
        return "NYSE"
    if "NASDAQ" in x or x in ("NMS", "NGM", "NCM"):
        return "NASDAQ"
    return None


def default_tradingview_symbol_for_row(row: MarketTickerRow) -> str:
    """Broker-style symbol for TradingView widgets (EXCHANGE:TICKER)."""
    custom = (row.tradingview_symbol or "").strip()
    if custom:
        return custom
    sym = (row.symbol or "").strip().upper()
    if not sym:
        return "NASDAQ:"

    cache_key = f"{_TV_SYM_CACHE_PREFIX}{sym}"
    cached = cache.get(cache_key)
    if isinstance(cached, str) and cached:
        return cached

    meta = fetch_asset_meta(sym)
    prefix: str | None = None
    if meta:
        prefix = _tradingview_prefix_from_alpaca_exchange(str(meta.get("exchange") or ""))

    if prefix:
        result = f"{prefix}:{sym}"
        cache.set(cache_key, result, _TV_SYM_TTL)
        return result

    if sym in _NYSE_SYMBOLS:
        result = f"NYSE:{sym}"
        cache.set(cache_key, result, _TV_SYM_TTL)
        return result

    result = f"NASDAQ:{sym}"
    cache.set(cache_key, result, _TV_SYM_TTL)
    return result


# Exchange-style mentions in prose (case-insensitive exchange; ticker letters).
_EXCHANGE_TICKER_RE = re.compile(
    r"\b(NYSE|NASDAQ|AMEX|ARCA|BATS)\s*:\s*([A-Za-z]{1,6})\b",
    re.IGNORECASE,
)


def build_ticker_chip_html(row: MarketTickerRow) -> str:
    """Same chip markup as components/ticker_chip.html (label + % in one box)."""
    href = href_for_ticker_subpage(None, ticker_slug=row.symbol.lower())
    label = escape(default_tradingview_symbol_for_row(row))
    pct_fmt = escape(format_percent_change(row.percent_change))
    pct_cls = percent_change_css_class(row.percent_change)
    return (
        f'<a href="{escape(href)}" class="ticker-chip ticker-chip--inline">'
        f'<span class="ticker-chip__box ticker-chip__box--{pct_cls}">'
        f'<span class="ticker-chip__label">{label}</span>'
        f'<span class="ticker-chip__pct">{pct_fmt}</span>'
        f"</span></a>"
    )


def replace_exchange_ticker_tokens(text: str) -> str:
    """
    Replace EXCHANGE: TICKER tokens with carousel-style chips when an enabled
    MarketTickerRow exists; otherwise escape the original token text.
    """
    if not text:
        return ""
    out: list[str] = []
    pos = 0
    for m in _EXCHANGE_TICKER_RE.finditer(text):
        out.append(escape(text[pos : m.start()]))
        sym = m.group(2).upper()
        row = MarketTickerRow.objects.filter(symbol=sym, enabled=True).first()
        if row:
            out.append(build_ticker_chip_html(row))
        else:
            out.append(escape(m.group(0)))
        pos = m.end()
    out.append(escape(text[pos:]))
    return "".join(out)


def href_for_ticker_subpage(home=None, *, ticker_slug: str) -> str:
    """
    Canonical site-relative URL for the ticker page.

    Uses the named Django route (`ticker_page`) so links stay correct when the
    HomePage lives under `/home/` (routable-only URLs would miss `/home/`).
    `home` is kept for call-site compatibility and ignored.
    """
    return reverse("ticker_page", kwargs={"ticker_slug": ticker_slug.lower()})
