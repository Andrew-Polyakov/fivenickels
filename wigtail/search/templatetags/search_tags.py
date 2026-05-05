from django import template

from search.utils import highlighted_preview_html, highlighted_title_html

register = template.Library()


@register.filter
def search_highlight_title(page, query):
    return highlighted_title_html(page, query or "")


@register.filter
def search_highlight_preview(page, query):
    return highlighted_preview_html(page, query or "", use_excerpt_window=True)
