# Deploy Wagtail to DigitalOcean App Platform

This guide deploys the **Wigtail web app** (`wigtail/`) only. StockCrawler, Ollama enrichment, and local `docker-compose` services stay on your machine or CI.

## Prerequisites

- DigitalOcean account with App Platform and Managed PostgreSQL enabled
- GitHub (or GitLab) repo connected to App Platform
- A **Spaces** bucket for Wagtail image/document uploads (App Platform disks are ephemeral)
- Domain (optional): default `*.ondigitalocean.app` hostname works for first deploy

## 1. Managed PostgreSQL

1. Create a PostgreSQL 16 cluster (e.g. `db-s-1vcpu-1gb`) in the **same region** as the app.
2. When attaching the database to the app, set the **default database name** to `wagtail`. The app spec sets `WAGTAIL_POSTGRES_DB=wagtail`. **`${db.DATABASE_URL}` must also point at the `wagtail` database** — production settings fail fast if the URL path is `defaultdb` or anything else.
3. In the SQL console or `psql`, create the second database:

```sql
CREATE DATABASE crawler;
```

4. Allow the App Platform app as a **trusted source** on the database firewall.

### TLS / CA certificate

The app spec binds `${db.CA_CERT}` to `DATABASE_CA_CERT`. Django writes the PEM to `/tmp/do-postgres-ca.pem` and sets `sslrootcert` on both `default` and `crawler` connections, in addition to `POSTGRES_SSLMODE=require`.

### Optional private networking

If the app and database are in the same VPC, you can use the private connection string for lower latency. In app-level `envs`, change:

```yaml
- key: DATABASE_URL
  value: ${db.DATABASE_PRIVATE_URL}
```

Keep `POSTGRES_HOST` / `POSTGRES_PORT` bindings unless you rely entirely on `DATABASE_URL` for the default database.

## 2. Spaces (media uploads)

1. Create a Space in the same region as the app (e.g. `nyc3`).
2. Generate Spaces access keys with read/write access to that bucket.
3. Set app-level env vars (see table below). **`AWS_S3_ENDPOINT_URL` must be the regional base URL only**, e.g. `https://nyc3.digitaloceanspaces.com` — not `https://your-bucket.nyc3.digitaloceanspaces.com`.
4. Optional: enable the Space CDN; set `AWS_S3_CUSTOM_DOMAIN` to the CDN hostname (no `https://` prefix). `MEDIA_URL` is built as `https://<cdn>/media/`.

### Spaces CORS (browser-loaded images)

If images load from the Space or CDN hostname in the browser, configure CORS on the bucket (Control Panel → Space → **Settings** → **CORS Configurations**). Example for site origins:

```json
[
  {
    "AllowedOrigins": ["https://your-app.ondigitalocean.app", "https://yourdomain.com"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3000
  }
]
```

## 3. Create the App Platform app (use the app spec)

Do **not** rely on the default wizard (Node buildpack, `source_dir: wigtail`, empty env vars). Import the spec instead.

1. **Create App** → **GitHub** → `Andrew-Polyakov/fivenickels` (or your fork), branch `main`.
2. **Edit App Spec** → use [`.do/app.yaml`](../.do/app.yaml) from the repo (`name: fivenickels-wigtail`).
3. Confirm **web**: `dockerfile_path: wigtail/Dockerfile`, **`source_dir: /`** (repository root, not `wigtail`).
4. Confirm **Build strategy: Dockerfile**, HTTP port **8080**, **instance_count: 1** (spec default).
5. Confirm **database** component `db` (Postgres 16) is included.

### Automatic vs manual environment variables

[`.do/app.yaml`](../.do/app.yaml) declares **app-level** `envs` inherited by **web** and **migrate**. DigitalOcean injects bindables at deploy time.

