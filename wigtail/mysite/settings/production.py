from .base import *
from .base import _env_truthy
from .database_url import _apply_ca_cert, _apply_database_url, _apply_postgres_sslmode
from .spaces_storage import validate_spaces_storage_config
import os

DEBUG = False

_apply_database_url(DATABASES)
_apply_postgres_sslmode(DATABASES)
_apply_ca_cert(DATABASES)

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

_spaces_bucket = os.environ.get("AWS_STORAGE_BUCKET_NAME", "").strip()
if _spaces_bucket:
    _spaces_endpoint = os.environ.get("AWS_S3_ENDPOINT_URL", "").strip()
    validate_spaces_storage_config(_spaces_bucket, _spaces_endpoint)

    if "storages" not in INSTALLED_APPS:
        INSTALLED_APPS.insert(
            INSTALLED_APPS.index("django.contrib.staticfiles"),
            "storages",
        )

    AWS_STORAGE_BUCKET_NAME = _spaces_bucket
    AWS_S3_REGION_NAME = os.environ.get("AWS_S3_REGION_NAME", "nyc3").strip()
    AWS_S3_ENDPOINT_URL = _spaces_endpoint
    AWS_S3_USE_SSL = True
    AWS_ACCESS_KEY_ID = os.environ.get("AWS_ACCESS_KEY_ID", "")
    AWS_SECRET_ACCESS_KEY = os.environ.get("AWS_SECRET_ACCESS_KEY", "")
    AWS_S3_OBJECT_PARAMETERS = {"CacheControl": "max-age=86400"}
    AWS_DEFAULT_ACL = "public-read"
    AWS_QUERYSTRING_AUTH = False
    AWS_LOCATION = os.environ.get("AWS_LOCATION", "media").strip() or "media"
    AWS_S3_FILE_OVERWRITE = False
    # Virtual-hosted style; endpoint must be regional base URL (no bucket prefix).
    AWS_S3_ADDRESSING_STYLE = "virtual"

    _media_prefix = f"{AWS_LOCATION.strip('/')}/"
    _custom_domain = os.environ.get("AWS_S3_CUSTOM_DOMAIN", "").strip()
    if _custom_domain:
        AWS_S3_CUSTOM_DOMAIN = _custom_domain
        MEDIA_URL = f"https://{_custom_domain}/{_media_prefix}"
    else:
        MEDIA_URL = (
            f"https://{_spaces_bucket}.{AWS_S3_REGION_NAME}.digitaloceanspaces.com/"
            f"{_media_prefix}"
        )

    STORAGES["default"] = {
        "BACKEND": "storages.backends.s3.S3Storage",
    }

try:
    from .local import *
except ImportError:
    pass

# Wagtail database search uses PostgreSQL FTS when ENGINE is postgresql; django.contrib.postgres is required.
# https://docs.wagtail.org/en/stable/topics/search/backends.html
if DATABASES["default"].get("ENGINE") == "django.db.backends.postgresql":
    if "django.contrib.postgres" not in INSTALLED_APPS:
        INSTALLED_APPS.append("django.contrib.postgres")
