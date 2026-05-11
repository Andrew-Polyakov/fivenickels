"""
REST API Views for article editing from profile page.
"""
import secrets

from django.conf import settings
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import JSONParser, MultiPartParser, FormParser
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404
from django.http import Http404
from django.db import transaction

from home.article_auto_submit import submit_articles_batch
from home.models import TaggedContentPage, ContentTag, TaxonomyTerm
from home.serializers import (
    ArticleEditorSerializer,
    ArticleUpdateSerializer,
    ArticleStatusActionSerializer,
    AutoSubmitBatchSerializer,
)


class IsAuthenticatedUser(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)


class HasArticleSubmitBearerToken(permissions.BasePermission):
    message = "Valid Bearer token required."

    def has_permission(self, request, view):
        expected = (getattr(settings, "ARTICLE_SUBMIT_BEARER_TOKEN", None) or "").strip()
        if not expected:
            return False
        auth = request.META.get("HTTP_AUTHORIZATION", "")
        if not auth.startswith("Bearer "):
            return False
        token = auth[7:].strip()
        if not token:
            return False
        return secrets.compare_digest(token, expected)


class ArticleAutoSubmitView(APIView):
    permission_classes = [HasArticleSubmitBearerToken]
    parser_classes = (JSONParser,)

    def post(self, request):
        serializer = AutoSubmitBatchSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        articles = serializer.validated_data.get("articles") or []
        if not articles:
            return Response(
                {"error": "articles must contain at least one item."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        summary = submit_articles_batch(articles)
        http_status = status.HTTP_200_OK
        if summary["created"] == 0 and summary["failed"] > 0:
            http_status = status.HTTP_400_BAD_REQUEST
        return Response(summary, status=http_status)


class ArticleEditorViewSet(viewsets.ModelViewSet):
    queryset = TaggedContentPage.objects.all()
    serializer_class = ArticleEditorSerializer
    permission_classes = [IsAuthenticatedUser]
    parser_classes = (JSONParser, MultiPartParser, FormParser)
    http_method_names = ['get', 'post', 'patch', 'delete', 'options']

    def get_object(self):
        article_id = self.kwargs.get('pk')
        try:
            return get_object_or_404(TaggedContentPage, id=article_id)
        except Http404:
            raise Http404("Article not found")

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        return Response(self.get_serializer(instance).data)

    def partial_update(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = ArticleUpdateSerializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(ArticleEditorSerializer(instance).data)

    @transaction.atomic
    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = ArticleUpdateSerializer(instance, data=request.data, partial=False)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(ArticleEditorSerializer(instance).data)

    @action(detail=True, methods=['post'], url_path='action', url_name='article-action')
    def article_action(self, request, pk=None):
        instance = self.get_object()
        serializer = ArticleStatusActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        action_name = serializer.validated_data['action']

        if action_name == 'publish':
            revision = instance.save_revision(user=request.user)
            revision.publish()
            instance.refresh_from_db()
            return Response({'status': 'success', 'message': 'Article published',
                             'article': ArticleEditorSerializer(instance).data})

        if action_name == 'unpublish':
            instance.unpublish(user=request.user, log_action='wagtail.unpublish')
            instance.refresh_from_db()
            return Response({'status': 'success', 'message': 'Article unpublished',
                             'article': ArticleEditorSerializer(instance).data})

        if action_name == 'submit_moderation':
            instance.save_revision(user=request.user, submitted_for_moderation=True)
            return Response({'status': 'success', 'message': 'Submitted for moderation',
                             'article': ArticleEditorSerializer(instance).data})

        if action_name == 'save_draft':
            instance.save_revision(user=request.user)
            return Response({'status': 'success', 'message': 'Draft saved',
                             'article': ArticleEditorSerializer(instance).data})

        if action_name == 'delete':
            title = instance.title
            instance.delete()
            return Response({'status': 'success', 'message': f'"{title}" deleted',
                             'redirect': '/profile/'})

        return Response({'error': 'Unknown action'}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'], url_path='taxonomy', url_name='taxonomy-list')
    def taxonomy_list(self, request):
        """Return root taxonomy terms each with their direct children."""
        all_terms = list(TaxonomyTerm.objects.all().order_by('path'))
        steplen = TaxonomyTerm.steplen

        result = []
        for term in all_terms:
            if term.depth == 1:
                children = [
                    {'id': c.id, 'name': c.name, 'slug': c.slug}
                    for c in all_terms
                    if c.depth == 2 and c.path.startswith(term.path)
                    and len(c.path) == len(term.path) + steplen
                ]
                result.append({'id': term.id, 'name': term.name, 'slug': term.slug,
                                'children': children})

        return Response({'root_terms': result})

    @action(detail=False, methods=['get'], url_path='tags', url_name='tags-list')
    def tags_list(self, request):
        query = request.query_params.get('q', '').strip()
        qs = ContentTag.objects.all()
        if query:
            qs = qs.filter(name__icontains=query)
        return Response(list(qs.values('id', 'name')[:20]))

    @action(detail=True, methods=['post'], url_path='upload-image', url_name='upload-image')
    def upload_image(self, request, pk=None):
        """Upload and set as hero image."""
        instance = self.get_object()
        if 'image' not in request.FILES:
            return Response({'error': 'No image provided'}, status=status.HTTP_400_BAD_REQUEST)

        from wagtail.images import get_image_model
        Image = get_image_model()
        image_file = request.FILES['image']
        image = Image.objects.create(title=image_file.name, file=image_file)
        instance.hero_image = image
        instance.save()

        try:
            url = image.get_rendition('original').url
        except Exception:
            url = image.file.url

        return Response({'status': 'success', 'image_url': url, 'image_id': image.id})

    @action(detail=False, methods=['post'], url_path='upload-media', url_name='upload-media')
    def upload_media(self, request):
        """Upload an image for use inside article body blocks."""
        if 'image' not in request.FILES:
            return Response({'error': 'No image provided'}, status=status.HTTP_400_BAD_REQUEST)

        from wagtail.images import get_image_model
        Image = get_image_model()
        image_file = request.FILES['image']
        image = Image.objects.create(title=image_file.name, file=image_file)

        try:
            url = image.get_rendition('original').url
        except Exception:
            url = image.file.url

        return Response({'id': image.id, 'url': url, 'title': image.title})

    @action(detail=False, methods=['get'], url_path='images', url_name='images-list')
    def images_list(self, request):
        return Response({'images': []})
