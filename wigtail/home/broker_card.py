"""Serialization helpers for broker-facing UI (big trader card, etc.)."""

from __future__ import annotations

from typing import Any

from django.http import HttpRequest
from django.urls import reverse
from django.utils.text import slugify

from home.models import BrokerRating, ContentTag, TaggedContentPage

LOGO_KIND_FIELDS = {
    "rect": "logo_rect_url",
    "square": "logo_square_url",
    "favicon": "favicon_url",
}


def resolve_broker_display_logo(broker: BrokerRating, *, prefer_rect: bool = True) -> str:
    """Big card uses rectangular logo; fallback to favicon only."""
    if prefer_rect:
        for url in (broker.logo_rect_url, broker.favicon_url):
            if url:
                return url
        return ""
    for url in (broker.logo_square_url, broker.favicon_url):
        if url:
            return url
    return ""


def resolve_broker_detail_logo(broker: BrokerRating) -> str:
    """Detail page hero: largest available brand asset."""
    for url in (broker.logo_rect_url, broker.logo_square_url, broker.favicon_url):
        if url:
            return url
    return ""


def normalize_category_ratings(raw: Any) -> list[dict[str, Any]]:
    if not raw or not isinstance(raw, list):
        return []
    out: list[dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        label = str(item.get("label", "")).strip()
        if not label:
            continue
        try:
            score = float(item.get("score", 0))
        except (TypeError, ValueError):
            score = 0.0
        score = max(0.0, min(5.0, round(score * 2) / 2))
        out.append({"label": label, "score": score})
    return out


def resolve_broker_content_tags(broker: BrokerRating) -> list[ContentTag]:
    """Tags whose articles should appear on a broker detail carousel."""
    seen: set[int] = set()
    tags: list[ContentTag] = []

    def absorb(qs) -> None:
        for tag in qs:
            if tag.pk not in seen:
                tags.append(tag)
                seen.add(tag.pk)

    name = (broker.broker_name or "").strip()
    slug = (broker.slug or "").strip()

    name_candidates: list[str] = []
    if name:
        name_candidates.append(name)
        first = name.split()[0].strip()
        if first and first.lower() != name.lower():
            name_candidates.append(first)

    for candidate in name_candidates:
        absorb(ContentTag.objects.filter(name__iexact=candidate))

    slug_candidates: set[str] = set()
    for candidate in name_candidates:
        candidate_slug = slugify(candidate)
        if candidate_slug:
            slug_candidates.add(candidate_slug)
    if slug:
        slug_candidates.add(slug)
        stem = slug.split("-")[0]
        if len(stem) >= 3:
            absorb(ContentTag.objects.filter(slug__istartswith=stem))

    for candidate_slug in slug_candidates:
        absorb(ContentTag.objects.filter(slug=candidate_slug))

    return tags


def resolve_broker_content_tag(broker_name: str) -> ContentTag | None:
    """First tag for a bare broker name (legacy helper)."""
    name = (broker_name or "").strip()
    if not name:
        return None
    tag = ContentTag.objects.filter(name__iexact=name).first()
    if tag is not None:
        return tag
    slug = slugify(name)
    if not slug:
        return None
    return ContentTag.objects.filter(slug=slug).first()


def tagged_articles_for_broker(
    broker: BrokerRating | str,
    *,
    limit: int = 12,
) -> list[TaggedContentPage]:
    if isinstance(broker, str):
        rating = BrokerRating.objects.filter(broker_name__iexact=broker.strip()).first()
        if rating is None:
            tag = resolve_broker_content_tag(broker)
            if tag is None:
                return []
            tag_ids = [tag.pk]
        else:
            tag_ids = [t.pk for t in resolve_broker_content_tags(rating)]
    else:
        tag_ids = [t.pk for t in resolve_broker_content_tags(broker)]

    if not tag_ids:
        return []
    return list(
        TaggedContentPage.objects.live()
        .public()
        .filter(tags__in=tag_ids)
        .distinct()
        .order_by("-first_published_at")[:limit]
    )


def overview_text_for_broker(broker: BrokerRating) -> str:
    explicit = (broker.overview or "").strip()
    if explicit:
        return explicit
    parts = [p for p in [(broker.broker_type or "").strip(), (broker.regulation or "").strip()] if p]
    if not parts:
        return ""
    if len(parts) == 1:
        return parts[0]
    return f"{parts[0]}. Regulated by {parts[1]}."


def serialize_big_trader_card(broker: BrokerRating | None, request: HttpRequest | None) -> dict[str, Any] | None:
    if broker is None:
        return None
    slug = broker.slug or ""
    detail_url = reverse("forex_broker_detail", kwargs={"slug": slug}) if slug else ""
    upload_url = reverse("broker_upload_logo", kwargs={"pk": broker.pk})
    update_url = reverse("broker_rating_update", kwargs={"pk": broker.pk})
    is_staff = bool(
        request
        and getattr(request, "user", None)
        and request.user.is_authenticated
        and (request.user.is_staff or request.user.is_superuser)
    )
    return {
        "kind": "big_trader_card",
        "brokerId": broker.pk,
        "brokerName": broker.broker_name,
        "slug": slug,
        "detailUrl": detail_url,
        "website": broker.website or "",
        "faviconUrl": broker.favicon_url or "",
        "logoRectUrl": broker.logo_rect_url or "",
        "logoSquareUrl": broker.logo_square_url or "",
        "displayLogoUrl": resolve_broker_display_logo(broker),
        "overview": overview_text_for_broker(broker),
        "bestForHtml": broker.best_for or "",
        "overallRating": float(broker.overall_rating),
        "reviews": broker.reviews,
        "categoryRatings": normalize_category_ratings(broker.category_ratings),
        "uploadUrl": upload_url,
        "updateUrl": update_url,
        "isStaff": is_staff,
    }
