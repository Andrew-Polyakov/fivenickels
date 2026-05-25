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
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Generator, Iterable

DATA_URL = "https://data.alpaca.markets"
DEFAULT_FEED = "iex"
ENV_FILE = Path(__file__).resolve().parents[2] / ".env"
# Safety rail: 50 pages × 1000 bars = 50k points max; never hit in normal use.
_MAX_PAGES = 50


def _load_credentials() -> tuple[str, str]:
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


# Cached at import time — fails fast on startup if creds are absent.
_API_KEY, _API_SECRET = _load_credentials()


def _headers() -> dict[str, str]:
    return {
        "APCA-API-KEY-ID": _API_KEY,
        "APCA-API-SECRET-KEY": _API_SECRET,
        "accept": "application/json",
    }


def _get(path: str, params: dict) -> dict:
    url = f"{DATA_URL}{path}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers=_headers())
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as exc:
        body = ""
        try:
            body = exc.read().decode(errors="replace")[:200]
        except Exception:
            pass
        if exc.code == 401:
            raise RuntimeError("Alpaca API: invalid credentials (401)") from exc
        if exc.code == 403:
            raise RuntimeError("Alpaca API: forbidden — check subscription level (403)") from exc
        if exc.code == 429:
            raise RuntimeError("Alpaca API: rate limited — retry later (429)") from exc
        raise RuntimeError(f"Alpaca API error {exc.code}: {body}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Alpaca API: network error — {exc.reason}") from exc


def _iso_window(days: int) -> tuple[str, str]:
    end = dt.datetime.utcnow().date() + dt.timedelta(days=1)
    start = end - dt.timedelta(days=days + 1)
    return start.isoformat(), end.isoformat()


def _iter_bars(
    symbol: str, timeframe: str, days: int, feed: str
) -> Generator[list[dict], None, None]:
    """Yields one page of bars at a time. Callers can report progress between yields."""
    start, end = _iso_window(days)
    token: str | None = None
    for _ in range(_MAX_PAGES):
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
        yield data.get("bars", {}).get(symbol, [])
        token = data.get("next_page_token")
        if not token:
            return
    print(
        f"[alpaca_fetch] WARNING: hit {_MAX_PAGES}-page cap for {symbol}/{timeframe}",
        file=sys.stderr,
    )


def _iter_news(syms: list[str], days: int) -> Generator[list[dict], None, None]:
    """Yields one page of news items at a time. Caller enforces result limit."""
    start, end = _iso_window(days)
    token: str | None = None
    for _ in range(_MAX_PAGES):
        params = {
            "symbols": ",".join(syms),
            "start": start,
            "end": end,
            "limit": 50,
            "sort": "desc",
        }
        if token:
            params["page_token"] = token
        data = _get("/v1beta1/news", params)
        yield data.get("news", [])
        token = data.get("next_page_token")
        if not token:
            return
    print(f"[alpaca_fetch] WARNING: hit {_MAX_PAGES}-page cap for news", file=sys.stderr)


def get_daily_bars(symbol: str, days: int = 120, feed: str = DEFAULT_FEED) -> list[dict]:
    """Daily OHLCV bars for the last N calendar days."""
    return [bar for page in _iter_bars(symbol, "1Day", days, feed) for bar in page]


def get_2h_bars(symbol: str, days: int = 45, feed: str = DEFAULT_FEED) -> list[dict]:
    """2-hour OHLCV bars for the last N calendar days."""
    return [bar for page in _iter_bars(symbol, "2Hour", days, feed) for bar in page]


def get_news(symbols: Iterable[str], days: int = 10, limit: int = 200) -> list[dict]:
    """Recent news items covering any of the given symbols (desc by time)."""
    syms = list(symbols)
    out: list[dict] = []
    for items in _iter_news(syms, days):
        out.extend(items)
        if len(out) >= limit:
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


def _cli_entry() -> None:
    sys.exit(_cli())


if __name__ == "__main__":
    sys.exit(_cli())
