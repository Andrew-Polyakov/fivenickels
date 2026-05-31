"""Optional DATABASE_URL and Postgres SSL for managed hosting."""

from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

_CA_CERT_PATH = Path("/tmp/do-postgres-ca.pem")


def _apply_database_url(databases: dict) -> None:
    database_url = os.environ.get("DATABASE_URL", "").strip()
    if not database_url:
        return

    parsed = urlparse(database_url)
    if parsed.scheme not in ("postgres", "postgresql"):
        return

    default = databases["default"]
    default["HOST"] = parsed.hostname or default.get("HOST")
    default["PORT"] = str(parsed.port or default.get("PORT", "5432"))
    default["NAME"] = unquote(parsed.path.lstrip("/")) or default.get("NAME")
    if parsed.username:
        default["USER"] = unquote(parsed.username)
    if parsed.password:
        default["PASSWORD"] = unquote(parsed.password)

    query = parse_qs(parsed.query)
    sslmode = (query.get("sslmode") or [None])[0]
    if sslmode:
        default.setdefault("OPTIONS", {})["sslmode"] = sslmode


def _apply_postgres_sslmode(databases: dict) -> None:
    sslmode = os.environ.get("POSTGRES_SSLMODE", "").strip()
    if not sslmode:
        return
    for config in databases.values():
        config.setdefault("OPTIONS", {})["sslmode"] = sslmode


def _apply_ca_cert(databases: dict) -> None:
    pem = os.environ.get("DATABASE_CA_CERT", "").strip()
    if not pem:
        return

    if not pem.endswith("\n"):
        pem = f"{pem}\n"
    _CA_CERT_PATH.write_text(pem, encoding="utf-8")
    _CA_CERT_PATH.chmod(0o600)

    for config in databases.values():
        config.setdefault("OPTIONS", {})["sslrootcert"] = str(_CA_CERT_PATH)


def _validate_default_database_name(databases: dict) -> None:
    """Ensure DATABASE_URL (if set) targets the same DB as WAGTAIL_POSTGRES_DB."""
    if not os.environ.get("DATABASE_URL", "").strip():
        return

    expected = os.environ.get("WAGTAIL_POSTGRES_DB", "wagtail").strip() or "wagtail"
    actual = (databases.get("default") or {}).get("NAME")
    if actual and actual != expected:
        raise RuntimeError(
            f"DATABASE_URL points at database {actual!r} but WAGTAIL_POSTGRES_DB is "
            f"{expected!r}. Provision the managed Postgres default database as "
            f"'{expected}' so ${'{db.DATABASE_URL}'} matches."
        )
