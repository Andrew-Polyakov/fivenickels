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

from home.blocks import _resolve_section_term
from home.navigation import normalize_sector_query_param
from home.query import (
    build_home_page_display_items,
    featured_quad_pages_for_sector,
    get_random_pages_for_section,
    get_random_pages_for_section_prioritized,
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
        self.assertContains(r, "big-tile-quad__grid")

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

        r_all = self.client.get(self.energy_index.url)
        self.assertEqual(r_all.status_code, 200)
        self.assertContains(r_all, "Energy one")
        self.assertContains(r_all, "Energy two")

        r_cat = self.client.get(
            self.energy_index.url + "?category=energy-oil-test-cat"
        )
        self.assertEqual(r_cat.status_code, 200)
        self.assertContains(r_cat, "Energy one")
        # Recent section may still list other sector articles; quad filter is asserted below.

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
        url = taxonomy_prefix_path(self.homepage) + "market-news/"
        r = self.client.get(url)
        self.assertEqual(r.status_code, 200)
        self.assertContains(r, "Energy one")
        self.assertNotContains(r, "featured-category-chips")

    def test_tag_archive_route(self):
        url = f"{self.homepage.url}tags/alpha/"
        r = self.client.get(url)
        self.assertEqual(r.status_code, 200)
        self.assertTemplateUsed(r, "home/tag_archive.html")
        self.assertContains(r, "Energy one")
        self.assertContains(r, "Materials one")

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
        self.assertContains(r, "featured-category-quad")
        self.assertContains(r, "energy-one")
        self.assertContains(r, "site-nav__link--active", count=2)
        self.assertContains(r, 'data-turbo-frame="main"')
        self.assertNotContains(r, 'data-turbo="false"')
        r_frame = self.client.get(url, HTTP_TURBO_FRAME="site-nav")
        self.assertEqual(r_frame.status_code, 200)
        self.assertContains(r_frame, "<turbo-frame")
        self.assertContains(r_frame, 'id="site-nav"')
        self.assertContains(r_frame, 'data-turbo-frame="main"')
        self.assertNotContains(r_frame, "taxonomy-drilldown")

    def test_financials_drilldown_shows_random_tile_grid(self):
        """GICS drilldown landing renders a priority quad (four slots) for the sector."""
        from home.taxonomy import taxonomy_prefix_path

        financials = TaxonomyTerm.objects.get(slug="financials")
        TaxonomyTerm.objects.filter(pk=financials.pk).update(is_visible=True)
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

        url = taxonomy_prefix_path(self.homepage) + "market-news/financials/"
        r = self.client.get(url)
        self.assertEqual(r.status_code, 200)
        self.assertContains(r, "featured-category-quad")
        self.assertContains(r, "Fin preview 0")
        self.assertContains(r, "Fin preview 1")
        self.assertContains(r, "Fin preview 2")

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
        self.assertContains(r, "forex-strip")
        self.assertContains(r, "ticker-chip__box")

    def test_normalize_sector_query_param(self):
        self.assertEqual(normalize_sector_query_param("energy"), "energy")
        self.assertIsNone(normalize_sector_query_param("not-a-gics-slug"))
        self.assertIsNone(normalize_sector_query_param(""))

    def test_home_sector_filters_markdown_tiles(self):
        self.homepage.body = [
            (
                "markdown_tiles",
                {
                    "tiles": [
                        {
                            "title": "Energy headline",
                            "slug": "energy-headline",
                            "taxonomy": self.energy,
                            "image": None,
                            "body": "ONLY_ENERGY_MARKDOWN",
                        },
                        {
                            "title": "Materials headline",
                            "slug": "materials-headline",
                            "taxonomy": self.materials,
                            "image": None,
                            "body": "ONLY_MATERIALS_MARKDOWN",
                        },
                    ]
                },
            ),
        ]
        self.homepage.save_revision().publish()
        r = self.client.get(f"{self.homepage.url}?sector=energy")
        self.assertEqual(r.status_code, 200)
        self.assertContains(r, "ONLY_ENERGY_MARKDOWN")
        self.assertNotContains(r, "ONLY_MATERIALS_MARKDOWN")
        r_all = self.client.get(self.homepage.url)
        self.assertContains(r_all, "ONLY_ENERGY_MARKDOWN")
        self.assertContains(r_all, "ONLY_MATERIALS_MARKDOWN")
        r_bad = self.client.get(f"{self.homepage.url}?sector=invalid-sector")
        self.assertContains(r_bad, "ONLY_ENERGY_MARKDOWN")
        self.assertContains(r_bad, "ONLY_MATERIALS_MARKDOWN")

    def test_build_home_page_display_items_filters_tiles(self):
        self.homepage.body = [
            (
                "markdown_tiles",
                {
                    "tiles": [
                        {
                            "title": "A",
                            "slug": "a",
                            "taxonomy": self.energy,
                            "image": None,
                            "body": "x",
                        },
                        {
                            "title": "B",
                            "slug": "b",
                            "taxonomy": self.materials,
                            "image": None,
                            "body": "y",
                        },
                    ]
                },
            ),
        ]
        self.homepage.save_revision().publish()
        items = build_home_page_display_items(self.homepage.body, "energy")
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["mode"], "markdown_tiles")
        self.assertEqual(len(items[0]["value"].tiles), 1)
        self.assertEqual(items[0]["value"].tiles[0]["title"], "A")

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

    def test_big_tile_row_does_not_render_importance_in_html(self):
        magic = "918273645"
        self.homepage.body = [
            (
                "big_tile_row",
                {
                    "panels": [
                        [
                            (
                                "single",
                                {
                                    "importance": int(magic),
                                    "section_term": None,
                                    "mode": "manual",
                                    "manual_page": self.page_e1,
                                },
                            )
                        ]
                    ]
                },
            ),
        ]
        self.homepage.save_revision().publish()
        r = self.client.get(self.homepage.url)
        self.assertEqual(r.status_code, 200)
        self.assertContains(r, "Energy one")
        self.assertNotContains(r, magic)
        self.assertNotContains(r, "Importance (editor only)")

    def test_big_tile_row_twin_renders_two_manual_articles(self):
        self.homepage.body = [
            (
                "big_tile_row_twin",
                {
                    "left": {
                        "importance": 10,
                        "section_term": None,
                        "mode": "manual",
                        "manual_page": self.page_e1,
                    },
                    "right": {
                        "importance": 10,
                        "section_term": None,
                        "mode": "manual",
                        "manual_page": self.page_e2,
                    },
                },
            ),
        ]
        self.homepage.save_revision().publish()
        r = self.client.get(self.homepage.url)
        self.assertEqual(r.status_code, 200)
        self.assertContains(r, "Energy one")
        self.assertContains(r, "Energy two")

    def test_big_tile_row_single_renders_one_tile(self):
        self.homepage.body = [
            (
                "big_tile_row_single",
                {
                    "tile": {
                        "importance": 10,
                        "section_term": None,
                        "mode": "manual",
                        "manual_page": self.page_e1,
                    },
                },
            ),
        ]
        self.homepage.save_revision().publish()
        r = self.client.get(self.homepage.url)
        self.assertEqual(r.status_code, 200)
        self.assertContains(r, "Energy one")

    def test_big_tile_quattro_row_uses_row_grid_class(self):
        cells = [
            {"mode": "manual", "manual_page": self.page_e1},
            {"mode": "manual", "manual_page": self.page_e2},
            {"mode": "manual", "manual_page": self.page_e1},
            {"mode": "manual", "manual_page": self.page_e2},
        ]
        self.homepage.body = [
            (
                "big_tile_quattro_row",
                {
                    "importance": 10,
                    "section_term": None,
                    "cells": cells,
                },
            ),
        ]
        self.homepage.save_revision().publish()
        r = self.client.get(self.homepage.url)
        self.assertEqual(r.status_code, 200)
        self.assertContains(r, "big-tile-quattro-row__grid")

    def test_big_tile_quad_2x2_uses_quad_grid_class(self):
        cells = [
            {"mode": "manual", "manual_page": self.page_e1},
            {"mode": "manual", "manual_page": self.page_e2},
            {"mode": "manual", "manual_page": self.page_e1},
            {"mode": "manual", "manual_page": self.page_e2},
        ]
        self.homepage.body = [
            (
                "big_tile_quad_2x2",
                {
                    "importance": 10,
                    "section_term": None,
                    "cells": cells,
                },
            ),
        ]
        self.homepage.save_revision().publish()
        r = self.client.get(self.homepage.url)
        self.assertEqual(r.status_code, 200)
        self.assertContains(r, "big-tile-quad__grid")

    def test_full_width_split_hardwired_columns_hide_editor_importance(self):
        magic = "918273646"
        self.homepage.body = [
            (
                "full_width_split_row",
                {
                    "left": {
                        "content_kind": "article",
                        "article": {
                            "importance": int(magic),
                            "section_term": None,
                            "mode": "manual",
                            "manual_page": self.page_e1,
                        },
                        "rich": {},
                    },
                    "right": {
                        "content_kind": "article",
                        "article": {
                            "importance": int(magic),
                            "section_term": None,
                            "mode": "manual",
                            "manual_page": self.page_e2,
                        },
                        "rich": {},
                    },
                },
            ),
        ]
        self.homepage.save_revision().publish()
        r = self.client.get(self.homepage.url)
        self.assertEqual(r.status_code, 200)
        self.assertContains(r, "Energy one")
        self.assertContains(r, "Energy two")
        self.assertNotContains(r, magic)


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

    def _seed_taxonomy_grid_widget(self, slug="market-news"):
        term = TaxonomyTerm.objects.get(slug=slug)
        term.widgets = [
            (
                "newspaper_grid",
                {
                    "preset": "twin",
                    "layout_json": "",
                    "panes": [],
                },
            )
        ]
        term.save()
        return term

    def _seed_home_newspaper_grid(self):
        self.homepage.body = [
            (
                "newspaper_grid",
                {
                    "preset": "twin",
                    "layout_json": "",
                    "panes": [],
                },
            )
        ]
        self.homepage.save_revision().publish()

    def test_newspaper_grid_endpoints_require_staff(self):
        self._seed_home_newspaper_grid()
        self.client.force_login(self.non_admin)
        response = self.client.post(
            reverse("inline_newspaper_grid_preset"),
            data='{"page_id": %d, "page_model":"home.HomePage", "stream_field":"body", "block_index":0, "preset":"quatro"}'
            % self.homepage.pk,
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 302)

    def test_newspaper_grid_set_preset_persists_layout(self):
        self._seed_home_newspaper_grid()
        self.client.force_login(self.admin_user)
        response = self.client.post(
            reverse("inline_newspaper_grid_preset"),
            data='{"page_id": %d, "page_model":"home.HomePage", "stream_field":"body", "block_index":0, "preset":"quatro"}'
            % self.homepage.pk,
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.homepage.refresh_from_db()
        block = self.homepage.body.raw_data[0]
        self.assertEqual(block["value"]["preset"], "quatro")
        self.assertIn('"id": "left-split"', block["value"]["layout_json"])

    def test_newspaper_grid_add_and_remove_pane_content(self):
        self._seed_home_newspaper_grid()
        self.client.force_login(self.admin_user)
        add_response = self.client.post(
            reverse("inline_newspaper_grid_add"),
            data='{"page_id": %d, "page_model":"home.HomePage", "stream_field":"body", "block_index":0, "pane_id":"p1"}'
            % self.homepage.pk,
            content_type="application/json",
        )
        self.assertEqual(add_response.status_code, 200)
        self.homepage.refresh_from_db()
        panes = self.homepage.body.raw_data[0]["value"]["panes"]
        self.assertEqual(len(panes), 1)
        self.assertEqual(panes[0]["pane_id"], "p1")

        remove_response = self.client.post(
            reverse("inline_newspaper_grid_remove"),
            data='{"page_id": %d, "page_model":"home.HomePage", "stream_field":"body", "block_index":0, "pane_id":"p1"}'
            % self.homepage.pk,
            content_type="application/json",
        )
        self.assertEqual(remove_response.status_code, 200)
        self.homepage.refresh_from_db()
        panes = self.homepage.body.raw_data[0]["value"]["panes"]
        self.assertEqual(panes, [])

    def test_newspaper_grid_add_on_taxonomy_pins_manual_page_and_renders(self):
        from home.taxonomy import taxonomy_prefix_path

        self.client.force_login(self.admin_user)
        article = TaggedContentPage(
            title="Grid Pin Unique XYZ",
            slug="grid-pin-unique-xyz",
            section_term=self.energy,
            tile_preview="**pv**",
        )
        self.homepage.add_child(instance=article)
        article.save_revision().publish()

        self.energy.widgets = [
            (
                "newspaper_grid",
                {"preset": "twin", "layout_json": "", "panes": []},
            )
        ]
        self.energy.save()

        add_response = self.client.post(
            reverse("inline_newspaper_grid_add"),
            data=(
                '{"page_id": %d, "page_model":"home.TaxonomyTerm", "stream_field":"widgets", "block_index":0, "pane_id":"p1"}'
                % self.energy.pk
            ),
            content_type="application/json",
        )
        self.assertEqual(add_response.status_code, 200)
        self.energy.refresh_from_db()
        panes = self.energy.widgets.raw_data[0]["value"]["panes"]
        self.assertEqual(len(panes), 1)
        art = panes[0]["article"]
        self.assertEqual(art["mode"], "manual")
        self.assertEqual(art["manual_page"], article.pk)

        url = taxonomy_prefix_path(self.homepage) + "market-news/energy/"
        page_response = self.client.get(url)
        self.assertEqual(page_response.status_code, 200)
        self.assertContains(page_response, "Grid Pin Unique XYZ")

    def test_inline_tile_title_edit_keeps_tile_in_newspaper_grid(self):
        from home.taxonomy import taxonomy_prefix_path

        self.client.force_login(self.admin_user)
        article = TaggedContentPage(
            title="Tile Rename Alpha",
            slug="tile-rename-alpha",
            section_term=self.energy,
            tile_preview="**old**",
            tile_priority=10,
        )
        self.homepage.add_child(instance=article)
        article.save_revision().publish()

        other = TaggedContentPage(
            title="Tile Rename Beta",
            slug="tile-rename-beta",
            section_term=self.energy,
            tile_preview="**beta**",
            tile_priority=3,
        )
        self.homepage.add_child(instance=other)
        other.save_revision().publish()

        self.energy.widgets = [
            (
                "newspaper_grid",
                {"preset": "twin", "layout_json": "", "panes": []},
            )
        ]
        self.energy.save()

        r_add = self.client.post(
            reverse("inline_newspaper_grid_add"),
            data=(
                '{"page_id": %d, "page_model":"home.TaxonomyTerm", "stream_field":"widgets", "block_index":0, "pane_id":"p1"}'
                % self.energy.pk
            ),
            content_type="application/json",
        )
        self.assertEqual(r_add.status_code, 200)

        url = taxonomy_prefix_path(self.homepage) + "market-news/energy/"
        r0 = self.client.get(url)
        self.assertContains(r0, "Tile Rename Alpha")
        self.assertContains(r0, 'data-page-id="%d"' % article.pk)

        r_rename = self.client.post(
            reverse("inline_update_tile_title"),
            data='{"page_id": %d, "title":"Tile Rename Alpha Updated"}' % article.pk,
            content_type="application/json",
        )
        self.assertEqual(r_rename.status_code, 200)

        r1 = self.client.get(url)
        self.assertContains(r1, "Tile Rename Alpha Updated")
        self.assertContains(r1, 'data-page-id="%d"' % article.pk)

    def test_newspaper_grid_resize_updates_ratio(self):
        self._seed_home_newspaper_grid()
        self.client.force_login(self.admin_user)
        response = self.client.post(
            reverse("inline_newspaper_grid_resize"),
            data='{"page_id": %d, "page_model":"home.HomePage", "stream_field":"body", "block_index":0, "split_id":"root", "ratio":0.73}'
            % self.homepage.pk,
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.homepage.refresh_from_db()
        layout_json = self.homepage.body.raw_data[0]["value"]["layout_json"]
        self.assertIn('"ratio": 0.73', layout_json)

    def test_taxonomy_root_renders_newspaper_grid_when_configured(self):
        self._seed_taxonomy_grid_widget("market-news")
        url = reverse("wagtail_serve", args=["_taxonomy/"])
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "data-newspaper-grid")
        self.assertContains(response, 'data-page-model="home.TaxonomyTerm"')

    def test_taxonomy_root_staff_editable_nonstaff_readonly(self):
        self._seed_taxonomy_grid_widget("market-news")
        url = reverse("wagtail_serve", args=["_taxonomy/"])
        self.client.force_login(self.admin_user)
        staff_response = self.client.get(url)
        self.assertEqual(staff_response.status_code, 200)
        self.assertContains(staff_response, 'data-can-edit="1"')
        self.assertContains(staff_response, "data-grid-preset")

        self.client.force_login(self.non_admin)
        user_response = self.client.get(url)
        self.assertEqual(user_response.status_code, 200)
        self.assertContains(user_response, 'data-can-edit="0"')
        self.assertNotContains(user_response, "data-grid-preset")

    def test_taxonomy_drilldown_renders_newspaper_grid_when_configured(self):
        self._seed_taxonomy_grid_widget("market-news")
        url = reverse("wagtail_serve", args=["_taxonomy/market-news/"])
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "data-newspaper-grid")
        self.assertContains(response, 'data-page-model="home.TaxonomyTerm"')

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

    def test_taxonomy_drilldown_staff_sees_bootstrap_when_no_newspaper_grid(self):
        from home.taxonomy import taxonomy_prefix_path

        financials = TaxonomyTerm.objects.get(slug="financials")
        financials.widgets = []
        financials.save()
        fin_page = TaggedContentPage(
            title="Bootstrap drill fin",
            slug="bootstrap-drill-fin",
            section_term=financials,
            tile_preview="x",
        )
        self.homepage.add_child(instance=fin_page)
        fin_page.save_revision().publish()
        self.assertFalse(financials.has_newspaper_grid_widget)
        self.client.force_login(self.admin_user)
        url = taxonomy_prefix_path(self.homepage) + "market-news/financials/"
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "data-grid-bootstrap-widgets")

    def test_taxonomy_drilldown_anonymous_no_bootstrap_strip(self):
        from home.taxonomy import taxonomy_prefix_path

        financials = TaxonomyTerm.objects.get(slug="financials")
        financials.widgets = []
        financials.save()
        fin_page = TaggedContentPage(
            title="Bootstrap drill fin anon",
            slug="bootstrap-drill-fin-anon",
            section_term=financials,
            tile_preview="y",
        )
        self.homepage.add_child(instance=fin_page)
        fin_page.save_revision().publish()
        url = taxonomy_prefix_path(self.homepage) + "market-news/financials/"
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertNotContains(response, "data-grid-bootstrap-widgets")

    def test_newspaper_grid_bootstrap_taxonomy_requires_staff(self):
        financials = TaxonomyTerm.objects.get(slug="financials")
        financials.widgets = []
        financials.save()
        self.client.force_login(self.non_admin)
        response = self.client.post(
            reverse("inline_newspaper_grid_bootstrap_taxonomy"),
            data='{"page_id": %d, "page_model": "home.TaxonomyTerm"}' % financials.pk,
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 302)

    def test_newspaper_grid_bootstrap_taxonomy_appends_block(self):
        financials = TaxonomyTerm.objects.get(slug="financials")
        financials.widgets = []
        financials.save()
        self.client.force_login(self.admin_user)
        response = self.client.post(
            reverse("inline_newspaper_grid_bootstrap_taxonomy"),
            data='{"page_id": %d, "page_model": "home.TaxonomyTerm"}' % financials.pk,
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        financials.refresh_from_db()
        self.assertEqual(len(financials.widgets.raw_data), 1)
        self.assertEqual(financials.widgets.raw_data[0]["type"], "newspaper_grid")
