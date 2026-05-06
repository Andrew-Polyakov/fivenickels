from __future__ import annotations

import json

from django.contrib.auth.decorators import user_passes_test
from django.http import HttpRequest, JsonResponse
from django.utils.text import slugify
from django.views.decorators.http import require_POST

from home.blocks import _newspaper_default_layout
from home.models import SubsectionIndexPage, TaggedContentPage, TaxonomyTerm
from home.query import get_random_pages_for_section_prioritized
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


def _stream_owner(page_model: str, page_id: int):
    model_map = {
        "home.HomePage": __import__("home.models", fromlist=["HomePage"]).HomePage,
        "home.SubsectionIndexPage": SubsectionIndexPage,
        "home.TaggedContentPage": TaggedContentPage,
        "home.TaxonomyTerm": TaxonomyTerm,
    }
    model = model_map.get(page_model)
    if model is None:
        return None
    return model.objects.filter(pk=page_id).first()


def _save_stream_owner(owner, stream_field: str):
    if isinstance(owner, TaxonomyTerm):
        owner.save(update_fields=[stream_field])
        return
    owner.save_revision().publish()


def _grid_block(owner, stream_field: str, block_index: int):
    stream_value = getattr(owner, stream_field, None)
    if stream_value is None:
        return None, None
    raw = list(getattr(stream_value, "raw_data", []) or [])
    if block_index < 0 or block_index >= len(raw):
        return None, None
    block = raw[block_index]
    if block.get("type") != "newspaper_grid":
        return None, None
    value = block.setdefault("value", {})
    value.setdefault("preset", "twin")
    value.setdefault("layout_json", "")
    value.setdefault("panes", [])
    return raw, block


def _article_dict_for_new_pane(owner) -> dict:
    """StreamField article value for a new grid pane: bind section + pin a page when possible."""
    article: dict = {
        "importance": 10,
        "section_term": None,
        "mode": "random",
        "manual_page": None,
    }
    term = None
    if isinstance(owner, TaxonomyTerm):
        term = owner
        article["section_term"] = owner.pk
    elif isinstance(owner, SubsectionIndexPage) and owner.section_term_id:
        term = owner.section_term
        article["section_term"] = owner.section_term_id
    elif isinstance(owner, TaggedContentPage) and owner.section_term_id:
        term = owner.section_term
        article["section_term"] = owner.section_term_id

    if term is not None:
        picked = get_random_pages_for_section_prioritized(term, limit=1)
        if picked:
            article["mode"] = "manual"
            article["manual_page"] = picked[0].pk
    return article


def _grid_payload(request: HttpRequest):
    payload = _json_payload(request)
    try:
        page_id = int(payload.get("page_id"))
        block_index = int(payload.get("block_index"))
    except (TypeError, ValueError):
        return None, None, None, None, JsonResponse({"error": "Invalid payload."}, status=400)
    page_model = str(payload.get("page_model") or "").strip()
    stream_field = str(payload.get("stream_field") or "").strip()
    if stream_field not in {"body", "intro", "widgets"}:
        return None, None, None, None, JsonResponse({"error": "Invalid stream field."}, status=400)
    owner = _stream_owner(page_model, page_id)
    if owner is None:
        return None, None, None, None, JsonResponse({"error": "Page not found."}, status=404)
    if not hasattr(owner, stream_field):
        return None, None, None, None, JsonResponse({"error": "Stream field not available."}, status=400)
    raw, block = _grid_block(owner, stream_field, block_index)
    if raw is None or block is None:
        return None, None, None, None, JsonResponse({"error": "Grid block not found."}, status=404)
    return payload, owner, raw, block, None


@require_POST
@user_passes_test(_admin_inline_access)
def newspaper_grid_set_preset(request: HttpRequest) -> JsonResponse:
    payload, owner, raw, block, error = _grid_payload(request)
    if error is not None:
        return error
    preset = str(payload.get("preset") or "twin").strip().lower()
    if preset not in {"twin", "quatro"}:
        return JsonResponse({"error": "Unsupported preset."}, status=400)
    value = block["value"]
    value["preset"] = preset
    value["layout_json"] = json.dumps(_newspaper_default_layout(preset))
    value["panes"] = []
    setattr(owner, payload["stream_field"], raw)
    _save_stream_owner(owner, payload["stream_field"])
    return JsonResponse({"updated": True, "preset": preset})


