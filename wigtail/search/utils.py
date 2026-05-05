"""Plain-text previews and safe HTML highlighting for search."""

from __future__ import annotations

import re

from django.utils.html import escape

from wagtail.models import Page

_MAX_QUERY_LEN = 200
_MAX_QUERY_TOKENS = 12
_MIN_TOKEN_LEN = 2

_MARKDOWN_NOISE_RE = re.compile(r"[*_`#\[\]]+")


def normalize_query_string(q: str | None) -> str:
    if not q:
        return ""
    return " ".join((q or "").split())[:_MAX_QUERY_LEN]


def query_tokens(query: str) -> list[str]:
    """Split query into searchable tokens; skip very short noise."""
    parts = []
    for raw in (query or "").split():
        t = raw.strip()
        if len(t) >= _MIN_TOKEN_LEN:
            parts.append(t)
        if len(parts) >= _MAX_QUERY_TOKENS:
            break
    return parts


def light_md_strip(text: str) -> str:
    """Flatten whitespace and trim common markdown punctuation for excerpt display."""
    if not text:
        return ""
    one_line = " ".join(text.split())
    return _MARKDOWN_NOISE_RE.sub("", one_line).strip()


def plain_preview_for_page(page: Page) -> str:
    """Same source rules as search.html: meta description, then tagged article excerpt."""
    desc = (getattr(page, "search_description", None) or "").strip()
    if desc:
        return light_md_strip(desc)

    from home.models import TaggedContentPage

    specific = page.specific
    if isinstance(specific, TaggedContentPage):
        return light_md_strip(specific.listing_preview_markdown())
    return ""


def excerpt_window(plain: str, query: str, max_total: int = 180, pad: int = 52) -> str:
    """Slice plain text around the first token hit; if none, show the start."""
    plain = plain or ""
    tokens = query_tokens(query)
    if not plain:
        return ""

    if not tokens:
        return plain if len(plain) <= max_total else plain[: max_total - 1].rstrip() + "…"

    lower = plain.lower()
    best_idx = len(plain)
    for t in tokens:
        tl = t.lower()
        idx = lower.find(tl)
        if idx != -1 and idx < best_idx:
            best_idx = idx

    if best_idx >= len(plain):
        chunk = plain[:max_total]
        ellip = len(plain) > max_total
        return (chunk + ("…" if ellip else "")).strip()

    start = max(0, best_idx - pad)
    end = min(len(plain), start + max_total)
    prefix = "… " if start > 0 else ""
    suffix = " …" if end < len(plain) else ""
    return (prefix + plain[start:end] + suffix).strip()


def highlight_plain_to_html(plain: str, query: str) -> str:
    """Escape plain text and wrap query token hits in <mark class=\"search-hit\">."""
    if not plain:
        return ""
    tokens = query_tokens(query)
    if not tokens:
        return escape(plain)

    pattern = "|".join(re.escape(t) for t in sorted(set(tokens), key=len, reverse=True))
    try:
        rx = re.compile(f"({pattern})", re.IGNORECASE)
    except re.error:
        return escape(plain)

    out: list[str] = []
    last = 0
    for m in rx.finditer(plain):
        out.append(escape(plain[last : m.start()]))
        out.append('<mark class="search-hit">')
        out.append(escape(m.group(0)))
        out.append("</mark>")
        last = m.end()
    out.append(escape(plain[last:]))
    return "".join(out)


def highlighted_title_html(page: Page, query: str) -> str:
    return highlight_plain_to_html(page.title or "", query)


def highlighted_preview_html(page: Page, query: str, use_excerpt_window: bool = True) -> str:
    raw = plain_preview_for_page(page)
    if use_excerpt_window:
        raw = excerpt_window(raw, query)
    return highlight_plain_to_html(raw, query)
