from django import template

from home.taxonomy import MARKET_NEWS_SLUG, taxonomy_prefix_path, wagtail_serve_taxonomy_url

register = template.Library()


@register.simple_tag
def taxonomy_term_nav_url(home_page, trail_slugs, row_depth, term):
    prefix = taxonomy_prefix_path(home_page)
    parts = (trail_slugs or [])[: max(0, row_depth - 1)] + [term.slug]
    return prefix + "/".join(parts) + "/"


@register.simple_tag
def taxonomy_root_nav_url(home_page, term):
    return taxonomy_prefix_path(home_page) + term.slug + "/"


@register.simple_tag
def taxonomy_market_news_url(home_page):
    return wagtail_serve_taxonomy_url(home_page, MARKET_NEWS_SLUG)
