"""SEO helpers: robots.txt discovery for crawlers."""

from django.http import HttpRequest, HttpResponse


def robots_txt(request: HttpRequest) -> HttpResponse:
    sitemap_url = request.build_absolute_uri("/sitemap.xml")
    body = "\n".join(
        [
            "User-agent: *",
            "Allow: /",
            "",
            f"Sitemap: {sitemap_url}",
            "",
        ]
    )
    return HttpResponse(body, content_type="text/plain; charset=utf-8")
