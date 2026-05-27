"""Tests for US market session classification and extended snapshot pricing."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

from django.test import SimpleTestCase

from home.alpaca_market_client import metrics_from_snapshot_blob
from home.us_market_session import ET, classify_us_market_session

ET_TZ = ET


class UsMarketSessionTests(SimpleTestCase):
    def test_pre_market_weekday(self):
        at = datetime(2026, 5, 26, 8, 0, tzinfo=ET_TZ)
        s = classify_us_market_session(at)
        self.assertEqual(s.id, "pre")
        self.assertEqual(s.price_basis, "extended")

    def test_regular_session(self):
        at = datetime(2026, 5, 26, 11, 0, tzinfo=ET_TZ)
        s = classify_us_market_session(at)
        self.assertEqual(s.id, "regular")
        self.assertEqual(s.price_basis, "regular")

    def test_after_hours(self):
        at = datetime(2026, 5, 26, 17, 0, tzinfo=ET_TZ)
        s = classify_us_market_session(at)
        self.assertEqual(s.id, "post")
        self.assertEqual(s.price_basis, "extended")

    def test_saturday_closed(self):
        at = datetime(2026, 5, 23, 12, 0, tzinfo=ET_TZ)
        self.assertEqual(classify_us_market_session(at).id, "closed")


class ExtendedSnapshotMetricsTests(SimpleTestCase):
    def test_extended_prefers_latest_trade(self):
        snap = {
            "dailyBar": {"c": "100.0", "v": 500},
            "latestTrade": {"p": "102.5"},
            "prevDailyBar": {"c": "99"},
        }
        pre = classify_us_market_session(datetime(2026, 5, 26, 7, 0, tzinfo=ET_TZ))
        m = metrics_from_snapshot_blob("SPY", snap, session=pre)
        self.assertEqual(m.last_price, Decimal("102.5"))
        self.assertEqual(m.price_basis, "extended")

    def test_regular_prefers_daily_bar(self):
        snap = {
            "dailyBar": {"c": "100.0", "v": 500},
            "latestTrade": {"p": "102.5"},
            "prevDailyBar": {"c": "99"},
        }
        reg = classify_us_market_session(datetime(2026, 5, 26, 11, 0, tzinfo=ET_TZ))
        m = metrics_from_snapshot_blob("SPY", snap, session=reg)
        self.assertEqual(m.last_price, Decimal("100.0"))
        self.assertEqual(m.price_basis, "regular")
