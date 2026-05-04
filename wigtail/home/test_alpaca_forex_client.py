"""Unit tests for Alpaca forex helper (labels + parsing)."""

from __future__ import annotations

from decimal import Decimal
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from home.alpaca_forex_client import (
    fetch_forex_quotes,
    pair_label,
    quote_row_dict,
)


class ForexLabelTests(SimpleTestCase):
    def test_pair_label_splits_six_letter_pair(self):
        self.assertEqual(pair_label("EURUSD"), "EUR/USD")
        self.assertEqual(pair_label("usdJPY"), "USD/JPY")


class ForexFetchTests(SimpleTestCase):
    @patch("home.alpaca_forex_client.load_alpaca_credentials")
    def test_fetch_returns_placeholders_without_credentials(self, mock_load):
        mock_load.return_value = ("", "")
        rows = [quote_row_dict(q) for q in fetch_forex_quotes(["EURUSD", "USDJPY"])]
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["symbol"], "EURUSD")
        self.assertEqual(rows[0]["mid_display"], "—")

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
        self.assertEqual(row["mid_display"], "1.08100")
        self.assertEqual(row["pct_class"], "is-up")
        self.assertIn("%", row["pct_formatted"])
