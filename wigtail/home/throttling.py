"""DRF throttling for article APIs."""

from rest_framework.throttling import AnonRateThrottle, SimpleRateThrottle


class AutoSubmitRateThrottle(SimpleRateThrottle):
    scope = "auto_submit"

    def get_cache_key(self, request, view):
        auth = request.META.get("HTTP_AUTHORIZATION", "")
        if auth.startswith("Bearer "):
            token = auth[7:].strip()
            if token:
                return self.cache_format % {"scope": self.scope, "ident": token[:32]}
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}


class ArticleWriteRateThrottle(SimpleRateThrottle):
    scope = "article_write"

    def get_cache_key(self, request, view):
        if request.user and request.user.is_authenticated:
            return self.cache_format % {
                "scope": self.scope,
                "ident": str(request.user.pk),
            }
        return self.get_ident(request)


class SearchSuggestRateThrottle(AnonRateThrottle):
    scope = "search_suggest"
