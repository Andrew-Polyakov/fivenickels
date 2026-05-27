"""
Fetch US equity metadata from Alpaca Trading API (GET /v2/assets).

Uses the same APCA_* credentials as news / market data clients.
"""

from __future__ import annotations

from typing import Any, Iterable

import requests

from home.alpaca_news_client import get_alpaca_trading_base_url, load_alpaca_credentials

# Major US listing venues for carousel / ticker universe.
US_EQUITY_EXCHANGES = frozenset(
    {
        "AMEX",
        "ARCA",
        "BATS",
        "NASDAQ",
        "NYSE",
        "NYSEARCA",
        "NYSEAMERICAN",
    }
)


def _normalize_asset(item: dict[str, Any]) -> dict[str, Any] | None:
    sym = str(item.get("symbol") or "").strip().upper()
    if not sym or not sym.isalpha():
        return None
    if len(sym) > 16:
        return None
    return {
        "symbol": sym,
        "name": str(item.get("name") or "").strip(),
        "exchange": str(item.get("exchange") or "").strip().upper(),
        "asset_class": str(item.get("class") or item.get("asset_class") or "").strip().lower(),
        "status": str(item.get("status") or "").strip().lower(),
        "tradable": bool(item.get("tradable")),
        "shortable": bool(item.get("shortable")),
        "easy_to_borrow": bool(item.get("easy_to_borrow")),
        "fractionable": bool(item.get("fractionable")),
    }


def filter_us_tradable_equity_assets(assets: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    """Aggressive filter: active, tradable US equities on major US exchanges."""
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for raw in assets:
        if not isinstance(raw, dict):
            continue
        row = _normalize_asset(raw)
        if row is None:
            continue
        if row["symbol"] in seen:
            continue
        if row["status"] != "active":
            continue
        if not row["tradable"]:
            continue
        if row["asset_class"] and row["asset_class"] != "us_equity":
            continue
        ex = row["exchange"]
        if ex and ex not in US_EQUITY_EXCHANGES:
            continue
        seen.add(row["symbol"])
        out.append(row)
    return out


def fetch_all_assets(
    *,
    status: str = "active",
    asset_class: str = "us_equity",
    timeout: float = 120.0,
    session: requests.Session | None = None,
) -> list[dict[str, Any]]:
    """
    List assets from GET /v2/assets (paginated when Alpaca returns page_token).
    Returns raw normalized dicts (not yet exchange-filtered).
    """
    kid, sec = load_alpaca_credentials()
    if not kid or not sec:
        raise ValueError(
            "Missing Alpaca credentials: set APCA_API_KEY_ID and APCA_API_SECRET_KEY."
        )
    base = get_alpaca_trading_base_url()
    http = session or requests.Session()
    headers = {
        "APCA-API-KEY-ID": kid,
        "APCA-API-SECRET-KEY": sec,
    }
    params: dict[str, str] = {}
    if status:
        params["status"] = status
    if asset_class:
        params["asset_class"] = asset_class

    out: list[dict[str, Any]] = []
    page_token: str | None = None
    pages = 0
    while pages < 200:
        pages += 1
        req_params = dict(params)
        if page_token:
            req_params["page_token"] = page_token
        url = f"{base}/v2/assets"
        r = http.get(url, headers=headers, params=req_params, timeout=timeout)
        if r.status_code == 401 and pages == 1 and not page_token:
            from home.alpaca_news_client import (
                DEFAULT_TRADING_BASE_LIVE,
                DEFAULT_TRADING_BASE_PAPER,
            )

            alt = (
                DEFAULT_TRADING_BASE_PAPER
                if base.rstrip("/") == DEFAULT_TRADING_BASE_LIVE.rstrip("/")
                else DEFAULT_TRADING_BASE_LIVE
            ).rstrip("/")
            if alt != base.rstrip("/"):
                base = alt
                url = f"{base}/v2/assets"
                r = http.get(url, headers=headers, params=req_params, timeout=timeout)
        if r.status_code == 401:
            raise ValueError(
                f"Alpaca trading API returned 401 for {url}. "
                "Paper keys need ALPACA_ENV=paper (uses paper-api.alpaca.markets); "
                "live keys need ALPACA_ENV=live (api.alpaca.markets). "
                "Or set ALPACA_TRADING_BASE_URL explicitly."
            ) from None
        r.raise_for_status()
        payload = r.json()
        if isinstance(payload, list):
            batch = payload
            page_token = None
        elif isinstance(payload, dict):
            batch = payload.get("assets") or payload.get("results") or []
            if not isinstance(batch, list):
                batch = []
            page_token = payload.get("next_page_token") or payload.get("page_token")
        else:
            break
        for item in batch:
            if isinstance(item, dict):
                norm = _normalize_asset(item)
                if norm:
                    out.append(norm)
        if not page_token:
            break
    return out


def fetch_asset_meta(symbol: str, *, timeout: float = 10.0) -> dict[str, Any] | None:
    """
    Return Alpaca asset JSON for symbol (name, exchange, class, status, …) or None.
    """
    sym = (symbol or "").strip().upper()
    if not sym:
        return None
    kid, sec = load_alpaca_credentials()
    if not kid or not sec:
        return None
    url = f"{get_alpaca_trading_base_url()}/v2/assets/{sym}"
    headers = {
        "APCA-API-KEY-ID": kid,
        "APCA-API-SECRET-KEY": sec,
    }
    try:
        r = requests.get(url, headers=headers, timeout=timeout)
    except OSError:
        return None
    if r.status_code != 200:
        return None
    try:
        data = r.json()
    except ValueError:
        return None
    return data if isinstance(data, dict) else None
