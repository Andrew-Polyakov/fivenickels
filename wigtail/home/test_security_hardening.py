from django.test import SimpleTestCase, override_settings

from home.alpaca_hero_image import _hero_image_url_is_allowed
from home.upload_validation import validate_image_upload


class HeroImageUrlAllowlistTests(SimpleTestCase):
    def test_allows_https_cdn_hosts(self):
        self.assertTrue(
            _hero_image_url_is_allowed("https://d111111abcdef8.cloudfront.net/news/a.jpg")
        )
        self.assertTrue(_hero_image_url_is_allowed("https://data.alpaca.markets/image.jpg"))

    def test_blocks_http_and_internal_hosts(self):
        self.assertFalse(_hero_image_url_is_allowed("http://cdn.example.com/a.jpg"))
        self.assertFalse(_hero_image_url_is_allowed("https://127.0.0.1/a.jpg"))
        self.assertFalse(_hero_image_url_is_allowed("https://localhost/a.jpg"))


class ImageUploadValidationTests(SimpleTestCase):
    class _FakeUpload:
        def __init__(self, data: bytes, content_type: str = "image/png"):
            self.data = data
            self.content_type = content_type
            self.size = len(data)
            self._offset = 0

        def read(self, size=-1):
            if size < 0:
                chunk = self.data[self._offset :]
            else:
                chunk = self.data[self._offset : self._offset + size]
            self._offset += len(chunk)
            return chunk

        def seek(self, offset):
            self._offset = offset

    def test_accepts_png_magic_bytes(self):
        png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 8
        upload = self._FakeUpload(png, content_type="image/png")
        self.assertIsNone(validate_image_upload(upload))

    def test_rejects_html_payload(self):
        upload = self._FakeUpload(b"<html></html>", content_type="text/html")
        self.assertEqual(
            validate_image_upload(upload),
            "Unsupported image type.",
        )
