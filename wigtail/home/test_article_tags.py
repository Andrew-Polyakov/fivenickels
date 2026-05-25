"""Tests for article tag badge payloads."""

from __future__ import annotations

from django.test import SimpleTestCase

from home.article_tags import build_tag_archive_href


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
