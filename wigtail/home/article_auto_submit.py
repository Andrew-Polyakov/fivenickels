"""
Create TaggedContentPage drafts from automated article payloads and submit for moderation.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlparse

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils.html import escape
from django.utils.text import slugify
from wagtail.rich_text import RichText

from wagtail.models import Site

from home.alpaca_to_streamfield import truncate_title
from home.models import ContentTag, HomePage, TaggedContentPage, TaxonomyTerm


def _safe_http_url(url: str | None) -> str | None:
    if not url:
        return None
    u = url.strip()
    if not u:
        return None
    p = urlparse(u)
    if p.scheme in ("http", "https") and p.netloc:
        return u
    return None


def _slugify_token(raw: str) -> str:
    s = raw.strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")[:255] or "tag"


def _source_digest(source_url: str) -> str:
    return hashlib.sha256(source_url.encode("utf-8")).hexdigest()[:10]


def _slug_for_article(title: str, source_url: str) -> str:
    base = slugify((title or "article").strip())[:50] or "article"
    digest = _source_digest(source_url)
    return f"{base}-{digest}"


def _page_canonical_url(page: TaggedContentPage, *, fallback: str) -> str:
    def _is_preferred_host(url: str) -> bool:
        parsed = urlparse(url)
        host = (parsed.hostname or "").lower()
        if not host:
            return False
        if host == "localhost":
            return True
        if "." in host:
            return True
        return False

    parts = page.get_url_parts()
    if parts:
        _, root_url, page_path = parts
        candidate = f"{root_url.rstrip('/')}{page_path}"
        if _is_preferred_host(candidate):
            return candidate
    default_site = Site.objects.filter(is_default_site=True).first()
    if default_site:
        candidate = f"{default_site.root_url.rstrip('/')}/{page.slug}/"
        if _is_preferred_host(candidate):
            return candidate
    return fallback


def _md_escape_link_label(text: str) -> str:
    return text.replace("]", "\\]")


def build_paragraph_stream_body(
    *,
    content: str | None,
    summary: str | None,
    source: str | None,
    url: str | None,
) -> list[tuple[str, RichText]]:
    blocks: list[tuple[str, RichText]] = []
    main = (content or "").strip() or (summary or "").strip()
    if main:
        for para in re.split(r"\n\s*\n", main):
            text = para.strip()
            if text:
                blocks.append(("paragraph", RichText(f"<p>{escape(text)}</p>")))

    src_name = (source or "News").strip() or "News"
    link = _safe_http_url(url)
    tail = "Syndicated via Alpaca Markets news feed. Not investment advice."
    if link:
        attribution = RichText(
            "<p>"
            f'Source: <a href="{escape(link)}">{escape(src_name)}</a>. {escape(tail)}'
            "</p>"
        )
    else:
        attribution = RichText(f"<p>Source: {escape(src_name)}. {escape(tail)}</p>")
    blocks.append(("paragraph", attribution))
    return blocks


def build_markdown_body(
    *,
    content: str | None,
    summary: str | None,
    source: str | None,
    url: str | None,
) -> str:
    sections: list[str] = []
    main = (content or "").strip()
    if not main:
        main = (summary or "").strip()
    if main:
        sections.append(main)

    src_name = (source or "News").strip() or "News"
    link = _safe_http_url(url)
    tail = "Syndicated via Alpaca Markets news feed. Not investment advice."
    if link:
        sections.append(
            f"Source: [{_md_escape_link_label(src_name)}]({link}). {tail}"
        )
    else:
        sections.append(f"Source: {src_name}. {tail}")

    return "\n\n".join(s for s in sections if s)


def _resolve_section_term(section_slug: str | None) -> TaxonomyTerm:
    slug = (section_slug or settings.ARTICLE_SUBMIT_DEFAULT_SECTION_SLUG or "").strip()
    if not slug:
        raise ValueError("section_slug is required and no default is configured.")
    term = TaxonomyTerm.objects.filter(slug=slug).first()
    if term is None:
        raise ValueError(f"No TaxonomyTerm with slug={slug!r}.")
    return term


def _resolve_submit_user():
    user_model = get_user_model()
    username = (getattr(settings, "ARTICLE_SUBMIT_USER", None) or "").strip()
    if username:
        user = user_model.objects.filter(username__iexact=username).first()
        if user is not None:
            return user
    return user_model.objects.filter(is_superuser=True).order_by("id").first()


def _resolve_home_page() -> HomePage:
    home = HomePage.objects.live().public().first() or HomePage.objects.first()
    if home is None:
        raise RuntimeError("No HomePage found. Create one in Wagtail first.")
    return home


def _tags_for_payload(tag_names: list[str]) -> list[ContentTag]:
    tag_objs: list[ContentTag] = []
    seen: set[str] = set()
    for raw in tag_names:
        name = (raw or "").strip()
        if not name:
            continue
        slug = _slugify_token(name)
        if slug in seen:
            continue
        seen.add(slug)
        tag, _ = ContentTag.objects.get_or_create(
            slug=slug,
            defaults={"name": name[:255]},
        )
        tag_objs.append(tag)
    return tag_objs


@dataclass
class AutoSubmitItemResult:
    status: str
    canonical_url: str | None = None
    page_id: int | None = None
    slug: str | None = None
    reason: str | None = None
    error: str | None = None

    def as_dict(self) -> dict[str, Any]:
        data: dict[str, Any] = {"status": self.status}
        if self.canonical_url:
            data["canonical_url"] = self.canonical_url
        if self.page_id is not None:
            data["id"] = self.page_id
        if self.slug:
            data["slug"] = self.slug
        if self.reason:
            data["reason"] = self.reason
        if self.error:
            data["error"] = self.error
        return data


def submit_article_payload(payload: dict[str, Any]) -> AutoSubmitItemResult:
    source_url = _safe_http_url(payload.get("canonical_url") or payload.get("url"))
    if not source_url:
        return AutoSubmitItemResult(
            status="failed",
            error="canonical_url (or url) must be a valid http(s) URL.",
        )

    source_digest = _source_digest(source_url)
    existing = (
        TaggedContentPage.objects.filter(canonical_url=source_url).first()
        or TaggedContentPage.objects.filter(slug__endswith=f"-{source_digest}").first()
    )
    if existing is not None:
        return AutoSubmitItemResult(
            status="skipped",
            canonical_url=existing.canonical_url or source_url,
            page_id=existing.pk,
            slug=existing.slug,
            reason="duplicate",
        )

    title = truncate_title((payload.get("title") or payload.get("headline") or "").strip())
    tile_preview = (payload.get("tile_preview") or payload.get("summary") or "").strip()
    body_blocks = build_paragraph_stream_body(
        content=payload.get("content"),
        summary=payload.get("summary"),
        source=payload.get("source"),
        url=source_url,
    )

    try:
        section_term = _resolve_section_term(payload.get("section_slug"))
    except ValueError as exc:
        return AutoSubmitItemResult(
            status="failed",
            canonical_url=source_url,
            error=str(exc),
        )

    home = _resolve_home_page()
    submit_user = _resolve_submit_user()
    tag_names = payload.get("tags") or []
    if not isinstance(tag_names, list):
        tag_names = []
    symbols = payload.get("symbols") or []
    if isinstance(symbols, list):
        tag_names = [*tag_names, *symbols]

    slug = _slug_for_article(title, source_url)
    author_name = (payload.get("author_name") or settings.ARTICLE_SUBMIT_DEFAULT_AUTHOR_NAME or "").strip()

    page = TaggedContentPage(
        title=title,
        slug=slug,
        section_term=section_term,
        tile_preview=tile_preview,
        body=body_blocks,
        canonical_url=source_url,
        author_name=author_name,
        live=False,
    )
    home.add_child(instance=page)
    page.canonical_url = _page_canonical_url(page, fallback=source_url)
    page.save(update_fields=["canonical_url"])
    if page.live:
        page.live = False
        page.save(update_fields=["live"])
    tag_objs = _tags_for_payload([str(t) for t in tag_names])
    if tag_objs:
        page.tags.set(tag_objs)

    revision_kwargs: dict[str, Any] = {}
    if submit_user is not None:
        revision_kwargs["user"] = submit_user
    page.save_revision(**revision_kwargs)
    page.awaiting_moderation = True
    page.save(update_fields=["awaiting_moderation"])

    return AutoSubmitItemResult(
        status="created",
        canonical_url=page.canonical_url,
        page_id=page.pk,
        slug=page.slug,
    )


def submit_articles_batch(articles: list[dict[str, Any]]) -> dict[str, Any]:
    results: list[AutoSubmitItemResult] = []
    created = skipped = failed = 0
    for payload in articles:
        if not isinstance(payload, dict):
            results.append(
                AutoSubmitItemResult(status="failed", error="Each article must be an object.")
            )
            failed += 1
            continue
        try:
            with transaction.atomic():
                item = submit_article_payload(payload)
        except Exception as exc:  # pragma: no cover - defensive
            item = AutoSubmitItemResult(status="failed", error=str(exc))
        results.append(item)
        if item.status == "created":
            created += 1
        elif item.status == "skipped":
            skipped += 1
        else:
            failed += 1
    return {
        "created": created,
        "skipped": skipped,
        "failed": failed,
        "results": [r.as_dict() for r in results],
    }
