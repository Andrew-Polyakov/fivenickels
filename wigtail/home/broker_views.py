import json

from django.contrib.admin.views.decorators import staff_member_required
from django.http import HttpRequest, HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404, render
from django.views.decorators.http import require_POST

from home.models import BrokerCountryRating, BrokerRating, BrokerTableSettings, Country

_EDITABLE_FIELDS = {
    "rank", "broker_name", "favicon_url", "overall_rating",
    "reviews", "broker_type", "regulation", "min_deposit", "leverage", "page_url", "best_for",
}


def forex_ratings(request: HttpRequest) -> HttpResponse:
    explicit_country = request.GET.get("country", "").upper()
    country_code = explicit_country or getattr(request, "country_code", "")

    brokers = list(
        BrokerRating.objects.values(
            "id", "rank", "broker_name", "favicon_url", "overall_rating",
            "reviews", "broker_type", "regulation", "min_deposit", "leverage", "page_url", "best_for",
        ).order_by("rank")
    )
    for b in brokers:
        b["overall_rating"] = float(b["overall_rating"])

    if country_code:
        country_overrides = {
            cr["broker_id"]: cr
            for cr in BrokerCountryRating.objects.filter(
                country__code=country_code
            ).values("broker_id", "overall_rating", "rank")
        }
        for b in brokers:
            if b["id"] in country_overrides:
                cr = country_overrides[b["id"]]
                b["overall_rating"] = float(cr["overall_rating"])
                if cr["rank"] is not None:
                    b["rank"] = cr["rank"]
        brokers.sort(key=lambda x: x["rank"])

    countries = list(Country.objects.values("code", "name").order_by("name"))

    cta = BrokerTableSettings.for_request(request)
    cta_label = cta.cta_label if cta else ""
    cta_button_text = cta.cta_button_text if cta else ""
    cta_url = cta.cta_page.url if (cta and cta.cta_page_id) else ""

    response = render(request, "home/forex_ratings.html", {
        "brokers": brokers,
        "countries": countries,
        "current_country": country_code,
        "is_admin": request.user.is_staff or request.user.is_superuser,
        "cta_label": cta_label,
        "cta_button_text": cta_button_text,
        "cta_url": cta_url,
    })
    if explicit_country:
        response.set_cookie("region", explicit_country, max_age=365 * 24 * 3600, samesite="Lax")
    return response


def broker_list_json(request: HttpRequest) -> JsonResponse:
    brokers = list(
        BrokerRating.objects.values(
            "id", "broker_name", "favicon_url", "overall_rating", "page_url"
        ).order_by("rank")
    )
    for b in brokers:
        b["overall_rating"] = float(b["overall_rating"])
        b["favicon_url"] = b["favicon_url"] or ""
        b["page_url"] = b["page_url"] or ""
    return JsonResponse({"brokers": brokers})


@require_POST
@staff_member_required
def broker_rating_update(request: HttpRequest, pk: int) -> JsonResponse:
    broker = get_object_or_404(BrokerRating, pk=pk)
    country_code = request.GET.get("country", "").upper()

    try:
        payload = json.loads(request.body)
    except (ValueError, TypeError):
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    if country_code:
        try:
            country = Country.objects.get(code=country_code)
        except Country.DoesNotExist:
            return JsonResponse({"error": f"Unknown country: {country_code}"}, status=400)

        rating = payload.get("overall_rating")
        rank = payload.get("rank") or None
        if rating is None:
            return JsonResponse({"error": "overall_rating required"}, status=400)

        BrokerCountryRating.objects.update_or_create(
            broker=broker, country=country,
            defaults={"overall_rating": rating, "rank": rank},
        )
        return JsonResponse({"ok": True})

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
