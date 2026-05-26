from .base import *
import os

DEBUG = False

_secret = os.environ.get("DJANGO_SECRET_KEY", "").strip()
if not _secret:
    raise RuntimeError(
        "DJANGO_SECRET_KEY is required in production. "
        "Set it in the environment or mysite/settings/local.py."
    )
SECRET_KEY = _secret

ALLOWED_HOSTS = [
    h.strip()
    for h in os.environ.get("DJANGO_ALLOWED_HOSTS", "").split(",")
    if h.strip()
]
if not ALLOWED_HOSTS:
    raise RuntimeError(
        "DJANGO_ALLOWED_HOSTS is required in production "
        "(comma-separated hostnames)."
    )

CSRF_TRUSTED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get("DJANGO_CSRF_TRUSTED_ORIGINS", "").split(",")
    if origin.strip()
]

_wagtail_base_url = os.environ.get("WAGTAILADMIN_BASE_URL", "").strip()
if _wagtail_base_url:
    WAGTAILADMIN_BASE_URL = _wagtail_base_url

SECURE_SSL_REDIRECT = _env_truthy("DJANGO_SECURE_SSL_REDIRECT") or True
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True

# Serve /static/ from STATIC_ROOT in production (no separate nginx static mapping required).
# CompressedManifestStaticFilesStorage combines hashed filenames with gzip/brotli compression.
# See https://whitenoise.readthedocs.io/en/stable/django.html
MIDDLEWARE = list(MIDDLEWARE)
MIDDLEWARE.insert(1, "whitenoise.middleware.WhiteNoiseMiddleware")

STORAGES["staticfiles"]["BACKEND"] = (
    "whitenoise.storage.CompressedManifestStaticFilesStorage"
)

try:
    from .local import *
except ImportError:
    pass

# Wagtail database search uses PostgreSQL FTS when ENGINE is postgresql; django.contrib.postgres is required.
# https://docs.wagtail.org/en/stable/topics/search/backends.html
if DATABASES["default"].get("ENGINE") == "django.db.backends.postgresql":
    if "django.contrib.postgres" not in INSTALLED_APPS:
        INSTALLED_APPS.append("django.contrib.postgres")
