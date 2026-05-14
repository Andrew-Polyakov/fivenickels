"""
Batch StreamField blocks into shadcn card layout payloads (rows + separators).
"""

from __future__ import annotations

from datetime import datetime, timezone as dt_timezone
from typing import Any

from wagtail.models import Page

from django.http import HttpRequest
from django.utils import timezone as django_timezone
from django.utils.formats import date_format

from home.blocks import _resolve_universal_tile_state
from home.alpaca_bars_client import fetch_recent_stock_bars
from home.alpaca_market_client import fetch_snapshots
from home.models import MarketTickerRow, TaggedContentPage
from home.ticker_utils import chip_json_payload


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
        "tags": list(spec.tags.values_list("name", flat=True)[:5]),
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


BENTO_LAYOUT_VERSION = 3


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
    return {"rows": cleaned, "layoutVersion": BENTO_LAYOUT_VERSION}


def _build_recent_articles_payload(
    buffer_blocks: list, parent_context: dict | None
) -> dict[str, Any]:
    """Produce a flat cards list (hero-first) for the RecentArticlesBlock."""
    used_page_ids: list[int] = []
    cards: list[dict[str, Any]] = []
    for block in buffer_blocks:
        if block.block_type != "card":
            continue
        entry = _card_entry_from_block_value(block.value, parent_context, used_page_ids)
        card = entry.get("card")
        if card:
            cards.append(card)
    return {"cards": cards}


def _has_separator_blocks(buffer: list) -> bool:
    return any(b.block_type == "separator" for b in buffer)


