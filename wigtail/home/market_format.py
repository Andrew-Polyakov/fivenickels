"""Shared formatting for market snapshots (carousel header + ticker page summary)."""

from __future__ import annotations

from decimal import Decimal


def format_percent_change(pct: Decimal | None) -> str:
    if pct is None:
        return "—"
    sign = "+" if pct >= 0 else ""
    quant = pct.quantize(Decimal("0.01"))
    return f"{sign}{quant}%"


def percent_change_css_class(pct: Decimal | None) -> str:
    if pct is None:
        return "is-neutral"
    if pct > 0:
        return "is-up"
    if pct < 0:
        return "is-down"
    return "is-neutral"


def format_day_volume(vol: int | None) -> str:
    if vol is None:
        return ""
    if vol >= 1_000_000_000:
        return f"{vol / 1_000_000_000:.2f}B"
    if vol >= 1_000_000:
        return f"{vol / 1_000_000:.2f}M"
    if vol >= 1_000:
        return f"{vol / 1_000:.1f}K"
    return str(vol)


def format_equity_price(price: Decimal | None) -> str:
    if price is None:
        return "—"
    try:
        p = price
        if abs(p) >= Decimal("1"):
            q = p.quantize(Decimal("0.01"))
        else:
            q = p.quantize(Decimal("0.0001"))
        return format(q, "f")
    except Exception:
        return "—"


def format_dollar_change_vs_previous_close(
    last_price: Decimal | None,
    previous_close: Decimal | None,
) -> str:
    """Day-over-day dollar move when both prices exist."""
    if last_price is None or previous_close is None:
        return "—"
    try:
        delta = last_price - previous_close
        if delta == 0:
            return "$0.00"
        sign = "+" if delta > 0 else ""
        ad = abs(delta)
        if ad >= Decimal("1"):
            body = format(ad.quantize(Decimal("0.01")), "f")
        else:
            body = format(ad.quantize(Decimal("0.0001")), "f")
        return f"{sign}${body}"
    except Exception:
        return "—"

