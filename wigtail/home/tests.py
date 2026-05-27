import json

from home.models import (
    BrokerRating,
    CareersPage,
    ContentTag,
    CookiesPolicyPage,
    Country,
    HomePage,
    MarketTickerRow,
    SubsectionIndexPage,
    TaggedContentPage,
    TaxonomyTerm,
)
from decimal import Decimal
import os
from unittest.mock import Mock, patch

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from django.utils.crypto import get_random_string

from home.alpaca_bars_client import fetch_recent_stock_bars
from home.blocks import _resolve_section_term, _resolve_universal_tile_state
from home.card_layout import (
    BENTO_LAYOUT_VERSION,
    _resolve_carousel_frames,
    _serialize_bentogrid01,
    build_layout_payload,
    serialize_article_card_for_related,
)
from home.context_processors import market_header
from home.navigation import normalize_sector_query_param
from home.query import (
    _section_term_ids_for_taxonomy_scope,
    build_home_page_display_items,
    featured_quad_pages_for_sector,
    get_pages_for_taxonomy_term,
    get_random_pages_for_section,
    get_random_pages_for_section_prioritized,
    get_priority_pages_for_section,
    get_recent_pages_for_section,
    get_related_pages_for_ticker,
    get_similar_pages,
    pick_four_pages_prioritized_with_fallback,
)
from wagtail.models import Page, Site
from wagtail.test.utils import WagtailPageTestCase


class HomeSetUpTests(WagtailPageTestCase):
    """
    Tests for basic page structure setup and HomePage creation.
    """

    def test_root_create(self):
        root_page = Page.objects.get(pk=1)
        self.assertIsNotNone(root_page)

    def test_homepage_create(self):
        root_page = Page.objects.get(pk=1)
        homepage = HomePage(title="Home")
        root_page.add_child(instance=homepage)
        self.assertTrue(HomePage.objects.filter(title="Home").exists())


class HomeTests(WagtailPageTestCase):
    """
    Tests for homepage functionality and rendering.
    """

    def setUp(self):
        """
        Create a homepage instance for testing.
        """
        root_page = Page.get_first_root_node()
        Site.objects.create(hostname="testsite", root_page=root_page, is_default_site=True)
        self.homepage = HomePage(title="Home")
        root_page.add_child(instance=self.homepage)
        self.homepage.save_revision().publish()

    def test_homepage_is_renderable(self):
        self.assertPageIsRenderable(self.homepage)

    def test_homepage_template_used(self):
        response = self.client.get(self.homepage.url)
        self.assertTemplateUsed(response, "home/home_page.html")


class FooterCareersCookiesTests(WagtailPageTestCase):
    def setUp(self):
        self.homepage = HomePage.objects.filter(slug="home").first()
        self.assertIsNotNone(self.homepage)

        self.careers = CareersPage.objects.child_of(self.homepage).filter(
            slug="careers"
        ).first()
        if self.careers is None:
            c = CareersPage(title="Careers", slug="careers")
            self.homepage.add_child(instance=c)
            c.save_revision().publish()
            self.careers = c

        self.cookies = CookiesPolicyPage.objects.child_of(self.homepage).filter(
            slug="cookies-policy"
        ).first()
        if self.cookies is None:
            p = CookiesPolicyPage(title="Cookies policy", slug="cookies-policy")
            self.homepage.add_child(instance=p)
            p.save_revision().publish()
            self.cookies = p

    def test_careers_page_renders_message(self):
        r = self.client.get(self.careers.url)
        self.assertEqual(r.status_code, 200)
        self.assertTemplateUsed(r, "home/careers_page.html")
        self.assertContains(r, "no open positions")

    def test_cookies_policy_page_renders(self):
        r = self.client.get(self.cookies.url)
        self.assertEqual(r.status_code, 200)
        self.assertTemplateUsed(r, "home/cookies_policy_page.html")
        self.assertContains(r, "What is a cookie?")

    def test_home_includes_footer_legal_links(self):
        r = self.client.get(self.homepage.url)
        self.assertEqual(r.status_code, 200)
        self.assertContains(r, "site-footer")
        self.assertContains(r, "Cookies policy")
        self.assertContains(r, self.careers.url)
        self.assertContains(r, self.cookies.url)


