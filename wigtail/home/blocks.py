import uuid

from wagtail import blocks
from wagtail.embeds.blocks import EmbedBlock
from wagtail.images.blocks import ImageChooserBlock
from wagtail.snippets.blocks import SnippetChooserBlock
from wagtailmarkdown.blocks import MarkdownBlock

from home.query import (
    get_pages_for_section_and_tags,
    get_priority_pages_for_section,
    get_random_pages_for_section_prioritized,
)


def _resolve_section_term(block_value, parent_context):
    term = block_value.get("section_term")
    if term is not None:
        return term
    pc = parent_context or {}
    page = pc.get("page")
    if page is not None:
        sp = getattr(page, "specific", page)
        st = getattr(sp, "section_term", None)
        if st is not None:
            return st
    t = pc.get("taxonomy_active_node")
    if t is not None:
        return t
    t = pc.get("active_node")
    if t is not None:
        return t
    t = pc.get("site_nav_active_node")
    if t is not None:
        return t
    return pc.get("sector_taxonomy_term")


def _pick_one_tile_page(cell_value, term, exclude_ids):
    mode = cell_value.get("mode")
    if mode in ("top_viewed", "priority_articles_stub"):
        return None
    if mode in ("manual_article", "manual", "specific_article"):
        specific = cell_value.get("specific_page")
        if specific:
            return specific.specific
        return None
    if mode in ("random_category", "random"):
        if term is None:
            return None
        picked = get_random_pages_for_section_prioritized(
            term,
            limit=1,
            exclude_ids=exclude_ids or None,
        )
        return picked[0] if picked else None
    if mode == "tagged_with":
        if term is None:
            return None
        tag_values = cell_value.get("tags") or []
        tag_ids = [int(getattr(t, "pk", 0)) for t in tag_values if getattr(t, "pk", None)]
        picked = get_pages_for_section_and_tags(
            term,
            tag_ids=tag_ids,
            limit=1,
            exclude_ids=exclude_ids or None,
        )
        return picked[0] if picked else None
    if mode == "priority_articles":
        if term is None:
            return None
        picked = get_priority_pages_for_section(
            term,
            limit=1,
            exclude_ids=exclude_ids or None,
        )
        return picked[0] if picked else None
    if term is None:
        return None
    return None


def _resolve_universal_tile_state(tile_value, parent_context, exclude_ids=None):
    tile_value = tile_value or {}
    mode = tile_value.get("mode") or "random_category"
    # Backward compatibility for older serialized modes.
    if mode == "manual":
        mode = "manual_article"
    elif mode == "random":
        mode = "random_category"
    if mode == "manual_article":
        mode = "specific_article"
    elif mode == "random_category":
        mode = "random"
    if mode == "top_viewed":
        return {
            "kind": "stub",
            "mode": mode,
            "message": "Not implemented",
            "tile_page": None,
        }

    term = _resolve_section_term(
        {**tile_value, "section_term": tile_value.get("section_term")},
        parent_context,
    )
    tile_page = _pick_one_tile_page({**tile_value, "mode": mode}, term, exclude_ids or [])
    return {
        "kind": "article",
        "mode": mode,
        "message": "",
        "tile_page": tile_page,
    }


class HeadingBlock(blocks.StructBlock):
    level = blocks.ChoiceBlock(
        choices=[
            ("h2", "Heading 2"),
            ("h3", "Heading 3"),
        ],
        default="h2",
    )
    text = blocks.CharBlock()

    class Meta:
        icon = "title"
        template = "home/blocks/heading.html"


class ParagraphBlock(blocks.RichTextBlock):
    def __init__(self, **kwargs):
        kwargs.setdefault(
            "features",
            ["h2", "h3", "bold", "italic", "link", "ol", "ul"],
        )
        super().__init__(**kwargs)

    class Meta:
        icon = "doc-full"
        template = "home/blocks/paragraph.html"


