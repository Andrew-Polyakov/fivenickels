from __future__ import annotations

import json
import re
from typing import Any

from django.contrib.auth.decorators import user_passes_test
from django.http import HttpRequest, JsonResponse
from django.utils.formats import date_format
from django.utils.text import slugify
from django.views.decorators.http import require_GET, require_POST

from home.card_layout import _dedupe_symbols, serialize_stock_bars_tile_payload
from home.models import SubsectionIndexPage, TaggedContentPage, TaxonomyTerm
from home.query import _section_term_ids_for_taxonomy_scope
from home.taxonomy import MARKET_NEWS_SLUG, ensure_top_row_taxonomy_terms


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


def _unique_term_slug_for_update(base_name: str, exclude_pk: int) -> str:
    base = slugify(base_name).strip("-") or "category"
    candidate = base
    idx = 2
    while TaxonomyTerm.objects.filter(slug=candidate).exclude(pk=exclude_pk).exists():
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
    create_root_raw = payload.get("create_root")
    create_root = create_root_raw is True or str(create_root_raw).lower() in ("1", "true")
    parent_id = payload.get("parent_id")
    parent = None
    if parent_id not in (None, ""):
        try:
            parent = TaxonomyTerm.objects.get(pk=int(parent_id))
        except (TypeError, ValueError, TaxonomyTerm.DoesNotExist):
            return JsonResponse({"error": "Selected parent not found."}, status=400)

    # Top nav rows omit parent_id; only TOP_ROW_SLUGS roots appear there, so new
    # roots would be invisible. Default to Market News so the chip shows under it.
    if parent is None and not create_root:
        parent = TaxonomyTerm.objects.filter(
            slug=MARKET_NEWS_SLUG, is_visible=True
        ).first()
        if parent is None:
            ensure_top_row_taxonomy_terms()
            parent = TaxonomyTerm.objects.filter(
                slug=MARKET_NEWS_SLUG, is_visible=True
            ).first()

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
def rename_taxonomy_term(request: HttpRequest) -> JsonResponse:
    payload = _json_payload(request)
    try:
        term_id = int(payload.get("term_id"))
    except (TypeError, ValueError):
        return JsonResponse({"error": "Category id is required."}, status=400)
    name = str(payload.get("name") or "").strip()
    if not name:
        return JsonResponse({"error": "Category name is required."}, status=400)

    term = TaxonomyTerm.objects.filter(pk=term_id).first()
    if term is None:
        return JsonResponse({"error": "Category not found."}, status=404)

    term.name = name
    term.slug = _unique_term_slug_for_update(name, term.pk)
    term.save()

    return JsonResponse(
        {
            "updated": True,
            "id": term.pk,
            "name": term.name,
            "slug": term.slug,
        }
    )


@require_POST
@user_passes_test(_admin_inline_access)
def set_taxonomy_term_nav(request: HttpRequest) -> JsonResponse:
    payload = _json_payload(request)
    try:
        term_id = int(payload.get("term_id"))
    except (TypeError, ValueError):
        return JsonResponse({"error": "Category id is required."}, status=400)

    raw_is_nav = payload.get("is_nav")
    if isinstance(raw_is_nav, bool):
        is_nav = raw_is_nav
    else:
        text = str(raw_is_nav or "").strip().lower()
        if text in ("1", "true", "yes", "on"):
            is_nav = True
        elif text in ("0", "false", "no", "off"):
            is_nav = False
        else:
            return JsonResponse({"error": "Navigation flag is required."}, status=400)

    term = TaxonomyTerm.objects.filter(pk=term_id).first()
    if term is None:
        return JsonResponse({"error": "Category not found."}, status=404)

    term.is_nav = is_nav
    term.save(update_fields=["is_nav"])
    return JsonResponse({"updated": True, "id": term.pk, "is_nav": term.is_nav})


