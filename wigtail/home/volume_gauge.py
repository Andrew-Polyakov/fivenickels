"""
Relative volume gauges: current volume vs trailing average on a chosen timeframe.

Used on ticker chips, ticker summary, and swing-setup rows. Bars come from Alpaca;
snapshot ``day_volume`` is preferred for the live daily bar when available.
"""

from __future__ import annotations

from typing import Any

from django.core.cache import cache

from home.alpaca_bars_client import fetch_recent_stock_bars

_GAUGE_CACHE_VERSION = "v1"
_GAUGE_CACHE_TTL = 120
_DEFAULT_LOOKBACK = 20

# Alpaca timeframe -> short UI label (shown on each gauge).
TIMEFRAME_LABELS: dict[str, str] = {
    "1Day": "Daily",
    "1D": "Daily",
    "1Week": "Weekly",
    "1W": "Weekly",
    "2Hour": "2H",
    "2H": "2H",
}

DEFAULT_VOLUME_TIMEFRAME = "1Day"


def timeframe_label(timeframe: str) -> str:
    tf = (timeframe or DEFAULT_VOLUME_TIMEFRAME).strip()
    return TIMEFRAME_LABELS.get(tf, tf)


def _volumes_from_bars(bars: list[dict[str, Any]]) -> list[int]:
    out: list[int] = []
    for b in bars:
        v = b.get("v")
        if v is None:
            continue
        try:
            n = int(v)
        except (TypeError, ValueError):
            continue
        if n >= 0:
            out.append(n)
    return out


def relative_volume_ratio(current: int | float, history: list[int]) -> float | None:
    """``current`` divided by mean of ``history`` (trailing completed periods)."""
    if current is None or current <= 0:
        return None
    hist = [h for h in history if h and h > 0]
    if not hist:
        return None
    avg = sum(hist) / len(hist)
    if avg < 1:
        return None
    return float(current) / avg


def gauge_position_pct(ratio: float | None) -> int | None:
    """
    Map relative volume to 0–100 for marker placement.

    1.0× average sits at center (50%); each +1× shifts ~25 points (capped).
    """
    if ratio is None or ratio <= 0:
        return None
    pct = 50.0 + (ratio - 1.0) * 25.0
    return int(max(0, min(100, round(pct))))


def format_relative_ratio(ratio: float | None) -> str:
    if ratio is None or ratio <= 0:
        return "—"
    if ratio >= 10:
        return f"{ratio:.0f}×"
    if ratio >= 1:
        return f"{ratio:.1f}×"
    return f"{ratio:.2f}×"


def _ratio_from_daily_bars(
    bars: list[dict[str, Any]],
    *,
    snapshot_day_volume: int | None,
) -> float | None:
    volumes = _volumes_from_bars(bars)
    if not volumes:
        return None
    if snapshot_day_volume is not None and snapshot_day_volume > 0:
        history = volumes[:-1] if len(volumes) > 1 else volumes
        return relative_volume_ratio(snapshot_day_volume, history[-_DEFAULT_LOOKBACK:])
    if len(volumes) < 2:
        return None
    return relative_volume_ratio(volumes[-1], volumes[:-1][-_DEFAULT_LOOKBACK:])


def _ratio_from_bars(bars: list[dict[str, Any]], timeframe: str) -> float | None:
    tf = (timeframe or DEFAULT_VOLUME_TIMEFRAME).strip()
    if tf in ("1Day", "1D") or tf.endswith("Day"):
        return _ratio_from_daily_bars(bars, snapshot_day_volume=None)
    volumes = _volumes_from_bars(bars)
    if len(volumes) < 2:
        return None
    return relative_volume_ratio(volumes[-1], volumes[:-1][-_DEFAULT_LOOKBACK:])


def build_volume_gauge_payload(
    ratio: float | None,
    *,
    timeframe: str = DEFAULT_VOLUME_TIMEFRAME,
) -> dict[str, Any] | None:
    pos = gauge_position_pct(ratio)
    if pos is None:
        return None
    label = timeframe_label(timeframe)
    ratio_fmt = format_relative_ratio(ratio)
    return {
        "timeframe": timeframe,
        "timeframe_label": label,
        "ratio": ratio,
        "ratio_formatted": ratio_fmt,
        "position_pct": pos,
    }


