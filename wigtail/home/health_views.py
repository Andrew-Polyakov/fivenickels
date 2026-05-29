"""Lightweight health checks for load balancers and App Platform."""

from __future__ import annotations

from django.db import connections
from django.db.utils import DatabaseError, OperationalError
from django.http import HttpRequest, JsonResponse


def healthz(request: HttpRequest) -> JsonResponse:
    """Return 200 when the app process is up; optional DB probe with ?deep=1."""
    payload: dict[str, str] = {"status": "ok"}

    if request.GET.get("deep") == "1":
        try:
            connections["default"].ensure_connection()
            payload["database"] = "ok"
        except (DatabaseError, OperationalError) as exc:
            return JsonResponse(
                {"status": "error", "database": str(exc)},
                status=503,
            )

    return JsonResponse(payload, json_dumps_params={"separators": (",", ":")})