| Variable | Set by | Value / action |
|----------|--------|----------------|
| `WAGTAILADMIN_BASE_URL` | DO | `${APP_URL}` |
| `DJANGO_ALLOWED_HOSTS` | DO | `${APP_DOMAIN}` |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | DO | `${APP_URL}` |
| `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | DO | `${db.*}` |
| `DATABASE_URL`, `DATABASE_CA_CERT` | DO | `${db.DATABASE_URL}`, `${db.CA_CERT}` |
| `POSTGRES_SSLMODE`, `WAGTAIL_POSTGRES_DB`, `CRAWLER_POSTGRES_DB` | Spec | `require`, `wagtail`, `crawler` |
| `PUBLIC_SIGNUP_ENABLED` | Spec | `0` |
| `DJANGO_SECRET_KEY` | **You** | Generate and paste once (encrypted) |
| `AWS_STORAGE_BUCKET_NAME` | **You** | Space name |
| `AWS_S3_ENDPOINT_URL` | **You** | `https://nyc3.digitaloceanspaces.com` |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | **You** | Spaces keys |
| `AWS_S3_REGION_NAME` | Spec default | `nyc3` (change if another region) |
| `AWS_S3_CUSTOM_DOMAIN` | Optional | CDN hostname |
| `DJANGO_EXTRA_ALLOWED_HOSTS` | Optional | e.g. `fivenickels.com` (comma-separated) |
| `DJANGO_EXTRA_CSRF_ORIGINS` | Optional | e.g. `https://fivenickels.com` |
| `APCA_API_KEY_ID` / `APCA_API_SECRET_KEY` | Optional | Alpaca features |

After importing the spec, open **Settings → App-Level Environment Variables** and fill **only** the rows that have no bindable value (chiefly `DJANGO_SECRET_KEY` and Spaces secrets). Generate Django key:

```bash
python -c "import secrets; print(secrets.token_urlsafe(50))"
```

**Custom domain:** add the domain in App Platform → **Domains**, set it primary if needed, then add `DJANGO_EXTRA_ALLOWED_HOSTS` and `DJANGO_EXTRA_CSRF_ORIGINS` (or redeploy after editing bindables in the spec).

**First deploy:** `${APP_URL}` / `${APP_DOMAIN}` resolve to the default `*.ondigitalocean.app` hostname once the app exists.

Component-only envs (not duplicated at app level): web uses `mysite.settings.production`, `PORT=8080`, `GUNICORN_WORKERS=1`; migrate uses `mysite.settings.release`.

### Pre-deploy migrations

The **PRE_DEPLOY** `migrate` job runs:

```bash
python manage.py migrate --noinput && python manage.py check --deploy
```

with `DJANGO_SETTINGS_MODULE=mysite.settings.release`. It does **not** require production HTTP secrets or Spaces.

The web container does **not** migrate on startup (`wigtail/entrypoint.sh`). Production **requires** `AWS_STORAGE_BUCKET_NAME` (Spaces); ephemeral disk is not used unless you set `DJANGO_ALLOW_LOCAL_MEDIA=1` for experiments.

**Alerts** (in spec): CPU above 80% and memory above 85% for five minutes notify you in the DO control panel.

## 4. First deploy

1. Deploy and wait for the migrate job (migrations + `check --deploy`) and web service to succeed.
2. Open the app **Console** (web component) and run:

```bash
python manage.py createsuperuser
```

3. Wagtail admin → **Settings → Sites** → set hostname to your public URL (no trailing slash).
4. Smoke tests:
   - `GET /healthz/` → `{"status":"ok"}`
   - `GET /healthz/?deep=1` → `"database":"ok"` when DB is reachable
   - `/admin/` login
   - Upload a test image; URL should be `https://.../media/...` on Spaces or CDN

## 5. Optional: crawler database

The site reads the `crawler` database for `/trading/setups/`. It can stay empty; the page degrades when tables are missing.

Populate from your machine by pointing `.env` `POSTGRES_*` at the managed cluster (with SSL) and running StockCrawler against `CRAWLER_POSTGRES_DB=crawler`.

