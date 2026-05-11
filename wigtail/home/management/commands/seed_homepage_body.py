"""
Populate the live HomePage StreamField body when it is empty.

Usage (from wigtail/):

  python manage.py seed_homepage_body
  python manage.py seed_homepage_body --count 6 --force
"""

from __future__ import annotations

from django.core.management.base import BaseCommand
from django.utils.html import escape
from wagtail.rich_text import RichText

from home.models import HomePage, TaggedContentPage


class Command(BaseCommand):
    help = "Seed HomePage.body with heading, intro, and article cards when empty."

    def add_arguments(self, parser):
        parser.add_argument(
            "--count",
            type=int,
            default=6,
            help="Maximum number of article cards to add (default 6).",
        )
        parser.add_argument(
            "--force",
            action="store_true",
            help="Replace existing HomePage body blocks.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Print actions without saving.",
        )

    def handle(self, *args, **options):
        count = max(1, options["count"])
        force = options["force"]
        dry_run = options["dry_run"]

        home = HomePage.objects.live().public().first() or HomePage.objects.first()
        if home is None:
            self.stderr.write("No HomePage found.")
            return

        existing_blocks = len(home.body) if home.body is not None else 0
        if existing_blocks and not force:
            self.stdout.write(
                f"HomePage already has {existing_blocks} body block(s); "
                "use --force to replace."
            )
            return

        pages = list(
            TaggedContentPage.objects.live()
            .public()
            .descendant_of(home)
            .order_by("-first_published_at")[:count]
        )
        if not pages:
            self.stderr.write(
                "No published TaggedContentPage rows under HomePage; "
                "publish articles or run ingest_alpaca_news first."
            )
            return

        body_stream: list = [
            ("heading", {"level": "h2", "text": "Latest stories"}),
            (
                "paragraph",
                RichText(
                    "<p>"
                    "Highlights from recently published articles across the site."
                    "</p>"
                ),
            ),
        ]
        for page in pages:
            section_term = getattr(page, "section_term", None)
            body_stream.append(
                (
                    "card",
                    {
                        "article": {
                            "importance": 10,
                            "section_term": section_term,
                            "mode": "specific_article",
                            "specific_page": page,
                        }
                    },
                )
            )

        self.stdout.write(
            f"HomePage body: {len(body_stream)} block(s) "
            f"({len(pages)} card(s) from published articles)."
        )
        if dry_run:
            return

        home.body = body_stream
        rev = home.save_revision()
        rev.publish()
        self.stdout.write(self.style.SUCCESS(f"Published HomePage revision ({home.url})."))
