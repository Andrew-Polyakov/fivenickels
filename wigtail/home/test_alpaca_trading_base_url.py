"""Trading API base URL resolution (paper vs live)."""

from __future__ import annotations

import os
from unittest.mock import patch

from django.test import SimpleTestCase

from home.alpaca_news_client import (
    DEFAULT_TRADING_BASE_LIVE,
    DEFAULT_TRADING_BASE_PAPER,
    get_alpaca_trading_base_url,
)


class AlpacaTradingBaseUrlTests(SimpleTestCase):
    def test_paper_env_uses_paper_api(self):
        with patch.dict(
            os.environ,
            {"ALPACA_ENV": "paper", "ALPACA_TRADING_BASE_URL": ""},
            clear=False,
        ):
            self.assertEqual(get_alpaca_trading_base_url(), DEFAULT_TRADING_BASE_PAPER)

    def test_live_env_uses_live_api(self):
        with patch.dict(
            os.environ,
            {"ALPACA_ENV": "live", "ALPACA_TRADING_BASE_URL": ""},
            clear=False,
        ):
            self.assertEqual(get_alpaca_trading_base_url(), DEFAULT_TRADING_BASE_LIVE)

    def test_unset_env_defaults_to_paper(self):
        with patch.dict(
            os.environ,
            {"ALPACA_ENV": "", "ALPACA_TRADING_BASE_URL": ""},
            clear=False,
        ):
            for key in ("ALPACA_ENV", "APCA_ALPACA_ENV", "ALPACA_LIVE", "APCA_TRADING_LIVE"):
                os.environ.pop(key, None)
            self.assertEqual(get_alpaca_trading_base_url(), DEFAULT_TRADING_BASE_PAPER)

    def test_override_wins(self):
        with patch.dict(
            os.environ,
            {
                "ALPACA_ENV": "paper",
                "ALPACA_TRADING_BASE_URL": "https://custom.example",
            },
            clear=False,
        ):
            self.assertEqual(get_alpaca_trading_base_url(), "https://custom.example")
