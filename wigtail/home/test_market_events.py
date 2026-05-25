"""Tests for market_events query helpers and bento payloads."""

from __future__ import annotations

import uuid
from datetime import timedelta
from decimal import Decimal

from django.test import TestCase

from home.market_events import (
    calendar_payload_for_bento,
    dividends_payload_for_bento,
    market_today_eastern,
    upcoming_calendar_days,
    upcoming_dividends,
)
from home.models import CorporateActionEvent, MarketCalendarDay


class MarketEventsQueryTests(TestCase):
    def test_upcoming_dividends_excludes_past_ex_date(self):
        today = market_today_eastern()
        CorporateActionEvent.objects.create(
            alpaca_id=uuid.uuid4(),
            symbol="OLD",
            action_type=CorporateActionEvent.ACTION_CASH,
            ex_date=today - timedelta(days=1),
            rate=Decimal("0.10"),
        )
        CorporateActionEvent.objects.create(
            alpaca_id=uuid.uuid4(),
            symbol="NEW",
            action_type=CorporateActionEvent.ACTION_CASH,
            ex_date=today + timedelta(days=3),
            rate=Decimal("0.20"),
        )
        rows = upcoming_dividends(symbols=["OLD", "NEW"], limit=10)
        self.assertEqual([r.symbol for r in rows], ["NEW"])

    def test_dividends_payload_shape(self):
        today = market_today_eastern()
        ev = CorporateActionEvent.objects.create(
            alpaca_id=uuid.uuid4(),
            symbol="ZZZ",
            action_type=CorporateActionEvent.ACTION_CASH,
            ex_date=today,
            record_date=today,
            payable_date=today + timedelta(days=14),
            rate=Decimal("1.5"),
            special=True,
            foreign=False,
        )
        payload = dividends_payload_for_bento([ev])[0]
        self.assertEqual(payload["symbol"], "ZZZ")
        self.assertIn("type_label", payload)
        self.assertIn("href", payload)
        self.assertTrue(payload["href"].endswith("/ticker/zzz/"))
        self.assertIn("ex_date_display", payload)
        self.assertIn("$", payload["rate_display"])

    def test_upcoming_calendar_excludes_past_sessions(self):
        today = market_today_eastern()
        MarketCalendarDay.objects.create(
            market="NASDAQ",
            session_date=today - timedelta(days=2),
        )
        MarketCalendarDay.objects.create(
            market="NASDAQ",
            session_date=today + timedelta(days=1),
            core_start=None,
            core_end=None,
        )
        rows = upcoming_calendar_days(market="NASDAQ", limit=10)
        self.assertEqual(len(rows), 1)
        self.assertTrue(rows[0].core_start is None)

    def test_calendar_payload_marks_closed_days(self):
        today = market_today_eastern()
        day = MarketCalendarDay.objects.create(
            market="NASDAQ",
            session_date=today,
            core_start=None,
            core_end=None,
        )
        payload = calendar_payload_for_bento([day])[0]
        self.assertEqual(payload["core_display"], "Closed")
        self.assertTrue(payload["is_closed"])
