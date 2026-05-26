"""Image upload validation helpers."""

from __future__ import annotations

from django.core.files.uploadedfile import UploadedFile

MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024

_ALLOWED_IMAGE_TYPES = frozenset(
    {
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp",
    }
)

_MAGIC_PREFIXES: tuple[tuple[bytes, str], ...] = (
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"GIF87a", "image/gif"),
    (b"GIF89a", "image/gif"),
    (b"RIFF", "image/webp"),
)


def _detect_image_type(data: bytes) -> str | None:
    for prefix, content_type in _MAGIC_PREFIXES:
        if data.startswith(prefix):
            return content_type
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


def validate_image_upload(image_file: UploadedFile) -> str | None:
    """Return an error message when invalid, otherwise None."""
    if image_file.size is None or image_file.size <= 0:
        return "Empty image file."
    if image_file.size > MAX_IMAGE_UPLOAD_BYTES:
        return "Image exceeds the 10 MB upload limit."

    content_type = (getattr(image_file, "content_type", "") or "").split(";")[0].strip().lower()
    if content_type and content_type not in _ALLOWED_IMAGE_TYPES:
        return "Unsupported image type."

    head = image_file.read(16)
    image_file.seek(0)
    detected = _detect_image_type(head)
    if detected is None:
        return "File is not a recognized image format."
    if content_type and content_type != detected:
        return "Image content does not match its declared type."
    return None
