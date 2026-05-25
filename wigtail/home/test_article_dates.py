"""Tests for article dateline formatting."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone as dt_timezone
from unittest.mock import patch

from django.test import SimpleTestCase

from home.article_dates import format_article_dateline_et, format_relative_dateline_label


class FormatArticleDatelineEtTests(SimpleTestCase):
    def test_formats_us_eastern_with_weekday_and_tz(self):
        dt = datetime(2026, 5, 22, 19, 34, tzinfo=dt_timezone.utc)
        display, iso = format_article_dateline_et(dt)
        self.assertIn("Fri", display)
        self.assertIn("May", display)
        self.assertIn("22", display)
        self.assertIn("2026", display)
        self.assertIn("PM", display)
        self.assertTrue("EDT" in display or "EST" in display)
        self.assertIsNotNone(iso)
        self.assertIn("2026-05-22", iso)

    def test_none_returns_none_pair(self):
        self.assertEqual(format_article_dateline_et(None), (None, None))


class FormatRelativeDatelineLabelTests(SimpleTestCase):
    def test_none_returns_none(self):
        self.assertIsNone(format_relative_dateline_label("Updated", None))

    @patch("home.article_dates.timezone.now")
    def test_hours_ago(self, mock_now):
        now = datetime(2026, 5, 25, 12, 0, tzinfo=dt_timezone.utc)
        mock_now.return_value = now
        dt = now - timedelta(hours=4)
        self.assertEqual(format_relative_dateline_label("Updated", dt), "Updated 4 hr ago")

    @patch("home.article_dates.timezone.now")
    def test_last_year(self, mock_now):
        now = datetime(2026, 5, 25, 12, 0, tzinfo=dt_timezone.utc)
        mock_now.return_value = now
        dt = now - timedelta(days=400)
        self.assertEqual(format_relative_dateline_label("Updated", dt), "Updated last year")

    @patch("home.article_dates.timezone.now")
    def test_just_now(self, mock_now):
        now = datetime(2026, 5, 25, 12, 0, tzinfo=dt_timezone.utc)
        mock_now.return_value = now
        self.assertEqual(format_relative_dateline_label("Published", now), "Published just now")
