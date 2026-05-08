"""Template context for global site header (tickers + taxonomy nav)."""

from __future__ import annotations

from django.conf import settings

from home.alpaca_forex_client import get_cached_forex_quote_rows, placeholder_forex_rows
from home.ticker_utils import chip_context_for_row
from home.taxonomy import (
    MARKET_NEWS_SLUG,
    build_site_nav_menu_payload,
    get_site_nav_template_context,
    resolve_page_for_nav,
    taxonomy_prefix_path,
    taxonomy_roots_for_nav,
)


def _build_market_movers(rows: list, selected_region_key: str) -> dict:
    """Build left-rail market movers groups from ticker snapshots."""
    eligible = [
        row
        for row in rows
        if row.enabled
        and row.percent_change is not None
        and (getattr(row, "market_region", "US") or "US").upper() == selected_region_key
    ]
    winner_rows = sorted(
        [row for row in eligible if row.percent_change > 0],
        key=lambda row: row.percent_change,
        reverse=True,
    )[:10]
    looser_rows = sorted(
        [row for row in eligible if row.percent_change < 0],
        key=lambda row: row.percent_change,
    )[:10]
    winners = [chip_context_for_row(row) for row in winner_rows]
    loosers = [chip_context_for_row(row) for row in looser_rows]
    return {
        "winners": winners,
        "loosers": loosers,
        "has_data": bool(winners or loosers),
    }


def market_header(request):
    from wagtail.models import Site

    from home.models import CareersPage, CookiesPolicyPage, HomePage, MarketTickerRow

    home = None
    site = getattr(request, "site", None)
    if site is None:
        raw_host = (request.get_host() or "").split(":")[0]
        raw_port = request.META.get("SERVER_PORT")
        try:
            port = int(raw_port) if raw_port else 80
        except ValueError:
            port = 80
        if raw_host:
            site = Site.objects.filter(hostname=raw_host, port=port).select_related(
                "root_page"
            ).first()
            if site is None:
                site = Site.objects.filter(hostname=raw_host).select_related(
                    "root_page"
                ).first()
    if site is None:
        site = Site.objects.filter(is_default_site=True).select_related("root_page").first()
    if site and site.root_page:
        root = site.root_page.specific
        if isinstance(root, HomePage):
            home = root
    if home is None:
        home = HomePage.objects.live().public().first()
    nav_ctx = None
    if home:
        try:
            nav_ctx = get_site_nav_template_context(request, home)
        except Exception:
            roots = list(taxonomy_roots_for_nav(home))
            nav_ctx = {
                "home_page": home,
                "taxonomy_prefix": taxonomy_prefix_path(home),
                "nav_rows": [{"depth": 1, "nodes": roots, "parent_id": None}],
                "active_node": None,
                "trail": [],
                "trail_slugs": [],
            }
    site_footer_roots = (
        [t for t in taxonomy_roots_for_nav(home) if t.slug != MARKET_NEWS_SLUG]
        if home
        else []
    )

    rows = list(
        MarketTickerRow.objects.filter(enabled=True).order_by("sort_order", "symbol")
    )
    selected_region_raw = (request.GET.get("market_region") or "US").strip().upper()
    selected_region_key = (
        selected_region_raw
        if selected_region_raw in {"US", "ASIA", "EUROPE"}
        else "US"
    )
    header_tickers = [chip_context_for_row(row) for row in rows]
    market_mover_tabs = []
    for key, label in (("US", "US"), ("ASIA", "Asia"), ("EUROPE", "Europe")):
        q = request.GET.copy()
        q["market_region"] = key
        market_mover_tabs.append(
            {
                "key": key,
                "label": label,
                "active": key == selected_region_key,
                "url": f"{request.path}?{q.urlencode()}",
            }
        )

    forex_quotes = get_cached_forex_quote_rows()
    if not forex_quotes and getattr(settings, "FOREX_PAIRS", None):
        forex_quotes = placeholder_forex_rows(list(settings.FOREX_PAIRS))

    out = {
        "header_tickers": header_tickers,
        "forex_quotes": forex_quotes,
        "market_movers": _build_market_movers(rows, selected_region_key),
        "market_mover_tabs": market_mover_tabs,
        "header_home": home,
        "site_footer_roots": site_footer_roots,
        "footer_careers_page": CareersPage.objects.live().public().first(),
        "footer_cookies_page": CookiesPolicyPage.objects.live().public().first(),
    }
    if nav_ctx:
        page = resolve_page_for_nav(request)
        site_nav_menu_payload = build_site_nav_menu_payload(
            request,
            nav_ctx["home_page"],
            nav_ctx["nav_rows"],
            nav_ctx.get("trail_slugs") or [],
            nav_ctx.get("trail") or [],
            page=page,
        )
        out.update(
            {
                "site_nav_home_page": nav_ctx["home_page"],
                "site_nav_rows": nav_ctx["nav_rows"],
                "site_nav_active_node": nav_ctx.get("active_node"),
                "site_nav_trail": nav_ctx.get("trail") or [],
                "site_nav_trail_slugs": nav_ctx.get("trail_slugs") or [],
                "site_nav_menu_payload": site_nav_menu_payload,
            }
        )
    return out
