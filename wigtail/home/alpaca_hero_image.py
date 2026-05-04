"""Download Alpaca news image URLs into Wagtail image library for hero_image."""

from __future__ import annotations

import hashlib
import os
from pathlib import PurePosixPath
from urllib.parse import urlparse

import requests
from django.core.files.base import ContentFile
from wagtail.images import get_image_model

_EXT_FROM_CT: dict[str, str] = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
}


def _suffix_from_url_or_ct(url: str, content_type: str | None) -> str:
    path = PurePosixPath(urlparse(url).path)
    suf = path.suffix.lower()
    if suf in (".jpg", ".jpeg", ".png", ".gif", ".webp"):
        return ".jpg" if suf == ".jpeg" else suf
    if content_type:
        ct = content_type.split(";")[0].strip().lower()
        if ct in _EXT_FROM_CT:
            return _EXT_FROM_CT[ct]
    return ".bin"


def import_hero_image(
    url: str,
    *,
    label: str,
    request_session: requests.Session,
) -> object | None:
    """Download URL into a Wagtail Image, or return None on failure."""
    Image = get_image_model()
    headers = {"User-Agent": "trades-wagtail-ingest/1.0"}
    try:
        r = request_session.get(url, timeout=30, headers=headers)
        r.raise_for_status()
    except Exception:
        return None
    ct = r.headers.get("Content-Type")
    if ct and "text/html" in ct.lower():
        return None
    data = r.content
    if not data:
        return None
    ext = _suffix_from_url_or_ct(url, ct)
    path_name = PurePosixPath(urlparse(url).path).name
    if path_name and len(path_name) < 200:
        stem = os.path.splitext(path_name)[0][:80]
        fname = f"{stem}{ext}"
    else:
        h = hashlib.sha256(url.encode()).hexdigest()[:16]
        fname = f"alpaca-{h}{ext}"
    title = f"Alpaca {label}"[:255]
    img = Image(title=title)
    try:
        img.file.save(fname, ContentFile(data), save=True)
    except Exception:
        return None
    return img
