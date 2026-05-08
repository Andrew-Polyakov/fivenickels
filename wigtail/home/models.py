from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.http import Http404
from django.shortcuts import get_object_or_404
from modelcluster.fields import ParentalManyToManyField
from treebeard.mp_tree import MP_Node
from wagtail.admin.panels import FieldPanel, MultiFieldPanel, PageChooserPanel
from wagtail.contrib.routable_page.models import RoutablePageMixin, route
from wagtail.fields import StreamField
from wagtail.images import get_image_model_string
from wagtail.models import Page
from wagtail.search import index
from wagtail.snippets.models import register_snippet
from wagtailmarkdown.fields import MarkdownField

from home.blocks import MAIN_SITE_STREAMBLOCK
from home.navigation import normalize_sector_query_param


@register_snippet
class TaxonomyTerm(MP_Node):
    """Hierarchical taxonomy: header/footer nav, section labels, and markdown tile grouping."""

    name = models.CharField(max_length=255)
    slug = models.SlugField(max_length=255, unique=True)
    link_page = models.ForeignKey(
        "wagtailcore.Page",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
        help_text="If set, this nav item navigates to this page instead of drilling down.",
    )
    widgets = StreamField(
        MAIN_SITE_STREAMBLOCK,
        blank=True,
        use_json_field=True,
    )
    master_layout_json = models.JSONField(
        null=True,
        blank=True,
        help_text="Master pane resizable layout (rows/columns) when widgets StreamField is empty; staff-only edit via site UI.",
    )
    is_visible = models.BooleanField(
        default=True,
        help_text="If unchecked, this term is hidden from site navigation.",
    )
    is_nav = models.BooleanField(
        default=True,
        help_text="If unchecked, this term is hidden from public nav but still visible to editors.",
    )
    sort_order = models.PositiveSmallIntegerField(default=0)
    parent_for_create = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
        help_text="When creating a new term, optionally choose a parent. Ignored after save.",
    )

    node_order_by = ("sort_order", "name")

    panels = [
        FieldPanel("name"),
        FieldPanel("slug"),
        FieldPanel(
            "parent_for_create",
            heading="Parent (new terms only)",
        ),
        PageChooserPanel("link_page"),
        FieldPanel("is_visible"),
        FieldPanel("is_nav"),
        FieldPanel("sort_order"),
        FieldPanel("widgets"),
        FieldPanel("master_layout_json"),
    ]

    class Meta:
        verbose_name = "taxonomy term"
        verbose_name_plural = "taxonomy terms"

    def get_visible_children(self):
        return (
            self.get_children()
            .filter(is_visible=True)
            .order_by("sort_order", "name")
        )

    def save(self, *args, **kwargs):
        if self._state.adding and len(self.path or "") < self.steplen:
            parent = self.parent_for_create
            self.parent_for_create_id = None
            if parent is not None:
                parent.add_child(instance=self)
                return
            TaxonomyTerm.add_root(instance=self)
            return
        self.parent_for_create_id = None
        return super().save(*args, **kwargs)

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
    REGION_US = "US"
    REGION_EUROPE = "EUROPE"
    REGION_ASIA = "ASIA"
    REGION_CHOICES = (
        (REGION_US, "US"),
        (REGION_EUROPE, "Europe"),
        (REGION_ASIA, "Asia"),
    )
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
    market_region = models.CharField(
        max_length=16,
        choices=REGION_CHOICES,
        default=REGION_US,
        db_index=True,
        help_text="Region used by the Market Movers toggle.",
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
        FieldPanel("market_region"),
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
        context = super().get_context(request, *args, **kwargs)
        context["sector_nav_active"] = self.section_term.slug
        return context


class TaggedContentPage(Page):
    search_fields = Page.search_fields + [
        index.SearchField("tile_preview"),
        index.SearchField("body"),
    ]

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
    tile_priority = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(1), MaxValueValidator(10)],
        help_text="1–10 for automated tiles; higher surfaces first. Leave blank for maximum weight (same as 10).",
    )
    article_priority = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        db_index=True,
        validators=[MinValueValidator(1), MaxValueValidator(10)],
        help_text="1–10 content priority for shadcn card source mode: priority articles.",
    )
    priority_expires_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="After this date/time, article_priority is ignored for automated priority picks.",
    )
    taxonomy_category = models.ForeignKey(
        TaxonomyTerm,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
        help_text=(
            "Optional subsection category: must be a direct child of Section (taxonomy). "
            "Used for Featured chips on the sector hub."
        ),
    )
    body = StreamField(
        MAIN_SITE_STREAMBLOCK,
        blank=True,
        use_json_field=True,
    )

    content_panels = Page.content_panels + [
        MultiFieldPanel(
            [
                FieldPanel("section_term"),
                FieldPanel("taxonomy_category"),
                FieldPanel("tags"),
                FieldPanel("hero_image"),
                FieldPanel("tile_preview"),
                FieldPanel("tile_priority"),
                FieldPanel("article_priority"),
                FieldPanel("priority_expires_at"),
            ],
            heading="Listing & taxonomy",
        ),
        FieldPanel("body"),
    ]

    _LISTING_PREVIEW_FALLBACK_MAX = 420

    def clean(self):
        super().clean()
        if self.taxonomy_category_id and self.section_term_id:
            parent = self.taxonomy_category.get_parent()
            if parent is None or parent.pk != self.section_term_id:
                raise ValidationError(
                    {
                        "taxonomy_category": (
                            "Must be a direct child category of the selected section taxonomy term."
                        ),
                    }
                )

    def listing_preview_markdown(self) -> str:
        """Excerpt for tile cards: ``tile_preview`` or the first paragraph / markdown in ``body``."""
        primary = (self.tile_preview or "").strip()
        if primary:
            return primary
        from django.utils.html import strip_tags

        cap = self._LISTING_PREVIEW_FALLBACK_MAX
        for block in self.body:
            if block.block_type == "paragraph" and block.value:
                plain = strip_tags(str(block.value)).strip()
                if plain:
                    if len(plain) > cap:
                        return plain[: cap - 1].rstrip() + "…"
                    return plain
            if block.block_type == "markdown" and block.value:
                md = str(block.value).strip()
                if md:
                    one = " ".join(md.split())
                    if len(one) > cap:
                        return one[: cap - 1].rstrip() + "…"
                    return one
        return ""

    def get_context(self, request, *args, **kwargs):
        from home.query import get_similar_pages

        context = super().get_context(request, *args, **kwargs)
        context["similar_pages"] = get_similar_pages(self, limit=24)
        context["routable_home"] = HomePage.objects.live().public().first()
        return context


