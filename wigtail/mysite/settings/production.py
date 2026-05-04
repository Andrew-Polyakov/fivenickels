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