def _normalize_master_layout_payload(layout: object) -> dict | None:
    """Normalize layout payload. Accepts v1 (legacy), v2 (taxonomy), and v3 (bento resizable)."""
    if not isinstance(layout, dict):
        return None
    rows = layout.get("rows")
    if not isinstance(rows, list) or len(rows) > 120:
        return None
    out: dict[str, Any] = {"rows": rows}
    lv = layout.get("layoutVersion")
    if isinstance(lv, int) and 1 <= lv <= 99:
        out["layoutVersion"] = lv
    return out


def _article_result_image_url(row: TaggedContentPage) -> str | None:
    for img in (row.hero_image, row.og_image):
        if img is None:
            continue
        try:
            return img.get_rendition("fill-400x250").url
        except Exception:
            continue
    return None


def _article_result_payload(row: TaggedContentPage, request: HttpRequest) -> dict[str, Any]:
    return {
        "id": row.pk,
        "title": row.title,
        "excerpt": row.listing_preview_markdown(),
        "section": row.section_term.name if row.section_term_id else "",
        "url": row.get_url(request=request) or row.url or "",
        "imageUrl": _article_result_image_url(row),
        "tags": list(row.tags.values_list("name", flat=True)[:5]),
        "authorName": row.card_author_name(),
        "publishedAt": date_format(row.first_published_at, "F j, Y") if row.first_published_at else "",
        "catalyst": (row.catalyst or "").strip(),
    }


@require_POST
@user_passes_test(_admin_inline_access)
def save_taxonomy_master_layout(request: HttpRequest) -> JsonResponse:
    payload = _json_payload(request)
    try:
        term_id = int(payload.get("term_id"))
    except (TypeError, ValueError):
        return JsonResponse({"error": "Category id is required."}, status=400)

    layout = _normalize_master_layout_payload(payload.get("layout"))
    if layout is None:
        return JsonResponse({"error": "Invalid layout payload."}, status=400)

    term = TaxonomyTerm.objects.filter(pk=term_id).first()
    if term is None:
        return JsonResponse({"error": "Category not found."}, status=404)

    term.master_layout_json = layout
    term.save(update_fields=["master_layout_json"])
    return JsonResponse({"saved": True, "term_id": term.pk})


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


@require_GET
def search_articles(request: HttpRequest) -> JsonResponse:
    query = str(request.GET.get("q") or "").strip()
    random_raw = str(request.GET.get("random") or "").strip().lower()
    random_mode = random_raw in ("1", "true", "yes")
    article_id_raw = str(request.GET.get("article_id") or "").strip()
    article_id: int | None = None
    if article_id_raw:
        try:
            article_id = int(article_id_raw)
        except ValueError:
            article_id = None
    section_term_id_raw = str(request.GET.get("section_term_id") or "").strip()
    tag_ids_raw = str(request.GET.get("tag_ids") or "").strip()
    tag_ids: list[int] = []
    if tag_ids_raw:
        for p in tag_ids_raw.split(","):
            v = p.strip()
            if not v:
                continue
            try:
                tag_ids.append(int(v))
            except ValueError:
                continue
    exclude_ids_raw = str(request.GET.get("exclude_ids") or "").strip()
    exclude_ids: list[int] = []
    if exclude_ids_raw:
        for p in exclude_ids_raw.split(","):
            v = p.strip()
            if not v:
                continue
            try:
                exclude_ids.append(int(v))
            except ValueError:
                continue
        exclude_ids = exclude_ids[:200]
    if not random_mode and article_id is None and not _admin_inline_access(request.user):
        return JsonResponse({"results": []}, status=403)
    qs = TaggedContentPage.objects.live().public().order_by("-first_published_at")
    if article_id is not None:
        qs = qs.filter(pk=article_id)
    if section_term_id_raw:
        try:
            term = TaxonomyTerm.objects.filter(pk=int(section_term_id_raw)).first()
        except ValueError:
            term = None
        if term is not None:
            term_ids = _section_term_ids_for_taxonomy_scope(term)
            if term_ids:
                qs = qs.filter(section_term_id__in=term_ids)
    if tag_ids:
        qs = qs.filter(tags__in=tag_ids).distinct()
    if exclude_ids:
        qs = qs.exclude(pk__in=exclude_ids)
    if random_mode:
        qs = qs.order_by("?")
    elif query:
        for token in [t for t in query.split() if t]:
            qs = qs.filter(title__icontains=token)
    limit = 1 if random_mode or article_id is not None else 20
    qs = qs.select_related("section_term", "author_user", "hero_image", "og_image").prefetch_related("tags")
    rows = list(qs[:limit])
    results = [_article_result_payload(row, request) for row in rows]
    return JsonResponse({"results": results})


