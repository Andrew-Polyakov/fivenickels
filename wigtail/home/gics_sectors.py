"""GICS S&P 500 sector names and stable slugs (order preserved for homepage nav)."""

from __future__ import annotations

# (display name, slug) — canonical GICS sectors, 11 entries
GICS_SECTORS: tuple[tuple[str, str], ...] = (
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

GICS_SECTOR_SLUGS: frozenset[str] = frozenset(slug for _, slug in GICS_SECTORS)

GICS_SECTOR_ORDER: dict[str, int] = {slug: i for i, (_, slug) in enumerate(GICS_SECTORS)}
