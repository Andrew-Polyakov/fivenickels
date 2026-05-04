from django.core.validators import RegexValidator

from wagtail import blocks
from wagtail.embeds.blocks import EmbedBlock
from wagtail.images.blocks import ImageChooserBlock
from wagtail.snippets.blocks import SnippetChooserBlock
from wagtailmarkdown.blocks import MarkdownBlock

from home.query import get_random_pages_for_section_prioritized

_TILE_SLUG_VALIDATOR = RegexValidator(
    r"^[-a-zA-Z0-9_]*$",
    "Use letters, numbers, hyphens, and underscores only (empty allowed).",
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
    # Turbo nav frame (`site_nav_frame.html`) uses `active_node`; header context uses
    # `site_nav_active_node` — same role as `taxonomy_active_node` on full drilldown.
    t = pc.get("active_node")
    if t is not None:
        return t
    t = pc.get("site_nav_active_node")
    if t is not None:
        return t
    return pc.get("sector_taxonomy_term")


def _pick_one_tile_page(cell_value, term, exclude_ids):
    if cell_value.get("mode") == "manual" and cell_value.get("manual_page"):
        return cell_value["manual_page"].specific
    if term is None:
        return None
    picked = get_random_pages_for_section_prioritized(
        term,
        limit=1,
        exclude_ids=exclude_ids or None,
    )
    return picked[0] if picked else None


def split_column_context(col, parent_context):
    """Resolve one full-width split column to tile_page and/or rich markdown dict."""
    if not col:
        return {"kind": "article", "tile_page": None, "rich": None}
    kind = col.get("content_kind") or "article"
    if kind == "rich":
        return {"kind": "rich", "tile_page": None, "rich": col.get("rich")}
    article = col.get("article") or {}
    term = _resolve_section_term(
        {**article, "section_term": article.get("section_term")},
        parent_context,
    )
    return {
        "kind": "article",
        "tile_page": _pick_one_tile_page(article, term, []),
        "rich": None,
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


class MarkdownTileBlock(blocks.StructBlock):
    title = blocks.CharBlock(required=False, max_length=200)
    slug = blocks.CharBlock(
        required=False,
        max_length=200,
        label="Anchor slug",
        help_text="Optional id for deep links (#your-slug). Leave blank to derive from title when possible.",
        validators=[_TILE_SLUG_VALIDATOR],
    )
    taxonomy = SnippetChooserBlock(
        "home.TaxonomyTerm",
        required=False,
        label="Taxonomy",
    )
    image = ImageChooserBlock(required=False)
    body = MarkdownBlock(label="Markdown", help_text="Markdown for this tile.")

    class Meta:
        icon = "doc-full"
        label_format = "{title}"


class RichSplitTileBlock(MarkdownTileBlock):
    class Meta:
        icon = "doc-full"
        label = "Rich content tile"
        label_format = "{title}"
        template = "home/blocks/rich_split_tile.html"


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


class MarkdownTilesSection(blocks.StructBlock):
    tiles = blocks.ListBlock(
        MarkdownTileBlock(),
        min_num=1,
        max_num=12,
        label="Tiles",
    )

    class Meta:
        icon = "grip"
        label = "Markdown tiles"
        template = "home/blocks/markdown_tiles.html"


class QuadCellBlock(blocks.StructBlock):
    mode = blocks.ChoiceBlock(
        choices=[
            ("random", "Random from section"),
            ("manual", "Pick article"),
        ],
        default="random",
    )
    manual_page = blocks.PageChooserBlock(
        target_model="home.TaggedContentPage",
        required=False,
    )

    class Meta:
        icon = "placeholder"
        label = "Quad cell"


class ArticleTileSourceBlock(blocks.StructBlock):
    """Shared fields for random/manual article tiles (big tiles, split columns, rows)."""

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
        help_text="Leave blank to use the current page section, home ?sector=, or taxonomy hub.",
    )
    mode = blocks.ChoiceBlock(
        choices=[
            ("random", "Random from section"),
            ("manual", "Pick article"),
        ],
        default="random",
    )
    manual_page = blocks.PageChooserBlock(
        target_model="home.TaggedContentPage",
        required=False,
    )

    class Meta:
        icon = "placeholder"


class SplitColumnBlock(blocks.StructBlock):
    content_kind = blocks.ChoiceBlock(
        choices=[
            ("article", "Article preview"),
            ("rich", "Rich markdown tile"),
        ],
        default="article",
        label="Content type",
    )
    article = ArticleTileSourceBlock(
        required=False,
        label="Article preview",
    )
    rich = MarkdownTileBlock(
        required=False,
        label="Rich markdown tile",
    )

    class Meta:
        icon = "placeholder"
        label = "Column"


class BigTileQuadBlock(blocks.StructBlock):
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
        help_text="Leave blank to use the current page section, home ?sector=, or taxonomy hub.",
    )
    cells = blocks.ListBlock(
        QuadCellBlock(),
        min_num=4,
        max_num=4,
        label="Four cells (2×2 grid)",
    )

    def get_context(self, value, parent_context=None):
        context = super().get_context(value, parent_context)
        term = _resolve_section_term(value, parent_context)
        exclude: list[int] = []
        pages = []
        for cell in value.get("cells") or []:
            p = _pick_one_tile_page(cell, term, exclude)
            pages.append(p)
            if p is not None:
                exclude.append(p.pk)
        context["quad_pages"] = pages
        return context

    class Meta:
        icon = "grip"
        label = "Big tile 2×2"
        template = "home/blocks/big_tile_quad.html"


