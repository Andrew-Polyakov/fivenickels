"""
Views for article editing from profile page.
"""
from django.contrib.auth.decorators import login_required, user_passes_test
from django.http import Http404
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone
from django.utils.text import slugify
from django.views.decorators.http import require_GET, require_POST
from wagtail.models import Site

from home.models import HomePage, TaggedContentPage, TaxonomyTerm


def _staff_article_access(user) -> bool:
    return bool(user.is_authenticated and (user.is_staff or user.is_superuser))


@login_required
@user_passes_test(_staff_article_access)
@require_GET
def article_preview(request, article_id):
    """Staff-only render of the article using its latest saved revision."""
    page = get_object_or_404(TaggedContentPage, id=article_id)
    revision = page.get_latest_revision()
    if revision is not None:
        page = revision.as_object()
    return page.serve(request)


@login_required
@require_GET
def article_editor(request, article_id):
    """
    Display article editor page for staff users.
    """
    try:
        article = get_object_or_404(TaggedContentPage, id=article_id)
    except Http404:
        raise Http404("Article not found")

    context = {
        'article': article,
        'article_id': article_id,
    }

    return render(request, 'home/article_editor.html', context)


def _get_profile_article_parent(request):
    site = Site.find_for_request(request)
    if site is not None:
        root_page = site.root_page.specific
        if isinstance(root_page, HomePage):
            return root_page
    return HomePage.objects.live().first() or HomePage.objects.first()


def _get_default_article_section():
    return (
        TaxonomyTerm.objects.filter(depth=1, is_visible=True)
        .order_by("sort_order", "name")
        .first()
        or TaxonomyTerm.objects.filter(depth=1).order_by("sort_order", "name").first()
    )


@login_required
@require_POST
def create_article(request):
    """
    Create a blank draft article and open it in the profile editor.
    """
    parent = _get_profile_article_parent(request)
    if parent is None:
        raise Http404("Home page not found")

    section = _get_default_article_section()
    if section is None:
        raise Http404("Article section not found")

    title = "Untitled article"
    timestamp = timezone.now().strftime("%Y%m%d%H%M%S%f")
    page = TaggedContentPage(
        title=title,
        slug=f"{slugify(title) or 'article'}-{timestamp}",
        section_term=section,
    )
    parent.add_child(instance=page)
    page.save_revision(user=request.user)

    return redirect("article_editor", article_id=page.id)
