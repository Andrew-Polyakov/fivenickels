from wagtail import blocks
from wagtail.embeds.blocks import EmbedBlock
from wagtail.images.blocks import ImageChooserBlock
from wagtail.snippets.blocks import SnippetChooserBlock
from wagtailmarkdown.blocks import MarkdownBlock

from home.query import get_random_pages_for_section_prioritized


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
    if mode == "top_viewed":
        return None
    if mode == "manual_article":
        mode = "manual"
    elif mode == "random_category":
        mode = "random"
    if mode == "manual" and cell_value.get("manual_page"):
        return cell_value["manual_page"].specific
    if term is None:
        return None
    picked = get_random_pages_for_section_prioritized(
        term,
        limit=1,
        exclude_ids=exclude_ids or None,
    )
    return picked[0] if picked else None


def _resolve_universal_tile_state(tile_value, parent_context, exclude_ids=None):
    tile_value = tile_value or {}
    mode = tile_value.get("mode") or "random_category"
    if mode == "manual":
        mode = "manual_article"
    elif mode == "random":
        mode = "random_category"
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
    legacy_pick_value = {**tile_value, "mode": "manual" if mode == "manual_article" else "random"}
    tile_page = _pick_one_tile_page(legacy_pick_value, term, exclude_ids or [])
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
            ("random_category", "Random from category"),
            ("manual_article", "Pick article"),
            ("top_viewed", "Top viewed (stub)"),
        ],
        default="random_category",
    )
    manual_page = blocks.PageChooserBlock(
        target_model="home.TaggedContentPage",
        required=False,
    )

    class Meta:
        icon = "placeholder"


class SiteCardBlock(blocks.StructBlock):
    article = ArticleTileSourceBlock(label="Article source")

    class Meta:
        icon = "doc-empty"
        label = "Article card"


class LayoutSeparatorBlock(blocks.StructBlock):
    orientation = blocks.ChoiceBlock(
        choices=[
            ("horizontal", "Horizontal"),
            ("vertical", "Vertical"),
        ],
        default="horizontal",
        label="Orientation",
    )

    class Meta:
        icon = "horizontalrule"
        label = "Layout separator"


MAIN_SITE_STREAMBLOCK = blocks.StreamBlock(
    [
        ("heading", HeadingBlock()),
        ("paragraph", ParagraphBlock()),
        ("markdown", ArticleBodyMarkdownBlock()),
        ("image", ImageChooserBlock()),
        ("embed", EmbedBlock()),
        ("card", SiteCardBlock()),
        ("separator", LayoutSeparatorBlock()),
    ],
    use_json_field=True,
)

HOME_PAGE_STREAMBLOCK = MAIN_SITE_STREAMBLOCK
