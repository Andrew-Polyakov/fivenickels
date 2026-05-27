"""
Unified Alpaca market sync: asset universe, snapshots, carousel top-25, events, calendar.

Replaces running sync_market_tickers + sync_market_events separately for daily cron.
"""

from __future__ import annotations

import sys
from typing import Any

from django.core.management.base import BaseCommand

from home.market_alpaca_sync import run_full_alpaca_market_sync


class Command(BaseCommand):
    help = (
        "Import Alpaca US equity universe, refresh snapshots, pick top-25 carousel by "
        "volume (plus staff-pinned), sync corporate actions and market calendar."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--lookahead-days",
            type=int,
            default=90,
            help="Days ahead for corporate actions and calendar (default 90).",
        )
        parser.add_argument(
            "--market",
            type=str,
            default="NASDAQ",
            help="Calendar market: NASDAQ or NYSE (default NASDAQ).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Fetch and log without writing to the database.",
        )
        parser.add_argument(
            "--skip-assets",
            action="store_true",
            help="Skip asset universe import.",
        )
        parser.add_argument(
            "--skip-snapshots",
            action="store_true",
            help="Skip snapshot price/volume refresh.",
        )
        parser.add_argument(
            "--skip-carousel",
            action="store_true",
            help="Skip top-25 carousel selection.",
        )
        parser.add_argument(
            "--skip-events",
            action="store_true",
            help="Skip corporate actions (dividends).",
        )
        parser.add_argument(
            "--skip-calendar",
            action="store_true",
            help="Skip market calendar.",
        )
        parser.add_argument(
            "--events-scope",
            choices=("carousel", "all"),
            default="all",
            help="Corporate actions: carousel=enabled rows only; all=entire tradable universe.",
        )
        parser.add_argument(
            "symbols",
            nargs="*",
            metavar="SYMBOL",
            help="If set, limit snapshots/events to these symbols (assets import still full).",
        )

    def handle(self, *args: Any, **options: Any):
        only_syms = [s.strip().upper() for s in (options["symbols"] or []) if s and s.strip()]
        events_scope = options["events_scope"]

        def log(msg: str) -> None:
            self.stdout.write(msg)

        from home.alpaca_news_client import get_alpaca_trading_base_url, resolve_alpaca_trading_live

        env_mode = resolve_alpaca_trading_live()
        mode_label = (
            "live" if env_mode is True else "paper" if env_mode is False else "paper (default)"
        )
        self.stdout.write(
            f"Alpaca trading API: {get_alpaca_trading_base_url()} ({mode_label})"
        )

        events_symbols = None
        snapshot_symbols = None
        if only_syms:
            events_symbols = only_syms
            snapshot_symbols = only_syms
        elif events_scope == "carousel":
            from home.models import MarketTickerRow

            events_symbols = list(
                MarketTickerRow.objects.filter(enabled=True).values_list("symbol", flat=True)
            )

        try:
            summary = run_full_alpaca_market_sync(
                dry_run=bool(options["dry_run"]),
                lookahead_days=int(options["lookahead_days"]),
                calendar_market=str(options["market"] or "NASDAQ"),
                skip_assets=bool(options["skip_assets"]),
                skip_snapshots=bool(options["skip_snapshots"]),
                skip_carousel=bool(options["skip_carousel"]),
                skip_events=bool(options["skip_events"]),
                skip_calendar=bool(options["skip_calendar"]),
                events_symbols=events_symbols,
                snapshot_symbols=snapshot_symbols,
                log=log,
            )
        except Exception as ex:
            self.stderr.write(self.style.ERROR(str(ex)))
            sys.exit(1)

        self.stdout.write(self.style.SUCCESS(f"Done: {summary}"))
