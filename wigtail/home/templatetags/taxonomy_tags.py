from django import template

from home.taxonomy import taxonomy_prefix_path

register = template.Library()


@register.simple_tag
def taxonomy_term_nav_url(home_page, trail_slugs, row_depth, term):
    prefix = taxonomy_prefix_path(home_page)
    parts = (trail_slugs or [])[: max(0, row_depth - 1)] + [term.slug]
    return prefix + "/".join(parts) + "/"


@register.simple_tag
def taxonomy_root_nav_url(home_page, term):
    return taxonomy_prefix_path(home_page) + term.slug + "/"
