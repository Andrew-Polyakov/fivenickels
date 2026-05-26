"""Download Alpaca news image URLs into Wagtail image library for hero_image."""

from __future__ import annotations

import hashlib
import ipaddress
import os
from pathlib import PurePosixPath
from urllib.parse import urlparse

import requests
from django.core.files.base import ContentFile
from wagtail.images import get_image_model

from home.upload_validation import _detect_image_type

_EXT_FROM_CT: dict[str, str] = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
}

_DEFAULT_ALLOWED_HOST_SUFFIXES = (
    "alpaca.markets",
    "cloudfront.net",
    "amazonaws.com",
    "benzinga.com",
    "globenewswire.com",
    "prnewswire.com",
    "businesswire.com",
)


def _allowed_host_suffixes() -> tuple[str, ...]:
    raw = os.environ.get("ALPACA_HERO_IMAGE_HOST_SUFFIXES", "").strip()
    if raw:
        return tuple(part.strip().lower() for part in raw.split(",") if part.strip())
    return _DEFAULT_ALLOWED_HOST_SUFFIXES


def _host_is_allowed(hostname: str) -> bool:
    host = hostname.lower().rstrip(".")
    if not host:
        return False
    if host in {"localhost", "127.0.0.1", "::1"}:
        return False
    try:
        ip = ipaddress.ip_address(host)
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
            return False
    except ValueError:
        pass
    return any(host == suffix or host.endswith(f".{suffix}") for suffix in _allowed_host_suffixes())


def _hero_image_url_is_allowed(url: str) -> bool:
    parsed = urlparse(url)
    if parsed.scheme != "https":
        return False
    return _host_is_allowed(parsed.hostname or "")


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
    if not _hero_image_url_is_allowed(url):
        return None

    Image = get_image_model()
    headers = {"User-Agent": "trades-wigtail-ingest/1.0"}
    try:
        r = request_session.get(
            url,
            timeout=30,
            headers=headers,
            allow_redirects=False,
        )
        r.raise_for_status()
    except Exception:
        return None
    ct = r.headers.get("Content-Type")
    if ct and "text/html" in ct.lower():
        return None
    data = r.content
    if not data:
        return None
    if _detect_image_type(data[:16]) is None:
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
