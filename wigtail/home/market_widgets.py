"""Live FX and market-movers payloads for bento tiles and templates."""

from __future__ import annotations

from typing import Any

from django.conf import settings
from django.http import HttpRequest, QueryDict

from home.alpaca_forex_client import get_cached_forex_quote_rows, placeholder_forex_rows
from home.ticker_utils import chip_context_for_row, href_for_ticker_subpage

MARKET_REGION_KEYS = frozenset({"US", "ASIA", "EUROPE"})


def normalize_market_region_key(raw: str | None, *, default: str = "US") -> str:
    key = (raw or default).strip().upper()
    return key if key in MARKET_REGION_KEYS else default


def resolve_market_region_key(
    request: HttpRequest | None,
    *,
    block_region: str | None = None,
) -> str:
    """Block field wins, then ``?market_region=``, then middleware-detected region, then US."""
    if block_region:
        normalized = normalize_market_region_key(block_region)
        if normalized in MARKET_REGION_KEYS:
            return normalized
    if request is not None:
        q = (request.GET.get("market_region") or "").strip().upper()
        if q in MARKET_REGION_KEYS:
            return q
        detected = getattr(request, "market_region", None)
        if detected in MARKET_REGION_KEYS:
            return detected
    return "US"


def build_forex_quotes_payload() -> list[dict[str, Any]]:
    rows = get_cached_forex_quote_rows()
    if not rows and getattr(settings, "FOREX_PAIRS", None):
        rows = placeholder_forex_rows(list(settings.FOREX_PAIRS))
    return list(rows or [])


def chip_dict_for_json(row) -> dict[str, Any]:
    """JSON-safe market mover chip (matches React / template fields)."""
    ctx = chip_context_for_row(row)
    sym = (getattr(row, "symbol", None) or "").strip().lower()
    return {
        "symbol": (getattr(row, "symbol", None) or "").strip().upper(),
        "label": ctx["label"],
        "href": href_for_ticker_subpage(ticker_slug=sym or "_"),
        "pct_formatted": ctx["pct_formatted"],
        "pct_class": ctx["pct_class"],
        "price_display": ctx.get("price_display") or "",
    }


def build_market_movers_groups(rows: list, selected_region_key: str) -> dict[str, Any]:
    eligible = [
        row
        for row in rows
        if row.enabled
        and row.percent_change is not None
        and (getattr(row, "market_region", "US") or "US").upper() == selected_region_key
    ]
    winner_rows = sorted(
        [row for row in eligible if row.percent_change > 0],
        key=lambda row: row.percent_change,
        reverse=True,
    )[:10]
    looser_rows = sorted(
        [row for row in eligible if row.percent_change < 0],
        key=lambda row: row.percent_change,
    )[:10]
    winners = [chip_dict_for_json(row) for row in winner_rows]
    loosers = [chip_dict_for_json(row) for row in looser_rows]
    return {
        "winners": winners,
        "loosers": loosers,
        "has_data": bool(winners or loosers),
    }


def build_market_mover_tabs(
    request: HttpRequest | None,
    selected_region_key: str,
) -> list[dict[str, Any]]:
    path = (request.path if request is not None else "/") or "/"
    if request is not None and hasattr(request.GET, "urlencode"):
        get = request.GET.copy()
    elif request is not None:
        get = QueryDict(mutable=True)
        for key, val in dict(request.GET or {}).items():
            get[key] = val
    else:
        get = QueryDict(mutable=True)
    tabs: list[dict[str, Any]] = []
    for key, label in (("US", "US"), ("ASIA", "Asia"), ("EUROPE", "Europe")):
        q = get.copy()
        q["market_region"] = key
        tabs.append(
            {
                "key": key,
                "label": label,
                "active": key == selected_region_key,
                "url": f"{path}?{q.urlencode()}",
            }
        )
    return tabs


def build_market_movers_payload(
    rows: list,
    request: HttpRequest | None,
    *,
    block_region: str | None = None,
) -> dict[str, Any]:
    region_key = resolve_market_region_key(request, block_region=block_region)
    return {
        "market_movers": build_market_movers_groups(rows, region_key),
        "market_mover_tabs": build_market_mover_tabs(request, region_key),
        "selected_region": region_key,
    }
