"""Tests for Alpaca news → Wagtail ingestion helpers and command."""

from __future__ import annotations

from unittest.mock import patch

from django.core.management import call_command
from wagtail.images.tests.utils import get_test_image_file
from wagtail.models import Page, Site
from wagtail.test.utils import WagtailPageTestCase

from home.alpaca_news_client import AlpacaNewsArticle, best_image_url
from home.alpaca_to_streamfield import (
    build_tile_preview,
    content_tags_for_article,
    streamfield_body_for_article,
)
from home.models import HomePage, MarketTickerRow, TaggedContentPage, TaxonomyTerm


class AlpacaBestImageUrlTests(WagtailPageTestCase):
    def test_prefers_large_over_small_and_thumb(self):
        art = AlpacaNewsArticle(
            id=1,
            headline="h",
            summary="s",
            content="",
            url=None,
            source="x",
            symbols=[],
            created_at="",
            updated_at="",
            image_entries=(
                ("thumb", "https://example.com/t.jpg"),
                ("small", "https://example.com/s.jpg"),
                ("large", "https://example.com/l.jpg"),
            ),
        )
        self.assertEqual(best_image_url(art), "https://example.com/l.jpg")

    def test_small_over_thumb_when_no_large(self):
        art = AlpacaNewsArticle(
            id=2,
            headline="h",
            summary="s",
            content="",
            url=None,
            source="x",
            symbols=[],
            created_at="",
            updated_at="",
            image_entries=(
                ("thumb", "https://example.com/t.jpg"),
                ("small", "https://example.com/s.jpg"),
            ),
        )
        self.assertEqual(best_image_url(art), "https://example.com/s.jpg")

    def test_empty_returns_none(self):
        art = AlpacaNewsArticle(
            id=3,
            headline="h",
            summary="s",
            content="",
            url=None,
            source="x",
            symbols=[],
            created_at="",
            updated_at="",
        )
        self.assertIsNone(best_image_url(art))


class AlpacaStreamfieldTests(WagtailPageTestCase):
    def test_streamfield_has_heading_paragraphs_attribution(self):
        art = AlpacaNewsArticle(
            id=999001,
            headline="Test headline",
            summary="Short summary.",
            content="<p>First para.</p><p>Second <strong>bold</strong>.</p>",
            url="https://example.com/a",
            source="benzinga",
            symbols=["NVDA", "TSM"],
            created_at="2026-01-01T00:00:00Z",
            updated_at="2026-01-01T00:00:00Z",
        )
        body = streamfield_body_for_article(art)
        self.assertGreaterEqual(len(body), 3)
        self.assertEqual(body[0][0], "heading")
        kinds = [b[0] for b in body]
        self.assertIn("paragraph", kinds)
        prev = build_tile_preview(art)
        self.assertIn("Short summary", prev)

    def test_streamfield_includes_ticker_link_when_carousel_row_exists(self):
        root = Page.get_first_root_node()
        home = HomePage(title="Home")
        root.add_child(instance=home)
        home.save_revision().publish()
        Site.objects.update_or_create(
            hostname="testsite",
            defaults={
                "port": 80,
                "root_page": home,
                "is_default_site": True,
            },
        )
        MarketTickerRow.objects.create(symbol="NVDA", enabled=True, sort_order=0)
        art = AlpacaNewsArticle(
            id=999002,
            headline="Tickers in body",
            summary="S",
            content="<p>Hello.</p>",
            url=None,
            source="x",
            symbols=["NVDA", "ZZZZ"],
            created_at="2026-01-01T00:00:00Z",
            updated_at="2026-01-01T00:00:00Z",
        )
        body = streamfield_body_for_article(art, home_page=home)
        sym_para = next(
            (
                b[1]
                for b in body
                if b[0] == "paragraph" and "Symbols:" in b[1].source
            ),
            None,
        )
        self.assertIsNotNone(sym_para)
        self.assertIn("/ticker/nvda/", sym_para.source)
        self.assertNotIn("ZZZZ", sym_para.source)

    def test_content_tags_pairs(self):
        art = AlpacaNewsArticle(
            id=1,
            headline="h",
            summary="s",
            content="",
            url=None,
            source="Benzinga Pro",
            symbols=["NVDA"],
            created_at="",
            updated_at="",
        )
        pairs = content_tags_for_article(art)
        slugs = {p[1] for p in pairs}
        self.assertIn("nvda", slugs)
        self.assertIn("benzinga-pro", slugs)