def volume_gauge_for_symbol(
    symbol: str,
    *,
    timeframe: str = DEFAULT_VOLUME_TIMEFRAME,
    lookback: int = _DEFAULT_LOOKBACK,
    snapshot_day_volume: int | None = None,
) -> dict[str, Any] | None:
    sym = (symbol or "").strip().upper()
    if not sym:
        return None

    snap_part = snapshot_day_volume if snapshot_day_volume is not None else "-"
    cache_key = (
        f"vol_gauge:{_GAUGE_CACHE_VERSION}:{sym}:{timeframe}:{lookback}:{snap_part}"
    )
    hit = cache.get(cache_key)
    if isinstance(hit, dict) and "payload" in hit:
        payload = hit.get("payload")
        if payload is None:
            return None
        return payload

    limit = lookback + 2
    bars, _err = fetch_recent_stock_bars(sym, timeframe=timeframe, limit=limit)
    tf = (timeframe or DEFAULT_VOLUME_TIMEFRAME).strip()
    if tf in ("1Day", "1D") or tf.endswith("Day"):
        ratio = _ratio_from_daily_bars(bars, snapshot_day_volume=snapshot_day_volume)
    else:
        ratio = _ratio_from_bars(bars, timeframe)

    payload = build_volume_gauge_payload(ratio, timeframe=timeframe)
    cache.set(cache_key, {"payload": payload}, _GAUGE_CACHE_TTL)
    return payload


def volume_gauges_for_symbols(
    symbols: list[str],
    *,
    timeframe: str = DEFAULT_VOLUME_TIMEFRAME,
    day_volumes: dict[str, int | None] | None = None,
) -> dict[str, dict[str, Any] | None]:
    """Batch gauges keyed by upper-case symbol."""
    out: dict[str, dict[str, Any] | None] = {}
    vols = day_volumes or {}
    for raw in symbols:
        sym = (raw or "").strip().upper()
        if not sym:
            continue
        snap = vols.get(sym)
        if snap is None:
            snap = vols.get(raw)
        out[sym] = volume_gauge_for_symbol(
            sym,
            timeframe=timeframe,
            snapshot_day_volume=snap,
        )
    return out


def attach_volume_gauges_to_chips(
    chips: list[dict[str, Any]],
    *,
    timeframe: str = DEFAULT_VOLUME_TIMEFRAME,
) -> None:
    """Mutates chip dicts in place; expects ``chip['row']`` with ``symbol`` and ``day_volume``."""
    symbols: list[str] = []
    day_vols: dict[str, int | None] = {}
    for chip in chips:
        row = chip.get("row")
        if row is None:
            continue
        sym = (getattr(row, "symbol", None) or "").strip().upper()
        if not sym:
            continue
        symbols.append(sym)
        dv = getattr(row, "day_volume", None)
        day_vols[sym] = int(dv) if dv is not None else None

    if not symbols:
        return

    gauges = volume_gauges_for_symbols(
        symbols, timeframe=timeframe, day_volumes=day_vols
    )
    for chip in chips:
        row = chip.get("row")
        if row is None:
            continue
        sym = (getattr(row, "symbol", None) or "").strip().upper()
        chip["volume_gauge"] = gauges.get(sym)


def attach_volume_gauges_to_mover_chips(
    chips: list[dict[str, Any]],
    *,
    rows_by_symbol: dict[str, Any],
    timeframe: str = DEFAULT_VOLUME_TIMEFRAME,
) -> None:
    """Mutates JSON mover chips (``symbol`` key, optional ``row`` lookup)."""
    symbols = [(c.get("symbol") or "").strip().upper() for c in chips]
    symbols = [s for s in symbols if s]
    day_vols: dict[str, int | None] = {}
    for sym in symbols:
        row = rows_by_symbol.get(sym)
        if row is not None:
            dv = getattr(row, "day_volume", None)
            day_vols[sym] = int(dv) if dv is not None else None
    gauges = volume_gauges_for_symbols(
        symbols, timeframe=timeframe, day_volumes=day_vols
    )
    for chip in chips:
        sym = (chip.get("symbol") or "").strip().upper()
        chip["volume_gauge"] = gauges.get(sym)
