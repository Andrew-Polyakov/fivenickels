from __future__ import annotations

from urllib.parse import urlencode, urlparse

from django.contrib import messages
from django.contrib.auth import authenticate, get_user_model, login, logout
from django.contrib.auth.decorators import login_required
from django.http import HttpRequest, HttpResponse
from django.shortcuts import redirect, render
from django.views.decorators.http import require_GET, require_POST

from home.auth_forms import PopupLoginForm, PopupSignupForm


def _is_safe_next(request: HttpRequest, candidate: str) -> bool:
    if not candidate:
        return False
    parsed = urlparse(candidate)
    if parsed.scheme or parsed.netloc:
        return False
    if not candidate.startswith("/"):
        return False
    # Keep users in the public site auth flow only.
    if candidate.startswith("/admin/") or candidate.startswith("/django-admin/"):
        return False
    return True


def _with_auth_tab(path: str, tab: str) -> str:
    separator = "&" if "?" in path else "?"
    return f"{path}{separator}{urlencode({'auth': tab})}"


def _redirect_target(request: HttpRequest) -> str:
    requested_next = (request.POST.get("next") or "").strip()
    if _is_safe_next(request, requested_next):
        return requested_next
    referer = request.META.get("HTTP_REFERER", "")
    if referer:
        parsed_referer = urlparse(referer)
        allowed_host = request.get_host()
        if parsed_referer.netloc == allowed_host and parsed_referer.path:
            fallback_path = parsed_referer.path
            if parsed_referer.query:
                fallback_path = f"{fallback_path}?{parsed_referer.query}"
            if _is_safe_next(request, fallback_path):
                return fallback_path
    return "/"


@require_POST
def popup_login(request: HttpRequest) -> HttpResponse:
    form = PopupLoginForm(request.POST)
    redirect_to = _redirect_target(request)
    if not form.is_valid():
        for field_errors in form.errors.values():
            for message in field_errors:
                messages.error(request, message, extra_tags="auth-login")
        return redirect(_with_auth_tab(redirect_to, "login"))

    username_or_email = form.cleaned_data["username_or_email"].strip()
    password = form.cleaned_data["password"]
    username = username_or_email
    if "@" in username_or_email:
        user_model = get_user_model()
        user = (
            user_model.objects.filter(email__iexact=username_or_email)
            .only(user_model.USERNAME_FIELD)
            .first()
        )
        if user:
            username = getattr(user, user_model.USERNAME_FIELD)

    user = authenticate(request, username=username, password=password)
    if user is None:
        messages.error(
            request,
            "Invalid username/email or password.",
            extra_tags="auth-login",
        )
        return redirect(_with_auth_tab(redirect_to, "login"))

    login(request, user)
    messages.success(request, "You are now signed in.")
    return redirect(redirect_to)


@require_POST
def popup_signup(request: HttpRequest) -> HttpResponse:
    form = PopupSignupForm(request.POST)
    redirect_to = _redirect_target(request)
    if not form.is_valid():
        for field_errors in form.errors.values():
            for message in field_errors:
                messages.error(request, message, extra_tags="auth-signup")
        return redirect(_with_auth_tab(redirect_to, "signup"))

    user = form.save()
    login(request, user)
    messages.success(request, "Account created and signed in.")
    return redirect(redirect_to)


@require_POST
def popup_logout(request: HttpRequest) -> HttpResponse:
    redirect_to = _redirect_target(request)
    logout(request)
    messages.success(request, "You are now signed out.")
    return redirect(redirect_to)


@require_GET
@login_required
def profile(request: HttpRequest) -> HttpResponse:
    from django.urls import reverse
    from home.models import TaggedContentPage

    articles_qs = (
        TaggedContentPage.objects.live()
        .public()
        .select_related("section_term", "taxonomy_category")
        .order_by("-first_published_at")[:500]
    )
    is_staff = request.user and (request.user.is_staff or request.user.is_superuser)
    
    articles_data = [
        {
            "id": p.id,
            "title": p.title,
            "url": p.get_url(request) or "",
            "published": p.first_published_at.strftime("%Y-%m-%d") if p.first_published_at else "",
            "section_slug": p.section_term.slug,
            "section_name": p.section_term.name,
            "category_name": p.taxonomy_category.name if p.taxonomy_category_id else "",
            "edit_url": reverse("article_editor", kwargs={"article_id": p.id}) if is_staff else None,
        }
        for p in articles_qs
    ]
    return render(request, "profile.html", {"articles_data": articles_data, "is_staff": is_staff})
