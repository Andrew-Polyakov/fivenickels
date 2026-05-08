import json

from django.contrib.admin.views.decorators import staff_member_required
from django.http import HttpRequest, HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404, render
from django.views.decorators.http import require_POST

from home.models import BrokerRating

_EDITABLE_FIELDS = {
    "rank", "broker_name", "favicon_url", "overall_rating",
    "status", "reviews", "broker_type", "regulation", "min_deposit", "leverage",
}


def forex_ratings(request: HttpRequest) -> HttpResponse:
    brokers = list(
        BrokerRating.objects.values(
            "id", "rank", "broker_name", "favicon_url", "overall_rating", "status",
            "reviews", "broker_type", "regulation", "min_deposit", "leverage",
        ).order_by("rank")
    )
    for b in brokers:
        b["overall_rating"] = float(b["overall_rating"])
    return render(request, "home/forex_ratings.html", {
        "brokers": brokers,
        "is_admin": request.user.is_staff,
    })


@require_POST
@staff_member_required
def broker_rating_update(request: HttpRequest, pk: int) -> JsonResponse:
    broker = get_object_or_404(BrokerRating, pk=pk)
    try:
        payload = json.loads(request.body)
    except (ValueError, TypeError):
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    for field, value in payload.items():
        if field not in _EDITABLE_FIELDS:
            continue
        setattr(broker, field, value)

    try:
        broker.full_clean()
        broker.save()
    except Exception as exc:
        return JsonResponse({"error": str(exc)}, status=400)

    return JsonResponse({"ok": True})
