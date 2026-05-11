from home.models import (
    CareersPage,
    ContentTag,
    CookiesPolicyPage,
    HomePage,
    MarketTickerRow,
    SubsectionIndexPage,
    TaggedContentPage,
    TaxonomyTerm,
)
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from django.utils.crypto import get_random_string

from home.blocks import _resolve_section_term, _resolve_universal_tile_state
from home.card_layout import build_layout_payload, serialize_article_card_for_related
from home.navigation import normalize_sector_query_param
from home.query import (
    _section_term_ids_for_taxonomy_scope,
    build_home_page_display_items,
    featured_quad_pages_for_sector,
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
            tile_preview="Preview **one**",
        )
        self.homepage.add_child(instance=self.page_e1)
        self.page_e1.save()
        self.page_e1.tags.add(self.tag_alpha, self.tag_beta)
        self.page_e1.save_revision().publish()

        self.page_e2 = TaggedContentPage(
            title="Energy two",
            slug="energy-two",
            section_term=self.energy,
            tile_preview="Preview two",
        )
        self.homepage.add_child(instance=self.page_e2)
        self.page_e2.save()
        self.page_e2.tags.add(self.tag_alpha, self.tag_beta, self.tag_gamma)
        self.page_e2.save_revision().publish()

        self.page_m1 = TaggedContentPage(
            title="Materials one",
            slug="materials-one",
            section_term=self.materials,
            tile_preview="Mat preview",
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
                        "section_term": self.energy,
                        "mode": "manual_article",
                        "manual_page": self.page_e2,
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
            tile_preview="p",
        )
        self.homepage.add_child(instance=page_nv)
        page_nv.tags.add(tag_nvda)
        page_nv.save_revision().publish()
        rel = get_related_pages_for_ticker("nvda", limit=10)
        self.assertEqual(len(rel), 1)
        self.assertEqual(rel[0].slug, "nvda-headline")

    def test_ticker_detail_404_without_carousel_row(self):
        url = reverse("ticker_page", kwargs={"ticker_slug": "nvda"})
        r = self.client.get(url)
        self.assertEqual(r.status_code, 404)

    def test_ticker_detail_renders_related_news(self):
        MarketTickerRow.objects.create(symbol="NVDA", enabled=True, sort_order=0)
        tag_nvda = ContentTag.objects.create(name="NVDA", slug="nvda")
        page_nv = TaggedContentPage(
            title="Chip sector update",
            slug="chip-sector-update",
            section_term=self.energy,
            tile_preview="prev",
        )
        self.homepage.add_child(instance=page_nv)
        page_nv.tags.add(tag_nvda)
        page_nv.save_revision().publish()
        url = reverse("ticker_page", kwargs={"ticker_slug": "nvda"})
        r = self.client.get(url)
        self.assertEqual(r.status_code, 200)
        self.assertTemplateUsed(r, "home/ticker_page.html")
        self.assertContains(r, "Chip sector update")
        self.assertContains(r, "NASDAQ:NVDA")

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
                tile_preview=f"Preview **fin-{i}**",
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
            ("separator", {"orientation": "vertical"}),
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
            tile_preview="guard",
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
            tile_preview="a",
        )
        self.homepage.add_child(instance=page_a)
        page_a.save_revision().publish()

        page_b = TaggedContentPage(
            title="Beta Story",
            slug="beta-story",
            section_term=self.energy,
            tile_preview="b",
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

    def test_profile_staff_exposes_article_create_url(self):
        self.client.force_login(self.admin_user)
        response = self.client.get(reverse("profile"))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, f'data-create-article-url="{reverse("article_create")}"')

    def test_create_article_creates_draft_and_redirects_to_editor(self):
        self.client.force_login(self.admin_user)
        existing_ids = set(TaggedContentPage.objects.values_list("id", flat=True))

        response = self.client.post(reverse("article_create"))

        self.assertEqual(response.status_code, 302)
        created = TaggedContentPage.objects.exclude(id__in=existing_ids).get()
        self.assertRedirects(response, reverse("article_editor", kwargs={"article_id": created.pk}))
        self.assertEqual(created.get_parent().pk, self.homepage.pk)
        self.assertFalse(created.live)

    def test_staff_homepage_renders_inline_chip_delete_controls(self):
        self.client.force_login(self.admin_user)
        response = self.client.get(self.homepage.url)
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "data-taxonomy-chip-widget")
        self.assertContains(response, 'data-can-edit="1"')
        self.assertContains(response, "data-create-url")
        self.assertContains(response, "data-delete-url")
        self.assertContains(response, "data-rename-url")
        self.assertContains(response, "data-after-create-visit=")

    def _seed_taxonomy_card_widget(self, slug="market-news"):
        term = TaxonomyTerm.objects.get(slug=slug)
        u = get_random_string(6)
        article = TaggedContentPage(
            title="Taxonomy card fixture",
            slug=f"taxonomy-card-fixture-{u}",
            section_term=self.energy,
            tile_preview="pv",
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
            tile_preview="Direct hub story",
        )
        self.homepage.add_child(instance=direct)
        direct.save_revision().publish()
        pages, _ = featured_quad_pages_for_sector(
            mnews, None, home_page=self.homepage
        )
        self.assertTrue(
            any(p is not None and p.pk == direct.pk for p in pages),
        )

    def test_inline_search_random_market_news_includes_direct_container_articles(self):
        from home.taxonomy import MARKET_NEWS_SLUG

        mnews = TaxonomyTerm.objects.get(slug=MARKET_NEWS_SLUG)
        direct = TaggedContentPage(
            title="Market News random fixture",
            slug=f"market-news-random-{get_random_string(5)}",
            section_term=mnews,
            tile_preview="Random hydrate story",
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
        payload = serialize_article_card_for_related(self.page_high, None)
        self.assertEqual(payload.get("kind"), "article")
        self.assertEqual(payload.get("authorName"), "Custom Desk")
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

