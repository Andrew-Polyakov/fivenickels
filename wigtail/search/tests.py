from django.urls import reverse

from home.models import HomePage, TaggedContentPage, TaxonomyTerm
from wagtail.models import Page, Site
from wagtail.test.utils import WagtailPageTestCase


class SearchSuggestApiTests(WagtailPageTestCase):
    def setUp(self):
        super().setUp()
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
        TaxonomyTerm.objects.filter(pk=self.energy.pk).update(is_visible=True)

        self.article = TaggedContentPage(
            title="Energy unique xyzzy headline",
            slug="energy-xyzzy-search-test",
            section_term=self.energy,
            tile_preview="Preview xyzzy unique token for search snippet.",
        )
        self.homepage.add_child(instance=self.article)
        self.article.save_revision().publish()

    def test_suggest_rejects_post(self):
        r = self.client.post(reverse("search_suggest"), {"q": "test"})
        self.assertEqual(r.status_code, 405)

    def test_suggest_short_query_empty(self):
        r = self.client.get(reverse("search_suggest"), {"q": "a"})
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data["total"], 0)
        self.assertEqual(data["results"], [])

    def test_suggest_finds_pages_and_includes_marks(self):
        r = self.client.get(reverse("search_suggest"), {"q": "xyzzy"})
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertGreaterEqual(data["total"], 1)
        self.assertTrue(data["results"])
        first = data["results"][0]
        self.assertIn("title_html", first)
        self.assertIn("url", first)
        self.assertIn("<mark", first["title_html"])
        self.assertIn("search-hit", first["title_html"])

    def test_suggest_returns_at_most_three(self):
        r = self.client.get(reverse("search_suggest"), {"q": "xyzzy"})
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertLessEqual(len(data["results"]), 3)
        if data["total"] > 0:
            self.assertEqual(len(data["results"]), min(3, data["total"]))

    def test_search_page_empty_shows_google_fallback(self):
        r = self.client.get(reverse("search"), {"query": "sdf-nonexistent-xyz"})
        self.assertEqual(r.status_code, 200)
        self.assertNotContains(r, "No results found")
        self.assertContains(r, "google.com/search?q=")
        self.assertContains(r, "search-results__google-fallback")
        self.assertContains(r, "on Google")
