"""
Map Alpaca news article HTML/plain fields to MAIN_SITE_STREAMBLOCK stream data
and a markdown tile preview string.
"""

from __future__ import annotations

import re
from urllib.parse import urlparse

import bleach
from bs4 import BeautifulSoup
from django.utils.html import escape
from wagtail.rich_text import RichText

from home.alpaca_news_client import AlpacaNewsArticle
from home.ticker_utils import replace_exchange_ticker_tokens

_ALLOWED_TAGS = frozenset(
    {"p", "br", "a", "strong", "em", "u", "ul", "ol", "li", "span"}
)
_ALLOWED_ATTRS = {
    "a": ["href", "title", "rel", "class"],
    "span": ["class"],
}
_PARAGRAPH_CHIP_TAGS = frozenset(
    {"p", "a", "span"},
)
_PARAGRAPH_CHIP_ATTRS = {
    "a": ["href", "title", "rel", "class"],
    "span": ["class"],
}
_STRIP = True

_TITLE_MAX = 250
_PREVIEW_MAX = 500


def truncate_title(headline: str) -> str:
    h = (headline or "").strip()
    if len(h) <= _TITLE_MAX:
        return h or "Untitled"
    return h[: _TITLE_MAX - 1].rstrip() + "…"


def _strip_html_to_plain(html: str) -> str:
    if not html:
        return ""
    soup = BeautifulSoup(html, "html.parser")
    return soup.get_text(separator=" ", strip=True)


def _clean_html(html: str) -> str:
    if not html:
        return ""
    return bleach.clean(
        html,
        tags=_ALLOWED_TAGS,
        attributes=_ALLOWED_ATTRS,
        strip=_STRIP,
    )


def _clean_paragraph_with_chips(html: str) -> str:
    """Allow carousel-style inline ticker chips inside a single paragraph."""
    if not html:
        return ""
    return bleach.clean(
        html,
        tags=_PARAGRAPH_CHIP_TAGS,
        attributes=_PARAGRAPH_CHIP_ATTRS,
        strip=_STRIP,
    )


def _paragraph_texts_from_html(html: str) -> list[str]:
    cleaned = _clean_html(html)
    if not cleaned.strip():
        return []
    soup = BeautifulSoup(cleaned, "html.parser")
    texts: list[str] = []
    for p in soup.find_all("p"):
        t = p.get_text(separator=" ", strip=True)
        if t:
            texts.append(t)
    if texts:
        return texts
    # Lists or bare nodes
    for li in soup.find_all("li"):
        t = li.get_text(separator=" ", strip=True)
        if t:
            texts.append(t)
    if texts:
        return texts
    one = soup.get_text(separator=" ", strip=True)
    return [one] if one else []


def build_tile_preview(article: AlpacaNewsArticle) -> str:
    """Plain-ish markdown-safe excerpt for listing tiles."""
    src = (article.summary or "").strip()
    if not src:
        src = _strip_html_to_plain(article.content)
    if not src:
        src = article.headline or ""
    src = re.sub(r"\s+", " ", src).strip()
    if len(src) > _PREVIEW_MAX:
        src = src[: _PREVIEW_MAX - 1].rstrip() + "…"
    return src


def _rich_text_ticker_symbol_line(article: AlpacaNewsArticle, home_page) -> RichText | None:
    """
    Link article symbols to /ticker/<slug>/ when the symbol exists in an enabled
    MarketTickerRow (header carousel allowlist).
    """
    if home_page is None:
        return None
    from home.models import MarketTickerRow
    from home.ticker_utils import href_for_ticker_subpage

    allowed = set(
        MarketTickerRow.objects.filter(enabled=True).values_list("symbol", flat=True)
    )
    parts: list[str] = []
    seen: set[str] = set()
    for sym in article.symbols:
        su = sym.strip().upper()
        if not su or su not in allowed or su in seen:
            continue
        seen.add(su)
        href = href_for_ticker_subpage(home_page, ticker_slug=su.lower())
        parts.append(f'<a href="{escape(href)}">{escape(su)}</a>')
    if not parts:
        return None
    inner = " · ".join(parts)
    return RichText(f"<p>Symbols: {inner}</p>")


def _safe_http_url(url: str | None) -> str | None:
    if not url:
        return None
    u = url.strip()
    if not u:
        return None
    p = urlparse(u)
    if p.scheme in ("http", "https") and p.netloc:
        return u
    return None


def streamfield_body_for_article(article: AlpacaNewsArticle, *, home_page=None) -> list:
    """
    Build stream_block-compatible list: heading + optional symbol links + paragraphs
    + attribution. Pass `home_page` to add /ticker/... links for carousel symbols.
    """
    title = truncate_title(article.headline)
    blocks: list = [
        ("heading", {"level": "h2", "text": title}),
    ]

    sym_block = _rich_text_ticker_symbol_line(article, home_page)
    if sym_block is not None:
        blocks.append(("paragraph", sym_block))

    body_html = (article.content or "").strip()
    summary_plain = (article.summary or "").strip()

    paras: list[str] = []
    if body_html:
        paras = _paragraph_texts_from_html(body_html)
    if not paras and summary_plain:
        paras = [summary_plain]
    if not paras and article.headline:
        paras = [article.headline.strip()]

    for ptext in paras:
        fragment = replace_exchange_ticker_tokens(ptext)
        cleaned = _clean_paragraph_with_chips(fragment)
        blocks.append(("paragraph", RichText(f"<p>{cleaned}</p>")))

    src_name = (article.source or "News").strip() or "News"
    link = _safe_http_url(article.url)
    if link:
        attr = RichText(
            "<p>"
            f'Source: <a href="{escape(link)}">{escape(src_name)}</a>. '
            "Syndicated via Alpaca Markets news feed. Not investment advice."
            "</p>"
        )
    else:
        attr = RichText(
            "<p>"
            f"Source: {escape(src_name)}. "
            "Syndicated via Alpaca Markets news feed. Not investment advice."
            "</p>"
        )
    blocks.append(("paragraph", attr))
    return blocks


def content_tags_for_article(article: AlpacaNewsArticle) -> list[tuple[str, str]]:
    """
    Return (name, slug) pairs for ContentTag get_or_create.
    Symbols uppercased in name; slug lowercase alphanumeric/hyphen.
    """

    def slugify_token(raw: str) -> str:
        s = raw.strip().lower()
        s = re.sub(r"[^a-z0-9]+", "-", s)
        return s.strip("-")[:255] or "tag"

    pairs: list[tuple[str, str]] = []
    seen: set[str] = set()

    for sym in article.symbols:
        su = sym.strip().upper()
        if not su:
            continue
        slug = slugify_token(su)
        if slug in seen:
            continue
        seen.add(slug)
        pairs.append((su, slug))

    if article.source:
        slug = slugify_token(article.source)
        if slug not in seen:
            seen.add(slug)
            disp = article.source.strip()
            pairs.append((disp, slug))

    return pairs