class CareersPage(Page):
    """Company careers; body copy lives in the template."""

    parent_page_types = ["home.HomePage"]
    subpage_types = []

    class Meta:
        verbose_name = "careers page"


class CookiesPolicyPage(Page):
    """Cookies and similar technologies policy (static template body)."""

    parent_page_types = ["home.HomePage"]
    subpage_types = []

    class Meta:
        verbose_name = "cookies policy page"


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
        help_text="Legacy: optional Markets data target; prefer TaxonomyTerm (slug markets-data) link_page.",
    )

    subpage_types = [
        "home.SubsectionIndexPage",
        "home.TaggedContentPage",
        "home.CareersPage",
        "home.CookiesPolicyPage",
    ]

    content_panels = Page.content_panels + [
        FieldPanel("body"),
    ]

    @route(r"^_taxonomy/$", name="taxonomy_nav_root")
    def taxonomy_nav_root(self, request):
        from home.taxonomy import render_site_nav_frame, taxonomy_roots_for_nav

        if request.headers.get("Turbo-Frame") == "site-nav":
            return render_site_nav_frame(request, self, [])
        root_terms = list(taxonomy_roots_for_nav(self))
        return self.render(
            request,
            template="home/taxonomy/taxonomy_nav_root_page.html",
            context_overrides={
                "taxonomy_root_terms": root_terms,
            },
        )

    @route(r"^_taxonomy/(?P<path>[-\w/]+)/$", name="taxonomy_nav_path")
    def taxonomy_nav_path(self, request, path):
        from home.taxonomy import (
            build_site_nav_context,
            render_site_nav_frame,
            taxonomy_breadcrumb_items,
        )

        part = (path or "").strip("/")
        slugs = [s for s in part.split("/") if s]

        # Dev / partial DB copies may omit seeded nav roots; lazy-heal only when absent.
        if slugs:
            from home.taxonomy import TOP_ROW_SLUGS_SET, ensure_top_row_taxonomy_terms

            if (
                slugs[0] in TOP_ROW_SLUGS_SET
                and not TaxonomyTerm.objects.filter(slug=slugs[0]).exists()
            ):
                ensure_top_row_taxonomy_terms()

        # Turbo loads only the nav frame; full browser visits need a real page (CSS + layout).
        if request.headers.get("Turbo-Frame") == "site-nav":
            return render_site_nav_frame(request, self, slugs)

        try:
            ctx = build_site_nav_context(self, slugs, require_content=False)
        except Http404:
            raise Http404("Taxonomy path not found")

        from home.inline_edit_views import _admin_inline_access

        trail = ctx["trail"]
        active_node = ctx["active_node"]
        bc_list = taxonomy_breadcrumb_items(self, trail)
        breadcrumb_payload = []
        for i, row in enumerate(bc_list):
            entry = {"label": row["term"].name}
            if i < len(bc_list) - 1:
                entry["href"] = row["url"]
            breadcrumb_payload.append(entry)
        layout_payload = {"rows": []}
        raw_layout = getattr(active_node, "master_layout_json", None)
        if isinstance(raw_layout, dict) and isinstance(raw_layout.get("rows"), list):
            layout_payload = {"rows": raw_layout["rows"]}
            if isinstance(raw_layout.get("layoutVersion"), int):
                layout_payload["layoutVersion"] = raw_layout["layoutVersion"]

        return self.render(
            request,
            template="home/taxonomy/taxonomy_drilldown_page.html",
            context_overrides={
                "taxonomy_trail": trail,
                "taxonomy_active_node": active_node,
                "taxonomy_prefix": ctx["taxonomy_prefix"],
                "taxonomy_breadcrumbs_payload": breadcrumb_payload,
                "taxonomy_master_layout_payload": layout_payload,
                "can_save_taxonomy_master_layout": _admin_inline_access(request.user),
            },
        )

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
        sector = normalize_sector_query_param(request.GET.get("sector"))
        context["sector_tile_filter"] = sector
        context["sector_taxonomy_term"] = (
            TaxonomyTerm.objects.filter(slug=sector, is_visible=True).first()
            if sector
            else None
        )
        return context
