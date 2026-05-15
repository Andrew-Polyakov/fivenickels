"""
REST API Serializers for article editing.
"""
import uuid as _uuid

from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from wagtail.models import Page
from home.models import TaggedContentPage, TaxonomyTerm, ContentTag


class TaxonomyTermSerializer(serializers.ModelSerializer):
    path_items = serializers.SerializerMethodField()

    class Meta:
        model = TaxonomyTerm
        fields = ['id', 'name', 'slug', 'path_items']

    def get_path_items(self, obj):
        return [
            {'id': a.id, 'name': a.name, 'slug': a.slug}
            for a in [*obj.get_ancestors(), obj]
        ]


class ContentTagSerializer(serializers.ModelSerializer):
    class Meta:
        model = ContentTag
        fields = ['id', 'name']


class StreamBlockSerializer(serializers.Serializer):
    """Serialize a StreamField bound block to an editor-friendly dict."""

    def to_representation(self, instance):
        block_type = instance.block_type
        block_id = getattr(instance, 'id', None) or str(_uuid.uuid4())
        value = instance.value
        serialized = self._serialize(block_type, value)
        return {'id': block_id, 'type': block_type, 'value': serialized}

    def _render_paragraph_for_editor(self, source_html):
        """Replace <embed embedtype="image"> tags with <img data-image-id> for the editor."""
        import re
        import html as _html
        if not source_html:
            return source_html
        from wagtail.images import get_image_model
        Image = get_image_model()

        def replace_embed(match):
            tag = match.group(0)
            id_m = re.search(r'\bid="(\d+)"', tag)
            alt_m = re.search(r'\balt="([^"]*)"', tag)
            fmt_m = re.search(r'\bformat="([^"]*)"', tag)
            if not id_m:
                return ''
            image_id = id_m.group(1)
            alt = _html.escape(alt_m.group(1) if alt_m else '')
            fmt = _html.escape(fmt_m.group(1) if fmt_m else 'fullwidth')
            try:
                img = Image.objects.get(pk=int(image_id))
                src = img.get_rendition('width-800').url
            except Exception:
                src = ''
            return (
                f'<img src="{src}" data-image-id="{image_id}"'
                f' data-format="{fmt}" alt="{alt}" />'
            )

        return re.sub(r'<embed\b[^>]*embedtype="image"[^>]*/>', replace_embed, source_html)

    def _serialize(self, block_type, value):
        try:
            if block_type == 'paragraph':
                return self._render_paragraph_for_editor(str(value))
            if block_type == 'markdown':
                return str(value)
            if block_type == 'image':
                if value is None:
                    return None
                try:
                    return {
                        'id': value.id,
                        'url': value.get_rendition('original').url,
                        'title': getattr(value, 'title', ''),
                    }
                except Exception:
                    return None
            if block_type == 'embed':
                url = getattr(value, 'url', None)
                return {'url': str(url) if url else ''}
            if block_type == 'heading':
                return {'level': value.get('level', 'h2'), 'text': value.get('text', '')}
            if block_type == 'separator':
                return None
            if block_type == 'perforation_separator':
                return None
            # fallback for unknown block types
            if value is None:
                return None
            try:
                return dict(value)
            except (TypeError, ValueError):
                return str(value)
        except Exception:
            return None


class ArticleEditorSerializer(serializers.ModelSerializer):
    section_term = TaxonomyTermSerializer(read_only=True)
    taxonomy_category = TaxonomyTermSerializer(read_only=True)
    tags = ContentTagSerializer(many=True, read_only=True)
    body = StreamBlockSerializer(many=True, read_only=True)
    hero_image_url = serializers.SerializerMethodField()
    og_image_url = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()
    author_user_display = serializers.SerializerMethodField()

    class Meta:
        model = TaggedContentPage
        fields = [
            'id', 'title', 'slug', 'status',
            'section_term', 'taxonomy_category',
            'catalyst', 'tags', 'hero_image', 'hero_image_url',
            'tile_preview', 'author_name', 'author_user', 'author_user_display',
            'tile_priority', 'article_priority',
            'priority_expires_at', 'body',
            'seo_title', 'search_description', 'canonical_url',
            'og_image', 'og_image_url',
        ]
        read_only_fields = ['id', 'slug']

    def get_hero_image_url(self, obj):
        if obj.hero_image:
            try:
                return obj.hero_image.get_rendition('original').url
            except Exception:
                return None
        return None

    def get_og_image_url(self, obj):
        if obj.og_image:
            try:
                return obj.og_image.get_rendition('original').url
            except Exception:
                return None
        return None

    def get_status(self, obj):
        return 'published' if obj.live else 'draft'

    def get_author_user_display(self, obj):
        user = getattr(obj, "author_user", None)
        if not user:
            return ""
        full = user.get_full_name().strip() if hasattr(user, "get_full_name") else ""
        if full:
            return full
        return user.get_username() if hasattr(user, "get_username") else ""


def _normalize_catalyst_value(value: str | None) -> str:
    normalized = (value or "").strip()
    if not normalized:
        return ""
    if normalized not in (TaggedContentPage.CATALYST_BULLISH, TaggedContentPage.CATALYST_BEARISH):
        raise serializers.ValidationError("Catalyst must be Bullish or Bearish.")
    return normalized


