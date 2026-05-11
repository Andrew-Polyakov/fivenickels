"""Shared configuration helpers for article submission CLIs."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping
from urllib.parse import urlparse


DEFAULT_SUBMIT_ENDPOINT = "http://127.0.0.1:8000/api/articles/auto-submit/"


@dataclass(frozen=True)
class SubmitConfig:
    endpoint: str
    token: str
    section_slug: str | None
    timeout: float


def repo_root() -> Path:
    return Path(__file__).resolve().parent.parent


def load_dotenv(path: Path, *, override: bool = False) -> None:
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line:
            continue
        if line.startswith("#"):
            line = line[1:].strip()
        if not line or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and (override or key not in os.environ):
            os.environ[key] = value


def load_repo_env() -> None:
    """Load trades/.env for submit tooling (matches Wagtail settings load order)."""
    load_dotenv(repo_root() / ".env", override=True)


def normalize_symbols(tokens: list[str]) -> list[str]:
    symbols: list[str] = []
    seen: set[str] = set()
    for token in tokens:
        for part in token.split(","):
            symbol = part.strip().upper()
            if not symbol or symbol in seen:
                continue
            seen.add(symbol)
            symbols.append(symbol)
    return symbols


def normalize_endpoint(endpoint: str) -> str:
    value = (endpoint or "").strip() or DEFAULT_SUBMIT_ENDPOINT
    if not value.endswith("/"):
        value = f"{value}/"
    return value


def resolve_submit_config(
    values: Mapping[str, Any],
    *,
    env: Mapping[str, str] | None = None,
) -> SubmitConfig:
    env_map = env if env is not None else os.environ
    endpoint = normalize_endpoint(
        str(
            values.get("endpoint")
            or env_map.get("WIGTAIL_ARTICLE_SUBMIT_URL")
            or DEFAULT_SUBMIT_ENDPOINT
        )
    )
    token = str(values.get("token") or env_map.get("ARTICLE_SUBMIT_BEARER_TOKEN") or "").strip()
    section_raw = str(
        values.get("section_slug")
        or env_map.get("ARTICLE_SUBMIT_DEFAULT_SECTION_SLUG")
        or ""
    ).strip()
    timeout_raw = values.get("timeout")
    if timeout_raw is None:
        timeout = 60.0
    else:
        timeout = float(timeout_raw)
    return SubmitConfig(
        endpoint=endpoint,
        token=token,
        section_slug=section_raw or None,
        timeout=timeout,
    )


def ensure_submit_config(config: SubmitConfig, *, dry_run: bool) -> str | None:
    parsed = urlparse(config.endpoint)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        return f"Invalid submit endpoint: {config.endpoint!r}"
    if not dry_run and not config.token:
        return "Missing bearer token. Set ARTICLE_SUBMIT_BEARER_TOKEN or pass --token."
    return None


def apply_submit_config_to_env(config: SubmitConfig) -> None:
    os.environ["WIGTAIL_ARTICLE_SUBMIT_URL"] = config.endpoint
    if config.token:
        os.environ["ARTICLE_SUBMIT_BEARER_TOKEN"] = config.token
    if config.section_slug:
        os.environ["ARTICLE_SUBMIT_DEFAULT_SECTION_SLUG"] = config.section_slug
