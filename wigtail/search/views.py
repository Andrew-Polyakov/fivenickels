from django.core.paginator import EmptyPage, PageNotAnInteger, Paginator
from django.http import JsonResponse
from django.template.response import TemplateResponse

from wagtail.models import Page

from home.rate_limit import is_rate_limited, rate_limit_response
from search.utils import (
    highlighted_preview_html,
    highlighted_title_html,
    normalize_query_string,
)

# To enable logging of search queries for use with the "Promoted search results" module
# <https://docs.wagtail.org/en/stable/reference/contrib/searchpromotions.html>
# uncomment the following line and the lines indicated in the search function
# (after adding wagtail.contrib.search_promotions to INSTALLED_APPS):

# from wagtail.contrib.search_promotions.models import Query

_SUGGEST_MIN_LEN = 2
_SUGGEST_DEFAULT_LIMIT = 3
_SUGGEST_MAX_LIMIT = 10


def search_suggest(request):
    """
    JSON for live search: first N results with HTML-safe title/preview highlights.
    GET q or query, limit (default 3, max 10).
    """
    if request.method != "GET":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    if is_rate_limited(request, scope="search_suggest", limit=30, window=60):
        return rate_limit_response()

    raw = request.GET.get("q") or request.GET.get("query") or ""
    q = normalize_query_string(raw)
    try:
        limit = int(request.GET.get("limit", _SUGGEST_DEFAULT_LIMIT))
    except (TypeError, ValueError):
        limit = _SUGGEST_DEFAULT_LIMIT
    limit = max(1, min(limit, _SUGGEST_MAX_LIMIT))

    if len(q) < _SUGGEST_MIN_LEN:
        return JsonResponse({"query": q, "total": 0, "results": []})

    search_results = Page.objects.live().search(q)
    total = search_results.count()
    pages = list(search_results[:limit])

    out = []
    for page in pages:
        title_html = highlighted_title_html(page, q)
        preview_html = highlighted_preview_html(page, q, use_excerpt_window=True)
        out.append(
            {
                "title_html": title_html,
                "preview_html": preview_html,
                "url": page.get_url(request),
            }
        )

    return JsonResponse({"query": q, "total": total, "results": out})


def search(request):
    search_query = request.GET.get("query", None)
    page = request.GET.get("page", 1)

    # Search
    if search_query:
        search_results = Page.objects.live().search(search_query)

        # To log this query for use with the "Promoted search results" module:

        # query = Query.get(search_query)
        # query.add_hit()

    else:
        search_results = Page.objects.none()

    # Pagination
    paginator = Paginator(search_results, 10)
    try:
        search_results = paginator.page(page)
    except PageNotAnInteger:
        search_results = paginator.page(1)
    except EmptyPage:
        search_results = paginator.page(paginator.num_pages)

    return TemplateResponse(
        request,
        "search/search.html",
        {
            "search_query": search_query,
            "search_results": search_results,
        },
    )
