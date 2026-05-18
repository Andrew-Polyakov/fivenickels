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
from home.market_events import (
    calendar_max_rows_clamped,
    calendar_payload_for_bento,
    dividend_max_rows_clamped,
    dividends_payload_for_bento,
    resolve_dividend_symbols_from_bento,
    upcoming_calendar_days,
    upcoming_dividends,
)
from home.market_widgets import build_forex_quotes_payload, build_market_movers_payload
from home.models import MarketTickerRow, TaggedContentPage
from home.ticker_utils import chip_json_payload


def card_visible_for_sector(card_value: dict, sector_slug: str | None) -> bool:
    """Mirror legacy markdown_tiles sector filtering for homepage."""
    if not sector_slug:
        return True
    art = (card_value or {}).get("article") or {}
    term = art.get("section_term")
    return term is not None and getattr(term, "slug", None) == sector_slug


_BENTO_CARD_IMAGE_LAYOUT_CHOICES = frozenset(
    {
        "text_on_top",
        "text_on_left",
        "text_on_right",
        "text_only",
    }
)
_BENTO_CARD_IMAGE_SCALE_CHOICES = frozenset(
    {
        "scales_to_fit",
        "bleed_under",
    }
)


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
    """Drop leading separators and collapse consecutive doubles."""
    out: list[dict[str, Any]] = []
    for item in row_items:
        if item.get("type") == "separator":
            if not out:
                continue
            if out and out[-1].get("type") == "separator":
                continue
        out.append(item)
    while out and out[-1].get("type") == "separator":
        out.pop()
    return out


