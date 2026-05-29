import os
from pathlib import Path
from unittest.mock import patch

from django.test import SimpleTestCase

from mysite.settings.database_url import (
    _apply_ca_cert,
    _apply_database_url,
    _apply_postgres_sslmode,
)


def _sample_databases() -> dict:
    return {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "HOST": "localhost",
            "PORT": "5432",
            "NAME": "wagtail",
            "USER": "trades",
            "PASSWORD": "",
            "OPTIONS": {},
        },
        "crawler": {
            "ENGINE": "django.db.backends.postgresql",
            "HOST": "localhost",
            "PORT": "5432",
            "NAME": "crawler",
            "USER": "trades",
            "PASSWORD": "",
            "OPTIONS": {},
        },
    }


class DatabaseUrlHelpersTests(SimpleTestCase):
    def test_apply_database_url_overrides_default(self):
        databases = _sample_databases()
        with patch.dict(
            os.environ,
            {
                "DATABASE_URL": "postgresql://app:secret@db.example.com:25060/wagtaildb?sslmode=require",
            },
            clear=False,
        ):
            _apply_database_url(databases)
        default = databases["default"]
        self.assertEqual(default["HOST"], "db.example.com")
        self.assertEqual(default["PORT"], "25060")
        self.assertEqual(default["NAME"], "wagtaildb")
        self.assertEqual(default["USER"], "app")
        self.assertEqual(default["PASSWORD"], "secret")
        self.assertEqual(default["OPTIONS"]["sslmode"], "require")
        self.assertEqual(databases["crawler"]["NAME"], "crawler")

    def test_apply_postgres_sslmode_on_both_aliases(self):
        databases = _sample_databases()
        with patch.dict(os.environ, {"POSTGRES_SSLMODE": "require"}, clear=False):
            _apply_postgres_sslmode(databases)
        self.assertEqual(databases["default"]["OPTIONS"]["sslmode"], "require")
        self.assertEqual(databases["crawler"]["OPTIONS"]["sslmode"], "require")

    def test_apply_ca_cert_writes_sslrootcert(self):
        databases = _sample_databases()
        pem = "-----BEGIN CERTIFICATE-----\nTEST\n-----END CERTIFICATE-----\n"
        cert_path = Path(os.environ.get("TEMP", "/tmp")) / "trades-test-do-ca.pem"
        cert_path.unlink(missing_ok=True)
        with patch("mysite.settings.database_url._CA_CERT_PATH", cert_path):
            with patch.dict(os.environ, {"DATABASE_CA_CERT": pem}, clear=False):
                _apply_ca_cert(databases)
        try:
            self.assertTrue(cert_path.is_file())
            self.assertEqual(databases["default"]["OPTIONS"]["sslrootcert"], str(cert_path))
            self.assertEqual(databases["crawler"]["OPTIONS"]["sslrootcert"], str(cert_path))
        finally:
            cert_path.unlink(missing_ok=True)
