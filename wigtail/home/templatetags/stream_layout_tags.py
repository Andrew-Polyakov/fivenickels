import uuid

from django import template

from home.card_layout import iter_main_site_stream_segments, serialize_article_card_for_related

register = template.Library()


@register.inclusion_tag("home/includes/shadcn_article_card_mount.html", takes_context=True)
def similar_article_card_mount(context, page):
    request = context.get("request")
    payload = serialize_article_card_for_related(page, request)
    uid = f"similar-card-{page.pk}"
    return {"uid": uid, "payload": payload}


def _template_context_dict(context) -> dict:
    if hasattr(context, "flatten"):
        return context.flatten()
    try:
        flat: dict = {}
        for d in context.dicts:
            if isinstance(d, dict):
                flat.update(d)
        return flat
    except Exception:
        return {}


@register.inclusion_tag("home/includes/main_site_stream.html", takes_context=True)
def render_main_site_stream(context, stream):
    sector = context.get("sector_tile_filter")
    flat_ctx = _template_context_dict(context)
    cluster_recent = flat_ctx.get("stream_cluster_bare_cards_to_recent", True)
    segments_in = list(
        iter_main_site_stream_segments(
            stream,
            flat_ctx,
            sector_slug=sector,
            cluster_bare_cards_to_recent=cluster_recent,
        )
    )
    segments = []
    for seg in segments_in:
        if seg["type"] in ("card_layout", "recent_articles", "bento_grid_01"):
            segments.append({**seg, "uid": f"scn-{uuid.uuid4().hex[:12]}"})
        else:
            segments.append(seg)
    flat = flat_ctx
    return {
        "segments": segments,
        "can_save_taxonomy_master_layout": flat.get("can_save_taxonomy_master_layout", False),
        "save_taxonomy_master_layout_url": flat.get("save_taxonomy_master_layout_url", ""),
        "taxonomy_term_id": flat.get("taxonomy_term_id", ""),
    }