@require_POST
@user_passes_test(_admin_inline_access)
def newspaper_grid_add_pane_content(request: HttpRequest) -> JsonResponse:
    payload, owner, raw, block, error = _grid_payload(request)
    if error is not None:
        return error
    pane_id = str(payload.get("pane_id") or "").strip()
    if not pane_id:
        return JsonResponse({"error": "Pane id is required."}, status=400)
    panes = block["value"].setdefault("panes", [])
    panes = [p for p in panes if p.get("pane_id") != pane_id]
    panes.append(
        {
            "pane_id": pane_id,
            "content_kind": "article",
            "article": _article_dict_for_new_pane(owner),
            "rich": {},
        }
    )
    block["value"]["panes"] = panes
    setattr(owner, payload["stream_field"], raw)
    _save_stream_owner(owner, payload["stream_field"])
    return JsonResponse({"updated": True, "pane_id": pane_id})


@require_POST
@user_passes_test(_admin_inline_access)
def newspaper_grid_remove_pane_content(request: HttpRequest) -> JsonResponse:
    payload, owner, raw, block, error = _grid_payload(request)
    if error is not None:
        return error
    pane_id = str(payload.get("pane_id") or "").strip()
    if not pane_id:
        return JsonResponse({"error": "Pane id is required."}, status=400)
    panes = block["value"].setdefault("panes", [])
    block["value"]["panes"] = [p for p in panes if p.get("pane_id") != pane_id]
    setattr(owner, payload["stream_field"], raw)
    _save_stream_owner(owner, payload["stream_field"])
    return JsonResponse({"updated": True, "pane_id": pane_id})


def _update_split_ratio(node: dict, split_id: str, ratio: float) -> bool:
    if not isinstance(node, dict):
        return False
    if node.get("type") == "split" and str(node.get("id") or "") == split_id:
        node["ratio"] = ratio
        return True
    return _update_split_ratio(node.get("first"), split_id, ratio) or _update_split_ratio(
        node.get("second"), split_id, ratio
    )


@require_POST
@user_passes_test(_admin_inline_access)
def newspaper_grid_resize(request: HttpRequest) -> JsonResponse:
    payload, owner, raw, block, error = _grid_payload(request)
    if error is not None:
        return error
    split_id = str(payload.get("split_id") or "").strip()
    if not split_id:
        return JsonResponse({"error": "Split id is required."}, status=400)
    try:
        ratio = float(payload.get("ratio"))
    except (TypeError, ValueError):
        return JsonResponse({"error": "Ratio is required."}, status=400)
    ratio = min(0.8, max(0.2, ratio))
    value = block["value"]
    layout_raw = str(value.get("layout_json") or "").strip()
    try:
        tree = json.loads(layout_raw) if layout_raw else _newspaper_default_layout(value.get("preset") or "twin")
    except json.JSONDecodeError:
        tree = _newspaper_default_layout(value.get("preset") or "twin")
    if not _update_split_ratio(tree, split_id, ratio):
        return JsonResponse({"error": "Split not found."}, status=404)
    value["layout_json"] = json.dumps(tree)
    setattr(owner, payload["stream_field"], raw)
    _save_stream_owner(owner, payload["stream_field"])
    return JsonResponse({"updated": True, "split_id": split_id, "ratio": ratio})


@require_POST
@user_passes_test(_admin_inline_access)
def newspaper_grid_bootstrap_taxonomy_widgets(request: HttpRequest) -> JsonResponse:
    """
    Append a ``newspaper_grid`` block to a taxonomy term's ``widgets`` stream when none exists.
    Lets staff enable the inline grid editor from the public taxonomy page without Wagtail admin.
    """
    payload = _json_payload(request)
    try:
        term_id = int(payload.get("page_id"))
    except (TypeError, ValueError):
        return JsonResponse({"error": "Taxonomy term id is required."}, status=400)
    page_model = str(payload.get("page_model") or "home.TaxonomyTerm").strip()
    if page_model != "home.TaxonomyTerm":
        return JsonResponse({"error": "Unsupported page model."}, status=400)
    term = TaxonomyTerm.objects.filter(pk=term_id).first()
    if term is None:
        return JsonResponse({"error": "Taxonomy term not found."}, status=404)
    raw = list(getattr(term.widgets, "raw_data", []) or [])
    if any(b.get("type") == "newspaper_grid" for b in raw):
        return JsonResponse(
            {"error": "This section already has a newspaper grid.", "already": True},
            status=400,
        )
    raw.append(
        {
            "type": "newspaper_grid",
            "value": {
                "preset": "twin",
                "layout_json": "",
                "panes": [],
            },
        }
    )
    term.widgets = raw
    term.save(update_fields=["widgets"])
    return JsonResponse({"updated": True, "term_id": term.pk, "block_index": len(raw) - 1})
