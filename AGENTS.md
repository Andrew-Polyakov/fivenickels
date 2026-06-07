# AGENTS.md

## Cursor Cloud specific instructions

### Services overview

| Service | Required | Notes |
|---|---|---|
| **PostgreSQL 16** | Yes | `docker compose up -d postgres` from repo root. Two DBs: `wagtail`, `crawler`. Credentials: `trades`/`trades` on port 5432. |
| **Wigtail (Django/Wagtail CMS)** | Yes | `cd wigtail && python manage.py runserver 127.0.0.1:8000` with `DJANGO_SETTINGS_MODULE=mysite.settings.dev`. |
| **Front-end widgets** | Build only | `cd front-end && npm run build:widget`. Output goes to `wigtail/mysite/static/angular-taxonomy-chip-widget/`. |
| **StockCrawler (C#)** | Optional | `dotnet run --project tools/StockCrawler/StockCrawler.csproj -- <subcommand>`. Requires Alpaca API keys in `.env`. |
| **OpenSearch** | Optional | `docker compose up -d opensearch` + `WAGTAIL_USE_OPENSEARCH=1`. |
| **Ollama** | Optional | External LLM for article enrichment. Not required for core CMS. |

### Environment details

- **Python venv**: `/workspace/.venv` (Python 3.12). Activate with `source /workspace/.venv/bin/activate`.
- **Node**: System Node.js (v22) via nvm; front-end uses npm (see `front-end/package.json`).
- **.NET 8.0 SDK**: Required for StockCrawler. Installed via `apt`.
- **Docker**: Required for PostgreSQL. Docker daemon must be started (`sudo dockerd &`) before `docker compose up -d postgres`.
- The `.env` file at repo root is loaded by both Wigtail (`dotenv`) and StockCrawler. It contains Postgres credentials and Alpaca API keys.

### Startup sequence (after update script has run)

1. Start Docker daemon: `sudo dockerd &>/tmp/dockerd.log &` (wait ~3s)
2. Fix socket perms if needed: `sudo chmod 666 /var/run/docker.sock`
3. Start PostgreSQL: `docker compose up -d postgres` (wait until healthy)
4. Activate venv: `source /workspace/.venv/bin/activate`
5. Run migrations: `cd wigtail && DJANGO_SETTINGS_MODULE=mysite.settings.dev python manage.py migrate --noinput`
6. Start dev server: `DJANGO_SETTINGS_MODULE=mysite.settings.dev python manage.py runserver 127.0.0.1:8000`
7. Build front-end (if changed): `cd front-end && npm run build:widget`

### Gotchas

- `manage.py` defaults to `mysite.settings.dev` so you can omit `DJANGO_SETTINGS_MODULE` for most commands, but it's safer to set it explicitly.
- Django tests use a separate test database (`test_wagtail`). Some tests in `home.tests.TaxonomyTagsTests` currently fail due to Wagtail 7.3rc1 StreamField API changes; these are pre-existing.
- The front-end build output lands directly in the Wigtail static directory; no `collectstatic` is needed in dev mode.
- Docker in the Cloud Agent VM requires `fuse-overlayfs` storage driver and `iptables-legacy`. The update script handles Docker installation.
- Admin credentials for local dev: `admin` / `admin` (created during initial setup).

### Testing

- **Django tests**: `cd wigtail && python manage.py test` (138 tests; ~99 pass, ~39 have pre-existing failures).
- **Front-end tests**: `cd front-end && npx ng test --watch=false` (Vitest, 2 tests).
- **TypeScript check**: `cd front-end && npx tsc --noEmit`.
- **Prettier check**: `cd front-end && npx prettier --check "src/**/*.{ts,tsx,html,css,scss}"` (39 files have style issues, pre-existing).
- **Django system check**: `cd wigtail && python manage.py check` (no issues).
- **StockCrawler build**: `cd tools/StockCrawler && dotnet build`.
