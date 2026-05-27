"""Shared ticker page render (root URL + HomePage routable subpath)."""

from __future__ import annotations

from django.core.cache import cache
from django.http import Http404
from django.template.response import TemplateResponse
from django.utils import timezone

from home.alpaca_asset_client import fetch_asset_meta
from home.alpaca_market_client import fetch_snapshots
from home.market_format import (
    format_day_volume,
    format_dollar_change_vs_previous_close,
    format_equity_price,
    format_percent_change,
    percent_change_css_class,
)
from home.market_events import dividends_payload_for_bento, upcoming_dividends
from home.models import MarketTickerRow
from django.urls import reverse

from home.crawler_setups import fetch_latest_setup_for_symbol
from home.volume_gauge import volume_gauge_for_symbol
from home.query import get_related_pages_for_ticker
from home.ticker_utils import default_tradingview_symbol_for_row

_ASSET_CTX_CACHE_PREFIX = "ticker:asset_ctx:v1:"
_CTX_NEGATIVE_TTL = 600
_CTX_POSITIVE_TTL = 3600


def _serialize_corporate_events(symbol: str, *, limit: int = 24) -> list[dict[str, str]]:
    from home.models import CorporateActionEvent

    today = timezone.localdate()
    events = list(
        CorporateActionEvent.objects.filter(symbol=symbol.upper(), ex_date__gte=today)
        .order_by("ex_date", "action_type")[:limit]
    )
    out: list[dict[str, str]] = []
    for row in events:
        kind = "Stock dividend" if row.action_type == "stock_dividend" else "Cash dividend"
        tags: list[str] = []
        if row.special:
            tags.append("Special")
        if row.foreign:
            tags.append("Foreign")
        if row.rate is None:
            rate_display = "—"
        elif row.action_type == "cash_dividend":
            rate_display = f"${row.rate.normalize()}"
        else:
            rate_display = f"{row.rate.normalize()}"
        out.append(
            {
                "type_label": kind,
                "ex_date_display": row.ex_date.strftime("%b %d, %Y") if row.ex_date else "—",
                "record_date_display": (
                    row.record_date.strftime("%b %d, %Y") if row.record_date else "—"
                ),
                "payable_date_display": (
                    row.payable_date.strftime("%b %d, %Y") if row.payable_date else "—"
                ),
                "rate_display": rate_display,
                "tags_display": ", ".join(tags) if tags else "",
            }
        )
    return out


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


def serialize_related_pages(pages) -> list[dict]:
    out: list[dict] = []
    for page in pages:
        catalyst = getattr(page, "catalyst", None) or None
        if catalyst == "":
            catalyst = None
        date_display = None
        if page.first_published_at:
            date_display = timezone.localtime(page.first_published_at).strftime(
                "%b %d %Y"
            ).upper()
        out.append(
            {
                "title": page.title,
                "url": page.get_url(),
                "date": date_display,
                "catalyst": catalyst,
            }
        )
    return out


def _row_for_symbol(symbol: str) -> MarketTickerRow:
    """DB row when present (carousel or universe), else ephemeral row with live snapshot."""
    row = MarketTickerRow.objects.filter(symbol=symbol).first()
    if row is not None:
        return row
    row = MarketTickerRow(symbol=symbol, label="", sort_order=9999, enabled=True)
    try:
        snaps = fetch_snapshots([symbol])
        m = snaps.get(symbol)
        if m and m.last_price is not None:
            row.last_price = m.last_price
            row.previous_close = m.previous_close
            row.percent_change = m.percent_change
            row.day_volume = m.day_volume
    except Exception:
        pass
    return row


def build_ticker_template_context(ticker_slug: str) -> dict:
    slug_clean = (ticker_slug or "").strip()
    if not slug_clean:
        raise Http404()
    symbol = slug_clean.upper()
    row = _row_for_symbol(symbol)
    chart_symbol = default_tradingview_symbol_for_row(row)
    related_pages = get_related_pages_for_ticker(slug_clean.lower(), limit=24)

    ac = _asset_context(row, chart_symbol)
    vol_disp = format_day_volume(row.day_volume)
    vol_gauge = volume_gauge_for_symbol(
        row.symbol,
        snapshot_day_volume=int(row.day_volume) if row.day_volume is not None else None,
    )

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
        "volume_gauge": vol_gauge,
        "as_of_display": _format_as_of(row.fetched_at),
        "snapshot_synced": row.fetched_at is not None,
    }

    div_rows = upcoming_dividends(symbols=[row.symbol], limit=20)
    dividend_rows = dividends_payload_for_bento(div_rows)
    event_rows = _serialize_corporate_events(row.symbol, limit=40)

    ticker_setup = fetch_latest_setup_for_symbol(symbol)
    swing_setups_page_url = reverse("swing_setups")
    if ticker_setup and ticker_setup.get("run_id") is not None:
        swing_setups_page_url = (
            f"{swing_setups_page_url}?run={int(ticker_setup['run_id'])}"
        )

    return {
        "ticker_row": row,
        "chart_symbol": chart_symbol,
        "ticker_slug": slug_clean.lower(),
        "related_pages_json": serialize_related_pages(related_pages),
        "ticker_setup": ticker_setup,
        "ticker_info": ticker_info,
        "dividend_rows": dividend_rows,
        "event_rows": event_rows,
        "swing_setups_page_url": swing_setups_page_url,
        "stock_bars_preview_url": reverse("stock_bars_preview"),
    }


def render_ticker_page(request, ticker_slug: str) -> TemplateResponse:
    context = build_ticker_template_context(ticker_slug)
    return TemplateResponse(request, "home/ticker_page.html", context)
