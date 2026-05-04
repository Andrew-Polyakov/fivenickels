from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from home.models import TaggedContentPage, TaxonomyTerm


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
