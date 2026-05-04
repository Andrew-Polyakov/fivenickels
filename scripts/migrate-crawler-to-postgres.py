"""Copy the StockCrawler cache from SQLite (.cache/trades.sqlite) into the
Postgres `crawler` database provisioned by docker-compose.

The crawler's Postgres schema is created by StockCrawler itself on first run
(`LocalDatabase.initialize()`). This script invokes `StockCrawler news SPY`
first so the schema exists, then streams each table's rows from SQLite into
Postgres, and finally resets the BIGSERIAL sequences so new auto-assigned
ids don't collide with migrated rows.

Usage (from repo root):
    python scripts/migrate-crawler-to-postgres.py

Environment (falls back to the compose defaults):
    POSTGRES_HOST       default 127.0.0.1
    POSTGRES_PORT       default 5432
    POSTGRES_USER       default trades
    POSTGRES_PASSWORD   default trades
    CRAWLER_POSTGRES_DB default crawler
    CRAWLER_SQLITE      default .cache/trades.sqlite
"""

from __future__ import annotations

import os
import sqlite3
import subprocess
import sys
from pathlib import Path

import psycopg

REPO_ROOT = Path(__file__).resolve().parent.parent

# Copy order respects foreign-key-ish dependencies: articles before
# article-symbol links, scan_runs before setups. Tables that use BIGSERIAL
# for id are listed in SERIAL_TABLES so we can reset their sequences at the end.
TABLES = [
    "stocks",
    "bars",
    "news_articles",
    "news_article_symbols",
    "snapshots",
    "earnings_quarterly",
    "corporate_actions",
    "analyst_actions",
    "scan_runs",
    "setups",
    "schema_meta",
]
SERIAL_TABLES = [
    "corporate_actions",
    "analyst_actions",
    "scan_runs",
    "setups",
]


def env(name: str, default: str) -> str:
    v = os.environ.get(name)
    return v if v and v.strip() else default


def ensure_postgres_schema() -> None:
    """Runs `StockCrawler init-db` so LocalDatabase.initialize() creates all tables.

    The `init-db` subcommand exists specifically for this: it opens a Npgsql
    connection using the same env-var precedence as the live crawler, runs the
    DDL, and exits — no Alpaca API credentials required.
    """
    bin_path = REPO_ROOT / "tools" / "StockCrawler" / "bin" / "Debug" / "net8.0" / "StockCrawler.exe"
    if not bin_path.exists():
        print(f"[schema] building StockCrawler (no binary at {bin_path})")
        subprocess.run(
            ["dotnet", "build"],
            cwd=str(REPO_ROOT / "tools" / "StockCrawler"),
            check=True,
        )
    print("[schema] running StockCrawler init-db")
    r = subprocess.run(
        [str(bin_path), "init-db"],
        cwd=str(REPO_ROOT),
        capture_output=True,
        text=True,
    )
    if r.returncode != 0:
        print(r.stdout)
        print(r.stderr, file=sys.stderr)
        raise SystemExit(f"init-db failed with exit code {r.returncode}")
    if r.stderr:
        print(r.stderr.strip())


def copy_table(
    sqlite_conn: sqlite3.Connection,
    pg_conn: psycopg.Connection,
    table: str,
) -> int:
    cur_s = sqlite_conn.cursor()
    cur_s.execute(f'SELECT * FROM "{table}"')
    cols = [c[0] for c in cur_s.description]
    rows = cur_s.fetchall()
    if not rows:
        return 0
    placeholders = ", ".join(["%s"] * len(cols))
    col_list = ", ".join(f'"{c}"' for c in cols)
    # For tables where the primary key is (symbol, ...) or composite and may
    # already exist in Postgres from a partial prior run, use ON CONFLICT DO
    # NOTHING so the script is idempotent.
    sql = (
        f'INSERT INTO "{table}" ({col_list}) VALUES ({placeholders}) '
        f"ON CONFLICT DO NOTHING"
    )
    with pg_conn.cursor() as cur_p:
        cur_p.executemany(sql, rows)
    return len(rows)


def reset_sequence(pg_conn: psycopg.Connection, table: str, id_col: str = "id") -> None:
    with pg_conn.cursor() as cur:
        cur.execute(
            f"SELECT setval(pg_get_serial_sequence(%s, %s), "
            f'COALESCE((SELECT MAX("{id_col}") FROM "{table}"), 1), '
            f'(SELECT COUNT(*) > 0 FROM "{table}"))',
            (table, id_col),
        )


def main() -> int:
    sqlite_path = REPO_ROOT / env("CRAWLER_SQLITE", ".cache/trades.sqlite")
    if not sqlite_path.exists():
        print(f"source SQLite not found at {sqlite_path}; nothing to migrate", file=sys.stderr)
        return 1

    ensure_postgres_schema()

    pg_password = env("POSTGRES_PASSWORD", "trades")
    conn_str = (
        f"host={env('POSTGRES_HOST', '127.0.0.1')} "
        f"port={env('POSTGRES_PORT', '5432')} "
        f"user={env('POSTGRES_USER', 'trades')} "
        f"password={pg_password} "
        f"dbname={env('CRAWLER_POSTGRES_DB', 'crawler')}"
    )
    print(f"[pg] connecting: {conn_str.replace(f'password={pg_password}', 'password=***')}")

    sqlite_conn = sqlite3.connect(str(sqlite_path))
    try:
        with psycopg.connect(conn_str, autocommit=False) as pg_conn:
            for table in TABLES:
                # Source may lack a table if this script runs against a newer
                # schema, so guard with a probe.
                probe = sqlite_conn.execute(
                    "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
                    (table,),
                ).fetchone()
                if not probe:
                    print(f"[skip] {table} not present in source SQLite")
                    continue
                n = copy_table(sqlite_conn, pg_conn, table)
                print(f"[copy] {table}: {n} row(s)")
            for table in SERIAL_TABLES:
                reset_sequence(pg_conn, table)
                print(f"[seq ] reset {table}_id_seq")
            pg_conn.commit()
    finally:
        sqlite_conn.close()

    print("done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
