from home.models import (
    ContentTag,
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

from home.query import (
    get_recent_pages_for_section,
    get_related_pages_for_ticker,
    get_similar_pages,
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
        Site.objects.update_or_create(
            hostname="testsite",
            defaults={
                "port": 80,
                "root_page": self.homepage,
                "is_default_site": True,
            },
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
        r = self.client.get(self.homepage.url)
        self.assertEqual(r.status_code, 200)
        self.assertContains(r, self.energy_index.url)

    def test_home_sector_nav_hides_empty_taxonomy(self):
        """Sectors with no tagged pages and no home-stream tiles are omitted from nav."""
        r = self.client.get(self.homepage.url)
        self.assertEqual(r.status_code, 200)
        self.assertContains(r, "Energy")
        self.assertContains(r, "Materials")
        self.assertNotContains(r, "Utilities")