class ArticleBodyMarkdownBlock(MarkdownBlock):
    """Article/stream markdown: template runs ticker + Benzinga enrichment."""

    class Meta:
        icon = "doc-full"
        label = "Article markdown"
        help_text = (
            "Markdown body. Images: ![alt](https://example.com/image.jpg). "
            "NASDAQ:AAPL, (NASDAQ: AAPL ), and Benzinga /quote/SYM URLs become carousel-style "
            "chips when the symbol is enabled in Market ticker rows."
        )
        template = "home/blocks/article_markdown.html"


class ArticleTileSourceBlock(blocks.StructBlock):
    """Random/manual article source for card blocks."""

    importance = blocks.IntegerBlock(
        min_value=1,
        max_value=10,
        default=10,
        required=False,
        label="Importance (editor only)",
        help_text="Not shown on the public site. Defaults to 10 (highest) when omitted.",
    )
    section_term = SnippetChooserBlock(
        "home.TaxonomyTerm",
        required=False,
        label="Section override",
        help_text=(
            "Leave blank to use the current page section, home ?sector= filter, or taxonomy hub. "
            "On the home page with a sector filter, only cards whose section override matches that "
            "sector are shown."
        ),
    )
    mode = blocks.ChoiceBlock(
        choices=[
            ("random", "Random"),
            ("specific_article", "Specific article"),
            ("tagged_with", "Tagged with"),
            ("priority_articles", "Priority articles"),
        ],
        default="random",
    )
    specific_page = blocks.PageChooserBlock(
        target_model="home.TaggedContentPage",
        required=False,
        label="Specific article",
    )
    tags = blocks.ListBlock(
        SnippetChooserBlock("home.ContentTag", required=True),
        required=False,
        label="Tags",
    )

    class Meta:
        icon = "placeholder"


class SiteCardBlock(blocks.StructBlock):
    article = ArticleTileSourceBlock(label="Article source")

    class Meta:
        icon = "doc-empty"
        label = "Article card"


