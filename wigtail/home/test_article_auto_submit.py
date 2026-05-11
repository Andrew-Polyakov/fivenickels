"""Tests for automated article submission API and helpers."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from django.test import override_settings
from django.urls import reverse
from wagtail.models import Page, Site
from wagtail.test.utils import WagtailPageTestCase

from home.article_auto_submit import (
    build_markdown_body,
    build_paragraph_stream_body,
    submit_articles_batch,
)
from home.models import HomePage, TaggedContentPage, TaxonomyTerm


@override_settings(ARTICLE_SUBMIT_BEARER_TOKEN="test-token-secret")
class ArticleAutoSubmitAPITests(WagtailPageTestCase):
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

        self.section = TaxonomyTerm.objects.get(slug="information-technology")
        self.url = reverse("article-auto-submit")

    def _post(self, payload, token: str | None = "test-token-secret"):
        headers = {}
        if token is not None:
            headers["HTTP_AUTHORIZATION"] = f"Bearer {token}"
        return self.client.post(
            self.url,
            data=json.dumps(payload),
            content_type="application/json",
            **headers,
        )

    def test_requires_bearer_token(self):
        response = self._post({"articles": []}, token=None)
        self.assertEqual(response.status_code, 403)

    def test_rejects_invalid_token(self):
        response = self._post({"articles": []}, token="wrong-token")
        self.assertEqual(response.status_code, 403)

    def test_creates_draft_submitted_for_moderation(self):
        source_url = "https://example.com/news/auto-submit-1"
        response = self._post(
            {
                "articles": [
                    {
                        "title": "Auto headline",
                        "summary": "Summary line.",
                        "content": "Body text.",
                        "canonical_url": source_url,
                        "section_slug": self.section.slug,
                        "tags": ["NVDA"],
                        "seo_title": "Auto SEO title",
                        "search_description": "Auto SEO description.",
                        "catalyst": "Bullish",
                    }
                ]
            }
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["created"], 1)
        self.assertEqual(body["failed"], 0)

        page = TaggedContentPage.objects.get(pk=body["results"][0]["id"])
        self.assertFalse(page.live)
        self.assertTrue(page.awaiting_moderation)
        self.assertEqual(page.section_term_id, self.section.pk)
        self.assertEqual(page.seo_title, "Auto SEO title")
        self.assertEqual(page.search_description, "Auto SEO description.")
        self.assertEqual(page.catalyst, "Bullish")
        self.assertIsNotNone(page.get_latest_revision())
        self.assertTrue(
            page.canonical_url.startswith("http://testserver/")
            or page.canonical_url == source_url
        )
        block_types = [block.block_type for block in page.body]
        self.assertIn("paragraph", block_types)
        self.assertNotIn("markdown", block_types)
        self.assertIn("Body text.", str(page.body[0].value))

    def test_skips_duplicate_canonical_url(self):
        source_url = "https://example.com/news/auto-submit-dup"
        first = self._post(
            {
                "articles": [
                    {
                        "title": "First",
                        "summary": "One",
                        "canonical_url": source_url,
                        "section_slug": self.section.slug,
                    }
                ]
            }
        )
        self.assertEqual(first.status_code, 200)
        second = self._post(
            {
                "articles": [
                    {
                        "title": "Second",
                        "summary": "Two",
                        "canonical_url": source_url,
                        "section_slug": self.section.slug,
                    }
                ]
            }
        )
        self.assertEqual(second.status_code, 200)
        body = second.json()
        self.assertEqual(body["created"], 0)
        self.assertEqual(body["skipped"], 1)
        self.assertEqual(TaggedContentPage.objects.count(), 1)


class ArticleAutoSubmitHelperTests(WagtailPageTestCase):
    def test_build_paragraph_stream_body_uses_paragraph_blocks(self):
        blocks = build_paragraph_stream_body(
            content="Main body",
            summary="",
            source="Example Wire",
            url="https://example.com/story",
        )
        self.assertGreaterEqual(len(blocks), 2)
        self.assertTrue(all(block_type == "paragraph" for block_type, _ in blocks))
        self.assertIn("Main body", str(blocks[0][1]))
        self.assertIn("Example Wire", str(blocks[-1][1]))

    def test_build_markdown_body_includes_attribution(self):
        md = build_markdown_body(
            content="Main body",
            summary="",
            source="Example Wire",
            url="https://example.com/story",
        )
        self.assertIn("Main body", md)
        self.assertIn("Example Wire", md)
        self.assertIn("https://example.com/story", md)

    def test_submit_articles_batch_reports_failed_without_url(self):
        summary = submit_articles_batch([{"title": "No URL"}])
        self.assertEqual(summary["failed"], 1)
        self.assertEqual(summary["results"][0]["status"], "failed")


class SubmitArticleCliTests(WagtailPageTestCase):
    def test_dry_run_maps_stock_crawler_json(self):
        repo_root = Path(__file__).resolve().parents[2]
        cli = repo_root / "tools" / "submit-article"
        payload = {
            "mode": "news",
            "tickers": [
                {
                    "symbol": "NVDA",
                    "alpacNews": [
                        {
                            "headline": "Chip rally",
                            "summary": "NVDA moved higher.",
                            "content": "Details here.",
                            "source": "Example",
                            "url": "https://example.com/nvda-1",
                            "symbols": ["NVDA"],
                            "tags": ["semiconductor"],
                        }
                    ],
                }
            ],
        }
        input_path = repo_root / "tools" / ".test-stock-crawler-output.json"
        input_path.write_text(json.dumps(payload), encoding="utf-8")
        try:
            proc = subprocess.run(
                [
                    sys.executable,
                    str(cli),
                    "--input-file",
                    str(input_path),
                    "--dry-run",
                ],
                capture_output=True,
                text=True,
                check=False,
                cwd=str(repo_root),
            )
        finally:
            input_path.unlink(missing_ok=True)

        self.assertEqual(proc.returncode, 0, msg=proc.stderr)
        data = json.loads(proc.stdout)
        self.assertTrue(data.get("dry_run"))
        self.assertEqual(data.get("count"), 1)
        article = data["articles"][0]
        self.assertEqual(article["canonical_url"], "https://example.com/nvda-1")
        self.assertIn("NVDA", article["symbols"])
