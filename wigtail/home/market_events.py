"""
Query helpers and JSON payloads for upcoming dividends and market calendar (bento + ticker).
"""

from __future__ import annotations

from datetime import date, datetime, timezone as dt_timezone
from decimal import Decimal
from typing import Any, Iterable
from zoneinfo import ZoneInfo

from django.utils import timezone

US_EASTERN = ZoneInfo("America/New_York")

ACTION_CASH_DIVIDEND = "cash_dividend"
ACTION_STOCK_DIVIDEND = "stock_dividend"


def dividend_max_rows_clamped(raw: object) -> int:
    try:
        n = int(raw)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        n = 25
    return max(1, min(100, n))


def calendar_max_rows_clamped(raw: object) -> int:
    try:
        n = int(raw)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        n = 30
    return max(1, min(90, n))


def resolve_dividend_symbols_from_bento(dividend_symbols_raw: object) -> list[str] | None:
    """
    Symbols for upcoming_dividends query: explicit list from the tile, or None for all enabled tickers.
    """
    if not dividend_symbols_raw:
        return None
    out: list[str] = []
    seen: set[str] = set()
    for item in dividend_symbols_raw:  # type: ignore[union-attr]
        inner = getattr(item, "value", item)
        sym = str(inner).strip().upper()
        if sym and sym not in seen:
            seen.add(sym)
            out.append(sym)
    return out if out else None


def market_today_eastern() -> date:
    """Current calendar date in US/Eastern (consistent with US equity session dates)."""
    now = timezone.now()
    if timezone.is_naive(now):
        now = timezone.make_aware(now, dt_timezone.utc)
    return now.astimezone(US_EASTERN).date()


def upcoming_dividends(
    *,
    symbols: Iterable[str] | None = None,
    limit: int = 50,
):
    from home.models import CorporateActionEvent

    today = market_today_eastern()
    qs = CorporateActionEvent.objects.filter(ex_date__gte=today).order_by("ex_date", "symbol")
    if symbols is not None:
        sym_set = {s.strip().upper() for s in symbols if s and str(s).strip()}
        if sym_set:
            qs = qs.filter(symbol__in=sym_set)
        else:
            return []
    if limit > 0:
        qs = qs[:limit]
    return list(qs)


def upcoming_calendar_days(
    *,
    market: str = "NASDAQ",
    limit: int = 30,
):
    from home.models import MarketCalendarDay

    today = market_today_eastern()
    from home.alpaca_calendar_client import calendar_api_market

    api_market = calendar_api_market(market)
    qs = MarketCalendarDay.objects.filter(
        market=api_market,
        session_date__gte=today,
    ).order_by("session_date")
    if limit > 0:
        qs = qs[:limit]
    return list(qs)


def _format_date_display(d: date | None) -> str:
    if d is None:
        return "—"
    return d.strftime("%b %d, %Y")


def _format_rate_display(action_type: str, rate: Decimal | None) -> str:
    if rate is None:
        return "—"
    if action_type == ACTION_CASH_DIVIDEND:
        q = rate.normalize()
        return f"${q}"
    q = rate.normalize()
    return f"{q}"


def _action_type_label(action_type: str) -> str:
    if action_type == ACTION_STOCK_DIVIDEND:
        return "Stock"
    return "Cash"


def _time_et_label(dt: datetime) -> str:
    local = dt
    if timezone.is_naive(local):
        local = timezone.make_aware(local, US_EASTERN)
    else:
        local = local.astimezone(US_EASTERN)
    hour = local.strftime("%I").lstrip("0") or "12"
    return f"{hour}:{local.strftime('%M %p')}"


def _format_session_window(start: datetime | None, end: datetime | None) -> str:
    if start is None or end is None:
        return ""
    return f"{_time_et_label(start)} – {_time_et_label(end)} ET"


def dividends_payload_for_bento(rows: Iterable[Any]) -> list[dict[str, Any]]:
    from django.urls import reverse

    out: list[dict[str, Any]] = []
    for row in rows:
        sym = row.symbol.upper()
        out.append(
            {
                "symbol": sym,
                "href": reverse("ticker_page", kwargs={"ticker_slug": sym.lower()}),
                "type_label": _action_type_label(row.action_type),
                "ex_date": row.ex_date.isoformat(),
                "ex_date_display": _format_date_display(row.ex_date),
                "record_date_display": _format_date_display(row.record_date),
                "payable_date_display": _format_date_display(row.payable_date),
                "rate_display": _format_rate_display(row.action_type, row.rate),
            }
        )
    return out


def calendar_payload_for_bento(rows: Iterable[Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for row in rows:
        closed = row.core_start is None or row.core_end is None
        pre = _format_session_window(row.pre_start, row.pre_end) or "—"
        core = "Closed" if closed else _format_session_window(row.core_start, row.core_end)
        post = _format_session_window(row.post_start, row.post_end) or "—"
        out.append(
            {
                "session_date": row.session_date.isoformat(),
                "session_date_display": row.session_date.strftime("%a, %b %d"),
                "pre_display": pre,
                "core_display": core,
                "post_display": post,
                "is_closed": closed,
            }
        )
    return out