@require_POST
@user_passes_test(_admin_inline_access)
def save_taxonomy_content(request: HttpRequest) -> JsonResponse:
    payload = _json_payload(request)
    try:
        term_id = int(payload.get("term_id"))
    except (TypeError, ValueError):
        return JsonResponse({"error": "Category id is required."}, status=400)

    content_json = payload.get("content_json")
    if not isinstance(content_json, dict):
        return JsonResponse({"error": "Invalid content payload."}, status=400)

    term = TaxonomyTerm.objects.filter(pk=term_id).first()
    if term is None:
        return JsonResponse({"error": "Category not found."}, status=404)

    term.content_constructor_json = content_json
    term.save(update_fields=["content_constructor_json"])
    return JsonResponse({"saved": True, "term_id": term.pk})


@require_POST
@user_passes_test(_admin_inline_access)
def upload_taxonomy_image(request: HttpRequest) -> JsonResponse:
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

    return JsonResponse({"id": image.id, "url": url, "title": image.title})


@require_GET
def preview_stock_bars_tile(request: HttpRequest) -> JsonResponse:
    """Public JSON for taxonomy Bento stock tile preview (cached Alpaca bars)."""
    raw = str(request.GET.get("symbols") or "")
    parts = [p.strip().upper() for p in re.split(r"[\s,]+", raw) if p.strip()]
    syms = _dedupe_symbols(parts)
    return JsonResponse(serialize_stock_bars_tile_payload(syms))


@require_GET
@user_passes_test(_admin_inline_access)
def search_taxonomy_articles(request: HttpRequest) -> JsonResponse:
    query = str(request.GET.get("q") or "").strip()
    qs = (
        TaggedContentPage.objects
        .live().public()
        .prefetch_related("tags")
        .select_related("hero_image", "og_image", "author_user")
        .order_by("-first_published_at")
    )
    if query:
        for token in [t for t in query.split() if t]:
            qs = qs.filter(title__icontains=token)
    rows = list(qs[:12])
    results = []
    for row in rows:
        image_url = None
        for img in (row.hero_image, row.og_image):
            if img is None:
                continue
            try:
                image_url = img.get_rendition("fill-400x250").url
                break
            except Exception:
                continue
        raw_preview = (row.tile_preview or "").strip()
        excerpt = re.sub(r"[*#`_~\[\]()]+", "", raw_preview)[:200].strip() or None
        results.append({
            "id": row.pk,
            "title": row.title,
            "url": row.url or "",
            "imageUrl": image_url,
            "tag": (row.tags.values_list("name", flat=True).first() or None),
            "tags": list(row.tags.values_list("name", flat=True)[:5]),
            "excerpt": excerpt,
            "authorName": row.card_author_name(),
            "publishedAt": date_format(row.first_published_at, "F j, Y") if row.first_published_at else "",
            "catalyst": (row.catalyst or "").strip(),
        })
    return JsonResponse({"results": results})


@require_GET
@user_passes_test(_admin_inline_access)
def list_content_tags(request: HttpRequest) -> JsonResponse:
    query = str(request.GET.get("q") or "").strip()
    from home.models import ContentTag

    tag_qs = ContentTag.objects.order_by("name")
    if query:
        tag_qs = tag_qs.filter(name__icontains=query)
    results = [{"id": tag.pk, "name": tag.name, "slug": tag.slug} for tag in tag_qs[:100]]
    return JsonResponse({"results": results})
