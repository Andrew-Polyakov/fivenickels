from django.test import SimpleTestCase

from mysite.settings.spaces_storage import validate_spaces_storage_config


class ValidateSpacesStorageConfigTests(SimpleTestCase):
    def test_requires_endpoint_when_bucket_set(self):
        with self.assertRaises(RuntimeError) as ctx:
            validate_spaces_storage_config("my-bucket", "")
        self.assertIn("AWS_S3_ENDPOINT_URL", str(ctx.exception))

    def test_rejects_bucket_name_in_endpoint(self):
        with self.assertRaises(RuntimeError) as ctx:
            validate_spaces_storage_config(
                "my-bucket",
                "https://my-bucket.nyc3.digitaloceanspaces.com",
            )
        self.assertIn("without the bucket name", str(ctx.exception))

    def test_accepts_regional_endpoint(self):
        validate_spaces_storage_config(
            "my-bucket",
            "https://nyc3.digitaloceanspaces.com",
        )
