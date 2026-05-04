from django.core.validators import RegexValidator

from wagtail import blocks
from wagtail.embeds.blocks import EmbedBlock
from wagtail.images.blocks import ImageChooserBlock
from wagtail.snippets.blocks import SnippetChooserBlock
from wagtailmarkdown.blocks import MarkdownBlock

_TILE_SLUG_VALIDATOR = RegexValidator(
    r"^[-a-zA-Z0-9_]*$",
    "Use letters, numbers, hyphens, and underscores only (empty allowed).",
)


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


MAIN_SITE_STREAMBLOCK = blocks.StreamBlock(
    [
        ("heading", HeadingBlock()),
        ("paragraph", ParagraphBlock()),
        ("image", ImageChooserBlock()),
        ("embed", EmbedBlock()),
        ("markdown_tiles", MarkdownTilesSection()),
    ],
    use_json_field=True,
)

# Backwards-compatible alias (same block definition in DB).
HOME_PAGE_STREAMBLOCK = MAIN_SITE_STREAMBLOCK
