from django.db import models
from django.shortcuts import get_object_or_404
from modelcluster.fields import ParentalManyToManyField
from wagtail.admin.panels import FieldPanel, MultiFieldPanel, PageChooserPanel
from wagtail.contrib.routable_page.models import RoutablePageMixin, route
from wagtail.fields import StreamField
from wagtail.images import get_image_model_string
from wagtail.models import Page
from wagtail.snippets.models import register_snippet
from wagtailmarkdown.fields import MarkdownField

from home.blocks import MAIN_SITE_STREAMBLOCK
from home.gics_sectors import GICS_SECTOR_ORDER, GICS_SECTOR_SLUGS


@register_snippet
class TaxonomyTerm(models.Model):
    """Reusable label for grouping or tagging markdown tiles (slug for future URLs or filters)."""

    name = models.CharField(max_length=255)
    slug = models.SlugField(max_length=255, unique=True)

    panels = [
        FieldPanel("name"),
        FieldPanel("slug"),
    ]

    class Meta:
        ordering = ["name"]
        verbose_name = "taxonomy term"
        verbose_name_plural = "taxonomy terms"

    def __str__(self) -> str:
        return self.name


@register_snippet
class ContentTag(models.Model):
    name = models.CharField(max_length=255)
    slug = models.SlugField(max_length=255, unique=True)

    panels = [
        FieldPanel("name"),
        FieldPanel("slug"),
    ]

    class Meta:
        ordering = ["name"]
        verbose_name = "content tag"
        verbose_name_plural = "content tags"

    def __str__(self) -> str:
        return self.name


@register_snippet
class MarketTickerRow(models.Model):
    """
    One Alpaca symbol shown in the header carousel. Run `manage.py sync_market_tickers`
    to refresh prices from Alpaca snapshots. Use a tradable symbol (e.g. SPY for S&P 500).

    `ingest_alpaca_news` can create a row for each CLI symbol if missing and refresh
    snapshot fields for all enabled rows (unless `--no-sync-tickers`).
    """

    symbol = models.CharField(max_length=32, unique=True)
    label = models.CharField(
        max_length=120,
        blank=True,
        help_text='Optional headline label (e.g. "S&P 500" for SPY). Leave blank to use the symbol.',
    )
    sort_order = models.PositiveSmallIntegerField(default=0)
    enabled = models.BooleanField(default=True)

    last_price = models.DecimalField(
        max_digits=20, decimal_places=6, null=True, blank=True
    )
    previous_close = models.DecimalField(
        max_digits=20, decimal_places=6, null=True, blank=True
    )
    percent_change = models.DecimalField(
        max_digits=12, decimal_places=4, null=True, blank=True
    )
    day_volume = models.BigIntegerField(null=True, blank=True)
    fetched_at = models.DateTimeField(null=True, blank=True)
    last_error = models.TextField(blank=True)
    tradingview_symbol = models.CharField(
        max_length=64,
        blank=True,
        help_text='Optional full TradingView symbol, e.g. "NASDAQ:NVDA" or "AMEX:SPY". '
        "If empty, a US default (NASDAQ or a small NYSE set) is used.",
    )

    panels = [
        FieldPanel("symbol"),
        FieldPanel("label"),
        FieldPanel("tradingview_symbol"),
        FieldPanel("sort_order"),
        FieldPanel("enabled"),
        MultiFieldPanel(
            [
                FieldPanel("last_price"),
                FieldPanel("previous_close"),
                FieldPanel("percent_change"),
                FieldPanel("day_volume"),
                FieldPanel("fetched_at"),
                FieldPanel("last_error"),
            ],
            heading="Latest snapshot (updated by sync_market_tickers)",
        ),
    ]

    class Meta:
        ordering = ["sort_order", "symbol"]
        verbose_name = "market ticker row"
        verbose_name_plural = "market ticker rows"

    def save(self, *args, **kwargs):
        self.symbol = (self.symbol or "").strip().upper()
        super().save(*args, **kwargs)

    def display_label(self) -> str:
        return (self.label or "").strip() or self.symbol

    def __str__(self) -> str:
        return f"{self.symbol} ({self.display_label()})"


class SubsectionIndexPage(Page):
    section_term = models.ForeignKey(
        TaxonomyTerm,
        on_delete=models.PROTECT,
        related_name="+",
    )
    intro = StreamField(
        MAIN_SITE_STREAMBLOCK,
        blank=True,
        use_json_field=True,
    )
    recent_tile_limit = models.PositiveSmallIntegerField(default=12)

    content_panels = Page.content_panels + [
        FieldPanel("section_term"),
        FieldPanel("recent_tile_limit"),
        FieldPanel("intro"),
    ]

    def get_context(self, request, *args, **kwargs):
        from home.query import get_recent_pages_for_section

        context = super().get_context(request, *args, **kwargs)
        context["recent_pages"] = get_recent_pages_for_section(
            self.section_term,
            limit=self.recent_tile_limit,
        )
        context["sector_nav_active"] = self.section_term.slug
        return context


class TaggedContentPage(Page):
    section_term = models.ForeignKey(
        TaxonomyTerm,
        on_delete=models.PROTECT,
        related_name="+",
    )
    tags = ParentalManyToManyField(ContentTag, blank=True)
    hero_image = models.ForeignKey(
        get_image_model_string(),
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    tile_preview = MarkdownField(blank=True)
    body = StreamField(
        MAIN_SITE_STREAMBLOCK,
        blank=True,
        use_json_field=True,
    )

    content_panels = Page.content_panels + [
        MultiFieldPanel(
            [
                FieldPanel("section_term"),
                FieldPanel("tags"),
                FieldPanel("hero_image"),
                FieldPanel("tile_preview"),
            ],
            heading="Listing & taxonomy",
        ),
        FieldPanel("body"),
    ]

    def get_context(self, request, *args, **kwargs):
        from home.query import get_similar_pages

        context = super().get_context(request, *args, **kwargs)
        context["similar_pages"] = get_similar_pages(self, limit=24)
        context["routable_home"] = HomePage.objects.live().public().first()
        return context


class HomePage(RoutablePageMixin, Page):
    body = StreamField(
        MAIN_SITE_STREAMBLOCK,
        blank=True,
        use_json_field=True,
    )
    markets_data_link = models.ForeignKey(
        "wagtailcore.Page",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
        help_text="Optional target for the MARKETS DATA link in the site header.",
    )

    content_panels = Page.content_panels + [
        PageChooserPanel("markets_data_link"),
        FieldPanel("body"),
    ]

    @route(r"^ticker/(?P<ticker_slug>[-\w]+)/$", name="ticker_detail")
    def ticker_detail(self, request, ticker_slug):
        from home.ticker_serve import render_ticker_page

        return render_ticker_page(request, ticker_slug)

    @route(r"^tags/(?P<tag_slug>[-\w]+)/$", name="tag_archive")
    def tag_archive(self, request, tag_slug):
        tag = get_object_or_404(ContentTag, slug=tag_slug)
        qs = (
            TaggedContentPage.objects.live()
            .public()
            .filter(tags=tag)
            .order_by("-first_published_at")
        )
        section = (request.GET.get("section") or "").strip()
        if section:
            qs = qs.filter(section_term__slug=section)
        return self.render(
            request,
            template="home/tag_archive.html",
            context_overrides={
                "archive_tag": tag,
                "archive_pages": list(qs),
                "archive_section_filter": section or None,
            },
        )

    def get_context(self, request, *args, **kwargs):
        context = super().get_context(request, *args, **kwargs)
        return context
