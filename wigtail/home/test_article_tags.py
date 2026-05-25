"""Tests for article tag badge payloads."""

from __future__ import annotations

from unittest.mock import patch

from django.test import SimpleTestCase

from home.article_tags import build_tag_archive_href, section_term_public_href
from home.taxonomy import trail_slugs_from_section_term


class _Tag:
    def __init__(self, slug: str):
        self.slug = slug


class _Home:
    url = "/home/"

    def reverse_subpage(self, name, args=None, kwargs=None):
        assert name == "tag_archive"
        slug = (args or ())[0] if args else (kwargs or {})["tag_slug"]
        return f"{self.url}tags/{slug}/"


class BuildTagArchiveHrefTests(SimpleTestCase):
    def test_none_when_no_slug(self):
        self.assertIsNone(build_tag_archive_href(_Home(), _Tag(""), "energy"))

    def test_none_when_no_routable_home(self):
        self.assertIsNone(build_tag_archive_href(None, _Tag("alpha"), None))

    def test_builds_path_with_section_query(self):
        href = build_tag_archive_href(_Home(), _Tag("alpha"), "energy")
        self.assertEqual(href, "/home/tags/alpha/?section=energy")

    def test_builds_path_without_section(self):
        href = build_tag_archive_href(_Home(), _Tag("alpha"), None)
        self.assertEqual(href, "/home/tags/alpha/")


class _Ancestor:
    def __init__(self, depth: int, slug: str):
        self.depth = depth
        self.slug = slug
        self.pk = hash(slug) % 100000


class _Term:
    def __init__(self, slug: str, *, link_page=None, ancestors=None):
        self.slug = slug
        self.link_page = link_page
        self._ancestors = [
            _Ancestor(depth, slug) if isinstance(slug, str) else _Ancestor(depth, slug)
            for depth, slug in (ancestors or [])
        ]

    def get_ancestors(self):
        class _Qs:
            def __init__(self, rows):
                self._rows = rows

            def filter(self, **kwargs):
                depth_gte = kwargs.get("depth__gte")
                if depth_gte is not None:
                    return _Qs([r for r in self._rows if r.depth >= depth_gte])
                return self

            def values_list(self, field, flat=False):
                assert field == "slug"
                return [r.slug for r in self._rows]

            def __iter__(self):
                return iter(self._rows)

        return _Qs(self._ancestors)


class SectionTermPublicHrefTests(SimpleTestCase):
    def test_none_when_missing_term_or_home(self):
        self.assertIsNone(section_term_public_href(None, _Home()))
        self.assertIsNone(section_term_public_href(_Term("energy"), None))

    def test_uses_link_page_when_set(self):
        class _Page:
            url = "/sectors/energy/"

        href = section_term_public_href(_Term("energy", link_page=_Page()), _Home())
        self.assertEqual(href, "/sectors/energy/")

    def test_builds_taxonomy_path_from_ancestors(self):
        term = _Term(
            "forex",
            ancestors=[(1, "market-news")],
        )
        with patch("home.taxonomy.taxonomy_prefix_path", return_value="/_taxonomy/"):
            href = section_term_public_href(term, object())
        self.assertEqual(href, "/_taxonomy/market-news/forex/")

    def test_trail_slugs_from_section_term_uses_ancestor_slugs(self):
        term = _Term("forex", ancestors=[(1, "market-news")])
        self.assertEqual(
            trail_slugs_from_section_term(term),
            ["market-news", "forex"],
        )
