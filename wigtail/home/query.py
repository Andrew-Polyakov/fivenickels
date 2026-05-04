from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from home.models import HomePage, TaggedContentPage, TaxonomyTerm


def taxonomy_term_has_public_pages(term: TaxonomyTerm) -> bool:
    from home.models import TaggedContentPage

    return (
        TaggedContentPage.objects.live()
        .public()
        .filter(section_term=term)
        .exists()
    )


def home_stream_includes_taxonomy_term(home_page: HomePage, term: TaxonomyTerm) -> bool:
    """True if a markdown tile on the home stream uses this taxonomy term."""
    for block in home_page.body:
        if block.block_type != "markdown_tiles":
            continue
        for tile in block.value["tiles"]:
            tax = tile.get("taxonomy")
            if tax is not None and tax.pk == term.pk:
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
