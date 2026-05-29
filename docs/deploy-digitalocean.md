# Deploy Wagtail to DigitalOcean App Platform

This guide deploys the **Wigtail web app** (`wigtail/`) only. StockCrawler, Ollama enrichment, and local `docker-compose` services stay on your machine or CI.

## Prerequisites

- DigitalOcean account with App Platform and Managed PostgreSQL enabled
- GitHub (or GitLab) repo connected to App Platform
- A **Spaces** bucket for Wagtail image/document uploads (App Platform disks are ephemeral)
- Domain (optional): default `*.ondigitalocean.app` hostname works for first deploy

## 1. Managed PostgreSQL

1. Create a PostgreSQL 16 cluster (e.g. `db-s-1vcpu-1gb`) in the **same region** as the app.
2. When attaching the database to the app, set the **default database name** to `wagtail`. The app spec sets `WAGTAIL_POSTGRES_DB=wagtail` (literal, not `${db.DATABASE}`).
3. In the SQL console or `psql`, create the second database:

```sql
CREATE DATABASE crawler;
```

4. Allow the App Platform app as a **trusted source** on the database firewall.

### TLS / CA certificate

The app spec binds `${db.CA_CERT}` to `DATABASE_CA_CERT`. Django writes the PEM to `/tmp/do-postgres-ca.pem` and sets `sslrootcert` on both `default` and `crawler` connections, in addition to `POSTGRES_SSLMODE=require`.

### Optional private networking

If the app and database are in the same VPC, you can use the private connection string for lower latency. On **web** and **migrate**, change:

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

## 3. Create the App Platform app

1. **Create App** → **GitHub** → select this repository and branch.
2. Choose **Use existing app spec** and point to [`.do/app.yaml`](../.do/app.yaml), or paste its contents.
3. Confirm **web** uses `dockerfile_path: wigtail/Dockerfile` and `source_dir: /` (repository root). Without `source_dir: /`, the build fails on `COPY front-end/`.
4. Attach the managed database component (`db`) when prompted.
5. Set **HTTP port** to `8080` (matches `PORT` in the spec).

### Required app-level environment variables

Set in **Settings → App-Level Environment Variables** (encrypt secrets). The web service uses `mysite.settings.production`; the migrate job uses `mysite.settings.release` (no HTTP secrets required for migrate alone, but production still needs them for the web component).

| Variable | Required for | Notes |
|----------|----------------|-------|
| `DJANGO_SECRET_KEY` | Web | `python -c "import secrets; print(secrets.token_urlsafe(50))"` |
| `DJANGO_ALLOWED_HOSTS` | Web | `your-app.ondigitalocean.app,yourdomain.com` |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | Web | `https://your-app.ondigitalocean.app,...` |
| `WAGTAILADMIN_BASE_URL` | Web | Public URL, no trailing slash |
| `AWS_STORAGE_BUCKET_NAME` | Web (media) | Space name |
| `AWS_S3_REGION_NAME` | Web | e.g. `nyc3` |
| `AWS_S3_ENDPOINT_URL` | Web | `https://nyc3.digitaloceanspaces.com` |
| `AWS_ACCESS_KEY_ID` | Web | Spaces key |
| `AWS_SECRET_ACCESS_KEY` | Web | Spaces secret |
| `AWS_S3_CUSTOM_DOMAIN` | Optional | CDN hostname only |
| `GUNICORN_WORKERS` | Optional | Spec default `1` on `basic-xs` |
| `APCA_API_KEY_ID` / `APCA_API_SECRET_KEY` | Optional | Market tiles / charts / news |

The spec wires `POSTGRES_*`, `POSTGRES_SSLMODE=require`, `DATABASE_URL`, and `DATABASE_CA_CERT` from the attached database on both web and migrate.

### Pre-deploy migrations

The **PRE_DEPLOY** `migrate` job runs `python manage.py migrate --noinput` with `DJANGO_SETTINGS_MODULE=mysite.settings.release`. It does **not** require `DJANGO_SECRET_KEY` or `DJANGO_ALLOWED_HOSTS` unless you override release settings.

The web container does **not** migrate on startup (`wigtail/entrypoint.sh`).

## 4. First deploy

1. Deploy and wait for the migrate job and web service to succeed.
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
  -e POSTGRES_HOST=host.docker.internal \
  -e POSTGRES_USER=trades \
  -e POSTGRES_PASSWORD=trades \
  -e WAGTAIL_POSTGRES_DB=wagtail \
  -e CRAWLER_POSTGRES_DB=crawler \
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
| 400 / DisallowedHost | `DJANGO_ALLOWED_HOSTS` matches hostname exactly |
| CSRF failures on admin | `DJANGO_CSRF_TRUSTED_ORIGINS` uses `https://` |
| Uploaded images 404 | Endpoint URL has no bucket prefix; `public-read` ACL; CORS if browser loads from Space |
| Images blocked in browser (CORS) | Add CORS rule for your site origins on the Space |
| `RuntimeError` on Spaces endpoint | Use `https://nyc3.digitaloceanspaces.com`, not bucket subdomain in `AWS_S3_ENDPOINT_URL` |
| Gunicorn worker crashes | `--worker-tmp-dir /dev/shm`; `0.0.0.0:$PORT`; try `GUNICORN_WORKERS=1` |
| Wagtail admin OOM | Bump `instance_size_slug` to `basic-s` in `.do/app.yaml` |

## Out of scope

- StockCrawler or Ollama on App Platform
- OpenSearch (PostgreSQL FTS unless `WAGTAIL_USE_OPENSEARCH=1`)
- Custom domain DNS (App Platform → **Domains**)
