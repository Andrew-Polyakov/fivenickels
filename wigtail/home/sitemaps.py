"""XML sitemap sections for search engines (Wagtail pages + static public views)."""

from django.contrib.sitemaps import Sitemap
from django.urls import reverse

from wagtail.contrib.sitemaps import Sitemap as WagtailSitemap


class StaticPublicViewsSitemap(Sitemap):
    changefreq = "weekly"
    priority = 0.7

    def items(self):
        return ["forex_ratings"]

    def location(self, item):
        return reverse(item)


SITEMAPS = {
    "pages": WagtailSitemap,
    "static": StaticPublicViewsSitemap,
}
