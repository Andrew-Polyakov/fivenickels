from __future__ import annotations

import random
from typing import TYPE_CHECKING

from django.db.models import Q, Value
from django.db.models.functions import Coalesce

if TYPE_CHECKING:
    from home.models import HomePage, TaggedContentPage, TaxonomyTerm


def build_home_page_display_items(body_stream, sector_slug: str | None) -> list[dict]:
    """
    Legacy hook for tests: linear stream items with optional sector filtering on ``card`` blocks.

    Prefer ``iter_main_site_stream_segments`` + ``render_main_site_stream`` in templates.
    """
    from home.card_layout import card_visible_for_sector

    items: list[dict] = []
    for idx, child in enumerate(body_stream):
        if child.block_type == "card" and not card_visible_for_sector(child.value, sector_slug):
            continue
        items.append({"mode": "block", "child": child, "stream_index": idx})
    return items


def taxonomy_term_has_public_pages(term: TaxonomyTerm) -> bool:
    from home.models import TaggedContentPage

    return (
        TaggedContentPage.objects.live()
        .public()
        .filter(section_term=term)
        .exists()
    )


def home_stream_includes_taxonomy_term(home_page: HomePage, term: TaxonomyTerm) -> bool:
    """True if an article card on the home stream pins this taxonomy term as section override."""
    for block in home_page.body:
        if block.block_type != "card":
            continue
        art = block.value.get("article") or {}
        st = art.get("section_term")
        if st is not None and st.pk == term.pk:
            return True
    return False


def taxonomy_term_shown_in_sector_nav(home_page: HomePage, term: TaxonomyTerm) -> bool:
    """Non-empty for homepage nav: tagged pages exist and/or home tiles reference the term."""
    return taxonomy_term_has_public_pages(term) or home_stream_includes_taxonomy_term(
        home_page, term
    )


def get_recent_pages_for_section(
    section_term: TaxonomyTerm,
    *,
    limit: int = 12,
    exclude_page_id: int | None = None,
):
    from home.models import TaggedContentPage

    qs = (
        TaggedContentPage.objects.live()
        .public()
        .filter(section_term=section_term)
        .order_by("-first_published_at")
    )
    if exclude_page_id is not None:
        qs = qs.exclude(pk=exclude_page_id)
    return list(qs[:limit])


def get_random_pages_for_section(
    section_term: TaxonomyTerm,
    *,
    limit: int = 12,
):
    """Random live public articles for a taxonomy subsection (landing grids)."""
    from home.models import TaggedContentPage

    return list(
        TaggedContentPage.objects.live()
        .public()
        .filter(section_term=section_term)
        .order_by("?")[:limit]
    )


def get_random_pages_for_section_prioritized(
    section_term: TaxonomyTerm,
    *,
    limit: int = 1,
    exclude_ids: list[int] | None = None,
):
    """
    Live public articles for a section: higher ``tile_priority`` first (blank = 10),
    then stable tie-break (newer publish first, then pk). Optionally exclude page ids.

    Ordering is deterministic so newspaper-grid “random” panes and quad cells do not swap
    articles on every full page load (which made inline title edits look like disappearing tiles).
    """
    from home.models import TaggedContentPage

    qs = (
        TaggedContentPage.objects.live()
        .public()
        .filter(section_term=section_term)
        .annotate(_effective_priority=Coalesce("tile_priority", Value(10)))
        .order_by("-_effective_priority", "-first_published_at", "pk")
    )
    if exclude_ids:
        qs = qs.exclude(pk__in=exclude_ids)
    return list(qs[:limit])


def get_related_pages_for_ticker(tag_slug: str, *, limit: int = 24):
    """Live articles whose ContentTag slug matches the ticker (e.g. nvda for NVDA)."""
    from home.models import TaggedContentPage

    slug = (tag_slug or "").strip().lower()
    if not slug:
        return []

    return list(
        TaggedContentPage.objects.live()
        .public()
        .filter(tags__slug=slug)
        .order_by("-first_published_at")
        .distinct()[:limit]
    )


