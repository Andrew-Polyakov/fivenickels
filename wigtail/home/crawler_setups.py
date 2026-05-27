"""Read-only queries against the Postgres ``crawler`` database (setups watchlist)."""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.db import connections
from django.db.utils import DatabaseError, OperationalError

from home.alpaca_market_client import SnapshotMetrics, bars_feed_from_env, fetch_snapshots
from home.us_market_session import UsMarketSessionInfo, classify_us_market_session
from home.volume_gauge import volume_gauges_for_symbols
from home.market_format import (
    format_day_volume,
    format_equity_price,
    format_percent_change,
    percent_change_css_class,
)


def _crawler_cursor():
    return connections["crawler"].cursor()


def list_scan_runs(limit: int = 50) -> list[dict[str, Any]]:
    try:
        with _crawler_cursor() as cur:
            cur.execute(
                """
                SELECT id, started_utc, finished_utc, mode, tickers
                FROM scan_runs
                ORDER BY started_utc DESC
                LIMIT %s
                """,
                [limit],
            )
            cols = [c.name for c in cur.description]
            return [dict(zip(cols, row, strict=True)) for row in cur.fetchall()]
    except (DatabaseError, OperationalError):
        return []


def latest_scan_run_id() -> int | None:
    runs = list_scan_runs(limit=1)
    if not runs:
        return None
    return int(runs[0]["id"])


def fetch_setups_for_run(run_id: int) -> list[dict[str, Any]]:
    try:
        with _crawler_cursor() as cur:
            cur.execute(
                """
                SELECT
                    s.id,
                    s.run_id,
                    s.symbol,
                    s.setup_type,
                    s.direction,
                    s.confluence,
                    s.score,
                    s.trigger_text,
                    s.invalidation,
                    s.t1,
                    s.t2,
                    s.rr,
                    s.notes,
                    st.name AS stock_name,
                    st.sector,
                    st.industry,
                    st.exchange
                FROM setups s
                LEFT JOIN stocks st ON st.symbol = s.symbol
                WHERE s.run_id = %s
                ORDER BY
                    CASE s.score
                        WHEN 'high' THEN 0
                        WHEN 'medium' THEN 1
                        ELSE 2
                    END,
                    s.symbol
                """,
                [run_id],
            )
            cols = [c.name for c in cur.description]
            rows = [dict(zip(cols, row, strict=True)) for row in cur.fetchall()]
    except (DatabaseError, OperationalError):
        return []

    return _enrich_setup_rows(rows)


def fetch_latest_setup_for_symbol(symbol: str) -> dict[str, Any] | None:
    sym = (symbol or "").strip().upper()
    if not sym:
        return None
    try:
        with _crawler_cursor() as cur:
            cur.execute(
                """
                SELECT
                    s.id,
                    s.run_id,
                    s.symbol,
                    s.setup_type,
                    s.direction,
                    s.confluence,
                    s.score,
                    s.trigger_text,
                    s.invalidation,
                    s.t1,
                    s.t2,
                    s.rr,
                    s.notes,
                    st.name AS stock_name,
                    st.sector,
                    st.industry,
                    st.exchange,
                    sr.started_utc AS scan_started_utc
                FROM setups s
                JOIN scan_runs sr ON sr.id = s.run_id
                LEFT JOIN stocks st ON st.symbol = s.symbol
                WHERE s.symbol = %s
                ORDER BY sr.started_utc DESC, s.id DESC
                LIMIT 1
                """,
                [sym],
            )
            cols = [c.name for c in cur.description]
            row = cur.fetchone()
            if row is None:
                return None
            rows = [dict(zip(cols, row, strict=True))]
    except (DatabaseError, OperationalError):
        return None

    enriched = _enrich_setup_rows(rows)
    if not enriched:
        return None
    out = enriched[0]
    out["scan_started_utc"] = rows[0].get("scan_started_utc")
    return out


