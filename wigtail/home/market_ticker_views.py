"""Staff JSON API for MarketTickerRow management on profile page."""

from __future__ import annotations

import json
from typing import Any

from django.contrib.auth.decorators import login_required
from django.db.models import Q
from django.http import HttpRequest, JsonResponse
from django.views.decorators.http import require_GET, require_http_methods

from home.models import MarketTickerRow
from home.permissions import staff_article_access

MAX_TICKERS_PAGE = 100


def _staff_only(request: HttpRequest) -> JsonResponse | None:
    if not staff_article_access(request.user):
        return JsonResponse({"error": "Forbidden"}, status=403)
    return None


def _row_payload(row: MarketTickerRow) -> dict[str, Any]:
    vol = row.day_volume
    pct = row.percent_change
    return {
        "id": row.pk,
        "symbol": row.symbol,
        "label": row.display_label(),
        "exchange": row.exchange or "",
        "enabled": row.enabled,
        "carousel_pinned": row.carousel_pinned,
        "sort_order": row.sort_order,
        "day_volume": int(vol) if vol is not None else None,
        "percent_change": float(pct) if pct is not None else None,
        "last_price": float(row.last_price) if row.last_price is not None else None,
        "fetched_at": row.fetched_at.isoformat() if row.fetched_at else None,
    }


def _parse_bool_param(raw: str | None) -> bool:
    return (raw or "").strip().lower() in ("1", "true", "yes", "on")


@login_required
@require_GET
def profile_tickers_list(request: HttpRequest) -> JsonResponse:
    denied = _staff_only(request)
    if denied:
        return denied

    q = (request.GET.get("q") or "").strip()
    carousel_only = _parse_bool_param(request.GET.get("carousel_only"))
    pinned_only = _parse_bool_param(request.GET.get("pinned_only"))

    qs = MarketTickerRow.objects.all()
    if carousel_only:
        qs = qs.filter(enabled=True)
    if pinned_only:
        qs = qs.filter(carousel_pinned=True)
    if q:
        qs = qs.filter(Q(symbol__icontains=q) | Q(label__icontains=q))

    qs = qs.order_by("-enabled", "-carousel_pinned", "-day_volume", "sort_order", "symbol")

    try:
        offset = max(0, int(request.GET.get("offset") or 0))
    except (TypeError, ValueError):
        offset = 0
    try:
        limit = min(MAX_TICKERS_PAGE, max(1, int(request.GET.get("limit") or 50)))
    except (TypeError, ValueError):
        limit = 50

    total = qs.count()
    rows = list(qs[offset : offset + limit])
    carousel_count = MarketTickerRow.objects.filter(enabled=True).count()

    return JsonResponse(
        {
            "tickers": [_row_payload(r) for r in rows],
            "count": len(rows),
            "total": total,
            "offset": offset,
            "limit": limit,
            "carousel_count": carousel_count,
        }
    )


@login_required
@require_http_methods(["PATCH", "POST"])
def profile_ticker_update(request: HttpRequest, pk: int) -> JsonResponse:
    denied = _staff_only(request)
    if denied:
        return denied

    try:
        row = MarketTickerRow.objects.get(pk=pk)
    except MarketTickerRow.DoesNotExist:
        return JsonResponse({"error": "Not found"}, status=404)

    try:
        body = json.loads(request.body.decode("utf-8") or "{}")
    except (json.JSONDecodeError, UnicodeDecodeError):
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    update_fields: list[str] = []
    if "enabled" in body:
        row.enabled = bool(body["enabled"])
        update_fields.append("enabled")
    if "carousel_pinned" in body:
        row.carousel_pinned = bool(body["carousel_pinned"])
        update_fields.append("carousel_pinned")
        if row.carousel_pinned:
            row.enabled = True
            if "enabled" not in update_fields:
                update_fields.append("enabled")
    if "sort_order" in body:
        try:
            row.sort_order = max(0, int(body["sort_order"]))
        except (TypeError, ValueError):
            return JsonResponse({"error": "sort_order must be an integer"}, status=400)
        update_fields.append("sort_order")
    if "label" in body:
        row.label = str(body["label"] or "")[:120]
        update_fields.append("label")

    if not update_fields:
        return JsonResponse({"error": "No fields to update"}, status=400)

    row.save(update_fields=update_fields)
    return JsonResponse({"ticker": _row_payload(row)})
