"""Tests for article markdown ticker enrichment (Symbols row, Benzinga, exchange tokens)."""

from __future__ import annotations

from django.test import TestCase
from wagtail.models import Page, Site
from wagtail.test.utils import WagtailPageTestCase

from home.article_ticker_markup import (
    _strip_duplicate_ticker_spans,
    parse_symbols_from_leading_line,
    render_article_markdown_block_html,
    render_article_markdown_body_html,
    split_leading_symbols_line,
)
from home.alpaca_to_streamfield import markdown_stream_for_article
from home.alpaca_news_client import AlpacaNewsArticle
from home.models import HomePage, MarketTickerRow


class StripDuplicateTickerSpansTests(TestCase):
    def test_removes_repeated_identical_benzinga_url(self):
        u = "https://www.benzinga.com/quote/NVDA"
        md = f"First {u} mid {u} end {u}."
        out = _strip_duplicate_ticker_spans(md)
        self.assertEqual(out.count("benzinga.com/quote/NVDA"), 1)
        self.assertIn("First ", out)
        self.assertIn("end .", out)

    def test_keeps_different_urls_same_symbol_different_text(self):
        a = "https://www.benzinga.com/quote/NVDA?x=1"
        b = "https://www.benzinga.com/quote/NVDA?x=2"
        md = f"{a} then {b}"
        out = _strip_duplicate_ticker_spans(md)
        self.assertEqual(out.count("benzinga.com/quote/NVDA"), 2)


class SplitSymbolsLineTests(TestCase):
    def test_no_symbols_prefix(self):
        self.assertEqual(split_leading_symbols_line("Hello\n\nMore"), (None, "Hello\n\nMore"))

    def test_symbols_first_line(self):
        sym, rest = split_leading_symbols_line(
            "Symbols: [NVDA](/ticker/nvda/)\n\nBody here."
        )
        self.assertEqual(sym, "[NVDA](/ticker/nvda/)")
        self.assertEqual(rest, "\n\nBody here.")


class ParseSymbolsFromLineTests(TestCase):
    def test_middle_dot_separated_links(self):
        line = "[NVDA](/ticker/nvda/) \u00b7 [MU](/ticker/mu/)"
        self.assertEqual(parse_symbols_from_leading_line(line), ["NVDA", "MU"])


class MarkdownStreamDedupeParagraphTests(WagtailPageTestCase):
    def test_consecutive_duplicate_paragraphs_collapsed_before_markdown(self):
        root = Page.get_first_root_node()
        home = HomePage(title="Home")
        root.add_child(instance=home)
        home.save_revision().publish()
        dup = "<p>Same line twice.</p><p>Same line twice.</p><p>Third different.</p>"
        art = AlpacaNewsArticle(
            id=999021,
            headline="Dedupe",
            summary="",
            content=dup,
            url=None,
            source="s",
            symbols=[],
            created_at="2026-01-01T00:00:00Z",
            updated_at="2026-01-01T00:00:00Z",
        )
        body = markdown_stream_for_article(art, home_page=home)
        md = body[0][1]
        self.assertEqual(md.count("Same line twice."), 1)
        self.assertIn("Third different.", md)


class MarkdownStreamRawExchangeTests(WagtailPageTestCase):
    def test_ingest_markdown_keeps_plain_exchange_tokens(self):
        """Exchange tokens are enriched at render time, not replaced with md links at ingest."""
        root = Page.get_first_root_node()
        home = HomePage(title="Home")
        root.add_child(instance=home)
        home.save_revision().publish()
        art = AlpacaNewsArticle(
            id=999020,
            headline="H",
            summary="",
            content="<p>Note NASDAQ: MU in text.</p>",
            url=None,
            source="s",
            symbols=[],
            created_at="2026-01-01T00:00:00Z",
            updated_at="2026-01-01T00:00:00Z",
        )
        body = markdown_stream_for_article(art, home_page=home)
        md = body[0][1]
        self.assertIn("NASDAQ: MU", md)
        self.assertNotIn("[NASDAQ:", md)


class ArticleTickerRenderTests(WagtailPageTestCase):
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

    def test_symbol_row_renders_ticker_chip(self):
        MarketTickerRow.objects.create(symbol="TSLA", enabled=True, sort_order=0)
        md = "Symbols: [TSLA](/ticker/tsla/)\n\nParagraph."
        html = str(render_article_markdown_block_html(md))
        self.assertIn("tagged-content__symbol-row", html)
        self.assertIn("ticker-chip", html)
        self.assertIn("/ticker/tsla/", html)
        self.assertIn("<p>Paragraph.</p>", html)

    def test_benzinga_url_becomes_chip_when_row_exists(self):
        MarketTickerRow.objects.create(symbol="TSLA", enabled=True, sort_order=0)
        md = "See https://www.benzinga.com/quote/TSLA for more."
        html = str(render_article_markdown_body_html(md))
        self.assertIn("ticker-chip", html)
        self.assertIn("/ticker/tsla/", html)
        self.assertNotIn("benzinga.com", html.lower())

    def test_parenthesized_exchange_chip(self):
        MarketTickerRow.objects.create(symbol="AAPL", enabled=True, sort_order=0)
        md = "Coverage (NASDAQ: AAPL ) continues."
        html = str(render_article_markdown_body_html(md))
        self.assertIn("ticker-chip", html)
        self.assertIn("/ticker/aapl/", html)

    def test_link_only_when_no_row(self):
        md = "Visit https://www.benzinga.com/quote/ZZZX unknown."
        html = str(render_article_markdown_body_html(md))
        self.assertIn("/ticker/zzzx/", html)
        self.assertIn("ticker-chip--linkonly", html)
