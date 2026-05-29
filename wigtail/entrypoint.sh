#!/bin/sh
set -e

if [ "${RUN_MIGRATIONS:-0}" = "1" ]; then
  python manage.py migrate --noinput
fi

exec gunicorn mysite.wsgi:application \
  --bind "0.0.0.0:${PORT:-8080}" \
  --worker-tmp-dir /dev/shm \
  --workers "${GUNICORN_WORKERS:-2}" \
  --timeout "${GUNICORN_TIMEOUT:-120}"
