"""Template tags for article body markdown (ticker chips + enriched HTML)."""

from __future__ import annotations

from django import template

from home.article_ticker_markup import render_article_markdown_block_html

register = template.Library()


@register.simple_tag
def render_article_markdown_stream_block(markdown_content: str | None):
    """Render MAIN_SITE ``markdown`` block with symbol row + ticker chip enrichment."""
    return render_article_markdown_block_html(markdown_content or "")
