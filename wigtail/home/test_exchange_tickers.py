"""Tests for EXCHANGE:SYM chips in streamfield and TradingView symbol resolution."""

from __future__ import annotations

from decimal import Decimal
from unittest.mock import patch

from django.core.cache import cache
from django.test import TestCase
from wagtail.models import Page, Site
from wagtail.test.utils import WagtailPageTestCase

from home.alpaca_news_client import AlpacaNewsArticle
from home.alpaca_to_streamfield import streamfield_body_for_article
from home.models import HomePage, MarketTickerRow
from home.ticker_utils import (
    default_tradingview_symbol_for_row,
    replace_exchange_ticker_tokens,
)


class ReplaceExchangeTickerTokensTests(WagtailPageTestCase):
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

    def test_chip_when_enabled_row_exists(self):
        MarketTickerRow.objects.create(symbol="DELL", enabled=True, sort_order=0)
        out = replace_exchange_ticker_tokens("Coverage of NYSE: DELL earnings.")
        self.assertIn('href="/ticker/dell/"', out)
        self.assertIn("ticker-chip--inline", out)
        self.assertIn("ticker-chip__box", out)

    def test_no_chip_when_row_missing(self):
        out = replace_exchange_ticker_tokens("Mention NYSE: ZZZX unknown.")
        self.assertNotIn("<a ", out)
        self.assertIn("NYSE: ZZZX", out)

    def test_whitespace_after_colon(self):
        MarketTickerRow.objects.create(symbol="MU", enabled=True, sort_order=0)
        out = replace_exchange_ticker_tokens("NASDAQ:  MU up.")
        self.assertIn("/ticker/mu/", out)


class DefaultTradingViewSymbolTests(TestCase):
    def tearDown(self):
        cache.clear()

    def test_custom_override_wins(self):
        row = MarketTickerRow.objects.create(
            symbol="FOO",
            tradingview_symbol="NYSE:FOO",
            enabled=True,
            sort_order=0,
        )
        self.assertEqual(default_tradingview_symbol_for_row(row), "NYSE:FOO")

    @patch("home.ticker_utils.fetch_asset_meta")
    def test_alpaca_nyse_exchange(self, mock_meta):
        mock_meta.return_value = {"exchange": "NYSE"}
        cache.delete("ticker:tv_symbol:v2:DELL")
        row = MarketTickerRow.objects.create(
            symbol="DELL", enabled=True, sort_order=0
        )
        sym = default_tradingview_symbol_for_row(row)
        self.assertEqual(sym, "NYSE:DELL")


class StreamfieldExchangeChipTests(WagtailPageTestCase):
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
        MarketTickerRow.objects.create(
            symbol="COST",
            enabled=True,
            sort_order=0,
            percent_change=Decimal("1.25"),
        )

    def test_paragraph_contains_inline_chip_markup(self):
        art = AlpacaNewsArticle(
            id=555001,
            headline="h",
            summary="",
            content="<p>Retail note nasdaq: COST here.</p>",
            url=None,
            source="x",
            symbols=["COST"],
            created_at="2026-01-01T00:00:00Z",
            updated_at="2026-01-01T00:00:00Z",
        )
        body = streamfield_body_for_article(art, home_page=self.homepage)
        para_sources = [b[1].source for b in body if b[0] == "paragraph"]
        joined = "\n".join(para_sources)
        self.assertIn("ticker-chip--inline", joined)
        self.assertIn("/ticker/cost/", joined)
