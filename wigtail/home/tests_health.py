import json
from unittest.mock import patch

from django.db.utils import OperationalError
from django.test import Client, SimpleTestCase, override_settings


@override_settings(ROOT_URLCONF="mysite.urls")
class HealthzViewTests(SimpleTestCase):
    def setUp(self):
        self.client = Client()

    def test_healthz_returns_ok(self):
        response = self.client.get("/healthz/")
        self.assertEqual(response.status_code, 200)
        payload = json.loads(response.content)
        self.assertEqual(payload["status"], "ok")
        self.assertNotIn("database", payload)

    def test_healthz_deep_ok_when_database_connects(self):
        with patch("home.health_views.connections") as connections:
            connections.__getitem__.return_value.ensure_connection.return_value = None
            response = self.client.get("/healthz/?deep=1")
        self.assertEqual(response.status_code, 200)
        payload = json.loads(response.content)
        self.assertEqual(payload["status"], "ok")
        self.assertEqual(payload["database"], "ok")

    def test_healthz_deep_503_when_database_fails(self):
        with patch("home.health_views.connections") as connections:
            connections.__getitem__.return_value.ensure_connection.side_effect = (
                OperationalError("connection refused")
            )
            response = self.client.get("/healthz/?deep=1")
        self.assertEqual(response.status_code, 503)
        payload = json.loads(response.content)
        self.assertEqual(payload["status"], "error")
