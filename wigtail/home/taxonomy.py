"""Hierarchical taxonomy navigation (header turbo-frame + URL helpers)."""

from __future__ import annotations

from typing import TYPE_CHECKING
from urllib.parse import urlparse

from django.http import Http404, HttpResponse
from django.template.loader import render_to_string

if TYPE_CHECKING:
    from home.models import HomePage, TaxonomyTerm

# Top header row: fixed three roots (DB siblings; GICS sectors appear under Market News in UI only).
MARKET_NEWS_SLUG = "market-news"
TOP_ROW_SLUGS: tuple[str, ...] = (
    MARKET_NEWS_SLUG,
    "opinions",
    "personal-finance",
)
TOP_ROW_SLUGS_SET = frozenset(TOP_ROW_SLUGS)


def _home_path_only(home_page: HomePage) -> str:
    u = home_page.get_url() or "/"
    if u.startswith("http://") or u.startswith("https://"):
        u = urlparse(u).path or "/"
    return u


def taxonomy_prefix_path(home_page: HomePage) -> str:
    """Path prefix for routable `_taxonomy/` URLs under the home page (relative path)."""
    base = _home_path_only(home_page).rstrip("/")
    return f"{base}/_taxonomy/" if base else "/_taxonomy/"


def taxonomy_roots_for_nav(home_page: HomePage | None):
    """Nav top row: Market News, Opinions, Personal Finance (order fixed; not content-gated)."""
    from home.models import TaxonomyTerm

    qs = TaxonomyTerm.objects.filter(slug__in=TOP_ROW_SLUGS_SET, is_visible=True)
    by_slug = {t.slug: t for t in qs}
    return [by_slug[s] for s in TOP_ROW_SLUGS if s in by_slug]


def virtual_children_for(term: TaxonomyTerm, *, home_page: HomePage | None):
    """
    Children shown in the nav under ``term``.
    Market News lists GICS sectors (DB siblings) filtered like the old sector row.
    Other terms use real tree children.
    """
    from home.gics_sectors import GICS_SECTORS, GICS_SECTOR_SLUGS
    from home.models import TaxonomyTerm
    from home.query import (
        home_stream_includes_taxonomy_term,
        taxonomy_term_has_public_pages,
    )

    if term.slug != MARKET_NEWS_SLUG:
        return list(term.get_visible_children())

    def gics_shown(t: TaxonomyTerm) -> bool:
        if taxonomy_term_has_public_pages(t):
            return True
        return bool(
            home_page and home_stream_includes_taxonomy_term(home_page, t)
        )

    # Real tree children of Market News (e.g. Forex) — not from the GICS flat slug list.
    extras = [
        t
        for t in term.get_visible_children()
        if t.slug not in GICS_SECTOR_SLUGS
    ]

    out: list = []
    for t in extras:
        out.append(t)

    for _name, slug in GICS_SECTORS:
        if slug not in GICS_SECTOR_SLUGS:
            continue
        t = TaxonomyTerm.objects.filter(slug=slug, is_visible=True).first()
        if t is None or not gics_shown(t):
            continue
        out.append(t)
    return out


def parse_taxonomy_slugs_from_request(request, home_page: HomePage) -> list[str]:
    prefix = taxonomy_prefix_path(home_page)
    p = request.path
    if not p.startswith(prefix):
        return []
    rest = p[len(prefix) :].strip("/")
    if not rest:
        return []
    return [s for s in rest.split("/") if s]


