"""
Fill SubsectionIndexPage ``intro`` with ``card`` StreamField blocks pointing at random
published TaggedContentPage rows in that sector.

Usage (from wigtail/):

  python manage.py populate_subsection_tiles
  python manage.py populate_subsection_tiles --sectors energy financials --count 4
  python manage.py populate_subsection_tiles --dry-run
"""

from __future__ import annotations

import argparse
import random

from django.core.management.base import BaseCommand
from django.utils.html import escape
from wagtail.rich_text import RichText

from home.gics_sectors import GICS_SECTORS
from home.models import HomePage, SubsectionIndexPage, TaggedContentPage, TaxonomyTerm

DEFAULT_SECTORS = ("energy", "financials", "information-technology")


def _sector_display_name(slug: str) -> str:
    for name, s in GICS_SECTORS:
        if s == slug:
            return name
    return slug.replace("-", " ").title()


class Command(BaseCommand):
    help = (
        "Populate subsection hub intros with shadcn-style article cards linking to "
        "random articles from each sector."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--sectors",
            nargs="+",
            default=list(DEFAULT_SECTORS),
            metavar="SLUG",
            help=(
                "TaxonomyTerm slugs (default: energy financials information-technology)."
            ),
        )
        parser.add_argument(
            "--count",
            type=int,
            default=6,
            help="Maximum number of random articles per subsection (default 6).",
        )
        parser.add_argument(
            "--seed",
            type=int,
            default=None,
            help="Optional RNG seed for reproducible picks.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Print actions without saving.",
        )
        parser.add_argument(
            "--create-missing-hubs",
            action=argparse.BooleanOptionalAction,
            default=True,
            help=(
                "Create a SubsectionIndexPage under the home page when none exists "
                "(default: --create-missing-hubs). Use --no-create-missing-hubs to disable."
            ),
        )

    def handle(self, *args, **options):
        sector_slugs: list[str] = options["sectors"]
        count = max(1, options["count"])
        seed = options["seed"]
        dry_run = options["dry_run"]
        create_missing_hubs = options["create_missing_hubs"]

        home = HomePage.objects.live().public().first() or HomePage.objects.first()
        if home is None:
            self.stderr.write("No HomePage found.")
            return

        if seed is not None:
            random.seed(seed)

        for sector_slug in sector_slugs:
            term = TaxonomyTerm.objects.filter(slug=sector_slug).first()
            if term is None:
                self.stderr.write(f"Unknown taxonomy slug {sector_slug!r}; skipping.")
                continue

            idx = (
                SubsectionIndexPage.objects.live()
                .public()
                .descendant_of(home)
                .filter(section_term=term)
                .first()
            )
            if idx is None and create_missing_hubs and not dry_run:
                label = _sector_display_name(sector_slug)
                hub_slug = f"sector-{sector_slug}"
                if SubsectionIndexPage.objects.filter(slug=hub_slug).exists():
                    hub_slug = f"sector-{sector_slug}-news"
                idx = SubsectionIndexPage(
                    title=f"{label} news",
                    slug=hub_slug,
                    section_term=term,
                    recent_tile_limit=12,
                    intro=[],
                )
                home.add_child(instance=idx)
                idx.save_revision().publish()
                self.stdout.write(
                    self.style.NOTICE(
                        f"Created subsection index {idx.title!r} ({idx.url}) for {sector_slug!r}."
                    )
                )
            if idx is None:
                self.stderr.write(
                    f"No SubsectionIndexPage for sector {sector_slug!r}; "
                    "use --create-missing-hubs (default) or run seed_sector_news."
                )
                continue

            qs = (
                TaggedContentPage.objects.live()
                .public()
                .descendant_of(home)
                .filter(section_term=term)
                .order_by()
            )
            pages = list(qs)
            if not pages:
                self.stderr.write(f"No published articles for {sector_slug!r}; skipping.")
                continue

            random.shuffle(pages)
            picked = pages[: min(count, len(pages))]

            intro_stream: list = [
                ("heading", {"level": "h2", "text": f"{term.name} spotlight"}),
                (
                    "paragraph",
                    RichText(
                        "<p>"
                        f"Random picks from published articles in "
                        f"<strong>{escape(term.name)}</strong>."
                        "</p>"
                    ),
                ),
            ]
            for page in picked:
                intro_stream.append(
                    (
                        "card",
                        {
                            "article": {
                                "importance": 10,
                                "section_term": term,
                                "mode": "manual_article",
                                "manual_page": page,
                            }
                        },
                    )
                )

            self.stdout.write(
                f"{sector_slug}: {len(picked)} card(s) on “{idx.title}” ({idx.url})"
            )
            if dry_run:
                continue

            idx.intro = intro_stream
            rev = idx.save_revision()
            rev.publish()
            self.stdout.write(self.style.SUCCESS(f"  Published revision for {idx.url}"))

