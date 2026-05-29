"""
Settings for release-phase management commands (migrate, collectstatic).

Does not require production HTTP secrets or Spaces/WhiteNoise.
"""

from .base import *
from .database_url import _apply_ca_cert, _apply_database_url, _apply_postgres_sslmode
import os

DEBUG = False

_apply_database_url(DATABASES)
_apply_postgres_sslmode(DATABASES)
_apply_ca_cert(DATABASES)

SECRET_KEY = (
    os.environ.get("DJANGO_SECRET_KEY", "").strip()
    or "release-command-placeholder-not-for-http"
)
ALLOWED_HOSTS = [
    h.strip()
    for h in os.environ.get("DJANGO_ALLOWED_HOSTS", "localhost").split(",")
    if h.strip()
] or ["localhost"]

if DATABASES["default"].get("ENGINE") == "django.db.backends.postgresql":
    if "django.contrib.postgres" not in INSTALLED_APPS:
        INSTALLED_APPS.append("django.contrib.postgres")
