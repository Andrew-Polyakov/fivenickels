"""
Views for article editing from profile page.
"""
from django.contrib.auth.decorators import login_required, user_passes_test
from django.http import Http404
from django.shortcuts import render, get_object_or_404
from django.views.decorators.http import require_GET

from home.models import TaggedContentPage


def _is_staff(user):
    """Check if user is staff or superuser."""
    return user and (user.is_staff or user.is_superuser)


@login_required
@user_passes_test(_is_staff)
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
