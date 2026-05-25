"""MCP stdio server exposing Alpaca daily/2H bars + news as tools.

Register in Claude Code via:
    claude mcp add alpaca-feed -- uv --project /path/to/AlpacaFeed run python mcp_server.py
or paste the snippet from claude_mcp_config.json into your settings.
"""
from __future__ import annotations

import re

from mcp.server.fastmcp import Context, FastMCP

from alpaca_fetch import _iter_bars, _iter_news

mcp = FastMCP("alpaca-feed")

_SYMBOL_RE = re.compile(r"^[A-Z]{1,5}(\.[A-Z]{1,2})?$")
_VALID_FEEDS = {"iex", "sip"}


def _validate_symbol(symbol: str) -> str:
    s = symbol.strip().upper()
    if not _SYMBOL_RE.match(s):
        raise ValueError(
            f"Invalid symbol {symbol!r}. Expected 1–5 uppercase letters, "
            "optionally followed by '.' and one or two letters (e.g. 'AAPL', 'BRK.B')."
        )
    return s


def _validate_days(days: int, max_days: int, label: str) -> int:
    if not (1 <= days <= max_days):
        raise ValueError(f"{label} days must be between 1 and {max_days}, got {days}.")
    return days


def _validate_feed(feed: str) -> str:
    if feed not in _VALID_FEEDS:
        raise ValueError(f"feed must be one of {sorted(_VALID_FEEDS)}, got {feed!r}.")
    return feed


@mcp.tool()
async def alpaca_daily_bars(
    symbol: str, days: int = 120, feed: str = "iex", ctx: Context = None
) -> list[dict]:
    """Daily OHLCV bars for one symbol over the last N calendar days (max 365)."""
    sym = _validate_symbol(symbol)
    days = _validate_days(days, 365, "daily")
    feed = _validate_feed(feed)
    out: list[dict] = []
    for page_num, bars in enumerate(_iter_bars(sym, "1Day", days, feed), 1):
        out.extend(bars)
        if ctx:
            await ctx.report_progress(page_num, None)
    return out


@mcp.tool()
async def alpaca_2h_bars(
    symbol: str, days: int = 45, feed: str = "iex", ctx: Context = None
) -> list[dict]:
    """2-hour OHLCV bars for one symbol over the last N calendar days (max 90)."""
    sym = _validate_symbol(symbol)
    days = _validate_days(days, 90, "2H")
    feed = _validate_feed(feed)
    out: list[dict] = []
    for page_num, bars in enumerate(_iter_bars(sym, "2Hour", days, feed), 1):
        out.extend(bars)
        if ctx:
            await ctx.report_progress(page_num, None)
    return out


@mcp.tool()
async def alpaca_news(
    symbols: list[str], days: int = 10, limit: int = 100, ctx: Context = None
) -> list[dict]:
    """Recent news for the given symbols (max 20), newest first. limit capped at 500."""
    if not symbols:
        raise ValueError("symbols list must not be empty.")
    if len(symbols) > 20:
        raise ValueError(f"Too many symbols: max 20, got {len(symbols)}.")
    validated = [_validate_symbol(s) for s in symbols]
    days = _validate_days(days, 30, "news")
    if not (1 <= limit <= 500):
        raise ValueError(f"limit must be between 1 and 500, got {limit}.")
    out: list[dict] = []
    for page_num, items in enumerate(_iter_news(validated, days), 1):
        out.extend(items)
        if ctx:
            await ctx.report_progress(page_num, None)
        if len(out) >= limit:
            break
    return out[:limit]


if __name__ == "__main__":
    mcp.run()
