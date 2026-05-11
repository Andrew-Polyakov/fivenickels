"""Taxonomy section slugs for article enrichment (no Django dependency)."""

from __future__ import annotations

import re
from collections.abc import Iterable
from difflib import get_close_matches

TOP_ROW_SECTIONS: tuple[tuple[str, str], ...] = (
    ("Market News", "market-news"),
    ("Opinions", "opinions"),
    ("Personal Finance", "personal-finance"),
)

GICS_SECTIONS: tuple[tuple[str, str], ...] = (
    ("Communication Services", "communication-services"),
    ("Consumer Discretionary", "consumer-discretionary"),
    ("Consumer Staples", "consumer-staples"),
    ("Energy", "energy"),
    ("Financials", "financials"),
    ("Health Care", "health-care"),
    ("Industrials", "industrials"),
    ("Information Technology", "information-technology"),
    ("Materials", "materials"),
    ("Real Estate", "real-estate"),
    ("Utilities", "utilities"),
)

TOP_ROW_SECTION_SLUGS: frozenset[str] = frozenset(slug for _, slug in TOP_ROW_SECTIONS)
GICS_SECTION_SLUGS: frozenset[str] = frozenset(slug for _, slug in GICS_SECTIONS)
ALL_SECTION_SLUGS: tuple[str, ...] = tuple(
    dict.fromkeys([slug for _, slug in TOP_ROW_SECTIONS + GICS_SECTIONS])
)

_STOP_TOKENS = frozenset({"and", "the", "of", "for", "a", "an"})


def normalize_section_slug(value: str) -> str:
    slug = re.sub(r"\s+", " ", (value or "").strip()).lower()
    slug = re.sub(r"[^a-z0-9-]+", "-", slug)
    slug = re.sub(r"-{2,}", "-", slug).strip("-")
    return slug[:255]


def section_prompt_lines() -> list[str]:
    lines = [
        "Pick section_slug from the closest existing slug below.",
        "Prefer a GICS sector for company or industry news; use market-news for broad market coverage.",
        "Use opinions or personal-finance only when the story clearly fits those sections.",
        "If nothing fits, return a new lowercase hyphenated slug (2-4 words).",
        "Existing section slugs:",
    ]
    for name, slug in TOP_ROW_SECTIONS:
        lines.append(f"- {slug} ({name})")
    for name, slug in GICS_SECTIONS:
        lines.append(f"- {slug} ({name})")
    return lines


def resolve_section_slug(candidate: str, *, extra_slugs: Iterable[str] = ()) -> str:
    slug = normalize_section_slug(candidate)
    if not slug:
        return ""

    known = set(ALL_SECTION_SLUGS) | {normalize_section_slug(item) for item in extra_slugs}
    known.discard("")
    if slug in known:
        return slug

    matches = get_close_matches(slug, sorted(known), n=1, cutoff=0.74)
    if matches:
        return matches[0]

    tokens = {token for token in slug.split("-") if token and token not in _STOP_TOKENS}
    if tokens:
        best_slug = ""
        best_score = 0
        for known_slug in known:
            known_tokens = {
                token for token in known_slug.split("-") if token and token not in _STOP_TOKENS
            }
            overlap = len(tokens & known_tokens)
            if overlap > best_score:
                best_score = overlap
                best_slug = known_slug
        if best_slug and best_score >= 1:
            return best_slug

    return slug
