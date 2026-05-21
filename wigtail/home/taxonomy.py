"""Hierarchical taxonomy navigation (header turbo-frame + URL helpers)."""

from __future__ import annotations

from difflib import get_close_matches
from typing import TYPE_CHECKING

from django.http import Http404, HttpResponse
from django.template.loader import render_to_string

if TYPE_CHECKING:
    from home.models import HomePage, TaxonomyTerm

# Market News hosts GICS sectors in nav UI only (not as separate top-level tabs).
MARKET_NEWS_SLUG = "market-news"

# Seed rows for migrations and ``ensure_top_row_taxonomy_terms`` (slug, display name, sort_order).
TOP_ROW_SEED: tuple[tuple[str, str, int], ...] = (
    (MARKET_NEWS_SLUG, "Market News", 5),
    ("opinions", "Opinions", 8),
    ("personal-finance", "Personal Finance", 9),
)
TOP_ROW_SEED_SLUGS = frozenset(slug for slug, _, _ in TOP_ROW_SEED)

# Hardcoded top nav / site map entry (not a TaxonomyTerm).
BROKERS_NAV_SLUG = "brokers"
BROKERS_NAV_NAME = "Brokers"
BROKERS_NAV_ID = "hardcoded:brokers"


def brokers_nav_href() -> str:
    from django.urls import reverse

    return reverse("forex_ratings")


def is_brokers_nav_active(request) -> bool:
    from django.urls import Resolver404, resolve

    try:
        match = resolve(request.path_info)
    except Resolver404:
        return False
    return match.url_name == "forex_ratings"


def brokers_nav_menu_item(request) -> dict:
    return {
        "id": BROKERS_NAV_ID,
        "name": BROKERS_NAV_NAME,
        "slug": BROKERS_NAV_SLUG,
        "href": brokers_nav_href(),
        "active": is_brokers_nav_active(request),
        "removable": False,
        "inNav": True,
        "children": [],
    }


def brokers_nav_hamburger_term() -> dict:
    return {
        "id": BROKERS_NAV_ID,
        "name": BROKERS_NAV_NAME,
        "slug": BROKERS_NAV_SLUG,
        "href": brokers_nav_href(),
        "inNav": True,
        "inSitemap": True,
        "removable": False,
        "children": [],
    }


def taxonomy_display_name_for_slug(slug: str) -> str:
    from home.gics_sectors import GICS_SECTORS

    for name, sector_slug in GICS_SECTORS:
        if sector_slug == slug:
            return name
    cleaned = (slug or "").replace("-", " ").strip()
    return cleaned.title() or slug


def resolve_import_section_slug(raw_slug: str | None) -> str:
    """Map an import slug to an existing taxonomy slug or a normalized new slug."""
    from django.utils.text import slugify

    from home.gics_sectors import GICS_SECTOR_SLUGS
    from home.models import TaxonomyTerm

    normalized = slugify((raw_slug or "").strip())[:255]
    if not normalized:
        return ""

    known = set(GICS_SECTOR_SLUGS) | TOP_ROW_SEED_SLUGS
    known.update(taxonomy_nav_root_queryset().values_list("slug", flat=True))
    if normalized in known:
        return normalized

    existing = TaxonomyTerm.objects.filter(slug=normalized).values_list("slug", flat=True).first()
    if existing:
        return existing

    pool = sorted(known | set(TaxonomyTerm.objects.values_list("slug", flat=True)))
    matches = get_close_matches(normalized, pool, n=1, cutoff=0.74)
    if matches:
        return matches[0]

    tokens = {
        token
        for token in normalized.split("-")
        if token and token not in {"and", "the", "of", "for", "a", "an"}
    }
    if tokens:
        best_slug = ""
        best_score = 0
        for known_slug in pool:
            known_tokens = {
                token
                for token in known_slug.split("-")
                if token and token not in {"and", "the", "of", "for", "a", "an"}
            }
            overlap = len(tokens & known_tokens)
            if overlap > best_score:
                best_score = overlap
                best_slug = known_slug
        if best_slug and best_score >= 1:
            return best_slug

    return normalized


def ensure_taxonomy_term(slug: str) -> TaxonomyTerm:
    """Return an existing taxonomy term or create a visible root term for imports."""
    from django.utils.text import slugify

    from home.gics_sectors import GICS_SECTOR_ORDER
    from home.models import TaxonomyTerm

    normalized = resolve_import_section_slug(slug)
    if not normalized:
        raise ValueError("section_slug must not be empty.")

    existing = TaxonomyTerm.objects.filter(slug=normalized).first()
    if existing is not None:
        return existing

    term = TaxonomyTerm(
        name=taxonomy_display_name_for_slug(normalized)[:255],
        slug=normalized,
        is_visible=True,
        is_nav=True,
        sort_order=GICS_SECTOR_ORDER.get(normalized, 0),
    )
    term.save()
    TaxonomyTerm.fix_tree()
    return term


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