def _section_term_ids_for_taxonomy_scope(sector) -> list[int]:
    """
    ``TaggedContentPage.section_term`` points at sector nodes (e.g. GICS ``energy``),
    never at the Market News container. For that root, include all GICS sector ids.
    For other nodes, include the term and its descendants in the MP tree.
    """
    from home.gics_sectors import GICS_SECTOR_SLUGS
    from home.models import TaxonomyTerm
    from home.taxonomy import MARKET_NEWS_SLUG

    if sector.slug == MARKET_NEWS_SLUG:
        ids: list[int] = []
        for slug in GICS_SECTOR_SLUGS:
            t = TaxonomyTerm.objects.filter(slug=slug, is_visible=True).first()
            if t is not None:
                ids.append(t.pk)
        return ids
    ids = [sector.pk]
    ids.extend(sector.get_descendants().values_list("pk", flat=True))
    return ids


def list_category_terms_for_sector(sector, *, home_page=None) -> list:
    """
    Featured chip labels: children of ``sector``. Market News uses the same virtual
    GICS list as nav (not MP-tree children, which may be empty).
    """
    from home.taxonomy import MARKET_NEWS_SLUG, virtual_children_for

    if sector.slug == MARKET_NEWS_SLUG:
        return virtual_children_for(sector, home_page=home_page)
    return list(sector.get_visible_children())


def pick_four_pages_prioritized_with_fallback(base_qs):
    """
    Take up to four live articles: highest ``tile_priority`` (blank = 10) first,
    random within the same band; then lower bands until four picks or exhaustion.
    """
    qs = base_qs.select_related("taxonomy_category", "section_term").annotate(
        _effective_priority=Coalesce("tile_priority", Value(10))
    )
    pages = list(qs)
    buckets: dict[int, list] = {i: [] for i in range(1, 11)}
    for p in pages:
        pr = int(getattr(p, "_effective_priority", 10))
        pr = max(1, min(10, pr))
        buckets[pr].append(p)
    for k in buckets:
        random.shuffle(buckets[k])
    picked: list = []
    for band in range(10, 0, -1):
        for p in buckets[band]:
            if len(picked) >= 4:
                return picked
            picked.append(p)
    return picked


def pad_featured_quad_slots(pages: list) -> list:
    """Exactly four entries for the 2×2 grid; ``None`` pads empty cells."""
    out = list(pages[:4])
    while len(out) < 4:
        out.append(None)
    return out


def featured_quad_pages_for_sector(
    sector,
    category_slug: str | None,
    *,
    home_page=None,
) -> tuple[list, str | None]:
    """
    Featured quad for a sector hub or taxonomy drilldown: optional ``category``
    matches a chip (direct child of ``sector``, or virtual GICS child under Market News).

    Articles match a chip when ``section_term`` *or* ``taxonomy_category`` equals that
    term (sector chips vs. fine-grained categories under a sector).
    """
    from home.models import TaggedContentPage

    if sector is None:
        return pad_featured_quad_slots([]), None

    term_ids = _section_term_ids_for_taxonomy_scope(sector)
    base = TaggedContentPage.objects.live().public().filter(
        section_term_id__in=term_ids,
    )
    cats = list_category_terms_for_sector(sector, home_page=home_page)
    child_slugs = {t.slug for t in cats}
    selected: str | None = None
    raw = (category_slug or "").strip().lower()
    if raw and raw != "all" and raw in child_slugs:
        chip = next((t for t in cats if t.slug == raw), None)
        if chip is not None:
            selected = raw
            base = base.filter(Q(section_term=chip) | Q(taxonomy_category=chip))
    picked = pick_four_pages_prioritized_with_fallback(base)
    return pad_featured_quad_slots(picked), selected


def get_similar_pages(page: TaggedContentPage, *, limit: int = 24) -> list:
    """Other live pages sharing at least one tag, ordered by overlap then recency."""
    from home.models import TaggedContentPage

    tag_ids = list(page.tags.values_list("id", flat=True))
    if not tag_ids:
        return []

    page_tag_ids = set(tag_ids)
    candidates = (
        TaggedContentPage.objects.live()
        .public()
        .filter(tags__in=tag_ids)
        .exclude(pk=page.pk)
        .distinct()
        .prefetch_related("tags")
        .order_by("-first_published_at")[:120]
    )
    scored: list[tuple[int, float, TaggedContentPage]] = []
    for p in candidates:
        shared = page_tag_ids.intersection({t.id for t in p.tags.all()})
        n = len(shared)
        if n == 0:
            continue
        ts = p.first_published_at.timestamp() if p.first_published_at else 0.0
        scored.append((n, ts, p))
    scored.sort(key=lambda x: (-x[0], -x[1]))
    return [p for _, __, p in scored[:limit]]
