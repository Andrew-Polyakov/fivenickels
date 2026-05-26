"""Lightweight IP-based rate limiting using Django cache."""

from __future__ import annotations

import time

from django.core.cache import cache
from django.http import HttpRequest, JsonResponse


def client_ip(request: HttpRequest) -> str:
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "unknown")


def is_rate_limited(request: HttpRequest, *, scope: str, limit: int, window: int) -> bool:
    """Return True when the client exceeded limit requests within window seconds."""
    key = f"ratelimit:{scope}:{client_ip(request)}"
    now = time.time()
    timestamps = cache.get(key, [])
    timestamps = [stamp for stamp in timestamps if now - stamp < window]
    if len(timestamps) >= limit:
        return True
    timestamps.append(now)
    cache.set(key, timestamps, window)
    return False


def rate_limit_response() -> JsonResponse:
    return JsonResponse({"error": "Too many requests. Try again later."}, status=429)
