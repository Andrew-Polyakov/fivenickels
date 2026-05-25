"""US Eastern dateline labels for published article pages."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone as dt_timezone

from django.utils import timezone

from home.market_events import US_EASTERN


def format_article_dateline_et(dt: datetime | None) -> tuple[str | None, str | None]:
    """
    Format a datetime for the article meta row.

    Returns (display, iso_utc) e.g. ("Fri, May 22 2026 3:34 PM EDT", "2026-05-22T19:34:00+00:00").
    """
    if dt is None:
        return None, None
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt, dt_timezone.utc)
    local = dt.astimezone(US_EASTERN)
    hour = local.strftime("%I").lstrip("0") or "12"
    tz_label = local.tzname() or "ET"
    display = (
        f"{local.strftime('%a, %b %d %Y')} "
        f"{hour}:{local.strftime('%M %p')} {tz_label}"
    )
    return display.strip(), dt.astimezone(dt_timezone.utc).isoformat()


def _ensure_aware(dt: datetime) -> datetime:
    if timezone.is_naive(dt):
        return timezone.make_aware(dt, dt_timezone.utc)
    return dt


def format_relative_dateline_label(prefix: str, dt: datetime | None) -> str | None:
    """Human-readable relative label, e.g. ``Updated 4 hr ago`` or ``Updated last year``."""
    if dt is None:
        return None
    dt = _ensure_aware(dt)
    now = timezone.now()
    diff = now - dt
    if diff < timedelta(0):
        return f"{prefix} just now"

    minutes = int(diff.total_seconds() // 60)
    if minutes < 1:
        return f"{prefix} just now"
    if minutes < 60:
        return f"{prefix} {minutes} min ago"

    hours = minutes // 60
    if hours < 24:
        unit = "hr" if hours == 1 else "hr"
        return f"{prefix} {hours} {unit} ago"

    days = hours // 24
    if days == 1:
        return f"{prefix} 1 day ago"
    if days < 7:
        return f"{prefix} {days} days ago"
    if days < 14:
        return f"{prefix} last week"
    if days < 45:
        weeks = days // 7
        return f"{prefix} {weeks} weeks ago"
    if days < 365:
        months = max(1, days // 30)
        if months == 1:
            return f"{prefix} last month"
        return f"{prefix} {months} months ago"

    years = days // 365
    if years == 1:
        return f"{prefix} last year"
    return f"{prefix} {years} years ago"


def article_dateline_context(page) -> dict:
    """Context keys for tagged_content_page header meta row."""
    published_display = None
    published_iso = None
    if page.first_published_at:
        published_display, published_iso = format_article_dateline_et(page.first_published_at)

    updated_display = None
    updated_iso = None
    updated_at = page.last_published_at or page.latest_revision_created_at
    if updated_at:
        updated_display, updated_iso = format_article_dateline_et(updated_at)

    header_label = None
    if updated_at:
        header_label = format_relative_dateline_label("Updated", updated_at)
    elif page.first_published_at:
        header_label = format_relative_dateline_label("Published", page.first_published_at)

    accordion = None
    if header_label and (published_display or updated_display):
        accordion = {
            "headerLabel": header_label,
            "published": (
                {"display": published_display, "iso": published_iso}
                if published_display
                else None
            ),
            "updated": (
                {"display": updated_display, "iso": updated_iso}
                if updated_display
                else None
            ),
        }

    return {
        "article_published_display": published_display,
        "article_published_iso": published_iso,
        "article_updated_display": updated_display,
        "article_updated_iso": updated_iso,
        "article_datelines_accordion": accordion,
    }
