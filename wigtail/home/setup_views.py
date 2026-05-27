"""Swing trader setups page (crawler DB)."""

from __future__ import annotations

from django.http import HttpRequest, HttpResponse
from django.shortcuts import render
from django.urls import reverse

from home.alpaca_market_client import bars_feed_from_env
from home.crawler_setups import fetch_setups_for_run, latest_scan_run_id
from home.us_market_session import classify_us_market_session
from home.ticker_utils import href_for_ticker_subpage


def swing_setups(request: HttpRequest) -> HttpResponse:
    setups: list[dict] = []
    run_id = latest_scan_run_id()
    if run_id is not None:
        setups = fetch_setups_for_run(run_id)

    for row in setups:
        sym = str(row["symbol"]).upper()
        row["ticker_href"] = href_for_ticker_subpage(ticker_slug=sym.lower())

    mkt = classify_us_market_session()
    return render(
        request,
        "home/swing_setups.html",
        {
            "setups": setups,
            "market_session_label": mkt.label,
            "market_session_id": mkt.id,
            "data_feed": bars_feed_from_env(),
            "price_basis": mkt.price_basis,
            "stock_bars_preview_url": reverse("stock_bars_preview"),
        },
    )
