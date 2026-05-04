"""Render-time: leading ``Symbols:`` row as carousel chips; Benzinga quote URLs and exchange tokens as chips or /ticker/ links."""

from __future__ import annotations

import re
from django.template.loader import render_to_string
from django.utils.html import escape
from django.utils.safestring import SafeString, mark_safe
from wagtailmarkdown.utils import _sanitise_markdown_html, render_markdown

from home.models import MarketTickerRow
from home.ticker_utils import _exchange_match_spans, chip_context_for_row, href_for_ticker_subpage

# ``[SYM](/ticker/slug/)`` from ingest / editors
_TICKER_MD_LINK_RE = re.compile(
    r"\[[^\]]+\]\(\s*/ticker/([a-z0-9\-]+)/\s*\)",
    re.IGNORECASE,
)

# Ticker segment only — no greedy ``.`` swallowing a sentence-ending period after ``NVDA``.
_TICKER_IN_QUOTE_PATH = r"[A-Za-z][A-Za-z0-9]{0,5}(?:\.[A-Za-z]{1,4})?"

_MD_BENZINGA_LINK_RE = re.compile(
    rf"\[[^\]]*\]\(\s*(https?://(?:www\.)?benzinga\.com/quote/{_TICKER_IN_QUOTE_PATH}[^)\s]*)\s*\)",
    re.IGNORECASE,
)

_RAW_BENZINGA_QUOTE_RE = re.compile(
    rf"https?://(?:www\.)?benzinga\.com/quote/{_TICKER_IN_QUOTE_PATH}/?(?:\?[^\s\]\)]*)?",
    re.IGNORECASE,
)

_SYM_FROM_QUOTE_PATH = re.compile(
    rf"/quote/({_TICKER_IN_QUOTE_PATH})", re.IGNORECASE
)


def split_leading_symbols_line(markdown: str) -> tuple[str | None, str]:
    """
    If the first line starts with ``Symbols:``, return (rest_of_that_line, following_markdown).
    Otherwise (None, full_text).
    """
    md = markdown or ""
    if not md.strip():
        return None, md
    lines = md.split("\n")
    first_stripped = (lines[0] or "").strip()
    m = re.match(r"^symbols:\s*(.*)$", first_stripped, re.IGNORECASE)
    if not m:
        return None, md
    line_body = (m.group(1) or "").strip()
    # Keep every newline after the first logical line (``\n\n`` before body stays intact).
    prefix = lines[0]
    remainder = md[len(prefix) :]
    return line_body, remainder


def parse_symbols_from_leading_line(line_body: str) -> list[str]:
    """Symbol strings for ``MarketTickerRow`` lookup from `` · ``-joined markdown links."""
    if not line_body:
        return []
    out: list[str] = []
    seen: set[str] = set()
    for part in line_body.split("\u00b7"):
        part = part.strip()
        mm = _TICKER_MD_LINK_RE.search(part)
        if not mm:
            continue
        slug = mm.group(1)
        sym = slug.strip().upper().replace("-", ".")
        if sym and sym not in seen:
            seen.add(sym)
            out.append(sym)
    return out


def _symbol_from_benzinga_url(url: str) -> str | None:
    m = _SYM_FROM_QUOTE_PATH.search(url or "")
    if not m:
        return None
    return m.group(1).upper()


def _resolve_row_by_ticker_slug(slug: str) -> MarketTickerRow | None:
    sym = slug.strip().upper().replace("-", ".")
    if not sym:
        return None
    return MarketTickerRow.objects.filter(symbol=sym, enabled=True).first()


def _row_for_benzinga_symbol(sym: str) -> MarketTickerRow | None:
    if not sym:
        return None
    return MarketTickerRow.objects.filter(symbol=sym.upper(), enabled=True).first()


def _overlaps(start: int, end: int, taken: list[tuple[int, int]]) -> bool:
    return any(not (end <= ts or start >= te) for ts, te in taken)


def _strip_duplicate_ticker_spans(md: str) -> str:
    """
    Remove later occurrences of the same ticker reference (identical span text for the
    same symbol). Alpaca/Benzinga HTML often repeats the same quote link or line; this
    keeps the first mention for chip replacement and drops duplicate URL/token text.
    """
    if not md:
        return md
    candidates = _collect_ticker_candidates(md)
    if not candidates:
        return md
    seen_keys: set[tuple[str, str]] = set()
    to_remove: list[tuple[int, int]] = []
    for start, end, sym, _kind in sorted(candidates, key=lambda x: x[0]):
        span_text = md[start:end]
        key = (sym.upper(), span_text)
        if key in seen_keys:
            to_remove.append((start, end))
        else:
            seen_keys.add(key)
    out = md
    for start, end in sorted(to_remove, key=lambda x: -x[0]):
        out = out[:start] + out[end:]
    return out


