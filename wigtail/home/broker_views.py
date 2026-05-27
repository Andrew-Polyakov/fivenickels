import json
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from django.contrib.admin.views.decorators import staff_member_required
from django.core.exceptions import ValidationError
from django.http import HttpRequest, HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404, render
from django.urls import reverse
from django.views.decorators.http import require_POST

from django.views.decorators.http import require_GET

from home.card_layout import serialize_article_carousel_payload
from home.broker_card import (
    LOGO_KIND_FIELDS,
    normalize_category_ratings,
    overview_text_for_broker,
    resolve_broker_detail_logo,
    serialize_big_trader_card,
    tagged_articles_for_broker,
)
from home.models import BrokerCountryRating, BrokerRating, BrokerTableSettings, Country

_EDITABLE_FIELDS = {
    "rank", "broker_name", "favicon_url", "logo_rect_url", "logo_square_url",
    "overall_rating", "reviews", "broker_type", "regulation", "min_deposit", "leverage",
    "website", "overview", "best_for", "category_ratings",
}


def _coerce_overall_rating(value) -> Decimal:
    try:
        rating = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        raise ValidationError({"overall_rating": ["Enter a valid rating."]})
    return rating.quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)


def _validation_error_message(exc: ValidationError) -> str:
    if hasattr(exc, "message_dict"):
        parts = []
        for field, messages in exc.message_dict.items():
            label = str(field).replace("_", " ").title()
            for message in messages:
                parts.append(f"{label}: {message}")
        return " ".join(parts) if parts else str(exc)
    return str(exc)


def _absolute_media_url(request: HttpRequest, url: str) -> str:
    """URLField requires a scheme; Wagtail renditions are often path-only."""
    if not url:
        return url
    if url.startswith(("http://", "https://")):
        return url
    return request.build_absolute_uri(url)


def _validation_error_payload(exc: ValidationError) -> dict:
    field_errors: dict[str, list[str]] = {}
    if hasattr(exc, "message_dict"):
        for field, messages in exc.message_dict.items():
            field_errors[str(field)] = [str(m) for m in messages]
    else:
        field_errors["__all__"] = [str(exc)]
    return {
        "error": _validation_error_message(exc),
        "field_errors": field_errors,
    }


def _resolve_country_code(request: HttpRequest) -> tuple[str, str]:
    explicit_country = request.GET.get("country", "").upper()
    country_code = explicit_country or getattr(request, "country_code", "")
    return explicit_country, country_code


def _serialize_broker(broker: BrokerRating) -> dict:
    return {
        "id": broker.id,
        "slug": broker.slug,
        "rank": broker.rank,
        "broker_name": broker.broker_name,
        "favicon_url": broker.favicon_url,
        "overall_rating": float(broker.overall_rating),
        "reviews": broker.reviews,
        "broker_type": broker.broker_type,
        "regulation": broker.regulation,
        "min_deposit": broker.min_deposit,
        "leverage": broker.leverage,
        "website": broker.website,
        "logo_rect_url": broker.logo_rect_url,
        "logo_square_url": broker.logo_square_url,
        "display_logo_url": resolve_broker_detail_logo(broker),
        "overview": broker.overview,
        "summary": overview_text_for_broker(broker),
        "best_for": broker.best_for,
        "category_ratings": normalize_category_ratings(broker.category_ratings),
        "detail_url": reverse("forex_broker_detail", kwargs={"slug": broker.slug}),
    }


def _apply_country_overrides(brokers: list[dict], country_code: str) -> None:
    if not country_code:
        return
    country_overrides = {
        cr["broker_id"]: cr
        for cr in BrokerCountryRating.objects.filter(country__code=country_code).values(
            "broker_id", "overall_rating", "rank"
        )
    }
    for broker in brokers:
        if broker["id"] not in country_overrides:
            continue
        country_rating = country_overrides[broker["id"]]
        broker["overall_rating"] = float(country_rating["overall_rating"])
        if country_rating["rank"] is not None:
            broker["rank"] = country_rating["rank"]


def forex_ratings(request: HttpRequest) -> HttpResponse:
    explicit_country, country_code = _resolve_country_code(request)

    brokers = [_serialize_broker(broker) for broker in BrokerRating.objects.order_by("rank")]
    _apply_country_overrides(brokers, country_code)
    brokers.sort(key=lambda row: row["rank"])

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


