"""Shared ticker page render (root URL + HomePage routable subpath)."""

from __future__ import annotations

from django.core.cache import cache
from django.http import Http404
from django.template.response import TemplateResponse
from django.utils import timezone

from home.alpaca_asset_client import fetch_asset_meta
from home.market_format import (
    format_day_volume,
    format_dollar_change_vs_previous_close,
    format_equity_price,
    format_percent_change,
    percent_change_css_class,
)
from home.models import MarketTickerRow
from home.query import get_related_pages_for_ticker
from home.ticker_utils import default_tradingview_symbol_for_row

_ASSET_CTX_CACHE_PREFIX = "ticker:asset_ctx:v1:"
_CTX_NEGATIVE_TTL = 600
_CTX_POSITIVE_TTL = 3600


def _asset_context(row: MarketTickerRow, chart_symbol: str) -> dict[str, str]:
    """
    Company line + subtitle from Alpaca asset when available.

    company_display: primary white headline (legal name or snippet label / symbol).
    subtitle: secondary line (exchange or TradingView-style symbol).
    """
    key = f"{_ASSET_CTX_CACHE_PREFIX}{row.symbol}"
    cached = cache.get(key)
    if isinstance(cached, dict) and "company_display" in cached and "subtitle" in cached:
        return cached

    meta = fetch_asset_meta(row.symbol)
    name = ""
    if meta:
        name = str(meta.get("name") or "").strip()
    ex = ""
    if meta:
        ex = str(meta.get("exchange") or "").strip()

    label_or_sym = row.display_label()

    if name:
        subtitle = ex if ex else chart_symbol
        ctx = {"company_display": name, "subtitle": subtitle}
        cache.set(key, ctx, _CTX_POSITIVE_TTL)
        return ctx

    ctx = {
        "company_display": label_or_sym,
        "subtitle": chart_symbol,
    }
    cache.set(key, ctx, _CTX_NEGATIVE_TTL)
    return ctx


def _format_as_of(dt) -> str | None:
    if dt is None:
        return None
    local = timezone.localtime(dt)
    return local.strftime("%b %d %Y %H:%M %Z")


def build_ticker_template_context(ticker_slug: str) -> dict:
    slug_clean = (ticker_slug or "").strip()
    symbol = slug_clean.upper()
    row = MarketTickerRow.objects.filter(symbol=symbol, enabled=True).first()
    if row is None:
        raise Http404()
    chart_symbol = default_tradingview_symbol_for_row(row)
    related_pages = get_related_pages_for_ticker(slug_clean.lower(), limit=24)

    ac = _asset_context(row, chart_symbol)
    vol_disp = format_day_volume(row.day_volume)

    ticker_info = {
        "symbol": row.symbol,
        "headline": row.display_label(),
        "company_display": ac["company_display"],
        "subtitle": ac["subtitle"],
        "chart_symbol_display": chart_symbol,
        "price_display": format_equity_price(row.last_price),
        "pct_formatted": format_percent_change(row.percent_change),
        "pct_class": percent_change_css_class(row.percent_change),
        "dollar_change_display": format_dollar_change_vs_previous_close(
            row.last_price,
            row.previous_close,
        ),
        "volume_display": vol_disp if vol_disp else "—",
        "as_of_display": _format_as_of(row.fetched_at),
        "snapshot_synced": row.fetched_at is not None,
    }

    return {
        "ticker_row": row,
        "chart_symbol": chart_symbol,
        "ticker_slug": slug_clean.lower(),
        "related_pages": related_pages,
        "ticker_info": ticker_info,
    }


def render_ticker_page(request, ticker_slug: str) -> TemplateResponse:
    context = build_ticker_template_context(ticker_slug)
    return TemplateResponse(request, "home/ticker_page.html", context)