def _collect_ticker_candidates(md: str) -> list[tuple[int, int, str, str]]:
    """
    (start, end, symbol, kind) where kind is benzinga_md | benzinga_raw | ticker_md | exchange.
    Longer spans preferred to resolve overlaps.
    """
    found: list[tuple[int, int, str, str]] = []
    for m in _MD_BENZINGA_LINK_RE.finditer(md):
        sym = _symbol_from_benzinga_url(m.group(1))
        if sym:
            found.append((m.start(), m.end(), sym, "benzinga_md"))
    for m in _RAW_BENZINGA_QUOTE_RE.finditer(md):
        sym = _symbol_from_benzinga_url(m.group(0))
        if sym:
            found.append((m.start(), m.end(), sym, "benzinga_raw"))
    for m in _TICKER_MD_LINK_RE.finditer(md):
        slug = m.group(1)
        row = _resolve_row_by_ticker_slug(slug)
        if row:
            found.append((m.start(), m.end(), row.symbol, "ticker_md"))
    for start, end, m in _exchange_match_spans(md):
        sym = m.group(2).upper()
        found.append((start, end, sym, "exchange"))

    found.sort(key=lambda x: (-(x[1] - x[0]), x[0]))
    taken: list[tuple[int, int]] = []
    accepted: list[tuple[int, int, str, str]] = []
    for start, end, sym, kind in found:
        if _overlaps(start, end, taken):
            continue
        taken.append((start, end))
        accepted.append((start, end, sym, kind))
    return accepted


def _token_for_index(i: int) -> str:
    return f"WAGTAILTKCHP{i:05d}END"


def _tokenize_body(md: str) -> tuple[str, dict[str, tuple[str, object]]]:
    """
    Replace detections with unique tokens. Token payload: (``chip``|``link``, row or symbol str).
    """
    if not md:
        return "", {}
    candidates = _collect_ticker_candidates(md)
    candidates.sort(key=lambda x: -x[0])
    token_map: dict[str, tuple[str, object]] = {}
    out = md
    n = 0
    for start, end, sym, kind in candidates:
        n += 1
        tok = _token_for_index(n)
        row: MarketTickerRow | None = None
        if kind in ("benzinga_md", "benzinga_raw"):
            row = _row_for_benzinga_symbol(sym)
        elif kind == "ticker_md":
            row = MarketTickerRow.objects.filter(symbol=sym.upper(), enabled=True).first()
        else:
            row = MarketTickerRow.objects.filter(symbol=sym, enabled=True).first()

        if row:
            token_map[tok] = ("chip", row)
        else:
            token_map[tok] = ("link", sym)
        out = out[:start] + tok + out[end:]
    return out, token_map


def _render_chip_span(row: MarketTickerRow) -> str:
    inner = render_to_string(
        "components/ticker_chip.html",
        {"chip": chip_context_for_row(row), "dup": False},
    )
    return f'<span class="ticker-chip-inline-wrap">{inner}</span>'


def _render_link_only(sym: str) -> str:
    href = href_for_ticker_subpage(None, ticker_slug=sym.lower())
    label = escape(sym.upper())
    return (
        f'<a href="{escape(href)}" class="ticker-chip ticker-chip--inline '
        f'ticker-chip--linkonly"><span class="ticker-chip__box">{label}</span></a>'
    )


def _inject_tokens(html: str, token_map: dict[str, tuple[str, object]]) -> str:
    out = html
    for tok, (mode, payload) in token_map.items():
        if mode == "chip" and isinstance(payload, MarketTickerRow):
            frag = _render_chip_span(payload)
        elif mode == "link" and isinstance(payload, str):
            frag = _render_link_only(payload)
        else:
            frag = ""
        out = out.replace(tok, frag, 1)
    return out


def render_symbol_row_html(line_body: str | None) -> SafeString:
    if not line_body:
        return mark_safe("")
    symbols = parse_symbols_from_leading_line(line_body)
    rows: list[MarketTickerRow] = []
    seen: set[str] = set()
    for sym in symbols:
        row = MarketTickerRow.objects.filter(symbol=sym, enabled=True).first()
        if row and row.symbol not in seen:
            seen.add(row.symbol)
            rows.append(row)
    if not rows:
        return mark_safe("")
    parts = ['<div class="tagged-content__symbol-row">']
    for row in rows:
        parts.append(
            render_to_string(
                "components/ticker_chip.html",
                {"chip": chip_context_for_row(row), "dup": False},
            )
        )
    parts.append("</div>")
    return mark_safe(_sanitise_markdown_html("".join(parts)))


def render_article_markdown_body_html(remainder_md: str) -> SafeString:
    """Markdown body with Benzinga URLs, /ticker/ md links, and exchange tokens → chips or links."""
    md = remainder_md or ""
    md = _strip_duplicate_ticker_spans(md)
    tokenized, token_map = _tokenize_body(md)
    html = render_markdown(tokenized, context=None)
    enriched = _inject_tokens(str(html), token_map)
    return mark_safe(_sanitise_markdown_html(enriched))


def render_article_markdown_block_html(markdown: str) -> SafeString:
    """Full article markdown block: optional symbol chip row + enriched body."""
    sym_line, remainder = split_leading_symbols_line(markdown)
    row_html = render_symbol_row_html(sym_line)
    body_html = render_article_markdown_body_html(remainder)
    return mark_safe(f"{row_html}{body_html}")
