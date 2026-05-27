"""Tests for Alpaca asset universe filtering."""

from __future__ import annotations

from django.test import SimpleTestCase

from home.alpaca_asset_client import filter_us_tradable_equity_assets


class AlpacaAssetFilterTests(SimpleTestCase):
    def test_filters_inactive_and_non_us_exchange(self):
        raw = [
            {
                "symbol": "AAPL",
                "name": "Apple",
                "exchange": "NASDAQ",
                "class": "us_equity",
                "status": "active",
                "tradable": True,
            },
            {
                "symbol": "OLD",
                "name": "Old Co",
                "exchange": "NASDAQ",
                "class": "us_equity",
                "status": "inactive",
                "tradable": True,
            },
            {
                "symbol": "FOREX",
                "name": "Fx",
                "exchange": "FTX",
                "class": "us_equity",
                "status": "active",
                "tradable": True,
            },
            {
                "symbol": "BRK.B",
                "name": "Berkshire",
                "exchange": "NYSE",
                "class": "us_equity",
                "status": "active",
                "tradable": True,
            },
        ]
        out = filter_us_tradable_equity_assets(raw)
        self.assertEqual([r["symbol"] for r in out], ["AAPL"])
