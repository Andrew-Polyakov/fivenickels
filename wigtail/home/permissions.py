"""Shared authorization helpers for article editing."""

from rest_framework import permissions


def staff_article_access(user) -> bool:
    return bool(user.is_authenticated and (user.is_staff or user.is_superuser))


class IsStaffUser(permissions.BasePermission):
    message = "Staff access required."

    def has_permission(self, request, view):
        return staff_article_access(request.user)