class TaxonomyTagsTests(WagtailPageTestCase):
    def setUp(self):
        root_page = Page.get_first_root_node()
        self.homepage = (
            HomePage.objects.child_of(root_page).filter(slug="home").first()
            or HomePage.objects.filter(slug="home").first()
        )
        if self.homepage is None:
            self.homepage = HomePage(title="Home")
            root_page.add_child(instance=self.homepage)
        self.homepage.save_revision().publish()
        site = Site.objects.filter(is_default_site=True).first()
        if site:
            Site.objects.filter(pk=site.pk).update(
                hostname="testserver",
                port=80,
                root_page_id=self.homepage.pk,
            )
        else:
            Site.objects.create(
                hostname="testserver",
                port=80,
                root_page=self.homepage,
                is_default_site=True,
            )

        self.energy = TaxonomyTerm.objects.get(slug="energy")
        self.materials = TaxonomyTerm.objects.get(slug="materials")
        self.tag_alpha = ContentTag.objects.create(name="Alpha", slug="alpha")
        self.tag_beta = ContentTag.objects.create(name="Beta", slug="beta")
        self.tag_gamma = ContentTag.objects.create(name="Gamma", slug="gamma")

        idx = SubsectionIndexPage(
            title="Energy hub",
            slug="energy-hub",
            section_term=self.energy,
            recent_tile_limit=10,
        )
        self.homepage.add_child(instance=idx)
        idx.save_revision().publish()
        self.energy_index = SubsectionIndexPage.objects.get(slug="energy-hub")
        TaxonomyTerm.objects.filter(pk=self.energy.pk).update(
            link_page_id=self.energy_index.page_ptr_id
        )

        self.page_e1 = TaggedContentPage(
            title="Energy one",
            slug="energy-one",
            section_term=self.energy,
            lede="Preview **one**",
        )
        self.homepage.add_child(instance=self.page_e1)
        self.page_e1.save()
        self.page_e1.tags.add(self.tag_alpha, self.tag_beta)
        self.page_e1.save_revision().publish()

        self.page_e2 = TaggedContentPage(
            title="Energy two",
            slug="energy-two",
            section_term=self.energy,
            lede="Preview two",
        )
        self.homepage.add_child(instance=self.page_e2)
        self.page_e2.save()
        self.page_e2.tags.add(self.tag_alpha, self.tag_beta, self.tag_gamma)
        self.page_e2.save_revision().publish()

        self.page_m1 = TaggedContentPage(
            title="Materials one",
            slug="materials-one",
            section_term=self.materials,
            lede="Mat preview",
        )
        self.homepage.add_child(instance=self.page_m1)
        self.page_m1.save()
        self.page_m1.tags.add(self.tag_alpha)
        self.page_m1.save_revision().publish()

        # Migration 0011 hides empty GICS roots; this fixture has sector content — show nav again.
        TaxonomyTerm.objects.filter(slug__in=("energy", "materials")).update(
            is_visible=True
        )

        self.energy_index.intro = [
            (
                "card",
                {
                    "article": {
                        "importance": 10,
                        "section_term": self.energy,
                        "mode": "specific_article",
                        "specific_page": self.page_e1,
                    }
                },
            ),
            (
                "card",
                {
                    "article": {
                        "importance": 10,
                        "section_term": self.energy,
                        "mode": "specific_article",
                        "specific_page": self.page_e2,
                    }
                },
            ),
        ]
        self.energy_index.save_revision().publish()

    def test_recent_pages_for_section_filters_taxonomy(self):
        recent = get_recent_pages_for_section(self.energy, limit=20)
        slugs = {p.slug for p in recent}
        self.assertIn("energy-one", slugs)
        self.assertIn("energy-two", slugs)
        self.assertNotIn("materials-one", slugs)

    def test_similar_pages_prefers_more_shared_tags(self):
        sim = get_similar_pages(self.page_e1, limit=10)
        self.assertTrue(sim)
        self.assertNotIn(self.page_e1, sim)
        first = sim[0]
        self.assertEqual(first.slug, "energy-two")

    def test_get_related_pages_for_ticker_matches_tag_slug(self):
        tag_nvda = ContentTag.objects.create(name="NVDA", slug="nvda")
        page_nv = TaggedContentPage(
            title="NVDA headline story",
            slug="nvda-headline",
            section_term=self.energy,
            lede="p",
        )
        self.homepage.add_child(instance=page_nv)
        page_nv.tags.add(tag_nvda)
        page_nv.save_revision().publish()
        rel = get_related_pages_for_ticker("nvda", limit=10)
        self.assertEqual(len(rel), 1)
        self.assertEqual(rel[0].slug, "nvda-headline")

    @patch("home.ticker_serve.fetch_snapshots", return_value={})
    @patch("home.ticker_serve.fetch_asset_meta", return_value=None)
    def test_ticker_detail_without_carousel_row_uses_snapshot_fallback(
        self, _mock_asset, _mock_snaps
    ):
        url = reverse("ticker_page", kwargs={"ticker_slug": "xyz"})
        r = self.client.get(url)
        self.assertEqual(r.status_code, 200)
        self.assertContains(r, "XYZ")

    @patch("home.ticker_serve.fetch_latest_setup_for_symbol", return_value=None)
    def test_ticker_detail_renders_related_news(self, _mock_setup):
        MarketTickerRow.objects.create(symbol="NVDA", enabled=True, sort_order=0)
        tag_nvda = ContentTag.objects.create(name="NVDA", slug="nvda")
        page_nv = TaggedContentPage(
            title="Chip sector update",
            slug="chip-sector-update",
            section_term=self.energy,
            lede="prev",
        )
        self.homepage.add_child(instance=page_nv)
        page_nv.tags.add(tag_nvda)
        page_nv.save_revision().publish()
        url = reverse("ticker_page", kwargs={"ticker_slug": "nvda"})
        r = self.client.get(url)
        self.assertEqual(r.status_code, 200)
        self.assertTemplateUsed(r, "home/ticker_page.html")
        self.assertContains(r, "data-shadcn-ticker-tabs")
        self.assertContains(r, "ticker-related-data")
        self.assertContains(r, "ticker-setup-data")
        self.assertContains(r, '"title": "Chip sector update"')
        self.assertContains(r, "NASDAQ:NVDA")

    @patch("home.ticker_serve.fetch_latest_setup_for_symbol")
    def test_ticker_page_includes_swing_setup_json(self, mock_fetch_setup):
        MarketTickerRow.objects.create(symbol="BE", enabled=True, sort_order=0)
        mock_fetch_setup.return_value = {
            "id": 1,
            "run_id": 9,
            "symbol": "BE",
            "setup_type": "continuation",
            "direction": "long",
            "confluence": "M:up W:up D:up",
            "score": "high",
            "trigger_text": "Pullback near EMA20",
            "invalidation": "Below swing low",
            "t1": 305.9,
            "t2": 351.2,
            "rr": 1.3,
            "notes": "Test notes",
            "scan_started_utc": "2026-05-26T08:00:00Z",
            "last_price_formatted": "302.59",
            "percent_change_formatted": "+1.2%",
            "percent_change_class": "is-up",
            "day_volume_formatted": "1.2M",
        }
        url = reverse("ticker_page", kwargs={"ticker_slug": "be"})
        r = self.client.get(url)
        self.assertEqual(r.status_code, 200)
        self.assertContains(r, '"setup_type": "continuation"')
        self.assertContains(r, "trading/setups/?run=9")

    @patch("home.ticker_serve.fetch_latest_setup_for_symbol", return_value=None)
    def test_ticker_page_tabs_without_news_or_setup(self, _mock_setup):
        MarketTickerRow.objects.create(symbol="ZZZ", enabled=True, sort_order=0)
        url = reverse("ticker_page", kwargs={"ticker_slug": "zzz"})
        r = self.client.get(url)
        self.assertEqual(r.status_code, 200)
        self.assertContains(r, "data-shadcn-ticker-tabs")
        self.assertContains(r, "ticker-related-data")

    @patch("home.ticker_serve.fetch_asset_meta", return_value=None)
    def test_ticker_page_shows_summary_metrics(self, _mock_asset):
        MarketTickerRow.objects.create(
            symbol="SUMM",
            label="Summary Test",
            enabled=True,
            sort_order=99,
            last_price=Decimal("123.45"),
            previous_close=Decimal("120.00"),
            percent_change=Decimal("2.88"),
            day_volume=3_500_000,
            fetched_at=timezone.now(),
        )
        url = reverse("ticker_page", kwargs={"ticker_slug": "summ"})
        r = self.client.get(url)
        self.assertEqual(r.status_code, 200)
        self.assertContains(r, "123.45")
        self.assertContains(r, "+2.88%")
        self.assertContains(r, "3.50M")
        self.assertContains(r, "+$3.45")
        self.assertContains(r, "Summary Test")
        self.assertContains(r, "SUMM")

    @patch("home.ticker_serve.fetch_asset_meta", return_value=None)
    def test_ticker_page_shows_upcoming_dividends_section(self, _mock_asset):
        import uuid
        from datetime import timedelta

        from home.market_events import market_today_eastern
        from home.models import CorporateActionEvent

        MarketTickerRow.objects.create(symbol="DIV", enabled=True, sort_order=0)
        today = market_today_eastern()
        CorporateActionEvent.objects.create(
            alpaca_id=uuid.uuid4(),
            symbol="DIV",
            action_type=CorporateActionEvent.ACTION_CASH,
            ex_date=today + timedelta(days=5),
            rate=Decimal("0.42"),
        )
        url = reverse("ticker_page", kwargs={"ticker_slug": "div"})
        r = self.client.get(url)
        self.assertEqual(r.status_code, 200)
        self.assertContains(r, "Upcoming dividends")
        self.assertContains(r, "$0.42")

    @patch("home.ticker_serve.fetch_asset_meta", return_value=None)
    def test_ticker_page_shows_unsynced_notice_without_fetched_at(self, _mock_asset):
        MarketTickerRow.objects.create(
            symbol="NOSYNC",
            enabled=True,
            sort_order=98,
            last_price=None,
            fetched_at=None,
        )
        url = reverse("ticker_page", kwargs={"ticker_slug": "nosync"})
        r = self.client.get(url)
        self.assertEqual(r.status_code, 200)
        self.assertContains(r, "Prices not synced")

    def test_subsection_index_lists_only_same_section(self):
        r = self.client.get(self.energy_index.url)
        self.assertEqual(r.status_code, 200)
        self.assertContains(r, "Energy one")
        self.assertContains(r, "Energy two")
        self.assertNotContains(r, "Materials one")
        self.assertContains(r, "data-shadcn-card-layout")

    def test_pick_four_orders_by_priority_band_desc(self):
        TaggedContentPage.objects.filter(pk=self.page_e2.pk).update(tile_priority=10)
        TaggedContentPage.objects.filter(pk=self.page_e1.pk).update(tile_priority=3)
        qs = TaggedContentPage.objects.live().public().filter(section_term=self.energy)
        picked = pick_four_pages_prioritized_with_fallback(qs)
        self.assertGreaterEqual(len(picked), 2)
        self.assertEqual(picked[0].pk, self.page_e2.pk)
        self.assertEqual(picked[1].pk, self.page_e1.pk)

    def test_featured_quad_filters_by_category_slug(self):
        child = TaxonomyTerm(
            name="Oil Test Cat",
            slug="energy-oil-test-cat",
            is_visible=True,
            sort_order=1,
        )
        self.energy.add_child(instance=child)
        TaxonomyTerm.fix_tree()
        oil = TaxonomyTerm.objects.get(slug="energy-oil-test-cat")
        TaggedContentPage.objects.filter(pk=self.page_e1.pk).update(
            taxonomy_category_id=oil.pk
        )

        pages, selected = featured_quad_pages_for_sector(
            self.energy,
            "energy-oil-test-cat",
            home_page=self.homepage,
        )
        self.assertEqual(selected, "energy-oil-test-cat")
        self.assertEqual(len(pages), 4)
        self.assertEqual(pages[0].pk, self.page_e1.pk)

    def test_get_pages_for_taxonomy_term_matches_section_or_category(self):
        child = TaxonomyTerm(
            name="Oil Carousel Cat",
            slug="energy-oil-carousel-cat",
            is_visible=True,
            sort_order=2,
        )
        self.energy.add_child(instance=child)
        TaxonomyTerm.fix_tree()
        oil = TaxonomyTerm.objects.get(slug="energy-oil-carousel-cat")
        TaggedContentPage.objects.filter(pk=self.page_e1.pk).update(
            taxonomy_category_id=oil.pk
        )
        pages = get_pages_for_taxonomy_term(oil, limit=5)
        self.assertTrue(any(p.pk == self.page_e1.pk for p in pages))

    def test_resolve_carousel_frames_selected_preserves_order(self):
        frames = _resolve_carousel_frames(
            {
                "frame_count": 3,
                "article_source_mode": "selected_articles",
                "selected_articles": [self.page_e2, self.page_e1],
            },
            exclude_ids=[],
        )
        self.assertEqual(len(frames), 2)
        self.assertEqual(frames[0].pk, self.page_e2.pk)
        self.assertEqual(frames[1].pk, self.page_e1.pk)

    def test_taxonomy_category_choices_returns_names(self):
        from django.urls import reverse

        admin = get_user_model().objects.create_superuser(
            "carousel_admin", "carousel@test.com", "pass",
        )
        self.client.force_login(admin)
        url = reverse("taxonomy_category_choices")
        r = self.client.get(url, {"term_id": self.energy.pk})
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertIn("choices", data)
        ids = {c["id"] for c in data["choices"]}
        self.assertIn(self.energy.pk, ids)
        names = {c["name"] for c in data["choices"]}
        self.assertIn(self.energy.name, names)

    def test_serialize_bentogrid01_article_carousel(self):
        payload = _serialize_bentogrid01(
            {
                "badge_text": "News",
                "heading": "Carousel",
                "features": [
                    {
                        "header_type": "article_carousel",
                        "frame_count": 2,
                        "auto_scroll": True,
                        "article_source_mode": "selected_articles",
                        "selected_articles": [self.page_e1, self.page_e2],
                        "title": "",
                        "description": "",
                        "col_span": 2,
                        "row_span": 2,
                    }
                ],
            },
            {"request": None},
        )
        feat = payload["features"][0]
        self.assertEqual(feat["header_type"], "article_carousel")
        self.assertEqual(feat["frame_count"], 2)
        self.assertTrue(feat["auto_scroll"])
        self.assertEqual(len(feat["frames"]), 2)
        self.assertEqual(feat["frames"][0]["kind"], "article")
        self.assertIn("publishedAtIso", feat["frames"][0])
        self.assertIn("sourceLabel", feat["frames"][0])

    def test_featured_quad_pages_for_sector_returns_four_slots(self):
        pages, sel = featured_quad_pages_for_sector(
            self.energy, None, home_page=self.homepage
        )
        self.assertIsNone(sel)
        self.assertEqual(len(pages), 4)

    def test_market_news_root_featured_includes_gics_articles(self):
        """Drilldown at /market-news/ must list articles by sector, not section_term=market-news."""
        from home.taxonomy import MARKET_NEWS_SLUG, taxonomy_prefix_path

        mnews = TaxonomyTerm.objects.get(slug=MARKET_NEWS_SLUG)
        pages, _ = featured_quad_pages_for_sector(
            mnews, None, home_page=self.homepage
        )
        self.assertTrue(
            any(p is not None and p.slug == "energy-one" for p in pages),
        )
        mnews.widgets = [
            (
                "card",
                {
                    "article": {
                        "importance": 10,
                        "section_term": self.energy,
                        "mode": "manual_article",
                        "manual_page": self.page_e1,
                    }
                },
            ),
        ]
        mnews.save()
        url = taxonomy_prefix_path(self.homepage) + "market-news/"
        r = self.client.get(url)
        self.assertEqual(r.status_code, 200)
        self.assertContains(r, "Energy one")
        self.assertContains(r, "data-shadcn-card-layout")

    def test_tag_archive_route(self):
        url = f"{self.homepage.url}tags/alpha/"
        r = self.client.get(url)
        self.assertEqual(r.status_code, 200)
        self.assertTemplateUsed(r, "home/tag_archive.html")
        self.assertContains(r, "Energy one")
        self.assertContains(r, "Materials one")
        self.assertContains(r, "data-shadcn-article-card")

    def test_tag_archive_section_querystring(self):
        url = f"{self.homepage.url}tags/alpha/?section=energy"
        r = self.client.get(url)
        self.assertEqual(r.status_code, 200)
        self.assertContains(r, "Energy one")
        self.assertNotContains(r, "Materials one")

    def test_tagged_article_renders_when_tag_has_empty_slug(self):
        ContentTag.objects.filter(pk=self.tag_beta.pk).update(slug="")
        r = self.client.get(self.page_e1.url)
        self.assertEqual(r.status_code, 200)
        self.assertContains(r, "Beta")
        self.assertContains(r, "scn-badge--tag")
        self.assertContains(r, 'aria-disabled')
        self.assertContains(r, "tags/alpha/")
        self.assertContains(r, '"inactive": true')
        self.assertContains(r, "tagged-content__meta-tag-link")
        self.assertContains(r, "data-shadcn-article-tags")
        self.assertContains(r, "data-shadcn-tag-cloud")
        self.assertContains(r, 'id="tag-cloud-data"')
        self.assertNotContains(r, "tag-cloud__link")

    def test_tagged_article_page_renders_lede_separator_then_body(self):
        r = self.client.get(self.page_e1.url)
        self.assertEqual(r.status_code, 200)
        self.assertContains(r, "tagged-content__intro")
        self.assertContains(r, "tagged-content__lede")
        self.assertContains(r, "tagged-content__lede-sep")
        content = r.content.decode()
        meta_pos = content.find("tagged-content__meta-row")
        header_sep_pos = content.find("tagged-content__header-sep")
        intro_pos = content.find("tagged-content__intro")
        lede_pos = content.find("tagged-content__lede")
        sep_pos = content.find("tagged-content__lede-sep")
        body_pos = content.find("tagged-content__body")
        self.assertLess(meta_pos, header_sep_pos)
        self.assertLess(header_sep_pos, lede_pos)
        self.assertLess(intro_pos, body_pos)
        self.assertLess(lede_pos, sep_pos)
        self.assertLess(sep_pos, body_pos)

    def test_tagged_article_page_section_chip_in_header_rail_with_datelines(self):
        r = self.client.get(self.page_e1.url)
        self.assertEqual(r.status_code, 200)
        self.assertContains(r, "tagged-content__header-grid")
        self.assertContains(r, "tagged-content__header-rail")
        self.assertContains(r, "tagged-content__category-chip")
        self.assertContains(r, "tagged-content__header-lead-sep")
        self.assertNotContains(r, "tagged-content__header-rail-sep")
        self.assertContains(r, "tagged-content__meta-row")
        self.assertContains(r, "tagged-content__meta-start")
        self.assertContains(r, "data-shadcn-article-datelines")
        self.assertContains(r, 'id="article-datelines-data"')
        self.assertContains(r, '"headerLabel"')
        self.assertContains(r, '"published"')
        self.assertContains(r, '"updated"')
        self.assertContains(r, "data-shadcn-article-tags")
        self.assertContains(r, 'id="article-tags-data"')
        self.assertContains(r, '"name": "Alpha"')
        content = r.content.decode()
        title_row_start = content.find("tagged-content__title-row")
        meta_row_start = content.find("tagged-content__meta-row")
        title_chunk = content[title_row_start:meta_row_start]
        self.assertNotIn("markdown-tile__taxonomy", title_chunk)
        self.assertNotIn("tagged-content__category-chip", title_chunk)
        self.assertContains(r, 'href="/energy-hub/"')
        rail_start = content.find("tagged-content__header-rail")
        header_sep_start = content.find("tagged-content__header-sep")
        rail_chunk = content[rail_start:header_sep_start]
        self.assertIn("Energy", rail_chunk)
        self.assertIn("tagged-content__category-chip", rail_chunk)

    def test_site_nav_selects_trail_from_article_section_term(self):
        from django.test import RequestFactory

        from home.taxonomy import (
            get_site_nav_template_context,
            term_is_nav_active,
            trail_slugs_from_section_term,
        )

        rf = RequestFactory()
        request = rf.get(self.page_e1.url)
        ctx = get_site_nav_template_context(request, self.homepage)
        expected_slugs = trail_slugs_from_section_term(self.energy)
        self.assertEqual(ctx["trail_slugs"], expected_slugs)
        self.assertTrue(expected_slugs)
        roots = ctx["nav_rows"][0]["nodes"]
        root_slugs = [t.slug for t in roots]
        active_roots = [
            t.slug
            for t in roots
            if term_is_nav_active(t, ctx["trail_slugs"], self.page_e1)
        ]
        self.assertEqual(len(active_roots), 1)
        from home.gics_sectors import GICS_SECTOR_SLUGS
        from home.taxonomy import MARKET_NEWS_SLUG

        if self.energy.slug in GICS_SECTOR_SLUGS:
            self.assertEqual(active_roots[0], MARKET_NEWS_SLUG)
        elif self.energy.depth == 1:
            self.assertEqual(active_roots[0], "energy")
        else:
            self.assertIn(active_roots[0], expected_slugs)

    def test_tagged_article_page_share_button_uses_stable_permalink(self):
        self.page_e1.canonical_url = "https://fivenickels.com/articles/energy-one/"
        self.page_e1.save_revision().publish()
        r = self.client.get(self.page_e1.url)
        self.assertEqual(r.status_code, 200)
        self.assertContains(r, "data-shadcn-article-share")
        self.assertContains(r, 'id="article-share-data"')
        self.assertContains(r, "https://fivenickels.com/articles/energy-one/")
        self.assertNotContains(r, "data-share-permalink")
        content = r.content.decode()
        title_row_start = content.find("tagged-content__title-row")
        meta_row_start = content.find("tagged-content__meta-row")
        intro_start = content.find("tagged-content__intro")
        self.assertNotIn("tagged-content__share", content[title_row_start:meta_row_start])
        rail_start = content.find("tagged-content__header-rail")
        intro_start = content.find("tagged-content__intro")
        self.assertGreater(rail_start, -1)
        self.assertIn("tagged-content__share", content[rail_start:intro_start])

    def test_home_sector_nav_includes_subsection_url(self):
        from home.taxonomy import taxonomy_prefix_path

        r = self.client.get(self.homepage.url)
        self.assertEqual(r.status_code, 200)
        self.assertContains(r, "Market News")
        self.assertContains(r, "Opinions")
        self.assertContains(r, "Personal Finance")
        prefix = taxonomy_prefix_path(self.homepage)
        self.assertContains(r, prefix + "market-news/")
        r2 = self.client.get(prefix + "market-news/")
        self.assertEqual(r2.status_code, 200)
        self.assertContains(r2, self.energy_index.url)

    def test_home_sector_nav_hides_empty_taxonomy(self):
        """Sectors show under Market News only; empty GICS omitted there."""
        from home.taxonomy import taxonomy_prefix_path

        r = self.client.get(self.homepage.url)
        self.assertEqual(r.status_code, 200)
        self.assertContains(r, "Market News")
        self.assertContains(r, "Opinions")
        self.assertContains(r, "Personal Finance")
        self.assertNotContains(r, "site-nav__row--depth-2")
        prefix = taxonomy_prefix_path(self.homepage)
        r2 = self.client.get(prefix + "market-news/")
        self.assertEqual(r2.status_code, 200)
        self.assertContains(r2, "Energy")
        self.assertContains(r2, "Materials")
        self.assertNotContains(r2, "Utilities")

    def test_taxonomy_nav_level3_row_when_level2_selected(self):
        from home.taxonomy import taxonomy_prefix_path

        child = TaxonomyTerm(
            name="Oil nav child",
            slug="oil-nav-child-test",
            is_visible=True,
            is_nav=True,
        )
        self.energy.add_child(instance=child)
        prefix = taxonomy_prefix_path(self.homepage)
        url = prefix + "market-news/energy/"
        response = self.client.get(url, HTTP_TURBO_FRAME="site-nav")
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, '"depth": 3')
        self.assertContains(response, "oil-nav-child-test")
        self.assertContains(response, "site-nav__row--depth-3")
        self.assertContains(response, "scn-taxonomy-site-nav__depth-row")
        self.assertContains(response, "scn-navigation-menu__trigger--link")
        self.assertNotContains(response, "site-nav__row--depth-2")

    def test_taxonomy_nav_market_news_energy_returns_200(self):
        from home.taxonomy import taxonomy_prefix_path

        url = taxonomy_prefix_path(self.homepage) + "market-news/energy/"
        r = self.client.get(url)
        self.assertEqual(r.status_code, 200)
        self.assertContains(r, "site-nav")
        # Full-page navigation must render layout + drilldown, not only the Turbo frame.
        self.assertContains(r, "taxonomy-drilldown")
        self.assertContains(r, "template-taxonomy-drilldown")
        self.assertContains(r, "site-nav__link--active", count=2)
        self.assertContains(r, 'data-turbo-frame="main"')
        self.assertNotContains(r, 'data-turbo="false"')
        r_frame = self.client.get(url, HTTP_TURBO_FRAME="site-nav")
        self.assertEqual(r_frame.status_code, 200)
        self.assertContains(r_frame, "<turbo-frame")
        self.assertContains(r_frame, 'id="site-nav"')
        self.assertContains(r_frame, 'data-turbo-frame="main"')
        self.assertNotContains(r_frame, "taxonomy-drilldown")

    def test_financials_drilldown_renders_card_widgets(self):
        from home.taxonomy import taxonomy_prefix_path

        financials = TaxonomyTerm.objects.get(slug="financials")
        TaxonomyTerm.objects.filter(pk=financials.pk).update(is_visible=True)
        fin_pages = []
        for i in range(3):
            p = TaggedContentPage(
                title=f"Fin preview {i}",
                slug=f"fin-preview-{i}",
                section_term=financials,
                lede=f"Preview **fin-{i}**",
                tile_priority=10 - i,
            )
            self.homepage.add_child(instance=p)
            p.save_revision().publish()
            fin_pages.append(p)

        financials.widgets = [
            (
                "card",
                {
                    "article": {
                        "importance": 10,
                        "section_term": financials,
                        "mode": "manual_article",
                        "manual_page": fin_pages[0],
                    }
                },
            ),
            (
                "card",
                {
                    "article": {
                        "importance": 10,
                        "section_term": financials,
                        "mode": "manual_article",
                        "manual_page": fin_pages[1],
                    }
                },
            ),
        ]
        financials.save()

        url = taxonomy_prefix_path(self.homepage) + "market-news/financials/"
        r = self.client.get(url)
        self.assertEqual(r.status_code, 200)
        self.assertContains(r, "data-shadcn-card-layout")
        self.assertContains(r, "Fin preview 0")
        self.assertContains(r, "Fin preview 1")

    def test_get_random_pages_for_section_filters_by_term(self):
        pages = get_random_pages_for_section(self.energy, limit=12)
        self.assertLessEqual(len(pages), 2)
        self.assertTrue(all(p.section_term_id == self.energy.pk for p in pages))

    def test_resolve_taxonomy_trail_market_news_energy(self):
        from home.taxonomy import resolve_taxonomy_trail

        trail = resolve_taxonomy_trail(
            ["market-news", "energy"],
            home_page=self.homepage,
        )
        self.assertIsNotNone(trail)
        self.assertEqual([t.slug for t in trail], ["market-news", "energy"])

    def test_virtual_children_market_news_forex_before_gics(self):
        from home.taxonomy import MARKET_NEWS_SLUG, virtual_children_for

        mnews = TaxonomyTerm.objects.get(slug=MARKET_NEWS_SLUG)
        children = virtual_children_for(mnews, home_page=self.homepage)
        slugs = [t.slug for t in children]
        self.assertEqual(slugs[0], "forex")
        self.assertIn("energy", slugs)

    def test_resolve_taxonomy_trail_market_news_forex(self):
        from home.taxonomy import resolve_taxonomy_trail

        trail = resolve_taxonomy_trail(
            ["market-news", "forex"],
            home_page=self.homepage,
        )
        self.assertIsNotNone(trail)
        self.assertEqual([t.slug for t in trail], ["market-news", "forex"])

    def test_taxonomy_roots_for_nav_includes_custom_root(self):
        from django.utils.crypto import get_random_string

        from home.taxonomy import taxonomy_roots_for_nav

        slug = f"custom-nav-root-{get_random_string(6).lower()}"
        term = TaxonomyTerm(
            name="Custom Nav Root",
            slug=slug,
            is_visible=True,
            is_nav=True,
            sort_order=99,
        )
        last = TaxonomyTerm.get_last_root_node()
        if last is not None:
            last.add_sibling("sorted-sibling", instance=term)
        else:
            TaxonomyTerm.add_root(instance=term)
        TaxonomyTerm.fix_tree()

        roots = taxonomy_roots_for_nav(self.homepage)
        self.assertIn(slug, [t.slug for t in roots])

    def test_resolve_taxonomy_trail_custom_root(self):
        from django.utils.crypto import get_random_string

        from home.taxonomy import resolve_taxonomy_trail

        slug = f"custom-trail-root-{get_random_string(6).lower()}"
        term = TaxonomyTerm(
            name="Custom Trail Root",
            slug=slug,
            is_visible=True,
            is_nav=True,
            sort_order=98,
        )
        last = TaxonomyTerm.get_last_root_node()
        if last is not None:
            last.add_sibling("sorted-sibling", instance=term)
        else:
            TaxonomyTerm.add_root(instance=term)
        TaxonomyTerm.fix_tree()

        trail = resolve_taxonomy_trail(
            [slug],
            home_page=self.homepage,
            require_content=False,
        )
        self.assertIsNotNone(trail)
        self.assertEqual([t.slug for t in trail], [slug])

    def test_resolve_taxonomy_trail_rejects_gics_at_root(self):
        from home.taxonomy import resolve_taxonomy_trail

        trail = resolve_taxonomy_trail(
            ["energy"],
            home_page=self.homepage,
            require_content=False,
        )
        self.assertIsNone(trail)

    def test_market_header_footer_includes_market_news(self):
        from django.test import RequestFactory

        from home.taxonomy import MARKET_NEWS_SLUG

        factory = RequestFactory()
        request = factory.get("/")
        request.site = Site.objects.filter(is_default_site=True).first()
        ctx = market_header(request)
        footer_slugs = [t.slug for t in ctx["site_footer_roots"]]
        self.assertIn(MARKET_NEWS_SLUG, footer_slugs)

    def test_brokers_nav_first_in_site_nav_menu_payload(self):
        from django.test import RequestFactory

        from home.taxonomy import (
            BROKERS_NAV_ID,
            BROKERS_NAV_NAME,
            build_nav_rows,
            build_site_nav_menu_payload,
            is_brokers_nav_active,
        )

        factory = RequestFactory()
        request = factory.get("/")
        nav_rows = build_nav_rows([], home_page=self.homepage)
        payload = build_site_nav_menu_payload(
            request,
            self.homepage,
            nav_rows,
            [],
            [],
        )
        top_row = next(r for r in payload if r["depth"] == 1)
        first = top_row["items"][0]
        self.assertEqual(first["id"], BROKERS_NAV_ID)
        self.assertEqual(first["name"], BROKERS_NAV_NAME)
        self.assertTrue(first["href"].endswith("/rating/forex/"))
        self.assertFalse(first["removable"])
        self.assertFalse(is_brokers_nav_active(request))

        forex_request = factory.get(reverse("forex_ratings"))
        self.assertTrue(is_brokers_nav_active(forex_request))
        forex_payload = build_site_nav_menu_payload(
            forex_request,
            self.homepage,
            nav_rows,
            [],
            [],
        )
        forex_top = next(r for r in forex_payload if r["depth"] == 1)
        self.assertTrue(forex_top["items"][0]["active"])

    def test_brokers_nav_first_in_hamburger_payload(self):
        from home.taxonomy import (
            BROKERS_NAV_ID,
            BROKERS_NAV_NAME,
            build_hamburger_nav_payload,
        )

        payload = build_hamburger_nav_payload(self.homepage)
        first = payload["terms"][0]
        self.assertEqual(first["id"], BROKERS_NAV_ID)
        self.assertEqual(first["name"], BROKERS_NAV_NAME)
        self.assertTrue(first["href"].endswith("/rating/forex/"))
        self.assertTrue(first["inSitemap"])
        self.assertFalse(first["removable"])
        self.assertEqual(first["children"], [])

    def test_taxonomy_nav_market_news_forex_returns_200(self):
        from home.taxonomy import taxonomy_prefix_path

        url = taxonomy_prefix_path(self.homepage) + "market-news/forex/"
        r = self.client.get(url)
        self.assertEqual(r.status_code, 200)
        self.assertContains(r, "taxonomy-drilldown")

    def test_normalize_sector_query_param(self):
        self.assertEqual(normalize_sector_query_param("energy"), "energy")
        self.assertIsNone(normalize_sector_query_param("not-a-gics-slug"))
        self.assertIsNone(normalize_sector_query_param(""))

    def test_home_sector_filters_article_cards(self):
        self.homepage.body = [
            (
                "card",
                {
                    "article": {
                        "importance": 10,
                        "section_term": self.energy,
                        "mode": "manual_article",
                        "manual_page": self.page_e1,
                    }
                },
            ),
            (
                "card",
                {
                    "article": {
                        "importance": 10,
                        "section_term": self.materials,
                        "mode": "manual_article",
                        "manual_page": self.page_m1,
                    }
                },
            ),
        ]
        self.homepage.save_revision().publish()
        r = self.client.get(f"{self.homepage.url}?sector=energy")
        self.assertEqual(r.status_code, 200)
        self.assertContains(r, "Energy one")
        self.assertNotContains(r, "Materials one")
        r_all = self.client.get(self.homepage.url)
        self.assertContains(r_all, "Energy one")
        self.assertContains(r_all, "Materials one")

    def test_build_home_page_display_items_filters_cards(self):
        self.homepage.body = [
            (
                "card",
                {
                    "article": {
                        "importance": 10,
                        "section_term": self.energy,
                        "mode": "manual_article",
                        "manual_page": self.page_e1,
                    }
                },
            ),
            (
                "card",
                {
                    "article": {
                        "importance": 10,
                        "section_term": self.materials,
                        "mode": "manual_article",
                        "manual_page": self.page_m1,
                    }
                },
            ),
        ]
        self.homepage.save_revision().publish()
        items = build_home_page_display_items(self.homepage.body, "energy")
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["mode"], "block")
        self.assertEqual(items[0]["child"].block_type, "card")

    def test_resolve_section_term_falls_back_to_active_node(self):
        """Turbo site-nav frame passes ``active_node``, not ``taxonomy_active_node``."""
        resolved = _resolve_section_term(
            {"section_term": None},
            {"active_node": self.energy},
        )
        self.assertEqual(resolved.pk, self.energy.pk)

    def test_prioritized_random_prefers_higher_tile_priority(self):
        TaggedContentPage.objects.filter(pk=self.page_e1.pk).update(tile_priority=3)
        TaggedContentPage.objects.filter(pk=self.page_e2.pk).update(tile_priority=8)
        picked = get_random_pages_for_section_prioritized(self.energy, limit=1)
        self.assertEqual(len(picked), 1)
        self.assertEqual(picked[0].pk, self.page_e2.pk)

    def test_prioritized_random_blank_tile_priority_like_ten(self):
        TaggedContentPage.objects.filter(pk=self.page_e1.pk).update(tile_priority=5)
        TaggedContentPage.objects.filter(pk=self.page_e2.pk).update(tile_priority=None)
        picked = get_random_pages_for_section_prioritized(self.energy, limit=1)
        self.assertEqual(len(picked), 1)
        self.assertEqual(picked[0].pk, self.page_e2.pk)

    def test_prioritized_random_exclude_ids(self):
        TaggedContentPage.objects.filter(pk=self.page_e1.pk).update(tile_priority=5)
        TaggedContentPage.objects.filter(pk=self.page_e2.pk).update(tile_priority=5)
        picked = get_random_pages_for_section_prioritized(
            self.energy,
            limit=1,
            exclude_ids=[self.page_e2.pk],
        )
        self.assertEqual(len(picked), 1)
        self.assertEqual(picked[0].pk, self.page_e1.pk)

    def test_article_card_does_not_render_editor_importance(self):
        magic = "918273645"
        self.homepage.body = [
            (
                "card",
                {
                    "article": {
                        "importance": int(magic),
                        "section_term": None,
                        "mode": "manual_article",
                        "manual_page": self.page_e1,
                    }
                },
            ),
        ]
        self.homepage.save_revision().publish()
        r = self.client.get(self.homepage.url)
        self.assertEqual(r.status_code, 200)
        self.assertContains(r, "Energy one")
        self.assertContains(r, "data-shadcn-card-layout")
        self.assertNotContains(r, magic)
        self.assertNotContains(r, "Importance (editor only)")

    def test_article_card_row_renders_two_manual_articles(self):
        self.homepage.body = [
            (
                "card",
                {
                    "article": {
                        "importance": 10,
                        "section_term": None,
                        "mode": "manual_article",
                        "manual_page": self.page_e1,
                    }
                },
            ),
            (
                "card",
                {
                    "article": {
                        "importance": 10,
                        "section_term": None,
                        "mode": "manual_article",
                        "manual_page": self.page_e2,
                    }
                },
            ),
        ]
        self.homepage.save_revision().publish()
        r = self.client.get(self.homepage.url)
        self.assertEqual(r.status_code, 200)
        self.assertContains(r, "Energy one")
        self.assertContains(r, "Energy two")


