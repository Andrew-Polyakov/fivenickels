"""Middleware that detects the visitor's region from Cloudflare headers or cookies."""
from __future__ import annotations

_COOKIE_COUNTRY = "region"
_COOKIE_MARKET_REGION = "market_region"

_MARKET_REGION_KEYS = frozenset({"US", "ASIA", "EUROPE"})

_COUNTRY_TO_MARKET_REGION: dict[str, str] = {
    # Americas → US markets
    "US": "US", "CA": "US", "MX": "US", "BR": "US",
    "CL": "US", "UY": "US", "PE": "US",
    # Europe → European markets
    "AT": "EUROPE", "BE": "EUROPE", "HR": "EUROPE", "CZ": "EUROPE",
    "DK": "EUROPE", "FI": "EUROPE", "FR": "EUROPE", "DE": "EUROPE",
    "GR": "EUROPE", "HU": "EUROPE", "IE": "EUROPE", "IT": "EUROPE",
    "NL": "EUROPE", "NO": "EUROPE", "PL": "EUROPE", "PT": "EUROPE",
    "RO": "EUROPE", "ES": "EUROPE", "SE": "EUROPE", "CH": "EUROPE",
    "GB": "EUROPE", "TR": "EUROPE", "UA": "EUROPE", "IL": "EUROPE",
    # Middle East → ASIA
    "AE": "ASIA", "SA": "ASIA",
    # Asia-Pacific → ASIA
    "AU": "ASIA", "CN": "ASIA", "IN": "ASIA", "ID": "ASIA",
    "JP": "ASIA", "MY": "ASIA", "NZ": "ASIA", "PK": "ASIA",
    "PH": "ASIA", "SG": "ASIA", "KR": "ASIA", "TW": "ASIA",
    "TH": "ASIA", "VN": "ASIA",
}


def _validate_country_code(raw: str) -> str | None:
    code = (raw or "").strip().upper()
    return code if (len(code) == 2 and code.isalpha() and code != "XX") else None


def _validate_market_region(raw: str) -> str | None:
    key = (raw or "").strip().upper()
    return key if key in _MARKET_REGION_KEYS else None


class RegionMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # country_code: region cookie → CF-IPCountry header → "US"
        country_code = _validate_country_code(
            request.COOKIES.get(_COOKIE_COUNTRY, "")
        ) or _validate_country_code(
            request.headers.get("CF-IPCountry", "")
        ) or "US"
        request.country_code = country_code

        # market_region: market_region cookie → derived from country_code
        request.market_region = _validate_market_region(
            request.COOKIES.get(_COOKIE_MARKET_REGION, "")
        ) or _COUNTRY_TO_MARKET_REGION.get(country_code, "US")

        return self.get_response(request)
