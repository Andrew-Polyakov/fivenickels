from django.conf import settings
from django.contrib.staticfiles.storage import staticfiles_storage
from django.http import HttpResponseRedirect
from django.urls import include, path
from django.contrib import admin

from wagtail.admin import urls as wagtailadmin_urls
from wagtail import urls as wagtail_urls
from wagtail.documents import urls as wagtaildocs_urls

from home import auth_views
from home import broker_views
from home import market_ticker_views
from home import setup_views
from home import inline_edit_views
from home import editor_views
from home import api_urls
from search import views as search_views

from home.ticker_serve import render_ticker_page
from home.health_views import healthz
from home.seo_views import robots_txt
from home.sitemaps import SITEMAPS

from wagtail.contrib.sitemaps import views as wagtail_sitemap_views


def favicon_view(request):
    return HttpResponseRedirect(staticfiles_storage.url("images/favicon.ico"))


urlpatterns = [
    path("healthz/", healthz, name="healthz"),
    path("favicon.ico", favicon_view, name="favicon"),
    path("", include(api_urls)),
    path("django-admin/", admin.site.urls),
    path("admin/", include(wagtailadmin_urls)),
    path("documents/", include(wagtaildocs_urls)),
    path("auth/login/", auth_views.popup_login, name="popup_login"),
    path("auth/signup/", auth_views.popup_signup, name="popup_signup"),
    path("auth/logout/", auth_views.popup_logout, name="popup_logout"),
    path("profile/", auth_views.profile, name="profile"),
    path(
        "profile/api/tickers/",
        market_ticker_views.profile_tickers_list,
        name="profile_tickers_list",
    ),
    path(
        "profile/api/tickers/<int:pk>/",
        market_ticker_views.profile_ticker_update,
        name="profile_ticker_update",
    ),
    path("profile/article/create/", editor_views.create_article, name="article_create"),
    path("profile/article/<int:article_id>/edit/", editor_views.article_editor, name="article_editor"),
    path(
        "profile/article/<int:article_id>/preview/",
        editor_views.article_preview,
        name="article_preview",
    ),
    path(
        "inline/taxonomy/create/",
        inline_edit_views.create_taxonomy_term,
        name="inline_create_taxonomy_term",
    ),
    path(
        "inline/taxonomy/delete/",
        inline_edit_views.delete_taxonomy_term,
        name="inline_delete_taxonomy_term",
    ),
    path(
        "inline/taxonomy/rename/",
        inline_edit_views.rename_taxonomy_term,
        name="inline_rename_taxonomy_term",  # staff JSON rename for taxonomy-chip-widget
    ),
    path(
        "inline/taxonomy/set-nav/",
        inline_edit_views.set_taxonomy_term_nav,
        name="inline_set_taxonomy_term_nav",
    ),
    path(
        "inline/taxonomy/set-sitemap/",
        inline_edit_views.set_taxonomy_term_sitemap,
        name="inline_set_taxonomy_term_sitemap",
    ),
    path(
        "inline/taxonomy/save-master-layout/",
        inline_edit_views.save_taxonomy_master_layout,
        name="save_taxonomy_master_layout",
    ),
    path(
        "inline/tile/update-title/",
        inline_edit_views.update_tile_title,
        name="inline_update_tile_title",
    ),
    path(
        "inline/article/search/",
        inline_edit_views.search_articles,
        name="inline_search_articles",
    ),
    path(
        "inline/tags/list/",
        inline_edit_views.list_content_tags,
        name="inline_list_content_tags",
    ),
    path(
        "inline/taxonomy/save-content/",
        inline_edit_views.save_taxonomy_content,
        name="save_taxonomy_content",
    ),
    path(
        "inline/taxonomy/upload-image/",
        inline_edit_views.upload_taxonomy_image,
        name="upload_taxonomy_image",
    ),
    path(
        "inline/taxonomy/article-search/",
        inline_edit_views.search_taxonomy_articles,
        name="search_taxonomy_articles",
    ),
    path(
        "inline/taxonomy/category-choices/",
        inline_edit_views.taxonomy_category_choices,
        name="taxonomy_category_choices",
    ),
    path(
        "inline/taxonomy/stock-bars-preview/",
        inline_edit_views.preview_stock_bars_tile,
        name="stock_bars_preview",
    ),
    path(
        "inline/taxonomy/forex-strip-preview/",
        inline_edit_views.preview_forex_strip_tile,
        name="forex_strip_preview",
    ),
    path(
        "inline/taxonomy/market-movers-preview/",
        inline_edit_views.preview_market_movers_tile,
        name="market_movers_preview",
    ),
    path(
        "inline/taxonomy/upcoming-dividends-preview/",
        inline_edit_views.preview_upcoming_dividends_tile,
        name="upcoming_dividends_preview",
    ),
    path(
        "inline/taxonomy/market-calendar-preview/",
        inline_edit_views.preview_market_calendar_tile,
        name="market_calendar_preview",
    ),
    path("inline/brokers/list/", broker_views.broker_list_json, name="broker_list_json"),
    path(
        "inline/brokers/<int:pk>/big-card/",
        broker_views.broker_big_card_json,
        name="broker_big_card_json",
    ),
    path("trading/setups/", setup_views.swing_setups, name="swing_setups"),
    path("rating/forex/", broker_views.forex_ratings, name="forex_ratings"),
    path("rating/forex/broker/<slug:slug>/", broker_views.forex_broker_detail, name="forex_broker_detail"),
    path("rating/forex/<int:pk>/update/", broker_views.broker_rating_update, name="broker_rating_update"),
    path("inline/brokers/<int:pk>/upload-logo/", broker_views.broker_upload_logo, name="broker_upload_logo"),
    path("search/suggest/", search_views.search_suggest, name="search_suggest"),
    path("search/", search_views.search, name="search"),
    path(
        "ticker/<str:ticker_slug>/",
        render_ticker_page,
        name="ticker_page",
    ),
    path("robots.txt", robots_txt, name="robots_txt"),
    path(
        "sitemap.xml",
        wagtail_sitemap_views.index,
        {"sitemaps": SITEMAPS, "sitemap_url_name": "sitemap_section"},
        name="sitemap_index",
    ),
    path(
        "sitemap-<section>.xml",
        wagtail_sitemap_views.sitemap,
        {"sitemaps": SITEMAPS},
        name="sitemap_section",
    ),
]


if settings.DEBUG:
    from django.conf.urls.static import static
    from django.contrib.staticfiles.urls import staticfiles_urlpatterns

    # Serve static and media files from development server
    urlpatterns += staticfiles_urlpatterns()
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

urlpatterns = urlpatterns + [
    # For anything not caught by a more specific rule above, hand over to
    # Wagtail's page serving mechanism. This should be the last pattern in
    # the list:
    path("", include(wagtail_urls)),
    # Alternatively, if you want Wagtail pages to be served from a subpath
    # of your site, rather than the site root:
    #    path("pages/", include(wagtail_urls)),
]
