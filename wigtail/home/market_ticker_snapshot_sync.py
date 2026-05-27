"""Shared Alpaca snapshot refresh for MarketTickerRow (carousel)."""

from __future__ import annotations

from collections.abc import Callable

import requests
from django.db import transaction
from django.db.models import Max
from django.utils import timezone

from home.alpaca_market_client import fetch_snapshots
from home.models import MarketTickerRow


def ensure_market_ticker_rows_for_symbols(symbols: list[str]) -> tuple[int, int]:
    """
    Ensure a MarketTickerRow exists for each symbol (uppercase, de-duplicated order).

    New rows: enabled=True, sort_order appended after current Max(sort_order).

    Returns (created_count, already_existed_count).
    """
    syms: list[str] = []
    for s in symbols:
        u = s.strip().upper()
        if u and u not in syms:
            syms.append(u)
    if not syms:
        return (0, 0)

    created = 0
    existing = 0
    agg = MarketTickerRow.objects.aggregate(m=Max("sort_order"))
    next_order = (agg["m"] or 0) + 1

    for sym in syms:
        _row, was_created = MarketTickerRow.objects.get_or_create(
            symbol=sym,
            defaults={
                "sort_order": next_order,
                "enabled": False,
            },
        )
        if was_created:
            created += 1
            next_order += 1
        else:
            existing += 1

    return (created, existing)


def refresh_market_ticker_rows(
    rows: list[MarketTickerRow],
    *,
    session: requests.Session | None = None,
    base_url: str | None = None,
    dry_run: bool = False,
    log_line: Callable[[str], None] | None = None,
) -> int:
    """
    Fetch Alpaca snapshots and update cached price fields on ``rows``.

    If ``dry_run`` is True, prints lines (when ``log_line`` set) but does not save.

    Returns the number of rows processed. Raises whatever ``fetch_snapshots`` raises.
    """
    if not rows:
        return 0

    symbols = [r.symbol for r in rows]
    metrics_map = fetch_snapshots(symbols, session=session, base_url=base_url)

    now = timezone.now()
    fields = [
        "last_price",
        "previous_close",
        "percent_change",
        "day_volume",
        "fetched_at",
        "last_error",
    ]

    for row in rows:
        m = metrics_map[row.symbol]
        line = (
            f"{row.symbol}: last={m.last_price} prev={m.previous_close} "
            f"pct={m.percent_change} vol={m.day_volume}"
        )
        if log_line:
            log_line(line)

        if dry_run:
            continue

        row.last_price = m.last_price
        row.previous_close = m.previous_close
        row.percent_change = m.percent_change
        row.day_volume = m.day_volume
        row.fetched_at = now
        if m.last_price is None and m.percent_change is None:
            row.last_error = "No bar or trade data in snapshot."
        else:
            row.last_error = ""

    if dry_run:
        return len(rows)

    with transaction.atomic():
        MarketTickerRow.objects.bulk_update(rows, fields)

    return len(rows)