def resolve_taxonomy_trail(
    slugs: list[str],
    *,
    home_page: HomePage | None = None,
) -> list[TaxonomyTerm] | None:
    from home.gics_sectors import GICS_SECTOR_SLUGS
    from home.models import TaxonomyTerm
    from home.query import (
        home_stream_includes_taxonomy_term,
        taxonomy_term_has_public_pages,
    )

    if not slugs:
        return None
    root = (
        TaxonomyTerm.get_root_nodes()
        .filter(slug=slugs[0], is_visible=True)
        .first()
    )
    if root is None or root.slug not in TOP_ROW_SLUGS_SET:
        return None
    trail: list[TaxonomyTerm] = [root]
    current = root
    for slug in slugs[1:]:
        if current.slug == MARKET_NEWS_SLUG and slug in GICS_SECTOR_SLUGS:
            nxt = TaxonomyTerm.objects.filter(slug=slug, is_visible=True).first()
            if nxt is None:
                return None
            if home_page is not None:
                if not (
                    taxonomy_term_has_public_pages(nxt)
                    or home_stream_includes_taxonomy_term(home_page, nxt)
                ):
                    return None
        else:
            nxt = current.get_children().filter(slug=slug, is_visible=True).first()
            if nxt is None:
                return None
        trail.append(nxt)
        current = nxt
    return trail


def build_nav_rows(
    trail: list[TaxonomyTerm],
    *,
    home_page: HomePage,
) -> list[dict]:
    roots = list(taxonomy_roots_for_nav(home_page))
    rows: list[dict] = [{"depth": 1, "nodes": roots, "parent_id": None}]
    for i, node in enumerate(trail):
        rows.append(
            {
                "depth": i + 2,
                "nodes": virtual_children_for(node, home_page=home_page),
                "parent_id": node.pk,
            }
        )
    return rows


def taxonomy_breadcrumb_items(home_page: HomePage, trail: list) -> list[dict]:
    """Breadcrumb rows for taxonomy drilldown: each item has ``term`` and absolute path ``url``."""
    prefix = taxonomy_prefix_path(home_page)
    out: list[dict] = []
    for i in range(len(trail)):
        parts = [t.slug for t in trail[: i + 1]]
        url = prefix + "/".join(parts) + "/"
        out.append({"term": trail[i], "url": url})
    return out


def build_site_nav_context(
    home_page: HomePage,
    slug_parts: list[str],
) -> dict:
    if not slug_parts:
        raise Http404("Empty taxonomy path")
    trail = resolve_taxonomy_trail(slug_parts, home_page=home_page)
    if trail is None:
        raise Http404("Unknown taxonomy path")
    active = trail[-1] if trail else None
    nav_rows = build_nav_rows(trail, home_page=home_page)
    return {
        "home_page": home_page,
        "taxonomy_prefix": taxonomy_prefix_path(home_page),
        "nav_rows": nav_rows,
        "active_node": active,
        "trail": trail,
        "trail_slugs": [n.slug for n in trail],
    }


def get_site_nav_template_context(request, home_page: HomePage) -> dict:
    slug_parts = parse_taxonomy_slugs_from_request(request, home_page)
    if slug_parts:
        try:
            return build_site_nav_context(home_page, slug_parts)
        except Http404:
            slug_parts = []
    if not slug_parts:
        roots = list(taxonomy_roots_for_nav(home_page))
        return {
            "home_page": home_page,
            "taxonomy_prefix": taxonomy_prefix_path(home_page),
            "nav_rows": [{"depth": 1, "nodes": roots}],
            "active_node": None,
            "trail": [],
            "trail_slugs": [],
        }


def render_site_nav_frame(request, home_page: HomePage, slug_parts: list[str]) -> HttpResponse:
    if slug_parts:
        try:
            ctx = build_site_nav_context(home_page, slug_parts)
        except Http404:
            return HttpResponse("Not found", status=404, content_type="text/plain")
    else:
        roots = list(taxonomy_roots_for_nav(home_page))
        ctx = {
            "home_page": home_page,
            "taxonomy_prefix": taxonomy_prefix_path(home_page),
            "nav_rows": [{"depth": 1, "nodes": roots}],
            "active_node": None,
            "trail": [],
            "trail_slugs": [],
        }
    html = render_to_string("home/taxonomy/site_nav_frame.html", ctx, request=request)
    return HttpResponse(html)
