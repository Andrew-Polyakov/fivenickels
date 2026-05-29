"""DigitalOcean Spaces configuration validation for production."""

from __future__ import annotations


def validate_spaces_storage_config(bucket_name: str, endpoint_url: str) -> None:
    """Fail fast on common Spaces misconfiguration."""
    if not endpoint_url:
        raise RuntimeError(
            "AWS_S3_ENDPOINT_URL is required when AWS_STORAGE_BUCKET_NAME is set. "
            "Use the regional base URL, e.g. https://nyc3.digitaloceanspaces.com"
        )
    if bucket_name in endpoint_url:
        raise RuntimeError(
            "AWS_S3_ENDPOINT_URL must be the regional base URL without the bucket name "
            f"(got bucket {bucket_name!r} in the endpoint)."
        )
