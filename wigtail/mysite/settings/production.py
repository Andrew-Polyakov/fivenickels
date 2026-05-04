from .base import *

DEBUG = False

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
