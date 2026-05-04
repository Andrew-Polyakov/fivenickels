"""Tests for Alpaca snapshot metrics and sync_market_tickers command."""

from __future__ import annotations

from decimal import Decimal
from unittest.mock import MagicMock, patch

from django.core.management import call_command
from wagtail.models import Page, Site
from wagtail.test.utils import WagtailPageTestCase

from home.alpaca_market_client import (
    SnapshotMetrics,
    fetch_snapshots,
    metrics_from_snapshot_blob,
)
from home.models import HomePage, MarketTickerRow


class AlpacaSnapshotMetricsTests(WagtailPageTestCase):
    def test_metrics_from_daily_and_prev_bar(self):
        snap = {
            "dailyBar": {"c": "110.5", "v": 1000000},
            "prevDailyBar": {"c": "100.0"},
        }
        m = metrics_from_snapshot_blob("SPY", snap)
        self.assertEqual(m.symbol, "SPY")
        self.assertEqual(m.last_price, Decimal("110.5"))
        self.assertEqual(m.previous_close, Decimal("100.0"))
        self.assertEqual(m.percent_change, Decimal("10.5"))
        self.assertEqual(m.day_volume, 1000000)

    def test_metrics_fallback_latest_trade(self):
        snap = {
            "latestTrade": {"p": "99.99"},
            "prevDailyBar": {"c": "100"},
        }
        m = metrics_from_snapshot_blob("X", snap)
        self.assertEqual(m.last_price, Decimal("99.99"))
        self.assertEqual(m.percent_change.quantize(Decimal("0.01")), Decimal("-0.01"))


class SyncMarketTickersCommandTests(WagtailPageTestCase):
    def setUp(self):
        super().setUp()
        root = Page.get_first_root_node()
        self.homepage = HomePage(title="Home")
        root.add_child(instance=self.homepage)
        self.homepage.save_revision().publish()
        Site.objects.update_or_create(
            hostname="testsite",
            defaults={
                "port": 80,
                "root_page": self.homepage,
                "is_default_site": True,
            },
        )

    def test_sync_updates_cached_fields(self):
        MarketTickerRow.objects.create(
            symbol="SPY",
            label="S&P 500",
            sort_order=0,
            enabled=True,
        )

        def fake_fetch(symbols: list[str], **kwargs: object):
            return {
                "SPY": SnapshotMetrics(
                    symbol="SPY",
                    last_price=Decimal("450"),
                    previous_close=Decimal("440"),
                    percent_change=Decimal("100") * (Decimal("450") - Decimal("440"))
                    / Decimal("440"),
                    day_volume=1_000_000,
                )
            }

        with patch(
            "home.market_ticker_snapshot_sync.fetch_snapshots",
            side_effect=fake_fetch,
        ):
            call_command("sync_market_tickers")

        row = MarketTickerRow.objects.get(symbol="SPY")
        self.assertEqual(row.last_price, Decimal("450"))
        self.assertEqual(row.previous_close, Decimal("440"))
        self.assertIsNotNone(row.fetched_at)
        self.assertEqual(row.last_error, "")
        self.assertEqual(row.day_volume, 1_000_000)

    def test_fetch_snapshots_parses_snapshots_wrapper(self):
        payload = {
            "snapshots": {
                "QQQ": {
                    "dailyBar": {"c": 400, "v": 500},
                    "prevDailyBar": {"c": 390},
                }
            }
        }
        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = payload
        with patch(
            "home.alpaca_market_client.load_alpaca_credentials",
            return_value=("kid", "sec"),
        ):
            with patch("home.alpaca_market_client.requests.Session") as mock_sess_cls:
                mock_sess_cls.return_value.get.return_value = mock_resp
                out = fetch_snapshots(["QQQ"], base_url="https://data.alpaca.markets")
        self.assertIn("QQQ", out)
        self.assertEqual(out["QQQ"].last_price, Decimal("400"))
        self.assertEqual(out["QQQ"].previous_close, Decimal("390"))
