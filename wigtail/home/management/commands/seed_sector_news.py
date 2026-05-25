"""
Create SubsectionIndexPage per GICS sector (if missing) and five TaggedContentPage
articles per sector with realistic stock-market blurbs.

Usage (from wigtail/):
  python manage.py seed_sector_news
  python manage.py seed_sector_news --articles-only   # skip subsection pages
"""

from __future__ import annotations

from django.core.management.base import BaseCommand
from django.utils.html import escape
from wagtail.rich_text import RichText

from home.gics_sectors import GICS_SECTORS
from home.models import (
    ContentTag,
    HomePage,
    SubsectionIndexPage,
    TaggedContentPage,
    TaxonomyTerm,
)
from home.seed_news_data import SECTOR_ARTICLES, TAG_DEFINITIONS, all_sector_slugs_covered


def _stream_body(title: str, paragraphs: list[str]) -> list:
    blocks: list = [
        ("heading", {"level": "h2", "text": title}),
    ]
    for p in paragraphs:
        blocks.append(("paragraph", RichText(f"<p>{escape(p)}</p>")))
    return blocks


def _intro_stream(sector_name: str) -> list:
    return [
        ("heading", {"level": "h2", "text": f"{sector_name} market brief"}),
        (
            "paragraph",
            RichText(
                "<p>Short-form sector tape and fundamentals notes for traders and "
                f"investors scanning <strong>{escape(sector_name)}</strong>. "
                "Each headline below is updated-style commentary, not investment advice.</p>"
            ),
        ),
    ]


class Command(BaseCommand):
    help = "Seed GICS subsection hubs and five stock-market articles per sector."

    def add_arguments(self, parser):
        parser.add_argument(
            "--articles-only",
            action="store_true",
            help="Only create articles and tags; do not create SubsectionIndexPage records.",
        )

    def handle(self, *args, **options):
        if not all_sector_slugs_covered():
            self.stderr.write("SECTOR_ARTICLES keys must match GICS_SECTOR_SLUGS.")
            return

        home = HomePage.objects.live().public().first()
        if home is None:
            home = HomePage.objects.first()
        if home is None:
            self.stderr.write("No HomePage found. Create a HomePage in Wagtail first.")
            return

        tag_map: dict[str, ContentTag] = {}
        for name, slug in TAG_DEFINITIONS:
            t, _ = ContentTag.objects.get_or_create(slug=slug, defaults={"name": name})
            tag_map[slug] = t

        articles_only = options["articles_only"]
        created_index = 0
        created_articles = 0
        skipped_articles = 0

        for sector_name, sector_slug in GICS_SECTORS:
            term = TaxonomyTerm.objects.filter(slug=sector_slug).first()
            if term is None:
                self.stderr.write(f"Missing TaxonomyTerm slug={sector_slug!r}; run migrations.")
                continue

            if not articles_only:
                existing_idx = (
                    SubsectionIndexPage.objects.live()
                    .public()
                    .descendant_of(home)
                    .filter(section_term=term)
                    .first()
                )
                if existing_idx is None:
                    hub_slug = f"sector-{sector_slug}"
                    idx = SubsectionIndexPage(
                        title=f"{sector_name} news",
                        slug=hub_slug,
                        section_term=term,
                        recent_tile_limit=12,
                        intro=_intro_stream(sector_name),
                    )
                    home.add_child(instance=idx)
                    rev = idx.save_revision()
                    rev.publish()
                    created_index += 1
                    self.stdout.write(f"Created subsection index: {idx.title} ({idx.url})")
                else:
                    self.stdout.write(f"Subsection exists for {sector_slug!r}, skipping.")

            seeds = SECTOR_ARTICLES[sector_slug]
            for seed in seeds:
                art_slug = f"{sector_slug}-{seed['slug_suffix']}"
                exists = TaggedContentPage.objects.descendant_of(home).filter(slug=art_slug).exists()
                if exists:
                    skipped_articles += 1
                    continue

                page = TaggedContentPage(
                    title=seed["title"],
                    slug=art_slug,
                    section_term=term,
                    lede=seed["lede"],
                    body=_stream_body(seed["title"], seed["body_paragraphs"]),
                )
                home.add_child(instance=page)
                for ts in seed["tag_slugs"]:
                    if ts in tag_map:
                        page.tags.add(tag_map[ts])
                page.save_revision().publish()
                created_articles += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Done. Subsection pages created: {created_index}, "
                f"articles created: {created_articles}, articles skipped (existing): {skipped_articles}."
            )
        )
