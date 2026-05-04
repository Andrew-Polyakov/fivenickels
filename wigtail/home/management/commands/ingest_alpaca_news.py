"""
Import Alpaca Market Data news into TaggedContentPage records.

Usage (from wigtail/):

  python manage.py ingest_alpaca_news NVDA TSM
  python manage.py ingest_alpaca_news NVDA --limit 20 --section-slug information-technology
  python manage.py ingest_alpaca_news NVDA --dry-run
  python manage.py ingest_alpaca_news NVDA --no-images
  python manage.py ingest_alpaca_news NVDA --sandbox
  python manage.py ingest_alpaca_news NVDA --refresh
  python manage.py ingest_alpaca_news NVDA --no-sync-tickers

Requires APCA_API_KEY_ID / APCA_API_SECRET_KEY (or ALPACA_*) — same as tools/StockCrawler.
"""

from __future__ import annotations

from argparse import ArgumentTypeError
from datetime import datetime, timedelta, timezone

import requests
from django.core.management.base import BaseCommand, CommandError

from home.alpaca_hero_image import import_hero_image
from home.alpaca_news_client import (
    DEFAULT_DATA_BASE_LIVE,
    DEFAULT_DATA_BASE_SANDBOX,
    AlpacaNewsArticle,
    best_image_url,
    fetch_news,
)
from home.alpaca_to_streamfield import (
    build_tile_preview,
    content_tags_for_article,
    streamfield_body_for_article,
    truncate_title,
)
from home.market_ticker_snapshot_sync import (
    ensure_market_ticker_rows_for_symbols,
    refresh_market_ticker_rows,
)
from home.models import ContentTag, HomePage, MarketTickerRow, TaggedContentPage, TaxonomyTerm


def _parse_iso_dt(value: str) -> datetime:
    value = value.strip()
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(value)
    except ValueError as e:
        raise ArgumentTypeError(f"Invalid ISO datetime: {value!r}") from e
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


