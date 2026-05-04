"""Template context for global site header (tickers + sector nav)."""

from __future__ import annotations

from home.market_format import (
    format_day_volume,
    format_percent_change,
    percent_change_css_class,
)
from home.navigation import (
    build_sector_nav,
    sector_nav_active_from_home_query,
)


def market_header(request):
    from home.models import HomePage, MarketTickerRow

    home = HomePage.objects.live().public().first()
    sector_nav = build_sector_nav(home)
    sector_nav_active = sector_nav_active_from_home_query(request, home)

    rows = list(
        MarketTickerRow.objects.filter(enabled=True).order_by("sort_order", "symbol")
    )
    header_tickers = []
    for row in rows:
        header_tickers.append(
            {
                "row": row,
                "label": row.display_label(),
                "pct_formatted": format_percent_change(row.percent_change),
                "pct_class": percent_change_css_class(row.percent_change),
                "volume_display": format_day_volume(row.day_volume),
            }
        )

    return {
        "sector_nav": sector_nav,
        "sector_nav_active": sector_nav_active,
        "header_tickers": header_tickers,
        "header_home": home,
    }
