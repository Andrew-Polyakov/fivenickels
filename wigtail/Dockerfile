# Build from repository root:
#   docker build -f wigtail/Dockerfile .

FROM node:22-bookworm-slim AS frontend

WORKDIR /build/front-end

COPY front-end/package.json front-end/package-lock.json ./
RUN npm ci

COPY front-end/ ./
RUN npm run build:widget

FROM python:3.12-slim-bookworm

RUN useradd wagtail

EXPOSE 8080

ENV PYTHONUNBUFFERED=1 \
    PORT=8080 \
    DJANGO_SETTINGS_MODULE=mysite.settings.production

RUN apt-get update --yes --quiet && apt-get install --yes --quiet --no-install-recommends \
    build-essential \
    libpq-dev \
    libmariadb-dev \
    libjpeg62-turbo-dev \
    zlib1g-dev \
    libwebp-dev \
 && rm -rf /var/lib/apt/lists/*

RUN pip install "gunicorn>=23,<24"

COPY wigtail/requirements.txt /requirements.txt
RUN pip install -r /requirements.txt

WORKDIR /app

RUN chown wagtail:wagtail /app

COPY --chown=wagtail:wagtail wigtail/ /app/
COPY --from=frontend --chown=wagtail:wagtail \
    /build/wigtail/mysite/static/angular-taxonomy-chip-widget \
    /app/mysite/static/angular-taxonomy-chip-widget

RUN chmod +x /app/entrypoint.sh \
 && DJANGO_SETTINGS_MODULE=mysite.settings.release \
    POSTGRES_HOST=127.0.0.1 POSTGRES_USER=build POSTGRES_PASSWORD=build \
    WAGTAIL_POSTGRES_DB=wagtail CRAWLER_POSTGRES_DB=crawler \
    python manage.py collectstatic --noinput --clear \
 && chown -R wagtail:wagtail /app/static

USER wagtail

ENTRYPOINT ["/app/entrypoint.sh"]
