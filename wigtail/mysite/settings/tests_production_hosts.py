import importlib
import os
from unittest.mock import patch

from django.test import SimpleTestCase


def _reload_production_settings():
    """Reload base then production so INSTALLED_APPS is not polluted across tests."""
    import mysite.settings.base as base_settings
    import mysite.settings.production as production

    importlib.reload(base_settings)
    importlib.reload(production)
    return production


def _production_env(**overrides: str) -> dict[str, str]:
    base = {
        "DJANGO_SECRET_KEY": "test-secret-key-for-import-only",
        "DJANGO_ALLOWED_HOSTS": "app.ondigitalocean.app",
        "DJANGO_CSRF_TRUSTED_ORIGINS": "https://app.ondigitalocean.app",
        "POSTGRES_HOST": "127.0.0.1",
        "POSTGRES_USER": "u",
        "POSTGRES_PASSWORD": "p",
        "AWS_STORAGE_BUCKET_NAME": "test-bucket",
        "AWS_S3_ENDPOINT_URL": "https://nyc3.digitaloceanspaces.com",
        "AWS_ACCESS_KEY_ID": "key",
        "AWS_SECRET_ACCESS_KEY": "secret",
    }
    base.update(overrides)
    return base


class ProductionExtraHostsTests(SimpleTestCase):
    def test_extra_hosts_merge_from_env(self):
        with patch.dict(os.environ, _production_env(
            DJANGO_EXTRA_ALLOWED_HOSTS="fivenickels.com,www.fivenickels.com",
            DJANGO_EXTRA_CSRF_ORIGINS="https://fivenickels.com",
        ), clear=False):
            production = _reload_production_settings()
        self.assertEqual(
            production.ALLOWED_HOSTS,
            ["app.ondigitalocean.app", "fivenickels.com", "www.fivenickels.com"],
        )
        self.assertEqual(
            production.CSRF_TRUSTED_ORIGINS,
            [
                "https://app.ondigitalocean.app",
                "https://fivenickels.com",
            ],
        )

    def test_csrf_derived_from_wagtailadmin_base_url(self):
        with patch.dict(
            os.environ,
            _production_env(
                DJANGO_CSRF_TRUSTED_ORIGINS="",
                WAGTAILADMIN_BASE_URL="https://app.ondigitalocean.app",
            ),
            clear=False,
        ):
            production = _reload_production_settings()
        self.assertEqual(
            production.CSRF_TRUSTED_ORIGINS,
            ["https://app.ondigitalocean.app"],
        )

    def test_missing_spaces_bucket_raises_without_opt_out(self):
        env = _production_env()
        del env["AWS_STORAGE_BUCKET_NAME"]
        with patch.dict(os.environ, env, clear=False):
            with self.assertRaises(RuntimeError) as ctx:
                _reload_production_settings()
        self.assertIn("AWS_STORAGE_BUCKET_NAME", str(ctx.exception))

    def test_local_media_opt_out_skips_spaces_requirement(self):
        with patch.dict(
            os.environ,
            _production_env(
                DJANGO_ALLOW_LOCAL_MEDIA="1",
                AWS_STORAGE_BUCKET_NAME="",
            ),
            clear=False,
        ):
            production = _reload_production_settings()
        self.assertNotIn("storages", production.INSTALLED_APPS)
        self.assertNotIn(
            "storages.backends.s3.S3Storage",
            production.STORAGES.get("default", {}).get("BACKEND", ""),
        )
