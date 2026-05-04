"""
Fetch US equity metadata from Alpaca Trading API (GET /v2/assets/{symbol}).

Uses the same APCA_* credentials as news / market data clients.
"""

from __future__ import annotations

from typing import Any

import requests

from home.alpaca_news_client import load_alpaca_credentials

TRADING_API_BASE = "https://api.alpaca.markets"


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
    url = f"{TRADING_API_BASE.rstrip('/')}/v2/assets/{sym}"
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