def forex_broker_detail(request: HttpRequest, slug: str) -> HttpResponse:
    explicit_country, country_code = _resolve_country_code(request)
    broker = get_object_or_404(BrokerRating, slug=slug)
    broker_payload = _serialize_broker(broker)
    _apply_country_overrides([broker_payload], country_code)

    forex_ratings_href = reverse("forex_ratings")
    if country_code:
        forex_ratings_href = f"{forex_ratings_href}?country={country_code}"
    breadcrumb_payload = [
        {"label": "Forex Ratings", "href": forex_ratings_href},
        {"label": broker.broker_name},
    ]
    countries = list(Country.objects.values("code", "name").order_by("name"))

    tagged_articles = tagged_articles_for_broker(broker)
    article_carousel = serialize_article_carousel_payload(tagged_articles, request)

    response = render(
        request,
        "home/forex_broker_detail.html",
        {
            "broker": broker_payload,
            "countries": countries,
            "current_country": country_code,
            "breadcrumb_payload": breadcrumb_payload,
            "article_carousel": article_carousel,
        },
    )
    if explicit_country:
        response.set_cookie("region", explicit_country, max_age=365 * 24 * 3600, samesite="Lax")
    return response


def broker_list_json(request: HttpRequest) -> JsonResponse:
    brokers = list(
        BrokerRating.objects.values(
            "id", "broker_name", "favicon_url", "logo_square_url", "overall_rating", "website"
        ).order_by("rank")
    )
    for b in brokers:
        b["overall_rating"] = float(b["overall_rating"])
        b["favicon_url"] = b["favicon_url"] or ""
        b["logo_square_url"] = b["logo_square_url"] or ""
        b["website"] = b["website"] or ""
    return JsonResponse({"brokers": brokers})


@require_GET
@staff_member_required
def broker_big_card_json(request: HttpRequest, pk: int) -> JsonResponse:
    broker = get_object_or_404(BrokerRating, pk=pk)
    payload = serialize_big_trader_card(broker, request)
    if payload is None:
        return JsonResponse({"error": "Broker not found"}, status=404)
    return JsonResponse(payload)


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

        try:
            rating = _coerce_overall_rating(rating)
        except ValidationError as exc:
            return JsonResponse(_validation_error_payload(exc), status=400)

        BrokerCountryRating.objects.update_or_create(
            broker=broker, country=country,
            defaults={"overall_rating": rating, "rank": rank},
        )
        return JsonResponse({"ok": True})

    for field, value in payload.items():
        if field not in _EDITABLE_FIELDS:
            continue
        if field == "overall_rating":
            try:
                value = _coerce_overall_rating(value)
            except ValidationError as exc:
                return JsonResponse(_validation_error_payload(exc), status=400)
        if field == "category_ratings":
            value = normalize_category_ratings(value)
        if field in ("favicon_url", "logo_rect_url", "logo_square_url", "website") and isinstance(value, str):
            value = _absolute_media_url(request, value.strip()) if value.strip() else ""
        setattr(broker, field, value)

    for url_field in ("favicon_url", "logo_rect_url", "logo_square_url", "website"):
        raw = (getattr(broker, url_field) or "").strip()
        setattr(broker, url_field, _absolute_media_url(request, raw) if raw else "")

    try:
        broker.full_clean()
        broker.save()
    except ValidationError as exc:
        return JsonResponse(_validation_error_payload(exc), status=400)
    except Exception as exc:
        return JsonResponse({"error": str(exc)}, status=400)

    return JsonResponse({"ok": True})


@require_POST
@staff_member_required
def broker_upload_logo(request: HttpRequest, pk: int) -> JsonResponse:
    broker = get_object_or_404(BrokerRating, pk=pk)
    logo_kind = (request.POST.get("logo_kind") or request.GET.get("logo_kind") or "rect").lower()
    field_name = LOGO_KIND_FIELDS.get(logo_kind)
    if not field_name:
        return JsonResponse({"error": f"Invalid logo_kind: {logo_kind}"}, status=400)
    if "image" not in request.FILES:
        return JsonResponse({"error": "No image provided."}, status=400)

    from wagtail.images import get_image_model

    Image = get_image_model()
    image_file = request.FILES["image"]
    image = Image.objects.create(title=image_file.name, file=image_file)
    try:
        url = image.get_rendition("original").url
    except Exception:
        url = image.file.url

    absolute_url = _absolute_media_url(request, url)
    setattr(broker, field_name, absolute_url)
    broker.save(update_fields=[field_name])
    return JsonResponse({
        "ok": True,
        "url": absolute_url,
        "logo_kind": logo_kind,
        "field": field_name,
    })