def build_rows_from_card_buffer(
    buffer_blocks: list,
    parent_context: dict | None,
) -> list[dict[str, Any]]:
    """
    Turn consecutive card/separator stream blocks into row descriptors for React.

    Each separator ends the current row and emits a full-width horizontal rule row.
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
            flush_row()
            rows.append({"kind": "separator", "orientation": "horizontal"})
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


def _should_cluster_cards_to_recent_articles(
    buffer: list, *, cluster_bare_cards_to_recent: bool
) -> bool:
    """When True, two or more bare card blocks become one adaptive Recent Articles mount."""
    if not cluster_bare_cards_to_recent:
        return False
    return not _has_separator_blocks(buffer) and _card_count_in_buffer(buffer) >= 2


def iter_main_site_stream_segments(
    stream,
    parent_context: dict | None,
    *,
    sector_slug: str | None = None,
    cluster_bare_cards_to_recent: bool = True,
):
    """
    Yield dicts:
    - {"type": "block", "block": bound_block}
    - {"type": "card_layout", "payload": {...}}
    - {"type": "recent_articles", "payload": {...}}

    When ``cluster_bare_cards_to_recent`` is False (e.g. home page), consecutive
    article cards are always rendered as ``card_layout`` so each CMS block stays
    a normal stream segment instead of one adaptive Recent Articles mount.
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
                use_recent = _should_cluster_cards_to_recent_articles(
                    buffer, cluster_bare_cards_to_recent=cluster_bare_cards_to_recent
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
            use_recent = _should_cluster_cards_to_recent_articles(
                buffer, cluster_bare_cards_to_recent=cluster_bare_cards_to_recent
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
        use_recent = _should_cluster_cards_to_recent_articles(
            buffer, cluster_bare_cards_to_recent=cluster_bare_cards_to_recent
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


def _normalize_bento_theme(raw: Any) -> str:
    t = str(raw or "default").lower().strip()
    if t in ("default", "inverted", "accent"):
        return t
    if t == "dark":
        return "inverted"
    return "default"


def _normalize_bento_block_background(raw: Any) -> str:
    bg = str(raw or "default").lower().strip()
    if bg in ("default", "edge_to_edge"):
        return bg
    return "default"


def _normalize_bento_grid_columns(raw: Any) -> int:
    try:
        n = int(raw if raw is not None else 3)
    except (TypeError, ValueError):
        n = 3
    return max(1, min(6, n))


def _normalize_bento_grid_rows(raw: Any) -> int:
    try:
        n = int(raw if raw is not None else 3)
    except (TypeError, ValueError):
        n = 3
    return max(1, min(3, n))


def _normalize_bento_col_span(raw: Any, grid_columns: int) -> int:
    """Map legacy string 4/8 or integers to 1..grid_columns."""
    if raw is None:
        return 1
    if isinstance(raw, int):
        return max(1, min(int(raw), grid_columns))
    s = str(raw).strip()
    if s == "8":
        return min(2, grid_columns)
    if s == "4":
        return 1
    try:
        return max(1, min(int(s), grid_columns))
    except (TypeError, ValueError):
        return 1


def _normalize_bento_row_span(raw: Any) -> int:
    try:
        n = int(raw if raw is not None else 1)
    except (TypeError, ValueError):
        n = 1
    return max(1, min(3, n))


def _normalize_bento_row(raw: Any) -> int | None:
    if raw is None or raw == "":
        return None
    try:
        n = int(raw)
    except (TypeError, ValueError):
        return None
    return n if n >= 1 else None


def _normalize_bento_col(raw: Any, grid_columns: int) -> int | None:
    if raw is None or raw == "":
        return None
    try:
        n = int(raw)
    except (TypeError, ValueError):
        return None
    if n < 1:
        return None
    return max(1, min(grid_columns, n))


def _normalize_bento_panel_size_array(raw: Any, expected_len: int | None = None) -> list[float] | None:
    if not isinstance(raw, list) or len(raw) == 0:
        return None
    nums: list[float] = []
    for value in raw:
        try:
            n = float(value)
        except (TypeError, ValueError):
            continue
        if n > 0:
            nums.append(n)
    if not nums:
        return None
    length = expected_len if expected_len is not None else len(nums)
    if len(nums) != length:
        return None
    total = sum(nums)
    if total <= 0:
        return None
    return [(n / total) * 100 for n in nums]


def _normalize_bento_col_panel_sizes_by_row(raw: Any, row_count: int) -> dict[str, list[float]] | None:
    if not isinstance(raw, dict):
        return None
    out: dict[str, list[float]] = {}
    for row_index in range(row_count):
        key = str(row_index)
        normalized = _normalize_bento_panel_size_array(raw.get(key))
        if normalized:
            out[key] = normalized
    return out or None


def _serialize_bentogrid01(block_value: dict, parent_context: dict | None = None) -> dict[str, Any]:
    """Convert a BentoGrid01Block value dict to a JSON-safe payload."""
    request = (parent_context or {}).get("request")
    grid_columns = _normalize_bento_grid_columns(block_value.get("grid_columns"))
    grid_rows = _normalize_bento_grid_rows(block_value.get("grid_rows"))
    used_page_ids: list[int] = []
    features: list[dict[str, Any]] = []
    for feat in block_value.get("features") or []:
        val = feat.value if hasattr(feat, "value") else feat
        header_type = str(val.get("header_type") or "image")
        if header_type == "animated_ui_block":
            continue
        entry: dict[str, Any] = {
            "header_type": header_type,
            "image_url_light": str(val.get("image_url_light") or ""),
            "image_url_dark": str(val.get("image_url_dark") or ""),
            "title": str(val.get("title") or ""),
            "description": str(val.get("description") or ""),
            "col_span": _normalize_bento_col_span(val.get("col_span"), grid_columns),
            "row_span": _normalize_bento_row_span(val.get("row_span")),
        }
        row_n = _normalize_bento_row(val.get("row"))
        if row_n is not None:
            entry["row"] = row_n
        col_n = _normalize_bento_col(val.get("col"), grid_columns)
        if col_n is not None:
            entry["col"] = col_n
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
            if layout_raw in _BENTO_CARD_IMAGE_LAYOUT_CHOICES:
                entry["card_image_layout"] = layout_raw
            scale_raw = val.get("card_image_scale")
            if scale_raw in _BENTO_CARD_IMAGE_SCALE_CHOICES:
                entry["card_image_scale"] = scale_raw
        if header_type == "fxbroker":
            broker = val.get("broker")
            if broker:
                entry["fxbroker"] = {
                    "kind": "fxbroker",
                    "brokerName": broker.broker_name,
                    "overallRating": float(broker.overall_rating),
                    "faviconUrl": broker.favicon_url or "",
                    "pageUrl": broker.page_url or "",
                }
            else:
                entry["fxbroker"] = {"kind": "empty"}
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
        if header_type == "forex_strip":
            entry["forex_quotes"] = build_forex_quotes_payload()
        if header_type == "market_movers":
            rows = list(
                MarketTickerRow.objects.filter(enabled=True).order_by("sort_order", "symbol")
            )
            block_region = val.get("market_region")
            movers_payload = build_market_movers_payload(
                rows,
                request,
                block_region=str(block_region) if block_region else None,
            )
            entry["market_movers"] = movers_payload["market_movers"]
            entry["market_mover_tabs"] = movers_payload["market_mover_tabs"]
            entry["selected_region"] = movers_payload["selected_region"]
        if header_type == "upcoming_dividends":
            syms = resolve_dividend_symbols_from_bento(val.get("dividend_symbols"))
            lim = dividend_max_rows_clamped(val.get("dividend_max_rows"))
            div_rows = list(upcoming_dividends(symbols=syms, limit=lim))
            entry["dividend_rows"] = dividends_payload_for_bento(div_rows)
        if header_type == "market_calendar":
            mkt = str(val.get("calendar_market") or "NASDAQ").strip().upper()
            lim = calendar_max_rows_clamped(val.get("calendar_max_rows"))
            cal_rows = list(upcoming_calendar_days(market=mkt, limit=lim))
            entry["calendar_rows"] = calendar_payload_for_bento(cal_rows)
        features.append(entry)
    block_bg_raw = block_value.get("block_background")
    if block_bg_raw is None and "section_padding" in block_value:
        block_bg_raw = "default"
    payload = {
        "badge_text": str(block_value.get("badge_text") or "Features"),
        "heading": str(block_value.get("heading") or ""),
        "theme": _normalize_bento_theme(block_value.get("theme")),
        "tile_style": str(block_value.get("tile_style") or "bordered"),
        "block_background": _normalize_bento_block_background(block_bg_raw),
        "show_badge": bool(block_value.get("show_badge", True)),
        "grid_columns": grid_columns,
        "grid_rows": grid_rows,
        "features": features,
    }
    row_panel_sizes = _normalize_bento_panel_size_array(
        block_value.get("row_panel_sizes"),
        grid_rows,
    )
    if row_panel_sizes:
        payload["row_panel_sizes"] = row_panel_sizes
    col_panel_sizes_by_row = _normalize_bento_col_panel_sizes_by_row(
        block_value.get("col_panel_sizes_by_row"),
        grid_rows,
    )
    if col_panel_sizes_by_row:
        payload["col_panel_sizes_by_row"] = col_panel_sizes_by_row
    return payload


def serialize_article_card_for_related(page: Page | None, request) -> dict[str, Any]:
    """Single-card payload for tag page carousel etc."""
    return _article_card_dict(page, request)
