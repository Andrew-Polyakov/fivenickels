"""Sync upcoming corporate dividends and market calendar days from Alpaca."""

from __future__ import annotations

import sys
from datetime import timedelta
from typing import Any

from django.core.management.base import BaseCommand
from django.db import transaction

from home.alpaca_calendar_client import calendar_api_market, fetch_market_calendar
from home.alpaca_corporate_actions_client import fetch_corporate_actions
from home.market_events import market_today_eastern
from home.models import CorporateActionEvent, MarketCalendarDay, MarketTickerRow


class Command(BaseCommand):
    help = (
        "Fetch Alpaca corporate actions (cash/stock dividends) and market calendar, "
        "upsert upcoming rows, and purge past ex_date/session_date. Run daily via cron "
        "alongside sync_market_tickers."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--lookahead-days",
            type=int,
            default=90,
            help="Days ahead from today (US/Eastern) to fetch (default 90).",
        )
        parser.add_argument(
            "symbols",
            nargs="*",
            metavar="SYMBOL",
            help="If set, only these symbols for dividends (else all enabled MarketTickerRow).",
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
            help="Fetch and log counts without writing to the database.",
        )
        parser.add_argument(
            "--skip-dividends",
            action="store_true",
            help="Only sync market calendar.",
        )
        parser.add_argument(
            "--skip-calendar",
            action="store_true",
            help="Only sync dividends.",
        )

    def handle(self, *args: Any, **options: Any):
        today = market_today_eastern()
        lookahead = max(1, int(options["lookahead_days"]))
        end = today + timedelta(days=lookahead)
        dry = bool(options["dry_run"])
        market_editor = str(options["market"] or "NASDAQ").strip()
        api_market = calendar_api_market(market_editor)

        if not options["skip_dividends"]:
            only_syms = [s.strip().upper() for s in (options["symbols"] or []) if s and s.strip()]
            symbols = only_syms or list(
                MarketTickerRow.objects.filter(enabled=True)
                .order_by("sort_order", "symbol")
                .values_list("symbol", flat=True)
            )
            if not symbols:
                self.stdout.write("No symbols for dividend sync.")
            else:
                try:
                    rows = fetch_corporate_actions(symbols, today, end)
                except Exception as ex:
                    self.stderr.write(self.style.ERROR(f"Dividends: {ex}"))
                    sys.exit(1)
                upcoming = [r for r in rows if r["ex_date"] >= today]
                if dry:
                    self.stdout.write(
                        f"[dry-run] Would upsert {len(upcoming)} dividend row(s) "
                        f"for {len(symbols)} symbol(s)."
                    )
                else:
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
                        purged, _ = CorporateActionEvent.objects.filter(
                            symbol__in=symbols,
                            ex_date__lt=today,
                        ).delete()
                    self.stdout.write(
                        self.style.SUCCESS(
                            f"Dividends: upserted {len(upcoming)} row(s); purged {purged} past."
                        )
                    )

        if not options["skip_calendar"]:
            try:
                rows = fetch_market_calendar(market_editor, today, end)
            except Exception as ex:
                self.stderr.write(self.style.ERROR(f"Calendar: {ex}"))
                sys.exit(1)
            upcoming = [r for r in rows if r["session_date"] >= today]
            if dry:
                self.stdout.write(
                    f"[dry-run] Would upsert {len(upcoming)} calendar day(s) for {api_market}."
                )
            else:
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
                    purged, _ = MarketCalendarDay.objects.filter(
                        market=api_market,
                        session_date__lt=today,
                    ).delete()
                self.stdout.write(
                    self.style.SUCCESS(
                        f"Calendar ({api_market}): upserted {len(upcoming)} day(s); "
                        f"purged {purged} past."
                    )
                )