def _card_count_in_buffer(buffer: list) -> int:
    return sum(1 for b in buffer if b.block_type == "card")


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
    - {"type": "recent_articles", "payload": {...}}
    """
    buffer: list = []
    for block in stream:
        if block.block_type == "card":
            if not card_visible_for_sector(block.value, sector_slug):
                continue
            buffer.append(block)
            continue
        if block.block_type == "separator":
            buffer.append(block)
            continue

        if block.block_type == "bento_grid_01":
            if buffer:
                use_recent = (
                    not _has_separator_blocks(buffer) and _card_count_in_buffer(buffer) >= 2
                )
                if use_recent:
                    payload = _build_recent_articles_payload(buffer, parent_context)
                    buffer = []
                    if payload["cards"]:
                        yield {"type": "recent_articles", "payload": payload}
                else:
                    payload = build_layout_payload(buffer, parent_context)
                    buffer = []
                    if payload["rows"]:
                        yield {"type": "card_layout", "payload": payload}
            yield {"type": "bento_grid_01", "payload": _serialize_bentogrid01(block.value, parent_context)}
            continue

        if buffer:
            use_recent = (
                not _has_separator_blocks(buffer) and _card_count_in_buffer(buffer) >= 2
            )
            if use_recent:
                payload = _build_recent_articles_payload(buffer, parent_context)
                buffer = []
                if payload["cards"]:
                    yield {"type": "recent_articles", "payload": payload}
            else:
                payload = build_layout_payload(buffer, parent_context)
                buffer = []
                if payload["rows"]:
                    yield {"type": "card_layout", "payload": payload}

        yield {"type": "block", "block": block}

    if buffer:
        use_recent = (
            not _has_separator_blocks(buffer) and _card_count_in_buffer(buffer) >= 2
        )
        if use_recent:
            payload = _build_recent_articles_payload(buffer, parent_context)
            if payload["cards"]:
                yield {"type": "recent_articles", "payload": payload}
        else:
            payload = build_layout_payload(buffer, parent_context)
            if payload["rows"]:
                yield {"type": "card_layout", "payload": payload}


def _stock_symbols_from_bento_feature(val: dict[str, Any]) -> list[str]:
    raw = val.get("stock_symbols") or []
    out: list[str] = []
    for item in raw:
        if item is None:
            continue
        inner = getattr(item, "value", item)
        s = str(inner).strip().upper()
        if s:
            out.append(s)
    return out


def _dedupe_symbols(symbols: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for s in symbols:
        if s not in seen:
            seen.add(s)
            out.append(s)
    return out


STOCK_BARS_DEFAULT_TIMEFRAME = "1Day"
STOCK_BARS_LIMIT_DEFAULT = 180
STOCK_BARS_LIMIT_MIN = 90
STOCK_BARS_LIMIT_MAX = 360


def stock_bars_timeframe_from_cadence(cadence: object) -> str:
    """Map CMS cadence choice to Alpaca bars timeframe string."""
    c = str(cadence or "day").strip().lower()
    if c == "week":
        return "1Week"
    if c == "month":
        return "1Month"
    return "1Day"


def stock_bars_limit_clamped(raw: object) -> int:
    try:
        n = int(raw)
    except (TypeError, ValueError):
        n = STOCK_BARS_LIMIT_DEFAULT
    return max(STOCK_BARS_LIMIT_MIN, min(STOCK_BARS_LIMIT_MAX, n))
def _stock_bars_as_of_iso_utc(bars: list[dict[str, Any]]) -> str:
    """RFC3339 UTC for last bar (chart cadence) or current time if no bars."""
    if bars:
        t = bars[-1].get("t")
        if isinstance(t, (int, float)):
            return datetime.fromtimestamp(float(t), tz=dt_timezone.utc).strftime(
                "%Y-%m-%dT%H:%M:%SZ"
            )
    return django_timezone.now().astimezone(dt_timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def serialize_stock_bars_tile_payload(
    symbols: list[str],
    *,
    timeframe: str | None = None,
    limit: int | None = None,
) -> dict[str, Any]:
    """
    JSON payload for one ``stock_bars`` bento feature: chart bars + ticker chips.

    ``symbols`` should be non-empty tickers (any casing); they are normalized
    and deduped. First symbol drives the OHLC chart; every symbol gets a chip.
    """
    syms = _dedupe_symbols([(s or "").strip().upper() for s in symbols if (s or "").strip()])
    chart_sym = syms[0] if syms else ""
    tf = (timeframe or "").strip() or STOCK_BARS_DEFAULT_TIMEFRAME
    lim = stock_bars_limit_clamped(limit if limit is not None else STOCK_BARS_LIMIT_DEFAULT)
    bars: list[dict[str, Any]] = []
    bars_err: str | None = None
    if chart_sym:
        bars, bars_err = fetch_recent_stock_bars(chart_sym, timeframe=tf, limit=lim)
    out: dict[str, Any] = {
        "chart_symbol": chart_sym,
        "bars": bars,
        "chips": [],
        "bars_timeframe": tf,
        "bars_as_of_utc": _stock_bars_as_of_iso_utc(bars),
    }
    if bars_err:
        out["bars_error"] = bars_err

    rows_by = {
        r.symbol.upper(): r
        for r in MarketTickerRow.objects.filter(symbol__in=syms)
    }
    missing = [s for s in syms if s not in rows_by]
    snaps: dict = {}
    if missing:
        try:
            snaps = fetch_snapshots(missing)
        except Exception:
            snaps = {}

    chips: list[dict[str, str]] = []
    for s in syms:
        row = rows_by.get(s)
        met = snaps.get(s) if row is None else None
        chips.append(chip_json_payload(s, row=row, metrics=met))
    out["chips"] = chips
    return out


def _serialize_bentogrid01(block_value: dict, parent_context: dict | None = None) -> dict[str, Any]:
    """Convert a BentoGrid01Block value dict to a JSON-safe payload."""
    request = (parent_context or {}).get("request")
    used_page_ids: list[int] = []
    features: list[dict[str, Any]] = []
    for feat in block_value.get("features") or []:
        val = feat.value if hasattr(feat, "value") else feat
        header_type = str(val.get("header_type") or "image")
        entry: dict[str, Any] = {
            "header_type": header_type,
            "image_url_light": str(val.get("image_url_light") or ""),
            "image_url_dark": str(val.get("image_url_dark") or ""),
            "title": str(val.get("title") or ""),
            "description": str(val.get("description") or ""),
            "col_span": str(val.get("col_span") or "4"),
        }
        if header_type == "card":
            art = {
                "mode": val.get("mode") or "random",
                "specific_page": val.get("specific_page"),
                "tags": val.get("tags") or [],
            }
            state = _resolve_universal_tile_state(art, parent_context, list(used_page_ids))
            if state["kind"] == "article" and state.get("tile_page") is not None:
                tile_page = state["tile_page"]
                pk = getattr(tile_page, "pk", None)
                if pk is not None:
                    used_page_ids.append(int(pk))
                card = _article_card_dict(tile_page, request)
                entry["article"] = card
            else:
                entry["article"] = {"kind": "empty"}
            layout_raw = val.get("card_image_layout")
            if layout_raw in ("fit_under", "scales_fit_top"):
                entry["card_image_layout"] = layout_raw
        if header_type == "richtext":
            from wagtail.rich_text import expand_db_html

            raw_html = val.get("html")
            if hasattr(raw_html, "source"):
                raw_html = raw_html.source
            entry["html"] = expand_db_html(str(raw_html or ""))
        if header_type == "stock_bars":
            syms_raw = _stock_symbols_from_bento_feature(val)
            syms = _dedupe_symbols(syms_raw)
            cadence = val.get("stock_bars_cadence") or "day"
            tf = stock_bars_timeframe_from_cadence(cadence)
            lim = stock_bars_limit_clamped(val.get("stock_bars_limit"))
            stock_payload = serialize_stock_bars_tile_payload(syms, timeframe=tf, limit=lim)
            entry["chart_symbol"] = stock_payload["chart_symbol"]
            entry["bars"] = stock_payload["bars"]
            entry["chips"] = stock_payload["chips"]
            entry["bars_timeframe"] = stock_payload["bars_timeframe"]
            entry["bars_as_of_utc"] = stock_payload["bars_as_of_utc"]
            if stock_payload.get("bars_error"):
                entry["bars_error"] = stock_payload["bars_error"]
        features.append(entry)
    return {
        "badge_text": str(block_value.get("badge_text") or "Features"),
        "heading": str(block_value.get("heading") or ""),
        "features": features,
    }


def serialize_article_card_for_related(page: Page | None, request) -> dict[str, Any]:
    """Single-card payload for tag page carousel etc."""
    return _article_card_dict(page, request)