class BentoGridFeatureBlock(blocks.StructBlock):
    header_type = blocks.ChoiceBlock(
        choices=[
            ("image", "Image (light/dark)"),
            ("card", "Article card"),
            ("fxbroker", "FX Broker card"),
            ("richtext", "Rich text"),
            ("stock_bars", "Stock bars"),
            ("forex_strip", "FX pairs"),
            ("market_movers", "Market movers"),
            ("upcoming_dividends", "Upcoming dividends"),
            ("market_calendar", "Market calendar"),
            ("article_carousel", "Article carousel"),
        ],
        default="image",
    )
    broker = SnippetChooserBlock(
        "home.BrokerRating",
        required=False,
        label="Broker (FX Broker card only)",
    )
    image_url_light = blocks.URLBlock(required=False, label="Image URL (light mode)")
    image_url_dark = blocks.URLBlock(required=False, label="Image URL (dark mode)")
    mode = blocks.ChoiceBlock(
        choices=[
            ("random", "Random"),
            ("specific_article", "Specific article"),
            ("priority_articles", "Priority articles"),
        ],
        default="random",
        required=False,
    )
    specific_page = blocks.PageChooserBlock(
        target_model="home.TaggedContentPage",
        required=False,
        label="Specific article",
    )
    tags = blocks.ListBlock(
        SnippetChooserBlock("home.ContentTag", required=True),
        required=False,
        label="Tags",
    )
    html = blocks.RichTextBlock(required=False, label="Rich text content")
    title = blocks.CharBlock()
    description = blocks.CharBlock()
    col_span = blocks.IntegerBlock(
        default=1,
        min_value=1,
        max_value=6,
        help_text="Width in columns (of the block grid column count).",
    )
    row_span = blocks.IntegerBlock(
        default=1,
        min_value=1,
        max_value=3,
        help_text="Height in grid rows.",
    )
    row = blocks.IntegerBlock(
        required=False,
        min_value=1,
        help_text="Force tile onto row N (leave blank for auto-flow).",
    )
    col = blocks.IntegerBlock(
        required=False,
        min_value=1,
        help_text="Force tile onto column N (1-based; leave blank for auto-flow).",
    )
    card_image_layout = blocks.ChoiceBlock(
        choices=[
            ("text_on_top", "Text above image"),
            ("text_on_left", "Text on the left, image on the right"),
            ("text_on_right", "Text on the right, image on the left"),
            ("text_only", "Text only (No Hero)"),
        ],
        default="text_on_top",
        required=False,
        label="Article card: text & image layout",
    )
    card_image_scale = blocks.ChoiceBlock(
        choices=[
            ("scales_to_fit", "Scales to Fit"),
            ("bleed_under", "Bleed under"),
        ],
        default="bleed_under",
        required=False,
        label="Article card: image scale",
    )
    stock_symbols = blocks.ListBlock(
        blocks.CharBlock(max_length=16),
        required=False,
        label="Stock symbols",
        help_text=(
            "Stock bars tile only: first symbol drives the OHLC chart; "
            "every symbol listed here appears as a chip."
        ),
    )
    stock_bars_cadence = blocks.ChoiceBlock(
        choices=[
            ("day", "Day"),
            ("week", "Week"),
            ("month", "Month"),
        ],
        default="day",
        required=False,
        label="Cadence (stock bars)",
    )
    stock_bars_limit = blocks.IntegerBlock(
        required=False,
        default=180,
        min_value=90,
        max_value=360,
        label="Number of bars (stock bars)",
    )
    market_region = blocks.ChoiceBlock(
        choices=[
            ("US", "US"),
            ("ASIA", "Asia"),
            ("EUROPE", "Europe"),
        ],
        default="US",
        required=False,
        label="Market region",
        help_text="Market movers tile only. Used when ?market_region= is absent on the page URL.",
    )
    dividend_symbols = blocks.ListBlock(
        blocks.CharBlock(max_length=16),
        required=False,
        label="Dividend symbols",
        help_text=(
            "Upcoming dividends tile only. Leave blank to use all enabled market ticker rows."
        ),
    )
    dividend_lookahead_days = blocks.IntegerBlock(
        required=False,
        default=60,
        min_value=7,
        max_value=365,
        label="Dividend lookahead (days)",
        help_text="Used when syncing data; display reads stored upcoming rows.",
    )
    dividend_max_rows = blocks.IntegerBlock(
        required=False,
        default=25,
        min_value=1,
        max_value=100,
        label="Max dividend rows",
    )
    calendar_market = blocks.ChoiceBlock(
        choices=[
            ("NASDAQ", "NASDAQ"),
            ("NYSE", "NYSE"),
        ],
        default="NASDAQ",
        required=False,
        label="Calendar market",
        help_text="Market calendar tile only.",
    )
    calendar_lookahead_days = blocks.IntegerBlock(
        required=False,
        default=60,
        min_value=7,
        max_value=365,
        label="Calendar lookahead (days)",
    )
    calendar_max_rows = blocks.IntegerBlock(
        required=False,
        default=30,
        min_value=1,
        max_value=90,
        label="Max calendar rows",
    )
    frame_count = blocks.IntegerBlock(
        required=False,
        default=5,
        min_value=2,
        max_value=12,
        label="Carousel frames",
        help_text="Article carousel only: number of slides and underscore indicators.",
    )
    article_source_mode = blocks.ChoiceBlock(
        choices=[
            ("taxonomy_category", "Taxonomy category"),
            ("selected_articles", "Selected articles"),
        ],
        default="taxonomy_category",
        required=False,
        label="Article carousel source",
    )
    taxonomy_category = SnippetChooserBlock(
        "home.TaxonomyTerm",
        required=False,
        label="Taxonomy category",
        help_text=(
            "Article carousel only: articles matching this term via section or "
            "taxonomy category (same as featured-quad chips)."
        ),
    )
    selected_articles = blocks.ListBlock(
        blocks.PageChooserBlock(
            target_model="home.TaggedContentPage",
            required=False,
            label="Article",
        ),
        required=False,
        label="Selected articles",
        help_text="Article carousel only: pick articles in display order (max = frame count).",
    )

    def clean(self, value):
        result = super().clean(value)
        if (result or {}).get("header_type") != "article_carousel":
            return result
        try:
            fc = int(result.get("frame_count") or 5)
        except (TypeError, ValueError):
            fc = 5
        result["frame_count"] = max(2, min(12, fc))
        if (result.get("article_source_mode") or "taxonomy_category") == "selected_articles":
            selected = list(result.get("selected_articles") or [])
            if len(selected) > result["frame_count"]:
                result["selected_articles"] = selected[: result["frame_count"]]
        return result

    class Meta:
        icon = "image"
        label = "Feature tile"