def _enrich_setup_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not rows:
        return []

    symbols = [str(r["symbol"]).upper() for r in rows]
    bars = _latest_day_bars(symbols)
    news = _latest_news_by_symbol(symbols)
    mkt = classify_us_market_session()
    missing_snap = [s for s in symbols if s not in bars]
    snaps = _alpaca_snapshots(missing_snap, mkt) if missing_snap else {}

    day_vols: dict[str, int | None] = {}
    for sym in symbols:
        bar = bars.get(sym)
        snap = snaps.get(sym)
        vol = None
        if bar and bar.get("volume") is not None:
            vol = int(bar["volume"])
        if vol is None and snap and snap.get("day_volume") is not None:
            vol = int(snap["day_volume"])
        day_vols[sym] = vol
    vol_gauges = volume_gauges_for_symbols(symbols, day_volumes=day_vols)

    out: list[dict[str, Any]] = []
    for r in rows:
        sym = str(r["symbol"]).upper()
        bar = bars.get(sym)
        snap = snaps.get(sym)
        headline = news.get(sym)

        last_price = None
        pct = None
        volume = None
        if bar:
            last_price = _to_decimal(bar.get("close"))
            volume = int(bar["volume"]) if bar.get("volume") is not None else None
        if snap:
            if last_price is None and snap.get("last_price") is not None:
                last_price = _to_decimal(snap["last_price"])
            if snap.get("percent_change") is not None:
                pct = _to_decimal(snap["percent_change"])
            if volume is None and snap.get("day_volume") is not None:
                volume = int(snap["day_volume"])

        item: dict[str, Any] = {
            "id": r["id"],
            "run_id": r.get("run_id"),
            "symbol": sym,
            "setup_type": r.get("setup_type") or "watch",
            "direction": r.get("direction"),
            "confluence": r.get("confluence") or "",
            "score": r.get("score") or "low",
            "trigger_text": r.get("trigger_text"),
            "invalidation": r.get("invalidation"),
            "t1": _float_or_none(r.get("t1")),
            "t2": _float_or_none(r.get("t2")),
            "rr": _float_or_none(r.get("rr")),
            "notes": r.get("notes"),
            "stock_name": r.get("stock_name"),
            "sector": r.get("sector"),
            "industry": r.get("industry"),
            "exchange": r.get("exchange"),
            "last_price": float(last_price) if last_price is not None else None,
            "last_price_formatted": format_equity_price(last_price),
            "percent_change": float(pct) if pct is not None else None,
            "percent_change_formatted": format_percent_change(pct),
            "percent_change_class": percent_change_css_class(pct),
            "day_volume_formatted": format_day_volume(volume),
            "volume_gauge": vol_gauges.get(sym),
            "price_basis": snap.get("price_basis") if snap else mkt.price_basis,
            "price_session_label": snap.get("market_session_label")
            if snap
            else mkt.label,
            "news_headline": headline.get("headline") if headline else None,
            "news_url": headline.get("url") if headline else None,
        }
        if r.get("scan_started_utc") is not None:
            item["scan_started_utc"] = r.get("scan_started_utc")
        out.append(item)
    return out


def _latest_day_bars(symbols: list[str]) -> dict[str, dict[str, Any]]:
    if not symbols:
        return {}
    try:
        with _crawler_cursor() as cur:
            cur.execute(
                """
                SELECT DISTINCT ON (symbol)
                    symbol, close, volume, time_utc
                FROM bars
                WHERE timeframe = '1Day' AND symbol = ANY(%s)
                ORDER BY symbol, time_utc DESC
                """,
                [symbols],
            )
            cols = [c.name for c in cur.description]
            rows = [dict(zip(cols, row, strict=True)) for row in cur.fetchall()]
    except (DatabaseError, OperationalError):
        return {}
    return {str(r["symbol"]).upper(): r for r in rows}


def _latest_news_by_symbol(symbols: list[str]) -> dict[str, dict[str, Any]]:
    if not symbols:
        return {}
    try:
        with _crawler_cursor() as cur:
            cur.execute(
                """
                SELECT DISTINCT ON (nas.symbol)
                    nas.symbol,
                    na.headline,
                    na.url,
                    na.created_at_utc
                FROM news_article_symbols nas
                JOIN news_articles na ON na.id = nas.article_id
                WHERE nas.symbol = ANY(%s)
                ORDER BY nas.symbol, na.created_at_utc DESC
                """,
                [symbols],
            )
            cols = [c.name for c in cur.description]
            rows = [dict(zip(cols, row, strict=True)) for row in cur.fetchall()]
    except (DatabaseError, OperationalError):
        return {}
    return {str(r["symbol"]).upper(): r for r in rows}


def _alpaca_snapshots(
    symbols: list[str], mkt: UsMarketSessionInfo
) -> dict[str, dict[str, Any]]:
    if not symbols:
        return {}
    try:
        raw = fetch_snapshots(
            symbols,
            feed=bars_feed_from_env(),
            market_session=mkt,
        )
    except Exception:
        return {}
    out: dict[str, dict[str, Any]] = {}
    for sym, m in raw.items():
        if not isinstance(m, SnapshotMetrics):
            continue
        out[sym.upper()] = {
            "last_price": m.last_price,
            "percent_change": m.percent_change,
            "day_volume": m.day_volume,
            "price_basis": m.price_basis,
            "market_session_label": m.market_session_label,
        }
    return out


def _to_decimal(value: Any) -> Decimal | None:
    if value is None:
        return None
    try:
        return Decimal(str(value))
    except Exception:
        return None


def _float_or_none(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def serialize_scan_runs(runs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out = []
    for r in runs:
        tickers = str(r.get("tickers") or "")
        ticker_list = [t.strip() for t in tickers.split(",") if t.strip()]
        out.append(
            {
                "id": int(r["id"]),
                "started_utc": r.get("started_utc"),
                "finished_utc": r.get("finished_utc"),
                "mode": r.get("mode"),
                "ticker_count": len(ticker_list),
                "tickers_preview": ", ".join(ticker_list[:6])
                + ("…" if len(ticker_list) > 6 else ""),
            }
        )
    return out
