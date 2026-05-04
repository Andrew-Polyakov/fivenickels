# Migrates the Wagtail/Django database from SQLite (wigtail/db.sqlite3)
# to Postgres (compose service `postgres`, DB `wagtail`).
#
# The script:
#   1. Dumps current SQLite content. Excludes auto-managed tables
#      (contenttypes, auth.Permission, sessions) and SQLite-only search
#      indexes under `wagtailsearch` that cannot be inserted into Postgres
#      as-is (they store tsvector / FTS data rebuilt via `update_index`).
#   2. Points Django at Postgres via POSTGRES_HOST / WAGTAIL_POSTGRES_DB.
#   3. Runs `migrate` to create the schema, then `flush` to clear the rows
#      Wagtail's post_migrate signal inserts by default (root collection,
#      default group permissions, etc.) which would otherwise collide with
#      the dump's primary keys.
#   4. Loads the dump into Postgres.
#   5. Rebuilds the Wagtail search index on the new backend.
#
# Uses PYTHONUTF8=1 to force UTF-8 file I/O on Windows (otherwise Python
# writes the JSON dump using the system locale, e.g. cp1252, which then
# fails to decode during loaddata).
#
# Prerequisites:
#   - `docker compose up -d postgres` (creates `wagtail` + `crawler` DBs on first boot).
#   - `pip install -r wigtail/requirements.txt` (pulls in psycopg[binary]).
#   - `.env` in repo root (or inline values below) with POSTGRES_* matching compose.

[CmdletBinding()]
param(
    [string]$PgHost = $(if ($env:POSTGRES_HOST) { $env:POSTGRES_HOST } else { "127.0.0.1" }),
    [string]$PgPort = $(if ($env:POSTGRES_PORT) { $env:POSTGRES_PORT } else { "5432" }),
    [string]$PgUser = $(if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { "trades" }),
    [string]$PgPassword = $(if ($env:POSTGRES_PASSWORD) { $env:POSTGRES_PASSWORD } else { "trades" }),
    [string]$PgDb = $(if ($env:WAGTAIL_POSTGRES_DB) { $env:WAGTAIL_POSTGRES_DB } else { "wagtail" }),
    [string]$DumpPath = (Join-Path (Split-Path -Parent $PSScriptRoot) ".cache/wagtail-dump.json")
)

$ErrorActionPreference = "Stop"
$env:PYTHONUTF8 = "1"

$repoRoot = Split-Path -Parent $PSScriptRoot
$wigtailDir = Join-Path $repoRoot "wigtail"
Push-Location $wigtailDir
try {
    $cacheDir = Split-Path -Parent $DumpPath
    if (-not (Test-Path $cacheDir)) {
        New-Item -ItemType Directory -Force -Path $cacheDir | Out-Null
    }

    Write-Host "[1/4] Dumping SQLite content -> $DumpPath"
    # Temporarily unset Postgres envs so dumpdata reads SQLite per base.py fallback.
    # Uses raw primary keys instead of --natural-foreign/--natural-primary because
    # the Wagtail page tree contains references that fail to resolve as natural
    # keys during serialization (CommandError: "Page matching query does not exist").
    $prevHost = $env:POSTGRES_HOST
    Remove-Item Env:POSTGRES_HOST -ErrorAction SilentlyContinue
    try {
        python manage.py dumpdata `
            -e contenttypes -e auth.Permission -e sessions `
            -e wagtailsearch `
            --indent 2 -o $DumpPath
        if ($LASTEXITCODE -ne 0) { throw "dumpdata failed (exit $LASTEXITCODE)" }
    } finally {
        if ($prevHost) { $env:POSTGRES_HOST = $prevHost }
    }

    Write-Host "[2/4] Running migrations against Postgres $PgHost`:$PgPort/$PgDb"
    $env:POSTGRES_HOST = $PgHost
    $env:POSTGRES_PORT = $PgPort
    $env:POSTGRES_USER = $PgUser
    $env:POSTGRES_PASSWORD = $PgPassword
    $env:WAGTAIL_POSTGRES_DB = $PgDb
    python manage.py migrate --noinput
    if ($LASTEXITCODE -ne 0) { throw "migrate failed (exit $LASTEXITCODE)" }

    Write-Host "[3/4] Flushing post_migrate-seeded rows before loading dump"
    python manage.py flush --noinput
    if ($LASTEXITCODE -ne 0) { throw "flush failed (exit $LASTEXITCODE)" }

    Write-Host "[4/4] Loading dump into Postgres"
    # loaddata emits a benign sessions sequence-reset FieldError after a
    # successful load when the sessions table is empty; the data itself is
    # persisted. Treat a post-"Installed N object(s)" log as success.
    $loadOutput = python manage.py loaddata $DumpPath 2>&1
    $loadOutput | Write-Host
    if ($loadOutput -notmatch "Installed \d+ object\(s\) from \d+ fixture\(s\)") {
        throw "loaddata did not report success"
    }

    Write-Host "Rebuilding Wagtail search index on the new backend"
    python manage.py update_index 2>&1 | Write-Host

    Write-Host "Done. Wagtail is now running against Postgres DB '$PgDb'."
    Write-Host "The original wigtail/db.sqlite3 was left in place as a backup."
} finally {
    Pop-Location
}
