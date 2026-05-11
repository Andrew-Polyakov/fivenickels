"""
Batch StreamField blocks into shadcn card layout payloads (rows + separators).
"""

from __future__ import annotations

from typing import Any

from wagtail.models import Page

from django.http import HttpRequest
from django.utils.formats import date_format

from home.blocks import _resolve_universal_tile_state
from home.models import TaggedContentPage


def card_visible_for_sector(card_value: dict, sector_slug: str | None) -> bool:
    """Mirror legacy markdown_tiles sector filtering for homepage."""
    if not sector_slug:
        return True
    art = (card_value or {}).get("article") or {}
    term = art.get("section_term")
    return term is not None and getattr(term, "slug", None) == sector_slug


def _article_card_dict(page: Page | None, request) -> dict[str, Any]:
    if page is None:
        return {"kind": "empty"}
    spec = page.specific
    if not isinstance(spec, TaggedContentPage):
        return {"kind": "empty"}
    title = spec.title
    href = spec.get_url(request=request) if request is not None else spec.url
    excerpt = spec.listing_preview_markdown()
    image_url = ""
    if spec.hero_image_id:
        try:
            rend = spec.hero_image.get_rendition("width-640")
            image_url = rend.url
        except Exception:
            image_url = ""
    catalyst = (spec.catalyst or "").strip()
    return {
        "kind": "article",
        "title": title,
        "href": href or "",
        "excerpt": excerpt or "",
        "imageUrl": image_url,
        "tags": list(spec.tags.values_list("name", flat=True)[:3]),
        "authorName": spec.card_author_name(),
        "publishedAt": date_format(spec.first_published_at, "F j, Y") if spec.first_published_at else "",
        "catalyst": catalyst,
    }


def _tag_ids_from_art(art: dict) -> list[int]:
    ids: list[int] = []
    for t in art.get("tags") or []:
        pk = getattr(t, "pk", None)
        if pk is not None:
            ids.append(int(pk))
    return ids


def _source_config_from_art_block(art: dict, request: HttpRequest | None) -> dict[str, Any]:
    """Payload shape mirrored in front-end ``ContentSourceConfig``."""
    art = art or {}
    mode_raw = art.get("mode") or "random"
    mode = str(mode_raw).strip() if mode_raw else "random"
    # Align with legacy block values expected by React ``ContentSourceConfig``.
    if mode == "manual_article":
        mode = "specific_article"
    elif mode == "random_category":
        mode = "random"
    tag_ids = _tag_ids_from_art(art)
    cfg: dict[str, Any] = {"mode": mode, "tagIds": tag_ids}
    specific_page = art.get("specific_page")
    if specific_page is not None:
        sp = specific_page.specific
        href = ""
        try:
            href = (
                sp.get_url(request=request) if request is not None else getattr(sp, "url", "") or ""
            )
        except Exception:
            href = getattr(sp, "url", "") or ""
        cfg["specificArticleId"] = sp.pk
        cfg["specificArticleTitle"] = sp.title or ""
        cfg["specificArticleUrl"] = href or ""
    else:
        cfg["specificArticleId"] = None
        cfg["specificArticleTitle"] = ""
        cfg["specificArticleUrl"] = ""
    return cfg


def _attach_source_config(card_payload: dict[str, Any], source_config: dict[str, Any]) -> dict[str, Any]:
    merged = dict(card_payload)
    merged["sourceConfig"] = source_config
    return merged


