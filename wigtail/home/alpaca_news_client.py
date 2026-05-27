"""
HTTP client for Alpaca Market Data News API (v1beta1/news).

Uses the same auth headers as the StockCrawler C# tool: APCA_API_KEY_ID and
APCA_API_SECRET_KEY (or ALPACA_*), optionally loaded from .env / .apca files
walked upward from the current working directory and from this package’s location
(so `manage.py` works when CWD is `wigtail/` and keys live in `trades/.apca`).
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterator
from urllib.parse import urlparse

import requests

def _parse_env_line(raw_line: str) -> tuple[str, str] | None:
    """
    One KEY=value per line. Matches StockCrawler Credentials.tryParseCredentialLine:
    strip one leading '#', then parse; empty values are ignored.
    """
    line = raw_line.strip()
    if not line:
        return None
    if line.startswith("#"):
        line = line[1:].strip()
    if not line or line.startswith("#"):
        return None
    eq = line.find("=")
    if eq <= 0:
        return None
    key = line[:eq].strip()
    val = line[eq + 1 :].strip()
    if len(val) >= 2 and val[0] == '"' and val[-1] == '"':
        val = val[1:-1].replace('\\"', '"')
    elif len(val) >= 2 and val[0] == "'" and val[-1] == "'":
        val = val[1:-1]
    if not key or not val:
        return None
    return key, val


def _parse_env_file(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return out
    for raw in text.splitlines():
        parsed = _parse_env_line(raw)
        if parsed is None:
            continue
        k, v = parsed
        out[k] = v
    return out


def _find_repo_root_with_markers() -> Path | None:
    """Directory containing `wigtail/manage.py` and StockCrawler project (trades root)."""
    start = Path(__file__).resolve().parent
    for d in [start, *start.parents]:
        if (d / "wigtail" / "manage.py").is_file() and (
            d / "tools" / "StockCrawler" / "StockCrawler.csproj"
        ).is_file():
            return d
    return None


def _candidate_directories_for_env() -> list[Path]:
    """Prefer trades repo root, then CWD, then ancestors of this module."""
    roots: list[Path] = []
    marked = _find_repo_root_with_markers()
    if marked is not None:
        roots.append(marked)
    roots.append(Path.cwd())
    here = Path(__file__).resolve()
    roots.append(here.parent)
    roots.extend(here.parents)
    seen_dir: set[str] = set()
    out: list[Path] = []
    for d in roots:
        key = str(d.resolve())
        if key not in seen_dir:
            seen_dir.add(key)
            out.append(d)
    return out


def _load_dotenv_at_repo_paths() -> None:
    """Prefer python-dotenv on trades/.env and wigtail/.env (same as Django settings)."""
    try:
        from dotenv import load_dotenv
    except ImportError:
        return
    root = _find_repo_root_with_markers()
    if root is not None:
        p = root / ".env"
        if p.is_file():
            load_dotenv(p, override=True)
        w = root / "wigtail" / ".env"
        if w.is_file():
            load_dotenv(w, override=True)


_CREDENTIAL_FILE_NAMES = (".apca", "alpacacredentials", ".env")


def _find_first_credentials_file() -> Path | None:
    """Same precedence as StockCrawler: first `.apca`, then `alpacacredentials`, then `.env`."""
    for d in _candidate_directories_for_env():
        for name in _CREDENTIAL_FILE_NAMES:
            p = d / name
            if p.is_file():
                return p
    return None


def _apply_credentials_file(path: Path) -> None:
    """Apply all keys from one credentials file (overrides unset env; fills ALPACA_ENV)."""
    for k, v in _parse_env_file(path).items():
        if k in (
            "APCA_API_KEY_ID",
            "ALPACA_API_KEY_ID",
            "APCA_API_SECRET_KEY",
            "ALPACA_API_SECRET_KEY",
            "ALPACA_ENV",
            "APCA_ALPACA_ENV",
            "ALPACA_TRADING_BASE_URL",
            "APCA_TRADING_LIVE",
            "ALPACA_LIVE",
            "ALPACA_DATA_BASE_URL",
            "ALPACA_DATA_SANDBOX",
        ):
            os.environ[k] = v
        else:
            os.environ.setdefault(k, v)


def _merge_env_from_repo_walk() -> None:
    """Load from the first credentials file found (StockCrawler-compatible)."""
    cred = _find_first_credentials_file()
    if cred is not None:
        _apply_credentials_file(cred)


def load_alpaca_credentials() -> tuple[str, str]:
    _load_dotenv_at_repo_paths()
    _merge_env_from_repo_walk()
    key_id = (
        os.environ.get("APCA_API_KEY_ID")
        or os.environ.get("ALPACA_API_KEY_ID")
        or ""
    ).strip()
    secret = (
        os.environ.get("APCA_API_SECRET_KEY")
        or os.environ.get("ALPACA_API_SECRET_KEY")
        or ""
    ).strip()
    return key_id, secret


DEFAULT_DATA_BASE_LIVE = "https://data.alpaca.markets"
DEFAULT_DATA_BASE_SANDBOX = "https://data.sandbox.alpaca.markets"
DEFAULT_TRADING_BASE_LIVE = "https://api.alpaca.markets"
DEFAULT_TRADING_BASE_PAPER = "https://paper-api.alpaca.markets"


def resolve_alpaca_trading_live() -> bool | None:
    """
    True = live trading API, False = paper, None = unset (caller defaults to paper).

    Matches StockCrawler Credentials.resolveUseLiveFromEnvironment().
    """
    for name in ("APCA_TRADING_LIVE", "ALPACA_LIVE"):
        raw = (os.environ.get(name) or "").strip().lower()
        if raw in ("1", "true", "yes", "on"):
            return True
        if raw in ("0", "false", "no", "off"):
            return False
    for name in ("ALPACA_ENV", "APCA_ALPACA_ENV"):
        raw = (os.environ.get(name) or "").strip().lower()
        if raw in ("live", "production", "prod"):
            return True
        if raw in ("paper", "sandbox"):
            return False
    return None


def get_alpaca_trading_base_url() -> str:
    """
    Trading API host for /v2/assets, /v3/calendar, etc.

    Paper keys require https://paper-api.alpaca.markets; live keys require
    https://api.alpaca.markets (401 if mismatched).
    """
    load_alpaca_credentials()
    override = (os.environ.get("ALPACA_TRADING_BASE_URL") or "").strip()
    if override:
        return override.rstrip("/")
    live = resolve_alpaca_trading_live()
    if live is True:
        return DEFAULT_TRADING_BASE_LIVE.rstrip("/")
    # StockCrawler defaults to paper when env/file does not specify live.
    return DEFAULT_TRADING_BASE_PAPER.rstrip("/")


def _is_http_url(url: str) -> bool:
    try:
        p = urlparse(url)
        return p.scheme in ("http", "https") and bool(p.netloc)
    except Exception:
        return False


def _parse_image_entries(row: dict[str, Any]) -> tuple[tuple[str, str], ...]:
    raw = row.get("images")
    if not isinstance(raw, list):
        return ()
    out: list[tuple[str, str]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        size = str(item.get("size") or "").strip().lower()
        url = str(item.get("url") or "").strip()
        if not url or not _is_http_url(url):
            continue
        if not size:
            size = "other"
        out.append((size, url))
    return tuple(out)


@dataclass(frozen=True)
class AlpacaNewsArticle:
    id: int
    headline: str
    summary: str
    content: str
    url: str | None
    source: str
    symbols: list[str]
    created_at: str
    updated_at: str
    image_entries: tuple[tuple[str, str], ...] = field(default_factory=tuple)


def best_image_url(article: AlpacaNewsArticle) -> str | None:
    """Prefer large, then small, then thumb, then any other size, then first URL."""
    if not article.image_entries:
        return None
    priority = ("large", "small", "thumb")
    for p in priority:
        for size, url in article.image_entries:
            if size == p:
                return url
    return article.image_entries[0][1]


def _article_from_json(row: dict[str, Any]) -> AlpacaNewsArticle:
    syms = row.get("symbols") or []
    if not isinstance(syms, list):
        syms = []
    return AlpacaNewsArticle(
        id=int(row["id"]),
        headline=str(row.get("headline") or ""),
        summary=str(row.get("summary") or ""),
        content=str(row.get("content") or ""),
        url=str(row["url"]) if row.get("url") else None,
        source=str(row.get("source") or ""),
        symbols=[str(s) for s in syms],
        created_at=str(row.get("created_at") or ""),
        updated_at=str(row.get("updated_at") or ""),
        image_entries=_parse_image_entries(row),
    )


def fetch_news(
    *,
    symbols: list[str],
    start: str,
    end: str,
    sort: str = "desc",
    limit: int = 50,
    include_content: bool = True,
    exclude_contentless: bool = False,
    base_url: str = DEFAULT_DATA_BASE_LIVE,
    session: requests.Session | None = None,
    key_id: str | None = None,
    secret: str | None = None,
) -> list[AlpacaNewsArticle]:
    """
    Fetch news items, following next_page_token until `limit` items or exhausted.

    `start` / `end` must be RFC-3339 date-times (or dates) as Alpaca expects.
    """
    kid, sec = key_id, secret
    if kid is None or sec is None:
        kid, sec = load_alpaca_credentials()
    if not kid or not sec:
        raise ValueError(
            "Missing Alpaca credentials: set APCA_API_KEY_ID and APCA_API_SECRET_KEY "
            "(or ALPACA_*) in the environment or a repo .env / .apca file."
        )

    sess = session or requests.Session()
    headers = {
        "APCA-API-KEY-ID": kid,
        "APCA-API-SECRET-KEY": sec,
    }
    sym_csv = ",".join(s.strip().upper() for s in symbols if s.strip())
    collected: list[AlpacaNewsArticle] = []
    page_token: str | None = None

    while len(collected) < limit:
        params: dict[str, Any] = {
            "symbols": sym_csv,
            "start": start,
            "end": end,
            "sort": sort,
            "limit": min(50, limit - len(collected)),
            "include_content": str(include_content).lower(),
            "exclude_contentless": str(exclude_contentless).lower(),
        }
        if page_token:
            params["page_token"] = page_token

        url = f"{base_url.rstrip('/')}/v1beta1/news"
        r = sess.get(url, headers=headers, params=params, timeout=60)
        r.raise_for_status()
        data = r.json()
        rows = data.get("news") or []
        if not isinstance(rows, list):
            break
        for row in rows:
            if len(collected) >= limit:
                break
            try:
                collected.append(_article_from_json(row))
            except (KeyError, TypeError, ValueError):
                continue
        page_token = data.get("next_page_token")
        if not page_token or not rows:
            break

    return collected


def iter_news_pages(
    *,
    symbols: list[str],
    start: str,
    end: str,
    sort: str = "desc",
    include_content: bool = True,
    exclude_contentless: bool = False,
    base_url: str = DEFAULT_DATA_BASE_LIVE,
    session: requests.Session | None = None,
    key_id: str | None = None,
    secret: str | None = None,
) -> Iterator[list[AlpacaNewsArticle]]:
    """Yield each API page (for advanced callers)."""
    kid, sec = key_id, secret
    if kid is None or sec is None:
        kid, sec = load_alpaca_credentials()
    if not kid or not sec:
        raise ValueError("Missing Alpaca API credentials.")

    sess = session or requests.Session()
    headers = {
        "APCA-API-KEY-ID": kid,
        "APCA-API-SECRET-KEY": sec,
    }
    sym_csv = ",".join(s.strip().upper() for s in symbols if s.strip())
    page_token: str | None = None

    while True:
        params: dict[str, Any] = {
            "symbols": sym_csv,
            "start": start,
            "end": end,
            "sort": sort,
            "limit": 50,
            "include_content": str(include_content).lower(),
            "exclude_contentless": str(exclude_contentless).lower(),
        }
        if page_token:
            params["page_token"] = page_token

        url = f"{base_url.rstrip('/')}/v1beta1/news"
        r = sess.get(url, headers=headers, params=params, timeout=60)
        r.raise_for_status()
        data = r.json()
        rows = data.get("news") or []
        if not isinstance(rows, list) or not rows:
            break
        batch: list[AlpacaNewsArticle] = []
        for row in rows:
            try:
                batch.append(_article_from_json(row))
            except (KeyError, TypeError, ValueError):
                continue
        if batch:
            yield batch
        page_token = data.get("next_page_token")
        if not page_token:
            break
