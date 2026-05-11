"""
API URL configuration for article editing.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from home.api import ArticleAutoSubmitView, ArticleEditorViewSet

# Create a router and register the ArticleEditorViewSet
router = DefaultRouter()
router.register(r'articles', ArticleEditorViewSet, basename='article')

# API URL patterns
urlpatterns = [
    path('api/articles/auto-submit/', ArticleAutoSubmitView.as_view(), name='article-auto-submit'),
    path('api/', include(router.urls)),
]
