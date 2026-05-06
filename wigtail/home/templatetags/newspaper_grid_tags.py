from django import template

from home.blocks import build_newspaper_grid_tree

register = template.Library()


@register.inclusion_tag("home/blocks/newspaper_grid.html", takes_context=True)
def render_newspaper_grid(context, value, page_id, page_model, stream_field, block_index):
    """Render a newspaper grid with ``grid_tree`` (manual ``{% include %}`` skips StructBlock.get_context)."""
    return {
        "request": context.get("request"),
        "grid_tree": build_newspaper_grid_tree(value, context),
        "page_id": page_id,
        "page_model": page_model,
        "stream_field": stream_field,
        "block_index": block_index,
    }
