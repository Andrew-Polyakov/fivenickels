"""Refresh header carousel prices from Alpaca stock snapshots."""

from __future__ import annotations

import sys
from typing import Any

from django.core.management.base import BaseCommand

from home.alpaca_news_client import DEFAULT_DATA_BASE_SANDBOX
from home.market_ticker_snapshot_sync import refresh_market_ticker_rows
from home.models import MarketTickerRow


class Command(BaseCommand):
    help = (
        "Fetch Alpaca snapshots for enabled MarketTickerRow records and update cached "
        "prices (same logic as StockCrawler news snapshots)."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "symbols",
            nargs="*",
            metavar="SYMBOL",
            help="If set, only these symbols (otherwise all enabled rows).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Fetch and print results without saving to the database.",
        )
        parser.add_argument(
            "--sandbox",
            action="store_true",
            help="Use Alpaca data sandbox base URL for snapshots.",
        )
        parser.add_argument(
            "--base-url",
            type=str,
            default=None,
            help="Override data API base URL for snapshots (overrides --sandbox if set).",
        )

    def handle(self, *args: Any, **options: Any):
        dry = options["dry_run"]
        only_syms = [s.strip().upper() for s in options["symbols"] if s and s.strip()]
        qs = MarketTickerRow.objects.filter(enabled=True).order_by("sort_order", "symbol")
        if only_syms:
            qs = qs.filter(symbol__in=only_syms)

        rows = list(qs)
        if not rows:
            self.stdout.write("No market ticker rows to update.")
            return

        base_url = options["base_url"] or (
            DEFAULT_DATA_BASE_SANDBOX if options["sandbox"] else None
        )
        if base_url:
            base_url = str(base_url).rstrip("/")
        else:
            base_url = None

        try:
            n = refresh_market_ticker_rows(
                rows,
                session=None,
                base_url=base_url,
                dry_run=dry,
                log_line=self.stdout.write,
            )
        except Exception as ex:
            self.stderr.write(f"Alpaca snapshot request failed: {ex}")
            sys.exit(1)

        if dry:
            return

        self.stdout.write(self.style.SUCCESS(f"Updated {n} ticker row(s)."))