## 6. Local Docker build (same as App Platform)

From the repository root:

```bash
docker build -f wigtail/Dockerfile -t trades-wigtail .
docker run --rm -p 8080:8080 \
  -e DJANGO_SECRET_KEY=dev-only-change-me \
  -e DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1 \
  -e DJANGO_CSRF_TRUSTED_ORIGINS=http://127.0.0.1:8080 \
  -e WAGTAILADMIN_BASE_URL=http://127.0.0.1:8080 \
  -e POSTGRES_HOST=host.docker.internal \
  -e POSTGRES_USER=trades \
  -e POSTGRES_PASSWORD=trades \
  -e WAGTAIL_POSTGRES_DB=wagtail \
  -e CRAWLER_POSTGRES_DB=crawler \
  -e AWS_STORAGE_BUCKET_NAME=your-space \
  -e AWS_S3_REGION_NAME=nyc3 \
  -e AWS_S3_ENDPOINT_URL=https://nyc3.digitaloceanspaces.com \
  -e AWS_ACCESS_KEY_ID=your-key \
  -e AWS_SECRET_ACCESS_KEY=your-secret \
  trades-wigtail
```

Release settings locally:

```bash
cd wigtail
DJANGO_SETTINGS_MODULE=mysite.settings.release \
  POSTGRES_HOST=127.0.0.1 POSTGRES_USER=trades POSTGRES_PASSWORD=trades \
  python manage.py migrate --check
```

## Troubleshooting

| Symptom | Check |
|---------|--------|
| Build fails on `npm run build:widget` | Run `npm run build:widget` in `front-end/` |
| `collectstatic` fails in Docker | Uses `mysite.settings.release` with dummy `POSTGRES_*` on the build `RUN` line only |
| Migrate job fails at settings import | Job should use `mysite.settings.release`, not `production` |
| Database connection / SSL errors | `crawler` DB exists; trusted sources; `DATABASE_CA_CERT` / `POSTGRES_SSLMODE=require` |
| `FATAL: database "wagtail" does not exist` | Create default DB named `wagtail` on the cluster |
| `DATABASE_URL points at database 'defaultdb'` | Rename/default DB to `wagtail` so URL path matches `WAGTAIL_POSTGRES_DB` |
| Boot error: `AWS_STORAGE_BUCKET_NAME is required` | Set Spaces secrets in app-level env vars |
| `check --deploy` fails in migrate job | Fix settings/DB before web deploy; read migrate logs |
| 400 / DisallowedHost | `${APP_DOMAIN}` resolved; add `DJANGO_EXTRA_ALLOWED_HOSTS` for custom domain |
| CSRF failures on admin | `${APP_URL}` set; add `DJANGO_EXTRA_CSRF_ORIGINS` for extra origins |
| App spec import rejects empty SECRET | Set `DJANGO_SECRET_KEY` and Spaces values in dashboard, then redeploy |
| Wizard shows no env vars | Re-import [`.do/app.yaml`](../.do/app.yaml); use app-level `envs` block |
| Uploaded images 404 | Endpoint URL has no bucket prefix; `public-read` ACL; CORS if browser loads from Space |
| Images blocked in browser (CORS) | Add CORS rule for your site origins on the Space |
| `RuntimeError` on Spaces endpoint | Use `https://nyc3.digitaloceanspaces.com`, not bucket subdomain in `AWS_S3_ENDPOINT_URL` |
| Gunicorn worker crashes | `--worker-tmp-dir /dev/shm`; `0.0.0.0:$PORT`; try `GUNICORN_WORKERS=1` |
| Wagtail admin OOM | Bump `instance_size_slug` to `basic-s` in `.do/app.yaml` |

## Out of scope

- StockCrawler or Ollama on App Platform
- OpenSearch (PostgreSQL FTS unless `WAGTAIL_USE_OPENSEARCH=1`)
- Custom domain DNS (App Platform → **Domains**)