class BigTileQuattroRowBlock(blocks.StructBlock):
    """Four article cells in one horizontal row (responsive)."""

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
        help_text="Leave blank to use the current page section, home ?sector=, or taxonomy hub.",
    )
    cells = blocks.ListBlock(
        QuadCellBlock(),
        min_num=4,
        max_num=4,
        label="Four cells (one row)",
    )

    def get_context(self, value, parent_context=None):
        context = super().get_context(value, parent_context)
        term = _resolve_section_term(value, parent_context)
        exclude: list[int] = []
        pages = []
        for cell in value.get("cells") or []:
            p = _pick_one_tile_page(cell, term, exclude)
            pages.append(p)
            if p is not None:
                exclude.append(p.pk)
        context["quad_pages"] = pages
        return context

    class Meta:
        icon = "grip"
        label = "Big tile row (4 in a row)"
        template = "home/blocks/big_tile_quattro_row.html"


class BigTileSingleBlock(ArticleTileSourceBlock):
    def get_context(self, value, parent_context=None):
        context = super().get_context(value, parent_context)
        term = _resolve_section_term(value, parent_context)
        context["tile_page"] = _pick_one_tile_page(value, term, [])
        return context

    class Meta:
        icon = "image"
        label = "Big tile (single)"
        template = "home/blocks/big_tile_single.html"


class SplitRandomPreviewBlock(BigTileSingleBlock):
    class Meta:
        icon = "image"
        label = "Random or article preview"
        template = "home/blocks/split_random_preview.html"


class BigTilePanelBlock(blocks.StreamBlock):
    single = BigTileSingleBlock()
    quad = BigTileQuadBlock()

    class Meta:
        max_num = 1
        label = "Single or 2×2 tile"


class BigTileRowBlock(blocks.StructBlock):
    panels = blocks.ListBlock(
        BigTilePanelBlock(),
        min_num=1,
        max_num=2,
        label="Big tiles (max two per row)",
    )

    class Meta:
        icon = "horizontalrule"
        label = "Big tile row (legacy)"
        template = "home/blocks/big_tile_row.html"


class BigTileRowSingleBlock(blocks.StructBlock):
    tile = ArticleTileSourceBlock(label="Tile")

    def get_context(self, value, parent_context=None):
        context = super().get_context(value, parent_context)
        t = value.get("tile") or {}
        term = _resolve_section_term(
            {**t, "section_term": t.get("section_term")},
            parent_context,
        )
        context["tile_page"] = _pick_one_tile_page(t, term, [])
        return context

    class Meta:
        icon = "horizontalrule"
        label = "Big tile row (single)"
        template = "home/blocks/big_tile_row_single.html"


class BigTileRowTwinBlock(blocks.StructBlock):
    left = ArticleTileSourceBlock(label="Left tile")
    right = ArticleTileSourceBlock(label="Right tile")

    def get_context(self, value, parent_context=None):
        context = super().get_context(value, parent_context)
        lv = value.get("left") or {}
        rv = value.get("right") or {}
        term_l = _resolve_section_term(
            {**lv, "section_term": lv.get("section_term")},
            parent_context,
        )
        left_page = _pick_one_tile_page(lv, term_l, [])
        exclude = [left_page.pk] if left_page else []
        term_r = _resolve_section_term(
            {**rv, "section_term": rv.get("section_term")},
            parent_context,
        )
        context["left_tile_page"] = left_page
        context["right_tile_page"] = _pick_one_tile_page(rv, term_r, exclude)
        return context

    class Meta:
        icon = "horizontalrule"
        label = "Big tile row (twin)"
        template = "home/blocks/big_tile_row_twin.html"


class FullWidthSplitRowBlock(blocks.StructBlock):
    left = SplitColumnBlock(label="Left column")
    right = SplitColumnBlock(label="Right column")

    def get_context(self, value, parent_context=None):
        context = super().get_context(value, parent_context)
        context["left_col"] = split_column_context(value.get("left"), parent_context)
        context["right_col"] = split_column_context(value.get("right"), parent_context)
        return context

    class Meta:
        icon = "horizontalrule"
        label = "Full width split (2 tiles)"
        template = "home/blocks/full_width_split_row.html"


MAIN_SITE_STREAMBLOCK = blocks.StreamBlock(
    [
        ("heading", HeadingBlock()),
        ("paragraph", ParagraphBlock()),
        ("markdown", ArticleBodyMarkdownBlock()),
        ("image", ImageChooserBlock()),
        ("embed", EmbedBlock()),
        ("markdown_tiles", MarkdownTilesSection()),
        ("big_tile_row", BigTileRowBlock()),
        ("big_tile_row_single", BigTileRowSingleBlock()),
        ("big_tile_row_twin", BigTileRowTwinBlock()),
        ("big_tile_quad_2x2", BigTileQuadBlock()),
        ("big_tile_quattro_row", BigTileQuattroRowBlock()),
        ("full_width_split_row", FullWidthSplitRowBlock()),
    ],
    use_json_field=True,
)

# Backwards-compatible alias (same block definition in DB).
HOME_PAGE_STREAMBLOCK = MAIN_SITE_STREAMBLOCK
