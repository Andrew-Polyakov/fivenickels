from django.conf import settings
from django.contrib.staticfiles.storage import staticfiles_storage
from django.http import HttpResponseRedirect
from django.urls import include, path
from django.contrib import admin

from wagtail.admin import urls as wagtailadmin_urls
from wagtail import urls as wagtail_urls
from wagtail.documents import urls as wagtaildocs_urls

from home import auth_views
from home import inline_edit_views
from search import views as search_views

from home.ticker_serve import render_ticker_page


def favicon_view(request):
    return HttpResponseRedirect(staticfiles_storage.url("images/favicon.ico"))


urlpatterns = [
    path("favicon.ico", favicon_view, name="favicon"),
    path("django-admin/", admin.site.urls),
    path("admin/", include(wagtailadmin_urls)),
    path("documents/", include(wagtaildocs_urls)),
    path("auth/login/", auth_views.popup_login, name="popup_login"),
    path("auth/signup/", auth_views.popup_signup, name="popup_signup"),
    path("auth/logout/", auth_views.popup_logout, name="popup_logout"),
    path("profile/", auth_views.profile, name="profile"),
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
        "inline/taxonomy/save-master-layout/",
        inline_edit_views.save_taxonomy_master_layout,
        name="save_taxonomy_master_layout",
    ),
    path(
        "inline/tile/update-title/",
        inline_edit_views.update_tile_title,
        name="inline_update_tile_title",
    ),
    path("search/suggest/", search_views.search_suggest, name="search_suggest"),
    path("search/", search_views.search, name="search"),
    path(
        "ticker/<str:ticker_slug>/",
        render_ticker_page,
        name="ticker_page",
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