class BentoGrid01Block(blocks.StructBlock):
    badge_text = blocks.CharBlock(default="Features")
    heading = blocks.CharBlock(
        default="Beautifully designed bento grid section"
    )
    theme = blocks.ChoiceBlock(
        choices=[
            ("default", "Default"),
            ("inverted", "Inverted"),
            ("accent", "Accent"),
        ],
        default="default",
        required=False,
        help_text="Default: site palette. Inverted: light section (white/black). Accent: dark blue and orange.",
    )
    tile_style = blocks.ChoiceBlock(
        choices=[
            ("bordered", "Bordered"),
            ("shadow", "Shadow"),
            ("flat", "Flat"),
        ],
        default="bordered",
        required=False,
        help_text="Visual style applied to each feature tile.",
    )
    block_background = blocks.ChoiceBlock(
        choices=[
            ("default", "Default (contained)"),
            ("edge_to_edge", "Edge to edge"),
        ],
        default="default",
        required=False,
        help_text="Edge to edge: section background spans full viewport width; content stays centered.",
    )
    show_badge = blocks.BooleanBlock(
        default=True,
        required=False,
        help_text="Uncheck to hide the badge above the heading.",
    )
    grid_columns = blocks.IntegerBlock(
        default=3,
        min_value=1,
        max_value=6,
        label="Grid columns",
        help_text="Number of columns in the bento grid (1–6).",
    )
    grid_rows = blocks.IntegerBlock(
        default=3,
        min_value=1,
        max_value=3,
        label="Grid rows",
        help_text="Number of rows in the bento grid (1–3).",
    )
    features = blocks.ListBlock(BentoGridFeatureBlock())

    class Meta:
        icon = "grip"
        label = "Bento block"


class LayoutSeparatorBlock(blocks.StaticBlock):
    """Full-width horizontal rule between sections (or between card rows)."""

    class Meta:
        icon = "horizontalrule"
        label = "Separator"
        admin_text = "Horizontal rule"


class PerforationSeparatorBlock(blocks.StaticBlock):
    """Decorative full-width dotted tear line (not a layout separator for cards)."""

    def get_context(self, value, parent_context=None):
        context = super().get_context(value, parent_context=parent_context)
        context["svg_pattern_id"] = f"perf-{uuid.uuid4().hex[:12]}"
        return context

    class Meta:
        icon = "dots"
        label = "Perforated divider"
        admin_text = (
            "Horizontal dotted perforation; dots are largest in the middle row, "
            "smallest at the top and bottom."
        )
        template = "home/blocks/perforation_separator.html"


MAIN_SITE_STREAMBLOCK = blocks.StreamBlock(
    [
        ("heading", HeadingBlock()),
        ("paragraph", ParagraphBlock()),
        ("markdown", ArticleBodyMarkdownBlock()),
        ("image", ImageChooserBlock()),
        ("embed", EmbedBlock()),
        ("card", SiteCardBlock()),
        ("separator", LayoutSeparatorBlock()),
        ("perforation_separator", PerforationSeparatorBlock()),
        ("bento_grid_01", BentoGrid01Block()),
    ],
    use_json_field=True,
)

HOME_PAGE_STREAMBLOCK = MAIN_SITE_STREAMBLOCK
