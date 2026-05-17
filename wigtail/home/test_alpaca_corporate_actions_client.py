"""Unit tests for Alpaca corporate actions client (no live API)."""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from home.alpaca_corporate_actions_client import fetch_corporate_actions


class AlpacaCorporateActionsClientTests(SimpleTestCase):
    def test_fetch_normalizes_cash_and_stock_dividends_with_pagination(self):
        page1 = {
            "corporate_actions": {
                "cash_dividends": [
                    {
                        "id": str(uuid.uuid4()),
                        "symbol": "aapl",
                        "rate": 0.25,
                        "ex_date": "2026-06-01",
                        "record_date": "2026-06-02",
                        "payable_date": "2026-06-15",
                        "special": False,
                        "foreign": False,
                    }
                ],
                "stock_dividends": [],
            },
            "next_page_token": "tok2",
        }
        page2 = {
            "corporate_actions": {
                "cash_dividends": [],
                "stock_dividends": [
                    {
                        "id": str(uuid.uuid4()),
                        "symbol": "MSFT",
                        "rate": 0.05,
                        "ex_date": "2026-07-01",
                        "process_date": "2026-07-01",
                    }
                ],
            },
            "next_page_token": None,
        }

        mock_resp1 = MagicMock()
        mock_resp1.raise_for_status = MagicMock()
        mock_resp1.json.return_value = page1
        mock_resp2 = MagicMock()
        mock_resp2.raise_for_status = MagicMock()
        mock_resp2.json.return_value = page2

        mock_sess = MagicMock()
        mock_sess.get.side_effect = [mock_resp1, mock_resp2]

        with patch(
            "home.alpaca_corporate_actions_client.load_alpaca_credentials",
            return_value=("kid", "sec"),
        ):
            rows = fetch_corporate_actions(
                ["AAPL", "MSFT"],
                date(2026, 6, 1),
                date(2026, 12, 31),
                session=mock_sess,
                base_url="https://data.example",
            )

        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["symbol"], "AAPL")
        self.assertEqual(rows[0]["action_type"], "cash_dividend")
        self.assertEqual(rows[0]["rate"], Decimal("0.25"))
        self.assertEqual(rows[1]["symbol"], "MSFT")
        self.assertEqual(rows[1]["action_type"], "stock_dividend")
        self.assertEqual(mock_sess.get.call_count, 2)


class MarketEventsHelperTests(SimpleTestCase):
    def test_dividends_payload_shape(self):
        from datetime import date
        from unittest.mock import Mock, patch

        ev = Mock()
        ev.symbol = "ZZZ"
        ev.action_type = "cash_dividend"
        ev.ex_date = date(2026, 6, 1)
        ev.record_date = date(2026, 6, 2)
        ev.payable_date = date(2026, 6, 15)
        ev.rate = Decimal("1.5")

        with patch("django.urls.reverse", return_value="/ticker/zzz/"):
            from home.market_events import dividends_payload_for_bento

            payload = dividends_payload_for_bento([ev])[0]
        self.assertEqual(payload["symbol"], "ZZZ")
        self.assertEqual(payload["href"], "/ticker/zzz/")
        self.assertIn("$", payload["rate_display"])

    def test_calendar_payload_marks_closed(self):
        from datetime import date
        from unittest.mock import Mock

        from home.market_events import calendar_payload_for_bento

        day = Mock()
        day.session_date = date(2026, 6, 1)
        day.pre_start = None
        day.pre_end = None
        day.core_start = None
        day.core_end = None
        day.post_start = None
        day.post_end = None

        payload = calendar_payload_for_bento([day])[0]
        self.assertEqual(payload["core_display"], "Closed")
        self.assertTrue(payload["is_closed"])

