"""MCP stdio server exposing Alpaca daily/2H bars + news as tools.

Register in Claude Code via:
    claude mcp add alpaca-feed -- python /Users/andewpolyakov/fivenickels/tools/AlpacaFeed/mcp_server.py
or paste the snippet from claude_mcp_config.json into your settings.
"""
from __future__ import annotations

from mcp.server.fastmcp import FastMCP

from alpaca_fetch import get_2h_bars, get_daily_bars, get_news

mcp = FastMCP("alpaca-feed")


@mcp.tool()
def alpaca_daily_bars(symbol: str, days: int = 120, feed: str = "iex") -> list[dict]:
    """Daily OHLCV bars for one symbol over the last N calendar days."""
    return get_daily_bars(symbol.upper(), days=days, feed=feed)


@mcp.tool()
def alpaca_2h_bars(symbol: str, days: int = 45, feed: str = "iex") -> list[dict]:
    """2-hour OHLCV bars for one symbol over the last N calendar days."""
    return get_2h_bars(symbol.upper(), days=days, feed=feed)


@mcp.tool()
def alpaca_news(symbols: list[str], days: int = 10, limit: int = 100) -> list[dict]:
    """Recent news items covering any of the given symbols (desc by time)."""
    return get_news([s.upper() for s in symbols], days=days, limit=limit)


if __name__ == "__main__":
    mcp.run()
