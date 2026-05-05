from __future__ import annotations

import json

from django.contrib.auth.decorators import user_passes_test
from django.http import HttpRequest, JsonResponse
from django.utils.text import slugify
from django.views.decorators.http import require_POST

from home.models import SubsectionIndexPage, TaggedContentPage, TaxonomyTerm


def _admin_inline_access(user) -> bool:
    return bool(
        user.is_authenticated and (user.is_staff or user.is_superuser)
    )


def _json_payload(request: HttpRequest) -> dict:
    if not request.body:
        return {}
    try:
        raw = json.loads(request.body.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return {}
    return raw if isinstance(raw, dict) else {}


def _unique_term_slug(base_name: str) -> str:
    base = slugify(base_name).strip("-") or "category"
    candidate = base
    idx = 2
    while TaxonomyTerm.objects.filter(slug=candidate).exists():
        candidate = f"{base}-{idx}"
        idx += 1
    return candidate


def _unique_page_slug(page: TaggedContentPage, base_title: str) -> str:
    base = slugify(base_title).strip("-") or "article"
    candidate = base
    idx = 2
    siblings = TaggedContentPage.objects.sibling_of(page).exclude(pk=page.pk)
    while siblings.filter(slug=candidate).exists():
        candidate = f"{base}-{idx}"
        idx += 1
    return candidate


@require_POST
@user_passes_test(_admin_inline_access)
def create_taxonomy_term(request: HttpRequest) -> JsonResponse:
    payload = _json_payload(request)
    name = str(payload.get("name") or "").strip()
    if not name:
        return JsonResponse({"error": "Category name is required."}, status=400)
    parent_id = payload.get("parent_id")
    parent = None
    if parent_id not in (None, ""):
        try:
            parent = TaxonomyTerm.objects.get(pk=int(parent_id))
        except (TypeError, ValueError, TaxonomyTerm.DoesNotExist):
            return JsonResponse({"error": "Selected parent not found."}, status=400)

    term = TaxonomyTerm(
        name=name,
        slug=_unique_term_slug(name),
        is_visible=True,
        sort_order=0,
    )
    if parent is not None:
        parent.add_child(instance=term)
    else:
        TaxonomyTerm.add_root(instance=term)

    return JsonResponse(
        {
            "id": term.pk,
            "name": term.name,
            "slug": term.slug,
            "parent_id": parent.pk if parent else None,
        }
    )


@require_POST
@user_passes_test(_admin_inline_access)
def delete_taxonomy_term(request: HttpRequest) -> JsonResponse:
    payload = _json_payload(request)
    try:
        term_id = int(payload.get("term_id"))
    except (TypeError, ValueError):
        return JsonResponse({"error": "Category id is required."}, status=400)

    term = TaxonomyTerm.objects.filter(pk=term_id).first()
    if term is None:
        return JsonResponse({"error": "Category not found."}, status=404)
    if term.get_children().exists():
        return JsonResponse(
            {"error": "Delete child categories first."},
            status=400,
        )
    if TaggedContentPage.objects.filter(section_term=term).exists():
        return JsonResponse(
            {"error": "Category is used as section term by published content."},
            status=400,
        )
    if TaggedContentPage.objects.filter(taxonomy_category=term).exists():
        return JsonResponse(
            {"error": "Category is used by content tiles."},
            status=400,
        )
    if SubsectionIndexPage.objects.filter(section_term=term).exists():
        return JsonResponse(
            {"error": "Category is linked to a subsection page."},
            status=400,
        )
    term.delete()
    return JsonResponse({"deleted": True, "term_id": term_id})


@require_POST
@user_passes_test(_admin_inline_access)
def update_tile_title(request: HttpRequest) -> JsonResponse:
    payload = _json_payload(request)
    try:
        page_id = int(payload.get("page_id"))
    except (TypeError, ValueError):
        return JsonResponse({"error": "Tile id is required."}, status=400)
    title = str(payload.get("title") or "").strip()
    if not title:
        return JsonResponse({"error": "Title is required."}, status=400)

    page = TaggedContentPage.objects.filter(pk=page_id).first()
    if page is None:
        return JsonResponse({"error": "Tile page not found."}, status=404)

    page.title = title
    page.slug = _unique_page_slug(page, title)
    page.save()
    page.save_revision().publish()
    return JsonResponse(
        {
            "updated": True,
            "page_id": page.pk,
            "title": page.title,
            "slug": page.slug,
            "url": page.url,
        }
    )
