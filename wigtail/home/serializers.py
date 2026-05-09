"""
REST API Serializers for article editing.
"""
import uuid as _uuid

from rest_framework import serializers
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
                return {'orientation': value.get('orientation', 'horizontal')}
            # fallback for unknown block types
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

    class Meta:
        model = TaggedContentPage
        fields = [
            'id', 'title', 'slug', 'status',
            'section_term', 'taxonomy_category',
            'tags', 'hero_image', 'hero_image_url',
            'tile_preview', 'tile_priority', 'article_priority',
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


class ArticleUpdateSerializer(serializers.ModelSerializer):
    section_term_id = serializers.IntegerField(required=False, allow_null=True)
    taxonomy_category_id = serializers.IntegerField(required=False, allow_null=True)
    tag_ids = serializers.ListField(child=serializers.IntegerField(), required=False, write_only=True)
    hero_image_id = serializers.IntegerField(required=False, allow_null=True)
    og_image_id = serializers.IntegerField(required=False, allow_null=True, write_only=True)
    body_json = serializers.JSONField(required=False, write_only=True)

    class Meta:
        model = TaggedContentPage
        fields = [
            'title', 'tile_preview', 'tile_priority', 'article_priority',
            'priority_expires_at', 'section_term_id', 'taxonomy_category_id',
            'tag_ids', 'hero_image_id', 'body_json',
            'seo_title', 'search_description', 'canonical_url',
            'og_image_id',
        ]

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

        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        instance.full_clean()
        instance.save()
        return instance


class ArticleStatusActionSerializer(serializers.Serializer):
    action = serializers.ChoiceField(
        choices=['publish', 'unpublish', 'submit_moderation', 'save_draft', 'delete']
    )
