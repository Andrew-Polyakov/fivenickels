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
        self.assertContains(r, "featured-category-chips")

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
        r_frame = self.client.get(url, HTTP_TURBO_FRAME="site-nav")
        self.assertEqual(r_frame.status_code, 200)
        self.assertContains(r_frame, '<turbo-frame id="site-nav"')
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