class ArticleUpdateSerializer(serializers.ModelSerializer):
    section_term_id = serializers.IntegerField(required=False, allow_null=True)
    taxonomy_category_id = serializers.IntegerField(required=False, allow_null=True)
    tag_ids = serializers.ListField(child=serializers.IntegerField(), required=False, write_only=True)
    hero_image_id = serializers.IntegerField(required=False, allow_null=True)
    og_image_id = serializers.IntegerField(required=False, allow_null=True, write_only=True)
    body_json = serializers.JSONField(required=False, write_only=True)
    author_user_lookup = serializers.CharField(required=False, allow_blank=True, write_only=True)

    class Meta:
        model = TaggedContentPage
        fields = [
            'title', 'tile_preview', 'tile_priority', 'article_priority',
            'author_name', 'author_user_lookup',
            'priority_expires_at', 'section_term_id', 'taxonomy_category_id',
            'catalyst', 'tag_ids', 'hero_image_id', 'body_json',
            'seo_title', 'search_description', 'canonical_url',
            'og_image_id',
        ]

    @staticmethod
    def _repair_page_content_type(instance):
        """
        Heal corrupted wagtailcore_page.content_type rows for this instance.

        Some environments can end up with mismatched content_type ids after
        partial DB restores; Wagtail save() then crashes while resolving
        old_record.specific.
        """
        expected_ct = ContentType.objects.get_for_model(
            instance.__class__,
            for_concrete_model=False,
        )
        current_ct_id = (
            Page.objects.filter(pk=instance.pk)
            .values_list("content_type_id", flat=True)
            .first()
        )
        if current_ct_id and current_ct_id != expected_ct.pk:
            Page.objects.filter(pk=instance.pk).update(content_type_id=expected_ct.pk)
            instance.content_type_id = expected_ct.pk

    def validate_catalyst(self, value):
        return _normalize_catalyst_value(value)

    def update(self, instance, validated_data):
        import json

        tag_ids = validated_data.pop('tag_ids', None)
        if tag_ids is not None:
            instance.tags.set(tag_ids)

        body_json = validated_data.pop('body_json', None)
        if body_json is not None:
            instance.body = json.dumps(body_json)

        hero_image_id = validated_data.pop('hero_image_id', None)
        if hero_image_id is not None:
            instance.hero_image_id = hero_image_id

        og_image_id = validated_data.pop('og_image_id', None)
        if 'og_image_id' in self.initial_data:
            instance.og_image_id = og_image_id

        section_term_id = validated_data.pop('section_term_id', None)
        if section_term_id is not None:
            instance.section_term_id = section_term_id

        taxonomy_category_id = validated_data.pop('taxonomy_category_id', None)
        # allow explicit null to clear category
        if 'taxonomy_category_id' in self.initial_data:
            instance.taxonomy_category_id = taxonomy_category_id

        author_lookup = validated_data.pop("author_user_lookup", None)
        if "author_user_lookup" in self.initial_data:
            lookup = (author_lookup or "").strip()
            if not lookup:
                instance.author_user = None
            else:
                user_model = get_user_model()
                user = (
                    user_model.objects.filter(username__iexact=lookup).first()
                    or user_model.objects.filter(email__iexact=lookup).first()
                )
                if user is None:
                    raise serializers.ValidationError(
                        {"author_user_lookup": "No user found for that username/email."}
                    )
                instance.author_user = user

        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        self._repair_page_content_type(instance)
        instance.full_clean()
        instance.save()
        return instance


class ArticleStatusActionSerializer(serializers.Serializer):
    action = serializers.ChoiceField(
        choices=[
            'publish',
            'unpublish',
            'submit_moderation',
            'approve_moderation',
            'save_draft',
            'delete',
        ]
    )


class AutoSubmitArticleSerializer(serializers.Serializer):
    title = serializers.CharField(required=False, allow_blank=True)
    headline = serializers.CharField(required=False, allow_blank=True)
    tile_preview = serializers.CharField(required=False, allow_blank=True)
    summary = serializers.CharField(required=False, allow_blank=True)
    content = serializers.CharField(required=False, allow_blank=True)
    body_markdown = serializers.CharField(required=False, allow_blank=True)
    source = serializers.CharField(required=False, allow_blank=True)
    canonical_url = serializers.URLField(required=False, allow_blank=True)
    url = serializers.URLField(required=False, allow_blank=True)
    section_slug = serializers.CharField(required=False, allow_blank=True)
    seo_title = serializers.CharField(required=False, allow_blank=True)
    search_description = serializers.CharField(required=False, allow_blank=True)
    catalyst = serializers.ChoiceField(
        required=False,
        allow_blank=True,
        choices=["Bullish", "Bearish"],
    )
    author_name = serializers.CharField(required=False, allow_blank=True)
    tags = serializers.ListField(
        child=serializers.CharField(allow_blank=True),
        required=False,
    )
    symbols = serializers.ListField(
        child=serializers.CharField(allow_blank=True),
        required=False,
    )

    def validate_catalyst(self, value):
        return _normalize_catalyst_value(value)


class AutoSubmitBatchSerializer(serializers.Serializer):
    articles = AutoSubmitArticleSerializer(many=True)
