"""Tag badge payloads for public article meta row."""

from __future__ import annotations

from urllib.parse import urlencode


def build_tag_archive_href(routable_home, tag, section_slug: str | None) -> str | None:
    """Site-relative tag archive URL, or None when the tag is not linkable."""
    if routable_home is None or not tag.slug:
        return None
    try:
        href = routable_home.reverse_subpage("tag_archive", args=(tag.slug,))
    except Exception:
        base = (routable_home.url or "/").rstrip("/")
        href = f"{base}/tags/{tag.slug}/"
    if section_slug:
        query = urlencode({"section": section_slug})
        href = f"{href}?{query}"
    return href


def section_term_public_href(term, home_page) -> str | None:
    """Site-relative taxonomy drilldown URL for an article's section term."""
    if term is None or home_page is None:
        return None
    link_page = getattr(term, "link_page", None)
    if link_page is not None:
        url = link_page.url
        return url if url else None
    from home.taxonomy import taxonomy_prefix_path

    from home.taxonomy import trail_slugs_from_section_term

    slugs = trail_slugs_from_section_term(term)
    if not slugs:
        return None
    return taxonomy_prefix_path(home_page) + "/".join(slugs) + "/"


def article_tags_context(page, routable_home) -> list[dict]:
    """Context list for tagged_content_page meta row badge mounts."""
    section_slug = page.section_term.slug if page.section_term_id else None
    tags = []
    for tag in page.tags.all():
        href = build_tag_archive_href(routable_home, tag, section_slug)
        tags.append(
            {
                "name": tag.name,
                "href": href,
                "inactive": href is None,
            }
        )
    return tags
