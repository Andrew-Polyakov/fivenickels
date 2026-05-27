"""
Orchestrate Alpaca → MarketTickerRow, snapshots, corporate actions, and calendar.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import date, timedelta
from typing import Any

from django.db import transaction
from django.db.models import Max
from django.utils import timezone

from home.alpaca_asset_client import fetch_all_assets, filter_us_tradable_equity_assets
from home.alpaca_calendar_client import calendar_api_market, fetch_market_calendar
from home.alpaca_corporate_actions_client import fetch_corporate_actions
from home.alpaca_market_client import fetch_snapshots
from home.market_events import market_today_eastern
from home.models import CorporateActionEvent, MarketCalendarDay, MarketTickerRow
from home.ticker_utils import _tradingview_prefix_from_alpaca_exchange

CAROUSEL_SLOT_COUNT = 25
SNAPSHOT_CHUNK_SIZE = 40
CORPORATE_ACTIONS_BATCH = 50


def _tv_symbol(exchange: str, symbol: str) -> str:
    prefix = _tradingview_prefix_from_alpaca_exchange(exchange)
    if prefix:
        return f"{prefix}:{symbol}"
    return ""


LogFn = Callable[[str], None] | None


def import_asset_universe(
    *,
    dry_run: bool = False,
    log: LogFn = None,
) -> tuple[int, int]:
    """
    Fetch Alpaca assets, filter, upsert MarketTickerRow (new rows disabled).

    Returns (created_count, updated_count).
    """
    raw = fetch_all_assets(status="active", asset_class="us_equity")
    filtered = filter_us_tradable_equity_assets(raw)
    if log:
        log(f"Assets: {len(raw)} from Alpaca -> {len(filtered)} after US/tradable filter.")

    if dry_run:
        return (0, len(filtered))

    agg = MarketTickerRow.objects.aggregate(m=Max("sort_order"))
    next_order = (agg["m"] or 0) + 1
    created = 0
    updated = 0

    for asset in filtered:
        sym = asset["symbol"]
        ex = asset.get("exchange") or ""
        tv = _tv_symbol(ex, sym)
        defaults = {
            "label": (asset.get("name") or "")[:120],
            "exchange": ex[:32] if ex else "",
            "tradable": True,
            "tradingview_symbol": tv[:64] if tv else "",
        }
        row, was_created = MarketTickerRow.objects.get_or_create(
            symbol=sym,
            defaults={
                **defaults,
                "enabled": False,
                "sort_order": next_order,
            },
        )
        if was_created:
            created += 1
            next_order += 1
            continue
        changed = False
        for field, val in defaults.items():
            if getattr(row, field) != val and val:
                setattr(row, field, val)
                changed = True
        if changed:
            row.save(update_fields=list(defaults.keys()))
            updated += 1

    return (created, updated)


def refresh_snapshots_for_symbols(
    symbols: list[str],
    *,
    dry_run: bool = False,
    log: LogFn = None,
) -> int:
    if not symbols:
        return 0
    syms = sorted({s.strip().upper() for s in symbols if s and s.strip()})
    rows_by_sym = {
        r.symbol: r
        for r in MarketTickerRow.objects.filter(symbol__in=syms)
    }
    missing = [s for s in syms if s not in rows_by_sym]
    if missing and log:
        log(f"Snapshots: skipping {len(missing)} symbol(s) not in MarketTickerRow.")

    present = [s for s in syms if s in rows_by_sym]
    if not present:
        return 0

    now = timezone.now()
    processed = 0
    for i in range(0, len(present), SNAPSHOT_CHUNK_SIZE):
        chunk = present[i : i + SNAPSHOT_CHUNK_SIZE]
        metrics = fetch_snapshots(chunk)
        to_update: list[MarketTickerRow] = []
        for sym in chunk:
            row = rows_by_sym[sym]
            m = metrics.get(sym)
            if m is None:
                continue
            if log and not dry_run:
                log(f"  {sym}: vol={m.day_volume} pct={m.percent_change}")
            if dry_run:
                processed += 1
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
            to_update.append(row)
            processed += 1
        if to_update and not dry_run:
            MarketTickerRow.objects.bulk_update(
                to_update,
                [
                    "last_price",
                    "previous_close",
                    "percent_change",
                    "day_volume",
                    "fetched_at",
                    "last_error",
                ],
            )
    return processed


def apply_carousel_top_volume(
    *,
    slot_count: int = CAROUSEL_SLOT_COUNT,
    dry_run: bool = False,
    log: LogFn = None,
) -> list[str]:
    """
    Enable carousel_pinned rows plus top (slot_count - pinned) by day_volume.
    Returns symbols enabled for carousel.
    """
    pinned = list(
        MarketTickerRow.objects.filter(carousel_pinned=True).order_by("sort_order", "symbol")
    )
    pinned_syms = {r.symbol for r in pinned}
    slots_left = max(0, slot_count - len(pinned))

    volume_qs = (
        MarketTickerRow.objects.filter(tradable=True, day_volume__isnull=False)
        .exclude(symbol__in=pinned_syms)
        .order_by("-day_volume", "symbol")
    )
    top_vol = list(volume_qs[:slots_left]) if slots_left else []
    selected = pinned + top_vol

    if log:
        log(
            f"Carousel: {len(pinned)} pinned + {len(top_vol)} by volume "
            f"= {len(selected)} enabled (max {slot_count})."
        )

    if dry_run:
        return [r.symbol for r in selected]

    selected_syms = [r.symbol for r in selected]
    with transaction.atomic():
        MarketTickerRow.objects.filter(enabled=True).exclude(
            symbol__in=selected_syms
        ).update(enabled=False)
        for order, row in enumerate(selected):
            MarketTickerRow.objects.filter(pk=row.pk).update(
                enabled=True,
                sort_order=order,
            )
    return selected_syms


def sync_corporate_actions(
    symbols: list[str],
    *,
    start: date,
    end: date,
    dry_run: bool = False,
    log: LogFn = None,
) -> int:
    if not symbols:
        return 0
    today = market_today_eastern()
    total_upserted = 0
    syms = sorted({s.strip().upper() for s in symbols if s and s.strip()})
    for i in range(0, len(syms), CORPORATE_ACTIONS_BATCH):
        chunk = syms[i : i + CORPORATE_ACTIONS_BATCH]
        rows = fetch_corporate_actions(chunk, start, end)
        upcoming = [r for r in rows if r["ex_date"] >= today]
        if dry_run:
            total_upserted += len(upcoming)
            continue
        with transaction.atomic():
            for row in upcoming:
                CorporateActionEvent.objects.update_or_create(
                    alpaca_id=row["alpaca_id"],
                    defaults={
                        "symbol": row["symbol"],
                        "action_type": row["action_type"],
                        "ex_date": row["ex_date"],
                        "record_date": row["record_date"],
                        "payable_date": row["payable_date"],
                        "rate": row["rate"],
                        "special": row["special"],
                        "foreign": row["foreign"],
                    },
                )
            CorporateActionEvent.objects.filter(
                symbol__in=chunk,
                ex_date__lt=today,
            ).delete()
        total_upserted += len(upcoming)
    if log:
        log(f"Corporate actions: upserted {total_upserted} upcoming row(s).")
    return total_upserted


def sync_market_calendar(
    *,
    market: str = "NASDAQ",
    start: date,
    end: date,
    dry_run: bool = False,
    log: LogFn = None,
) -> int:
    api_market = calendar_api_market(market)
    today = market_today_eastern()
    rows = fetch_market_calendar(market, start, end)
    upcoming = [r for r in rows if r["session_date"] >= today]
    if dry_run:
        if log:
            log(f"[dry-run] Would upsert {len(upcoming)} calendar day(s).")
        return len(upcoming)
    with transaction.atomic():
        for row in upcoming:
            MarketCalendarDay.objects.update_or_create(
                market=api_market,
                session_date=row["session_date"],
                defaults={
                    "pre_start": row.get("pre_start"),
                    "pre_end": row.get("pre_end"),
                    "core_start": row.get("core_start"),
                    "core_end": row.get("core_end"),
                    "post_start": row.get("post_start"),
                    "post_end": row.get("post_end"),
                    "settlement_date": row.get("settlement_date"),
                },
            )
        MarketCalendarDay.objects.filter(
            market=api_market,
            session_date__lt=today,
        ).delete()
    if log:
        log(f"Calendar: upserted {len(upcoming)} day(s) for {api_market}.")
    return len(upcoming)


def run_full_alpaca_market_sync(
    *,
    dry_run: bool = False,
    lookahead_days: int = 90,
    calendar_market: str = "NASDAQ",
    skip_assets: bool = False,
    skip_snapshots: bool = False,
    skip_carousel: bool = False,
    skip_events: bool = False,
    skip_calendar: bool = False,
    events_symbols: list[str] | None = None,
    snapshot_symbols: list[str] | None = None,
    log: LogFn = None,
) -> dict[str, Any]:
    """Single entry point used by manage.py sync_alpaca_market."""
    today = market_today_eastern()
    end = today + timedelta(days=max(1, lookahead_days))
    summary: dict[str, Any] = {}

    if not skip_assets:
        created, updated = import_asset_universe(dry_run=dry_run, log=log)
        summary["assets_created"] = created
        summary["assets_updated"] = updated

    if not skip_snapshots:
        if snapshot_symbols is not None:
            snap_syms = snapshot_symbols
        else:
            snap_syms = list(
                MarketTickerRow.objects.filter(tradable=True).values_list("symbol", flat=True)
            )
        n = refresh_snapshots_for_symbols(snap_syms, dry_run=dry_run, log=log)
        summary["snapshots_processed"] = n

    if not skip_carousel:
        carousel = apply_carousel_top_volume(dry_run=dry_run, log=log)
        summary["carousel_symbols"] = carousel

    if not skip_events:
        if events_symbols is not None:
            ev_syms = events_symbols
        else:
            ev_syms = list(
                MarketTickerRow.objects.filter(enabled=True).values_list("symbol", flat=True)
            )
        summary["events_upserted"] = sync_corporate_actions(
            ev_syms, start=today, end=end, dry_run=dry_run, log=log
        )

    if not skip_calendar:
        summary["calendar_days"] = sync_market_calendar(
            market=calendar_market,
            start=today,
            end=end,
            dry_run=dry_run,
            log=log,
        )

    return summary
