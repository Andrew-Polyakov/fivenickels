"""Unit tests for Alpaca forex helper (labels + parsing)."""

from __future__ import annotations

from decimal import Decimal
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from home.alpaca_forex_client import (
    ForexQuote,
    _mid_from_usd_crosses,
    fetch_forex_quotes,
    pair_label,
    quote_row_dict,
)


class ForexLabelTests(SimpleTestCase):
    def test_pair_label_splits_six_letter_pair(self):
        self.assertEqual(pair_label("EURUSD"), "EUR/USD")
        self.assertEqual(pair_label("usdJPY"), "USD/JPY")

    def test_mid_from_frankfurter_usd_crosses(self):
        r = {
            "EUR": Decimal("0.85"),
            "GBP": Decimal("0.77"),
            "JPY": Decimal("150"),
            "CHF": Decimal("0.88"),
            "AUD": Decimal("1.50"),
            "CAD": Decimal("1.35"),
            "NZD": Decimal("1.65"),
        }
        self.assertEqual(_mid_from_usd_crosses("EURUSD", r), Decimal("1") / Decimal("0.85"))
        self.assertEqual(_mid_from_usd_crosses("USDJPY", r), Decimal("150"))
        self.assertEqual(_mid_from_usd_crosses("EURGBP", r), Decimal("0.77") / Decimal("0.85"))


class ForexFetchTests(SimpleTestCase):
    @patch("home.alpaca_forex_client.fetch_frankfurter_forex_quotes")
    @patch("home.alpaca_forex_client.load_alpaca_credentials")
    def test_fetch_uses_frankfurter_when_alpaca_has_no_credentials(
        self, mock_load, mock_ff
    ):
        mock_load.return_value = ("", "")
        mock_ff.return_value = [
            ForexQuote(
                "EURUSD",
                pair_label("EURUSD"),
                Decimal("1.10"),
                None,
                None,
                "2026-01-01",
                Decimal("0.05"),
            ),
            ForexQuote(
                "USDJPY",
                pair_label("USDJPY"),
                Decimal("150"),
                None,
                None,
                "2026-01-01",
                None,
            ),
        ]
        rows = [quote_row_dict(q) for q in fetch_forex_quotes(["EURUSD", "USDJPY"])]
        mock_ff.assert_called_once()
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["symbol"], "EURUSD")
        self.assertEqual(rows[0]["mid_display"], "1.100")
        self.assertEqual(rows[1]["mid_display"], "150.000")

    @patch("home.alpaca_forex_client.load_alpaca_credentials")
    @patch("home.alpaca_forex_client.requests.Session")
    def test_fetch_parses_rates_blob(self, mock_session_cls, mock_load):
        mock_load.return_value = ("kid", "sec")
        sess = MagicMock()
        mock_session_cls.return_value = sess
        sess.get.return_value.raise_for_status = MagicMock()
        sess.get.return_value.json.return_value = {
            "rates": {
                "EURUSD": [
                    {"bp": "1.08", "mp": "1.080", "ap": "1.081", "t": "2024-01-01T12:00:00Z"},
                    {"bp": "1.08", "mp": "1.081", "ap": "1.082", "t": "2024-01-01T12:01:00Z"},
                ]
            },
            "next_page_token": None,
        }
        quotes = fetch_forex_quotes(["EURUSD"])
        self.assertEqual(len(quotes), 1)
        self.assertEqual(quotes[0].mid, Decimal("1.081"))
        self.assertIsNotNone(quotes[0].pct_change)
        row = quote_row_dict(quotes[0])
        self.assertEqual(row["mid_display"], "1.081")
        self.assertEqual(row["pct_class"], "is-up")
        self.assertIn("%", row["pct_formatted"])
