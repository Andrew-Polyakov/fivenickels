"""
HTTP client for Alpaca Market Data corporate actions (GET /v1/corporate-actions).
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Iterable

import requests

from home.alpaca_market_client import get_alpaca_data_base_url
from home.alpaca_news_client import load_alpaca_credentials

SYMBOL_BATCH_SIZE = 50
MAX_PAGES = 100


def _parse_date(value: Any) -> date | None:
    if not value:
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    text = str(value).strip()
    if not text:
        return None
    try:
        return date.fromisoformat(text[:10])
    except ValueError:
        return None


def _parse_decimal(value: Any) -> Decimal:
    if value is None:
        return Decimal(0)
    try:
        return Decimal(str(value))
    except (ArithmeticError, ValueError, TypeError):
        return Decimal(0)


def _normalize_dividend_row(item: dict[str, Any], action_type: str) -> dict[str, Any] | None:
    raw_id = item.get("id")
    if not raw_id:
        return None
    try:
        alpaca_id = uuid.UUID(str(raw_id))
    except ValueError:
        return None
    sym = str(item.get("symbol") or "").strip().upper()
    if not sym:
        return None
    ex = _parse_date(item.get("ex_date"))
    if ex is None:
        return None
    return {
        "alpaca_id": alpaca_id,
        "symbol": sym,
        "action_type": action_type,
        "ex_date": ex,
        "record_date": _parse_date(item.get("record_date")),
        "payable_date": _parse_date(item.get("payable_date")),
        "rate": _parse_decimal(item.get("rate")),
        "special": bool(item.get("special")) if action_type == "cash_dividend" else False,
        "foreign": bool(item.get("foreign")) if action_type == "cash_dividend" else False,
    }


def _rows_from_corporate_actions_payload(
    data: dict[str, Any],
    *,
    types: tuple[str, ...],
) -> list[dict[str, Any]]:
    inner = data.get("corporate_actions")
    if not isinstance(inner, dict):
        inner = data
    out: list[dict[str, Any]] = []
    if "cash_dividend" in types:
        for item in inner.get("cash_dividends") or []:
            if isinstance(item, dict):
                row = _normalize_dividend_row(item, "cash_dividend")
                if row:
                    out.append(row)
    if "stock_dividend" in types:
        for item in inner.get("stock_dividends") or []:
            if isinstance(item, dict):
                row = _normalize_dividend_row(item, "stock_dividend")
                if row:
                    out.append(row)
    return out


def fetch_corporate_actions(
    symbols: Iterable[str],
    start_date: date,
    end_date: date,
    *,
    types: tuple[str, ...] = ("cash_dividend", "stock_dividend"),
    base_url: str | None = None,
    session: requests.Session | None = None,
    key_id: str | None = None,
    secret: str | None = None,
    timeout: int = 60,
    symbol_batch_size: int = SYMBOL_BATCH_SIZE,
) -> list[dict[str, Any]]:
    """
    Fetch normalized dividend rows for symbols between start_date and end_date (inclusive).
    """
    syms = sorted({s.strip().upper() for s in symbols if s and str(s).strip()})
    if not syms:
        return []

    kid, sec = key_id, secret
    if kid is None or sec is None:
        kid, sec = load_alpaca_credentials()
    if not kid or not sec:
        raise ValueError(
            "Missing Alpaca credentials: set APCA_API_KEY_ID and APCA_API_SECRET_KEY "
            "(or ALPACA_*) in the environment or a repo .env / .apca file."
        )

    base = (base_url or get_alpaca_data_base_url()).rstrip("/")
    sess = session or requests.Session()
    headers = {
        "APCA-API-KEY-ID": kid,
        "APCA-API-SECRET-KEY": sec,
    }
    types_param = ",".join(types)
    start_s = start_date.isoformat()
    end_s = end_date.isoformat()

    all_rows: list[dict[str, Any]] = []
    seen_ids: set[uuid.UUID] = set()

    for i in range(0, len(syms), symbol_batch_size):
        chunk = syms[i : i + symbol_batch_size]
        params: dict[str, str] = {
            "symbols": ",".join(chunk),
            "types": types_param,
            "start": start_s,
            "end": end_s,
        }
        page_token: str | None = None
        pages = 0
        while pages < MAX_PAGES:
            pages += 1
            req_params = dict(params)
            if page_token:
                req_params["page_token"] = page_token
            url = f"{base}/v1/corporate-actions"
            r = sess.get(url, headers=headers, params=req_params, timeout=timeout)
            r.raise_for_status()
            payload = r.json()
            if not isinstance(payload, dict):
                break
            for row in _rows_from_corporate_actions_payload(payload, types=types):
                aid = row["alpaca_id"]
                if aid in seen_ids:
                    continue
                seen_ids.add(aid)
                all_rows.append(row)
            page_token = payload.get("next_page_token")
            if not page_token:
                break

    return all_rows