def _card_entry_from_block_value(
    card_value: dict,
    parent_context: dict | None,
    used_page_ids: list[int],
) -> dict[str, Any]:
    art = (card_value or {}).get("article") or {}
    request = (parent_context or {}).get("request")
    source_cfg = _source_config_from_art_block(art, request)
    exclude = list(used_page_ids)
    state = _resolve_universal_tile_state(art, parent_context, exclude)
    if state["kind"] == "stub":
        return {
            "type": "card",
            "card": _attach_source_config({"kind": "stub", "message": state.get("message") or ""}, source_cfg),
        }
    if state["kind"] == "article":
        tile_page = state.get("tile_page")
        if tile_page is not None:
            pk = getattr(tile_page, "pk", None)
            if pk is not None:
                used_page_ids.append(int(pk))
        payload = _article_card_dict(tile_page, request)
        return {"type": "card", "card": _attach_source_config(payload, source_cfg)}
    return {"type": "card", "card": _attach_source_config({"kind": "empty"}, source_cfg)}


def _normalize_row_items(row_items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Drop redundant vertical separators at row edges; collapse doubles."""
    out: list[dict[str, Any]] = []
    for item in row_items:
        if item.get("type") == "separator" and item.get("orientation") == "vertical":
            if not out:
                continue
            if out and out[-1].get("type") == "separator":
                continue
        out.append(item)
    while out and out[-1].get("type") == "separator" and out[-1].get("orientation") == "vertical":
        out.pop()
    return out


def build_rows_from_card_buffer(
    buffer_blocks: list,
    parent_context: dict | None,
) -> list[dict[str, Any]]:
    """
    Turn consecutive card/separator stream blocks into row descriptors for React.

    Horizontal separator ends the current row (and emits a full-width horizontal rule row).
    Vertical separators become divider entries between cards within a row.
    """
    rows: list[dict[str, Any]] = []
    current_row: list[dict[str, Any]] = []
    used_page_ids: list[int] = []

    def flush_row():
        nonlocal current_row
        if not current_row:
            return
        normalized = _normalize_row_items(current_row)
        if normalized:
            rows.append({"kind": "row", "items": normalized})
        current_row = []

    for block in buffer_blocks:
        if block.block_type == "separator":
            orient = (block.value.get("orientation") or "horizontal").strip().lower()
            if orient == "horizontal":
                flush_row()
                rows.append({"kind": "separator", "orientation": "horizontal"})
            else:
                current_row.append({"type": "separator", "orientation": "vertical"})
        elif block.block_type == "card":
            current_row.append(_card_entry_from_block_value(block.value, parent_context, used_page_ids))
        else:
            flush_row()
    flush_row()
    return rows


def build_layout_payload(buffer_blocks: list, parent_context: dict | None) -> dict[str, Any]:
    rows = build_rows_from_card_buffer(buffer_blocks, parent_context)
    # Keep separators meaningful: no leading/trailing separators and no doubles.
    cleaned: list[dict[str, Any]] = []
    for row in rows:
        if row.get("kind") == "separator":
            if not cleaned:
                continue
            if cleaned[-1].get("kind") == "separator":
                continue
        cleaned.append(row)
    while cleaned and cleaned[-1].get("kind") == "separator":
        cleaned.pop()
    return {"rows": cleaned}


def iter_main_site_stream_segments(
    stream,
    parent_context: dict | None,
    *,
    sector_slug: str | None = None,
):
    """
    Yield dicts:
    - {"type": "block", "block": bound_block}
    - {"type": "card_layout", "payload": {...}}
    """
    buffer: list = []
    for block in stream:
        if block.block_type == "card":
            if not card_visible_for_sector(block.value, sector_slug):
                continue
            buffer.append(block)
            continue
        if block.block_type == "separator":
            if buffer:
                buffer.append(block)
            else:
                buffer.append(block)
            continue

        if buffer:
            payload = build_layout_payload(buffer, parent_context)
            buffer = []
            if payload["rows"]:
                yield {"type": "card_layout", "payload": payload}

        yield {"type": "block", "block": block}

    if buffer:
        payload = build_layout_payload(buffer, parent_context)
        if payload["rows"]:
            yield {"type": "card_layout", "payload": payload}


def serialize_article_card_for_related(page: Page | None, request) -> dict[str, Any]:
    """Single-card payload for tag page carousel etc."""
    return _article_card_dict(page, request)
