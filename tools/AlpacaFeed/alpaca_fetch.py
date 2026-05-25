"""Alpaca market-data client: daily bars, 2H bars, news.

Stdlib-only. Reads creds from ../../.env (APCA_API_KEY_ID, APCA_API_SECRET_KEY)
or env vars of the same name. Used as a library by mcp_server.py and as a CLI.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Iterable

DATA_URL = "https://data.alpaca.markets"
DEFAULT_FEED = "iex"
ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


def load_credentials() -> tuple[str, str]:
    key = os.environ.get("APCA_API_KEY_ID")
    sec = os.environ.get("APCA_API_SECRET_KEY")
    if key and sec:
        return key, sec
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            line = line.strip()
            if "=" not in line or line.startswith("#"):
                continue
            k, v = line.split("=", 1)
            v = v.strip().strip('"').strip("'")
            if k == "APCA_API_KEY_ID":
                key = v
            elif k == "APCA_API_SECRET_KEY":
                sec = v
    if not (key and sec):
        raise RuntimeError(
            "Missing Alpaca creds. Set APCA_API_KEY_ID/APCA_API_SECRET_KEY env "
            f"vars or place them in {ENV_FILE}"
        )
    return key, sec


def _headers() -> dict[str, str]:
    key, sec = load_credentials()
    return {
        "APCA-API-KEY-ID": key,
        "APCA-API-SECRET-KEY": sec,
        "accept": "application/json",
    }


def _get(path: str, params: dict) -> dict:
    url = f"{DATA_URL}{path}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers=_headers())
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def _iso_window(days: int) -> tuple[str, str]:
    end = dt.datetime.utcnow().date() + dt.timedelta(days=1)
    start = end - dt.timedelta(days=days + 1)
    return start.isoformat(), end.isoformat()


def _fetch_bars(symbol: str, timeframe: str, days: int, feed: str) -> list[dict]:
    start, end = _iso_window(days)
    out: list[dict] = []
    token: str | None = None
    while True:
        params = {
            "symbols": symbol,
            "timeframe": timeframe,
            "start": start,
            "end": end,
            "limit": 1000,
            "adjustment": "split",
            "feed": feed,
        }
        if token:
            params["page_token"] = token
        data = _get("/v2/stocks/bars", params)
        out.extend(data.get("bars", {}).get(symbol, []))
        token = data.get("next_page_token")
        if not token:
            break
    return out


def get_daily_bars(symbol: str, days: int = 120, feed: str = DEFAULT_FEED) -> list[dict]:
    """Daily OHLCV bars for the last N calendar days."""
    return _fetch_bars(symbol, "1Day", days, feed)


def get_2h_bars(symbol: str, days: int = 45, feed: str = DEFAULT_FEED) -> list[dict]:
    """2-hour OHLCV bars for the last N calendar days."""
    return _fetch_bars(symbol, "2Hour", days, feed)


def get_news(symbols: Iterable[str], days: int = 10, limit: int = 200) -> list[dict]:
    """Recent news items covering any of the given symbols (desc by time)."""
    start, end = _iso_window(days)
    out: list[dict] = []
    token: str | None = None
    while True:
        params = {
            "symbols": ",".join(symbols),
            "start": start,
            "end": end,
            "limit": 50,
            "sort": "desc",
        }
        if token:
            params["page_token"] = token
        data = _get("/v1beta1/news", params)
        out.extend(data.get("news", []))
        token = data.get("next_page_token")
        if not token or len(out) >= limit:
            break
    return out[:limit]


def _cli() -> int:
    p = argparse.ArgumentParser(description="Fetch Alpaca bars + news for a ticker list")
    p.add_argument("--tickers", required=True, help="Comma-separated symbols")
    p.add_argument("--daily-days", type=int, default=120)
    p.add_argument("--h2-days", type=int, default=45)
    p.add_argument("--news-days", type=int, default=10)
    p.add_argument("--feed", default=DEFAULT_FEED, choices=["iex", "sip"])
    p.add_argument("--out", required=True, help="Output JSON path")
    args = p.parse_args()

    symbols = [s.strip().upper() for s in args.tickers.split(",") if s.strip()]
    result: dict = {"daily": {}, "h2": {}, "news": [], "meta": {
        "fetched_utc": dt.datetime.utcnow().isoformat() + "Z",
        "feed": args.feed,
        "symbols": symbols,
    }}
    for sym in symbols:
        d = get_daily_bars(sym, args.daily_days, args.feed)
        h = get_2h_bars(sym, args.h2_days, args.feed)
        result["daily"][sym] = d
        result["h2"][sym] = h
        print(f"  {sym:6s} daily={len(d):3d} 2H={len(h):4d}", file=sys.stderr)
    result["news"] = get_news(symbols, args.news_days)
    print(f"  news items={len(result['news'])}", file=sys.stderr)

    Path(args.out).write_text(json.dumps(result))
    print(f"wrote {args.out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(_cli())