class Command(BaseCommand):
    help = "Publish Alpaca news articles as TaggedContentPage under the site HomePage."

    def add_arguments(self, parser):
        parser.add_argument(
            "symbols",
            nargs="+",
            help="Ticker symbols (e.g. NVDA TSM or NVDA,TSM)",
        )
        parser.add_argument(
            "--start",
            type=str,
            default=None,
            help="ISO start time (default: 24 hours ago UTC).",
        )
        parser.add_argument(
            "--end",
            type=str,
            default=None,
            help="ISO end time (default: now UTC).",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=50,
            help="Max articles to import (default 50).",
        )
        parser.add_argument(
            "--section-slug",
            type=str,
            default="information-technology",
            help="TaxonomyTerm slug for TaggedContentPage.section_term (default: IT).",
        )
        parser.add_argument(
            "--sandbox",
            action="store_true",
            help="Use Alpaca data sandbox base URL.",
        )
        parser.add_argument(
            "--base-url",
            type=str,
            default=None,
            help="Override data API base URL (overrides --sandbox if set).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Print actions only; do not create or update pages.",
        )
        parser.add_argument(
            "--refresh",
            action="store_true",
            help="Update title/body/tile if slug alpaca-{id} already exists.",
        )
        parser.add_argument(
            "--no-images",
            action="store_true",
            help="Do not download Alpaca image URLs for hero_image.",
        )
        parser.add_argument(
            "--exclude-contentless",
            action="store_true",
            help="Maps to Alpaca exclude_contentless=true.",
        )
        parser.add_argument(
            "--no-sync-tickers",
            action="store_true",
            help="Do not create MarketTickerRow for CLI symbols or refresh carousel snapshots.",
        )

    def handle(self, *args, **options):
        raw_syms: list[str] = options["symbols"]
        symbols: list[str] = []
        for chunk in raw_syms:
            for part in chunk.split(","):
                p = part.strip().upper()
                if p:
                    symbols.append(p)
        if not symbols:
            self.stderr.write("No symbols after parsing.")
            return

        now = datetime.now(timezone.utc)
        if options["end"]:
            end_dt = _parse_iso_dt(options["end"])
        else:
            end_dt = now
        if options["start"]:
            start_dt = _parse_iso_dt(options["start"])
        else:
            start_dt = end_dt - timedelta(hours=24)

        start_s = start_dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        end_s = end_dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

        base_url = options["base_url"] or (
            DEFAULT_DATA_BASE_SANDBOX if options["sandbox"] else DEFAULT_DATA_BASE_LIVE
        )
        base_url = str(base_url).rstrip("/")
        limit = max(1, options["limit"])
        section_slug = (options["section_slug"] or "").strip()
        dry_run = options["dry_run"]
        refresh = options["refresh"]
        no_images = options["no_images"]
        exclude_contentless = options["exclude_contentless"]
        no_sync_tickers = options["no_sync_tickers"]

        term = TaxonomyTerm.objects.filter(slug=section_slug).first()
        if term is None:
            self.stderr.write(
                f"No TaxonomyTerm with slug={section_slug!r}. "
                "Use an existing GICS slug (see home.gics_sectors) or seed data."
            )
            return

        home = HomePage.objects.live().public().first() or HomePage.objects.first()
        if home is None:
            self.stderr.write("No HomePage found. Create one in Wagtail first.")
            return

        if not no_sync_tickers:
            if dry_run:
                enabled_n = MarketTickerRow.objects.filter(enabled=True).count()
                self.stdout.write(
                    f"  [dry-run] would refresh {enabled_n} enabled market ticker row(s)."
                )
                for sym in symbols:
                    if not MarketTickerRow.objects.filter(symbol=sym).exists():
                        self.stdout.write(
                            f"  [dry-run] would ensure MarketTickerRow for {sym}"
                        )
            else:
                n_created, n_exist = ensure_market_ticker_rows_for_symbols(symbols)
                if n_created:
                    self.stdout.write(
                        self.style.SUCCESS(
                            f"Market ticker rows: created {n_created}, already had {n_exist}."
                        )
                    )

        session = requests.Session()
        try:
            self.stdout.write(
                f"Fetching Alpaca news: symbols={symbols!r} start={start_s} end={end_s} "
                f"limit={limit} base={base_url}"
            )
            articles: list[AlpacaNewsArticle] = fetch_news(
                symbols=symbols,
                start=start_s,
                end=end_s,
                sort="desc",
                limit=limit,
                include_content=True,
                exclude_contentless=exclude_contentless,
                base_url=base_url,
                session=session,
            )
        except Exception as ex:
            self.stderr.write(f"Alpaca request failed: {ex}")
            raise CommandError(str(ex)) from ex

        self.stdout.write(f"Received {len(articles)} article(s).")

        created = 0
        skipped = 0
        updated = 0

        for art in articles:
            slug = f"alpaca-{art.id}"
            body = streamfield_body_for_article(art, home_page=home)
            preview = build_tile_preview(art)
            title = truncate_title(art.headline)

            existing = (
                TaggedContentPage.objects.descendant_of(home).filter(slug=slug).first()
            )

            if existing is not None and not refresh:
                skipped += 1
                self.stdout.write(f"  skip slug={slug} (exists; use --refresh)")
                continue

            if dry_run:
                img_url = best_image_url(art)
                if img_url:
                    self.stdout.write(f"  [dry-run] would set hero from {img_url}")
                if existing is not None:
                    self.stdout.write(f"  [dry-run] would update {slug!r} title={title!r}")
                    updated += 1
                else:
                    self.stdout.write(f"  [dry-run] would create {slug!r} title={title!r}")
                    created += 1
                continue

            tag_pairs = content_tags_for_article(art)
            tag_objs: list[ContentTag] = []
            for name, tslug in tag_pairs:
                t, _ = ContentTag.objects.get_or_create(
                    slug=tslug,
                    defaults={"name": name[:255]},
                )
                tag_objs.append(t)

            if existing is not None:
                existing.title = title
                existing.tile_preview = preview
                existing.body = body
                existing.section_term = term
                if not no_images:
                    u = best_image_url(art)
                    if u:
                        hero = import_hero_image(
                            u, label=slug, request_session=session
                        )
                        if hero is not None:
                            existing.hero_image = hero
                        else:
                            self.stderr.write(
                                f"  hero image download failed for {slug} url={u!r}"
                            )
                existing.save()
                existing.tags.set(tag_objs)
                rev = existing.save_revision()
                rev.publish()
                updated += 1
                self.stdout.write(self.style.SUCCESS(f"  updated {slug} ({title})"))
                continue

            hero_img = None
            if not no_images:
                u = best_image_url(art)
                if u:
                    hero_img = import_hero_image(
                        u, label=slug, request_session=session
                    )
                    if hero_img is None:
                        self.stderr.write(
                            f"  hero image download failed for {slug} url={u!r}"
                        )

            page = TaggedContentPage(
                title=title,
                slug=slug,
                section_term=term,
                tile_preview=preview,
                body=body,
                hero_image=hero_img,
            )
            home.add_child(instance=page)
            page.tags.set(tag_objs)
            rev = page.save_revision()
            rev.publish()
            created += 1
            self.stdout.write(self.style.SUCCESS(f"  created {slug} ({title})"))

        if not no_sync_tickers and not dry_run:
            ticker_rows = list(
                MarketTickerRow.objects.filter(enabled=True).order_by(
                    "sort_order", "symbol"
                )
            )
            try:
                refresh_market_ticker_rows(
                    ticker_rows,
                    session=session,
                    base_url=base_url,
                    dry_run=False,
                    log_line=self.stdout.write,
                )
                self.stdout.write(
                    self.style.SUCCESS(
                        f"Carousel tickers: refreshed {len(ticker_rows)} row(s)."
                    )
                )
            except Exception as ex:
                self.stderr.write(f"Alpaca snapshot request failed: {ex}")
                raise CommandError(str(ex)) from ex

        self.stdout.write(
            self.style.SUCCESS(
                f"Done. created={created}, updated={updated}, skipped={skipped}, dry_run={dry_run}."
            )
        )