class InlineEditingApiTests(WagtailPageTestCase):
    def setUp(self):
        root_page = Page.get_first_root_node()
        self.homepage = (
            HomePage.objects.child_of(root_page).filter(slug="home").first()
            or HomePage.objects.filter(slug="home").first()
        )
        if self.homepage is None:
            self.homepage = HomePage(title="Home")
            root_page.add_child(instance=self.homepage)
        self.homepage.save_revision().publish()
        site = Site.objects.filter(is_default_site=True).first()
        if site:
            Site.objects.filter(pk=site.pk).update(
                hostname="testserver",
                port=80,
                root_page_id=self.homepage.pk,
            )
        else:
            Site.objects.create(
                hostname="testserver",
                port=80,
                root_page=self.homepage,
                is_default_site=True,
            )
        self.energy = TaxonomyTerm.objects.get(slug="energy")
        User = get_user_model()
        self.admin_user = User.objects.create_user(
            username="inline-admin",
            password="pass12345",
            is_staff=True,
        )
        self.non_admin = User.objects.create_user(
            username="inline-user",
            password="pass12345",
        )

    def test_create_taxonomy_term_requires_staff(self):
        self.client.force_login(self.non_admin)
        response = self.client.post(
            reverse("inline_create_taxonomy_term"),
            data='{"name":"Test child","parent_id": null}',
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 302)

    def test_create_taxonomy_term_attaches_to_selected_parent(self):
        self.client.force_login(self.admin_user)
        response = self.client.post(
            reverse("inline_create_taxonomy_term"),
            data='{"name":"Inline Energy Child","parent_id": %d}' % self.energy.pk,
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        term = TaxonomyTerm.objects.get(slug="inline-energy-child")
        self.assertEqual(term.get_parent().pk, self.energy.pk)

    def test_create_taxonomy_term_without_parent_defaults_to_market_news(self):
        self.client.force_login(self.admin_user)
        mnews = TaxonomyTerm.objects.get(slug="market-news")
        response = self.client.post(
            reverse("inline_create_taxonomy_term"),
            data='{"name":"Top Row Inline Category","parent_id": null}',
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["parent_id"], mnews.pk)
        term = TaxonomyTerm.objects.get(slug="top-row-inline-category")
        self.assertEqual(term.get_parent().pk, mnews.pk)

    def test_rename_taxonomy_term_requires_staff(self):
        self.client.force_login(self.non_admin)
        response = self.client.post(
            reverse("inline_rename_taxonomy_term"),
            data='{"term_id": %d, "name":"Hacked"}' % self.energy.pk,
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 302)

    def test_rename_taxonomy_term_updates_name_and_slug(self):
        self.client.force_login(self.admin_user)
        create = self.client.post(
            reverse("inline_create_taxonomy_term"),
            data='{"name":"Rename Me Please","parent_id": %d}' % self.energy.pk,
            content_type="application/json",
        )
        self.assertEqual(create.status_code, 200)
        term_id = create.json()["id"]
        response = self.client.post(
            reverse("inline_rename_taxonomy_term"),
            data='{"term_id": %s, "name":"Renamed Label"}' % term_id,
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        term = TaxonomyTerm.objects.get(pk=term_id)
        self.assertEqual(term.name, "Renamed Label")
        self.assertEqual(term.slug, "renamed-label")

    def test_rename_taxonomy_term_avoids_slug_collision(self):
        self.client.force_login(self.admin_user)
        first = self.client.post(
            reverse("inline_create_taxonomy_term"),
            data='{"name":"Slug Twin A","parent_id": %d}' % self.energy.pk,
            content_type="application/json",
        )
        second = self.client.post(
            reverse("inline_create_taxonomy_term"),
            data='{"name":"Slug Twin B","parent_id": %d}' % self.energy.pk,
            content_type="application/json",
        )
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        id_b = second.json()["id"]
        response = self.client.post(
            reverse("inline_rename_taxonomy_term"),
            data='{"term_id": %s, "name":"Slug Twin A"}' % id_b,
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        term = TaxonomyTerm.objects.get(pk=id_b)
        self.assertEqual(term.slug, "slug-twin-a-2")

    def test_delete_taxonomy_term_blocks_used_terms(self):
        self.client.force_login(self.admin_user)
        page = TaggedContentPage(
            title="Inline Delete Guard",
            slug="inline-delete-guard",
            section_term=self.energy,
            lede="guard",
        )
        self.homepage.add_child(instance=page)
        page.save_revision().publish()

        response = self.client.post(
            reverse("inline_delete_taxonomy_term"),
            data='{"term_id": %d}' % self.energy.pk,
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertTrue(TaxonomyTerm.objects.filter(pk=self.energy.pk).exists())

    def test_update_tile_title_regenerates_unique_slug(self):
        self.client.force_login(self.admin_user)
        page_a = TaggedContentPage(
            title="Alpha Story",
            slug="alpha-story",
            section_term=self.energy,
            lede="a",
        )
        self.homepage.add_child(instance=page_a)
        page_a.save_revision().publish()

        page_b = TaggedContentPage(
            title="Beta Story",
            slug="beta-story",
            section_term=self.energy,
            lede="b",
        )
        self.homepage.add_child(instance=page_b)
        page_b.save_revision().publish()

        response = self.client.post(
            reverse("inline_update_tile_title"),
            data='{"page_id": %d, "title":"Alpha Story"}' % page_b.pk,
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        page_b.refresh_from_db()
        self.assertEqual(page_b.title, "Alpha Story")
        self.assertEqual(page_b.slug, "alpha-story-2")

    def test_staff_tagged_page_shows_title_edit_pen_button(self):
        self.client.force_login(self.admin_user)
        page = TaggedContentPage(
            title="Editable Title",
            slug="editable-title",
            section_term=self.energy,
            lede="preview",
        )
        self.homepage.add_child(instance=page)
        page.save_revision().publish()

        response = self.client.get(page.url)
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "scn-profile-article-edit")
        self.assertContains(
            response,
            reverse("article_editor", kwargs={"article_id": page.pk}),
        )

    def test_non_staff_tagged_page_hides_title_edit_pen_button(self):
        self.client.force_login(self.non_admin)
        page = TaggedContentPage(
            title="Read Only Title",
            slug="read-only-title",
            section_term=self.energy,
            lede="preview",
        )
        self.homepage.add_child(instance=page)
        page.save_revision().publish()

        response = self.client.get(page.url)
        self.assertEqual(response.status_code, 200)
        self.assertNotContains(response, "scn-profile-article-edit")

    def test_tagged_article_page_renders_hero_caption(self):
        from wagtail.images import get_image_model
        from wagtail.images.tests.utils import get_test_image_file

        hero = get_image_model().objects.create(
            title="Test hero",
            file=get_test_image_file(),
        )
        page = TaggedContentPage(
            title="Hero caption story",
            slug="hero-caption-story",
            section_term=self.energy,
            lede="**Lede** for caption test.",
            hero_image=hero,
            hero_image_description="Photo credit: Test Agency",
        )
        self.homepage.add_child(instance=page)
        page.save_revision().publish()
        response = self.client.get(page.url)
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "tagged-content__hero-caption")
        self.assertContains(response, "Photo credit: Test Agency")
        self.assertContains(response, "tagged-content__hero-sep")
        content = response.content.decode()
        self.assertLess(
            content.find("tagged-content__hero-caption"),
            content.find("tagged-content__hero-sep"),
        )

    def test_profile_staff_exposes_article_create_url(self):
        self.client.force_login(self.admin_user)
        response = self.client.get(reverse("profile"))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, f'data-create-article-url="{reverse("article_create")}"')

    def test_profile_exposes_moderation_mount_and_page_size(self):
        self.client.force_login(self.admin_user)
        response = self.client.get(reverse("profile"))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'data-moderation-json-id="profile-moderation-data"')
        self.assertContains(response, 'data-page-size="25"')
        self.assertContains(response, "profile-moderation-data")

    def test_profile_includes_awaiting_moderation_item(self):
        self.client.force_login(self.admin_user)
        page = TaggedContentPage(
            title="Moderation Queue Story",
            slug="moderation-queue-story",
            section_term=self.energy,
            lede="Needs review",
            awaiting_moderation=True,
            live=False,
        )
        self.homepage.add_child(instance=page)
        page.save_revision(user=self.admin_user)

        response = self.client.get(reverse("profile"))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Moderation Queue Story")
        self.assertContains(
            response,
            reverse("article-article-action", args=[page.pk]),
        )

    def test_approve_moderation_action_publishes_article(self):
        self.client.force_login(self.admin_user)
        page = TaggedContentPage(
            title="Approve Me",
            slug="approve-me",
            section_term=self.energy,
            lede="preview",
            awaiting_moderation=True,
            live=False,
        )
        self.homepage.add_child(instance=page)
        page.save_revision(user=self.admin_user)

        response = self.client.post(
            reverse("article-article-action", args=[page.pk]),
            data='{"action": "approve_moderation"}',
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        page.refresh_from_db()
        self.assertTrue(page.live)
        self.assertFalse(page.awaiting_moderation)

    def test_create_article_creates_draft_and_redirects_to_editor(self):
        self.client.force_login(self.admin_user)
        existing_ids = set(TaggedContentPage.objects.values_list("id", flat=True))

        response = self.client.post(reverse("article_create"))

        self.assertEqual(response.status_code, 302)
        created = TaggedContentPage.objects.exclude(id__in=existing_ids).get()
        self.assertRedirects(response, reverse("article_editor", kwargs={"article_id": created.pk}))
        self.assertEqual(created.get_parent().pk, self.homepage.pk)
        self.assertFalse(created.live)

    def _make_draft_article(self, **kwargs):
        page = TaggedContentPage(
            title=kwargs.pop("title", "Authz Test Story"),
            slug=kwargs.pop("slug", "authz-test-story"),
            section_term=kwargs.pop("section_term", self.energy),
            lede=kwargs.pop("lede", "preview"),
            **kwargs,
        )
        self.homepage.add_child(instance=page)
        page.save_revision(user=self.admin_user)
        return page

    def test_non_staff_cannot_access_article_editor(self):
        page = self._make_draft_article(slug="authz-editor-gate")
        self.client.force_login(self.non_admin)
        response = self.client.get(reverse("article_editor", kwargs={"article_id": page.pk}))
        self.assertEqual(response.status_code, 302)

    def test_non_staff_cannot_create_article(self):
        self.client.force_login(self.non_admin)
        before = TaggedContentPage.objects.count()
        response = self.client.post(reverse("article_create"))
        self.assertEqual(response.status_code, 302)
        self.assertEqual(TaggedContentPage.objects.count(), before)

    def test_non_staff_profile_hides_editor_data(self):
        page = self._make_draft_article(
            title="Hidden Moderation Story",
            slug="hidden-moderation-story",
            awaiting_moderation=True,
            live=False,
        )
        self.client.force_login(self.non_admin)
        response = self.client.get(reverse("profile"))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'data-is-staff="false"')
        self.assertContains(response, 'data-create-article-url=""')
        self.assertNotContains(response, "Hidden Moderation Story")
        self.assertNotContains(response, reverse("article-article-action", args=[page.pk]))

    def test_non_staff_cannot_patch_article_api(self):
        page = self._make_draft_article(slug="authz-patch-gate")
        self.client.force_login(self.non_admin)
        response = self.client.patch(
            reverse("article-detail", args=[page.pk]),
            data='{"title": "Hacked title"}',
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 403)
        page.refresh_from_db()
        self.assertEqual(page.title, "Authz Test Story")

    def test_non_staff_cannot_approve_moderation_via_api(self):
        page = self._make_draft_article(
            slug="authz-approve-gate",
            awaiting_moderation=True,
            live=False,
        )
        self.client.force_login(self.non_admin)
        response = self.client.post(
            reverse("article-article-action", args=[page.pk]),
            data='{"action": "approve_moderation"}',
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 403)
        page.refresh_from_db()
        self.assertFalse(page.live)
        self.assertTrue(page.awaiting_moderation)

    def test_non_staff_cannot_delete_article_via_api(self):
        page = self._make_draft_article(slug="authz-delete-gate")
        self.client.force_login(self.non_admin)
        response = self.client.post(
            reverse("article-article-action", args=[page.pk]),
            data='{"action": "delete"}',
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 403)
        self.assertTrue(TaggedContentPage.objects.filter(pk=page.pk).exists())

    @override_settings(PUBLIC_SIGNUP_ENABLED=False)
    def test_public_signup_disabled_when_setting_off(self):
        response = self.client.post(
            reverse("popup_signup"),
            data={
                "username": "blocked-user",
                "email": "blocked@example.com",
                "password1": "ComplexPass123!",
                "password2": "ComplexPass123!",
            },
        )
        self.assertEqual(response.status_code, 302)
        self.assertFalse(
            get_user_model().objects.filter(username="blocked-user").exists()
        )

    def test_article_preview_requires_staff(self):
        page = TaggedContentPage(
            title="Preview Gate Story",
            slug="preview-gate-story",
            section_term=self.energy,
            lede="preview",
        )
        self.homepage.add_child(instance=page)
        page.save_revision()
        preview_url = reverse("article_preview", kwargs={"article_id": page.pk})

        response = self.client.get(preview_url)
        self.assertEqual(response.status_code, 302)

        self.client.force_login(self.non_admin)
        response = self.client.get(preview_url)
        self.assertEqual(response.status_code, 302)

    def test_article_preview_renders_latest_revision_for_staff(self):
        page = TaggedContentPage(
            title="Staff Preview Story",
            slug="staff-preview-story",
            section_term=self.energy,
            lede="preview",
        )
        self.homepage.add_child(instance=page)
        page.save_revision()
        preview_url = reverse("article_preview", kwargs={"article_id": page.pk})

        self.client.force_login(self.admin_user)
        response = self.client.get(preview_url)
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Staff Preview Story")

        page.title = "Staff Preview Story Updated"
        page.save_revision()
        response = self.client.get(preview_url)
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Staff Preview Story Updated")

    def test_article_preview_shows_body_after_api_patch(self):
        import json

        page = TaggedContentPage(
            title="API Preview Body Story",
            slug="api-preview-body-story",
            section_term=self.energy,
            lede="preview",
        )
        self.homepage.add_child(instance=page)
        page.save_revision()
        preview_url = reverse("article_preview", kwargs={"article_id": page.pk})
        marker = "UniquePreviewBodyMarker42"

        self.client.force_login(self.admin_user)
        patch_response = self.client.patch(
            reverse("article-detail", args=[page.pk]),
            data=json.dumps(
                {
                    "body_json": [
                        {
                            "id": "preview-body-block",
                            "type": "paragraph",
                            "value": f"<p>{marker}</p>",
                        }
                    ]
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(patch_response.status_code, 200)

        response = self.client.get(preview_url)
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, marker)
        self.assertContains(response, "stream-block")

    def test_article_preview_renders_pull_quote_markup(self):
        import json

        page = TaggedContentPage(
            title="Pull Quote Preview",
            slug="pull-quote-preview",
            section_term=self.energy,
        )
        self.homepage.add_child(instance=page)
        page.save_revision()
        preview_url = reverse("article_preview", kwargs={"article_id": page.pk})
        quote_text = "UniquePullQuotePreviewMarker"

        self.client.force_login(self.admin_user)
        patch_response = self.client.patch(
            reverse("article-detail", args=[page.pk]),
            data=json.dumps(
                {
                    "body_json": [
                        {
                            "id": "quote-block",
                            "type": "paragraph",
                            "value": (
                                f'<blockquote class="scn-article-quote">'
                                f"<p>{quote_text}</p></blockquote>"
                            ),
                        }
                    ]
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(patch_response.status_code, 200)

        response = self.client.get(preview_url)
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, quote_text)
        self.assertContains(response, "stream-block--paragraph")
        self.assertContains(response, 'blockquote class="scn-article-quote"')

    def test_staff_homepage_renders_inline_chip_delete_controls(self):
        self.client.force_login(self.admin_user)
        response = self.client.get(self.homepage.url)
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "data-shadcn-taxonomy-site-nav")
        self.assertContains(response, 'data-can-edit="1"')
        self.assertContains(response, "data-create-url")
        self.assertContains(response, "data-delete-url")
        self.assertContains(response, "data-rename-url")
        self.assertContains(response, "site-nav-menu-payload")
        self.assertNotContains(response, "site-nav__row--depth-3")

    def _seed_taxonomy_card_widget(self, slug="market-news"):
        term = TaxonomyTerm.objects.get(slug=slug)
        u = get_random_string(6)
        article = TaggedContentPage(
            title="Taxonomy card fixture",
            slug=f"taxonomy-card-fixture-{u}",
            section_term=self.energy,
            lede="pv",
        )
        self.homepage.add_child(instance=article)
        article.save_revision().publish()
        term.widgets = [
            (
                "card",
                {
                    "article": {
                        "importance": 10,
                        "section_term": self.energy,
                        "mode": "manual_article",
                        "manual_page": article,
                    }
                },
            ),
        ]
        term.save()
        return term

    def test_taxonomy_root_renders_card_layout_when_configured(self):
        self._seed_taxonomy_card_widget("market-news")
        url = reverse("wagtail_serve", args=["_taxonomy/"])
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "data-shadcn-card-layout")
        self.assertContains(response, "Taxonomy card fixture")

    def test_taxonomy_drilldown_renders_card_layout_when_configured(self):
        self._seed_taxonomy_card_widget("market-news")
        url = reverse("wagtail_serve", args=["_taxonomy/market-news/"])
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "data-shadcn-card-layout")

    def test_taxonomy_drilldown_market_news_resolves_when_not_tree_root(self):
        from home.taxonomy import taxonomy_prefix_path

        mnews = TaxonomyTerm.objects.get(slug="market-news")
        opinions = TaxonomyTerm.objects.get(slug="opinions")
        self.assertTrue(mnews.is_root())
        mnews.move(opinions, pos="sorted-child")
        mnews.refresh_from_db()
        self.assertFalse(mnews.is_root())

        url = taxonomy_prefix_path(self.homepage) + "market-news/"
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)


class CardSourcePropertiesTests(WagtailPageTestCase):
    def setUp(self):
        root_page = Page.get_first_root_node()
        self.homepage = HomePage(title="Home")
        root_page.add_child(instance=self.homepage)
        self.homepage.save_revision().publish()
        Site.objects.update_or_create(
            hostname="testserver",
            port=80,
            defaults={"root_page": self.homepage, "is_default_site": True},
        )

        self.energy = TaxonomyTerm.objects.get(slug="energy")
        self.tag_alpha = ContentTag.objects.create(name="Alpha x", slug=f"alpha-{get_random_string(6)}")
        self.tag_beta = ContentTag.objects.create(name="Beta x", slug=f"beta-{get_random_string(6)}")

        self.page_high = TaggedContentPage(
            title="Priority High",
            slug=f"priority-high-{get_random_string(5)}",
            section_term=self.energy,
            article_priority=10,
            priority_expires_at=timezone.now() + timezone.timedelta(days=2),
        )
        self.homepage.add_child(instance=self.page_high)
        self.page_high.save_revision().publish()
        self.page_high.tags.add(self.tag_alpha)

        self.page_expired = TaggedContentPage(
            title="Priority Expired",
            slug=f"priority-expired-{get_random_string(5)}",
            section_term=self.energy,
            article_priority=9,
            priority_expires_at=timezone.now() - timezone.timedelta(days=1),
        )
        self.homepage.add_child(instance=self.page_expired)
        self.page_expired.save_revision().publish()
        self.page_expired.tags.add(self.tag_alpha)

        self.page_tagged = TaggedContentPage(
            title="Tagged Candidate",
            slug=f"tagged-candidate-{get_random_string(5)}",
            section_term=self.energy,
        )
        self.homepage.add_child(instance=self.page_tagged)
        self.page_tagged.save_revision().publish()
        self.page_tagged.tags.add(self.tag_beta)

        user_model = get_user_model()
        self.staff = user_model.objects.create_user(
            username=f"staff_{get_random_string(6)}",
            password="pass12345",
            is_staff=True,
        )

    def test_priority_query_ignores_expired_rows(self):
        picked = get_priority_pages_for_section(self.energy, limit=5)
        picked_ids = {p.pk for p in picked}
        self.assertIn(self.page_high.pk, picked_ids)
        self.assertNotIn(self.page_expired.pk, picked_ids)

    def test_tagged_with_mode_picks_matching_tag(self):
        state = _resolve_universal_tile_state(
            {
                "mode": "tagged_with",
                "section_term": self.energy,
                "tags": [self.tag_beta],
            },
            {"page": self.homepage},
            [],
        )
        self.assertEqual(state["kind"], "article")
        self.assertEqual(getattr(state["tile_page"], "pk", None), self.page_tagged.pk)

    def test_specific_article_mode_uses_specific_page(self):
        state = _resolve_universal_tile_state(
            {
                "mode": "specific_article",
                "specific_page": self.page_high,
            },
            {"page": self.homepage},
            [],
        )
        self.assertEqual(getattr(state["tile_page"], "pk", None), self.page_high.pk)

    def test_inline_selector_endpoints_return_results_for_staff(self):
        self.client.force_login(self.staff)
        r_articles = self.client.get(reverse("inline_search_articles"), {"q": "Priority"})
        self.assertEqual(r_articles.status_code, 200)
        payload_articles = r_articles.json()
        self.assertTrue(any(x.get("id") == self.page_high.pk for x in payload_articles.get("results", [])))

        r_tags = self.client.get(reverse("inline_list_content_tags"), {"q": "Alpha"})
        self.assertEqual(r_tags.status_code, 200)
        payload_tags = r_tags.json()
        self.assertTrue(any(x.get("id") == self.tag_alpha.pk for x in payload_tags.get("results", [])))

    def test_inline_search_random_excludes_given_ids_without_auth(self):
        """Public random hydrate may call search with exclude_ids; must omit excluded pages."""
        url = reverse("inline_search_articles")
        r = self.client.get(
            url,
            {
                "random": "1",
                "section_term_id": str(self.energy.pk),
                "exclude_ids": f"{self.page_high.pk},{self.page_tagged.pk}",
            },
        )
        self.assertEqual(r.status_code, 200)
        results = r.json().get("results") or []
        if results:
            rid = results[0].get("id")
            self.assertNotIn(rid, {self.page_high.pk, self.page_tagged.pk})

    def test_market_news_featured_includes_direct_container_articles(self):
        from home.taxonomy import MARKET_NEWS_SLUG

        mnews = TaxonomyTerm.objects.get(slug=MARKET_NEWS_SLUG)
        direct = TaggedContentPage(
            title="Market News direct fixture",
            slug=f"market-news-direct-{get_random_string(5)}",
            section_term=mnews,
            lede="Direct hub story",
        )
        self.homepage.add_child(instance=direct)
        direct.save_revision().publish()
        pages, _ = featured_quad_pages_for_sector(
            mnews, None, home_page=self.homepage
        )
        self.assertTrue(
            any(p is not None and p.pk == direct.pk for p in pages),
        )

    def test_inline_search_article_id_hydrates_without_auth(self):
        response = self.client.get(
            reverse("inline_search_articles"),
            {"article_id": str(self.page_high.pk)},
        )
        self.assertEqual(response.status_code, 200)
        results = response.json().get("results") or []
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].get("id"), self.page_high.pk)
        self.assertIn("publishedAt", results[0])

    def test_inline_search_random_market_news_includes_direct_container_articles(self):
        from home.taxonomy import MARKET_NEWS_SLUG

        mnews = TaxonomyTerm.objects.get(slug=MARKET_NEWS_SLUG)
        direct = TaggedContentPage(
            title="Market News random fixture",
            slug=f"market-news-random-{get_random_string(5)}",
            section_term=mnews,
            lede="Random hydrate story",
        )
        self.homepage.add_child(instance=direct)
        direct.save_revision().publish()
        scoped_ids = _section_term_ids_for_taxonomy_scope(mnews)
        self.assertIn(mnews.pk, scoped_ids)
        exclude_ids = list(
            TaggedContentPage.objects.live()
            .public()
            .filter(section_term_id__in=scoped_ids)
            .exclude(pk=direct.pk)
            .values_list("pk", flat=True)
        )
        response = self.client.get(
            reverse("inline_search_articles"),
            {
                "random": "1",
                "section_term_id": str(mnews.pk),
                "exclude_ids": ",".join(str(pk) for pk in exclude_ids),
            },
        )
        self.assertEqual(response.status_code, 200)
        results = response.json().get("results") or []
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].get("id"), direct.pk)
        self.assertIn("imageUrl", results[0])

    def test_card_layout_buffer_random_cards_pick_distinct_pages(self):
        """Same layout buffer excludes already-used article ids across consecutive cards."""

        class StreamBlockDummy:
            __slots__ = ("block_type", "value")

            def __init__(self, block_type, value):
                self.block_type = block_type
                self.value = value

        dummy_stream = [
            StreamBlockDummy(
                "card",
                {"article": {"mode": "random", "section_term": self.energy}},
            ),
            StreamBlockDummy(
                "card",
                {"article": {"mode": "random", "section_term": self.energy}},
            ),
        ]
        payload = build_layout_payload(dummy_stream, {"page": self.homepage})
        rows = payload.get("rows") or []
        self.assertGreaterEqual(len(rows), 1)
        first_row = rows[0]
        self.assertEqual(first_row.get("kind"), "row")
        cards = [i for i in first_row.get("items", []) if i.get("type") == "card"]
        self.assertGreaterEqual(len(cards), 2)
        titles = []
        for c in cards[:2]:
            card = c.get("card") or {}
            self.assertEqual(card.get("sourceConfig", {}).get("mode"), "random")
            if card.get("kind") == "article":
                titles.append(card.get("title"))
        self.assertGreaterEqual(len(titles), 2)
        self.assertEqual(len(set(titles)), len(titles), msg="Expected distinct articles for two random picks")

    def test_serialized_article_card_contains_metadata(self):
        self.page_high.author_name = "Custom Desk"
        self.page_high.save_revision().publish()
        TaggedContentPage.objects.filter(pk=self.page_high.pk).update(
            catalyst=TaggedContentPage.CATALYST_BULLISH,
        )
        self.page_high.refresh_from_db()
        payload = serialize_article_card_for_related(self.page_high, None)
        self.assertEqual(payload.get("kind"), "article")
        self.assertEqual(payload.get("authorName"), "Custom Desk")
        self.assertEqual(payload.get("catalyst"), "Bullish")
        self.assertIsInstance(payload.get("tags"), list)
        self.assertLessEqual(len(payload.get("tags") or []), 3)
        self.assertTrue(payload.get("publishedAt"))

    def test_card_author_name_fallback_to_editorial(self):
        self.page_tagged.author_name = ""
        self.page_tagged.author_user = None
        self.assertEqual(self.page_tagged.card_author_name(), "Fivenickels Editorial")

    def test_inline_search_payload_includes_metadata_fields(self):
        self.client.force_login(self.staff)
        response = self.client.get(reverse("inline_search_articles"), {"q": "Priority High"})
        self.assertEqual(response.status_code, 200)
        rows = response.json().get("results") or []
        self.assertTrue(rows)
        match = next((x for x in rows if x.get("id") == self.page_high.pk), rows[0])
        self.assertIn("tags", match)
        self.assertIn("authorName", match)
        self.assertIn("publishedAt", match)

    def test_build_layout_payload_includes_bento_version(self):
        class StreamBlockDummy:
            __slots__ = ("block_type", "value")

            def __init__(self, block_type, value):
                self.block_type = block_type
                self.value = value

        dummy_stream = [
            StreamBlockDummy(
                "card",
                {"article": {"mode": "random", "section_term": self.energy}},
            ),
        ]
        payload = build_layout_payload(dummy_stream, {"page": self.homepage})
        self.assertEqual(payload.get("layoutVersion"), BENTO_LAYOUT_VERSION)
        self.assertEqual(payload.get("layoutVersion"), 3)

    def test_save_master_layout_accepts_v3_payload(self):
        self.client.force_login(self.staff)
        term = TaxonomyTerm.objects.filter(is_visible=True).first()
        if term is None:
            self.skipTest("No taxonomy term available for save test")
        import json

        layout = {
            "rows": [
                {"kind": "row", "items": [{"type": "card", "card": {"kind": "stub", "message": "test"}}]},
            ],
            "layoutVersion": 3,
        }
        response = self.client.post(
            reverse("save_taxonomy_master_layout"),
            data=json.dumps({"term_id": term.pk, "layout": layout}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        term.refresh_from_db()
        self.assertEqual(term.master_layout_json.get("layoutVersion"), 3)

    def test_save_master_layout_backward_compat_v1(self):
        self.client.force_login(self.staff)
        term = TaxonomyTerm.objects.filter(is_visible=True).first()
        if term is None:
            self.skipTest("No taxonomy term available for save test")
        import json

        layout = {
            "rows": [
                {"kind": "row", "items": [{"type": "card", "card": {"kind": "stub", "message": "legacy"}}]},
            ],
        }
        response = self.client.post(
            reverse("save_taxonomy_master_layout"),
            data=json.dumps({"term_id": term.pk, "layout": layout}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        term.refresh_from_db()
        self.assertNotIn("layoutVersion", term.master_layout_json)


class BuildMarketMoversPayloadSessionTests(SimpleTestCase):
    @patch("home.market_widgets.classify_us_market_session")
    def test_us_region_includes_session_fields(self, mock_classify):
        from home.market_widgets import build_market_movers_payload
        from home.us_market_session import UsMarketSessionInfo

        mock_classify.return_value = UsMarketSessionInfo(
            "pre", "Pre-market", "extended"
        )
        request = Mock()
        request.path = "/"
        request.GET = {}
        payload = build_market_movers_payload([], request, block_region="US")
        self.assertEqual(payload["market_session_label"], "Pre-market")
        self.assertEqual(payload["market_session_id"], "pre")
        self.assertEqual(payload["price_basis"], "extended")

    @patch("home.market_widgets.classify_us_market_session")
    def test_non_us_region_omits_session_fields(self, mock_classify):
        from home.market_widgets import build_market_movers_payload
        from home.us_market_session import UsMarketSessionInfo

        mock_classify.return_value = UsMarketSessionInfo(
            "pre", "Pre-market", "extended"
        )
        request = Mock()
        request.path = "/"
        request.GET = {"market_region": "ASIA"}
        payload = build_market_movers_payload([], request)
        self.assertIsNone(payload["market_session_label"])
        self.assertIsNone(payload["market_session_id"])
        self.assertIsNone(payload["price_basis"])
        mock_classify.assert_not_called()


class BentoForexMarketMoversSerializationTests(WagtailPageTestCase):
    @patch("home.card_layout.build_forex_quotes_payload")
    def test_serialize_bentogrid01_forex_strip(self, mock_forex):
        mock_forex.return_value = [
            {
                "label": "EUR/USD",
                "mid_display": "1.100",
                "pct_formatted": "+0.1%",
                "pct_class": "is-up",
            }
        ]
        payload = _serialize_bentogrid01(
            {
                "badge_text": "Features",
                "heading": "Markets",
                "grid_columns": 4,
                "features": [
                    {
                        "header_type": "forex_strip",
                        "title": "",
                        "description": "",
                        "col_span": "4",
                        "row_span": 2,
                    }
                ],
            },
            {"request": None},
        )
        self.assertEqual(payload["grid_columns"], 4)
        self.assertEqual(payload["grid_rows"], 3)
        self.assertEqual(payload["features"][0]["header_type"], "forex_strip")
        self.assertEqual(payload["features"][0]["col_span"], 1)
        self.assertEqual(payload["features"][0]["row_span"], 2)
        self.assertEqual(len(payload["features"][0]["forex_quotes"]), 1)
        self.assertEqual(payload["features"][0]["forex_quotes"][0]["label"], "EUR/USD")

    def test_serialize_bentogrid01_grid_rows_and_col(self):
        payload = _serialize_bentogrid01(
            {
                "badge_text": "Features",
                "heading": "Grid",
                "grid_columns": 3,
                "grid_rows": 2,
                "row_panel_sizes": [70, 30],
                "col_panel_sizes_by_row": {"0": [25, 75]},
                "features": [
                    {
                        "header_type": "image",
                        "title": "Tile",
                        "description": "",
                        "col_span": 1,
                        "row_span": 1,
                        "row": 1,
                        "col": 2,
                    }
                ],
            },
            {"request": None},
        )
        self.assertEqual(payload["grid_columns"], 3)
        self.assertEqual(payload["grid_rows"], 2)
        self.assertEqual(payload["row_panel_sizes"], [70, 30])
        self.assertEqual(payload["col_panel_sizes_by_row"], {"0": [25, 75]})
        feat = payload["features"][0]
        self.assertEqual(feat["row"], 1)
        self.assertEqual(feat["col"], 2)

    @patch("home.market_widgets.classify_us_market_session")
    def test_serialize_bentogrid01_market_movers(self, mock_classify):
        from home.us_market_session import UsMarketSessionInfo

        mock_classify.return_value = UsMarketSessionInfo(
            "regular", "Regular", "regular"
        )
        MarketTickerRow.objects.create(
            symbol="WIN",
            enabled=True,
            percent_change=Decimal("5.5"),
            market_region="US",
            sort_order=1,
        )
        MarketTickerRow.objects.create(
            symbol="LOSE",
            enabled=True,
            percent_change=Decimal("-3.2"),
            market_region="US",
            sort_order=2,
        )
        request = Mock()
        request.path = "/"
        request.GET = {}
        payload = _serialize_bentogrid01(
            {
                "badge_text": "Features",
                "heading": "Movers",
                "features": [
                    {
                        "header_type": "market_movers",
                        "market_region": "US",
                        "title": "",
                        "description": "",
                        "col_span": "8",
                        "row_span": 1,
                    }
                ],
            },
            {"request": request},
        )
        self.assertEqual(payload["grid_columns"], 3)
        feat = payload["features"][0]
        self.assertEqual(feat["header_type"], "market_movers")
        self.assertEqual(feat["col_span"], 2)
        self.assertEqual(feat["row_span"], 1)
        self.assertTrue(feat["market_movers"]["has_data"])
        self.assertEqual(len(feat["market_movers"]["winners"]), 1)
        self.assertEqual(feat["market_movers"]["winners"][0]["symbol"], "WIN")
        self.assertEqual(len(feat["market_mover_tabs"]), 3)
        self.assertEqual(feat["market_session_label"], "Regular")
        self.assertEqual(feat["market_session_id"], "regular")
        self.assertEqual(feat["price_basis"], "regular")

    def test_market_header_omits_forex_and_movers(self):
        request = Mock()
        request.site = None
        request.get_host = Mock(return_value="localhost")
        request.META = {"SERVER_PORT": "8000"}
        request.GET = {}
        ctx = market_header(request)
        self.assertIn("header_tickers", ctx)
        self.assertNotIn("forex_quotes", ctx)
        self.assertNotIn("market_movers", ctx)
        self.assertNotIn("market_mover_tabs", ctx)


class StockBarsPreviewViewTests(WagtailPageTestCase):
    """GET ``stock_bars_preview`` returns chart + chips JSON (public, no auth)."""

    @patch("home.inline_edit_views.serialize_stock_bars_tile_payload")
    def test_stock_bars_preview_returns_payload_keys(self, mock_serialize):
        mock_serialize.return_value = {
            "chart_symbol": "AAPL",
            "bars": [{"t": 1.0, "o": 1.0, "h": 2.0, "l": 0.5, "c": 1.5, "v": None}],
            "bars_timeframe": "1Day",
            "bars_as_of_utc": "2026-01-15T00:00:00Z",
            "chips": [
                {
                    "symbol": "AAPL",
                    "label": "AAPL",
                    "href": "/ticker/aapl/",
                    "pct_formatted": "—",
                    "pct_class": "is-neutral",
                }
            ],
        }
        url = reverse("stock_bars_preview")
        response = self.client.get(url, {"symbols": "AAPL"})
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["chart_symbol"], "AAPL")
        self.assertIn("bars", data)
        self.assertIn("chips", data)
        self.assertEqual(data.get("bars_timeframe"), "1Day")
        self.assertEqual(data.get("bars_as_of_utc"), "2026-01-15T00:00:00Z")
        mock_serialize.assert_called_once_with(["AAPL"], timeframe="1Day", limit=180)

    @patch("home.inline_edit_views.serialize_stock_bars_tile_payload")
    def test_stock_bars_preview_2h_cadence(self, mock_serialize):
        mock_serialize.return_value = {
            "chart_symbol": "MU",
            "bars": [],
            "bars_timeframe": "2Hour",
            "chips": [],
        }
        url = reverse("stock_bars_preview")
        response = self.client.get(url, {"symbols": "MU", "cadence": "2h", "bars_limit": "120"})
        self.assertEqual(response.status_code, 200)
        mock_serialize.assert_called_once_with(["MU"], timeframe="2Hour", limit=120)


class ForexStripPreviewViewTests(WagtailPageTestCase):
    """GET ``forex_strip_preview`` returns forex quotes JSON (public, no auth)."""

    @patch("home.inline_edit_views.build_forex_quotes_payload")
    def test_forex_strip_preview_returns_quotes(self, mock_build):
        mock_build.return_value = [{"pair": "EUR/USD", "rate": "1.08"}]
        response = self.client.get(reverse("forex_strip_preview"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"forex_quotes": [{"pair": "EUR/USD", "rate": "1.08"}]})
        mock_build.assert_called_once_with()


class MarketMoversPreviewViewTests(WagtailPageTestCase):
    """GET ``market_movers_preview`` returns movers + tabs JSON (public, no auth)."""

    @patch("home.inline_edit_views.build_market_movers_payload")
    def test_market_movers_preview_passes_region(self, mock_build):
        mock_build.return_value = {
            "market_movers": {"winners": [], "loosers": [], "has_data": False},
            "market_mover_tabs": [],
            "selected_region": "ASIA",
        }
        response = self.client.get(
            reverse("market_movers_preview"),
            {"market_region": "ASIA"},
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("market_movers", data)
        self.assertIn("market_mover_tabs", data)
        mock_build.assert_called_once()
        _args, kwargs = mock_build.call_args
        self.assertEqual(kwargs.get("block_region"), "ASIA")


@override_settings(CACHES={"default": {"BACKEND": "django.core.cache.backends.dummy.DummyCache"}})
class AlpacaBarsClientTests(SimpleTestCase):
    """Unit tests for ``fetch_recent_stock_bars`` (no live Alpaca calls)."""

    def test_empty_bars_map_returns_empty_list(self):
        mock_resp = Mock(ok=True)
        mock_resp.text = '{"bars":{}}'
        mock_resp.json.return_value = {"bars": {}}
        mock_sess = Mock()
        mock_sess.get.return_value = mock_resp
        bars, err = fetch_recent_stock_bars(
            "AAPL", limit=5, key_id="kid", secret="sec", session=mock_sess
        )
        self.assertEqual(bars, [])
        self.assertIsNone(err)

    def test_missing_bars_includes_api_message_in_error(self):
        mock_resp = Mock(ok=True)
        mock_resp.text = '{"message":"subscription required"}'
        mock_resp.json.return_value = {"message": "subscription required"}
        mock_sess = Mock()
        mock_sess.get.return_value = mock_resp
        bars, err = fetch_recent_stock_bars(
            "AAPL", limit=5, key_id="kid", secret="sec", session=mock_sess
        )
        self.assertEqual(bars, [])
        self.assertIsNotNone(err)
        self.assertIn("unexpected response shape", err)
        self.assertIn("subscription required", err)

    def test_bars_request_includes_end_sort_desc_and_adjustment(self):
        mock_resp = Mock(ok=True)
        mock_resp.text = '{"bars":{"AAPL":[]}}'
        mock_resp.json.return_value = {"bars": {"AAPL": []}}
        mock_sess = Mock()
        mock_sess.get.return_value = mock_resp
        with patch.dict(os.environ, {"ALPACA_BARS_ADJUSTMENT": "split"}, clear=False):
            fetch_recent_stock_bars("AAPL", limit=5, key_id="kid", secret="sec", session=mock_sess)
        params = mock_sess.get.call_args[1]["params"]
        self.assertEqual(params["sort"], "desc")
        self.assertEqual(params["adjustment"], "split")
        self.assertEqual(params["limit"], 5)
        self.assertIn("start", params)
        self.assertIn("end", params)

    def test_bars_request_omits_adjustment_when_none(self):
        mock_resp = Mock(ok=True)
        mock_resp.text = '{"bars":{"AAPL":[]}}'
        mock_resp.json.return_value = {"bars": {"AAPL": []}}
        mock_sess = Mock()
        mock_sess.get.return_value = mock_resp
        with patch.dict(os.environ, {"ALPACA_BARS_ADJUSTMENT": "none"}, clear=False):
            fetch_recent_stock_bars("AAPL", limit=5, key_id="kid", secret="sec", session=mock_sess)
        params = mock_sess.get.call_args[1]["params"]
        self.assertNotIn("adjustment", params)

    def test_bars_reversed_to_chronological_order(self):
        mock_resp = Mock(ok=True)
        mock_resp.text = "{}"
        mock_resp.json.return_value = {
            "bars": {
                "AAPL": [
                    {"t": "2024-01-05T05:00:00Z", "o": 3, "h": 3, "l": 3, "c": 3, "v": 100},
                    {"t": "2024-01-04T05:00:00Z", "o": 2, "h": 2, "l": 2, "c": 2, "v": 100},
                    {"t": "2024-01-03T05:00:00Z", "o": 1, "h": 1, "l": 1, "c": 1, "v": 100},
                ],
            }
        }
        mock_sess = Mock()
        mock_sess.get.return_value = mock_resp
        bars, err = fetch_recent_stock_bars(
            "AAPL", limit=3, key_id="kid", secret="sec", session=mock_sess
        )
        self.assertIsNone(err)
        self.assertEqual(len(bars), 3)
        self.assertLess(bars[0]["t"], bars[1]["t"])
        self.assertLess(bars[1]["t"], bars[2]["t"])
        self.assertEqual(bars[0]["c"], 1.0)
        self.assertEqual(bars[2]["c"], 3.0)


class SitemapAndRobotsTests(WagtailPageTestCase):
    """XML sitemap index/sections and robots.txt for search engines."""

    def setUp(self):
        root_page = Page.get_first_root_node()
        Site.objects.update_or_create(
            hostname="testserver",
            defaults={"root_page": root_page, "is_default_site": True},
        )
        self.homepage = HomePage.objects.filter(slug="home").first()
        if self.homepage is None:
            self.homepage = HomePage(title="Home", slug="home")
            root_page.add_child(instance=self.homepage)
        if not self.homepage.live:
            self.homepage.save_revision().publish()

    def test_sitemap_index_lists_sections(self):
        response = self.client.get("/sitemap.xml")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/xml")
        content = response.content.decode()
        self.assertIn("sitemap-pages.xml", content)
        self.assertIn("sitemap-static.xml", content)

    def test_sitemap_pages_includes_home(self):
        response = self.client.get("/sitemap-pages.xml")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/xml")
        content = response.content.decode()
        self.assertIn(f"/{self.homepage.slug}/", content)

    def test_sitemap_static_includes_forex_ratings(self):
        response = self.client.get("/sitemap-static.xml")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/xml")
        self.assertIn("/rating/forex/", response.content.decode())

    def test_robots_txt_points_at_sitemap(self):
        response = self.client.get("/robots.txt")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "text/plain; charset=utf-8")
        content = response.content.decode()
        self.assertIn("User-agent: *", content)
        self.assertIn("Allow: /", content)
        self.assertIn("Sitemap:", content)
        self.assertIn("sitemap.xml", content)


class BrokerRatingUpdateTests(WagtailPageTestCase):
    def setUp(self):
        root_page = Page.get_first_root_node()
        self.homepage = (
            HomePage.objects.child_of(root_page).filter(slug="home").first()
            or HomePage.objects.filter(slug="home").first()
        )
        if self.homepage is None:
            self.homepage = HomePage(title="Home")
            root_page.add_child(instance=self.homepage)
        self.homepage.save_revision().publish()
        site = Site.objects.filter(is_default_site=True).first()
        if site:
            Site.objects.filter(pk=site.pk).update(
                hostname="testserver",
                port=80,
                root_page_id=self.homepage.pk,
            )
        else:
            Site.objects.create(
                hostname="testserver",
                port=80,
                root_page=self.homepage,
                is_default_site=True,
            )
        User = get_user_model()
        self.staff_user = User.objects.create_user(
            username="broker-staff",
            password="pass12345",
            is_staff=True,
        )
        self.non_staff = User.objects.create_user(
            username="broker-user",
            password="pass12345",
        )
        self.broker = BrokerRating.objects.create(
            rank=1,
            broker_name="Test Broker",
            overall_rating=Decimal("4.0"),
            reviews=10,
            broker_type="Broker",
            regulation="FCA",
            min_deposit=100,
            leverage="1:500",
        )

    def _broker_payload(self, **overrides):
        base = {
            "rank": self.broker.rank,
            "broker_name": self.broker.broker_name,
            "favicon_url": "",
            "overall_rating": 4.5,
            "reviews": self.broker.reviews,
            "broker_type": self.broker.broker_type,
            "regulation": self.broker.regulation,
            "min_deposit": self.broker.min_deposit,
            "leverage": self.broker.leverage,
            "website": "",
            "best_for": "",
        }
        base.update(overrides)
        return base

    def test_broker_rating_update_requires_staff(self):
        self.client.force_login(self.non_staff)
        response = self.client.post(
            reverse("broker_rating_update", kwargs={"pk": self.broker.pk}),
            data=json.dumps(self._broker_payload()),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 302)

    def test_broker_rating_update_anonymous_redirects(self):
        response = self.client.post(
            reverse("broker_rating_update", kwargs={"pk": self.broker.pk}),
            data=json.dumps(self._broker_payload()),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 302)

    def test_broker_rating_update_staff_succeeds(self):
        self.client.force_login(self.staff_user)
        response = self.client.post(
            reverse("broker_rating_update", kwargs={"pk": self.broker.pk}),
            data=json.dumps(self._broker_payload(overall_rating=4.5)),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"ok": True})
        self.broker.refresh_from_db()
        self.assertEqual(float(self.broker.overall_rating), 4.5)

    def test_broker_rating_update_coerces_float_precision(self):
        """JSON floats like 4.900000000000001 must not fail decimal_places=1 validation."""
        self.client.force_login(self.staff_user)
        response = self.client.post(
            reverse("broker_rating_update", kwargs={"pk": self.broker.pk}),
            data=json.dumps(self._broker_payload(overall_rating=4.900000000000001)),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.broker.refresh_from_db()
        self.assertEqual(float(self.broker.overall_rating), 4.9)

    def test_broker_country_rating_update_staff_succeeds(self):
        country, _ = Country.objects.get_or_create(code="US", defaults={"name": "United States"})
        self.client.force_login(self.staff_user)
        response = self.client.post(
            reverse("broker_rating_update", kwargs={"pk": self.broker.pk}) + "?country=US",
            data=json.dumps({"overall_rating": 3.5, "rank": 2}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"ok": True})
        self.broker.refresh_from_db()
        self.assertEqual(float(self.broker.overall_rating), 4.0)
        override = self.broker.country_ratings.get(country=country)
        self.assertEqual(float(override.overall_rating), 3.5)
        self.assertEqual(override.rank, 2)

    def test_forex_ratings_hides_staff_edit_attrs_for_anonymous(self):
        response = self.client.get(reverse("forex_ratings"))
        self.assertEqual(response.status_code, 200)
        html = response.content.decode()
        self.assertNotIn("data-broker-is-admin", html)
        self.assertNotIn("data-broker-update-url", html)

    def test_forex_ratings_shows_staff_edit_attrs_for_staff(self):
        self.client.force_login(self.staff_user)
        response = self.client.get(reverse("forex_ratings"))
        self.assertEqual(response.status_code, 200)
        html = response.content.decode()
        self.assertIn('data-broker-is-admin="1"', html)
        self.assertIn("data-broker-update-url", html)


class SwingSetupsViewTests(WagtailPageTestCase):
    """Swing setups page reads crawler DB via home.crawler_setups (mocked)."""

    def setUp(self):
        super().setUp()
        self.setups = [
            {
                "id": 10,
                "symbol": "BE",
                "setup_type": "continuation",
                "direction": "long",
                "confluence": "M:up W:up D:up",
                "score": "high",
                "trigger_text": "Pullback near EMA20",
                "invalidation": "Below swing low",
                "t1": 305.9,
                "t2": 351.2,
                "rr": 1.3,
                "notes": "Test notes",
                "stock_name": "Bloom Energy",
                "sector": "Industrials",
                "industry": None,
                "last_price_formatted": "302.59",
                "percent_change_formatted": "+1.2%",
                "percent_change_class": "is-up",
                "day_volume_formatted": "1.2M",
                "news_headline": "Oracle deal",
                "news_url": "https://example.com/news",
                "ticker_href": "",
            }
        ]

    @patch("home.setup_views.fetch_setups_for_run")
    @patch("home.setup_views.latest_scan_run_id", return_value=2)
    def test_swing_setups_renders_mount_and_json(
        self, _mock_latest_run, mock_fetch_setups
    ):
        mock_fetch_setups.return_value = [
            {
                "id": 10,
                "symbol": "BE",
                "setup_type": "continuation",
                "direction": "long",
                "confluence": "M:up W:up D:up",
                "score": "high",
                "trigger_text": "Pullback",
                "invalidation": None,
                "t1": 300.0,
                "t2": 350.0,
                "rr": 1.2,
                "notes": "Notes",
                "stock_name": None,
                "sector": "Industrials",
                "industry": None,
                "last_price_formatted": "100.00",
                "percent_change_formatted": "—",
                "percent_change_class": "is-neutral",
                "day_volume_formatted": "",
                "news_headline": None,
                "news_url": None,
            }
        ]
        response = self.client.get(reverse("swing_setups"))
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, "home/swing_setups.html")
        html = response.content.decode()
        self.assertIn("data-shadcn-swing-setups", html)
        self.assertIn("data-stock-bars-preview-url", html)
        self.assertNotIn("swing-setups-runs-data", html)
        self.assertIn("swing-setups-rows-data", html)
        self.assertIn('"symbol": "BE"', html)
        mock_fetch_setups.assert_called_once_with(2)

    @patch("home.setup_views.fetch_setups_for_run")
    @patch("home.setup_views.latest_scan_run_id", return_value=1)
    def test_swing_setups_uses_latest_scan_run(
        self, _mock_latest_run, mock_fetch_setups
    ):
        mock_fetch_setups.return_value = self.setups
        response = self.client.get(reverse("swing_setups"))
        self.assertEqual(response.status_code, 200)
        mock_fetch_setups.assert_called_once_with(1)


class ContentTagCreateApiTests(WagtailPageTestCase):
    def setUp(self):
        User = get_user_model()
        self.staff = User.objects.create_user(
            username="tag-api-staff",
            password="pass12345",
            is_staff=True,
        )
        self.client.force_login(self.staff)
        ContentTag.objects.create(name="Legacy empty slug")
        ContentTag.objects.filter(name="Legacy empty slug").update(slug="")

    def test_post_tags_assigns_unique_slug(self):
        response = self.client.post(
            "/api/articles/tags/",
            data=json.dumps({"name": "Saxo Bank"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertTrue(body.get("created"))
        self.assertEqual(body.get("slug"), "saxo-bank")
        tag = ContentTag.objects.get(pk=body["id"])
        self.assertEqual(tag.slug, "saxo-bank")

    def test_post_tags_after_legacy_empty_slug_row(self):
        response = self.client.post(
            "/api/articles/tags/",
            data=json.dumps({"name": "Another Tag"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201)
        tag = ContentTag.objects.get(name="Another Tag")
        self.assertTrue(tag.slug)


class BrokerTaggedArticlesTests(WagtailPageTestCase):
    def setUp(self):
        from home.broker_card import tagged_articles_for_broker

        self.tagged_articles_for_broker = tagged_articles_for_broker

        root_page = Page.get_first_root_node()
        self.homepage = (
            HomePage.objects.child_of(root_page).filter(slug="home").first()
            or HomePage.objects.filter(slug="home").first()
        )
        if self.homepage is None:
            self.homepage = HomePage(title="Home")
            root_page.add_child(instance=self.homepage)
        self.homepage.save_revision().publish()
        site = Site.objects.filter(is_default_site=True).first()
        if site:
            Site.objects.filter(pk=site.pk).update(
                hostname="testserver",
                port=80,
                root_page_id=self.homepage.pk,
            )
        else:
            Site.objects.create(
                hostname="testserver",
                port=80,
                root_page=self.homepage,
                is_default_site=True,
            )

        self.energy = TaxonomyTerm.objects.get(slug="energy")
        self.broker = BrokerRating.objects.create(
            rank=1,
            broker_name="SAXO",
            overall_rating=Decimal("4.5"),
            reviews=100,
            broker_type="Broker",
            regulation="FCA",
            min_deposit=0,
            leverage="1:30",
        )
        self.broker_tag = ContentTag.objects.create(name="SAXO", slug="saxo")
        self.broker_article = TaggedContentPage(
            title="Saxo outlook",
            slug="saxo-outlook",
            section_term=self.energy,
            lede="Broker tagged piece",
        )
        self.homepage.add_child(instance=self.broker_article)
        self.broker_article.save()
        self.broker_article.tags.add(self.broker_tag)
        self.broker_article.save_revision().publish()

    def test_tagged_articles_for_broker_matches_tag_name(self):
        articles = self.tagged_articles_for_broker(self.broker)
        self.assertEqual(len(articles), 1)
        self.assertEqual(articles[0].pk, self.broker_article.pk)

    def test_tagged_articles_for_saxo_bank_matches_saxo_slug_tag(self):
        bank = BrokerRating.objects.create(
            rank=3,
            broker_name="Saxo Bank",
            slug="saxo-bank-carousel-test",
            overall_rating=Decimal("4.5"),
            reviews=10,
            broker_type="Broker",
            regulation="FCA",
            min_deposit=0,
            leverage="1:30",
        )
        article = TaggedContentPage(
            title="Saxo Bank piece",
            slug="saxo-bank-piece",
            section_term=self.energy,
            lede="Tagged Saxo",
        )
        self.homepage.add_child(instance=article)
        article.save()
        article.tags.add(self.broker_tag)
        article.save_revision().publish()
        articles = self.tagged_articles_for_broker(bank)
        article_ids = {a.pk for a in articles}
        self.assertIn(article.pk, article_ids)
        self.assertGreaterEqual(len(articles), 1)

    def test_forex_broker_detail_renders_article_carousel(self):
        self.broker.website = "https://www.saxo.com"
        self.broker.save(update_fields=["website"])
        response = self.client.get(
            reverse("forex_broker_detail", kwargs={"slug": self.broker.slug})
        )
        self.assertEqual(response.status_code, 200)
        html = response.content.decode()
        self.assertIn("data-shadcn-article-carousel", html)
        self.assertIn("forex-broker-articles-carousel", html)
        self.assertIn("Saxo outlook", html)
        self.assertIn("https://www.saxo.com", html)
        self.assertLess(html.index("Broker profile"), html.index("Related articles"))

    def test_forex_broker_detail_omits_carousel_without_tagged_articles(self):
        other = BrokerRating.objects.create(
            rank=2,
            broker_name="No Articles Broker",
            overall_rating=Decimal("3.0"),
            reviews=1,
            broker_type="Broker",
            regulation="—",
            min_deposit=0,
            leverage="1:10",
        )
        response = self.client.get(
            reverse("forex_broker_detail", kwargs={"slug": other.slug})
        )
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("data-shadcn-article-carousel", response.content.decode())