class AlpacaIngestCommandTests(WagtailPageTestCase):
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
        self.it_term = TaxonomyTerm.objects.get(slug="information-technology")

    def test_ingest_creates_tagged_page(self):
        art = AlpacaNewsArticle(
            id=424242,
            headline="Ingest test story",
            summary="Summary line.",
            content="<p>Body here.</p>",
            url="https://example.com/news/1",
            source="benzinga",
            symbols=["NVDA"],
            created_at="2026-01-01T00:00:00Z",
            updated_at="2026-01-01T00:00:00Z",
        )
        with patch("home.management.commands.ingest_alpaca_news.fetch_news", return_value=[art]):
            call_command("ingest_alpaca_news", "NVDA", "--no-sync-tickers", limit=5)
        page = TaggedContentPage.objects.get(slug="alpaca-424242")
        self.assertEqual(page.title, "Ingest test story")
        self.assertEqual(page.section_term_id, self.it_term.id)
        self.assertTrue(page.live)
        tags = list(page.tags.values_list("slug", flat=True))
        self.assertIn("nvda", tags)
        self.assertIn("benzinga", tags)

    def test_ingest_body_links_carousel_ticker(self):
        MarketTickerRow.objects.create(symbol="ABC", enabled=True, sort_order=0)
        art = AlpacaNewsArticle(
            id=424243,
            headline="Link body test",
            summary="Summary line.",
            content="<p>Body here.</p>",
            url="https://example.com/news/2",
            source="benzinga",
            symbols=["ABC"],
            created_at="2026-01-01T00:00:00Z",
            updated_at="2026-01-01T00:00:00Z",
        )
        with patch("home.management.commands.ingest_alpaca_news.fetch_news", return_value=[art]):
            call_command("ingest_alpaca_news", "ABC", "--no-sync-tickers", limit=5)
        page = TaggedContentPage.objects.get(slug="alpaca-424243")
        sources = [block.value.source for block in page.body if block.block_type == "paragraph"]
        self.assertTrue(any("/ticker/abc/" in s for s in sources))

    def test_ingest_skips_duplicate_without_refresh(self):
        art = AlpacaNewsArticle(
            id=777001,
            headline="Dup test",
            summary="S",
            content="<p>X</p>",
            url="https://example.com/x",
            source="src",
            symbols=["XOM"],
            created_at="2026-01-01T00:00:00Z",
            updated_at="2026-01-01T00:00:00Z",
        )
        with patch("home.management.commands.ingest_alpaca_news.fetch_news", return_value=[art]):
            call_command("ingest_alpaca_news", "XOM", "--no-sync-tickers", limit=5)
        first_title = TaggedContentPage.objects.get(slug="alpaca-777001").title
        art2 = AlpacaNewsArticle(
            id=777001,
            headline="Changed title",
            summary="S",
            content="<p>X</p>",
            url="https://example.com/x",
            source="src",
            symbols=["XOM"],
            created_at="2026-01-01T00:00:00Z",
            updated_at="2026-01-01T00:00:00Z",
        )
        with patch("home.management.commands.ingest_alpaca_news.fetch_news", return_value=[art2]):
            call_command("ingest_alpaca_news", "XOM", "--no-sync-tickers", limit=5)
        second_title = TaggedContentPage.objects.get(slug="alpaca-777001").title
        self.assertEqual(first_title, second_title)
        self.assertEqual(second_title, "Dup test")

    def test_ingest_refresh_updates_title(self):
        art = AlpacaNewsArticle(
            id=888002,
            headline="Original",
            summary="S",
            content="<p>Z</p>",
            url=None,
            source="s",
            symbols=["CNC"],
            created_at="2026-01-01T00:00:00Z",
            updated_at="2026-01-01T00:00:00Z",
        )
        with patch("home.management.commands.ingest_alpaca_news.fetch_news", return_value=[art]):
            call_command("ingest_alpaca_news", "CNC", "--no-sync-tickers", limit=5)
        art2 = AlpacaNewsArticle(
            id=888002,
            headline="Updated headline",
            summary="S2",
            content="<p>New body.</p>",
            url=None,
            source="s",
            symbols=["CNC"],
            created_at="2026-01-01T00:00:00Z",
            updated_at="2026-01-01T00:00:00Z",
        )
        with patch("home.management.commands.ingest_alpaca_news.fetch_news", return_value=[art2]):
            call_command("ingest_alpaca_news", "CNC", "--refresh", "--no-sync-tickers", limit=5)
        page = TaggedContentPage.objects.get(slug="alpaca-888002")
        self.assertEqual(page.title, "Updated headline")

    def test_ingest_sets_hero_when_image_url(self):
        from wagtail.images import get_image_model

        Image = get_image_model()
        hero = Image.objects.create(title="Mock hero", file=get_test_image_file())
        art = AlpacaNewsArticle(
            id=900001,
            headline="With hero",
            summary="S",
            content="<p>B</p>",
            url=None,
            source="src",
            symbols=["JPM"],
            created_at="2026-01-01T00:00:00Z",
            updated_at="2026-01-01T00:00:00Z",
            image_entries=(("large", "https://cdn.example.com/a.jpg"),),
        )
        with (
            patch("home.management.commands.ingest_alpaca_news.fetch_news", return_value=[art]),
            patch(
                "home.management.commands.ingest_alpaca_news.import_hero_image",
                return_value=hero,
            ),
        ):
            call_command("ingest_alpaca_news", "JPM", "--no-sync-tickers", limit=5)
        page = TaggedContentPage.objects.get(slug="alpaca-900001")
        self.assertEqual(page.hero_image_id, hero.id)

    def test_ingest_no_image_entries_leaves_hero_none(self):
        with patch("home.management.commands.ingest_alpaca_news.import_hero_image") as imp:
            art = AlpacaNewsArticle(
                id=900002,
                headline="No hero",
                summary="S",
                content="<p>B</p>",
                url=None,
                source="src",
                symbols=["BAC"],
                created_at="2026-01-01T00:00:00Z",
                updated_at="2026-01-01T00:00:00Z",
            )
            with patch(
                "home.management.commands.ingest_alpaca_news.fetch_news",
                return_value=[art],
            ):
                call_command("ingest_alpaca_news", "BAC", "--no-sync-tickers", limit=5)
            imp.assert_not_called()
        page = TaggedContentPage.objects.get(slug="alpaca-900002")
        self.assertIsNone(page.hero_image_id)

    def test_ingest_creates_market_ticker_row_and_refreshes_snapshots(self):
        art = AlpacaNewsArticle(
            id=910001,
            headline="Ticker sync story",
            summary="S",
            content="<p>X</p>",
            url=None,
            source="src",
            symbols=["ZZZT"],
            created_at="2026-01-01T00:00:00Z",
            updated_at="2026-01-01T00:00:00Z",
        )
        with (
            patch(
                "home.management.commands.ingest_alpaca_news.fetch_news",
                return_value=[art],
            ),
            patch(
                "home.management.commands.ingest_alpaca_news.refresh_market_ticker_rows",
            ) as mock_refresh,
        ):
            call_command("ingest_alpaca_news", "ZZZT", limit=5)
        self.assertTrue(MarketTickerRow.objects.filter(symbol="ZZZT").exists())
        mock_refresh.assert_called_once()
        args, kwargs = mock_refresh.call_args
        self.assertGreater(len(args[0]), 0)

    def test_ingest_no_sync_tickers_skips_row_creation_and_refresh(self):
        art = AlpacaNewsArticle(
            id=910002,
            headline="No ticker sync",
            summary="S",
            content="<p>X</p>",
            url=None,
            source="src",
            symbols=["ZZZN"],
            created_at="2026-01-01T00:00:00Z",
            updated_at="2026-01-01T00:00:00Z",
        )
        with (
            patch(
                "home.management.commands.ingest_alpaca_news.fetch_news",
                return_value=[art],
            ),
            patch(
                "home.management.commands.ingest_alpaca_news.refresh_market_ticker_rows",
            ) as mock_refresh,
        ):
            call_command("ingest_alpaca_news", "ZZZN", "--no-sync-tickers", limit=5)
        self.assertFalse(MarketTickerRow.objects.filter(symbol="ZZZN").exists())
        mock_refresh.assert_not_called()

    def test_ingest_dry_run_does_not_create_ticker_or_refresh(self):
        art = AlpacaNewsArticle(
            id=910003,
            headline="Dry",
            summary="S",
            content="<p>X</p>",
            url=None,
            source="src",
            symbols=["ZZZD"],
            created_at="2026-01-01T00:00:00Z",
            updated_at="2026-01-01T00:00:00Z",
        )
        with (
            patch(
                "home.management.commands.ingest_alpaca_news.fetch_news",
                return_value=[art],
            ),
            patch(
                "home.management.commands.ingest_alpaca_news.refresh_market_ticker_rows",
            ) as mock_refresh,
        ):
            call_command(
                "ingest_alpaca_news",
                "ZZZD",
                "--dry-run",
                limit=5,
            )
        self.assertFalse(MarketTickerRow.objects.filter(symbol="ZZZD").exists())
        mock_refresh.assert_not_called()
