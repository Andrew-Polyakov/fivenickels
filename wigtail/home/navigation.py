"""Shared header sector navigation (GICS terms + subsection URLs)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from home.gics_sectors import GICS_SECTOR_ORDER, GICS_SECTOR_SLUGS

if TYPE_CHECKING:
    from home.models import HomePage


def _norm_path(path: str) -> str:
    p = (path or "/").strip()
    if not p.startswith("/"):
        p = "/" + p
    return p.rstrip("/") or "/"


def build_sector_nav(home_page: HomePage | None) -> list[dict]:
    from home.models import SubsectionIndexPage, TaxonomyTerm
    from home.query import taxonomy_term_shown_in_sector_nav

    if home_page is None:
        return []
    terms = list(TaxonomyTerm.objects.filter(slug__in=GICS_SECTOR_SLUGS))
    terms.sort(key=lambda t: GICS_SECTOR_ORDER[t.slug])
    nav: list[dict] = []
    for t in terms:
        if not taxonomy_term_shown_in_sector_nav(home_page, t):
            continue
        index = (
            SubsectionIndexPage.objects.live()
            .public()
            .filter(section_term=t)
            .first()
        )
        nav.append(
            {
                "term": t,
                "subsection_url": index.url if index else None,
            }
        )
    return nav


def sector_nav_active_from_home_query(request, home_page: HomePage | None) -> str | None:
    """Active section slug from `?sector=` when the request path matches the home page URL."""
    if home_page is None:
        return None
    if _norm_path(request.path) != _norm_path(home_page.url):
        return None
    raw = (request.GET.get("sector") or "").strip()
    if raw in GICS_SECTOR_SLUGS:
        return raw
    return None