def taxonomy_nav_root_queryset():
    """Visible depth-1 roots for header/footer nav (GICS sectors excluded from top row)."""
    from home.gics_sectors import GICS_SECTOR_SLUGS
    from home.models import TaxonomyTerm

    return (
        TaxonomyTerm.objects.filter(depth=1, is_visible=True)
        .exclude(slug__in=GICS_SECTOR_SLUGS)
        .exclude(slug=BROKERS_NAV_SLUG)
        .order_by("sort_order", "name")
    )


def taxonomy_roots_for_nav(home_page: HomePage | None):
    """Nav top row: configurable via depth-1 ``TaxonomyTerm`` rows (not content-gated)."""
    return list(taxonomy_nav_root_queryset())


def virtual_children_for(
    term: TaxonomyTerm, *, home_page: HomePage | None, for_nav: bool = False
):
    """
    Children shown in the nav under ``term``.
    Market News lists GICS sectors (DB siblings) filtered like the old sector row.
    Other terms use real tree children.

    When ``for_nav`` is True the GICS gating is skipped: every visible sector
    appears in the menu even if no public articles tag it yet (used by site
    header dropdowns and depth >= 2 trail rows). Featured chip strips on the
    home page leave the gating in place so empty sectors stay hidden there.
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
        if for_nav:
            return True
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
    require_content: bool = True,
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
    if first in GICS_SECTOR_SLUGS:
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
            if require_content and home_page is not None:
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
                "nodes": virtual_children_for(node, home_page=home_page, for_nav=True),
                "parent_id": node.pk,
            }
        )
    return rows


def _nav_path_slugs_for_term(trail: list, row_depth: int, term) -> list[str]:
    """Slug path for ``term`` as rendered on nav row ``row_depth`` (1-based)."""
    if row_depth <= 1:
        return [term.slug]
    return [t.slug for t in trail[: row_depth - 1]] + [term.slug]


def _taxonomy_href(home_page: HomePage, slug_parts: list[str]) -> str:
    prefix = taxonomy_prefix_path(home_page)
    return prefix + "/".join(slug_parts) + "/"


def term_nav_href(request, home_page: HomePage, trail: list, row_depth: int, term):
    """Public URL for a taxonomy term row item (link_page or taxonomy path)."""
    if term.link_page_id and term.link_page:
        return term.link_page.get_url(request=request)
    parts = _nav_path_slugs_for_term(trail, row_depth, term)
    return _taxonomy_href(home_page, parts)


def term_child_nav_href(
    request, home_page: HomePage, trail: list, parent_row_depth: int, parent_term, child_term
) -> str:
    if child_term.link_page_id and child_term.link_page:
        return child_term.link_page.get_url(request=request)
    base = _nav_path_slugs_for_term(trail, parent_row_depth, parent_term)
    return _taxonomy_href(home_page, base + [child_term.slug])


def term_is_nav_active(term, trail_slugs: list[str], page) -> bool:
    if term.slug in trail_slugs:
        return True
    if page is not None:
        if term.link_page_id and page.pk == term.link_page_id:
            return True
        spec = getattr(page, "specific", page)
        st = getattr(spec, "section_term", None)
        if st is not None and st.id == term.id:
            return True
    return False


def _serialize_menu_child(
    request,
    home_page: HomePage,
    trail: list,
    trail_slugs: list[str],
    parent_row_depth: int,
    parent_term,
    child_term,
    page,
) -> dict:
    return {
        "id": str(child_term.pk),
        "name": child_term.name,
        "slug": child_term.slug,
        "href": term_child_nav_href(
            request,
            home_page,
            trail,
            parent_row_depth,
            parent_term,
            child_term,
        ),
        "description": "",
        "active": term_is_nav_active(child_term, trail_slugs, page),
        "inNav": bool(getattr(child_term, "is_nav", True)),
    }


def _serialize_menu_item(
    request,
    home_page: HomePage,
    trail: list,
    trail_slugs: list[str],
    row: dict,
    term,
    page,
) -> dict:
    row_depth = row["depth"]
    kids = virtual_children_for(term, home_page=home_page, for_nav=True)
    children = [
        _serialize_menu_child(
            request,
            home_page,
            trail,
            trail_slugs,
            row_depth,
            term,
            c,
            page,
        )
        for c in kids
    ]
    return {
        "id": str(term.pk),
        "name": term.name,
        "slug": term.slug,
        "href": term_nav_href(request, home_page, trail, row_depth, term),
        "active": term_is_nav_active(term, trail_slugs, page),
        "removable": True,
        "inNav": bool(getattr(term, "is_nav", True)),
        "children": children,
    }


def build_site_nav_menu_payload(
    request,
    home_page: HomePage,
    nav_rows: list[dict],
    trail_slugs: list[str],
    trail: list,
    *,
    page=None,
) -> list[dict]:
    """
    JSON for React shadcn NavigationMenu.

    Depth 1: items include ``children`` for dropdown panels; ``createRoot`` /
    ``afterCreateVisit`` drive top-level "Add new".

    Depth >= 2: same item shape (href, active, removable) but ``children`` is
    always empty — React renders these rows as always-visible strips below
    the menu.
    """
    out: list[dict] = []
    for row in nav_rows:
        depth = row["depth"]
        items = [
            _serialize_menu_item(
                request,
                home_page,
                trail,
                trail_slugs,
                row,
                term,
                page,
            )
            for term in row["nodes"]
        ]
        if depth == 1:
            items = [brokers_nav_menu_item(request)] + items
        if depth != 1:
            items = [{**it, "children": []} for it in items]
            entry: dict = {
                "depth": depth,
                "parentId": row.get("parent_id"),
                "items": items,
                "placeholder": "",
                "createRoot": False,
                "afterCreateVisit": None,
            }
        else:
            entry = {
                "depth": 1,
                "parentId": row.get("parent_id"),
                "items": items,
                "placeholder": "Add new",
                "createRoot": True,
            }
            if not trail_slugs:
                first_root = taxonomy_nav_root_queryset().first()
                entry["afterCreateVisit"] = (
                    wagtail_serve_taxonomy_url(home_page, first_root.slug)
                    if first_root
                    else None
                )
            else:
                entry["afterCreateVisit"] = None
        out.append(entry)
    return out


def build_hamburger_nav_payload(home_page) -> dict:
    """Build JSON payload for the hamburger navigation menu.

    GICS sectors are injected as children of Market News to match the header nav
    UI convention (``GICS sectors appear under Market News in UI only``).
    """
    from home.gics_sectors import GICS_SECTOR_SLUGS
    from home.models import TaxonomyTerm

    all_terms = list(TaxonomyTerm.objects.filter(is_visible=True).order_by("path"))
    steplen = TaxonomyTerm.steplen
    by_path = {t.path: t for t in all_terms}

    def slug_path_for(term) -> list[str]:
        slugs: list[str] = []
        path = term.path
        for i in range(0, len(path), steplen):
            t = by_path.get(path[: i + steplen])
            if t:
                slugs.append(t.slug)
        return slugs

    def term_href(term) -> str:
        if home_page:
            return _taxonomy_href(home_page, slug_path_for(term))
        return "/" + "/".join(slug_path_for(term)) + "/"

    def build_node(term, extra_children: list | None = None) -> dict:
        db_children = [
            build_node(c)
            for c in all_terms
            if c.depth == term.depth + 1
            and c.path.startswith(term.path)
            and len(c.path) == len(term.path) + steplen
        ]
        children = db_children + (extra_children or [])
        return {
            "id": str(term.pk),
            "name": term.name,
            "slug": term.slug,
            "href": term_href(term),
            "inNav": bool(getattr(term, "is_nav", True)),
            "inSitemap": bool(getattr(term, "is_sitemap", False)),
            "removable": True,
            "children": children,
        }

    roots = [t for t in all_terms if t.depth == 1]
    gics_roots = [t for t in roots if t.slug in GICS_SECTOR_SLUGS]
    top_roots = [
        t
        for t in roots
        if t.slug not in GICS_SECTOR_SLUGS and t.slug != BROKERS_NAV_SLUG
    ]

    gics_nodes = [build_node(g) for g in gics_roots]

    terms = [brokers_nav_hamburger_term()]
    for t in top_roots:
        extra = gics_nodes if (t.slug == MARKET_NEWS_SLUG and gics_nodes) else None
        terms.append(build_node(t, extra_children=extra))

    return {"terms": terms}


def resolve_page_for_nav(request):
    """Best-effort current page for nav-active matching (non-taxonomy URLs)."""
    try:
        from wagtail.models import Page

        return Page.find_for_request(request, request.path)
    except Exception:
        return None


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
    *,
    require_content: bool = True,
) -> dict:
    if not slug_parts:
        raise Http404("Empty taxonomy path")
    trail = resolve_taxonomy_trail(slug_parts, home_page=home_page, require_content=require_content)
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
            "nav_rows": [{"depth": 1, "nodes": roots, "parent_id": None}],
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
            "nav_rows": [{"depth": 1, "nodes": roots, "parent_id": None}],
            "active_node": None,
            "trail": [],
            "trail_slugs": [],
        }
    page = resolve_page_for_nav(request)
    ctx["page"] = page
    ctx["site_nav_menu_payload"] = build_site_nav_menu_payload(
        request,
        ctx["home_page"],
        ctx["nav_rows"],
        ctx.get("trail_slugs") or [],
        ctx.get("trail") or [],
        page=page,
    )
    html = render_to_string("home/taxonomy/site_nav_frame.html", ctx, request=request)
    return HttpResponse(html)
