"""Hierarchical taxonomy navigation (header turbo-frame + URL helpers)."""

from __future__ import annotations

from typing import TYPE_CHECKING

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

# Seed rows for migrations and ``ensure_top_row_taxonomy_terms`` (slug, display name, sort_order).
TOP_ROW_SEED: tuple[tuple[str, str, int], ...] = (
    (MARKET_NEWS_SLUG, "Market News", 5),
    ("opinions", "Opinions", 8),
    ("personal-finance", "Personal Finance", 9),
)


def ensure_top_row_taxonomy_terms() -> None:
    """
    Ensure Market News, Opinions, and Personal Finance terms exist.

    Idempotent: safe when terms were deleted or DB was copied without migrations.
    """
    from home.models import TaxonomyTerm

    for slug, name, sort_order in TOP_ROW_SEED:
        existing = TaxonomyTerm.objects.filter(slug=slug).first()
        if existing is not None:
            TaxonomyTerm.objects.filter(pk=existing.pk).update(
                name=name,
                sort_order=sort_order,
                is_visible=True,
            )
            continue
        last = TaxonomyTerm.get_last_root_node()
        if last is not None:
            last.add_sibling(
                "sorted-sibling",
                name=name,
                slug=slug,
                sort_order=sort_order,
                is_visible=True,
            )
        else:
            TaxonomyTerm.add_root(
                name=name,
                slug=slug,
                sort_order=sort_order,
                is_visible=True,
            )
    TaxonomyTerm.fix_tree()


def wagtail_serve_taxonomy_url(
    home_page: HomePage, path_within_taxonomy: str = ""
) -> str:
    """
    Site-relative URL for HomePage routable ``_taxonomy/...`` views.

    Uses ``reverse("wagtail_serve", ...)`` with the same path shape Wagtail uses
    internally (``Page.get_url_parts``), so links work when the home URL is not
    ``/`` (e.g. ``/home/_taxonomy/...``).
    """
    from django.urls import NoReverseMatch, reverse

    parts = home_page.get_url_parts(request=None)
    root_rel = ""
    if parts and parts[2]:
        root_rel = parts[2].strip("/")

    inner = (path_within_taxonomy or "").strip("/")
    tail = f"_taxonomy/{inner}/" if inner else "_taxonomy/"
    if root_rel:
        serve_arg = f"{root_rel}/{tail}".replace("//", "/")
    else:
        serve_arg = tail

    try:
        return reverse("wagtail_serve", args=(serve_arg,))
    except NoReverseMatch:
        from urllib.parse import urljoin

        home_path = "/"
        if parts and parts[2]:
            home_path = parts[2]
            if not home_path.endswith("/"):
                home_path += "/"
        return urljoin(home_path, tail)


def taxonomy_prefix_path(home_page: HomePage) -> str:
    """Path prefix for routable `_taxonomy/` URLs under the home page (matches ``wagtail_serve``)."""
    return wagtail_serve_taxonomy_url(home_page, "")


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
    first = slugs[0]
    if first not in TOP_ROW_SLUGS_SET:
        return None
    # Match inline_create_taxonomy_term: top-row sections are identified by slug,
    # not strictly tree roots (reparented terms must still resolve).
    root = TaxonomyTerm.objects.filter(slug=first, is_visible=True).first()
    if root is None:
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
